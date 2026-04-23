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

async function waitForBoxSvg(iterations = 80){
  for(let i = 0; i < iterations; i += 1){
    const svg = document.querySelector('#boxPlot svg');
    if(svg){
      return svg;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return null;
}

async function activateWorkspace(type){
  const result = window.Main?.tabs?.handleGraphSelection?.(type, { reason: 'test-select' });
  if(result && typeof result.then === 'function'){
    await result;
  }
  await flushAsyncWork(10);
}

async function activateTabById(tabId, reason){
  const result = window.Main?.tabs?.activateTab?.(tabId, { reason: reason || 'test-switch' });
  if(result && typeof result.then === 'function'){
    await result;
  }
  await flushAsyncWork(15);
}

function findStatsTestSelect(){
  const selects = Array.from(document.querySelectorAll('#statsControls select'));
  return selects.find(sel => {
    const values = Array.from(sel.options || []).map(opt => opt.value);
    return values.includes('parametric') && values.includes('nonparametric');
  }) || null;
}

function setStatsTestValue(value){
  const select = findStatsTestSelect();
  expect(select).toBeTruthy();
  select.value = value;
  select.dispatchEvent(new window.Event('change', { bubbles: true }));
}

function createSeedPayload(boxComponent){
  const payload = boxComponent.createEmptyPayload();
  payload.data = [
    ['Control', 'Treatment A', 'Treatment B'],
    [10, 12, 11],
    [9, 13, 10],
    [11, 14, 12]
  ];
  return payload;
}

function getBoxStatsButton(){
  return document.getElementById('boxComputeStats');
}

function debugArgsContain(args, text){
  return args.some(arg => {
    if(typeof arg === 'string'){
      return arg.includes(text);
    }
    try{
      return JSON.stringify(arg).includes(text);
    }catch(_err){
      return false;
    }
  });
}

describe('Box stats controls tab isolation with render cache', () => {
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
    require('../js/shared/colorSchemes.js');
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

  test('switching between box tabs preserves per-tab stats control values', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    boxComponent.loadFromPayload(createSeedPayload(boxComponent), { source: 'test-seed-a' });
    await flushAsyncWork(20);

    const tabA = main.session.getActiveTab();
    expect(tabA?.type).toBe('box');

    expect(findStatsTestSelect()?.value).toBe('parametric');
    setStatsTestValue('nonparametric');
    await flushAsyncWork(20);

    expect(boxComponent.__getState().statsTest).toBe('nonparametric');
    expect(findStatsTestSelect()?.value).toBe('nonparametric');

    main.tabs.handleAddTabClick();
    await flushAsyncWork(10);
    await activateWorkspace('box');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await flushAsyncWork(20);
    }

    const tabB = main.session.getActiveTab();
    expect(tabB?.type).toBe('box');
    expect(tabB?.id).not.toBe(tabA?.id);

    boxComponent.loadFromPayload(createSeedPayload(boxComponent), { source: 'test-seed-b' });
    await flushAsyncWork(20);

    expect(boxComponent.__getState().statsTest).toBe('parametric');
    expect(findStatsTestSelect()?.value).toBe('parametric');

    await activateTabById(tabA.id, 'test-switch-to-a');
    expect(boxComponent.__getState().statsTest).toBe('nonparametric');
    expect(findStatsTestSelect()?.value).toBe('nonparametric');

    await activateTabById(tabB.id, 'test-switch-to-b');
    expect(boxComponent.__getState().statsTest).toBe('parametric');
    expect(findStatsTestSelect()?.value).toBe('parametric');
  });

  test('new empty box tab resets stats button label to Calculate statistics', async () => {
    await activateWorkspace('box');
    const boxComponent = window.Components?.box;
    const main = window.Main;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    boxComponent.loadFromPayload(createSeedPayload(boxComponent), { source: 'test-stats-button-seed' });
    await flushAsyncWork(20);

    const statsButton = getBoxStatsButton();
    expect(statsButton).toBeTruthy();
    statsButton.click();
    await flushAsyncWork(60);
    expect(statsButton.textContent).toBe('Recalculate statistics');

    main.tabs.handleAddTabClick();
    await flushAsyncWork(10);
    await activateWorkspace('box');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await flushAsyncWork(25);
    }

    expect(getBoxStatsButton()?.textContent).toBe('Calculate statistics');
  });

  test('box stats calculation remains clickable after switching between box tabs', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    boxComponent.loadFromPayload(createSeedPayload(boxComponent), { source: 'test-stats-click-a' });
    await flushAsyncWork(25);
    const tabA = main.session.getActiveTab();

    main.tabs.handleAddTabClick();
    await flushAsyncWork(10);
    await activateWorkspace('box');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await flushAsyncWork(25);
    }

    boxComponent.loadFromPayload(createSeedPayload(boxComponent), { source: 'test-stats-click-b' });
    await flushAsyncWork(25);
    const tabB = main.session.getActiveTab();
    expect(tabB?.id).not.toBe(tabA?.id);

    const state = boxComponent.__getState();
    state.statsComputationPending = true;
    state.statsComputationOwnerTabId = tabB.id;

    await activateTabById(tabA.id, 'test-switch-to-a-with-stale-pending');
    expect(boxComponent.__getState().statsComputationPending).toBe(false);

    const statsButtonA = getBoxStatsButton();
    expect(statsButtonA).toBeTruthy();
    expect(statsButtonA.disabled).toBe(false);
    statsButtonA.click();
    await flushAsyncWork(50);
    expect(statsButtonA.textContent).toBe('Recalculate statistics');
    expect(boxComponent.__getState().statsComputationPending).toBe(false);

    await activateTabById(tabB.id, 'test-switch-to-b-after-a-compute');
    const statsButtonB = getBoxStatsButton();
    expect(statsButtonB).toBeTruthy();
    expect(statsButtonB.disabled).toBe(false);
    statsButtonB.click();
    await flushAsyncWork(50);
    expect(statsButtonB.textContent).toBe('Recalculate statistics');
    expect(boxComponent.__getState().statsComputationPending).toBe(false);
  });

  test('delayed dark theme repaint cannot cross-contaminate another box tab cache', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    const schemes = window.Shared?.colorSchemes;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();
    expect(schemes?.applyToActiveTab).toBeTruthy();

    const payloadA = createSeedPayload(boxComponent);
    payloadA.config = payloadA.config || {};
    payloadA.config.colorScheme = 'scientific';
    boxComponent.loadFromPayload(payloadA, { source: 'test-theme-a' });
    await flushAsyncWork(25);
    const tabA = main.session.getActiveTab();
    main.session.persistActiveTabState(tabA, {
      workspaces: main.components.registry,
      previews: main.previews,
      reason: 'test-theme-persist-a'
    });
    const tabAScheme = tabA.payload?.config?.colorScheme || '';
    expect(tabAScheme).toBeTruthy();
    expect(tabAScheme).not.toBe('dark');

    main.tabs.handleAddTabClick();
    await flushAsyncWork(10);
    await activateWorkspace('box');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await flushAsyncWork(25);
    }

    const payloadB = createSeedPayload(boxComponent);
    payloadB.config = payloadB.config || {};
    payloadB.config.colorScheme = 'scientific';
    boxComponent.loadFromPayload(payloadB, { source: 'test-theme-b' });
    await flushAsyncWork(25);
    const tabB = main.session.getActiveTab();
    expect(tabB?.id).not.toBe(tabA.id);

    expect(schemes.applyToActiveTab('box', 'dark')).toBe(true);
    await flushAsyncWork(5);
    expect(tabB.payload?.config?.colorScheme).toBe('dark');

    await activateTabById(tabA.id, 'test-theme-switch-back-before-delayed-dark');
    await new Promise(resolve => setTimeout(resolve, 230));
    await flushAsyncWork(20);

    const active = main.session.getActiveTab();
    expect(active?.id).toBe(tabA.id);
    expect(active.payload?.config?.colorScheme).toBe(tabAScheme);
    expect(schemes.getSelectedSchemeId('box')).toBe(tabAScheme);

    const svgBoxBg = document.querySelector('#boxGraphPanel .svgbox')?.style?.backgroundColor || '';
    const plotBg = document.getElementById('boxPlot')?.style?.backgroundColor || '';
    const svgScheme = document.querySelector('#boxPlot svg')?.getAttribute('data-color-scheme') || '';
    expect(svgBoxBg).not.toMatch(/rgb\(0,\s*0,\s*0\)|#000|black/i);
    expect(plotBg).not.toMatch(/rgb\(0,\s*0,\s*0\)|#000|black/i);
    expect(svgScheme).not.toBe('dark');
  });

  test('box-to-box switch restores only complete owner cache without stale tab tokens or redraw churn', async () => {
    await activateWorkspace('box');

    const boxComponent = window.Components?.box;
    const main = window.Main;
    expect(boxComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    boxComponent.loadFromPayload(createSeedPayload(boxComponent), { source: 'test-cache-owner-a' });
    await flushAsyncWork(30);
    expect(await waitForBoxSvg()).toBeTruthy();
    const tabA = main.session.getActiveTab();
    expect(tabA?.type).toBe('box');

    main.tabs.handleAddTabClick();
    await flushAsyncWork(10);
    await activateWorkspace('box');

    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await flushAsyncWork(25);
    }

    boxComponent.loadFromPayload(createSeedPayload(boxComponent), { source: 'test-cache-owner-b' });
    await flushAsyncWork(30);
    const tabB = main.session.getActiveTab();
    expect(tabB?.type).toBe('box');
    expect(tabB?.id).not.toBe(tabA.id);

    await activateTabById(tabA.id, 'test-cache-owner-prime-a');
    expect(await waitForBoxSvg()).toBeTruthy();
    await activateTabById(tabB.id, 'test-cache-owner-capture-a');
    await flushAsyncWork(20);

    const tabAWithCache = main.session.workspaceState.tabs.find(tab => tab.id === tabA.id);
    expect(tabAWithCache?.renderCache?.tabId).toBe(tabA.id);
    expect(tabAWithCache?.renderCache?.cache?.__graphitixRenderCache?.complete).toBe(true);
    expect(tabAWithCache?.renderCache?.cache?.__graphitixRenderCache?.tabId).toBe(tabA.id);

    const debugCalls = [];
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation((...args) => {
      debugCalls.push(args);
    });
    const originalDraw = boxComponent.draw;
    let drawCalls = 0;
    boxComponent.draw = function countedBoxDraw(...args){
      drawCalls += 1;
      return originalDraw.apply(this, args);
    };
    const resizeCalls = [];
    const originalApplyResizableBoxSize = window.Shared?.applyResizableBoxSize;
    let resizeSpy = null;
    if(typeof originalApplyResizableBoxSize === 'function'){
      resizeSpy = jest.spyOn(window.Shared, 'applyResizableBoxSize').mockImplementation(function countedResize(node, options){
        resizeCalls.push(options || {});
        return originalApplyResizableBoxSize.call(this, node, options);
      });
    }

    try{
      await activateTabById(tabA.id, 'test-cache-owner-switch-a');
      await flushAsyncWork(40);
    }finally{
      boxComponent.draw = originalDraw;
      if(resizeSpy){
        resizeSpy.mockRestore();
      }
      debugSpy.mockRestore();
    }

    expect(main.session.getActiveTab()?.id).toBe(tabA.id);
    expect(debugCalls.some(args => args[0] === 'Debug: box render cache restored' && args[1]?.restored === true)).toBe(true);
    expect(debugCalls.some(args => debugArgsContain(args, 'incomplete-live-runtime'))).toBe(false);
    expect(debugCalls.some(args => debugArgsContain(args, 'cache-validation-failed'))).toBe(false);
    expect(debugCalls.some(args => debugArgsContain(args, 'incomplete-cache'))).toBe(false);
    expect(drawCalls).toBeLessThanOrEqual(1);
    const fullDrawPasses = debugCalls.filter(args => args[0] === 'Debug: box axis settings current').length;
    expect(fullDrawPasses).toBeLessThanOrEqual(1);
    expect(resizeCalls.some(options => options?.reason === 'orientation-missing')).toBe(false);

    const plot = document.getElementById('boxPlot');
    expect(plot?.dataset?.boxRenderedTabId).toBe(tabA.id);
    const wrongFontNodes = Array.from(document.querySelectorAll('#boxPlot [data-font-tab-id]'))
      .filter(node => node.dataset.fontTabId && node.dataset.fontTabId !== tabA.id);
    expect(wrongFontNodes).toHaveLength(0);
  });
});
