describe('Shared.hot AG Grid binding', () => {
  let originalAgGrid;
  let capturedGridOptions;
  let capturedApi;

  beforeEach(() => {
    jest.resetModules();
    capturedGridOptions = null;
    capturedApi = null;

    originalAgGrid = global.window?.agGrid;
    const api = {
      refreshCells: jest.fn(),
      setRowData: jest.fn(next => {
        if (capturedGridOptions) {
          capturedGridOptions.rowData = next;
        }
      }),
      setColumnDefs: jest.fn(next => {
        if (capturedGridOptions) {
          capturedGridOptions.columnDefs = next;
        }
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
    require('../js/shared/undo.js');
    require('../js/shared/hot.js');

    const manager = global.window?.Shared?.undoManager;
    if(manager && typeof manager.clear === 'function'){
      manager.clear();
    }
  });

  afterEach(() => {
    global.window.agGrid = originalAgGrid;
    capturedGridOptions = null;
    capturedApi = null;
  });

  test('loadData updates valueGetter source and keeps edits in sync', () => {
    const Shared = global.window.Shared;
    expect(Shared?.hot?.createStandardTable).toBeInstanceOf(Function);

    const container = document.createElement('div');
    container.id = 'testAgHot';
    document.body.appendChild(container);

    const scheduleCalls = [];
    const scheduleDraw = meta => scheduleCalls.push(meta);
    const afterChangeSpy = jest.fn();

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      scheduleDraw,
      {
        debugLabel: 'test-ag-grid',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ],
        hotOptions: {
          afterChange: afterChangeSpy
        }
      }
    );

    expect(hot).toBeTruthy();
    expect(capturedGridOptions).toBeTruthy();
    expect(capturedApi).toBeTruthy();
    expect(hot.gridApi).toBe(capturedApi);

    const getCellViaColumnDef = (rowIndex, colIndex) => {
      const def = capturedGridOptions.columnDefs.find(col => col.colId === `c${colIndex}`);
      expect(def).toBeTruthy();
      return def.valueGetter({ data: { __rowIndex: rowIndex }, node: { rowIndex } });
    };

    expect(getCellViaColumnDef(0, 0)).toBe('A');
    expect(getCellViaColumnDef(1, 1)).toBe('D');

    const next = [
      ['Label', 'X Value'],
      ['Cat', 4.5]
    ];
    hot.loadData(next);

    expect(getCellViaColumnDef(0, 0)).toBe('Label');
    expect(getCellViaColumnDef(1, 1)).toBe(4.5);
    expect(hot.getDataAtCell(1, 1)).toBe(4.5);

    const col1 = capturedGridOptions.columnDefs.find(col => col.colId === 'c1');
    expect(col1).toBeTruthy();
    col1.valueSetter({ data: { __rowIndex: 0 }, node: { rowIndex: 0 }, newValue: 'X_NEW' });

    capturedGridOptions.onCellValueChanged({
      node: { rowIndex: 0 },
      column: { getColId: () => 'c1' },
      oldValue: 'X Value',
      newValue: 'X_NEW',
      source: 'edit'
    });

    expect(hot.getDataAtCell(0, 1)).toBe('X_NEW');
    expect(afterChangeSpy).toHaveBeenCalledWith([[0, 1, 'X Value', 'X_NEW']], 'edit');
    expect(scheduleCalls.some(call => call && call.reason === 'afterChange')).toBe(true);
  });

  test('getSelectedLast returns flat tuple and setDataAtCell supports change lists', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHot2';
    document.body.appendChild(container);

    const scheduleCalls = [];
    const scheduleDraw = meta => scheduleCalls.push(meta);
    const afterChangeSpy = jest.fn();

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      scheduleDraw,
      {
        debugLabel: 'test-ag-grid-2',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ],
        hotOptions: {
          afterChange: afterChangeSpy
        }
      }
    );

    hot.selectCell(1, 1);
    expect(hot.getSelectedLast()).toEqual([1, 1, 1, 1]);

    hot.setDataAtCell(
      [
        [0, 0, 'A2'],
        [1, 1, 'D2']
      ],
      'unit-test'
    );

    expect(hot.getDataAtCell(0, 0)).toBe('A2');
    expect(hot.getDataAtCell(1, 1)).toBe('D2');
    expect(afterChangeSpy).toHaveBeenLastCalledWith(
      [
        [0, 0, 'A', 'A2'],
        [1, 1, 'D', 'D2']
      ],
      'unit-test'
    );
    expect(scheduleCalls.some(call => call && call.reason === 'afterChange')).toBe(true);
  });

  test('loadData with recordUndo can be undone and redone', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotUndo';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      {
        debugLabel: 'test-ag-grid-undo',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ]
      }
    );

    hot.loadData(
      [
        ['X', 'Y'],
        ['Z', 'W']
      ],
      {
        source: 'example-load',
        recordUndo: true,
        undoLabel: 'table:test-ag-grid-undo:example-load'
      }
    );

    expect(hot.getDataAtCell(0, 0)).toBe('X');
    expect(hot.getDataAtCell(1, 1)).toBe('W');

    const manager = Shared.undoManager;
    expect(manager.undo()).toBe(true);
    expect(hot.getDataAtCell(0, 0)).toBe('A');
    expect(hot.getDataAtCell(1, 1)).toBe('D');

    expect(manager.redo()).toBe(true);
    expect(hot.getDataAtCell(0, 0)).toBe('X');
    expect(hot.getDataAtCell(1, 1)).toBe('W');
  });
});
