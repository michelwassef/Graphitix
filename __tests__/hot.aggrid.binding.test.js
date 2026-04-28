describe('Shared.hot AG Grid binding', () => {
  let originalAgGrid;
  let capturedGridOptions;
  let capturedApi;
  const dispatchTouchPointerEvent = (target, type, overrides = {}) => {
    const event = new global.window.Event(type, { bubbles: true, cancelable: true });
    const payload = Object.assign({
      pointerType: 'touch',
      pointerId: 1,
      clientX: 16,
      clientY: 16
    }, overrides);
    Object.entries(payload).forEach(([key, value]) => {
      Object.defineProperty(event, key, {
        configurable: true,
        value
      });
    });
    target.dispatchEvent(event);
    return event;
  };

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
      startEditingCell: jest.fn(),
      destroy: jest.fn(),
      getFocusedCell: jest.fn(() => null),
      getEditingCells: jest.fn(() => [])
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

  test('defaults to double-click editing even when the browser reports touch capability', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotTouchHeuristic';
    document.body.appendChild(container);

    const originalMatchMedia = global.window.matchMedia;
    const maxTouchPointsDescriptor = Object.getOwnPropertyDescriptor(global.window.navigator, 'maxTouchPoints');

    global.window.matchMedia = jest.fn().mockImplementation(query => ({
      matches: query === '(pointer: coarse)' || query === '(hover: none)',
      media: query,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(() => false)
    }));
    Object.defineProperty(global.window.navigator, 'maxTouchPoints', {
      configurable: true,
      value: 5
    });

    try {
      Shared.hot.createStandardTable(
        container,
        { rows: 2, cols: 2 },
        () => {},
        {
          debugLabel: 'test-ag-grid-touch-heuristic',
          data: [
            ['A', 'B'],
            ['C', 'D']
          ]
        }
      );

      expect(capturedGridOptions).toBeTruthy();
      expect(capturedGridOptions.singleClickEdit).toBe(false);
    } finally {
      if (typeof originalMatchMedia === 'function') {
        global.window.matchMedia = originalMatchMedia;
      } else {
        delete global.window.matchMedia;
      }
      if (maxTouchPointsDescriptor) {
        Object.defineProperty(global.window.navigator, 'maxTouchPoints', maxTouchPointsDescriptor);
      } else {
        delete global.window.navigator.maxTouchPoints;
      }
    }
  });

  test('touch editing requires a second tap on the same cell', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotTouchDoubleTap';
    document.body.appendChild(container);

    Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 2 },
      () => {},
      {
        debugLabel: 'test-ag-grid-touch-double-tap',
        data: [
          ['Label', 'Value'],
          ['A', '1'],
          ['B', '2']
        ]
      }
    );

    container.innerHTML = `
      <div class="ag-row" row-index="1">
        <div class="ag-cell" row-index="1" col-id="c0"></div>
      </div>
    `;
    const cell = container.querySelector('.ag-cell');
    expect(cell).toBeTruthy();

    dispatchTouchPointerEvent(cell, 'pointerdown', { pointerId: 11 });
    dispatchTouchPointerEvent(cell, 'pointerup', { pointerId: 11 });
    expect(capturedApi.startEditingCell).not.toHaveBeenCalled();

    dispatchTouchPointerEvent(cell, 'pointerdown', { pointerId: 12 });
    dispatchTouchPointerEvent(cell, 'pointerup', { pointerId: 12 });
    expect(capturedApi.startEditingCell).toHaveBeenCalledWith({
      rowIndex: 1,
      colKey: 'c0',
      rowPinned: null
    });
  });

  test.skip('loadData with recordUndo can be undone and redone', () => {
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

  test('applyFilters keeps header rows visible and narrows analysis data', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotFilters';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 2 },
      () => {},
      {
        debugLabel: 'test-ag-grid-filters',
        data: [
          ['Label', 'Value'],
          ['A', 1],
          ['B', 2],
          ['C', 3]
        ]
      }
    );

    hot.applyFilters({
      version: 1,
      columns: {
        c1: {
          kind: 'condition',
          operator: 'greaterThan',
          value: '1',
          columnType: 'numeric'
        }
      }
    }, { schedule: false });

    expect(hot.countRows()).toBe(3);
    expect(hot.getDataAtCell(0, 0)).toBe('Label');
    expect(hot.getDataAtCell(1, 0)).toBe('B');
    expect(hot.getDataAtCell(2, 0)).toBe('C');

    const analysis = hot.getAnalysisData();
    expect(analysis.rowCount).toBe(3);
    expect(analysis.data.map(row => row.slice(0, 2))).toEqual([
      ['Label', 'Value'],
      ['B', 2],
      ['C', 3]
    ]);
    expect(hot.getIncludedDataMatrix().map(row => row.slice(0, 2))).toEqual([
      ['Label', 'Value'],
      ['B', 2],
      ['C', 3]
    ]);
  });

  test('exportFilters can be cleared and reapplied', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotFilterRoundTrip';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 2 },
      () => {},
      {
        debugLabel: 'test-ag-grid-filter-roundtrip',
        data: [
          ['Label', 'Value'],
          ['A', 1],
          ['B', 2],
          ['C', 2]
        ]
      }
    );

    hot.applyFilters({
      version: 1,
      columns: {
        c1: {
          kind: 'condition',
          operator: 'equals',
          value: '2',
          columnType: 'numeric'
        }
      }
    }, { schedule: false });

    const exported = hot.exportFilters();
    expect(exported).toEqual({
      version: 1,
      columns: {
        c1: {
          kind: 'condition',
          operator: 'equals',
          value: '2',
          columnType: 'numeric'
        }
      }
    });
    expect(hot.countRows()).toBe(3);

    hot.clearFilters({ schedule: false });
    expect(hot.countRows()).toBe(4);

    hot.applyFilters(exported, { schedule: false });
    expect(hot.countRows()).toBe(3);
    expect(hot.getDataAtCell(1, 0)).toBe('B');
    expect(hot.getDataAtCell(2, 0)).toBe('C');
  });
});
