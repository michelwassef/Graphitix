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

  test('color scheme and publication style controls apply on active tab without leaking to sibling tab', async () => {
    const Main = window.Main;
    const registry = Main.components.registry;
    const failures = [];

    for (let i = 0; i < WORKSPACES.length; i += 1) {
      const { type, pageId } = WORKSPACES[i];
      const workspace = registry[type];
      if (!workspace) {
        failures.push(`${type}: missing workspace registry entry`);
        continue;
      }

      try {
        if (i > 0) {
          Main.tabs.handleAddTabClick();
          await flush();
        }

        await handleGraphSelection(Main, type);
        const tabA = Main.tabs.getActiveTab();
        if (!tabA || tabA.type !== type) {
          failures.push(`${type}: failed to activate first tab`);
          continue;
        }

        Main.tabs.handleAddTabClick();
        await flush();
        await handleGraphSelection(Main, type);
        const tabB = Main.tabs.getActiveTab();
        if (!tabB || tabB.type !== type || tabB.id === tabA.id) {
          failures.push(`${type}: failed to activate second tab`);
          continue;
        }

        const payloadBBaseline = cloneValue(workspace.getPayload?.());
        const schemeBBaseline = readSchemeId(type, payloadBBaseline);

        await activateTabById(Main, tabA.id, `test-style-controls-${type}-to-a`);

        const page = document.getElementById(pageId);
        if (!page) {
          failures.push(`${type}: missing page ${pageId}`);
          continue;
        }

        const schemeSelect = page.querySelector(`select[data-color-scheme-select="1"][data-component-type="${type}"]`);
        if (!schemeSelect) {
          failures.push(`${type}: missing color scheme select`);
          continue;
        }
        const payloadABeforeScheme = cloneValue(workspace.getPayload?.());
        const nextScheme = type === 'surface' ? 'surface-plasma' : 'dark';
        schemeSelect.value = nextScheme;
        schemeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        await flush();
        await flush();

        const payloadAAfterScheme = cloneValue(workspace.getPayload?.());
        const schemeAAfter = readSchemeId(type, payloadAAfterScheme);
        if (type === 'venn') {
          const beforeColor = String(payloadABeforeScheme?.style?.colorA || '');
          const afterColor = String(payloadAAfterScheme?.style?.colorA || '');
          if (!afterColor || afterColor === beforeColor) {
            failures.push(`${type}: color scheme control did not update venn colors`);
          }
        } else if (!schemeAAfter || schemeAAfter !== nextScheme) {
          failures.push(`${type}: color scheme control did not apply (${schemeAAfter || 'empty'})`);
        }

        await activateTabById(Main, tabB.id, `test-style-controls-${type}-to-b-after-scheme`);
        const payloadBAfterScheme = cloneValue(workspace.getPayload?.());
        const schemeBAfter = readSchemeId(type, payloadBAfterScheme);
        if (schemeBAfter !== schemeBBaseline) {
          failures.push(`${type}: color scheme leaked to sibling tab (expected ${schemeBBaseline} got ${schemeBAfter})`);
        }

        await activateTabById(Main, tabA.id, `test-style-controls-${type}-to-a-for-pub-style`);
        const payloadABeforePreset = cloneValue(workspace.getPayload?.());

        const publicationSelect = page.querySelector(`select[data-publication-style-select="1"][data-component-type="${type}"]`);
        const publicationApply = page.querySelector(`[data-publication-style-apply="1"][data-component-type="${type}"]`);
        if (!publicationSelect || !publicationApply) {
          failures.push(`${type}: missing publication style controls`);
          continue;
        }
        publicationSelect.value = 'npg_single';
        publicationApply.click();
        await flush();
        await flush();

        const payloadAAfterPreset = cloneValue(workspace.getPayload?.());
        if (JSON.stringify(payloadAAfterPreset) === JSON.stringify(payloadABeforePreset)) {
          failures.push(`${type}: publication style apply produced no payload change`);
        }

        await activateTabById(Main, tabB.id, `test-style-controls-${type}-to-b-after-pub-style`);
        const payloadBAfterPreset = cloneValue(workspace.getPayload?.());
        if (JSON.stringify(payloadBAfterPreset) !== JSON.stringify(payloadBAfterScheme)) {
          failures.push(`${type}: publication style leaked to sibling tab`);
        }
      } catch (err) {
        failures.push(`${type}: ${err?.message || String(err)}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
