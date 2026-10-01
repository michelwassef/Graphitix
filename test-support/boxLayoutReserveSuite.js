/* global afterEach, beforeEach, expect, jest, waitFor */
const { ensureJStatStub } = require('../__tests__/helpers/jstatTestStub');
const {
  loadProductionBootstrap,
  resetProductionNamespaces
} = require('./productionLoader');

async function flushAsyncWork(iterations = 25){
  for(let i = 0; i < iterations; i += 1){
    await new Promise(resolve => { setTimeout(resolve, 0); });
  }
}

async function activateWorkspace(type){
  const graphSelection = window.Main?.tabs?.handleGraphSelection;
  expect(typeof graphSelection).toBe('function');
  const result = graphSelection(type);
  if(result && typeof result.then === 'function'){
    await result;
  }
  await flushAsyncWork(15);
  if(type === 'box'){
    await ensureActiveBoxBinding();
  }
}

function getActiveBoxTabId(){
  return window.Main?.session?.getActiveTab?.()?.id
    || window.Components?.box?.__boundTabId
    || null;
}

function resolveBoxRoot(tabLike = null){
  const tabId = tabLike || getActiveBoxTabId();
  const resolved = window.Shared?.workspaceTabs?.resolveComponentRoot?.({
    tabLike: tabId,
    componentKey: 'box',
    staticRootId: 'boxPage'
  });
  return resolved || document.getElementById('boxPage') || document;
}

function queryBox(selector, tabLike = null){
  const root = resolveBoxRoot(tabLike);
  if(!root || typeof root.querySelector !== 'function'){
    return null;
  }
  return root.querySelector(selector);
}

function getBoxNodeById(id, tabLike = null){
  if(!id){
    return null;
  }
  const root = resolveBoxRoot(tabLike);
  if(!root){
    return null;
  }
  if(typeof root.getElementById === 'function'){
    return root.getElementById(id) || null;
  }
  if(typeof root.querySelector === 'function'){
    return root.querySelector(`#${id}`) || null;
  }
  return null;
}

function getCommittedBoxSvg(tabLike = null){
  return queryBox('#boxPlot svg#boxSvg:not([data-box-pending-render="1"]):not([aria-hidden="true"])', tabLike)
    || queryBox('#boxPlot svg#boxSvg:last-of-type', tabLike)
    || queryBox('#boxPlot svg', tabLike);
}

async function ensureActiveBoxBinding(){
  const boxComponent = window.Components?.box;
  const activeTabId = getActiveBoxTabId();
  const root = resolveBoxRoot(activeTabId);
  expect(boxComponent).toBeTruthy();
  expect(activeTabId).toBeTruthy();
  expect(root).toBeTruthy();
  const ensureResult = boxComponent?.ensure?.({
    tabId: activeTabId,
    root,
    reason: 'box-layout-reserve-test-ensure'
  });
  if(ensureResult && typeof ensureResult.then === 'function'){
    await ensureResult;
  }
  await flushAsyncWork(10);
}

