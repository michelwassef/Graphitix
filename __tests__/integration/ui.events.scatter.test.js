'use strict';

const { ensureJStatStub, activateWorkspace, flushAsyncWork, awaitScatterReady, awaitComponentAsyncIdle } = require('../../test-support/uiEventsTestSetup');

describe('UI events: Scatter', () => {

  test('Scatter Plot: additional axis ticks/lines persist from FORMAT controls', async () => {
    await activateWorkspace('scatter');
    await flushAsyncWork(20);
    const loadBtn = document.getElementById('scatterLoadExample');
    expect(loadBtn).toBeTruthy();
    loadBtn.click();
    await flushAsyncWork(60);

    const svg = await waitFor(() => {
      const candidate = document.querySelector('#scatterPlot svg');
      if (!candidate) {
        return null;
      }
      const hasNumericYTick = Array.from(candidate.querySelectorAll('text[text-anchor="end"]'))
        .some(el => (el.getAttribute('dominant-baseline') || '').toLowerCase() === 'middle'
          && Number.isFinite(Number((el.textContent || '').trim())));
      return hasNumericYTick ? candidate : null;
    }, { timeout: 10000 });
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
      const cutoffLabels = Array.from(document.querySelectorAll('#scatterPlot svg text[text-anchor="end"]'))
        .filter(el => (el.getAttribute('dominant-baseline') || '').toLowerCase() === 'middle')
        .filter(el => (el.textContent || '').trim() === 'Cutoff');
      expect(cutoffLabels).toHaveLength(1);
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
    await awaitScatterReady('ui-events-scatter-axis-additional-ticks-reload');
    await awaitComponentAsyncIdle('scatter', 'ui-events-scatter-axis-additional-ticks-idle');
    const reloadedPayload = scatterComponent.getPayload?.();
    expect(reloadedPayload?.config?.axis?.additionalTicks?.y?.length).toBe(1);
    expect(reloadedPayload?.config?.axis?.additionalTicks?.y?.[0]?.label).toBe('Cutoff');
  }, 20000);

  test('Scatter Plot: horizontal resize frame uses the plot-owned svgbox', async () => {
    await activateWorkspace('scatter');
    await flushAsyncWork(20);

    const activeBox = document.querySelector('#scatterGraphPanel .svgbox');
    expect(activeBox).toBeTruthy();
    activeBox.getBoundingClientRect = jest.fn(() => ({
      width: 427,
      height: 320,
      top: 0,
      left: 0,
      right: 427,
      bottom: 320
    }));

    const foreignBox = document.createElement('div');
    foreignBox.className = 'svgbox';
    foreignBox.dataset.resizerLastAxis = 'x';
    foreignBox.dataset.resizerAxisViewportLockAxis = 'x';
    foreignBox.dataset.resizerAxisViewportLockUntil = String(Date.now() + 10000);
    foreignBox.getBoundingClientRect = jest.fn(() => ({
      width: 350,
      height: 320,
      top: 0,
      left: 0,
      right: 350,
      bottom: 320
    }));
    const foreignPlot = document.createElement('div');
    foreignPlot.id = 'scatterPlot';
    foreignBox.appendChild(foreignPlot);
    document.body.appendChild(foreignBox);

    const frame = window.Components.scatter.__testHooks.resolveDrawableFrame(foreignPlot);
    expect(frame.svgBox).toBe(foreignBox);
    expect(frame.width).toBe(350);
  }, 20000);

  test('Scatter Plot: y-axis stays fixed during horizontal resize with default zero origin', async () => {
    await activateWorkspace('scatter');
    await flushAsyncWork(20);
    document.getElementById('scatterLoadExample')?.click();
    await flushAsyncWork(60);

    const scatterComponent = window.Components?.scatter;
    const svgBox = document.querySelector('#scatterGraphPanel .svgbox');
    const originMode = document.getElementById('scatterOriginMode');
    expect(scatterComponent).toBeTruthy();
    expect(svgBox).toBeTruthy();
    expect(originMode?.value).toBe('zero');

    const setBoxWidth = width => {
      svgBox.dataset.resizerLastAxis = 'x';
      svgBox.dataset.resizerAxisViewportLockAxis = 'x';
      svgBox.dataset.resizerAxisViewportLockUntil = String(Date.now() + 10000);
      svgBox.getBoundingClientRect = jest.fn(() => ({
        width,
        height: 333,
        top: 0,
        left: 0,
        right: width,
        bottom: 333
      }));
    };
    const readYAxisX = () => {
      const svg = document.querySelector('#scatterPlot svg');
      expect(svg).toBeTruthy();
      const axisLines = Array.from(svg.querySelectorAll('line[data-axis-control="1"]'));
      const yAxis = axisLines.find(line => {
        const x1 = Number(line.getAttribute('x1'));
        const x2 = Number(line.getAttribute('x2'));
        const stroke = (line.getAttribute('stroke') || '').toLowerCase();
        return Number.isFinite(x1) && x1 === x2 && stroke !== 'transparent';
      });
      expect(yAxis).toBeTruthy();
      return Number(yAxis.getAttribute('x1'));
    };

    setBoxWidth(480);
    scatterComponent.draw({ reason: 'test-horizontal-resize-wide' });
    await flushAsyncWork(30);
    const wideX = readYAxisX();

    setBoxWidth(397);
    scatterComponent.draw({ reason: 'test-horizontal-resize-narrow' });
    await flushAsyncWork(30);
    const narrowX = readYAxisX();

    expect(narrowX).toBeCloseTo(wideX, 6);
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

    const updateSettingsSpy = jest.spyOn(hot, 'updateSettings');
    updateSettingsSpy.mockClear();
    hot.setDataAtCell?.(2, 5, 27);
    await flushAsyncWork(20);
    expect(updateSettingsSpy).not.toHaveBeenCalled();
    updateSettingsSpy.mockRestore();

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
    const errorPaths = Array.from(errorLayer.querySelectorAll('path[data-scatter-error-bar="1"]'));
    expect(errorPaths.length).toBeGreaterThan(0);
    expect(errorPaths.every(path => Number(path.getAttribute('data-scatter-error-segment-count')) >= 3)).toBe(true);
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
    const groupedExample = window.Shared.exampleDatasets.get('scatter', 'groupedXY');
    const groupedHeaders = matrix?.[0] || [];
    const exampleReplicates = groupedExample.meta.replicates;
    expect(String(groupedHeaders?.[1] || '')).toBe(String(groupedExample.data[0][1]));
    expect(String(groupedHeaders?.[2] || '')).toBe('');
    groupedExample.meta.groupLabels.forEach((label, seriesIndex) => {
      const anchor = 1 + exampleReplicates + (seriesIndex * exampleReplicates);
      expect(String(groupedHeaders?.[anchor] || '')).toContain(label);
    });

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
    const paths = Array.from(errorLayer.querySelectorAll('path[data-scatter-error-bar="1"]'));
    expect(paths.length).toBeGreaterThan(0);
    const segments = paths.flatMap(path => {
      const d = String(path.getAttribute('d') || '');
      return Array.from(d.matchAll(/M\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+L\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g))
        .map(match => ({ x1: Number(match[1]), y1: Number(match[2]), x2: Number(match[3]), y2: Number(match[4]) }));
    });
    const hasVertical = segments.some(segment => segment.x1 === segment.x2 && segment.y1 !== segment.y2);
    const hasHorizontal = segments.some(segment => segment.y1 === segment.y2 && segment.x1 !== segment.x2);
    expect(hasVertical).toBe(true);
    expect(hasHorizontal).toBe(true);

    const payload = scatterComponent.getPayload?.();
    expect(payload?.config?.tableFormat).toBe('grouped');
    expect(payload?.config?.replicates).toBe(exampleReplicates);
    expect(payload?.config?.xReplicates).toBe(true);
    scatterComponent.loadFromPayload(payload);
    await flushAsyncWork(40);
    expect(document.getElementById('scatterGroupedXReplicates')?.checked).toBe(true);
  }, 20000);

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

});
