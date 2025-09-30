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
    require('../js/shared/chartStyle.js');
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

  test('ROC stats escape series names that look like HTML', () => {
    const htmlName = 'Model <em>Injected</em>';
    const payload = window.Components?.roc?.getPayload?.();
    expect(payload).toBeTruthy();
    const tableData = payload.data;
    expect(Array.isArray(tableData)).toBe(true);

    const ensureRow = index => {
      tableData[index] = tableData[index] || [];
      return tableData[index];
    };
    const header = ensureRow(0);
    header[0] = 'Label';
    header[1] = htmlName;
    const rows = [
      [1, 0.92],
      [0, 0.12],
      [1, 0.88],
      [0, 0.05]
    ];
    rows.forEach((row, idx) => {
      const target = ensureRow(idx + 1);
      target[0] = row[0];
      target[1] = row[1];
    });

    window.Components.roc.draw();

    const statsResults = document.getElementById('rocStatsResults');
    expect(statsResults).toBeTruthy();
    const lines = Array.from(statsResults.querySelectorAll('p')).map(el => el.textContent);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toContain(htmlName);
    expect(statsResults.querySelector('em')).toBeNull();
    expect(statsResults.innerHTML).toContain('&lt;em&gt;');
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

  test('Color picker overlay opens on color input click', () => {
    const colorA = document.getElementById('colorA');
    expect(colorA).toBeTruthy();
    // Find overlay (the only color input appended directly under body with pointerEvents none)
    const overlay = Array.from(document.querySelectorAll('body > input[type="color"]')).find(el => el.style.pointerEvents === 'none');
    expect(overlay).toBeTruthy();
    expect(overlay.style.display).toBe('none');

    // Dispatch click
    const evt = new window.Event('click', { bubbles: true, cancelable: true });
    colorA.dispatchEvent(evt);

    // Overlay should be shown
    expect(overlay.style.display).toBe('block');
  });
});
