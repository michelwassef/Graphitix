const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120_000);

async function flushAsyncWork(iterations = 12){
  for(let i = 0; i < iterations; i += 1){
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function activateVenn(){
  const maybe = window.Main?.tabs?.handleGraphSelection?.('venn', {
    reason: 'venn-render-cache-test-setup'
  });
  if(maybe && typeof maybe.then === 'function'){
    await maybe;
  }
  const duplicatePrompt = document.getElementById('duplicatePrompt');
  if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
    document.getElementById('duplicateEmpty')?.click();
  }
  await flushAsyncWork(4);
}

function captureWithoutMutation(venn, tabId, mode){
  const stage = document.querySelector('#vennPage:not([hidden]) #stage');
  expect(stage).toBeTruthy();

  const childNodesBefore = Array.from(stage.childNodes);
  const graphMarksBefore = Array.from(stage.querySelectorAll(
    '[data-venn-trace-id], [data-upset-trace-kind][data-upset-trace-id]'
  ));
  const mutations = [];
  const observer = new MutationObserver(records => mutations.push(...records));
  observer.observe(stage, { childList: true, subtree: true });

  let cache;
  try{
    cache = venn.captureRenderCache({ tabId, reason: `venn-${mode}-read-only-capture-contract` });
  }finally{
    observer.disconnect();
  }

  expect(cache).toEqual(expect.objectContaining({
    graphOnly: true,
    __graphitixRenderCache: expect.objectContaining({
      component: 'venn',
      type: 'venn',
      tabId,
      complete: true
    })
  }));
  expect(Array.from(stage.childNodes)).toEqual(childNodesBefore);
  expect(Array.from(stage.querySelectorAll(
    '[data-venn-trace-id], [data-upset-trace-kind][data-upset-trace-id]'
  ))).toEqual(graphMarksBefore);
  expect(mutations).toHaveLength(0);
}

describe('Venn render-cache capture contract', () => {
  beforeEach(async () => {
    const previousVenn = window.Components?.venn || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousVenn?.disposeTab){
      previousTabs.filter(tab => tab?.type === 'venn').forEach(tab => {
        previousVenn.disposeTab(tab, { tabId: tab.id, reason: 'venn-render-cache-test-reset' });
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
      preloadComponents: ['venn']
    });
    await activateVenn();
  });

  test('captures both Venn and UpSet stages without moving mounted children', async () => {
    const venn = window.Components?.venn;
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const hooks = venn?.__testHooks;
    expect(venn).toBeTruthy();
    expect(tabId).toBeTruthy();
    expect(hooks?.state?.ui?.inputs).toBeTruthy();

    hooks.state.ui.inputs.A.value = 'GeneA\nGeneShared';
    hooks.state.ui.inputs.B.value = 'GeneB\nGeneShared';
    hooks.state.ui.inputs.C.value = 'GeneC';
    hooks.state.ui.syncTableFromInputs?.({ refresh: true });
    venn.refreshDiagram();
    await flushAsyncWork(4);
    expect(document.querySelector('#vennPage:not([hidden]) #stage [data-venn-trace-id]')).toBeTruthy();
    captureWithoutMutation(venn, tabId, 'venn');

    const plotType = document.querySelector('#vennPage:not([hidden]) #vennPlotType');
    expect(plotType).toBeTruthy();
    plotType.value = 'upset';
    plotType.dispatchEvent(new Event('change', { bubbles: true }));
    venn.refreshDiagram();
    await flushAsyncWork(4);
    expect(document.querySelector(
      '#vennPage:not([hidden]) #stage [data-upset-trace-kind][data-upset-trace-id]'
    )).toBeTruthy();
    captureWithoutMutation(venn, tabId, 'upset');
  });
});
