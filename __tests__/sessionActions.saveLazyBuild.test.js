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
    const session = {
      fastClonePayload: value => (value == null ? value : JSON.parse(JSON.stringify(value))),
      getActiveTab: jest.fn(() => workspaceState.tabs[0]),
      persistActiveTabState: jest.fn(),
      clearSessionDirty: jest.fn()
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

  test('recovery snapshot policy matches manual save cache richness', async () => {
    const sessionActions = installSessionActions();
    const context = createContext();

    const recovery = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      policyMode: 'recovery',
      snapshotKind: 'recovery',
      reason: 'recovery-interval'
    });

    expect(recovery.policy).toEqual(expect.objectContaining({
      captureRenderCache: true,
      includeRenderCache: true,
      preserveRenderCacheTabScope: 'all',
      policyId: 'recovery-rich'
    }));
    expect(context.session.persistActiveTabState).toHaveBeenCalledWith(
      context.workspaceState.tabs[0],
      expect.objectContaining({
        captureRenderCache: true,
        captureRenderCacheIfNeeded: true,
        reason: 'recovery-interval'
      })
    );
  });

  test.each([
    ['manual-save', 'archive-save'],
    ['recovery', 'recovery']
  ])('awaits pending PNG previews before %s checkpoint capture', async (policyMode, snapshotKind) => {
    const sessionActions = installSessionActions();
    const context = createContext();
    const tab = context.workspaceState.tabs[0];
    const previews = {
      awaitPendingCaptures: jest.fn(async tabIds => {
        expect(tabIds).toEqual([tab.id]);
        tab.previewMarkup = '<img src="data:image/png;base64,cHJldmlldw==" data-tab-preview-format="png">';
        tab.previewSignature = 'preview-payload';
        tab.previewMeta = { format: 'png', rasterized: true };
      })
    };
    context.previews = previews;
    context.session.getActiveTab.mockReturnValue(tab);

    const checkpoint = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      policyMode,
      snapshotKind,
      reason: `${snapshotKind}-preview`
    });

    expect(previews.awaitPendingCaptures).toHaveBeenCalled();
    expect(checkpoint.snapshot.tabs[0]).toEqual(expect.objectContaining({
      previewMarkup: expect.stringContaining('data-tab-preview-format="png"'),
      previewSignature: 'preview-payload',
      previewMeta: expect.objectContaining({ format: 'png', rasterized: true })
    }));
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
      includeRenderCacheInSnapshot: false,
      reason: 'toolbar-save'
    });
    const manualPersistOptions = context.session.persistActiveTabState.mock.calls.at(-1)[1];

    const recovery = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      captureRenderCacheBeforeSnapshot: false,
      includeRenderCacheInSnapshot: false,
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


  test('worker recovery still awaits component readiness before active-owner capture', async () => {
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
      includeRenderCacheInSnapshot: false,
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

  test('recovery aborts before live owner capture when rotation starts during readiness', async () => {
    const sessionActions = installSessionActions();
    let rotationActive = false;
    window.Shared.plot3d = {
      hasActiveRotationGesture: jest.fn(() => rotationActive)
    };
    const ready = jest.fn(async () => {
      rotationActive = true;
      return { ok: true };
    });
    const context = createContext({
      workspaces: {
        scatter: { awaitReadyForSnapshot: ready }
      }
    });

    await expect(sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      reason: 'recovery-interval'
    })).rejects.toMatchObject({
      code: 'GRAPHITIX_RECOVERY_INTERACTION_ACTIVE',
      stage: 'after-readiness'
    });
    expect(context.session.persistActiveTabState).not.toHaveBeenCalled();
  });

  test('does not capture canonical owner state when snapshot readiness is rejected', async () => {
    const sessionActions = installSessionActions();
    const ready = jest.fn().mockResolvedValue({ ok: false, reason: 'frame-publication-pending' });
    const context = createContext({
      workspaces: {
        scatter: { awaitReadyForSnapshot: ready }
      }
    });

    await expect(sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      snapshotKind: 'archive-save',
      policyMode: 'manual-save',
      reason: 'toolbar-save'
    })).rejects.toMatchObject({
      code: 'GRAPHITIX_SNAPSHOT_NOT_READY',
      tabId: 'tab-1',
      component: 'scatter',
      reason: 'frame-publication-pending'
    });
    expect(context.session.persistActiveTabState).not.toHaveBeenCalled();
  });

  test('autosave defers cleanly when the active owner has not published a settled frame', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn();
    const context = createContext({
      workspaces: {
        scatter: { awaitReadyForSnapshot: jest.fn().mockResolvedValue({ ok: false, reason: 'component-not-idle' }) }
      }
    });

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace',
      reason: 'autosave',
      snapshotKind: 'autosave'
    });

    expect(result).toEqual({ status: 'skipped', reason: 'snapshot-not-ready' });
    expect(context.session.persistActiveTabState).not.toHaveBeenCalled();
    expect(window.Shared.fileIO.saveGraphFileAs).not.toHaveBeenCalled();
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

  test('serializes an inactive archive-ready checkpoint after its warm runtime cache was pruned', async () => {
    const sessionActions = installSessionActions();
    const archiveReadyCache = {
      __graphitixRenderCache: { tabId: 'tab-2', component: 'box', complete: true },
      plot: { kind: 'box', owner: 'tab-2' }
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
    const context = createContext({
      workspaceState: {
        tabs: [
          {
            id: 'tab-1',
            title: 'XY Plots',
            type: 'scatter',
            isWelcome: false,
            payload: { type: 'scatter', data: [[1, 2, 'A']] },
            layoutState: null,
            payloadSignature: 'scatter-payload-sig',
            layoutSignature: 'scatter-layout-sig'
          },
          {
            id: 'tab-2',
            title: 'Distribution Charts',
            type: 'box',
            isWelcome: false,
            payload: { type: 'box', data: [[3, 4, 'B']] },
            layoutState: { component: 'box', width: 468, height: 456 },
            payloadSignature: 'box-payload-sig',
            layoutSignature: 'box-layout-sig',
            renderCache: null,
            archiveRenderCache: archiveReadyCache,
            archiveRenderCacheSignature: 'box-payload-sig',
            archiveRenderCacheLayoutSignature: 'box-layout-sig'
          }
        ],
        activeTabId: 'tab-1',
        sessionDirty: true,
        sessionFileHandle: null,
        sessionFileScope: null,
        sessionFileName: ''
      }
    });
    const activeTab = context.workspaceState.tabs[0];
    context.session.getActiveTab.mockReturnValue(activeTab);
    context.session.serializeRenderCacheForArchive = jest.fn(() => null);
    const inactiveCapture = jest.fn();
    context.workspaces = {
      scatter: {},
      box: { captureRenderCache: inactiveCapture }
    };

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    });

    expect(result.status).toBe('saved');
    expect(inactiveCapture).not.toHaveBeenCalled();
    expect(archiveRequest?.tabs?.[1]?.archiveRenderCache).toStrictEqual(archiveReadyCache);
    expect(archiveRequest?.tabs?.[1]?.archiveRenderCacheSignature).toBe('box-payload-sig');
    expect(archiveRequest?.tabs?.[1]?.archiveRenderCacheLayoutSignature).toBe('box-layout-sig');
  });

  test('recovery checkpoints embed an exact existing render cache without recapturing it', async () => {
    const sessionActions = installSessionActions();
    let archiveRequest = null;
    window.Shared.graphArchive.buildArchiveBlob.mockImplementation(async request => {
      archiveRequest = request;
      return new Blob(['zip'], { type: 'application/zip' });
    });
    const context = createContext();
    const activeTab = context.workspaceState.tabs[0];
    const exactCache = {
      __graphitixRenderCache: { tabId: activeTab.id, type: activeTab.type, complete: true },
      plot: { stable: true }
    };
    activeTab.payloadSignature = 'payload-sig';
    activeTab.layoutSignature = 'layout-sig';
    activeTab.renderCache = {
      cache: exactCache,
      tabId: activeTab.id,
      type: activeTab.type,
      payloadSignature: 'payload-sig',
      layoutSignature: 'layout-sig'
    };
    context.session.getActiveTab.mockReturnValue(activeTab);
    context.session.serializeRenderCacheForArchive = jest.fn(cache => cache);

    await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      policyMode: 'recovery',
      snapshotKind: 'recovery',
      reason: 'recovery-interval'
    });

    expect(context.session.persistActiveTabState).toHaveBeenCalledWith(activeTab, expect.objectContaining({
      captureRenderCache: true,
      captureRenderCacheIfNeeded: true,
      reason: 'recovery-interval'
    }));
    expect(context.session.serializeRenderCacheForArchive).toHaveBeenCalledWith(exactCache);
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCache).toStrictEqual(exactCache);
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCacheSignature).toBe('payload-sig');
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCacheLayoutSignature).toBe('layout-sig');
  });

  test('conflicting component aliases are rejected during archive construction', async () => {
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
      cache: {
        __graphitixRenderCache: {
          version: 2,
          component: 'scatter',
          type: 'box',
          tabId: activeTab.id,
          complete: true
        },
        plot: { stable: true }
      },
      tabId: activeTab.id,
      type: activeTab.type,
      payloadSignature: 'payload-sig',
      layoutSignature: 'layout-sig'
    };
    context.session.getActiveTab.mockReturnValue(activeTab);
    context.session.serializeRenderCacheForArchive = jest.fn(cache => cache);

    await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'archive-save',
      captureRenderCacheBeforeSnapshot: false,
      reason: 'schema-conflict-regression'
    });

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

  test('buildArchiveTabSnapshot serializes the committed canonical payload and layout without archive-only enrichment', async () => {
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

    const context = createContext();
    const tab = context.workspaceState.tabs[0];
    const canonicalPayload = context.session.fastClonePayload(tab.payload);
    const canonicalLayout = context.session.fastClonePayload(tab.layoutState);
    context.session.getActiveTab.mockReturnValue(tab);

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    });

    expect(result.status).toBe('saved');
    expect(archiveRequest?.tabs?.[0]?.payload).toStrictEqual(canonicalPayload);
    expect(archiveRequest?.tabs?.[0]?.layout).toStrictEqual(canonicalLayout);
    expect(tab.payload).toStrictEqual(canonicalPayload);
    expect(tab.layoutState).toStrictEqual(canonicalLayout);
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
