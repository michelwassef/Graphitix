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

describe('Heatmap render-cache capture contract', () => {
  beforeEach(async () => {
    const previousHeatmap = window.Components?.heatmap || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousHeatmap?.disposeTab){
      previousTabs.filter(tab => tab?.type === 'heatmap').forEach(tab => {
        previousHeatmap.disposeTab(tab, { tabId: tab.id, reason: 'heatmap-render-cache-test-reset' });
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
      preloadComponents: ['heatmap']
    });

    const maybe = window.Main?.tabs?.handleGraphSelection?.('heatmap', {
      reason: 'heatmap-render-cache-test-setup'
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

  test('captures canvas-backed cells without moving the published Heatmap DOM', async () => {
    const heatmap = window.Components?.heatmap;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    expect(heatmap).toBeTruthy();
    expect(tabId).toBeTruthy();

    document.getElementById('heatmapLoadExample')?.click();
    expect(await waitFor(() => (
      document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg [data-export-layer="heatmap-cells"]')
    ))).toBe(true);
    await flushAsyncWork(12);

    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    const cellLayer = svg?.querySelector('[data-export-layer="heatmap-cells"]');
    expect(svg).toBeTruthy();
    expect(cellLayer).toBeTruthy();

    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    canvas.style.width = '32px';
    canvas.style.height = '24px';
    canvas.setAttribute('data-resolution-scale', '2');
    canvas.toDataURL = jest.fn(() => 'data:image/png;base64,heatmap-cells');
    foreignObject.appendChild(canvas);
    cellLayer.appendChild(foreignObject);
    cellLayer.setAttribute('data-render-mode', 'canvas');

    const svgChildrenBefore = Array.from(svg.childNodes);
    const cellChildrenBefore = Array.from(cellLayer.childNodes);
    const mutations = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(svg, { childList: true, subtree: true });

    let cache;
    try{
      cache = heatmap.captureRenderCache({
        tabId,
        reason: 'heatmap-canvas-read-only-capture-contract'
      });
      await Promise.resolve();
    }finally{
      observer.disconnect();
    }

    expect(cache).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({
        component: 'heatmap',
        type: 'heatmap',
        tabId,
        complete: true
      })
    }));
    expect(cache.__graphitixLiveDomPreserved).toBe(true);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(cache.plot.fragment.querySelector(
      'img[data-graphitix-render-cache-canvas-bitmap="true"]'
    )?.getAttribute('src')).toBe('data:image/png;base64,heatmap-cells');
    expect(Array.from(svg.childNodes)).toEqual(svgChildrenBefore);
    expect(Array.from(cellLayer.childNodes)).toEqual(cellChildrenBefore);
    expect(svg.contains(canvas)).toBe(true);
    expect(mutations).toHaveLength(0);
  });
});
