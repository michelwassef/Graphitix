const { app, BrowserWindow, Menu, dialog, ipcMain, shell, clipboard, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const isDev = process.env.VENN_ELECTRON_DEV === '1';
const defaultDevUrl = process.env.VENN_DEV_URL || 'http://127.0.0.1:4173/index.html';
const GRAPH_FILE_EXTENSION = '.graph';
const pendingGraphFilePaths = [];
let mainWindow = null;

// Electron 41's Chromium uses the refreshed native form controls on Windows,
// which rounds the OS-rendered <select> popup even when our CSS forces square
// corners on the control itself. Disable that Chromium refresh so desktop
// dropdowns match the web build's sharp-cornered menus.
app.commandLine.appendSwitch('disable-features', 'FormControlsRefresh');

function normalizeGraphFilePath(candidate, cwd) {
  const raw = String(candidate || '').trim();
  if (!raw) {
    return '';
  }
  const withoutFilePrefix = raw.startsWith('file://') ? raw.slice('file://'.length) : raw;
  let decoded = withoutFilePrefix;
  try {
    decoded = decodeURIComponent(withoutFilePrefix);
  } catch (_err) {
    decoded = withoutFilePrefix;
  }
  if (path.extname(decoded).toLowerCase() !== GRAPH_FILE_EXTENSION) {
    return '';
  }
  return path.isAbsolute(decoded) ? decoded : path.resolve(cwd || process.cwd(), decoded);
}

function collectGraphFilePaths(argv, cwd) {
  const seen = new Set();
  const paths = [];
  for (const arg of Array.isArray(argv) ? argv : []) {
    const filePath = normalizeGraphFilePath(arg, cwd);
    if (!filePath || seen.has(filePath)) {
      continue;
    }
    seen.add(filePath);
    paths.push(filePath);
  }
  return paths;
}

function flushPendingGraphFilePaths(win = mainWindow) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed() || !pendingGraphFilePaths.length) {
    return;
  }
  const filePaths = pendingGraphFilePaths.splice(0, pendingGraphFilePaths.length);
  win.webContents.send('desktop:openGraphFile', { filePaths });
}

function enqueueGraphFilePaths(filePaths) {
  const existing = new Set(pendingGraphFilePaths);
  for (const filePath of Array.isArray(filePaths) ? filePaths : []) {
    if (!filePath || existing.has(filePath)) {
      continue;
    }
    existing.add(filePath);
    pendingGraphFilePaths.push(filePath);
  }
  flushPendingGraphFilePaths();
}

