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

  test('Spearman pair inference uses shared tie-aware permutation calibration', () => {
    const heatmap = window.Components.heatmap;
    const x = [1, 1, 2, 3, 3, 4];
    const y = [1, 2, 1, 3, 4, 4];
    const expected = window.Shared.stats.spearmanPermutationTest(x, y, { pairCount: 1 });
    const actual = heatmap.__testHooks.calculateCorrelationEntry(x, y, 'spearman', true, { pairCount: 1 });
    expect(expected.available).toBe(true);
    expect(expected.exact).toBe(true);
    expect(expected.hasTies).toBe(true);
    expect(actual.pValue).toBeCloseTo(expected.pValue, 14);
    expect(actual.pMethod).toContain('exact permutation');
    expect(actual.hasTies).toBe(true);
  });

  test('rendered Spearman inference reports raw and BH-adjusted values for the full pair family', async () => {
    const heatmap = window.Components.heatmap;
    const hot = global.__LAST_HEATMAP_HOT__;
    hot.loadData([
      ['Gene', 'A', 'B', 'C'],
      ['G1', 1, 1, 2],
      ['G2', 1, 2, 2],
      ['G3', 2, 1, 1],
      ['G4', 3, 3, 1],
      ['G5', 3, 4, 3],
      ['G6', 4, 4, 4]
    ]);
    await ensureCorrelationView();
    const method = document.getElementById('heatmapMethod');
    const showSignificance = document.getElementById('heatmapShowSignificance');
    const correction = document.getElementById('heatmapSignificanceCorrection');
    method.value = 'spearman';
    method.dispatchEvent(new Event('change', { bubbles: true }));
    showSignificance.checked = true;
    showSignificance.dispatchEvent(new Event('change', { bubbles: true }));
    correction.value = 'bh';
    correction.dispatchEvent(new Event('change', { bubbles: true }));

    expect(await waitFor(() => {
      const stats = heatmap.__getState().lastStats;
      return stats?.type === 'correlation'
        && stats.method === 'spearman'
        && stats.showSignificance === true
        && stats.testedPairCount === 3;
    })).toBe(true);

    const pairResults = heatmap.__getState().lastStats.pairResults;
    const vectors = {
      A: [1, 1, 2, 3, 3, 4],
      B: [1, 2, 1, 3, 4, 4],
      C: [2, 2, 1, 1, 3, 4]
    };
    const expectedP = pairResults.map(pair => window.Shared.stats.spearmanPermutationTest(
      vectors[pair.left], vectors[pair.right], { pairCount: 3 }
    ).pValue);
    const expectedBh = new Array(expectedP.length);
    const ordered = expectedP.map((pValue, index) => ({ pValue, index })).sort((a, b) => a.pValue - b.pValue);
    let runningMinimum = 1;
    for(let rank = ordered.length; rank > 0; rank -= 1){
      const entry = ordered[rank - 1];
      runningMinimum = Math.min(runningMinimum, entry.pValue * ordered.length / rank);
      expectedBh[entry.index] = Math.min(1, runningMinimum);
    }
    pairResults.forEach((pair, index) => {
      expect(pair.pMethod).toContain('exact permutation');
      expect(pair.rawPValue).toBeCloseTo(expectedP[index], 14);
      expect(pair.adjustedPValue).toBeCloseTo(expectedBh[index], 14);
    });
  });

});
