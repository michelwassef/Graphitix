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

  test('table edits update the active tab payload directly without leaving payload dirty', () => {
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
    hot.__dataViewsManager = {
      serialize: jest.fn(() => ({
        activeViewId: 'filtered',
        views: [
          { id: 'base', data: [['A', 'B'], ['C', 'D']] },
          { id: 'filtered', data: [['A', 'B'], ['C', 'D2']] }
        ]
      }))
    };

    hot.setDataAtCell(1, 1, 'D2', 'edit');

    expect(tab.payload.data[1][1]).toBe('D2');
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

    hot.loadData([
      ['A', 'B', 'C'],
      ['1', '2', '=A1+B1']
    ]);

    expect(getCellViaColumnDef(1, 2)).toBe(3);
    expect(createModelSpy).toHaveBeenCalledTimes(1);

    hot.loadData([
      ['A', 'B', 'C'],
      ['1', '2', '3']
    ]);

    expect(getCellViaColumnDef(1, 2)).toBe('3');
    expect(createModelSpy).toHaveBeenCalledTimes(1);
  });

  test('pinned first row follows horizontal scroll with transform sync', () => {
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

    expect(pinnedViewport.scrollLeft).toBe(0);
    expect(pinnedContainer.style.transform).toBe('translate3d(-96px, 0px, 0px)');
    expect(pinnedContainer.style.willChange).toBe('transform');
    expect(headerViewport.scrollLeft).toBe(0);
    expect(headerContainer.style.transform).toBe('translate3d(-96px, 0px, 0px)');
    expect(headerContainer.style.willChange).toBe('transform');
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
