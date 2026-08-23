describe('documentState recovery journal', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    window.Main = {};
    window.Shared = { isDebugEnabled: () => false };
    window.desktop = {
      isDesktop: true,
      writeRecoverySnapshot: jest.fn().mockResolvedValue(true),
      readRecoverySnapshot: jest.fn().mockResolvedValue({ exists: false }),
      clearRecoverySnapshot: jest.fn().mockResolvedValue(true),
      writeRecoveryJournal: jest.fn().mockResolvedValue(true),
      readRecoveryJournal: jest.fn().mockResolvedValue({ exists: false, record: null }),
      clearRecoveryJournal: jest.fn().mockResolvedValue(true)
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
        title: 'Scatter',
        type: 'scatter',
        isWelcome: false,
        userModified: true,
        payload: { config: { type: 'scatter' }, data: { rows: [[1, 2, 3], [4, 5, 6]] } },
        payloadSignature: 'sig-1',
        layout: { svgBox: { width: 500 } },
        uiState: { tableScroll: 12 }
      }],
      activeTabId: 'tab-1',
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
      applyArchiveBlob: jest.fn().mockResolvedValue({ status: 'loaded' }),
      ...overrides.sessionActions
    };
    const session = {
      graphTabsHaveData: jest.fn(() => true),
      tabHasTableData: jest.fn(() => true),
      markSessionDirty: jest.fn(),
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

  test('a user payload commit persists a lightweight journal after a short coalesce', async () => {
    const { sessionActions } = installDocumentState();

    window.Main.documentState.notifyTabPayloadJournaled('tab-1', { reason: 'user-edit' });

    jest.advanceTimersByTime(399);
    await flushTimers();
    expect(window.desktop.writeRecoveryJournal).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    await flushTimers();
    expect(window.desktop.writeRecoveryJournal).toHaveBeenCalledTimes(1);
    const record = window.desktop.writeRecoveryJournal.mock.calls[0][0];
    expect(record.revision).toBe(1);
    expect(record.tabs).toHaveLength(1);
    expect(record.tabs[0]).toEqual(expect.objectContaining({
      tabId: 'tab-1',
      type: 'scatter',
      payload: expect.objectContaining({ data: expect.any(Object) }),
      layout: expect.objectContaining({ svgBox: expect.any(Object) }),
      uiState: expect.objectContaining({ tableScroll: 12 })
    }));
    // The journal must not serialize the expensive rich-snapshot content.
    expect(sessionActions.buildWorkspaceArchiveBlob).not.toHaveBeenCalled();
  });

  test('rapid continuous edits coalesce into one journal write', async () => {
    installDocumentState();

    for (let i = 0; i < 6; i += 1) {
      window.Main.documentState.notifyTabPayloadJournaled('tab-1', { reason: `edit-${i}` });
    }
    await flushTimers();
    expect(window.desktop.writeRecoveryJournal).not.toHaveBeenCalled();

    jest.advanceTimersByTime(399);
    await flushTimers();
    expect(window.desktop.writeRecoveryJournal).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await flushTimers();
    expect(window.desktop.writeRecoveryJournal).toHaveBeenCalledTimes(1);
    // The coalesced write reflects the final revision once, not one write per edit.
    expect(window.desktop.writeRecoveryJournal.mock.calls[0][0].reason).toBe('edit-5');
  });

  test('journal writes are skipped while the document is clean', async () => {
    const { workspaceState } = installDocumentState();
    workspaceState.sessionUserDirty = false;

    window.Main.documentState.notifyTabPayloadJournaled('tab-1', { reason: 'user-edit' });
    jest.advanceTimersByTime(5000);
    await flushTimers();

    expect(window.desktop.writeRecoveryJournal).not.toHaveBeenCalled();
  });

  test('a completed rich snapshot trims a journal at or below its revision', async () => {
    window.desktop.readRecoveryJournal = jest.fn().mockResolvedValue({
      exists: true,
      record: { revision: 1, tabs: [{ tabId: 'tab-1', payload: { v: 1 } }] }
    });
    installDocumentState();

    const result = await window.Main.documentState.writeRecoverySnapshot('recovery-interval');
    expect(result.status).toBe('saved');
    await flushTimers();
    await flushTimers();

    expect(window.desktop.clearRecoveryJournal).toHaveBeenCalled();
  });

  test('a journal newer than the rich snapshot survives the snapshot write', async () => {
    window.desktop.readRecoveryJournal = jest.fn().mockResolvedValue({
      exists: true,
      record: { revision: 2, tabs: [{ tabId: 'tab-1', payload: { v: 2 } }] }
    });
    installDocumentState();

    await window.Main.documentState.writeRecoverySnapshot('recovery-interval');
    await flushTimers();
    await flushTimers();

    expect(window.desktop.clearRecoveryJournal).not.toHaveBeenCalled();
  });

  test('recovery restore folds journal payloads over a stale rich snapshot', async () => {
    window.desktop.readRecoverySnapshot = jest.fn().mockResolvedValue({
      exists: true,
      dataBase64: Buffer.from('graphitix-recovery').toString('base64'),
      meta: {
        dirty: true,
        hasData: true,
        tabCount: 1,
        fileName: 'recovered.graph',
        savedAt: '2026-08-22T12:00:00.000Z',
        revision: 1
      }
    });
    window.desktop.readRecoveryJournal = jest.fn().mockResolvedValue({
      exists: true,
      record: {
        revision: 2,
        activeTabId: 'tab-1',
        fileName: 'recovered.graph',
        tabs: [{
          tabId: 'tab-1',
          title: 'Scatter',
          type: 'scatter',
          payload: { config: { type: 'scatter' }, data: { rows: [[9, 9, 9]] } },
          layout: { svgBox: { width: 600 } },
          uiState: { tableScroll: 42 }
        }]
      }
    });
    window.Shared.graphArchive = {
      parseFile: jest.fn().mockResolvedValue({
        source: 'recovered.graph',
        session: {
          tabs: [{
            archiveRuntimeTabId: 'tab-1',
            title: 'Scatter',
            type: 'scatter',
            payload: { config: { type: 'scatter' }, data: { rows: [[1, 2, 3]] } },
            layout: null,
            uiState: null,
            archiveRenderCache: { type: 'scatter', complete: true },
            archiveRenderCacheSignature: 'old-sig',
            previewMarkup: '<svg/>'
          }],
          activeIndex: 0,
          scope: 'workspace'
        }
      })
    };
    window.confirm = jest.fn(() => true);
    const { sessionActions, session } = installDocumentState();

    await expect(window.Main.documentState.maybeRestoreRecovery()).resolves.toBe(true);

    expect(sessionActions.applyArchiveBlob).toHaveBeenCalledTimes(1);
    const meta = sessionActions.applyArchiveBlob.mock.calls[0][2];
    expect(meta.parsedSession).toBeDefined();
    const tab = meta.parsedSession.session.tabs[0];
    expect(tab.payload).toEqual({ config: { type: 'scatter' }, data: { rows: [[9, 9, 9]] } });
    expect(tab.layout).toEqual({ svgBox: { width: 600 } });
    expect(tab.uiState).toEqual({ tableScroll: 42 });
    // Stale snapshot render caches/previews must be dropped for the journaled tab.
    expect(tab.archiveRenderCache).toBeNull();
    expect(tab.archiveRenderCacheSignature).toBeNull();
    expect(tab.previewMarkup).toBeNull();
    expect(session.markSessionDirty).toHaveBeenCalledWith('recovery-restored', expect.objectContaining({
      origin: 'user'
    }));
    expect(window.desktop.clearRecoveryJournal).toHaveBeenCalledWith('recovery-restored');
  });

  test('recovery restore keeps the snapshot unchanged when the journal is not newer', async () => {
    window.desktop.readRecoverySnapshot = jest.fn().mockResolvedValue({
      exists: true,
      dataBase64: Buffer.from('graphitix-recovery').toString('base64'),
      meta: { dirty: true, hasData: true, tabCount: 1, fileName: 'recovered.graph', revision: 2 }
    });
    window.desktop.readRecoveryJournal = jest.fn().mockResolvedValue({
      exists: true,
      record: { revision: 2, tabs: [{ tabId: 'tab-1', payload: { v: 2 } }] }
    });
    window.confirm = jest.fn(() => true);
    const { sessionActions } = installDocumentState();

    await expect(window.Main.documentState.maybeRestoreRecovery()).resolves.toBe(true);

    const meta = sessionActions.applyArchiveBlob.mock.calls[0][2];
    expect(meta.parsedSession).toBeUndefined();
  });

  test('missing journal falls back to the plain rich snapshot restore', async () => {
    window.desktop.readRecoverySnapshot = jest.fn().mockResolvedValue({
      exists: true,
      dataBase64: Buffer.from('graphitix-recovery').toString('base64'),
      meta: { dirty: true, hasData: true, tabCount: 1, fileName: 'recovered.graph', revision: 3 }
    });
    window.confirm = jest.fn(() => true);
    const { sessionActions } = installDocumentState();

    await expect(window.Main.documentState.maybeRestoreRecovery()).resolves.toBe(true);

    const meta = sessionActions.applyArchiveBlob.mock.calls[0][2];
    expect(meta.parsedSession).toBeUndefined();
    expect(window.Shared.graphArchive).toBeUndefined();
  });

  test('journal-only recovery restores the workspace when no rich snapshot exists yet', async () => {
    window.desktop.readRecoverySnapshot = jest.fn().mockResolvedValue({ exists: false });
    window.desktop.readRecoveryJournal = jest.fn().mockResolvedValue({
      exists: true,
      record: {
        revision: 1,
        activeTabId: 'tab-1',
        fileName: 'untitled.graph',
        at: '2026-08-22T12:00:00.000Z',
        fileScope: 'workspace',
        tabs: [{
          tabId: 'tab-1',
          title: 'Scatter',
          type: 'scatter',
          payload: { config: { type: 'scatter' }, data: { rows: [[7, 8, 9]] } },
          layout: null,
          uiState: null
        }]
      }
    });
    window.confirm = jest.fn(() => true);
    const { sessionActions, session } = installDocumentState();

    await expect(window.Main.documentState.maybeRestoreRecovery()).resolves.toBe(true);

    expect(sessionActions.applyArchiveBlob).toHaveBeenCalledTimes(1);
    const [context, blob, meta] = sessionActions.applyArchiveBlob.mock.calls[0];
    expect(blob).toBeNull();
    expect(meta.parsedSession).toBeDefined();
    expect(meta.parsedSession.session.tabs[0].payload).toEqual({
      config: { type: 'scatter' },
      data: { rows: [[7, 8, 9]] }
    });
    expect(meta.parsedSession.session.activeIndex).toBe(0);
    expect(session.markSessionDirty).toHaveBeenCalledWith('recovery-restored', expect.objectContaining({
      origin: 'user',
      fileName: 'untitled.graph'
    }));
    expect(window.desktop.clearRecoveryJournal).toHaveBeenCalledWith('recovery-restored');
  });

  test('clearing the recovery snapshot also clears the journal', async () => {
    installDocumentState();

    await window.Main.documentState.clearRecoverySnapshot('clean');

    expect(window.desktop.clearRecoverySnapshot).toHaveBeenCalled();
    expect(window.desktop.clearRecoveryJournal).toHaveBeenCalledWith('clean');
  });

  test('the session commit hook notifies the journal through the public API', async () => {
    const { workspaceState } = installDocumentState();
    const notifySpy = jest.spyOn(window.Main.documentState, 'notifyTabPayloadJournaled');

    // Simulate the owning session's payload commit path: markSessionDirty already ran
    // (sessionUserDirty true) and assignTabPayload commits a new payload object.
    workspaceState.tabs[0].payload = { config: { type: 'scatter' }, data: { rows: [[2, 2, 2]] } };
    window.Main.documentState.notifyTabPayloadJournaled('tab-1', { reason: 'payload-commit' });

    jest.advanceTimersByTime(400);
    await flushTimers();

    expect(notifySpy).toHaveBeenCalledWith('tab-1', { reason: 'payload-commit' });
    expect(window.desktop.writeRecoveryJournal).toHaveBeenCalledTimes(1);
    expect(window.desktop.writeRecoveryJournal.mock.calls[0][0].tabs[0].payload.data.rows).toEqual([[2, 2, 2]]);
    notifySpy.mockRestore();
  });
});
