const { app, BrowserWindow, dialog, ipcMain, shell, clipboard, nativeImage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const isDev = process.env.VENN_ELECTRON_DEV === '1';
const defaultDevUrl = process.env.VENN_DEV_URL || 'http://127.0.0.1:4173/index.html';

function resolveProdIndexPath() {
  return path.join(__dirname, 'app', 'index.html');
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
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.once('ready-to-show', () => {
    win.show();
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

app.whenReady().then(() => {
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

  ipcMain.handle('desktop:writeClipboard', async (_event, payload = {}) => {
    const text = typeof payload.text === 'string' ? payload.text : '';
    const html = typeof payload.html === 'string' ? payload.html : '';
    const formats = payload && typeof payload.formats === 'object' && payload.formats
      ? payload.formats
      : {};

    clipboard.clear();
    if (text || html) {
      clipboard.write({
        ...(text ? { text } : {}),
        ...(html ? { html } : {})
      });
    }

    const writtenFormats = [];
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
        }
        continue;
      }
      clipboard.writeBuffer(format, buf);
      writtenFormats.push(format);
    }

    return {
      ok: !!(text || html || writtenFormats.length),
      hasText: !!text,
      hasHtml: !!html,
      formats: writtenFormats
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
