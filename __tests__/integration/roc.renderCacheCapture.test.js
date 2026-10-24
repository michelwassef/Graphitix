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

  test('a retained inactive grid control cannot mix active controls into the old ROC session', async () => {
    const Main = window.Main;
    const roc = window.Components?.roc;
    const tabA = Main?.session?.getActiveTab?.();
    const rootA = document.querySelector('#rocPage:not([hidden])');
    const gridA = rootA?.querySelector('#rocShowGrid');
    const sessionA = roc?.__testHooks?.getSession?.(tabA?.id);
    expect(Main && roc && tabA && rootA && gridA && sessionA?.state?.controls).toBeTruthy();

    Main.tabs.handleAddTabClick();
    await flushAsyncWork(3);
    const selection = Main.tabs.handleGraphSelection('roc', { reason: 'roc-stale-grid-owner-test-b' });
    if(selection && typeof selection.then === 'function') await selection;
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if(duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')){
      document.getElementById('duplicateEmpty')?.click();
    }
    await flushAsyncWork(4);

    const tabB = Main.session.getActiveTab();
    const rootB = document.querySelector('#rocPage:not([hidden])');
    const graphTypeB = rootB?.querySelector('#rocGraphType');
    const sessionB = roc.__testHooks.getSession(tabB?.id);
    expect(tabB?.id).not.toBe(tabA.id);
    expect(rootB && graphTypeB && sessionB?.state?.controls).toBeTruthy();
    graphTypeB.value = 'pr';
    graphTypeB.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(3);
    expect(sessionB.state.controls.graphType).toBe('pr');

    const controlsA = JSON.parse(JSON.stringify(sessionA.state.controls));
    const controlsB = JSON.parse(JSON.stringify(sessionB.state.controls));
    rootA.setAttribute('data-workspace-tab-id', tabA.id);
    expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(gridA)).toBe(tabA.id);
    gridA.checked = !gridA.checked;
    gridA.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(3);

    expect(sessionA.state.controls).toEqual(controlsA);
    expect(sessionB.state.controls).toEqual(controlsB);
    const returnToA = Main.tabs.activateTab(tabA.id, { reason: 'roc-stale-grid-owner-return-a' });
    if(returnToA && typeof returnToA.then === 'function') await returnToA;
    await flushAsyncWork(4);
    const activeRootA = document.querySelector('#rocPage:not([hidden])');
    expect(activeRootA?.querySelector('#rocGraphType')?.value).toBe(controlsA.graphType);
    expect(activeRootA?.querySelector('#rocShowGrid')?.checked).toBe(controlsA.showGrid);
  });

  test('snapshot readiness with a missing explicit owner does not schedule the active ROC sibling', async () => {
    const Main = window.Main;
    const roc = window.Components?.roc;
    const activeTab = Main?.session?.getActiveTab?.();
    const activeSession = roc?.__testHooks?.getSession?.(activeTab?.id);
    const activeRoot = document.querySelector('#rocPage:not([hidden])');
    const plot = activeRoot?.querySelector('#rocPlot');
    expect(Main && roc && activeTab && activeSession && plot).toBeTruthy();

    roc.cancelCurrentDraw({ tabId: activeTab.id, reason: 'roc-stale-snapshot-owner-reset' });
    plot.replaceChildren();
    const runtimeBefore = roc.__testHooks.getDrawRuntime(activeTab.id);
    const payloadBefore = JSON.parse(JSON.stringify(activeTab.payload));
    const missingOwnerTabId = 'closed-roc-snapshot-owner';

    const readiness = await roc.awaitReadyForSnapshot({
      tabId: missingOwnerTabId,
      timeoutMs: 100,
      settleFrames: 0,
      reason: 'roc-stale-snapshot-owner'
    });
    await flushAsyncWork(6);

    expect(readiness).toEqual(expect.objectContaining({
      ok: false,
      componentKey: 'roc',
      tabId: missingOwnerTabId,
      reason: 'roc-snapshot-owner-unresolved'
    }));
    expect(roc.__testHooks.getDrawRuntime(activeTab.id)).toEqual(runtimeBefore);
    expect(activeTab.payload).toEqual(payloadBefore);
    expect(Main.session.getActiveTab()?.id).toBe(activeTab.id);
    expect(plot.querySelector('#rocSvg')).toBeNull();
  });
});
