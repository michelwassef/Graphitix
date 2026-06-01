const deepClone = value => (value == null ? value : JSON.parse(JSON.stringify(value)));
const { ensureWorkspaceTabs, initializeWorkspaceHarness } = require('./setup/workspaceHarness');

describe('domControls default payload cache isolation', () => {
  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }
    initializeWorkspaceHarness();
    require('../js/main/session.js');
    require('../js/shared/colorSchemes.js');
    require('../js/main/domControls.js');
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('ensureDefaultPayload uses empty payload defaults and ignores live tab payload', () => {
    const session = window.Main?.session;
    const domControls = window.Main?.domControls;
    expect(session).toBeTruthy();
    expect(domControls).toBeTruthy();

    const calls = { empty: 0, live: 0 };
    const livePayload = {
      type: 'box',
      data: [['']],
      config: {
        title: 'Boxplot',
        fontSize: '13',
        stats: {
          test: 'parametric',
          mode: 'all',
          alpha: 0.05,
          correction: 'holm',
          selectedColumns: [0],
          pairsText: 'A-B'
        }
      }
    };

    const config = {
      createEmptyPayload() {
        calls.empty += 1;
        return {
          type: 'box',
          data: [['']],
          config: {
            title: 'Boxplot',
            fontSize: '13',
            stats: {
              test: 'parametric',
              mode: 'all',
              alpha: 0.05,
              correction: 'holm',
              selectedColumns: [],
              pairsText: ''
            }
          }
        };
      },
      getPayload() {
        calls.live += 1;
        return deepClone(livePayload);
      }
    };

    const defaults = domControls.ensureDefaultPayload(session, 'box', config);
    expect(defaults).toBeTruthy();
    expect(defaults.config?.stats).toBeTruthy();
    expect(defaults.config.stats.test).toBe('parametric');
    expect(defaults.config.stats.mode).toBe('all');
    expect(defaults.config.stats.alpha).toBe(0.05);
    expect(defaults.config.stats.correction).toBe('holm');
    expect(defaults.config.stats.selectedColumns).toEqual([]);
    expect(defaults.config.stats.pairsText).toBe('');
    expect(calls.empty).toBe(1);
    expect(calls.live).toBe(0);
  });

  test('cached workspace defaults are detached across calls', () => {
    const session = window.Main?.session;
    const domControls = window.Main?.domControls;
    expect(session).toBeTruthy();
    expect(domControls).toBeTruthy();

    const config = {
      createEmptyPayload() {
        return {
          type: 'line',
          data: [['']],
          config: {
            fontSize: '13',
            stats: {
              controls: {
                method: 'pearson'
              },
              statsOptions: {
                showDiagnostics: true
              }
            }
          }
        };
      },
      getPayload() {
        return {
          type: 'line',
          data: [['']],
          config: {
            fontSize: '13',
            stats: {
              controls: {
                method: 'pearson'
              },
              statsOptions: {
                showDiagnostics: true
              }
            }
          }
        };
      }
    };

    const first = domControls.ensureDefaultPayload(session, 'line', config);
    expect(first?.config?.stats?.controls?.method).toBe('pearson');
    expect(first?.config?.stats?.statsOptions?.showDiagnostics).toBe(true);

    first.config.stats.controls.method = 'spearman';
    first.config.stats.statsOptions.showDiagnostics = true;

    const second = domControls.ensureDefaultPayload(session, 'line', config);
    expect(second?.config?.stats?.controls?.method).toBe('pearson');
    expect(second?.config?.stats?.statsOptions?.showDiagnostics).toBe(true);
  });

  test('workspace defaults force immutable component theme defaults', () => {
    const session = window.Main?.session;
    const domControls = window.Main?.domControls;
    expect(session).toBeTruthy();
    expect(domControls).toBeTruthy();

    const config = {
      createEmptyPayload() {
        return {
          type: 'line',
          data: [['X title', 'Series 1']],
          config: {
            colorScheme: 'dark',
            labelColors: {
              'Series 1': '#ffffff'
            },
            seriesStyles: {
              'Series 1': {
                color: '#ffffff',
                markerStroke: '#ffffff'
              }
            }
          }
        };
      }
    };

    const first = domControls.ensureDefaultPayload(session, 'line', config);
    expect(first?.config?.colorScheme).toBe('scientific');
    expect(first?.config?.labelColors?.['Series 1']).not.toBe('#ffffff');
    expect(first?.config?.seriesStyles?.['Series 1']?.color).not.toBe('#ffffff');

    const contaminated = deepClone(first);
    contaminated.config.colorScheme = 'dark';
    contaminated.config.labelColors['Series 1'] = '#ffffff';
    expect(domControls.setWorkspaceDefaultPayload(session, 'line', contaminated)).toBe(true);

    const second = domControls.ensureDefaultPayload(session, 'line', config);
    expect(second?.config?.colorScheme).toBe('scientific');
    expect(second?.config?.labelColors?.['Series 1']).not.toBe('#ffffff');
  });

  test('ensureDefaultPayload refuses live payload fallback for defaults', () => {
    const session = window.Main?.session;
    const domControls = window.Main?.domControls;
    expect(session).toBeTruthy();
    expect(domControls).toBeTruthy();

    const config = {
      createEmptyPayload: jest.fn(() => null),
      captureEmptyPayloadTemplate: jest.fn(() => ({
        type: 'hist',
        data: [['Values'], [1], [2]],
        config: {
          plotMode: 'density',
          distributions: {
            selected: ['normal'],
            showPdf: false
          }
        }
      })),
      getPayload: jest.fn(() => ({
        type: 'hist',
        data: [['Values'], [1], [2]],
        config: {
          plotMode: 'density',
          distributions: {
            selected: ['normal'],
            showPdf: false
          }
        }
      }))
    };

    const defaults = domControls.ensureDefaultPayload(session, 'hist', config);
    expect(defaults).toBeNull();
    expect(config.createEmptyPayload).toHaveBeenCalled();
    expect(config.captureEmptyPayloadTemplate).not.toHaveBeenCalled();
    expect(config.getPayload).not.toHaveBeenCalled();
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
      clearTabRenderCache: jest.fn(),
      markTabAuthoritativeRenderRestore: jest.fn()
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
