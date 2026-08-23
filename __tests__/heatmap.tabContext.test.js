describe('Heatmap tab context isolation', () => {
  jest.setTimeout(240000);

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
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
  }

  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    require('../js/vendor.js');
    require('../js/shared/fileIO.js');
    require('../js/shared/debounce.js');
    require('../js/shared/dataTransforms.js');
    require('../js/shared/dataViews.js');
    require('../js/shared/tabContext.js');
    require('../js/shared/undo.js');
    require('../js/shared/resizer.js');
    require('../js/shared/dom.js');
    require('../js/shared/exporter.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/graphSizing.js');
    require('../js/shared/regression.js');
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
    require('../js/shared/exampleDatasets.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/shared/workspaceTabs.js');
    require('../js/shared/componentLifecycle.js');
    require('../js/shared/uniprot.js');
    require('../js/shared/goAnalysis.js');
    require('../js/shared/stringAnalysis.js');
    require('../js/main/components.js');
    if (window.Main?.components?.preloadAllBundlesSync) {
      window.Main.components.preloadAllBundlesSync();
    }
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/styleSync.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main/tabs/render.js');
    require('../js/main/tabs/unsavedPrompt.js');
    require('../js/main/tabs/duplicatePrompt.js');
    require('../js/main/tabs.js');
    require('../js/main.js');
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
      clusterDefaultsAutoApplied: true,
      labelPositions: { title: { x: 10, y: 20 } },
      dendrogramSettings: { mode: 'fixed', thicknessPt: 5, color: '#112233' }
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
      clusterDefaultsAutoApplied: false,
      labelPositions: { title: { x: 30, y: 40 } },
      dendrogramSettings: { mode: 'auto', thicknessPt: 2, color: '#445566' }
    }, { tabId: tabB.id, reason: 'test-seed-heatmap-b' });

    await activateTabById(Main, tabA.id, 'test-heatmap-return-a');
    const restoredA = heatmap.__getState();
    expect(restoredA.fileName).toBe('heatmap-a.graph');
    expect(restoredA.clusterControlsTouched).toBe(true);
    expect(restoredA.clusterDefaultsAutoApplied).toBe(true);
    expect(restoredA.labelPositions).toEqual({ title: { x: 10, y: 20 } });
    expect(restoredA.dendrogramSettings).toEqual({ mode: 'fixed', thicknessPt: 5, color: '#112233' });

    await activateTabById(Main, tabB.id, 'test-heatmap-return-b');
    const restoredB = heatmap.__getState();
    expect(restoredB.fileName).toBe('heatmap-b.graph');
    expect(restoredB.clusterControlsTouched).toBe(false);
    expect(restoredB.clusterDefaultsAutoApplied).toBe(false);
    expect(restoredB.labelPositions).toEqual({ title: { x: 30, y: 40 } });
    expect(restoredB.dendrogramSettings).toEqual({ mode: 'auto', thicknessPt: 2, color: '#445566' });
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
    expect(svg.querySelector('[data-export-layer="heatmap-cells"]')).toBeNull();
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
