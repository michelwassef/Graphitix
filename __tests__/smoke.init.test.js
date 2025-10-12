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
    if (typeof global.__resetHT__ === 'function') {
      global.__resetHT__();
    }
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('js/main.js runs without throwing and attaches core UI', async () => {
    expect(() => {
      // Preload shared modules (mirror script order in index.html)
      require('../js/vendor.js');
      require('../js/shared/fileIO.js');
      require('../js/shared/debounce.js');
      require('../js/shared/undo.js');
      require('../js/shared/resizer.js');
      require('../js/shared/dom.js');
      require('../js/shared/exporter.js');
      require('../js/shared/chartStyle.js');
      require('../js/shared/graphSizing.js');
      require('../js/shared/regression.js');
      require('../js/shared/stats.js');
      require('../js/shared/stats-table.js');
      require('../js/shared/colorPicker.js');
      require('../js/shared/axisControls.js');
      require('../js/shared/fontControls.js');
      require('../js/shared/formControls.js');
      require('../js/shared/hot.js');
      require('../js/shared/componentLayout.js');
      require('../js/shared/tableImport.js');
      require('../js/shared/uniprot.js');
      require('../js/shared/goAnalysis.js');
      require('../js/shared/stringAnalysis.js');
      require('../js/main/components.js');
      if (window.Main?.components?.preloadAllBundlesSync) {
        window.Main.components.preloadAllBundlesSync();
      }
      require('../js/main/session.js');
      require('../js/main/domControls.js');
      require('../js/main/sessionActions.js');
      require('../js/main/styleSync.js');
      require('../js/main/tabDrag.js');
      require('../js/main/previews.js');
      require('../js/main/tabs/render.js');
      require('../js/main/tabs/unsavedPrompt.js');
      require('../js/main/tabs/duplicatePrompt.js');
      require('../js/main/tabs.js');
      // Load the application script (IIFE executes immediately)
      require('../js/main.js');
    }).not.toThrow();

    // Color picker overlay should be injected into the body by main.js
    const overlays = Array.from(document.querySelectorAll('body > input[type="color"]'));
    expect(overlays.length).toBeGreaterThanOrEqual(1);

    // Chart defaults should be set by main.js
    expect(global.Chart.defaults.locale).toBe('en-US');

    const getConstructedIds = () => (global.__HT_CALLS__ || [])
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
