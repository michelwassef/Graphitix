describe('documentState recovery snapshot throttling', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    window.Main = {};
    window.Shared = { isDebugEnabled: () => false };
    window.desktop = {
      isDesktop: true,
      writeRecoverySnapshot: jest.fn().mockResolvedValue(true),
      clearRecoverySnapshot: jest.fn().mockResolvedValue(true)
    };
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn(() => '0'),
        setItem: jest.fn()
      },
      configurable: true
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    window.Main?.documentState?.dispose?.();
    delete window.Main;
    delete window.Shared;
    delete window.desktop;
  });

  function installDocumentState(overrides = {}) {
    require('../js/main/documentState.js');
    const workspaceState = {
      tabs: [{
        id: 'tab-1',
        title: 'Large Scatter',
        type: 'scatter',
        isWelcome: false,
        payloadSignature: 'x'.repeat(300000)
      }],
      sessionDirty: true,
      sessionRevision: 1,
      sessionFileName: 'large.graph',
      sessionFilePath: '',
      sessionFileScope: 'workspace',
      ...overrides.workspaceState
    };
    const snapshotBlob = {
      size: 3,
      arrayBuffer: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer)
    };
    const sessionActions = {
      buildWorkspaceArchiveBlob: jest.fn().mockResolvedValue(snapshotBlob),
      autosaveWorkspace: jest.fn().mockResolvedValue({ status: 'skipped', reason: 'no-file-target' }),
      ...overrides.sessionActions
    };
    const session = {
      graphTabsHaveData: jest.fn(() => true),
      tabHasTableData: jest.fn(() => true),
      ...overrides.session
    };
    window.Main.documentState.init({
      session,
      sessionActions,
      workspaceState,
      getSessionActionsContext: () => ({
        session,
        sessionActions,
        workspaceState,
        withSessionContext: value => value
      }),
      dom: {}
    });
    return { workspaceState, sessionActions, session };
  }

  async function flushTimers() {
    await Promise.resolve();
    await Promise.resolve();
  }

  test('recovery interval does not rebuild the same dirty revision repeatedly', async () => {
    const { sessionActions } = installDocumentState();

    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 1 }
    }));

    jest.advanceTimersByTime(5000);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(30000);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
  });

  test('new dirty revisions schedule a new recovery snapshot', async () => {
    const { workspaceState, sessionActions } = installDocumentState();

    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 1 }
    }));
    jest.advanceTimersByTime(5000);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);

    workspaceState.sessionRevision = 2;
    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 2 }
    }));
    jest.advanceTimersByTime(5000);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(2);
  });
});
