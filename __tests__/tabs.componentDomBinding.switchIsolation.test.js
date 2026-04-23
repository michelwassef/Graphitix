describe('Component DOM binding survives repeated same-component tab switches', () => {
  jest.setTimeout(240000);

  const WORKSPACES = [
    { type: 'venn', hotId: 'vennHot' },
    { type: 'box', hotId: 'hot' },
    { type: 'scatter', hotId: 'scatterHot' },
    { type: 'pca', hotId: 'pcaHot' },
    { type: 'line', hotId: 'lineHot' },
    { type: 'heatmap', hotId: 'heatmapHot' },
    { type: 'surface', hotId: 'surfaceHot' },
    { type: 'roc', hotId: 'rocHot' },
    { type: 'survival', hotId: 'survivalHot' },
    { type: 'hist', hotId: 'histHot' },
    { type: 'pie', hotId: 'pieHot' }
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

  function verifyWorkspaceProbe(workspace, type, hotId, failures, label) {
    try {
      const hot = document.getElementById(hotId);
      if (!hot) {
        failures.push(`${type}: missing hot container ${hotId} at ${label}`);
      }
      if (typeof workspace?.getPayload === 'function') {
        const payload = workspace.getPayload();
        if (!payload || typeof payload !== 'object') {
          failures.push(`${type}: invalid payload at ${label}`);
        }
      }
    } catch (err) {
      failures.push(`${type}: probe failed at ${label} (${err?.message || String(err)})`);
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

  test('same-component tab pairs keep live controls after repeated switches', async () => {
    const Main = window.Main;
    const registry = Main.components.registry;
    const failures = [];

    for (let i = 0; i < WORKSPACES.length; i += 1) {
      const { type, hotId } = WORKSPACES[i];
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
        verifyWorkspaceProbe(workspace, type, hotId, failures, 'tabA-initial');

        Main.tabs.handleAddTabClick();
        await flush();
        await handleGraphSelection(Main, type);
        const tabB = Main.tabs.getActiveTab();
        if (!tabB || tabB.type !== type || tabB.id === tabA.id) {
          failures.push(`${type}: failed to activate second tab`);
          continue;
        }
        verifyWorkspaceProbe(workspace, type, hotId, failures, 'tabB-initial');

        for (let cycle = 0; cycle < 3; cycle += 1) {
          await activateTabById(Main, tabA.id, `test-switch-${type}-a-${cycle}`);
          if (Main.tabs.getActiveTab()?.type !== type) {
            failures.push(`${type}: wrong active type after switching to tabA cycle ${cycle}`);
            break;
          }
          verifyWorkspaceProbe(workspace, type, hotId, failures, `tabA-cycle-${cycle}`);

          await activateTabById(Main, tabB.id, `test-switch-${type}-b-${cycle}`);
          if (Main.tabs.getActiveTab()?.type !== type) {
            failures.push(`${type}: wrong active type after switching to tabB cycle ${cycle}`);
            break;
          }
          verifyWorkspaceProbe(workspace, type, hotId, failures, `tabB-cycle-${cycle}`);
        }
      } catch (err) {
        failures.push(`${type}: ${err?.message || String(err)}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
