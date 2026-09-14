const path = require('path');
const { loadProductionBootstrap } = require('../test-support/productionLoader');
const { readSharedProductionSources } = require('../test-support/componentTestBootstrap');
const { readProductionScriptManifest } = require('../test-support/productionBootstrap');

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

  test('isolated component bootstrap derives shared module order from production', () => {
    const productionSources = readProductionScriptManifest(path.resolve(__dirname, '..'))
      .filter(entry => entry.local)
      .map(entry => entry.source);
    expect(readSharedProductionSources(path.resolve(__dirname, '..'))).toEqual(
      productionSources.filter(source => source === 'js/vendor.js' || source.startsWith('js/shared/'))
    );
  });
});
