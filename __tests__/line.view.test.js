jest.setTimeout(30000);

const { ensureJStatStub } = require('./helpers/jstatTestStub');

describe('Line view labels', () => {
  let restoreJStat = null;
  const flush = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  const flushAll = async (count = 10) => {
    for(let i = 0; i < count; i += 1){
      await flush();
    }
  };
  const waitForLineLifecycle = (afterCursor, options = {}) => {
    const activeTabId = options.tabId || window.Main?.session?.getActiveTab?.()?.id || null;
    return window.Shared.componentLifecycle.waitForLifecycleEvent({
      componentKey: 'line',
      tabId: activeTabId,
      actions: options.actions || ['draw-settled'],
      afterCursor,
      timeoutMs: options.timeoutMs || 4000,
      predicate: options.reason
        ? event => event.reason === options.reason
        : null
    });
  };
  const activateWorkspace = async (type) => {
    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    expect(typeof graphSelection).toBe('function');
    const result = graphSelection(type);
    if(result && typeof result.then === 'function'){
      await result;
    }
    await Promise.resolve();
  };
  const ensureEmptyDuplicateTab = async () => {
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await flushAll(20);
    }
  };
  const loadLineExampleAndComputeStats = async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();
    const drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    exampleBtn.click();
    await waitForLineLifecycle(drawCursor, { reason: 'line-example-load' });
    const computeBtn = document.getElementById('lineComputeStats');
    expect(computeBtn).toBeTruthy();
    computeBtn.click();
    await Promise.resolve();
    expect(document.getElementById('lineStatsStatus')?.textContent || '').toMatch(/up to date/i);
  };
  const enableLineRegressionOverlays = async () => {
    const trend = document.getElementById('lineShowTrendLine');
    const confidence = document.getElementById('lineShowIntervals');
    const prediction = document.getElementById('lineShowPredictionIntervals');
    [trend, confidence, prediction].forEach(control => expect(control).toBeTruthy());
    expect(trend.disabled).toBe(false);
    let drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    trend.checked = true;
    trend.dispatchEvent(new window.Event('change', { bubbles: true }));
    await waitForLineLifecycle(drawCursor, { reason: 'line-show-trend-change' });
    drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    [confidence, prediction].forEach(control => {
      expect(control.disabled).toBe(false);
      control.checked = true;
      control.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await waitForLineLifecycle(drawCursor, { reason: 'line-prediction-intervals-toggle' });
  };
  const getLineOverlayCounts = () => {
    const root = document.querySelector('#linePage:not([hidden])') || document;
    return {
      trend: root.querySelectorAll('#lineSvg path[data-line-overlay-key="trend"]').length,
      confidence: root.querySelectorAll('#lineSvg path[data-line-overlay-key="confidence"]').length,
      prediction: root.querySelectorAll('#lineSvg path[data-line-overlay-key="prediction"]').length
    };
  };

  beforeEach(async () => {
    jest.resetModules();
    if(typeof window !== 'undefined'){
      delete window.Main;
      delete window.Components;
      delete window.Shared;
    }
    if(typeof global !== 'undefined'){
      delete global.Main;
      delete global.Components;
      delete global.Shared;
    }
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }
    window.localStorage?.clear?.();
    window.sessionStorage?.clear?.();
    if(window.Components){
      delete window.Components.line;
    }
    if(global.Components){
      delete global.Components.line;
    }
    restoreJStat = ensureJStatStub();

    require('../js/vendor.js');
    require('../js/shared/debounce.js');
    require('../js/shared/componentLifecycle.js');
    require('../js/shared/resizer.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/hot.js');
    require('../js/shared/exampleDatasets.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/regression.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/symbolToolbar.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
    require('../js/shared/formControls.js');
    require('../js/shared/dom.js');
    require('../js/components/line.js');
    require('../js/main/components.js');
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main.js');
    await activateWorkspace('line');
    const activeLineTabId = window.Main?.session?.getActiveTab?.()?.id || null;

    window.Components?.line?.ensure?.({
      tabId: activeLineTabId,
      root: document.getElementById('linePage'),
      reason: 'line-view-test-ensure'
    });
    await flushAll(20);
  });

  afterEach(() => {
    if(typeof restoreJStat === 'function'){
      restoreJStat();
      restoreJStat = null;
    }
  });

  test('legend labels follow editable header row titles', async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();

    exampleBtn.click();
    await flushAll(20);

    const lineComponent = window.Components?.line;
    const hot = lineComponent?.getHot?.();
    expect(hot).toBeTruthy();

    hot.setDataAtCell([
      [0, 1, 'North renamed'],
      [0, 2, 'South renamed']
    ], 'test-line-header-edit');
    await flushAll(20);

    const headerRow = Array.isArray(hot?.getData?.()) ? hot.getData()[0] : null;
    expect(headerRow?.slice(0, 6)).toEqual(['Month', 'North renamed', 'South renamed', 'East', 'West', 'Central']);

    const lineState = lineComponent?.__getState?.();
    expect(lineState?.legendItems?.map(item => item.label)).toEqual([
      'North renamed',
      'South renamed',
      'East',
      'West',
      'Central'
    ]);
  });

  test('legend represents each line with a centered marker and exports it', async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();

    exampleBtn.click();
    await flushAll(20);

    const swatch = document.querySelector('#lineSvg [data-legend-swatch="1"][data-legend-key="North"]');
    const lineSegment = swatch?.querySelector('[data-legend-line="1"]');
    const marker = swatch?.querySelector('[data-legend-marker="1"]');

    expect(swatch).toBeTruthy();
    expect(lineSegment).toBeTruthy();
    expect(marker).toBeTruthy();
    expect(Number(lineSegment.getAttribute('x1'))).toBeLessThan(Number(marker.getAttribute('cx')));
    expect(Number(lineSegment.getAttribute('x2'))).toBeGreaterThan(Number(marker.getAttribute('cx')));
    expect(Number(lineSegment.getAttribute('y1'))).toBe(Number(marker.getAttribute('cy')));
    expect(Number(lineSegment.getAttribute('y2'))).toBe(Number(marker.getAttribute('cy')));
    const renderedLine = document.querySelector('#lineSvg path[data-series="North"][data-render-mode="line"]');
    const renderedMarker = Array.from(document.querySelectorAll('#lineSvg circle, #lineSvg rect, #lineSvg path'))
      .find(node => node.__linePointData?.seriesName === 'North');
    expect(lineSegment.getAttribute('stroke')).toBe(renderedLine?.getAttribute('stroke'));
    expect(lineSegment.getAttribute('stroke-width')).toBe(renderedLine?.getAttribute('stroke-width'));
    expect(marker.getAttribute('fill')).toBe(renderedMarker?.getAttribute('fill'));

    const exported = window.Components?.line?.buildExportSvg?.();
    const exportedSwatch = exported?.querySelector('[data-legend-swatch="1"][data-legend-key="North"]');
    expect(exportedSwatch?.querySelector('[data-legend-line="1"]')).toBeTruthy();
    expect(exportedSwatch?.querySelector('[data-legend-marker="1"]')).toBeTruthy();
  });

  test('3D legend uses the shared line and centered-marker representation', async () => {
    const tableFormat = document.getElementById('lineTableFormat');
    const viewMode = document.getElementById('lineViewMode');
    expect(tableFormat).toBeTruthy();
    expect(viewMode).toBeTruthy();

    tableFormat.value = '3d';
    tableFormat.dispatchEvent(new Event('change', { bubbles: true }));
    viewMode.value = '3d';
    viewMode.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(20);

    document.getElementById('lineLoadExample').click();
    await flushAll(30);

    const svg = document.querySelector('#linePlot svg[data-view-mode="3d"]');
    const swatch = svg?.querySelector('[data-legend-swatch="1"]');
    expect(svg).toBeTruthy();
    expect(swatch?.querySelector('[data-legend-line="1"]')).toBeTruthy();
    expect(swatch?.querySelector('[data-legend-marker="1"]')).toBeTruthy();
  });

  test('3D conversion from grouped replicates keeps custom X headers stable', async () => {
    const hooks = window.Components?.line?.__testHooks;
    expect(hooks).toBeTruthy();

    const grouped = [
      ['Hours', 'Control Rep 1', 'Control Rep 2', 'Control Rep 3', 'Treated Rep 1', 'Treated Rep 2', 'Treated Rep 3'],
      [0, 45, 43, 47, 50, 48, 49],
      [24, 58, 60, 57, 68, 70, 69],
      [48, 72, 71, 74, 80, 82, 81]
    ];

    const converted = hooks.buildLine3dMatrixFrom2d(grouped, 3);
    expect(hooks.isLine3dDatasetHeaderMatrix(converted.data)).toBe(true);
    expect(hooks.inferLine3dSeriesCount(converted.data)).toBe(2);
    expect(converted.data[1].slice(0, 6)).toEqual(['Hours', 'Y', 'Z', 'Hours', 'Y', 'Z']);

    const once = hooks.applyLine3dHeaderRow(converted.data, hooks.inferLine3dSeriesCount(converted.data));
    const twice = hooks.applyLine3dHeaderRow(once, hooks.inferLine3dSeriesCount(once));

    expect(hooks.inferLine3dSeriesCount(once)).toBe(2);
    expect(hooks.inferLine3dSeriesCount(twice)).toBe(2);
    expect(once[0].length).toBe(6);
    expect(twice[0].length).toBe(6);
  });

  test('canonical 3D headers remain idempotent with descriptive axis titles', () => {
    const hooks = window.Components?.line?.__testHooks;
    expect(hooks).toBeTruthy();
    const matrix = [
      ['Subject 1', '', '', 'Subject 2', '', ''],
      ['Time (h)', 'Concentration (µg/mL)', 'Subject index', 'Time (h)', 'Concentration (µg/mL)', 'Subject index'],
      [0.25, 1.5, 1, 0.25, 2.03, 2],
      [0.5, 0.94, 1, 0.5, 1.63, 2]
    ];

    expect(hooks.isLine3dDatasetHeaderMatrix(matrix)).toBe(true);
    expect(hooks.inferLine3dSeriesCount(matrix)).toBe(2);
    const once = hooks.applyLine3dHeaderRow(matrix, 2);
    const twice = hooks.applyLine3dHeaderRow(once, 2);

    expect(once.slice(0, 4)).toEqual(matrix);
    expect(twice).toEqual(once);
    expect(twice[0]).toHaveLength(6);

    const withBlankEditableTitle = matrix.map(row => row.slice());
    withBlankEditableTitle[1][1] = '';
    expect(hooks.isLine3dDatasetHeaderMatrix(withBlankEditableTitle)).toBe(true);
    const normalizedBlankTitle = hooks.applyLine3dHeaderRow(withBlankEditableTitle, 2);
    expect(normalizedBlankTitle[1][1]).toBe('Y');
    expect(hooks.applyLine3dHeaderRow(normalizedBlankTitle, 2)).toEqual(normalizedBlankTitle);
  });

  test('legend label clicks do not hide rendered line series', async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();

    exampleBtn.click();
    await flushAll(20);

    const legendLabel = document.querySelector('#lineSvg text[data-legend-key="North"]');
    const seriesPath = document.querySelector('#lineSvg path[data-series="North"][data-render-mode="line"]');

    expect(legendLabel).toBeTruthy();
    expect(seriesPath).toBeTruthy();
    expect(seriesPath.style.display).not.toBe('none');

    legendLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(5);

    expect(seriesPath.style.display).not.toBe('none');
  });

  test('line marker symbol controls update rendered series style', async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();

    exampleBtn.click();
    await flushAll(20);

    const northMarker = Array.from(document.querySelectorAll('#lineSvg circle, #lineSvg rect, #lineSvg path'))
      .find(node => node.__linePointData?.seriesName === 'North');
    expect(northMarker).toBeTruthy();
    expect(northMarker.getAttribute('fill')?.toLowerCase()).not.toBe('#ffaa00');
    const initialRadius = Number(northMarker.getAttribute('r')) || 0;

    northMarker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(5);

    const fillInput = document.querySelector('.line-point-controls .shared-shape-color-input');
    expect(fillInput).toBeTruthy();
    fillInput.value = '#ffaa00';
    fillInput.dispatchEvent(new Event('input', { bubbles: true }));
    fillInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(30);

    const updatedNorthMarker = Array.from(document.querySelectorAll('#lineSvg circle, #lineSvg rect, #lineSvg path'))
      .find(node => node.__linePointData?.seriesName === 'North');
    expect(updatedNorthMarker?.getAttribute('fill')?.toLowerCase()).toBe('#ffaa00');

    const lineColorInput = Array.from(document.querySelectorAll('.font-toolbar-host--line-dual .additional-line-controls-panel__color-input')).pop();
    expect(lineColorInput).toBeTruthy();
    lineColorInput.value = '#00aaee';
    lineColorInput.dispatchEvent(new Event('input', { bubbles: true }));
    lineColorInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(30);

    const updatedNorthLine = document.querySelector('#lineSvg path[data-series="North"][data-render-mode="line"]');
    expect(updatedNorthLine?.getAttribute('stroke')?.toLowerCase()).toBe('#00aaee');

    const fillSwatch = document.querySelector('.line-point-controls .shared-shape-color-swatch');
    expect(fillSwatch).toBeTruthy();
    fillSwatch.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }));
    await flushAll(30);

    const resizedNorthMarker = Array.from(document.querySelectorAll('#lineSvg circle, #lineSvg rect, #lineSvg path'))
      .find(node => node.__linePointData?.seriesName === 'North');
    expect(Number(resizedNorthMarker?.getAttribute('r'))).toBeGreaterThan(initialRadius);

    fillSwatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushAll(5);
    const squareInput = document.querySelector('.shared-color-picker__shape-input[value="square"]');
    expect(squareInput).toBeTruthy();
    squareInput.checked = true;
    squareInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(30);

    const reshapedNorthMarker = Array.from(document.querySelectorAll('#lineSvg rect'))
      .find(node => node.__linePointData?.seriesName === 'North');
    expect(reshapedNorthMarker).toBeTruthy();
  });

  test('line toolbar global line color updates every rendered line', async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();

    exampleBtn.click();
    await flushAll(20);

    const northMarker = Array.from(document.querySelectorAll('#lineSvg circle, #lineSvg rect, #lineSvg path'))
      .find(node => node.__linePointData?.seriesName === 'North');
    expect(northMarker).toBeTruthy();

    northMarker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(5);

    document.querySelectorAll('.font-toolbar-host--line-dual select').forEach(select => {
      if(!Array.from(select.options || []).some(option => option.value === 'global')){
        return;
      }
      select.value = 'global';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flushAll(5);
    expect(Array.from(document.querySelectorAll('.font-toolbar-host--line-dual select'))
      .filter(select => Array.from(select.options || []).some(option => option.value === 'global'))
      .map(select => select.value)).toEqual(['global', 'global']);

    const lineColorInput = Array.from(document.querySelectorAll('.font-toolbar-host--line-dual .additional-line-controls-panel__color-input')).pop();
    expect(lineColorInput).toBeTruthy();
    lineColorInput.value = '#cc00aa';
    expect(lineColorInput.value).toBe('#cc00aa');
    lineColorInput.dispatchEvent(new Event('input', { bubbles: true }));
    expect(lineColorInput.value).toBe('#cc00aa');
    lineColorInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(30);

    const renderedLines = Array.from(document.querySelectorAll('#lineSvg path[data-render-mode="line"]'));
    expect(renderedLines.length).toBeGreaterThan(1);
    expect(renderedLines.map(node => node.getAttribute('stroke')?.toLowerCase())).toEqual(
      renderedLines.map(() => '#cc00aa')
    );
  });

  test('same-component line tabs preserve rendered regression overlays after activation', async () => {
    const lineComponent = window.Components?.line;
    const main = window.Main;
    expect(lineComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    await loadLineExampleAndComputeStats();
    const tabA = main.session.getActiveTab();
    await enableLineRegressionOverlays();
    const runtimeAfterToggle = lineComponent.captureRuntimeState?.({
      tabId: tabA.id,
      reason: 'test-line-overlay-runtime-after-toggle'
    });
    expect(runtimeAfterToggle?.last2d?.showTrendLine).toBe(true);
    expect(runtimeAfterToggle?.last2d?.showIntervals).toBe(true);
    expect(runtimeAfterToggle?.last2d?.showPredictionIntervals).toBe(true);
    let counts = getLineOverlayCounts();
    expect(counts.trend).toBeGreaterThan(0);
    expect(counts.confidence).toBeGreaterThan(0);
    expect(counts.prediction).toBeGreaterThan(0);

    main.tabs.handleAddTabClick();
    await flushAll(10);
    await activateWorkspace('line');
    await ensureEmptyDuplicateTab();
    await loadLineExampleAndComputeStats();
    const tabB = main.session.getActiveTab();
    expect(tabB?.id).not.toBe(tabA?.id);

    const activationCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    main.tabs.activateTab(tabA.id, { reason: 'test-line-overlay-switch-a' });
    await waitForLineLifecycle(activationCursor, {
      tabId: tabA.id,
      actions: ['draw-settled'],
      reason: 'test-line-overlay-switch-a'
    });

    expect(document.getElementById('lineShowTrendLine').checked).toBe(true);
    expect(document.getElementById('lineShowIntervals').checked).toBe(true);
    expect(document.getElementById('lineShowPredictionIntervals').checked).toBe(true);
    counts = getLineOverlayCounts();
    expect(counts.trend).toBeGreaterThan(0);
    expect(counts.confidence).toBeGreaterThan(0);
    expect(counts.prediction).toBeGreaterThan(0);
  });

  test('line overlay checkbox intent survives transient unavailable stats restore', async () => {
    const lineComponent = window.Components?.line;
    const main = window.Main;
    expect(lineComponent).toBeTruthy();

    await loadLineExampleAndComputeStats();
    const tab = main.session.getActiveTab();
    await enableLineRegressionOverlays();

    const payload = lineComponent.getPayload?.();
    expect(payload?.config?.showTrendLine).toBe(true);
    expect(payload?.config?.showConfidenceIntervals).toBe(true);
    expect(payload?.config?.showPredictionIntervals).toBe(true);

    const transientPayload = JSON.parse(JSON.stringify(payload));
    transientPayload.config.stats = {
      controls: transientPayload.config.stats?.controls || {},
      statsOptions: transientPayload.config.stats?.statsOptions || {},
      version: 0,
      lastRunVersion: 0,
      hasResults: false,
      signature: null,
      resultsModel: null,
      reportModel: null
    };

    lineComponent.loadFromPayload?.(transientPayload, {
      tabId: tab.id,
      reason: 'test-line-transient-stats-unavailable'
    });
    await flushAll(40);

    expect(document.getElementById('lineShowTrendLine').checked).toBe(true);
    expect(document.getElementById('lineShowIntervals').checked).toBe(true);
    expect(document.getElementById('lineShowPredictionIntervals').checked).toBe(true);
  });
});
