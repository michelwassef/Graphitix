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

  test('Spearman pairs without p-values are excluded consistently from correction and reporting', async () => {
    const heatmap = window.Components.heatmap;
    const hot = global.__LAST_HEATMAP_HOT__;
    hot.loadData([
      ['Gene', 'A', 'B', 'C'],
      ['g1', 1, 2, 6],
      ['g2', 2, 1, 5],
      ['g3', 3, 4, 4],
      ['g4', 4, 3, 3],
      ['g5', 5, 6, 2],
      ['g6', 6, 5, 1]
    ]);
    await ensureCorrelationView();

    const sharedStats = window.Shared.stats;
    const originalSpearmanTest = sharedStats.spearmanPermutationTest;
    const spearmanSpy = jest.spyOn(sharedStats, 'spearmanPermutationTest').mockImplementation((left, right, options) => {
      if(left[0] === 1 && right[0] === 6){
        return {
          available: false,
          rho: -1,
          pValue: NaN,
          n: left.length,
          method: 'not calculated (permutation work limit)',
          reason: 'Deterministic unavailable-p-value fixture.',
          exact: false,
          resamples: null,
          hasTies: false
        };
      }
      return originalSpearmanTest(left, right, options);
    });

    try{
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
        const methods = document.querySelector('#heatmapStatsContent pre[data-stats-report-block="methods"]');
        return stats?.type === 'correlation'
          && stats.method === 'spearman'
          && stats.showSignificance === true
          && stats.unavailablePValueCount === 1
          && methods?.textContent?.includes('excluded from adjustment');
      })).toBe(true);

      const stats = heatmap.__getState().lastStats;
      const pairResults = stats.pairResults;
      const expectRenderModelToMatch = pairs => {
        const model = heatmap.__getState().lastRenderModel;
        expect(model?.type).toBe('correlation');
        pairs.forEach(pair => {
          const row = model.orderedRowLabels.indexOf(pair.left);
          const column = model.orderedColumnLabels.indexOf(pair.right);
          expect(row).toBeGreaterThanOrEqual(0);
          expect(column).toBeGreaterThanOrEqual(0);
          const cell = model.cells[row][column];
          if(Number.isFinite(pair.adjustedPValue)){
            expect(cell.adjustedPValue).toBeCloseTo(pair.adjustedPValue, 14);
            expect(model.cells[column][row].adjustedPValue).toBeCloseTo(pair.adjustedPValue, 14);
          }else{
            expect(cell.adjustedPValue).toBeNull();
            expect(model.cells[column][row].adjustedPValue).toBeNull();
          }
        });
      };
      const availablePairs = pairResults
        .map((pair, index) => ({ pair, index }))
        .filter(({ pair }) => Number.isFinite(pair.rawPValue) && pair.rawPValue >= 0 && pair.rawPValue <= 1);
      expect(stats).toMatchObject({
        testedPairCount: 2,
        inferencePairCount: 3,
        unavailablePValueCount: 1,
        significanceCorrection: 'bh'
      });
      expect(pairResults).toHaveLength(3);
      expect(pairResults.find(pair => pair.left === 'A' && pair.right === 'C').adjustedPValue).toBeNull();

      const expectedBh = new Array(availablePairs.length);
      const orderedBh = availablePairs.slice().sort((a, b) => a.pair.rawPValue - b.pair.rawPValue);
      let runningMinimum = 1;
      for(let rank = orderedBh.length; rank > 0; rank -= 1){
        const entry = orderedBh[rank - 1];
        runningMinimum = Math.min(runningMinimum, entry.pair.rawPValue * orderedBh.length / rank);
        expectedBh[entry.index] = Math.min(1, runningMinimum);
      }
      availablePairs.forEach(({ pair, index }) => {
        expect(pair.adjustedPValue).toBeCloseTo(expectedBh[index], 14);
      });
      expectRenderModelToMatch(pairResults);

      const methods = document.querySelector('#heatmapStatsContent pre[data-stats-report-block="methods"]')?.textContent || '';
      expect(methods).toContain('2 computable unique off-diagonal pairs');
      expect(methods).toContain('1 of 3 pairs had no computable p-value and were excluded from adjustment');
      expect(methods).not.toContain('p = 1 for adjustment');
      const callsAfterCalculation = spearmanSpy.mock.calls.length;

      correction.value = 'holm';
      correction.dispatchEvent(new Event('change', { bubbles: true }));
      expect(await waitFor(() => {
        const current = heatmap.__getState();
        return current.lastStats?.significanceCorrection === 'holm'
          && current.lastRenderModel?.significanceCorrection === 'holm';
      })).toBe(true);
      expect(spearmanSpy).toHaveBeenCalledTimes(callsAfterCalculation);
      const holmStats = heatmap.__getState().lastStats;
      expect(holmStats).toMatchObject({
        testedPairCount: 2,
        inferencePairCount: 3,
        unavailablePValueCount: 1,
        significanceCorrection: 'holm'
      });
      const holmPairs = holmStats.pairResults
        .map((pair, index) => ({ pair, index }))
        .filter(({ pair }) => Number.isFinite(pair.rawPValue) && pair.rawPValue >= 0 && pair.rawPValue <= 1);
      const expectedHolm = new Array(holmPairs.length);
      const orderedHolm = holmPairs.slice().sort((a, b) => a.pair.rawPValue - b.pair.rawPValue);
      let runningMaximum = 0;
      for(let index = 0; index < orderedHolm.length; index += 1){
        const entry = orderedHolm[index];
        runningMaximum = Math.max(runningMaximum, Math.min(1, (orderedHolm.length - index) * entry.pair.rawPValue));
        expectedHolm[entry.index] = runningMaximum;
      }
      holmPairs.forEach(({ pair, index }) => {
        expect(pair.adjustedPValue).toBeCloseTo(expectedHolm[index], 14);
      });
      expectRenderModelToMatch(holmStats.pairResults);
      const holmMethods = document.querySelector('#heatmapStatsContent pre[data-stats-report-block="methods"]')?.textContent || '';
      expect(holmMethods).toContain('Holm adjustment was applied across 2 computable unique off-diagonal pairs');
      expect(holmMethods).toContain('1 of 3 pairs had no computable p-value and were excluded from adjustment');
      expect(pairResults.find(pair => pair.left === 'A' && pair.right === 'C').adjustedPValue).toBeNull();
    } finally{
      spearmanSpy.mockRestore();
    }
  });

});
