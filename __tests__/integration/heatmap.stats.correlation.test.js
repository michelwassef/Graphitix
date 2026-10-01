const { createHeatmapStatsTestContext } = require('../../test-support/heatmapStatsSuite');

jest.setTimeout(240_000);

describe('Heatmap stats — correlation reporting', () => {
  const {
    cloneForTest,
    getActiveHeatmapTabId,
    flushAsyncWork,
    waitFor,
    ensureCorrelationView,
  } = createHeatmapStatsTestContext();

  test('correlation significance correction defaults to BH and persists through payload state', async () => {
    const correction = document.getElementById('heatmapSignificanceCorrection');
    expect(correction).toBeTruthy();
    expect(correction.value).toBe('bh');
    correction.value = 'holm';
    correction.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(4);
    const payload = window.Components.heatmap.getPayload();
    expect(payload.config.significanceCorrection).toBe('holm');
    window.Components.heatmap.loadFromPayload(cloneForTest(payload), {
      tabId: getActiveHeatmapTabId(),
      skipDraw: true,
      skipInitialDraw: true
    });
    expect(document.getElementById('heatmapSignificanceCorrection').value).toBe('holm');
  });

  test('runtime snapshots preserve the current correlation correction', async () => {
    const heatmap = window.Components.heatmap;
    const correction = document.getElementById('heatmapSignificanceCorrection');
    expect(correction).toBeTruthy();

    correction.value = 'by';
    correction.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(4);

    const snapshot = cloneForTest(heatmap.captureRuntimeState({
      tabId: getActiveHeatmapTabId(),
      reason: 'heatmap-current-runtime-capture-test'
    }));
    expect(snapshot?.controls?.significanceCorrection).toBe('by');

    correction.value = 'holm';
    expect(heatmap.applyRuntimeState(snapshot, {
      tabId: getActiveHeatmapTabId(),
      reason: 'heatmap-current-runtime-apply-test'
    })).toBe(true);
    expect(document.getElementById('heatmapSignificanceCorrection').value).toBe('by');
    expect(heatmap.getPayload().config.significanceCorrection).toBe('by');
  });

  test('correlation reporting records the active multiplicity family and inference level', async () => {
    const hot = global.__LAST_HEATMAP_HOT__;
    const heatmap = window.Components.heatmap;
    hot.loadData([
      ['Gene', 'A', 'B', 'C'],
      ['G1', 1, 1, 4],
      ['G2', 2, 3, 3],
      ['G3', 3, 2, 2],
      ['G4', 4, 4, 1]
    ]);
    await ensureCorrelationView();
    const showSignificance = document.getElementById('heatmapShowSignificance');
    const correction = document.getElementById('heatmapSignificanceCorrection');
    showSignificance.checked = true;
    showSignificance.dispatchEvent(new Event('change', { bubbles: true }));
    correction.value = 'bh';
    correction.dispatchEvent(new Event('change', { bubbles: true }));

    expect(await waitFor(() => {
      const stats = heatmap.__getState().lastStats;
      return stats?.type === 'correlation'
        && stats.showSignificance === true
        && stats.significanceCorrection === 'bh'
        && stats.testedPairCount === 3;
    })).toBe(true);

    const statsText = document.getElementById('heatmapStatsContent')?.textContent || '';
    expect(statsText).toContain('Benjamini–Hochberg FDR');
    expect(statsText).toContain('target FDR = 0.05');
    expect(statsText).toContain('unique pairs');
    expect(heatmap.__getState().lastStats).toMatchObject({
      showSignificance: true,
      significanceCorrection: 'bh',
      testedPairCount: 3
    });
  });

});
