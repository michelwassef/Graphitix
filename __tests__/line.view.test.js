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
  const pointerEvent = (type, props = {}) => {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.entries(props).forEach(([key, value]) => {
      Object.defineProperty(event, key, { configurable: true, value });
    });
    return event;
  };
  const findByAttribute = (root, selector, attribute, value) => Array.from(root?.querySelectorAll?.(selector) || [])
    .find(node => node.getAttribute(attribute) === value) || null;
  const findLineLegendSwatch = (root, seriesName) => findByAttribute(root, '[data-legend-swatch="1"]', 'data-legend-key', seriesName);
  const findLineLegendLabel = (root, seriesName) => findByAttribute(root, 'text[data-legend-key]', 'data-legend-key', seriesName);
  const findRenderedLine = (root, seriesName) => Array.from(root?.querySelectorAll?.('path[data-render-mode="line"]') || [])
    .find(node => node.getAttribute('data-series') === seriesName) || null;
  const findRenderedMarker = (root, seriesName) => Array.from(root?.querySelectorAll?.('circle, rect, path') || [])
    .find(node => node.__linePointData?.seriesName === seriesName) || null;
  const normalizeHeaderCells = row => row.map(value => value == null ? '' : value);
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
  const loadCurrentLineExample = async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();
    const drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    exampleBtn.click();
    await waitForLineLifecycle(drawCursor, { reason: 'line-example-load', timeoutMs: 8000 });
    await flushAll(4);
    const hot = window.Components?.line?.getHot?.();
    expect(hot).toBeTruthy();
    return hot;
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
    const activeTabId = window.Main?.session?.getActiveTab?.()?.id || null;
    const session = window.Components?.line?.__testHooks?.getSessionForTab?.(activeTabId) || null;
    expect(session?.tabId).toBe(activeTabId);
    expect(session?.state?.statsState?.context?.series?.length).toBeGreaterThan(0);
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
    require('../js/shared/plot3d.js');
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

  test('first one-axis redraw after restore cannot freeze a provisional Line margin', () => {
    const hooks = window.Components?.line?.__testHooks;
    expect(typeof hooks?.stabilizeResizeMargin).toBe('function');

    const svgBox = document.createElement('div');
    svgBox.dataset.resizerAspectLocked = 'false';
    svgBox.dataset.resizerLastAxis = 'x';
    svgBox.dataset.resizerAxisViewportLockAxis = 'x';
    svgBox.dataset.resizerAxisViewportLockUntil = String(Date.now() + 5000);

    const provisional = hooks.stabilizeResizeMargin(
      { top: 36, right: 24, bottom: 64, left: 56 },
      { svgBox, commitBaseline: false }
    );
    const measured = hooks.stabilizeResizeMargin(
      { top: 36, right: 24, bottom: 64, left: 92 },
      { svgBox }
    );
    const laterPass = hooks.stabilizeResizeMargin(
      { top: 36, right: 24, bottom: 64, left: 108 },
      { svgBox }
    );

    expect(provisional.left).toBe(56);
    expect(measured.left).toBe(92);
    expect(laterPass.left).toBe(92);
  });

  test('Line view state drops legacy transient resize locks during hydration', () => {
    const hooks = window.Components?.line?.__testHooks;
    expect(typeof hooks?.normalizeViewState).toBe('function');

    const normalized = hooks.normalizeViewState({
      viewMode: '2d',
      resizeMarginLock: { top: 1, right: 2, bottom: 3, left: 4 },
      resizeViewportLock: {
        axis: 'x',
        until: Date.now() + 5000,
        stable: { graphViewportStableWidth: '427', graphViewportStableHeight: '427' }
      }
    });

    expect(normalized).not.toHaveProperty('resizeMarginLock');
    expect(normalized).not.toHaveProperty('resizeViewportLock');
  });

  test('legend labels follow editable header row titles', async () => {
    const hot = await loadCurrentLineExample();
    const originalHeader = Array.isArray(hot?.getData?.()) ? hot.getData()[0].slice() : null;
    expect(originalHeader?.length).toBeGreaterThan(2);

    hot.setDataAtCell([
      [0, 1, 'North renamed'],
      [0, 2, 'South renamed']
    ], 'test-line-header-edit');
    await flushAll(20);

    const headerRow = Array.isArray(hot?.getData?.()) ? hot.getData()[0] : null;
    const expectedHeader = originalHeader.slice();
    expectedHeader[1] = 'North renamed';
    expectedHeader[2] = 'South renamed';
    expect(headerRow?.slice(0, expectedHeader.length)).toEqual(expectedHeader);

    const lineState = window.Components?.line?.__getState?.();
    expect(lineState?.legendItems?.map(item => item.label)).toEqual(
      expectedHeader.slice(1).filter(value => String(value || '').trim())
    );
  });

  test('legend represents each line with a centered marker and exports it', async () => {
    const hot = await loadCurrentLineExample();
    const seriesName = String(hot.getData()?.[0]?.[1] || '').trim();
    expect(seriesName).toBeTruthy();
    const svg = document.getElementById('lineSvg');
    const swatch = findLineLegendSwatch(svg, seriesName);
    const lineSegment = swatch?.querySelector('[data-legend-line="1"]');
    const marker = swatch?.querySelector('[data-legend-marker="1"]');

    expect(swatch).toBeTruthy();
    expect(lineSegment).toBeTruthy();
    expect(marker).toBeTruthy();
    expect(Number(lineSegment.getAttribute('x1'))).toBeLessThan(Number(marker.getAttribute('cx')));
    expect(Number(lineSegment.getAttribute('x2'))).toBeGreaterThan(Number(marker.getAttribute('cx')));
    expect(Number(lineSegment.getAttribute('y1'))).toBe(Number(marker.getAttribute('cy')));
    expect(Number(lineSegment.getAttribute('y2'))).toBe(Number(marker.getAttribute('cy')));
    const renderedLine = findRenderedLine(svg, seriesName);
    const renderedMarker = findRenderedMarker(svg, seriesName);
    expect(lineSegment.getAttribute('stroke')).toBe(renderedLine?.getAttribute('stroke'));
    expect(lineSegment.getAttribute('stroke-width')).toBe(renderedLine?.getAttribute('stroke-width'));
    expect(marker.getAttribute('fill')).toBe(renderedMarker?.getAttribute('fill'));

    const exported = window.Components?.line?.buildExportSvg?.();
    const exportedSwatch = findLineLegendSwatch(exported, seriesName);
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

    const exampleDrawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    document.getElementById('lineLoadExample').click();
    await waitForLineLifecycle(exampleDrawCursor, { reason: 'line-3d-example-load', timeoutMs: 8000 });
    await flushAll(4);

    const svg = document.querySelector('#linePlot svg[data-view-mode="3d"]');
    const swatch = svg?.querySelector('[data-legend-swatch="1"]');
    const activeTabId = window.Main?.session?.getActiveTab?.()?.id || null;
    const ownerSession = window.Components?.line?.__testHooks?.getSessionForTab?.(activeTabId) || null;
    expect(svg).toBeTruthy();
    expect(ownerSession).toBeTruthy();
    expect(svg?.dataset?.rotationControlsAttached).toBe('true');
    expect(svg?.__plot3dRotationControl).toBeTruthy();
    expect(svg?.__plot3dRotationControl?.ownerSession).toBe(ownerSession);
    expect(svg?.__plot3dRotationControl?.componentKey).toBe('line');
    expect(ownerSession?.refs?.rotationSvg).toBe(svg);
    expect(typeof ownerSession?.refs?.rotationRenderer).toBe('function');
    const dynamicLayer = svg.querySelector('[data-layer="line-3d-rotation-dynamic"]');
    const titleLayer = svg.querySelector('[data-layer="line-3d-title"]');
    const legendLayer = svg.querySelector('[data-layer="line-3d-legend"]');
    const linePath = dynamicLayer?.querySelector('[data-line-style-role="line"]');
    const beforePath = linePath?.getAttribute('d') || '';
    expect(dynamicLayer).toBeTruthy();
    expect(titleLayer).toBeTruthy();
    expect(legendLayer).toBeTruthy();
    if(typeof svg.setPointerCapture !== 'function'){
      svg.setPointerCapture = jest.fn();
    }
    if(typeof svg.releasePointerCapture !== 'function'){
      svg.releasePointerCapture = jest.fn();
    }
    svg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 91, clientX: 20, clientY: 20 }));
    svg.dispatchEvent(pointerEvent('pointermove', { pointerId: 91, clientX: 55, clientY: 30 }));
    expect(ownerSession.state.viewState.rotationPending).toBe(true);
    expect(ownerSession.state.viewState.rotationPendingLogged).toBe(false);
    await flushAll(1);
    expect(ownerSession.state.viewState.rotationPending).toBe(false);
    expect(ownerSession.state.viewState.rotationPendingLogged).toBe(false);
    // End the transaction before assertions so a failing expectation cannot leak
    // an active shared gesture into a later test.
    svg.dispatchEvent(pointerEvent('pointerup', { pointerId: 91, clientX: 55, clientY: 30 }));
    expect(svg.querySelector('[data-layer="line-3d-rotation-dynamic"]')).toBe(dynamicLayer);
    expect(svg.querySelector('[data-layer="line-3d-title"]')).toBe(titleLayer);
    expect(svg.querySelector('[data-layer="line-3d-legend"]')).toBe(legendLayer);
    expect(linePath?.getAttribute('d') || '').not.toBe(beforePath);
    expect(swatch?.querySelector('[data-legend-line="1"]')).toBeTruthy();
    expect(swatch?.querySelector('[data-legend-marker="1"]')).toBeTruthy();
  });

  test('render-cache restore keeps 3D rotation controls bound to the canonical Line tab session', async () => {
    const tableFormat = document.getElementById('lineTableFormat');
    const viewMode = document.getElementById('lineViewMode');
    expect(tableFormat).toBeTruthy();
    expect(viewMode).toBeTruthy();

    tableFormat.value = '3d';
    tableFormat.dispatchEvent(new Event('change', { bubbles: true }));
    viewMode.value = '3d';
    viewMode.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(20);

    const exampleDrawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    document.getElementById('lineLoadExample').click();
    await waitForLineLifecycle(exampleDrawCursor, { reason: 'line-3d-example-load', timeoutMs: 8000 });
    await flushAll(4);

    const lineComponent = window.Components?.line;
    const tab = window.Main?.session?.getActiveTab?.() || null;
    const ownerSession = lineComponent?.__testHooks?.getSessionForTab?.(tab?.id) || null;
    const originalSvg = document.querySelector('#linePlot svg[data-view-mode="3d"]');
    expect(tab).toBeTruthy();
    expect(ownerSession?.tabId).toBe(tab.id);
    expect(originalSvg?.__plot3dRotationControl?.ownerSession).toBe(ownerSession);
    const tabHadRefs = Object.prototype.hasOwnProperty.call(tab, 'refs');

    const cache = lineComponent.captureRenderCache?.({
      tabId: tab.id,
      type: 'line',
      reason: 'unit-line-3d-owner-cache-capture'
    });
    expect(cache).toBeTruthy();
    expect(document.querySelector('#linePlot svg')).toBeNull();

    const restoreMeta = {
      tab,
      tabId: tab.id,
      type: 'line',
      reason: 'unit-line-3d-owner-cache-restore'
    };
    expect(lineComponent.restoreRenderCache?.(cache, restoreMeta)).toBe(true);
    lineComponent.rehydrateGraphInteractions?.(restoreMeta);

    const restoredSvg = document.querySelector('#linePlot svg[data-view-mode="3d"]');
    expect(restoredSvg).toBe(originalSvg);
    expect(restoredSvg?.__plot3dRotationControl?.ownerSession).toBe(ownerSession);
    expect(restoredSvg?.__plot3dRotationControl?.ownerSession?.tabId).toBe(tab.id);
    expect(Object.prototype.hasOwnProperty.call(tab, 'refs')).toBe(tabHadRefs);

    if(typeof restoredSvg.setPointerCapture !== 'function'){
      restoredSvg.setPointerCapture = jest.fn();
    }
    if(typeof restoredSvg.releasePointerCapture !== 'function'){
      restoredSvg.releasePointerCapture = jest.fn();
    }
    restoredSvg.dispatchEvent(pointerEvent('pointerdown', { pointerId: 92, clientX: 20, clientY: 20 }));
    restoredSvg.dispatchEvent(pointerEvent('pointermove', { pointerId: 92, clientX: 55, clientY: 30 }));
    expect(ownerSession.state.viewState.rotationPending).toBe(true);
    await flushAll(1);
    expect(ownerSession.state.viewState.rotationPending).toBe(false);
    restoredSvg.dispatchEvent(pointerEvent('pointerup', { pointerId: 92, clientX: 55, clientY: 30 }));
  });

  test('cancelCurrentDraw clears transient 3D rotation frame state', () => {
    const activeTabId = window.Main?.session?.getActiveTab?.()?.id || null;
    const ownerSession = window.Components?.line?.__testHooks?.getSessionForTab?.(activeTabId) || null;
    expect(ownerSession).toBeTruthy();

    ownerSession.state.viewState.rotationPending = true;
    ownerSession.state.viewState.rotationPendingLogged = true;
    window.Components.line.cancelCurrentDraw({ tabId: activeTabId, reason: 'line-rotation-test-cancel' });

    expect(ownerSession.state.viewState.rotationPending).toBe(false);
    expect(ownerSession.state.viewState.rotationPendingLogged).toBe(false);
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
    const hot = await loadCurrentLineExample();
    const seriesName = String(hot.getData()?.[0]?.[1] || '').trim();
    const svg = document.getElementById('lineSvg');
    const legendLabel = findLineLegendLabel(svg, seriesName);
    const seriesPath = findRenderedLine(svg, seriesName);

    expect(legendLabel).toBeTruthy();
    expect(seriesPath).toBeTruthy();
    expect(seriesPath.style.display).not.toBe('none');

    legendLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(5);

    expect(seriesPath.style.display).not.toBe('none');
  });

  test('line marker symbol controls update rendered series style', async () => {
    const hot = await loadCurrentLineExample();
    const seriesName = String(hot.getData()?.[0]?.[1] || '').trim();
    const svg = document.getElementById('lineSvg');
    const primaryMarker = findRenderedMarker(svg, seriesName);
    expect(primaryMarker).toBeTruthy();
    expect(primaryMarker.getAttribute('fill')?.toLowerCase()).not.toBe('#ffaa00');
    const initialRadius = Number(primaryMarker.getAttribute('r')) || 0;

    primaryMarker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(5);

    const fillInput = document.querySelector('.line-point-controls .shared-shape-color-input');
    expect(fillInput).toBeTruthy();
    fillInput.value = '#ffaa00';
    fillInput.dispatchEvent(new Event('input', { bubbles: true }));
    fillInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(30);

    const updatedPrimaryMarker = findRenderedMarker(document.getElementById('lineSvg'), seriesName);
    expect(updatedPrimaryMarker?.getAttribute('fill')?.toLowerCase()).toBe('#ffaa00');

    const lineColorInput = Array.from(document.querySelectorAll('.font-toolbar-host--line-dual .additional-line-controls-panel__color-input')).pop();
    expect(lineColorInput).toBeTruthy();
    lineColorInput.value = '#00aaee';
    lineColorInput.dispatchEvent(new Event('input', { bubbles: true }));
    lineColorInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(30);

    const updatedPrimaryLine = findRenderedLine(document.getElementById('lineSvg'), seriesName);
    expect(updatedPrimaryLine?.getAttribute('stroke')?.toLowerCase()).toBe('#00aaee');

    const fillSwatch = document.querySelector('.line-point-controls .shared-shape-color-swatch');
    expect(fillSwatch).toBeTruthy();
    fillSwatch.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 }));
    await flushAll(30);

    const resizedPrimaryMarker = findRenderedMarker(document.getElementById('lineSvg'), seriesName);
    expect(Number(resizedPrimaryMarker?.getAttribute('r'))).toBeGreaterThan(initialRadius);

    fillSwatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushAll(5);
    const squareInput = document.querySelector('.shared-color-picker__shape-input[value="square"]');
    expect(squareInput).toBeTruthy();
    squareInput.checked = true;
    squareInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(30);

    const reshapedPrimaryMarker = Array.from(document.querySelectorAll('#lineSvg rect'))
      .find(node => node.__linePointData?.seriesName === seriesName);
    expect(reshapedPrimaryMarker).toBeTruthy();
  });

  test('single-series column insertion and undo keep existing colors and marker shapes attached to their datasets', async () => {
    const hot = await loadCurrentLineExample();
    const lineComponent = window.Components?.line;
    const session = lineComponent?.__testHooks?.getActiveSession?.();
    expect(session).toBeTruthy();

    const beforeHeader = normalizeHeaderCells(hot.getDataAtRow(0).slice());
    const namedLabels = beforeHeader.slice(1).filter(value => String(value || '').trim()).map(value => String(value).trim());
    expect(namedLabels.length).toBeGreaterThanOrEqual(4);
    const beforeColors = Object.fromEntries(namedLabels.map(label => [label, session.state.labels.colors[label]]));
    const beforeShapes = session.state.grouped.shapes.slice();

    let drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    hot.alter('insert_col_left', 3, 1, 'header-menu');
    await waitForLineLifecycle(drawCursor, { timeoutMs: 8000 });
    await flushAll(4);

    const insertedSession = lineComponent.__testHooks.getActiveSession();
    const insertedHeader = hot.getDataAtRow(0).slice();
    expect(insertedHeader[3]).toBe('');
    expect(insertedHeader[4]).toBe(beforeHeader[3]);
    expect(insertedHeader[5]).toBe(beforeHeader[4]);
    namedLabels.forEach(label => {
      expect(insertedSession.state.labels.colors[label]).toBe(beforeColors[label]);
    });
    expect(insertedSession.state.grouped.shapes[0]).toBe(beforeShapes[0]);
    expect(insertedSession.state.grouped.shapes[1]).toBe(beforeShapes[1]);
    expect(insertedSession.state.grouped.shapes[3]).toBe(beforeShapes[2]);
    expect(insertedSession.state.grouped.shapes[4]).toBe(beforeShapes[3]);

    drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    hot.alter('remove_col', 3, 1, 'undo:insert-cols');
    await waitForLineLifecycle(drawCursor, { timeoutMs: 8000 });
    await flushAll(4);

    const restoredSession = lineComponent.__testHooks.getActiveSession();
    expect(normalizeHeaderCells(hot.getDataAtRow(0).slice(0, beforeHeader.length))).toEqual(beforeHeader);
    namedLabels.forEach(label => {
      expect(restoredSession.state.labels.colors[label]).toBe(beforeColors[label]);
    });
    expect(restoredSession.state.grouped.shapes).toEqual(beforeShapes);
  });

  test('single-series column deletion undo restores the removed dataset color and marker shape', async () => {
    const hot = await loadCurrentLineExample();
    const lineComponent = window.Components?.line;
    const session = lineComponent?.__testHooks?.getActiveSession?.();
    expect(session).toBeTruthy();

    const beforeHeader = normalizeHeaderCells(hot.getDataAtRow(0).slice());
    const deletedColumn = hot.getData().map(row => row?.[3]);
    const deletedLabel = String(deletedColumn[0] || '').trim();
    expect(deletedLabel).toBeTruthy();
    const beforeColor = session.state.labels.colors[deletedLabel];
    const beforeShape = session.state.grouped.shapes[2];
    expect(beforeColor).toBeTruthy();
    expect(beforeShape).toBeTruthy();

    let drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    hot.alter('remove_col', 3, 1, 'header-menu');
    await waitForLineLifecycle(drawCursor, { timeoutMs: 8000 });
    await flushAll(4);

    drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    hot.alter('insert_col_left', 3, 1, 'undo:delete-cols');
    hot.setDataAtCell(
      deletedColumn.map((value, rowIndex) => [rowIndex, 3, value]),
      'test-line-delete-undo-restore'
    );
    await waitForLineLifecycle(drawCursor, { timeoutMs: 8000 });
    await flushAll(4);

    const restoredSession = lineComponent.__testHooks.getActiveSession();
    expect(normalizeHeaderCells(hot.getDataAtRow(0).slice(0, beforeHeader.length))).toEqual(beforeHeader);
    expect(restoredSession.state.labels.colors[deletedLabel]).toBe(beforeColor);
    expect(restoredSession.state.grouped.shapes[2]).toBe(beforeShape);
  });

  test('line toolbar global line color updates every rendered line', async () => {
    const hot = await loadCurrentLineExample();
    const seriesName = String(hot.getData()?.[0]?.[1] || '').trim();
    const primaryMarker = findRenderedMarker(document.getElementById('lineSvg'), seriesName);
    expect(primaryMarker).toBeTruthy();

    primaryMarker.dispatchEvent(new MouseEvent('click', { bubbles: true }));
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

  test('same-component line tabs isolate the stats-on-plot control and render owner-scoped annotations', async () => {
    const lineComponent = window.Components?.line;
    const main = window.Main;
    expect(lineComponent).toBeTruthy();

    await loadLineExampleAndComputeStats();
    const tabA = main.session.getActiveTab();
    const showStatsA = document.getElementById('lineShowPlotStats');
    expect(showStatsA).toBeTruthy();
    expect(showStatsA.disabled).toBe(false);
    let drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    showStatsA.checked = true;
    showStatsA.dispatchEvent(new window.Event('change', { bubbles: true }));
    await waitForLineLifecycle(drawCursor, { tabId: tabA.id, reason: 'line-show-plot-stats' });
    expect(document.querySelectorAll('#lineSvg [data-plot-stats-annotation="1"]').length).toBeGreaterThan(0);
    expect(lineComponent.captureRuntimeState?.({ tabId: tabA.id, reason: 'test-line-stats-annotation-a' })?.last2d?.showPlotStats).toBe(true);

    main.tabs.handleAddTabClick();
    await flushAll(10);
    await activateWorkspace('line');
    await ensureEmptyDuplicateTab();
    await loadLineExampleAndComputeStats();
    const tabB = main.session.getActiveTab();
    expect(tabB?.id).not.toBe(tabA?.id);
    expect(document.getElementById('lineShowPlotStats').checked).toBe(false);

    drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    main.tabs.activateTab(tabA.id, { reason: 'test-line-stats-annotation-switch-a' });
    await waitForLineLifecycle(drawCursor, {
      tabId: tabA.id,
      actions: ['draw-settled'],
      reason: 'test-line-stats-annotation-switch-a'
    });
    expect(document.getElementById('lineShowPlotStats').checked).toBe(true);
    expect(document.querySelectorAll('#lineSvg [data-plot-stats-annotation="1"]').length).toBeGreaterThan(0);
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

  test('line 2D series data model preserves replicate statistics and log+1 transforms', () => {
    const hooks = window.Components?.line?.__testHooks;
    expect(typeof hooks?.build2dSeriesDataModel).toBe('function');

    const matrix = [
      ['X', 'Control', 'Control', 'Treatment', 'Treatment'],
      [0, 2, 4, 10, 14],
      [1, 3, 5, 12, 16]
    ];
    const model = hooks.build2dSeriesDataModel(matrix, {
      replicates: 2,
      logX: true,
      logY: true,
      logPlusOneX: true,
      logPlusOneY: true
    });

    expect(model.ok).toBe(true);
    expect(model.labels).toEqual(['Control', 'Treatment']);
    expect(model.seriesWithData).toHaveLength(2);
    expect(model.seriesWithData[0].points[0]).toEqual(expect.objectContaining({
      x: 1,
      y: 4,
      replicateCount: 2,
      replicates: [3, 5]
    }));
    expect(model.seriesWithData[0].points[0].stdev).toBeCloseTo(Math.SQRT2, 10);
    expect(model.seriesWithData[0].points[0].lower).toBeCloseTo(4 - Math.SQRT2, 10);
    expect(model.seriesWithData[0].points[0].upper).toBeCloseTo(4 + Math.SQRT2, 10);
    expect(model.xMinRaw).toBe(1);
    expect(model.xMaxRaw).toBe(2);
  });

  test('render-cache restore rebuilds Line statistics context from owner data without redrawing the graph', async () => {
    const lineComponent = window.Components?.line;
    const hooks = lineComponent?.__testHooks;
    const main = window.Main;
    expect(lineComponent).toBeTruthy();
    expect(typeof hooks?.reconcileStatsContextFromOwnerData).toBe('function');

    await loadLineExampleAndComputeStats();
    const tab = main.session.getActiveTab();
    const session = hooks.getActiveSession();
    const payload = lineComponent.getPayload?.();
    const originalSvg = document.getElementById('lineSvg');
    const cache = lineComponent.captureRenderCache?.({
      tabId: tab.id,
      type: 'line',
      reason: 'unit-line-stats-cache-capture'
    });
    expect(cache).toBeTruthy();
    expect(document.getElementById('lineSvg')).toBeNull();

    lineComponent.loadFromPayload?.(payload, {
      tabId: tab.id,
      type: 'line',
      reason: 'unit-line-stats-cache-payload-restore',
      skipDraw: true
    });
    expect(session.state.statsState.context).toBeNull();
    expect(session.state.statsState.hasResults).toBe(true);

    const restored = lineComponent.restoreRenderCache?.(cache, {
      tabId: tab.id,
      type: 'line',
      reason: 'unit-line-stats-cache-restore'
    });
    expect(restored).toBe(true);
    expect(document.getElementById('lineSvg')).toBe(originalSvg);
    expect(session.state.statsState.context?.series?.length).toBeGreaterThan(0);

    // Reopen can restore the graph before the owning HOT manager is ready.  The
    // compute action must be able to lazily reconstruct the transient context once
    // owner data is available, rather than requiring another graph redraw.
    session.state.statsState.context = null;

    const computeBtn = document.getElementById('lineComputeStats');
    expect(computeBtn?.disabled).toBe(false);
    computeBtn.click();
    await Promise.resolve();
    expect(document.getElementById('lineStatsStatus')?.textContent || '').toMatch(/up to date/i);
    expect(computeBtn.textContent).toMatch(/Recalculate statistics/i);
  });

  test('line plot statistics summary is density-aware for multiple series', () => {
    const hooks = window.Components?.line?.__testHooks;
    expect(typeof hooks?.buildPlotStatsLines).toBe('function');
    const makeSeries = (name, slope, r2) => ({
      name,
      regression: {
        coefficientStats: [{ term: 'slope', estimate: slope, ciLow: slope - 0.1, ciHigh: slope + 0.1, p: 0.01 }],
        metrics: { r2, sampleSize: 20 },
        summary: { metrics: { r2, sampleSize: 20 } }
      }
    });
    const single = hooks.buildPlotStatsLines([makeSeries('Control', 1.2, 0.8)], { regressionMode: 'linear' });
    expect(single).toHaveLength(1);
    expect(single[0]).toMatch(/slope\s*=\s*1\.200/);
    expect(single[0]).toMatch(/95% CI/);
    const compact = hooks.buildPlotStatsLines([
      makeSeries('A', 1, 0.8), makeSeries('B', 2, 0.7), makeSeries('C', 3, 0.6)
    ], { regressionMode: 'linear' });
    expect(compact).toHaveLength(3);
    const crowded = hooks.buildPlotStatsLines(Array.from({ length: 5 }, (_, i) => makeSeries(`S${i}`, i + 1, 0.5)), { regressionMode: 'linear' });
    expect(crowded).toEqual([]);
  });

});