function createBoxDimensionController(initialWidth, initialHeight){
  const plot = getBoxNodeById('boxPlot');
  const svgBox = queryBox('#boxGraphPanel .svgbox');
  const viewport = svgBox?.querySelector?.('.resizer-zoom-viewport') || null;
  expect(plot).toBeTruthy();
  expect(svgBox).toBeTruthy();

  let width = Math.max(120, Number(initialWidth) || 640);
  let height = Math.max(120, Number(initialHeight) || 520);

  const parseStylePx = value => {
    const numeric = Number.parseFloat(String(value || '').replace('px', '').trim());
    return Number.isFinite(numeric) ? numeric : NaN;
  };
  const readWidth = () => {
    const liveStyleWidth = parseStylePx(svgBox.style?.width);
    if(Number.isFinite(liveStyleWidth) && liveStyleWidth > 0){
      width = Math.max(120, liveStyleWidth);
    }
    return width;
  };
  const readHeight = () => {
    const liveStyleHeight = parseStylePx(svgBox.style?.height);
    if(Number.isFinite(liveStyleHeight) && liveStyleHeight > 0){
      height = Math.max(120, liveStyleHeight);
    }
    return height;
  };
  const readRect = () => ({
    width: readWidth(),
    height: readHeight(),
    top: 0,
    left: 0,
    right: readWidth(),
    bottom: readHeight()
  });

  const apply = () => {
    svgBox.style.width = `${width}px`;
    svgBox.style.height = `${height}px`;
    svgBox.style.flex = '0 0 auto';
    svgBox.style.maxWidth = 'none';
    svgBox.style.maxHeight = 'none';
    svgBox.style.aspectRatio = `${width} / ${height}`;
    const ratio = height > 0 ? width / height : 1;
    svgBox.dataset.resizerWidth = `${width}px`;
    svgBox.dataset.resizerHeight = `${height}px`;
    svgBox.dataset.resizerBaseWidth = String(width);
    svgBox.dataset.resizerBaseHeight = String(height);
    svgBox.dataset.resizerDefaultWidth = String(width);
    svgBox.dataset.resizerDefaultHeight = String(height);
    svgBox.dataset.resizerAspectRatio = String(ratio);
    svgBox.dataset.resizerAspectLocked = 'false';
    svgBox.dataset.resizerResized = 'true';
    svgBox.dataset.resizerLastAxis = 'both';
    svgBox.dataset.svgWidth = String(width);
    svgBox.dataset.svgHeight = String(height);
    svgBox.dataset.defaultWidth = String(width);
    svgBox.dataset.defaultHeight = String(height);
    svgBox.dataset.graphWidthPx = String(width);
    svgBox.dataset.graphHeightPx = String(height);
    svgBox.dataset.graphAspectRatio = String(ratio);
    svgBox.dataset.graphAspectLocked = 'false';
    svgBox.dataset.aspectLocked = 'false';
    if(typeof window.Shared?.applyResizableBoxSize === 'function'){
      window.Shared.applyResizableBoxSize(svgBox, {
        width,
        height,
        lockAspect: false,
        source: 'box-layout-test-controller'
      });
    }
    if(viewport?.style){
      viewport.style.width = `${width}px`;
      viewport.style.height = `${height}px`;
    }
  };
  apply();

  Object.defineProperty(plot, 'clientWidth', {
    configurable: true,
    get: readWidth
  });
  Object.defineProperty(plot, 'clientHeight', {
    configurable: true,
    get: readHeight
  });
  plot.getBoundingClientRect = readRect;
  svgBox.getBoundingClientRect = readRect;
  if(viewport){
    Object.defineProperty(viewport, 'clientWidth', {
      configurable: true,
      get: readWidth
    });
    Object.defineProperty(viewport, 'clientHeight', {
      configurable: true,
      get: readHeight
    });
    viewport.getBoundingClientRect = readRect;
  }

  return {
    set(nextWidth, nextHeight){
      width = Math.max(120, Number(nextWidth) || width);
      height = Math.max(120, Number(nextHeight) || height);
      apply();
      return { width, height };
    },
    get(){
      return { width, height };
    }
  };
}

