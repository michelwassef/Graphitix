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
    require('../js/main/snapshotPolicy.js');
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
      sessionUserDirty: true,
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

  test('ordinary edits use a trailing recovery delay', async () => {
    const { workspaceState, sessionActions } = installDocumentState();
    workspaceState.tabs[0].payloadSignature = 'small';

    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 1 }
    }));

    jest.advanceTimersByTime(2499);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
  });

  test('subsequent edits restart the trailing recovery delay', async () => {
    const { workspaceState, sessionActions } = installDocumentState();

    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 1 }
    }));
    jest.advanceTimersByTime(2000);

    workspaceState.sessionRevision = 2;
    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 2 }
    }));

    jest.advanceTimersByTime(2499);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
  });

  test('periodic recovery checks do not restart an already pending debounce', async () => {
    const { sessionActions } = installDocumentState();

    jest.advanceTimersByTime(9000);
    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 1 }
    }));

    jest.advanceTimersByTime(1000);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1499);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
  });

  test('continuous edits cannot defer recovery beyond the maximum pending window', async () => {
    const { workspaceState, sessionActions } = installDocumentState();

    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 1 }
    }));
    for (const [elapsed, revision] of [[2000, 2], [2000, 3], [2000, 4], [2000, 5], [1999, 6]]) {
      jest.advanceTimersByTime(elapsed);
      workspaceState.sessionRevision = revision;
      window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
        detail: { type: 'dirty', revision }
      }));
    }

    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
  });

  test('marking the document clean cancels a pending recovery checkpoint', async () => {
    const { workspaceState, sessionActions } = installDocumentState();

    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 1 }
    }));
    jest.advanceTimersByTime(1000);

    workspaceState.sessionUserDirty = false;
    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'clean', revision: 1 }
    }));

    jest.advanceTimersByTime(5000);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();
  });

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

  test('lifecycle-only dirty revisions do not schedule recovery snapshots', async () => {
    const { sessionActions } = installDocumentState({
      workspaceState: {
        sessionDirty: true,
        sessionUserDirty: false,
        sessionRevision: 1
      }
    });

    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 1, userDirty: false }
    }));
    jest.advanceTimersByTime(30000);
    await flushTimers();

    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();
  });

  test('recovery snapshot forwards canonical recovery policy inputs', async () => {
    const { sessionActions } = installDocumentState();

    await window.Main.documentState.writeRecoverySnapshot('recovery-interval');

    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        policyMode: 'recovery',
        snapshotKind: 'recovery',
        useWorker: true
      })
    );
  });

  test('desktop recovery writes binary data and exposes phase metrics', async () => {
    installDocumentState();

    const result = await window.Main.documentState.writeRecoverySnapshot('recovery-interval');

    expect(result.status).toBe('saved');
    expect(window.desktop.writeRecoverySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      dataBuffer: expect.any(ArrayBuffer)
    }));
    expect(window.desktop.writeRecoverySnapshot.mock.calls[0][0].dataBase64).toBeUndefined();
    expect(window.Main.documentState.getRecoveryPerformance()).toEqual(expect.objectContaining({
      storage: expect.any(Number),
      total: expect.any(Number),
      bytes: 3,
      revision: 1,
      via: 'desktop'
    }));
  });

  test('rejects a checkpoint when the workspace revision changes during serialization', async () => {
    const installed = installDocumentState();
    installed.sessionActions.buildWorkspaceArchiveBlob.mockImplementation(async () => {
      installed.workspaceState.sessionRevision = 2;
      return {
        size: 3,
        arrayBuffer: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer)
      };
    });

    await expect(window.Main.documentState.writeRecoverySnapshot('recovery-interval')).resolves.toEqual({
      status: 'skipped',
      reason: 'stale-revision',
      revision: 1,
      currentRevision: 2
    });
    expect(window.desktop.writeRecoverySnapshot).not.toHaveBeenCalled();
  });

  test('recovery restore blocks checkpoint creation until the shared restore transaction completes', async () => {
    let resolveRestore;
    const restoreBarrier = new Promise(resolve => {
      resolveRestore = resolve;
    });
    const applyArchiveBlob = jest.fn(() => restoreBarrier);
    const markSessionDirty = jest.fn();
    const { sessionActions } = installDocumentState({
      sessionActions: { applyArchiveBlob },
      session: { markSessionDirty }
    });
    window.desktop.readRecoverySnapshot = jest.fn().mockResolvedValue({
      exists: true,
      dataBase64: Buffer.from('graphitix-recovery').toString('base64'),
      meta: {
        dirty: true,
        hasData: true,
        tabCount: 1,
        fileName: 'recovered.graph',
        fileScope: 'workspace'
      }
    });
    window.confirm = jest.fn(() => true);

    const restorePromise = window.Main.documentState.maybeRestoreRecovery();
    await flushTimers();
    expect(applyArchiveBlob).toHaveBeenCalledTimes(1);

    await expect(window.Main.documentState.writeRecoverySnapshot('during-restore')).resolves.toEqual({
      status: 'skipped',
      reason: 'restore-in-progress'
    });
    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();
    expect(markSessionDirty).not.toHaveBeenCalled();

    resolveRestore({ status: 'loaded' });
    await expect(restorePromise).resolves.toBe(true);
    expect(markSessionDirty).toHaveBeenCalledWith('recovery-restored', expect.objectContaining({
      fileName: 'recovered.graph',
      origin: 'user'
    }));
  });

  test('restored recovery checkpoint stays current until a genuine new revision', async () => {
    let installed = null;
    const markSessionDirty = jest.fn((_reason, _meta) => {
      installed.workspaceState.sessionRevision += 1;
      installed.workspaceState.sessionUserDirty = true;
      window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
        detail: {
          type: 'dirty',
          revision: installed.workspaceState.sessionRevision,
          userDirty: true
        }
      }));
    });
    installed = installDocumentState({
      sessionActions: {
        applyArchiveBlob: jest.fn().mockResolvedValue({ status: 'loaded' })
      },
      session: { markSessionDirty }
    });
    window.desktop.readRecoverySnapshot = jest.fn().mockResolvedValue({
      exists: true,
      dataBase64: Buffer.from('graphitix-recovery').toString('base64'),
      meta: {
        dirty: true,
        hasData: true,
        tabCount: 1,
        fileName: 'recovered.graph',
        fileScope: 'workspace'
      }
    });
    window.confirm = jest.fn(() => true);

    await expect(window.Main.documentState.maybeRestoreRecovery()).resolves.toBe(true);
    expect(installed.workspaceState.sessionRevision).toBe(2);

    jest.advanceTimersByTime(30000);
    await flushTimers();
    expect(installed.sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();

    installed.workspaceState.sessionRevision = 3;
    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 3, userDirty: true }
    }));
    jest.advanceTimersByTime(2500);
    await flushTimers();
    expect(installed.sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
  });

  test('recovery delegates live capture and recoverable-data evaluation to the shared checkpoint owner', async () => {
    let checkpointBuilt = false;
    const { sessionActions, session } = installDocumentState({
      sessionActions: {
        persistActiveTabIfNeeded: jest.fn(),
        buildWorkspaceArchiveBlob: jest.fn(async () => {
          checkpointBuilt = true;
          return {
            size: 3,
            arrayBuffer: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer)
          };
        })
      },
      session: {
        graphTabsHaveData: jest.fn(() => checkpointBuilt),
        tabHasTableData: jest.fn(() => checkpointBuilt)
      }
    });

    const result = await window.Main.documentState.writeRecoverySnapshot('recovery-interval');

    expect(sessionActions.persistActiveTabIfNeeded).not.toHaveBeenCalled();
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        useWorker: true,
        snapshotKind: 'recovery',
        policyMode: 'recovery'
      })
    );
    expect(session.graphTabsHaveData).toHaveBeenCalled();
    expect(result.status).toBe('saved');
    expect(window.desktop.clearRecoverySnapshot).not.toHaveBeenCalled();
  });
});
