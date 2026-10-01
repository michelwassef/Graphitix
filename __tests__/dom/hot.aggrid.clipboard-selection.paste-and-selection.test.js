'use strict';
const { setupHotAggridClipboardFixture } = require('../../test-support/hotAggridClipboardSuite');

describe('Shared.hot AG Grid clipboard + selection behaviors', () => {
  const fixture = setupHotAggridClipboardFixture();

  test('pastes plain text into the selected cell via paste event', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteEventHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-paste-event',
        data: Shared.createEmptyData(3, 3)
      }
    );

    hot.selectCell(0, 0);

    const evt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    evt.clipboardData = { getData: () => 'X' };
    container.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(true);
    expect(hot.getDataAtCell(0, 0)).toBe('X');
  });

  test('new active tab pastes into its highlighted cell without grid focus', () => {
    const Shared = global.window.Shared;
    const activeTab = { id: 'workspace-new-paste', type: 'box' };
    global.window.Main = {
      session: {
        workspaceState: { tabs: [activeTab] },
        getActiveTab: () => activeTab
      }
    };
    const container = document.createElement('div');
    container.id = 'agNewTabPasteHot';
    container.dataset.workspaceTabId = activeTab.id;
    const tabButton = document.createElement('button');
    tabButton.textContent = 'Distribution Charts';
    document.body.append(container, tabButton);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-new-tab-paste',
        data: Shared.createEmptyData(3, 3)
      }
    );
    hot.selectCell(0, 0);
    tabButton.focus();

    const event = new global.window.Event('paste', { bubbles: true, cancelable: true });
    event.clipboardData = { getData: () => 'A\tB\n1\t2' };
    tabButton.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(hot.getSourceData().slice(0, 2).map(row => row.slice(0, 2))).toEqual([
      ['A', 'B'],
      ['1', '2']
    ]);
  });

  test('tab switch routes unfocused paste only to the active tab selection', () => {
    const Shared = global.window.Shared;
    const tabA = { id: 'workspace-paste-a', type: 'box' };
    const tabB = { id: 'workspace-paste-b', type: 'box' };
    let activeTab = tabB;
    global.window.Main = {
      session: {
        workspaceState: { tabs: [tabA, tabB] },
        getActiveTab: () => activeTab
      }
    };
    const containerA = document.createElement('div');
    containerA.dataset.workspaceTabId = tabA.id;
    const containerB = document.createElement('div');
    containerB.dataset.workspaceTabId = tabB.id;
    const tabButton = document.createElement('button');
    tabButton.textContent = 'Active workspace tab';
    document.body.append(containerA, containerB, tabButton);

    const hotA = fixture.createTable(
      containerA,
      { rows: 4, cols: 3 },
      () => {},
      { debugLabel: 'ag-tab-paste-a', data: Shared.createEmptyData(4, 3) }
    );
    const hotB = fixture.createTable(
      containerB,
      { rows: 4, cols: 3 },
      () => {},
      { debugLabel: 'ag-tab-paste-b', data: Shared.createEmptyData(4, 3) }
    );
    hotA.selectCell(1, 1);
    hotB.selectCell(2, 0);
    tabButton.focus();

    const pasteB = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteB.clipboardData = { getData: () => 'B' };
    tabButton.dispatchEvent(pasteB);

    expect(pasteB.defaultPrevented).toBe(true);
    expect(hotB.getDataAtCell(2, 0)).toBe('B');
    expect(hotA.getDataAtCell(1, 1)).toBe('');

    activeTab = tabA;
    tabButton.focus();
    const pasteA = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteA.clipboardData = { getData: () => 'A' };
    tabButton.dispatchEvent(pasteA);

    expect(pasteA.defaultPrevented).toBe(true);
    expect(hotA.getDataAtCell(1, 1)).toBe('A');
    expect(hotB.getDataAtCell(2, 0)).toBe('B');
  });

  test('active-tab routing does not intercept paste into an editable control', () => {
    const Shared = global.window.Shared;
    const activeTab = { id: 'workspace-editable-paste', type: 'box' };
    global.window.Main = {
      session: {
        workspaceState: { tabs: [activeTab] },
        getActiveTab: () => activeTab
      }
    };
    const container = document.createElement('div');
    container.dataset.workspaceTabId = activeTab.id;
    const input = document.createElement('input');
    document.body.append(container, input);
    const hot = fixture.createTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      { debugLabel: 'ag-editable-paste', data: Shared.createEmptyData(2, 2) }
    );
    hot.selectCell(0, 0);
    input.focus();

    const event = new global.window.Event('paste', { bubbles: true, cancelable: true });
    event.clipboardData = { getData: () => 'input text' };
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(hot.getDataAtCell(0, 0)).toBe('');
  });

  test('first custom paste supersedes a pending projection and writes through to the owner payload', () => {
    const Shared = global.window.Shared;
    const clone = value => JSON.parse(JSON.stringify(value));
    const tab = {
      id: 'workspace-heatmap-first-paste',
      type: 'heatmap',
      payload: { type: 'heatmap', data: [['Old', 'Value'], ['row', 'old']] },
      userDirty: false
    };
    const updateTabPayload = jest.fn((ownerTab, updater) => {
      const draft = clone(ownerTab.payload);
      ownerTab.payload = updater(draft) || draft;
      ownerTab.userDirty = true;
      return true;
    });
    global.window.Main = {
      session: {
        workspaceState: { tabs: [tab] },
        getActiveTab: () => tab,
        updateTabPayload,
        commitTabPayload: jest.fn((ownerTab, payload) => {
          ownerTab.payload = clone(payload);
          ownerTab.userDirty = true;
          return true;
        }),
        markTabUserModified: jest.fn((ownerTab) => {
          ownerTab.userDirty = true;
          return true;
        })
      },
      components: { registry: { heatmap: {} } }
    };

    const container = document.createElement('div');
    container.id = 'agFirstHeatmapPasteHot';
    container.dataset.workspaceTabId = tab.id;
    container.dataset.componentType = tab.type;
    document.body.appendChild(container);
    const scheduleDraw = jest.fn();
    const hot = fixture.createTable(
      container,
      { rows: 6, cols: 3 },
      scheduleDraw,
      {
        debugLabel: 'heatmap',
        data: clone(tab.payload.data)
      }
    );
    hot.selectCell(0, 0);
    const transaction = Shared.hot.beginOwnerProjectionTransaction({
      hotInstance: hot,
      reason: 'table-import'
    });

    const event = new global.window.Event('paste', { bubbles: true, cancelable: true });
    event.clipboardData = { getData: () => 'Gene\tS1\nA\t1\nB\t2' };
    container.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(Shared.hot.isOwnerProjectionTransactionCurrent(transaction)).toBe(false);
    expect(Shared.hot.getLastOwnerProjectionTransaction(tab)).toEqual(expect.objectContaining({
      interruptedByUserMutation: true,
      interruptionReason: 'table-paste-start'
    }));
    expect(tab.payload.data.slice(0, 3).map(row => row.slice(0, 2))).toEqual([
      ['Gene', 'S1'],
      ['A', '1'],
      ['B', '2']
    ]);
    expect(hot.getSourceData().slice(0, 3).map(row => row.slice(0, 2))).toEqual(
      tab.payload.data.slice(0, 3).map(row => row.slice(0, 2))
    );
    expect(tab.userDirty).toBe(true);
    expect(updateTabPayload).not.toHaveBeenCalled();
    expect(global.window.Main.session.commitTabPayload).toHaveBeenCalledTimes(1);
    expect(scheduleDraw).toHaveBeenCalledTimes(1);
    expect(scheduleDraw).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'afterPaste',
      changes: expect.arrayContaining([[0, 0, 'Old', 'Gene']])
    }));
  });

  test('loadData adopts large matrices without mutating the source matrix or source rows', () => {
    const container = document.createElement('div');
    container.id = 'agLoadDataCowHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 1, cols: 1 },
      () => {},
      {
        debugLabel: 'ag-load-data-cow',
        data: [['']]
      }
    );
    const source = [
      ['A', 'B'],
      ['1', '2']
    ];

    hot.loadData(source);

    expect(source).toEqual([
      ['A', 'B'],
      ['1', '2']
    ]);
    expect(hot.getSourceData()).not.toBe(source);
    expect(hot.getSourceData()[0]).toBe(source[0]);

    hot.setDataAtCell(1, 1, 'changed', 'test-edit');

    expect(hot.getDataAtCell(1, 1)).toBe('changed');
    expect(source[1][1]).toBe('2');
    expect(hot.getSourceData()[1]).not.toBe(source[1]);
  });

  test('paste handler stops other paste listeners (capture)', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteStopImmediateHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-paste-stop-immediate',
        data: Shared.createEmptyData(3, 3)
      }
    );

    hot.selectCell(0, 0);

    const spy = jest.fn();
    container.addEventListener(
      'paste',
      () => {
        spy();
      },
      true
    );

    const evt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    evt.clipboardData = { getData: () => 'X' };
    container.dispatchEvent(evt);

    expect(spy).toHaveBeenCalledTimes(0);
    expect(hot.getDataAtCell(0, 0)).toBe('X');
  });

  test('paste from text node inside contenteditable editor is not intercepted by table paste handler', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteEditableTextNodeHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-paste-editable-text-node',
        data: Shared.createEmptyData(3, 3)
      }
    );
    hot.setDataAtCell(0, 0, 'keep');
    hot.selectCell(0, 0);

    const editor = document.createElement('div');
    editor.className = 'ag-cell-inline-editing';
    editor.setAttribute('contenteditable', 'plaintext-only');
    const textNode = document.createTextNode('x');
    editor.appendChild(textNode);
    container.appendChild(editor);

    const evt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    evt.clipboardData = { getData: () => 'X' };
    textNode.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(false);
    expect(hot.getDataAtCell(0, 0)).toBe('keep');
  });

  test('paste is ignored when inline editor is active even if event targets container', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteInlineEditorActiveHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-paste-inline-editor-active',
        data: Shared.createEmptyData(3, 3)
      }
    );
    hot.setDataAtCell(0, 0, 'keep');
    hot.selectCell(0, 0);

    const inlineEdit = document.createElement('div');
    inlineEdit.className = 'ag-cell-inline-editing';
    const input = document.createElement('input');
    input.className = 'ag-input-field-input';
    inlineEdit.appendChild(input);
    container.appendChild(inlineEdit);

    const evt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    evt.clipboardData = { getData: () => 'X' };
    container.dispatchEvent(evt);

    expect(evt.defaultPrevented).toBe(false);
    expect(hot.getDataAtCell(0, 0)).toBe('keep');
  });

  test('shift-click expands selection range using ag-row row-index', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agSelectHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-select',
        data: Shared.createEmptyData(3, 3)
      }
    );

    hot.selectCell(0, 0);

    const row = document.createElement('div');
    row.className = 'ag-row';
    row.setAttribute('row-index', '1');

    const cell = document.createElement('div');
    cell.className = 'ag-cell';
    cell.setAttribute('col-id', 'c1');
    row.appendChild(cell);
    container.appendChild(row);

    const mouseDown = new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      shiftKey: true
    });
    cell.dispatchEvent(mouseDown);

    const mouseUp = new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 });
    global.window.dispatchEvent(mouseUp);

    expect(hot.getSelectedLast()).toEqual([0, 0, 1, 1]);
  });

  test('manual column resize persists after rebuildColumns-triggering update', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agColumnResizePersistHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-column-resize-persist',
        data: Shared.createEmptyData(3, 3)
      }
    );

    const widthStateApi = {
      getColumnState: jest.fn(() => [
        { colId: 'c0', width: 96 },
        { colId: 'c1', width: 222 },
        { colId: 'c2', width: 96 }
      ]),
      applyColumnState: jest.fn()
    };
    hot.columnApi = widthStateApi;
    hot.gridApi.columnApi = widthStateApi;

    expect(typeof fixture.capturedGridOptions?.onColumnResized).toBe('function');
    fixture.capturedGridOptions.onColumnResized({ finished: true, api: hot.gridApi, columnApi: widthStateApi });

    hot.updateSettings({ minCols: 4 });

    const defs = fixture.capturedGridOptions?.columnDefs || [];
    const flattenDefs = list => (Array.isArray(list) ? list.flatMap(def => {
      if(def && Array.isArray(def.children)){
        return flattenDefs(def.children);
      }
      return [def];
    }) : []);
    const leafDefs = flattenDefs(defs);
    const col1 = leafDefs.find(def => def && def.colId === 'c1');
    expect(col1).toBeTruthy();
    expect(col1.width).toBe(222);
  });

  test('user column resize writes widths to the owning tab UI state and marks it dirty', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agColumnResizeOwnerStateHot';
    document.body.appendChild(container);
    const tab = { id: 'width-owner', type: 'box', uiState: null };
    const markTabUserModified = jest.fn(() => true);
    global.window.Main = {
      session: {
        workspaceState: { tabs: [tab], activeTabId: tab.id },
        getActiveTab: () => tab,
        markTabUserModified
      }
    };
    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      { debugLabel: 'ag-column-resize-owner-state', data: Shared.createEmptyData(3, 3) }
    );
    const widthStateApi = {
      getColumnState: () => [
        { colId: 'c0', width: 101 },
        { colId: 'c1', width: 202 },
        { colId: 'c2', width: 303 }
      ],
      applyColumnState: jest.fn()
    };
    hot.columnApi = widthStateApi;
    hot.gridApi.columnApi = widthStateApi;

    fixture.capturedGridOptions.onColumnResized({
      api: hot.gridApi,
      columnApi: widthStateApi,
      finished: true,
      source: 'uiColumnResized'
    });

    expect(tab.uiState.component.table.columnWidths).toEqual({ c0: 101, c1: 202, c2: 303 });
    expect(markTabUserModified).toHaveBeenCalledWith(
      tab,
      'table-column-width-changed',
      expect.objectContaining({ affectsPayload: false })
    );
  });

  test('uniform column groups expose only their outer resize handle', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agUniformGroupResizeHandlesHot';
    document.body.appendChild(container);

    fixture.createTable(
      container,
      { rows: 3, cols: 5 },
      () => {},
      {
        debugLabel: 'ag-uniform-group-resize-handles',
        data: Shared.createEmptyData(3, 5),
        columnGroups: [{ startCol: 1, span: 3 }]
      }
    );

    const defs = fixture.capturedGridOptions?.columnDefs || [];
    const flattenDefs = list => (Array.isArray(list) ? list.flatMap(def => {
      if(def && Array.isArray(def.children)){
        return flattenDefs(def.children);
      }
      return [def];
    }) : []);
    const leaves = flattenDefs(defs);
    const byId = colId => leaves.find(def => def?.colId === colId);

    expect(byId('c1')?.resizable).toBe(false);
    expect(byId('c2')?.resizable).toBe(false);
    expect(byId('c3')?.resizable).not.toBe(false);
    expect(byId('c4')?.resizable).not.toBe(false);
  });

  test('dragging a group outer edge resizes every child uniformly', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agUniformGroupResizeHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 5 },
      () => {},
      {
        debugLabel: 'ag-uniform-group-resize',
        data: Shared.createEmptyData(3, 5),
        columnGroups: [{ startCol: 1, span: 3 }]
      }
    );
    const widths = new Map([
      ['c0', 100],
      ['c1', 90],
      ['c2', 110],
      ['c3', 130],
      ['c4', 100]
    ]);
    const widthStateApi = {
      getColumnState: jest.fn(() => Array.from(widths, ([colId, width]) => ({ colId, width }))),
      applyColumnState: jest.fn(({ state }) => {
        state.forEach(({ colId, width }) => widths.set(colId, width));
        return true;
      })
    };
    hot.columnApi = widthStateApi;
    hot.gridApi.columnApi = widthStateApi;

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c3');
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'ag-header-cell-resize';
    header.appendChild(resizeHandle);
    container.appendChild(header);
    resizeHandle.dispatchEvent(new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 300
    }));

    global.window.dispatchEvent(new global.window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 330
    }));

    expect([widths.get('c1'), widths.get('c2'), widths.get('c3')]).toEqual([100, 120, 140]);

    global.window.dispatchEvent(new global.window.MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 330
    }));

    expect([widths.get('c1'), widths.get('c2'), widths.get('c3')]).toEqual([100, 120, 140]);
    expect(widthStateApi.applyColumnState).toHaveBeenLastCalledWith({
      state: [
        { colId: 'c1', width: 100 },
        { colId: 'c2', width: 120 },
        { colId: 'c3', width: 140 }
      ],
      applyOrder: false
    });
  });

  test('dragging column headers selects a multi-column range', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragColsHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-header-drag-cols',
        data: Shared.createEmptyData(3, 3)
      }
    );
    const lastRow = hot.countRows() - 1;

    const header0 = document.createElement('div');
    header0.className = 'ag-header-cell';
    header0.setAttribute('col-id', 'c0');
    container.appendChild(header0);

    const header2 = document.createElement('div');
    header2.className = 'ag-header-cell';
    header2.setAttribute('col-id', 'c2');
    container.appendChild(header2);

    const mouseDown = new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    header0.dispatchEvent(mouseDown);

    const mouseMove = new global.window.MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1 });
    header2.dispatchEvent(mouseMove);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const mouseUp = new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 });
    global.window.dispatchEvent(mouseUp);

    expect(hot.getSelectedLast()).toEqual([0, 0, lastRow, 2]);
  });

  test('data columns suppress native AG Grid header moving', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderNativeMoveSuppressedHot';
    document.body.appendChild(container);

    fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-header-native-move-suppressed',
        data: Shared.createEmptyData(3, 3)
      }
    );

    const dataDefs = (fixture.capturedGridOptions?.columnDefs || []).filter(def => /^c\d+$/.test(def?.colId || ''));
    expect(dataDefs.length).toBeGreaterThan(0);
    dataDefs.forEach(def => {
      expect(def.suppressMovable).toBe(true);
    });
  });

  test('dragging row headers selects a multi-row range', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragRowsHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-header-drag-rows',
        data: Shared.createEmptyData(3, 3)
      }
    );
    const lastCol = hot.countCols() - 1;

    const row0 = document.createElement('div');
    row0.className = 'ag-row';
    row0.setAttribute('row-index', '0');
    const row0Header = document.createElement('div');
    row0Header.className = 'ag-cell';
    row0Header.setAttribute('col-id', '__rowHeader');
    row0.appendChild(row0Header);
    container.appendChild(row0);

    const row2 = document.createElement('div');
    row2.className = 'ag-row';
    row2.setAttribute('row-index', '2');
    const row2Header = document.createElement('div');
    row2Header.className = 'ag-cell';
    row2Header.setAttribute('col-id', '__rowHeader');
    row2.appendChild(row2Header);
    container.appendChild(row2);

    const mouseDown = new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    row0Header.dispatchEvent(mouseDown);

    const mouseMove = new global.window.MouseEvent('mousemove', { bubbles: true, cancelable: true });
    row2Header.dispatchEvent(mouseMove);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const mouseUp = new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 });
    global.window.dispatchEvent(mouseUp);

    expect(hot.getSelectedLast()).toEqual([0, 0, 2, lastCol]);
  });

  test('dragging pinned first-row cells replaces prior body selection', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPinnedFirstRowDragHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-pinned-first-row-drag',
        data: Shared.createEmptyData(4, 3),
        pinFirstRow: true
      }
    );

    hot.selectCell(2, 1);

    const pinnedRow = document.createElement('div');
    pinnedRow.className = 'ag-row';
    pinnedRow.setAttribute('row-index', 't-0');

    const cell0 = document.createElement('div');
    cell0.className = 'ag-cell';
    cell0.setAttribute('col-id', 'c0');
    pinnedRow.appendChild(cell0);

    const cell2 = document.createElement('div');
    cell2.className = 'ag-cell';
    cell2.setAttribute('col-id', 'c2');
    pinnedRow.appendChild(cell2);

    container.appendChild(pinnedRow);

    const mouseDown = new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    cell0.dispatchEvent(mouseDown);

    const mouseMove = new global.window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1
    });
    cell2.dispatchEvent(mouseMove);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const mouseUp = new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 });
    global.window.dispatchEvent(mouseUp);

    expect(hot.getSelectedLast()).toEqual([0, 0, 0, 2]);
  });

  test('pinned top rows use physical row index for selected-cell class rule', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPinnedSelectedClassHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-pinned-selected-class',
        data: Shared.createEmptyData(4, 3),
        pinFirstRow: true
      }
    );

    const colDef = (fixture.capturedGridOptions?.columnDefs || []).find(def => def?.colId === 'c1');
    expect(colDef).toBeTruthy();
    const selectedRule = colDef?.cellClassRules?.['hot-selected-cell'];
    expect(typeof selectedRule).toBe('function');

    const applyRule = params => selectedRule(params);
    hot.selectCell(0, 1, 0, 1);

    expect(
      applyRule({
        node: { rowPinned: 'top', rowIndex: null },
        data: { __rowIndex: 0 },
        column: { getColId: () => 'c1' }
      })
    ).toBe(true);

    expect(
      applyRule({
        node: { rowPinned: 'top', rowIndex: null },
        data: { __rowIndex: 1 },
        column: { getColId: () => 'c1' }
      })
    ).toBe(false);
  });

  test('fill handle appears for pinned header-row cells without a duplicate body row', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPinnedFillHandleHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 300,
      width: 500,
      height: 300
    });

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-pinned-fill-handle',
        data: Shared.createEmptyData(4, 3),
        pinFirstRow: true
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 300,
      width: 500,
      height: 300
    });
    const ghostRow = document.createElement('div');
    ghostRow.className = 'ag-row';
    ghostRow.setAttribute('row-index', '0');
    const ghostCell = document.createElement('div');
    ghostCell.className = 'ag-cell';
    ghostCell.setAttribute('col-id', 'c0');
    ghostCell.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 0,
      width: 100,
      height: 0
    });
    ghostRow.appendChild(ghostCell);
    bodyViewport.appendChild(ghostRow);
    container.appendChild(bodyViewport);

    const floatingTop = document.createElement('div');
    floatingTop.className = 'ag-floating-top';
    const pinnedViewport = document.createElement('div');
    pinnedViewport.className = 'ag-center-cols-viewport';
    pinnedViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 30,
      width: 500,
      height: 30
    });
    const pinnedRow = document.createElement('div');
    pinnedRow.className = 'ag-row';
    pinnedRow.setAttribute('row-index', 't-0');
    const pinnedCell = document.createElement('div');
    pinnedCell.className = 'ag-cell';
    pinnedCell.setAttribute('col-id', 'c0');
    pinnedCell.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 100,
      bottom: 28,
      width: 100,
      height: 28
    });
    pinnedRow.appendChild(pinnedCell);
    pinnedViewport.appendChild(pinnedRow);
    floatingTop.appendChild(pinnedViewport);
    container.appendChild(floatingTop);

    hot.selectCell(0, 0, 0, 0);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const handle = container.querySelector('.hot-fill-handle');
    expect(handle).toBeTruthy();
    expect(handle.style.display).toBe('block');
  });

  test('fill handle prefers pinned header-row cell when ghost body row is still renderable', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPinnedFillHandlePreferPinnedHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 300,
      width: 500,
      height: 300
    });

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-pinned-fill-handle-prefer-pinned',
        data: Shared.createEmptyData(4, 3),
        pinFirstRow: true
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 30,
      right: 500,
      bottom: 90,
      width: 500,
      height: 60
    });
    const ghostRow = document.createElement('div');
    ghostRow.className = 'ag-row';
    ghostRow.setAttribute('row-index', '0');
    const ghostCell = document.createElement('div');
    ghostCell.className = 'ag-cell';
    ghostCell.setAttribute('col-id', 'c1');
    ghostCell.getBoundingClientRect = () => ({
      left: 100,
      top: 120,
      right: 200,
      bottom: 148,
      width: 100,
      height: 28
    });
    ghostRow.appendChild(ghostCell);
    bodyViewport.appendChild(ghostRow);
    container.appendChild(bodyViewport);

    const floatingTop = document.createElement('div');
    floatingTop.className = 'ag-floating-top';
    const pinnedViewport = document.createElement('div');
    pinnedViewport.className = 'ag-center-cols-viewport';
    pinnedViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 30,
      width: 500,
      height: 30
    });
    const pinnedRow = document.createElement('div');
    pinnedRow.className = 'ag-row';
    // Intentionally omit row-index to mirror AG Grid pinned-row variants.
    const pinnedCell = document.createElement('div');
    pinnedCell.className = 'ag-cell';
    pinnedCell.setAttribute('col-id', 'c1');
    pinnedCell.getBoundingClientRect = () => ({
      left: 100,
      top: 0,
      right: 200,
      bottom: 28,
      width: 100,
      height: 28
    });
    pinnedRow.appendChild(pinnedCell);
    pinnedViewport.appendChild(pinnedRow);
    floatingTop.appendChild(pinnedViewport);
    container.appendChild(floatingTop);

    hot.selectCell(0, 1, 0, 1);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const handle = container.querySelector('.hot-fill-handle');
    expect(handle).toBeTruthy();
    expect(handle.style.display).toBe('block');
    expect(handle.style.left).toBe('200px');
    expect(handle.style.top).toBe('28px');
    expect(handle.style.zIndex).toBe('12');
    expect(handle.dataset.pinnedSelection).toBe('1');
  });

  test('fill handle uses pinned-top viewport clipping for pinned first row without center viewport ancestor', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPinnedFillHandleViewportFallbackHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 300,
      width: 500,
      height: 300
    });

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-pinned-fill-handle-viewport-fallback',
        data: Shared.createEmptyData(4, 3),
        pinFirstRow: true
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 500,
      bottom: 300,
      width: 500,
      height: 240
    });
    const bodyCenterViewport = document.createElement('div');
    bodyCenterViewport.className = 'ag-center-cols-viewport';
    bodyCenterViewport.getBoundingClientRect = bodyViewport.getBoundingClientRect;
    const ghostRow = document.createElement('div');
    ghostRow.className = 'ag-row';
    ghostRow.setAttribute('row-index', '0');
    const ghostCell = document.createElement('div');
    ghostCell.className = 'ag-cell';
    ghostCell.setAttribute('col-id', 'c1');
    ghostCell.getBoundingClientRect = () => ({
      left: 100,
      top: 80,
      right: 200,
      bottom: 108,
      width: 100,
      height: 28
    });
    ghostRow.appendChild(ghostCell);
    bodyCenterViewport.appendChild(ghostRow);
    bodyViewport.appendChild(bodyCenterViewport);
    container.appendChild(bodyViewport);

    const floatingTop = document.createElement('div');
    floatingTop.className = 'ag-floating-top';
    floatingTop.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 30,
      width: 500,
      height: 30
    });
    const floatingRow = document.createElement('div');
    floatingRow.className = 'ag-row';
    const floatingCell = document.createElement('div');
    floatingCell.className = 'ag-cell';
    floatingCell.setAttribute('col-id', 'c1');
    floatingCell.getBoundingClientRect = () => ({
      left: 100,
      top: 0,
      right: 200,
      bottom: 28,
      width: 100,
      height: 28
    });
    floatingRow.appendChild(floatingCell);
    floatingTop.appendChild(floatingRow);
    container.appendChild(floatingTop);

    hot.selectCell(0, 1, 0, 1);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const handle = container.querySelector('.hot-fill-handle');
    expect(handle).toBeTruthy();
    expect(handle.style.display).toBe('block');
    expect(handle.style.left).toBe('200px');
    expect(handle.style.top).toBe('28px');
  });
});
