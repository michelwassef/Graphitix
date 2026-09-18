const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120_000);

/**
 * Smoke tests for initialization to guard against breaking refactors.
 * These tests load the real index.html and execute js/main.js within JSDOM.
 */

describe('App initialization', () => {
  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('js/main.js runs without throwing and attaches core UI', async () => {
    expect(() => {
      loadProductionBootstrap({
        vendorMode: 'fake',
        rejectPreseededSession: true,
        beforeMain: () => {
          if (window.Main?.components?.preloadAllBundlesSync) {
            window.Main.components.preloadAllBundlesSync();
          }
        }
      });
    }).not.toThrow();

    // Color picker overlay should be injected into the body by main.js
    const overlays = Array.from(document.querySelectorAll('body > .shared-color-picker'));
    expect(overlays.length).toBeGreaterThanOrEqual(1);

    const getConstructedIds = () => (global.__GRID_CALLS__ || [])
      .filter(c => c.type === 'construct')
      .map(c => c.containerId);

    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    expect(typeof graphSelection).toBe('function');

    const workspaceHotTargets = [
      { type: 'box', containerId: 'hot' },
      { type: 'scatter', containerId: 'scatterHot' },
      { type: 'pca', containerId: 'pcaHot' },
      { type: 'line', containerId: 'lineHot' },
      { type: 'heatmap', containerId: 'heatmapHot' },
      { type: 'surface', containerId: 'surfaceHot' },
      { type: 'roc', containerId: 'rocHot' },
      { type: 'survival', containerId: 'survivalHot' },
      { type: 'hist', containerId: 'histHot' },
      { type: 'pie', containerId: 'pieHot' }
    ];

    for (const target of workspaceHotTargets) {
      const node = document.getElementById(target.containerId);
      if (!node) continue;
      const maybePromise = graphSelection(target.type);
      if (maybePromise && typeof maybePromise.then === 'function') {
        await maybePromise;
      }
      await Promise.resolve();
      const constructed = getConstructedIds();
      expect(constructed).toContain(target.containerId);
    }

    expect(typeof window.Main?.tabs?.createRenderHelpers).toBe('function');
    expect(typeof window.Main?.tabs?.createUnsavedPromptHandlers).toBe('function');
    expect(typeof window.Main?.tabs?.createDuplicatePromptHandlers).toBe('function');
    expect(typeof window.Main?.tabs?.renderTabs).toBe('function');

    const renderedTabs = document.querySelectorAll('.workspace-tab');
    expect(renderedTabs.length).toBeGreaterThan(0);
  });
});
