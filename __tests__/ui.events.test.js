/**
 * Event-level tests to ensure key UI flows are wired correctly.
 * These catch regressions when splitting main.js into modules.
 */

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
      const rank = ((i + j - 1) / 2) + 1; // average rank (1-based)
      for(let k = i; k < j; k += 1){
        ranks[entries[k].index] = rank;
      }
      i = j;
    }
    return ranks;
  };
  const erf = (x)=>{
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
  const normalCdf = (x, mean = 0, sd = 1)=>{
    const safeSd = Math.max(Math.abs(sd), 1e-9);
    const z = (x - mean) / (safeSd * Math.SQRT2);
    return 0.5 * (1 + erf(z));
  };
  const stub = {
    normal: { cdf: normalCdf },
    studentt: { cdf: (x, df = 1)=>{
      const safeDf = Math.max(df, 1);
      const scale = Math.sqrt(Math.max((safeDf - 2) / safeDf, 0.5));
      return normalCdf(x * scale, 0, 1);
    } },
    centralF: { cdf: ()=>0.5 },
    chisquare: { cdf: ()=>0.5 },
    corrcoeff: (arrA, arrB)=>{
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
      if(denom === 0){
        return 0;
      }
      return numerator / denom;
    },
    spearmancoeff: (arrA, arrB)=>{
      const ranksA = rankValues(arrA);
      const ranksB = rankValues(arrB);
      return stub.corrcoeff(ranksA, ranksB);
    },
    mean: (arr)=>{
      const clean = (arr || []).map(Number).filter(Number.isFinite);
      if(!clean.length){
        return NaN;
      }
      const sum = clean.reduce((total, value)=>total + value, 0);
      return sum / clean.length;
    },
    stdev: (arr, sample)=>{
      const clean = (arr || []).map(Number).filter(Number.isFinite);
      if(!clean.length){
        return 0;
      }
      const mean = clean.reduce((sum,v)=>sum+v,0)/clean.length;
      const divisor = sample ? Math.max(clean.length - 1, 1) : clean.length;
      const variance = clean.reduce((sum,v)=>sum+Math.pow(v-mean,2),0)/divisor;
      return Math.sqrt(Math.max(variance,0));
    },
    percentile: (arr,p)=>{
      const clean = (arr || []).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
      if(!clean.length){
        return NaN;
      }
      const pos = (clean.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      if(clean[base + 1] !== undefined){
        return clean[base] + rest * (clean[base + 1] - clean[base]);
      }
      return clean[base];
    }
  };
  console.debug('Debug: test jStat stub created',{ keys: Object.keys(stub) });
  return stub;
}

const originalDebug = console.debug;
const originalLog = console.log;

function ensureJStatStub(){
  const existing = global.jStat;
  if(existing){
    console.debug('Debug: test jStat stub reuse',{ hasExisting: true });
    return ()=>{ global.jStat = existing; };
  }
  global.jStat = createJStatTestStub();
  return ()=>{ delete global.jStat; };
}

async function activateWorkspace(type){
  const graphSelection = window.Main?.tabs?.handleGraphSelection;
  expect(typeof graphSelection).toBe('function');
  const result = graphSelection(type);
  if (result && typeof result.then === 'function') {
    await result;
  }
  await Promise.resolve();
}

async function flushAsyncWork(iterations = 25){
  for (let i = 0; i < iterations; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('UI events and example loaders', () => {

  beforeEach(() => {
    jest.resetModules();
    console.debug = jest.fn();
    console.log = jest.fn();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetHT__ === 'function') {
      global.__resetHT__();
    }
    // Ensure fresh app init
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
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/shared/uniprot.js');
    require('../js/shared/goAnalysis.js');
    require('../js/shared/stringAnalysis.js');
    require('../js/main/components.js');
    if (window.Main?.components?.preloadAllBundlesSync) {
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
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  afterAll(() => {
    console.debug = originalDebug;
    console.log = originalLog;
  });

  test('Box Plot: Load Example populates data', async () => {
    await activateWorkspace('box');
    const btn = document.getElementById('boxLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'hot');
    // At least one loadData for #hot with header row ['Control', ...]
    expect(loads.length).toBeGreaterThan(0);
    const populated = loads.find(call => Array.isArray(call.firstRow) && call.firstRow.some(value => value === 'Control'));
    expect(populated?.firstRow).toEqual(expect.arrayContaining(['Control']));
    await flushAsyncWork();
  });

  test('Box Plot: whisker rule selection persists to payload', async () => {
    await activateWorkspace('box');
    await flushAsyncWork();
    const ruleSelect = document.getElementById('boxWhiskerRule');
    const customInput = document.getElementById('boxWhiskerCustomMultiplier');
    expect(ruleSelect).toBeTruthy();
    expect(customInput).toBeTruthy();
    ruleSelect.value = 'custom';
    ruleSelect.dispatchEvent(new Event('change'));
    customInput.value = '2.75';
    customInput.dispatchEvent(new Event('change'));
    await flushAsyncWork();
    const stateSnapshot = window.Components?.box?.__getState?.();
    const payload = window.Components?.box?.getPayload?.();
    expect(stateSnapshot?.whiskerRule).toBe('custom');
    expect(payload?.config?.whisker?.rule).toBe('custom');
    expect(payload?.config?.whisker?.customMultiplier).toBeCloseTo(2.75);
  });

  test('Box Plot: whisker extents respond to multiplier changes', async () => {
    await activateWorkspace('box');
    await flushAsyncWork();
    const hooks = window.Components?.box?.__testHooks;
    expect(hooks?.computeWhiskerFences).toBeInstanceOf(Function);
    expect(hooks?.resolveWhiskerExtents).toBeInstanceOf(Function);
    const values = [10, 30, 50, 70, 90, 180];
    const sorted = [...values].sort((a, b) => a - b);
    const percentile = p => {
      const pos = (sorted.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      const next = sorted[base + 1] !== undefined ? sorted[base + 1] : sorted[base];
      return sorted[base] + rest * (next - sorted[base]);
    };
    const q1 = percentile(0.25);
    const q3 = percentile(0.75);
    const iqr = q3 - q1;
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (values.length - 1);
    const sd = Math.sqrt(Math.max(variance, 0));
    const tukeyFences = hooks.computeWhiskerFences({ q1, q3, iqr, mean, sd, rule: 'iqr15' });
    const tukeyExtents = hooks.resolveWhiskerExtents(sorted, {
      lowerFence: tukeyFences.lowerFence,
      upperFence: tukeyFences.upperFence,
      q1,
      q3
    });
    expect(tukeyExtents.outliers).toContain(180);
    expect(tukeyExtents.wMax).toBeLessThan(180);
    const iqr3Fences = hooks.computeWhiskerFences({ q1, q3, iqr, mean, sd, rule: 'iqr3' });
    const iqr3Extents = hooks.resolveWhiskerExtents(sorted, {
      lowerFence: iqr3Fences.lowerFence,
      upperFence: iqr3Fences.upperFence,
      q1,
      q3
    });
    expect(iqr3Extents.outliers).not.toContain(180);
    expect(iqr3Extents.wMax).toBeCloseTo(180);
  });

  test('Line Graph: Load Example respects replicate mode', async () => {
    await activateWorkspace('line');
    const loadBtn = document.getElementById('lineLoadExample');
    expect(loadBtn).toBeTruthy();

    loadBtn.click();
    await flushAsyncWork(40);

    const lineComponent = window.Components?.line;
    const lineStateSingle = lineComponent?.__getState?.();
    expect(lineStateSingle).toBeTruthy();
    expect(lineStateSingle?.legendLayout?.entryCount).toBeGreaterThan(0);
    const hot = lineComponent?.getHot?.();
    expect(hot).toBeTruthy();
    const singleHeader = Array.isArray(hot?.getData?.()) ? hot.getData()[0] : null;
    expect(singleHeader).toBeTruthy();
    expect(singleHeader.slice(0, 6)).toEqual(['Month', 'North', 'South', 'East', 'West', 'Central']);

    const formatSelect = document.getElementById('lineTableFormat');
    expect(formatSelect).toBeTruthy();
    formatSelect.value = 'grouped';
    formatSelect.dispatchEvent(new Event('change'));
    await flushAsyncWork(40);

    loadBtn.click();
    await flushAsyncWork(60);

    const groupedData = Array.isArray(hot?.getData?.()) ? hot.getData() : null;
    expect(groupedData?.length).toBeGreaterThan(1);
    expect(groupedData[1].slice(0, 7)).toEqual([0, 45, 43, 47, 50, 48, 49]);
    const replicatesInput = document.getElementById('lineReplicates');
    expect(replicatesInput?.value).toBe('3');
    const lineStateGrouped = lineComponent?.__getState?.();
    expect(lineStateGrouped?.legendItems?.length).toBe(2);
    expect(lineStateGrouped?.legendItems?.map(item => item.label)).toEqual(['Control', 'Treated']);
  });

  test('Box Plot: assumption warnings surface for non-normal data', async () => {
    const cleanupJStat = ensureJStatStub();
    try {
      await activateWorkspace('box');
      const boxComponent = window.Components?.box;
      expect(boxComponent).toBeTruthy();
      await new Promise(resolve => setTimeout(resolve, 0));
      const state = boxComponent.__getState?.();
      expect(state?.hot).toBeTruthy();

      const skewedData = [
        ['Normal', 'Skewed'],
        [10, 10],
        [11, 10],
        [9, 10],
        [12, 10],
        [10, 220],
        [11, 240],
        [10, 210],
        [12, 230],
        [9, 215],
        [11, 205],
        [10, 225]
      ];
      state.hot.loadData(skewedData);
      state.selectedCols.clear();
      state.selectedCols.add(0);
      state.selectedCols.add(1);
      state.statsTest = 'parametric';
      state.statsMode = 'all';
      state.statsPaired = false;

      window.Components.box.draw();
      await new Promise(resolve => setTimeout(resolve, 0));

      const computeBtn = document.getElementById('boxComputeStats');
      expect(computeBtn).toBeTruthy();
      computeBtn.click();
      await new Promise(resolve => setTimeout(resolve, 0));

      const statsResults = document.getElementById('statsResults');
      const assumptionSection = statsResults?.querySelector('.stats-assumption-section');
      expect(assumptionSection).toBeTruthy();
      const failBadges = Array.from(assumptionSection.querySelectorAll('.assumption-badge[data-result="fail"]'));
      expect(failBadges.length).toBeGreaterThan(0);
      const warningTexts = Array.from(assumptionSection.querySelectorAll('.assumption-warning')).map(el => el.textContent || '');
      expect(warningTexts.some(text => /failed normality/i.test(text))).toBe(true);

      const updatedState = window.Components.box.__getState?.();
      expect(updatedState?.assumptionDiagnostics?.recommendNonParametric).toBe(true);
      expect(updatedState?.assumptionDiagnostics?.parametricOverrideActive).toBe(true);
      expect((updatedState?.assumptionDiagnostics?.warnings || []).length).toBeGreaterThan(0);
    } finally {
      cleanupJStat();
    }
  });

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
      if(!statsTable){
        const debugText = document.getElementById('scatterStatsResults');
        console.error('Scatter stats debug output', debugText?.textContent || '(empty)');
      }
      expect(statsTable).toBeTruthy();
      const rows = statsTable?.querySelectorAll('tbody tr');
      expect(rows?.length || 0).toBeGreaterThan(2);
      expect(statusEl?.textContent || '').toMatch(/up to date/i);
    } finally {
      cleanupJStat();
    }
  });

  test('Histogram: Load Example populates data', async () => {
    await activateWorkspace('hist');
    const btn = document.getElementById('histLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'histHot');
    expect(loads.length).toBeGreaterThan(0);
    const populated = loads.find(call => Array.isArray(call.firstRow) && call.firstRow.includes('Exam Score'));
    expect(populated?.firstRow).toEqual(expect.arrayContaining(['Exam Score']));
    await flushAsyncWork();
  });

  test('Proportion Graph: Load Example populates data', async () => {
    await activateWorkspace('pie');
    const btn = document.getElementById('pieLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'pieHot');
    expect(loads.length).toBeGreaterThan(0);
    const populated = loads.find(call => {
      if (!Array.isArray(call.firstRow)) return false;
      return ['Quarter', 'Observed', 'Expected'].every(label => call.firstRow.includes(label));
    });
    expect(populated?.firstRow).toEqual(expect.arrayContaining(['Quarter', 'Observed', 'Expected']));
    await flushAsyncWork();
  });

  test('Correlation Heatmap: Load Example populates data', async () => {
    await activateWorkspace('heatmap');
    const btn = document.getElementById('heatmapLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'heatmapHot');
    expect(loads.length).toBeGreaterThan(0);
    const populated = loads.find(call => {
      if (!Array.isArray(call.firstRow)) return false;
      return ['Gene', 'Baseline_A', 'Stress_A'].every(label => call.firstRow.includes(label));
    });
    expect(populated?.firstRow).toEqual(expect.arrayContaining(['Gene', 'Baseline_A', 'Stress_A']));
    await flushAsyncWork();
  });

  test('Surface Plot: Load Example populates data', async () => {
    await activateWorkspace('surface');
    const btn = document.getElementById('surfaceLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'surfaceHot');
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
      const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'rocHot');
      expect(loads.length).toBeGreaterThan(0);
      const firstRow = loads[loads.length - 1].firstRow;
      expect(firstRow).toEqual(expect.arrayContaining(['Label', 'Model1', 'Model2']));
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

      window.Components.roc.draw();

      const statsResults = document.getElementById('rocStatsResults');
      expect(statsResults).toBeTruthy();
      const lines = Array.from(statsResults.querySelectorAll('p')).map(el => el.textContent);
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toContain(htmlName);
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
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'survivalHot');
    expect(loads.length).toBeGreaterThan(0);
    const populated = loads.find(call => Array.isArray(call.firstRow) && call.firstRow[0] === 'Control');
    expect(populated?.firstRow).toEqual(['Control', 1.2, 1]);
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
    const start = Date.now();
    window.Components.survival.draw();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1200);
    const summary = state.lastSummary;
    await flushAsyncWork();
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

  test('Color picker overlay opens on color input click', async () => {
    await activateWorkspace('venn');
    const colorA = document.getElementById('colorA');
    expect(colorA).toBeTruthy();
    // Find overlay (the shared picker appended directly under body)
    const overlay = document.querySelector('body > .shared-color-picker');
    expect(overlay).toBeTruthy();
    expect(overlay.style.display).toBe('none');

    // Dispatch click
    const evt = new window.Event('click', { bubbles: true, cancelable: true });
    colorA.dispatchEvent(evt);

    // Overlay should be shown
    expect(overlay.style.display).toBe('block');
    expect(overlay.dataset.visible).toBe('1');
  });

  test('Panel resizer drag triggers Shared.syncPanelWidths', async () => {
    await activateWorkspace('box');
    const resizer = document.getElementById('boxPanelResizer');
    expect(resizer).toBeTruthy();
    const syncSpy = jest.spyOn(window.Shared, 'syncPanelWidths');

    const pointerDown = new window.MouseEvent('pointerdown', { bubbles: true, clientX: 150 });
    resizer.dispatchEvent(pointerDown);

    const pointerMove = new window.MouseEvent('pointermove', { bubbles: true, clientX: 180 });
    document.dispatchEvent(pointerMove);

    const pointerUp = new window.MouseEvent('pointerup', { bubbles: true, clientX: 180 });
    document.dispatchEvent(pointerUp);

    expect(syncSpy).toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  test('Venn GO analysis results persist when repopulating the same region', async () => {
    await activateWorkspace('venn');
    const hooks = window.Components?.venn?.__testHooks;
    expect(hooks).toBeTruthy();
    const { state, populateRegion } = hooks;
    state.analysis.lastRegionSignature = null;
    state.analysis.lastRegionCode = null;
    state.analysis.lastRegions = {
      Aonly: new Set(['BRCA1', 'ATM']),
      Bonly: new Set(),
      Conly: new Set(),
      AB: new Set(),
      AC: new Set(),
      BC: new Set(),
      ABC: new Set()
    };
    state.ui.regionList = document.createElement('div');
    state.ui.copyRegionBtn = document.createElement('button');
    state.ui.goResults = document.createElement('div');
    state.ui.stringResults = document.createElement('div');
    state.ui.stringNetwork = document.createElement('div');
    state.ui.goChartExport = document.createElement('div');
    state.ui.stringNetworkExport = document.createElement('div');

    populateRegion('A');
    state.ui.goResults.innerHTML = 'DNA repair';
    populateRegion('A');

    expect(state.ui.goResults.innerHTML).toBe('DNA repair');
  });

  test('Venn STRING analysis results persist when repopulating the same region', async () => {
    await activateWorkspace('venn');
    const hooks = window.Components?.venn?.__testHooks;
    expect(hooks).toBeTruthy();
    const { state, populateRegion } = hooks;
    state.analysis.lastRegionSignature = null;
    state.analysis.lastRegionCode = null;
    state.analysis.lastRegions = {
      Aonly: new Set(['BRCA1', 'ATM']),
      Bonly: new Set(['CBX2']),
      Conly: new Set(),
      AB: new Set(['BAP1']),
      AC: new Set(),
      BC: new Set(),
      ABC: new Set(['RING1B'])
    };
    state.ui.regionList = document.createElement('div');
    state.ui.copyRegionBtn = document.createElement('button');
    state.ui.goResults = state.ui.goResults || document.createElement('div');
    state.ui.stringResults = document.createElement('div');
    state.ui.stringNetwork = document.createElement('div');
    state.ui.goChartExport = state.ui.goChartExport || document.createElement('div');
    state.ui.stringNetworkExport = document.createElement('div');

    populateRegion('A');
    state.ui.stringResults.innerHTML = '<strong>STRING enrichment</strong><div>Protein binding</div>';
    state.ui.stringNetwork.innerHTML = '<svg></svg>';
    populateRegion('A');

    expect(state.ui.stringResults.innerHTML).toContain('Protein binding');
    expect(state.ui.stringNetwork.innerHTML).toContain('<svg');
  });

  test('Venn detect species button triggers manual detection and indicator', async () => {
    await activateWorkspace('venn');
    const listA = document.getElementById('listA');
    const listB = document.getElementById('listB');
    const listC = document.getElementById('listC');
    const detectBtn = document.getElementById('detectSpeciesBtn');
    expect(listA && listB && listC && detectBtn).toBeTruthy();

    listA.value = 'BRCA1\nTP53';
    listB.value = 'ATM';
    listC.value = '';

    const originalFetch = global.fetch;
    const fetchMock = jest.fn((url) => {
      const gene = new URL(url).searchParams.get('q');
      return Promise.resolve({
        ok: true,
        json: async () => ({ hits: [{ symbol: gene, taxid: '9606' }] })
      });
    });
    global.fetch = fetchMock;

    try {
      detectBtn.click();
      await flushAsyncWork();
      await flushAsyncWork();

      expect(fetchMock).toHaveBeenCalled();
      const select = document.getElementById('speciesSelect');
      expect(select.value).toBe('hsapiens');
      expect(select.style.backgroundColor).toMatch(/b5d99c|rgb\(181, 217, 156\)/i);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('Venn species detection reuses cache without refetching', async () => {
    await activateWorkspace('venn');
    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();
    const listA = document.getElementById('listA');
    const listB = document.getElementById('listB');
    const listC = document.getElementById('listC');
    listA.value = 'BRCA1';
    listB.value = '';
    listC.value = '';

    const originalFetch = global.fetch;
    const fetchMock = jest.fn(() => Promise.resolve({
      ok: true,
      json: async () => ({ hits: [{ symbol: 'BRCA1', taxid: '9606' }] })
    }));
    global.fetch = fetchMock;

    try {
      await venn.recognizeSpeciesFromInput({ reason: 'cache-test' });
      await flushAsyncWork();
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await venn.recognizeSpeciesFromInput({ reason: 'cache-test-repeat' });
      await flushAsyncWork();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('Venn species detection cancels in-flight requests when superseded', async () => {
    await activateWorkspace('venn');
    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();
    const listA = document.getElementById('listA');
    const listB = document.getElementById('listB');
    const listC = document.getElementById('listC');
    listA.value = 'BRCA1';
    listB.value = '';
    listC.value = '';

    const originalFetch = global.fetch;
    const pendingResolvers = [];
    const fetchMock = jest.fn((url, options = {}) => new Promise((resolve, reject) => {
      const gene = new URL(url).searchParams.get('q');
      if (options.signal) {
        if (options.signal.aborted) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        options.signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        }, { once: true });
      }
      pendingResolvers.push(() => resolve({
        ok: true,
        json: async () => ({ hits: [{ symbol: gene, taxid: '9606' }] })
      }));
    }));
    global.fetch = fetchMock;

    try {
      const detectionState = window.Components?.venn?.__testHooks?.state.analysis.speciesDetection;
      const fakeController = new AbortController();
      detectionState.active = { controller: fakeController, cacheKey: 'fake-cache', reason: 'pending' };

      const secondPromise = venn.recognizeSpeciesFromInput({ reason: 'second-detect' });
      await flushAsyncWork();

      expect(fakeController.signal.aborted).toBe(true);

      const select = document.getElementById('speciesSelect');
      expect(select.style.backgroundColor).toBe('');

      pendingResolvers.forEach(resolver => resolver());

      await secondPromise;

      expect(select.value).toBe('hsapiens');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
