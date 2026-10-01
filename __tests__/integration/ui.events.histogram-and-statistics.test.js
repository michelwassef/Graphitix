'use strict';

const { ensureJStatStub, activateWorkspace, getExampleData, flushAsyncWork } = require('../../test-support/uiEventsTestSetup');

describe('UI events: Histogram and statistics', () => {

  test('Histogram: Load Example populates data', async () => {
    await activateWorkspace('hist');
    const btn = document.getElementById('histLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__GRID_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'histHot');
    expect(loads.length).toBeGreaterThan(0);
    const expectedHeader = getExampleData('hist', 'default')[0];
    const populated = loads.find(call => JSON.stringify(call.firstRow) === JSON.stringify(expectedHeader));
    expect(populated?.firstRow).toEqual(expectedHeader);
    await flushAsyncWork();
  });

  test('Histogram: automatic X range includes negative values', async () => {
    await activateWorkspace('hist');
    await flushAsyncWork(20);

    const component = window.Components?.hist;
    const xMinInput = document.getElementById('histXMin');
    expect(component).toBeTruthy();
    expect(xMinInput?.value).toBe('');

    const tab = window.Main?.tabs?.getActiveTab?.();
    const payload = component.createEmptyPayload();
    expect(payload.config?.axisLimits?.xMin).toBeNull();
    payload.data = [
      ['Values'],
      [-8],
      [-4],
      [2]
    ];
    component.loadFromPayload(payload, {
      source: 'test-negative-auto-x-range',
      tab,
      tabId: tab?.id
    });
    expect(xMinInput?.value).toBe('');
    await component.draw({ reason: 'test-negative-auto-x-range' });
    await flushAsyncWork(20);

    const tickValues = Array.from(document.querySelectorAll('#histSvg text'))
      .map(node => Number(node.textContent))
      .filter(Number.isFinite);
    expect(Math.min(...tickValues)).toBeLessThanOrEqual(-8);
    expect(component.getPayload()?.config?.axisLimits?.xMin).toBeNull();
  });

  test('Histogram: manual X minimum still overrides automatic range', async () => {
    await activateWorkspace('hist');
    await flushAsyncWork(20);

    const component = window.Components?.hist;
    const tab = window.Main?.tabs?.getActiveTab?.();
    const payload = component.createEmptyPayload();
    payload.data = [['Values'], [-8], [-4], [2]];
    payload.config.axisLimits.xMin = -3.3;
    component.loadFromPayload(payload, {
      source: 'test-manual-x-minimum',
      tab,
      tabId: tab?.id
    });
    await component.draw({ reason: 'test-manual-x-minimum' });
    await flushAsyncWork(20);

    expect(document.getElementById('histXMin')?.value).toBe('-3.3');
    expect(component.getPayload()?.config?.axisLimits?.xMin).toBe(-3.3);
    const tickValues = Array.from(document.querySelectorAll('#histSvg text'))
      .map(node => Number(node.textContent))
      .filter(Number.isFinite);
    expect(Math.min(...tickValues)).toBeCloseTo(-3.3, 10);
  });

  test('Histogram: multi-series legend preserves the SVG aspect ratio', async () => {
    await activateWorkspace('hist');
    await flushAsyncWork(20);

    const component = window.Components?.hist;
    const tab = window.Main?.tabs?.getActiveTab?.();
    const payload = component.createEmptyPayload();
    payload.data = [
      ['Control', 'Treatment'],
      [38, 41],
      [42, 46],
      [50, 55],
      [62, 70]
    ];
    component.loadFromPayload(payload, {
      source: 'test-multi-series-legend-aspect',
      tab,
      tabId: tab?.id
    });
    await component.draw({ reason: 'test-multi-series-legend-aspect' });
    await flushAsyncWork(20);

    const svg = document.getElementById('histSvg');
    expect(svg?.querySelectorAll('[data-font-role="legend"]').length).toBe(2);
    expect(svg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  test('Histogram: empty bins and shared separators render no duplicate strokes', async () => {
    await activateWorkspace('hist');
    await flushAsyncWork(20);

    const component = window.Components?.hist;
    const tab = window.Main?.tabs?.getActiveTab?.();
    const payload = component.createEmptyPayload();
    payload.data = [['Values'], [0], [0], [0], [1], [1], [2], [10]];
    payload.config.frequency = {
      ...(payload.config.frequency || {}),
      binningMode: 'width',
      manualBinWidth: 1,
      firstCenterAuto: false,
      firstCenter: 0,
      lastCenterAuto: false,
      lastCenter: 10
    };
    component.loadFromPayload(payload, {
      source: 'test-empty-bin-baseline',
      tab,
      tabId: tab?.id,
      skipDraw: true
    });
    await component.draw({ reason: 'test-empty-bin-baseline' });
    await flushAsyncWork(20);

    const activeRoot = window.Shared?.workspaceTabs?.getMountedRoot?.(tab, 'hist') || document;
    const bars = Array.from(activeRoot.querySelectorAll(
      '#histSvg [data-hist-bar="1"][data-series-role="hist-fill"]'
    ));
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every(bar => {
      const points = Array.from(String(bar.getAttribute('d') || '').matchAll(
        /[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g
      ));
      const yValues = new Set(points.map(match => Number(match[2]).toFixed(6)));
      return yValues.size > 1;
    })).toBe(true);
    expect(bars.every(bar => !bar.hasAttribute('stroke') || bar.getAttribute('stroke') === 'none')).toBe(true);
    const borders = activeRoot.querySelectorAll(
      '#histSvg [data-series-role="hist-border"][data-series-key="col-0"]'
    );
    expect(borders).toHaveLength(1);
    const borderCommands = Array.from(String(borders[0].getAttribute('d') || '').matchAll(
      /([ML])\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g
    )).map(match => ({
      command: match[1],
      x: Number(match[2]),
      y: Number(match[3])
    }));
    const verticalSegments = [];
    let previousPoint = null;
    borderCommands.forEach(command => {
      if(command.command === 'L' && previousPoint && previousPoint.x === command.x){
        verticalSegments.push({
          x: command.x,
          start: Math.min(previousPoint.y, command.y),
          end: Math.max(previousPoint.y, command.y)
        });
      }
      previousPoint = command;
    });
    const segmentKeys = verticalSegments.map(segment => (
      `${segment.x.toFixed(6)}:${segment.start.toFixed(6)}:${segment.end.toFixed(6)}`
    ));
    expect(new Set(segmentKeys).size).toBe(segmentKeys.length);
    const segmentsByX = verticalSegments.reduce((groups, segment) => {
      const key = segment.x.toFixed(6);
      if(!groups.has(key)){
        groups.set(key, []);
      }
      groups.get(key).push(segment);
      return groups;
    }, new Map());
    let touchingJointCount = 0;
    segmentsByX.forEach(segments => {
      const ordered = segments.slice().sort((left, right) => left.start - right.start);
      for(let index = 1; index < ordered.length; index += 1){
        expect(ordered[index - 1].end).toBeLessThanOrEqual(ordered[index].start + 1e-6);
        if(Math.abs(ordered[index - 1].end - ordered[index].start) <= 1e-6){
          touchingJointCount += 1;
        }
      }
    });
    expect(touchingJointCount).toBeGreaterThan(0);
  });

  test('Histogram: graph options own the legend toggle and Trace transparency round-trips', async () => {
    await activateWorkspace('hist');
    await flushAsyncWork(20);

    const component = window.Components?.hist;
    const tab = window.Main?.tabs?.getActiveTab?.();
    const legendToggle = document.getElementById('histShowLegend');
    expect(component).toBeTruthy();
    expect(legendToggle?.closest('.resizer-options-menu')).toBeTruthy();
    expect(legendToggle?.closest('.config-panel')).toBeNull();

    const payload = component.createEmptyPayload();
    payload.data = [
      ['Control', 'Treatment'],
      [38, 41],
      [42, 46],
      [50, 55],
      [62, 70]
    ];
    component.loadFromPayload(payload, {
      source: 'test-trace-transparency',
      tab,
      tabId: tab?.id
    });
    await component.draw({ reason: 'test-trace-transparency' });
    await flushAsyncWork(20);

    const stageLegendViewport = jest.spyOn(window.Shared.chartStyle, 'stageLegendViewport');
    legendToggle.checked = false;
    legendToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);
    expect(stageLegendViewport).not.toHaveBeenCalled();
    expect(component.getPayload()?.config?.showLegend).toBe(false);
    stageLegendViewport.mockRestore();

    const defaultTrace = document.querySelector('#histSvg [data-series-key="col-0"][data-series-role="hist-trace"]');
    const defaultFill = document.querySelector('#histSvg [data-series-key="col-0"][data-series-role="hist-fill"]');
    const defaultBorder = document.querySelector('#histSvg [data-series-key="col-0"][data-series-role="hist-border"]');
    expect(Number(defaultTrace?.getAttribute('opacity'))).toBeCloseTo(0.65, 6);
    expect(defaultFill?.getAttribute('fill-opacity')).toBe('1');
    expect(defaultBorder).toBeTruthy();
    expect(defaultBorder?.hasAttribute('stroke-opacity')).toBe(false);

    const controlBar = document.querySelector('#histSvg [data-series-key="col-0"][data-series-role="hist-fill"]');
    expect(controlBar).toBeTruthy();
    controlBar.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAsyncWork(5);

    const transparencyInput = document.querySelector(
      '[aria-label="Trace"] .additional-line-controls-panel__transparency-input'
    );
    expect(transparencyInput).toBeTruthy();
    expect(Number(transparencyInput.value)).toBe(35);
    transparencyInput.value = '45';
    transparencyInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushAsyncWork(20);

    const saved = component.getPayload();
    expect(saved?.config?.seriesOpacities?.['col-0']).toBeCloseTo(0.55, 6);
    expect(
      Number(document.querySelector('#histSvg [data-series-key="col-0"][data-series-role="hist-trace"]')?.getAttribute('opacity'))
    ).toBeCloseTo(0.55, 6);
    expect(
      document.querySelector('#histSvg [data-series-key="col-0"][data-series-role="hist-fill"]')?.getAttribute('fill-opacity')
    ).toBe('1');
    expect(
      document.querySelector('#histSvg [data-series-key="col-0"][data-series-role="hist-border"]')?.hasAttribute('stroke-opacity')
    ).toBe(false);

    component.loadFromPayload(saved, {
      source: 'test-trace-transparency-reload',
      tab,
      tabId: tab?.id
    });
    await component.draw({ reason: 'test-trace-transparency-reload' });
    await flushAsyncWork(20);

    expect(component.getPayload()?.config?.seriesOpacities?.['col-0']).toBeCloseTo(0.55, 6);
    expect(
      Number(document.querySelector('#histSvg [data-series-key="col-0"][data-series-role="hist-trace"]')?.getAttribute('opacity'))
    ).toBeCloseTo(0.55, 6);
  });

  test('Proportion Graph: Load Example populates data', async () => {
    await activateWorkspace('pie');
    const btn = document.getElementById('pieLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__GRID_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'pieHot');
    expect(loads.length).toBeGreaterThan(0);
    const expectedHeader = getExampleData('pie', 'default')[0];
    const populated = loads.find(call => JSON.stringify(call.firstRow) === JSON.stringify(expectedHeader));
    expect(populated?.firstRow).toEqual(expectedHeader);
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
    const expectedHeader = getExampleData('heatmap', 'default')[0];
    const populated = loads.find(call => JSON.stringify(call.firstRow) === JSON.stringify(expectedHeader));
    expect(populated?.firstRow).toEqual(expectedHeader);
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
      expect(firstRow).toEqual(getExampleData('roc', 'default')[0]);
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

      await window.Components.roc.draw({ reason: 'test-roc-html-series-stats' });

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
    const expectedFirstRow = getExampleData('survival', 'default')[0];
    const populated = loads.find(call => JSON.stringify(call.firstRow) === JSON.stringify(expectedFirstRow));
    expect(populated?.firstRow).toEqual(expectedFirstRow);
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
    const start = performance.now();
    await window.Components.survival.draw({ reason: 'test-survival-large-cox' });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(5000);
    const summary = state.lastSummary;
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

});
