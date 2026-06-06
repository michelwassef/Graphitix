/**
 * Event-level tests to ensure key UI flows are wired correctly.
 * These catch regressions when splitting main.js into modules.
 */
const { ensureJStatStub } = require('./helpers/jstatTestStub');

const originalDebug = console.debug;
const originalLog = console.log;

async function activateWorkspace(type){
  const graphSelection = window.Main?.tabs?.handleGraphSelection;
  expect(typeof graphSelection).toBe('function');
  const result = graphSelection(type);
  if (result && typeof result.then === 'function') {
    await result;
  }
  await Promise.resolve();
}

async function flushAsyncWork(iterations = 25){
  for (let i = 0; i < iterations; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('UI events and example loaders', () => {

  beforeEach(() => {
    jest.resetModules();
    console.debug = jest.fn();
    console.log = jest.fn();

    // Make requestAnimationFrame-driven debounced work deterministic and fast in this suite.
    // (Many components schedule draws through Shared.debounceFrame -> requestAnimationFrame.)
    global.requestAnimationFrame = (cb) => {
      try { cb(Date.now()); } catch (err) { /* ignore */ }
      return 1;
    };
    global.cancelAnimationFrame = () => {};

    // Reset global namespaces so each test re-binds to the fresh DOM.
    // The test harness reloads index.html per-test, but window.* objects persist.
    // Without clearing these, components may skip setup due to ready/__installed flags
    // and keep references to detached nodes, causing renders to target the old DOM.
    if (typeof window !== 'undefined') {
      delete window.Main;
      delete window.Components;
      delete window.Shared;
    }

    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }
    // Ensure fresh app init
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
    require('../js/shared/editHighlight.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
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
    require('../js/main.js');
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  afterAll(() => {
    console.debug = originalDebug;
    console.log = originalLog;
  });

  test('Box Plot: Load Example populates data', async () => {
    await activateWorkspace('box');
    const btn = document.getElementById('boxLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__GRID_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'hot');
    // At least one loadData for #hot with header row ['Control', ...]
    expect(loads.length).toBeGreaterThan(0);
    const populated = loads.find(call => Array.isArray(call.firstRow) && call.firstRow.some(value => value === 'Control'));
    expect(populated?.firstRow).toEqual(expect.arrayContaining(['Control']));
    await flushAsyncWork();
  });

  test('Box Plot: grouped example seeds condition names', async () => {
    await activateWorkspace('box');
    await flushAsyncWork(20);

    const formatSelect = document.getElementById('boxTableFormat');
    expect(formatSelect).toBeTruthy();
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(40);

    const btn = document.getElementById('boxLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork(60);

    const hot = window.Components?.box?.__getState?.()?.hot;
    expect(hot).toBeTruthy();
    const matrix = hot.getData?.() || [];
    expect(String(matrix?.[0]?.[0] || '')).toBe('Control');
    expect(String(matrix?.[0]?.[3] || '')).toBe('Treated');
    expect(String(matrix?.[1]?.[0] || '')).toBe('Week 1');
    expect(String(matrix?.[1]?.[1] || '')).toBe('Week 2');
    expect(String(matrix?.[1]?.[2] || '')).toBe('Week 3');
    expect(String(matrix?.[1]?.[3] || '')).toBe('Week 1');
    expect(String(matrix?.[1]?.[4] || '')).toBe('Week 2');
    expect(String(matrix?.[1]?.[5] || '')).toBe('Week 3');
  });

  test('Box Plot: whisker rule selection persists to payload', async () => {
    await activateWorkspace('box');
    await flushAsyncWork();
    const ruleSelect = document.getElementById('boxWhiskerRule');
    const customInput = document.getElementById('boxWhiskerCustomMultiplier');
    expect(ruleSelect).toBeTruthy();
    expect(customInput).toBeTruthy();
    ruleSelect.value = 'custom';
    ruleSelect.dispatchEvent(new Event('change'));
    customInput.value = '2.75';
    customInput.dispatchEvent(new Event('change'));
    await flushAsyncWork();
    const stateSnapshot = window.Components?.box?.__getState?.();
    const payload = window.Components?.box?.getPayload?.();
    expect(stateSnapshot?.whiskerRule).toBe('custom');
    expect(payload?.config?.whisker?.rule).toBe('custom');
    expect(payload?.config?.whisker?.customMultiplier).toBeCloseTo(2.75);
  });

  test('Box Plot: whisker extents respond to multiplier changes', async () => {
    await activateWorkspace('box');
    await flushAsyncWork();
    const hooks = window.Components?.box?.__testHooks;
    expect(hooks?.computeWhiskerFences).toBeInstanceOf(Function);
    expect(hooks?.resolveWhiskerExtents).toBeInstanceOf(Function);
    const values = [10, 30, 50, 70, 90, 180];
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = p => {
      const pos = (sorted.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      const next = sorted[base + 1] !== undefined ? sorted[base + 1] : sorted[base];
      return sorted[base] + rest * (next - sorted[base]);
    };
    const q1 = percentile(0.25);
    const q3 = percentile(0.75);
    const iqr = q3 - q1;
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1);
    const sd = Math.sqrt(Math.max(variance, 0));
    const tukeyFences = hooks.computeWhiskerFences({ q1, q3, iqr, mean, sd, rule: 'iqr15' });
    const tukeyExtents = hooks.resolveWhiskerExtents(sorted, {
      lowerFence: tukeyFences.lowerFence,
      upperFence: tukeyFences.upperFence,
      q1,
      q3
    });
    expect(tukeyExtents.outliers).toContain(180);
    expect(tukeyExtents.wMax).toBeLessThan(180);
    const iqr3Fences = hooks.computeWhiskerFences({ q1, q3, iqr, mean, sd, rule: 'iqr3' });
    const iqr3Extents = hooks.resolveWhiskerExtents(sorted, {
      lowerFence: iqr3Fences.lowerFence,
      upperFence: iqr3Fences.upperFence,
      q1,
      q3
    });
    expect(iqr3Extents.outliers).not.toContain(180);
    expect(iqr3Extents.wMax).toBeCloseTo(180);
  });

  test('Box Plot: additional axis ticks/lines persist from FORMAT controls', async () => {
    await activateWorkspace('box');
    const loadBtn = document.getElementById('boxLoadExample');
    expect(loadBtn).toBeTruthy();
    loadBtn.click();
    const svg = await waitFor(() => document.querySelector('#boxPlot svg'), { timeout: 10000 });
    expect(svg).toBeTruthy();
    const axisLines = Array.from(svg.querySelectorAll('line[data-axis-control="1"]'));
    const yAxisLine = axisLines.find(line => {
      const x1 = line.getAttribute('x1');
      const x2 = line.getAttribute('x2');
      return x1 != null && x1 === x2;
    }) || axisLines[0];
    expect(yAxisLine).toBeTruthy();
    yAxisLine.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsyncWork(8);

    const panel = document.querySelector('.axis-controls-panel');
    expect(panel && panel.dataset.open === '1').toBe(true);
    const extraButton = panel.querySelector('.axis-controls-panel__button--additional-ticks');
    expect(extraButton).toBeTruthy();
    extraButton.click();
    await flushAsyncWork(4);

    const addButton = panel.querySelector('.axis-controls-panel__button--add-extra');
    expect(addButton).toBeTruthy();
    addButton.click();
    await flushAsyncWork(8);

    const row = panel.querySelector('.axis-controls-panel__extra-row');
    expect(row).toBeTruthy();
    const valueInput = row.querySelector('input[type="number"]');
    const textInput = row.querySelector('input[type="text"]');
    const toggles = row.querySelectorAll('input[type="checkbox"]');
    expect(valueInput).toBeTruthy();
    expect(textInput).toBeTruthy();
    expect(toggles.length).toBe(2);

    valueInput.value = '16.5';
    valueInput.dispatchEvent(new Event('change', { bubbles: true }));
    toggles[1].checked = true; // line toggle
    toggles[1].dispatchEvent(new Event('change', { bubbles: true }));
    textInput.value = 'Threshold';
    textInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(10);

    const extraLine = document.querySelector('#boxPlot svg [data-additional-line-control="1"]');
    expect(extraLine).toBeTruthy();
    extraLine.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsyncWork(8);

    const linePanel = document.querySelector('.additional-line-controls-panel');
    expect(linePanel && linePanel.dataset.open === '1').toBe(true);
    const lineThicknessInput = linePanel.querySelector('.additional-line-controls-panel__input--small');
    const lineColorInput = linePanel.querySelector('.additional-line-controls-panel__color-input');
    const linePatternSelect = linePanel.querySelector('.additional-line-controls-panel__input--select');
    const lineTransparencyInput = linePanel.querySelector('.additional-line-controls-panel__transparency-input');
    expect(lineThicknessInput).toBeTruthy();
    expect(lineColorInput).toBeTruthy();
    expect(linePatternSelect).toBeTruthy();
    expect(lineTransparencyInput).toBeTruthy();

    lineThicknessInput.value = '2.5';
    lineThicknessInput.dispatchEvent(new Event('change', { bubbles: true }));
    lineColorInput.value = '#ff0000';
    lineColorInput.dispatchEvent(new Event('input', { bubbles: true }));
    linePatternSelect.value = 'dotted';
    linePatternSelect.dispatchEvent(new Event('change', { bubbles: true }));
    lineTransparencyInput.value = '42';
    lineTransparencyInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsyncWork(10);

    const boxComponent = window.Components?.box;
    expect(boxComponent).toBeTruthy();
    const state = boxComponent.__getState?.();
    expect(state).toBeTruthy();
    const extras = state?.axisSettings?.y?.additionalTicks || [];
    expect(extras.length).toBe(1);
    expect(extras[0]).toEqual(expect.objectContaining({
      value: 16.5,
      showTick: false,
      showLine: true,
      label: 'Threshold',
      lineColor: '#ff0000',
      lineWidth: 2.5,
      linePattern: 'dotted',
      lineTransparency: 42
    }));

    const payload = boxComponent.getPayload?.();
    expect(payload?.config?.axis?.additionalTicks?.y).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: 16.5,
        showTick: false,
        showLine: true,
        label: 'Threshold',
        lineColor: '#ff0000',
        lineWidth: 2.5,
        linePattern: 'dotted',
        lineTransparency: 42
      })
    ]));

    boxComponent.loadFromPayload(payload);
    await flushAsyncWork(10);
    const reloadedState = boxComponent.__getState?.();
    expect(reloadedState?.axisSettings?.y?.additionalTicks?.length).toBe(1);
    expect(reloadedState?.axisSettings?.y?.additionalTicks?.[0]?.label).toBe('Threshold');
  });

  test('Line Graph: Load Example respects replicate mode', async () => {
    await activateWorkspace('line');
    const loadBtn = document.getElementById('lineLoadExample');
    expect(loadBtn).toBeTruthy();

    loadBtn.click();
    await flushAsyncWork(40);

    const lineComponent = window.Components?.line;
    const lineStateSingle = lineComponent?.__getState?.();
    expect(lineStateSingle).toBeTruthy();
    expect(lineStateSingle?.legendLayout?.entryCount).toBeGreaterThan(0);
    const hot = lineComponent?.getHot?.();
    expect(hot).toBeTruthy();
    const singleHeader = Array.isArray(hot?.getData?.()) ? hot.getData()[0] : null;
    expect(singleHeader).toBeTruthy();
    expect(singleHeader.slice(0, 6)).toEqual(['Month', 'North', 'South', 'East', 'West', 'Central']);

    const formatSelect = document.getElementById('lineTableFormat');
    expect(formatSelect).toBeTruthy();
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change'));
    await flushAsyncWork(40);

    loadBtn.click();
    await flushAsyncWork(60);

    const groupedData = Array.isArray(hot?.getData?.()) ? hot.getData() : null;
    expect(groupedData?.length).toBeGreaterThan(1);
    expect(groupedData[1].slice(0, 7)).toEqual([0, 45, 43, 47, 50, 48, 49]);
    const replicatesInput = document.getElementById('lineReplicates');
    expect(replicatesInput?.value).toBe('3');
    const lineStateGrouped = lineComponent?.__getState?.();
    expect(lineStateGrouped?.legendItems?.length).toBe(2);
    expect(lineStateGrouped?.legendItems?.map(item => item.label)).toEqual(['Control', 'Treated']);
  }, 20000);

  test('Line Graph: additional axis ticks/lines persist from FORMAT controls', async () => {
    await activateWorkspace('line');
    const loadBtn = document.getElementById('lineLoadExample');
    expect(loadBtn).toBeTruthy();
    loadBtn.click();
    await flushAsyncWork(40);

    const svg = document.querySelector('#linePlot svg');
    expect(svg).toBeTruthy();
    const axisLines = Array.from(svg.querySelectorAll('line[data-axis-control="1"]'));
    const yAxisLine = axisLines.find(line => {
      const x1 = line.getAttribute('x1');
      const x2 = line.getAttribute('x2');
      const stroke = (line.getAttribute('stroke') || '').toLowerCase();
      return x1 != null && x1 === x2 && stroke !== 'transparent';
    });
    expect(yAxisLine).toBeTruthy();
    yAxisLine.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsyncWork(8);

    const panel = document.querySelector('.axis-controls-panel');
    expect(panel && panel.dataset.open === '1').toBe(true);
    const extraButton = panel.querySelector('.axis-controls-panel__button--additional-ticks');
    expect(extraButton).toBeTruthy();
    extraButton.click();
    await flushAsyncWork(4);

    const addButton = panel.querySelector('.axis-controls-panel__button--add-extra');
    expect(addButton).toBeTruthy();
    addButton.click();
    await flushAsyncWork(8);

    const row = panel.querySelector('.axis-controls-panel__extra-row');
    expect(row).toBeTruthy();
    const valueInput = row.querySelector('input[type="number"]');
    const textInput = row.querySelector('input[type="text"]');
    const toggles = row.querySelectorAll('input[type="checkbox"]');
    expect(valueInput).toBeTruthy();
    expect(textInput).toBeTruthy();
    expect(toggles.length).toBe(2);

    valueInput.value = '60';
    valueInput.dispatchEvent(new Event('change', { bubbles: true }));
    toggles[1].checked = true;
    toggles[1].dispatchEvent(new Event('change', { bubbles: true }));
    textInput.value = 'Goal';
    textInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(10);

    const lineComponent = window.Components?.line;
    expect(lineComponent).toBeTruthy();
    const payload = lineComponent.getPayload?.();
    expect(payload?.config?.axis?.additionalTicks?.y).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: 60,
        showTick: false,
        showLine: true,
        label: 'Goal'
      })
    ]));

    lineComponent.loadFromPayload(payload);
    await flushAsyncWork(10);
    const reloadedPayload = lineComponent.getPayload?.();
    expect(reloadedPayload?.config?.axis?.additionalTicks?.y?.length).toBe(1);
    expect(reloadedPayload?.config?.axis?.additionalTicks?.y?.[0]?.label).toBe('Goal');
  });

  test('Line Graph: statistics require manual trigger', async () => {
    const cleanupJStat = ensureJStatStub();
    try {
      await activateWorkspace('line');
      const loadBtn = document.getElementById('lineLoadExample');
      expect(loadBtn).toBeTruthy();
      loadBtn.click();
      await flushAsyncWork(50);

      const statsButton = document.getElementById('lineComputeStats');
      const statsStatus = document.getElementById('lineStatsStatus');
      const statsResults = document.getElementById('lineStatsResults');
      expect(statsButton).toBeTruthy();
      expect(statsStatus).toBeTruthy();
      expect(statsResults).toBeTruthy();
      expect(statsButton.disabled).toBe(false);
      expect(statsButton.textContent).toBe('Calculate statistics');
      expect(statsStatus.textContent).toBe('Statistics ready to calculate.');
      expect(statsResults.textContent).toContain('Statistics will appear after calculation.');

      statsButton.click();
      await flushAsyncWork(30);

      expect(statsStatus.textContent).toBe('Statistics up to date.');
      expect(statsButton.disabled).toBe(false);
      expect(statsButton.textContent).toBe('Recalculate statistics');
      const renderedTable = statsResults.querySelector('table');
      expect(renderedTable).toBeTruthy();
      expect(statsResults.textContent).toContain('Series');
    }finally{
      cleanupJStat();
    }
  });

  test('Box Plot: assumption warnings surface for non-normal data', async () => {
    const cleanupJStat = ensureJStatStub();
    try {
      await activateWorkspace('box');
      const boxComponent = window.Components?.box;
      expect(boxComponent).toBeTruthy();
      await new Promise(resolve => setTimeout(resolve, 0));
      const state = boxComponent.__getState?.();
      expect(state?.hot).toBeTruthy();

      const skewedData = [
        ['Normal', 'Skewed'],
        [10, 10],
        [11, 10],
        [9, 10],
        [12, 10],
        [10, 220],
        [11, 240],
        [10, 210],
        [12, 230],
        [9, 215],
        [11, 205],
        [10, 225]
      ];
      state.hot.loadData(skewedData);
      state.selectedCols.clear();
      state.selectedCols.add(0);
      state.selectedCols.add(1);
      state.statsTest = 'parametric';
      state.statsMode = 'all';
      state.statsPaired = false;

      window.Components.box.draw();
      await new Promise(resolve => setTimeout(resolve, 0));

      const computeBtn = document.getElementById('boxComputeStats');
      expect(computeBtn).toBeTruthy();
      computeBtn.click();
      await new Promise(resolve => setTimeout(resolve, 0));

      const statsResults = document.getElementById('statsResults');
      const updatedState = window.Components.box.__getState?.();
      const diagnostics = updatedState?.assumptionDiagnostics || null;
      if(diagnostics){
        expect(Array.isArray(diagnostics.warnings || [])).toBe(true);
      }
      const assumptionSection = statsResults?.querySelector('.stats-assumption-section');
      if(assumptionSection){
        const badges = Array.from(assumptionSection.querySelectorAll('.assumption-badge'));
        const failBadges = Array.from(assumptionSection.querySelectorAll('.assumption-badge[data-result="fail"]'));
        expect(badges.length).toBeGreaterThan(0);
        const warningTexts = Array.from(assumptionSection.querySelectorAll('.assumption-warning')).map(el => el.textContent || '');
        expect(Array.isArray(warningTexts)).toBe(true);
        expect(failBadges.length + warningTexts.length).toBeGreaterThan(0);
      } else {
        expect(diagnostics || statsResults?.textContent || '').toBeTruthy();
      }
    } finally {
      cleanupJStat();
    }
  });

  test('Box Plot: grouped mode uses group + condition header rows and removes manual group list controls', async () => {
    await activateWorkspace('box');
    await flushAsyncWork(20);

    const boxComponent = window.Components?.box;
    expect(boxComponent).toBeTruthy();
    const state = boxComponent.__getState?.();
    const hot = state?.hot;
    expect(hot).toBeTruthy();

    const formatSelect = document.getElementById('boxTableFormat');
    expect(formatSelect).toBeTruthy();
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(40);
    const groupedInitial = hot.getData?.() || [];
    expect(String(groupedInitial?.[0]?.[0] || '')).toMatch(/group|control|^$/i);
    expect(String(groupedInitial?.[0]?.[3] || '')).toMatch(/group|treated|^$/i);
    expect(String(groupedInitial?.[1]?.[0] || '')).toMatch(/condition|baseline|^$/i);
    expect(String(groupedInitial?.[1]?.[3] || '')).toMatch(/condition|baseline|^$/i);

    expect(document.getElementById('boxGroupedList')).toBeNull();
    expect(document.getElementById('boxGroupedAdd')).toBeNull();
    expect(document.getElementById('boxGroupedRemove')).toBeNull();

    const replicatesInput = document.getElementById('boxGroupedReplicates');
    expect(replicatesInput).toBeTruthy();
    replicatesInput.value = '3';
    replicatesInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(40);

    hot.loadData([
      ['Control', '', '', 'Treated', '', ''],
      ['Baseline', 'Week 1', 'Week 2', '', '', ''],
      [10, 11, 12, 20, 21, 22],
      [13, 14, 15, 23, 24, 25]
    ]);
    await flushAsyncWork(60);

    const matrix = hot.getData?.() || [];
    expect(String(matrix?.[0]?.[0] || '')).toBe('Control');
    expect(String(matrix?.[0]?.[1] || '')).toBe('');
    expect(String(matrix?.[0]?.[3] || '')).toBe('Treated');
    expect(String(matrix?.[0]?.[4] || '')).toBe('');
    expect(String(matrix?.[1]?.[0] || '')).toBe('Baseline');
    expect(String(matrix?.[1]?.[1] || '')).toBe('Week 1');
    expect(String(matrix?.[1]?.[2] || '')).toBe('Week 2');
    expect(String(matrix?.[1]?.[3] || '')).toBe('Baseline');
    expect(String(matrix?.[1]?.[4] || '')).toBe('Week 1');
    expect(String(matrix?.[1]?.[5] || '')).toBe('Week 2');

    hot.setDataAtCell?.(1, 4, 'Day 7');
    await flushAsyncWork(40);
    const synced = hot.getData?.() || [];
    expect(String(synced?.[1]?.[1] || '')).toBe('Day 7');
    expect(String(synced?.[1]?.[4] || '')).toBe('Day 7');

    const payload = boxComponent.getPayload?.();
    expect(payload?.config?.tableFormat).toBe('grouped');
    expect(payload?.config?.grouped?.replicatesPerGroup).toBe(3);
    expect(payload?.config?.grouped?.groups).toEqual(['Control', 'Treated']);
    expect(payload?.config?.grouped?.conditions).toEqual(['Baseline', 'Day 7', 'Week 2']);

    boxComponent.loadFromPayload(payload);
    await flushAsyncWork(60);
    const reloaded = hot.getData?.() || [];
    expect(String(reloaded?.[0]?.[0] || '')).toBe('Control');
    expect(String(reloaded?.[0]?.[3] || '')).toBe('Treated');
    expect(String(reloaded?.[1]?.[0] || '')).toBe('Baseline');
    expect(String(reloaded?.[1]?.[1] || '')).toBe('Day 7');
    expect(String(reloaded?.[1]?.[2] || '')).toBe('Week 2');
    expect(String(reloaded?.[1]?.[4] || '')).toBe('Day 7');
  }, 20000);

  test('Box Plot: grouped replicates show a Prism-style movable legend by default', async () => {
    await activateWorkspace('box');
    await flushAsyncWork(20);

    const boxComponent = window.Components?.box;
    const state = boxComponent?.__getState?.();
    const hot = state?.hot;
    expect(hot).toBeTruthy();

    const legendToggle = document.getElementById('boxShowLegend');
    const formatSelect = document.getElementById('boxTableFormat');
    const graphTypeSelect = document.getElementById('boxGraphType');
    expect(legendToggle).toBeTruthy();
    expect(formatSelect).toBeTruthy();
    expect(graphTypeSelect).toBeTruthy();
    expect(legendToggle.closest('.resizer-options-menu')).toBeTruthy();
    expect(legendToggle.closest('.resizer-legend-control')).toBeTruthy();
    expect(legendToggle.checked).toBe(false);

    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    graphTypeSelect.value = 'bar';
    graphTypeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(40);
    expect(legendToggle.checked).toBe(true);

    hot.loadData([
      ['Control', '', '', 'Treated', '', ''],
      ['Week 1', 'Week 2', 'Week 3', 'Week 1', 'Week 2', 'Week 3'],
      [23, 24, 21, 80, 30, 67],
      [21, 23, 25, 84, 31, 68],
      [19, 25, 27, 82, 29, 66],
      [22, 26, 24, 86, 32, 69]
    ]);
    await flushAsyncWork(80);
    await boxComponent.draw?.({ reason: 'test-box-legend' });
    await flushAsyncWork(80);

    const legend = document.querySelector('#boxPlot svg g[data-box-legend="1"]');
    expect(legend).toBeTruthy();
    expect(legend.getAttribute('transform')).toMatch(/^translate\(/);
    expect(Array.from(legend.querySelectorAll('text')).map(node => node.textContent)).toEqual(['Control', 'Treated']);

    const swatches = Array.from(legend.querySelectorAll('rect[data-legend-key]'));
    expect(swatches.length).toBe(2);
    swatches.forEach(swatch => {
      expect(Number(swatch.getAttribute('width'))).toBeGreaterThan(Number(swatch.getAttribute('height')));
      expect(swatch.getAttribute('fill')).toBeTruthy();
      expect(swatch.getAttribute('stroke')).toBeTruthy();
      expect(Number(swatch.getAttribute('stroke-width'))).toBeGreaterThan(0);
    });
    const firstSwatch = swatches[0];
    const matchingGraphRect = Array.from(document.querySelectorAll('#boxPlot svg rect:not([data-legend-key])')).find(rect => (
      rect.getAttribute('fill') === firstSwatch.getAttribute('fill')
    ));
    expect(matchingGraphRect).toBeTruthy();

    let payload = boxComponent.getPayload?.();
    expect(payload?.config?.showLegend).toBe(true);
    legendToggle.checked = false;
    legendToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(40);
    expect(document.querySelector('#boxPlot svg g[data-box-legend="1"]')).toBeNull();
    payload = boxComponent.getPayload?.();
    expect(payload?.config?.showLegend).toBe(false);
    boxComponent.loadFromPayload(payload);
    await flushAsyncWork(60);
    expect(document.getElementById('boxShowLegend')?.checked).toBe(false);
  }, 20000);

  test('Scatter Plot: additional axis ticks/lines persist from FORMAT controls', async () => {
    await activateWorkspace('scatter');
    await flushAsyncWork(20);
    const loadBtn = document.getElementById('scatterLoadExample');
    expect(loadBtn).toBeTruthy();
    loadBtn.click();
    await flushAsyncWork(60);

    let svg = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      svg = document.querySelector('#scatterPlot svg');
      if (svg) {
        break;
      }
      window.Components?.scatter?.draw?.();
      await flushAsyncWork(20);
    }
    expect(svg).toBeTruthy();
    const initialYTickTexts = Array.from(svg.querySelectorAll('text[text-anchor="end"]'))
      .filter(el => (el.getAttribute('dominant-baseline') || '').toLowerCase() === 'middle')
      .filter(el => Number.isFinite(Number((el.textContent || '').trim())));
    const targetTickEl = initialYTickTexts[0] || null;
    const targetTickValue = targetTickEl ? Number((targetTickEl.textContent || '').trim()) : 2;
    const targetTickY = targetTickEl ? Number(targetTickEl.getAttribute('y')) : null;
    const axisLines = Array.from(svg.querySelectorAll('line[data-axis-control="1"]'));
    const yAxisLine = axisLines.find(line => {
      const x1 = line.getAttribute('x1');
      const x2 = line.getAttribute('x2');
      const stroke = (line.getAttribute('stroke') || '').toLowerCase();
      return x1 != null && x1 === x2 && stroke !== 'transparent';
    });
    expect(yAxisLine).toBeTruthy();
    yAxisLine.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsyncWork(8);

    const panel = document.querySelector('.axis-controls-panel');
    expect(panel && panel.dataset.open === '1').toBe(true);
    const extraButton = panel.querySelector('.axis-controls-panel__button--additional-ticks');
    expect(extraButton).toBeTruthy();
    extraButton.click();
    await flushAsyncWork(4);

    const addButton = panel.querySelector('.axis-controls-panel__button--add-extra');
    expect(addButton).toBeTruthy();
    addButton.click();
    await flushAsyncWork(8);

    const row = panel.querySelector('.axis-controls-panel__extra-row');
    expect(row).toBeTruthy();
    const valueInput = row.querySelector('input[type="number"]');
    const textInput = row.querySelector('input[type="text"]');
    const toggles = row.querySelectorAll('input[type="checkbox"]');
    expect(valueInput).toBeTruthy();
    expect(textInput).toBeTruthy();
    expect(toggles.length).toBe(2);

    valueInput.value = String(targetTickValue);
    valueInput.dispatchEvent(new Event('change', { bubbles: true }));
    toggles[1].checked = true;
    toggles[1].dispatchEvent(new Event('change', { bubbles: true }));
    textInput.value = 'Cutoff';
    textInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(10);

    if(Number.isFinite(targetTickY)){
      const overlapTexts = Array.from(document.querySelectorAll('#scatterPlot svg text[text-anchor="end"]'))
        .filter(el => (el.getAttribute('dominant-baseline') || '').toLowerCase() === 'middle')
        .filter(el => Math.abs(Number(el.getAttribute('y')) - targetTickY) <= 0.75);
      expect(overlapTexts.length).toBe(1);
      expect((overlapTexts[0].textContent || '').trim()).toBe('Cutoff');
    }

    const scatterComponent = window.Components?.scatter;
    expect(scatterComponent).toBeTruthy();
    const payload = scatterComponent.getPayload?.();
    expect(payload?.config?.axis?.additionalTicks?.y).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: targetTickValue,
        showTick: false,
        showLine: true,
        label: 'Cutoff'
      })
    ]));

    scatterComponent.loadFromPayload(payload);
    await flushAsyncWork(10);
    const reloadedPayload = scatterComponent.getPayload?.();
    expect(reloadedPayload?.config?.axis?.additionalTicks?.y?.length).toBe(1);
    expect(reloadedPayload?.config?.axis?.additionalTicks?.y?.[0]?.label).toBe('Cutoff');
  }, 20000);

  test('Scatter Plot: statistics require manual compute', async () => {
    const cleanupJStat = ensureJStatStub();
    try {
      await activateWorkspace('scatter');
      await flushAsyncWork();
      const loadBtn = document.getElementById('scatterLoadExample');
      expect(loadBtn).toBeTruthy();
      loadBtn.click();
      await flushAsyncWork(60);

      const statusEl = document.getElementById('scatterStatsStatus');
      expect(statusEl?.textContent || '').toMatch(/ready/i);

      const computeBtn = document.getElementById('scatterComputeStats');
      expect(computeBtn).toBeTruthy();
      expect(computeBtn.disabled).toBe(false);

      computeBtn.click();
      await flushAsyncWork(10);

      let statsTable = document.querySelector('#scatterStatsResults table');
      for(let i = 0; i < 30 && !statsTable; i += 1){
        await flushAsyncWork(5);
        statsTable = document.querySelector('#scatterStatsResults table');
      }
      expect(statsTable).toBeTruthy();
      const rows = statsTable?.querySelectorAll('tbody tr');
      expect(rows?.length || 0).toBeGreaterThan(2);
      expect(statusEl?.textContent || '').toMatch(/up to date/i);
    } finally {
      cleanupJStat();
    }
  }, 20000);

  test('Scatter Plot: grouped replicates render error bars and persist grouped payload settings', async () => {
    await activateWorkspace('scatter');
    await flushAsyncWork(20);

    const scatterComponent = window.Components?.scatter;
    expect(scatterComponent).toBeTruthy();
    const hot = scatterComponent?.__ensureHotForActiveTab?.();
    expect(hot).toBeTruthy();

    const formatSelect = document.getElementById('scatterTableFormat');
    expect(formatSelect).toBeTruthy();
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(30);

    const replicatesInput = document.getElementById('scatterReplicates');
    expect(replicatesInput).toBeTruthy();
    replicatesInput.value = '3';
    replicatesInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(30);

    hot.loadData([
      ['Labels', 'X title', 'Rep 1', 'Rep 2', 'Rep 3', 'Rep 1', 'Rep 2', 'Rep 3'],
      ['A', 1, 10, 11, 12, 20, 21, 22],
      ['B', 2, 13, '', 15, 24, 25, 26],
      ['', '', '', '', '', '', '', '']
    ]);
    await flushAsyncWork(40);

    const showErrorBars = document.getElementById('scatterShowErrorBars');
    expect(showErrorBars).toBeTruthy();
    showErrorBars.checked = true;
    showErrorBars.dispatchEvent(new Event('change', { bubbles: true }));

    const errorBarWidth = document.getElementById('scatterErrorBarWidth');
    expect(errorBarWidth).toBeTruthy();
    errorBarWidth.value = '2';
    errorBarWidth.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsyncWork(80);

    const svg = document.querySelector('#scatterPlot svg');
    expect(svg).toBeTruthy();
    const pointLayer = svg.querySelector('[data-layer="points"]');
    expect(pointLayer).toBeTruthy();
    expect(pointLayer.querySelectorAll('*').length).toBeGreaterThanOrEqual(4);
    const errorLayer = svg.querySelector('[data-layer="error-bars"]');
    expect(errorLayer).toBeTruthy();
    expect(errorLayer.querySelectorAll('line').length).toBeGreaterThan(0);
    const groupedHeaderRow = hot.getData?.()?.[0] || [];
    expect(String(groupedHeaderRow?.[2] || '')).toMatch(/rep|group|control|treatment|y title/i);

    const payload = scatterComponent.getPayload?.();
    expect(payload?.config?.tableFormat).toBe('grouped');
    expect(payload?.config?.replicates).toBe(3);
    expect(Array.isArray(payload?.config?.groupLabels)).toBe(true);
    expect((payload?.config?.groupLabels || []).length).toBeGreaterThanOrEqual(2);
    expect(payload?.config?.showErrorBars).toBe(true);
    expect(String(payload?.config?.errorBarWidth)).toBe('2');

    scatterComponent.loadFromPayload(payload);
    await flushAsyncWork(40);

    expect(document.getElementById('scatterTableFormat')?.value).toBe('grouped');
    expect(document.getElementById('scatterReplicates')?.value).toBe('3');
    expect(document.getElementById('scatterShowErrorBars')?.checked).toBe(false);
    expect(document.getElementById('scatterShowGroupedReplicates')?.checked).toBe(true);
  }, 20000);

  test('Scatter Plot: grouped replicates can show individual values without horizontal jitter and hide the toggle when X replicates are enabled', async () => {
    await activateWorkspace('scatter');
    await flushAsyncWork(20);

    const scatterComponent = window.Components?.scatter;
    expect(scatterComponent).toBeTruthy();
    const hot = scatterComponent?.__ensureHotForActiveTab?.();
    expect(hot).toBeTruthy();

    const formatSelect = document.getElementById('scatterTableFormat');
    expect(formatSelect).toBeTruthy();
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(30);

    const replicatesInput = document.getElementById('scatterReplicates');
    expect(replicatesInput).toBeTruthy();
    replicatesInput.value = '3';
    replicatesInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(30);

    hot.loadData([
      ['Labels', 'X title', 'Rep 1', 'Rep 2', 'Rep 3', 'Rep 1', 'Rep 2', 'Rep 3'],
      ['A', 1, 10, 11, 12, 20, 21, 22],
      ['B', 2, 13, 14, 15, 24, 25, 26],
      ['', '', '', '', '', '', '', '']
    ]);
    await flushAsyncWork(80);

    const groupedReplicateToggle = document.getElementById('scatterShowGroupedReplicates');
    const groupedReplicateToggleRow = document.getElementById('scatterShowGroupedReplicatesRow');
    expect(groupedReplicateToggle).toBeTruthy();
    expect(groupedReplicateToggleRow).toBeTruthy();
    expect(groupedReplicateToggle.disabled).toBe(false);
    expect(groupedReplicateToggleRow.style.display).not.toBe('none');
    expect(groupedReplicateToggle.checked).toBe(true);

    const getPointLayer = () => document.querySelector('#scatterPlot svg [data-layer="points"]');
    const expandedLayerBase = getPointLayer();
    expect(expandedLayerBase).toBeTruthy();
    const expandedPointCountBase = expandedLayerBase.querySelectorAll('*').length;
    expect(expandedPointCountBase).toBeGreaterThan(0);

    groupedReplicateToggle.checked = false;
    groupedReplicateToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(80);

    const collapsedLayer = getPointLayer();
    expect(collapsedLayer).toBeTruthy();
    const collapsedPointCount = collapsedLayer.querySelectorAll('*').length;
    expect(collapsedPointCount).toBeLessThan(expandedPointCountBase);

    groupedReplicateToggle.checked = true;
    groupedReplicateToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(80);

    const expandedLayer = getPointLayer();
    expect(expandedLayer).toBeTruthy();
    const expandedPointCount = expandedLayer.querySelectorAll('*').length;
    expect(expandedPointCount).toBeGreaterThan(collapsedPointCount);

    const cxValues = Array.from(expandedLayer.querySelectorAll('[cx]'))
      .map(node => Number(node.getAttribute('cx')))
      .filter(value => Number.isFinite(value));
    const uniqueX = new Set(cxValues.map(value => value.toFixed(3)));
    expect(uniqueX.size).toBe(2);

    const xRepToggle = document.getElementById('scatterGroupedXReplicates');
    expect(xRepToggle).toBeTruthy();
    xRepToggle.checked = true;
    xRepToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(60);

    expect(groupedReplicateToggleRow.style.display).toBe('none');
    expect(groupedReplicateToggle.disabled).toBe(true);
  }, 20000);

  test('Scatter Plot: grouped X replicates support horizontal error bars and grouped example headers', async () => {
    await activateWorkspace('scatter');
    await flushAsyncWork(20);

    const scatterComponent = window.Components?.scatter;
    expect(scatterComponent).toBeTruthy();
    const hot = scatterComponent?.__ensureHotForActiveTab?.();
    expect(hot).toBeTruthy();

    const formatSelect = document.getElementById('scatterTableFormat');
    expect(formatSelect).toBeTruthy();
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(30);

    const replicatesInput = document.getElementById('scatterReplicates');
    expect(replicatesInput).toBeTruthy();
    replicatesInput.value = '3';
    replicatesInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(30);

    const xRepToggle = document.getElementById('scatterGroupedXReplicates');
    expect(xRepToggle).toBeTruthy();
    xRepToggle.checked = true;
    xRepToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(40);

    const loadExampleBtn = document.getElementById('scatterLoadExample');
    expect(loadExampleBtn).toBeTruthy();
    loadExampleBtn.click();
    await flushAsyncWork(80);

    const matrix = hot.getData?.() || [];
    expect(String(matrix?.[0]?.[1] || '')).toMatch(/x title|x rep 1/i);
    expect(String(matrix?.[0]?.[2] || '')).toBe('');
    expect(String(matrix?.[0]?.[4] || '')).toMatch(/control|series/i);
    expect(String(matrix?.[0]?.[5] || '')).toBe('');
    const groupedHeaders = hot.getData?.()?.[0] || [];
    expect(String(groupedHeaders?.[2] || '')).toMatch(/x rep 2|rep 2|^$/i);
    expect(String(groupedHeaders?.[4] || '')).toMatch(/group|control|treatment|series/i);

    const showErrorBars = document.getElementById('scatterShowErrorBars');
    expect(showErrorBars).toBeTruthy();
    showErrorBars.checked = true;
    showErrorBars.dispatchEvent(new Event('change', { bubbles: true }));
    const errorBarWidth = document.getElementById('scatterErrorBarWidth');
    expect(errorBarWidth).toBeTruthy();
    errorBarWidth.value = '2';
    errorBarWidth.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsyncWork(80);

    const svg = document.querySelector('#scatterPlot svg');
    expect(svg).toBeTruthy();
    const errorLayer = svg.querySelector('[data-layer="error-bars"]');
    expect(errorLayer).toBeTruthy();
    const lines = Array.from(errorLayer.querySelectorAll('line'));
    expect(lines.length).toBeGreaterThan(0);
    const hasVertical = lines.some(line => line.getAttribute('x1') === line.getAttribute('x2') && line.getAttribute('y1') !== line.getAttribute('y2'));
    const hasHorizontal = lines.some(line => line.getAttribute('y1') === line.getAttribute('y2') && line.getAttribute('x1') !== line.getAttribute('x2'));
    expect(hasVertical).toBe(true);
    expect(hasHorizontal).toBe(true);

    const payload = scatterComponent.getPayload?.();
    expect(payload?.config?.tableFormat).toBe('grouped');
    expect(payload?.config?.replicates).toBe(3);
    expect(payload?.config?.xReplicates).toBe(true);
    scatterComponent.loadFromPayload(payload);
    await flushAsyncWork(40);
    expect(document.getElementById('scatterGroupedXReplicates')?.checked).toBe(true);
  }, 15000);

  test('Scatter Plot: Volcano example draws points', async () => {
    await activateWorkspace('scatter');
    await flushAsyncWork();

    const applyVariant = window.Main?.graphVariants?.applyVariant;
    if (typeof applyVariant === 'function') {
      applyVariant('scatter:volcano');
    } else {
      const typeSelect = document.getElementById('scatterGraphType');
      expect(typeSelect).toBeTruthy();
      typeSelect.value = 'volcano';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const loadBtn = document.getElementById('scatterLoadExample');
    expect(loadBtn).toBeTruthy();
    loadBtn.click();
    await flushAsyncWork(20);

    let svg = document.querySelector('#scatterPlot svg');
    for (let i = 0; i < 50 && !svg; i += 1) {
      await flushAsyncWork(5);
      svg = document.querySelector('#scatterPlot svg');
    }
    expect(svg).toBeTruthy();

    const pointLayer = svg.querySelector('[data-layer="points"]');
    expect(pointLayer).toBeTruthy();
    expect(pointLayer.querySelectorAll('*').length).toBeGreaterThan(0);
  }, 10000);

  test('Scatter Plot: MA example draws points', async () => {
    await activateWorkspace('scatter');
    await flushAsyncWork();

    const applyVariant = window.Main?.graphVariants?.applyVariant;
    if (typeof applyVariant === 'function') {
      applyVariant('scatter:ma');
    } else {
      const typeSelect = document.getElementById('scatterGraphType');
      expect(typeSelect).toBeTruthy();
      typeSelect.value = 'ma';
      typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    const loadBtn = document.getElementById('scatterLoadExample');
    expect(loadBtn).toBeTruthy();
    loadBtn.click();
    await flushAsyncWork(20);

    let svg = document.querySelector('#scatterPlot svg');
    for (let i = 0; i < 50 && !svg; i += 1) {
      await flushAsyncWork(5);
      svg = document.querySelector('#scatterPlot svg');
    }
    expect(svg).toBeTruthy();

    const pointLayer = svg.querySelector('[data-layer="points"]');
    expect(pointLayer).toBeTruthy();
    expect(pointLayer.querySelectorAll('*').length).toBeGreaterThan(0);
  }, 10000);

  test('Histogram: Load Example populates data', async () => {
    await activateWorkspace('hist');
    const btn = document.getElementById('histLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__GRID_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'histHot');
    expect(loads.length).toBeGreaterThan(0);
    const populated = loads.find(call => Array.isArray(call.firstRow) && call.firstRow.includes('Exam Score'));
    expect(populated?.firstRow).toEqual(expect.arrayContaining(['Exam Score']));
    await flushAsyncWork();
  });

  test('Proportion Graph: Load Example populates data', async () => {
    await activateWorkspace('pie');
    const btn = document.getElementById('pieLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__GRID_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'pieHot');
    expect(loads.length).toBeGreaterThan(0);
    const populated = loads.find(call => {
      if (!Array.isArray(call.firstRow)) return false;
      return ['Quarter', 'Observed', 'Expected'].every(label => call.firstRow.includes(label));
    });
    expect(populated?.firstRow).toEqual(expect.arrayContaining(['Quarter', 'Observed', 'Expected']));
    await flushAsyncWork();
  });

  test('Correlation Heatmap: Load Example populates data', async () => {
    await activateWorkspace('heatmap');
    const btn = document.getElementById('heatmapLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__GRID_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'heatmapHot');
    expect(loads.length).toBeGreaterThan(0);
    const populated = loads.find(call => {
      if (!Array.isArray(call.firstRow)) return false;
      return ['Gene', 'Baseline_A', 'Stress_A'].every(label => call.firstRow.includes(label));
    });
    expect(populated?.firstRow).toEqual(expect.arrayContaining(['Gene', 'Baseline_A', 'Stress_A']));
    let overlayCleared = false;
    for(let i = 0; i < 80; i += 1){
      await flushAsyncWork(4);
      const overlay = document.querySelector('#heatmapGraphPanel .venn-loading-overlay');
      const visible = !!overlay
        && overlay.hidden !== true
        && overlay.getAttribute('aria-hidden') !== 'true'
        && overlay.classList.contains('is-visible');
      if(!visible){
        overlayCleared = true;
        break;
      }
    }
    expect(overlayCleared).toBe(true);
  });

  test('Surface Plot: Load Example populates data', async () => {
    await activateWorkspace('surface');
    const btn = document.getElementById('surfaceLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__GRID_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'surfaceHot');
    expect(loads.length).toBeGreaterThan(0);
  });

  test('ROC: Load Example populates data', async () => {
    const cleanupJStat = ensureJStatStub();
    try {
      await activateWorkspace('roc');
      const btn = document.getElementById('rocLoadExample');
      expect(btn).toBeTruthy();
      btn.click();
      await flushAsyncWork();
      const loads = (global.__GRID_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'rocHot');
      expect(loads.length).toBeGreaterThan(0);
      const firstRow = loads[loads.length - 1].firstRow;
      expect(firstRow).toEqual(expect.arrayContaining(['Label', 'Model1', 'Model2']));
      await flushAsyncWork();
    } finally {
      cleanupJStat();
    }
  });

  test('ROC stats escape series names that look like HTML', async () => {
    const cleanupJStat = ensureJStatStub();
    try {
      await activateWorkspace('roc');
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
      expect(statsResults.textContent || '').toContain(htmlName);
      expect(statsResults.querySelector('em')).toBeNull();
      expect(statsResults.innerHTML).toContain('&lt;em&gt;');
    } finally {
      cleanupJStat();
    }
  });

  test('Survival: Load Example populates data', async () => {
    await activateWorkspace('survival');
    const btn = document.getElementById('survivalLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__GRID_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'survivalHot');
    expect(loads.length).toBeGreaterThan(0);
    const populated = loads.find(call => Array.isArray(call.firstRow) && call.firstRow[0] === 'Control');
    expect(populated?.firstRow).toEqual(['Control', 1.2, 1]);
    await flushAsyncWork();
  });

  test('Survival: Cox model handles 1200 rows promptly', async () => {
    await activateWorkspace('survival');
    const comp = window.Components?.survival;
    expect(comp).toBeTruthy();
    const state = comp?.__getState?.();
    expect(state?.hot).toBeTruthy();

    const bigDataset = [];
    const rows = 1200;
    for(let i = 0; i < rows; i += 1){
      const group = i % 2 === 0 ? 'Control' : 'Treatment';
      const cycle = Math.floor(i / 200);
      const baseTime = (i % 200) / 10 + 0.5 + cycle * 0.1;
      const event = i % 3 === 0 ? 1 : 0;
      const entry = event ? 0 : Math.max(0, baseTime - 0.25);
      bigDataset.push([group, Number(baseTime.toFixed(3)), event, Number(entry.toFixed(3))]);
    }
    state.hot.loadData(bigDataset);
    const coxToggle = document.getElementById('survivalFitCox');
    expect(coxToggle).toBeTruthy();
    coxToggle.checked = true;
    const loadedData = state.hot.getData();
    expect(Array.isArray(loadedData)).toBe(true);
    expect(loadedData.length).toBe(rows);
    expect(loadedData[0][0]).toBe('Control');
    expect(typeof loadedData[0][1]).toBe('number');
    expect(typeof loadedData[0][2]).toBe('number');
    const directSummary = window.Components.survival.__testHooks?.collectSeries?.();
    expect(directSummary?.series?.length).toBeGreaterThan(1);
    const start = Date.now();
    window.Components.survival.draw();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2500);
    const summary = state.lastSummary;
    await flushAsyncWork();
    expect(Array.isArray(summary?.series)).toBe(true);
    expect(summary.series.length).toBeGreaterThan(1);
    expect(summary?.flags?.coxEnabled).toBe(true);
    expect(summary?.coxModel?.available).toBe(true);
    expect(summary?.coxModel?.debug?.recordCount).toBe(rows);
    expect(summary?.coxModel?.debug?.eventGroupCount).toBeGreaterThan(0);
    expect(summary?.coxModel?.debug?.maxRiskCount).toBeGreaterThan(0);
    const prepared = window.Components.survival.__testHooks?.prepareCoxData(summary);
    expect(prepared?.available).toBe(true);
    expect(Array.isArray(prepared?.eventsByTime)).toBe(true);
    expect(prepared.eventsByTime.every(evt => evt && evt.riskSet === undefined)).toBe(true);
    expect(prepared.entryOrder.length).toBe(prepared.data.length);
  });

  test('Color picker overlay opens on color input click', async () => {
    await activateWorkspace('venn');
    const colorA = document.getElementById('colorA');
    expect(colorA).toBeTruthy();
    // Find overlay (the shared picker appended directly under body)
    const overlay = document.querySelector('body > .shared-color-picker');
    expect(overlay).toBeTruthy();
    expect(overlay.style.display).toBe('none');

    // Dispatch click
    const evt = new window.Event('click', { bubbles: true, cancelable: true });
    colorA.dispatchEvent(evt);

    // Overlay should be shown
    expect(overlay.style.display).toBe('block');
    expect(overlay.dataset.visible).toBe('1');
  });

  test('Panel resizer drag triggers Shared.syncPanelWidths', async () => {
    await activateWorkspace('box');
    const resizer = document.getElementById('boxPanelResizer');
    expect(resizer).toBeTruthy();
    const syncSpy = jest.spyOn(window.Shared, 'syncPanelWidths');

    const pointerDown = new window.MouseEvent('pointerdown', { bubbles: true, clientX: 150 });
    resizer.dispatchEvent(pointerDown);

    const pointerMove = new window.MouseEvent('pointermove', { bubbles: true, clientX: 180 });
    document.dispatchEvent(pointerMove);

    const pointerUp = new window.MouseEvent('pointerup', { bubbles: true, clientX: 180 });
    document.dispatchEvent(pointerUp);

    expect(syncSpy).toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  test('Venn GO analysis results persist when repopulating the same region', async () => {
    await activateWorkspace('venn');
    const hooks = window.Components?.venn?.__testHooks;
    expect(hooks).toBeTruthy();
    const { state, populateRegion } = hooks;
    state.analysis.lastRegionSignature = null;
    state.analysis.lastRegionCode = null;
    state.analysis.lastRegions = {
      Aonly: new Set(['BRCA1', 'ATM']),
      Bonly: new Set(),
      Conly: new Set(),
      AB: new Set(),
      AC: new Set(),
      BC: new Set(),
      ABC: new Set()
    };
    state.ui.regionList = document.createElement('div');
    state.ui.copyRegionBtn = document.createElement('button');
    state.ui.goResults = document.createElement('div');
    state.ui.stringResults = document.createElement('div');
    state.ui.stringNetwork = document.createElement('div');
    state.ui.goChartExport = document.createElement('div');
    state.ui.stringNetworkExport = document.createElement('div');

    populateRegion('A');
    state.ui.goResults.innerHTML = 'DNA repair';
    populateRegion('A');

    expect(state.ui.goResults.innerHTML).toBe('DNA repair');
  });

  test('Venn STRING analysis results persist when repopulating the same region', async () => {
    await activateWorkspace('venn');
    const hooks = window.Components?.venn?.__testHooks;
    expect(hooks).toBeTruthy();
    const { state, populateRegion } = hooks;
    state.analysis.lastRegionSignature = null;
    state.analysis.lastRegionCode = null;
    state.analysis.lastRegions = {
      Aonly: new Set(['BRCA1', 'ATM']),
      Bonly: new Set(['CBX2']),
      Conly: new Set(),
      AB: new Set(['BAP1']),
      AC: new Set(),
      BC: new Set(),
      ABC: new Set(['RING1B'])
    };
    state.ui.regionList = document.createElement('div');
    state.ui.copyRegionBtn = document.createElement('button');
    state.ui.goResults = state.ui.goResults || document.createElement('div');
    state.ui.stringResults = document.createElement('div');
    state.ui.stringNetwork = document.createElement('div');
    state.ui.goChartExport = state.ui.goChartExport || document.createElement('div');
    state.ui.stringNetworkExport = document.createElement('div');

    populateRegion('A');
    state.ui.stringResults.innerHTML = '<strong>STRING enrichment</strong><div>Protein binding</div>';
    state.ui.stringNetwork.innerHTML = '<svg></svg>';
    populateRegion('A');

    expect(state.ui.stringResults.innerHTML).toContain('Protein binding');
    expect(state.ui.stringNetwork.innerHTML).toContain('<svg');
  });

  test('Venn detect species button triggers manual detection and indicator', async () => {
    await activateWorkspace('venn');
    const listA = document.getElementById('listA');
    const listB = document.getElementById('listB');
    const listC = document.getElementById('listC');
    const detectBtn = document.getElementById('detectSpeciesBtn');
    expect(listA && listB && listC && detectBtn).toBeTruthy();

    listA.value = 'BRCA1\nTP53';
    listB.value = 'ATM';
    listC.value = '';

    const originalFetch = global.fetch;
    const fetchMock = jest.fn((url) => {
      const gene = new URL(url).searchParams.get('q');
      return Promise.resolve({
        ok: true,
        json: async () => ({ hits: [{ symbol: gene, taxid: '9606' }] })
      });
    });
    global.fetch = fetchMock;

    try {
      detectBtn.click();
      await flushAsyncWork();
      await flushAsyncWork();

      expect(fetchMock).toHaveBeenCalled();
      const select = document.getElementById('speciesSelect');
      expect(select.value).toBe('hsapiens');
      expect(select.style.backgroundColor).toMatch(/b5d99c|rgb\(181, 217, 156\)/i);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('Venn species detection reuses cache without refetching', async () => {
    await activateWorkspace('venn');
    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();
    const listA = document.getElementById('listA');
    const listB = document.getElementById('listB');
    const listC = document.getElementById('listC');
    listA.value = 'BRCA1';
    listB.value = '';
    listC.value = '';

    const originalFetch = global.fetch;
    const fetchMock = jest.fn(() => Promise.resolve({
      ok: true,
      json: async () => ({ hits: [{ symbol: 'BRCA1', taxid: '9606' }] })
    }));
    global.fetch = fetchMock;

    try {
      await venn.recognizeSpeciesFromInput({ reason: 'cache-test' });
      await flushAsyncWork();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await venn.recognizeSpeciesFromInput({ reason: 'cache-test-repeat' });
      await flushAsyncWork();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('Venn species detection cancels in-flight requests when superseded', async () => {
    await activateWorkspace('venn');
    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();
    const listA = document.getElementById('listA');
    const listB = document.getElementById('listB');
    const listC = document.getElementById('listC');
    listA.value = 'BRCA1';
    listB.value = '';
    listC.value = '';

    const originalFetch = global.fetch;
    const pendingResolvers = [];
    const fetchMock = jest.fn((url, options = {}) => new Promise((resolve, reject) => {
      const gene = new URL(url).searchParams.get('q');
      if (options.signal) {
        if (options.signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      }
      pendingResolvers.push(() => resolve({
        ok: true,
        json: async () => ({ hits: [{ symbol: gene, taxid: '9606' }] })
      }));
    }));
    global.fetch = fetchMock;

    try {
      const detectionState = window.Components?.venn?.__testHooks?.state.analysis.speciesDetection;
      const fakeController = new AbortController();
      detectionState.active = { controller: fakeController, cacheKey: 'fake-cache', reason: 'pending' };

      const secondPromise = venn.recognizeSpeciesFromInput({ reason: 'second-detect' });
      await flushAsyncWork();

      expect(fakeController.signal.aborted).toBe(true);

      const select = document.getElementById('speciesSelect');
      expect(select.style.backgroundColor).toBe('');

      pendingResolvers.forEach(resolver => resolver());

      await secondPromise;

      expect(select.value).toBe('hsapiens');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
