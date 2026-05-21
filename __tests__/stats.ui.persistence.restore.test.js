const { ensureJStatStub } = require('./helpers/jstatTestStub');

const originalDebug = console.debug;
const originalLog = console.log;

function ensureSvdStub(){
  const previousGlobal = global.SVDJS;
  const previousWindow = typeof window !== 'undefined' ? window.SVDJS : undefined;
  global.__svdCallCount = 0;
  const stub = {
    SVD(matrix = []){
      global.__svdCallCount = (global.__svdCallCount || 0) + 1;
      const rows = Array.isArray(matrix) ? matrix.length : 0;
      const cols = rows > 0 && Array.isArray(matrix[0]) ? matrix[0].length : 0;
      const componentCount = Math.max(1, Math.min(rows, cols, 3));
      const q = Array.from({ length: componentCount }, (_, idx) => componentCount - idx + 1);
      const u = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: componentCount }, (_, k) => ((r + 1) / (componentCount + k + 1)))
      );
      const v = Array.from({ length: cols }, (_, c) =>
        Array.from({ length: componentCount }, (_, k) => ((c + 1) / (componentCount + k + 1)))
      );
      return { u, v, q };
    }
  };
  global.SVDJS = stub;
  if(typeof window !== 'undefined'){
    window.SVDJS = stub;
  }
  return () => {
    delete global.__svdCallCount;
    if(typeof previousGlobal === 'undefined'){
      delete global.SVDJS;
    }else{
      global.SVDJS = previousGlobal;
    }
    if(typeof window !== 'undefined'){
      if(typeof previousWindow === 'undefined'){
        delete window.SVDJS;
      }else{
        window.SVDJS = previousWindow;
      }
    }
  };
}

async function activateWorkspace(type){
  const graphSelection = window.Main?.tabs?.handleGraphSelection;
  expect(typeof graphSelection).toBe('function');
  const result = graphSelection(type);
  if(result && typeof result.then === 'function'){
    await result;
  }
  await Promise.resolve();
}

