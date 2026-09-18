const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120_000);

async function flushAsyncWork(iterations = 12){
  for(let i = 0; i < iterations; i += 1){
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('Scatter render-cache capture contract', () => {
  beforeEach(async () => {
    const previousScatter = window.Components?.scatter || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousScatter?.disposeTab){
      previousTabs.filter(tab => tab?.type === 'scatter').forEach(tab => {
        previousScatter.disposeTab(tab, { tabId: tab.id, reason: 'scatter-render-cache-test-reset' });
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
      preloadComponents: ['scatter']
    });

    const maybe = window.Main?.tabs?.handleGraphSelection?.('scatter', {
      reason: 'scatter-render-cache-test-setup'
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

  test('captures a canvas-backed point layer without moving the mounted plot', () => {
    const scatter = window.Components?.scatter;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const plot = document.querySelector('#scatterPage:not([hidden]) #scatterPlot');
    expect(scatter).toBeTruthy();
    expect(tabId).toBeTruthy();
    expect(plot).toBeTruthy();

    plot.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'scatterSvg';
    svg.setAttribute('width', '320');
    svg.setAttribute('height', '240');
    const pointLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    pointLayer.setAttribute('data-layer', 'points');
    pointLayer.setAttribute('data-render-mode', 'canvas');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('data-point-renderer', 'canvas-preview');
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    canvas.style.width = '32px';
    canvas.style.height = '24px';
    canvas.setAttribute('data-resolution-scale', '2');
    canvas.toDataURL = jest.fn(() => 'data:image/png;base64,scatter-points');
    canvas.getContext = jest.fn(() => ({
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })
    }));
    foreignObject.appendChild(canvas);
    pointLayer.appendChild(foreignObject);
    svg.appendChild(pointLayer);
    plot.appendChild(svg);

    const childrenBefore = Array.from(plot.childNodes);
    const pointsBefore = Array.from(pointLayer.childNodes);
    const mutations = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(plot, { childList: true, subtree: true });

    let cache;
    try{
      cache = scatter.captureRenderCache({
        tabId,
        reason: 'scatter-canvas-read-only-capture-contract'
      });
    }finally{
      observer.disconnect();
    }

    expect(cache).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({
        component: 'scatter',
        type: 'scatter',
        tabId,
        complete: true
      })
    }));
    expect(cache.__graphitixLiveDomPreserved).toBe(true);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(cache.plot.fragment.querySelector(
      'img[data-graphitix-render-cache-canvas-bitmap="true"]'
    )?.getAttribute('src')).toBe('data:image/png;base64,scatter-points');
    expect(Array.from(plot.childNodes)).toEqual(childrenBefore);
    expect(Array.from(pointLayer.childNodes)).toEqual(pointsBefore);
    expect(plot.querySelector('#scatterSvg')).toBe(svg);
    expect(mutations).toHaveLength(0);
  });
});
