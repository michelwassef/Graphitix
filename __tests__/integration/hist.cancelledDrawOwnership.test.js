const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120_000);

const flush = async (turns = 12) => {
  for (let index = 0; index < turns; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

const waitFor = async predicate => {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('Histogram owner transition did not settle.');
};

describe('Histogram cancelled draw ownership', () => {
  beforeEach(async () => {
    const previousHist = window.Components?.hist || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    previousTabs.filter(tab => tab?.type === 'hist').forEach(tab => {
      previousHist?.disposeTab?.(tab, { tabId: tab.id, reason: 'hist-cancelled-draw-test-reset' });
    });
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    if (globalThis !== window) delete globalThis.Shared;
    jest.resetModules();
    loadProductionBootstrap({ vendorMode: 'fake', preloadComponents: ['hist'] });

    const activation = window.Main.tabs.handleGraphSelection('hist', {
      skipDuplicatePrompt: true,
      reason: 'hist-cancelled-draw-test-setup'
    });
    if (activation && typeof activation.then === 'function') await activation;
    await flush();
  });

  test('a cancelled delayed draw settles as cancelled', async () => {
    const hist = window.Components.hist;
    const shared = window.Shared;
    const tab = window.Main.session.getActiveTab();
    const session = hist.__testHooks.getSession(tab.id);
    const example = document.querySelector('#histPage:not([hidden]) #histLoadExample');
    expect(example && session).toBeTruthy();
    const initialCursor = shared.componentLifecycle.getLifecycleEventCursor();
    example.click();
    await shared.componentLifecycle.waitForLifecycleEvent({
      componentKey: 'hist',
      tabId: tab.id,
      action: 'draw-settled',
      afterCursor: initialCursor,
      timeoutMs: 30_000
    });

    const originalCreateExecutionContext = shared.jobs.createExecutionContext;
    let releaseCheckpoint;
    let signalCheckpointStarted;
    const paused = new Promise(resolve => { releaseCheckpoint = resolve; });
    const started = new Promise(resolve => { signalCheckpointStarted = resolve; });
    let cancelDraw = false;
    shared.jobs.createExecutionContext = options => {
      const execution = originalCreateExecutionContext(options);
      if (options.component !== 'hist' || options.tabId !== tab.id || options.kind !== 'graph' || !execution) {
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
      const hot = session.managers.hot;
      expect(hot?.setDataAtCell).toBeTruthy();
      const settledCursor = shared.componentLifecycle.getLifecycleEventCursor();
      hot.setDataAtCell(1, 1, String(Number(hot.getDataAtCell(1, 1)) + 1));
      await Promise.race([
        started,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Histogram draw did not start.')), 30_000))
      ]);

      const settled = shared.componentLifecycle.waitForLifecycleEvent({
        componentKey: 'hist',
        tabId: tab.id,
        action: 'draw-settled',
        afterCursor: settledCursor,
        timeoutMs: 30_000
      });
      cancelDraw = true;
      releaseCheckpoint();
      const event = await settled;
      expect(event.phase).toBe('cancelled');
    } finally {
      releaseCheckpoint();
      shared.jobs.createExecutionContext = originalCreateExecutionContext;
    }
  });

  test('an A draw cancelled by switching to B leaves B payload, table, and graph unchanged', async () => {
    const hist = window.Components.hist;
    const main = window.Main;
    const shared = window.Shared;
    const tabA = main.session.getActiveTab();
    const sessionA = hist.__testHooks.getSession(tabA.id);
    const example = document.querySelector('#histPage:not([hidden]) #histLoadExample');
    expect(example && sessionA).toBeTruthy();
    const initialCursor = shared.componentLifecycle.getLifecycleEventCursor();
    example.click();
    await shared.componentLifecycle.waitForLifecycleEvent({
      componentKey: 'hist',
      tabId: tabA.id,
      action: 'draw-settled',
      afterCursor: initialCursor,
      timeoutMs: 30_000
    });

    let releaseCheckpoint;
    let signalCheckpointStarted;
    const paused = new Promise(resolve => { releaseCheckpoint = resolve; });
    const started = new Promise(resolve => { signalCheckpointStarted = resolve; });
    const originalCreateExecutionContext = shared.jobs.createExecutionContext;
    shared.jobs.createExecutionContext = options => {
      const execution = originalCreateExecutionContext(options);
      if (options.component !== 'hist' || options.tabId !== tabA.id || options.kind !== 'graph' || !execution) {
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
      const hotA = sessionA.managers.hot;
      expect(hotA?.setDataAtCell).toBeTruthy();
      const settledCursor = shared.componentLifecycle.getLifecycleEventCursor();
      hotA.setDataAtCell(1, 1, String(Number(hotA.getDataAtCell(1, 1)) + 1));
      await Promise.race([
        started,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Histogram A draw did not reach its checkpoint.')), 30_000))
      ]);
      const ownerABefore = {
        payload: JSON.stringify(tabA.payload || null),
        table: JSON.stringify(hotA.getData?.() || [])
      };

      const added = main.tabs.handleAddTabClick();
      if (added && typeof added.then === 'function') await added;
      await flush();
      const selection = main.tabs.handleGraphSelection('hist', {
        skipDuplicatePrompt: true,
        reason: 'hist-cancelled-draw-create-empty-sibling'
      });
      if (selection && typeof selection.then === 'function') await selection;
      await flush();
      const tabB = main.session.getActiveTab();
      expect(tabB.id).not.toBe(tabA.id);
      const activation = main.tabs.activateTab(tabB.id, { reason: 'hist-cancelled-draw-switch-to-b' });
      if (activation && typeof activation.then === 'function') await activation;
      await waitFor(() => main.session.getActiveTab()?.id === tabB.id);

      const sessionB = hist.__testHooks.getSession(tabB.id);
      const rootB = sessionB.root || sessionB.refs.root || shared.workspaceTabs.getMountedRoot(tabB, 'hist');
      const hotB = sessionB.managers.hot;
      const before = {
        payload: JSON.stringify(tabB.payload || null),
        state: JSON.stringify(sessionB.state),
        table: JSON.stringify(hotB?.getData?.() || []),
        plot: rootB?.querySelector('#histPlot')?.innerHTML || ''
      };
      const settled = shared.componentLifecycle.waitForLifecycleEvent({
        componentKey: 'hist',
        tabId: tabA.id,
        action: 'draw-settled',
        afterCursor: settledCursor,
        timeoutMs: 30_000
      });
      releaseCheckpoint();
      const event = await settled;

      expect(event.phase).toBe('cancelled');
      expect(JSON.stringify(tabA.payload || null)).toBe(ownerABefore.payload);
      expect(JSON.stringify(hotA.getData?.() || [])).toBe(ownerABefore.table);
      expect(JSON.stringify(tabB.payload || null)).toBe(before.payload);
      expect(JSON.stringify(sessionB.state)).toBe(before.state);
      expect(JSON.stringify(hotB?.getData?.() || [])).toBe(before.table);
      expect(rootB?.querySelector('#histPlot')?.innerHTML || '').toBe(before.plot);
    } finally {
      releaseCheckpoint();
      shared.jobs.createExecutionContext = originalCreateExecutionContext;
    }
  });
});
