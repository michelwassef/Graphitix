const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120_000);

async function flushAsyncWork(iterations = 20){
  for(let i = 0; i < iterations; i += 1){
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function waitFor(predicate, iterations = 240){
  for(let i = 0; i < iterations; i += 1){
    if(predicate()){
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return !!predicate();
}

describe('Surface render-cache capture contract', () => {
  beforeEach(async () => {
    const previousSurface = window.Components?.surface || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousSurface?.disposeTab){
      previousTabs.filter(tab => tab?.type === 'surface').forEach(tab => {
        previousSurface.disposeTab(tab, { tabId: tab.id, reason: 'surface-render-cache-test-reset' });
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
      preloadComponents: ['surface']
    });

    const maybe = window.Main?.tabs?.handleGraphSelection?.('surface', {
      reason: 'surface-render-cache-test-setup'
    });
    if(maybe && typeof maybe.then === 'function'){
      await maybe;
    }
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      document.getElementById('duplicateEmpty')?.click();
    }
    await flushAsyncWork(6);
  });

  test('captures graph, statistics, and message hosts without moving mounted children', async () => {
    const surface = window.Components?.surface;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    expect(surface).toBeTruthy();
    expect(tabId).toBeTruthy();

    document.getElementById('surfaceLoadExample')?.click();
    expect(await waitFor(() => (
      document.querySelector('#surfacePage:not([hidden]) #surfaceSvg g.surface-faces polygon')
    ))).toBe(true);
    await flushAsyncWork(12);

    const state = surface.__getState?.();
    const hosts = [state?.svg, state?.statsEl, state?.messageEl].filter(Boolean);
    expect(hosts.length).toBe(3);
    const childrenBefore = hosts.map(host => Array.from(host.childNodes));
    const geometryBefore = Array.from(state.svg.querySelectorAll('g.surface-faces polygon, g.surface-points circle'));
    const mutations = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    hosts.forEach(host => observer.observe(host, { childList: true, subtree: true }));

    let cache;
    try{
      cache = surface.captureRenderCache({ tabId, reason: 'surface-read-only-capture-contract' });
      await Promise.resolve();
    }finally{
      observer.disconnect();
    }

    expect(cache).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({
        component: 'surface',
        type: 'surface',
        tabId,
        complete: true
      })
    }));
    hosts.forEach((host, index) => {
      expect(Array.from(host.childNodes)).toEqual(childrenBefore[index]);
    });
    expect(Array.from(state.svg.querySelectorAll('g.surface-faces polygon, g.surface-points circle')))
      .toEqual(geometryBefore);
    expect(mutations).toHaveLength(0);
  });
});
