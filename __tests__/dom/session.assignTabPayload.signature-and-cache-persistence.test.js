'use strict';

const { createPayloadTabForSession, registerSessionAssignTabPayloadFixture } = require('../../test-support/sessionAssignTabPayloadTestSetup');

describe('session.assignTabPayload: signature and cache persistence', () => {

  let session;

  registerSessionAssignTabPayloadFixture(value => { session = value; });

  const createTabWithPayload = () => createPayloadTabForSession(session);

  test('serializePayloadSignature compacts large untagged data matrices to a short signature', () => {
    const sig = session.serializePayloadSignature;
    expect(typeof sig).toBe('function');
    // Build a 600-row × 5-col matrix (no __graphitixMatrixSignature property).
    const matrix = Array.from({ length: 600 }, (_, r) => [r, r * 2, r * 3, r + 0.5, `label${r}`]);
    const payload = { type: 'scatter', data: matrix, config: {} };
    const serialized = sig(payload);
    // Must not be a raw JSON dump of 600 rows — keep it well under 1 KB.
    expect(typeof serialized).toBe('string');
    expect(serialized.length).toBeLessThan(500);
    // Must contain the compact matrix placeholder, not raw array values.
    const parsed = JSON.parse(serialized);
    expect(parsed.data.__graphitixMatrixSignature).toMatch(/^\d+x\d+:[0-9a-f]+$/);
    expect(parsed.data.rows).toBe(600);
  });

  test('serializePayloadSignature compact signatures differ for distinct datasets', () => {
    const sig = session.serializePayloadSignature;
    const makeMatrix = (offset) =>
      Array.from({ length: 600 }, (_, r) => [r + offset, (r + offset) * 2]);
    const p1 = JSON.parse(sig({ data: makeMatrix(0) }));
    const p2 = JSON.parse(sig({ data: makeMatrix(1000) }));
    expect(p1.data.__graphitixMatrixSignature).not.toBe(p2.data.__graphitixMatrixSignature);
  });

  test('serializePayloadSignature passes small arrays through without compaction', () => {
    const sig = session.serializePayloadSignature;
    const matrix = [['A', 'B'], [1, 2], [3, 4]]; // only 3 rows, well under threshold
    const serialized = sig({ data: matrix });
    const parsed = JSON.parse(serialized);
    // Small matrix should be serialized as-is, not compacted.
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data).toEqual(matrix);
  });

  test('assignTabPayload invalidates render cache when payload provenance changes', () => {
    const tab = createTabWithPayload();
    tab.renderCache = {
      cache: { plot: { count: 5, fragment: null } },
      payloadSignature: 'sig-A',
      captureSequence: 42
    };
    tab.renderCacheSignature = 'sig-A';
    tab.archiveRenderCache = {
      __graphitixRenderCache: { tabId: tab.id, component: tab.type },
      plot: { count: 5 }
    };
    tab.archiveRenderCacheSignature = 'sig-A';
    tab.archiveRenderCacheLayoutSignature = 'layout-A';
    tab.payloadSignature = 'sig-A';

    const changed = session.assignTabPayload(
      tab,
      { type: 'box', data: [['updated']], config: {} },
      { reason: 'stats-computed' }
    );

    expect(changed).toBe(true);
    expect(tab.renderCache).toBeNull();
    expect(tab.renderCacheSignature).toBeNull();
    expect(tab.renderCacheLayoutSignature).toBeNull();
    expect(tab.renderCacheTabId).toBeNull();
    expect(tab.archiveRenderCache).toBeNull();
    expect(tab.archiveRenderCacheSignature).toBeNull();
    expect(tab.archiveRenderCacheLayoutSignature).toBeNull();
  });

  test('render-equivalent payload updates keep Cartesian cache provenance aligned', () => {
    const tab = createTabWithPayload();
    tab.layoutSignature = 'layout-A';
    const cartesian = {
      complete: true,
      owner: { tabId: tab.id, component: tab.type, generation: 4 },
      payloadSignature: 'sig-A',
      layoutSignature: 'layout-A'
    };
    tab.renderCache = {
      cache: {
        __graphitixRenderCache: { tabId: tab.id, component: tab.type, cartesianLayout: cartesian }
      },
      payloadSignature: 'sig-A',
      layoutSignature: 'layout-A'
    };
    tab.archiveRenderCache = {
      __graphitixRenderCache: { tabId: tab.id, component: tab.type, cartesianLayout: cartesian },
      payloadSignature: 'sig-A',
      layoutSignature: 'layout-A'
    };
    tab.payloadSignature = 'sig-A';
    tab.archiveRenderCacheSignature = 'sig-A';
    tab.archiveRenderCacheLayoutSignature = 'layout-A';

    session.assignTabPayload(
      tab,
      { type: 'box', data: [['updated']], config: {} },
      { reason: 'stats-computed', renderEquivalent: true }
    );

    expect(tab.renderCache.cache.__graphitixRenderCache.cartesianLayout.payloadSignature)
      .toBe(tab.payloadSignature);
    expect(tab.archiveRenderCache.__graphitixRenderCache.cartesianLayout.payloadSignature)
      .toBe(tab.payloadSignature);
    expect(tab.renderCache.cache.__graphitixRenderCache.cartesianLayout.layoutSignature)
      .toBe('layout-A');
  });

  test('completed render caches keep an archive-ready checkpoint after warm runtime pruning', () => {
    const tabs = Array.from({ length: 4 }, (_, index) => {
      const tab = createTabWithPayload();
      tab.layoutState = {
        version: 1,
        component: 'box',
        tabIndex: index
      };
      tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
      return tab;
    });
    const captureRenderCache = jest.fn(meta => ({
      plot: { count: 1, owner: meta.tabId },
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        tabId: meta.tabId,
        complete: true
      }
    }));
    const restoreRenderCache = jest.fn(() => true);
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => null),
          captureRenderCache,
          restoreRenderCache
        }
      }
    };

    tabs.forEach(tab => {
      session.workspaceState.activeTabId = tab.id;
      session.persistActiveTabState(tab, {
        reason: 'activate-switch',
        origin: 'lifecycle',
        snapshotKind: 'lifecycle-checkpoint',
        captureRenderCache: true
      });
    });

    const oldest = tabs[0];
    expect(captureRenderCache).toHaveBeenCalledTimes(4);
    expect(restoreRenderCache).toHaveBeenCalledTimes(4);
    expect(oldest.renderCache).toBeNull();
    expect(oldest.archiveRenderCache).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({ tabId: oldest.id, component: 'box' }),
      plot: expect.objectContaining({ owner: oldest.id })
    }));
    expect(oldest.archiveRenderCacheSignature).toBe(oldest.payloadSignature);
    expect(oldest.archiveRenderCacheLayoutSignature).toBe(oldest.layoutSignature);

    const restored = session.peekArchiveRenderCache(oldest, { reason: 'warm-prune-regression' });
    expect(restored).toEqual(expect.objectContaining({
      tabId: oldest.id,
      payloadSignature: oldest.payloadSignature,
      layoutSignature: oldest.layoutSignature,
      archiveBacked: true
    }));
    expect(restored.cache.plot.owner).toBe(oldest.id);
  });

  test('persistUserModifiedTabState marks user dirty and flushes mounted payload state', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    session.workspaceState.loadedWorkspaces[tab.id] = {
      tabId: tab.id,
      type: tab.type,
      payloadSignature: tab.payloadSignature,
      layoutSignature: tab.layoutSignature
    };
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({ type: 'box', data: [['flushed']], config: {} }))
        }
      }
    };

    const changed = session.persistUserModifiedTabState(tab, { reason: 'stats-controls-change' });

    expect(changed).toBe(true);
    expect(window.Main.components.registry.box.getPayload).toHaveBeenCalledTimes(1);
    expect(tab.payload.data).toEqual([['flushed']]);
    expect(tab.userModified).toBe(true);
    expect(tab.payloadDirty).toBe(false);
    expect(session.workspaceState.sessionUserDirty).toBe(true);
  });

});
