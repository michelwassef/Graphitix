jest.setTimeout(30000);

const { ensureJStatStub } = require('./helpers/jstatTestStub');

describe('Line view labels', () => {
  let restoreJStat = null;
  const flush = () => new Promise(resolve => requestAnimationFrame(() => resolve()));
  const flushAll = async (count = 10) => {
    for(let i = 0; i < count; i += 1){
      await flush();
    }
  };
  const activateWorkspace = async (type) => {
    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    expect(typeof graphSelection).toBe('function');
    const result = graphSelection(type);
    if(result && typeof result.then === 'function'){
      await result;
    }
    await Promise.resolve();
  };
  const ensureEmptyDuplicateTab = async () => {
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      const emptyButton = document.getElementById('duplicateEmpty');
      expect(emptyButton).toBeTruthy();
      emptyButton.click();
      await flushAll(20);
    }
  };
  const loadLineExampleAndComputeStats = async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(30);
    const computeBtn = document.getElementById('lineComputeStats');
    expect(computeBtn).toBeTruthy();
    computeBtn.click();
    await flushAll(50);
    expect(document.getElementById('lineStatsStatus')?.textContent || '').toMatch(/up to date/i);
  };
  const enableLineRegressionOverlays = async () => {
    const trend = document.getElementById('lineShowTrendLine');
    const confidence = document.getElementById('lineShowIntervals');
    const prediction = document.getElementById('lineShowPredictionIntervals');
    [trend, confidence, prediction].forEach(control => expect(control).toBeTruthy());
    expect(trend.disabled).toBe(false);
    trend.checked = true;
    trend.dispatchEvent(new window.Event('change', { bubbles: true }));
    await flushAll(15);
    [confidence, prediction].forEach(control => {
      expect(control.disabled).toBe(false);
      control.checked = true;
      control.dispatchEvent(new window.Event('change', { bubbles: true }));
    });
    await flushAll(50);
  };
  const getLineOverlayCounts = () => {
    const root = document.querySelector('#linePage:not([hidden])') || document;
    return {
      trend: root.querySelectorAll('#lineSvg path[data-line-overlay-key="trend"]').length,
      confidence: root.querySelectorAll('#lineSvg path[data-line-overlay-key="confidence"]').length,
      prediction: root.querySelectorAll('#lineSvg path[data-line-overlay-key="prediction"]').length
    };
  };

  beforeEach(async () => {
    jest.resetModules();
    if(typeof window !== 'undefined'){
      delete window.Main;
      delete window.Components;
      delete window.Shared;
    }
    if(typeof global !== 'undefined'){
      delete global.Main;
      delete global.Components;
      delete global.Shared;
    }
    if(typeof global.__resetGrid__ === 'function'){
      global.__resetGrid__();
    }
    window.localStorage?.clear?.();
    window.sessionStorage?.clear?.();
    if(window.Components){
      delete window.Components.line;
    }
    if(global.Components){
      delete global.Components.line;
    }
    restoreJStat = ensureJStatStub();

    require('../js/vendor.js');
    require('../js/shared/debounce.js');
    require('../js/shared/resizer.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/regression.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
    require('../js/shared/formControls.js');
    require('../js/shared/dom.js');
    require('../js/components/line.js');
    require('../js/main/components.js');
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main.js');
    await activateWorkspace('line');
    const activeLineTabId = window.Main?.session?.getActiveTab?.()?.id || null;

    window.Components?.line?.ensure?.({
      tabId: activeLineTabId,
      root: document.getElementById('linePage'),
      reason: 'line-view-test-ensure'
    });
    await flushAll(20);
  });

  afterEach(() => {
    if(typeof restoreJStat === 'function'){
      restoreJStat();
      restoreJStat = null;
    }
  });

  test('legend labels follow editable header row titles', async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();

    exampleBtn.click();
    await flushAll(20);

    const lineComponent = window.Components?.line;
    const hot = lineComponent?.getHot?.();
    expect(hot).toBeTruthy();

    hot.setDataAtCell([
      [0, 1, 'North renamed'],
      [0, 2, 'South renamed']
    ], 'test-line-header-edit');
    await flushAll(20);

    const headerRow = Array.isArray(hot?.getData?.()) ? hot.getData()[0] : null;
    expect(headerRow?.slice(0, 6)).toEqual(['Month', 'North renamed', 'South renamed', 'East', 'West', 'Central']);

    const lineState = lineComponent?.__getState?.();
    expect(lineState?.legendItems?.map(item => item.label)).toEqual([
      'North renamed',
      'South renamed',
      'East',
      'West',
      'Central'
    ]);
  });

  test('legend label clicks do not hide rendered line series', async () => {
    const exampleBtn = document.getElementById('lineLoadExample');
    expect(exampleBtn).toBeTruthy();

    exampleBtn.click();
    await flushAll(20);

    const legendLabel = document.querySelector('#lineSvg text[data-legend-key="North"]');
    const seriesPath = document.querySelector('#lineSvg path[data-series="North"][data-render-mode="line"]');

    expect(legendLabel).toBeTruthy();
    expect(seriesPath).toBeTruthy();
    expect(seriesPath.style.display).not.toBe('none');

    legendLabel.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flushAll(5);

    expect(seriesPath.style.display).not.toBe('none');
  });

  test('same-component line tabs preserve rendered regression overlays after activation', async () => {
    const lineComponent = window.Components?.line;
    const main = window.Main;
    expect(lineComponent).toBeTruthy();
    expect(main?.tabs).toBeTruthy();

    await loadLineExampleAndComputeStats();
    const tabA = main.session.getActiveTab();
    await enableLineRegressionOverlays();
    const runtimeAfterToggle = lineComponent.captureRuntimeState?.({
      tabId: tabA.id,
      reason: 'test-line-overlay-runtime-after-toggle'
    });
    expect(runtimeAfterToggle?.last2d?.showTrendLine).toBe(true);
    expect(runtimeAfterToggle?.last2d?.showIntervals).toBe(true);
    expect(runtimeAfterToggle?.last2d?.showPredictionIntervals).toBe(true);
    let counts = getLineOverlayCounts();
    expect(counts.trend).toBeGreaterThan(0);
    expect(counts.confidence).toBeGreaterThan(0);
    expect(counts.prediction).toBeGreaterThan(0);
    main.session.persistActiveTabState(tabA, {
      workspaces: main.components.registry,
      previews: main.previews,
      reason: 'test-line-overlay-persist-a'
    });

    main.tabs.handleAddTabClick();
    await flushAll(10);
    await activateWorkspace('line');
    await ensureEmptyDuplicateTab();
    await loadLineExampleAndComputeStats();
    const tabB = main.session.getActiveTab();
    expect(tabB?.id).not.toBe(tabA?.id);

    const switchToB = main.tabs.activateTab(tabB.id, { reason: 'test-line-overlay-switch-b' });
    if(switchToB && typeof switchToB.then === 'function'){
      await switchToB;
    }
    await flushAll(25);

    const switchToA = main.tabs.activateTab(tabA.id, { reason: 'test-line-overlay-switch-a' });
    if(switchToA && typeof switchToA.then === 'function'){
      await switchToA;
    }
    await flushAll(80);

    expect(document.getElementById('lineShowTrendLine').checked).toBe(true);
    expect(document.getElementById('lineShowIntervals').checked).toBe(true);
    expect(document.getElementById('lineShowPredictionIntervals').checked).toBe(true);
    counts = getLineOverlayCounts();
    expect(counts.trend).toBeGreaterThan(0);
    expect(counts.confidence).toBeGreaterThan(0);
    expect(counts.prediction).toBeGreaterThan(0);
  });

  test('line overlay checkbox intent survives transient unavailable stats restore', async () => {
    const lineComponent = window.Components?.line;
    const main = window.Main;
    expect(lineComponent).toBeTruthy();

    await loadLineExampleAndComputeStats();
    const tab = main.session.getActiveTab();
    await enableLineRegressionOverlays();

    const payload = lineComponent.getPayload?.();
    expect(payload?.config?.showTrendLine).toBe(true);
    expect(payload?.config?.showConfidenceIntervals).toBe(true);
    expect(payload?.config?.showPredictionIntervals).toBe(true);

    const transientPayload = JSON.parse(JSON.stringify(payload));
    transientPayload.config.stats = {
      controls: transientPayload.config.stats?.controls || {},
      statsOptions: transientPayload.config.stats?.statsOptions || {},
      version: 0,
      lastRunVersion: 0,
      hasResults: false,
      signature: null,
      resultsModel: null,
      reportModel: null
    };

    lineComponent.loadFromPayload?.(transientPayload, {
      tabId: tab.id,
      reason: 'test-line-transient-stats-unavailable'
    });
    await flushAll(40);

    expect(document.getElementById('lineShowTrendLine').checked).toBe(true);
    expect(document.getElementById('lineShowIntervals').checked).toBe(true);
    expect(document.getElementById('lineShowPredictionIntervals').checked).toBe(true);
  });
});