function sendDesktopMenuCommand(command, detail = {}) {
  const normalized = String(command || '').trim();
  if (!normalized || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send('desktop:menuCommand', {
    command: normalized,
    ...detail
  });
}

function createCommandItem(label, command, accelerator, options = {}) {
  return {
    label,
    ...(accelerator ? { accelerator } : {}),
    enabled: options.enabled !== false,
    click: () => sendDesktopMenuCommand(command, options.detail || {})
  };
}

function showAboutDialog() {
  const focusedWindow = BrowserWindow.getFocusedWindow() || mainWindow || undefined;
  dialog.showMessageBox(focusedWindow, {
    type: 'info',
    title: 'About Graphitix',
    message: 'Graphitix',
    detail: [
      `Version ${app.getVersion()}`,
      'A desktop wrapper for the Graphitix visualization and statistical analysis workspace.',
      '',
      'Workspace files are saved as .graph archives.'
    ].join('\n'),
    buttons: ['OK'],
    noLink: true
  }).catch(() => {});
}

function revealUserDataFolder() {
  shell.openPath(app.getPath('userData')).catch(err => {
    const focusedWindow = BrowserWindow.getFocusedWindow() || mainWindow || undefined;
    dialog.showMessageBox(focusedWindow, {
      type: 'error',
      title: 'Could Not Open Folder',
      message: 'Graphitix could not open the application data folder.',
      detail: String((err && err.message) || err),
      buttons: ['OK'],
      noLink: true
    }).catch(() => {});
  });
}

function buildApplicationMenuTemplate() {
  const redoAccelerator = process.platform === 'darwin' ? 'Cmd+Shift+Z' : 'Ctrl+Y';
  const template = [];

  if (process.platform === 'darwin') {
    template.push({
      label: app.name || 'Graphitix',
      submenu: [
        { label: 'About Graphitix', click: showAboutDialog },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  template.push(
    {
      label: 'File',
      submenu: [
        createCommandItem('New Graph Tab', 'newTab', 'CmdOrCtrl+N'),
        { type: 'separator' },
        createCommandItem('Open Workspace...', 'openWorkspace', 'CmdOrCtrl+O'),
        createCommandItem('Import Data...', 'importData', 'CmdOrCtrl+I'),
        { type: 'separator' },
        createCommandItem('Save', 'saveWorkspace', 'CmdOrCtrl+S'),
        createCommandItem('Save As...', 'saveWorkspaceAs', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        createCommandItem('Load Example Data', 'loadExampleData'),
        createCommandItem('Match Styles...', 'matchStyles'),
        { type: 'separator' },
        createCommandItem('Close Tab', 'closeTab', 'CmdOrCtrl+W'),
        ...(process.platform === 'darwin' ? [] : [
          { type: 'separator' },
          { role: 'quit', label: 'Exit' }
        ])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        createCommandItem('Undo', 'undo', 'CmdOrCtrl+Z'),
        createCommandItem('Redo', 'redo', redoAccelerator),
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        createCommandItem('Parameters / Graph Controls', 'showParameters', 'CmdOrCtrl+1'),
        createCommandItem('Data Controls', 'showDataControls', 'CmdOrCtrl+2'),
        createCommandItem('Format Controls', 'showFormatControls', 'CmdOrCtrl+3'),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' },
          { role: 'front' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      label: 'Help',
      submenu: [
        ...(process.platform === 'darwin' ? [] : [
          { label: 'About Graphitix', click: showAboutDialog },
          { type: 'separator' }
        ]),
        { label: 'Reveal Application Data Folder', click: revealUserDataFolder }
      ]
    }
  );

  if (isDev) {
    template.push({
      label: 'Developer',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' }
      ]
    });
  }

  return template;
}

function installApplicationMenu() {
  const menu = Menu.buildFromTemplate(buildApplicationMenuTemplate());
  Menu.setApplicationMenu(menu);
}

const initialGraphFilePaths = collectGraphFilePaths(process.argv, process.cwd());
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  pendingGraphFilePaths.push(...initialGraphFilePaths);
  app.on('second-instance', (_event, argv, cwd) => {
    const filePaths = collectGraphFilePaths(argv, cwd);
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
    enqueueGraphFilePaths(filePaths);
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const normalized = normalizeGraphFilePath(filePath, process.cwd());
  if (normalized) {
    enqueueGraphFilePaths([normalized]);
  }
});

function resolveProdIndexPath() {
  return path.join(__dirname, 'app', 'index.html');
}

function resolveRecoveryPaths() {
  const dir = path.join(app.getPath('userData'), 'recovery');
  return {
    dir,
    graphPath: path.join(dir, 'active-recovery.graph'),
    metaPath: path.join(dir, 'active-recovery.json')
  };
}

async function writeFileAtomic(filePath, buffer) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, filePath);
}

async function evaluateUnsavedState(win) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return { ok: false, shouldWarn: false };
  }
  const script = `
    (() => {
      try {
        const Main = window.Main || {};
        const tabsApi = Main.tabs || {};
        const sessionApi = Main.sessionActions || {};
        const context = typeof tabsApi.getSessionActionsContext === 'function'
          ? tabsApi.getSessionActionsContext()
          : null;
        let shouldWarn = false;
        if (context && typeof sessionApi.shouldWarnBeforeUnload === 'function') {
          shouldWarn = !!sessionApi.shouldWarnBeforeUnload(context);
        } else {
          const workspaceState = Main.session && Main.session.workspaceState ? Main.session.workspaceState : null;
          const tabs = Array.isArray(workspaceState && workspaceState.tabs) ? workspaceState.tabs : [];
          const hasData = tabs.some(tab => tab && !tab.isWelcome && typeof tab.type === 'string' && tab.type.length > 0);
          shouldWarn = !!(workspaceState && workspaceState.sessionDirty && hasData);
        }
        return { ok: true, shouldWarn };
      } catch (err) {
        return { ok: false, shouldWarn: false, error: String((err && err.message) || err) };
      }
    })();
  `;
  try {
    const result = await win.webContents.executeJavaScript(script, true);
    if (result && typeof result === 'object') {
      return result;
    }
  } catch (_err) {
    // ignore; close flow will fallback to allowing close
  }
  return { ok: false, shouldWarn: false };
}

async function requestRendererSave(win) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return { status: 'error', reason: 'window-destroyed' };
  }
  const script = `
    (async () => {
      try {
        const Main = window.Main || {};
        const tabsApi = Main.tabs || {};
        const sessionApi = Main.sessionActions || {};
        const context = typeof tabsApi.getSessionActionsContext === 'function'
          ? tabsApi.getSessionActionsContext()
          : null;
        if (!context || typeof sessionApi.handleSessionSaveClick !== 'function') {
          return { status: 'error', reason: 'save-handler-unavailable' };
        }
        const result = await sessionApi.handleSessionSaveClick(context, {
          reason: 'desktop-window-close',
          promptForScope: true
        });
        return result || { status: 'error', reason: 'empty-save-result' };
      } catch (err) {
        return { status: 'error', reason: String((err && err.message) || err) };
      }
    })();
  `;
  try {
    const result = await win.webContents.executeJavaScript(script, true);
    return (result && typeof result === 'object') ? result : { status: 'error', reason: 'invalid-save-result' };
  } catch (err) {
    return { status: 'error', reason: String((err && err.message) || err) };
  }
}

async function requestRendererClearRecovery(win) {
  if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
    return { ok: false, reason: 'window-destroyed' };
  }
  const script = `
    (async () => {
      try {
        const api = window.Main && window.Main.documentState;
        if (!api || typeof api.clearRecoverySnapshot !== 'function') {
          return { ok: false, reason: 'recovery-handler-unavailable' };
        }
        await api.clearRecoverySnapshot('desktop-exit-without-saving');
        return { ok: true };
      } catch (err) {
        return { ok: false, reason: String((err && err.message) || err) };
      }
    })();
  `;
  try {
    const result = await win.webContents.executeJavaScript(script, true);
    return (result && typeof result === 'object') ? result : { ok: false, reason: 'invalid-result' };
  } catch (err) {
    return { ok: false, reason: String((err && err.message) || err) };
  }
}

