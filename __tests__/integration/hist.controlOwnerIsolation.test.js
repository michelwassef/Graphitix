const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120000);

const flush = async (count = 12) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

describe('Histogram control owner isolation', () => {
  beforeEach(async () => {
    const previousHist = window.Components?.hist || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    previousTabs.filter(tab => tab?.type === 'hist').forEach(tab => {
      previousHist?.disposeTab?.(tab, { tabId: tab.id, reason: 'hist-control-owner-test-reset' });
    });
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    if (globalThis !== window) delete globalThis.Shared;
    jest.resetModules();
    loadProductionBootstrap({ vendorMode: 'fake', preloadComponents: ['hist'] });

    const activation = window.Main?.tabs?.handleGraphSelection?.('hist', {
      reason: 'hist-control-owner-test-setup'
    });
    if (activation && typeof activation.then === 'function') await activation;
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if (duplicatePrompt && !duplicatePrompt.hasAttribute('hidden')) {
      document.getElementById('duplicateEmpty')?.click();
    }
    await flush();
  });

  test('an inactive tab legend event cannot write through the active Histogram mirror', async () => {
    const component = window.Components?.hist;
    const workspace = window.Main?.session;
    const tabA = workspace?.getActiveTab?.();
    const rootA = document.querySelector('#histPage:not([hidden])');
    const legendA = rootA?.querySelector('#histShowLegend');
    const sessionA = component?.__testHooks?.getSession(tabA?.id);
    expect(component && workspace && tabA && rootA && legendA && sessionA).toBeTruthy();

    legendA.checked = false;
    legendA.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(sessionA.state.showLegend).toBe(false);

    window.Main?.tabs?.handleAddTabClick?.();
    const activation = window.Main?.tabs?.handleGraphSelection?.('hist', {
      skipDuplicatePrompt: true,
      reason: 'hist-control-owner-test-second-tab'
    });
    if (activation && typeof activation.then === 'function') await activation;
    await flush();

    const tabB = workspace.getActiveTab();
    const rootB = document.querySelector('#histPage:not([hidden])');
    const legendB = rootB?.querySelector('#histShowLegend');
    const sessionB = component.__testHooks.getSession(tabB?.id);
    expect(tabB?.id).not.toBe(tabA.id);
    expect(rootB && legendB && sessionB).toBeTruthy();

    legendB.checked = false;
    legendB.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(sessionB.state.showLegend).toBe(false);

    try {
      rootA.setAttribute('data-workspace-tab-id', tabA.id);
      expect(window.Shared.componentLifecycle.resolveTabIdFromTarget(legendA)).toBe(tabA.id);
      legendA.checked = true;
      legendA.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
      expect(sessionA.state.showLegend).toBe(false);
      expect(sessionB.state.showLegend).toBe(false);
    } finally {
      rootB.setAttribute('data-workspace-tab-id', tabB.id);
    }
  });

  test('optional diagnostics wait for the owner-bound Calculate statistics action', async () => {
    const component = window.Components?.hist;
    const workspace = window.Main?.session;
    const tab = workspace?.getActiveTab?.();
    expect(component && tab).toBeTruthy();
    const payload = component.createEmptyPayload();
    payload.data = [['Values'], [1], [2], [3], [4], [5], [6]];
    payload.config.stats = { diagnosticsMode: 'normal-fit', comparisonMode: 'off' };
    component.loadFromPayload(payload, {
      source: 'hist-statistics-action-test',
      tab,
      tabId: tab.id
    });
    await flush();

    const goodnessOfFit = jest.spyOn(window.Shared.stats, 'goodnessOfFit');
    try{
      await component.draw({ reason: 'hist-statistics-action-test-draw', tabId: tab.id });
      expect(goodnessOfFit).not.toHaveBeenCalled();
      expect(document.getElementById('histStatsResults')?.textContent || '').not.toMatch(/Normal fit diagnostics/i);
      expect(document.getElementById('histComputeStats')?.disabled).toBe(false);

      document.getElementById('histComputeStats').click();
      await flush(40);
      expect(goodnessOfFit).toHaveBeenCalled();
      expect(document.getElementById('histStatsResults')?.textContent || '').toMatch(/Normal fit diagnostics/i);
      expect(component.__testHooks.getSession(tab.id).results.statsPanelModel.analysisSignature).toMatch(/^hist-stats-v1-/);
    }finally{
      goodnessOfFit.mockRestore();
    }
  });
});
