const { loadProductionBootstrap } = require('../../test-support/productionLoader');

describe('production-derived Jest bootstrap', () => {
  test('loads the real ordered application prerequisites without a hand-written list', () => {
    jest.resetModules();
    delete window.Main;
    delete window.Components;
    delete window.Shared;

    const metadata = loadProductionBootstrap({
      vendorMode: 'fake',
      includeMain: false
    });

    expect(metadata.mode).toBe('production-derived');
    expect(metadata.vendorMode).toBe('fake');
    expect(metadata.includeMain).toBe(false);
    expect(metadata.loadedSources).toContain('js/main/components.js');
    expect(metadata.loadedSources).toContain('js/main/session.js');
    expect(metadata.loadedSources).not.toContain('js/main.js');
    expect(window.Main?.components).toBeTruthy();
    expect(window.Main?.session).toBeTruthy();
    expect(window.__GRAPHITIX_TEST_BOOTSTRAP__).toEqual(metadata);
  });

  test('honors an explicit production boundary without loading later control-plane scripts', () => {
    jest.resetModules();
    delete window.Main;
    delete window.Components;
    delete window.Shared;

    const metadata = loadProductionBootstrap({
      vendorMode: 'fake',
      includeMain: false,
      stopBefore: 'js/main/components.js'
    });

    expect(metadata.stoppedBefore).toBe('js/main/components.js');
    expect(metadata.loadedSources).not.toContain('js/main/components.js');
    expect(metadata.loadedSources).not.toContain('js/main/session.js');
    expect(window.Main?.components).toBeUndefined();
    expect(window.Main?.session).toBeUndefined();
  });

  test('preloads only declared component bundles before the main control plane', () => {
    jest.resetModules();
    delete window.Main;
    delete window.Components;
    delete window.Shared;

    const metadata = loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: ['pca']
    });

    expect(metadata.includeMain).toBe(true);
    expect(metadata.preloadedComponents).toEqual(['pca']);
    expect(window.Components?.pca).toBeTruthy();
    expect(window.Components?.venn).toBeUndefined();
  });

  test('loads every declared Node bundle and registers the matching component', async () => {
    jest.resetModules();
    delete window.Main;
    delete window.Components;
    delete window.Shared;

    loadProductionBootstrap({
      vendorMode: 'fake',
      includeMain: false
    });

    const loader = window.Main.components;
    const types = Object.keys(loader.registry).sort();
    const loaded = await Promise.all(types.map(type => loader.loadComponentBundle(type, { forceRequire: true })));

    expect(Object.keys(window.Components || {}).sort()).toEqual(types);
    expect(loaded).toHaveLength(types.length);
    loaded.forEach((component, index) => {
      expect(component).toBe(window.Components[types[index]]);
      expect(typeof component?.rehydrateGraphInteractions).toBe('function');
    });
  });

  test('gates component loader diagnostics through the shared debug setting', async () => {
    jest.resetModules();
    delete window.Main;
    delete window.Components;
    delete window.Shared;

    loadProductionBootstrap({
      vendorMode: 'fake',
      includeMain: false
    });

    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    const loader = window.Main.components;
    try {
      await loader.loadComponentBundle('unknown-component');
      expect(debugSpy).not.toHaveBeenCalled();

      window.Shared.enableDebugLogging();
      await loader.loadComponentBundle('unknown-component');
      expect(debugSpy).toHaveBeenCalledTimes(1);
      expect(debugSpy).toHaveBeenCalledWith(
        'Debug: loadComponentBundle missing descriptor',
        { type: 'unknown-component' }
      );
    } finally {
      debugSpy.mockRestore();
    }
  });

  test('rejects a preseeded workspace when strict full-app mode is requested', () => {
    jest.resetModules();
    const previousMain = window.Main;
    window.Main = {
      session: {
        workspaceState: {
          tabs: [{ id: 'stale-owner', type: 'box' }],
          activeTabId: 'stale-owner'
        }
      }
    };

    try {
      expect(() => loadProductionBootstrap({
        vendorMode: 'fake',
        rejectPreseededSession: true
      })).toThrow('rejects a preseeded workspace session');
    } finally {
      if (previousMain === undefined) delete window.Main;
      else window.Main = previousMain;
    }
  });
});
