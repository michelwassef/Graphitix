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
}

function createBoxDimensionController(initialWidth, initialHeight){
  const plot = document.getElementById('boxPlot');
  const svgBox = document.querySelector('#boxGraphPanel .svgbox');
  expect(plot).toBeTruthy();
  expect(svgBox).toBeTruthy();

  let width = Math.max(120, Number(initialWidth) || 640);
  let height = Math.max(120, Number(initialHeight) || 520);

  const readWidth = () => width;
  const readHeight = () => height;
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

function readVerticalAxisMetrics(){
  const svg = document.querySelector('#boxPlot svg');
  const state = window.Components?.box?.__getState?.();
  if(!svg || !state){
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
  return {
    xAxisY: xAxis ? xAxis.y1 : null,
    xAxisSpan: xAxis ? Math.abs(xAxis.x2 - xAxis.x1) : null,
    axisToBaseBottomPx: xAxis && Number.isFinite(baseHeight) ? (baseHeight - xAxis.y1) : null,
    yAxisX: yAxis ? yAxis.x1 : null,
    yAxisSpan: yAxis ? Math.abs(yAxis.y2 - yAxis.y1) : null,
    rotated: state.xTickRotateVertical === true,
    significanceViewportExtensionPx: Number(state.significanceViewportExtensionPx) || 0,
    bottomViewportExtensionPx: Number(state.bottomViewportExtensionPx) || 0,
    significancePathCount: svg.querySelectorAll('path.box-significance-annotation').length,
    plotHeightPx: Number(graphGeometry?.plot?.heightPx) || null,
    plotWidthPx: Number(graphGeometry?.plot?.widthPx) || null
  };
}

async function waitForBoxSvg(){
  const svg = await waitFor(() => document.querySelector('#boxPlot svg'), { timeout: 20_000, interval: 40 });
  expect(svg).toBeTruthy();
  return svg;
}

async function loadBoxExample(){
  const button = document.getElementById('boxLoadExample');
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
  await boxComponent.draw();
  await flushAsyncWork(50);
}

async function setBoxWidthAndRedraw(controller, width, height){
  const boxComponent = window.Components?.box;
  expect(boxComponent?.draw).toBeInstanceOf(Function);
  controller.set(width, height);
  await flushAsyncWork(30);
  await boxComponent.draw();
  await flushAsyncWork(50);
}

async function ensureStatsAndSignificanceReady(){
  const computeButton = document.getElementById('boxComputeStats');
  const toggle = document.getElementById('boxShowSignificance');
  expect(computeButton).toBeTruthy();
  expect(toggle).toBeTruthy();

  computeButton.click();
  await waitFor(() => {
    const state = window.Components?.box?.__getState?.();
    const status = document.getElementById('boxStatsStatus');
    return !!state
      && !state.statsComputationPending
      && Number(state.statsLastRunVersion) > 0
      && /up to date/i.test(String(status?.textContent || ''));
  }, { timeout: 45_000, interval: 60 });

  toggle.checked = true;
  toggle.dispatchEvent(new Event('change', { bubbles: true }));

  await waitFor(() => {
    const state = window.Components?.box?.__getState?.();
    const count = document.querySelectorAll('#boxPlot path.box-significance-annotation').length;
    return !!state
      && state.showSignificanceBars === true
      && count > 0
      && Number(state.significanceViewportExtensionPx) > 0;
  }, { timeout: 30_000, interval: 60 });

  await flushAsyncWork(40);
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
    const before = readVerticalAxisMetrics();
    expect(before).toBeTruthy();
    expect(before.rotated).toBe(false);
    expect(before.significanceViewportExtensionPx).toBe(0);

    const { width: startWidth, height } = controller.get();
    await setBoxWidthAndRedraw(controller, Math.round(startWidth * 0.5), height);
    const after = readVerticalAxisMetrics();
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
    const before = readVerticalAxisMetrics();
    expect(before).toBeTruthy();
    expect(before.rotated).toBe(false);
    expect(before.significancePathCount).toBeGreaterThan(0);
    expect(before.significanceViewportExtensionPx).toBeGreaterThan(0);

    const { width: startWidth, height } = controller.get();
    await setBoxWidthAndRedraw(controller, Math.round(startWidth * 0.5), height);
    const after = readVerticalAxisMetrics();
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
});
