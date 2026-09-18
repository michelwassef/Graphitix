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

describe('Survival render-cache capture contract', () => {
  beforeEach(async () => {
    const previousSurvival = window.Components?.survival || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousSurvival?.disposeTab){
      previousTabs.filter(tab => tab?.type === 'survival').forEach(tab => {
        previousSurvival.disposeTab(tab, { tabId: tab.id, reason: 'survival-render-cache-test-reset' });
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
      preloadComponents: ['survival']
    });

    const maybe = window.Main?.tabs?.handleGraphSelection?.('survival', {
      reason: 'survival-render-cache-test-setup'
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
    const survival = window.Components?.survival;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    expect(survival).toBeTruthy();
    expect(tabId).toBeTruthy();

    document.getElementById('survivalLoadExample')?.click();
    expect(await waitFor(() => (
      document.querySelector('#survivalPage:not([hidden]) #survivalSvg path[data-group][d]')
    ))).toBe(true);
    await flushAsyncWork(20);

    const plot = document.querySelector('#survivalPage:not([hidden]) #survivalPlot');
    const svg = plot?.querySelector('#survivalSvg');
    expect(plot).toBeTruthy();
    expect(svg).toBeTruthy();

    const childNodesBefore = Array.from(plot.childNodes);
    const curvesBefore = Array.from(svg.querySelectorAll('path[data-group][d]'));
    const mutations = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(plot, { childList: true, subtree: true });

    let cache;
    try{
      cache = survival.captureRenderCache({ tabId, reason: 'survival-read-only-capture-contract' });
      await Promise.resolve();
    }finally{
      observer.disconnect();
    }

    expect(cache).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({
        component: 'survival',
        type: 'survival',
        tabId,
        complete: true
      })
    }));
    expect(Array.from(plot.childNodes)).toEqual(childNodesBefore);
    expect(plot.contains(svg)).toBe(true);
    expect(Array.from(svg.querySelectorAll('path[data-group][d]'))).toEqual(curvesBefore);
    expect(mutations).toHaveLength(0);
  });
});
