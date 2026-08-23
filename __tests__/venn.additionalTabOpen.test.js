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
    // This integration suite reloads the application modules for every test. Dispose
    // any Venn owners from the previous application instance first so delayed species/
    // analysis work cannot target the freshly mounted DOM in the next test.
    const previousVenn = window.Components?.venn || null;
    const previousTabs = window.Main?.session?.workspaceState?.tabs || [];
    if(previousVenn?.disposeTab){
      previousTabs.filter(tab => tab?.type === 'venn').forEach(tab => {
        previousVenn.disposeTab(tab, { tabId: tab.id, reason: 'venn-test-reset' });
      });
    }
    delete window.Main;
    delete window.Components;
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
    require('../js/shared/componentLifecycle.js');
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

  test('venn preserves a fourth table column immediately and through Welcome reactivation', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');

    const venn = window.Components?.venn;
    const vennTab = Main.tabs.getActiveTab();
    expect(venn).toBeTruthy();
    expect(vennTab?.type).toBe('venn');

    const hot = venn.__getState().ui.hot;
    expect(hot).toBeTruthy();
    hot.alter('insert_col_end', 2, 1, 'header-menu');
    const persistedAfterInsert = vennTab.payload?.data?.table;
    expect(Array.isArray(persistedAfterInsert)).toBe(true);
    expect(persistedAfterInsert[0]).toHaveLength(hot.countCols());
    expect(persistedAfterInsert[0][3]).toBe('');
    hot.setDataAtCell([
      [0, 0, 'Set A'],
      [0, 1, 'Set B'],
      [0, 2, 'Set C'],
      [0, 3, 'Set D'],
      [1, 0, 'A_ONLY'],
      [1, 3, 'D_ONLY'],
      [2, 0, 'AD_SHARED'],
      [2, 3, 'AD_SHARED']
    ], 'edit');
    await flush();

    expect(Array.isArray(vennTab.payload?.data?.table)).toBe(true);
    expect(vennTab.payload.data.table[0][3]).toBe('Set D');
    expect(vennTab.payload.data.table[1][3]).toBe('D_ONLY');
    expect(vennTab.payload.data.table[2][3]).toBe('AD_SHARED');
    expect(vennTab.payload.data.labelA).toBe('Set A');
    expect(vennTab.payload.data.listA).toContain('AD_SHARED');

    const welcomeTab = Main.session.workspaceState.tabs.find(tab => tab.isWelcome);
    expect(welcomeTab).toBeTruthy();
    await activateTabById(Main, welcomeTab.id, 'test-venn-fourth-column-away');
    await activateTabById(Main, vennTab.id, 'test-venn-fourth-column-return');

    const restoredHot = venn.__getState().ui.hot;
    const restoredMatrix = restoredHot.getData();
    expect(restoredMatrix[0][3]).toBe('Set D');
    expect(restoredMatrix[1][3]).toBe('D_ONLY');
    expect(restoredMatrix[2][3]).toBe('AD_SHARED');
    expect(venn.getPayload().data.table[0][3]).toBe('Set D');
  });

  test('venn warns when an ignored column contains data even without a header, and hides the warning in UpSet mode', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');

    const venn = window.Components?.venn;
    const state = venn?.__getState?.();
    const hot = state?.ui?.hot;
    const warning = state?.ui?.setLimitWarning;
    const plotType = state?.ui?.plotType;
    const syncFromTable = state?.ui?.syncInputsFromTable;

    expect(venn).toBeTruthy();
    expect(hot).toBeTruthy();
    expect(warning).toBeTruthy();
    expect(plotType).toBeTruthy();
    expect(typeof syncFromTable).toBe('function');
    expect(warning.hidden).toBe(true);

    hot.alter('insert_col_end', 2, 1, 'header-menu');
    hot.setDataAtCell(1, 3, 'D_ONLY', 'edit');
    syncFromTable({ scheduleDraw: false, scheduleSpecies: false });
    await flush();

    expect(hot.getData()?.[0]?.[3] || '').toBe('');
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toMatch(/first three columns/i);
    expect(warning.textContent).toMatch(/UpSet plot/i);

    plotType.value = 'upset';
    plotType.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(warning.hidden).toBe(true);

    plotType.value = 'venn';
    plotType.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
    expect(warning.hidden).toBe(false);

    hot.setDataAtCell(1, 3, '', 'edit');
    hot.setDataAtCell(0, 3, 'Set D', 'edit');
    syncFromTable({ scheduleDraw: false, scheduleSpecies: false });
    await flush();
    expect(warning.hidden).toBe(true);
  });

  test('venn legacy A/B/C fields override their table columns without erasing additional sets', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');

    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.table = [
      ['Table A', 'Table B', 'Table C', 'Set D'],
      ['TABLE_A_1', 'B_1', 'C_1', 'D_1'],
      ['TABLE_A_2', '', '', 'D_2']
    ];
    payload.data.labelA = 'Legacy A';
    payload.data.listA = 'LEGACY_A_1\nLEGACY_A_2';
    payload.data.labelB = 'Table B';
    payload.data.listB = 'B_1';
    payload.data.labelC = 'Table C';
    payload.data.listC = 'C_1';

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      reason: 'test-venn-legacy-table-reconcile'
    });
    await flush();

    const matrix = venn.__getState().ui.hot.getData();
    expect(matrix[0][0]).toBe('Legacy A');
    expect(matrix[1][0]).toBe('LEGACY_A_1');
    expect(matrix[2][0]).toBe('LEGACY_A_2');
    expect(matrix[0][3]).toBe('Set D');
    expect(matrix[1][3]).toBe('D_1');
    expect(matrix[2][3]).toBe('D_2');

    const normalized = venn.getPayload();
    expect(normalized.data.labelA).toBe('Legacy A');
    expect(normalized.data.listA).toBe('LEGACY_A_1\nLEGACY_A_2');
    expect(normalized.data.table[0][3]).toBe('Set D');
  });

  test('venn control edits update the authoritative payload immediately', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');

    const venn = window.Components?.venn;
    const vennTab = Main.tabs.getActiveTab();
    expect(venn).toBeTruthy();
    expect(vennTab?.type).toBe('venn');

    Main.session.clearSessionDirty('test-clean-venn-control');
    const state = venn.__getState();
    state.ui.inputs.A.value = 'BRCA1\nATM';
    state.ui.inputs.A.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();

    expect(Main.session.workspaceState.sessionUserDirty).toBe(true);
    expect(vennTab.userModified).toBe(true);
    expect(vennTab.payloadDirty).toBe(false);
    expect(vennTab.payload?.data?.listA).toContain('BRCA1');
    expect(Array.isArray(vennTab.payload?.data)).toBe(false);
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

  test('two venn tabs keep independent export controls', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const firstTab = Main.tabs.getActiveTab();
    expect(firstTab?.type).toBe('venn');

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');
    const secondTab = Main.tabs.getActiveTab();
    expect(secondTab?.type).toBe('venn');
    expect(secondTab.id).not.toBe(firstTab.id);

    await activateTabById(Main, firstTab.id, 'test-venn-export-first');
    expect(window.Components.venn.__getState().ui.vennExportControls?.querySelectorAll('.export-select-wrapper').length).toBeGreaterThanOrEqual(2);

    await activateTabById(Main, secondTab.id, 'test-venn-export-second');
    expect(window.Components.venn.__getState().ui.vennExportControls?.querySelectorAll('.export-select-wrapper').length).toBeGreaterThanOrEqual(2);
  });

  test('inactive venn payload hydration does not project into active tab DOM', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tabA = Main.tabs.getActiveTab();
    const stateA = venn.__getState();
    stateA.ui.inputs.labelA.value = 'A owner';
    stateA.ui.inputs.A.value = 'GENE_A1';
    stateA.ui.syncTableFromInputs?.({ refresh: true });
    venn.refreshDiagram();
    await flush();
    Main.session.persistActiveTabState(tabA, { reason: 'test-tab-a', forcePreviewCapture: false });

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');
    const tabB = Main.tabs.getActiveTab();
    const stateB = venn.__getState();
    stateB.ui.inputs.labelA.value = 'B owner';
    stateB.ui.inputs.A.value = 'GENE_B1';
    stateB.ui.syncTableFromInputs?.({ refresh: true });
    venn.refreshDiagram();
    await flush();

    const inactivePayload = Main.session.clonePayload(tabA.payload);
    inactivePayload.data.labelA = 'A restored inactive';
    inactivePayload.data.listA = 'GENE_A2';
    venn.loadFromPayload(inactivePayload, {
      tabId: tabA.id,
      skipDraw: true,
      recordUndo: false,
      source: 'inactive-hydration-test'
    });

    expect(Main.tabs.getActiveTab()?.id).toBe(tabB.id);
    expect(venn.__getState().ui.inputs.labelA.value).toBe('B owner');
    expect(venn.__getState().ui.inputs.A.value).toBe('GENE_B1');
    expect(tabA.payload.data.labelA).toBe('A restored inactive');

    await activateTabById(Main, tabA.id, 'test-inactive-hydration-project-a');
    expect(venn.__getState().ui.inputs.labelA.value).toBe('A restored inactive');
    expect(venn.__getState().ui.inputs.A.value).toBe('GENE_A2');
  });

  test('venn GO and STRING async results remain owned by launching tabs', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tabA = Main.tabs.getActiveTab();
    const pending = { go: [], network: [], enrichment: [] };
    const defer = (kind, request) => {
      let resolve;
      const promise = new Promise(res => { resolve = res; });
      pending[kind].push({ request, resolve });
      return promise;
    };
    const configure = async (tabId, label) => {
      await activateTabById(Main, tabId, `test-configure-${label}`);
      const tab = Main.session.workspaceState.tabs.find(candidate => candidate.id === tabId);
      const payload = venn.createEmptyPayload();
      payload.data.labelA = label;
      payload.data.listA = `${label}_GENE_1\n${label}_GENE_2`;
      payload.data.listB = `${label}_GENE_1`;
      payload.data.listC = '';
      payload.analysis.speciesValue = 'hsapiens';
      await venn.loadFromPayload(payload, {
        tab,
        tabId,
        source: `test-configure-${label}`
      });
      await venn.draw({ tab, tabId, reason: `test-configure-${label}`, force: true });
      await flush();
    };
    const projectOwner = async (tab, reason) => {
      Main.session.workspaceState.activeTabId = tab.id;
      window.Shared.workspaceTabs.activateSession(tab, 'venn', { reason });
      venn.activateTab(tab, { tabId: tab.id, reason });
      await flush();
    };

    await configure(tabA.id, 'ALPHA');
    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');
    const tabB = Main.tabs.getActiveTab();
    await configure(tabB.id, 'BETA');

    window.Shared.goAnalysis = {
      profile: options => defer('go', { genes: options.genes, organism: options.organism })
    };
    window.Shared.stringAnalysis = {
      resolveSpeciesCode: (_org, fallback) => fallback || '9606',
      fetchNetwork: options => defer('network', { genes: options.genes, species: options.species }),
      fetchEnrichment: options => defer('enrichment', { genes: options.genes, species: options.species })
    };

    await projectOwner(tabA, 'test-go-string-alpha');
    const runA = Promise.all([
      venn.runGOAnalysis(['ALPHA_GENE_1', 'ALPHA_GENE_2'], 'hsapiens'),
      venn.runStringAnalysis(['ALPHA_GENE_1', 'ALPHA_GENE_2'], 'hsapiens')
    ]);
    await flush();
    await projectOwner(tabB, 'test-go-string-beta');
    const runB = Promise.all([
      venn.runGOAnalysis(['BETA_GENE_1', 'BETA_GENE_2'], 'hsapiens'),
      venn.runStringAnalysis(['BETA_GENE_1', 'BETA_GENE_2'], 'hsapiens')
    ]);
    await flush();

    const resolveByLabel = (kind, label, value) => {
      const entries = pending[kind].filter(item => item.request.genes.some(gene => String(gene).includes(label)));
      expect(entries.length).toBeGreaterThan(0);
      entries.forEach(entry => entry.resolve(value));
    };
    resolveByLabel('go', 'BETA', { result: [{ term_name: 'BETA GO term', p_value: 0.01 }] });
    resolveByLabel('network', 'BETA', { svg: '<svg><text>BETA STRING network</text></svg>' });
    await flush();
    resolveByLabel('enrichment', 'BETA', { items: [{ termDescription: 'BETA STRING enrichment', fdr: 0.02 }] });
    resolveByLabel('go', 'ALPHA', { result: [{ term_name: 'ALPHA GO term', p_value: 0.01 }] });
    resolveByLabel('network', 'ALPHA', { svg: '<svg><text>ALPHA STRING network</text></svg>' });
    await flush();
    resolveByLabel('enrichment', 'ALPHA', { items: [{ termDescription: 'ALPHA STRING enrichment', fdr: 0.02 }] });
    await Promise.race([
      Promise.all([runA, runB]),
      new Promise((_, reject) => setTimeout(() => reject(new Error(
        `analysis did not settle: ${JSON.stringify(Object.fromEntries(
          Object.entries(pending).map(([kind, entries]) => [kind, entries.length])
        ))}`
      )), 2000))
    ]);
    await flush();

    await projectOwner(tabA, 'test-alpha-results');
    expect(venn.__getState().ui.goResults.textContent).toContain('ALPHA GO term');
    expect(venn.__getState().ui.goResults.textContent).not.toContain('BETA GO term');
    expect(venn.__getState().ui.stringResults.textContent).toContain('ALPHA STRING enrichment');
    expect(venn.__getState().ui.stringNetwork.textContent).toContain('ALPHA STRING network');
    expect(tabA.payload.analysis.goResult.map(item => item.term_name)).toContain('ALPHA GO term');

    await projectOwner(tabB, 'test-beta-results');
    expect(venn.__getState().ui.goResults.textContent).toContain('BETA GO term');
    expect(venn.__getState().ui.goResults.textContent).not.toContain('ALPHA GO term');
    expect(venn.__getState().ui.stringResults.textContent).toContain('BETA STRING enrichment');
    expect(venn.__getState().ui.stringNetwork.textContent).toContain('BETA STRING network');
    expect(tabB.payload.analysis.goResult.map(item => item.term_name)).toContain('BETA GO term');
  });

  test('restored venn GO and STRING tabs preserve session-owned results on tab click', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.labelA = 'Transcriptomic';
    payload.data.labelB = 'Proteomic';
    payload.data.labelC = 'Phospho';
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Restored GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Restored STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Restored STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'go'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'restore-analysis-tab-test',
      recordUndo: false
    });
    await flush();
    expect(tab.payload.analysis.goResult.map(item => item.term_name)).toContain('Restored GO term');
    expect(tab.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Restored STRING enrichment');

    const state = venn.__getState();
    state.analysis.lastGOResult = null;
    state.analysis.lastGOFormatted = ['STALE_ONLY'];
    state.analysis.lastGOOrganism = 'mmusculus';
    state.analysis.lastStringSVG = '';
    state.analysis.lastStringEnrichment = null;
    state.analysis.goPerformed = false;
    state.analysis.stringPerformed = false;

    state.ui.analysisTabString.click();
    await flush();

    expect(state.ui.stringResults.textContent).toContain('Restored STRING enrichment');
    expect(state.ui.stringNetwork.textContent).toContain('Restored STRING network');
    expect(tab.payload.analysis.goResult.map(item => item.term_name)).toContain('Restored GO term');
    expect(tab.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Restored STRING enrichment');
    expect(tab.payload.analysis.activeResultsTab).toBe('string');
  });

  test('runtime replay falls back to the owner payload for durable GO and STRING results', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Payload GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Payload STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Payload STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'string'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'runtime-owner-payload-fallback',
      recordUndo: false
    });
    await flush();

    const runtime = venn.__testHooks.captureRuntimeState({
      tabId: tab.id,
      tab,
      reason: 'runtime-owner-payload-fallback-capture'
    });
    const session = venn.__testHooks.getSession(tab.id);
    session.results = {
      ...session.results,
      lastGOResult: null,
      lastGOFormatted: [],
      goPerformed: false,
      lastStringSVG: '',
      lastStringEnrichment: null,
      stringPerformed: false,
      activeResultsTab: 'go'
    };

    expect(venn.__testHooks.applyRuntimeState(runtime, {
      tabId: tab.id,
      tab,
      reason: 'runtime-owner-payload-fallback-apply'
    })).toBe(true);
    await flush();

    expect(session.results.lastGOResult.map(item => item.term_name)).toContain('Payload GO term');
    expect(session.results.lastStringEnrichment.map(item => item.termDescription)).toContain('Payload STRING enrichment');
    expect(session.results.lastStringSVG).toContain('Payload STRING network');
    expect(session.results.activeResultsTab).toBe('string');
    expect(venn.__getState().ui.goResults.textContent).toContain('Payload GO term');
    expect(venn.__getState().ui.stringResults.textContent).toContain('Payload STRING enrichment');
    expect(venn.__getState().ui.stringNetwork.textContent).toContain('Payload STRING network');
  });

  test('applying runtime to an inactive venn owner never projects into the mounted sibling', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tabA = Main.tabs.getActiveTab();
    const runtimeA = venn.__testHooks.captureRuntimeState({ tabId: tabA.id, tab: tabA, reason: 'seed-owner-a' });

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');
    const tabB = Main.tabs.getActiveTab();
    expect(tabB.id).not.toBe(tabA.id);

    const beforeB = venn.__testHooks.captureRuntimeState({ tabId: tabB.id, tab: tabB, reason: 'capture-owner-b' });
    const inactiveRuntime = {
      ...runtimeA,
      persistence: {
        ...(runtimeA?.persistence || {}),
        fileName: 'venn-owner-a-updated.graph',
        fileHandle: null
      },
      ui: {
        ...(runtimeA?.ui || {}),
        totalGenes: '12345'
      }
    };

    expect(venn.__testHooks.applyRuntimeState(inactiveRuntime, {
      tabId: tabA.id,
      tab: tabA,
      reason: 'apply-inactive-owner-a'
    })).toBe(true);
    await flush();

    expect(venn.__boundTabId).toBe(tabB.id);
    const afterB = venn.__testHooks.captureRuntimeState({ tabId: tabB.id, tab: tabB, reason: 'recapture-owner-b' });
    expect(afterB.persistence.fileName).toBe(beforeB.persistence.fileName);
    expect(afterB.ui.totalGenes).toBe(beforeB.ui.totalGenes);
    const ownerASession = venn.__testHooks.getSession(tabA.id);
    expect(ownerASession?.state?.runtime?.persistence?.fileName).toBe('venn-owner-a-updated.graph');
    expect(ownerASession?.managers?.fileHandle).toBeNull();
  });

  test('restored venn GO and STRING tab click uses clicked root owner when active mirror is stale', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tabA = Main.tabs.getActiveTab();
    const payloadA = venn.createEmptyPayload();
    payloadA.data.listA = 'BRCA1\nATM';
    payloadA.data.listB = 'BRCA1\nBAP1';
    payloadA.data.listC = 'BRCA1';
    payloadA.analysis = {
      ...payloadA.analysis,
      goResult: [{ term_name: 'Owner GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Owner STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Owner STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'go'
    };
    venn.loadFromPayload(payloadA, {
      tabId: tabA.id,
      source: 'owner-click-stale-active-a',
      recordUndo: false
    });
    await flush();

    Main.tabs.handleAddTabClick();
    await flush();
    await handleGraphSelection(Main, 'venn');
    const tabB = Main.tabs.getActiveTab();
    await activateTabById(Main, tabA.id, 'owner-click-return-a');

    const state = venn.__getState();
    Main.session.workspaceState.activeTabId = tabB.id;
    state.ui.analysisTabString.click();
    await flush();
    Main.session.workspaceState.activeTabId = tabA.id;

    expect(state.ui.stringResults.textContent).toContain('Owner STRING enrichment');
    expect(state.ui.stringNetwork.textContent).toContain('Owner STRING network');
    expect(tabA.payload.analysis.goResult.map(item => item.term_name)).toContain('Owner GO term');
    expect(tabA.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Owner STRING enrichment');
    expect(tabA.payload.analysis.activeResultsTab).toBe('string');
    expect(tabB.payload?.analysis?.goResult || null).toBeNull();
    expect(tabB.payload?.analysis?.stringEnrichment || null).toBeNull();
  });

  test('venn GO and STRING tab clicks rebuild stale payload from session results', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Drift GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Drift STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Drift STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'go'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'payload-drift-tab-click-test',
      recordUndo: false
    });
    await flush();

    const stalePayload = Main.session.clonePayload(tab.payload);
    stalePayload.analysis = venn.createEmptyPayload().analysis;
    tab.payload = stalePayload;
    tab.payloadSignature = Main.session.serializePayloadSignature(stalePayload);

    const state = venn.__getState();
    state.ui.analysisTabGo.click();
    await flush();
    state.ui.analysisTabString.click();
    await flush();

    expect(state.ui.goResults.textContent).toContain('Drift GO term');
    expect(state.ui.stringResults.textContent).toContain('Drift STRING enrichment');
    expect(state.ui.stringNetwork.textContent).toContain('Drift STRING network');
    expect(tab.payload.analysis.goResult.map(item => item.term_name)).toContain('Drift GO term');
    expect(tab.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Drift STRING enrichment');
    expect(tab.payload.analysis.stringSvg).toContain('Drift STRING network');
    expect(venn.__testHooks.getSession(tab.id).results.lastGOResult.map(item => item.term_name)).toContain('Drift GO term');
    expect(venn.__testHooks.getSession(tab.id).results.lastStringEnrichment.map(item => item.termDescription)).toContain('Drift STRING enrichment');
  });

  test('restored venn GO and STRING survive runtime rehydration with a stale region signature', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Redraw GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Redraw STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Redraw STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'go'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'restore-redraw-region-signature-test',
      recordUndo: false
    });
    await flush();

    const state = venn.__getState();
    const runtime = venn.__testHooks.captureRuntimeState({
      tabId: tab.id,
      reason: 'restore-redraw-region-signature-capture'
    });
    state.analysis.lastRegionSignature = 'A::STALE_OWNER_DATA';
    state.analysis.lastRegionCode = 'A';
    venn.__testHooks.applyRuntimeState(runtime, {
      tabId: tab.id,
      reason: 'restore-redraw-region-signature-apply'
    });
    await flush();

    // Runtime application may synchronously project the durable owner snapshot,
    // so the restored baseline can already be established before an explicit
    // fallback draw. The injected stale signature must be replaced by the
    // restored A-only owner region.
    expect(state.analysis.lastRegionCode).toBe('A');
    expect(state.analysis.lastRegionSignature).toBe('A::ATM');
    expect(venn.__testHooks.getSession(tab.id).cache.analysisProjectionBaselinePending).toBe(false);
    venn.refreshDiagram();
    await flush();
    state.ui.analysisTabString.click();
    await flush();

    expect(state.ui.goResults.textContent).toContain('Redraw GO term');
    expect(state.ui.stringResults.textContent).toContain('Redraw STRING enrichment');
    expect(state.ui.stringNetwork.textContent).toContain('Redraw STRING network');
    expect(tab.payload.analysis.goResult.map(item => item.term_name)).toContain('Redraw GO term');
    expect(tab.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Redraw STRING enrichment');
    expect(state.analysis.lastRegionSignature).toBeTruthy();
  });

  test('restored numeric Venn region survives runtime rehydration before the first fallback draw', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    Object.assign(payload.data, {
      labelA: 'Numeric Alpha',
      labelB: 'Numeric Beta',
      labelC: 'Numeric Gamma',
      nA: '80',
      nB: '60',
      nC: '40',
      nAB: '24',
      nAC: '12',
      nBC: '16',
      nABC: '6'
    });
    payload.style.plotType = 'venn';
    payload.analysis = {
      ...payload.analysis,
      regionSelectValue: 'ABC',
      totalGenes: '300',
      speciesValue: 'mmusculus'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'numeric-region-runtime-rehydrate-test',
      recordUndo: false
    });
    await flush();

    const state = venn.__getState();
    expect(state.ui.regionSelect.value).toBe('ABC');
    expect(tab.payload.analysis.regionSelectValue).toBe('ABC');

    const runtime = venn.__testHooks.captureRuntimeState({
      tabId: tab.id,
      reason: 'numeric-region-runtime-rehydrate-capture'
    });
    venn.__testHooks.applyRuntimeState(runtime, {
      tabId: tab.id,
      reason: 'numeric-region-runtime-rehydrate-apply'
    });
    await flush();

    // Runtime rehydration invalidates data-derived caches, but applying the
    // durable owner snapshot may immediately establish the restored baseline.
    // The invariant is that ABC survives and no transient/default region wins.
    expect(state.analysis.lastRegionCode).toBe('ABC');
    expect(state.analysis.lastRegionSignature).toBe('ABC::');
    expect(venn.__testHooks.getSession(tab.id).cache.analysisProjectionBaselinePending).toBe(false);
    venn.refreshDiagram();
    await flush();

    expect(state.ui.regionSelect.value).toBe('ABC');
    expect(state.analysis.lastRegionCode).toBe('ABC');
    expect(state.analysis.lastRegionSignature).toBeTruthy();
    expect(venn.__testHooks.getSession(tab.id).cache.analysisProjectionBaselinePending).toBe(false);
    expect(tab.payload.analysis.regionSelectValue).toBe('ABC');
    expect(tab.payload.analysis.totalGenes).toBe('300');
    expect(tab.payload.analysis.speciesValue).toBe('mmusculus');
  });

  test('restored venn GO and STRING survive lifecycle persist from stale active mirror', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Lifecycle GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Lifecycle STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Lifecycle STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'string'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'restore-lifecycle-persist-test',
      recordUndo: false
    });
    await flush();

    const state = venn.__getState();
    state.analysis.lastGOResult = null;
    state.analysis.lastGOFormatted = ['STALE_ONLY'];
    state.analysis.lastGOOrganism = 'mmusculus';
    state.analysis.lastStringSVG = '';
    state.analysis.lastStringEnrichment = null;
    state.analysis.goPerformed = false;
    state.analysis.stringPerformed = false;

    Main.session.persistActiveTabState(tab, {
      reason: 'recovery-restored',
      origin: 'lifecycle',
      forcePreviewCapture: false,
      snapshotIntent: {
        lifecycleSnapshot: true,
        captureLivePayload: true,
        allowSkipLivePayloadCapture: false,
        reasonSkippable: false,
        snapshotCapture: true
      }
    });

    expect(tab.payload.analysis.goResult.map(item => item.term_name)).toContain('Lifecycle GO term');
    expect(tab.payload.analysis.stringEnrichment.map(item => item.termDescription)).toContain('Lifecycle STRING enrichment');
    expect(tab.payload.analysis.stringSvg).toContain('Lifecycle STRING network');
  });

  test('venn explicit analysis clear invalidates session-owned GO and STRING results', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');
    const venn = window.Components?.venn;
    const tab = Main.tabs.getActiveTab();
    const payload = venn.createEmptyPayload();
    payload.data.listA = 'BRCA1\nATM';
    payload.data.listB = 'BRCA1\nBAP1';
    payload.data.listC = 'BRCA1';
    payload.analysis = {
      ...payload.analysis,
      goResult: [{ term_name: 'Clear GO term', source: 'GO:BP', p_value: 0.001 }],
      goFormatted: ['BRCA1', 'ATM'],
      goOrganism: 'hsapiens',
      goPerformed: true,
      stringSvg: '<svg xmlns="http://www.w3.org/2000/svg"><text>Clear STRING network</text></svg>',
      stringEnrichment: [{ termDescription: 'Clear STRING enrichment', fdr: 0.01 }],
      stringPerformed: true,
      activeResultsTab: 'go'
    };

    venn.loadFromPayload(payload, {
      tabId: tab.id,
      source: 'clear-analysis-session-test',
      recordUndo: false
    });
    await flush();

    const ownerSession = venn.__testHooks.getSession(tab.id);
    expect(ownerSession.results.goPerformed).toBe(true);
    expect(ownerSession.results.stringPerformed).toBe(true);

    venn.__testHooks.clearAnalysis();
    await flush();

    expect(ownerSession.results.goPerformed).toBe(false);
    expect(ownerSession.results.stringPerformed).toBe(false);
    expect(ownerSession.results.lastGOResult).toBeNull();
    expect(ownerSession.results.lastStringEnrichment).toBeNull();

    Main.session.persistActiveTabState(tab, {
      reason: 'test-clear-analysis',
      forcePreviewCapture: false
    });
    expect(tab.payload.analysis.goPerformed).toBe(false);
    expect(tab.payload.analysis.stringPerformed).toBe(false);
    expect(tab.payload.analysis.goResult).toBeNull();
    expect(tab.payload.analysis.stringEnrichment).toBeNull();
  });

  test('venn render cache restore removes stale empty-data notice', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');

    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();
    const state = venn.__getState();
    state.ui.inputs.labelA.value = 'Transcriptomic';
    state.ui.inputs.labelB.value = 'Proteomic';
    state.ui.inputs.labelC.value = 'Phospho';
    state.ui.inputs.A.value = 'BRCA1\nATM\nBAP1';
    state.ui.inputs.B.value = 'BRCA1\nBAP1\nRING1B';
    state.ui.inputs.C.value = 'BRCA1\nRING1B';
    state.ui.syncTableFromInputs?.({ refresh: true });
    state.analysis.lastDrawMode = 'lists';
    await venn.refreshDiagram();
    await venn.awaitReadyForSnapshot({
      tabId: Main.tabs.getActiveTab().id,
      reason: 'test-render-cache-capture'
    });
    await flush();

    const tab = Main.tabs.getActiveTab();
    const ownerSession = venn.__testHooks.getSession(tab.id);
    expect(state.analysis.speciesDetection.pendingTimeoutId).toBeNull();
    expect(state.analysis.speciesDetection.active).toBeNull();
    expect(ownerSession.cache.asyncRequests).toEqual({
      go: null,
      string: null,
      species: null,
      stringOverlay: null
    });
    expect(venn.hasRenderedGraph({ tabId: tab.id, root: state.ui.root })).toBe(true);
    const cache = venn.captureRenderCache({ tabId: tab.id });
    expect(cache).toBeTruthy();
    expect(cache.__graphitixRenderCache).toEqual(expect.objectContaining({
      type: 'venn',
      tabId: tab.id,
      complete: true
    }));
    // Capture transfers the graph nodes into the cache. The live stage is empty
    // until the cache is restored by the shared owner-scoped capture boundary.
    expect(venn.hasRenderedGraph({ tabId: tab.id, root: state.ui.root })).toBe(false);
    expect(venn.canRestoreRenderCache(cache, { tabId: tab.id })).toBe(true);
    expect(venn.canRestoreRenderCache(cache, { tabId: `${tab.id}-other` })).toBe(false);
    expect(cache.graphOnly).toBe(true);
    expect(cache.regionList).toBeUndefined();
    expect(cache.goResults).toBeUndefined();
    expect(cache.stringResults).toBeUndefined();
    expect(cache.stringNetwork).toBeUndefined();
    expect(cache.goChart).toBeUndefined();
    expect(state.ui.vennExportControls?.querySelectorAll('.export-select-wrapper').length).toBeGreaterThanOrEqual(2);
    expect(state.ui.svgBox?.querySelector('.resizer-options-control')).toBeTruthy();
    expect(state.ui.svgBox?.querySelector('.resizer-zoom-control')).toBeTruthy();

    state.ui.inputs.A.value = '';
    state.ui.inputs.B.value = '';
    state.ui.inputs.C.value = '';
    state.ui.syncTableFromInputs?.({ refresh: true });
    venn.refreshDiagram();
    await flush();
    expect(state.ui.emptyNotice?.hidden).toBe(false);
    state.ui.vennExportControls.innerHTML = '';
    state.ui.svgBox?.querySelector('.resizer-control-tray')?.remove();

    venn.loadFromPayload(tab.payload, {
      tabId: tab.id,
      skipDraw: true,
      restoreRenderCache: true,
      recordUndo: false
    });
    expect(venn.restoreRenderCache(cache, { tabId: tab.id })).toBe(true);
    expect(venn.hasRenderedGraph({ tabId: tab.id, root: state.ui.root })).toBe(true);

    expect(state.ui.emptyNotice?.hidden).toBe(true);
    expect(state.ui.stage?.querySelector('[data-venn-trace-id]')).toBeTruthy();
    expect(state.ui.vennExportControls?.querySelectorAll('.export-select-wrapper').length).toBeGreaterThanOrEqual(2);
    expect(state.ui.svgBox?.querySelector('.resizer-options-control')).toBeTruthy();
    expect(state.ui.svgBox?.querySelector('.resizer-zoom-control')).toBeTruthy();
  });

  test('venn recovery persist does not drift from restored payload schema', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');

    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();
    const tab = Main.tabs.getActiveTab();
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

    Main.session.persistActiveTabState(tab, {
      reason: 'archive-save',
      forcePreviewCapture: false
    });
    const restoredPayload = Main.session.clonePayload(tab.payload);
    ['nA', 'nB', 'nC', 'nAB', 'nAC', 'nBC', 'nABC'].forEach(key => {
      delete restoredPayload.data[key];
    });
    if (restoredPayload.meta && typeof restoredPayload.meta === 'object') {
      delete restoredPayload.meta.graphSizing;
      if (!Object.keys(restoredPayload.meta).length) {
        delete restoredPayload.meta;
      }
    }
    const restoredLayout = Main.session.clonePayload(tab.layoutState);
    tab.payload = restoredPayload;
    tab.payloadSignature = Main.session.serializePayloadSignature(restoredPayload);
    tab.layoutState = restoredLayout;
    tab.layoutSignature = Main.session.serializePayloadSignature(restoredLayout);
    tab.userModified = false;
    tab.payloadDirty = false;
    Main.session.workspaceState.loadedWorkspaces[tab.id] = {
      tabId: tab.id,
      type: tab.type,
      payloadSignature: tab.payloadSignature,
      layoutSignature: tab.layoutSignature
    };

    venn.loadFromPayload(restoredPayload, {
      tabId: tab.id,
      skipDraw: true,
      recordUndo: false,
      source: 'recovery-test'
    });
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      Main.session.persistActiveTabState(tab, {
        reason: 'recovery-restored',
        origin: 'lifecycle',
        forcePreviewCapture: false,
        snapshotIntent: {
          lifecycleSnapshot: true,
          captureLivePayload: true,
          allowSkipLivePayloadCapture: false,
          reasonSkippable: false,
          snapshotCapture: true
        }
      });
    } finally {
      const driftCalls = debugSpy.mock.calls.filter(call => String(call[0] || '').includes('payload drift observed'));
      debugSpy.mockRestore();
      expect(driftCalls).toEqual([]);
    }
  });
});
