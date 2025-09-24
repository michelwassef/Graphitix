/**
 * Event-level tests to ensure key UI flows are wired correctly.
 * These catch regressions when splitting main.js into modules.
 */

describe('UI events and example loaders', () => {
  beforeEach(() => {
    jest.resetModules();
    // Ensure fresh app init
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
    require('../js/components/roc.js');
    require('../js/components/survival.js');
    require('../js/main.js');
  });

  test('Box Plot: Load Example populates data', () => {
    const btn = document.getElementById('boxLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'hot');
    // At least one loadData for #hot with header row ['Control', ...]
    expect(loads.length).toBeGreaterThan(0);
    const firstRow = loads[loads.length - 1].firstRow;
    expect(firstRow).toEqual(expect.arrayContaining(['Control']));
  });

  test('Histogram: Load Example populates data', () => {
    const btn = document.getElementById('histLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'histHot');
    expect(loads.length).toBeGreaterThan(0);
    const firstRow = loads[loads.length - 1].firstRow;
    expect(firstRow).toEqual(expect.arrayContaining(['Exam Score']));
  });

  test('Proportion Graph: Load Example populates data', () => {
    const btn = document.getElementById('pieLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'pieHot');
    expect(loads.length).toBeGreaterThan(0);
    const firstRow = loads[loads.length - 1].firstRow;
    expect(firstRow).toEqual(expect.arrayContaining(['Quarter', 'Observed', 'Expected']));
  });

  test('Correlation Heatmap: Load Example populates data', () => {
    const btn = document.getElementById('heatmapLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'heatmapHot');
    expect(loads.length).toBeGreaterThan(0);
    const firstRow = loads[loads.length - 1].firstRow;
    expect(firstRow).toEqual(expect.arrayContaining(['Gene', 'Baseline_A', 'Stress_A']));
  });

  test('ROC: Load Example populates data', () => {
    const btn = document.getElementById('rocLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'rocHot');
    expect(loads.length).toBeGreaterThan(0);
    const firstRow = loads[loads.length - 1].firstRow;
    expect(firstRow).toEqual(expect.arrayContaining(['Label', 'Model1', 'Model2']));
  });

  test('Survival: Load Example populates data', () => {
    const btn = document.getElementById('survivalLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'survivalHot');
    expect(loads.length).toBeGreaterThan(0);
    const firstRow = loads[loads.length - 1].firstRow;
    expect(firstRow).toEqual(['Control', 1.2, 1]);
  });

  test('Color picker overlay opens on color input pointerdown', () => {
    const colorA = document.getElementById('colorA');
    expect(colorA).toBeTruthy();
    // Find overlay (the only color input appended directly under body with pointerEvents none)
    const overlay = Array.from(document.querySelectorAll('body > input[type="color"]')).find(el => el.style.pointerEvents === 'none');
    expect(overlay).toBeTruthy();
    expect(overlay.style.display).toBe('none');

    // Dispatch pointerdown
    const evt = new window.Event('pointerdown', { bubbles: true, cancelable: true });
    colorA.dispatchEvent(evt);

    // Overlay should be shown
    expect(overlay.style.display).toBe('block');
  });
});
