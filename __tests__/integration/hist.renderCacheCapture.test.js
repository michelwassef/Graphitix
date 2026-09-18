const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120_000);

async function flushAsyncWork(iterations = 20){
  for(let i = 0; i < iterations; i += 1){
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function waitFor(predicate, iterations = 180){
  for(let i = 0; i < iterations; i += 1){
    if(predicate()){
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return !!predicate();
}

describe('Histogram render-cache capture contract', () => {
  beforeEach(async () => {
    const previousHist = window.Components?.hist || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousHist?.disposeTab){
      previousTabs.filter(tab => tab?.type === 'hist').forEach(tab => {
        previousHist.disposeTab(tab, { tabId: tab.id, reason: 'hist-render-cache-test-reset' });
      });
    }
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    if(globalThis !== window){
      delete globalThis.Shared;
    }
    jest.resetModules();
    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: ['hist']
    });

    const maybe = window.Main?.tabs?.handleGraphSelection?.('hist', {
      reason: 'hist-render-cache-test-setup'
    });
    if(maybe && typeof maybe.then === 'function'){
      await maybe;
    }
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      document.getElementById('duplicateEmpty')?.click();
    }
    await flushAsyncWork(4);
  });

  test('captures plot and report content without moving mounted children', async () => {
    const hist = window.Components?.hist;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    expect(hist).toBeTruthy();
    expect(tabId).toBeTruthy();

    document.getElementById('histLoadExample')?.click();
    expect(await waitFor(() => (
      document.querySelector('#histPage:not([hidden]) #histSvg svg, #histPage:not([hidden]) #histSvg')
    ))).toBe(true);
    await flushAsyncWork(20);

    const plot = document.querySelector('#histPage:not([hidden]) #histPlot');
    const stats = document.querySelector('#histPage:not([hidden]) #histStatsResults');
    const svg = plot?.querySelector('#histSvg') || plot?.querySelector('svg');
    expect(plot).toBeTruthy();
    expect(stats).toBeTruthy();
    expect(svg).toBeTruthy();

    const plotChildrenBefore = Array.from(plot.childNodes);
    const statsChildrenBefore = Array.from(stats.childNodes);
    const seriesBefore = Array.from(svg.querySelectorAll('[data-series-role], [data-series]'));
    const mutations = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(plot, { childList: true, subtree: true });
    observer.observe(stats, { childList: true, subtree: true });

    let cache;
    try{
      cache = hist.captureRenderCache({ tabId, reason: 'hist-read-only-capture-contract' });
      await Promise.resolve();
    }finally{
      observer.disconnect();
    }

    expect(cache).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({
        component: 'hist',
        type: 'hist',
        tabId,
        complete: true
      })
    }));
    expect(Array.from(plot.childNodes)).toEqual(plotChildrenBefore);
    expect(Array.from(stats.childNodes)).toEqual(statsChildrenBefore);
    expect(plot.contains(svg)).toBe(true);
    expect(Array.from(svg.querySelectorAll('[data-series-role], [data-series]'))).toEqual(seriesBefore);
    expect(mutations).toHaveLength(0);
  });
});
