'use strict';

const { createPayloadTabForSession, registerSessionAssignTabPayloadFixture } = require('../../test-support/sessionAssignTabPayloadTestSetup');

describe('session.assignTabPayload: cache capture', () => {

  let session;

  registerSessionAssignTabPayloadFixture(value => { session = value; });

  const createTabWithPayload = () => createPayloadTabForSession(session);

  test('archive save keeps a clean loaded tab authoritative without reading live component state', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    session.workspaceState.activeTabId = tab.id;
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({ type: 'box', data: [['corrupt-live']], config: {} }))
        }
      }
    };

    const changed = session.persistActiveTabState(tab, { reason: 'archive-save' });

    expect(changed).toBe(false);
    expect(window.Main.components.registry.box.getPayload).not.toHaveBeenCalled();
    expect(tab.payload.data).toEqual([['Lib1', 'Lib2'], [180, 109], [337, 204]]);
  });

  test('render-cache capture always restores live DOM when cache normalization fails', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    session.workspaceState.activeTabId = tab.id;
    const captured = {};
    Object.defineProperty(captured, '__graphitixRenderCache', {
      configurable: true,
      get() {
        throw new Error('synthetic cache normalization failure');
      }
    });
    const restoreRenderCache = jest.fn(() => true);
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          captureRenderCache: jest.fn(() => captured),
          restoreRenderCache
        }
      }
    };

    expect(() => session.persistActiveTabState(tab, {
      reason: 'archive-save-cache-safety',
      origin: 'lifecycle',
      captureRenderCache: true,
      snapshotIntent: {
        captureLivePayload: false,
        skipLivePayloadCapture: true,
        allowSkipLivePayloadCapture: true,
        lifecycleSnapshot: true,
        reasonSkippable: true
      }
    })).not.toThrow();

    expect(window.Main.components.registry.box.captureRenderCache).toHaveBeenCalledTimes(1);
    expect(restoreRenderCache).toHaveBeenCalledWith(
      expect.objectContaining({
        __graphitixRenderCache: expect.objectContaining({
          version: 2,
          component: 'box',
          type: 'box',
          tabId: tab.id,
          complete: true,
          rollbackOnly: true
        })
      }),
      expect.objectContaining({
        tabId: tab.id,
        restoreLiveAfterCapture: true,
        rollbackOnly: true,
        skipStateMutation: true
      })
    );
    expect(captured).toEqual({});
    expect(tab.renderCache).toBeNull();
  });

  test.each([
    ['wrong owner', { version: 2, component: 'box', type: 'box', tabId: 'workspace-other', complete: true }],
    ['wrong component', { version: 2, component: 'scatter', type: 'scatter', tabId: null, complete: true }],
    ['conflicting component aliases', { version: 2, component: 'box', type: 'scatter', tabId: null, complete: true }],
    ['missing owner', { version: 2, component: 'box', type: 'box', tabId: null, complete: true, omitOwner: true }],
    ['missing component', { version: 2, tabId: null, complete: true }],
    ['incomplete cache', { version: 2, component: 'box', type: 'box', tabId: null, complete: false }],
    ['missing metadata', null]
  ])('rejects %s before render-cache normalization and rolls detached DOM back only', (_label, metadataTemplate) => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = { version: 1, component: 'box', width: 468, height: 456 };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    session.workspaceState.activeTabId = tab.id;

    const existingArchive = {
      plot: { count: 1, owner: tab.id },
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        tabId: tab.id,
        complete: true
      }
    };
    tab.archiveRenderCache = existingArchive;
    tab.archiveRenderCacheSignature = tab.payloadSignature;
    tab.archiveRenderCacheLayoutSignature = tab.layoutSignature;

    const rawCache = { plot: { count: 1, owner: 'captured-dom' } };
    if (metadataTemplate) {
      const { omitOwner, ...metadata } = metadataTemplate;
      rawCache.__graphitixRenderCache = {
        ...metadata,
        ...(omitOwner ? {} : { tabId: metadataTemplate.tabId || tab.id })
      };
    }
    const rawSnapshot = JSON.parse(JSON.stringify(rawCache));
    const restoreRenderCache = jest.fn(() => true);
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          captureRenderCache: jest.fn(() => rawCache),
          restoreRenderCache
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'capture-provenance-regression',
      origin: 'lifecycle',
      captureRenderCache: true,
      snapshotIntent: {
        captureLivePayload: false,
        skipLivePayloadCapture: true,
        allowSkipLivePayloadCapture: true,
        lifecycleSnapshot: true,
        reasonSkippable: true
      }
    });

    expect(rawCache).toEqual(rawSnapshot);
    expect(tab.renderCache).toBeNull();
    expect(tab.archiveRenderCache).toBe(existingArchive);
    expect(tab.archiveRenderCacheSignature).toBe(tab.payloadSignature);
    expect(tab.archiveRenderCacheLayoutSignature).toBe(tab.layoutSignature);
    expect(restoreRenderCache).toHaveBeenCalledTimes(1);
    expect(restoreRenderCache.mock.calls[0][0]).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({
        version: 2,
        component: 'box',
        type: 'box',
        tabId: tab.id,
        complete: true,
        rollbackOnly: true
      })
    }));
    expect(restoreRenderCache.mock.calls[0][1]).toEqual(expect.objectContaining({
      tabId: tab.id,
      rollbackOnly: true,
      restoreLiveAfterCapture: true,
      skipStateMutation: true
    }));
  });

  test('stores a valid component-owned cache without rewriting its provenance', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = { version: 1, component: 'box', width: 468, height: 456 };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    session.workspaceState.activeTabId = tab.id;
    const rawCache = {
      plot: { count: 1, owner: tab.id },
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        tabId: tab.id,
        complete: true,
        componentOwnedMarker: 'preserve-me'
      }
    };
    const rawSnapshot = JSON.parse(JSON.stringify(rawCache));
    const restoreRenderCache = jest.fn(() => true);
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          captureRenderCache: jest.fn(() => rawCache),
          restoreRenderCache
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'valid-capture-provenance-regression',
      origin: 'lifecycle',
      captureRenderCache: true,
      snapshotIntent: {
        captureLivePayload: false,
        skipLivePayloadCapture: true,
        allowSkipLivePayloadCapture: true,
        lifecycleSnapshot: true,
        reasonSkippable: true
      }
    });

    expect(rawCache).toEqual(rawSnapshot);
    expect(tab.renderCache?.cache?.__graphitixRenderCache).toEqual(expect.objectContaining({
      version: 2,
      component: 'box',
      type: 'box',
      tabId: tab.id,
      complete: true,
      componentOwnedMarker: 'preserve-me'
    }));
    expect(tab.archiveRenderCache?.__graphitixRenderCache).toEqual(expect.objectContaining({
      version: 2,
      component: 'box',
      type: 'box',
      tabId: tab.id,
      complete: true,
      componentOwnedMarker: 'preserve-me'
    }));
    expect(restoreRenderCache.mock.calls[0][0].__graphitixRenderCache.rollbackOnly).not.toBe(true);
  });

  test('does not replay a cache that explicitly preserved the mounted live DOM', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = { version: 1, component: 'box', width: 468, height: 456 };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    session.workspaceState.activeTabId = tab.id;
    const rawCache = {
      plot: { count: 1, owner: tab.id },
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        tabId: tab.id,
        complete: true
      }
    };
    Object.defineProperty(rawCache, '__graphitixLiveDomPreserved', { value: true });
    const restoreRenderCache = jest.fn(() => true);
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          captureRenderCache: jest.fn(() => rawCache),
          restoreRenderCache
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'read-only-capture-regression',
      origin: 'lifecycle',
      captureRenderCache: true,
      snapshotIntent: {
        captureLivePayload: false,
        skipLivePayloadCapture: true,
        allowSkipLivePayloadCapture: true,
        lifecycleSnapshot: true,
        reasonSkippable: true
      }
    });

    expect(restoreRenderCache).not.toHaveBeenCalled();
    expect(tab.renderCache?.cache?.__graphitixRenderCache).toEqual(expect.objectContaining({
      component: 'box',
      tabId: tab.id,
      complete: true
    }));
  });

  test('never captures the previously committed graph while a replacement frame is staged', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = false;
    tab.userModified = true;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = { version: 1, component: 'box', width: 468, height: 456 };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    tab.payloadVersion = 3;
    tab.layoutVersion = 2;
    tab.renderCommitVersion = 1;
    session.workspaceState.activeTabId = tab.id;

    window.Shared.framePublication = {
      hasStaged: jest.fn(() => true)
    };
    const captureRenderCache = jest.fn(() => ({
      plot: { count: 1, owner: tab.id },
      __graphitixRenderCache: {
        version: 2, component: 'box', type: 'box', tabId: tab.id, complete: true
      }
    }));
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          isIdleForSnapshot: jest.fn(() => true),
          hasRenderedGraph: jest.fn(() => true),
          captureRenderCache
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'replacement-frame-staged',
      origin: 'lifecycle',
      captureRenderCache: true
    });

    expect(window.Shared.framePublication.hasStaged).toHaveBeenCalled();
    expect(captureRenderCache).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
    expect(tab.renderCommitVersion).toBe(1);
  });

  test('manual-render pending state saves canonical payload without certifying a stale graph cache', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = false;
    tab.userModified = true;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = { version: 1, component: 'box', width: 468, height: 456 };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    tab.payloadVersion = 4;
    tab.layoutVersion = 2;
    tab.renderCommitVersion = 2;
    tab.renderCache = {
      cache: { plot: { count: 1 } },
      tabId: tab.id,
      type: 'box',
      payloadSignature: 'older-payload',
      layoutSignature: tab.layoutSignature
    };
    tab.archiveRenderCache = { plot: { count: 1 } };
    session.workspaceState.activeTabId = tab.id;

    const captureRenderCache = jest.fn(() => ({
      plot: { count: 1, owner: tab.id },
      __graphitixRenderCache: {
        version: 2, component: 'box', type: 'box', tabId: tab.id, complete: true
      }
    }));
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          isIdleForSnapshot: jest.fn(() => true),
          isRenderCacheCurrent: jest.fn(() => false),
          hasRenderedGraph: jest.fn(() => true),
          captureRenderCache
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'manual-render-pending',
      origin: 'lifecycle',
      captureRenderCache: true
    });

    expect(captureRenderCache).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
    expect(tab.archiveRenderCache).toBeNull();
    expect(tab.renderCommitVersion).toBe(2);
    expect(tab.payload).toBeTruthy();
  });

  test('captureRenderCacheIfNeeded reuses an exact archive-ready checkpoint', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = { version: 1, component: 'box', width: 468, height: 456 };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    tab.archiveRenderCache = {
      __graphitixRenderCache: { tabId: tab.id, component: tab.type, complete: true },
      plot: { owner: tab.id }
    };
    tab.archiveRenderCacheSignature = tab.payloadSignature;
    tab.archiveRenderCacheLayoutSignature = tab.layoutSignature;
    session.workspaceState.activeTabId = tab.id;
    const captureRenderCache = jest.fn();
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          captureRenderCache
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'recovery-interval',
      origin: 'lifecycle',
      captureRenderCache: true,
      captureRenderCacheIfNeeded: true,
      snapshotIntent: {
        captureLivePayload: false,
        skipLivePayloadCapture: true,
        allowSkipLivePayloadCapture: true,
        lifecycleSnapshot: true,
        reasonSkippable: true
      }
    });

    expect(captureRenderCache).not.toHaveBeenCalled();
    expect(tab.archiveRenderCache).toEqual(expect.objectContaining({
      plot: { owner: tab.id }
    }));
  });

  test('clean restored exact checkpoint preserves canonical layout during lifecycle deactivation', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = {
      version: 1,
      component: 'box',
      svgBox: {
        style: { width: '468px', height: '456px', maxHeight: 'none' },
        dataset: { workspaceTabId: tab.id, tabId: tab.id }
      }
    };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    tab.archiveRenderCache = {
      __graphitixRenderCache: { tabId: tab.id, component: tab.type, complete: true },
      plot: { owner: tab.id }
    };
    tab.archiveRenderCacheSignature = tab.payloadSignature;
    tab.archiveRenderCacheLayoutSignature = tab.layoutSignature;
    session.workspaceState.activeTabId = tab.id;
    const captureStateFor = jest.fn(() => ({
      version: 1,
      component: 'box',
      svgBox: { style: { width: '427px', height: '427px' }, dataset: {} }
    }));
    window.Shared.componentLayout = {
      captureStateFor,
      withTabLayoutOverrides: value => value
    };
    const captureRenderCache = jest.fn();
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          captureRenderCache
        }
      }
    };

    const beforeLayout = session.serializePayloadSignature(tab.layoutState);
    session.persistActiveTabState(tab, {
      reason: 'activate-switch',
      origin: 'lifecycle',
      captureRenderCache: true,
      captureRenderCacheIfNeeded: true,
      snapshotKind: 'lifecycle-checkpoint'
    });

    expect(captureStateFor).not.toHaveBeenCalled();
    expect(captureRenderCache).not.toHaveBeenCalled();
    expect(session.serializePayloadSignature(tab.layoutState)).toBe(beforeLayout);
    expect(tab.layoutSignature).toBe(beforeLayout);
    expect(tab.archiveRenderCacheLayoutSignature).toBe(beforeLayout);
  });

  test('authoritative live layout is not reverse-normalized from payload graph sizing', () => {
    const tab = createTabWithPayload();
    tab.userModified = true;
    tab.payloadDirty = true;
    session.workspaceState.activeTabId = tab.id;
    session.workspaceState.loadedWorkspaces[tab.id] = { tabId: tab.id, type: tab.type };
    const exactLayout = {
      version: 1,
      component: 'box',
      svgBox: {
        style: { width: '468px', height: '456px', maxWidth: 'none', maxHeight: 'none' },
        dataset: { workspaceTabId: tab.id, tabId: tab.id, resizerUnlimitedHeight: 'true' }
      }
    };
    window.Shared.componentLayout = {
      captureStateFor: jest.fn(() => exactLayout),
      withTabLayoutOverrides: value => value
    };
    const mergePayloadSizingIntoLayout = jest.fn(() => ({ corrupted: true }));
    window.Shared.graphSizing = {
      enrichPayloadWithLayout: jest.fn((_type, payload) => payload),
      mergePayloadSizingIntoLayout
    };
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({ type: 'box', data: [['live']], config: {} }))
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'archive-save',
      origin: 'user',
      snapshotIntent: { captureLivePayload: true }
    });

    expect(mergePayloadSizingIntoLayout).not.toHaveBeenCalled();
    expect(tab.layoutState).toEqual(exactLayout);
    expect(tab.layoutSignature).toBe(session.serializePayloadSignature(exactLayout));
  });

});
