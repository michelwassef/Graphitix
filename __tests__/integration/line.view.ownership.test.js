const { createLineViewTestContext } = require('../../test-support/lineViewTestSuite');
const { waitForIntegrationOwnerReady } = require('../../test-support/readiness');

jest.setTimeout(30000);

const captureLineTableShape = hot => {
  const rows = hot?.getData?.() || [];
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, Array.isArray(row) ? row.length : 0), 0);
  return {
    rowCount: rows.length,
    columnCount,
    header: Array.isArray(rows[0]) ? rows[0].slice() : [],
    sample: rows.slice(1, 4).map(row => Array.isArray(row) ? row.slice(0, Math.min(5, columnCount)) : row)
  };
};

describe('Line view — owner-scoped statistics and overlays', () => {
  const {
    flushAll,
    waitForLineLifecycle,
    activateWorkspace,
    ensureEmptyDuplicateTab,
    loadCurrentLineExample,
    loadLineExampleAndComputeStats,
    enableLineRegressionOverlays,
    getLineOverlayCounts,
  } = createLineViewTestContext();

  test('Line aspect sync accepts its retained owner-matched resizer fallback', async () => {
    const line = window.Components?.line;
    await loadCurrentLineExample();
    const root = document.querySelector('#linePage:not([hidden])');
    const svgBox = root?.querySelector('.svgbox');
    expect(line?.__testHooks?.syncAspectControls).toBeInstanceOf(Function);
    expect(svgBox).toBeTruthy();

    svgBox.classList.remove('svgbox');
    try{
      expect(() => line.__testHooks.syncAspectControls('test-owner-fallback')).not.toThrow();
    }finally{
      svgBox.classList.add('svgbox');
    }
  });

  const loadTwoGroupedLineTabs = async () => {
    const line = window.Components?.line;
    const main = window.Main;
    await loadCurrentLineExample();
    const tabA = main.session.getActiveTab();
    const rootA = document.querySelector('#linePage:not([hidden])');
    const formatA = rootA?.querySelector('#lineTableFormat');
    const replicatesA = rootA?.querySelector('#lineReplicates');
    expect(line && tabA && rootA && formatA && replicatesA).toBeTruthy();

    formatA.value = 'grouped';
    formatA.dispatchEvent(new window.Event('change', { bubbles: true }));
    await flushAll(16);
    expect(replicatesA.disabled).toBe(false);
    main.tabs.handleAddTabClick();
    await flushAll(10);
    await activateWorkspace('line');
    await ensureEmptyDuplicateTab();
    await loadCurrentLineExample();
    const tabB = main.session.getActiveTab();
    const formatB = document.querySelector('#linePage:not([hidden]) #lineTableFormat');
    expect(tabB?.id).not.toBe(tabA.id);
    expect(formatB).toBeTruthy();
    formatB.value = 'grouped';
    formatB.dispatchEvent(new window.Event('change', { bubbles: true }));
    await flushAll(16);

    return {
      line,
      main,
      tabA,
      tabB,
      rootA,
      formatA,
      replicatesA,
      sessionA: line.__testHooks.getSessionForTab(tabA.id),
      sessionB: line.__testHooks.getSessionForTab(tabB.id)
    };
  };

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

    main.tabs.handleAddTabClick();
    await flushAll(10);
    await activateWorkspace('line');
    await ensureEmptyDuplicateTab();
    await loadLineExampleAndComputeStats();
    const tabB = main.session.getActiveTab();
    expect(tabB?.id).not.toBe(tabA?.id);

    main.tabs.activateTab(tabA.id, { reason: 'test-line-overlay-switch-a' });
    await waitForIntegrationOwnerReady({
      type: 'line',
      expectedTabId: tabA.id,
      requireMountedRoot: true,
      requireIdle: true
    });

    expect(document.getElementById('lineShowTrendLine').checked).toBe(true);
    expect(document.getElementById('lineShowIntervals').checked).toBe(true);
    expect(document.getElementById('lineShowPredictionIntervals').checked).toBe(true);
    counts = getLineOverlayCounts();
    expect(counts.trend).toBeGreaterThan(0);
    expect(counts.confidence).toBeGreaterThan(0);
    expect(counts.prediction).toBeGreaterThan(0);
  });

  test('a retained inactive example button cannot load data into the active Line session', async () => {
    const line = window.Components?.line;
    const main = window.Main;
    const tabA = main?.session?.getActiveTab?.();
    const rootA = document.getElementById('linePage');
    const buttonA = rootA?.querySelector('#lineLoadExample');
    expect(line && main && tabA && buttonA).toBeTruthy();
    await loadCurrentLineExample();
    const sessionA = line.__testHooks?.getSessionForTab?.(tabA.id);
    expect(sessionA?.managers?.hot).toBeTruthy();
    const dataA = JSON.parse(JSON.stringify(sessionA.managers.hot.getData()));

    main.tabs.handleAddTabClick();
    await flushAll(10);
    await activateWorkspace('line');
    await ensureEmptyDuplicateTab();
    const tabB = main.session.getActiveTab();
    const sessionB = line.__testHooks.getSessionForTab(tabB?.id);
    expect(tabB?.id).not.toBe(tabA.id);
    expect(sessionB?.managers?.hot).toBeTruthy();
    const dataB = JSON.parse(JSON.stringify(sessionB.managers.hot.getData()));

    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(buttonA)).toBe(tabA.id);
    buttonA.click();
    await flushAll(12);

    expect(sessionA.managers.hot.getData()).toEqual(dataA);
    expect(sessionB.managers.hot.getData()).toEqual(dataB);
  });

  test('a retained inactive stats button cannot compute statistics for the active Line sibling', async () => {
    const line = window.Components?.line;
    const main = window.Main;
    await loadCurrentLineExample();
    const tabA = main.session.getActiveTab();
    const rootA = document.querySelector('#linePage:not([hidden])');
    const statsButtonA = rootA?.querySelector('#lineComputeStats');
    const sessionA = line.__testHooks.getSessionForTab(tabA.id);
    expect(statsButtonA && sessionA?.state?.statsState?.context?.series?.length).toBeTruthy();

    main.tabs.handleAddTabClick();
    await flushAll(10);
    await activateWorkspace('line');
    await ensureEmptyDuplicateTab();
    await loadCurrentLineExample();
    const tabB = main.session.getActiveTab();
    const sessionB = line.__testHooks.getSessionForTab(tabB.id);
    expect(tabB.id).not.toBe(tabA.id);
    expect(sessionB?.state?.statsState?.context?.series?.length).toBeGreaterThan(0);
    expect(sessionB.state.statsState.hasResults).toBe(false);

    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(statsButtonA)).toBe(tabA.id);
    statsButtonA.click();
    await flushAll(12);

    expect(sessionA.state.statsState.hasResults).toBe(false);
    expect(sessionB.state.statsState.hasResults).toBe(false);
  });

  test('loading an inactive Line payload cannot replace the active sibling projection', async () => {
    const line = window.Components?.line;
    const main = window.Main;
    await loadCurrentLineExample();
    const tabA = main.session.getActiveTab();
    const payloadA = JSON.parse(JSON.stringify(tabA.payload));

    main.tabs.handleAddTabClick();
    await flushAll(10);
    await activateWorkspace('line');
    await ensureEmptyDuplicateTab();
    await loadCurrentLineExample();
    const tabB = main.session.getActiveTab();
    const sessionB = line.__testHooks.getSessionForTab(tabB.id);
    const payloadBBefore = JSON.stringify(tabB.payload);
    const stateBBefore = JSON.stringify(sessionB.state);
    expect(tabB.id).not.toBe(tabA.id);
    expect(line.__lineSessionTabId).toBe(tabB.id);

    expect(line.loadFromPayload(payloadA, { tabId: tabA.id, skipDraw: true, reason: 'test-inactive-payload' })).toBe(false);

    expect(line.__lineSessionTabId).toBe(tabB.id);
    expect(JSON.stringify(tabB.payload)).toBe(payloadBBefore);
    expect(JSON.stringify(sessionB.state)).toBe(stateBBefore);
  });

  test('a cancelled delayed draw leaves the sibling intact and redraws Line on owner return', async () => {
    const line = window.Components?.line;
    const main = window.Main;
    const shared = window.Shared;
    await loadCurrentLineExample();
    const tabA = main.session.getActiveTab();
    const sessionA = line.__testHooks.getSessionForTab(tabA.id);
    const hotA = sessionA.managers.hot;
    const rootA = shared.workspaceTabs.getMountedRoot(tabA.id, 'line');
    const pathA = rootA?.querySelector('#lineSvg path[data-line-style-role="line"][data-series]');
    expect(pathA).toBeTruthy();
    expect(sessionA.state.autoDrawState.drawPending).toBe(false);
    const originalPath = pathA.getAttribute('d');
    const oldValue = Number(hotA.getDataAtCell(1, 1)) || 0;

    const originalCreateYieldController = shared.jobs.createYieldController;
    let releaseCheckpoint;
    let signalCheckpointStarted;
    const checkpointStarted = new Promise(resolve => { signalCheckpointStarted = resolve; });
    const delayedCheckpoint = new Promise(resolve => { releaseCheckpoint = resolve; });
    let checkpointPaused = false;
    shared.jobs.createYieldController = () => ({
      checkpoint: async () => {
        if(!checkpointPaused){
          checkpointPaused = true;
          signalCheckpointStarted();
          await delayedCheckpoint;
        }
      }
    });

    try{
      hotA.setDataAtCell(1, 1, String(oldValue + 1000));
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Line draw did not reach its delayed checkpoint.')), 10_000);
        checkpointStarted.then(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
      const payloadAAfterEdit = JSON.stringify(tabA.payload || null);

      main.tabs.handleAddTabClick();
      await flushAll(10);
      await activateWorkspace('line');
      await ensureEmptyDuplicateTab();
      const tabB = main.session.getActiveTab();
      const sessionB = line.__testHooks.getSessionForTab(tabB.id);
      const payloadBBefore = JSON.stringify(tabB.payload || null);
      const hotBBefore = JSON.stringify(sessionB?.managers?.hot?.getData?.() || []);
      expect(tabB.id).not.toBe(tabA.id);
      expect(JSON.stringify(line.getHot()?.getData?.() || [])).toBe(hotBBefore);

      const settledCursor = shared.componentLifecycle.getLifecycleEventCursor();
      const settledPromise = waitForLineLifecycle(settledCursor, { tabId: tabA.id, timeoutMs: 10_000 });
      releaseCheckpoint();
      const settled = await settledPromise;
      expect(settled.phase).toBe('cancelled');
      expect(rootA.querySelector('#lineSvg path[data-line-style-role="line"][data-series]')?.getAttribute('d')).toBe(originalPath);
      expect(main.session.workspaceState.loadedWorkspaces[tabA.id]).toBeUndefined();
      expect(sessionB?.state?.autoDrawState?.drawPending).not.toBe(true);
      expect(JSON.stringify(tabB.payload || null)).toBe(payloadBBefore);
      expect(JSON.stringify(sessionB?.managers?.hot?.getData?.() || [])).toBe(hotBBefore);
      expect(JSON.stringify(tabA.payload || null)).toBe(payloadAAfterEdit);

      const activationCursor = shared.componentLifecycle.getLifecycleEventCursor();
      // jsdom has no layout engine. Supply a real plot frame so the shared graph
      // publication check can distinguish rendered content from an empty panel.
      const plot = rootA.querySelector('#linePlot');
      plot.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 480, width: 800, height: 480 });
      const activation = main.tabs.activateTab(tabA.id, { reason: 'line-cancelled-draw-reactivate' });
      if(activation && typeof activation.then === 'function') await activation;
      const redrawn = await waitForLineLifecycle(activationCursor, {
        tabId: tabA.id,
        timeoutMs: 10_000
      });
      expect(redrawn.phase).toBe('complete');
      const restoredRoot = shared.workspaceTabs.getMountedRoot(tabA.id, 'line');
      const restoredPath = restoredRoot?.querySelector('#lineSvg path[data-line-style-role="line"][data-series]');
      expect(restoredPath?.getAttribute('d')).not.toBe(originalPath);
      expect(hotA.getDataAtCell(1, 1)).toBe(String(oldValue + 1000));
      expect(line.getHot()).toBe(hotA);
      expect(line.getHot().getDataAtCell(1, 1)).toBe(String(oldValue + 1000));
      expect(JSON.stringify(tabA.payload || null)).toBe(payloadAAfterEdit);
    }finally{
      releaseCheckpoint();
      shared.jobs.createYieldController = originalCreateYieldController;
    }
  });

  test('an inactive display-mode event cannot redraw the active sibling with its mode', async () => {
    const line = window.Components?.line;
    const main = window.Main;
    await loadLineExampleAndComputeStats();
    const tabA = main.session.getActiveTab();
    const rootA = document.querySelector('#linePage:not([hidden])');
    const displayModeA = rootA?.querySelector('#lineDisplayMode');
    const sessionA = line.__testHooks?.getSessionForTab?.(tabA.id);
    expect(line && displayModeA && sessionA?.state).toBeTruthy();

    main.tabs.handleAddTabClick();
    await flushAll(10);
    await activateWorkspace('line');
    await ensureEmptyDuplicateTab();
    await loadLineExampleAndComputeStats();
    const tabB = main.session.getActiveTab();
    const sessionB = line.__testHooks.getSessionForTab(tabB.id);
    expect(tabB?.id).not.toBe(tabA.id);
    const displayModeBeforeA = sessionA.state.displayMode;
    const displayModeBeforeB = sessionB.state.displayMode;

    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(displayModeA)).toBe(tabA.id);
    displayModeA.value = 'area';
    displayModeA.dispatchEvent(new window.Event('change', { bubbles: true }));
    await flushAll(16);

    expect(sessionA.state.displayMode).toBe(displayModeBeforeA);
    expect(sessionB.state.displayMode).toBe(displayModeBeforeB);
  });

  test('an inactive 2D/3D view-mode event cannot change the active sibling table', async () => {
    const line = window.Components?.line;
    const main = window.Main;
    await loadCurrentLineExample();
    const tabA = main.session.getActiveTab();
    const rootA = document.querySelector('#linePage:not([hidden])');
    const viewModeA = rootA?.querySelector('#lineViewMode');
    const sessionA = line.__testHooks.getSessionForTab(tabA.id);
    const dataABefore = JSON.parse(JSON.stringify(sessionA.managers.hot.getData()));
    expect(viewModeA && sessionA.state.viewState.viewMode).toBeTruthy();

    main.tabs.handleAddTabClick();
    await flushAll(10);
    await activateWorkspace('line');
    await ensureEmptyDuplicateTab();
    await loadCurrentLineExample();
    const tabB = main.session.getActiveTab();
    const sessionB = line.__testHooks.getSessionForTab(tabB.id);
    const dataBBefore = JSON.parse(JSON.stringify(sessionB.managers.hot.getData()));
    expect(tabB.id).not.toBe(tabA.id);
    expect(sessionB.state.viewState.viewMode).toBe('2d');

    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(viewModeA)).toBe(tabA.id);
    viewModeA.value = '3d';
    viewModeA.dispatchEvent(new window.Event('change', { bubbles: true }));
    await flushAll(16);

    expect(sessionA.state.viewState.viewMode).toBe('2d');
    expect(sessionB.state.viewState.viewMode).toBe('2d');
    expect(sessionA.managers.hot.getData()).toEqual(dataABefore);
    expect(sessionB.managers.hot.getData()).toEqual(dataBBefore);
  });

  test('an inactive Line table press cannot activate the sibling toolbar section', async () => {
    const { rootA, tabA, tabB } = await loadTwoGroupedLineTabs();
    const shared = window.Shared;
    const wrapperA = rootA?.querySelector('#lineHotWrapper');
    const rootB = document.querySelector('#linePage:not([hidden])');
    const wrapperB = rootB?.querySelector('#lineHotWrapper');
    expect(wrapperA && wrapperB && tabA?.id && tabB?.id).toBeTruthy();
    const activation = jest.spyOn(shared.workspaceToolbar, 'activateSection');

    try{
      rootA.setAttribute('data-workspace-tab-id', tabA.id);
      expect(shared.componentLifecycle.resolveTabIdFromTarget(wrapperA)).toBe(tabA.id);
      wrapperA.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
      expect(activation).not.toHaveBeenCalled();

      wrapperB.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));
      expect(activation).toHaveBeenCalledWith('line', 'Data');
    }finally{
      activation.mockRestore();
    }
  });

  test('an inactive replicate-count event cannot reshape the active sibling table', async () => {
    const { tabA, rootA, replicatesA, sessionA, sessionB } = await loadTwoGroupedLineTabs();
    expect(sessionA?.managers?.hot && sessionB?.managers?.hot).toBeTruthy();
    const dataABefore = captureLineTableShape(sessionA.managers.hot);
    const dataBBefore = captureLineTableShape(sessionB.managers.hot);
    const replicatesBBefore = sessionB.state.grouped.replicates;
    expect(replicatesBBefore).toBeGreaterThan(1);

    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(replicatesA)).toBe(tabA.id);
    replicatesA.value = String(replicatesBBefore + 1);
    replicatesA.dispatchEvent(new window.Event('change', { bubbles: true }));
    await flushAll(20);

    expect(captureLineTableShape(sessionA.managers.hot)).toEqual(dataABefore);
    expect(captureLineTableShape(sessionB.managers.hot)).toEqual(dataBBefore);
    expect(sessionB.state.grouped.replicates).toBe(replicatesBBefore);
  });

  test('an inactive table-format event cannot transform the active sibling table', async () => {
    const { tabA, rootA, formatA, sessionA, sessionB } = await loadTwoGroupedLineTabs();
    expect(sessionA?.managers?.hot && sessionB?.managers?.hot).toBeTruthy();
    const dataABefore = captureLineTableShape(sessionA.managers.hot);
    const dataBBefore = captureLineTableShape(sessionB.managers.hot);
    expect(sessionB.state.grouped.replicates).toBeGreaterThan(1);

    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(formatA)).toBe(tabA.id);
    formatA.value = 'single';
    formatA.dispatchEvent(new window.Event('change', { bubbles: true }));
    await flushAll(20);

    expect(captureLineTableShape(sessionA.managers.hot)).toEqual(dataABefore);
    expect(captureLineTableShape(sessionB.managers.hot)).toEqual(dataBBefore);
    expect(sessionB.state.grouped.replicates).toBeGreaterThan(1);
  });

  test('multi-series area and regression fills stay behind every data series', async () => {
    await loadLineExampleAndComputeStats();

    const displayMode = document.getElementById('lineDisplayMode');
    expect(displayMode).toBeTruthy();
    let drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    displayMode.value = 'area';
    displayMode.dispatchEvent(new window.Event('change', { bubbles: true }));
    await waitForLineLifecycle(drawCursor, { reason: 'line-display-mode-change' });

    await enableLineRegressionOverlays();
    const svg = document.getElementById('lineSvg');
    const dataSeriesNodes = Array.from(svg.querySelectorAll(
      '[data-line-style-role="line"], [data-line-style-role="markers"]'
    ));
    const seriesNames = new Set(dataSeriesNodes
      .map(node => node.getAttribute('data-series'))
      .filter(Boolean));
    expect(seriesNames.size).toBeGreaterThan(1);

    const childIndex = node => Array.from(svg.children).indexOf(node.closest('[data-layer]') || node);
    const firstDataSeriesIndex = Math.min(...dataSeriesNodes.map(childIndex));
    const areaPaths = Array.from(svg.querySelectorAll('path[data-render-mode="area-fill"]'));
    const intervalPaths = Array.from(svg.querySelectorAll('path[data-line-overlay-role="interval"]'));
    expect(areaPaths.length).toBeGreaterThan(1);
    expect(intervalPaths.length).toBeGreaterThan(1);
    expect(areaPaths.every(path => childIndex(path) < firstDataSeriesIndex)).toBe(true);
    expect(intervalPaths.every(path => childIndex(path) < firstDataSeriesIndex)).toBe(true);
  });

  test('same-component line tabs isolate the stats-on-plot control and render owner-scoped annotations', async () => {
    const lineComponent = window.Components?.line;
    const main = window.Main;
    expect(lineComponent).toBeTruthy();

    await loadLineExampleAndComputeStats();
    const tabA = main.session.getActiveTab();
    const showStatsA = document.getElementById('lineShowPlotStats');
    expect(showStatsA).toBeTruthy();
    expect(showStatsA.disabled).toBe(false);
    let drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    showStatsA.checked = true;
    showStatsA.dispatchEvent(new window.Event('change', { bubbles: true }));
    await waitForLineLifecycle(drawCursor, { tabId: tabA.id, reason: 'line-show-plot-stats' });
    expect(document.querySelectorAll('#lineSvg [data-plot-stats-annotation="1"]').length).toBeGreaterThan(0);
    expect(lineComponent.captureRuntimeState?.({ tabId: tabA.id, reason: 'test-line-stats-annotation-a' })?.last2d?.showPlotStats).toBe(true);

    main.tabs.handleAddTabClick();
    await flushAll(10);
    await activateWorkspace('line');
    await ensureEmptyDuplicateTab();
    await loadLineExampleAndComputeStats();
    const tabB = main.session.getActiveTab();
    expect(tabB?.id).not.toBe(tabA?.id);
    expect(document.getElementById('lineShowPlotStats').checked).toBe(false);

    const sessionA = lineComponent.__testHooks.getSessionForTab(tabA.id);
    const sessionB = lineComponent.__testHooks.getSessionForTab(tabB.id);
    main.tabs.activateTab(tabA.id, { reason: 'test-line-stats-annotation-switch-a' });
    await waitForIntegrationOwnerReady({
      type: 'line',
      expectedTabId: tabA.id,
      requireMountedRoot: true,
      requireIdle: true
    });
    expect(sessionA?.state?.last2d?.showPlotStats).toBe(true);
    expect(sessionB?.state?.last2d?.showPlotStats).toBe(false);
    expect(lineComponent.getPayload?.()?.config?.stats?.statsOptions?.showPlotStats).toBe(true);
    expect(document.getElementById('lineShowPlotStats').checked).toBe(true);
    expect(document.querySelectorAll('#lineSvg [data-plot-stats-annotation="1"]').length).toBeGreaterThan(0);
  }, 120000);

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

    expect(lineComponent.loadFromPayload?.(transientPayload, {
      tabId: tab.id,
      reason: 'test-line-transient-stats-unavailable'
    })).toBe(true);
    await waitForIntegrationOwnerReady({
      type: 'line',
      expectedTabId: tab.id,
      requireMountedRoot: true,
      requireIdle: true,
      condition: () => document.getElementById('lineShowTrendLine')?.checked === true
        && document.getElementById('lineShowIntervals')?.checked === true
        && document.getElementById('lineShowPredictionIntervals')?.checked === true
    });

    expect(document.getElementById('lineShowTrendLine').checked).toBe(true);
    expect(document.getElementById('lineShowIntervals').checked).toBe(true);
    expect(document.getElementById('lineShowPredictionIntervals').checked).toBe(true);
  });

  test('render-cache restore rebuilds Line statistics context from owner data without redrawing the graph', async () => {
    const lineComponent = window.Components?.line;
    const hooks = lineComponent?.__testHooks;
    const main = window.Main;
    expect(lineComponent).toBeTruthy();
    expect(typeof hooks?.reconcileStatsContextFromOwnerData).toBe('function');

    await loadLineExampleAndComputeStats();
    const tab = main.session.getActiveTab();
    const session = hooks.getActiveSession();
    const payload = lineComponent.getPayload?.();
    const originalSvg = document.getElementById('lineSvg');
    const cache = lineComponent.captureRenderCache?.({
      tabId: tab.id,
      type: 'line',
      reason: 'unit-line-stats-cache-capture'
    });
    expect(cache).toBeTruthy();
    // Cache capture is a non-destructive snapshot.  The mounted graph remains
    // owned by this tab until an explicit restore/rebind operation replaces it.
    expect(document.getElementById('lineSvg')).toBe(originalSvg);

    lineComponent.loadFromPayload?.(payload, {
      tabId: tab.id,
      type: 'line',
      reason: 'unit-line-stats-cache-payload-restore',
      skipDraw: true
    });
    expect(session.state.statsState.context).toBeNull();
    expect(session.state.statsState.hasResults).toBe(true);

    const restored = lineComponent.restoreRenderCache?.(cache, {
      tabId: tab.id,
      type: 'line',
      reason: 'unit-line-stats-cache-restore'
    });
    expect(restored).toBe(true);
    const restoredSvg = document.getElementById('lineSvg');
    expect(restoredSvg).toBeTruthy();
    expect(restoredSvg).not.toBe(originalSvg);
    expect(session.state.statsState.context?.series?.length).toBeGreaterThan(0);

    // Reopen can restore the graph before the owning HOT manager is ready.  The
    // compute action must be able to lazily reconstruct the transient context once
    // owner data is available, rather than requiring another graph redraw.
    session.state.statsState.context = null;

    const computeBtn = document.getElementById('lineComputeStats');
    expect(computeBtn?.disabled).toBe(false);
    computeBtn.click();
    await Promise.resolve();
    expect(document.getElementById('lineStatsStatus')?.textContent || '').toMatch(/up to date/i);
    expect(computeBtn.textContent).toMatch(/Calculate statistics/i);
  });

});