async function flushAsyncWork(iterations = 40){
  for(let i = 0; i < iterations; i += 1){
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

function expectSingleReportPanel(targetId, hostId){
  const target = document.getElementById(targetId);
  const host = document.getElementById(hostId);
  expect(target).toBeTruthy();
  expect(host).toBeTruthy();
  expect(host.querySelectorAll('.stats-report-panel').length).toBe(1);
  expect(target.querySelectorAll('.stats-report-panel').length).toBe(1);
  expect(host.parentElement?.lastElementChild).toBe(host);
}

async function prepareBoxStats(){
  await activateWorkspace('box');
  await flushAsyncWork(20);
  const box = window.Components?.box;
  const state = box?.__getState?.();
  state.hot.loadData([
    ['Control', 'Treatment A', 'Treatment B'],
    [10, 16, 23],
    [11, 17, 24],
    [12, 18, 25],
    [13, 19, 26],
    [14, 20, 27]
  ]);
  state.selectedCols = new Set([0, 1, 2]);
  state.statsTest = 'parametric';
  state.statsMode = 'all';
  state.statsPaired = false;
  state.statsPostHoc = 'tukey';
  await box.draw();
  await flushAsyncWork(20);
  document.getElementById('boxComputeStats').click();
  await flushAsyncWork(30);
  return box;
}

async function prepareScatterStats(){
  await activateWorkspace('scatter');
  document.getElementById('scatterLoadExample').click();
  await flushAsyncWork(60);
  document.getElementById('scatterComputeStats').click();
  await flushAsyncWork(80);
  return window.Components?.scatter;
}

async function prepareLineStats(){
  await activateWorkspace('line');
  document.getElementById('lineLoadExample').click();
  await flushAsyncWork(60);
  document.getElementById('lineComputeStats').click();
  await flushAsyncWork(80);
  return window.Components?.line;
}

async function preparePieStats(){
  await activateWorkspace('pie');
  document.getElementById('pieLoadExample').click();
  await flushAsyncWork(60);
  document.getElementById('pieComputeStats').click();
  await flushAsyncWork(40);
  return window.Components?.pie;
}

async function prepareHistStats(){
  await activateWorkspace('hist');
  document.getElementById('histLoadExample').click();
  await flushAsyncWork(80);
  const hist = window.Components?.hist;
  hist?.draw?.();
  await flushAsyncWork(60);
  return hist;
}

async function prepareRocStats(){
  await activateWorkspace('roc');
  document.getElementById('rocLoadExample').click();
  await flushAsyncWork(80);
  const roc = window.Components?.roc;
  roc?.draw?.();
  await flushAsyncWork(80);
  return roc;
}

async function prepareSurvivalStats(){
  await activateWorkspace('survival');
  document.getElementById('survivalLoadExample').click();
  await flushAsyncWork(80);
  const hazardToggle = document.getElementById('survivalShowHazardRatios');
  const coxToggle = document.getElementById('survivalFitCox');
  hazardToggle.checked = true;
  coxToggle.checked = true;
  hazardToggle.dispatchEvent(new Event('change', { bubbles: true }));
  coxToggle.dispatchEvent(new Event('change', { bubbles: true }));
  await flushAsyncWork(20);
  const survival = window.Components?.survival;
  survival?.draw?.();
  await flushAsyncWork(160);
  return survival;
}

async function preparePcaStats(){
  await activateWorkspace('pca');
  document.getElementById('pcaLoadExample').click();
  await flushAsyncWork(140);
  return window.Components?.pca;
}

async function prepareHeatmapStats(view = 'corr-columns'){
  await activateWorkspace('heatmap');
  document.getElementById('heatmapLoadExample').click();
  await flushAsyncWork(120);
  const select = document.getElementById('heatmapView');
  if(select && select.value !== view){
    select.value = view;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(80);
  }
  const heatmap = window.Components?.heatmap;
  heatmap?.draw?.();
  await flushAsyncWork(100);
  return heatmap;
}

describe('UI stats persistence and restore', () => {
  let restoreJStat;
  let restoreSvd;

  beforeEach(() => {
    jest.resetModules();
    console.debug = jest.fn();
    console.log = jest.fn();
    global.requestAnimationFrame = (cb) => {
      try{ cb(Date.now()); }catch(_err){}
      return 1;
    };
    global.cancelAnimationFrame = () => {};

    if(typeof window !== 'undefined'){
      delete window.Main;
      delete window.Components;
      delete window.Shared;
    }
    if(typeof global.__restoreTestDebugLogs === 'function'){
      global.__restoreTestDebugLogs();
    }
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }
    restoreJStat = ensureJStatStub();
    restoreSvd = ensureSvdStub();

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
    if(window.Main?.components?.preloadAllBundlesSync){
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
    if(typeof restoreJStat === 'function'){
      restoreJStat();
      restoreJStat = null;
    }
    if(typeof restoreSvd === 'function'){
      restoreSvd();
      restoreSvd = null;
    }
    if(typeof global.__suppressTestDebugLogs === 'function'){
      global.__suppressTestDebugLogs();
    }
    if(typeof window !== 'undefined'){
      delete window.Main;
      delete window.Components;
      delete window.Shared;
    }
    delete global.Main;
    delete global.Components;
    delete global.Shared;
  });

  afterAll(() => {
    console.debug = originalDebug;
    console.log = originalLog;
  });

  test('payload restore preserves stats content for box, scatter, line, pca, and heatmap', async () => {
    const box = await prepareBoxStats();
    const boxPayload = box.getPayload();
    expect(boxPayload?.config?.stats).toBeTruthy();
    expect(boxPayload.config.stats.resultsHtml || '').not.toContain('stats-report-panel');
    expect(boxPayload.config.stats.reportHtml || '').toContain('Reporting and reproducibility');
    document.getElementById('statsResults').innerHTML = '';
    document.getElementById('boxStatsReportHost').innerHTML = '';
    box.loadFromPayload(boxPayload, { source: 'test-box-restore', skipDraw: true });
    await flushAsyncWork(40);
    expect(`${document.getElementById('statsResults')?.textContent || ''} ${document.getElementById('boxStatsReportHost')?.textContent || ''}`).toMatch(/One-way ANOVA|Reporting and reproducibility/i);
    expect(document.getElementById('boxStatsReportHost')?.querySelectorAll('.stats-report-panel').length).toBe(1);
    expect(document.getElementById('boxStatsReportHost')?.parentElement?.lastElementChild).toBe(document.getElementById('boxStatsReportHost'));

    const scatter = await prepareScatterStats();
    const scatterPayload = scatter.getPayload();
    expect(scatterPayload?.config?.stats?.resultsHtml || '').not.toContain('stats-report-panel');
    expect(scatterPayload?.config?.stats?.reportHtml || '').toContain('Reporting and reproducibility');
    document.getElementById('scatterStatsResults').innerHTML = '';
    scatter.loadFromPayload(scatterPayload, { source: 'test-scatter-restore', skipDraw: true });
    await flushAsyncWork(40);
    expect(document.getElementById('scatterStatsResults')?.textContent || '').toMatch(/Overall test summary|Reporting and reproducibility/i);
    expectSingleReportPanel('scatterStatsResults', 'scatterStatsReportHost');

    const line = await prepareLineStats();
    const linePayload = line.getPayload();
    expect(linePayload?.config?.stats?.resultsHtml || '').not.toContain('stats-report-panel');
    expect(linePayload?.config?.stats?.reportHtml || '').toContain('Reporting and reproducibility');
    document.getElementById('lineStatsResults').innerHTML = '';
    line.loadFromPayload(linePayload, { source: 'test-line-restore', skipDraw: true });
    await flushAsyncWork(40);
    expect(document.getElementById('lineStatsResults')?.textContent || '').toMatch(/correlation coefficients|Reporting and reproducibility|Series/i);
    expectSingleReportPanel('lineStatsResults', 'lineStatsReportHost');

    const pca = await preparePcaStats();
    const pcaPayload = pca.getPayload();
    expect(pcaPayload?.config?.stats?.summaryHtml || '').toContain('Samples analysed');
    expect(pcaPayload?.config?.stats?.reportHtml || '').toContain('Reporting and reproducibility');
    document.getElementById('pcaStatsResults').innerHTML = '';
    pca.loadFromPayload(pcaPayload, { source: 'test-pca-restore', skipDraw: true });
    await flushAsyncWork(60);
    expect(document.getElementById('pcaStatsResults')?.textContent || '').toContain('Reporting and reproducibility');
    expectSingleReportPanel('pcaStatsResults', 'pcaStatsReportHost');

    const heatmap = await prepareHeatmapStats('corr-columns');
    const heatmapPayload = heatmap.getPayload();
    document.getElementById('heatmapStatsContent').innerHTML = '';
    heatmap.loadFromPayload(heatmapPayload, { source: 'test-heatmap-restore', skipDraw: false });
    await flushAsyncWork(120);
    expect(document.getElementById('heatmapStatsContent')?.textContent || '').toMatch(/Items analysed|Reporting and reproducibility/i);
    expectSingleReportPanel('heatmapStatsContent', 'heatmapStatsReportHost');
  }, 120000);

  test('render cache restore preserves stats panels for pie, hist, roc, survival, pca, and heatmap', async () => {
    const pie = await preparePieStats();
    const pieBefore = document.getElementById('pieStatsResults')?.textContent || '';
    const pieCache = pie.captureRenderCache();
    document.getElementById('pieStatsResults').innerHTML = '';
    expect(pie.restoreRenderCache(pieCache)).toBe(true);
    await flushAsyncWork(20);
    expect(document.getElementById('pieStatsResults')?.textContent || '').toContain(pieBefore.slice(0, Math.min(20, pieBefore.length)));
    expectSingleReportPanel('pieStatsResults', 'pieStatsReportHost');

    const hist = await prepareHistStats();
    const histBefore = document.getElementById('histStatsResults')?.textContent || '';
    const histCache = hist.captureRenderCache();
    document.getElementById('histStatsResults').innerHTML = '';
    expect(hist.restoreRenderCache(histCache)).toBe(true);
    await flushAsyncWork(20);
    expect(document.getElementById('histStatsResults')?.textContent || '').toContain('Descriptive statistics');
    expect(histBefore.length).toBeGreaterThan(0);
    expectSingleReportPanel('histStatsResults', 'histStatsReportHost');

    const roc = await prepareRocStats();
    const rocCache = roc.captureRenderCache();
    document.getElementById('rocStatsResults').innerHTML = '';
    expect(roc.restoreRenderCache(rocCache)).toBe(true);
    await flushAsyncWork(20);
    expect(document.getElementById('rocStatsResults')?.textContent || '').toMatch(/ROC metrics|AUC/i);
    expectSingleReportPanel('rocStatsResults', 'rocStatsReportHost');

    const survival = await prepareSurvivalStats();
    const survivalCache = survival.captureRenderCache();
    document.getElementById('survivalStatsSummary').innerHTML = '';
    document.getElementById('survivalStatsLogRank').innerHTML = '';
    document.getElementById('survivalStatsHazardRatios').innerHTML = '';
    document.getElementById('survivalStatsCox').innerHTML = '';
    expect(survival.restoreRenderCache(survivalCache)).toBe(true);
    await flushAsyncWork(20);
    expect(document.getElementById('survivalStatsLogRank')?.textContent || '').toMatch(/Survival Curve Comparisons|Pairwise Log-rank Comparisons/i);
    expect(document.getElementById('survivalStatsCox')?.textContent || '').toMatch(/Cox Model Coefficients|Reporting and reproducibility/i);
    expectSingleReportPanel('survivalStatsCox', 'survivalStatsCoxReportHost');

    const pca = await preparePcaStats();
    const pcaCache = pca.captureRenderCache();
    const screeContainer = document.getElementById('pcaScreeContainer');
    const screeExportControls = document.getElementById('pcaScreeExportControls');
    const eigenTableContainer = document.getElementById('pcaEigenTableContainer');
    const loadingsContainer = document.getElementById('pcaLoadingsContainer');
    if(screeContainer){
      screeContainer.hidden = true;
    }
    if(screeExportControls){
      screeExportControls.style.display = 'none';
    }
    if(eigenTableContainer){
      eigenTableContainer.hidden = true;
    }
    if(loadingsContainer){
      loadingsContainer.hidden = true;
    }
    expect(pca.restoreRenderCache(pcaCache)).toBe(true);
    await flushAsyncWork(40);
    expect(document.getElementById('pcaStatsResults')?.textContent || '').toContain('Reporting and reproducibility');
    expectSingleReportPanel('pcaStatsResults', 'pcaStatsReportHost');

    const heatmap = await prepareHeatmapStats('values');
    const heatmapCache = heatmap.captureRenderCache();
    document.getElementById('heatmapStatsContent').innerHTML = '';
    expect(heatmap.restoreRenderCache(heatmapCache)).toBe(true);
    await flushAsyncWork(20);
    expect(document.getElementById('heatmapStatsContent')?.textContent || '').toMatch(/Rows|Columns|Reporting and reproducibility/i);
    expectSingleReportPanel('heatmapStatsContent', 'heatmapStatsReportHost');
  }, 120000);
});
