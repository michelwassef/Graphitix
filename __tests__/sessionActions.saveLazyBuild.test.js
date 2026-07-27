describe('sessionActions save lazy archive build', () => {
  function installSessionActions() {
    jest.resetModules();
    window.Main = {};
    window.Shared = {
      fileIO: {},
      graphArchive: {
        parseFile: jest.fn(),
        ensureGraphFileName: jest.fn((name, fallback) => name || fallback || 'workspace.graph'),
        buildArchiveBlob: jest.fn().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }))
      }
    };
    require('../js/main/snapshotPolicy.js');
    require('../js/main/sessionActions.js');
    return window.Main.sessionActions;
  }

  function createContext(overrides = {}) {
    const session = {
      fastClonePayload: value => (value == null ? value : JSON.parse(JSON.stringify(value))),
      getActiveTab: jest.fn(() => ({ id: 'tab-1', title: 'XY Plots', type: 'scatter' })),
      persistActiveTabState: jest.fn(),
      clearSessionDirty: jest.fn()
    };
    const workspaceState = {
      tabs: [{
        id: 'tab-1',
        title: 'XY Plots',
        type: 'scatter',
        isWelcome: false,
        payload: { type: 'scatter', data: [[1, 2, 'A']] },
        layoutState: null
      }],
      sessionDirty: true,
      sessionFileHandle: null,
      sessionFileScope: null,
      sessionFileName: ''
    };
    return {
      Shared: window.Shared,
      session,
      workspaceState,
      withSessionContext: value => value,
      sessionFileTypes: [],
      ...overrides
    };
  }

  afterEach(() => {
    delete window.Main;
    delete window.Shared;
  });

  test('does not build archive blob when picker save is cancelled', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn().mockResolvedValue({
      status: 'cancelled',
      via: 'picker'
    });
    const context = createContext();

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    });

    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalled();
    expect(window.Shared.graphArchive.buildArchiveBlob).not.toHaveBeenCalled();
    expect(result.status).toBe('cancelled');
    expect(context.session.clearSessionDirty).not.toHaveBeenCalled();
  });

  test('builds archive blob only when save flow requests payload', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      const payload = await options.getPayload();
      expect(payload).toBeInstanceOf(Blob);
      return {
        status: 'saved',
        via: 'picker',
        fileName: 'workspace.graph'
      };
    });
    const context = createContext();

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    });

    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalled();
    expect(window.Shared.graphArchive.buildArchiveBlob).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('saved');
    expect(context.session.clearSessionDirty).toHaveBeenCalledWith('graph-save-success');
  });

  test('autosave snapshot policy keeps render-cache capture disabled', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      return { status: 'saved', via: 'picker', fileName: 'workspace.graph' };
    });
    const context = createContext();

    await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace',
      reason: 'autosave',
      snapshotKind: 'autosave'
    });

    const lastPersistCall = context.session.persistActiveTabState.mock.calls.at(-1) || [];
    expect(lastPersistCall[1]).toEqual(expect.objectContaining({
      captureRenderCache: false
    }));
  });

  test('manual save snapshot policy captures render cache by default', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      return { status: 'saved', via: 'picker', fileName: 'workspace.graph' };
    });
    const context = createContext();

    await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace',
      reason: 'toolbar-save'
    });

    const lastPersistCall = context.session.persistActiveTabState.mock.calls.at(-1) || [];
    expect(lastPersistCall[1]).toEqual(expect.objectContaining({
      captureRenderCache: true
    }));
  });

  test('recovery snapshot policy captures render cache only when opted in and idle', async () => {
    const sessionActions = installSessionActions();
    const context = createContext();
    const persistSpy = context.session.persistActiveTabState;

    const idle = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      policyMode: 'recovery',
      snapshotKind: 'recovery',
      highFidelityEnabled: true,
      idleForMs: 5000,
      reason: 'recovery-interval'
    });
    expect(idle.policy.captureRenderCache).toBe(true);

    const active = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      policyMode: 'recovery',
      snapshotKind: 'recovery',
      highFidelityEnabled: true,
      idleForMs: 10,
      reason: 'recovery-interval'
    });
    expect(active.policy.captureRenderCache).toBe(false);

    const disabled = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      policyMode: 'recovery',
      snapshotKind: 'recovery',
      idleForMs: 9000,
      captureRenderCacheBeforeSnapshot: false,
      reason: 'recovery-interval'
    });
    expect(disabled.policy.captureRenderCache).toBe(false);
    expect(persistSpy).toHaveBeenCalledTimes(3);
  });


  test('manual save and recovery independently capture the same canonical active owner state', async () => {
    const sessionActions = installSessionActions();
    const context = createContext();
    const activeTab = context.workspaceState.tabs[0];
    const livePayload = {
      type: 'scatter',
      data: [['Gene', 'X', 'Y'], ['A', 1, 2]],
      exclusions: { rows: [4], cols: [2], cells: [[1, 1]] },
      config: { title: 'Checkpoint parity' }
    };
    const liveLayout = { component: 'scatter', width: 777, height: 543 };
    const liveUiState = {
      toolbarActiveSection: 'data',
      component: { table: { firstDisplayedRow: 3 } }
    };
    activeTab.payload = { type: 'scatter', data: [] };
    activeTab.layoutState = null;
    activeTab.uiState = liveUiState;
    context.session.getActiveTab.mockReturnValue(activeTab);
    context.session.serializePayloadSignature = value => JSON.stringify(value);
    context.session.enrichTabSnapshotForArchive = tab => ({
      payload: JSON.parse(JSON.stringify(tab.payload)),
      layout: JSON.parse(JSON.stringify(tab.layoutState))
    });
    context.session.persistActiveTabState.mockImplementation((tab, options) => {
      expect(options.snapshotIntent).toEqual(expect.objectContaining({
        saveLike: true,
        captureLivePayload: true,
        allowSkipLivePayloadCapture: false
      }));
      tab.payload = JSON.parse(JSON.stringify(livePayload));
      tab.layoutState = JSON.parse(JSON.stringify(liveLayout));
      tab.payloadSignature = JSON.stringify(tab.payload);
      tab.layoutSignature = JSON.stringify(tab.layoutState);
    });

    const manual = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      snapshotKind: 'archive-save',
      policyMode: 'manual-save',
      captureRenderCacheBeforeSnapshot: false,
      reason: 'toolbar-save'
    });
    const manualPersistOptions = context.session.persistActiveTabState.mock.calls.at(-1)[1];

    const recovery = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      captureRenderCacheBeforeSnapshot: false,
      reason: 'recovery-interval'
    });
    expect(recovery.snapshot).toStrictEqual(manual.snapshot);
    expect(recovery.snapshot.tabs[0]).toEqual(expect.objectContaining({
      payload: livePayload,
      layout: liveLayout,
      uiState: liveUiState,
      archiveRenderCache: null
    }));
    expect(context.session.persistActiveTabState).toHaveBeenCalledTimes(2);
    expect(manualPersistOptions.snapshotIntent.captureLivePayload).toBe(true);
    expect(recovery.policy.snapshotIntent).toEqual(expect.objectContaining({
      saveLike: true,
      captureLivePayload: true,
      allowSkipLivePayloadCapture: false
    }));
  });


  test('lean worker recovery still awaits component readiness before active-owner capture', async () => {
    const sessionActions = installSessionActions();
    const ready = jest.fn().mockResolvedValue({ ok: true });
    const context = createContext({
      workspaces: {
        scatter: { awaitReadyForSnapshot: ready }
      }
    });

    await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      captureRenderCacheBeforeSnapshot: false,
      useWorker: true,
      reason: 'recovery-interval'
    });

    expect(ready).toHaveBeenCalledTimes(1);
    expect(context.session.persistActiveTabState).toHaveBeenCalledTimes(1);
    expect(context.session.persistActiveTabState.mock.calls[0][1]).toEqual(expect.objectContaining({
      snapshotIntent: expect.objectContaining({
        saveLike: true,
        captureLivePayload: true,
        allowSkipLivePayloadCapture: false
      })
    }));
  });

  test('serializes the active cache captured by the shared session checkpoint owner', async () => {
    const sessionActions = installSessionActions();
    const serializedCache = {
      __graphitixRenderCache: { tabId: 'tab-1', type: 'scatter', complete: true },
      plot: { fragment: { kind: 'element', markup: '<svg></svg>' } }
    };
    const capturedCache = {
      __graphitixRenderCache: { tabId: 'tab-1', type: 'scatter', complete: true },
      plot: { fragment: document.createDocumentFragment(), count: 1 }
    };
    let archiveRequest = null;
    window.Shared.graphArchive.buildArchiveBlob.mockImplementation(async request => {
      archiveRequest = request;
      return new Blob(['zip'], { type: 'application/zip' });
    });
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      return { status: 'saved', via: 'picker', fileName: 'workspace.graph' };
    });
    const context = createContext();
    const activeTab = context.workspaceState.tabs[0];
    activeTab.payloadSignature = 'payload-sig';
    activeTab.layoutSignature = 'layout-sig';
    context.session.getActiveTab.mockReturnValue(activeTab);
    context.session.serializeRenderCacheForArchive = jest.fn(cache => cache === capturedCache ? serializedCache : null);
    context.session.persistActiveTabState.mockImplementation((tab, options) => {
      if (options.captureRenderCache === true) {
        tab.renderCache = {
          cache: capturedCache,
          tabId: tab.id,
          type: tab.type,
          payloadSignature: tab.payloadSignature,
          layoutSignature: tab.layoutSignature
        };
      }
    });
    const directCapture = jest.fn();
    context.workspaces = {
      scatter: {
        captureRenderCache: directCapture,
        restoreRenderCache: jest.fn()
      }
    };

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    });

    expect(result.status).toBe('saved');
    expect(context.session.persistActiveTabState).toHaveBeenCalledWith(
      activeTab,
      expect.objectContaining({ captureRenderCache: true })
    );
    expect(directCapture).not.toHaveBeenCalled();
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCache).toStrictEqual(serializedCache);
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCacheSignature).toBe('payload-sig');
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCacheLayoutSignature).toBe('layout-sig');
  });


  test('serializes inactive tab render cache from in-memory cache without invoking live capture', async () => {
    const sessionActions = installSessionActions();
    const serializedCache = {
      __graphitixRenderCache: { tabId: 'tab-1', type: 'scatter', complete: true },
      plot: { kind: 'scatter' }
    };
    const capturedCache = {
      __graphitixRenderCache: { tabId: 'tab-1', type: 'scatter', complete: true },
      plot: { fragment: document.createDocumentFragment(), count: 1 }
    };
    const boxSerializedCache = {
      __graphitixRenderCache: { tabId: 'tab-2', type: 'box', complete: true },
      plot: { kind: 'box' }
    };
    const boxCachedFragment = {
      __graphitixRenderCache: { tabId: 'tab-2', type: 'box', complete: true },
      plot: { fragment: document.createDocumentFragment(), count: 2 }
    };
    let archiveRequest = null;
    window.Shared.graphArchive.buildArchiveBlob.mockImplementation(async request => {
      archiveRequest = request;
      return new Blob(['zip'], { type: 'application/zip' });
    });
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      const payload = await options.getPayload();
      expect(payload).toBeInstanceOf(Blob);
      return {
        status: 'saved',
        via: 'picker',
        fileName: 'workspace.graph'
      };
    });
    const context = createContext({
      workspaceState: {
        tabs: [
          {
            id: 'tab-1',
            title: 'XY Plots',
            type: 'scatter',
            isWelcome: false,
            payload: { type: 'scatter', data: [[1, 2, 'A']] },
            layoutState: null
          },
          {
            id: 'tab-2',
            title: 'Distribution Charts',
            type: 'box',
            isWelcome: false,
            payload: { type: 'box', data: [[3, 4, 'B']] },
            layoutState: null,
            payloadSignature: 'box-payload-sig',
            layoutSignature: 'box-layout-sig',
            renderCache: {
              cache: boxCachedFragment,
              tabId: 'tab-2',
              type: 'box',
              payloadSignature: 'box-payload-sig',
              layoutSignature: 'box-layout-sig'
            }
          }
        ],
        sessionDirty: true,
        sessionFileHandle: null,
        sessionFileScope: null,
        sessionFileName: ''
      }
    });
    const activeTab = context.workspaceState.tabs[0];
    activeTab.payloadSignature = 'payload-sig';
    activeTab.layoutSignature = 'layout-sig';
    context.session.getActiveTab.mockReturnValue(activeTab);
    context.session.serializeRenderCacheForArchive = jest.fn((cache) => {
      if (cache === capturedCache) {
        return serializedCache;
      }
      if (cache === boxCachedFragment) {
        return boxSerializedCache;
      }
      return null;
    });
    context.session.persistActiveTabState.mockImplementation((tab, options) => {
      if (tab.id === activeTab.id && options.captureRenderCache === true) {
        tab.renderCache = {
          cache: capturedCache,
          tabId: tab.id,
          type: tab.type,
          payloadSignature: tab.payloadSignature,
          layoutSignature: tab.layoutSignature
        };
      }
    });
    const captureRenderCache = jest.fn();
    const restoreRenderCache = jest.fn();
    const draw = jest.fn();
    const boxCaptureRenderCache = jest.fn(() => boxCachedFragment);
    const boxRestoreRenderCache = jest.fn(() => true);
    const boxDraw = jest.fn();
    context.workspaces = {
      scatter: {
        captureRenderCache,
        restoreRenderCache,
        draw
      },
      box: {
        captureRenderCache: boxCaptureRenderCache,
        restoreRenderCache: boxRestoreRenderCache,
        draw: boxDraw
      }
    };

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    });

    expect(result.status).toBe('saved');
    expect(captureRenderCache).not.toHaveBeenCalled();
    expect(boxCaptureRenderCache).not.toHaveBeenCalled();
    expect(boxRestoreRenderCache).not.toHaveBeenCalled();
    expect(boxDraw).not.toHaveBeenCalled();
    expect(archiveRequest?.tabs?.[1]?.archiveRenderCache).toStrictEqual(boxSerializedCache);
    expect(archiveRequest?.tabs?.[1]?.archiveRenderCacheSignature).toBe('box-payload-sig');
    expect(archiveRequest?.tabs?.[1]?.archiveRenderCacheLayoutSignature).toBe('box-layout-sig');
  });

  test('lean recovery checkpoints never capture or embed render caches', async () => {
    const sessionActions = installSessionActions();
    let archiveRequest = null;
    window.Shared.graphArchive.buildArchiveBlob.mockImplementation(async request => {
      archiveRequest = request;
      return new Blob(['zip'], { type: 'application/zip' });
    });
    const context = createContext();
    const activeTab = context.workspaceState.tabs[0];
    activeTab.payloadSignature = 'payload-sig';
    activeTab.layoutSignature = 'layout-sig';
    activeTab.renderCache = {
      cache: { plot: { stale: false } },
      tabId: activeTab.id,
      payloadSignature: 'payload-sig',
      layoutSignature: 'layout-sig'
    };
    context.session.getActiveTab.mockReturnValue(activeTab);
    context.session.serializeRenderCacheForArchive = jest.fn(cache => cache);

    await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      policyMode: 'recovery',
      snapshotKind: 'recovery',
      idleForMs: 0,
      captureRenderCacheBeforeSnapshot: false,
      reason: 'recovery-interval'
    });

    expect(context.session.persistActiveTabState).toHaveBeenCalledWith(activeTab, expect.objectContaining({
      captureRenderCache: false,
      reason: 'recovery-interval'
    }));
    expect(context.session.serializeRenderCacheForArchive).not.toHaveBeenCalled();
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCache).toBeNull();
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCacheSignature).toBeNull();
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCacheLayoutSignature).toBeNull();
  });

  test('stale render caches are discarded instead of being relabeled with current signatures', async () => {
    const sessionActions = installSessionActions();
    let archiveRequest = null;
    window.Shared.graphArchive.buildArchiveBlob.mockImplementation(async request => {
      archiveRequest = request;
      return new Blob(['zip'], { type: 'application/zip' });
    });
    const context = createContext();
    const activeTab = context.workspaceState.tabs[0];
    activeTab.payloadSignature = 'current-payload';
    activeTab.layoutSignature = 'current-layout';
    activeTab.renderCache = {
      cache: { plot: { stale: true } },
      tabId: activeTab.id,
      payloadSignature: 'old-payload',
      layoutSignature: 'old-layout'
    };
    context.session.getActiveTab.mockReturnValue(activeTab);
    context.session.serializeRenderCacheForArchive = jest.fn(cache => cache);

    await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'archive-save',
      captureRenderCacheBeforeSnapshot: true,
      reason: 'toolbar-save'
    });

    expect(context.session.serializeRenderCacheForArchive).not.toHaveBeenCalled();
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCache).toBeNull();
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCacheSignature).toBeNull();
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCacheLayoutSignature).toBeNull();
  });

  test('buildArchiveTabSnapshot funnels payload/layout through session.enrichTabSnapshotForArchive', async () => {
    const sessionActions = installSessionActions();
    let archiveRequest = null;
    window.Shared.graphArchive.buildArchiveBlob.mockImplementation(async request => {
      archiveRequest = request;
      return new Blob(['zip'], { type: 'application/zip' });
    });
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      const payload = await options.getPayload();
      expect(payload).toBeInstanceOf(Blob);
      return { status: 'saved', via: 'picker', fileName: 'workspace.graph' };
    });

    const enrichedPayload = { type: 'scatter', data: [[1, 2, 'A']], __enriched: 'scatter-payload' };
    const enrichedLayout = { component: 'scatter', __enriched: 'scatter-layout' };
    const enrichSpy = jest.fn(() => ({ payload: enrichedPayload, layout: enrichedLayout }));

    const context = createContext();
    context.session.enrichTabSnapshotForArchive = enrichSpy;
    context.session.getActiveTab.mockReturnValue(context.workspaceState.tabs[0]);

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    });

    expect(result.status).toBe('saved');
    // The shared enrichment helper should be called once per graph tab.
    expect(enrichSpy).toHaveBeenCalledWith(
      context.workspaceState.tabs[0],
      expect.objectContaining({ contextLabel: 'archive-snapshot' })
    );
    // The payload/layout passed to buildArchiveBlob should be the enriched values, not raw clones.
    expect(archiveRequest?.tabs?.[0]?.payload).toStrictEqual(enrichedPayload);
    expect(archiveRequest?.tabs?.[0]?.layout).toStrictEqual(enrichedLayout);
  });

  test('workspace save never activates inactive tabs to manufacture render caches', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      return { status: 'saved', via: 'picker', fileName: 'workspace.graph' };
    });
    const activateTab = jest.fn();
    const context = createContext({
      workspaceState: {
        tabs: [
          { id: 'tab-1', title: 'A', type: 'scatter', isWelcome: false, payload: { type: 'scatter', data: [[1, 2]] }, layoutState: null },
          { id: 'tab-2', title: 'B', type: 'box', isWelcome: false, payload: { type: 'box', data: [[3, 4]] }, layoutState: null }
        ],
        sessionDirty: false,
        sessionFileHandle: null,
        sessionFileScope: null,
        sessionFileName: ''
      }
    });
    context.session.getActiveTab.mockReturnValue(context.workspaceState.tabs[0]);
    context.activateTab = activateTab;
    await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    });

    expect(activateTab).not.toHaveBeenCalled();
    expect(sessionActions.warmTabRenderCaches).toBeUndefined();
  });

  test('save, autosave, and recovery snapshots do not run inside a document transaction', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn();
    const context = createContext();
    context.workspaceState.documentOperation = {
      active: true,
      token: 'document-open-1',
      kind: 'open',
      status: 'loading',
      fileName: 'incoming.graph'
    };

    await expect(sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    })).resolves.toEqual(expect.objectContaining({
      status: 'cancelled',
      reason: 'document-operation'
    }));
    await expect(sessionActions.autosaveWorkspace(context)).resolves.toEqual(expect.objectContaining({
      status: 'skipped',
      reason: 'document-operation'
    }));
    await expect(sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'recovery'
    })).resolves.toBeNull();

    expect(window.Shared.fileIO.saveGraphFileAs).not.toHaveBeenCalled();
    expect(window.Shared.graphArchive.buildArchiveBlob).not.toHaveBeenCalled();
  });

  test('handleSessionSaveClick uses Save As flow when there is no existing file handle', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFile = jest.fn().mockResolvedValue({
      status: 'saved',
      via: 'existingHandle',
      fileName: 'workspace.graph'
    });
    window.Shared.fileIO.saveGraphFileAs = jest.fn().mockResolvedValue({
      status: 'saved',
      via: 'picker',
      fileName: 'workspace.graph'
    });
    const context = createContext({
      workspaceState: {
        ...createContext().workspaceState,
        sessionFileHandle: null,
        sessionFileScope: null
      }
    });

    const result = await sessionActions.handleSessionSaveClick(context, {
      reason: 'toolbar-save'
    });

    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalledTimes(1);
    expect(window.Shared.fileIO.saveGraphFile).not.toHaveBeenCalled();
    expect(result.status).toBe('saved');
  });

  test('handleSessionSaveClick saves all tabs by default and does not reuse a tab-only handle', async () => {
    const sessionActions = installSessionActions();
    const existingHandle = { name: 'existing.graph' };
    window.Shared.fileIO.saveGraphFile = jest.fn().mockResolvedValue({
      status: 'saved',
      via: 'existingHandle',
      fileName: 'existing.graph'
    });
    window.Shared.fileIO.saveGraphFileAs = jest.fn().mockResolvedValue({
      status: 'saved',
      via: 'picker',
      fileName: 'renamed.graph'
    });
    const baseContext = createContext({
      workspaceState: {
        ...createContext().workspaceState,
        sessionFileHandle: existingHandle,
        sessionFileScope: 'tab',
        sessionFileName: 'existing.graph'
      }
    });

    const saveResult = await sessionActions.handleSessionSaveClick(baseContext, {
      reason: 'toolbar-save'
    });
    expect(window.Shared.fileIO.saveGraphFile).toHaveBeenCalledTimes(0);
    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalledTimes(1);
    expect(saveResult.status).toBe('saved');

    const saveAsResult = await sessionActions.handleSessionSaveClick(baseContext, {
      reason: 'toolbar-save-as',
      forcePicker: true
    });
    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalledTimes(2);
    expect(saveAsResult.status).toBe('saved');
  });

  test('loadWorkspaceFile appends tabs when loadMode is append and marks session dirty', async () => {
    const sessionActions = installSessionActions();
    const parsed = {
      source: 'graph-archive',
      session: {
        activeIndex: 0,
        tabs: [{
          title: 'Loaded Scatter',
          type: 'scatter',
          payload: { type: 'scatter', data: [[7, 9, 'L']] },
          layout: null
        }],
        scope: 'tab'
      }
    };
    window.Shared.graphArchive.parseFile.mockResolvedValue(parsed);
    const applySessionData = jest.fn();
    const markSessionDirty = jest.fn();
    const context = {
      Shared: window.Shared,
      session: {
        fastClonePayload: value => (value == null ? value : JSON.parse(JSON.stringify(value))),
        applySessionData,
        markSessionDirty
      },
      workspaceState: {
        tabs: [],
        sessionFileHandle: { name: 'existing.graph' },
        sessionFileScope: 'workspace',
        sessionFileName: 'existing.graph'
      },
      withSessionContext: value => value
    };

    const result = await sessionActions.loadWorkspaceFile(context, { name: 'incoming.graph' }, {
      fileName: 'incoming.graph',
      fileHandle: { name: 'incoming.graph' },
      loadMode: 'append',
      reason: 'welcome-graph-load'
    });

    expect(window.Shared.graphArchive.parseFile).toHaveBeenCalledTimes(1);
    expect(applySessionData).toHaveBeenCalledTimes(1);
    const [payload, options] = applySessionData.mock.calls[0];
    expect(payload.tabs).toHaveLength(1);
    expect(payload.activeIndex).toBe(0);
    expect(options.fileHandle).toBeNull();
    expect(options.fileScope).toBe('workspace');
    expect(context.workspaceState.sessionFileHandle).toBeNull();
    expect(context.workspaceState.sessionFileScope).toBe('workspace');
    expect(context.workspaceState.sessionFileName).toBe('workspace.graph');
    expect(markSessionDirty).toHaveBeenCalledTimes(0);
    expect(result.loadMode).toBe('append');
    expect(result.tabCount).toBeGreaterThanOrEqual(1);
  });
});
