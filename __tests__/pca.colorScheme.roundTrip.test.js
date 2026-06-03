// Reproduction for the PCA color-scheme tab round-trip revert:
//   open 2 PCA tabs > load example data in both > change tab B scheme to Grayscale
//   > switch to tab A and back to tab B > tab B scheme must STILL be Grayscale.
//
// The pre-existing tab-isolation suites only assert (a) the scheme applies on the
// active tab and (b) it does not leak to the sibling. Neither re-asserts the
// *originating* tab after a switch-away/switch-back round-trip, and neither drives
// the change through the real color-scheme control with example data loaded -- which
// is exactly the path that reverts. This test closes that gap for PCA.

describe('PCA color scheme survives a tab round-trip (regression)', () => {
  jest.setTimeout(240000);

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  async function flushAll(count = 12) {
    for (let i = 0; i < count; i += 1) {
      await flush();
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
  }

  async function activateTabById(Main, tabId, reason) {
    const maybe = Main.tabs.activateTab(tabId, { reason: reason || 'test-activate' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
    await flushAll();
  }

  function readSchemeId(workspace) {
    const payload = workspace.getPayload?.();
    return String(payload?.config?.colorScheme || '');
  }

  // Capture every color-bearing field the grayscale scheme writes into the PCA
  // payload, so the assertion catches a visual revert even if the scheme *id* survives.
  function readColorState(workspace) {
    const cfg = workspace.getPayload?.()?.config || {};
    return {
      colorScheme: String(cfg.colorScheme || ''),
      fill: String(cfg.fill || ''),
      border: String(cfg.border || ''),
      axisColor: String(cfg.axis?.color || ''),
      labelColors: JSON.stringify(cfg.labelColors || {})
    };
  }

  // Fill colors of the rendered 2D scatter points in the live PCA SVG.
  function readRenderedPointFills() {
    const plot = document.getElementById('pcaPlot');
    if (!plot) return [];
    const circles = Array.from(plot.querySelectorAll('svg circle'));
    return circles
      .map(c => String(c.getAttribute('fill') || '').trim().toLowerCase())
      .filter(fill => fill && fill !== 'none');
  }

  async function loadExampleData() {
    const exampleBtn = document.getElementById('pcaLoadExample');
    expect(exampleBtn).toBeTruthy();
    exampleBtn.click();
    await flushAll(20);
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
    require('../js/shared/workspaceTabs.js');
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
    require('../js/shared/colorSchemes.js');
    require('../js/shared/publicationStyles.js');
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

  test('Grayscale on tab B is retained after switching to tab A and back', async () => {
    const Main = window.Main;
    const workspace = Main.components.registry.pca;
    expect(workspace).toBeTruthy();

    // Tab A: PCA + example data.
    await handleGraphSelection(Main, 'pca');
    const tabA = Main.tabs.getActiveTab();
    expect(tabA?.type).toBe('pca');
    await loadExampleData();

    // Tab B: PCA + example data.
    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'pca');
    const tabB = Main.tabs.getActiveTab();
    expect(tabB?.type).toBe('pca');
    expect(tabB?.id).not.toBe(tabA.id);
    await loadExampleData();

    // Change tab B's color scheme to Grayscale through the real control.
    const page = document.getElementById('pcaPage');
    const schemeSelect = page.querySelector('select[data-color-scheme-select="1"][data-component-type="pca"]');
    expect(schemeSelect).toBeTruthy();
    schemeSelect.value = 'grayscale';
    schemeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll();

    // Applied on the active (B) tab.
    expect(readSchemeId(workspace)).toBe('grayscale');
    const before = readColorState(workspace);
    expect(before.colorScheme).toBe('grayscale');
    // Grayscale must actually have changed the fill away from the default blue.
    expect(before.fill).not.toBe('#0000ff');
    const renderedBefore = readRenderedPointFills();
    expect(renderedBefore.length).toBeGreaterThan(0);
    // The live graph is grayscale right after applying.
    expect(renderedBefore).not.toContain('#0000ff');

    // Round-trip: switch to A, then back to B.
    await activateTabById(Main, tabA.id, 'roundtrip-to-a');
    await activateTabById(Main, tabB.id, 'roundtrip-back-to-b');

    // The select control still shows Grayscale (this part already works).
    const schemeSelectAfter = page.querySelector('select[data-color-scheme-select="1"][data-component-type="pca"]');
    expect(String(schemeSelectAfter?.value || '')).toBe('grayscale');
    expect(String(tabB.payload?.config?.colorScheme || '')).toBe('grayscale');
    expect(readSchemeId(workspace)).toBe('grayscale');

    // The headline assertion: the RENDERED graph must still be grayscale, not reverted
    // to the default palette. This is the user-visible revert.
    const renderedAfter = readRenderedPointFills();
    expect(renderedAfter.length).toBeGreaterThan(0);
    expect(renderedAfter).not.toContain('#0000ff');
    expect(renderedAfter.sort()).toEqual(renderedBefore.slice().sort());
  });

  // Root-cause coverage for the switch-back revert: a same-component tab switch restores
  // the per-tab runtime snapshot instead of re-applying the payload. The snapshot must
  // carry the resolved colors, otherwise the redraw uses the previously rendered tab's
  // palette (scheme id grayscale, graph default, picker -> Custom).
  test('runtime snapshot restores per-tab colors, not just the scheme id', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'pca');
    expect(Main.tabs.getActiveTab()?.type).toBe('pca');
    await loadExampleData();

    const component = window.Components.pca;
    const workspace = Main.components.registry.pca;
    const page = document.getElementById('pcaPage');
    const schemeSelect = page.querySelector('select[data-color-scheme-select="1"][data-component-type="pca"]');
    expect(schemeSelect).toBeTruthy();

    // Render Grayscale and snapshot the runtime state (as a tab switch-away would).
    schemeSelect.value = 'grayscale';
    schemeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(20);
    const grayBefore = readColorState(workspace);
    expect(grayBefore.fill).toBe('#000000');
    const snapshot = component.captureRuntimeState({ reason: 'test-capture-runtime' });
    expect(snapshot).toBeTruthy();

    // Simulate a sibling default-tab render clobbering the shared singleton colors.
    schemeSelect.value = 'scientific';
    schemeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAll(20);
    expect(readColorState(workspace).fill).toBe('#0000ff');

    // Switch-back path restores the runtime snapshot. It must bring the colors back,
    // not just the scheme id.
    component.applyRuntimeState(snapshot, { reason: 'test-apply-runtime', tabId: Main.tabs.getActiveTab()?.id });
    await flushAll(10);

    const grayAfter = readColorState(workspace);
    expect(grayAfter.colorScheme).toBe('grayscale');
    expect(grayAfter.fill).toBe('#000000');
    expect(grayAfter.labelColors).toBe(grayBefore.labelColors);
  });

  function workspaceColorScheme() {
    return window.Main.components.registry.pca.getPayload?.()?.config?.colorScheme || '';
  }
});
