/**
 * Smoke tests for initialization to guard against breaking refactors.
 * These tests load the real index.html and execute js/main.js within JSDOM.
 */

describe('App initialization', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test('js/main.js runs without throwing and attaches core UI', () => {
    expect(() => {
      // Preload shared modules (mirror script order in index.html)
      require('../js/vendor.js');
      require('../js/shared/debounce.js');
      require('../js/shared/resizer.js');
      require('../js/shared/colorPicker.js');
      require('../js/shared/hot.js');
      // Components
      require('../js/components/box.js');
      require('../js/components/hist.js');
      require('../js/components/pie.js');
      require('../js/components/heatmap.js');
      require('../js/components/scatter.js');
      require('../js/components/pca.js');
      require('../js/components/line.js');
      require('../js/components/roc.js');
      require('../js/components/survival.js');
      // Load the application script (IIFE executes immediately)
      require('../js/main.js');
    }).not.toThrow();

    // Color picker overlay should be injected into the body by main.js
    const overlays = Array.from(document.querySelectorAll('body > input[type="color"]'));
    expect(overlays.length).toBeGreaterThanOrEqual(1);

    // Chart defaults should be set by main.js
    expect(global.Chart.defaults.locale).toBe('en-US');

    // Handsontable instances should be constructed for major tables
    const createdIds = (global.__HT_CALLS__ || [])
      .filter(c => c.type === 'construct')
      .map(c => c.containerId);

    // Expect core grids to be initialized (if present in DOM)
    const expected = ['hot', 'scatterHot', 'pcaHot', 'lineHot', 'heatmapHot', 'rocHot', 'survivalHot', 'histHot', 'pieHot'];
    for (const id of expected) {
      const node = document.getElementById(id);
      if (node) {
        expect(createdIds).toContain(id);
      }
    }
  });
});
