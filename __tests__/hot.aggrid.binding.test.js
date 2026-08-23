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
    require('../js/shared/formulaEngine.js');
    require('../js/shared/hot.js');

    const manager = global.window?.Shared?.undoManager;
    if(manager && typeof manager.clear === 'function'){
      manager.clear();
    }
  });

  afterEach(() => {
    global.window.agGrid = originalAgGrid;
    delete global.window.Main;
    delete global.window.Components;
    capturedGridOptions = null;
    capturedApi = null;
  });

  test('row checkbox selection is opt-in', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);

    Shared.hot.createStandardTable(container, { rows: 2, cols: 2 }, () => {}, {
      debugLabel: 'no-row-selection'
    });
    expect(capturedGridOptions.rowSelection).toBeUndefined();

    const rowSelection = { mode: 'multiRow', headerCheckbox: false };
    const selectionColumnDef = { headerName: 'Show' };
    Shared.hot.createStandardTable(container, { rows: 2, cols: 2 }, () => {}, {
      debugLabel: 'with-row-selection',
      rowSelection,
      selectionColumnDef
    });
    expect(capturedGridOptions.rowSelection).toBe(rowSelection);
    expect(capturedGridOptions.selectionColumnDef).toBe(selectionColumnDef);
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

    hot.setDataAtCell(0, 1, 'X_NEW', 'edit');

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

  test('focused-cell changes keep keyboard navigation in sync with the adapter selection', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotKeyboardFocus';
    document.body.appendChild(container);

    const afterSelectionEnd = jest.fn();
    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 4 },
      () => {},
      {
        debugLabel: 'test-ag-grid-keyboard-focus',
        data: Shared.createEmptyData(4, 4),
        hotOptions: { afterSelectionEnd }
      }
    );

    hot.selectCell(1, 1);
    afterSelectionEnd.mockClear();

    capturedGridOptions.onCellFocused({
      api: capturedApi,
      rowIndex: 2,
      column: { getColId: () => 'c2' }
    });

    expect(hot.getSelectedLast()).toEqual([2, 2, 2, 2]);
    expect(afterSelectionEnd).toHaveBeenCalledTimes(1);
    expect(afterSelectionEnd).toHaveBeenCalledWith(2, 2, 2, 2);

    capturedGridOptions.onCellFocused({
      api: capturedApi,
      rowIndex: 2,
      column: { getColId: () => 'c2' }
    });

    expect(afterSelectionEnd).toHaveBeenCalledTimes(1);

    hot.selectCell(0, 0, 1, 1);
    afterSelectionEnd.mockClear();
    capturedGridOptions.onCellFocused({
      api: capturedApi,
      rowIndex: 3,
      column: { getColId: () => 'c3' }
    });

    expect(hot.getSelectedLast()).toEqual([0, 0, 1, 1]);
    expect(afterSelectionEnd).not.toHaveBeenCalled();
  });

  test('derived-view edits keep top-level payload.data Raw while updating the active DataView', () => {
    require('../js/main/session.js');
    const session = global.window.Main.session;
    const tab = session.createTab({
      title: 'Shared Matrix',
      type: 'box',
      payload: {
        type: 'box',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ],
        config: {}
      }
    });
    session.workspaceState.tabs.push(tab);
    session.workspaceState.activeTabId = tab.id;

    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      {
        debugLabel: 'payload-sync-table',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ]
      }
    );
    let activeViewData = [['A', 'B'], ['C', 'D']];
    hot.__dataViewsManager = {
      updateActiveData: jest.fn(next => {
        activeViewData = next.map(row => Array.isArray(row) ? row.slice() : []);
      }),
      serialize: jest.fn(() => ({
        activeViewId: 'filtered',
        views: [
          { id: 'raw', kind: 'raw', data: [['A', 'B'], ['C', 'D']] },
          { id: 'filtered', kind: 'derived', sourceViewId: 'raw', data: activeViewData }
        ]
      }))
    };

    hot.setDataAtCell(1, 1, 'D2', 'edit');

    expect(hot.__dataViewsManager.updateActiveData).toHaveBeenCalledWith(
      expect.any(Array),
      { userMutation: true }
    );
    expect(tab.payload.data[1][1]).toBe('D');
    expect(tab.payload.dataViews.views[0].data[1][1]).toBe('D');
    expect(tab.payload.dataViews.views[1].data[1][1]).toBe('D2');
    expect(tab.payload.dataViews?.activeViewId).toBe('filtered');
    expect(tab.payload.activeDataViewId).toBe('filtered');
    expect(tab.userModified).toBe(true);
    expect(tab.payloadDirty).toBe(false);
    expect(session.workspaceState.sessionUserDirty).toBe(true);
  });

  test('a user cell edit lifts the owner tab restore suppression so the graph redraws after reopen', () => {
    require('../js/main/session.js');
    const session = global.window.Main.session;
    const tab = session.createTab({
      title: 'Reopened Matrix',
      type: 'box',
      payload: {
        type: 'box',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ],
        config: {}
      }
    });
    session.workspaceState.tabs.push(tab);
    session.workspaceState.activeTabId = tab.id;

    const Shared = global.window.Shared;
    const clearSpy = jest.fn();
    const releaseSpy = jest.fn();
    const prevLifecycle = Shared.componentLifecycle;
    const prevLayout = Shared.componentLayout;
    Shared.componentLifecycle = Object.assign({}, prevLifecycle, { clearPostRestoreDrawSuppression: clearSpy });
    Shared.componentLayout = Object.assign({}, prevLayout, { releaseSuppressedSchedulesFor: releaseSpy });

    const container = document.createElement('div');
    document.body.appendChild(container);
    try {
      const hot = Shared.hot.createStandardTable(
        container,
        { rows: 2, cols: 2 },
        () => {},
        {
          debugLabel: 'box',
          data: [
            ['A', 'B'],
            ['C', 'D']
          ]
        }
      );
      // Ignore any schedules emitted by table construction; we only care about the edit.
      clearSpy.mockClear();
      releaseSpy.mockClear();

      hot.setDataAtCell(1, 1, 'D2', 'edit');

      expect(tab.payload.data[1][1]).toBe('D2');
      // The owner-tab sync resolves the tab reliably (no DOM walking) and lifts the
      // post-restore guard for it, so the component's afterChange redraw is not dropped.
      expect(clearSpy).toHaveBeenCalledWith('box', expect.objectContaining({ tabId: tab.id }));
      expect(releaseSpy).toHaveBeenCalledWith('box', expect.objectContaining({ tabId: tab.id }));
    } finally {
      Shared.componentLifecycle = prevLifecycle;
      Shared.componentLayout = prevLayout;
    }
  });

  test('title edits in data-empty columns persist without redraw or render-cache invalidation', () => {
    require('../js/main/session.js');
    const session = global.window.Main.session;
    const tab = session.createTab({
      title: 'PCA Matrix',
      type: 'pca',
      payload: {
        type: 'pca',
        data: [
          ['Sample', 'Value', ''],
          ['A', 1, ''],
          ['B', 2, '']
        ],
        config: {}
      }
    });
    session.workspaceState.tabs.push(tab);
    session.workspaceState.activeTabId = tab.id;
    const renderCache = { payloadSignature: tab.payloadSignature, fragment: { kind: 'unit' } };
    tab.renderCache = renderCache;
    tab.renderCacheSignature = tab.payloadSignature;

    const Shared = global.window.Shared;
    const clearSpy = jest.fn();
    const releaseSpy = jest.fn();
    const previousLifecycle = Shared.componentLifecycle;
    const previousLayout = Shared.componentLayout;
    Shared.componentLifecycle = Object.assign({}, previousLifecycle, { clearPostRestoreDrawSuppression: clearSpy });
    Shared.componentLayout = Object.assign({}, previousLayout, { releaseSuppressedSchedulesFor: releaseSpy });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const scheduleDraw = jest.fn();
    try {
      const hot = Shared.hot.createStandardTable(
        container,
        { rows: 3, cols: 3 },
        scheduleDraw,
        {
          debugLabel: 'pca',
          pinFirstRow: true,
          data: [
            ['Sample', 'Value', ''],
            ['A', 1, ''],
            ['B', 2, '']
          ]
        }
      );
      scheduleDraw.mockClear();
      clearSpy.mockClear();
      releaseSpy.mockClear();

      hot.setDataAtCell(0, 2, 'Unused title', 'edit');

      expect(tab.payload.data[0][2]).toBe('Unused title');
      expect(scheduleDraw).not.toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
      expect(releaseSpy).not.toHaveBeenCalled();
      expect(tab.renderCache).toBe(renderCache);
      expect(tab.renderCacheSignature).toBe(tab.payloadSignature);
    } finally {
      Shared.componentLifecycle = previousLifecycle;
      Shared.componentLayout = previousLayout;
    }
  });

  test('component table payload hook preserves non-matrix payload data shapes', () => {
    require('../js/main/session.js');
    const session = global.window.Main.session;
    const applyTablePayloadChanges = jest.fn((payload, changes) => {
      payload.data = {
        kind: 'custom-object',
        firstChange: changes[0]
      };
      return payload;
    });
    global.window.Main.components = {
      registry: {
        customTable: {
          createEmptyPayload: () => ({ type: 'customTable', data: { kind: 'from-registry' } })
        }
      }
    };
    global.window.Components = {
      customTable: {
        createEmptyPayload: () => ({ type: 'customTable', data: { kind: 'empty' } }),
        applyTablePayloadChanges
      }
    };
    const tab = session.createTab({
      title: 'Custom Table',
      type: 'customTable',
      payload: {
        type: 'customTable',
        data: { kind: 'initial' }
      }
    });
    session.workspaceState.tabs.push(tab);
    session.workspaceState.activeTabId = tab.id;

    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      {
        debugLabel: 'payload-sync-custom-table',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ]
      }
    );

    hot.setDataAtCell(1, 1, 'D2', 'edit');

    expect(applyTablePayloadChanges).toHaveBeenCalled();
    expect(Array.isArray(tab.payload.data)).toBe(false);
    expect(tab.payload.data).toEqual({
      kind: 'custom-object',
      firstChange: { row: 1, col: 1, value: 'D2' }
    });
    expect(tab.payloadDirty).toBe(false);
    expect(session.workspaceState.sessionUserDirty).toBe(true);
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

  test('analysis ignores titled columns that contain no data below the pinned row', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'test-ag-grid-empty-analysis-column',
        pinFirstRow: true,
        data: [
          ['Sample', 'Value', 'Empty titled column'],
          ['A', 1, ''],
          ['B', 2, null],
          ['C', 3, '   ']
        ]
      }
    );

    const analysis = hot.getAnalysisData();
    expect(analysis.pinnedRowCount).toBe(1);
    expect(analysis.ignoredEmptyColumns).toContain(2);
    expect(analysis.isColumnExcluded(2)).toBe(true);
    expect(analysis.getColumnValues(2, { skipHeader: true })).toEqual([]);
    expect(analysis.data.map(row => row[2])).toEqual([null, null, null, null]);
    expect(hot.getIncludedDataMatrix().map(row => row[2])).toEqual([null, null, null, null]);
    expect(analysis.isColumnExcluded(1)).toBe(false);
    expect(analysis.getColumnValues(1, { skipHeader: true })).toEqual([1, 2, 3]);
  });

  test('analysis treats formula columns with empty displayed results as inactive', () => {
    const sourceData = [
      ['Sample', 'Formula-only empty column'],
      ['A', '=EMPTY_RESULT'],
      ['B', '=EMPTY_RESULT']
    ];
    const instance = {
      countRows: () => sourceData.length,
      countCols: () => sourceData[0].length,
      getSettings: () => ({ fixedRowsTop: 1 }),
      getSourceData: () => sourceData,
      toPhysicalRow: row => row,
      toPhysicalColumn: col => col,
      getDataAtCell: (row, col) => sourceData[row]?.[col],
      __hotGetDisplayDataAtCell: (row, col) => col === 1 && row > 0 ? '' : sourceData[row]?.[col]
    };

    const analysis = window.Shared.hot.getAnalysisData(instance);

    expect(analysis.ignoredEmptyColumns).toContain(1);
    expect(analysis.inactiveAnalysisColumns).toContain(1);
    expect(analysis.isColumnExcluded(1)).toBe(true);
    expect(analysis.data.map(row => row[1])).toEqual([null, null, null]);
  });

  test('manual trailing blank columns persist without redraw while schema-shifting inserts redraw once', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const scheduleDraw = jest.fn();
    const afterCreateCol = jest.fn();

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      scheduleDraw,
      {
        debugLabel: 'test-ag-grid-manual-blank-column-insert',
        pinFirstRow: true,
        data: [
          ['A', 'B', 'C'],
          [1, 2, 3],
          [4, 5, 6]
        ],
        hotOptions: { afterCreateCol }
      }
    );
    scheduleDraw.mockClear();
    afterCreateCol.mockClear();

    const previousColumnCount = hot.countCols();
    hot.alter('insert_col_end', previousColumnCount - 1, 1, 'insert_col_end');

    expect(hot.countCols()).toBe(previousColumnCount + 1);
    expect(afterCreateCol).toHaveBeenCalledWith(previousColumnCount, 1, 'insert_col_end');
    expect(scheduleDraw).not.toHaveBeenCalled();

    afterCreateCol.mockClear();
    hot.alter('insert_col_left', 1, 1, 'insert_col_left');

    expect(afterCreateCol).toHaveBeenCalledWith(1, 1, 'insert_col_left');
    expect(scheduleDraw).toHaveBeenCalledTimes(1);
    expect(scheduleDraw).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'afterCreateCol',
      source: 'insert_col_left',
      invalidate: 'data',
      userInitiated: true
    }));
  });

  test('automatic empty-column growth is structural only and does not notify graph owners', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const scheduleDraw = jest.fn();
    const afterCreateCol = jest.fn();

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      scheduleDraw,
      {
        debugLabel: 'test-ag-grid-silent-auto-growth',
        pinFirstRow: true,
        data: [
          ['A', 'B', 'C'],
          [1, 2, 3],
          [4, 5, 6]
        ],
        hotOptions: { afterCreateCol }
      }
    );
    scheduleDraw.mockClear();
    afterCreateCol.mockClear();

    const previousColumnCount = hot.countCols();
    hot.alter('insert_col_end', previousColumnCount - 1, 1, 'autoGrow');

    expect(hot.countCols()).toBe(previousColumnCount + 1);
    expect(afterCreateCol).not.toHaveBeenCalled();
    expect(scheduleDraw).not.toHaveBeenCalled();

    hot.setDataAtCell(0, previousColumnCount, 'New title', 'edit');
    expect(hot.getDataAtCell(0, previousColumnCount)).toBe('New title');
    expect(scheduleDraw).not.toHaveBeenCalled();

    hot.setDataAtCell(1, previousColumnCount, 7, 'edit');
    expect(scheduleDraw).toHaveBeenCalledTimes(1);
    expect(scheduleDraw).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'afterChange',
      userInitiated: true
    }));
  });

  test('user cell edits schedule a userInitiated draw while programmatic loads stay non-user', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotUserInitiated';
    document.body.appendChild(container);

    const scheduleCalls = [];
    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      meta => scheduleCalls.push(meta),
      {
        debugLabel: 'test-ag-grid-user-initiated',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ]
      }
    );
    expect(hot).toBeTruthy();

    // A programmatic load (the shape used during file reopen / payload apply) must
    // NOT be flagged userInitiated, so the post-render-cache-restore guard can keep
    // restore invisible.
    hot.loadData([
      ['Label', 'X Value'],
      ['Cat', 4.5]
    ], { source: 'loadData' });
    const loadCall = scheduleCalls.find(call => call && call.reason === 'afterLoadData');
    expect(loadCall).toBeTruthy();
    expect(loadCall.userInitiated).not.toBe(true);

    // A genuine user cell edit (AG grid 'edit' source) must be flagged userInitiated
    // so it redraws even while the post-restore guard is still active after reopen.
    scheduleCalls.length = 0;
    hot.setDataAtCell(0, 1, 'X_NEW', 'edit');
    const editCall = scheduleCalls.find(call => call && call.reason === 'afterChange');
    expect(editCall).toBeTruthy();
    expect(editCall.userInitiated).toBe(true);
  });

  test('a user table edit lifts the post-restore draw suppression for the owning tab', () => {
    const Shared = global.window.Shared;
    const clearSpy = jest.fn();
    const releaseSpy = jest.fn();
    const prevLifecycle = Shared.componentLifecycle;
    const prevLayout = Shared.componentLayout;
    Shared.componentLifecycle = Object.assign({}, prevLifecycle, { clearPostRestoreDrawSuppression: clearSpy });
    Shared.componentLayout = Object.assign({}, prevLayout, { releaseSuppressedSchedulesFor: releaseSpy });

    const container = document.createElement('div');
    container.id = 'testAgHotClear';
    // resolveUndoTabId walks the DOM for the owning workspace tab.
    container.dataset.workspaceTabId = 'reopened-tab-1';
    document.body.appendChild(container);
    try {
      // debugLabel 'line' + a no-op scheduleDraw mirrors a component whose schedule
      // proxy drops the payload, so the userInitiated flag alone cannot help — the
      // suppression release is what makes the data edit redraw after reopen.
      const hot = Shared.hot.createStandardTable(container, { rows: 2, cols: 2 }, () => {}, {
        debugLabel: 'line',
        data: [
          ['A', 'B'],
          ['C', 'D']
        ]
      });
      expect(hot).toBeTruthy();

      // A programmatic load (reopen / payload apply) must NOT lift the guard.
      hot.loadData([
        ['Label', 'X Value'],
        ['Cat', 4.5]
      ], { source: 'loadData' });
      expect(clearSpy).not.toHaveBeenCalled();
      expect(releaseSpy).not.toHaveBeenCalled();

      // A genuine user cell edit lifts the guard for the owning tab.
      hot.setDataAtCell(0, 1, 'X_NEW', 'edit');
      expect(clearSpy).toHaveBeenCalledWith('line', expect.objectContaining({ tabId: 'reopened-tab-1' }));
      expect(releaseSpy).toHaveBeenCalledWith('line', expect.objectContaining({ tabId: 'reopened-tab-1' }));
    } finally {
      Shared.componentLifecycle = prevLifecycle;
      Shared.componentLayout = prevLayout;
    }
  });

  test('formula evaluation stays lazy for plain data and activates for formulas', () => {
    const Shared = global.window.Shared;
    const createModelSpy = jest.spyOn(Shared.formulaEngine, 'createModel');
    const container = document.createElement('div');
    container.id = 'formulaLazyAgHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 3 },
      () => {},
      {
        debugLabel: 'formula-lazy-ag-grid',
        data: [
          ['A', 'B', 'C'],
          ['1', '2', '3']
        ]
      }
    );

    const getCellViaColumnDef = (rowIndex, colIndex) => {
      const def = capturedGridOptions.columnDefs.find(col => col.colId === `c${colIndex}`);
      expect(def).toBeTruthy();
      return def.valueGetter({ data: { __rowIndex: rowIndex }, node: { rowIndex } });
    };

    expect(getCellViaColumnDef(1, 2)).toBe('3');
    expect(createModelSpy).not.toHaveBeenCalled();

    hot.updateSettings({
      data: [
        ['A', 'B', 'C'],
        ['4', '5', '6']
      ],
      minRows: 2,
      minCols: 3,
      trimData: true
    });

    expect(getCellViaColumnDef(1, 2)).toBe('6');
    expect(createModelSpy).not.toHaveBeenCalled();

    hot.updateSettings({
      data: [
        ['A', 'B', 'C'],
        ['1', '2', '=A1+B1']
      ],
      minRows: 2,
      minCols: 3,
      trimData: true
    });

    expect(getCellViaColumnDef(1, 2)).toBe(3);
    expect(createModelSpy).toHaveBeenCalledTimes(1);

    hot.loadData([
      ['A', 'B', 'C'],
      ['7', '8', '3']
    ]);

    expect(getCellViaColumnDef(1, 2)).toBe('3');
    expect(createModelSpy).toHaveBeenCalledTimes(1);

    hot.setDataAtCell(1, 2, '=A1+B1', 'edit');
    expect(getCellViaColumnDef(1, 2)).toBe(15);
    expect(createModelSpy).toHaveBeenCalledTimes(1);
  });

  test('re-editing a committed plain number preserves the editor value', () => {
    const Shared = global.window.Shared;
    const createModelSpy = jest.spyOn(Shared.formulaEngine, 'createModel');
    const container = document.createElement('div');
    container.id = 'plainNumberReEditAgHot';
    document.body.appendChild(container);

    Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      {
        debugLabel: 'plain-number-re-edit',
        data: [
          ['A', 'B'],
          ['', '']
        ]
      }
    );

    const columnDef = capturedGridOptions.columnDefs.find(col => col.colId === 'c0');
    const editorParams = value => ({
      value,
      data: { __rowIndex: 1 },
      node: { rowIndex: 1, data: { __rowIndex: 1 } },
      column: { getColId: () => 'c0' },
      colDef: columnDef
    });

    const firstEditor = new columnDef.cellEditor();
    firstEditor.init(editorParams(''));
    firstEditor.getGui().value = '1';
    expect(columnDef.valueSetter({
      ...editorParams(''),
      newValue: firstEditor.getValue()
    })).toBe(true);
    firstEditor.destroy();

    expect(columnDef.valueGetter(editorParams(''))).toBe('1');

    const secondEditor = new columnDef.cellEditor();
    secondEditor.init(editorParams('1'));
    expect(secondEditor.getGui().value).toBe('1');
    expect(secondEditor.getValue()).toBe('1');
    secondEditor.destroy();
    expect(createModelSpy).not.toHaveBeenCalled();
  });

  test('long inline edits cover only neighboring cells reached by rendered text and preserve exact cell boundaries', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'longInlineEditAgHot';
    document.body.appendChild(container);
    const editValue = 'near second-cell boundary';
    const secondNeighborValue = 'touch-second-neighbor';

    Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 3 },
      () => {},
      {
        debugLabel: 'long-inline-edit',
        data: [
          ['A', 'B', 'C'],
          [editValue, 'neighbor', 'neighbor']
        ]
      }
    );

    const columnDef = capturedGridOptions.columnDefs.find(col => col.colId === 'c0');
    const editor = new columnDef.cellEditor();
    editor.init({
      value: editValue,
      data: { __rowIndex: 1 },
      node: { rowIndex: 1, data: { __rowIndex: 1 } },
      column: { getColId: () => 'c0' },
      colDef: columnDef
    });

    const viewport = document.createElement('div');
    viewport.className = 'ag-center-cols-viewport';
    const row = document.createElement('div');
    row.className = 'ag-row';
    row.setAttribute('row-index', '1');
    const cell = document.createElement('div');
    cell.className = 'ag-cell ag-cell-inline-editing hot-cell-text';
    cell.setAttribute('col-id', 'c0');
    const nextCell = document.createElement('div');
    nextCell.className = 'ag-cell hot-cell-text';
    nextCell.setAttribute('col-id', 'c1');
    const secondNextCell = document.createElement('div');
    secondNextCell.className = 'ag-cell hot-cell-text';
    secondNextCell.setAttribute('col-id', 'c2');
    row.appendChild(cell);
    row.appendChild(nextCell);
    row.appendChild(secondNextCell);
    viewport.appendChild(row);
    container.appendChild(viewport);
    cell.appendChild(editor.getGui());

    cell.getBoundingClientRect = () => ({
      left: 100.25,
      right: 190.25,
      top: 20,
      bottom: 40,
      width: 90,
      height: 20
    });
    nextCell.style.borderRight = '1px solid #d6d6d6';
    secondNextCell.style.borderRight = '1px solid #d6d6d6';
    nextCell.getBoundingClientRect = () => ({
      left: 190.25,
      right: 280.4,
      top: 20,
      bottom: 40,
      width: 90.15,
      height: 20
    });
    secondNextCell.getBoundingClientRect = () => ({
      left: 280.4,
      right: 370.55,
      top: 20,
      bottom: 40,
      width: 90.15,
      height: 20
    });
    viewport.getBoundingClientRect = () => ({
      left: 40,
      right: 460,
      top: 0,
      bottom: 200,
      width: 420,
      height: 200
    });

    const originalGetContext = global.window.HTMLCanvasElement.prototype.getContext;
    global.window.HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      font: '',
      measureText: value => {
        const text = String(value ?? '');
        if(text === editValue){
          // The rendered text stops 1.15 px before c2. An editor gutter or
          // integer rounding must not make c2 count as touched.
          return { width: 179 };
        }
        if(text === secondNeighborValue){
          // This text crosses 0.85 px into c2, so c2 must now be fully covered.
          return { width: 181 };
        }
        return { width: text.length * 6 };
      }
    }));

    try {
      editor.afterGuiAttached();
      expect(cell.classList.contains('hot-cell-edit-overflow')).toBe(true);
      const oneNeighborWidth = Number.parseFloat(
        editor.getGui().style.getPropertyValue('--hot-cell-edit-overflow-width')
      );
      expect(oneNeighborWidth).toBeCloseTo(179.15, 5);

      editor.getGui().value = secondNeighborValue;
      editor.syncEditOverflowWidth('test-second-neighbor');
      const twoNeighborWidth = Number.parseFloat(
        editor.getGui().style.getPropertyValue('--hot-cell-edit-overflow-width')
      );
      expect(twoNeighborWidth).toBeCloseTo(269.3, 5);

      editor.getGui().value = 'short';
      editor.syncEditOverflowWidth('test-shrink');
      expect(cell.classList.contains('hot-cell-edit-overflow')).toBe(false);
      expect(editor.getGui().style.getPropertyValue('--hot-cell-edit-overflow-width')).toBe('');
    } finally {
      editor.destroy();
      global.window.HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  test('pinned first row leaves horizontal sync to AG Grid scroll authority', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'testAgHotPinnedScroll';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 4 },
      () => {},
      {
        debugLabel: 'test-ag-grid-pinned-scroll',
        pinFirstRow: true,
        data: [
          ['H1', 'H2', 'H3', 'H4'],
          ['A', 'B', 'C', 'D'],
          ['E', 'F', 'G', 'H']
        ]
      }
    );
    expect(hot).toBeTruthy();

    const headerViewport = document.createElement('div');
    headerViewport.className = 'ag-header-viewport';
    headerViewport.scrollLeft = 12;
    const headerContainer = document.createElement('div');
    headerContainer.className = 'ag-header-container';
    headerViewport.appendChild(headerContainer);
    container.appendChild(headerViewport);

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    centerViewport.scrollLeft = 96;
    const centerContainer = document.createElement('div');
    centerContainer.className = 'ag-center-cols-container';
    centerViewport.appendChild(centerContainer);
    bodyViewport.appendChild(centerViewport);
    container.appendChild(bodyViewport);

    const floatingTop = document.createElement('div');
    floatingTop.className = 'ag-floating-top';
    const pinnedViewport = document.createElement('div');
    pinnedViewport.className = 'ag-center-cols-viewport';
    pinnedViewport.scrollLeft = 24;
    const pinnedContainer = document.createElement('div');
    pinnedContainer.className = 'ag-center-cols-container';
    pinnedViewport.appendChild(pinnedContainer);
    floatingTop.appendChild(pinnedViewport);
    container.appendChild(floatingTop);

    capturedGridOptions.onFirstDataRendered();
    centerViewport.dispatchEvent(new global.window.Event('scroll', { bubbles: true }));
    await Promise.resolve();

    expect(pinnedContainer.style.transform).toBe('');
    expect(headerContainer.style.transform).toBe('');
  });

  test('horizontal scroll auto-growth uses the real horizontal viewport', () => {
    jest.useFakeTimers();
    try {
      const Shared = global.window.Shared;
      const container = document.createElement('div');
      container.id = 'testAgHotHorizontalAutoGrow';
      document.body.appendChild(container);

      const hot = Shared.hot.createStandardTable(
        container,
        { rows: 3, cols: 4 },
        () => {},
        {
          debugLabel: 'test-ag-grid-horizontal-autogrow',
          autoGrowth: {
            colCap: 20,
            colThresholdPx: 200,
            scrollIdleDelayMs: 80
          },
          data: [
            ['H1', 'H2', 'H3', 'H4'],
            ['A', 'B', 'C', 'D'],
            ['E', 'F', 'G', 'H']
          ]
        }
      );

      const setMetric = (el, key, value) => {
        Object.defineProperty(el, key, {
          configurable: true,
          value
        });
      };

      const bodyViewport = document.createElement('div');
      bodyViewport.className = 'ag-body-viewport';
      setMetric(bodyViewport, 'scrollWidth', 400);
      setMetric(bodyViewport, 'clientWidth', 400);
      bodyViewport.scrollLeft = 0;
      container.appendChild(bodyViewport);

      const centerViewport = document.createElement('div');
      centerViewport.className = 'ag-center-cols-viewport';
      setMetric(centerViewport, 'scrollWidth', 1600);
      setMetric(centerViewport, 'clientWidth', 400);
      centerViewport.scrollLeft = 300;
      bodyViewport.appendChild(centerViewport);

      const horizontalViewport = document.createElement('div');
      horizontalViewport.className = 'ag-body-horizontal-scroll-viewport';
      setMetric(horizontalViewport, 'scrollWidth', 1600);
      setMetric(horizontalViewport, 'clientWidth', 400);
      horizontalViewport.scrollLeft = 300;
      container.appendChild(horizontalViewport);

      capturedGridOptions.onFirstDataRendered();
      const initialColCount = hot.countCols();
      expect(initialColCount).toBeGreaterThanOrEqual(4);

      horizontalViewport.dispatchEvent(new global.window.Event('scroll', { bubbles: true }));
      jest.advanceTimersByTime(120);

      expect(hot.countCols()).toBe(initialColCount);
    } finally {
      jest.useRealTimers();
    }
  });
});
