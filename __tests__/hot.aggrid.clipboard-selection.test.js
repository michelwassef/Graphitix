describe('Shared.hot AG Grid clipboard + selection behaviors', () => {
  let originalAgGrid;
  let capturedGridOptions;
  let capturedApi;
  let originalClipboard;

  beforeEach(() => {
    jest.resetModules();
    capturedGridOptions = null;
    capturedApi = null;

    originalAgGrid = global.window?.agGrid;
    originalClipboard = global.window?.navigator?.clipboard;
    const api = {
      refreshCells: jest.fn(),
      setRowData: jest.fn(next => {
        if (capturedGridOptions) capturedGridOptions.rowData = next;
      }),
      setColumnDefs: jest.fn(next => {
        if (capturedGridOptions) capturedGridOptions.columnDefs = next;
      }),
      destroy: jest.fn(),
      getFocusedCell: jest.fn(() => null)
    };
    capturedApi = api;

    global.window.agGrid = {
      createGrid: (container, gridOptions) => {
        capturedGridOptions = gridOptions;
        gridOptions?.onGridReady?.({ api, columnApi: {} });
        return api;
      }
    };

    require('../js/vendor.js');
    require('../js/shared/agGridAdapter.js');
    require('../js/shared/hot.js');
  });

  afterEach(() => {
    global.window.agGrid = originalAgGrid;
    if (global.window?.navigator) {
      global.window.navigator.clipboard = originalClipboard;
    }
    capturedGridOptions = null;
    capturedApi = null;
  });

  test('pastes plain text into the selected cell via paste event', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteEventHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
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

  test('paste handler stops other paste listeners (capture)', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteStopImmediateHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
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

  test('shift-click expands selection range using ag-row row-index', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agSelectHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
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

  test('dragging column headers selects a multi-column range', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragColsHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
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

  test('dragging row headers selects a multi-row range', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragRowsHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
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

  test('drag handle drag moves a column without affecting selection', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleMoveHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-header-drag-handle-move',
        data: Shared.createEmptyData(3, 3)
      }
    );

    const moveColumnSpy = jest.fn();
    const moveColumnsSpy = jest.fn();
    hot.columnApi = {
      getAllDisplayedColumns: () => [
        { getColId: () => 'c0' },
        { getColId: () => 'c1' },
        { getColId: () => 'c2' }
      ],
      moveColumns: moveColumnsSpy,
      moveColumn: moveColumnSpy
    };

    hot.selectCell(0, 0);

    const header0 = document.createElement('div');
    header0.className = 'ag-header-cell';
    header0.setAttribute('col-id', 'c0');
    const handle = document.createElement('span');
    handle.className = 'hot-col-drag-handle';
    header0.appendChild(handle);
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
    handle.dispatchEvent(mouseDown);

    const mouseMove = new global.window.MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1 });
    header2.dispatchEvent(mouseMove);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const mouseUp = new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 });
    global.window.dispatchEvent(mouseUp);

    expect(moveColumnsSpy).toHaveBeenCalled();
    expect(hot.getSelectedLast()).toEqual([0, 0, 0, 0]);
  });

  test('drag handle drag moves a selected column group together', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleGroupMoveHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-header-drag-handle-group-move',
        data: Shared.createEmptyData(3, 4)
      }
    );

    const lastRow = hot.countRows() - 1;
    hot.selectCell(0, 1, lastRow, 2); // selects columns 1..2 (full height)

    const moveColumnsSpy = jest.fn();
    hot.columnApi = {
      getAllDisplayedColumns: () => [
        { getColId: () => 'c0' },
        { getColId: () => 'c1' },
        { getColId: () => 'c2' },
        { getColId: () => 'c3' }
      ],
      moveColumns: moveColumnsSpy
    };

    const header1 = document.createElement('div');
    header1.className = 'ag-header-cell';
    header1.setAttribute('col-id', 'c1');
    const handle = document.createElement('span');
    handle.className = 'hot-col-drag-handle';
    header1.appendChild(handle);
    container.appendChild(header1);

    const header3 = document.createElement('div');
    header3.className = 'ag-header-cell';
    header3.setAttribute('col-id', 'c3');
    header3.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 });
    container.appendChild(header3);

    const mouseDown = new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    handle.dispatchEvent(mouseDown);

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => header3;

    const mouseMove = new global.window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 80,
      clientY: 10
    });
    header3.dispatchEvent(mouseMove);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const mouseUp = new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 });
    global.window.dispatchEvent(mouseUp);
    document.elementFromPoint = originalElementFromPoint;

    expect(moveColumnsSpy).toHaveBeenCalled();
    expect(moveColumnsSpy.mock.calls[0][0]).toEqual(['c1', 'c2']);
  });

  test('drag handle commits new column order into underlying data', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleCommitHot';
    document.body.appendChild(container);

    // Track displayed order for the mocked columnApi (createStandardTable enforces MIN_INPUT_COLS).
    let displayed = Array.from({ length: 12 }, (_, idx) => `c${idx}`);

    // Override grid creation to provide an api we can mutate for this test.
    const originalAgGrid = global.window.agGrid;
    global.window.agGrid = {
      createGrid: (_container, gridOptions) => {
        const api = {
          refreshCells: jest.fn(),
          setRowData: jest.fn(),
          setColumnDefs: jest.fn(() => {
            // Simulate AG Grid resetting order when defs are reapplied.
            displayed = Array.from({ length: 12 }, (_, idx) => `c${idx}`);
          }),
          destroy: jest.fn(),
          getFocusedCell: jest.fn(() => null)
        };
        gridOptions?.onGridReady?.({ api, columnApi: {} });
        return api;
      }
    };

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-header-drag-handle-commit',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1']
        ]
      }
    );

    // Mock columnApi so handle-drag moves update the displayed order.
    hot.columnApi = {
      getAllDisplayedColumns: () => displayed.map(id => ({ getColId: () => id })),
      moveColumns: (ids, toIndex) => {
        const list = Array.isArray(ids) ? ids : [ids];
        const remaining = displayed.filter(id => !list.includes(id));
        const idx = Math.max(0, Math.min(Number(toIndex) || 0, remaining.length));
        displayed = remaining.slice(0, idx).concat(list).concat(remaining.slice(idx));
      }
    };

    // Build minimal header nodes for hit-testing.
    const header0 = document.createElement('div');
    header0.className = 'ag-header-cell';
    header0.setAttribute('col-id', 'c0');
    const handle = document.createElement('span');
    handle.className = 'hot-col-drag-handle';
    header0.appendChild(handle);
    container.appendChild(header0);

    const header2 = document.createElement('div');
    header2.className = 'ag-header-cell';
    header2.setAttribute('col-id', 'c2');
    header2.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 });
    container.appendChild(header2);

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => header2;

    handle.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    header2.dispatchEvent(new global.window.MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1, clientX: 80, clientY: 10 }));

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    global.window.dispatchEvent(new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    document.elementFromPoint = originalElementFromPoint;

    // After commit, underlying data should match the new visual order and be stable.
    // We dragged c0 to the right over c2 (after), so expected order is [c1, c2, c0].
    expect(hot.getDataAtCell(0, 0)).toBe('B0');
    expect(hot.getDataAtCell(0, 1)).toBe('C0');
    expect(hot.getDataAtCell(0, 2)).toBe('A0');

    global.window.agGrid = originalAgGrid;
  });

  test('postSortRows keeps the first data row anchored', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agSortHot';
    document.body.appendChild(container);

    Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-sort',
        data: Shared.createEmptyData(3, 3)
      }
    );

    expect(typeof capturedGridOptions?.postSortRows).toBe('function');

    const nodes = [
      { data: { __rowIndex: 2 } },
      { data: { __rowIndex: 0 } },
      { data: { __rowIndex: 1 } }
    ];
    capturedGridOptions.postSortRows({ nodes });

    expect(nodes[0]?.data?.__rowIndex).toBe(0);
  });

  test('postSortRows keeps all-empty rows at the bottom', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agSortEmptyHot';
    document.body.appendChild(container);

    Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-sort-empty',
        data: [
          ['H1', 'H2', 'H3'],
          ['2', '', ''],
          ['', '', ''],
          ['1', '', '']
        ]
      }
    );

    expect(typeof capturedGridOptions?.postSortRows).toBe('function');

    const nodes = [
      { data: { __rowIndex: 2 } }, // empty row (would float to top on ascending sort)
      { data: { __rowIndex: 3 } },
      { data: { __rowIndex: 1 } },
      { data: { __rowIndex: 0 } }
    ];
    capturedGridOptions.postSortRows({ nodes });

    expect(nodes.map(node => node?.data?.__rowIndex)).toEqual([0, 3, 1, 2]);
  });

  test('suppresses browser context menu over the grid container', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agContextMenuHot';
    document.body.appendChild(container);

    Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-context-menu',
        data: Shared.createEmptyData(3, 3)
      }
    );

    const evt = new global.window.Event('contextmenu', { bubbles: true, cancelable: true });
    container.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);

    const input = document.createElement('input');
    container.appendChild(input);
    const evtInput = new global.window.Event('contextmenu', { bubbles: true, cancelable: true });
    input.dispatchEvent(evtInput);
    expect(evtInput.defaultPrevented).toBe(false);
  });

  test('excluded cells are flagged via cellClassRules', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agExcludedCellHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-exclusions',
        data: Shared.createEmptyData(3, 3)
      }
    );

    const colDef = capturedGridOptions?.columnDefs?.find(def => def?.colId === 'c0');
    expect(colDef).toBeTruthy();
    expect(typeof colDef?.cellClassRules?.['hot-cell-excluded']).toBe('function');

    hot.applyExclusions({ cells: [[1, 0]] });

    const params = {
      data: { __rowIndex: 1 },
      column: { getColId: () => 'c0' },
      colDef: { colId: 'c0' }
    };

    expect(colDef.cellClassRules['hot-cell-excluded'](params)).toBe(true);
    expect(colDef.cellClassRules['hot-cell-excluded-cell'](params)).toBe(true);
    expect(colDef.cellClassRules['hot-cell-excluded-row'](params)).toBe(false);
    expect(colDef.cellClassRules['hot-cell-excluded-column'](params)).toBe(false);
  });

  test('clicking column header selects the full column', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agColHeaderSelectHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      { debugLabel: 'ag-col-header-select', data: Shared.createEmptyData(4, 3) }
    );

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c1');
    container.appendChild(header);

    const evt = new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    header.dispatchEvent(evt);

    expect(hot.getSelectedLast()).toEqual([0, 1, 3, 1]);
  });

  test('header click only sorts after column is already selected', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agColHeaderSortGateHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      { debugLabel: 'ag-col-header-sort-gate', data: Shared.createEmptyData(4, 3) }
    );

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c1');
    container.appendChild(header);

    const sortSpy = jest.fn();
    header.addEventListener('click', sortSpy);

    header.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    header.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(hot.getSelectedLast()).toEqual([0, 1, 3, 1]);
    expect(sortSpy).toHaveBeenCalledTimes(0);

    header.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    header.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(hot.getSelectedLast()).toEqual([0, 1, 3, 1]);
    expect(sortSpy).toHaveBeenCalledTimes(1);
  });

  test('clicking row header selects the full row', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agRowHeaderSelectHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      { debugLabel: 'ag-row-header-select', data: Shared.createEmptyData(4, 3) }
    );

    const row = document.createElement('div');
    row.className = 'ag-row';
    row.setAttribute('row-index', '2');

    const cell = document.createElement('div');
    cell.className = 'ag-cell hot-row-header';
    cell.setAttribute('col-id', '__rowHeader');
    row.appendChild(cell);
    container.appendChild(row);

    const evt = new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    cell.dispatchEvent(evt);

    expect(hot.getSelectedLast()).toEqual([2, 0, 2, 11]);
  });

  test('Delete clears all selected cells', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agDeleteSelectionHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-delete-selection',
        data: [
          ['H1', 'H2', 'H3'],
          ['A', 'B', 'C'],
          ['D', 'E', 'F']
        ]
      }
    );

    hot.selectCell(1, 0, 2, 1);

    const evt = new global.window.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Delete', keyCode: 46 });
    container.dispatchEvent(evt);

    expect(hot.getDataAtCell(1, 0)).toBe('');
    expect(hot.getDataAtCell(1, 1)).toBe('');
    expect(hot.getDataAtCell(2, 0)).toBe('');
    expect(hot.getDataAtCell(2, 1)).toBe('');
    expect(hot.getDataAtCell(1, 2)).toBe('C');
  });

  test('undo after cut+paste restores both source and destination', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agUndoMoveHot';
    document.body.appendChild(container);

    let clipboardText = '';
    global.window.navigator.clipboard = {
      writeText: jest.fn(async text => {
        clipboardText = text;
      })
    };

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-undo-move',
        data: [
          ['H1', 'H2', 'H3'],
          ['A', '', ''],
          ['', '', '']
        ]
      }
    );

    hot.selectCell(1, 0);

    const cutEvt = new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'x',
      ctrlKey: true
    });
    container.dispatchEvent(cutEvt);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(clipboardText.trim()).toBe('A');
    expect(hot.getDataAtCell(1, 0)).toBe('');

    hot.selectCell(1, 1);
    const pasteEvt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvt.clipboardData = { getData: () => clipboardText };
    container.dispatchEvent(pasteEvt);

    expect(hot.getDataAtCell(1, 1)).toBe('A');
    expect(hot.getDataAtCell(1, 0)).toBe('');

    expect(typeof hot.undo).toBe('function');
    hot.undo();

    expect(hot.getDataAtCell(1, 0)).toBe('A');
    expect(hot.getDataAtCell(1, 1)).toBe('');
  });
});
