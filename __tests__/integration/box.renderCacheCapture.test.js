const { ensureJStatStub } = require('../helpers/jstatTestStub');
const {
  loadProductionBootstrap,
  resetProductionNamespaces
} = require('../../test-support/productionLoader');

jest.setTimeout(120_000);

async function flushAsyncWork(iterations = 12){
  for(let i = 0; i < iterations; i += 1){
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

describe('Box render-cache capture contract', () => {
  let restoreJStat = null;

  beforeEach(async () => {
    jest.resetModules();
    resetProductionNamespaces();
    restoreJStat = ensureJStatStub();
    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: ['box']
    });

    const result = window.Main?.tabs?.handleGraphSelection?.('box', {
      reason: 'box-render-cache-test-setup'
    });
    if(result && typeof result.then === 'function'){
      await result;
    }
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      document.getElementById('duplicateEmpty')?.click();
    }
    await flushAsyncWork(8);
  });

  afterEach(() => {
    if(restoreJStat){
      restoreJStat();
      restoreJStat = null;
    }
    resetProductionNamespaces();
  });

  test('captures the canvas-backed plot without moving the mounted graph', () => {
    const box = window.Components?.box;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const plot = document.querySelector('#boxPage:not([hidden]) #boxPlot');
    expect(box).toBeTruthy();
    expect(tabId).toBeTruthy();
    expect(plot).toBeTruthy();

    plot.innerHTML = '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.id = 'boxSvg';
    svg.setAttribute('width', '320');
    svg.setAttribute('height', '240');
    svg.setAttribute('data-color-scheme', 'default');
    const graphBody = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    graphBody.setAttribute('data-box-shape', 'body');
    graphBody.setAttribute('d', 'M0 0 L10 0 L10 10 Z');
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 48;
    canvas.style.width = '32px';
    canvas.style.height = '24px';
    canvas.setAttribute('data-resolution-scale', '2');
    canvas.toDataURL = jest.fn(() => 'data:image/png;base64,box-points');
    canvas.getContext = jest.fn(() => ({
      getImageData: () => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })
    }));
    foreignObject.appendChild(canvas);
    svg.appendChild(graphBody);
    svg.appendChild(foreignObject);
    plot.appendChild(svg);

    const childrenBefore = Array.from(plot.childNodes);
    const svgChildrenBefore = Array.from(svg.childNodes);
    const mutations = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(plot, { childList: true, subtree: true });

    let cache;
    try{
      cache = box.captureRenderCache({
        tabId,
        reason: 'box-canvas-read-only-capture-contract'
      });
    }finally{
      observer.disconnect();
    }

    expect(cache).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({
        component: 'box',
        type: 'box',
        tabId,
        complete: true
      })
    }));
    expect(cache.__graphitixLiveDomPreserved).toBe(true);
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(cache.plot.fragment.querySelector(
      'img[data-graphitix-render-cache-canvas-bitmap="true"]'
    )?.getAttribute('src')).toBe('data:image/png;base64,box-points');
    expect(Array.from(plot.childNodes)).toEqual(childrenBefore);
    expect(Array.from(svg.childNodes)).toEqual(svgChildrenBefore);
    expect(plot.querySelector('#boxSvg')).toBe(svg);
    expect(mutations).toHaveLength(0);

    expect(box.restoreRenderCache(cache, {
      tabId,
      reason: 'box-canvas-read-only-capture-restore',
      skipStateMutation: true
    })).toBe(true);
    expect(plot.querySelector('#boxSvg')).not.toBe(svg);
    expect(plot.querySelector(
      'canvas[data-graphitix-render-cache-canvas-restored="true"], img[data-graphitix-render-cache-canvas-bitmap="true"]'
    )).toBeTruthy();
  });
});
