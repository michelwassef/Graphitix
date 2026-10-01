'use strict';
const { setupHotAggridBindingFixture } = require('../../test-support/hotAggridBindingSuite');

describe('Shared.hot AG Grid binding', () => {
  const fixture = setupHotAggridBindingFixture();

  test('row checkbox selection is opt-in', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);

    Shared.hot.createStandardTable(container, { rows: 2, cols: 2 }, () => {}, {
      debugLabel: 'no-row-selection'
    });
    expect(fixture.capturedGridOptions.rowSelection).toBeUndefined();

    const rowSelection = { mode: 'multiRow', headerCheckbox: false };
    const selectionColumnDef = { headerName: 'Show' };
    Shared.hot.createStandardTable(container, { rows: 2, cols: 2 }, () => {}, {
      debugLabel: 'with-row-selection',
      rowSelection,
      selectionColumnDef
    });
    expect(fixture.capturedGridOptions.rowSelection).toBe(rowSelection);
    expect(fixture.capturedGridOptions.selectionColumnDef).toBe(selectionColumnDef);
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
    expect(fixture.capturedGridOptions).toBeTruthy();
    expect(fixture.capturedApi).toBeTruthy();
    expect(hot.gridApi).toBe(fixture.capturedApi);

    const getCellViaColumnDef = (rowIndex, colIndex) => {
      const def = fixture.capturedGridOptions.columnDefs.find(col => col.colId === `c${colIndex}`);
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

  test('destroy retires the grid API before stale table callbacks can refresh it', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      { debugLabel: 'destroyed-grid-lifecycle' }
    );
    const api = fixture.capturedApi;
    const staleFilterCallback = fixture.capturedGridOptions.onFilterChanged;

    hot.destroy();
    api.refreshHeader.mockClear();
    api.refreshCells.mockClear();

    hot.render();
    staleFilterCallback?.({ api });

    expect(hot.gridApi).toBeNull();
    expect(hot.columnApi).toBeNull();
    expect(api.refreshHeader).not.toHaveBeenCalled();
    expect(api.refreshCells).not.toHaveBeenCalled();
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

    fixture.capturedGridOptions.onCellFocused({
      api: fixture.capturedApi,
      rowIndex: 2,
      column: { getColId: () => 'c2' }
    });

    expect(hot.getSelectedLast()).toEqual([2, 2, 2, 2]);
    expect(afterSelectionEnd).toHaveBeenCalledTimes(1);
    expect(afterSelectionEnd).toHaveBeenCalledWith(2, 2, 2, 2);

    fixture.capturedGridOptions.onCellFocused({
      api: fixture.capturedApi,
      rowIndex: 2,
      column: { getColId: () => 'c2' }
    });

    expect(afterSelectionEnd).toHaveBeenCalledTimes(1);

    hot.selectCell(0, 0, 1, 1);
    afterSelectionEnd.mockClear();
    fixture.capturedGridOptions.onCellFocused({
      api: fixture.capturedApi,
      rowIndex: 3,
      column: { getColId: () => 'c3' }
    });

    expect(hot.getSelectedLast()).toEqual([0, 0, 1, 1]);
    expect(afterSelectionEnd).not.toHaveBeenCalled();
  });

  test('derived-view edits keep top-level payload.data Raw while updating the active DataView', () => {
    require('../../js/main/session.js');
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
    require('../../js/main/session.js');
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
});
