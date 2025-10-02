(function() {
  "use strict";

  const Main = window.Main = window.Main || {};
  const namespace = Main.sessionActions = Main.sessionActions || {};

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

  namespace.handleSessionLoadClick = async function handleSessionLoadClick(context) {
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
        loadFromFile: file => session.loadWorkspaceSessionBlob(
          file,
          withSessionContext({
            reason: 'session-load-picker',
            fileHandle: lastHandle,
            fileName: file?.name || lastName,
            hideDuplicatePrompt,
            renderTabs,
            activateTab,
            showGraphSelection
          })
        ),
        triggerInput: () => {
          console.debug('Debug: session load fallback trigger', {});
          lastHandle = null;
          lastName = '';
          dom?.sessionFileInput?.click?.();
        }
      });
      console.debug('Debug: session load picker result', { status: result?.status, via: result?.via });
    } catch (err) {
      console.error('handleSessionLoadClick error', err);
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
    session.loadWorkspaceSessionBlob(
      file,
      withSessionContext({
        reason: 'session-load-input',
        fileHandle: null,
        fileName: workspaceState.sessionFileName,
        hideDuplicatePrompt,
        renderTabs,
        activateTab,
        showGraphSelection
      })
    ).finally(() => {
      if (input) {
        input.value = '';
      }
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
