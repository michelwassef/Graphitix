const { createLineViewTestContext } = require('../../test-support/lineViewTestSuite');

jest.setTimeout(30000);

describe('Line view — owner-scoped statistics and overlays', () => {
  const {
    flushAll,
    waitForLineLifecycle,
    activateWorkspace,
    ensureEmptyDuplicateTab,
    loadLineExampleAndComputeStats,
    enableLineRegressionOverlays,
    getLineOverlayCounts,
  } = createLineViewTestContext();

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

    const activationCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    main.tabs.activateTab(tabA.id, { reason: 'test-line-overlay-switch-a' });
    await waitForLineLifecycle(activationCursor, {
      tabId: tabA.id,
      actions: ['draw-settled'],
      reason: 'test-line-overlay-switch-a'
    });

    expect(document.getElementById('lineShowTrendLine').checked).toBe(true);
    expect(document.getElementById('lineShowIntervals').checked).toBe(true);
    expect(document.getElementById('lineShowPredictionIntervals').checked).toBe(true);
    counts = getLineOverlayCounts();
    expect(counts.trend).toBeGreaterThan(0);
    expect(counts.confidence).toBeGreaterThan(0);
    expect(counts.prediction).toBeGreaterThan(0);
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

    drawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    main.tabs.activateTab(tabA.id, { reason: 'test-line-stats-annotation-switch-a' });
    await waitForLineLifecycle(drawCursor, {
      tabId: tabA.id,
      actions: ['draw-settled'],
      reason: 'test-line-stats-annotation-switch-a'
    });
    expect(document.getElementById('lineShowPlotStats').checked).toBe(true);
    expect(document.querySelectorAll('#lineSvg [data-plot-stats-annotation="1"]').length).toBeGreaterThan(0);
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
    expect(computeBtn.textContent).toMatch(/Recalculate statistics/i);
  });

});
