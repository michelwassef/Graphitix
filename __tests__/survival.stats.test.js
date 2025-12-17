const originalDebug = console.debug;
const originalLog = console.log;

async function flushAsyncWork(iterations = 25) {
  for (let i = 0; i < iterations; i += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('Survival statistics pipeline', () => {
  beforeEach(() => {
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
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
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
    const graphSelection = window.Main?.tabs?.handleGraphSelection;
    expect(typeof graphSelection).toBe('function');
    graphSelection('survival');

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
  });
});
