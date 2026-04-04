describe('Venn additional tab opening', () => {
  jest.setTimeout(240000);

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

  test('opening venn in a new tab alongside another component remains responsive', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'box');
    const boxTab = Main.tabs.getActiveTab();
    expect(boxTab?.type).toBe('box');

    Main.tabs.handleAddTabClick();
    await flush();

    await handleGraphSelection(Main, 'venn');
    const vennTab = Main.tabs.getActiveTab();
    expect(vennTab?.type).toBe('venn');
    expect(window.Components?.venn?.ready).toBe(true);

    await activateTabById(Main, boxTab.id, 'test-return-box');
    expect(Main.tabs.getActiveTab()?.type).toBe('box');

    await activateTabById(Main, vennTab.id, 'test-return-venn');
    expect(Main.tabs.getActiveTab()?.type).toBe('venn');
  });

  test('venn sample data switches through welcome and back without corrupting the diagram state', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');

    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();

    const vennTab = Main.tabs.getActiveTab();
    expect(vennTab?.type).toBe('venn');

    const state = venn.__getState();
    state.ui.inputs.labelA.value = 'Transcriptomic';
    state.ui.inputs.labelB.value = 'Proteomic';
    state.ui.inputs.labelC.value = 'Phospho';
    state.ui.inputs.A.value = 'BRCA1\nATM\nBAP1\nEZH2\nSUZ12\nRING1B';
    state.ui.inputs.B.value = 'BRCA1\nBAP1\nRING1B\nCBX2\nHDAC1\nPAXIP1\nHUWE1';
    state.ui.inputs.C.value = 'BRCA1\nPAXIP1\nCSNK2A1\nRING1B\nKAT7';
    state.ui.syncTableFromInputs?.({ refresh: true });
    state.analysis.lastDrawMode = 'lists';
    venn.refreshDiagram();
    await flush();

    const welcomeTab = Main.session.workspaceState.tabs.find(tab => tab.isWelcome);
    expect(welcomeTab).toBeTruthy();

    await activateTabById(Main, welcomeTab.id, 'test-venn-sample-to-welcome');
    expect(vennTab.payload?.data?.listA || '').toContain('BRCA1');

    await activateTabById(Main, vennTab.id, 'test-venn-sample-return');
    expect(Main.tabs.getActiveTab()?.id).toBe(vennTab.id);
    expect(venn.__getState().ui.inputs.A.value).toContain('BRCA1');
  });

  test('new venn tabs do not inherit border width from an existing venn tab', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');

    const firstVenn = window.Components?.venn;
    expect(firstVenn).toBeTruthy();
    firstVenn.__getState().ui.inputs.borderWidth.value = '4.7';
    firstVenn.refreshDiagram();
    await flush();

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');

    const secondState = window.Components?.venn?.__getState();
    expect(Main.tabs.getActiveTab()?.type).toBe('venn');
    expect(secondState?.ui?.inputs?.borderWidth?.value).toBe('1.2');
  });
});
