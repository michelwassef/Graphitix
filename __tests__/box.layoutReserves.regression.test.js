const { initializeWorkspaceHarness } = require('./setup/workspaceHarness');
const { ensureJStatStub } = require('./helpers/jstatTestStub');

async function flushAsyncWork(iterations = 25){
  for(let i = 0; i < iterations; i += 1){
    await new Promise(resolve => setTimeout(resolve, 0));
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
  const lines = Array.from(axisLayer.querySelectorAll('line'))
    .map(line => ({
      x1: Number(line.getAttribute('x1')),
      y1: Number(line.getAttribute('y1')),
      x2: Number(line.getAttribute('x2')),
      y2: Number(line.getAttribute('y2'))
    }))
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
    significanceViewportExtensionPx: Number(state.significanceViewportExtensionPx) || 0,
    bottomViewportExtensionPx: Number(state.bottomViewportExtensionPx) || 0,
    leftViewportExtensionPx: Number(state.leftViewportExtensionPx) || 0,
    rightViewportExtensionPx: Number(state.rightViewportExtensionPx) || 0,
    significancePathCount: svg.querySelectorAll('path.box-significance-annotation').length,
    plotHeightPx: Number(graphGeometry?.plot?.heightPx) || null,
    plotWidthPx: Number(graphGeometry?.plot?.widthPx) || null,
    topReservePx: Number(graphGeometry?.reserves?.topPx) || null,
    bottomReservePx: Number(graphGeometry?.reserves?.bottomPx) || null,
    axisLabelCount: axisLabels.length,
    rotatedCategoryLabelCount,
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
  longLabels.forEach((label, index) => {
    hot.setDataAtCell(0, index, label, 'test:box-long-labels');
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
      && Number(state.significanceViewportExtensionPx) > 0;
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

describe('Box layout reserves under horizontal shrink', () => {
  jest.setTimeout(90_000);
  let restoreJStat;

  beforeEach(() => {
    jest.resetModules();
    initializeWorkspaceHarness({ mode: 'full-app', resetNamespaces: true });
    restoreJStat = ensureJStatStub();
    if(typeof global.__restoreTestDebugLogs === 'function'){
      global.__restoreTestDebugLogs();
    }
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }

    require('../js/vendor.js');
    require('../js/shared/fileIO.js');
    require('../js/shared/debounce.js');
    require('../js/shared/dataTransforms.js');
    require('../js/shared/dataViews.js');
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
    if(window.Main?.components?.preloadAllBundlesSync){
      window.Main.components.preloadAllBundlesSync();
    }
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/styleSync.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main/tabs/render.js');
    require('../js/main/tabs/unsavedPrompt.js');
    require('../js/main/tabs/duplicatePrompt.js');
    require('../js/main/tabs.js');
    require('../js/main.js');
  });

  afterEach(() => {
    if(restoreJStat){
      restoreJStat();
      restoreJStat = null;
    }
    initializeWorkspaceHarness({ mode: 'full-app', resetNamespaces: true });
    if(typeof global.__suppressTestDebugLogs === 'function'){
      global.__suppressTestDebugLogs();
    }
  });

  test('x-label reserve keeps y-axis geometry stable while labels rotate on 50% width shrink (no significance)', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();

    const controller = createBoxDimensionController(1200, 520);
    await setBoxWidthAndRedraw(controller, 1200, 520);
    const before = readBoxAxisMetrics();
    expect(before).toBeTruthy();
    expect(before.rotated).toBe(false);
    expect(before.significanceViewportExtensionPx).toBe(0);

    const { width: startWidth, height } = controller.get();
    await setBoxWidthAndRedraw(controller, Math.round(startWidth * 0.5), height);
    const after = readBoxAxisMetrics();
    expect(after).toBeTruthy();

    expect(after.rotated).toBe(true);
    expect(after.significanceViewportExtensionPx).toBe(0);
    expect(after.bottomViewportExtensionPx).toBeGreaterThanOrEqual(before.bottomViewportExtensionPx);
    expect(Math.abs(after.yAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(after.axisToBaseBottomPx).not.toBeNull();
    expect(before.axisToBaseBottomPx).not.toBeNull();
    expect(Math.abs(after.yAxisX - before.yAxisX)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(after.plotHeightPx - before.plotHeightPx)).toBeLessThanOrEqual(1.5);
    expect(after.xAxisSpan).toBeLessThan(before.xAxisSpan * 0.8);
  });

  test('x-label and significance reserves stay integrated under 50% width shrink', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();
    await ensureStatsAndSignificanceReady();

    const controller = createBoxDimensionController(1200, 520);
    await setBoxWidthAndRedraw(controller, 1200, 520);
    const before = readBoxAxisMetrics();
    expect(before).toBeTruthy();
    expect(before.rotated).toBe(false);
    expect(before.significancePathCount).toBeGreaterThan(0);
    expect(before.significanceViewportExtensionPx).toBeGreaterThan(0);

    const { width: startWidth, height } = controller.get();
    await setBoxWidthAndRedraw(controller, Math.round(startWidth * 0.5), height);
    const after = readBoxAxisMetrics();
    expect(after).toBeTruthy();

    expect(after.rotated).toBe(true);
    expect(after.significancePathCount).toBeGreaterThan(0);
    expect(after.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(after.bottomViewportExtensionPx).toBeGreaterThanOrEqual(before.bottomViewportExtensionPx);
    expect(Math.abs(after.yAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(after.axisToBaseBottomPx).not.toBeNull();
    expect(before.axisToBaseBottomPx).not.toBeNull();
    expect(Math.abs(after.yAxisX - before.yAxisX)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(after.plotHeightPx - before.plotHeightPx)).toBeLessThanOrEqual(1.5);
    expect(after.xAxisSpan).toBeLessThan(before.xAxisSpan * 0.8);
  });

  test('flip axes swaps drawable axis lengths while keeping labels fully rotated and preserving frame transpose (no significance)', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();

    const controller = createBoxDimensionController(980, 560);
    await setBoxWidthAndRedraw(controller, 980, 560);
    const before = readBoxAxisMetrics();
    expect(before).toBeTruthy();
    expect(before.flipAxes).toBe(false);
    expect(before.significancePathCount).toBe(0);
    expect(before.significanceViewportExtensionPx).toBe(0);

    await setFlipAxesAndRedraw(true);
    const after = readBoxAxisMetrics();
    expect(after).toBeTruthy();
    expect(after.flipAxes).toBe(true);
    expect(after.rotated).toBe(false);
    expect(after.significancePathCount).toBe(0);
    expect(after.significanceViewportExtensionPx).toBe(0);
    expect(after.leftViewportExtensionPx + after.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(after.rotatedCategoryLabelCount).toBe(0);
    expect(after.xAxisSpan).toBeGreaterThan(0);
    expect(after.yAxisSpan).toBeGreaterThan(0);
    expect(after.plotWidthPx).toBeGreaterThan(0);
    expect(after.plotHeightPx).toBeGreaterThan(0);
  });

  test('flip axes keeps axis-length swap stable with significance brackets enabled', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();
    await ensureStatsAndSignificanceReady();

    const controller = createBoxDimensionController(980, 560);
    await setBoxWidthAndRedraw(controller, 980, 560);
    const before = readBoxAxisMetrics();
    expect(before).toBeTruthy();
    expect(before.flipAxes).toBe(false);
    expect(before.significancePathCount).toBeGreaterThan(0);
    expect(before.significanceViewportExtensionPx).toBeGreaterThan(0);

    await setFlipAxesAndRedraw(true);
    const after = readBoxAxisMetrics();
    expect(after).toBeTruthy();
    expect(after.flipAxes).toBe(true);
    expect(after.rotated).toBe(false);
    expect(after.significancePathCount).toBeGreaterThan(0);
    expect(after.significanceViewportExtensionPx).toBe(0);
    expect(after.leftViewportExtensionPx + after.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(after.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(after.rotatedCategoryLabelCount).toBe(0);
    expect(after.xAxisSpan).toBeGreaterThan(0);
    expect(after.yAxisSpan).toBeGreaterThan(0);
    expect(after.plotWidthPx).toBeGreaterThan(0);
    expect(after.plotHeightPx).toBeGreaterThan(0);
  });

  test('flip transition state machine restores orientation-specific proportions across repeated cycles', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();

    const controller = createBoxDimensionController(960, 560);
    await setBoxWidthAndRedraw(controller, 960, 560);
    const baseline = readBoxAxisMetrics();
    expect(baseline).toBeTruthy();
    expect(baseline.flipAxes).toBe(false);
    expect(baseline.flipTransitionPhase).toBe('steady');
    expect(baseline.flipTransitionOrientation).toBe('vertical');

    await setFlipAxesAndRedraw(true);
    const flippedA = readBoxAxisMetrics();
    expect(flippedA).toBeTruthy();
    expect(flippedA.flipAxes).toBe(true);
    expect(flippedA.flipTransitionPhase).toBe('steady');
    expect(flippedA.flipTransitionOrientation).toBe('horizontal');

    await setFlipAxesAndRedraw(false);
    const restoredA = readBoxAxisMetrics();
    expect(restoredA).toBeTruthy();
    expect(restoredA.flipAxes).toBe(false);
    expect(restoredA.flipTransitionOrientation).toBe('vertical');
    expect(restoredA.svgBoxWidthPx).toBeGreaterThan(0);
    expect(restoredA.svgBoxHeightPx).toBeGreaterThan(0);
    expect(restoredA.xAxisSpan).toBeGreaterThan(0);
    expect(restoredA.yAxisSpan).toBeGreaterThan(0);

    await setFlipAxesAndRedraw(true);
    const flippedB = readBoxAxisMetrics();
    expect(flippedB).toBeTruthy();
    expect(flippedB.flipAxes).toBe(true);
    expect(flippedB.flipTransitionOrientation).toBe('horizontal');
    expect(flippedB.svgBoxWidthPx).toBeGreaterThan(0);
    expect(flippedB.svgBoxHeightPx).toBeGreaterThan(0);
    expect(flippedB.xAxisSpan).toBeGreaterThan(0);
    expect(flippedB.yAxisSpan).toBeGreaterThan(0);

    await setBoxWidthAndRedraw(controller, 760, 640);
    const flippedResized = readBoxAxisMetrics();
    expect(flippedResized).toBeTruthy();
    expect(flippedResized.flipAxes).toBe(true);
    expect(flippedResized.svgBoxWidthPx).toBeGreaterThan(0);
    expect(flippedResized.svgBoxHeightPx).toBeGreaterThan(0);

    await setFlipAxesAndRedraw(false);
    const unflippedPropagated = readBoxAxisMetrics();
    expect(unflippedPropagated).toBeTruthy();
    expect(unflippedPropagated.flipAxes).toBe(false);
    expect(unflippedPropagated.flipTransitionOrientation).toBe('vertical');
    expect(unflippedPropagated.svgBoxWidthPx).toBeGreaterThan(0);
    expect(unflippedPropagated.svgBoxHeightPx).toBeGreaterThan(0);

    await setFlipAxesAndRedraw(true);
    const flippedRestoredAfterPropagation = readBoxAxisMetrics();
    expect(flippedRestoredAfterPropagation).toBeTruthy();
    expect(flippedRestoredAfterPropagation.flipAxes).toBe(true);
    expect(flippedRestoredAfterPropagation.flipTransitionOrientation).toBe('horizontal');
    expect(flippedRestoredAfterPropagation.svgBoxWidthPx).toBeGreaterThan(0);
    expect(flippedRestoredAfterPropagation.svgBoxHeightPx).toBeGreaterThan(0);
  });

  test('non-flip significance off-on restores reserve without stretching axes', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();
    await ensureStatsAndSignificanceReady();

    const controller = createBoxDimensionController(980, 560);
    await setBoxWidthAndRedraw(controller, 980, 560);
    const withSignificance = readBoxAxisMetrics();
    expect(withSignificance).toBeTruthy();
    expect(withSignificance.flipAxes).toBe(false);
    expect(withSignificance.significancePathCount).toBeGreaterThan(0);
    expect(withSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);

    await setSignificanceAndRedraw(false);
    const withoutSignificance = readBoxAxisMetrics();
    expect(withoutSignificance).toBeTruthy();
    expect(withoutSignificance.flipAxes).toBe(false);
    expect(withoutSignificance.significancePathCount).toBe(0);
    expect(withoutSignificance.significanceViewportExtensionPx).toBe(0);
    expect(withoutSignificance.bottomViewportExtensionPx).toBeGreaterThan(0);
    expect(withoutSignificance.svgBoxHeightPx).toBeLessThan(withSignificance.svgBoxHeightPx - 4);
    expect(withoutSignificance.topReservePx).toBeLessThan(withSignificance.topReservePx - 4);
    expect(Math.abs(withoutSignificance.bottomReservePx - withSignificance.bottomReservePx)).toBeLessThanOrEqual(4);
    expect(Math.abs(withoutSignificance.xAxisSpan - withSignificance.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(withoutSignificance.plotWidthPx - withSignificance.plotWidthPx)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(withoutSignificance.plotHeightPx - withSignificance.plotHeightPx)).toBeLessThanOrEqual(1.5);

    await setSignificanceAndRedraw(true);
    const restoredAfterReenable = readBoxAxisMetrics();
    expect(restoredAfterReenable).toBeTruthy();
    expect(restoredAfterReenable.flipAxes).toBe(false);
    expect(restoredAfterReenable.significancePathCount).toBeGreaterThan(0);
    expect(restoredAfterReenable.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredAfterReenable.svgBoxHeightPx).toBeGreaterThan(withoutSignificance.svgBoxHeightPx + 4);
    expect(restoredAfterReenable.topReservePx).toBeGreaterThan(withoutSignificance.topReservePx + 4);
    expect(Math.abs(restoredAfterReenable.svgBoxHeightPx - withSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(6);
    expect(Math.abs(restoredAfterReenable.topReservePx - withSignificance.topReservePx)).toBeLessThanOrEqual(4);
    expect(Math.abs(restoredAfterReenable.plotHeightPx - withSignificance.plotHeightPx)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(restoredAfterReenable.xAxisSpan - withSignificance.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(restoredAfterReenable.yAxisSpan).toBeGreaterThan(0);
  });

  test('significance toggle-off after flip-unflip removes reserve without stretching axes', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();
    await ensureStatsAndSignificanceReady();

    const controller = createBoxDimensionController(980, 560);
    await setBoxWidthAndRedraw(controller, 980, 560);
    const beforeFlip = readBoxAxisMetrics();
    expect(beforeFlip).toBeTruthy();
    expect(beforeFlip.flipAxes).toBe(false);
    expect(beforeFlip.significancePathCount).toBeGreaterThan(0);
    expect(beforeFlip.significanceViewportExtensionPx).toBeGreaterThan(0);

    await setFlipAxesAndRedraw(true);
    await setFlipAxesAndRedraw(false);
    const restoredWithSignificance = readBoxAxisMetrics();
    expect(restoredWithSignificance).toBeTruthy();
    expect(restoredWithSignificance.flipAxes).toBe(false);
    expect(restoredWithSignificance.significancePathCount).toBeGreaterThan(0);
    expect(restoredWithSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredWithSignificance.xAxisSpan).toBeGreaterThan(0);
    expect(restoredWithSignificance.yAxisSpan).toBeGreaterThan(0);

    await setSignificanceAndRedraw(false);
    const withoutSignificance = readBoxAxisMetrics();
    expect(withoutSignificance).toBeTruthy();
    expect(withoutSignificance.flipAxes).toBe(false);
    expect(withoutSignificance.significancePathCount).toBe(0);
    expect(withoutSignificance.significanceViewportExtensionPx).toBe(0);
    expect(withoutSignificance.bottomViewportExtensionPx).toBeGreaterThan(0);
    expect(Math.abs(withoutSignificance.bottomViewportExtensionPx - restoredWithSignificance.bottomViewportExtensionPx)).toBeLessThanOrEqual(2);
    expect(withoutSignificance.topReservePx).toBeLessThan(restoredWithSignificance.topReservePx - 4);
    expect(Math.abs(withoutSignificance.bottomReservePx - restoredWithSignificance.bottomReservePx)).toBeLessThanOrEqual(4);
    expect(Math.abs(withoutSignificance.xAxisSpan - restoredWithSignificance.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(withoutSignificance.plotWidthPx - restoredWithSignificance.plotWidthPx)).toBeLessThanOrEqual(1.5);
    expect(withoutSignificance.yAxisSpan).toBeGreaterThan(0);
    expect(withoutSignificance.plotHeightPx).toBeGreaterThan(0);

    await setSignificanceAndRedraw(true);
    const reenabledSignificance = readBoxAxisMetrics();
    expect(reenabledSignificance).toBeTruthy();
    expect(reenabledSignificance.flipAxes).toBe(false);
    expect(reenabledSignificance.significancePathCount).toBeGreaterThan(0);
    expect(reenabledSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(reenabledSignificance.svgBoxHeightPx).toBeGreaterThan(withoutSignificance.svgBoxHeightPx + 4);
    expect(Math.abs(reenabledSignificance.svgBoxHeightPx - restoredWithSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(6);
    expect(reenabledSignificance.topReservePx).toBeGreaterThan(withoutSignificance.topReservePx + 4);
    expect(Math.abs(reenabledSignificance.topReservePx - restoredWithSignificance.topReservePx)).toBeLessThanOrEqual(4);
    expect(Math.abs(reenabledSignificance.plotHeightPx - restoredWithSignificance.plotHeightPx)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(reenabledSignificance.xAxisSpan - restoredWithSignificance.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(reenabledSignificance.yAxisSpan).toBeGreaterThan(0);
  });
});
