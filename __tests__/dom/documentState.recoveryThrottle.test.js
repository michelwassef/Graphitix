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
  const localValues = new Map();
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: jest.fn(key => localValues.has(key)
        ? localValues.get(key)
        : (key === 'graphitix.autosave.enabled' ? '0' : null)),
      setItem: jest.fn((key, value) => localValues.set(key, String(value))),
      removeItem: jest.fn(key => localValues.delete(key))
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
    require('../../js/main/snapshotPolicy.js');
    require('../../js/main/documentState.js');
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
    for (let pass = 0; pass < 5; pass += 1) {
      await Promise.resolve();
    }
  }

  async function flushUntil(predicate, limit = 30) {
    for (let attempt = 0; attempt < limit; attempt += 1) {
      if (predicate()) return true;
      await flushTimers();
    }
    return predicate();
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

  test('direct recovery capture is deferred while a managed 3D rotation gesture is active', async () => {
    let rotationActive = true;
    window.Shared.plot3d = {
      hasActiveRotationGesture: jest.fn(() => rotationActive)
    };
    const { sessionActions } = installDocumentState();

    await expect(window.Main.documentState.writeRecoverySnapshot('recovery-interval')).resolves.toEqual({
      status: 'deferred',
      reason: 'active-rotation-gesture',
      revision: 1
    });
    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();

    rotationActive = false;
    window.dispatchEvent(new CustomEvent('graphitix:plot3d-rotation-gesture', {
      detail: { phase: 'end', activeCount: 0, componentKey: 'surface', tabId: 'tab-1' }
    }));
    jest.advanceTimersByTime(2499);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
  });

  test('active rotation remains an absolute recovery barrier beyond the normal maximum debounce', async () => {
    let rotationActive = true;
    window.Shared.plot3d = {
      hasActiveRotationGesture: jest.fn(() => rotationActive)
    };
    const { sessionActions } = installDocumentState();

    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 1 }
    }));
    jest.advanceTimersByTime(15000);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();

    rotationActive = false;
    window.dispatchEvent(new CustomEvent('graphitix:plot3d-rotation-gesture', {
      detail: { phase: 'end', activeCount: 0, componentKey: 'line', tabId: 'tab-1' }
    }));
    jest.advanceTimersByTime(0);
    await flushTimers();
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
  });

  test('a rotation that starts during checkpoint readiness converts the race into a deferred recovery', async () => {
    const activeError = Object.assign(new Error('rotation active'), {
      code: 'GRAPHITIX_RECOVERY_INTERACTION_ACTIVE',
      stage: 'after-readiness'
    });
    const { sessionActions } = installDocumentState({
      sessionActions: {
        buildWorkspaceArchiveBlob: jest.fn().mockRejectedValue(activeError)
      }
    });

    await expect(window.Main.documentState.writeRecoverySnapshot('recovery-interval')).resolves.toEqual({
      status: 'deferred',
      reason: 'active-rotation-gesture',
      revision: 1
    });
    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
    expect(window.desktop.writeRecoverySnapshot).not.toHaveBeenCalled();
  });

  test('snapshot-not-ready recovery defers without logging an error and retries on the trailing schedule', async () => {
    const readinessError = Object.assign(new Error('replacement frame still staged'), {
      code: 'GRAPHITIX_SNAPSHOT_NOT_READY',
      reason: 'frame-publication-pending',
      tabId: 'tab-1',
      component: 'scatter'
    });
    const snapshotBlob = {
      size: 3,
      arrayBuffer: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer)
    };
    const buildWorkspaceArchiveBlob = jest.fn()
      .mockRejectedValueOnce(readinessError)
      .mockResolvedValueOnce(snapshotBlob);
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    installDocumentState({
      sessionActions: { buildWorkspaceArchiveBlob }
    });

    await expect(window.Main.documentState.writeRecoverySnapshot('recovery-publication-race')).resolves.toEqual({
      status: 'deferred',
      reason: 'snapshot-not-ready',
      revision: 1
    });
    expect(buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
    expect(window.desktop.writeRecoverySnapshot).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();

    jest.advanceTimersByTime(2499);
    await flushTimers();
    expect(buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await flushTimers();
    expect(buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  test('a checkpoint race resumes even when the interaction ends before the in-flight guard unwinds', async () => {
    // The checkpoint starts while no gesture is active. sessionActions then detects
    // a gesture at its internal race gate and reports the interaction-active error;
    // by the time documentState unwinds that error, the gesture has already ended.
    let rotationActive = false;
    window.Shared.plot3d = {
      hasActiveRotationGesture: jest.fn(() => rotationActive)
    };
    const activeError = Object.assign(new Error('rotation active'), {
      code: 'GRAPHITIX_RECOVERY_INTERACTION_ACTIVE',
      stage: 'before-active-owner-capture'
    });
    const snapshotBlob = {
      size: 3,
      arrayBuffer: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer)
    };
    const buildWorkspaceArchiveBlob = jest.fn()
      .mockImplementationOnce(async () => {
        rotationActive = true;
        rotationActive = false;
        throw activeError;
      })
      .mockResolvedValueOnce(snapshotBlob);
    installDocumentState({
      sessionActions: { buildWorkspaceArchiveBlob }
    });

    await expect(window.Main.documentState.writeRecoverySnapshot('recovery-race')).resolves.toEqual({
      status: 'deferred',
      reason: 'active-rotation-gesture',
      revision: 1
    });
    expect(buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2499);
    await flushTimers();
    expect(buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    await flushTimers();
    expect(buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(2);
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

  test('a supported no-IndexedDB clear removes the local journal fallback', async () => {
    const originalIndexedDb = Object.getOwnPropertyDescriptor(window, 'indexedDB');
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    window.desktop.isDesktop = false;
    let journalValue = 'revision-1';
    window.localStorage.getItem.mockImplementation(key => key === 'graphitix.canonical-journal.v1'
      ? journalValue
      : (key === 'graphitix.autosave.enabled' ? '0' : null));
    window.localStorage.removeItem.mockImplementation(key => {
      if (key === 'graphitix.canonical-journal.v1') journalValue = null;
    });
    try {
      installDocumentState();
      await expect(window.Main.documentState.clearRecoverySnapshot('local-fallback', 1, { allowDirty:true }))
        .resolves.toBe(true);
      expect(journalValue).toBeNull();
    } finally {
      if (originalIndexedDb) Object.defineProperty(window, 'indexedDB', originalIndexedDb);
      else delete window.indexedDB;
    }
  });

  test('a failed no-data clear remains eligible for a same-revision retry', async () => {
    const originalIndexedDb = Object.getOwnPropertyDescriptor(window, 'indexedDB');
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
    window.desktop.clearRecoverySnapshot
      .mockRejectedValueOnce(new Error('injected desktop delete failure'))
      .mockResolvedValue(true);
    const { sessionActions } = installDocumentState({
      session: {
        graphTabsHaveData: jest.fn(() => false),
        tabHasTableData: jest.fn(() => false)
      }
    });
    try {
      await expect(window.Main.documentState.writeRecoverySnapshot('no-data-clear-failure'))
        .resolves.toEqual({ status:'skipped', reason:'no-recoverable-data' });
      expect(window.desktop.clearRecoverySnapshot).toHaveBeenCalledTimes(1);

      await expect(window.Main.documentState.writeRecoverySnapshot('no-data-clear-retry'))
        .resolves.toEqual({ status:'skipped', reason:'no-recoverable-data' });
      expect(window.desktop.clearRecoverySnapshot).toHaveBeenCalledTimes(2);
      expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledTimes(2);
    } finally {
      if (originalIndexedDb) Object.defineProperty(window, 'indexedDB', originalIndexedDb);
      else delete window.indexedDB;
    }
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

  test('a stale autosave leaves a newer recovery revision scheduled and stored', async () => {
    window.localStorage.getItem.mockReturnValue('1');
    let installed;
    const autosaveWorkspace = jest.fn(async () => {
      installed.workspaceState.sessionRevision = 2;
      installed.workspaceState.sessionDirty = true;
      installed.workspaceState.sessionUserDirty = true;
      window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
        detail: { type: 'dirty', revision: 2, userDirty: true }
      }));
      return { status: 'saved', savedRevision: 1 };
    });
    installed = installDocumentState({ sessionActions: { autosaveWorkspace } });

    const result = await window.Main.documentState.runAutosave('stale-save-regression');

    expect(result).toEqual({ status: 'saved', savedRevision: 1 });
    expect(installed.workspaceState.sessionUserDirty).toBe(true);
    expect(window.desktop.clearRecoverySnapshot).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2500);
    await flushUntil(() => window.desktop.writeRecoverySnapshot.mock.calls.length > 0);
    expect(installed.sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ reason: 'dirty' })
    );
    expect(window.desktop.writeRecoverySnapshot).toHaveBeenCalled();
  });

  test('a newer recovery revision is written after an older snapshot clear finishes', async () => {
    let finishClear;
    let storedRevision = null;
    const clearGate = new Promise(resolve => { finishClear = resolve; });
    window.desktop.clearRecoverySnapshot = jest.fn(async () => {
      await clearGate;
      storedRevision = null;
      return true;
    });
    window.desktop.writeRecoverySnapshot = jest.fn(async ({ meta }) => {
      storedRevision = meta.revision;
      return true;
    });
    const installed = installDocumentState();
    installed.workspaceState.sessionDirty = false;
    installed.workspaceState.sessionUserDirty = false;
    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'clean', revision: 1 }
    }));
    await flushTimers();
    expect(window.desktop.clearRecoverySnapshot).toHaveBeenCalledTimes(1);

    installed.workspaceState.sessionRevision = 2;
    installed.workspaceState.sessionDirty = true;
    installed.workspaceState.sessionUserDirty = true;
    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 2, userDirty: true }
    }));
    jest.advanceTimersByTime(2500);
    await flushTimers();
    expect(storedRevision).toBeNull();

    finishClear();
    await flushTimers();
    jest.advanceTimersByTime(2500);
    await flushTimers();

    expect(storedRevision).toBe(2);
    expect(window.desktop.writeRecoverySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({ revision: 2, dirty: true })
    }));
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
    const { sessionActions } = installDocumentState({
      workspaceState: {
        sessionFileScope: 'tab',
        sessionFileTabId: 'tab-1'
      }
    });

    await window.Main.documentState.writeRecoverySnapshot('recovery-interval');

    expect(sessionActions.buildWorkspaceArchiveBlob).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        policyMode: 'recovery',
        snapshotKind: 'recovery',
        useWorker: true
      })
    );
    expect(window.desktop.writeRecoverySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      meta: expect.objectContaining({ fileScope: 'tab', fileTargetTabId: 'tab-1' })
    }));
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
    const { sessionActions, workspaceState } = installDocumentState({
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
        fileScope: 'tab',
        fileTargetTabId: 'tab-1'
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
    expect(workspaceState.sessionFileTabId).toBe('tab-1');
  });

  test('a stale empty checkpoint build cannot clear a newer recovery target', async () => {
    let resolveArchive;
    const { workspaceState } = installDocumentState({
      sessionActions: {
        buildWorkspaceArchiveBlob: jest.fn(() => new Promise(resolve => {
          resolveArchive = resolve;
        }))
      }
    });

    const writePromise = window.Main.documentState.writeRecoverySnapshot('recovery-interval');
    workspaceState.sessionRevision = 2;
    workspaceState.sessionUserDirty = true;
    resolveArchive(null);

    await expect(writePromise).resolves.toMatchObject({
      status: 'skipped',
      reason: 'stale-revision'
    });
    expect(window.desktop.clearRecoverySnapshot).not.toHaveBeenCalled();
  });

  test('a delayed older desktop checkpoint cannot overwrite a newer stored revision', async () => {
    let finishOldWrite;
    let storedRevision = null;
    const oldWriteBarrier = new Promise(resolve => {
      finishOldWrite = resolve;
    });
    window.desktop.writeRecoverySnapshot = jest.fn(async ({ meta }) => {
      if (meta.revision === 1) {
        await oldWriteBarrier;
      }
      storedRevision = meta.revision;
      return true;
    });
    const { workspaceState } = installDocumentState();

    const oldWrite = window.Main.documentState.writeRecoverySnapshot('older-revision');
    await flushTimers();
    expect(window.desktop.writeRecoverySnapshot).toHaveBeenCalledTimes(1);
    expect(window.desktop.writeRecoverySnapshot.mock.calls[0][0].meta.revision).toBe(1);

    workspaceState.sessionRevision = 2;
    let newWriteSettled = false;
    const newWrite = window.Main.documentState.writeRecoverySnapshot('newer-revision');
    void newWrite.then(() => {
      newWriteSettled = true;
    });
    await flushTimers();
    expect(newWriteSettled).toBe(false);
    expect(window.desktop.writeRecoverySnapshot).toHaveBeenCalledTimes(1);

    finishOldWrite();
    await expect(oldWrite).resolves.toMatchObject({ status: 'skipped', reason: 'stale-storage-completion' });
    await expect(newWrite).resolves.toMatchObject({ status: 'saved', via: 'desktop' });
    expect(storedRevision).toBe(2);
  });

  test('a delayed recovery clear cannot erase a checkpoint for a newer revision', async () => {
    let finishOldWrite;
    let storedRevision = null;
    const oldWriteBarrier = new Promise(resolve => {
      finishOldWrite = resolve;
    });
    window.desktop.writeRecoverySnapshot = jest.fn(async ({ meta }) => {
      if (meta.revision === 1) {
        await oldWriteBarrier;
      }
      storedRevision = meta.revision;
      return true;
    });
    const { workspaceState } = installDocumentState();

    const oldWrite = window.Main.documentState.writeRecoverySnapshot('older-revision');
    await flushTimers();
    expect(window.desktop.writeRecoverySnapshot).toHaveBeenCalledTimes(1);

    workspaceState.sessionDirty = false;
    workspaceState.sessionUserDirty = false;
    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'clean', revision: 1 }
    }));
    await flushTimers();
    expect(window.desktop.clearRecoverySnapshot).not.toHaveBeenCalled();

    workspaceState.sessionRevision = 2;
    workspaceState.sessionDirty = true;
    workspaceState.sessionUserDirty = true;
    window.dispatchEvent(new CustomEvent('graphitix:document-state-change', {
      detail: { type: 'dirty', revision: 2, userDirty: true }
    }));
    finishOldWrite();
    await oldWrite;
    await flushTimers();

    expect(window.desktop.clearRecoverySnapshot).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2500);
    await flushTimers();
    expect(storedRevision).toBe(2);
  });

  test('startup recovery does not replace workspace changes made while the checkpoint is loading', async () => {
    let resolveStoredRecovery;
    const applyArchiveBlob = jest.fn().mockResolvedValue({ status: 'loaded' });
    const { workspaceState } = installDocumentState({
      workspaceState: {
        sessionRevision: 4,
        sessionDirty: false,
        sessionUserDirty: false
      },
      sessionActions: { applyArchiveBlob },
      session: { markSessionDirty: jest.fn() }
    });
    window.desktop.readRecoverySnapshot = jest.fn(() => new Promise(resolve => {
      resolveStoredRecovery = resolve;
    }));
    window.confirm = jest.fn(() => true);

    const restorePromise = window.Main.documentState.maybeRestoreRecovery();
    workspaceState.sessionRevision = 5;
    workspaceState.sessionDirty = true;
    workspaceState.sessionUserDirty = true;
    workspaceState.tabs[0].payloadSignature = 'newer-user-edit';
    resolveStoredRecovery({
      exists: true,
      dataBase64: Buffer.from('graphitix-recovery').toString('base64'),
      meta: {
        dirty: true,
        hasData: true,
        tabCount: 1,
        revision: 4,
        fileName: 'recovered.graph',
        fileScope: 'workspace'
      }
    });

    await expect(restorePromise).resolves.toBe(false);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(applyArchiveBlob).not.toHaveBeenCalled();
    expect(workspaceState.tabs[0].payloadSignature).toBe('newer-user-edit');
  });

  test('startup recovery does not clear a checkpoint after its restore target changes', async () => {
    let resolveStoredRecovery;
    const { workspaceState } = installDocumentState({
      workspaceState: {
        sessionRevision: 4,
        sessionDirty: false,
        sessionUserDirty: false
      }
    });
    window.desktop.readRecoverySnapshot = jest.fn(() => new Promise(resolve => {
      resolveStoredRecovery = resolve;
    }));

    const restorePromise = window.Main.documentState.maybeRestoreRecovery();
    workspaceState.sessionRevision = 5;
    workspaceState.sessionDirty = true;
    workspaceState.sessionUserDirty = true;
    resolveStoredRecovery({
      exists: true,
      dataBase64: Buffer.from('empty-graphitix-recovery').toString('base64'),
      meta: {
        dirty: true,
        hasData: false,
        tabCount: 0,
        revision: 4,
        fileName: 'recovered.graph',
        fileScope: 'workspace'
      }
    });

    await expect(restorePromise).resolves.toBe(false);
    expect(window.desktop.clearRecoverySnapshot).not.toHaveBeenCalled();
  });

  test('startup recovery does not replace a document opened while the checkpoint is loading', async () => {
    let resolveStoredRecovery;
    const applyArchiveBlob = jest.fn().mockResolvedValue({ status: 'loaded' });
    const { workspaceState } = installDocumentState({
      workspaceState: {
        sessionRevision: 4,
        sessionDirty: false,
        sessionUserDirty: false
      },
      sessionActions: { applyArchiveBlob },
      session: { markSessionDirty: jest.fn() }
    });
    const originalTab = workspaceState.tabs[0];
    window.desktop.readRecoverySnapshot = jest.fn(() => new Promise(resolve => {
      resolveStoredRecovery = resolve;
    }));
    window.confirm = jest.fn(() => true);

    const restorePromise = window.Main.documentState.maybeRestoreRecovery();
    workspaceState.tabs = [{
      id: 'opened-tab',
      title: 'Opened document',
      type: 'box',
      isWelcome: false
    }];
    workspaceState.activeTabId = 'opened-tab';
    workspaceState.sessionFileName = 'opened.graph';
    resolveStoredRecovery({
      exists: true,
      dataBase64: Buffer.from('graphitix-recovery').toString('base64'),
      meta: {
        dirty: true,
        hasData: true,
        tabCount: 1,
        revision: 4,
        fileName: 'recovered.graph',
        fileScope: 'workspace'
      }
    });

    await expect(restorePromise).resolves.toBe(false);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(applyArchiveBlob).not.toHaveBeenCalled();
    expect(workspaceState.tabs).not.toContain(originalTab);
    expect(workspaceState.sessionFileName).toBe('opened.graph');
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
