describe('Style controls remain functional and tab-isolated across components', () => {
  jest.setTimeout(240000);

  const WORKSPACES = [
    { type: 'venn', pageId: 'vennPage' },
    { type: 'box', pageId: 'boxPage' },
    { type: 'scatter', pageId: 'scatterPage' },
    { type: 'pca', pageId: 'pcaPage' },
    { type: 'line', pageId: 'linePage' },
    { type: 'heatmap', pageId: 'heatmapPage' },
    { type: 'surface', pageId: 'surfacePage' },
    { type: 'roc', pageId: 'rocPage' },
    { type: 'survival', pageId: 'survivalPage' },
    { type: 'hist', pageId: 'histPage' },
    { type: 'pie', pageId: 'piePage' }
  ];

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
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
    await flush();
  }

  function readSchemeId(type, payload) {
    if (!payload || typeof payload !== 'object') {
      return '';
    }
    if (type === 'venn') {
      return String(payload.style?.colorScheme || '');
    }
    return String(payload.config?.colorScheme || '');
  }

  function cloneValue(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
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
    require('../js/shared/componentLifecycle.js');
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
    require('../js/shared/exampleDatasets.js');
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

  test('Box and PCA expose their named default palettes', async () => {
    const Main = window.Main;

    await handleGraphSelection(Main, 'box');
    const boxSelect = document.querySelector('#boxColorSchemeSelect');
    expect(boxSelect?.value).toBe('grayscale');

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'pca');
    const pcaSelect = document.querySelector('#pcaColorSchemeSelect');
    expect(pcaSelect?.value).toBe('scientific');

    document.getElementById('pcaLoadExample')?.click();
    for (let index = 0; index < 20; index += 1) {
      await flush();
    }
    expect(pcaSelect?.value).toBe('scientific');
  });

  test('PCA palette undo preserves graph size and skips layout restoration', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'pca');
    document.getElementById('pcaLoadExample')?.click();
    for (let index = 0; index < 20; index += 1) {
      await flush();
    }

    const tab = Main.tabs.getActiveTab();
    const workspace = Main.components.registry.pca;
    const graph = document.querySelector('#pcaGraphPanel .svgbox');
    const fillInput = document.getElementById('pcaFill');
    fillInput.value = '#123456';
    fillInput.dispatchEvent(new Event('input', { bubbles: true }));
    for (let index = 0; index < 8; index += 1) {
      await flush();
    }
    expect(workspace.getPayload().config.fill).toBe('#123456');
    const sizeBefore = {
      width: graph?.style.width || '',
      height: graph?.style.height || '',
      minWidth: graph?.style.minWidth || '',
      minHeight: graph?.style.minHeight || ''
    };
    const applyLayoutSpy = jest.spyOn(workspace, 'applyLayoutState');
    const schemeSelect = document.querySelector('#pcaColorSchemeSelect');
    const legendTextBefore = Array.from(document.querySelectorAll('#pcaSvg text[data-legend-key]'))
      .map(node => node.getAttribute('fill'));
    const legendSwatchesBefore = Array.from(document.querySelectorAll('#pcaSvg [data-legend-swatch="1"]'))
      .map(node => node.getAttribute('fill'));
    expect(legendTextBefore.length).toBeGreaterThan(0);
    expect(legendSwatchesBefore.length).toBeGreaterThan(0);

    schemeSelect.value = 'soft';
    schemeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const paletteChoice = schemeSelect.parentElement?.querySelector('[data-color-scheme-choice="1"]');
    expect(paletteChoice?.hidden).toBe(false);
    paletteChoice?.querySelector('[data-color-scheme-choice-action="match"]')?.click();
    for (let index = 0; index < 8; index += 1) {
      await flush();
    }
    expect(window.Shared.colorSchemes.resolveCategoricalPaletteForType('pca', { schemeId: 'soft' }))
      .toContain(workspace.getPayload().config.fill);
    expect(schemeSelect.value).toBe('soft');
    expect(Array.from(document.querySelectorAll('#pcaSvg text[data-legend-key]'))
      .map(node => node.getAttribute('fill'))).toEqual(legendTextBefore);
    expect(Array.from(document.querySelectorAll('#pcaSvg [data-legend-swatch="1"]'))
      .map(node => node.getAttribute('fill'))).not.toEqual(legendSwatchesBefore);
    expect(window.Shared.undoManager.undo({ tabId: tab.id })).toBe(true);
    for (let index = 0; index < 8; index += 1) {
      await flush();
    }

    expect(applyLayoutSpy).not.toHaveBeenCalled();
    expect({
      width: graph?.style.width || '',
      height: graph?.style.height || '',
      minWidth: graph?.style.minWidth || '',
      minHeight: graph?.style.minHeight || ''
    }).toEqual(sizeBefore);
    expect(schemeSelect.value).toBe('custom');
    expect(workspace.getPayload().config.fill).toBe('#123456');
    expect(Array.from(document.querySelectorAll('#pcaSvg text[data-legend-key]'))
      .map(node => node.getAttribute('fill'))).toEqual(legendTextBefore);
  });

  test.each(WORKSPACES)('$type color scheme and publication style controls remain tab-isolated', async ({ type, pageId }) => {
    const Main = window.Main;
    const registry = Main.components.registry;
    const workspace = registry[type];
    expect(workspace).toBeTruthy();

    await handleGraphSelection(Main, type);
    const tabA = Main.tabs.getActiveTab();
    expect(tabA).toEqual(expect.objectContaining({ type }));

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, type);
    const tabB = Main.tabs.getActiveTab();
    expect(tabB).toEqual(expect.objectContaining({ type }));
    expect(tabB.id).not.toBe(tabA.id);

    const payloadBBaseline = cloneValue(workspace.getPayload?.());
    const schemeBBaseline = readSchemeId(type, payloadBBaseline);
    await activateTabById(Main, tabA.id, `test-style-controls-${type}-to-a`);

    const page = document.getElementById(pageId);
    expect(page).toBeTruthy();
    const schemeSelect = page.querySelector(`select[data-color-scheme-select="1"][data-component-type="${type}"]`);
    expect(schemeSelect).toBeTruthy();
    const payloadABeforeScheme = cloneValue(workspace.getPayload?.());
    const nextScheme = type === 'surface' ? 'surface-plasma' : 'dark';
    schemeSelect.value = nextScheme;
    schemeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    await flush();

    const payloadAAfterScheme = cloneValue(workspace.getPayload?.());
    if (type === 'venn') {
      expect(String(payloadAAfterScheme?.style?.colorA || '')).not.toBe(String(payloadABeforeScheme?.style?.colorA || ''));
    } else {
      expect(readSchemeId(type, payloadAAfterScheme)).toBe(nextScheme);
    }

    await activateTabById(Main, tabB.id, `test-style-controls-${type}-to-b-after-scheme`);
    expect(readSchemeId(type, cloneValue(workspace.getPayload?.()))).toBe(schemeBBaseline);

    await activateTabById(Main, tabA.id, `test-style-controls-${type}-to-a-for-pub-style`);
    const payloadABeforePreset = cloneValue(workspace.getPayload?.());
    const publicationSelect = page.querySelector(`select[data-publication-style-select="1"][data-component-type="${type}"]`);
    const publicationApply = page.querySelector(`[data-publication-style-apply="1"][data-component-type="${type}"]`);
    expect(publicationSelect).toBeTruthy();
    expect(publicationApply).toBeTruthy();
    publicationSelect.value = 'npg_single';
    publicationApply.click();
    await flush();
    await flush();

    const payloadAAfterPreset = cloneValue(workspace.getPayload?.());
    expect(payloadAAfterPreset).not.toEqual(payloadABeforePreset);
    await activateTabById(Main, tabB.id, `test-style-controls-${type}-to-b-after-pub-style`);
    expect(cloneValue(workspace.getPayload?.())).not.toEqual(payloadAAfterPreset);
  }, 60000);
});
