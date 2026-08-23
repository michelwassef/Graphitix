describe('Surface tab context isolation', () => {
  jest.setTimeout(240000);

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
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

  test('surface restores tab-scoped non-payload state when switching between surface tabs', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'surface');

    const surface = window.Components?.surface;
    expect(surface).toBeTruthy();

    const tabA = Main.tabs.getActiveTab();
    expect(tabA?.type).toBe('surface');

    surface.applyRuntimeState({
      fileName: 'surface-a.graph',
      autoDrawEnabled: false,
      autoDrawReason: { type: 'manual' }
    }, { tabId: tabA.id, reason: 'test-seed-surface-a' });

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'surface');

    const tabB = Main.tabs.getActiveTab();
    expect(tabB?.type).toBe('surface');
    expect(tabB?.id).not.toBe(tabA?.id);

    surface.applyRuntimeState({
      fileName: 'surface-b.graph',
      autoDrawEnabled: true,
      autoDrawReason: null
    }, { tabId: tabB.id, reason: 'test-seed-surface-b' });

    await activateTabById(Main, tabA.id, 'test-surface-return-a');
    const restoredA = surface.__getState();
    expect(restoredA.fileName).toBe('surface-a.graph');
    expect(restoredA.autoDrawEnabled).toBe(false);
    expect(restoredA.autoDrawReason).toEqual({ type: 'manual' });

    await activateTabById(Main, tabB.id, 'test-surface-return-b');
    const restoredB = surface.__getState();
    expect(restoredB.fileName).toBe('surface-b.graph');
    expect(restoredB.autoDrawEnabled).toBe(true);
    expect(restoredB.autoDrawReason).toBeNull();
    expect(restoredB.drawPending).toBe(false);
  });

  test('capturing an inactive surface owner never rebinds or samples the mounted sibling projection', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'surface');

    const surface = window.Components?.surface;
    expect(surface).toBeTruthy();

    const tabA = Main.tabs.getActiveTab();
    surface.applyRuntimeState({
      fileName: 'surface-owner-a.graph',
      autoDrawEnabled: false,
      autoDrawReason: { type: 'manual-a' }
    }, { tabId: tabA.id, reason: 'test-seed-inactive-owner-a' });

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'surface');

    const tabB = Main.tabs.getActiveTab();
    expect(tabB?.id).not.toBe(tabA?.id);
    surface.applyRuntimeState({
      fileName: 'surface-owner-b.graph',
      autoDrawEnabled: true,
      autoDrawReason: { type: 'manual-b' }
    }, { tabId: tabB.id, reason: 'test-seed-mounted-owner-b' });

    expect(surface.__boundTabId).toBe(tabB.id);
    expect(surface.__getState().fileName).toBe('surface-owner-b.graph');

    const inactiveSnapshot = surface.captureRuntimeState({
      tabId: tabA.id,
      reason: 'test-capture-inactive-owner-a'
    });

    expect(inactiveSnapshot).toBeTruthy();
    expect(inactiveSnapshot.fileName).toBe('surface-owner-a.graph');
    expect(inactiveSnapshot.autoDrawEnabled).toBe(false);
    expect(inactiveSnapshot.autoDrawReason).toEqual({ type: 'manual-a' });

    // Capturing A must not project A or copy B's mounted state into A.
    expect(surface.__boundTabId).toBe(tabB.id);
    expect(surface.__getState().fileName).toBe('surface-owner-b.graph');
    expect(surface.__getState().autoDrawEnabled).toBe(true);
    expect(surface.__getState().autoDrawReason).toEqual({ type: 'manual-b' });

    const ownerASession = surface.__testHooks.getSession(tabA.id);
    const ownerBSession = surface.__testHooks.getSession(tabB.id);
    expect(ownerASession?.state?.fileName).toBe('surface-owner-a.graph');
    expect(ownerBSession?.state?.fileName).toBe('surface-owner-b.graph');

    expect(surface.applyRuntimeState({
      fileName: 'surface-owner-a-updated.graph',
      fileHandle: null,
      autoDrawEnabled: true,
      autoDrawReason: { type: 'inactive-a-update' }
    }, { tabId: tabA.id, reason: 'test-apply-inactive-owner-a' })).toBe(true);

    // Applying A while B is mounted updates only A's owner record/session.
    expect(surface.__boundTabId).toBe(tabB.id);
    expect(surface.__getState().fileName).toBe('surface-owner-b.graph');
    expect(surface.__getState().autoDrawReason).toEqual({ type: 'manual-b' });
    expect(surface.__testHooks.getSession(tabA.id)?.state?.fileName).toBe('surface-owner-a-updated.graph');
    expect(surface.__testHooks.getSession(tabA.id)?.managers?.fileHandle).toBeNull();
  });

});
