const originalDebug = console.debug;
const originalLog = console.log;
const { loadProductionBootstrap } = require('../../test-support/productionLoader');
const { waitForIntegrationOwnerReady } = require('../../test-support/readiness');

async function waitForSurvivalOwner(tabId, condition = null) {
  return waitForIntegrationOwnerReady({
    type: 'survival',
    expectedTabId: tabId,
    requireMountedRoot: true,
    condition: condition || undefined
  });
}

async function selectSurvivalGraph() {
  const graphSelection = window.Main?.tabs?.handleGraphSelection;
  expect(typeof graphSelection).toBe('function');
  const maybe = graphSelection('survival', { reason: 'survival-stats-test-selection' });
  if (maybe && typeof maybe.then === 'function') {
    await maybe;
  }
  const tabId = window.Main?.session?.getActiveTab?.()?.id || null;
  await waitForSurvivalOwner(tabId);
  return tabId;
}

const cloneForTest = value => JSON.parse(JSON.stringify(value));

describe('Survival statistics pipeline', () => {
  beforeEach(() => {
    const previousSurvival = window.Components?.survival || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousSurvival?.deactivateTab){
      previousTabs.filter(tab => tab?.type === 'survival').forEach(tab => {
        previousSurvival.deactivateTab(tab, { tabId: tab.id, reason: 'survival-test-reset' });
      });
    }
    delete window.Main;
    delete window.Components;
    jest.resetModules();
    console.debug = jest.fn();
    console.log = jest.fn();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }
    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: ['survival']
    });
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

  test('Hazard ratios and Cox model stats render and persist', async () => {
    const tabId = await selectSurvivalGraph();

    const loadBtn = document.getElementById('survivalLoadExample');
    expect(loadBtn).toBeTruthy();
    loadBtn.click();
    await waitForSurvivalOwner(tabId, () => (
      window.Components?.survival?.__getState?.()?.lastSummary?.series?.length || 0
    ) > 0);

    const hazardToggle = document.getElementById('survivalShowHazardRatios');
    const coxToggle = document.getElementById('survivalFitCox');
    expect(hazardToggle).toBeTruthy();
    expect(coxToggle).toBeTruthy();
    expect(hazardToggle.checked).toBe(false);
    expect(coxToggle.checked).toBe(false);

    hazardToggle.checked = true;
    coxToggle.checked = true;
    hazardToggle.dispatchEvent(new Event('change', { bubbles: true }));
    coxToggle.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForSurvivalOwner(tabId, () => {
      const controls = window.Components?.survival?.__getState?.()?.controls;
      return controls?.showHazardRatios === true && controls?.fitCoxModel === true;
    });

    await window.Components?.survival?.draw?.({
      tabId,
      reason: 'survival-stats-controls-selected'
    });
    const logRankPanel = document.getElementById('survivalStatsLogRank');
    expect(logRankPanel?.textContent).toMatch(/Calculate statistics/i);
    expect(window.Components?.survival?.getPayload?.()?.stats).toBeNull();
    const calculateButton = document.getElementById('survivalComputeStats');
    expect(calculateButton).toBeTruthy();
    expect(calculateButton.disabled).toBe(false);
    calculateButton.click();
    await waitForSurvivalOwner(tabId, () => {
      const stats = window.Components?.survival?.getPayload?.()?.stats;
      return stats?.flags?.statisticsCalculated === true && stats?.logRank?.available === true;
    });

    const hazardSection = document.getElementById('survivalStatsHazardRatios');
    const coxSection = document.getElementById('survivalStatsCox');
    expect(hazardSection).toBeTruthy();
    expect(coxSection).toBeTruthy();

    const payload = window.Components?.survival?.getPayload?.();
    expect(payload).toBeTruthy();
    expect(payload.config.showHazardRatios).toBe(true);
    expect(payload.config.fitCoxModel).toBe(true);
    expect(payload.stats?.logRank?.available).toBe(true);
    expect(payload.stats?.analysisSignature).toMatch(/^survival-stats-v2-/);
  }, 30000);

  test('a selected covariate enables and calculates a one-cohort Cox model', async () => {
    const tabId = await selectSurvivalGraph();
    const survival = window.Components.survival;
    const payload = survival.createEmptyPayload();
    const ages = [5, 8, 3, 9, 6, 4, 7, 1, 10, 2, 11, 6];
    payload.data = ages.map((age, index) => ['Cohort', index + 1, index % 4 === 3 ? 0 : 1, '', age]);
    payload.config.fitCoxModel = true;
    payload.config.showHazardRatios = false;
    payload.config.covariateSettings = { 4: { enabled: true, type: 'baseline' } };

    survival.loadFromPayload(payload, { tabId, skipDraw: true, source: 'single-cohort-cox-test' });
    await survival.draw({ tabId, force: true, reason: 'single-cohort-cox-test' });
    const calculateButton = document.getElementById('survivalComputeStats');
    expect(calculateButton?.disabled).toBe(false);

    calculateButton.click();
    await waitForSurvivalOwner(tabId, () => {
      const stats = survival.getPayload()?.stats;
      return stats?.coxModel?.available === true && stats?.flags?.statisticsCalculated === true;
    });
    expect(survival.getPayload()?.stats?.coxModel?.available).toBe(true);
    expect(survival.getPayload()?.stats?.flags?.statisticsCalculated).toBe(true);
  }, 30000);

  test('changing survival correction reuses raw pairwise results', async () => {
    const tabId = await selectSurvivalGraph();
    const survival = window.Components.survival;
    const payload = survival.createEmptyPayload();
    payload.data = [
      ...[4, 6, 8, 10, 12, 14].map(time => ['A', time, 1, '']),
      ...[2, 4, 6, 8, 10, 12].map(time => ['B', time, 1, '']),
      ...[1, 3, 5, 7, 9, 11].map(time => ['C', time, 1, ''])
    ];
    payload.config.pairwiseCorrection = 'bh';
    survival.loadFromPayload(payload, { tabId, skipDraw: true, source: 'survival-correction-reuse-test' });
    await survival.draw({ tabId, force: true, reason: 'survival-correction-reuse-test' });
    const calculateButton = document.getElementById('survivalComputeStats');
    expect(calculateButton).toBeTruthy();
    expect(calculateButton.disabled).toBe(false);
    calculateButton.click();
    await waitForSurvivalOwner(tabId, () => (
      survival.getPayload()?.stats?.pairwiseComparisons?.available === true
    ));
    const before = survival.getPayload()?.stats?.pairwiseComparisons;
    expect(before?.available).toBe(true);
    const rawPValues = before.rows.map(row => row.p);

    const correction = document.getElementById('survivalPairwiseCorrection');
    correction.value = 'holm';
    correction.dispatchEvent(new Event('change', { bubbles: true }));
    await waitForSurvivalOwner(tabId, () => {
      const comparisons = survival.getPayload()?.stats?.pairwiseComparisons;
      return comparisons?.available === true && comparisons?.correction?.key === 'holm';
    });
    const after = survival.getPayload()?.stats?.pairwiseComparisons;

    expect(after?.available).toBe(true);
    expect(after.rows.map(row => row.p)).toEqual(rawPValues);
    expect(after.correction?.key).toBe('holm');

    const session = survival.__testHooks.getSession(tabId);
    const currentStats = survival.getPayload()?.stats;
    const legacyStats = { ...currentStats, analysisSignature: survival.__testHooks.buildLegacyStatsAnalysisSignature() };
    session.results.stats = legacyStats;
    survival.__getState().lastStats = legacyStats;
    await survival.draw({ tabId, force: true, reason: 'survival-legacy-stat-signature-reuse' });
    expect(survival.getPayload()?.stats?.analysisSignature).toMatch(/^survival-stats-v2-/);
    expect(survival.getPayload()?.stats?.pairwiseComparisons?.available).toBe(true);
  }, 30000);


  test('passive cache hydration preserves the durable stats-panel model exactly', async () => {
    const tabId = await selectSurvivalGraph();

    document.getElementById('survivalLoadExample')?.click();
    await waitForSurvivalOwner(tabId, () => (
      window.Components?.survival?.__getState?.()?.lastSummary?.series?.length || 0
    ) > 0);
    await window.Components.survival.draw({ tabId, reason: 'survival-passive-cache-hydration-test' });

    const before = window.Components?.survival?.getPayload?.();
    expect(before?.config?.statsPanels).toBeTruthy();

    window.Components.survival.loadFromPayload(cloneForTest(before), {
      tabId: window.Main?.session?.getActiveTab?.()?.id || null,
      skipDraw: true,
      skipInitialDraw: true,
      restoreRenderCache: true,
      suppressStatsRecompute: true,
      passiveControls: true
    });

    const after = window.Components?.survival?.getPayload?.();
    expect(after?.config?.statsPanels).toStrictEqual(before.config.statsPanels);
    expect(after?.stats?.statsPanels).toStrictEqual(before.stats?.statsPanels);

    const runtime = window.Components.survival.captureRuntimeState({
      tabId,
      reason: 'survival-passive-stats-runtime-round-trip'
    });
    expect(runtime?.state?.statsPanelModels).toStrictEqual(before.config.statsPanels);
    expect(window.Components.survival.applyRuntimeState(cloneForTest(runtime), {
      tabId,
      reason: 'survival-passive-stats-runtime-round-trip-apply'
    })).toBe(true);
    const afterRuntime = window.Components?.survival?.getPayload?.();
    expect(afterRuntime?.config?.statsPanels).toStrictEqual(before.config.statsPanels);
    expect(afterRuntime?.stats?.statsPanels).toStrictEqual(before.stats?.statsPanels);
  }, 30000);

  test('axis labels are edited inline after removing the Labels panel controls', async () => {
    const tabId = await selectSurvivalGraph();

    document.getElementById('survivalLoadExample')?.click();
    await waitForSurvivalOwner(tabId, () => (
      window.Components?.survival?.__getState?.()?.lastSummary?.series?.length || 0
    ) > 0);
    await window.Components.survival.draw({ tabId, reason: 'survival-axis-label-edit-test' });

    const configLegends = Array.from(document.querySelectorAll('#survivalGraphPanel .config-panel legend'))
      .map(node => node.textContent.trim());
    expect(configLegends).not.toContain('Labels');
    expect(document.getElementById('survivalXLabel')).toBeNull();
    expect(document.getElementById('survivalYLabel')).toBeNull();

    const xAxisTitle = Array.from(document.querySelectorAll('#survivalPlot svg text'))
      .find(node => node.textContent === 'Time');
    expect(xAxisTitle).toBeTruthy();

    xAxisTitle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await waitForSurvivalOwner(tabId, () => !!document.querySelector('.inline-edit-input'));

    const editor = document.querySelector('.inline-edit-input');
    expect(editor).toBeTruthy();
    editor.value = 'Months';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));

    expect(document.querySelector('.inline-edit-input')).toBeNull();
    const payload = window.Components?.survival?.getPayload?.();
    expect(payload?.config?.xLabel).toBe('Months');
  }, 30000);

  test('number-at-risk counts and display defaults persist', async () => {
    const hooks = window.Components?.survival?.__testHooks;
    expect(typeof hooks?.atRiskCount).toBe('function');
    const group = {
      records: [
        { entry: 0, time: 10 },
        { entry: 5, time: 12 },
        { entry: 8, time: 8 }
      ]
    };
    expect(hooks.atRiskCount(group, 0)).toBe(1);
    expect(hooks.atRiskCount(group, 6)).toBe(2);
    expect(hooks.atRiskCount(group, 8)).toBe(3);
    expect(hooks.atRiskCount(group, 11)).toBe(1);
    expect(typeof hooks.cumulativeCensoredCount).toBe('function');
    const censorGroup = {
      records: [
        { entry: 0, time: 4, event: 0 },
        { entry: 0, time: 6, event: 1 },
        { entry: 5, time: 8, event: false },
        { entry: 7, time: 9, event: true }
      ]
    };
    expect(hooks.cumulativeCensoredCount(censorGroup, 3)).toBe(0);
    expect(hooks.cumulativeCensoredCount(censorGroup, 4)).toBe(1);
    expect(hooks.cumulativeCensoredCount(censorGroup, 8)).toBe(2);

    const tabId = await selectSurvivalGraph();
    document.getElementById('survivalLoadExample')?.click();
    await waitForSurvivalOwner(tabId, () => (
      window.Components?.survival?.__getState?.()?.lastSummary?.series?.length || 0
    ) > 0);
    await window.Components.survival.draw({ tabId, reason: 'test-risk-table-defaults' });
    const risk = document.getElementById('survivalShowRiskTable');
    const summary = document.getElementById('survivalShowPlotStats');
    const legend = document.getElementById('survivalShowLegend');
    expect(risk).toBeTruthy();
    expect(summary).toBeTruthy();
    expect(risk.checked).toBe(false);
    expect(legend?.checked).toBe(true);
    expect(window.Components.survival.createEmptyPayload().config.showLegend).toBe(true);
    risk.checked = false;
    summary.checked = true;
    risk.dispatchEvent(new Event('change', { bubbles: true }));
    summary.dispatchEvent(new Event('change', { bubbles: true }));
    const payload = window.Components.survival.getPayload();
    expect(payload.config.showRiskTable).toBe(false);
    expect(payload.config.showPlotStats).toBe(true);
  }, 30000);

  test('number-at-risk layout reserves auxiliary label width without changing plot width', () => {
    const resolveLabelWidth = window.Components?.survival?.__testHooks?.resolveRiskTableLabelWidth;
    expect(typeof resolveLabelWidth).toBe('function');
    const compact = resolveLabelWidth({
      fontSize: 12,
      groups: [{ name: 'A', records: Array.from({ length: 12 }, () => ({})) }]
    });
    const publicationTable = resolveLabelWidth({
      fontSize: 12,
      groups: [{ name: 'Maintenance chemotherapy with extended treatment cohort', records: Array.from({ length: 12 }, () => ({})) }]
    });
    expect(publicationTable).toBeGreaterThan(compact);
    expect(publicationTable).toBeGreaterThan(150);
  });

  test('legacy payloads and recovery snapshots do not acquire new figure annotations on restore', async () => {
    const tabId = await selectSurvivalGraph();
    document.getElementById('survivalLoadExample')?.click();
    await waitForSurvivalOwner(tabId, () => (
      window.Components?.survival?.__getState?.()?.lastSummary?.series?.length || 0
    ) > 0);
    const survival = window.Components.survival;

    const legacyPayload = JSON.parse(JSON.stringify(survival.getPayload()));
    delete legacyPayload.config.showHazardRatios;
    delete legacyPayload.config.fitCoxModel;
    delete legacyPayload.config.showRiskTable;
    delete legacyPayload.config.showPlotStats;
    delete legacyPayload.config.showLegend;
    survival.loadFromPayload(legacyPayload, {
      tabId,
      source: 'legacy-survival-display-controls-test',
      skipDraw: true,
      skipInitialDraw: true
    });
    await waitForSurvivalOwner(tabId, () => (
      document.getElementById('survivalShowHazardRatios')?.checked === true
      && document.getElementById('survivalFitCox')?.checked === true
    ));
    expect(document.getElementById('survivalShowRiskTable').checked).toBe(false);
    expect(document.getElementById('survivalShowPlotStats').checked).toBe(false);
    expect(document.getElementById('survivalShowHazardRatios').checked).toBe(true);
    expect(document.getElementById('survivalFitCox').checked).toBe(true);
    expect(document.getElementById('survivalShowLegend').checked).toBe(true);

    const legacySnapshot = JSON.parse(JSON.stringify(survival.captureRuntimeState({
      tabId,
      reason: 'legacy-survival-runtime-capture-test'
    })));
    expect(legacySnapshot?.state?.controls).toBeTruthy();
    delete legacySnapshot.state.controls.showRiskTable;
    delete legacySnapshot.state.controls.showPlotStats;
    delete legacySnapshot.state.controls.showHazardRatios;
    delete legacySnapshot.state.controls.fitCoxModel;
    delete legacySnapshot.state.controls.showLegend;
    expect(survival.applyRuntimeState(legacySnapshot, {
      tabId,
      reason: 'legacy-survival-runtime-apply-test'
    })).toBe(true);
    await waitForSurvivalOwner(tabId, () => (
      document.getElementById('survivalShowHazardRatios')?.checked === true
      && document.getElementById('survivalFitCox')?.checked === true
    ));
    expect(document.getElementById('survivalShowRiskTable').checked).toBe(false);
    expect(document.getElementById('survivalShowPlotStats').checked).toBe(false);
    expect(document.getElementById('survivalShowHazardRatios').checked).toBe(true);
    expect(document.getElementById('survivalFitCox').checked).toBe(true);
    expect(document.getElementById('survivalShowLegend').checked).toBe(true);
  }, 30000);

});
