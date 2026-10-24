const { ensureJStatStub } = require('../helpers/jstatTestStub');
const { loadProductionBootstrap, resetProductionNamespaces } = require('../../test-support/productionLoader');

const STATISTICAL_COMPONENT_TYPES = Object.freeze([
  'box', 'scatter', 'line', 'pie', 'hist', 'roc', 'survival', 'pca', 'heatmap'
]);

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

async function waitFor(check, { timeout = 8000, interval = 30 } = {}){
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return check();
}

function getLabeledSelect(container, labelText){
  const labels = Array.from(container.querySelectorAll('label'));
  const match = labels.find(label => (label.textContent || '').trim() === labelText);
  if(match){
    return match.querySelector('select') || match.parentElement?.querySelector('select') || null;
  }
  return null;
}

function expectReportHostAtBottom(hostId){
  const host = document.getElementById(hostId);
  expect(host).toBeTruthy();
  expect(host.querySelectorAll('.stats-report-panel').length).toBe(1);
  expect(host.parentElement?.lastElementChild).toBe(host);
}

function getActiveBoxNode(id){
  return document.querySelector(`#boxPage:not([hidden]) #${id}`)
    || document.querySelector(`[data-component-key="box"] #${id}`)
    || document.getElementById(id);
}

function getBoxStatsText(){
  return [
    getActiveBoxNode('statsResults')?.textContent || '',
    getActiveBoxNode('statsTable')?.textContent || '',
    getActiveBoxNode('boxStatsReportHost')?.textContent || ''
  ].join(' ');
}

