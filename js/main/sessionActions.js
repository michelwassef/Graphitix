(function() {
  "use strict";

  const Main = window.Main = window.Main || {};
  const namespace = Main.sessionActions = Main.sessionActions || {};

  function hasActiveTabData(context){
    const session = context?.session;
    if(!session || typeof session.getActiveTab !== 'function' || typeof session.tabHasTableData !== 'function'){
      return false;
    }
    const active = session.getActiveTab();
    if(!active){
      return false;
    }
    return !!session.tabHasTableData(active);
  }

  function clearSessionTransfer(context, transfer){
    const state = context?.workspaceState;
    const active = transfer || state?.pendingSessionTransfer || null;
    if(active && active.useNewWindow && active.windowRef && !active.windowRef.closed){
      try {
        active.windowRef.close();
      } catch (err) {
        console.error('session transfer window close error', err);
      }
    }
    if(state){
      state.pendingSessionTransfer = null;
    }
  }

  function prepareSessionTransfer(context, options = {}){
    const state = context?.workspaceState;
    if(state){
      state.pendingSessionTransfer = null;
    }
    if(!options.openInNewWindowIfDirty){
      return null;
    }
    if(!hasActiveTabData(context)){
      return null;
    }
    const win = window;
    if(!win || typeof win.open !== 'function' || !win.localStorage){
      return null;
    }
    const newWindow = win.open('', '_blank');
    if(!newWindow){
      return null;
    }
    const transfer = { useNewWindow: true, windowRef: newWindow, used: false, key: null };
    if(state){
      state.pendingSessionTransfer = transfer;
    }
    return transfer;
  }

  function getSessionTransfer(context){
    return context?.workspaceState?.pendingSessionTransfer || null;
  }

  async function routeSessionFile(context, file, meta = {}){
    const {
      session,
      withSessionContext,
      hideDuplicatePrompt,
      renderTabs,
      activateTab,
      showGraphSelection
    } = context || {};
    if(!session || typeof session.loadWorkspaceSessionBlob !== 'function' || typeof withSessionContext !== 'function'){
      return null;
    }
    const transfer = meta.transfer || getSessionTransfer(context);
    const fileName = meta.fileName || file?.name || '';
    if(transfer && transfer.useNewWindow && transfer.windowRef && !transfer.windowRef.closed){
      try {
        const text = typeof file?.text === 'function' ? await file.text() : null;
        if(typeof text === 'string' && text.length){
          const win = window;
          if(win && win.localStorage){
            const key = `sessionTransfer:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
            win.localStorage.setItem(key, JSON.stringify({ data: text, fileName }));
            transfer.key = key;
            transfer.used = true;
            const url = new URL(win.location.href);
            url.searchParams.set('sessionTransferKey', key);
            transfer.windowRef.location = url.toString();
            transfer.windowRef.focus?.();
            transfer.windowRef = null;
            return { status: 'routed', key };
          }
        }
      } catch (err) {
        console.error('session transfer route error', err);
        if(transfer?.key){
          try { window.localStorage?.removeItem(transfer.key); } catch (cleanupErr) {
            console.error('session transfer cleanup error', cleanupErr);
          }
        }
        if(transfer && transfer.windowRef && !transfer.windowRef.closed){
          transfer.windowRef.close();
          transfer.windowRef = null;
        }
      }
    }
    const loadOptions = withSessionContext({
      reason: meta.reason || 'session-load',
      fileHandle: meta.fileHandle || null,
      fileName,
      hideDuplicatePrompt,
      renderTabs,
      activateTab,
      showGraphSelection
    });
    await session.loadWorkspaceSessionBlob(file, loadOptions);
    return { status: 'loaded' };
  }

  namespace.handleSessionSaveClick = async function handleSessionSaveClick(context) {
    const { Shared, session, workspaceState, sessionFileTypes, withSessionContext } = context || {};
    if (!Shared?.fileIO || typeof Shared.fileIO.saveGraphFile !== 'function') {
      console.warn('Session save unavailable: missing Shared.fileIO.saveGraphFile');
      return;
    }
    try {
      const sessionPayload = session.buildSessionPayload(withSessionContext({ reason: 'session-save' }));
      const result = await Shared.fileIO.saveGraphFile({
        context: 'session',
        fileHandle: workspaceState.sessionFileHandle,
        payload: sessionPayload,
        setFileHandle: handle => {
          workspaceState.sessionFileHandle = handle || null;
          console.debug('Debug: session file handle stored', { hasHandle: !!handle });
        },
        setFileName: name => {
          workspaceState.sessionFileName = name || '';
          console.debug('Debug: session file name stored', { name: workspaceState.sessionFileName });
        },
        downloadFileName: workspaceState.sessionFileName || 'workspace.session',
        fileTypes: sessionFileTypes
      });
      console.debug('Debug: session save result', { status: result?.status, via: result?.via });
      if (result && (result.status === 'saved' || result.status === 'downloaded')) {
        session.clearSessionDirty('session-save-success');
      }
    } catch (err) {
      console.error('handleSessionSaveClick error', err);
    }
  };

  namespace.handleSessionLoadClick = async function handleSessionLoadClick(context, options = {}) {
    const {
      Shared,
      session,
      workspaceState,
      sessionFileTypes,
      withSessionContext,
      dom,
      hideDuplicatePrompt,
      renderTabs,
      activateTab,
      showGraphSelection
    } = context || {};
    const transfer = prepareSessionTransfer(context, options);
    if (!Shared?.fileIO || typeof Shared.fileIO.openGraphFile !== 'function') {
      console.warn('Session load fallback to input: missing Shared.fileIO.openGraphFile');
      dom?.sessionFileInput?.click?.();
      return;
    }
    try {
      let lastHandle = null;
      let lastName = '';
      const result = await Shared.fileIO.openGraphFile({
        context: 'session',
        setFileHandle: handle => {
          lastHandle = handle || null;
          workspaceState.sessionFileHandle = handle || null;
          console.debug('Debug: session load handle captured', { hasHandle: !!handle });
        },
        setFileName: name => {
          lastName = name || '';
          workspaceState.sessionFileName = lastName;
          console.debug('Debug: session load filename captured', { name: workspaceState.sessionFileName });
        },
        fileTypes: sessionFileTypes,
        loadFromFile: async file => {
          await routeSessionFile(context, file, {
            reason: 'session-load-picker',
            fileHandle: lastHandle,
            fileName: file?.name || lastName,
            hideDuplicatePrompt,
            renderTabs,
            activateTab,
            showGraphSelection,
            transfer
          });
        },
        triggerInput: () => {
          console.debug('Debug: session load fallback trigger', {});
          lastHandle = null;
          lastName = '';
          dom?.sessionFileInput?.click?.();
        }
      });
      console.debug('Debug: session load picker result', { status: result?.status, via: result?.via });
      if (transfer && transfer.useNewWindow && transfer.windowRef && !transfer.used) {
        transfer.windowRef.close();
      }
    } catch (err) {
      console.error('handleSessionLoadClick error', err);
      if (transfer && transfer.useNewWindow && transfer.windowRef && !transfer.windowRef.closed) {
        transfer.windowRef.close();
      }
    } finally {
      clearSessionTransfer(context, transfer);
    }
  };

  namespace.handleSessionInputChange = function handleSessionInputChange(context, event) {
    const { session, workspaceState, withSessionContext, dom, hideDuplicatePrompt, renderTabs, activateTab, showGraphSelection } = context || {};
    const input = event?.target;
    const file = input?.files && input.files[0];
    if (!file) {
      console.debug('Debug: session input change without file');
      return;
    }
    workspaceState.sessionFileHandle = null;
    workspaceState.sessionFileName = file.name || '';
    console.debug('Debug: session input received file', {
      name: workspaceState.sessionFileName,
      size: file.size
    });
    const transfer = getSessionTransfer(context);
    const loadPromise = routeSessionFile(context, file, {
      reason: 'session-load-input',
      fileHandle: null,
      fileName: workspaceState.sessionFileName,
      hideDuplicatePrompt,
      renderTabs,
      activateTab,
      showGraphSelection,
      transfer
    });
    loadPromise.catch(err => {
      console.error('session load input error', err);
    }).finally(() => {
      if (input) {
        input.value = '';
      }
      clearSessionTransfer(context, transfer);
    });
  };

  namespace.shouldWarnBeforeUnload = function shouldWarnBeforeUnload(context) {
    const { session, workspaceState, withSessionContext } = context || {};
    let persistedActive = false;
    try {
      const active = session.getActiveTab();
      if (active && !active.isWelcome) {
        persistedActive = session.persistActiveTabState(active, withSessionContext({ reason: 'beforeunload' })) || persistedActive;
      }
    } catch (err) {
      console.error('beforeunload persist error', err);
    }
    const hasData = session.graphTabsHaveData();
    const shouldWarn = workspaceState.sessionDirty && hasData;
    console.debug('Debug: beforeunload evaluation', {
      shouldWarn,
      dirty: workspaceState.sessionDirty,
      hasData,
      persistedActive
    });
    return shouldWarn;
  };

  console.debug('Debug: sessionActions.js wiring complete', { exports: Object.keys(namespace) });
})();
