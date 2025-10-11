/**
 * Event-level tests to ensure key UI flows are wired correctly.
 * These catch regressions when splitting main.js into modules.
 */

function createJStatTestStub(){
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

function activateWorkspace(type){
  const graphSelection = window.Main?.tabs?.handleGraphSelection;
  expect(typeof graphSelection).toBe('function');
  graphSelection(type);
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
    require('../js/shared/axisControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/shared/uniprot.js');
    require('../js/shared/goAnalysis.js');
    require('../js/shared/stringAnalysis.js');
    // Components
    require('../js/components/heatmap.js');
    require('../js/components/roc.js');
    require('../js/components/survival.js');
    require('../js/components/hist.js');
    require('../js/components/pie.js');
    require('../js/components/scatter.js');
    require('../js/components/line.js');
    require('../js/components/pca.js');
    require('../js/components/box.js');
    require('../js/components/venn.js');
    require('../js/main/components.js');
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
    activateWorkspace('box');
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

  test.skip('Box Plot: assumption warnings surface for non-normal data', async () => {
    activateWorkspace('box');
    const cleanupJStat = ensureJStatStub();
    try {
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

      const statsResults = document.getElementById('statsResults');
      console.debug('Debug: test statsResults HTML', statsResults?.innerHTML);
      const assumptionSection = statsResults?.querySelector('.stats-assumption-section');
      expect(assumptionSection).toBeTruthy();
      const failBadges = Array.from(assumptionSection.querySelectorAll('.assumption-badge[data-result="fail"]'));
      expect(failBadges.length).toBeGreaterThan(0);
      const warningTexts = Array.from(assumptionSection.querySelectorAll('.assumption-warning')).map(el => el.textContent || '');
      expect(warningTexts.some(text => /failed normality/i.test(text))).toBe(true);

      const updatedState = window.Components.box.__getState?.();
      console.debug('Debug: test assumption state snapshot', {
        recommend: updatedState?.assumptionDiagnostics?.recommendNonParametric,
        warnings: updatedState?.assumptionDiagnostics?.warnings,
        statsTest: updatedState?.statsTest
      });
      expect(updatedState?.assumptionDiagnostics?.recommendNonParametric).toBe(true);
      expect(updatedState?.statsTest).toBe('nonparametric');
      expect((updatedState?.assumptionDiagnostics?.warnings || []).length).toBeGreaterThan(0);
    } finally {
      cleanupJStat();
    }
  });

  test('Histogram: Load Example populates data', async () => {
    activateWorkspace('hist');
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
    activateWorkspace('pie');
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
    activateWorkspace('heatmap');
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

  test.skip('ROC: Load Example populates data', async () => {
    activateWorkspace('roc');
    const btn = document.getElementById('rocLoadExample');
    expect(btn).toBeTruthy();
    btn.click();
    await flushAsyncWork();
    const loads = (global.__HT_CALLS__ || []).filter(c => c.type === 'loadData' && c.containerId === 'rocHot');
    expect(loads.length).toBeGreaterThan(0);
    const firstRow = loads[loads.length - 1].firstRow;
    expect(firstRow).toEqual(expect.arrayContaining(['Label', 'Model1', 'Model2']));
    await flushAsyncWork();
  });

  test.skip('ROC stats escape series names that look like HTML', () => {
    activateWorkspace('roc');
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
  });

  test('Survival: Load Example populates data', async () => {
    activateWorkspace('survival');
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

  test('Color picker overlay opens on color input click', () => {
    activateWorkspace('venn');
    const colorA = document.getElementById('colorA');
    expect(colorA).toBeTruthy();
    // Find overlay (the only color input appended directly under body with pointerEvents none)
    const overlay = Array.from(document.querySelectorAll('body > input[type="color"]')).find(el => el.style.pointerEvents === 'none');
    expect(overlay).toBeTruthy();
    expect(overlay.style.display).toBe('none');

    // Dispatch click
    const evt = new window.Event('click', { bubbles: true, cancelable: true });
    colorA.dispatchEvent(evt);

    // Overlay should be shown
    expect(overlay.style.display).toBe('block');
  });

  test('Panel resizer drag triggers Shared.syncPanelWidths', () => {
    activateWorkspace('box');
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

  test('Venn GO analysis results persist when repopulating the same region', () => {
    activateWorkspace('venn');
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

  test('Venn STRING analysis results persist when repopulating the same region', () => {
    activateWorkspace('venn');
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
});
