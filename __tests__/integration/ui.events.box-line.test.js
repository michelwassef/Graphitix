'use strict';

const { ensureJStatStub, activateWorkspace, getExampleData, flushAsyncWork, awaitBoxReady } = require('../../test-support/uiEventsTestSetup');

describe('UI events: Box and Line', () => {

  test('Box Plot: Load Example populates data', async () => {
    await activateWorkspace('box');
    const btn = document.getElementById('boxLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__GRID_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'hot');
    const expectedHeader = getExampleData('box', 'single')[0];
    expect(loads.length).toBeGreaterThan(0);
    const populated = loads.find(call => JSON.stringify(call.firstRow) === JSON.stringify(expectedHeader));
    expect(populated?.firstRow).toEqual(expectedHeader);
    await flushAsyncWork();
  });

  test('component import opens the import wizard with a fixed graph type', async () => {
    await activateWorkspace('box');
    const input = document.getElementById('boxFile');
    const file = new File(['A,B\n1,2'], 'box-data.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });

    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(5);

    expect(document.getElementById('welcomeDataImportPrompt').hidden).toBe(false);
    expect(document.getElementById('welcomeDataImportComponentField').hidden).toBe(true);
    expect(document.getElementById('welcomeDataImportComponent').value).toBe('box');
    document.getElementById('welcomeDataImportCancel').click();
    await flushAsyncWork(2);
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
    const expected = getExampleData('box', 'grouped');
    expect(matrix.slice(0, 2)).toEqual(expected.slice(0, 2));
  });

  test('Box Plot: grouped example writes replacement headers to its owner session', async () => {
    await activateWorkspace('box');
    await awaitBoxReady('ui-events-box-grouped-replacement-start');

    const formatSelect = document.getElementById('boxTableFormat');
    expect(formatSelect).toBeTruthy();
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await awaitBoxReady('ui-events-box-grouped-replacement-format');

    const box = window.Components?.box;
    const hot = box?.__getState?.()?.hot;
    expect(hot).toBeTruthy();
    hot.loadData([
      ['Prior group A', '', '', 'Prior group B', '', '', 'Prior group C', '', '', 'Prior group D', '', ''],
      ['Prior week 1', 'Prior week 2', 'Prior week 3', 'Prior week 1', 'Prior week 2', 'Prior week 3', 'Prior week 1', 'Prior week 2', 'Prior week 3', 'Prior week 1', 'Prior week 2', 'Prior week 3'],
      [11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43],
      [14, 15, 16, 24, 25, 26, 34, 35, 36, 44, 45, 46]
    ], { source: 'test-large-grouped-data' });
    await awaitBoxReady('ui-events-box-grouped-replacement-large-data');
    const activeTabId = window.Main?.session?.getActiveTab?.()?.id;
    const ownerSession = box.__testHooks?.getSession?.(activeTabId);
    ownerSession.state.visual.grouped = {
      replicatesPerGroup: 3,
      groups: ['Prior group A', 'Prior group B', 'Prior group C', 'Prior group D'],
      conditions: ['Prior week 1', 'Prior week 2', 'Prior week 3']
    };
    box.__getState().grouped = {
      ...ownerSession.state.visual.grouped,
      groups: ownerSession.state.visual.grouped.groups.slice(),
      conditions: ownerSession.state.visual.grouped.conditions.slice()
    };

    document.getElementById('boxLoadExample').click();
    await awaitBoxReady('ui-events-box-grouped-replacement-example');

    const matrix = hot.getData?.() || [];
    const expected = getExampleData('box', 'grouped');
    expect(matrix.slice(0, 2).map(row => row.slice(0, expected[0].length))).toEqual(expected.slice(0, 2));
    expect(matrix.slice(0, 2).flatMap(row => row.slice(expected[0].length)).filter(value => String(value || '').trim())).toEqual([]);
    expect(hot.countCols?.()).toBeGreaterThanOrEqual(10);
    expect(ownerSession?.state?.visual?.grouped?.groups).toEqual([
      expected[0][0], expected[0][3], 'Group 3', 'Group 4'
    ]);
    expect(ownerSession?.state?.visual?.grouped?.conditions).toEqual(expected[1].slice(0, 3));
    const groupedState = box.__getState?.()?.grouped || {};
    expect(groupedState.groups).toEqual([
      expected[0][0], expected[0][3], 'Group 3', 'Group 4'
    ]);
    expect(groupedState.conditions).toEqual(expected[1].slice(0, 3));
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
    const svg = await waitFor(() => document.querySelector('#boxPlot svg line[data-axis-control="1"]')?.closest('svg'), { timeout: 10000 });
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
    expect(singleHeader).toEqual(getExampleData('line', 'standard')[0]);

    const formatSelect = document.getElementById('lineTableFormat');
    expect(formatSelect).toBeTruthy();
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change'));
    await flushAsyncWork(40);

    loadBtn.click();
    await flushAsyncWork(60);

    const groupedData = Array.isArray(hot?.getData?.()) ? hot.getData() : null;
    expect(groupedData?.length).toBeGreaterThan(1);
    const groupedExample = window.Shared.exampleDatasets.get('line', 'groupedDoseResponse');
    expect(groupedData[0].slice(0, 7)).toEqual([
      groupedExample.data[0][0],
      groupedExample.data[0][1], '', '',
      groupedExample.data[0][4], '', ''
    ]);
    expect(groupedData[1].slice(0, 7)).toEqual(groupedExample.data[1]);
    const replicatesInput = document.getElementById('lineReplicates');
    expect(replicatesInput?.value).toBe('3');
    const lineStateGrouped = lineComponent?.__getState?.();
    expect(lineStateGrouped?.legendItems?.length).toBe(2);
    expect(lineStateGrouped?.legendItems?.map(item => item.label)).toEqual(groupedExample.meta.groupLabels);
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
    await awaitBoxReady('ui-events-box-grouped-start');

    const boxComponent = window.Components?.box;
    expect(boxComponent).toBeTruthy();
    const state = boxComponent.__getState?.();
    const hot = state?.hot;
    expect(hot).toBeTruthy();

    const formatSelect = document.getElementById('boxTableFormat');
    expect(formatSelect).toBeTruthy();
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await awaitBoxReady('ui-events-box-grouped-format');
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
    await awaitBoxReady('ui-events-box-grouped-replicates');

    hot.loadData([
      ['Control', '', '', 'Treated', '', ''],
      ['Baseline', 'Week 1', 'Week 2', '', '', ''],
      [10, 11, 12, 20, 21, 22],
      [13, 14, 15, 23, 24, 25]
    ]);
    await awaitBoxReady('ui-events-box-grouped-data');

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

    const updateSettingsSpy = jest.spyOn(hot, 'updateSettings');
    await awaitBoxReady('ui-events-box-grouped-before-edit');
    updateSettingsSpy.mockClear();
    hot.setDataAtCell?.(2, 4, 99);
    await awaitBoxReady('ui-events-box-grouped-value-edit');
    expect(updateSettingsSpy).not.toHaveBeenCalled();

    hot.setDataAtCell?.(1, 4, 'Day 7');
    await awaitBoxReady('ui-events-box-grouped-condition-edit');
    expect(updateSettingsSpy).not.toHaveBeenCalled();
    updateSettingsSpy.mockRestore();

    const synced = hot.getData?.() || [];
    expect(String(synced?.[1]?.[1] || '')).toBe('Day 7');
    expect(String(synced?.[1]?.[4] || '')).toBe('Day 7');

    const payload = boxComponent.getPayload?.();
    expect(payload?.config?.tableFormat).toBe('grouped');
    expect(payload?.config?.grouped?.replicatesPerGroup).toBe(3);
    expect(payload?.config?.grouped?.groups).toEqual(['Control', 'Treated']);
    expect(payload?.config?.grouped?.conditions).toEqual(['Baseline', 'Day 7', 'Week 2']);

    boxComponent.loadFromPayload(payload);
    await awaitBoxReady('ui-events-box-grouped-reload');
    const reloaded = hot.getData?.() || [];
    expect(String(reloaded?.[0]?.[0] || '')).toBe('Control');
    expect(String(reloaded?.[0]?.[3] || '')).toBe('Treated');
    expect(String(reloaded?.[1]?.[0] || '')).toBe('Baseline');
    expect(String(reloaded?.[1]?.[1] || '')).toBe('Day 7');
    expect(String(reloaded?.[1]?.[2] || '')).toBe('Week 2');
    expect(String(reloaded?.[1]?.[4] || '')).toBe('Day 7');
  }, 30000);

  test('Box Plot: grouped replicates show a Prism-style movable legend by default', async () => {
    await activateWorkspace('box');
    await awaitBoxReady('ui-events-box-legend-start');

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
    await awaitBoxReady('ui-events-box-legend-format');
    expect(legendToggle.checked).toBe(true);

    hot.loadData([
      ['Control', '', '', 'Treated', '', ''],
      ['Week 1', 'Week 2', 'Week 3', 'Week 1', 'Week 2', 'Week 3'],
      [23, 24, 21, 80, 30, 67],
      [21, 23, 25, 84, 31, 68],
      [19, 25, 27, 82, 29, 66],
      [22, 26, 24, 86, 32, 69]
    ]);
    await awaitBoxReady('ui-events-box-legend-data');
    await boxComponent.draw?.({ reason: 'test-box-legend' });
    await awaitBoxReady('ui-events-box-legend-draw');

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
    const swatchFills = swatches.map(swatch => swatch.getAttribute('fill')).filter(Boolean);
    expect(new Set(swatchFills).size).toBe(2);

    let payload = boxComponent.getPayload?.();
    expect(payload?.config?.showLegend).toBe(true);
    legendToggle.checked = false;
    legendToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await awaitBoxReady('ui-events-box-legend-hide');
    expect(document.querySelector('#boxPlot svg g[data-box-legend="1"]')).toBeNull();
    payload = boxComponent.getPayload?.();
    expect(payload?.config?.showLegend).toBe(false);
    boxComponent.loadFromPayload(payload);
    await awaitBoxReady('ui-events-box-legend-reload');
    expect(document.getElementById('boxShowLegend')?.checked).toBe(false);
  }, 20000);

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

});
