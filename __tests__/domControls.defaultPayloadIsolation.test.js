const deepClone = value => (value == null ? value : JSON.parse(JSON.stringify(value)));

describe('domControls default payload cache isolation', () => {
  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }
    require('../js/main/session.js');
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
        payloadSignature: 'payload-large',
        layoutSignature: 'layout-large',
        cache: { svg: '<svg></svg>' }
      }
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
        scatter: 'workspace-2'
      }
    };

    window.Shared = window.Shared || {};
    window.Shared.workspaceTabs = {
      activateWorkspace: jest.fn()
    };
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
    expect(config.draw).not.toHaveBeenCalled();
    expect(config.restoreRenderCache).toHaveBeenCalledWith(tab.renderCache.cache, {
      tabId: 'workspace-2',
      type: 'scatter'
    });
    expect(session.fastClonePayload).not.toHaveBeenCalled();
    expect(session.clearTabRenderCache).toHaveBeenCalledWith(tab, { reason: 'render-cache-consumed' });
  });

  test('showWorkspaceForTab preserves large data matrix by reference on first activation', () => {
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
    expect(appliedPayload.data).toBe(payload.data);
    expect(appliedPayload.config).not.toBe(payload.config);
    expect(appliedPayload.config.alpha).toBe(0);
    expect(session.fastClonePayload).not.toHaveBeenCalledWith(payload);
    expect(session.fastClonePayload).not.toHaveBeenCalledWith(payload.data);
  });
});
