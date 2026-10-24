const { loadProductionBootstrap } = require('../../test-support/productionLoader');

jest.setTimeout(120_000);

const flush = async (turns = 12) => {
  for (let index = 0; index < turns; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};

describe('Venn cancelled draw ownership', () => {
  beforeEach(async () => {
    const previousVenn = window.Components?.venn || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    previousTabs.filter(tab => tab?.type === 'venn').forEach(tab => {
      previousVenn?.disposeTab?.(tab, { tabId: tab.id, reason: 'venn-cancelled-draw-test-reset' });
    });
    delete window.Main;
    delete window.Components;
    delete window.Shared;
    if (globalThis !== window) delete globalThis.Shared;
    jest.resetModules();
    loadProductionBootstrap({ vendorMode: 'fake', preloadComponents: ['venn'] });

    const activation = window.Main.tabs.handleGraphSelection('venn', {
      skipDuplicatePrompt: true,
      reason: 'venn-cancelled-draw-test-setup'
    });
    if (activation && typeof activation.then === 'function') await activation;
    await flush();
  });

  test('a cancelled draw cannot clear a newer queued request for its owner', async () => {
    const venn = window.Components.venn;
    const shared = window.Shared;
    const tab = window.Main.session.getActiveTab();
    const session = venn.__testHooks.getSession(tab.id);
    const state = venn.__testHooks.state;
    expect(venn && session && state.ui.inputs).toBeTruthy();

    state.ui.inputs.A.value = 'BRCA1\nATM\nBAP1';
    state.ui.inputs.B.value = 'BRCA1\nBAP1\nRING1B';
    state.ui.inputs.C.value = '';
    state.analysis.lastDrawMode = 'lists';
    state.ui.syncTableFromInputs?.({ refresh: true, scheduleDraw: false, scheduleSpecies: false });
    await venn.draw({ tabId: tab.id, reason: 'venn-cancelled-draw-baseline' });

    const originalCreateYieldController = shared.jobs.createYieldController;
    const originalCreateExecutionContext = shared.jobs.createExecutionContext;
    let releaseCheckpoint;
    let signalCheckpointStarted;
    const checkpointStarted = new Promise(resolve => { signalCheckpointStarted = resolve; });
    const delayedCheckpoint = new Promise(resolve => { releaseCheckpoint = resolve; });
    let checkpointPaused = false;
    let cancelFirstExecution = false;
    shared.jobs.createYieldController = () => ({
      checkpoint: async () => {
        if (!checkpointPaused) {
          checkpointPaused = true;
          signalCheckpointStarted();
          await delayedCheckpoint;
        }
      }
    });
    shared.jobs.createExecutionContext = options => {
      const execution = originalCreateExecutionContext(options);
      if (options.component !== 'venn' || options.tabId !== tab.id || !execution) return execution;
      return {
        ...execution,
        isCurrent: () => !cancelFirstExecution && execution.isCurrent()
      };
    };
    const originalScheduleDraw = state.ui.scheduleDraw;

    try {
      const drawCursor = shared.componentLifecycle.getLifecycleEventCursor();
      expect(venn.__testHooks.scheduleDrawForSession(session, {
        tabId: tab.id,
        reason: 'venn-cancelled-draw-first'
      })).toBe(true);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Venn draw did not reach its delayed checkpoint.')), 30_000);
        checkpointStarted.then(() => {
          clearTimeout(timeout);
          resolve();
        });
      });

      state.ui.scheduleDraw = options => options;
      session.timers.scheduleDraw = state.ui.scheduleDraw;
      expect(venn.__testHooks.scheduleDrawForSession(session, {
        tabId: tab.id,
        reason: 'venn-cancelled-draw-newer'
      })).toBe(true);
      expect(session.state.drawPending).toBe(true);
      expect(session.timers.pendingDrawOptions.reason).toBe('venn-cancelled-draw-newer');

      const settled = shared.componentLifecycle.waitForLifecycleEvent({
        componentKey: 'venn',
        tabId: tab.id,
        action: 'draw-settled',
        afterCursor: drawCursor,
        timeoutMs: 30_000
      });
      cancelFirstExecution = true;
      releaseCheckpoint();
      const settledEvent = await settled;

      expect(settledEvent.phase).toBe('cancelled');
      expect(session.state.drawPending).toBe(true);
      expect(session.timers.pendingDrawOptions.reason).toBe('venn-cancelled-draw-newer');
    } finally {
      releaseCheckpoint();
      state.ui.scheduleDraw = originalScheduleDraw;
      session.timers.scheduleDraw = originalScheduleDraw;
      shared.jobs.createYieldController = originalCreateYieldController;
      shared.jobs.createExecutionContext = originalCreateExecutionContext;
    }
  });

  test('a draw completing after its owner tab is removed cannot clear sibling pending work', async () => {
    const venn = window.Components.venn;
    const main = window.Main;
    const shared = window.Shared;
    const tabA = main.session.getActiveTab();
    const sessionA = venn.__testHooks.getSession(tabA.id);
    const stateA = venn.__getState();
    stateA.ui.inputs.A.value = 'A_ONLY';
    stateA.ui.inputs.B.value = 'A_SHARED';
    stateA.analysis.lastDrawMode = 'lists';
    stateA.ui.syncTableFromInputs?.({ refresh: true, scheduleDraw: false, scheduleSpecies: false });

    const originalCreateYieldController = shared.jobs.createYieldController;
    const originalCreateExecutionContext = shared.jobs.createExecutionContext;
    let releaseCheckpoint;
    let signalCheckpointStarted;
    const checkpointStarted = new Promise(resolve => { signalCheckpointStarted = resolve; });
    const delayedCheckpoint = new Promise(resolve => { releaseCheckpoint = resolve; });
    let checkpointPaused = false;
    let cancelFirstExecution = false;
    shared.jobs.createYieldController = () => ({
      checkpoint: async () => {
        if (checkpointPaused) return;
        checkpointPaused = true;
        signalCheckpointStarted();
        await delayedCheckpoint;
      }
    });
    shared.jobs.createExecutionContext = options => {
      const execution = originalCreateExecutionContext(options);
      if (options.component !== 'venn' || options.tabId !== tabA.id || !execution) return execution;
      return { ...execution, isCurrent: () => !cancelFirstExecution && execution.isCurrent() };
    };
    const originalScheduleDrawA = stateA.ui.scheduleDraw;
    let tabB = null;
    let sessionB = null;
    let stateB = null;
    let originalScheduleDrawB = null;
    let settled = null;
    try {
      const drawCursor = shared.componentLifecycle.getLifecycleEventCursor();
      expect(venn.__testHooks.scheduleDrawForSession(sessionA, {
        tabId: tabA.id,
        reason: 'venn-removed-draw-start-a'
      })).toBe(true);
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Venn draw did not reach its delayed checkpoint.')), 30_000);
        checkpointStarted.then(() => { clearTimeout(timeout); resolve(); });
      });

      main.tabs.handleAddTabClick();
      await flush();
      const selection = main.tabs.handleGraphSelection('venn', { reason: 'venn-removed-draw-create-b' });
      if (selection && typeof selection.then === 'function') await selection;
      const duplicatePrompt = document.getElementById('duplicatePrompt');
      if (duplicatePrompt && !duplicatePrompt.hidden) document.getElementById('duplicateEmpty').click();
      await flush();
      tabB = main.session.getActiveTab();
      sessionB = venn.__testHooks.getSession(tabB.id);
      stateB = venn.__getState();
      expect(tabB.id).not.toBe(tabA.id);
      const rootB = shared.workspaceTabs.getMountedRoot(tabB.id, 'venn');
      const inputBBefore = stateB.ui.inputs.A.value;
      const payloadBBefore = JSON.stringify(tabB.payload || null);

      originalScheduleDrawB = stateB.ui.scheduleDraw;
      stateB.ui.scheduleDraw = options => options;
      sessionB.timers.scheduleDraw = stateB.ui.scheduleDraw;
      expect(venn.__testHooks.scheduleDrawForSession(sessionB, {
        tabId: tabB.id,
        reason: 'venn-removed-draw-pending-b'
      })).toBeTruthy();
      expect(sessionB.state.drawPending).toBe(true);
      expect(sessionB.timers.pendingDrawOptions.reason).toBe('venn-removed-draw-pending-b');

      const closeA = main.tabs.closeTab(tabA.id, {
        force: true,
        skipPrompt: true,
        reason: 'venn-removed-draw-close-a'
      });
      if (closeA && typeof closeA.then === 'function') await closeA;
      await flush();
      expect(main.session.getActiveTab().id).toBe(tabB.id);
      expect(venn.__testHooks.getSession(tabA.id, { create: false })).toBeNull();

      settled = shared.componentLifecycle.waitForLifecycleEvent({
        componentKey: 'venn',
        tabId: tabA.id,
        action: 'draw-settled',
        afterCursor: drawCursor,
        timeoutMs: 30_000
      });
      cancelFirstExecution = true;
      releaseCheckpoint();
      const settledEvent = await settled;

      expect(settledEvent.phase).toBe('cancelled');
      expect(sessionB.state.drawPending).toBe(true);
      expect(sessionB.timers.pendingDrawOptions.reason).toBe('venn-removed-draw-pending-b');
      expect(venn.__boundTabId).toBe(tabB.id);
      expect(stateB.ui.root).toBe(rootB);
      expect(stateB.ui.inputs.A.value).toBe(inputBBefore);
      expect(JSON.stringify(tabB.payload || null)).toBe(payloadBBefore);
    } finally {
      releaseCheckpoint();
      if(originalScheduleDrawB && stateB && sessionB){
        stateB.ui.scheduleDraw = originalScheduleDrawB;
        sessionB.timers.scheduleDraw = originalScheduleDrawB;
      }
      if(originalScheduleDrawA && sessionA){ sessionA.timers.scheduleDraw = originalScheduleDrawA; }
      shared.jobs.createYieldController = originalCreateYieldController;
      shared.jobs.createExecutionContext = originalCreateExecutionContext;
    }
  });

  test('a delayed Venn draw does not render into a sibling activated before its owner resumes', async () => {
    const venn = window.Components.venn;
    const main = window.Main;
    const shared = window.Shared;
    const tabA = main.session.getActiveTab();
    const stateA = venn.__getState();
    const sessionA = venn.__testHooks.getSession(tabA.id);
    stateA.ui.inputs.A.value = 'A_ONLY';
    stateA.ui.inputs.B.value = 'A_SHARED';
    stateA.analysis.lastDrawMode = 'lists';
    stateA.ui.syncTableFromInputs?.({ refresh: true, scheduleDraw: false, scheduleSpecies: false });
    await venn.draw({ tabId: tabA.id, reason: 'venn-stale-draw-baseline-a' });

    main.tabs.handleAddTabClick();
    await flush();
    const selection = main.tabs.handleGraphSelection('venn', { reason: 'venn-stale-draw-create-b' });
    if (selection && typeof selection.then === 'function') await selection;
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if (duplicatePrompt && !duplicatePrompt.hidden) document.getElementById('duplicateEmpty').click();
    await flush();

    const tabB = main.session.getActiveTab();
    const stateB = venn.__getState();
    const sessionB = venn.__testHooks.getSession(tabB.id);
    stateB.ui.inputs.A.value = 'B_ONLY';
    stateB.ui.inputs.B.value = 'B_SHARED';
    stateB.analysis.lastDrawMode = 'lists';
    stateB.persistence.fileName = 'venn-b.graph';
    stateB.ui.syncTableFromInputs?.({ refresh: true, scheduleDraw: false, scheduleSpecies: false });
    await venn.draw({ tabId: tabB.id, reason: 'venn-stale-draw-baseline-b' });
    const inputBefore = stateB.ui.inputs.A.value;

    const activateA = main.tabs.activateTab(tabA.id, { reason: 'venn-stale-draw-return-a' });
    if (activateA && typeof activateA.then === 'function') await activateA;
    await flush();
    // Activation persists B's live controls before switching projections. Use
    // that settled owner state as the baseline for detecting a later stale write.
    const payloadBBefore = JSON.stringify(tabB.payload || null);
    const snapshotBBefore = JSON.stringify(sessionB.state.snapshot);
    const rootA = shared.workspaceTabs.getMountedRoot(tabA.id, 'venn');
    const stageA = rootA?.querySelector('#stage');
    expect(stageA).toBeTruthy();
    const stageABefore = stageA.innerHTML;
    const snapshotABefore = JSON.stringify(sessionA.state.snapshot);
    const payloadABefore = JSON.stringify(tabA.payload || null);

    const originalNextFrame = shared.jobs.nextFrame;
    let releaseFirstFrame;
    let signalFirstFrame;
    const firstFrameStarted = new Promise(resolve => { signalFirstFrame = resolve; });
    const delayedFirstFrame = new Promise(resolve => { releaseFirstFrame = resolve; });
    let nextFrameCalls = 0;
    shared.jobs.nextFrame = () => {
      nextFrameCalls += 1;
      if (nextFrameCalls === 1) {
        signalFirstFrame();
        return delayedFirstFrame;
      }
      return Promise.resolve();
    };
    let observerA = null;
    let observerB = null;
    try {
      const pendingDraw = venn.draw({
        tabId: tabA.id,
        force: true,
        forceOverlay: true,
        reason: 'venn-stale-draw-resume-after-switch'
      });
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Venn draw did not pause before its next frame.')), 10_000);
        firstFrameStarted.then(() => {
          clearTimeout(timeout);
          resolve();
        });
      });
      expect(stageA.innerHTML).toBe(stageABefore);

      const activateB = main.tabs.activateTab(tabB.id, { reason: 'venn-stale-draw-switch-to-b' });
      if (activateB && typeof activateB.then === 'function') await activateB;
      await flush();
      const rootB = shared.workspaceTabs.getMountedRoot(tabB.id, 'venn');
      const stageB = stateB.ui.stage;
      expect(stageB).toBeTruthy();
      expect(stateB.ui.root).toBe(rootB);
      expect(rootB.querySelector('#stage')).toBe(stageB);
      const analysisBBefore = JSON.stringify(stateB.analysis);
      observerA = new window.MutationObserver(() => {});
      observerA.observe(stageA, { subtree: true, childList: true, attributes: true, characterData: true });
      observerB = new window.MutationObserver(() => {});
      observerB.observe(stageB, { subtree: true, childList: true, attributes: true, characterData: true });
      const stageBefore = stageB.innerHTML;

      releaseFirstFrame();
      const drawOutcome = await pendingDraw;
      expect(drawOutcome).toBe(false);
      await Promise.resolve();

      expect(observerA.takeRecords()).toHaveLength(0);
      expect(observerB.takeRecords()).toHaveLength(0);
      expect(stageA.innerHTML).toBe(stageABefore);
      expect(stageB.innerHTML).toBe(stageBefore);
      expect(JSON.stringify(tabA.payload || null)).toBe(payloadABefore);
      expect(JSON.stringify(sessionA.state.snapshot)).toBe(snapshotABefore);
      expect(stateB.ui.inputs.A.value).toBe(inputBefore);
      expect(JSON.stringify(tabB.payload || null)).toBe(payloadBBefore);
      expect(JSON.stringify(sessionB.state.snapshot)).toBe(snapshotBBefore);
      expect(JSON.stringify(stateB.analysis)).toBe(analysisBBefore);
    } finally {
      releaseFirstFrame();
      observerA?.disconnect();
      observerB?.disconnect();
      shared.jobs.nextFrame = originalNextFrame;
    }
  });

  test('a refresh requested for an inactive Venn tab cannot redraw the active sibling', async () => {
    const venn = window.Components.venn;
    const main = window.Main;
    const shared = window.Shared;
    const tabA = main.session.getActiveTab();
    const state = venn.__getState();
    state.ui.inputs.A.value = 'A_ONLY';
    state.ui.inputs.B.value = 'A_SHARED';
    state.analysis.lastDrawMode = 'lists';
    state.ui.syncTableFromInputs?.({ refresh: true, scheduleDraw: false, scheduleSpecies: false });
    await venn.draw({ tabId: tabA.id, reason: 'venn-stale-refresh-baseline-a' });

    main.tabs.handleAddTabClick();
    await flush();
    const selection = main.tabs.handleGraphSelection('venn', { reason: 'venn-stale-refresh-create-b' });
    if (selection && typeof selection.then === 'function') await selection;
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if (duplicatePrompt && !duplicatePrompt.hidden) document.getElementById('duplicateEmpty').click();
    await flush();

    const tabB = main.session.getActiveTab();
    const sessionA = venn.__testHooks.getSession(tabA.id);
    const sessionB = venn.__testHooks.getSession(tabB.id);
    const stateB = venn.__getState();
    stateB.ui.inputs.A.value = 'B_ONLY';
    stateB.ui.inputs.B.value = 'B_SHARED';
    stateB.analysis.lastDrawMode = 'lists';
    stateB.ui.syncTableFromInputs?.({ refresh: true, scheduleDraw: false, scheduleSpecies: false });
    await venn.draw({ tabId: tabB.id, reason: 'venn-stale-refresh-baseline-b' });
    const rootB = shared.workspaceTabs.getMountedRoot(tabB.id, 'venn');
    const stageB = rootB?.querySelector('#stage');
    expect(stageB).toBeTruthy();
    const stageBefore = stageB.innerHTML;
    const payloadABefore = JSON.stringify(tabA.payload || null);
    const payloadBBefore = JSON.stringify(tabB.payload || null);
    const snapshotABefore = JSON.stringify(sessionA.state.snapshot);
    const snapshotBBefore = JSON.stringify(sessionB.state.snapshot);
    const analysisABefore = JSON.stringify(sessionA.state.analysis || sessionA.state.snapshot?.analysis || null);
    const analysisBBefore = JSON.stringify(stateB.analysis);
    const observer = new window.MutationObserver(() => {});
    observer.observe(stageB, { subtree: true, childList: true, attributes: true, characterData: true });
    try {
      await venn.refreshDiagram({ tabId: tabA.id, reason: 'venn-stale-refresh-inactive-owner' });
      expect(observer.takeRecords()).toHaveLength(0);
      expect(stageB.innerHTML).toBe(stageBefore);
      expect(stateB.ui.inputs.A.value).toBe('B_ONLY');
      expect(JSON.stringify(tabA.payload || null)).toBe(payloadABefore);
      expect(JSON.stringify(tabB.payload || null)).toBe(payloadBBefore);
      expect(JSON.stringify(sessionA.state.snapshot)).toBe(snapshotABefore);
      expect(JSON.stringify(sessionB.state.snapshot)).toBe(snapshotBBefore);
      expect(JSON.stringify(sessionA.state.analysis || sessionA.state.snapshot?.analysis || null)).toBe(analysisABefore);
      expect(JSON.stringify(stateB.analysis)).toBe(analysisBBefore);
    } finally {
      observer.disconnect();
    }
  });

  test('a public draw requested for an inactive Venn tab cannot rebind the active projection', async () => {
    const venn = window.Components.venn;
    const main = window.Main;
    const tabA = main.session.getActiveTab();
    const stateA = venn.__getState();
    stateA.ui.inputs.A.value = 'A_ONLY';
    stateA.ui.inputs.B.value = 'A_SHARED';
    stateA.analysis.lastDrawMode = 'lists';
    stateA.ui.syncTableFromInputs?.({ refresh: true, scheduleDraw: false, scheduleSpecies: false });
    await venn.draw({ tabId: tabA.id, reason: 'venn-inactive-public-draw-baseline-a' });

    main.tabs.handleAddTabClick();
    await flush();
    const selection = main.tabs.handleGraphSelection('venn', { reason: 'venn-inactive-public-draw-create-b' });
    if (selection && typeof selection.then === 'function') await selection;
    const duplicatePrompt = document.getElementById('duplicatePrompt');
    if (duplicatePrompt && !duplicatePrompt.hidden) document.getElementById('duplicateEmpty').click();
    await flush();

    const tabB = main.session.getActiveTab();
    const stateB = venn.__getState();
    const rootB = window.Shared.workspaceTabs.getMountedRoot(tabB.id, 'venn');
    expect(tabB.id).not.toBe(tabA.id);
    expect(main.session.getActiveTab().id).toBe(tabB.id);
    expect(venn.__boundTabId).toBe(tabB.id);
    expect(stateB.ui.root).toBe(rootB);

    stateB.ui.inputs.A.value = 'B_ONLY';
    stateB.ui.inputs.B.value = 'B_SHARED';
    stateB.analysis.lastDrawMode = 'lists';
    stateB.ui.syncTableFromInputs?.({ refresh: true, scheduleDraw: false, scheduleSpecies: false });
    await venn.draw({ tabId: tabB.id, reason: 'venn-inactive-public-draw-baseline-b' });
    const payloadBBefore = JSON.stringify(venn.getPayload({ tabId: tabB.id }));
    const sessionA = venn.__testHooks.getSession(tabA.id);
    const snapshotABefore = JSON.stringify(sessionA.state.snapshot);

    await venn.draw({ tabId: tabA.id, reason: 'venn-inactive-public-draw-stale-owner' });

    expect(main.session.getActiveTab().id).toBe(tabB.id);
    expect(venn.__boundTabId).toBe(tabB.id);
    expect(stateB.ui.root).toBe(rootB);
    expect(stateB.ui.inputs.A.value).toBe('B_ONLY');
    expect(JSON.stringify(venn.getPayload({ tabId: tabB.id }))).toBe(payloadBBefore);
    expect(JSON.stringify(sessionA.state.snapshot)).toBe(snapshotABefore);
  });

});
