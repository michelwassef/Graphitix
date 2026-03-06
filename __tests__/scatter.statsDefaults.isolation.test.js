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
  const normalCdf = (x, mean = 0, sd = 1) => {
    const safeSd = Math.max(Math.abs(sd), 1e-9);
    const z = (x - mean) / (safeSd * Math.SQRT2);
    return 0.5 * (1 + erf(z));
  };
  return {
    normal: { cdf: normalCdf },
    studentt: { cdf: (x, df = 1) => {
      const safeDf = Math.max(df, 1);
      const scale = Math.sqrt(Math.max((safeDf - 2) / safeDf, 0.5));
      return normalCdf(x * scale, 0, 1);
    } },
    centralF: { cdf: () => 0.5 },
    chisquare: { cdf: () => 0.5 },
    mean: arr => {
      const clean = (arr || []).map(Number).filter(Number.isFinite);
      if (!clean.length) {
        return NaN;
      }
      const sum = clean.reduce((total, value) => total + value, 0);
      return sum / clean.length;
    },
    stdev: (arr, sample) => {
      const clean = (arr || []).map(Number).filter(Number.isFinite);
      if (!clean.length) {
        return 0;
      }
      const mean = clean.reduce((sum, v) => sum + v, 0) / clean.length;
      const divisor = sample ? Math.max(clean.length - 1, 1) : clean.length;
      const variance = clean.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / divisor;
      return Math.sqrt(Math.max(variance, 0));
    },
    percentile: (arr, p) => {
      const clean = (arr || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (!clean.length) {
        return NaN;
      }
      const pos = (clean.length - 1) * p;
      const base = Math.floor(pos);
      const rest = pos - base;
      if (clean[base + 1] !== undefined) {
        return clean[base] + rest * (clean[base + 1] - clean[base]);
      }
      return clean[base];
    }
  };
}

function ensureJStatStub(){
  const existing = global.jStat;
  if(existing){
    return () => { global.jStat = existing; };
  }
  global.jStat = createJStatTestStub();
  return () => { delete global.jStat; };
}

async function flushAsyncWork(iterations = 10){
  for(let i = 0; i < iterations; i += 1){
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function activateWorkspace(type){
  const result = window.Main?.tabs?.handleGraphSelection?.(type, { reason: 'test-select' });
  if(result && typeof result.then === 'function'){
    await result;
  }
  await flushAsyncWork(10);
}

function createSeedPayload(scatterComponent){
  const payload = scatterComponent.createEmptyPayload();
  payload.data = [
    ['Label', 'X title', 'Y title', 'Z title'],
    ['A', 1, 2, ''],
    ['B', 2, 3.5, ''],
    ['C', 3, 5.1, ''],
    ['D', 4, 7.2, '']
  ];
  return payload;
}

describe('Scatter stats defaults isolation', () => {
  jest.setTimeout(30000);
  let restoreJStat;

  beforeEach(() => {
    jest.resetModules();
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
    if(typeof global.__suppressTestDebugLogs === 'function'){
      global.__suppressTestDebugLogs();
    }
  });

  test('new empty scatter tab resets association metric to default', async () => {
    await activateWorkspace('scatter');

    const scatterComponent = window.Components?.scatter;
    const main = window.Main;
    expect(scatterComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    scatterComponent.loadFromPayload(createSeedPayload(scatterComponent), { source: 'test-scatter-seed-a' });
    await flushAsyncWork(20);

    const statSelect = document.getElementById('scatterStatType');
    expect(statSelect).toBeTruthy();
    expect(statSelect.value).toBe('auto');

    statSelect.value = 'spearman';
    statSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    await flushAsyncWork(20);
    expect(document.getElementById('scatterStatType').value).toBe('spearman');

    const defaultsPayload = window.Main?.domControls?.ensureDefaultPayload?.(
      window.Main?.session,
      'scatter',
      window.Main?.components?.registry?.scatter
    );
    expect(defaultsPayload?.config?.stats?.statType).toBe('auto');

    main.tabs.handleAddTabClick();
    await flushAsyncWork(10);
    await activateWorkspace('scatter');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await flushAsyncWork(25);
    }

    expect(document.getElementById('scatterStatType').value).toBe('auto');
  });

  test('new empty scatter tab sanitizes contaminated cached defaults', async () => {
    await activateWorkspace('scatter');

    const scatterComponent = window.Components?.scatter;
    const main = window.Main;
    const domControls = main?.domControls;
    const session = main?.session;
    const scatterConfig = main?.components?.registry?.scatter;
    expect(scatterComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();
    expect(domControls).toBeTruthy();
    expect(session).toBeTruthy();
    expect(scatterConfig).toBeTruthy();

    scatterComponent.loadFromPayload(createSeedPayload(scatterComponent), { source: 'test-scatter-seed-b' });
    await flushAsyncWork(30);

    const contaminated = scatterComponent.createEmptyPayload();
    contaminated.config = contaminated.config || {};
    contaminated.config.stats = contaminated.config.stats || {};
    contaminated.config.stats.statType = 'spearman';
    contaminated.config.stats.resultsHtml = '<div>stale</div>';
    contaminated.config.stats.lastRunVersion = 9;
    contaminated.config.stats.contextVersion = 9;
    contaminated.config.stats.contextSignature = 'stale-signature';
    domControls.setWorkspaceDefaultPayload(session, 'scatter', contaminated);

    const sanitizedDefaults = domControls.ensureDefaultPayload(session, 'scatter', scatterConfig);
    expect(sanitizedDefaults?.config?.stats?.statType).toBe('auto');
    expect(sanitizedDefaults?.config?.stats?.resultsHtml).toBeNull();
    expect(sanitizedDefaults?.config?.stats?.lastRunVersion).toBe(0);
    expect(sanitizedDefaults?.config?.stats?.contextVersion).toBe(0);
    expect(sanitizedDefaults?.config?.stats?.contextSignature).toBeNull();

    main.tabs.handleAddTabClick();
    await flushAsyncWork(12);
    await activateWorkspace('scatter');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await flushAsyncWork(30);
    }

    expect(document.getElementById('scatterStatType').value).toBe('auto');
    expect((document.getElementById('scatterComputeStats')?.textContent || '').trim()).toBe('Calculate statistics');
  });
});
