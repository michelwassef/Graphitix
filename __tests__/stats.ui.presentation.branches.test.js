const originalDebug = console.debug;
const originalLog = console.log;

function createJStatTestStub(){
  const collectValidPairs = (arrA = [], arrB = []) => {
    const len = Math.min(arrA.length, arrB.length);
    const pairs = [];
    for(let i = 0; i < len; i += 1){
      const ax = Number(arrA[i]);
      const by = Number(arrB[i]);
      if(Number.isFinite(ax) && Number.isFinite(by)){
        pairs.push([ax, by]);
      }
    }
    return pairs;
  };
  const rankValues = (source = []) => {
    const entries = [];
    const ranks = new Array(source.length).fill(NaN);
    source.forEach((value, index) => {
      const numeric = Number(value);
      if(Number.isFinite(numeric)){
        entries.push({ value: numeric, index });
      }
    });
    entries.sort((a, b) => a.value - b.value);
    let i = 0;
    while(i < entries.length){
      let j = i + 1;
      while(j < entries.length && entries[j].value === entries[i].value){
        j += 1;
      }
      const rank = ((i + j - 1) / 2) + 1;
      for(let k = i; k < j; k += 1){
        ranks[entries[k].index] = rank;
      }
      i = j;
    }
    return ranks;
  };
  const erf = x => {
    const sign = x >= 0 ? 1 : -1;
    const abs = Math.abs(x);
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const t = 1 / (1 + p * abs);
    const poly = (((((a5 * t) + a4) * t + a3) * t + a2) * t + a1) * t;
    const y = 1 - poly * Math.exp(-abs * abs);
    return sign * y;
  };
  const normalCdf = (x, mean = 0, sd = 1) => {
    const safeSd = Math.max(Math.abs(sd), 1e-9);
    const z = (x - mean) / (safeSd * Math.SQRT2);
    return 0.5 * (1 + erf(z));
  };
  const stub = {
    normal: { cdf: normalCdf },
    studentt: { cdf: (x, df = 1) => {
      const safeDf = Math.max(df, 1);
      const scale = Math.sqrt(Math.max((safeDf - 2) / safeDf, 0.5));
      return normalCdf(x * scale, 0, 1);
    } },
    centralF: { cdf: () => 0.5 },
    chisquare: { cdf: () => 0.5 },
    corrcoeff: (arrA, arrB) => {
      const pairs = collectValidPairs(arrA, arrB);
      if(pairs.length < 2){
        return 0;
      }
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;
      let sumYY = 0;
      const n = pairs.length;
      for(let i = 0; i < n; i += 1){
        const [x, y] = pairs[i];
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
        sumYY += y * y;
      }
      const numerator = (n * sumXY) - (sumX * sumY);
      const denomX = (n * sumXX) - (sumX * sumX);
      const denomY = (n * sumYY) - (sumY * sumY);
      const denom = Math.sqrt(Math.max(denomX * denomY, 0));
      return denom === 0 ? 0 : (numerator / denom);
    },
    spearmancoeff: (arrA, arrB) => stub.corrcoeff(rankValues(arrA), rankValues(arrB)),
    mean: arr => {
      const clean = (arr || []).map(Number).filter(Number.isFinite);
      if(!clean.length){
        return NaN;
      }
      return clean.reduce((sum, value) => sum + value, 0) / clean.length;
    },
    stdev: (arr, sample) => {
      const clean = (arr || []).map(Number).filter(Number.isFinite);
      if(!clean.length){
        return 0;
      }
      const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
      const divisor = sample ? Math.max(clean.length - 1, 1) : clean.length;
      const variance = clean.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / divisor;
      return Math.sqrt(Math.max(variance, 0));
    },
    percentile: (arr, p) => {
      const clean = (arr || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if(!clean.length){
        return NaN;
      }
      const pos = (clean.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      return clean[base + 1] !== undefined
        ? clean[base] + rest * (clean[base + 1] - clean[base])
        : clean[base];
    }
  };
  return stub;
}

function ensureJStatStub(){
  const previousGlobal = global.jStat;
  const previousWindow = typeof window !== 'undefined' ? window.jStat : undefined;
  const existing = previousGlobal || previousWindow;
  const stub = existing || createJStatTestStub();
  global.jStat = stub;
  if(typeof window !== 'undefined'){
    window.jStat = stub;
  }
  return () => {
    if(typeof previousGlobal === 'undefined'){
      delete global.jStat;
    }else{
      global.jStat = previousGlobal;
    }
    if(typeof window !== 'undefined'){
      if(typeof previousWindow === 'undefined'){
        delete window.jStat;
      }else{
        window.jStat = previousWindow;
      }
    }
  };
}

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

async function waitFor(check, { iterations = 80 } = {}){
  for(let i = 0; i < iterations; i += 1){
    const value = check();
    if(value){
      return value;
    }
    await flushAsyncWork(2);
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

    document.getElementById('boxComputeStats').click();
    await flushAsyncWork(30);
    expect(document.getElementById('boxStatsReportHost')?.textContent || '').toContain('Reporting and reproducibility');
    expectReportHostAtBottom('boxStatsReportHost');
    expect(`${document.getElementById('statsResults')?.textContent || ''} ${document.getElementById('statsTable')?.textContent || ''}`).toMatch(/Pairwise comparisons|Comparisons vs reference/i);

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

    document.getElementById('boxComputeStats').click();
    await flushAsyncWork(30);
    const repeatedText = `${document.getElementById('statsResults')?.textContent || ''} ${document.getElementById('statsTable')?.textContent || ''}`;
    expect(repeatedText).toMatch(/Friedman|Nemenyi/i);

    const formatSelect = document.getElementById('boxTableFormat');
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(30);
    state.hot.loadData([
      ['Control', '', 'Treatment', ''],
      ['Baseline', 'Week 1', 'Baseline', 'Week 1'],
      [10, 11, 20, 21],
      [11, 12, 21, 22],
      [12, 13, 22, 23]
    ]);
    state.groupedStats.analysis = 'multipleComparisons';
    state.groupedStats.comparisonScope = 'groupsWithinCondition';
    await box.draw();
    await flushAsyncWork(30);

    document.getElementById('boxComputeStats').click();
    await flushAsyncWork(30);
    const groupedText = `${document.getElementById('statsResults')?.textContent || ''} ${document.getElementById('statsTable')?.textContent || ''}`;
    expect(groupedText).toMatch(/Grouped multiple comparisons|multiple comparison/i);
  }, 30000);

  test('scatter stats render ungrouped regression presentation cards', async () => {
    await activateWorkspace('scatter');
    document.getElementById('scatterLoadExample').click();
    await flushAsyncWork(60);

    const computeBtn = document.getElementById('scatterComputeStats');
    expect(computeBtn).toBeTruthy();
    computeBtn.click();
    await flushAsyncWork(80);

    const statsResults = document.getElementById('scatterStatsResults');
    const defaultText = statsResults?.textContent || '';
    expect(defaultText).toMatch(/Overall test summary|Coefficient diagnostics/i);
    expect(defaultText).toMatch(/Reporting and reproducibility|Series|r \(95% CI\)/i);
    expectReportHostAtBottom('scatterStatsReportHost');

    const regressionSelect = document.getElementById('scatterRegressionMode');
    regressionSelect.value = 'quadratic';
    regressionSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);
    computeBtn.click();
    await flushAsyncWork(80);

    const nonlinearText = statsResults?.textContent || '';
    expect(nonlinearText).toMatch(/Overall test summary \(Quadratic|Coefficient diagnostics|Model details/i);
  }, 30000);

  test('line stats render correlation, forecast, diagnostics, and reporting branches', async () => {
    await activateWorkspace('line');
    document.getElementById('lineLoadExample').click();
    await flushAsyncWork(60);

    const computeBtn = document.getElementById('lineComputeStats');
    expect(computeBtn).toBeTruthy();
    computeBtn.click();
    await flushAsyncWork(80);

    const statsResults = document.getElementById('lineStatsResults');
    const defaultText = statsResults?.textContent || '';
    expect(defaultText).toMatch(/correlation coefficients|Correlation summary/i);
    expect(defaultText).toContain('Reporting and reproducibility');
    expectReportHostAtBottom('lineStatsReportHost');

    const regressionMode = document.getElementById('lineRegressionMode');
    regressionMode.value = 'arima';
    regressionMode.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);
    computeBtn.click();
    await flushAsyncWork(80);

    const forecastText = statsResults?.textContent || '';
    expect(forecastText).toMatch(/Forecast accuracy metrics|AIC|BIC/i);
  }, 30000);

  test('pie stats render goodness-of-fit and pairwise contingency branches', async () => {
    await activateWorkspace('pie');
    document.getElementById('pieLoadExample').click();
    await flushAsyncWork(60);

    const computeBtn = document.getElementById('pieComputeStats');
    expect(computeBtn).toBeTruthy();
    computeBtn.click();
    await flushAsyncWork(40);

    const statsResults = document.getElementById('pieStatsResults');
    expect(statsResults?.textContent || '').toMatch(/Goodness-of-fit test|Observed vs expected/i);
    expect(statsResults?.textContent || '').toContain('Reporting and reproducibility');
    expectReportHostAtBottom('pieStatsReportHost');

    const controls = document.getElementById('pieStatsControls');
    const scopeSelect = getLabeledSelect(controls, 'Comparison scope:');
    expect(scopeSelect).toBeTruthy();
    scopeSelect.value = 'all';
    scopeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);

    computeBtn.click();
    await flushAsyncWork(40);
    const pairwiseText = statsResults?.textContent || '';
    expect(pairwiseText).toMatch(/Overall test summary|Pairwise comparisons/i);
  }, 30000);

  test('hist stats render descriptive, fit-diagnostic, comparison-note, and reporting branches', async () => {
    await activateWorkspace('hist');
    document.getElementById('histLoadExample').click();
    await flushAsyncWork(80);

    const hist = window.Components?.hist;
    hist?.draw?.();
    await flushAsyncWork(60);

    const statsResults = document.getElementById('histStatsResults');
    const text = statsResults?.textContent || '';
    expect(text).toContain('Descriptive statistics');
    expect(text).toContain('Distribution shape');
    expect(text).toMatch(/Fit diagnostics|Normal fit diagnostics/i);
    expect(text).toContain('Reporting and reproducibility');
    expectReportHostAtBottom('histStatsReportHost');

    const comparisonMode = document.getElementById('histStatsComparisonMode');
    comparisonMode.value = 'ks';
    comparisonMode.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);
    hist?.draw?.();
    await flushAsyncWork(60);

    expect(document.getElementById('histStatsResults')?.textContent || '').toMatch(/Distribution comparison|Kolmogorov-Smirnov/i);
  }, 30000);

  test('roc stats render ROC and PR presentation branches with comparison controls', async () => {
    await activateWorkspace('roc');
    document.getElementById('rocLoadExample').click();
    await flushAsyncWork(80);
    window.Components?.roc?.draw?.();
    await flushAsyncWork(80);

    const statsResults = document.getElementById('rocStatsResults');
    const controls = document.getElementById('rocStatsControls');
    const rocControlSelects = Array.from(controls.querySelectorAll('select'));
    expect(rocControlSelects.length).toBeGreaterThanOrEqual(2);
    expect(Array.from(rocControlSelects[0].options).map(option => option.value)).toEqual(expect.arrayContaining(['delong', 'bootstrap']));
    expect(statsResults?.textContent || '').toMatch(/ROC metrics|cutoff-by-cutoff metrics/i);
    expect(statsResults?.textContent || '').toContain('Reporting and reproducibility');
    expectReportHostAtBottom('rocStatsReportHost');

    const graphType = document.getElementById('rocGraphType');
    graphType.value = 'pr';
    graphType.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(60);
    window.Components?.roc?.draw?.();
    await flushAsyncWork(80);

    const prControlSelects = Array.from(document.getElementById('rocStatsControls').querySelectorAll('select'));
    expect(Array.from(prControlSelects[0].options).map(option => option.value)).toEqual(expect.arrayContaining(['bootstrap', 'permutation']));
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
    await flushAsyncWork(160);

    const logRankText = document.getElementById('survivalStatsLogRank')?.textContent || '';
    const hazardText = document.getElementById('survivalStatsHazardRatios')?.textContent || '';
    const coxText = document.getElementById('survivalStatsCox')?.textContent || '';
    expect(logRankText).toMatch(/Survival Curve Comparisons|Pairwise Log-rank Comparisons/i);
    expect(hazardText).toMatch(/Hazard ratios|Median Survival Ratios/i);
    expect(coxText).toMatch(/Cox Model Coefficients|Cox Model Diagnostics|Residual Summaries|Scaled Schoenfeld Residual Checks/i);
    expect(coxText).toContain('Reporting and reproducibility');
    expectReportHostAtBottom('survivalStatsCoxReportHost');
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
    await flushAsyncWork(120);

    const heatmap = window.Components?.heatmap;
    heatmap?.draw?.();
    await flushAsyncWork(100);

    const statsContent = document.getElementById('heatmapStatsContent');
    expect(statsContent).toBeTruthy();
    const corrText = statsContent?.textContent || '';
    expect(corrText).toMatch(/Items analysed|Pairs evaluated|Strongest \|r\||Reporting and reproducibility/i);
    expectReportHostAtBottom('heatmapStatsReportHost');

    const viewSelect = document.getElementById('heatmapView');
    expect(viewSelect).toBeTruthy();
    viewSelect.value = 'values';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(100);
    heatmap?.draw?.();
    await flushAsyncWork(100);

    const valueText = document.getElementById('heatmapStatsContent')?.textContent || '';
    expect(valueText).toMatch(/Rows|Columns|Cells with data|Minimum|Maximum|Mean|Reporting and reproducibility/i);
  }, 50000);
});
