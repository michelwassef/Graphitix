(function() {
  'use strict';

  const Main = window.Main = window.Main || {};
  const namespace = Main.sessionActions = Main.sessionActions || {};

  function debug(context, message, payload) {
    const Shared = context?.Shared || window.Shared;
    if (!(typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled())) {
      return;
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('Debug: sessionActions.' + message, payload || {});
    }
  }

  function ensureGraphArchiveApi(Shared) {
    if (Shared?.graphArchive && typeof Shared.graphArchive.parseFile === 'function') {
      return Shared.graphArchive;
    }
    if (typeof require === 'function') {
      try {
        require('../shared/graphArchive.js');
      } catch (err) {
        // no-op; browser builds and some tests do not expose require paths
      }
    }
    if (Shared?.graphArchive && typeof Shared.graphArchive.parseFile === 'function') {
      return Shared.graphArchive;
    }
    return null;
  }

  function ensureGraphFileName(context, name, fallback) {
    const Shared = context?.Shared || window.Shared;
    const helper = Shared?.graphArchive?.ensureGraphFileName;
    if (typeof helper === 'function') {
      return helper(name, fallback || 'workspace.graph');
    }
    const base = String(name || fallback || 'workspace.graph').trim() || 'workspace.graph';
    return /\.graph$/i.test(base) ? base : `${base}.graph`;
  }

  function canLoadFile(context) {
    const { session, withSessionContext } = context || {};
    return !!session
      && typeof session.applySessionData === 'function'
      && typeof withSessionContext === 'function';
  }

  function getGraphTabsFromWorkspaceState(workspaceState) {
    if (!Array.isArray(workspaceState?.tabs)) {
      return [];
    }
    return workspaceState.tabs.filter(tab => tab && !tab.isWelcome && typeof tab.type === 'string' && tab.type.length > 0);
  }

  function findTabById(workspaceState, tabId) {
    if (!tabId || !Array.isArray(workspaceState?.tabs)) {
      return null;
    }
    return workspaceState.tabs.find(tab => tab && tab.id === tabId) || null;
  }

  function cloneWithSession(session, value) {
    const cloneFn = session?.fastClonePayload || session?.clonePayload;
    if (typeof cloneFn === 'function') {
      return cloneFn.call(session, value);
    }
    return value;
  }

  function persistActiveTabIfNeeded(context, reason) {
    const { session, withSessionContext } = context || {};
    if (!session || typeof session.getActiveTab !== 'function' || typeof session.persistActiveTabState !== 'function') {
      return;
    }
    const active = session.getActiveTab();
    if (!active || active.isWelcome || !active.type) {
      return;
    }
    session.persistActiveTabState(active, withSessionContext({ reason: reason || 'archive-save' }));
  }

  function buildScopeSnapshot(context, scope, options = {}) {
    const { session, workspaceState, withSessionContext } = context || {};
    if (!session || !workspaceState || typeof withSessionContext !== 'function') {
      return null;
    }
    persistActiveTabIfNeeded(context, options.reason || 'archive-save');
    if (scope === 'workspace') {
      const payload = session.buildSessionPayload(withSessionContext({ reason: options.reason || 'archive-save-workspace' }));
      const tabs = Array.isArray(payload?.tabs) ? payload.tabs : [];
      return {
        activeIndex: Number.isFinite(payload?.activeIndex) ? payload.activeIndex : (tabs.length ? 0 : -1),
        tabs: tabs.map(tab => ({
          title: tab?.title || 'Workspace',
          type: tab?.type || tab?.payload?.type || null,
          payload: cloneWithSession(session, tab?.payload || null),
          layout: cloneWithSession(session, tab?.layout || null)
        }))
      };
    }

    const targetTabId = options.targetTabId || session.getActiveTab?.()?.id || null;
    const tab = findTabById(workspaceState, targetTabId);
    if (!tab || tab.isWelcome || !tab.type) {
      return null;
    }
    return {
      activeIndex: 0,
      tabs: [{
        title: tab.title || 'Workspace',
        type: tab.type || tab?.payload?.type || null,
        payload: cloneWithSession(session, tab.payload || null),
        layout: cloneWithSession(session, tab.layoutState || null)
      }]
    };
  }

  function resolveArchiveNameForScope(context, scope, options = {}) {
    const { session, workspaceState } = context || {};
    const existingName = workspaceState?.sessionFileName || '';
    if (scope === 'workspace') {
      return ensureGraphFileName(context, options.fileName || existingName, 'workspace.graph');
    }
    const active = options.targetTabId
      ? findTabById(workspaceState, options.targetTabId)
      : (typeof session?.getActiveTab === 'function' ? session.getActiveTab() : null);
    const tabTitle = String(active?.title || '').trim();
    const safeTitle = tabTitle.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'workspace';
    return ensureGraphFileName(context, options.fileName || existingName, `${safeTitle}.graph`);
  }

  function shouldConfirmWorkspaceReplacement(context) {
    const { session, workspaceState } = context || {};
    if (!session || !workspaceState) {
      return false;
    }
    const isDirty = !!workspaceState.sessionDirty;
    const hasData = typeof session.graphTabsHaveData === 'function'
      ? !!session.graphTabsHaveData()
      : getGraphTabsFromWorkspaceState(workspaceState).length > 0;
    return isDirty && hasData;
  }

  function confirmWorkspaceReplacement(context) {
    if (!shouldConfirmWorkspaceReplacement(context)) {
      return true;
    }
    const message = 'This will replace your current workspace tabs. Continue without saving first?';
    if (typeof window.confirm === 'function') {
      const confirmed = window.confirm(message);
      debug(context, 'confirmWorkspaceReplacement', { confirmed });
      return confirmed;
    }
    return true;
  }

  async function applyParsedSession(context, parsed, meta = {}) {
    if (!canLoadFile(context)) {
      throw new Error('Session load unavailable: missing applySessionData context.');
    }
    const { session, withSessionContext, hideDuplicatePrompt, renderTabs, activateTab, showGraphSelection, workspaceState } = context;
    const sessionPayload = parsed?.session;
    if (!sessionPayload || !Array.isArray(sessionPayload.tabs)) {
      throw new Error('Invalid parsed archive payload: missing tabs.');
    }
    const loadMode = meta.loadMode === 'append' ? 'append' : 'replace';
    const requestedScope = sessionPayload.scope === 'workspace' || sessionPayload.scope === 'tab'
      ? sessionPayload.scope
      : null;
    const parsedScope = requestedScope || (sessionPayload.tabs.length > 1 ? 'workspace' : (sessionPayload.tabs.length === 1 ? 'tab' : null));

    let payloadToApply = sessionPayload;
    let fileScope = parsedScope;
    let fileHandle = meta.fileHandle || null;
    let fileName = meta.fileName || '';
    let existingTabCount = 0;
    let addedTabCount = sessionPayload.tabs.length;

    if (loadMode === 'append') {
      const existingPayload = session.buildSessionPayload(withSessionContext({
        reason: meta.reason || 'graph-load-append-existing'
      }));
      const existingTabs = Array.isArray(existingPayload?.tabs) ? existingPayload.tabs : [];
      existingTabCount = existingTabs.length;
      const incomingTabs = Array.isArray(sessionPayload.tabs) ? sessionPayload.tabs : [];
      const incomingActiveIndex = Number.isFinite(sessionPayload?.activeIndex)
        && sessionPayload.activeIndex >= 0
        && sessionPayload.activeIndex < incomingTabs.length
        ? sessionPayload.activeIndex
        : 0;
      addedTabCount = incomingTabs.length;
      const mergedTabs = [];
      existingTabs.forEach(tab => {
        mergedTabs.push({
          title: tab?.title || 'Workspace',
          type: tab?.type || tab?.payload?.type || null,
          payload: cloneWithSession(session, tab?.payload || null),
          layout: cloneWithSession(session, tab?.layout || null)
        });
      });
      incomingTabs.forEach(tab => {
        mergedTabs.push({
          title: tab?.title || 'Workspace',
          type: tab?.type || tab?.payload?.type || null,
          payload: cloneWithSession(session, tab?.payload || null),
          layout: cloneWithSession(session, tab?.layout || null)
        });
      });
      payloadToApply = {
        ...sessionPayload,
        activeIndex: existingTabs.length + incomingActiveIndex,
        tabs: mergedTabs,
        scope: 'workspace'
      };
      fileScope = 'workspace';
      fileHandle = null;
      fileName = '';
    }

    const loadOptions = withSessionContext({
      reason: meta.reason || 'graph-load',
      fileHandle,
      fileName,
      fileScope,
      hideDuplicatePrompt,
      renderTabs,
      activateTab,
      showGraphSelection
    });
    session.applySessionData(payloadToApply, loadOptions);
    if (loadMode === 'append') {
      if (workspaceState) {
        workspaceState.sessionFileHandle = null;
        workspaceState.sessionFileName = ensureGraphFileName(context, '', 'workspace.graph');
        workspaceState.sessionFileScope = 'workspace';
      }
      if (existingTabCount > 0 && typeof session.markSessionDirty === 'function') {
        session.markSessionDirty('graph-load-append', { existingTabCount, addedTabCount });
      }
    }
    debug(context, 'applyParsedSession.complete', {
      loadMode,
      scope: fileScope,
      existingTabCount,
      addedTabCount,
      tabCount: payloadToApply.tabs.length
    });
    return {
      status: 'loaded',
      scope: fileScope,
      tabCount: payloadToApply.tabs.length,
      source: parsed?.source || 'unknown',
      loadMode,
      addedTabCount
    };
  }

  namespace.loadWorkspaceFile = async function loadWorkspaceFile(context, file, meta = {}) {
    const Shared = context?.Shared || window.Shared;
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!graphArchive || typeof graphArchive.parseFile !== 'function') {
      throw new Error('Shared.graphArchive.parseFile is unavailable.');
    }
    const parsed = await graphArchive.parseFile(file, {
      fileName: meta.fileName || file?.name || ''
    });
    debug(context, 'loadWorkspaceFile.parsed', {
      source: parsed?.source || 'unknown',
      tabCount: parsed?.session?.tabs?.length || 0
    });
    return applyParsedSession(context, parsed, meta);
  };

  namespace.saveWorkspaceArchiveWithScope = async function saveWorkspaceArchiveWithScope(context, options = {}) {
    const Shared = context?.Shared || window.Shared;
    const { session, workspaceState, sessionFileTypes } = context || {};
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!Shared?.fileIO || !graphArchive) {
      throw new Error('Save unavailable: missing Shared.fileIO or Shared.graphArchive.');
    }
    if (!session || !workspaceState) {
      throw new Error('Save unavailable: missing session context.');
    }

    const scope = options.scope === 'workspace' ? 'workspace' : 'tab';
    const rememberFile = options.rememberFile !== false;
    const snapshot = buildScopeSnapshot(context, scope, options);
    if (!snapshot || !Array.isArray(snapshot.tabs) || !snapshot.tabs.length) {
      debug(context, 'saveWorkspaceArchiveWithScope.skip', { scope, reason: 'no-tabs' });
      return { status: 'cancelled', reason: 'no-tabs' };
    }

    const fileName = resolveArchiveNameForScope(context, scope, options);
    let archiveBlobPromise = null;
    const getArchiveBlob = async () => {
      if (!archiveBlobPromise) {
        archiveBlobPromise = graphArchive.buildArchiveBlob({
          tabs: snapshot.tabs,
          activeIndex: snapshot.activeIndex,
          fileName,
          scope,
          compression: options.compression || 'STORE',
          payloadMode: options.payloadMode || 'full'
        }).then(blob => {
          debug(context, 'saveWorkspaceArchiveWithScope.archiveBuilt', {
            scope,
            tabCount: snapshot.tabs.length,
            bytes: blob?.size || 0,
            fileName
          });
          return blob;
        });
      }
      return archiveBlobPromise;
    };

    const canReuseHandle = !options.forcePicker
      && !!workspaceState.sessionFileHandle
      && workspaceState.sessionFileScope === scope;
    const saveFn = canReuseHandle
      ? Shared.fileIO.saveGraphFile
      : Shared.fileIO.saveGraphFileAs;
    const result = await saveFn({
      context: 'workspace',
      fileHandle: canReuseHandle ? workspaceState.sessionFileHandle : null,
      getPayload: getArchiveBlob,
      fileName,
      downloadFileName: fileName,
      fileTypes: sessionFileTypes,
      mimeType: 'application/zip',
      allowFallback: options.allowFallback !== false,
      setFileHandle: handle => {
        if (rememberFile) {
          workspaceState.sessionFileHandle = handle || null;
          workspaceState.sessionFilePath = handle?.__desktopFilePath || '';
          workspaceState.sessionFileScope = scope;
        }
        debug(context, 'save.handleStored', { hasHandle: !!handle, scope });
      },
      setFileName: name => {
        if (rememberFile) {
          workspaceState.sessionFileName = ensureGraphFileName(context, name || fileName, fileName);
          workspaceState.sessionFileScope = scope;
        }
        debug(context, 'save.fileNameStored', { name: rememberFile ? workspaceState.sessionFileName : name, scope, rememberFile });
      }
    });

    if (result && (result.status === 'saved' || result.status === 'downloaded')) {
      if (rememberFile && typeof session.clearSessionDirty === 'function') {
        session.clearSessionDirty('graph-save-success');
      }
      if (rememberFile) {
        workspaceState.sessionFileName = ensureGraphFileName(context, result.fileName || workspaceState.sessionFileName || fileName, fileName);
        workspaceState.sessionFilePath = result.filePath || workspaceState.sessionFileHandle?.__desktopFilePath || workspaceState.sessionFilePath || '';
        workspaceState.sessionFileScope = scope;
      }
      window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
        detail: {
          type: rememberFile ? 'saved' : 'saved-copy',
          dirty: rememberFile ? false : !!workspaceState.sessionDirty,
          fileName: rememberFile ? workspaceState.sessionFileName : (result.fileName || fileName),
          filePath: rememberFile ? workspaceState.sessionFilePath : (result.filePath || ''),
          fileScope: scope,
          reason: options.reason || 'graph-save-success'
        }
      }));
    }

    debug(context, 'saveWorkspaceArchiveWithScope.result', {
      scope,
      status: result?.status || null,
      via: result?.via || null
    });
    return Object.assign({ scope }, result || {});
  };

  namespace.handleSessionSaveClick = async function handleSessionSaveClick(context, options = {}) {
    const scope = options.scope === 'tab' ? 'tab' : 'workspace';
    debug(context, 'handleSessionSaveClick.scope', { scope, explicit: options.scope || null });

    return namespace.saveWorkspaceArchiveWithScope(context, {
      ...options,
      scope
    });
  };

  namespace.handleSessionLoadClick = async function handleSessionLoadClick(context, options = {}) {
    const Shared = context?.Shared || window.Shared;
    const { workspaceState, sessionFileTypes, dom } = context || {};
    if (!Shared?.fileIO || typeof Shared.fileIO.openGraphFile !== 'function') {
      console.warn('Load unavailable: missing Shared.fileIO.openGraphFile');
      dom?.sessionFileInput?.click?.();
      return { status: 'error', reason: 'no-open-handler' };
    }
    if (!confirmWorkspaceReplacement(context)) {
      return { status: 'cancelled', reason: 'replace-denied' };
    }

    let lastHandle = null;
    let lastName = '';
    try {
      const result = await Shared.fileIO.openGraphFile({
        context: 'workspace',
        setFileHandle: handle => {
          lastHandle = handle || null;
          workspaceState.sessionFileHandle = handle || null;
          workspaceState.sessionFilePath = handle?.__desktopFilePath || '';
          debug(context, 'load.handleCaptured', { hasHandle: !!handle });
        },
        setFileName: name => {
          lastName = String(name || '').trim();
          workspaceState.sessionFileName = lastName;
          debug(context, 'load.fileNameCaptured', { name: lastName });
        },
        fileTypes: sessionFileTypes,
        loadFromFile: async file => {
          await namespace.loadWorkspaceFile(context, file, {
            reason: options.reason || 'graph-load-picker',
            fileHandle: lastHandle,
            fileName: file?.name || lastName
          });
        },
        triggerInput: () => {
          if (dom?.sessionFileInput) {
            dom.sessionFileInput.value = '';
            dom.sessionFileInput.click();
          }
        }
      });
      debug(context, 'handleSessionLoadClick.result', {
        status: result?.status || null,
        via: result?.via || null
      });
      return result;
    } catch (err) {
      console.error('handleSessionLoadClick error', err);
      return { status: 'error', error: err };
    }
  };

  namespace.handleDesktopOpenFilePath = async function handleDesktopOpenFilePath(context, filePath, options = {}) {
    const Shared = context?.Shared || window.Shared;
    const { workspaceState } = context || {};
    const normalizedPath = String(filePath || '').trim();
    if (!normalizedPath) {
      return { status: 'error', reason: 'missing-file-path' };
    }
    if (!Shared?.fileIO || typeof Shared.fileIO.openGraphFilePath !== 'function') {
      console.warn('Desktop file open unavailable: missing Shared.fileIO.openGraphFilePath');
      return { status: 'error', reason: 'no-desktop-path-open-handler' };
    }
    if (!confirmWorkspaceReplacement(context)) {
      return { status: 'cancelled', reason: 'replace-denied' };
    }

    let lastHandle = null;
    let lastName = '';
    try {
      const result = await Shared.fileIO.openGraphFilePath({
        context: 'desktop-file-association',
        filePath: normalizedPath,
        setFileHandle: handle => {
          lastHandle = handle || null;
          if (workspaceState) {
            workspaceState.sessionFileHandle = handle || null;
            workspaceState.sessionFilePath = handle?.__desktopFilePath || normalizedPath;
          }
          debug(context, 'desktopOpen.handleCaptured', { hasHandle: !!handle });
        },
        setFileName: name => {
          lastName = String(name || '').trim();
          if (workspaceState) {
            workspaceState.sessionFileName = lastName;
          }
          debug(context, 'desktopOpen.fileNameCaptured', { name: lastName });
        },
        loadFromFile: async file => {
          await namespace.loadWorkspaceFile(context, file, {
            reason: options.reason || 'desktop-file-association',
            fileHandle: lastHandle,
            fileName: file?.name || lastName,
            filePath: normalizedPath
          });
        }
      });
      debug(context, 'handleDesktopOpenFilePath.result', {
        status: result?.status || null,
        via: result?.via || null,
        filePath: normalizedPath
      });
      return result;
    } catch (err) {
      console.error('handleDesktopOpenFilePath error', { filePath: normalizedPath, err });
      return { status: 'error', filePath: normalizedPath, error: err };
    }
  };

  namespace.handleSessionInputChange = function handleSessionInputChange(context, event) {
    const { workspaceState } = context || {};
    const input = event?.target;
    const file = input?.files && input.files[0];
    if (!file) {
      debug(context, 'handleSessionInputChange.noFile');
      return;
    }
    if (!confirmWorkspaceReplacement(context)) {
      if (input) {
        input.value = '';
      }
      return;
    }
    workspaceState.sessionFileHandle = null;
    workspaceState.sessionFileName = String(file.name || '').trim();
    namespace.loadWorkspaceFile(context, file, {
      reason: 'graph-load-input',
      fileHandle: null,
      fileName: workspaceState.sessionFileName
    }).catch(err => {
      console.error('handleSessionInputChange load error', err);
    }).finally(() => {
      if (input) {
        input.value = '';
      }
    });
  };

  namespace.shouldWarnBeforeUnload = function shouldWarnBeforeUnload(context) {
    const { session, workspaceState, withSessionContext } = context || {};
    if (!session || !workspaceState || typeof withSessionContext !== 'function') {
      return false;
    }
    let persistedActive = false;
    try {
      const active = session.getActiveTab?.();
      if (active && !active.isWelcome) {
        persistedActive = !!session.persistActiveTabState(active, withSessionContext({ reason: 'beforeunload' }));
      }
    } catch (err) {
      console.error('beforeunload persist error', err);
    }
    const hasData = typeof session.graphTabsHaveData === 'function'
      ? !!session.graphTabsHaveData()
      : getGraphTabsFromWorkspaceState(workspaceState).length > 0;
    const shouldWarn = !!workspaceState.sessionDirty && hasData;
    debug(context, 'shouldWarnBeforeUnload', {
      shouldWarn,
      dirty: !!workspaceState.sessionDirty,
      hasData,
      persistedActive
    });
    return shouldWarn;
  };

  namespace.buildWorkspaceArchiveBlob = async function buildWorkspaceArchiveBlob(context, options = {}) {
    const Shared = context?.Shared || window.Shared;
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!graphArchive || typeof graphArchive.buildArchiveBlob !== 'function') {
      throw new Error('Shared.graphArchive.buildArchiveBlob is unavailable.');
    }
    const snapshot = buildScopeSnapshot(context, options.scope === 'tab' ? 'tab' : 'workspace', {
      ...options,
      reason: options.reason || 'document-snapshot'
    });
    if (!snapshot || !Array.isArray(snapshot.tabs) || !snapshot.tabs.length) {
      return null;
    }
    const fileName = resolveArchiveNameForScope(context, options.scope === 'tab' ? 'tab' : 'workspace', options);
    return graphArchive.buildArchiveBlob({
      tabs: snapshot.tabs,
      activeIndex: snapshot.activeIndex,
      fileName,
      scope: options.scope === 'tab' ? 'tab' : 'workspace',
      compression: options.compression || 'STORE',
      payloadMode: options.payloadMode || 'full',
      useWorker: options.useWorker !== false
    });
  };

  namespace.applyArchiveBlob = async function applyArchiveBlob(context, blob, meta = {}) {
    const Shared = context?.Shared || window.Shared;
    const graphArchive = ensureGraphArchiveApi(Shared);
    if (!graphArchive || typeof graphArchive.parseFile !== 'function') {
      throw new Error('Shared.graphArchive.parseFile is unavailable.');
    }
    const parsed = await graphArchive.parseFile(blob, {
      fileName: meta.fileName || blob?.name || 'recovered.graph'
    });
    return applyParsedSession(context, parsed, {
      reason: meta.reason || 'recovery-restore',
      fileHandle: meta.fileHandle || null,
      fileName: meta.fileName || '',
      loadMode: 'replace'
    });
  };

  namespace.autosaveWorkspace = async function autosaveWorkspace(context, options = {}) {
    const { workspaceState, session } = context || {};
    if (!workspaceState || !session) {
      return { status: 'error', reason: 'missing-context' };
    }
    if (!workspaceState.sessionDirty) {
      return { status: 'skipped', reason: 'clean' };
    }
    const handle = workspaceState.sessionFileHandle;
    if (handle?.__desktopFilePath) {
      return namespace.saveWorkspaceArchiveWithScope(context, {
        ...options,
        reason: options.reason || 'autosave',
        scope: workspaceState.sessionFileScope === 'tab' ? 'tab' : 'workspace',
        forcePicker: false,
        allowFallback: false
      });
    }
    if (handle && typeof handle.queryPermission === 'function') {
      try {
        const permission = await handle.queryPermission({ mode: 'readwrite' });
        if (permission === 'granted') {
          return namespace.saveWorkspaceArchiveWithScope(context, {
            ...options,
            reason: options.reason || 'autosave',
            scope: workspaceState.sessionFileScope === 'tab' ? 'tab' : 'workspace',
            forcePicker: false,
            allowFallback: false
          });
        }
      } catch (err) {
        debug(context, 'autosaveWorkspace.permissionCheckFailed', { message: err?.message || String(err) });
      }
    }
    return { status: 'skipped', reason: 'no-file-target' };
  };

  console.debug('Debug: sessionActions.js wiring complete', { exports: Object.keys(namespace) });
})();
