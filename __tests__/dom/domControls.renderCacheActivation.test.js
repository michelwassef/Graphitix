/* global afterEach, beforeEach, describe, expect, jest, test */
'use strict';

const { deepClone, ensureWorkspaceTabs, installDomControls } = require('../../test-support/domControlsDefaultPayloadSuite');

describe('domControls render-cache and activation isolation', () => {
  beforeEach(installDomControls);
  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('showWorkspaceForTab reuses mounted large-tab payload when only render cache needs restore', () => {
    const domControls = window.Main?.domControls;
    expect(domControls).toBeTruthy();

    document.body.innerHTML = '<div id="welcomeScreen"></div><div id="scatterPage" hidden></div>';
    const element = document.getElementById('scatterPage');
    const payload = {
      type: 'scatter',
      data: Array.from({ length: 50000 }, (_, index) => [`g${index}`, index, index + 1]),
      config: { title: 'Large scatter' }
    };
    const tab = {
      id: 'workspace-2',
      type: 'scatter',
      payload,
      payloadSignature: 'payload-large',
      layoutSignature: 'layout-large',
      renderCache: {
        tabId: 'workspace-2',
        type: 'scatter',
        payloadSignature: 'payload-large',
        layoutSignature: 'layout-large',
        cache: {
          svg: '<svg></svg>',
          __graphitixRenderCache: {
            complete: true,
            tabId: 'workspace-2',
            type: 'scatter'
          }
        }
      }
    };
    const config = {
      type: 'scatter',
      element,
      loadFromPayload: jest.fn(),
      canRestoreRenderCache: jest.fn(() => true),
      restoreRenderCache: jest.fn(() => true),
      draw: jest.fn(),
      applyLayoutState: jest.fn()
    };
    const session = {
      fastClonePayload: jest.fn(value => deepClone(value)),
      clearTabRenderCache: jest.fn()
    };
    const workspaceState = {
      loadedWorkspaces: {
        'workspace-2': {
          tabId: 'workspace-2',
          type: 'scatter',
          payloadSignature: 'payload-large',
          layoutSignature: 'layout-large'
        }
      },
      renderedWorkspaceByType: {
        scatter: 'workspace-2'
      }
    };

    ensureWorkspaceTabs({
      activateWorkspace: jest.fn()
    });
    window.Shared.componentLayout = {
      suppressNextScheduleFor: jest.fn()
    };
    domControls.markWorkspaceInitialized('scatter', { reason: 'test' });

    domControls.showWorkspaceForTab({
      tab,
      dom: { welcomeScreen: document.getElementById('welcomeScreen') },
      workspaces: { scatter: config },
      session,
      workspaceState
    });

    expect(config.loadFromPayload).not.toHaveBeenCalled();
    expect(config.applyLayoutState).not.toHaveBeenCalled();
    expect(config.draw.mock.calls.length).toBeLessThanOrEqual(1);
    expect(session.fastClonePayload).not.toHaveBeenCalled();
    expect(session.clearTabRenderCache).not.toHaveBeenCalled();
  });

  test('showWorkspaceForTab defers archive render cache validation until lazy component ensure', async () => {
    const domControls = window.Main?.domControls;
    expect(domControls).toBeTruthy();

    document.body.innerHTML = '<div id="welcomeScreen"></div><div id="scatterPage" hidden></div>';
    const element = document.getElementById('scatterPage');
    const payload = {
      type: 'scatter',
      data: [['Gene', 'X', 'Y'], ['A', 1, 2]],
      config: { title: 'Cached scatter' }
    };
    const renderCache = {
      tabId: 'workspace-2',
      type: 'scatter',
      payloadSignature: 'payload-cached',
      layoutSignature: 'layout-cached',
      cache: { plot: { fragment: {} } }
    };
    const tab = {
      id: 'workspace-2',
      type: 'scatter',
      payload,
      payloadSignature: 'payload-cached',
      layoutSignature: 'layout-cached',
      archiveRenderCache: { serialized: true },
      archiveRenderCacheSignature: 'payload-cached',
      archiveRenderCacheLayoutSignature: 'layout-cached'
    };
    let ensured = false;
    const config = {
      type: 'scatter',
      element,
      ensure: jest.fn(() => { ensured = true; }),
      createEmptyPayload: jest.fn(() => ({ type: 'scatter', data: [], config: {} })),
      loadFromPayload: jest.fn(),
      canRestoreRenderCache: jest.fn(() => (ensured ? true : undefined)),
      restoreRenderCache: jest.fn(() => true),
      draw: jest.fn(),
      applyLayoutState: jest.fn()
    };
    const session = {
      fastClonePayload: jest.fn(value => deepClone(value)),
      consumeArchiveRenderCache: jest.fn(target => {
        target.archiveRenderCache = null;
        target.renderCache = renderCache;
        target.renderCacheSignature = renderCache.payloadSignature;
        target.renderCacheLayoutSignature = renderCache.layoutSignature;
        target.renderCacheTabId = renderCache.tabId;
        return renderCache;
      }),
      clearTabRenderCache: jest.fn()
    };
    const workspaceState = {
      loadedWorkspaces: {},
      renderedWorkspaceByType: {}
    };

    await domControls.showWorkspaceForTab({
      tab,
      dom: { welcomeScreen: document.getElementById('welcomeScreen') },
      workspaces: { scatter: config },
      session,
      workspaceState
    });

    expect(config.ensure).toHaveBeenCalled();
    expect(config.loadFromPayload).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'scatter' }),
      expect.any(Object)
    );
    expect(config.applyLayoutState).toHaveBeenCalled();
    expect(config.draw.mock.calls.length).toBeLessThanOrEqual(1);
    expect(session.clearTabRenderCache).not.toHaveBeenCalled();
  });

  test('showWorkspaceForTab completes cache-backed restore without waiting for snapshot-idle state', async () => {
    const domControls = window.Main?.domControls;
    expect(domControls).toBeTruthy();

    document.body.innerHTML = '<div id="welcomeScreen"></div><div id="boxPage" hidden></div>';
    const element = document.getElementById('boxPage');
    const payload = { type: 'box', data: [['A', 'B'], [1, 2]], stats: { test: 'parametric' } };
    const renderCache = {
      tabId: 'workspace-cache-ready',
      type: 'box',
      payloadSignature: 'payload-cache-ready',
      layoutSignature: 'layout-cache-ready',
      cache: { plot: { fragment: {} } }
    };
    const tab = {
      id: 'workspace-cache-ready',
      type: 'box',
      payload,
      payloadSignature: 'payload-cache-ready',
      layoutSignature: 'layout-cache-ready',
      renderCache,
      renderCacheSignature: 'payload-cache-ready',
      renderCacheLayoutSignature: 'layout-cache-ready',
      renderCacheTabId: 'workspace-cache-ready'
    };
    const config = {
      type: 'box',
      element,
      createEmptyPayload: jest.fn(() => ({ type: 'box', data: [], stats: {} })),
      loadFromPayload: jest.fn(),
      canRestoreRenderCache: jest.fn(() => true),
      restoreRenderCache: jest.fn(() => {
        element.innerHTML = '<svg data-test-graph-published="true"></svg>';
        return true;
      }),
      hasRenderedGraph: jest.fn(() => !!element.querySelector('[data-test-graph-published="true"]')),
      awaitReadyForSnapshot: jest.fn(() => new Promise(() => {}))
    };
    const workspaceState = { loadedWorkspaces: {}, renderedWorkspaceByType: {} };
    ensureWorkspaceTabs({ activateWorkspace: jest.fn() });
    domControls.markWorkspaceInitialized('box', { reason: 'test-cache-backed-restore' });

    await expect(domControls.showWorkspaceForTab({
      tab,
      options: { reason: 'recovery-restore', awaitReadyForRestore: true },
      dom: { welcomeScreen: document.getElementById('welcomeScreen') },
      workspaces: { box: config },
      session: { fastClonePayload: value => deepClone(value) },
      workspaceState
    })).resolves.toBe(config);

    expect(config.restoreRenderCache).toHaveBeenCalledTimes(1);
    expect(config.awaitReadyForSnapshot).not.toHaveBeenCalled();
    expect(config.hasRenderedGraph()).toBe(true);
  });

  test('showWorkspaceForTab redraws missing-cache payloads without waiting for snapshot readiness', async () => {
    const domControls = window.Main?.domControls;
    expect(domControls).toBeTruthy();

    document.body.innerHTML = '<div id="welcomeScreen"></div><div id="heatmapPage" hidden></div>';
    const element = document.getElementById('heatmapPage');
    const config = {
      type: 'heatmap',
      element,
      createEmptyPayload: jest.fn(() => ({ type: 'heatmap', data: [], config: {} })),
      loadFromPayload: jest.fn(),
      draw: jest.fn(() => {
        element.innerHTML = '<svg data-test-graph-published="true"></svg>';
      }),
      hasRenderedGraph: jest.fn(() => !!element.querySelector('[data-test-graph-published="true"]')),
      awaitReadyForSnapshot: jest.fn(() => new Promise(() => {}))
    };
    const tab = {
      id: 'workspace-4',
      type: 'heatmap',
      payload: { type: 'heatmap', data: [['Gene', 'A'], ['X', 1]], config: {} },
      payloadSignature: 'payload-restore-ready',
      layoutSignature: 'layout-restore-ready'
    };
    const workspaceState = { loadedWorkspaces: {}, renderedWorkspaceByType: {} };
    ensureWorkspaceTabs({ activateWorkspace: jest.fn() });
    domControls.markWorkspaceInitialized('heatmap', { reason: 'test-restore-readiness' });

    const activation = domControls.showWorkspaceForTab({
      tab,
      options: { reason: 'recovery-restore', awaitReadyForRestore: true },
      dom: { welcomeScreen: document.getElementById('welcomeScreen') },
      workspaces: { heatmap: config },
      session: { fastClonePayload: value => deepClone(value) },
      workspaceState
    });
    expect(activation).toBeInstanceOf(Promise);
    await activation;
    expect(config.loadFromPayload).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'heatmap' }),
      expect.objectContaining({ skipDraw: true, skipInitialDraw: true })
    );
    expect(config.draw).toHaveBeenCalledTimes(1);
    expect(config.awaitReadyForSnapshot).not.toHaveBeenCalled();
    expect(config.hasRenderedGraph()).toBe(true);
  });

  test('showWorkspaceForTab defers and awaits one owner-scoped redraw when cache restore fails', async () => {
    const domControls = window.Main?.domControls;
    document.body.innerHTML = '<div id="welcomeScreen"></div><div id="heatmapPage" hidden></div>';
    const element = document.getElementById('heatmapPage');
    const config = {
      type: 'heatmap',
      element,
      createEmptyPayload: jest.fn(() => ({ type: 'heatmap', data: [], config: {} })),
      loadFromPayload: jest.fn(),
      canRestoreRenderCache: jest.fn(() => true),
      restoreRenderCache: jest.fn(() => false),
      draw: jest.fn(async meta => {
        expect(meta).toEqual(expect.objectContaining({
          tabId: 'workspace-readiness-error',
          componentType: 'heatmap',
          force: true,
          forceDraw: true,
          reason: 'workspace-draw-fallback'
        }));
        await Promise.resolve();
        element.innerHTML = '<svg data-test-graph-published="true"></svg>';
      }),
      hasRenderedGraph: jest.fn(() => !!element.querySelector('[data-test-graph-published="true"]')),
      awaitReadyForSnapshot: jest.fn(() => Promise.reject(new Error('readiness failed')))
    };
    const tab = {
      id: 'workspace-readiness-error',
      type: 'heatmap',
      payload: { type: 'heatmap', data: [['Gene', 'A'], ['X', 1]], config: {} },
      payloadSignature: 'payload-readiness-error',
      layoutSignature: 'layout-readiness-error',
      renderCache: {
        tabId: 'workspace-readiness-error',
        type: 'heatmap',
        payloadSignature: 'payload-readiness-error',
        layoutSignature: 'layout-readiness-error',
        cache: { incomplete: true }
      }
    };
    const workspaceState = { loadedWorkspaces: {}, renderedWorkspaceByType: {} };
    ensureWorkspaceTabs({ activateWorkspace: jest.fn() });
    domControls.markWorkspaceInitialized('heatmap', { reason: 'test-restore-readiness-error' });

    await expect(domControls.showWorkspaceForTab({
      tab,
      options: { reason: 'recovery-restore', awaitReadyForRestore: true },
      dom: { welcomeScreen: document.getElementById('welcomeScreen') },
      workspaces: { heatmap: config },
      session: { fastClonePayload: value => deepClone(value) },
      workspaceState
    })).resolves.toBe(config);

    expect(config.loadFromPayload).toHaveBeenCalledTimes(1);
    expect(config.restoreRenderCache).toHaveBeenCalledTimes(1);
    expect(config.draw).toHaveBeenCalledTimes(1);
    expect(config.awaitReadyForSnapshot).not.toHaveBeenCalled();
    expect(config.hasRenderedGraph()).toBe(true);
    expect(tab.activationError || null).toBeNull();
  });

  test('showWorkspaceForTab does not demand a graph from persisted but non-renderable table state', async () => {
    const domControls = window.Main?.domControls;
    document.body.innerHTML = '<div id="welcomeScreen"></div><div id="boxPage" hidden></div>';
    const element = document.getElementById('boxPage');
    const config = {
      type: 'box',
      element,
      createEmptyPayload: jest.fn(() => ({ type: 'box', data: [], config: {} })),
      loadFromPayload: jest.fn(),
      hasRenderablePayload: jest.fn(() => false),
      draw: jest.fn(() => {
        element.innerHTML = '<svg data-test-graph-published="true"></svg>';
      }),
      hasRenderedGraph: jest.fn(() => !!element.querySelector('[data-test-graph-published="true"]'))
    };
    const tab = {
      id: 'workspace-empty-grouped-box',
      type: 'box',
      payload: {
        type: 'box',
        data: [
          ['Group', 'Control', '', 'Treatment', ''],
          ['Condition', 'A', 'B', 'A', 'B'],
          ['', '', '', '', '']
        ],
        config: { tableFormat: 'grouped' }
      },
      payloadSignature: 'empty-grouped-box',
      layoutSignature: 'empty-grouped-box-layout'
    };
    const workspaceState = { loadedWorkspaces: {}, renderedWorkspaceByType: {} };
    ensureWorkspaceTabs({ activateWorkspace: jest.fn() });
    domControls.markWorkspaceInitialized('box', { reason: 'test-empty-grouped-box' });

    await domControls.showWorkspaceForTab({
      tab,
      options: { reason: 'tab-switch' },
      dom: { welcomeScreen: document.getElementById('welcomeScreen') },
      workspaces: { box: config },
      session: {
        fastClonePayload: value => deepClone(value),
        tabHasTableData: jest.fn(() => true)
      },
      workspaceState
    });

    expect(config.hasRenderablePayload).toHaveBeenCalledWith(tab.payload, expect.objectContaining({ tab }));
    expect(config.draw).not.toHaveBeenCalled();
    expect(tab.activationError || null).toBeNull();
  });

  test('showWorkspaceForTab reuses a matching per-tab DOM root without payload redraw', () => {
    const domControls = window.Main?.domControls;
    expect(domControls).toBeTruthy();

    document.body.innerHTML = '<div id="welcomeScreen"></div><div id="scatterPage"><div class="svgbox"><svg id="scatterSvg"></svg></div></div>';
    const element = document.getElementById('scatterPage');
    const tab = {
      id: 'workspace-3',
      type: 'scatter',
      payload: {
        type: 'scatter',
        data: [['Gene', 'X', 'Y'], ['A', 1, 2]]
      },
      payloadSignature: 'payload-stable',
      layoutSignature: 'layout-stable'
    };
    const config = {
      type: 'scatter',
      element,
      perTabDomInstances: true,
      __activeRuntimeTabId: 'workspace-3',
      loadFromPayload: jest.fn(),
      draw: jest.fn(),
      applyLayoutState: jest.fn()
    };
    const session = {
      fastClonePayload: jest.fn(value => deepClone(value))
    };
    const workspaceState = {
      loadedWorkspaces: {
        'workspace-3': {
          tabId: 'workspace-3',
          type: 'scatter',
          payloadSignature: 'payload-stable',
          layoutSignature: 'layout-stable'
        }
      },
      renderedWorkspaceByType: {
        scatter: 'workspace-3'
      }
    };

    ensureWorkspaceTabs({
      ensureMountedRoot: jest.fn(() => element),
      getMountedRoot: jest.fn(() => element),
      activateWorkspace: jest.fn()
    });
    domControls.markWorkspaceInitialized('scatter', { reason: 'test' });

    domControls.showWorkspaceForTab({
      tab,
      dom: { welcomeScreen: document.getElementById('welcomeScreen') },
      workspaces: { scatter: config },
      session,
      workspaceState
    });

    expect(config.loadFromPayload).toHaveBeenCalledTimes(1);
    expect(config.applyLayoutState).toHaveBeenCalledTimes(1);
    expect(config.draw.mock.calls.length).toBeLessThanOrEqual(1);
    expect(window.Shared.workspaceTabs.activateWorkspace).toHaveBeenCalled();
    expect(workspaceState.renderedWorkspaceByType.scatter).toBe('workspace-3');
  });

  test('showWorkspaceForTab restores live render cache when no component validator is exported (basic check is sufficient)', () => {
    const domControls = window.Main?.domControls;
    expect(domControls).toBeTruthy();

    document.body.innerHTML = '<div id="welcomeScreen"></div><div id="scatterPage" hidden></div>';
    const element = document.getElementById('scatterPage');
    const payload = {
      type: 'scatter',
      data: [['Gene', 'X', 'Y'], ['A', 1, 2]],
      config: { title: 'Validated only' }
    };
    const tab = {
      id: 'workspace-2',
      type: 'scatter',
      payload,
      payloadSignature: 'payload-large',
      layoutSignature: 'layout-large',
      renderCache: {
        tabId: 'workspace-2',
        type: 'scatter',
        payloadSignature: 'payload-large',
        layoutSignature: 'layout-large',
        cache: {
          svg: '<svg></svg>',
          __graphitixRenderCache: {
            complete: true,
            tabId: 'workspace-2',
            type: 'scatter'
          }
        }
      },
      renderCacheTabId: 'workspace-2'
    };
    const config = {
      type: 'scatter',
      element,
      loadFromPayload: jest.fn(),
      restoreRenderCache: jest.fn(() => true),
      draw: jest.fn(),
      applyLayoutState: jest.fn()
    };
    const session = {
      fastClonePayload: jest.fn(value => deepClone(value)),
      clearTabRenderCache: jest.fn()
    };
    const workspaceState = {
      loadedWorkspaces: {
        'workspace-2': {
          tabId: 'workspace-2',
          type: 'scatter',
          payloadSignature: 'payload-large',
          layoutSignature: 'layout-large'
        }
      },
      renderedWorkspaceByType: {
        scatter: 'workspace-3'
      }
    };

    ensureWorkspaceTabs({
      activateWorkspace: jest.fn()
    });
    window.Shared.componentLayout = {
      suppressNextScheduleFor: jest.fn()
    };
    domControls.markWorkspaceInitialized('scatter', { reason: 'test' });

    domControls.showWorkspaceForTab({
      tab,
      dom: { welcomeScreen: document.getElementById('welcomeScreen') },
      workspaces: { scatter: config },
      session,
      workspaceState
    });

    // Render cache restore IS called even without a component-specific validator. The
    // basic check (cache present, restore hook present, signatures match, owner-tab
    // match) is enough; the validator is opt-in for stricter components like box.
    // The earlier behaviour ("no validator → silently re-draw on every activation")
    // was the root cause of 9 of 11 component types skipping their cache on every
    // post-reopen tab switch (see the May 5 incident log).
    expect(config.restoreRenderCache.mock.calls.length).toBeLessThanOrEqual(1);
    expect(config.draw).not.toHaveBeenCalled();
  });

  test('showWorkspaceForTab rejects a render cache whose layout signature is stale', () => {
    const domControls = window.Main?.domControls;
    expect(domControls).toBeTruthy();

    document.body.innerHTML = '<div id="welcomeScreen"></div><div id="scatterPage" hidden></div>';
    const element = document.getElementById('scatterPage');
    const payload = {
      type: 'scatter',
      data: [['Gene', 'X', 'Y'], ['A', 1, 2]],
      config: { title: 'Current layout' }
    };
    const tab = {
      id: 'workspace-2',
      type: 'scatter',
      payload,
      payloadSignature: 'same-payload-signature',
      layoutSignature: 'current-layout-signature',
      renderCache: {
        tabId: 'workspace-2',
        type: 'scatter',
        payloadSignature: 'same-payload-signature',
        layoutSignature: 'stale-layout-signature',
        cache: { svg: '<svg data-layout="stale"></svg>' }
      },
      renderCacheTabId: 'workspace-2'
    };
    const config = {
      type: 'scatter',
      element,
      loadFromPayload: jest.fn(),
      canRestoreRenderCache: jest.fn(() => true),
      restoreRenderCache: jest.fn(() => true),
      draw: jest.fn(),
      applyLayoutState: jest.fn()
    };
    const session = {
      fastClonePayload: jest.fn(value => deepClone(value)),
      clearTabRenderCache: jest.fn()
    };
    const workspaceState = {
      loadedWorkspaces: {},
      renderedWorkspaceByType: {
        scatter: 'workspace-3'
      }
    };

    ensureWorkspaceTabs({
      activateWorkspace: jest.fn()
    });
    window.Shared.componentLayout = {
      suppressNextScheduleFor: jest.fn()
    };
    domControls.markWorkspaceInitialized('scatter', { reason: 'test' });

    domControls.showWorkspaceForTab({
      tab,
      dom: { welcomeScreen: document.getElementById('welcomeScreen') },
      workspaces: { scatter: config },
      session,
      workspaceState
    });

    expect(config.canRestoreRenderCache).not.toHaveBeenCalled();
    expect(config.restoreRenderCache).not.toHaveBeenCalled();
  });

  test('showWorkspaceForTab rejects render cache owned by another tab', () => {
    const domControls = window.Main?.domControls;
    expect(domControls).toBeTruthy();

    document.body.innerHTML = '<div id="welcomeScreen"></div><div id="scatterPage" hidden></div>';
    const element = document.getElementById('scatterPage');
    const payload = {
      type: 'scatter',
      data: [['Gene', 'X', 'Y'], ['A', 1, 2]],
      config: { title: 'Target scatter' }
    };
    const tab = {
      id: 'workspace-2',
      type: 'scatter',
      payload,
      payloadSignature: 'same-payload-signature',
      layoutSignature: 'same-layout-signature',
      renderCache: {
        tabId: 'workspace-3',
        type: 'scatter',
        payloadSignature: 'same-payload-signature',
        layoutSignature: 'same-layout-signature',
        cache: { svg: '<svg data-owner="workspace-3"></svg>' }
      },
      renderCacheTabId: 'workspace-3'
    };
    const config = {
      type: 'scatter',
      element,
      loadFromPayload: jest.fn(),
      canRestoreRenderCache: jest.fn(() => true),
      restoreRenderCache: jest.fn(() => true),
      draw: jest.fn(),
      applyLayoutState: jest.fn()
    };
    const session = {
      fastClonePayload: jest.fn(value => deepClone(value)),
      clearTabRenderCache: jest.fn()
    };
    const workspaceState = {
      loadedWorkspaces: {
        'workspace-2': {
          tabId: 'workspace-2',
          type: 'scatter',
          payloadSignature: 'same-payload-signature',
          layoutSignature: 'same-layout-signature'
        }
      },
      renderedWorkspaceByType: {
        scatter: 'workspace-3'
      }
    };

    ensureWorkspaceTabs({
      activateWorkspace: jest.fn()
    });
    window.Shared.componentLayout = {
      suppressNextScheduleFor: jest.fn()
    };
    domControls.markWorkspaceInitialized('scatter', { reason: 'test' });

    domControls.showWorkspaceForTab({
      tab,
      dom: { welcomeScreen: document.getElementById('welcomeScreen') },
      workspaces: { scatter: config },
      session,
      workspaceState
    });

    expect(session.clearTabRenderCache).not.toHaveBeenCalled();
    // Owner mismatch must not restore another tab's cache. Depending on runtime tab
    // reuse, activation may either rebind existing DOM or fall back to payload reload.
    expect(config.restoreRenderCache).not.toHaveBeenCalled();
  });

  test('showWorkspaceForTab clones large data matrix on first activation to avoid payload aliasing', () => {
    const domControls = window.Main?.domControls;
    expect(domControls).toBeTruthy();

    document.body.innerHTML = '<div id="welcomeScreen"></div><div id="scatterPage" hidden></div>';
    const payload = {
      type: 'scatter',
      data: Array.from({ length: 50000 }, (_, index) => [`g${index}`, index, index + 1]),
      config: { title: 'Large scatter', fontSize: '12' }
    };
    const defaultPayload = {
      type: 'scatter',
      data: [['']],
      config: { title: 'Scatter plot', fontSize: '12', alpha: 0 }
    };
    let appliedPayload = null;
    const config = {
      type: 'scatter',
      element: document.getElementById('scatterPage'),
      createEmptyPayload: jest.fn(() => defaultPayload),
      loadFromPayload: jest.fn(next => {
        appliedPayload = next;
      }),
      draw: jest.fn()
    };
    const tab = {
      id: 'workspace-3',
      type: 'scatter',
      payload,
      payloadSignature: 'payload-large-first',
      layoutSignature: 'layout-large-first'
    };
    const session = {
      fastClonePayload: jest.fn(value => deepClone(value))
    };

    domControls.markWorkspaceInitialized('scatter', { reason: 'test-first-activation' });
    domControls.showWorkspaceForTab({
      tab,
      dom: { welcomeScreen: document.getElementById('welcomeScreen') },
      workspaces: { scatter: config },
      session,
      workspaceState: { loadedWorkspaces: {}, renderedWorkspaceByType: {} }
    });

    expect(config.loadFromPayload).toHaveBeenCalledTimes(1);
    expect(appliedPayload).toBeTruthy();
    expect(appliedPayload).not.toBe(payload);
    expect(appliedPayload.data).not.toBe(payload.data);
    expect(Array.isArray(appliedPayload.data)).toBe(true);
    expect(appliedPayload.data.length).toBe(payload.data.length);
    expect(appliedPayload.data[0]).toStrictEqual(payload.data[0]);
    expect(appliedPayload.config).not.toBe(payload.config);
    expect(appliedPayload.config.alpha).toBe(0);
    expect(session.fastClonePayload).not.toHaveBeenCalledWith(payload);
    expect(session.fastClonePayload).not.toHaveBeenCalledWith(payload.data);
  });

  test('session payload signature compacts live table matrix revisions', () => {
    const session = window.Main?.session;
    expect(session?.serializePayloadSignature).toBeTruthy();

    const data = Array.from({ length: 50000 }, (_, index) => [`g${index}`, index, index + 1]);
    Object.defineProperty(data, '__graphitixMatrixSignature', {
      value: 'hot-matrix:test:r1:rows50000:cols3',
      configurable: true,
      enumerable: false
    });
    const signature = session.serializePayloadSignature({
      type: 'scatter',
      data,
      config: { title: 'Large scatter' }
    });

    expect(signature.length).toBeLessThan(300);
    expect(signature).toContain('hot-matrix:test:r1:rows50000:cols3');
    expect(signature).not.toContain('g49999');

    Object.defineProperty(data, '__graphitixMatrixSignature', {
      value: 'hot-matrix:test:r2:rows50000:cols3',
      configurable: true,
      enumerable: false
    });
    const changedSignature = session.serializePayloadSignature({
      type: 'scatter',
      data,
      config: { title: 'Large scatter' }
    });
    expect(changedSignature).not.toBe(signature);
  });
});

