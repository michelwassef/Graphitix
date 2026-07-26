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
      applyRuntimeState: jest.fn(() => true)
    };
    global.window.Components.box = component;
    require('../js/main/components.js');

    window.Main.components.ensureComponent('box');

    const capabilities = window.Main.components.getLifecycleCapabilities('box');
    expect(capabilities.captureRuntimeState).toBe(true);
    expect(capabilities.applyRuntimeState).toBe(true);
    expect(window.Main.components.registry.box.__lifecycleContract.captureRuntimeState).toBe(true);
    expect(window.Main.components.registry.box.__lifecycleContract.applyRuntimeState).toBe(true);
  });

  test('restore fallback draws bypass the registry frame with current owner metadata', () => {
    const draw = jest.fn();
    const buildSessionMeta = jest.fn((componentKey, options) => ({
      tabId: options.tabId,
      sessionGeneration: options.sessionGeneration,
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
        createTabScopedScheduler: jest.fn(() => jest.fn())
      }
    };
    require('../js/main/components.js');

    window.Main.components.registry.heatmap.draw({
      tabId: 'workspace-heavy-heatmap',
      sessionGeneration: 7,
      force: true,
      forceDraw: true,
      reason: 'workspace-draw-fallback'
    });

    expect(buildSessionMeta).toHaveBeenCalledWith('heatmap', expect.objectContaining({
      tabId: 'workspace-heavy-heatmap',
      sessionGeneration: 7
    }));
    expect(window.Shared.workspaceTabs.isSessionMetaCurrent).toHaveBeenCalledWith('heatmap', expect.objectContaining({
      tabId: 'workspace-heavy-heatmap',
      sessionGeneration: 7,
      componentKey: 'heatmap'
    }));
    expect(draw).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 'workspace-heavy-heatmap',
      sessionGeneration: 7,
      forceDraw: true,
      reason: 'workspace-draw-fallback',
      __workspaceSessionMeta: expect.objectContaining({
        tabId: 'workspace-heavy-heatmap',
        sessionGeneration: 7,
        componentKey: 'heatmap'
      })
    }));
  });


});
