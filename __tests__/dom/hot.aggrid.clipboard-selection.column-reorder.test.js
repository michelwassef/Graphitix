'use strict';
const { setupHotAggridClipboardFixture } = require('../../test-support/hotAggridClipboardSuite');

describe('Shared.hot AG Grid clipboard + selection behaviors', () => {
  const fixture = setupHotAggridClipboardFixture();

  test('drag handle drag moves a selected column group together', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleGroupMoveHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
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

  test('column groups expose one reorder handle on each group anchor', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleGroupedVisibilityHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 5 },
      () => {},
      {
        debugLabel: 'ag-header-drag-handle-grouped-visibility',
        data: Shared.createEmptyData(3, 5)
      }
    );

    hot.updateSettings({
      columnGroups: [
        { startCol: 1, span: 2 },
        { startCol: 3, span: 2 }
      ]
    });

    const instantiateHeader = colId => {
      const colDef = fixture.capturedGridOptions?.columnDefs?.find(col => col.colId === colId);
      expect(colDef?.headerComponent).toBeTruthy();
      const headerComponent = new colDef.headerComponent();
      headerComponent.init({
        api: {
          addEventListener: jest.fn(),
          removeEventListener: jest.fn()
        },
        column: {
          getColId: () => colId,
          getSort: () => '',
          getColDef: () => ({ headerName: colId })
        },
        displayName: colId
      });
      return headerComponent.getGui();
    };

    const firstAnchorGui = instantiateHeader('c1');
    const firstFollowerGui = instantiateHeader('c2');
    const secondAnchorGui = instantiateHeader('c3');
    const secondFollowerGui = instantiateHeader('c4');
    const outsideGui = instantiateHeader('c0');
    const firstAnchorHandle = firstAnchorGui.querySelector('.hot-col-drag-handle');
    const firstFollowerHandle = firstFollowerGui.querySelector('.hot-col-drag-handle');
    const secondAnchorHandle = secondAnchorGui.querySelector('.hot-col-drag-handle');
    const secondFollowerHandle = secondFollowerGui.querySelector('.hot-col-drag-handle');
    const outsideHandle = outsideGui.querySelector('.hot-col-drag-handle');

    for(const [gui, handle] of [
      [firstAnchorGui, firstAnchorHandle],
      [secondAnchorGui, secondAnchorHandle]
    ]){
      expect(handle).toBeTruthy();
      expect(handle.classList.contains('hot-col-drag-handle--hidden')).toBe(false);
      expect(handle.classList.contains('hot-col-drag-handle--group-anchor')).toBe(true);
      expect(handle.getAttribute('aria-hidden')).toBeNull();
      expect(handle.getAttribute('aria-label')).toBe('Drag to reorder column group');
      expect(gui.classList.contains('hot-ag-header--group-anchor')).toBe(true);
    }

    for(const handle of [firstFollowerHandle, secondFollowerHandle]){
      expect(handle).toBeTruthy();
      expect(handle.classList.contains('hot-col-drag-handle--hidden')).toBe(true);
      expect(handle.getAttribute('aria-hidden')).toBe('true');
    }

    expect(outsideHandle).toBeTruthy();
    expect(outsideHandle.classList.contains('hot-col-drag-handle--hidden')).toBe(false);
    expect(outsideHandle.getAttribute('aria-hidden')).toBeNull();
    expect(outsideHandle.getAttribute('aria-label')).toBe('Drag to reorder columns');
  });

  test('drag handle drag moves a configured column group without preselecting it', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleConfiguredGroupMoveHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 5 },
      () => {},
      {
        debugLabel: 'ag-header-drag-handle-configured-group-move',
        data: Shared.createEmptyData(3, 5)
      }
    );

    hot.updateSettings({
      columnGroups: [{ startCol: 1, span: 3 }]
    });

    const moveColumnsSpy = jest.fn();
    hot.columnApi = {
      getAllDisplayedColumns: () => [
        { getColId: () => 'c0' },
        { getColId: () => 'c1' },
        { getColId: () => 'c2' },
        { getColId: () => 'c3' },
        { getColId: () => 'c4' }
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

    const header4 = document.createElement('div');
    header4.className = 'ag-header-cell';
    header4.setAttribute('col-id', 'c4');
    header4.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 });
    container.appendChild(header4);

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => header4;

    handle.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    header4.dispatchEvent(new global.window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 80,
      clientY: 10
    }));

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    global.window.dispatchEvent(new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    document.elementFromPoint = originalElementFromPoint;

    expect(moveColumnsSpy).toHaveBeenCalled();
    expect(moveColumnsSpy.mock.calls[0][0]).toEqual(['c1', 'c2', 'c3']);
  });

  test('drag handle group moves snap before another column group instead of inside it', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleGroupBoundaryBeforeHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 7 },
      () => {},
      {
        debugLabel: 'ag-header-drag-handle-group-boundary-before',
        data: Shared.createEmptyData(3, 7)
      }
    );

    hot.updateSettings({
      columnGroups: [
        { startCol: 1, span: 2 },
        { startCol: 4, span: 3 }
      ]
    });

    const moveColumnsSpy = jest.fn();
    hot.columnApi = {
      getAllDisplayedColumns: () => [
        { getColId: () => 'c0' },
        { getColId: () => 'c1' },
        { getColId: () => 'c2' },
        { getColId: () => 'c3' },
        { getColId: () => 'c4' },
        { getColId: () => 'c5' },
        { getColId: () => 'c6' }
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

    const header5 = document.createElement('div');
    header5.className = 'ag-header-cell';
    header5.setAttribute('col-id', 'c5');
    header5.getBoundingClientRect = () => ({ left: 100, width: 100, top: 0, height: 20, right: 200, bottom: 20 });
    container.appendChild(header5);

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => header5;

    handle.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    header5.dispatchEvent(new global.window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 125,
      clientY: 10
    }));

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    global.window.dispatchEvent(new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    document.elementFromPoint = originalElementFromPoint;

    expect(moveColumnsSpy).toHaveBeenCalled();
    expect(moveColumnsSpy.mock.calls[0][0]).toEqual(['c1', 'c2']);
    expect(moveColumnsSpy.mock.calls[0][1]).toBe(2);
  });

  test('drag handle group moves snap after another column group instead of inside it', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleGroupBoundaryAfterHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 7 },
      () => {},
      {
        debugLabel: 'ag-header-drag-handle-group-boundary-after',
        data: Shared.createEmptyData(3, 7)
      }
    );

    hot.updateSettings({
      columnGroups: [
        { startCol: 1, span: 2 },
        { startCol: 4, span: 3 }
      ]
    });

    const moveColumnsSpy = jest.fn();
    hot.columnApi = {
      getAllDisplayedColumns: () => [
        { getColId: () => 'c0' },
        { getColId: () => 'c1' },
        { getColId: () => 'c2' },
        { getColId: () => 'c3' },
        { getColId: () => 'c4' },
        { getColId: () => 'c5' },
        { getColId: () => 'c6' }
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

    const header5 = document.createElement('div');
    header5.className = 'ag-header-cell';
    header5.setAttribute('col-id', 'c5');
    header5.getBoundingClientRect = () => ({ left: 100, width: 100, top: 0, height: 20, right: 200, bottom: 20 });
    container.appendChild(header5);

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => header5;

    handle.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    header5.dispatchEvent(new global.window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      buttons: 1,
      clientX: 175,
      clientY: 10
    }));

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    global.window.dispatchEvent(new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    document.elementFromPoint = originalElementFromPoint;

    expect(moveColumnsSpy).toHaveBeenCalled();
    expect(moveColumnsSpy.mock.calls[0][0]).toEqual(['c1', 'c2']);
    expect(moveColumnsSpy.mock.calls[0][1]).toBe(5);
  });

  test('drag handle commits new column order into underlying data', async () => {
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

    const hot = fixture.createTable(
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

  test('programmatic column order commits through the same data reorder path', () => {
    const container = document.createElement('div');
    container.id = 'agProgrammaticColumnOrderHot';
    document.body.appendChild(container);
    const moveEvents = [];
    const hot = fixture.createTable(
      container,
      { rows: 2, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-programmatic-column-order',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1']
        ],
        hotOptions: {
          afterColumnMove: (...args) => moveEvents.push(args)
        }
      }
    );
    let displayed = Array.from({ length: hot.countCols() }, (_, index) => `c${index}`);
    hot.columnApi = {
      getAllDisplayedColumns: () => displayed.map(colId => ({ getColId: () => colId })),
      applyColumnState: ({ state, applyOrder }) => {
        if(applyOrder){
          displayed = state.map(entry => entry.colId);
        }
        return true;
      }
    };
    const permutation = Array.from({ length: hot.countCols() }, (_, index) => index);
    permutation.splice(0, 3, 1, 2, 0);
    global.window.Shared.undoManager.clear();
    const lifecycle = [];
    expect(hot.applyColumnOrder(permutation, {
      reason: 'box-graph-dataset-reorder',
      onApplied: order => lifecycle.push(['apply', order.slice(0, 3)]),
      onUndo: order => lifecycle.push(['undo', order.slice(0, 3)]),
      onRedo: order => lifecycle.push(['redo', order.slice(0, 3)])
    })).toBe(true);
    expect(hot.getDataAtCell(0, 0)).toBe('B0');
    expect(hot.getDataAtCell(0, 1)).toBe('C0');
    expect(hot.getDataAtCell(0, 2)).toBe('A0');
    expect(lifecycle).toEqual([['apply', [1, 2, 0]]]);
    expect(moveEvents).toHaveLength(1);
    expect(moveEvents[0][4]).toBe(true);
    expect(moveEvents[0][5].slice(0, 3)).toEqual([1, 2, 0]);
    expect(moveEvents[0][6]).toBe('box-graph-dataset-reorder');
  });

  test('column reorder commit records undo/redo steps', async () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleUndoHot';
    document.body.appendChild(container);

    let displayed = Array.from({ length: 12 }, (_, idx) => `c${idx}`);

    const originalAgGrid = global.window.agGrid;
    global.window.agGrid = {
      createGrid: (_container, gridOptions) => {
        const api = {
          refreshCells: jest.fn(),
          setRowData: jest.fn(),
          setColumnDefs: jest.fn(() => {
            displayed = Array.from({ length: 12 }, (_, idx) => `c${idx}`);
          }),
          destroy: jest.fn(),
          getFocusedCell: jest.fn(() => null)
        };
        fixture.capturedApi = api;
        fixture.capturedGridOptions = gridOptions;
        gridOptions?.onGridReady?.({ api, columnApi: {} });
        return api;
      }
    };

    const hot = fixture.createTable(
      container,
      { rows: 2, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-header-drag-handle-undo',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1']
        ]
      }
    );

    hot.columnApi = {
      getAllDisplayedColumns: () => displayed.map(id => ({ getColId: () => id })),
      moveColumns: (ids, toIndex) => {
        const list = Array.isArray(ids) ? ids : [ids];
        const remaining = displayed.filter(id => !list.includes(id));
        const idx = Math.max(0, Math.min(Number(toIndex) || 0, remaining.length));
        displayed = remaining.slice(0, idx).concat(list).concat(remaining.slice(idx));
      }
    };

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

    expect(hot.getDataAtCell(0, 0)).toBe('B0');

    expect(typeof undoManager?.undo).toBe('function');
    expect(typeof undoManager?.redo).toBe('function');

    undoManager.undo();
    expect(hot.getDataAtCell(0, 0)).toBe('A0');

    undoManager.redo();
    expect(hot.getDataAtCell(0, 0)).toBe('B0');

    global.window.agGrid = originalAgGrid;
  });

  test('undo flushes pending deferred column reorder commits before popping the stack', async () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleUndoRaceHot';
    document.body.appendChild(container);

    let displayed = Array.from({ length: 12 }, (_, idx) => `c${idx}`);

    const originalAgGrid = global.window.agGrid;
    global.window.agGrid = {
      createGrid: (_container, gridOptions) => {
        const api = {
          refreshCells: jest.fn(),
          setRowData: jest.fn(),
          setColumnDefs: jest.fn(() => {
            displayed = Array.from({ length: 12 }, (_, idx) => `c${idx}`);
          }),
          destroy: jest.fn(),
          getFocusedCell: jest.fn(() => null)
        };
        fixture.capturedApi = api;
        fixture.capturedGridOptions = gridOptions;
        gridOptions?.onGridReady?.({ api, columnApi: {} });
        return api;
      }
    };

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-header-drag-handle-undo-race',
        data: [
          ['Control', 'Treatment A', 'Treatment B'],
          [12, 15, 14],
          [14.3, 17, 15.3],
          [11, 14.6, 13]
        ]
      }
    );

    hot.columnApi = {
      getAllDisplayedColumns: () => displayed.map(id => ({ getColId: () => id })),
      moveColumns: (ids, toIndex) => {
        const list = Array.isArray(ids) ? ids : [ids];
        const remaining = displayed.filter(id => !list.includes(id));
        const idx = Math.max(0, Math.min(Number(toIndex) || 0, remaining.length));
        displayed = remaining.slice(0, idx).concat(list).concat(remaining.slice(idx));
      }
    };

    const header0 = document.createElement('div');
    header0.className = 'ag-header-cell';
    header0.setAttribute('col-id', 'c0');
    const handle = document.createElement('span');
    handle.className = 'hot-col-drag-handle';
    header0.appendChild(handle);
    container.appendChild(header0);

    const header1 = document.createElement('div');
    header1.className = 'ag-header-cell';
    header1.setAttribute('col-id', 'c1');
    header1.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 });
    container.appendChild(header1);

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => header1;

    handle.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    header1.dispatchEvent(new global.window.MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1, clientX: 80, clientY: 10 }));

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    global.window.dispatchEvent(new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    document.elementFromPoint = originalElementFromPoint;

    expect(hot.getDataAtCell(0, 0)).toBe('Treatment A');
    expect(undoManager.undo()).toBe(true);
    expect(hot.getDataAtCell(0, 0)).toBe('Control');
    expect(hot.getDataAtCell(0, 1)).toBe('Treatment A');
    expect(hot.getDataAtCell(0, 2)).toBe('Treatment B');

    global.window.agGrid = originalAgGrid;
  });

  test('grid undo interleaves with non-grid shared undo entries in strict reverse order', () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agUndoInterleaveHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 2 },
      () => {},
      {
        debugLabel: 'ag-undo-interleave',
        data: [
          ['Header A', 'Header B'],
          ['A1', 'B1'],
          ['A2', 'B2']
        ]
      }
    );

    let graphMode = 'initial';

    hot.setDataAtCell(1, 0, 'A1-edit', 'edit:first');
    graphMode = 'changed';
    undoManager.record({
      label: 'graph:mode-change',
      undo: () => {
        graphMode = 'initial';
        return true;
      },
      redo: () => {
        graphMode = 'changed';
        return true;
      }
    });
    hot.setDataAtCell(1, 1, 'B1-edit', 'edit:second');

    expect(hot.undo()).toBe(true);
    expect(hot.getDataAtCell(1, 1)).toBe('B1');
    expect(graphMode).toBe('changed');
    expect(hot.getDataAtCell(1, 0)).toBe('A1-edit');

    expect(hot.undo()).toBe(true);
    expect(graphMode).toBe('initial');
    expect(hot.getDataAtCell(1, 0)).toBe('A1-edit');

    expect(hot.undo()).toBe(true);
    expect(hot.getDataAtCell(1, 0)).toBe('A1');

    expect(hot.redo()).toBe(true);
    expect(hot.getDataAtCell(1, 0)).toBe('A1-edit');

    expect(hot.redo()).toBe(true);
    expect(graphMode).toBe('changed');

    expect(hot.redo()).toBe(true);
    expect(hot.getDataAtCell(1, 1)).toBe('B1-edit');
  });

  test('grid keyboard undo flushes pending column reorder transactions through the shared undo stack', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleKeyboardUndoHot';
    document.body.appendChild(container);

    let displayed = Array.from({ length: 12 }, (_, idx) => `c${idx}`);

    const originalAgGrid = global.window.agGrid;
    global.window.agGrid = {
      createGrid: (_container, gridOptions) => {
        const api = {
          refreshCells: jest.fn(),
          setRowData: jest.fn(),
          setColumnDefs: jest.fn(() => {
            displayed = Array.from({ length: 12 }, (_, idx) => `c${idx}`);
          }),
          destroy: jest.fn(),
          getFocusedCell: jest.fn(() => null)
        };
        fixture.capturedApi = api;
        fixture.capturedGridOptions = gridOptions;
        gridOptions?.onGridReady?.({ api, columnApi: {} });
        return api;
      }
    };

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-header-drag-handle-keyboard-undo',
        data: [
          ['Control', 'Treatment A', 'Treatment B'],
          [12, 15, 14],
          [14.3, 17, 15.3],
          [11, 14.6, 13]
        ]
      }
    );

    hot.columnApi = {
      getAllDisplayedColumns: () => displayed.map(id => ({ getColId: () => id })),
      moveColumns: (ids, toIndex) => {
        const list = Array.isArray(ids) ? ids : [ids];
        const remaining = displayed.filter(id => !list.includes(id));
        const idx = Math.max(0, Math.min(Number(toIndex) || 0, remaining.length));
        displayed = remaining.slice(0, idx).concat(list).concat(remaining.slice(idx));
      }
    };

    const header0 = document.createElement('div');
    header0.className = 'ag-header-cell';
    header0.setAttribute('col-id', 'c0');
    const handle = document.createElement('span');
    handle.className = 'hot-col-drag-handle';
    header0.appendChild(handle);
    container.appendChild(header0);

    const header1 = document.createElement('div');
    header1.className = 'ag-header-cell';
    header1.setAttribute('col-id', 'c1');
    header1.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 20, right: 100, bottom: 20 });
    container.appendChild(header1);

    const originalElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = () => header1;

    handle.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    header1.dispatchEvent(new global.window.MouseEvent('mousemove', { bubbles: true, cancelable: true, buttons: 1, clientX: 80, clientY: 10 }));

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    global.window.dispatchEvent(new global.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    document.elementFromPoint = originalElementFromPoint;

    expect(hot.getDataAtCell(0, 0)).toBe('Treatment A');
    expect(Shared.undoManager.performCommand('undo', { target: container })).toBe(true);
    expect(hot.getDataAtCell(0, 0)).toBe('Control');
    expect(hot.getDataAtCell(0, 1)).toBe('Treatment A');
    expect(hot.getDataAtCell(0, 2)).toBe('Treatment B');

    global.window.agGrid = originalAgGrid;
  });

  test('column handle drag commits reorder on window blur if mouseup is missed', async () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleBlurCommitHot';
    document.body.appendChild(container);

    let displayed = Array.from({ length: 12 }, (_, idx) => `c${idx}`);

    const originalAgGrid = global.window.agGrid;
    global.window.agGrid = {
      createGrid: (_container, gridOptions) => {
        const api = {
          refreshCells: jest.fn(),
          setRowData: jest.fn(),
          setColumnDefs: jest.fn(() => {
            displayed = Array.from({ length: 12 }, (_, idx) => `c${idx}`);
          }),
          destroy: jest.fn(),
          getFocusedCell: jest.fn(() => null)
        };
        fixture.capturedApi = api;
        fixture.capturedGridOptions = gridOptions;
        gridOptions?.onGridReady?.({ api, columnApi: {} });
        return api;
      }
    };

    const hot = fixture.createTable(
      container,
      { rows: 2, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-header-drag-handle-blur-commit',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1']
        ]
      }
    );

    hot.columnApi = {
      getAllDisplayedColumns: () => displayed.map(id => ({ getColId: () => id })),
      moveColumns: (ids, toIndex) => {
        const list = Array.isArray(ids) ? ids : [ids];
        const remaining = displayed.filter(id => !list.includes(id));
        const idx = Math.max(0, Math.min(Number(toIndex) || 0, remaining.length));
        displayed = remaining.slice(0, idx).concat(list).concat(remaining.slice(idx));
      }
    };

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

    // Mouseup can be missed if the pointer leaves the window while dragging.
    // Blurring the window must still finalize and commit the reorder.
    global.window.dispatchEvent(new global.window.Event('blur'));
    document.elementFromPoint = originalElementFromPoint;

    expect(hot.getDataAtCell(0, 0)).toBe('B0');
    expect(undoManager.undo()).toBe(true);
    expect(hot.getDataAtCell(0, 0)).toBe('A0');

    global.window.agGrid = originalAgGrid;
  });

  test('native AG onColumnMoved commit records undo even without moved-column metadata', () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agNativeColumnMoveUndoHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 2, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-native-column-move-undo',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1']
        ]
      }
    );
    undoManager.clear();

    const totalCols = hot.countCols();
    let displayed = Array.from({ length: totalCols }, (_, idx) => `c${idx}`);
    const moveDisplayed = (ids, toIndex) => {
      const list = Array.isArray(ids) ? ids : [ids];
      const remaining = displayed.filter(id => !list.includes(id));
      const idx = Math.max(0, Math.min(Number(toIndex) || 0, remaining.length));
      displayed = remaining.slice(0, idx).concat(list).concat(remaining.slice(idx));
    };

    hot.columnApi = {
      getAllDisplayedColumns: () => displayed.map(id => ({ getColId: () => id })),
      moveColumns: moveDisplayed
    };
    hot.gridApi.columnApi = hot.columnApi;
    hot.gridApi.setColumnDefs = jest.fn(() => {
      displayed = Array.from({ length: totalCols }, (_, idx) => `c${idx}`);
    });

    // Simulate AG Grid native drag result: display order changed first, then
    // onColumnMoved fires with missing params.columns / params.column metadata.
    moveDisplayed(['c0'], 2);
    fixture.capturedGridOptions.onColumnMoved({
      api: hot.gridApi,
      columnApi: hot.columnApi,
      source: 'uiColumnMoved',
      finished: true
    });

    expect(hot.getDataAtCell(0, 0)).toBe('B0');
    expect(hot.getDataAtCell(0, 1)).toBe('C0');
    expect(hot.getDataAtCell(0, 2)).toBe('A0');

    const undoResult = fixture.undoUntil(undoManager, () => (
      hot.getDataAtCell(0, 0) === 'A0'
      && hot.getDataAtCell(0, 1) === 'B0'
      && hot.getDataAtCell(0, 2) === 'C0'
    ));
    expect(undoResult.reached).toBe(true);

    const redoResult = fixture.redoUntil(undoManager, () => (
      hot.getDataAtCell(0, 0) === 'B0'
      && hot.getDataAtCell(0, 1) === 'C0'
      && hot.getDataAtCell(0, 2) === 'A0'
    ));
    expect(redoResult.reached).toBe(true);
  });

  test('native AG onColumnMoved commit falls back to columnState ordering when displayed-columns API is unavailable', () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agNativeColumnMoveColumnStateFallbackHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 2, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-native-column-move-column-state-fallback',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1']
        ]
      }
    );

    const movedColumnState = [
      { colId: '__rowHeader' },
      { colId: 'c1' },
      { colId: 'c2' },
      { colId: 'c3' },
      { colId: 'c4' },
      { colId: 'c5' },
      { colId: 'c6' },
      { colId: 'c7' },
      { colId: 'c8' },
      { colId: 'c9' },
      { colId: 'c10' },
      { colId: 'c11' },
      { colId: 'c0' }
    ];
    const identityColumnState = [
      { colId: '__rowHeader' },
      ...Array.from({ length: 12 }, (_, idx) => ({ colId: `c${idx}` }))
    ];
    let columnState = movedColumnState.slice();
    hot.columnApi = {
      getColumnState: () => columnState
    };
    hot.gridApi.columnApi = hot.columnApi;
    hot.gridApi.setColumnDefs = jest.fn(() => {
      columnState = identityColumnState.slice();
    });

    fixture.capturedGridOptions.onColumnMoved({
      api: hot.gridApi,
      columnApi: hot.columnApi,
      source: 'uiColumnMoved',
      finished: true
    });

    expect(hot.getDataAtCell(0, 0)).toBe('B0');
    expect(hot.getDataAtCell(0, 1)).toBe('C0');
    expect(hot.getDataAtCell(0, 11)).toBe('A0');

    const undoResult = fixture.undoUntil(undoManager, () => (
      hot.getDataAtCell(0, 0) === 'A0'
      && hot.getDataAtCell(0, 1) === 'B0'
      && hot.getDataAtCell(0, 2) === 'C0'
    ));
    expect(undoResult.reached).toBe(true);
  });
});