describe('UI statistical presentation branches', () => {
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

    resetProductionNamespaces();

    if(typeof global.__restoreTestDebugLogs === 'function'){
      global.__restoreTestDebugLogs();
    }
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }
    restoreJStat = ensureJStatStub();
    restoreSvd = ensureSvdStub();

    loadProductionBootstrap({
      preloadComponents: STATISTICAL_COMPONENT_TYPES
    });
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

  test('box stats render pairwise, repeated-measures, and grouped comparison branches', async () => {
    await activateWorkspace('box');
    await flushAsyncWork(20);

    const box = window.Components?.box;
    const state = box?.__getState?.();
    expect(state?.hot).toBeTruthy();

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

    await box.__testHooks.computeStatsForTest();
    expect(await waitFor(() => /Overall test summary|Pairwise comparisons|Comparisons vs reference/i.test(getBoxStatsText()))).toBe(true);
    expect(getBoxStatsText()).toMatch(/Overall test summary|Pairwise comparisons|Comparisons vs reference/i);

    state.hot.loadData([
      ['Control', 'Treatment A', 'Treatment B'],
      [10, 13, 18],
      [11, 14, 19],
      [12, 15, 20],
      [13, 16, 21],
      [14, 17, 22]
    ]);
    state.selectedCols = new Set([0, 1, 2]);
    state.statsTest = 'nonparametric';
    state.statsMode = 'all';
    state.statsPaired = true;
    state.statsPostHoc = 'nemenyi';
    await box.draw();
    await flushAsyncWork(20);

    await box.__testHooks.computeStatsForTest();
    expect(await waitFor(() => /Friedman|Nemenyi/i.test(getBoxStatsText()))).toBe(true);
    const repeatedText = getBoxStatsText();
    expect(repeatedText).toMatch(/Friedman|Nemenyi/i);

  }, 60000);

  test('scatter stats render ungrouped regression presentation cards', async () => {
    await activateWorkspace('scatter');
    document.getElementById('scatterLoadExample').click();
    await flushAsyncWork(60);

    const computeBtn = document.getElementById('scatterComputeStats');
    expect(computeBtn).toBeTruthy();
    const statsResults = document.getElementById('scatterStatsResults');
    computeBtn.click();
    await waitFor(() => /Overall test summary|Coefficient estimates/i.test(statsResults?.textContent || ''));
    const defaultText = statsResults?.textContent || '';
    expect(defaultText).toMatch(/Overall test summary|Coefficient estimates/i);
    expect(defaultText).toMatch(/Reporting and reproducibility|Series|r \(95% CI\)/i);
    const scatterReport = document.getElementById('scatterStatsReportHost')?.querySelector('.stats-report-panel');
    expect(scatterReport?.querySelector('[data-stats-report-block="methods"]')?.textContent || '').toMatch(/Scatter data .*numeric X\/Y pairs/i);
    expectReportHostAtBottom('scatterStatsReportHost');

    const regressionSelect = document.getElementById('scatterRegressionMode');
    regressionSelect.value = 'quadratic';
    regressionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);
    computeBtn.click();
    await waitFor(() => /Overall test summary \(Quadratic|Coefficient estimates|Model details/i.test(statsResults?.textContent || ''));
    const nonlinearText = statsResults?.textContent || '';
    expect(nonlinearText).toMatch(/Overall test summary \(Quadratic|Coefficient estimates|Model details/i);
  }, 30000);

  test('line stats render correlation, forecast, diagnostics, and reporting branches', async () => {
    await activateWorkspace('line');
    document.getElementById('lineLoadExample').click();
    await flushAsyncWork(60);

    const computeBtn = document.getElementById('lineComputeStats');
    expect(computeBtn).toBeTruthy();
    const statsResults = document.getElementById('lineStatsResults');
    computeBtn.click();
    await waitFor(() => /Pearson correlation|Regression summary \(Linear\)/i.test(statsResults?.textContent || ''));
    const defaultText = statsResults?.textContent || '';
    expect(defaultText).toContain('Pearson correlation');
    expect(defaultText).toContain('Regression summary (Linear)');
    expect(defaultText).not.toContain('Forecast accuracy metrics');
    const additionalParameters = statsResults.querySelector('.line-regression-parameters');
    expect(additionalParameters).toBeTruthy();
    expect(additionalParameters.open).toBe(false);
    expect(additionalParameters.textContent).toContain('X-intercept');
    expect(additionalParameters.textContent).toContain('1/Slope');
    expect(defaultText).toContain('Reporting and reproducibility');
    expectReportHostAtBottom('lineStatsReportHost');

    const regressionMode = document.getElementById('lineRegressionMode');
    regressionMode.value = 'arima';
    regressionMode.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);
    computeBtn.click();
    await waitFor(() => /Forecast accuracy metrics|AIC|BIC/i.test(statsResults?.textContent || ''));
    const forecastText = statsResults?.textContent || '';
    expect(forecastText).toMatch(/Forecast accuracy metrics|AIC|BIC/i);
  }, 30000);

  test('pie stats render goodness-of-fit and pairwise contingency branches', async () => {
    await activateWorkspace('pie');
    const pie = window.Components?.pie;
    const singleDatasetPayload = pie.getPayload();
    singleDatasetPayload.data = [
      ['Response', 'Observed'],
      ['Complete', 10],
      ['Partial', 20],
      ['None', 30]
    ];
    singleDatasetPayload.config.stats.scope = 'gof';
    singleDatasetPayload.config.stats.valueColumn = 1;
    singleDatasetPayload.config.stats.expectedColumn = null;
    pie.loadFromPayload(singleDatasetPayload);
    await flushAsyncWork(40);

    const computeBtn = document.getElementById('pieComputeStats');
    expect(computeBtn).toBeTruthy();
    const statsResults = document.getElementById('pieStatsResults');
    const controls = document.getElementById('pieStatsControls');
    const expectedDistribution = getLabeledSelect(controls, 'Expected distribution');
    expect(expectedDistribution).toBeTruthy();
    expect(expectedDistribution.disabled).toBe(true);
    expect(expectedDistribution.value).toBe('equal-proportions');
    computeBtn.click();
    await waitFor(() => /equal expected proportions/i.test(statsResults?.textContent || ''));
    expect(statsResults?.textContent || '').toMatch(/Goodness-of-fit test/i);
    expect(statsResults?.textContent || '').toMatch(/equal expected proportions/i);
    expect(statsResults?.textContent || '').toMatch(/10\.0000/);
    expect(statsResults?.textContent || '').toMatch(/N\s*60/i);
    expect(statsResults?.textContent || '').toContain('Reporting and reproducibility');
    expectReportHostAtBottom('pieStatsReportHost');
    const singleDatasetStats = pie.getPayload()?.config?.stats;
    expect(singleDatasetStats?.expectedColumn).toBeNull();
    expect(JSON.stringify(singleDatasetStats?.reportModel || {})).toMatch(/equal expected proportions/i);

    const pairwisePayload = pie.getPayload();
    pairwisePayload.data = [
      ['Subtype', 'Control', 'Treatment'],
      ['Luminal A', 24, 18],
      ['Luminal B', 13, 21],
      ['Basal-like', 9, 16]
    ];
    pie.loadFromPayload(pairwisePayload);
    await flushAsyncWork(40);

    const scopeSelect = getLabeledSelect(controls, 'Comparison scope');
    expect(scopeSelect).toBeTruthy();
    scopeSelect.value = 'all';
    scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);
    Array.from(controls.querySelectorAll('.stats-conditions-checkboxes input[type="checkbox"]'))
      .filter(input => !input.checked)
      .slice(0, 2)
      .forEach(input => input.click());
    await flushAsyncWork(20);

    computeBtn.click();
    await waitFor(() => /Overall test summary|Pairwise comparisons/i.test(statsResults?.textContent || ''));
    const pairwiseText = statsResults?.textContent || '';
    expect(pairwiseText).toMatch(/Overall test summary|Pairwise comparisons/i);
    expect(pairwiseText).toMatch(/N\s*101/i);
    expect(pairwiseText).toContain('Control');
    expect(pairwiseText).toContain('Treatment');
    const pairCaptions = Array.from(statsResults.querySelectorAll('.stats-table-card .stats-table-caption'))
      .map(caption => caption.textContent?.trim());
    expect(pairCaptions).not.toContain('Pairwise comparisons');
  }, 30000);

  test('hist stats render descriptive, fit-diagnostic, comparison-note, and reporting branches', async () => {
    await activateWorkspace('hist');
    document.getElementById('histLoadExample').click();
    await flushAsyncWork(80);

    const hist = window.Components?.hist;
    const histStatsResults = document.getElementById('histStatsResults');
    const goodnessOfFit = jest.spyOn(window.Shared.stats, 'goodnessOfFit');
    try{
      await hist?.draw?.();
      await waitFor(() => /Descriptive statistics/.test(histStatsResults?.textContent || ''));

      const text = histStatsResults?.textContent || '';
      expect(text).toContain('Descriptive statistics');
      expect(text).toContain('Distribution shape');
      expect(text).toContain('Reporting and reproducibility');
      expect(text).not.toMatch(/Fit diagnostics|Normal fit diagnostics/i);
      expect(goodnessOfFit).not.toHaveBeenCalled();
      expectReportHostAtBottom('histStatsReportHost');

      await hist?.draw?.();
      expect(goodnessOfFit).not.toHaveBeenCalled();

      const diagnosticsMode = document.getElementById('histStatsDiagnosticsMode');
      diagnosticsMode.value = 'normal-fit';
      diagnosticsMode.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncWork(20);
      await hist?.draw?.();
      expect(goodnessOfFit).not.toHaveBeenCalled();
      expect(document.getElementById('histComputeStats').disabled).toBe(false);
      document.getElementById('histComputeStats').click();
      await waitFor(() => /Normal fit diagnostics/i.test(histStatsResults?.textContent || ''));
      expect(goodnessOfFit).toHaveBeenCalled();

      const comparisonMode = document.getElementById('histStatsComparisonMode');
      comparisonMode.value = 'ks';
      comparisonMode.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAsyncWork(20);
      await hist?.draw?.();
      document.getElementById('histComputeStats').click();
      await waitFor(() => /Distribution comparison|Kolmogorov-Smirnov/i.test(document.getElementById('histStatsResults')?.textContent || ''));

      expect(document.getElementById('histStatsResults')?.textContent || '').toMatch(/Distribution comparison|Kolmogorov-Smirnov/i);
    }finally{
      goodnessOfFit.mockRestore();
    }
  }, 30000);

  test('roc stats render ROC and PR presentation branches with comparison controls', async () => {
    await activateWorkspace('roc');
    document.getElementById('rocLoadExample').click();
    await flushAsyncWork(80);
    const statsResults = document.getElementById('rocStatsResults');
    window.Components?.roc?.draw?.();
    await waitFor(() => /ROC metrics|cutoff-by-cutoff metrics/i.test(statsResults?.textContent || ''));

    const controls = document.getElementById('rocStatsControls');
    const singlePMethod = controls.querySelector('#rocSinglePMethod');
    expect(Array.from(singlePMethod.options).map(option => option.value)).toEqual(expect.arrayContaining(['off', 'auto', 'exact', 'asymptotic']));
    const rocDiffMethod = controls.querySelector('#rocDiffMethod');
    expect(Array.from(rocDiffMethod.options).map(option => option.value)).toEqual(expect.arrayContaining(['delong', 'bootstrap']));
    expect(statsResults?.textContent || '').toMatch(/ROC metrics|cutoff-by-cutoff metrics/i);
    expect(statsResults?.textContent || '').toContain('Reporting and reproducibility');
    expectReportHostAtBottom('rocStatsReportHost');

    const graphType = document.getElementById('rocGraphType');
    graphType.value = 'pr';
    graphType.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);
    window.Components?.roc?.draw?.();
    await waitFor(() => /Precision.?Recall metrics|Average Precision/i.test(document.getElementById('rocStatsResults')?.textContent || ''));

    const prDiffMethod = document.querySelector('#rocDiffMethod');
    expect(Array.from(prDiffMethod.options).map(option => option.value)).toEqual(expect.arrayContaining(['bootstrap', 'permutation']));
    expect(document.getElementById('rocStatsResults')?.textContent || '').toMatch(/Precision.?Recall metrics|Average Precision/i);
  }, 30000);

  test('survival stats render placeholder, pairwise, hazard-ratio, and Cox-model branches', async () => {
    await activateWorkspace('survival');
    document.getElementById('survivalLoadExample').click();
    await flushAsyncWork(80);

    window.Components?.survival?.draw?.();
    await flushAsyncWork(120);

    const hazardToggle = document.getElementById('survivalShowHazardRatios');
    const coxToggle = document.getElementById('survivalFitCox');
    hazardToggle.checked = true;
    coxToggle.checked = true;
    hazardToggle.dispatchEvent(new Event('change', { bubbles: true }));
    coxToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);

    const correctionSelect = document.getElementById('survivalPairwiseCorrection');
    if(correctionSelect){
      correctionSelect.value = 'bh';
      correctionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    await flushAsyncWork(20);

    window.Components?.survival?.draw?.();
    await flushAsyncWork(20);
    expect(document.getElementById('survivalComputeStats').disabled).toBe(false);
    expect(document.getElementById('survivalStatsStatus')?.textContent || '').toMatch(/Calculate statistics/i);
    document.getElementById('survivalComputeStats').click();
    await waitFor(() => /Survival Curve Comparisons|Pairwise Log-rank/i.test(
      document.getElementById('survivalStatsLogRank')?.textContent || ''
    ), { timeout: 15000 });

    const logRankText = document.getElementById('survivalStatsLogRank')?.textContent || '';
    const hazardText = document.getElementById('survivalStatsHazardRatios')?.textContent || '';
    const coxText = document.getElementById('survivalStatsCox')?.textContent || '';
    expect(logRankText).toMatch(/Survival Curve Comparisons|Pairwise Log-rank Comparisons/i);
    expect(hazardText).toMatch(/Hazard ratios|Median Survival Ratios/i);
    expect(coxText).toMatch(/Cox Model Coefficients|Cox Model Diagnostics|Residual Summaries|Scaled Schoenfeld Residual Checks/i);
    expect(document.getElementById('survivalStatsReportHost')?.textContent || '').toContain('Reporting and reproducibility');
    expect(document.querySelectorAll('#survivalStatsInferenceControls .stats-inference-controls__input').length).toBeGreaterThanOrEqual(1);
    expect(document.querySelectorAll('#survivalStatsSummary .stats-significance-controls').length).toBe(0);
    expect(document.querySelectorAll('#survivalStatsLogRank .stats-significance-controls').length).toBe(0);
    expect(document.querySelectorAll('#survivalStatsHazardRatios .stats-significance-controls').length).toBe(0);
    expect(document.querySelectorAll('#survivalStatsCox .stats-significance-controls').length).toBe(0);
    expectReportHostAtBottom('survivalStatsReportHost');
    const survivalFieldset = document.getElementById('survivalStatsLogRank')?.parentElement;
    const survivalChildren = Array.from(survivalFieldset?.children || []);
    const summaryIndex = survivalChildren.indexOf(document.getElementById('survivalStatsSummary'));
    const logRankIndex = survivalChildren.indexOf(document.getElementById('survivalStatsLogRank'));
    const hazardRatiosIndex = survivalChildren.indexOf(document.getElementById('survivalStatsHazardRatios'));
    const coxIndex = survivalChildren.indexOf(document.getElementById('survivalStatsCox'));
    expect(summaryIndex).toBeLessThan(logRankIndex);
    expect(logRankIndex).toBeLessThan(hazardRatiosIndex);
    expect(hazardRatiosIndex).toBeLessThan(coxIndex);
    expect(survivalChildren.at(-1)).toBe(document.getElementById('survivalStatsReportHost'));
  }, 40000);

  test('pca stats render PCA and MDS presentation branches', async () => {
    await activateWorkspace('pca');
    document.getElementById('pcaLoadExample').click();
    const pcaState = window.Components?.pca?.__state;
    await waitFor(() => !!pcaState?.performance?.draw, { iterations: 120 });

    const statsResults = document.getElementById('pcaStatsResults');
    const statsSummary = document.getElementById('pcaStatsSummary');
    expect(statsResults).toBeTruthy();
    expect(statsSummary).toBeTruthy();
    expect(statsResults.textContent || '').toContain('Reporting and reproducibility');
    expect(statsResults.textContent || '').toMatch(/PCA|component|variance|Reporting and reproducibility/i);
    expectReportHostAtBottom('pcaStatsReportHost');

    const methodSelect = document.getElementById('pcaMethod');
    expect(methodSelect).toBeTruthy();
    const initialTimestamp = pcaState?.performance?.draw?.timestamp || 0;
    methodSelect.value = 'mds';
    methodSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => (pcaState?.performance?.draw?.timestamp || 0) > initialTimestamp, { iterations: 160 });

    const mdsText = await waitFor(() => {
      const combined = [
        document.getElementById('pcaStatsSummary')?.textContent || '',
        document.getElementById('pcaStatsResults')?.textContent || '',
        document.getElementById('pcaEigenTableContainer')?.textContent || '',
        document.getElementById('pcaVarianceSummary')?.textContent || ''
      ].join(' ');
      return /Stress|inertia|MDS/i.test(combined) ? combined : null;
    }, { iterations: 160 });
    expect(pcaState?.lastMethod).toBe('mds');
    expect(mdsText).toMatch(/Stress|inertia|MDS/i);
    expect(document.getElementById('pcaStatsResults')?.textContent || '').toContain('Reporting and reproducibility');
  }, 50000);

  test('heatmap stats render correlation and value-summary presentation branches', async () => {
    await activateWorkspace('heatmap');
    const loadBtn = document.getElementById('heatmapLoadExample');
    expect(loadBtn).toBeTruthy();
    loadBtn.click();
    const heatmap = window.Components?.heatmap;
    const statsContent = document.getElementById('heatmapStatsContent');
    heatmap?.draw?.();
    await waitFor(() => /Items analysed|Pairs evaluated|Strongest \|r\||Reporting and reproducibility/i.test(statsContent?.textContent || ''),
      { timeout: 15000 });

    expect(statsContent).toBeTruthy();
    const corrText = statsContent?.textContent || '';
    expect(corrText).toMatch(/Items analysed|Pairs evaluated|Strongest \|r\||Reporting and reproducibility/i);
    expectReportHostAtBottom('heatmapStatsReportHost');

    const viewSelect = document.getElementById('heatmapView');
    expect(viewSelect).toBeTruthy();
    viewSelect.value = 'values';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);
    heatmap?.draw?.();
    await waitFor(() => /Rows|Columns|Cells with data|Minimum|Maximum|Mean|Reporting and reproducibility/i.test(
      document.getElementById('heatmapStatsContent')?.textContent || ''
    ), { timeout: 15000 });

    const valueText = document.getElementById('heatmapStatsContent')?.textContent || '';
    expect(valueText).toMatch(/Rows|Columns|Cells with data|Minimum|Maximum|Mean|Reporting and reproducibility/i);
  }, 50000);
});
