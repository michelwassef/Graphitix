describe('Main.components.ensureComponent', () => {
  beforeEach(() => {
    jest.resetModules();
    if (typeof global.window !== 'object') {
      global.window = {};
    }
    global.window.Main = undefined;
    global.window.Components = undefined;
    global.window.Shared = undefined;
  });

  test('returns loaded component synchronously when present globally', () => {
    if (typeof global.window.Components !== 'object') {
      global.window.Components = {};
    }
    if (typeof global.window.Shared !== 'object') {
      global.window.Shared = { debounceFrame: fn => fn };
    }
    if (typeof global.window.Components !== 'object') {
      global.window.Components = {};
    }
    const component = { ready: true, ensure: jest.fn(() => null) };
    global.window.Components.box = component;
    require('../js/main/components.js');

    const result = window.Main.components.ensureComponent('box');

    expect(component.ensure).toHaveBeenCalled();
    expect(result).toBe(component);
  });

  test('workspace lifecycle wrapping preserves component deactivation forwarding', () => {
    const deactivateTab = jest.fn(() => true);
    global.window.Components = { roc: { deactivateTab } };
    global.window.Shared = {
      debounceFrame: fn => fn,
      componentLifecycle: {
        register: jest.fn(descriptor => descriptor),
        attachWorkspace: jest.fn(workspace => {
          const originalDeactivate = workspace.deactivateTab;
          workspace.__lifecycleDescriptor = {};
          workspace.deactivateTab = (tab, meta) => originalDeactivate?.(tab, meta);
          return workspace;
        })
      }
    };
    require('../js/main/components.js');

    const tab = { id: 'roc-a', type: 'roc' };
    window.Main.components.registry.roc.deactivateTab(tab, { reason: 'test-switch' });

    expect(deactivateTab).toHaveBeenCalledWith(tab, { reason: 'test-switch' });
  });

  test('resolves loaded component asynchronously when ensure returns a promise', async () => {
    if (typeof global.window.Components !== 'object') {
      global.window.Components = {};
    }
    if (typeof global.window.Shared !== 'object') {
      global.window.Shared = { debounceFrame: fn => fn };
    }
    const component = { ready: false, ensure: jest.fn(() => Promise.resolve('ok')) };
    global.window.Components.box = component;
    require('../js/main/components.js');

    const result = window.Main.components.ensureComponent('box');

    expect(result).toBeInstanceOf(Promise);
    const resolved = await result;
    expect(resolved).toBe(component);
    expect(component.ensure).toHaveBeenCalled();
  });

  test('promotes an uninitialized passive ensure to full initialization while preserving draw suppression', () => {
    global.window.Components = {};
    global.window.Shared = { debounceFrame: fn => fn };
    const component = { ready: false, ensure: jest.fn(() => null) };
    global.window.Components.venn = component;
    require('../js/main/components.js');

    window.Main.components.ensureComponent('venn', {
      ensureOptions: {
        tabId: 'workspace-3',
        passiveControls: true,
        liveDomFastPath: true,
        liveDomReuse: true,
        skipInitialDraw: true,
        suppressDraw: true,
        reason: 'recovery-restore'
      }
    });

    expect(component.ensure).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 'workspace-3',
      passiveControls: false,
      liveDomFastPath: false,
      liveDomReuse: false,
      skipInitialDraw: true,
      suppressDraw: true,
      reason: 'recovery-restore'
    }));
  });

  test('preserves passive projection options for an already initialized component', () => {
    global.window.Components = {};
    global.window.Shared = { debounceFrame: fn => fn };
    const component = { ready: true, ensure: jest.fn(() => null) };
    global.window.Components.pca = component;
    require('../js/main/components.js');

    window.Main.components.ensureComponent('pca', {
      ensureOptions: {
        tabId: 'workspace-4',
        passiveControls: true,
        liveDomFastPath: true,
        reason: 'tab-switch'
      }
    });

    expect(component.ensure).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 'workspace-4',
      passiveControls: true,
      liveDomFastPath: true,
      reason: 'tab-switch'
    }));
  });

  test('registry publication validators scope checks to the primary graph surface', () => {
    const hasRenderableGraphContent = jest.fn(() => false);
    global.window.Components = {};
    global.window.Shared = {
      debounceFrame: fn => fn,
      componentLifecycle: { hasRenderableGraphContent }
    };
    require('../js/main/components.js');
    const root = document.createElement('div');

    expect(window.Main.components.registry.pca.hasRenderedGraph({ root })).toBe(false);
    expect(hasRenderableGraphContent).toHaveBeenLastCalledWith(root, {
      selectors: ['#pcaPlot'],
      contentSelectors: ['[data-plot-point="1"]', 'canvas.pca-fast-points-layer'],
      allowText: false
    });

    expect(window.Main.components.registry.heatmap.hasRenderedGraph({ root })).toBe(false);
    expect(hasRenderableGraphContent).toHaveBeenLastCalledWith(root, {
      selectors: ['#heatmapSvg'],
      contentSelectors: [
        '[data-export-layer="heatmap-cells"] rect:not([data-heatmap-cell-hit-layer])',
        '[data-export-layer="heatmap-cells"] path[data-heatmap-vector-cell-bucket]',
        '[data-export-layer="heatmap-cells"] [data-heatmap-cell-value]',
        '[data-export-layer="heatmap-cells"] canvas',
        '[data-export-layer="heatmap-cells"] img[data-graphitix-render-cache-canvas-bitmap="true"]',
        '[data-export-layer="heatmap-cells"] img[data-graphitix-render-cache-canvas-restored="true"]',
        '[data-export-layer="heatmap-cells"] image[data-heatmap-raster-export="1"]'
      ],
      allowText: false
    });
  });

  test('compatibility fallbacks do not advertise persistence capabilities', () => {
    global.window.Components = {};
    global.window.Shared = { debounceFrame: fn => fn };
    const component = { ready: true, ensure: jest.fn(() => null) };
    global.window.Components.box = component;
    require('../js/main/components.js');

    window.Main.components.ensureComponent('box');

    expect(typeof component.captureRuntimeState).toBe('function');
    expect(component.captureRuntimeState.__graphitixLifecycleFallback).toBe(true);
    expect(window.Main.components.getLifecycleCapabilities('box').captureRuntimeState).toBe(false);
    expect(window.Main.components.registry.box.__lifecycleContract.captureRuntimeState).toBe(false);
  });

  test('declared component persistence hooks are published as capabilities', () => {
    global.window.Components = {};
    global.window.Shared = { debounceFrame: fn => fn };
    const component = {
      ready: true,
      ensure: jest.fn(() => null),
      captureRuntimeState: jest.fn(() => ({ ready: true })),
      applyRuntimeState: jest.fn(() => true),
      isRenderCacheCurrent: jest.fn(() => false)
    };
    global.window.Components.box = component;
    require('../js/main/components.js');

    window.Main.components.ensureComponent('box');

    const capabilities = window.Main.components.getLifecycleCapabilities('box');
    expect(capabilities.captureRuntimeState).toBe(true);
    expect(capabilities.applyRuntimeState).toBe(true);
    expect(capabilities.isRenderCacheCurrent).toBe(true);
    expect(window.Main.components.registry.box.__lifecycleContract.captureRuntimeState).toBe(true);
    expect(window.Main.components.registry.box.__lifecycleContract.applyRuntimeState).toBe(true);
    expect(window.Main.components.registry.box.__lifecycleContract.isRenderCacheCurrent).toBe(true);
    expect(window.Main.components.registry.box.isRenderCacheCurrent({ tabId: 'box-a' })).toBe(false);
    expect(component.isRenderCacheCurrent).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 'box-a',
      componentKey: 'box',
      type: 'box'
    }));
  });

  test('Heatmap registry draw delegates directly to its owner-scoped draw cycle', () => {
    const draw = jest.fn();
    const buildSessionMeta = jest.fn((componentKey, options) => ({
      tabId: options.tabId,
      sessionGeneration: 7,
      componentKey
    }));
    global.window.Components = { heatmap: { ready: true, draw } };
    global.window.Shared = {
      debounceFrame: fn => fn,
      componentLifecycle: {
        createTabScopedFrameDebouncer: (_owner, _key, fn) => fn,
        shouldSuppressDraw: jest.fn(() => false),
        emitLifecycleEvent: jest.fn()
      },
      workspaceTabs: {
        buildSessionMeta,
        isSessionMetaCurrent: jest.fn(() => true),
        createTabScopedScheduler: jest.fn(config => options => {
          const meta = buildSessionMeta(config.componentKey, options);
          return config.scheduleRaw({
            ...options,
            sessionGeneration: meta.sessionGeneration,
            __workspaceSessionMeta: meta
          });
        })
      }
    };
    require('../js/main/components.js');

    window.Main.components.registry.heatmap.draw({
      tabId: 'workspace-heavy-heatmap',
      force: true,
      forceDraw: true,
      reason: 'workspace-draw-fallback'
    });

    expect(buildSessionMeta).not.toHaveBeenCalled();
    expect(window.Shared.workspaceTabs.isSessionMetaCurrent).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 'workspace-heavy-heatmap',
      forceDraw: true,
      reason: 'workspace-draw-fallback'
    }));
  });


});
