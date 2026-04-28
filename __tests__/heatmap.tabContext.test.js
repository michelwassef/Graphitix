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

    const stateA = heatmap.__getState();
    stateA.fileName = 'heatmap-a.graph';
    stateA.clusterControlsTouched = true;
    stateA.clusterDefaultsAutoApplied = true;
    stateA.labelPositions = { title: { x: 10, y: 20 } };
    stateA.dendrogramSettings = { thickness: 5, color: '#112233' };

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'heatmap');

    const tabB = Main.tabs.getActiveTab();
    expect(tabB?.type).toBe('heatmap');
    expect(tabB?.id).not.toBe(tabA?.id);

    const stateB = heatmap.__getState();
    stateB.fileName = 'heatmap-b.graph';
    stateB.clusterControlsTouched = false;
    stateB.clusterDefaultsAutoApplied = false;
    stateB.labelPositions = { title: { x: 30, y: 40 } };
    stateB.dendrogramSettings = { thickness: 2, color: '#445566' };

    await activateTabById(Main, tabA.id, 'test-heatmap-return-a');
    const restoredA = heatmap.__getState();
    expect(restoredA.fileName).toBe('heatmap-a.graph');
    expect(restoredA.clusterControlsTouched).toBe(true);
    expect(restoredA.clusterDefaultsAutoApplied).toBe(true);
    expect(restoredA.labelPositions).toEqual({ title: { x: 10, y: 20 } });
    expect(restoredA.dendrogramSettings).toEqual({ thickness: 5, color: '#112233' });

    await activateTabById(Main, tabB.id, 'test-heatmap-return-b');
    const restoredB = heatmap.__getState();
    expect(restoredB.fileName).toBe('heatmap-b.graph');
    expect(restoredB.clusterControlsTouched).toBe(false);
    expect(restoredB.clusterDefaultsAutoApplied).toBe(false);
    expect(restoredB.labelPositions).toEqual({ title: { x: 30, y: 40 } });
    expect(restoredB.dendrogramSettings).toEqual({ thickness: 2, color: '#445566' });
  });

  test.skip('heatmap render cache restore prefers cached svg fragments when available', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'heatmap');

    const heatmap = window.Components?.heatmap;
    expect(heatmap).toBeTruthy();

    const loadExample = document.getElementById('heatmapLoadExample');
    expect(loadExample).toBeTruthy();
    loadExample.click();

    await waitFor(() => !!(heatmap.__getState()?.svg || document.getElementById('heatmapSvg')));

    const svg = heatmap.__getState().svg || document.getElementById('heatmapSvg');
    expect(svg).toBeTruthy();
    const cache = heatmap.captureRenderCache();
    expect(cache?.renderState?.lastRenderModel).toBeTruthy();

    if (cache?.svg?.fragment && typeof document.createElementNS === 'function') {
      const stale = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      stale.setAttribute('data-test-stale-cache', '1');
      cache.svg.fragment.appendChild(stale);
    }

    expect(svg.querySelector('[data-export-layer="heatmap-cells"]')).toBeNull();

    const restored = heatmap.restoreRenderCache(cache);
    expect(restored).toBe(true);
    expect(svg.querySelector('[data-test-stale-cache="1"]')).toBeTruthy();
    expect(svg.querySelector('[data-export-layer="heatmap-cells"]')).toBeTruthy();
  });

});
