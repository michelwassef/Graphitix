const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120_000);

async function flushAsyncWork(iterations = 12){
  for(let i = 0; i < iterations; i += 1){
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('PCA render-cache capture contract', () => {
  beforeEach(async () => {
    const previousPca = window.Components?.pca || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousPca?.disposeTab){
      previousTabs.filter(tab => tab?.type === 'pca').forEach(tab => {
        previousPca.disposeTab(tab, { tabId: tab.id, reason: 'pca-render-cache-test-reset' });
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
      preloadComponents: ['pca']
    });

    const maybe = window.Main?.tabs?.handleGraphSelection?.('pca', {
      reason: 'pca-render-cache-test-setup'
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

  test('captures the fast-point canvas as a bitmap without moving the mounted plot', () => {
    const pca = window.Components?.pca;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const plot = document.querySelector('#pcaPage:not([hidden]) #pcaPlot');
    expect(pca).toBeTruthy();
    expect(tabId).toBeTruthy();
    expect(plot).toBeTruthy();

    plot.innerHTML = '';
    const layeredRoot = document.createElement('div');
    layeredRoot.className = 'pca-layered-plot';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'pcaSvg';
    svg.setAttribute('width', '320');
    svg.setAttribute('height', '240');
    const canvas = document.createElement('canvas');
    canvas.className = 'pca-fast-points-layer';
    canvas.width = 64;
    canvas.height = 48;
    canvas.style.width = '32px';
    canvas.style.height = '24px';
    canvas.toDataURL = jest.fn(() => 'data:image/png;base64,pca-points');
    layeredRoot.append(canvas, svg);
    plot.appendChild(layeredRoot);

    const childrenBefore = Array.from(plot.childNodes);
    const canvasBefore = canvas;
    const mutations = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(plot, { childList: true, subtree: true });

    let cache;
    try{
      cache = pca.captureRenderCache({
        tabId,
        reason: 'pca-canvas-read-only-capture-contract'
      });
    }finally{
      observer.disconnect();
    }

    expect(cache).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({
        component: 'pca',
        type: 'pca',
        tabId,
        complete: true
      })
    }));
    expect(cache.__graphitixLiveDomPreserved).toBe(true);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(cache.plot.fragment.querySelector(
      'img[data-graphitix-render-cache-canvas-bitmap="true"]'
    )?.getAttribute('src')).toBe('data:image/png;base64,pca-points');
    expect(Array.from(plot.childNodes)).toEqual(childrenBefore);
    expect(plot.querySelector('canvas.pca-fast-points-layer')).toBe(canvasBefore);
    expect(mutations).toHaveLength(0);

    const restored = pca.restoreRenderCache(cache, {
      tabId,
      reason: 'pca-canvas-read-only-restore-contract'
    });
    expect(restored).toBe(true);
    expect(plot.querySelector(
      'canvas.pca-fast-points-layer, img[data-graphitix-render-cache-canvas-pending-hydration="true"]'
    )).toBeTruthy();
  });
});
