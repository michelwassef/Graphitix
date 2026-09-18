const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(240_000);

async function flushAsyncWork(iterations = 20){
  for(let i = 0; i < iterations; i += 1){
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function waitFor(predicate, iterations = 120){
  for(let i = 0; i < iterations; i += 1){
    if(predicate()){
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return !!predicate();
}

describe('Heatmap render-impact contract', () => {
  beforeEach(async () => {
    const previousHeatmap = window.Components?.heatmap || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousHeatmap?.disposeTab){
      previousTabs.filter(tab => tab?.type === 'heatmap').forEach(tab => {
        previousHeatmap.disposeTab(tab, { tabId: tab.id, reason: 'heatmap-render-impact-test-reset' });
      });
    }
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    if(globalThis !== window){
      delete globalThis.Shared;
    }
    delete global.__LAST_HEATMAP_HOT__;
    jest.resetModules();
    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: ['heatmap']
    });

    const maybe = window.Main?.tabs?.handleGraphSelection?.('heatmap', {
      reason: 'heatmap-render-impact-test-setup'
    });
    if(maybe && typeof maybe.then === 'function'){
      await maybe;
    }
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      document.getElementById('duplicateEmpty')?.click();
    }
    await flushAsyncWork(4);

    const Shared = window.Shared || {};
    const originalCreateStandardTable = Shared.hot?.createStandardTable;
    if(originalCreateStandardTable){
      Shared.hot.createStandardTable = function wrappedCreateStandardTable(){
        const instance = originalCreateStandardTable.apply(this, arguments);
        if(instance && arguments?.[0]?.id === 'heatmapHot'){
          global.__LAST_HEATMAP_HOT__ = instance;
        }
        return instance;
      };
    }
  });

  test('sanitizes explicit impacts and preserves the strongest queued request', () => {
    const hooks = window.Components?.heatmap?.__testHooks;
    expect(hooks?.resolveRenderImpact).toBeTruthy();
    expect(hooks.resolveRenderImpact({ viewOnly: true })).toBe('layout');
    expect(hooks.resolveRenderImpact({ viewOnly: true, renderImpact: 'analysis' })).toBe('analysis');
    expect(hooks.sanitizeDrawOptions({ renderImpact: 'paint', reason: 'palette-change' })).toMatchObject({
      renderImpact: 'paint',
      viewOnly: true,
      reason: 'palette-change'
    });
    expect(hooks.mergeDrawOptionState(
      { tabId: 'owner-a', renderImpact: 'structural', reason: 'data-switch' },
      { tabId: 'owner-a', renderImpact: 'paint', reason: 'palette-change' }
    )).toMatchObject({
      renderImpact: 'structural',
      viewOnly: false,
      reason: 'palette-change'
    });
  });

  test('changing correlation correction recomputes adjusted p-values instead of reusing the old model', async () => {
    const heatmap = window.Components?.heatmap;
    const hot = global.__LAST_HEATMAP_HOT__ || heatmap?.__getState?.()?.hot;
    expect(heatmap).toBeTruthy();
    expect(hot).toBeTruthy();

    hot.loadData([
      ['Gene', 'A', 'B', 'C', 'D'],
      ['G1', 1, 1.2, 19.4, 1],
      ['G2', 2, 1.8, 18.1, 5],
      ['G3', 3, 3.4, 17.7, 2],
      ['G4', 4, 3.6, 16.2, 8],
      ['G5', 5, 5.3, 15.1, 3],
      ['G6', 6, 5.7, 14.5, 7],
      ['G7', 7, 7.1, 13.2, 4],
      ['G8', 8, 8.4, 12.6, 9],
      ['G9', 9, 8.7, 11.1, 0],
      ['G10', 10, 10.2, 10.4, 6],
      ['G11', 11, 10.6, 9.3, 2],
      ['G12', 12, 12.4, 8.7, 8],
      ['G13', 13, 12.8, 7.4, 4],
      ['G14', 14, 14.3, 6.8, 7],
      ['G15', 15, 14.6, 5.5, 1],
      ['G16', 16, 16.2, 4.9, 6],
      ['G17', 17, 16.7, 3.6, 3],
      ['G18', 18, 18.1, 2.8, 9],
      ['G19', 19, 18.5, 1.7, 5],
      ['G20', 20, 20.4, 0.5, 0]
    ]);

    const view = document.getElementById('heatmapView');
    view.value = 'corr-columns';
    view.dispatchEvent(new Event('change', { bubbles: true }));
    expect(await waitFor(() => {
      const stats = heatmap.__getState?.()?.lastStats;
      return stats?.type === 'correlation'
        && stats?.testedPairCount === 6
        && heatmap.__testHooks?.getPerformance?.()?.performance?.draw?.status === 'complete';
    })).toBe(true);

    const correction = document.getElementById('heatmapSignificanceCorrection');
    correction.value = 'bh';
    correction.dispatchEvent(new Event('change', { bubbles: true }));
    expect(await waitFor(() => heatmap.__getState?.()?.lastStats?.significanceCorrection === 'bh')).toBe(true);
    const bhStats = heatmap.__getState().lastStats;
    const expectedHolm = window.Shared.stats.adjustPValues(
      bhStats.pairResults.map(result => result.rawPValue),
      { method: 'holm' }
    );

    const beforeHolmTimestamp = Number(
      heatmap.__testHooks.getPerformance().performance.draw.timestamp || 0
    );
    correction.value = 'holm';
    correction.dispatchEvent(new Event('change', { bubbles: true }));
    expect(await waitFor(() => {
      const state = heatmap.__getState?.();
      const draw = heatmap.__testHooks?.getPerformance?.()?.performance?.draw;
      return state?.lastStats?.significanceCorrection === 'holm'
        && Number(draw?.timestamp || 0) > beforeHolmTimestamp
        && draw?.status === 'complete';
    })).toBe(true);

    const holmStats = heatmap.__getState().lastStats;
    expect(holmStats.pairResults.map(result => result.adjustedPValue)).toEqual(expectedHolm);
  });
});
