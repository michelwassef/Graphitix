const { ensureJStatStub } = require('./helpers/jstatTestStub');

const originalDebug = console.debug;
const originalLog = console.log;

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

describe('Workspace tab grid defaults', () => {
  let restoreJStat;

  beforeEach(() => {
    jest.resetModules();
    restoreJStat = ensureJStatStub();
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

  test('New PCA tab resets to default grid dimensions after large dataset', async () => {
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
  }, 30000);

  test('Box stats controls reset when loading an empty payload', async () => {
    await activateWorkspace('box');
    const boxComponent = window.Components?.box;
    expect(boxComponent).toBeTruthy();
    const boxState = boxComponent.__getState();
    const hot = boxState?.hot;
    expect(hot?.loadData).toBeInstanceOf(Function);

    boxState.lastAxisLabels = ['Cond 1', 'Cond 2'];

    const emptyPayload = boxComponent.createEmptyPayload();
    boxComponent.loadFromPayload(emptyPayload);
    await flushAsyncWork();

    expect(boxState.lastAxisLabels.length).toBe(0);
  });

  test('ROC duplicate tab does not inherit runtime table container offsets from source tab', async () => {
    await activateWorkspace('roc');
    const loadBtn = document.getElementById('rocLoadExample');
    expect(loadBtn).not.toBeNull();
    loadBtn.click();
    await flushAsyncWork(12);

    const sourceTabId = window.Main.session.getActiveTab()?.id;
    expect(typeof sourceTabId).toBe('string');
    const rocPool = window.Shared?.hot?.__tabTablePools?.roc;
    expect(rocPool).toBeTruthy();
    const sourceEntry = rocPool.byTab?.[sourceTabId];
    expect(sourceEntry?.container).toBeTruthy();

    // Simulate runtime DOM mutations that previously leaked via duplicated roots.
    sourceEntry.container.style.paddingTop = '37px';
    sourceEntry.container.style.marginTop = '11px';
    const staleNode = document.createElement('div');
    staleNode.className = 'stale-grid-node';
    sourceEntry.container.appendChild(staleNode);

    window.Main.tabs.handleAddTabClick();
    await flushAsyncWork(6);
    await activateWorkspace('roc');
    const duplicateEmptyBtn = document.getElementById('duplicateEmpty');
    expect(duplicateEmptyBtn).not.toBeNull();
    duplicateEmptyBtn.click();
    await flushAsyncWork(20);

    const newTab = window.Main.session.getActiveTab();
    expect(newTab?.type).toBe('roc');
    expect(newTab?.id).not.toBe(sourceTabId);

    const newEntry = rocPool.byTab?.[newTab.id];
    expect(newEntry?.container).toBeTruthy();
    expect(newEntry.container.style.paddingTop).toBe('');
    expect(newEntry.container.style.marginTop).toBe('');
    expect(newEntry.container.querySelector('.stale-grid-node')).toBeNull();
  }, 30000);
});