async function handleCloseAttempt(win) {
  const state = await evaluateUnsavedState(win);
  if (!state.shouldWarn) {
    win.__allowClose = true;
    win.destroy();
    return;
  }

  const decision = await dialog.showMessageBox(win, {
    type: 'question',
    title: 'Unsaved Changes',
    message: 'This workspace has unsaved changes.',
    detail: 'Save and Exit writes a .graph file. Exit without Saving discards unsaved changes.',
    buttons: ['Save and Exit', 'Exit without Saving', 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    noLink: true
  });

  if (decision.response === 2) {
    return;
  }

  if (decision.response === 1) {
    await requestRendererClearRecovery(win);
    win.__allowClose = true;
    win.destroy();
    return;
  }

  const saveResult = await requestRendererSave(win);
  if (saveResult.status === 'saved' || saveResult.status === 'downloaded') {
    win.__allowClose = true;
    win.destroy();
    return;
  }

  if (saveResult.status === 'cancelled') {
    return;
  }

  await dialog.showMessageBox(win, {
    type: 'error',
    title: 'Save Failed',
    message: 'Could not save before closing.',
    detail: `Result: ${saveResult.status || 'error'}${saveResult.reason ? ` (${saveResult.reason})` : ''}`,
    buttons: ['OK'],
    noLink: true
  });
}

function attachCloseGuard(win) {
  win.__allowClose = false;
  win.__handlingClose = false;

  win.on('close', (event) => {
    if (win.__allowClose) {
      return;
    }
    event.preventDefault();
    if (win.__handlingClose) {
      return;
    }
    win.__handlingClose = true;
    handleCloseAttempt(win)
      .catch((err) => {
        dialog.showMessageBox(win, {
          type: 'error',
          title: 'Close Error',
          message: 'Unexpected error while closing the app.',
          detail: String((err && err.message) || err),
          buttons: ['OK'],
          noLink: true
        }).catch(() => {});
      })
      .finally(() => {
        win.__handlingClose = false;
      });
  });
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 980,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.setMenuBarVisibility(true);
  mainWindow = win;

  win.once('ready-to-show', () => {
    win.show();
  });
  win.webContents.once('did-finish-load', () => {
    flushPendingGraphFilePaths(win);
  });
  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  attachCloseGuard(win);

  if (isDev) {
    win.loadURL(defaultDevUrl);
  } else {
    win.loadFile(resolveProdIndexPath());
  }
}

if (hasSingleInstanceLock) {
app.whenReady().then(() => {
  installApplicationMenu();

  ipcMain.handle('desktop:showOpenDialog', async (_event, options = {}) => {
    return dialog.showOpenDialog({
      properties: ['openFile'],
      ...options
    });
  });

  ipcMain.handle('desktop:showSaveDialog', async (_event, options = {}) => {
    return dialog.showSaveDialog(options);
  });

  ipcMain.handle('desktop:readFile', async (_event, filePath) => {
    const content = await fs.readFile(filePath);
    return {
      dataBase64: content.toString('base64')
    };
  });

  ipcMain.handle('desktop:writeFile', async (_event, payload = {}) => {
    const filePath = String(payload.filePath || '');
    if (!filePath) {
      throw new Error('desktop:writeFile requires filePath');
    }
    if (typeof payload.dataBase64 !== 'string') {
      throw new Error('desktop:writeFile requires dataBase64');
    }
    const buf = Buffer.from(payload.dataBase64, 'base64');
    await fs.writeFile(filePath, buf);
    return { ok: true };
  });

  ipcMain.handle('desktop:writeRecoverySnapshot', async (_event, payload = {}) => {
    if (typeof payload.dataBase64 !== 'string') {
      throw new Error('desktop:writeRecoverySnapshot requires dataBase64');
    }
    const paths = resolveRecoveryPaths();
    const graphBuffer = Buffer.from(payload.dataBase64, 'base64');
    const meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
    await writeFileAtomic(paths.graphPath, graphBuffer);
    await writeFileAtomic(paths.metaPath, Buffer.from(JSON.stringify({
      ...meta,
      graphPath: paths.graphPath
    }), 'utf8'));
    return { ok: true, graphPath: paths.graphPath };
  });

  ipcMain.handle('desktop:readRecoverySnapshot', async () => {
    const paths = resolveRecoveryPaths();
    try {
      const [graphBuffer, metaBuffer] = await Promise.all([
        fs.readFile(paths.graphPath),
        fs.readFile(paths.metaPath).catch(() => Buffer.from('{}'))
      ]);
      let meta = {};
      try {
        meta = JSON.parse(metaBuffer.toString('utf8'));
      } catch (_err) {
        meta = {};
      }
      return {
        exists: true,
        dataBase64: graphBuffer.toString('base64'),
        meta
      };
    } catch (err) {
      if (err && err.code === 'ENOENT') {
        return { exists: false };
      }
      throw err;
    }
  });

  ipcMain.handle('desktop:clearRecoverySnapshot', async () => {
    const paths = resolveRecoveryPaths();
    await Promise.all([
      fs.rm(paths.graphPath, { force: true }),
      fs.rm(paths.metaPath, { force: true })
    ]);
    return { ok: true };
  });

  ipcMain.handle('desktop:writeClipboard', async (_event, payload = {}) => {
    let text = typeof payload.text === 'string' ? payload.text : '';
    let html = typeof payload.html === 'string' ? payload.html : '';
    const formats = payload && typeof payload.formats === 'object' && payload.formats
      ? payload.formats
      : {};

    clipboard.clear();

    const writtenFormats = [];
    let wroteImage = false;
    for (const [format, dataBase64] of Object.entries(formats)) {
      if (!format || typeof dataBase64 !== 'string' || !dataBase64) {
        continue;
      }
      const buf = Buffer.from(dataBase64, 'base64');
      if (!buf.length) {
        continue;
      }
      const normalized = String(format).toLowerCase();
      if (normalized === 'image/png') {
        const image = nativeImage.createFromBuffer(buf);
        if (!image.isEmpty()) {
          clipboard.writeImage(image);
          writtenFormats.push(format);
          wroteImage = true;
        }
        continue;
      }
      if (normalized === 'image/svg+xml') {
        // For SVG copy we prefer text/html payloads; custom SVG clipboard buffers
        // are inconsistently consumed on Windows and can hide plain-text paste.
        const svgText = buf.toString('utf8');
        if (!text) {
          text = svgText;
        }
        if (!html && svgText.trim().startsWith('<svg')) {
          html = svgText;
        }
        writtenFormats.push('image/svg+xml');
        continue;
      }
      clipboard.writeBuffer(format, buf);
      writtenFormats.push(format);
    }

    if (!wroteImage && (text || html)) {
      clipboard.write({
        ...(text ? { text } : {}),
        ...(html ? { html } : {})
      });
    }

    return {
      ok: !!(text || html || writtenFormats.length),
      hasText: !!text,
      hasHtml: !!html,
      formats: writtenFormats,
      availableFormats: clipboard.availableFormats()
    };
  });

  ipcMain.handle('desktop:revealItem', async (_event, filePath) => {
    shell.showItemInFolder(filePath);
    return { ok: true };
  });

  ipcMain.handle('desktop:getPath', async (_event, name) => {
    return app.getPath(name);
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
