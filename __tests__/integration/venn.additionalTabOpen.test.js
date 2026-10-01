const { createVennAdditionalTabTestContext } = require('../../test-support/vennAdditionalTabSuite');

describe('Venn additional tabs — tab and payload ownership', () => {
  const {
    flush,
    handleGraphSelection,
    activateTabById,
  } = createVennAdditionalTabTestContext();

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

});
