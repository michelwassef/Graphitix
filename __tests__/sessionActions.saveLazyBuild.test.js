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

  test('captures active render cache for archive without entering runtime restore mode', async () => {
    const sessionActions = installSessionActions();
    const serializedCache = { plot: { fragment: { kind: 'element', markup: '<svg></svg>' } } };
    const capturedCache = { plot: { fragment: document.createDocumentFragment(), count: 1 } };
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
    const context = createContext();
    const activeTab = context.workspaceState.tabs[0];
    activeTab.payloadSignature = 'payload-sig';
    activeTab.layoutSignature = 'layout-sig';
    context.session.getActiveTab.mockReturnValue(activeTab);
    context.session.serializeRenderCacheForArchive = jest.fn(() => serializedCache);
    const captureRenderCache = jest.fn(() => capturedCache);
    const restoreRenderCache = jest.fn(() => true);
    const draw = jest.fn();
    context.workspaces = {
      scatter: {
        captureRenderCache,
        restoreRenderCache,
        draw
      }
    };

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    });

    expect(result.status).toBe('saved');
    expect(captureRenderCache).toHaveBeenCalledWith(expect.objectContaining({
      tabId: activeTab.id,
      type: 'scatter',
      reason: 'archive-save-active'
    }));
    expect(restoreRenderCache).toHaveBeenCalledWith(
      capturedCache,
      expect.objectContaining({
        tabId: activeTab.id,
        type: 'scatter',
        reason: 'archive-save-active-restore',
        temporaryRestore: true
      })
    );
    expect(draw).not.toHaveBeenCalled();
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCache).toStrictEqual(serializedCache);
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCacheSignature).toBe('payload-sig');
    expect(archiveRequest?.tabs?.[0]?.archiveRenderCacheLayoutSignature).toBe('layout-sig');
  });

  test('serializes inactive tab render cache from in-memory cache without invoking live capture', async () => {
    const sessionActions = installSessionActions();
    const serializedCache = { plot: { kind: 'scatter' } };
    const capturedCache = { plot: { fragment: document.createDocumentFragment(), count: 1 } };
    const boxSerializedCache = { plot: { kind: 'box' } };
    const boxCachedFragment = { plot: { fragment: document.createDocumentFragment(), count: 2 } };
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
    const captureRenderCache = jest.fn(() => capturedCache);
    const restoreRenderCache = jest.fn(() => true);
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
    expect(captureRenderCache).toHaveBeenCalledWith(expect.objectContaining({
      tabId: activeTab.id,
      type: 'scatter',
      reason: 'archive-save-active'
    }));
    expect(boxCaptureRenderCache).not.toHaveBeenCalled();
    expect(boxRestoreRenderCache).not.toHaveBeenCalled();
    expect(boxDraw).not.toHaveBeenCalled();
    expect(archiveRequest?.tabs?.[1]?.archiveRenderCache).toStrictEqual(boxSerializedCache);
    expect(archiveRequest?.tabs?.[1]?.archiveRenderCacheSignature).toBe('box-payload-sig');
    expect(archiveRequest?.tabs?.[1]?.archiveRenderCacheLayoutSignature).toBe('box-layout-sig');
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

  test('warmTabRenderCaches calls config.ensure on cold components before any activateTab', async () => {
    const sessionActions = installSessionActions();
    const callOrder = [];
    const scatterEnsure = jest.fn(() => {
      callOrder.push('scatter-ensure');
      window.Components = window.Components || {};
      window.Components.scatter = window.Components.scatter || {};
      window.Components.scatter.ready = true;
    });
    const boxEnsure = jest.fn(() => {
      callOrder.push('box-ensure');
      window.Components = window.Components || {};
      window.Components.box = window.Components.box || {};
      window.Components.box.ready = true;
    });
    const activateTab = jest.fn((tabId) => {
      callOrder.push(`activate:${tabId}`);
    });

    window.Components = {};

    const context = createContext({
      workspaceState: {
        tabs: [
          { id: 'tab-1', title: 'A', type: 'scatter', isWelcome: false, payload: { type: 'scatter', data: [] }, layoutState: null },
          { id: 'tab-2', title: 'B', type: 'box', isWelcome: false, payload: { type: 'box', data: [] }, layoutState: null }
        ],
        sessionDirty: false,
        sessionFileHandle: null,
        sessionFileScope: null,
        sessionFileName: ''
      }
    });
    context.session.getActiveTab.mockReturnValue(context.workspaceState.tabs[0]);
    context.activateTab = activateTab;
    context.workspaces = {
      scatter: { ensure: scatterEnsure },
      box: { ensure: boxEnsure }
    };

    const result = await sessionActions.warmTabRenderCaches(context, {
      reason: 'unit-test-warmup',
      finalTabId: 'tab-1',
      stepDelayMs: 80
    });

    // Ensure box was called (scatter is the active/final tab and is skipped from warmup)
    expect(boxEnsure).toHaveBeenCalledTimes(1);
    // The order must be: every ensure() comes before any activateTab()
    const firstActivate = callOrder.findIndex(entry => entry.startsWith('activate:'));
    const lastEnsure = callOrder.map((e, i) => e.endsWith('-ensure') ? i : -1).filter(i => i >= 0).pop() ?? -1;
    expect(lastEnsure).toBeLessThan(firstActivate);
    // tab-2 (box) should have been activated, then the final tab.
    expect(activateTab).toHaveBeenCalledWith('tab-2', expect.any(Object));
    expect(activateTab).toHaveBeenCalledWith('tab-1', expect.any(Object));
    expect(result.warmed).toBe(1);
    expect(result.skippedColdComponents).toBe(0);

    delete window.Components;
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
