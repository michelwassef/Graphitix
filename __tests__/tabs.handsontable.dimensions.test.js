function createJStatTestStub(){
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
    mean: arr => {
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
  return stub;
}

const originalDebug = console.debug;
const originalLog = console.log;

function ensureJStatStub(){
  const existing = global.jStat;
  if(existing){
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

async function flushAsyncWork(iterations = 10){
  for (let i = 0; i < iterations; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('Workspace tab Handsontable defaults', () => {
  let restoreJStat;

  beforeEach(() => {
    jest.resetModules();
    restoreJStat = ensureJStatStub();
    console.debug = jest.fn();
    console.log = jest.fn();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetHT__ === 'function') {
      global.__resetHT__();
    }
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
    if (restoreJStat) {
      restoreJStat();
      restoreJStat = null;
    }
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  afterAll(() => {
    console.debug = originalDebug;
    console.log = originalLog;
  });

  test('New PCA tab resets to default Handsontable dimensions after large dataset', async () => {
    await activateWorkspace('pca');
    const defaultRows = window.Components?.pca?.createEmptyPayload?.().data.length || 0;
    const defaultCols = window.Components?.pca?.createEmptyPayload?.().data?.[0]?.length || 0;
    expect(defaultRows).toBeGreaterThan(0);
    expect(defaultCols).toBeGreaterThan(0);
    await flushAsyncWork();

    const hot = window.Components?.pca?.getHotInstance?.();
    expect(hot).toBeTruthy();
    const wideRowCount = Math.max(defaultRows * 10, defaultRows + 900);
    const wideData = window.Shared.createEmptyData(wideRowCount, defaultCols);
    expect(wideData.length).toBe(wideRowCount);
    expect(Array.isArray(wideData[0])).toBe(true);
    hot._data = wideData;
    hot._settings = Object.assign({}, hot.getSettings(), {
      minRows: wideRowCount,
      minCols: defaultCols
    });
    expect(hot.countRows()).toBe(wideRowCount);

    window.Main.tabs.handleAddTabClick();
    await flushAsyncWork();
    await activateWorkspace('pca');
    const duplicateEmptyBtn = document.getElementById('duplicateEmpty');
    expect(duplicateEmptyBtn).not.toBeNull();
    duplicateEmptyBtn.click();
    await flushAsyncWork(20);

    const newActiveTab = window.Main.session.getActiveTab();
    expect(newActiveTab?.type).toBe('pca');
    const restoredHot = window.Components.pca.getHotInstance();
    expect(restoredHot.countRows()).toBe(defaultRows);
    expect(restoredHot.getSettings().minRows).toBe(defaultRows);
    expect(restoredHot.countCols()).toBeGreaterThanOrEqual(defaultCols);
  });
});
