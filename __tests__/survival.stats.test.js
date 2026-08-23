const originalDebug = console.debug;
const originalLog = console.log;

async function flushAsyncWork(iterations = 25) {
  for (let i = 0; i < iterations; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function selectSurvivalGraph() {
  const graphSelection = window.Main?.tabs?.handleGraphSelection;
  expect(typeof graphSelection).toBe('function');
  const maybe = graphSelection('survival', { reason: 'survival-stats-test-selection' });
  if (maybe && typeof maybe.then === 'function') {
    await maybe;
  }
  await flushAsyncWork();
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
    require('../js/shared/exampleDatasets.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLifecycle.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/shared/uniprot.js');
    require('../js/shared/goAnalysis.js');
    require('../js/shared/stringAnalysis.js');
    require('../js/components/survival.js');
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

  test('Hazard ratios and Cox model stats render and persist', async () => {
    await selectSurvivalGraph();

    const loadBtn = document.getElementById('survivalLoadExample');
    expect(loadBtn).toBeTruthy();
    loadBtn.click();
    await flushAsyncWork();

    const hazardToggle = document.getElementById('survivalShowHazardRatios');
    const coxToggle = document.getElementById('survivalFitCox');
    expect(hazardToggle).toBeTruthy();
    expect(coxToggle).toBeTruthy();

    hazardToggle.checked = true;
    coxToggle.checked = true;
    hazardToggle.dispatchEvent(new Event('change', { bubbles: true }));
    coxToggle.dispatchEvent(new Event('change', { bubbles: true }));

    window.Components?.survival?.draw?.();
    await flushAsyncWork(200);

    const hazardSection = document.getElementById('survivalStatsHazardRatios');
    const coxSection = document.getElementById('survivalStatsCox');
    expect(hazardSection).toBeTruthy();
    expect(coxSection).toBeTruthy();

    const payload = window.Components?.survival?.getPayload?.();
    expect(payload).toBeTruthy();
    expect(payload.config.showHazardRatios).toBe(true);
    expect(payload.config.fitCoxModel).toBe(true);
    await flushAsyncWork();
  }, 30000);


  test('passive cache hydration preserves the durable stats-panel model exactly', async () => {
    await selectSurvivalGraph();

    document.getElementById('survivalLoadExample')?.click();
    await flushAsyncWork();
    window.Components?.survival?.draw?.();
    await flushAsyncWork(200);

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

    const tabId = window.Main?.session?.getActiveTab?.()?.id || null;
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
    await selectSurvivalGraph();

    document.getElementById('survivalLoadExample')?.click();
    await flushAsyncWork();
    window.Components?.survival?.draw?.();
    await flushAsyncWork();

    const configLegends = Array.from(document.querySelectorAll('#survivalGraphPanel .config-panel legend'))
      .map(node => node.textContent.trim());
    expect(configLegends).not.toContain('Labels');
    expect(document.getElementById('survivalXLabel')).toBeNull();
    expect(document.getElementById('survivalYLabel')).toBeNull();

    const xAxisTitle = Array.from(document.querySelectorAll('#survivalPlot svg text'))
      .find(node => node.textContent === 'Time');
    expect(xAxisTitle).toBeTruthy();

    xAxisTitle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flushAsyncWork();

    const editor = document.querySelector('.inline-edit-input');
    expect(editor).toBeTruthy();
    editor.value = 'Months';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await flushAsyncWork();

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

    await selectSurvivalGraph();
    document.getElementById('survivalLoadExample')?.click();
    await flushAsyncWork();
    await window.Components.survival.draw({ reason: 'test-risk-table-defaults' });
    await flushAsyncWork();
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
    await selectSurvivalGraph();
    document.getElementById('survivalLoadExample')?.click();
    await flushAsyncWork();
    const survival = window.Components.survival;
    const tabId = window.Main?.tabs?.getActiveTab?.()?.id || null;

    const legacyPayload = JSON.parse(JSON.stringify(survival.getPayload()));
    delete legacyPayload.config.showRiskTable;
    delete legacyPayload.config.showPlotStats;
    delete legacyPayload.config.showLegend;
    survival.loadFromPayload(legacyPayload, {
      tabId,
      source: 'legacy-survival-display-controls-test',
      skipDraw: true,
      skipInitialDraw: true
    });
    await flushAsyncWork();
    expect(document.getElementById('survivalShowRiskTable').checked).toBe(false);
    expect(document.getElementById('survivalShowPlotStats').checked).toBe(false);
    expect(document.getElementById('survivalShowLegend').checked).toBe(true);

    const legacySnapshot = JSON.parse(JSON.stringify(survival.captureRuntimeState({
      tabId,
      reason: 'legacy-survival-runtime-capture-test'
    })));
    expect(legacySnapshot?.state?.controls).toBeTruthy();
    delete legacySnapshot.state.controls.showRiskTable;
    delete legacySnapshot.state.controls.showPlotStats;
    delete legacySnapshot.state.controls.showLegend;
    expect(survival.applyRuntimeState(legacySnapshot, {
      tabId,
      reason: 'legacy-survival-runtime-apply-test'
    })).toBe(true);
    await flushAsyncWork();
    expect(document.getElementById('survivalShowRiskTable').checked).toBe(false);
    expect(document.getElementById('survivalShowPlotStats').checked).toBe(false);
    expect(document.getElementById('survivalShowLegend').checked).toBe(true);
  }, 30000);

});
