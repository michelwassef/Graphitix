const { createPcaViewTestContext } = require('../../test-support/pcaViewTestSuite');

jest.setTimeout(30000);

describe('PCA view controls — redraw and render cache', () => {
  const {
    flushAll,
    flushUntil,
    activateWorkspace,
  } = createPcaViewTestContext();

  test('PCA render cache restore restores scree visibility state', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const component = window.Components?.pca;
    expect(component).toBeTruthy();
    const state = component.__state;
    expect(state).toBeTruthy();
    await flushUntil(() => !!state.cachedRender, { limit: 80, step: 2 });
    const cachedBefore = state.cachedRender;
    expect(cachedBefore).toBeTruthy();
    const screeContainer = document.getElementById('pcaScreeContainer');
    const screeExportControls = document.getElementById('pcaScreeExportControls');
    const screeVarianceRow = document.getElementById('pcaScreeVarianceRow');
    expect(screeContainer).toBeTruthy();
    expect(screeExportControls).toBeTruthy();
    expect(screeVarianceRow).toBeTruthy();

    const cache = component.captureRenderCache();
    expect(cache).toBeTruthy();
    expect(cache.runtimeCache).toBeTruthy();

    screeContainer.hidden = true;
    screeContainer.style.maxWidth = '';
    screeExportControls.hidden = true;
    screeVarianceRow.hidden = true;
    state.cachedRender = null;
    state.dataDirty = true;
    state.viewDirty = true;
    state.resizeWarmupPending = true;

    const restored = component.restoreRenderCache(cache);
    expect(restored).toBe(true);
    expect(screeContainer.hidden).toBe(false);
    expect(screeContainer.querySelector('svg')).toBeTruthy();
    expect(screeExportControls.hidden).toBe(false);
    expect(screeVarianceRow.hidden).toBe(false);
    expect(state.cachedRender).toBeTruthy();
    expect(state.cachedRender).not.toBe(cachedBefore);
    expect(Array.isArray(state.cachedRender.points)).toBe(true);
    expect(state.cachedRender.points.length).toBe(cachedBefore.points.length);
    expect(state.dataDirty).toBe(false);
    expect(state.viewDirty).toBe(false);
    expect(state.resizeWarmupPending).toBe(false);
  }, 180000);

  test('a stale PCA font event with no owner session cannot dirty the active sibling', async () => {
    const pca = window.Components.pca;
    const main = window.Main;
    document.getElementById('pcaLoadExample').click();
    await flushUntil(() => !!pca.__state?.cachedRender, { limit: 80, step: 2 });
    const tabA = main.session.getActiveTab();

    const addResult = main.tabs.handleAddTabClick();
    if (addResult && typeof addResult.then === 'function') await addResult;
    await flushAll(2);
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if (duplicatePrompt && !duplicatePrompt.hidden) {
      document.getElementById('duplicateEmpty').click();
    }
    await flushAll(3);
    await activateWorkspace('pca');
    const tabB = main.session.getActiveTab();
    expect(tabB).toMatchObject({ type: 'pca' });
    expect(tabB?.id).not.toBe(tabA?.id);
    const activation = main.tabs.activateTab(tabB.id, { reason: 'pca-stale-font-event-switch' });
    if (activation && typeof activation.then === 'function') await activation;
    await flushUntil(() => main.session.getActiveTab()?.id === tabB.id, { limit: 80, step: 2 });

    const sessionB = pca.__testHooks.getSession(tabB.id);
    expect(sessionB).toBeTruthy();
    await flushUntil(() => Number(sessionB.timers.drawRuntime?.inFlight) === 0, { limit: 80, step: 2 });
    expect(sessionB.cache.renderRuntime.viewDirty).toBe(false);

    const payloadBBefore = JSON.stringify(tabB.payload);
    const pendingOptionsBefore = JSON.stringify(sessionB.timers.drawRuntime.pendingDrawOptions);
    const staleTabId = 'pca-stale-font-owner-that-has-no-session';
    window.document.dispatchEvent(new CustomEvent('fontControls:styleChanged', {
      detail: {
        scopeId: 'pca',
        key: '__labels__',
        storeKey: `pca::tabbed::${staleTabId}::__labels__`,
        tabId: staleTabId
      }
    }));

    expect(sessionB.cache.renderRuntime.viewDirty).toBe(false);
    expect(JSON.stringify(sessionB.timers.drawRuntime.pendingDrawOptions)).toBe(pendingOptionsBefore);
    expect(JSON.stringify(tabB.payload)).toBe(payloadBBefore);
  }, 180000);

  test('PCA render cache restore rehydrates component selectors from owner analysis metadata', async () => {
    document.getElementById('pcaLoadExample').click();
    await flushUntil(() => !!window.Components?.pca?.__state?.cachedRender, { limit: 80, step: 2 });

    const component = window.Components?.pca;
    const xAxis = document.getElementById('pcaXAxis');
    const yAxis = document.getElementById('pcaYAxis');
    expect(component).toBeTruthy();
    expect(xAxis).toBeTruthy();
    expect(yAxis).toBeTruthy();

    xAxis.value = '2';
    xAxis.dispatchEvent(new Event('change', { bubbles: true }));
    yAxis.value = '3';
    yAxis.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(12);

    const ownerSession = component.__testHooks.getSession();
    expect(ownerSession?.state?.state?.axisSelection).toEqual({ x: 2, y: 3, z: 1 });
    const cache = component.captureRenderCache();
    expect(cache?.runtimeCache?.dimensionMeta?.length).toBeGreaterThanOrEqual(3);

    xAxis.innerHTML = '<option value="1">PC1</option>';
    yAxis.innerHTML = '<option value="2">PC2</option>';
    xAxis.disabled = true;
    yAxis.disabled = true;
    xAxis.value = '1';
    yAxis.value = '2';

    expect(component.restoreRenderCache(cache)).toBe(true);
    expect(xAxis.disabled).toBe(false);
    expect(yAxis.disabled).toBe(false);
    expect(xAxis.options.length).toBeGreaterThanOrEqual(3);
    expect(yAxis.options.length).toBeGreaterThanOrEqual(3);
    expect(xAxis.value).toBe('2');
    expect(yAxis.value).toBe('3');
    expect(ownerSession?.state?.state?.axisSelection).toEqual({ x: 2, y: 3, z: 1 });
  }, 180000);

  test('a stale PCA draw cannot mark changed owner data clean after a tab switch', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    exampleBtn.click();
    const pca = window.Components?.pca;
    await flushUntil(() => !!pca?.__state?.cachedRender, { limit: 80, step: 2 });

    const main = window.Main;
    const tabA = main.session.getActiveTab();
    const sessionA = pca.__testHooks.getSession(tabA.id);
    const hot = pca.getHotInstance();
    expect(sessionA?.cache?.renderRuntime?.dataDirty).toBe(false);
    expect(hot?.getDataAtCell).toBeTruthy();

    const shared = window.Shared;
    const previousLazySvd = shared.lazySvd;
    const originalWindowSvd = Object.getOwnPropertyDescriptor(window, 'SVDJS');
    const originalGlobalSvd = Object.getOwnPropertyDescriptor(globalThis, 'SVDJS');
    let resolveLazySvd;
    let lazySvdStarted = false;
    shared.lazySvd = () => {
      lazySvdStarted = true;
      return new Promise(resolve => { resolveLazySvd = resolve; });
    };
    window.SVDJS = undefined;
    globalThis.SVDJS = undefined;

    try {
      const currentValue = Number(hot.getDataAtCell(1, 1)) || 0;
      hot.setDataAtCell(1, 1, String(currentValue + 100));
      await flushUntil(() => lazySvdStarted, { limit: 80, step: 2 });
      expect(sessionA.cache.renderRuntime.dataDirty).toBe(true);
      expect(sessionA.timers.drawRuntime.inFlight).toBeGreaterThan(0);
      const tokenBeforeSwitch = sessionA.timers.drawRuntime.token;

      const addResult = main.tabs.handleAddTabClick();
      if (addResult && typeof addResult.then === 'function') await addResult;
      await flushAll(2);
      const duplicatePrompt = document.getElementById('duplicatePrompt');
      if (duplicatePrompt && !duplicatePrompt.hidden) {
        document.getElementById('duplicateEmpty').click();
      }
      await flushAll(3);
      const tabB = main.session.getActiveTab();
      expect(tabB?.id).not.toBe(tabA.id);

      const activateResult = main.tabs.activateTab(tabB.id, { reason: 'pca-stale-draw-switch' });
      if (activateResult && typeof activateResult.then === 'function') await activateResult;
      await flushAll(3);
      expect(main.session.getActiveTab()?.id).toBe(tabB.id);
      expect(sessionA.timers.drawRuntime.token).toBeGreaterThan(tokenBeforeSwitch);

      window.SVDJS = originalWindowSvd?.value;
      globalThis.SVDJS = originalGlobalSvd?.value;
      resolveLazySvd(originalWindowSvd?.value || originalGlobalSvd?.value);
      await flushUntil(() => Number(sessionA.timers.drawRuntime.inFlight) === 0, { limit: 80, step: 2 });

      expect(sessionA.cache.renderRuntime.dataDirty).toBe(true);
    } finally {
      if (resolveLazySvd) resolveLazySvd(originalWindowSvd?.value || originalGlobalSvd?.value);
      if (originalWindowSvd) Object.defineProperty(window, 'SVDJS', originalWindowSvd);
      else delete window.SVDJS;
      if (originalGlobalSvd) Object.defineProperty(globalThis, 'SVDJS', originalGlobalSvd);
      else delete globalThis.SVDJS;
      shared.lazySvd = previousLazySvd;
    }
  }, 180000);

  test('a cancelled PCA view redraw keeps its owner view dirty after a tab switch', async () => {
    document.getElementById('pcaLoadExample').click();
    const pca = window.Components?.pca;
    await flushUntil(() => !!pca?.__state?.cachedRender, { limit: 80, step: 2 });

    const main = window.Main;
    const tabA = main.session.getActiveTab();
    const sessionA = pca.__testHooks.getSession(tabA.id);
    const showGrid = document.getElementById('pcaShowGrid');
    expect(showGrid).toBeTruthy();
    expect(sessionA.cache.renderRuntime.viewDirty).toBe(false);

    const shared = window.Shared;
    const previousLazySvd = shared.lazySvd;
    const originalWindowSvd = Object.getOwnPropertyDescriptor(window, 'SVDJS');
    const originalGlobalSvd = Object.getOwnPropertyDescriptor(globalThis, 'SVDJS');
    let resolveLazySvd;
    let lazySvdStarted = false;
    shared.lazySvd = () => {
      lazySvdStarted = true;
      return new Promise(resolve => { resolveLazySvd = resolve; });
    };
    window.SVDJS = undefined;
    globalThis.SVDJS = undefined;

    try {
      showGrid.checked = !showGrid.checked;
      showGrid.dispatchEvent(new Event('change', { bubbles: true }));
      await flushUntil(() => lazySvdStarted, { limit: 80, step: 2 });
      expect(sessionA.cache.renderRuntime.viewDirty).toBe(true);
      expect(sessionA.timers.drawRuntime.inFlight).toBeGreaterThan(0);
      const tokenBeforeSwitch = sessionA.timers.drawRuntime.token;

      const addResult = main.tabs.handleAddTabClick();
      if (addResult && typeof addResult.then === 'function') await addResult;
      await flushAll(2);
      const duplicatePrompt = document.getElementById('duplicatePrompt');
      if (duplicatePrompt && !duplicatePrompt.hidden) {
        document.getElementById('duplicateEmpty').click();
      }
      await flushAll(3);
      const tabB = main.session.getActiveTab();
      expect(tabB?.id).not.toBe(tabA.id);

      const activateResult = main.tabs.activateTab(tabB.id, { reason: 'pca-stale-view-draw-switch' });
      if (activateResult && typeof activateResult.then === 'function') await activateResult;
      await flushAll(3);
      expect(main.session.getActiveTab()?.id).toBe(tabB.id);
      expect(sessionA.timers.drawRuntime.token).toBeGreaterThan(tokenBeforeSwitch);

      window.SVDJS = originalWindowSvd?.value;
      globalThis.SVDJS = originalGlobalSvd?.value;
      resolveLazySvd(originalWindowSvd?.value || originalGlobalSvd?.value);
      await flushUntil(() => Number(sessionA.timers.drawRuntime.inFlight) === 0, { limit: 80, step: 2 });

      expect(sessionA.cache.renderRuntime.viewDirty).toBe(true);
      shared.lazySvd = previousLazySvd;
      const expectedGridVisibility = showGrid.checked;
      const reactivateResult = main.tabs.activateTab(tabA.id, { reason: 'pca-cancelled-view-draw-recovery' });
      let activationError = null;
      if (reactivateResult && typeof reactivateResult.then === 'function') {
        reactivateResult.catch(error => { activationError = error; });
      }
      await flushAll(3);
      expect(activationError).toBeNull();
      await flushUntil(() => main.session.getActiveTab()?.id === tabA.id
        && sessionA.cache.renderRuntime.viewDirty === false
        && Number(sessionA.timers.drawRuntime.inFlight) === 0, { limit: 80, step: 2 });

      expect(showGrid.checked).toBe(expectedGridVisibility);
      expect(!!document.querySelector('#pcaPlot #pcaSvg [data-grid-control="1"]')).toBe(expectedGridVisibility);
    } finally {
      if (resolveLazySvd) resolveLazySvd(originalWindowSvd?.value || originalGlobalSvd?.value);
      if (originalWindowSvd) Object.defineProperty(window, 'SVDJS', originalWindowSvd);
      else delete window.SVDJS;
      if (originalGlobalSvd) Object.defineProperty(globalThis, 'SVDJS', originalGlobalSvd);
      else delete globalThis.SVDJS;
      shared.lazySvd = previousLazySvd;
    }
  }, 180000);

  test('user control refresh routes through the view-refresh suppression contract as userInitiated', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);

    const state = window.Components?.pca?.__state;
    expect(state).toBeTruthy();
    await flushUntil(() => !!state.cachedRender, { limit: 80, step: 2 });

    // Reproduce the reopen window: stand in a real componentLifecycle so requestPcaViewRefresh
    // performs its suppression check. Pre-fix, the resize/style refresh path did not consult
    // shouldSuppressDraw at all (source 'pca-view-refresh' never appeared), so the post-restore
    // guard in the tab-scoped scheduler dropped the first user resize after reopen.
    const calls = [];
    const previousLifecycle = window.Shared.componentLifecycle;
    window.Shared.componentLifecycle = Object.assign({}, previousLifecycle, {
      shouldSuppressDraw: (componentKey, meta) => {
        calls.push({ componentKey, meta: meta || {} });
        return false;
      },
      emitLifecycleEvent: () => {}
    });
    try {
      const legendToggle = document.getElementById('pcaShowLegend');
      expect(legendToggle).toBeTruthy();
      legendToggle.checked = !legendToggle.checked;
      legendToggle.dispatchEvent(new Event('change', { bubbles: true }));
      await flushAll(5);

      const refreshCall = calls.find(
        entry => entry.componentKey === 'pca' && entry.meta.source === 'pca-view-refresh'
      );
      expect(refreshCall).toBeTruthy();
      expect(refreshCall.meta.reason).toBe('legend-toggle');
      expect(refreshCall.meta.userInitiated).toBe(true);
    } finally {
      window.Shared.componentLifecycle = previousLifecycle;
    }
  }, 180000);

  test('large PCA dataset keeps automatic redraw active with no legacy manual controls', async () => {
    const fs = require('fs');
    const path = require('path');
    const csvPath = path.join(__dirname, '../fixtures/pca/v1/test-PCA.csv');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const rows = csvText
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0)
      .map(line => line.split(','));

    const hot = window.Components?.pca?.getHotInstance?.();
    expect(hot).toBeTruthy();

    hot.loadData(rows);
    await flushAll(200);

    const liveToggle = document.getElementById('pcaLiveUpdate');
    const renderButton = document.getElementById('pcaRenderButton');
    const notice = document.getElementById('pcaAutoDrawNotice');
    const state = window.Components?.pca?.__state;

    expect(liveToggle).toBeNull();
    expect(renderButton).toBeNull();
    expect(notice).toBeNull();
    expect(state).toBeTruthy();
    expect(hot.getData().length).toBeGreaterThan(5000);
    expect(state.lastDataShape?.rows).toBeGreaterThan(5000);
    expect(state.lastDataShape?.cols).toBeGreaterThan(0);
    if(state.lastAutoDrawEvaluation){
      expect(state.lastAutoDrawEvaluation.totalRows).toBeGreaterThan(0);
      expect(state.lastAutoDrawEvaluation.totalRows).toBeGreaterThan(5000);
    }
    if(Object.prototype.hasOwnProperty.call(state, 'autoDrawLockedByThreshold')){
      expect(state.autoDrawLockedByThreshold).toBe(false);
    }
    if(Object.prototype.hasOwnProperty.call(state, 'autoDrawEnabled')){
      expect(state.autoDrawEnabled).toBe(true);
    }
    expect(state.performance).toBeTruthy();
    expect(state.performance.loadData).toBeTruthy();
    expect(state.performance.loadData.rows).toBeGreaterThan(5000);
    expect(state.performance.loadData.cols).toBeGreaterThan(0);
    expect(state.performance.loadData.totalMs).toBeGreaterThanOrEqual(0);
    expect(state.performance.evaluation).toBeTruthy();
    expect(state.performance.evaluation.rows).toBeGreaterThan(5000);
    expect(state.performance.evaluation.totalMs).toBeGreaterThanOrEqual(0);
    let guard = 0;
    while(!state.performance.draw && guard < 10){
      await flushAll(10);
      guard += 1;
    }
    const initialDrawPerf = state.performance.draw;
    const initialDrawTimestamp = initialDrawPerf?.timestamp || 0;
    const initialDrawTotal = initialDrawPerf?.totalMs || 0;
    if(initialDrawPerf){
      expect(initialDrawPerf.loadingsTruncated).toBe(true);
      expect(initialDrawPerf.loadingsRendered).toBeGreaterThan(0);
      expect(initialDrawPerf.loadingsRendered).toBeLessThan(initialDrawPerf.loadingsTotal);
    }

    const initialSvd = global.__svdCallCount;
    const labelTimestamp = state.performance?.draw?.timestamp || 0;
    const currentLabel = hot.getDataAtCell(0, 1);
    const nextLabel = !([true, 1, '1', 'true', 'yes', 'on'].includes(
      typeof currentLabel === 'string' ? currentLabel.trim().toLowerCase() : currentLabel
    ));
    hot.setDataAtCell([[0, 1, nextLabel]], 'pca-point-label-toggle');
    await flushUntil(() => (state.performance?.draw?.timestamp || 0) > labelTimestamp, { limit: 80, step: 2 });

    expect(global.__svdCallCount).toBe(initialSvd);
    expect(state.performance?.draw?.viewOnly).toBe(true);
    expect(state.performance?.draw?.cacheReused).toBe(true);
    expect(state.performance?.draw?.computeMs).toBeLessThan(15);

    const originalValue = rows[1]?.[1] || '0';
    const replacement = originalValue === '0' ? '1' : '0';
    hot.setDataAtCell(1, 1, replacement);
    await flushAll(60);

    const updatedDrawPerf = state.performance?.draw;
    expect(updatedDrawPerf).toBeTruthy();
    expect((updatedDrawPerf?.timestamp || 0)).toBeGreaterThanOrEqual(initialDrawTimestamp);
    expect((updatedDrawPerf?.totalMs || 0)).toBeGreaterThanOrEqual(initialDrawTotal);
    if(Object.prototype.hasOwnProperty.call(state, 'drawPending')){
      expect(state.drawPending).toBe(false);
    }
    expect(updatedDrawPerf.samples).toBeGreaterThan(0);
    expect(updatedDrawPerf.features).toBeGreaterThan(5000);
    expect(updatedDrawPerf.totalMs).toBeGreaterThanOrEqual(0);
    expect(updatedDrawPerf.fastMode).toBe(false);
    expect(updatedDrawPerf.loadingsTruncated).toBe(true);
    expect(updatedDrawPerf.loadingsRendered).toBeLessThan(updatedDrawPerf.loadingsTotal);
    expect(updatedDrawPerf.renderMs).toBeLessThan(1500);
  }, 180000);

  test('automatic redraw stays enabled when switching from large to small PCA datasets in one tab', async () => {
    const fs = require('fs');
    const path = require('path');
    const csvPath = path.join(__dirname, '../fixtures/pca/v1/test-PCA.csv');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const rows = csvText
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0)
      .map(line => line.split(','));

    const hot = window.Components?.pca?.getHotInstance?.();
    expect(hot).toBeTruthy();

    hot.loadData(rows);
    await flushAll(200);

    const liveToggle = document.getElementById('pcaLiveUpdate');
    const renderButton = document.getElementById('pcaRenderButton');
    const notice = document.getElementById('pcaAutoDrawNotice');
    const state = window.Components?.pca?.__state;

    expect(liveToggle).toBeNull();
    expect(renderButton).toBeNull();
    expect(notice).toBeNull();
    expect(state).toBeTruthy();

    await flushAll(20);
    const heavyRows = state.lastAutoDrawEvaluation?.totalRows || state.lastDataShape?.rows || rows.length;
    const heavyCols = state.lastAutoDrawEvaluation?.totalCols || state.lastDataShape?.cols || (rows[0]?.length || 0);
    const smallData = Array.from({ length: 10 }, (_, rowIdx) =>
      Array.from({ length: 5 }, (_, colIdx) => (rowIdx === 0 ? `V${colIdx + 1}` : `${rowIdx}.${colIdx}`))
    );
    expect(smallData.length).toBe(10);
    expect(smallData[0].length).toBe(5);
    const smallCols = smallData[0].length;
    hot.loadData(smallData);
    await flushAll(40);
    await flushAll(30);

    if(state.lastAutoDrawEvaluation){
      expect(state.lastAutoDrawEvaluation.thresholdExceeded).toBe(false);
    }
    expect(state.lastDataShape?.rows).toBeLessThanOrEqual(heavyRows);
    expect(state.lastDataShape?.cols).toBeLessThanOrEqual(Math.max(heavyCols, smallCols));
  }, 180000);

  test('stale threshold lock clears after switching back to small PCA data', async () => {
    const fs = require('fs');
    const path = require('path');
    const csvPath = path.join(__dirname, '../fixtures/pca/v1/test-PCA.csv');
    const csvText = fs.readFileSync(csvPath, 'utf8');
    const rows = csvText

      .split(/\r?\n/)
      .filter(line => line.trim().length > 0)
      .map(line => line.split(','));

    const hot = window.Components?.pca?.getHotInstance?.();
    expect(hot).toBeTruthy();

    hot.loadData(rows);
    await flushAll(200);

    const liveToggle = document.getElementById('pcaLiveUpdate');
    const renderButton = document.getElementById('pcaRenderButton');
    const notice = document.getElementById('pcaAutoDrawNotice');
    const state = window.Components?.pca?.__state;

    expect(liveToggle).toBeNull();
    expect(renderButton).toBeNull();
    expect(notice).toBeNull();
    expect(state).toBeTruthy();

    await flushAll(20);
    const heavyRows = state.lastAutoDrawEvaluation?.totalRows || state.lastDataShape?.rows || rows.length;
    const heavyCols = state.lastAutoDrawEvaluation?.totalCols || state.lastDataShape?.cols || (rows[0]?.length || 0);

    const smallData = Array.from({ length: 10 }, (_, rowIdx) =>
      Array.from({ length: 5 }, (_, colIdx) => (rowIdx === 0 ? `V${colIdx + 1}` : `${rowIdx}.${colIdx}`))
    );
    const smallCols = smallData[0].length;
    hot.loadData(smallData);
    await flushAll(40);

    state.autoDrawLockedByThreshold = true;
    state.autoDrawEnabled = false;
    state.autoDrawReason = { type: 'threshold', rows: heavyRows, cols: heavyCols };
    state.lastDataShape = { rows: heavyRows, cols: heavyCols };
    state.scheduleDraw({ reason: 'stale-threshold' });
    await flushAll(30);

    if(state.lastAutoDrawEvaluation){
      expect(state.lastAutoDrawEvaluation.thresholdExceeded).toBe(false);
    }
    expect(state.lastDataShape?.rows).toBeLessThanOrEqual(heavyRows);
    expect(state.lastDataShape?.cols).toBeLessThanOrEqual(Math.max(heavyCols, smallCols));
  }, 180000);

  test('MDS caches three coordinates so 2D and 3D switches reuse one analysis', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    const methodSelect = document.getElementById('pcaMethod');
    const viewSelect = document.getElementById('pcaViewMode');
    const state = window.Components?.pca?.__state;
    expect(exampleBtn).toBeTruthy();
    expect(methodSelect).toBeTruthy();
    expect(viewSelect).toBeTruthy();
    expect(state).toBeTruthy();

    exampleBtn.click();
    await flushUntil(() => !!state.cachedRender, { limit: 80, step: 2 });

    viewSelect.value = '2d';
    methodSelect.value = 'mds';
    methodSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushUntil(() => {
      const svg = document.querySelector('#pcaPlot #pcaSvg');
      return state.cachedRender?.method === 'mds'
        && state.cachedRender?.points3d?.length > 0
        && state.cachedRender?.dimensionMeta?.length >= 3
        && svg?.dataset?.viewMode === '2d';
    }, { limit: 120, step: 2 });

    const mdsCache = state.cachedRender;
    const mdsSvdCalls = global.__svdCallCount;
    expect(mdsSvdCalls).toBeGreaterThan(0);
    expect(mdsCache.statsSnapshot?.dimensions).toBeGreaterThanOrEqual(3);

    let lastDrawTimestamp = state.performance?.draw?.timestamp || 0;
    viewSelect.value = '3d';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushUntil(() => {
      const svg = document.querySelector('#pcaPlot #pcaSvg');
      return (state.performance?.draw?.timestamp || 0) > lastDrawTimestamp
        && svg?.dataset?.viewMode === '3d';
    }, { limit: 120, step: 2 });

    expect(global.__svdCallCount).toBe(mdsSvdCalls);
    expect(state.cachedRender).toBe(mdsCache);
    expect(state.performance?.draw?.viewOnly).toBe(true);
    expect(state.performance?.draw?.cacheReused).toBe(true);
    expect(state.performance?.draw?.reason).toBe('view-mode-change');

    lastDrawTimestamp = state.performance?.draw?.timestamp || 0;
    viewSelect.value = '2d';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushUntil(() => {
      const svg = document.querySelector('#pcaPlot #pcaSvg');
      return (state.performance?.draw?.timestamp || 0) > lastDrawTimestamp
        && svg?.dataset?.viewMode === '2d';
    }, { limit: 120, step: 2 });

    expect(global.__svdCallCount).toBe(mdsSvdCalls);
    expect(state.cachedRender).toBe(mdsCache);
    expect(state.performance?.draw?.viewOnly).toBe(true);
    expect(state.performance?.draw?.cacheReused).toBe(true);
  });

  test('3D render cache restore rebuilds the owner renderer before controls', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushUntil(() => !!window.Components?.pca?.__state?.cachedRender, { limit: 80, step: 2 });

    const component = window.Components?.pca;
    const viewSelect = document.getElementById('pcaViewMode');
    expect(component).toBeTruthy();
    expect(viewSelect).toBeTruthy();

    viewSelect.value = '3d';
    viewSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushUntil(() => {
      const svg = document.querySelector('#pcaPlot #pcaSvg');
      const tabId = window.Main?.session?.getActiveTab?.()?.id || null;
      const session = component.__testHooks?.getSession?.(tabId) || null;
      return svg?.dataset?.viewMode === '3d'
        && svg.dataset?.rotationControlsAttached === 'true'
        && session?.refs?.svg === svg
        && typeof session?.refs?.rotationRenderer === 'function';
    }, { limit: 100, step: 2 });

    const tabId = window.Main?.session?.getActiveTab?.()?.id || null;
    const session = component.__testHooks?.getSession?.(tabId) || null;
    const originalSvg = document.querySelector('#pcaPlot #pcaSvg');
    const originalRenderer = session?.refs?.rotationRenderer;
    expect(session).toBeTruthy();
    expect(originalSvg).toBeTruthy();
    expect(typeof originalRenderer).toBe('function');

    const cache = component.captureRenderCache();
    expect(cache).toBeTruthy();
    expect(cache.rotationModel).toEqual(expect.objectContaining({
      version: window.Shared.plot3d.FRAME_LAYOUT_VERSION,
      method: expect.any(String),
      axisIndices: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }),
      points: expect.any(Array)
    }));
    expect(cache.rotationModel.points.length).toBeGreaterThan(0);
    expect(() => JSON.stringify(cache.rotationModel)).not.toThrow();
    expect(component.restoreRenderCache({ ...cache, rotationModel: { ...cache.rotationModel, version: 1 } })).toBe(false);
    expect(document.querySelector('#pcaPlot #pcaSvg')).toBe(originalSvg);

    session.refs.rotationRenderer = null;
    delete session.cache.pca3dRotationModel;
    const legacyRotationModel = { ...cache.rotationModel };
    delete legacyRotationModel.method;
    delete legacyRotationModel.axisIndices;

    expect(component.restoreRenderCache({ ...cache, rotationModel: legacyRotationModel })).toBe(true);
    const restoredSvg = document.querySelector('#pcaPlot #pcaSvg');
    expect(restoredSvg).toBeTruthy();
    expect(restoredSvg.dataset.viewMode).toBe(originalSvg.dataset.viewMode);
    expect(restoredSvg.getAttribute('viewBox')).toBe(originalSvg.getAttribute('viewBox'));
    expect(restoredSvg.querySelector('[data-layer="pca-3d-rotation-dynamic"]')).toBeTruthy();
    expect(session.refs.svg).toBe(restoredSvg);
    expect(typeof session.refs.rotationRenderer).toBe('function');
    expect(session.refs.rotationRenderer).not.toBe(originalRenderer);
    expect(restoredSvg.dataset.rotationControlsAttached).toBe('true');

    const restoredAxisLabels = Array.from(restoredSvg.querySelectorAll('[data-layer="pca-3d-rotation-dynamic"] [data-axis-label]'));
    expect(restoredAxisLabels.length).toBeGreaterThan(0);
    restoredAxisLabels.forEach(node => {
      const axisKey = node.dataset.axisKey;
      const dimensionIndex = cache.rotationModel.axisIndices[axisKey];
      const overridePrefix = cache.rotationModel.method === 'pca' ? 'pc' : 'dimension';
      expect(node.dataset.pcaAxisTitleOverrideKey).toBe(`${cache.rotationModel.method}.${overridePrefix}${dimensionIndex + 1}`);
      expect(node.__graphitixInlineEditBinding?.dblclick).toEqual(expect.any(Function));
    });

    const beforeMarkup = restoredSvg.querySelector('[data-layer="pca-3d-rotation-dynamic"]')?.innerHTML || '';
    const nextRotation = window.Shared.plot3d.createRotationState({
      x: Number(session.state?.viewState?.rotation?.x || 0) + 0.15,
      y: Number(session.state?.viewState?.rotation?.y || 0) + 0.1,
      z: Number(session.state?.viewState?.rotation?.z || 0)
    });
    expect(session.refs.rotationRenderer(nextRotation)).toBe(true);
    const afterMarkup = restoredSvg.querySelector('[data-layer="pca-3d-rotation-dynamic"]')?.innerHTML || '';
    expect(afterMarkup).not.toBe(beforeMarkup);
  }, 180000);

  test('graph resize reuses cached PCA geometry', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushUntil(() => !!window.Components?.pca?.__state?.cachedRender, { limit: 80, step: 2 });

    const state = window.Components?.pca?.__state;
    expect(state).toBeTruthy();
    const initialCache = state.cachedRender;
    const initialSvd = global.__svdCallCount;
    const initialTimestamp = state.performance?.draw?.timestamp || 0;

    state.viewDirty = true;
    state.scheduleDraw({ viewOnly: true, reason: 'resize' });
    await flushUntil(() => (state.performance?.draw?.timestamp || 0) > initialTimestamp, { limit: 80, step: 2 });

    const drawPerf = state.performance?.draw;
    expect(drawPerf).toBeTruthy();
    expect(drawPerf.viewOnly).toBe(true);
    expect(drawPerf.cacheReused).toBe(true);
    expect(drawPerf.reason).toBe('resize');
    expect(state.cachedRender).toBe(initialCache);
    expect(global.__svdCallCount).toBe(initialSvd);
  });

  test('point-label metadata updates reuse the tab-owned PCA geometry', async () => {
    document.getElementById('pcaLoadExample').click();
    const state = window.Components?.pca?.__state;
    await flushUntil(() => !!state?.cachedRender, { limit: 80, step: 2 });

    const hot = window.Components?.pca?.getHotInstance?.();
    const initialSvd = global.__svdCallCount;
    const initialTimestamp = state.performance?.draw?.timestamp || 0;
    const current = hot.getDataAtCell(0, 1);
    const next = !([true, 1, '1', 'true', 'yes', 'on'].includes(
      typeof current === 'string' ? current.trim().toLowerCase() : current
    ));
    hot.setDataAtCell([[0, 1, next]], 'pca-point-label-toggle');
    await flushUntil(() => (state.performance?.draw?.timestamp || 0) > initialTimestamp, { limit: 80, step: 2 });

    expect(global.__svdCallCount).toBe(initialSvd);
    expect(state.dataDirty).toBe(false);
    expect(state.performance?.draw?.viewOnly).toBe(true);
    expect(state.performance?.draw?.cacheReused).toBe(true);
    expect(state.cachedRender?.points?.find(point => point.columnIndex === 1)?.isManualLabel).toBe(next);
  });

  test('switching PCA method redraws immediately', async () => {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushUntil(() => !!window.Components?.pca?.__state?.performance?.draw, { limit: 80, step: 2 });

    const state = window.Components?.pca?.__state;
    expect(state).toBeTruthy();

    const initialTimestamp = state.performance?.draw?.timestamp || 0;
    const methodSelect = document.getElementById('pcaMethod');
    expect(methodSelect).toBeTruthy();
    methodSelect.value = 'mds';
    methodSelect.dispatchEvent(new Event('change', { bubbles: true }));

    await flushUntil(() => (state.performance?.draw?.timestamp || 0) > initialTimestamp, { limit: 80, step: 2 });

    const drawPerf = state.performance?.draw;
    expect(drawPerf).toBeTruthy();
    expect(drawPerf.viewOnly).toBe(false);
    expect(drawPerf.reason).toBe('method-change');
    if(Object.prototype.hasOwnProperty.call(state, 'drawPending')){
      expect(state.drawPending).toBe(false);
    }
    expect(state.lastMethod).toBe('mds');
    expect(global.__svdCallCount).toBeGreaterThan(0);
  });

});
