const { loadProductionBootstrap } = require('../../test-support/productionLoader');
const { waitForIntegrationOwnerReady } = require('../../test-support/readiness');

describe('Heatmap tab context isolation', () => {
  jest.setTimeout(240000);

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  async function waitForHeatmapOwner(tabId) {
    await waitForIntegrationOwnerReady({
      type: 'heatmap',
      expectedTabId: tabId,
      requireMountedRoot: true,
      condition: () => {
        const component = window.Components?.heatmap;
        const owner = component?.__testHooks?.getSession?.(tabId) || null;
        return !!owner
          && String(owner.tabId || '') === String(tabId)
          && String(component.__boundTabId || '') === String(tabId)
          && owner.refs?.root?.isConnected === true;
      }
    });
  }

  async function waitFor(predicate, attempts = 10) {
    for (let index = 0; index < attempts; index += 1) {
      if (predicate()) {
        return true;
      }
      await flush();
    }
    return false;
  }

  async function activateTabById(Main, tabId, reason) {
    const maybe = Main.tabs.activateTab(tabId, { reason: reason || 'test-activate' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
    await flush();
    const tab = Main.tabs.getActiveTab();
    if (tab?.type === 'heatmap') {
      await waitForHeatmapOwner(tab.id);
    }
  }

  async function handleGraphSelection(Main, type) {
    const maybe = Main.tabs.handleGraphSelection(type, { reason: 'test-selection' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
    const prompt = document.getElementById('duplicatePrompt');
    if (prompt && !prompt.hasAttribute('hidden')) {
      const emptyBtn = document.getElementById('duplicateEmpty');
      if (emptyBtn && typeof emptyBtn.click === 'function') {
        emptyBtn.click();
      }
    }
    await flush();
    const activeTab = Main.tabs.getActiveTab();
    if (activeTab?.type === 'heatmap') {
      await waitForHeatmapOwner(activeTab.id);
    }
  }

  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    loadProductionBootstrap({
      vendorMode: 'fake',
      preloadComponents: ['heatmap']
    });
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('heatmap restores tab-scoped non-payload state when switching between heatmap tabs', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'heatmap');

    const heatmap = window.Components?.heatmap;
    expect(heatmap).toBeTruthy();

    const tabA = Main.tabs.getActiveTab();
    expect(tabA?.type).toBe('heatmap');

    heatmap.applyRuntimeState({
      fileName: 'heatmap-a.graph',
      clusterControlsTouched: true,
      clusterDefaultsAutoApplied: true
    }, { tabId: tabA.id, reason: 'test-seed-heatmap-a' });

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'heatmap');

    const tabB = Main.tabs.getActiveTab();
    expect(tabB?.type).toBe('heatmap');
    expect(tabB?.id).not.toBe(tabA?.id);

    heatmap.applyRuntimeState({
      fileName: 'heatmap-b.graph',
      clusterControlsTouched: false,
      clusterDefaultsAutoApplied: false
    }, { tabId: tabB.id, reason: 'test-seed-heatmap-b' });

    await activateTabById(Main, tabA.id, 'test-heatmap-return-a');
    const restoredA = heatmap.__getState();
    expect(restoredA.fileName).toBe('heatmap-a.graph');
    expect(restoredA.clusterControlsTouched).toBe(true);
    expect(restoredA.clusterDefaultsAutoApplied).toBe(true);

    await activateTabById(Main, tabB.id, 'test-heatmap-return-b');
    const restoredB = heatmap.__getState();
    expect(restoredB.fileName).toBe('heatmap-b.graph');
    expect(restoredB.clusterControlsTouched).toBe(false);
    expect(restoredB.clusterDefaultsAutoApplied).toBe(false);
  });

  test('runtime capture preserves the owner title when the module mirror is stale', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'heatmap');
    const heatmap = window.Components.heatmap;
    const tab = Main.tabs.getActiveTab();

    heatmap.loadFromPayload({
      type: 'heatmap',
      data: [['', 'A', 'B'], ['row-1', 1, 2]],
      config: { title: 'Recovered owner title' }
    }, { tabId: tab.id, skipDraw: true, source: 'owner-title-capture-test' });
    heatmap.__getState().titleText = 'Heatmap';

    const snapshot = heatmap.captureRuntimeState({ tabId: tab.id, reason: 'owner-title-capture-test' });
    expect(heatmap.__testHooks.getSession(tab.id).state.titleText).toBe('Recovered owner title');
    expect(snapshot.titleText).toBe('Recovered owner title');
  });

  test('rejecting an inactive payload keeps the active Heatmap projection on its owner', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'heatmap');
    const heatmap = window.Components.heatmap;
    const tabA = Main.tabs.getActiveTab();
    const payloadA = {
      type: 'heatmap',
      data: [['', 'A'], ['row-a', 1]],
      config: { title: 'Owner A' }
    };
    expect(heatmap.loadFromPayload(payloadA, { tabId: tabA.id, skipDraw: true, source: 'owner-a-seed' })).toBe(true);

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'heatmap');
    const tabB = Main.tabs.getActiveTab();
    const payloadB = {
      type: 'heatmap',
      data: [['', 'B'], ['row-b', 2]],
      config: { title: 'Owner B' }
    };
    expect(heatmap.loadFromPayload(payloadB, { tabId: tabB.id, skipDraw: true, source: 'owner-b-seed' })).toBe(true);
    const rootB = window.Shared.workspaceTabs.getMountedRoot(tabB.id, 'heatmap');
    const payloadBBefore = JSON.stringify(tabB.payload || null);
    const snapshotBBefore = JSON.stringify(heatmap.__testHooks.getSession(tabB.id).state);

    expect(heatmap.loadFromPayload({ ...payloadA, config: { title: 'Late Owner A' } }, {
      tabId: tabA.id,
      skipDraw: true,
      source: 'late-inactive-owner'
    })).toBe(false);

    expect(heatmap.__getState().root).toBe(rootB);
    expect(heatmap.__boundTabId).toBe(tabB.id);
    expect(JSON.stringify(tabB.payload || null)).toBe(payloadBBefore);
    expect(JSON.stringify(heatmap.__testHooks.getSession(tabB.id).state)).toBe(snapshotBBefore);
    expect(heatmap.__getState().titleText).toBe('Owner B');
  });

  test('late clustering worker success and failure update only their initiating tab session', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'heatmap');
    const heatmap = window.Components.heatmap;
    const tabA = Main.tabs.getActiveTab();

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'heatmap');
    const tabB = Main.tabs.getActiveTab();
    expect(tabB.id).not.toBe(tabA.id);

    const sessionA = heatmap.__testHooks.getSession(tabA.id);
    sessionA.timers.drawRuntime.token = 7;
    const workerRequests = [];
    const previousWorkers = window.Shared.Workers;
    window.Shared.Workers = {
      isSupported: () => true,
      runTask: () => new Promise((resolve, reject) => workerRequests.push({ resolve, reject }))
    };

    try {
      const asyncState = {
        meta: {
          tabId: tabA.id,
          sessionGeneration: sessionA.updatedAt,
          dataSignature: `data:${tabA.id}`,
          settingsSignature: `settings:${tabA.id}`
        },
        scope: {
          isCurrent: () => true,
          registerCleanup: () => () => {}
        }
      };
      const items = Array.from({ length: 60 }, (_, index) => ({
        index,
        vector: [index, index + 1]
      }));
      const succeeded = heatmap.__testHooks.resolveCluster(
        items, 'euclidean', 'average', 7, 'rows', asyncState
      );
      const failed = heatmap.__testHooks.resolveCluster(
        items, 'euclidean', 'average', 7, 'columns', asyncState
      );
      expect(workerRequests).toHaveLength(2);

      await activateTabById(Main, tabB.id, 'test-switch-during-heatmap-clustering');
      workerRequests[0].resolve({ order: [0, 1], steps: [], maxDistance: 1, algorithm: 'worker' });
      workerRequests[1].reject(new Error('controlled worker failure'));
      await Promise.all([succeeded.promise, failed.promise]);

      expect(sessionA.workers.get('cluster:rows')).toMatchObject({ tabId: tabA.id, status: 'done' });
      expect(sessionA.workers.get('cluster:columns')).toMatchObject({ tabId: tabA.id, status: 'error' });
      expect(sessionA.cache.completedClusters.size).toBe(1);
      const sessionB = heatmap.__testHooks.getSession(tabB.id);
      expect(sessionB.workers.size).toBe(0);
      expect(sessionB.cache.completedClusters.size).toBe(0);
    } finally {
      window.Shared.Workers = previousWorkers;
    }
  });

  test('payload-backed settings survive a stale default runtime snapshot during recovery', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'heatmap');
    const heatmap = window.Components.heatmap;
    const tab = Main.tabs.getActiveTab();

    heatmap.loadFromPayload({
      type: 'heatmap',
      data: [['', 'A', 'B'], ['row-1', 1, 2]],
      config: { title: 'Recovered title', view: 'values', colorScheme: 'viridis' }
    }, { tabId: tab.id, skipDraw: true, source: 'stale-runtime-test' });
    heatmap.applyRuntimeState({
      titleText: 'Heatmap',
      controls: { view: 'corr-columns' },
      colorScheme: 'scientific'
    }, { tabId: tab.id, preservePayloadState: true, reason: 'stale-runtime-test' });

    const session = heatmap.__testHooks.getSession(tab.id);
    expect(session.state.titleText).toBe('Recovered title');
    expect(session.state.controls.view).toBe('values');
    expect(session.state.colorScheme).toBe('viridis');
  });

  test('heatmap activation replays an owner pending draw queue even without hidden-draw state', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'heatmap');

    const heatmap = window.Components?.heatmap;
    expect(heatmap).toBeTruthy();
    expect(heatmap.__testHooks.mergeDrawOptionState(
      { tabId: 'owner-a', viewOnly: false, reason: 'full-redraw' },
      { tabId: 'owner-a', viewOnly: true, reason: 'resize' }
    )).toMatchObject({ tabId: 'owner-a', viewOnly: false, reason: 'resize' });
    // Queue absence is semantically different from a real draw request. The shared draw
    // sanitizer supplies a default reason for real requests, so optional queue slots must
    // never sanitize null/{} into phantom work.
    expect(heatmap.__testHooks.mergeDrawOptionState(null, null)).toBeNull();
    expect(heatmap.__testHooks.mergeDrawOptionState({}, null)).toBeNull();
    expect(heatmap.__testHooks.createDrawRuntime()).toEqual(expect.objectContaining({
      scheduled: false,
      inProgress: false,
      requestOptions: null,
      deferredOptions: null
    }));

    const initialTab = Main.tabs.getActiveTab();
    const initialRuntime = heatmap.__testHooks.getDrawRuntime(initialTab.id);
    expect(initialRuntime?.deferredOptions).toBeNull();
    expect(initialRuntime?.requestOptions).toBeNull();
    expect(heatmap.isIdleForSnapshot?.({ tabId: initialTab.id })).toBe(true);

    const loadExample = document.getElementById('heatmapLoadExample');
    expect(loadExample).toBeTruthy();
    loadExample.click();
    expect(await waitFor(
      () => heatmap.isIdleForSnapshot?.({ tabId: Main.tabs.getActiveTab()?.id }) === true,
      40
    )).toBe(true);

    const tabA = Main.tabs.getActiveTab();
    expect(tabA?.type).toBe('heatmap');

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'heatmap');

    const tabB = Main.tabs.getActiveTab();
    expect(tabB?.type).toBe('heatmap');
    expect(tabB?.id).not.toBe(tabA?.id);

    const sessionA = heatmap.__testHooks.getSession(tabA.id);
    expect(sessionA).toBeTruthy();
    expect(heatmap.__testHooks.scheduleDrawForSession(tabA.id, {
      viewOnly: true,
      reason: 'test-inactive-owner-pending'
    })).toBe(false);
    expect(heatmap.__testHooks.getDrawRuntime(tabA.id)?.deferredOptions).toMatchObject({
      tabId: tabA.id,
      viewOnly: true,
      reason: 'test-inactive-owner-pending'
    });
    expect(heatmap.__testHooks.getDrawRuntime(tabA.id)?.scheduled).toBe(false);
    expect(heatmap.__testHooks.getDrawRuntime(tabA.id)?.requestOptions).toBeNull();

    await activateTabById(Main, tabA.id, 'test-heatmap-replay-pending-owner');

    const settled = await waitFor(() => {
      const runtime = heatmap.__testHooks.getDrawRuntime(tabA.id);
      return heatmap.isIdleForSnapshot?.({ tabId: tabA.id }) === true
        && !Object.keys(runtime?.deferredOptions || {}).length;
    }, 80);
    expect(settled).toBe(true);
    expect(heatmap.__testHooks.getDrawRuntime(tabA.id)?.requestOptions).toBeNull();
  });

  test('disposing a Heatmap tab releases its owner session', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'heatmap');

    const heatmap = window.Components?.heatmap;
    const tab = Main.tabs.getActiveTab();
    expect(tab?.type).toBe('heatmap');
    expect(heatmap?.__testHooks?.getSession?.(tab.id)).toBeTruthy();

    expect(heatmap.disposeTab(tab, { tabId: tab.id, reason: 'test-dispose-owner-session' })).toBe(true);
    expect(heatmap.__testHooks.getSession(tab.id)).toBeNull();
  });

  test('color-scheme snapshots read only the active Heatmap owner session', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'heatmap');

    const heatmap = window.Components.heatmap;
    const tabA = Main.tabs.getActiveTab();
    const sessionA = heatmap.__testHooks.getSession(tabA.id);
    sessionA.state.colorScheme = 'soft';
    sessionA.state.palette = { negative: '#123456', zero: '#eeeeee', positive: '#fedcba' };
    sessionA.state.dendrogramSettings.color = '#345678';

    expect(heatmap.getColorSchemePayload({ tabId: tabA.id })).toMatchObject({
      type: 'heatmap',
      config: {
        colorScheme: 'soft',
        colors: { negative: '#123456', zero: '#eeeeee', positive: '#fedcba' },
        dendrogram: { color: '#345678' }
      }
    });

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'heatmap');
    const tabB = Main.tabs.getActiveTab();
    const sessionB = heatmap.__testHooks.getSession(tabB.id);
    sessionB.state.colorScheme = 'normal';
    sessionB.state.palette = { negative: '#0000ff', zero: '#ffffff', positive: '#ff0000' };

    expect(heatmap.getColorSchemePayload({ tabId: tabA.id })).toBeNull();
    expect(heatmap.getColorSchemePayload({ tabId: tabB.id })?.config.colorScheme).toBe('normal');
  });

  test('a p-value event for a disposed Heatmap owner cannot schedule the active sibling', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'heatmap');
    const heatmap = window.Components.heatmap;
    const tabA = Main.tabs.getActiveTab();

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'heatmap');
    const tabB = Main.tabs.getActiveTab();
    const sessionB = heatmap.__testHooks.getSession(tabB.id);
    expect(tabB.id).not.toBe(tabA.id);
    expect(sessionB).toBeTruthy();
    expect(await waitFor(() => heatmap.isIdleForSnapshot({ tabId: tabB.id }), 40)).toBe(true);

    expect(heatmap.disposeTab(tabA, { tabId: tabA.id, reason: 'test-stale-stats-owner' })).toBe(true);
    const before = heatmap.__testHooks.getDrawRuntime(tabB.id);
    window.dispatchEvent(new CustomEvent('stats:pvalue-format-change', {
      detail: {
        scientific: true,
        targetId: 'heatmapStats',
        tabId: tabA.id
      }
    }));

    expect(heatmap.__testHooks.getDrawRuntime(tabB.id)).toEqual(expect.objectContaining({
      scheduled: before.scheduled,
      inProgress: before.inProgress,
      requestOptions: before.requestOptions,
      deferredOptions: before.deferredOptions,
      lastStatus: before.lastStatus,
      lastReason: before.lastReason,
      token: before.token
    }));
  });

  test('heatmap render cache restore rehydrates cached svg fragments', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'heatmap');

    const heatmap = window.Components?.heatmap;
    expect(heatmap).toBeTruthy();

    const loadExample = document.getElementById('heatmapLoadExample');
    expect(loadExample).toBeTruthy();
    loadExample.click();

    await waitFor(() => {
      const svg = heatmap.__getState()?.svg || document.getElementById('heatmapSvg');
      return !!svg?.querySelector?.('[data-export-layer="heatmap-cells"]');
    }, 40);

    const svg = heatmap.__getState().svg || document.getElementById('heatmapSvg');
    expect(svg).toBeTruthy();
    expect(svg.querySelector('[data-export-layer="heatmap-cells"]')).toBeTruthy();

    const cache = heatmap.captureRenderCache();
    expect(cache?.renderState?.lastRenderModel).toBeTruthy();
    expect(svg.querySelector('[data-export-layer="heatmap-cells"]')).toBeTruthy();
    const injected = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    injected.setAttribute('data-test-post-capture', '1');
    svg.appendChild(injected);
    expect(svg.querySelector('[data-test-post-capture="1"]')).toBeTruthy();

    const restored = heatmap.restoreRenderCache(cache);
    expect(restored).toBe(true);
    expect(svg.querySelector('[data-test-post-capture="1"]')).toBeNull();
    expect(svg.querySelector('[data-export-layer="heatmap-cells"]')).toBeTruthy();
  });

});

describe('heatmap owned DOM membership', () => {
  test('accepts notes controls through their owned root without passing the control object to Node.contains', () => {
    document.body.innerHTML = '<section id="owner"><div id="notes"></div></section>';
    const owner = document.getElementById('owner');
    const notesRoot = document.getElementById('notes');
    const control = { root: notesRoot, setValue() {}, setOpen() {} };

    expect(() => owner.contains(control)).toThrow();
    expect(owner.contains(control.root)).toBe(true);
  });
});