function readBoxAxisMetrics(){
  const svg = getCommittedBoxSvg();
  const svgBox = queryBox('#boxGraphPanel .svgbox');
  const state = window.Components?.box?.__getState?.();
  if(!svg || !state || !svgBox){
    return null;
  }
  const axisLayer = svg.querySelector('g[data-layer="box-axis"]') || svg;
  const primaryAxisLines = Array.from(axisLayer.querySelectorAll('line[data-box-primary-axis]'));
  const lines = (primaryAxisLines.length ? primaryAxisLines : Array.from(axisLayer.querySelectorAll('line')))
    .map(line => {
      if(line.getAttribute('stroke') === 'transparent' || line.getAttribute('data-export-ignore') === '1'){
        return null;
      }
      return {
        x1: Number(line.getAttribute('x1')),
        y1: Number(line.getAttribute('y1')),
        x2: Number(line.getAttribute('x2')),
        y2: Number(line.getAttribute('y2'))
      };
    })
    .filter(Boolean)
    .filter(line => [line.x1, line.y1, line.x2, line.y2].every(Number.isFinite));
  const horizontal = lines.filter(line => Math.abs(line.y1 - line.y2) <= 0.01 && Math.abs(line.x2 - line.x1) > 1);
  const vertical = lines.filter(line => Math.abs(line.x1 - line.x2) <= 0.01 && Math.abs(line.y2 - line.y1) > 1);
  const xAxis = horizontal
    .slice()
    .sort((a, b) => Math.abs(b.x2 - b.x1) - Math.abs(a.x2 - a.x1) || b.y1 - a.y1)[0] || null;
  const yAxis = vertical
    .slice()
    .sort((a, b) => Math.abs(b.y2 - b.y1) - Math.abs(a.y2 - a.y1) || a.x1 - b.x1)[0] || null;
  const graphGeometry = state.graphGeometry || {};
  const dataBoxBaseHeight = Number(svg.getAttribute('data-box-base-height'));
  const svgHeightAttr = Number(svg.getAttribute('height'));
  const viewBoxParts = String(svg.getAttribute('viewBox') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBoxWidth = viewBoxParts.length === 4 ? viewBoxParts[2] : NaN;
  const viewBoxHeight = viewBoxParts.length === 4 ? viewBoxParts[3] : NaN;
  const baseHeight = Number.isFinite(dataBoxBaseHeight) && dataBoxBaseHeight > 0
    ? dataBoxBaseHeight
    : Number.isFinite(svgHeightAttr) && svgHeightAttr > 0
      ? svgHeightAttr
      : viewBoxHeight;
  const axisLabels = Array.isArray(state.lastAxisLabels) ? state.lastAxisLabels.map(label => String(label || '').trim()) : [];
  const rotatedCategoryLabelCount = Array.from(axisLayer.querySelectorAll('text'))
    .filter(node => {
      const label = String(node?.textContent || '').trim();
      if(!label || !axisLabels.includes(label)){
        return false;
      }
      const transform = String(node.getAttribute('transform') || '');
      return /rotate\(\s*-90/i.test(transform);
    })
    .length;
  const firstRotatedLabel = axisLayer.querySelector('text[data-box-x-tick-label="1"][transform*="rotate(-45"]');
  const firstRotatedLabelX = Number(firstRotatedLabel?.getAttribute('x'));
  const firstRotatedLabelFontSize = Number(firstRotatedLabel?.getAttribute('font-size')) || 12;
  const firstRotatedLabelWidth = firstRotatedLabel
    ? window.Shared.chartStyle.measureText(
        firstRotatedLabel.textContent || '',
        window.Shared.chartStyle.makeFont(firstRotatedLabelFontSize)
      )
    : NaN;
  const firstRotatedLabelLeftPx = Number.isFinite(firstRotatedLabelX) && Number.isFinite(firstRotatedLabelWidth)
    ? firstRotatedLabelX - Math.SQRT1_2 * (firstRotatedLabelWidth + firstRotatedLabelFontSize)
    : null;
  const svgBoxRect = svgBox.getBoundingClientRect();
  const ratio = Number.isFinite(Number(svgBoxRect?.width)) && Number.isFinite(Number(svgBoxRect?.height)) && Number(svgBoxRect.height) > 0
    ? Number(svgBoxRect.width) / Number(svgBoxRect.height)
    : null;
  return {
    xAxisY: xAxis ? xAxis.y1 : null,
    xAxisSpan: xAxis ? Math.abs(xAxis.x2 - xAxis.x1) : null,
    axisToBaseBottomPx: xAxis && Number.isFinite(baseHeight) ? (baseHeight - xAxis.y1) : null,
    yAxisX: yAxis ? yAxis.x1 : null,
    yAxisSpan: yAxis ? Math.abs(yAxis.y2 - yAxis.y1) : null,
    rotated: state.xTickRotateVertical === true,
    flipAxes: state.flipAxes === true,
    // Compatibility-shaped metric names below are derived from the current
    // completed layout; they are not persisted Box state or frame authority.
    significanceViewportExtensionPx: Number(graphGeometry?.reserves?.significancePx) || 0,
    bottomViewportExtensionPx: Number(graphGeometry?.reserves?.xLabelPx) || 0,
    leftViewportExtensionPx: Number(graphGeometry?.reserves?.leftPx) || 0,
    rightViewportExtensionPx: Number(graphGeometry?.reserves?.rightPx) || 0,
    appliedVerticalFrameReservePx: (Number(svgBox.__cartesianLayoutPlan?.contentEnvelope?.extensionTop) || 0)
      + (Number(svgBox.__cartesianLayoutPlan?.contentEnvelope?.extensionBottom) || 0),
    appliedHorizontalFrameReservePx: (Number(svgBox.__cartesianLayoutPlan?.contentEnvelope?.extensionLeft) || 0)
      + (Number(svgBox.__cartesianLayoutPlan?.contentEnvelope?.extensionRight) || 0),
    cartesianPlan: svgBox.__cartesianLayoutPlan || null,
    significancePathCount: svg.querySelectorAll('path.box-significance-annotation').length,
    plotHeightPx: Number(graphGeometry?.plot?.heightPx) || null,
    plotWidthPx: Number(graphGeometry?.plot?.widthPx) || null,
    xLabelLeadingInsetPx: Number(graphGeometry?.xTicks?.leadingInsetPx) || 0,
    topReservePx: Number(graphGeometry?.reserves?.topPx) || null,
    bottomReservePx: Number(graphGeometry?.reserves?.bottomPx) || null,
    axisLabelCount: axisLabels.length,
    rotatedCategoryLabelCount,
    viewBoxWidthPx: Number.isFinite(viewBoxWidth) ? viewBoxWidth : null,
    firstRotatedLabelLeftPx,
    svgBoxWidthPx: Number.isFinite(Number(svgBoxRect?.width)) ? Number(svgBoxRect.width) : null,
    svgBoxHeightPx: Number.isFinite(Number(svgBoxRect?.height)) ? Number(svgBoxRect.height) : null,
    svgBoxAspectRatio: ratio,
    flipTransitionPhase: state.flipTransition?.phase || null,
    flipTransitionOrientation: state.flipTransition?.active?.orientation || null
  };
}

async function waitForBoxSvg(){
  const svg = await waitFor(() => getCommittedBoxSvg(), { timeout: 20_000, interval: 40 });
  expect(svg).toBeTruthy();
  return svg;
}

async function loadBoxExample(){
  const button = getBoxNodeById('boxLoadExample');
  expect(button).toBeTruthy();
  button.click();
  await flushAsyncWork(50);
  await waitForBoxSvg();
}

async function applyLongBoxLabels(){
  const boxComponent = window.Components?.box;
  const hot = boxComponent?.__getState?.()?.hot;
  expect(boxComponent).toBeTruthy();
  expect(hot?.setDataAtCell).toBeInstanceOf(Function);
  const longLabels = [
    'Control baseline condition profile',
    'Treatment alpha condition profile',
    'Treatment beta condition profile'
  ];
  hot.loadData([
    longLabels,
    [12, 15, 14],
    [14.3, 17, 15.3],
    [11, 14.6, 13],
    [13.3, 16, 16.3]
  ], {
    source: 'test:box-long-labels',
    recordUndo: false
  });
  await flushAsyncWork(50);
  const state = boxComponent?.__getState?.();
  const previousDrawToken = Number(state?.drawToken) || 0;
  state?.scheduleDraw?.({ force: true, reason: 'box-layout-test-long-labels' });
  await waitFor(() => (Number(boxComponent?.__getState?.()?.drawToken) || 0) > previousDrawToken, {
    timeout: 15_000,
    interval: 40
  });
  await flushAsyncWork(50);
}

async function setBoxWidthAndRedraw(controller, width, height){
  const boxComponent = window.Components?.box;
  const state = boxComponent?.__getState?.();
  expect(state?.scheduleDraw).toBeInstanceOf(Function);
  controller.set(width, height);
  await flushAsyncWork(30);
  const previousDrawToken = Number(state?.drawToken) || 0;
  state.scheduleDraw({ force: true, reason: 'box-layout-test-resize' });
  await waitFor(() => (Number(boxComponent?.__getState?.()?.drawToken) || 0) > previousDrawToken, {
    timeout: 15_000,
    interval: 40
  });
  await flushAsyncWork(50);
}

async function doubleClickBoxResizeHandle(){
  const boxComponent = window.Components?.box;
  const state = boxComponent?.__getState?.();
  const svgBox = queryBox('#boxGraphPanel .svgbox');
  const handle = queryBox('#boxGraphPanel .svgbox .resizer-corner');
  expect(state?.scheduleDraw).toBeInstanceOf(Function);
  expect(svgBox?.__sharedResizableBoxApi).toBeTruthy();
  expect(handle).toBeTruthy();
  const previousDrawToken = Number(state.drawToken) || 0;
  handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(Number(svgBox.dataset.resizerBaseWidth)).toBeGreaterThan(0);
  expect(Number(svgBox.dataset.resizerBaseHeight)).toBeGreaterThan(0);
  state.scheduleDraw({
    force: true,
    viewOnly: true,
    reason: 'box-layout-test-dblclick-settle',
    resizePhase: 'reset',
    forceCanvasRecompute: true
  });
  await waitFor(() => (Number(boxComponent?.__getState?.()?.drawToken) || 0) > previousDrawToken, {
    timeout: 15_000,
    interval: 40
  });
  await flushAsyncWork(50);
}

function setBoxResetDefaults(width, height){

  const svgBox = queryBox('#boxGraphPanel .svgbox');
  const api = svgBox?.__sharedResizableBoxApi;
  expect(api?.restoreSizingState).toBeInstanceOf(Function);
  const current = api.getState();
  api.restoreSizingState({
    ...current,
    defaultWidth: width,
    defaultHeight: height
  }, { reason: 'box-layout-test-reset-defaults' });
}

async function setFlipAxesAndRedraw(enabled){
  const boxComponent = window.Components?.box;
  const flipCheckbox = getBoxNodeById('boxFlipAxes');
  const state = boxComponent?.__getState?.();
  expect(state?.scheduleDraw).toBeInstanceOf(Function);
  expect(flipCheckbox).toBeTruthy();
  flipCheckbox.checked = !!enabled;
  flipCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
  await flushAsyncWork(50);
  const previousDrawToken = Number(state?.drawToken) || 0;
  state.scheduleDraw({ force: true, reason: 'box-layout-test-flip' });
  await waitFor(() => (Number(boxComponent?.__getState?.()?.drawToken) || 0) > previousDrawToken, {
    timeout: 15_000,
    interval: 40
  });
  await flushAsyncWork(50);
}

function openBoxAxisControls(axis){
  const svg = getCommittedBoxSvg();
  expect(svg).toBeTruthy();
  const axisKey = axis === 'x' ? 'x' : 'y';
  const candidates = Array.from(svg.querySelectorAll('line[data-axis-control="1"]'));
  const target = candidates.find(line => {
    const dx = Math.abs(Number(line.getAttribute('x2')) - Number(line.getAttribute('x1')));
    const dy = Math.abs(Number(line.getAttribute('y2')) - Number(line.getAttribute('y1')));
    return axisKey === 'x' ? dx > dy : dy > dx;
  });
  expect(target).toBeTruthy();
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const input = document.querySelector(
    '.font-toolbar-host[data-font-toolbar-scope="box"] .axis-controls-panel__field--numeric input[type="number"]'
  );
  expect(input).toBeTruthy();
  return input;
}

async function ensureStatsAndSignificanceReady(){
  const computeButton = getBoxNodeById('boxComputeStats');
  const toggle = getBoxNodeById('boxShowSignificance');
  expect(computeButton).toBeTruthy();
  expect(toggle).toBeTruthy();

  computeButton.click();
  await waitFor(() => {
    const state = window.Components?.box?.__getState?.();
    const status = getBoxNodeById('boxStatsStatus');
    return !!state
      && !state.statsComputationPending
      && Number(state.statsLastRunVersion) > 0
      && /up to date/i.test(String(status?.textContent || ''));
  }, { timeout: 45_000, interval: 60 });

  toggle.checked = true;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));

  await waitFor(() => {
    const state = window.Components?.box?.__getState?.();
    const count = (getCommittedBoxSvg()?.querySelectorAll?.('path.box-significance-annotation') || []).length;
    return !!state
      && state.showSignificanceBars === true
      && count > 0
      && Number(state.graphGeometry?.reserves?.significancePx) > 0;
  }, { timeout: 30_000, interval: 60 });

  await flushAsyncWork(40);
}

