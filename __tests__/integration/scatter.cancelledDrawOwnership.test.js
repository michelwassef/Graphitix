const { loadProductionBootstrap } = require('../../test-support/productionLoader');
const { waitForIntegrationOwnerReady } = require('../../test-support/readiness');

jest.setTimeout(120_000);

const switchToEmptyScatterTab = async main => {
  const result = main.tabs.handleAddTabClick();
  if (result && typeof result.then === 'function') await result;
  await new Promise(resolve => setTimeout(resolve, 0));
  const duplicatePrompt = document.getElementById('duplicatePrompt');
  if (duplicatePrompt && !duplicatePrompt.hidden) {
    document.getElementById('duplicateEmpty').click();
  }
  await new Promise(resolve => setTimeout(resolve, 0));
  const tab = main.session.getActiveTab();
  const activation = main.tabs.activateTab(tab.id, { reason: 'scatter-cancelled-draw-switch' });
  if (activation && typeof activation.then === 'function') await activation;
  return tab;
};

describe('Scatter cancelled draw ownership', () => {
  beforeEach(async () => {
    const previousScatter = window.Components?.scatter || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    previousTabs.filter(tab => tab?.type === 'scatter').forEach(tab => {
      previousScatter?.disposeTab?.(tab, { tabId: tab.id, reason: 'scatter-cancelled-draw-test-reset' });
    });
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    if (globalThis !== window) delete globalThis.Shared;
    jest.resetModules();
    loadProductionBootstrap({ vendorMode: 'fake', preloadComponents: ['scatter'] });
    const activation = window.Main.tabs.handleGraphSelection('scatter', {
      skipDuplicatePrompt: true,
      reason: 'scatter-cancelled-draw-test-setup'
    });
    if (activation && typeof activation.then === 'function') await activation;
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  test('a delayed draw cancelled by switching tabs leaves its owner data dirty', async () => {
    const scatter = window.Components.scatter;
    const main = window.Main;
    const tabA = main.session.getActiveTab();
    const sessionA = scatter.__testHooks.getSession(tabA.id);
    const exampleButton = document.querySelector('#scatterPage:not([hidden]) #scatterLoadExample');
    expect(exampleButton).toBeTruthy();
    exampleButton.click();
    await waitForIntegrationOwnerReady({
      type: 'scatter',
      expectedTabId: tabA.id,
      timeout: 30_000,
      condition: () => sessionA.cache.renderRuntime.dataDirty === false
        && !!sessionA.cache.renderRuntime.cachedCollect
        && sessionA.timers.drawRuntime.inProgress !== true
    });

    const hot = scatter.__getActiveHot();
    expect(hot?.getDataAtCell).toBeTruthy();
    expect(sessionA.cache.renderRuntime.dataDirty).toBe(false);

    const shared = window.Shared;
    const previousCreateYieldController = shared.jobs.createYieldController;
    let releaseCheckpoint;
    let signalCheckpointStarted;
    const checkpointStarted = new Promise(resolve => { signalCheckpointStarted = resolve; });
    const delayedCheckpoint = new Promise(resolve => { releaseCheckpoint = resolve; });
    let checkpointPaused = false;
    shared.jobs.createYieldController = () => ({
      checkpoint: async () => {
        if (!checkpointPaused && sessionA.cache.renderRuntime.cachedCollect) {
          checkpointPaused = true;
          signalCheckpointStarted();
          await delayedCheckpoint;
        }
      }
    });

    try {
      const oldValue = Number(hot.getDataAtCell(1, 1)) || 0;
      hot.setDataAtCell(1, 1, String(oldValue + 10));
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Scatter draw did not reach the delayed render checkpoint.')), 30_000);
        checkpointStarted.then(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
      expect(sessionA.timers.drawRuntime.inProgress).toBe(true);

      const tabB = await switchToEmptyScatterTab(main);
      const sessionB = scatter.__testHooks.getSession(tabB.id, { create: true });
      const payloadBBefore = JSON.stringify(tabB.payload || null);
      const hotBBefore = JSON.stringify(scatter.__getActiveHot()?.getData?.() || []);
      const sessionBRevisionBefore = sessionB.cache.renderRuntime.dataRevision;
      const settledAfter = shared.componentLifecycle.getLifecycleEventCursor();
      expect(tabB.id).not.toBe(tabA.id);
      expect(main.session.getActiveTab()?.id).toBe(tabB.id);

      const drawSettled = shared.componentLifecycle.waitForLifecycleEvent({
        componentKey: 'scatter',
        tabId: tabA.id,
        action: 'draw-settled',
        afterCursor: settledAfter,
        timeoutMs: 30_000
      });
      releaseCheckpoint();
      const settledEvent = await drawSettled;

      expect(main.session.getActiveTab()?.id).toBe(tabB.id);
      expect(settledEvent.phase).toBe('cancelled');
      expect(sessionA.cache.renderRuntime.dataDirty).toBe(true);
      expect(sessionB.cache.renderRuntime.dataRevision).toBe(sessionBRevisionBefore);
      expect(JSON.stringify(tabB.payload || null)).toBe(payloadBBefore);
      expect(JSON.stringify(scatter.__getActiveHot()?.getData?.() || [])).toBe(hotBBefore);
    } finally {
      releaseCheckpoint();
      shared.jobs.createYieldController = previousCreateYieldController;
    }
  });
});
