const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120_000);

async function flushAsyncWork(iterations = 16){
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

async function activateLine(){
  const maybe = window.Main?.tabs?.handleGraphSelection?.('line', {
    reason: 'line-render-cache-test-setup'
  });
  if(maybe && typeof maybe.then === 'function'){
    await maybe;
  }
  const duplicatePrompt = document.getElementById('duplicatePrompt');
  if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
    document.getElementById('duplicateEmpty')?.click();
  }
  await flushAsyncWork(6);
}

async function loadSettledExample(mode = '2d'){
  document.getElementById('lineLoadExample')?.click();
  expect(await waitFor(() => (
    mode === '3d'
      ? document.querySelector('#linePage:not([hidden]) #lineSvg[data-view-mode="3d"] [data-line-style-role="line"][d]')
      : document.querySelector('#linePage:not([hidden]) #lineSvg path[data-render-mode="line"][d]')
  ))).toBe(true);
  await flushAsyncWork(12);
}

function captureWithoutMutation(line, tabId, mode){
  const plot = document.querySelector('#linePage:not([hidden]) #linePlot');
  const svg = plot?.querySelector('#lineSvg') || plot?.querySelector('svg');
  expect(plot).toBeTruthy();
  expect(svg).toBeTruthy();

  const childNodesBefore = Array.from(plot.childNodes);
  const renderedNodesBefore = Array.from(svg.querySelectorAll(
    'path[data-render-mode], [data-layer="line-3d-rotation-dynamic"] *'
  ));
  const mutations = [];
  const observer = new MutationObserver(records => mutations.push(...records));
  observer.observe(plot, { childList: true, subtree: true });

  let cache;
  try{
    cache = line.captureRenderCache({ tabId, reason: `line-${mode}-read-only-capture-contract` });
    return { cache, plot, svg, childNodesBefore, renderedNodesBefore, mutations };
  }finally{
    observer.disconnect();
  }
}

describe('Line render-cache capture contract', () => {
  beforeEach(async () => {
    const previousLine = window.Components?.line || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousLine?.disposeTab){
      previousTabs.filter(tab => tab?.type === 'line').forEach(tab => {
        previousLine.disposeTab(tab, { tabId: tab.id, reason: 'line-render-cache-test-reset' });
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
      preloadComponents: ['line']
    });
    await activateLine();
  });

  test('captures settled 2D and 3D SVG graphs without moving mounted children', async () => {
    const line = window.Components?.line;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    expect(line).toBeTruthy();
    expect(tabId).toBeTruthy();

    await loadSettledExample('2d');
    const twoD = captureWithoutMutation(line, tabId, '2d');
    expect(twoD.cache).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({
        component: 'line',
        type: 'line',
        tabId,
        complete: true
      })
    }));
    expect(Array.from(twoD.plot.childNodes)).toEqual(twoD.childNodesBefore);
    expect(Array.from(twoD.svg.querySelectorAll(
      'path[data-render-mode], [data-layer="line-3d-rotation-dynamic"] *'
    ))).toEqual(twoD.renderedNodesBefore);
    expect(twoD.mutations).toHaveLength(0);

    const tableFormat = document.getElementById('lineTableFormat');
    const viewMode = document.getElementById('lineViewMode');
    expect(tableFormat).toBeTruthy();
    expect(viewMode).toBeTruthy();
    tableFormat.value = '3d';
    tableFormat.dispatchEvent(new Event('change', { bubbles: true }));
    viewMode.value = '3d';
    viewMode.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(20);
    await loadSettledExample('3d');
    const threeD = captureWithoutMutation(line, tabId, '3d');
    expect(threeD.cache).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({
        component: 'line',
        type: 'line',
        tabId,
        complete: true
      })
    }));
    expect(Array.from(threeD.plot.childNodes)).toEqual(threeD.childNodesBefore);
    expect(Array.from(threeD.svg.querySelectorAll(
      'path[data-render-mode], [data-layer="line-3d-rotation-dynamic"] *'
    ))).toEqual(threeD.renderedNodesBefore);
    expect(threeD.mutations).toHaveLength(0);
  });
});