async function setSignificanceAndRedraw(enabled){
  const boxComponent = window.Components?.box;
  const toggle = getBoxNodeById('boxShowSignificance');
  const state = boxComponent?.__getState?.();
  expect(state?.scheduleDraw).toBeInstanceOf(Function);
  expect(toggle).toBeTruthy();
  toggle.checked = !!enabled;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));
  await flushAsyncWork(60);
  const previousDrawToken = Number(state?.drawToken) || 0;
  state.scheduleDraw({ force: true, reason: 'box-layout-test-significance-toggle' });
  await waitFor(() => (Number(boxComponent?.__getState?.()?.drawToken) || 0) > previousDrawToken, {
    timeout: 15_000,
    interval: 40
  });
  await flushAsyncWork(60);
}

function createBoxLayoutReserveTestContext() {
  jest.setTimeout(90_000);
  let restoreJStat;

  beforeEach(() => {
    jest.resetModules();
    resetProductionNamespaces();
    restoreJStat = ensureJStatStub();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: ['box']
    });
  });

  afterEach(() => {
    if (restoreJStat) {
      restoreJStat();
      restoreJStat = null;
    }
    resetProductionNamespaces();
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  return {
    flushAsyncWork,
    activateWorkspace,
    getBoxNodeById,
    getCommittedBoxSvg,
    createBoxDimensionController,
    readBoxAxisMetrics,
    loadBoxExample,
    applyLongBoxLabels,
    setBoxWidthAndRedraw,
    doubleClickBoxResizeHandle,
    setBoxResetDefaults,
    setFlipAxesAndRedraw,
    openBoxAxisControls,
    ensureStatsAndSignificanceReady,
    setSignificanceAndRedraw
  };
}

module.exports = { createBoxLayoutReserveTestContext };

