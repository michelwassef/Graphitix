const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120_000);

const flush = async (turns = 12) => {
  for (let index = 0; index < turns; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

describe('Pie cancelled draw ownership', () => {
  beforeEach(async () => {
    const previousPie = window.Components?.pie || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    previousTabs.filter(tab => tab?.type === 'pie').forEach(tab => {
      previousPie?.disposeTab?.(tab, { tabId: tab.id, reason: 'pie-cancelled-draw-test-reset' });
    });
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    if (globalThis !== window) delete globalThis.Shared;
    jest.resetModules();
    loadProductionBootstrap({ vendorMode: 'fake', preloadComponents: ['pie'] });

    const activation = window.Main.tabs.handleGraphSelection('pie', {
      skipDuplicatePrompt: true,
      reason: 'pie-cancelled-draw-test-setup'
    });
    if (activation && typeof activation.then === 'function') await activation;
    await flush();
  });

  test('a cancelled delayed draw settles as cancelled', async () => {
    const pie = window.Components.pie;
    const shared = window.Shared;
    const tab = window.Main.session.getActiveTab();
    const session = pie.__testHooks.getSession(tab.id);
    const example = document.querySelector('#piePage:not([hidden]) #pieLoadExample');
    expect(example && session).toBeTruthy();
    const initialCursor = shared.componentLifecycle.getLifecycleEventCursor();
    example.click();
    await shared.componentLifecycle.waitForLifecycleEvent({
      componentKey: 'pie',
      tabId: tab.id,
      action: 'draw-settled',
      afterCursor: initialCursor,
      timeoutMs: 30_000
    });

    let releaseCheckpoint;
    let signalCheckpointStarted;
    const paused = new Promise(resolve => { releaseCheckpoint = resolve; });
    const started = new Promise(resolve => { signalCheckpointStarted = resolve; });
    let cancelDraw = false;
    const originalCreateExecutionContext = shared.jobs.createExecutionContext;
    shared.jobs.createExecutionContext = options => {
      const execution = originalCreateExecutionContext(options);
      if (options.component !== 'pie' || options.tabId !== tab.id || options.kind !== 'graph' || !execution) {
        return execution;
      }
      return {
        ...execution,
        isCurrent: () => !cancelDraw && execution.isCurrent(),
        checkpoint: async () => {
          signalCheckpointStarted();
          await paused;
          if (cancelDraw) throw new Error('Cancelled test draw.');
          return execution.checkpoint();
        }
      };
    };

    try {
      const settledCursor = shared.componentLifecycle.getLifecycleEventCursor();
      const draw = pie.draw({ tabId: tab.id, reason: 'pie-cancelled-draw-test' });
      await Promise.race([
        started,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Pie draw did not reach the delayed checkpoint.')), 30_000))
      ]);
      const settled = shared.componentLifecycle.waitForLifecycleEvent({
        componentKey: 'pie',
        tabId: tab.id,
        action: 'draw-settled',
        afterCursor: settledCursor,
        timeoutMs: 30_000
      });
      pie.cancelCurrentDraw({ tabId: tab.id, reason: 'pie-cancelled-draw-test-cancel' });
      cancelDraw = true;
      releaseCheckpoint();
      const [event] = await Promise.all([settled, draw]);
      expect(event.phase).toBe('cancelled');
    } finally {
      releaseCheckpoint();
      shared.jobs.createExecutionContext = originalCreateExecutionContext;
    }
  });

  test('a delayed draw cancelled by switching tabs leaves the sibling owner untouched', async () => {
    const pie = window.Components.pie;
    const main = window.Main;
    const shared = window.Shared;
    const tabA = main.session.getActiveTab();
    const sessionA = pie.__testHooks.getSession(tabA.id);
    const example = document.querySelector('#piePage:not([hidden]) #pieLoadExample');
    expect(example && sessionA).toBeTruthy();
    const initialCursor = shared.componentLifecycle.getLifecycleEventCursor();
    example.click();
    await shared.componentLifecycle.waitForLifecycleEvent({
      componentKey: 'pie',
      tabId: tabA.id,
      action: 'draw-settled',
      afterCursor: initialCursor,
      timeoutMs: 30_000
    });

    const hotA = sessionA.managers.hot;
    expect(hotA?.setDataAtCell).toBeTruthy();
    let releaseCheckpoint;
    let signalCheckpointStarted;
    const paused = new Promise(resolve => { releaseCheckpoint = resolve; });
    const started = new Promise(resolve => { signalCheckpointStarted = resolve; });
    const originalCreateExecutionContext = shared.jobs.createExecutionContext;
    shared.jobs.createExecutionContext = options => {
      const execution = originalCreateExecutionContext(options);
      if (options.component !== 'pie' || options.tabId !== tabA.id || options.kind !== 'graph' || !execution) {
        return execution;
      }
      return {
        ...execution,
        checkpoint: async () => {
          signalCheckpointStarted();
          await paused;
          return execution.checkpoint();
        }
      };
    };

    try {
      const settledCursor = shared.componentLifecycle.getLifecycleEventCursor();
      const oldValue = Number(hotA.getDataAtCell(1, 1)) || 0;
      hotA.setDataAtCell(1, 1, String(oldValue + 1));
      await Promise.race([
        started,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Pie A draw did not reach the delayed checkpoint.')), 30_000))
      ]);

      const ownerABefore = {
        payload: JSON.stringify(tabA.payload || null),
        state: JSON.stringify(sessionA.state),
        table: JSON.stringify(hotA.getData?.() || [])
      };
      const added = main.tabs.handleAddTabClick();
      if (added && typeof added.then === 'function') await added;
      await flush();
      const duplicatePrompt = document.getElementById('duplicatePrompt');
      if (duplicatePrompt && !duplicatePrompt.hidden) {
        document.getElementById('duplicateEmpty')?.click();
      }
      await flush();
      const selection = main.tabs.handleGraphSelection('pie', {
        skipDuplicatePrompt: true,
        reason: 'pie-cancelled-draw-create-empty-sibling'
      });
      if (selection && typeof selection.then === 'function') await selection;
      await flush();
      const tabB = main.session.getActiveTab();
      expect(tabB.id).not.toBe(tabA.id);
      const activation = main.tabs.activateTab(tabB.id, { reason: 'pie-cancelled-draw-switch-to-b' });
      if (activation && typeof activation.then === 'function') await activation;
      await flush();

      const sessionB = pie.__testHooks.getSession(tabB.id);
      const hotB = sessionB?.managers?.hot;
      const rootB = sessionB?.root || sessionB?.refs?.root || shared.workspaceTabs.getMountedRoot(tabB, 'pie');
      const ownerBBefore = {
        payload: JSON.stringify(tabB.payload || null),
        state: JSON.stringify(sessionB?.state || null),
        table: JSON.stringify(hotB?.getData?.() || []),
        plot: rootB?.querySelector('#piePlot')?.innerHTML || ''
      };
      const settled = shared.componentLifecycle.waitForLifecycleEvent({
        componentKey: 'pie',
        tabId: tabA.id,
        action: 'draw-settled',
        afterCursor: settledCursor,
        timeoutMs: 30_000
      });
      releaseCheckpoint();
      const event = await settled;

      expect(event.phase).toBe('cancelled');
      expect(JSON.stringify(tabA.payload || null)).toBe(ownerABefore.payload);
      expect(JSON.stringify(sessionA.state)).toBe(ownerABefore.state);
      expect(JSON.stringify(hotA.getData?.() || [])).toBe(ownerABefore.table);
      expect(JSON.stringify(tabB.payload || null)).toBe(ownerBBefore.payload);
      expect(JSON.stringify(sessionB.state)).toBe(ownerBBefore.state);
      expect(JSON.stringify(hotB?.getData?.() || [])).toBe(ownerBBefore.table);
      expect(rootB?.querySelector('#piePlot')?.innerHTML || '').toBe(ownerBBefore.plot);
      expect(main.session.getActiveTab()?.id).toBe(tabB.id);
    } finally {
      releaseCheckpoint();
      shared.jobs.createExecutionContext = originalCreateExecutionContext;
    }
  });
});
