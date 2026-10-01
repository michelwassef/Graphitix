const { createSessionActionsSaveTestContext } = require('../../test-support/sessionActionsSaveSuite');

describe('sessionActions — render-cache serialization', () => {
  const { installSessionActions, createContext } = createSessionActionsSaveTestContext();

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

});

