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

describe('ROC render-cache capture contract', () => {
  beforeEach(async () => {
    const previousRoc = window.Components?.roc || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousRoc?.disposeTab){
      previousTabs.filter(tab => tab?.type === 'roc').forEach(tab => {
        previousRoc.disposeTab(tab, { tabId: tab.id, reason: 'roc-render-cache-test-reset' });
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
      preloadComponents: ['roc']
    });

    const maybe = window.Main?.tabs?.handleGraphSelection?.('roc', {
      reason: 'roc-render-cache-test-setup'
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

  test('captures a settled graph without moving the mounted plot children', async () => {
    const roc = window.Components?.roc;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    expect(roc).toBeTruthy();
    expect(tabId).toBeTruthy();

    document.getElementById('rocLoadExample')?.click();
    expect(await waitFor(() => (
      document.querySelector('#rocPage:not([hidden]) #rocSvg path[data-series][d]')
    ))).toBe(true);
    await flushAsyncWork(10);

    const plot = document.querySelector('#rocPage:not([hidden]) #rocPlot');
    const svg = plot?.querySelector('#rocSvg');
    expect(plot).toBeTruthy();
    expect(svg).toBeTruthy();

    const childNodesBefore = Array.from(plot.childNodes);
    const seriesBefore = Array.from(svg.querySelectorAll('path[data-series][d]'));
    const mutations = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(plot, { childList: true, subtree: true });

    let cache;
    try{
      cache = roc.captureRenderCache({ tabId, reason: 'roc-read-only-capture-contract' });
      await Promise.resolve();
    }finally{
      observer.disconnect();
    }

    expect(cache).toEqual(expect.objectContaining({
      graphOnly: true,
      __graphitixRenderCache: expect.objectContaining({
        component: 'roc',
        type: 'roc',
        tabId,
        complete: true
      })
    }));
    expect(Array.from(plot.childNodes)).toEqual(childNodesBefore);
    expect(plot.contains(svg)).toBe(true);
    expect(Array.from(svg.querySelectorAll('path[data-series][d]'))).toEqual(seriesBefore);
    expect(mutations).toHaveLength(0);
  });
});
