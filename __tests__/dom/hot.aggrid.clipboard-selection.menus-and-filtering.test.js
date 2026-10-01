'use strict';
const { setupHotAggridClipboardFixture } = require('../../test-support/hotAggridClipboardSuite');

describe('Shared.hot AG Grid clipboard + selection behaviors', () => {
  const fixture = setupHotAggridClipboardFixture();

  test('column header context menu supports insert/delete for selected columns', () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agHeaderContextMenuColsHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 2, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-header-contextmenu-cols',
        data: [
          ['A0', 'B0', 'C0', 'D0'],
          ['A1', 'B1', 'C1', 'D1']
        ]
      }
    );

    const lastRow = hot.countRows() - 1;
    hot.selectCell(0, 1, lastRow, 2); // full-height selection for columns 1..2

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c1');
    container.appendChild(header);

    const evt = new global.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    header.dispatchEvent(evt);

    const menu = document.querySelector('.ag-hot-menu');
    expect(menu).toBeTruthy();
    const labels = Array.from(menu.querySelectorAll('div')).map(node => node.textContent).filter(Boolean);
    expect(labels).toContain('Insert 2 column(s) before');
    expect(labels).toContain('Insert 2 column(s) after');
    expect(labels).toContain('Delete 2 column(s)');
    expect(labels).toContain('Copy columns');
    expect(labels).toContain('Cut columns');
    expect(labels).toContain('Paste into columns');
    expect(labels).not.toContain('Include columns in analysis');

    const deleteEntry = Array.from(menu.querySelectorAll('div')).find(node => node.textContent === 'Delete 2 column(s)');
    expect(deleteEntry).toBeTruthy();
    deleteEntry.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true }));

    // After deleting cols 1..2, col1 should now contain former col3 (D0).
    expect(hot.getDataAtCell(0, 1)).toBe('D0');

    const undoResult = fixture.undoUntil(undoManager, () => hot.getDataAtCell(0, 1) === 'B0');
    expect(undoResult.reached).toBe(true);

    const redoResult = fixture.redoUntil(undoManager, () => hot.getDataAtCell(0, 1) === 'D0');
    expect(redoResult.reached).toBe(true);
  });

  test('row header context menu insert row supports undo/redo', () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agRowHeaderContextMenuUndoHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      {
        debugLabel: 'ag-row-header-contextmenu-undo',
        data: [
          ['A0', 'B0'],
          ['A1', 'B1']
        ]
      }
    );

    const evt = new global.window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10
    });
    fixture.capturedGridOptions.onCellContextMenu({
      event: evt,
      column: { getColId: () => '__rowHeader' },
      node: { rowIndex: 1, data: { __rowIndex: 1 } }
    });

    const menu = document.querySelector('.ag-hot-menu');
    expect(menu).toBeTruthy();

    const insertAboveEntry = Array.from(menu.querySelectorAll('div')).find(node => node.textContent === 'Insert 1 row(s) above');
    expect(insertAboveEntry).toBeTruthy();
    insertAboveEntry.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true }));

    expect(hot.countRows()).toBe(3);
    expect(hot.getDataAtCell(2, 0)).toBe('A1');

    const undoResult = fixture.undoUntil(undoManager, () => hot.countRows() === 2 && hot.getDataAtCell(1, 0) === 'A1');
    expect(undoResult.reached).toBe(true);

    const redoResult = fixture.redoUntil(undoManager, () => hot.countRows() === 3 && hot.getDataAtCell(2, 0) === 'A1');
    expect(redoResult.reached).toBe(true);
  });

  test('column header context menu shows Include only when selected column is excluded', () => {
    const container = document.createElement('div');
    container.id = 'agHeaderContextMenuIncludeColsHot';
    document.body.appendChild(container);

    fixture.createTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      {
        debugLabel: 'ag-header-contextmenu-include-cols',
        data: [
          ['A0', 'B0'],
          ['A1', 'B1']
        ]
      }
    );

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c0');
    container.appendChild(header);

    header.dispatchEvent(new global.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
    let menu = document.querySelector('.ag-hot-menu');
    expect(menu).toBeTruthy();
    let labels = Array.from(menu.querySelectorAll('div')).map(node => node.textContent).filter(Boolean);
    expect(labels).toContain('Exclude column from analysis');
    expect(labels).not.toContain('Include column in analysis');

    const excludeEntry = Array.from(menu.querySelectorAll('div')).find(node => node.textContent === 'Exclude column from analysis');
    expect(excludeEntry).toBeTruthy();
    excludeEntry.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true }));

    header.dispatchEvent(new global.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 12 }));
    menu = document.querySelector('.ag-hot-menu');
    expect(menu).toBeTruthy();
    labels = Array.from(menu.querySelectorAll('div')).map(node => node.textContent).filter(Boolean);
    expect(labels).toContain('Include column in analysis');
  });

  test('column header context menu copy/cut/paste actions operate on header-selected column', async () => {
    const container = document.createElement('div');
    container.id = 'agHeaderContextMenuClipboardColsHot';
    document.body.appendChild(container);

    const writeText = jest.fn(async () => {});
    const readText = jest.fn(async () => 'P0\nP1');
    global.window.navigator.clipboard = { writeText, readText };

    const hot = fixture.createTable(
      container,
      { rows: 2, cols: 2 },
      () => {},
      {
        debugLabel: 'ag-header-contextmenu-clipboard-cols',
        data: [
          ['A0', 'B0'],
          ['A1', 'B1']
        ]
      }
    );

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c0');
    container.appendChild(header);

    header.dispatchEvent(new global.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }));
    let menu = document.querySelector('.ag-hot-menu');
    expect(menu).toBeTruthy();
    const copyEntry = Array.from(menu.querySelectorAll('div')).find(node => node.textContent === 'Copy column');
    expect(copyEntry).toBeTruthy();
    copyEntry.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(writeText).toHaveBeenCalled();
    expect(writeText.mock.calls.at(-1)[0]).toBe('A0\nA1');

    header.dispatchEvent(new global.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 21, clientY: 21 }));
    menu = document.querySelector('.ag-hot-menu');
    const cutEntry = Array.from(menu.querySelectorAll('div')).find(node => node.textContent === 'Cut column');
    expect(cutEntry).toBeTruthy();
    cutEntry.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(writeText.mock.calls.at(-1)[0]).toBe('A0\nA1');
    expect(hot.getDataAtCell(0, 0)).toBe('');
    expect(hot.getDataAtCell(1, 0)).toBe('');
    expect(hot.getDataAtCell(0, 1)).toBe('B0');

    header.dispatchEvent(new global.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 22, clientY: 22 }));
    menu = document.querySelector('.ag-hot-menu');
    const pasteEntry = Array.from(menu.querySelectorAll('div')).find(node => node.textContent === 'Paste into column');
    expect(pasteEntry).toBeTruthy();
    pasteEntry.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(readText).toHaveBeenCalled();
    expect(hot.getDataAtCell(0, 0)).toBe('P0');
    expect(hot.getDataAtCell(1, 0)).toBe('P1');
  });

  test('cell context menu shows Copy, Cut, Paste at the top in order', () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agCellContextMenuClipboardHot';
    document.body.appendChild(container);

    global.window.navigator.clipboard = {
      writeText: jest.fn(async () => {}),
      readText: jest.fn(async () => 'X')
    };

    fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-cell-contextmenu-clipboard',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1'],
          ['A2', 'B2', 'C2']
        ]
      }
    );
    undoManager.clear();

    fixture.capturedGridOptions.onCellContextMenu({
      event: new global.window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 30,
        clientY: 40
      }),
      node: {
        rowIndex: 1,
        data: { __rowIndex: 1 }
      },
      column: {
        getColId: () => 'c1'
      }
    });

    const menu = document.querySelector('.ag-hot-menu');
    expect(menu).toBeTruthy();
    const labels = Array.from(menu.children)
      .map(node => (node.textContent || '').trim())
      .filter(Boolean);

    expect(labels.slice(0, 4)).toEqual([
      'Copy',
      'Cut',
      'Paste',
      'Paste -> Transposed'
    ]);
    expect(labels).toContain('Exclude selection from analysis');
  });

  test('right-clicking a pinned first-row cell keeps transpose paste on that row', async () => {
    const container = document.createElement('div');
    container.id = 'agPinnedFirstRowContextMenuHot';
    document.body.appendChild(container);

    global.window.navigator.clipboard = {
      readText: jest.fn(async () => 'P0\tP1\nQ0\tQ1')
    };

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-pinned-first-row-contextmenu',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1'],
          ['A2', 'B2', 'C2']
        ],
        pinFirstRow: true
      }
    );

    const column = { getColId: () => 'c1' };
    fixture.capturedGridOptions.onCellFocused({
      api: fixture.capturedApi,
      rowIndex: 0,
      rowPinned: 'top',
      column
    });
    expect(hot.getSelectedLast()).toEqual([0, 1, 0, 1]);

    fixture.capturedGridOptions.onCellContextMenu({
      event: new global.window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 30,
        clientY: 40
      }),
      node: {
        rowIndex: 0,
        rowPinned: 'top',
        data: { __rowIndex: 0 }
      },
      column
    });

    const menu = document.querySelector('.ag-hot-menu');
    expect(menu).toBeTruthy();
    const transposeEntry = Array.from(menu.children)
      .find(node => (node.textContent || '').trim() === 'Paste -> Transposed');
    expect(transposeEntry).toBeTruthy();
    transposeEntry.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(hot.getDataAtCell(0, 1)).toBe('P0');
    expect(hot.getDataAtCell(0, 2)).toBe('Q0');
    expect(hot.getDataAtCell(1, 1)).toBe('P1');
    expect(hot.getDataAtCell(1, 2)).toBe('Q1');
  });

  test('row header context menu supports insert/delete for selected rows', () => {
    const container = document.createElement('div');
    container.id = 'agHeaderContextMenuRowsHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-header-contextmenu-rows',
        data: [
          ['R0', 'x', 'x'],
          ['R1', 'x', 'x'],
          ['R2', 'x', 'x'],
          ['R3', 'x', 'x']
        ]
      }
    );

    const lastCol = hot.countCols() - 1;
    hot.selectCell(1, 0, 2, lastCol); // full-width selection for rows 1..2

    const evt = new global.window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
    fixture.capturedGridOptions.onCellContextMenu({
      event: evt,
      column: { getColId: () => '__rowHeader' },
      node: { rowIndex: 1, data: { __rowIndex: 1 } }
    });

    const menu = document.querySelector('.ag-hot-menu');
    expect(menu).toBeTruthy();
    const labels = Array.from(menu.querySelectorAll('div')).map(node => node.textContent).filter(Boolean);
    expect(labels).toContain('Insert 2 row(s) above');
    expect(labels).toContain('Insert 2 row(s) below');
    expect(labels).toContain('Delete 2 row(s)');

    const deleteEntry = Array.from(menu.querySelectorAll('div')).find(node => node.textContent === 'Delete 2 row(s)');
    expect(deleteEntry).toBeTruthy();
    deleteEntry.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true }));

    // After deleting rows 1..2, visual row 1 should now contain former row 3 (R3).
    expect(hot.getDataAtCell(1, 0)).toBe('R3');
  });

  test('postSortRows keeps the first data row anchored', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agSortHot';
    document.body.appendChild(container);

    fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-sort',
        data: Shared.createEmptyData(3, 3)
      }
    );

    expect(typeof fixture.capturedGridOptions?.postSortRows).toBe('function');

    const nodes = [
      { data: { __rowIndex: 2 } },
      { data: { __rowIndex: 0 } },
      { data: { __rowIndex: 1 } }
    ];
    fixture.capturedGridOptions.postSortRows({ nodes, api: { getSortModel: () => [{ colId: 'c0', sort: 'asc' }] } });

    expect(nodes[0]?.data?.__rowIndex).toBe(0);
  });

  test('postSortRows keeps all-empty rows at the bottom', () => {
    const container = document.createElement('div');
    container.id = 'agSortEmptyHot';
    document.body.appendChild(container);

    fixture.createTable(
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

    expect(typeof fixture.capturedGridOptions?.postSortRows).toBe('function');

    const nodes = [
      { data: { __rowIndex: 2 } }, // empty row (would float to top on ascending sort)
      { data: { __rowIndex: 3 } },
      { data: { __rowIndex: 1 } },
      { data: { __rowIndex: 0 } }
    ];
    fixture.capturedGridOptions.postSortRows({ nodes, api: { getSortModel: () => [{ colId: 'c0', sort: 'asc' }] } });

    expect(nodes.map(node => node?.data?.__rowIndex)).toEqual([0, 3, 1, 2]);
  });

  test('suppresses browser context menu over the grid container', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agContextMenuHot';
    document.body.appendChild(container);

    fixture.createTable(
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

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-exclusions',
        data: Shared.createEmptyData(3, 3)
      }
    );

    const colDef = fixture.capturedGridOptions?.columnDefs?.find(def => def?.colId === 'c0');
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

  test('plain column header click selects the full column', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agColHeaderSelectHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      { debugLabel: 'ag-col-header-select', data: Shared.createEmptyData(4, 3) }
    );

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c1');
    container.appendChild(header);

    hot.selectCell(2, 2);

    const evt = new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    header.dispatchEvent(evt);
    header.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(hot.getSelectedLast()).toEqual([0, 1, 3, 1]);
  });

  test('grouped header clicks select the group first and the pointed child second', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agGroupedHeaderProgressiveSelectHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 5 },
      () => {},
      {
        debugLabel: 'ag-grouped-header-progressive-select',
        data: Shared.createEmptyData(4, 5),
        columnGroups: [{ startCol: 1, span: 3 }]
      }
    );

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c2');
    container.appendChild(header);

    const clickHeader = () => {
      header.dispatchEvent(new global.window.MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0
      }));
      header.dispatchEvent(new global.window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0
      }));
    };

    clickHeader();
    expect(hot.getSelectedLast()).toEqual([0, 1, 3, 3]);

    clickHeader();
    expect(hot.getSelectedLast()).toEqual([0, 2, 3, 2]);

    clickHeader();
    expect(hot.getSelectedLast()).toEqual([0, 1, 3, 3]);
  });

  test('column-mode groups keep single-column header selection', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agColumnModeGroupHeaderSelectHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-column-mode-group-header-select',
        data: Shared.createEmptyData(4, 4),
        columnGroups: [{ startCol: 0, span: 3, selectionMode: 'column' }]
      }
    );

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c1');
    container.appendChild(header);
    header.dispatchEvent(new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0
    }));
    header.dispatchEvent(new global.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0
    }));

    expect(hot.getSelectedLast()).toEqual([0, 1, 3, 1]);
  });

  test('full column selection outline hides top edge and stays below horizontal scrollbar layer', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agFullColumnOutlineHot';
    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 420,
      bottom: 180,
      width: 420,
      height: 180
    });
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-full-column-outline',
        data: Shared.createEmptyData(4, 3),
        pinFirstRow: true
      }
    );

    const floatingTop = document.createElement('div');
    floatingTop.className = 'ag-floating-top';
    const floatingViewport = document.createElement('div');
    floatingViewport.className = 'ag-floating-top-viewport';
    floatingViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 420,
      bottom: 60,
      width: 420,
      height: 28
    });
    const pinnedRow = document.createElement('div');
    pinnedRow.className = 'ag-row';
    pinnedRow.setAttribute('row-index', 't-0');
    const pinnedCell = document.createElement('div');
    pinnedCell.className = 'ag-cell';
    pinnedCell.setAttribute('col-id', 'c1');
    pinnedCell.setAttribute('row-index', 't-0');
    pinnedCell.getBoundingClientRect = () => ({
      left: 100,
      top: 32,
      right: 200,
      bottom: 60,
      width: 100,
      height: 28
    });
    pinnedRow.appendChild(pinnedCell);
    floatingViewport.appendChild(pinnedRow);
    floatingTop.appendChild(floatingViewport);
    container.appendChild(floatingTop);

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 420,
      bottom: 172,
      width: 420,
      height: 112
    });
    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    centerViewport.getBoundingClientRect = bodyViewport.getBoundingClientRect;
    bodyViewport.appendChild(centerViewport);
    container.appendChild(bodyViewport);

    for (let rowIndex = 1; rowIndex <= 3; rowIndex += 1) {
      const row = document.createElement('div');
      row.className = 'ag-row';
      row.setAttribute('row-index', String(rowIndex));
      const top = 60 + ((rowIndex - 1) * 28);
      const cell = document.createElement('div');
      cell.className = 'ag-cell';
      cell.setAttribute('col-id', 'c1');
      cell.setAttribute('row-index', String(rowIndex));
      cell.getBoundingClientRect = () => ({
        left: 100,
        top,
        right: 200,
        bottom: top + 28,
        width: 100,
        height: 28
      });
      row.appendChild(cell);
      centerViewport.appendChild(row);
    }

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c1');
    container.appendChild(header);
    header.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    header.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    await fixture.waitForNextFrame();

    const outline = container.querySelector('.hot-selection-outline');
    expect(hot.getSelectedLast()).toEqual([0, 1, 3, 1]);
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');
    expect(outline.style.borderTopColor).toBe('transparent');
    expect(outline.style.borderLeftColor).not.toBe('transparent');
    expect(outline.style.borderRightColor).not.toBe('transparent');
    expect(outline.style.zIndex).toBe('7');
    expect(outline.querySelector('.hot-selection-outline-edge[data-edge="top"]').style.display).toBe('none');
    expect(outline.querySelector('.hot-selection-outline-edge[data-edge="left"]').style.display).toBe('block');
    expect(outline.querySelector('.hot-selection-outline-edge[data-edge="right"]').style.display).toBe('block');

    container.dispatchEvent(new global.window.KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    }));
    await fixture.waitForNextFrame();

    expect(hot.getSelectedLast()).toEqual([0, 0, 3, hot.countCols() - 1]);
    expect(outline.style.borderTopColor).not.toBe('transparent');
    expect(outline.querySelector('.hot-selection-outline-edge[data-edge="top"]').style.display).toBe('block');

    global.window.navigator.clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
    container.dispatchEvent(new global.window.KeyboardEvent('keydown', {
      key: 'c',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    }));
    await new Promise(resolve => setTimeout(resolve, 0));
    await fixture.waitForNextFrame();

    const clipboardOutline = container.querySelector('.hot-clipboard-outline');
    expect(clipboardOutline).toBeTruthy();
    expect(clipboardOutline.querySelector('.hot-clipboard-outline-edge[data-edge="top"]').style.display).toBe('block');
  });

  test('first child selection ignores the grouped pinned-header colspan when placing its outline', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agGroupedFirstChildOutlineHot';
    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 200,
      width: 500,
      height: 200
    });
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-grouped-first-child-outline',
        data: Shared.createEmptyData(4, 4),
        pinFirstRow: true,
        columnGroups: [{ startCol: 1, span: 3 }]
      }
    );

    const floatingTop = document.createElement('div');
    floatingTop.className = 'ag-floating-top';
    const floatingViewport = document.createElement('div');
    floatingViewport.className = 'ag-floating-top-viewport';
    floatingViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 500,
      bottom: 60,
      width: 500,
      height: 28
    });
    const pinnedRow = document.createElement('div');
    pinnedRow.className = 'ag-row';
    pinnedRow.setAttribute('row-index', 't-0');
    const groupedCell = document.createElement('div');
    groupedCell.className = 'ag-cell';
    groupedCell.setAttribute('col-id', 'c1');
    groupedCell.setAttribute('row-index', 't-0');
    groupedCell.getBoundingClientRect = () => ({
      left: 100,
      top: 32,
      right: 400,
      bottom: 60,
      width: 300,
      height: 28
    });
    pinnedRow.appendChild(groupedCell);
    floatingViewport.appendChild(pinnedRow);
    floatingTop.appendChild(floatingViewport);
    container.appendChild(floatingTop);

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 500,
      bottom: 172,
      width: 500,
      height: 112
    });
    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    centerViewport.getBoundingClientRect = bodyViewport.getBoundingClientRect;
    bodyViewport.appendChild(centerViewport);
    container.appendChild(bodyViewport);

    for(let rowIndex = 1; rowIndex <= 3; rowIndex += 1){
      const row = document.createElement('div');
      row.className = 'ag-row';
      row.setAttribute('row-index', String(rowIndex));
      const top = 60 + ((rowIndex - 1) * 28);
      const cell = document.createElement('div');
      cell.className = 'ag-cell';
      cell.setAttribute('col-id', 'c1');
      cell.setAttribute('row-index', String(rowIndex));
      cell.getBoundingClientRect = () => ({
        left: 100,
        top,
        right: 200,
        bottom: top + 28,
        width: 100,
        height: 28
      });
      row.appendChild(cell);
      centerViewport.appendChild(row);
    }

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c1');
    container.appendChild(header);
    const clickHeader = () => {
      header.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      header.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    };

    clickHeader();
    clickHeader();
    await fixture.waitForNextFrame();

    const outline = container.querySelector('.hot-selection-outline');
    expect(hot.getSelectedLast()).toEqual([0, 1, 3, 1]);
    expect(parseFloat(outline.style.width)).toBeLessThan(110);
  });

  test('plain header click selects full column and header action click preserves selection coordinates', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agColHeaderSortGateHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      { debugLabel: 'ag-col-header-sort-gate', data: Shared.createEmptyData(4, 3) }
    );

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c1');
    const headerAction = document.createElement('button');
    headerAction.className = 'hot-header-action hot-filter-indicator';
    header.appendChild(headerAction);
    container.appendChild(header);

    const sortSpy = jest.fn();
    header.addEventListener('click', sortSpy);
    hot.selectCell(1, 2);

    header.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    header.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(hot.getSelectedLast()).toEqual([0, 1, 3, 1]);
    expect(sortSpy).toHaveBeenCalledTimes(0);

    hot.selectCell(1, 2);
    headerAction.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    headerAction.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(hot.getSelectedLast()).toEqual([1, 2, 1, 2]);
    expect(sortSpy).toHaveBeenCalledTimes(1);
  });

  test('filter popup only shows condition inputs for operators that need them', () => {
    const container = document.createElement('div');
    container.id = 'agFilterPopupModesHot';
    document.body.appendChild(container);

    fixture.createTable(
      container,
      { rows: 4, cols: 2 },
      () => {},
      {
        debugLabel: 'ag-filter-popup-modes',
        data: [
          ['A', 'B'],
          [1, 2],
          [3, 4],
          [5, 6]
        ]
      }
    );

    const colDef = fixture.capturedGridOptions?.columnDefs?.find(col => col.colId === 'c1');
    expect(colDef?.headerComponent).toBeTruthy();
    const headerComponent = new colDef.headerComponent();
    const headerApi = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    headerComponent.init({
      api: headerApi,
      column: {
        getColId: () => 'c1',
        getSort: () => '',
        getColDef: () => ({ headerName: 'B' })
      },
      displayName: 'B'
    });
    const headerGui = headerComponent.getGui();
    container.appendChild(headerGui);
    const headerAction = headerGui.querySelector('.hot-header-action');
    expect(headerAction).toBeTruthy();

    headerAction.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    const menu = document.querySelector('.ag-hot-filter-menu');
    expect(menu).toBeTruthy();
    expect(menu.querySelector('.ag-hot-filter-menu__heading')).toBeNull();
    expect(menu.querySelector('.ag-hot-filter-menu__heading-meta')).toBeNull();
    expect(menu.getAttribute('aria-label')).toBe('Filter B');

    const modeSelect = menu.querySelector('.ag-hot-filter-menu__select');
    const inputWrap = menu.querySelector('.ag-hot-filter-menu__inputs');
    const inputs = menu.querySelectorAll('.ag-hot-filter-menu__input');
    expect(modeSelect).toBeTruthy();
    expect(inputWrap).toBeTruthy();
    expect(inputs.length).toBeGreaterThanOrEqual(2);

    expect(inputWrap.hidden).toBe(true);
    expect(inputWrap.style.display).toBe('none');

    modeSelect.value = 'greaterThan';
    modeSelect.dispatchEvent(new global.window.Event('change', { bubbles: true }));
    expect(inputWrap.hidden).toBe(false);
    expect(inputWrap.style.display).toBe('');
    expect(inputs[0].hidden).toBe(false);
    expect(inputs[1].hidden).toBe(true);

    modeSelect.value = 'between';
    modeSelect.dispatchEvent(new global.window.Event('change', { bubbles: true }));
    expect(inputWrap.hidden).toBe(false);
    expect(inputs[0].hidden).toBe(false);
    expect(inputs[1].hidden).toBe(false);

    modeSelect.value = 'aboveAverage';
    modeSelect.dispatchEvent(new global.window.Event('change', { bubbles: true }));
    expect(inputWrap.hidden).toBe(true);
    expect(inputWrap.style.display).toBe('none');

    modeSelect.value = 'set';
    modeSelect.dispatchEvent(new global.window.Event('change', { bubbles: true }));
    expect(inputWrap.hidden).toBe(true);
    expect(inputWrap.style.display).toBe('none');
  });

  test('set-filter search applies matching values on OK and Enter', () => {
    const container = document.createElement('div');
    container.id = 'agFilterPopupSearchApplyHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 5, cols: 2 },
      () => {},
      {
        debugLabel: 'ag-filter-popup-search-apply',
        data: [
          ['Label', 'Group'],
          ['a', 'alpha'],
          ['b', 'beta'],
          ['c', 'gamma'],
          ['d', 'delta']
        ]
      }
    );

    const colDef = fixture.capturedGridOptions?.columnDefs?.find(col => col.colId === 'c1');
    expect(colDef?.headerComponent).toBeTruthy();
    const headerComponent = new colDef.headerComponent();
    const headerApi = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    headerComponent.init({
      api: headerApi,
      column: {
        getColId: () => 'c1',
        getSort: () => '',
        getColDef: () => ({ headerName: 'Group' })
      },
      displayName: 'Group'
    });
    const headerGui = headerComponent.getGui();
    container.appendChild(headerGui);
    const headerAction = headerGui.querySelector('.hot-header-action');
    expect(headerAction).toBeTruthy();

    const openMenu = () => {
      headerAction.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      const menu = document.querySelector('.ag-hot-filter-menu');
      expect(menu).toBeTruthy();
      return menu;
    };

    let menu = openMenu();
    let searchInput = menu.querySelector('.ag-hot-filter-menu__search');
    let applyButton = menu.querySelector('.ag-hot-filter-menu__button');
    expect(searchInput).toBeTruthy();
    expect(applyButton?.textContent).toBe('OK');
    searchInput.value = 'be';
    searchInput.dispatchEvent(new global.window.Event('input', { bubbles: true }));
    applyButton.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(hot.countRows()).toBe(2);
    expect(hot.getDataAtCell(0, 1)).toBe('Group');
    expect(hot.getDataAtCell(1, 1)).toBe('beta');

    hot.clearFilters({ schedule: false });
    expect(hot.countRows()).toBe(5);

    menu = openMenu();
    searchInput = menu.querySelector('.ag-hot-filter-menu__search');
    expect(searchInput).toBeTruthy();
    searchInput.value = 'de';
    searchInput.dispatchEvent(new global.window.Event('input', { bubbles: true }));
    searchInput.dispatchEvent(new global.window.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true
    }));

    expect(hot.countRows()).toBe(2);
    expect(hot.getDataAtCell(0, 1)).toBe('Group');
    expect(hot.getDataAtCell(1, 1)).toBe('delta');
  });

  test('set-filter value list scroll does not dismiss the popup', () => {
    const container = document.createElement('div');
    container.id = 'agFilterPopupScrollHot';
    document.body.appendChild(container);

    const rows = [['Label']];
    for(let i = 0; i < 40; i += 1){
      rows.push([`value-${i}`]);
    }

    fixture.createTable(
      container,
      { rows: rows.length, cols: 1 },
      () => {},
      {
        debugLabel: 'ag-filter-popup-scroll',
        data: rows
      }
    );

    const colDef = fixture.capturedGridOptions?.columnDefs?.find(col => col.colId === 'c0');
    expect(colDef?.headerComponent).toBeTruthy();
    const headerComponent = new colDef.headerComponent();
    const headerApi = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    headerComponent.init({
      api: headerApi,
      column: {
        getColId: () => 'c0',
        getSort: () => '',
        getColDef: () => ({ headerName: 'Label' })
      },
      displayName: 'Label'
    });
    const headerGui = headerComponent.getGui();
    container.appendChild(headerGui);
    const headerAction = headerGui.querySelector('.hot-header-action');
    expect(headerAction).toBeTruthy();

    headerAction.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    const menu = document.querySelector('.ag-hot-filter-menu');
    const valueList = menu?.querySelector('.ag-hot-filter-menu__values');
    expect(menu).toBeTruthy();
    expect(valueList).toBeTruthy();
    expect(valueList.style.maxHeight).toBe('108px');

    valueList.dispatchEvent(new global.window.Event('scroll', { bubbles: false, cancelable: false }));

    expect(document.querySelector('.ag-hot-filter-menu')).toBe(menu);
  });

  test('filter apply and clear actions are undoable', () => {
    const Shared = global.window.Shared;
    const undoManager = Shared.undoManager;
    const container = document.createElement('div');
    container.id = 'agFilterUndoHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 5, cols: 2 },
      () => {},
      {
        debugLabel: 'ag-filter-undo',
        data: [
          ['Label', 'Value'],
          ['a', 1],
          ['b', 2],
          ['c', 3],
          ['d', 4]
        ]
      }
    );

    const colDef = fixture.capturedGridOptions?.columnDefs?.find(col => col.colId === 'c1');
    expect(colDef?.headerComponent).toBeTruthy();
    const headerComponent = new colDef.headerComponent();
    const headerApi = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    };
    headerComponent.init({
      api: headerApi,
      column: {
        getColId: () => 'c1',
        getSort: () => '',
        getColDef: () => ({ headerName: 'Value' })
      },
      displayName: 'Value'
    });
    const headerGui = headerComponent.getGui();
    container.appendChild(headerGui);
    const headerAction = headerGui.querySelector('.hot-header-action');
    expect(headerAction).toBeTruthy();

    const openMenu = () => {
      headerAction.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      const menu = document.querySelector('.ag-hot-filter-menu');
      expect(menu).toBeTruthy();
      return menu;
    };

    let menu = openMenu();
    let modeSelect = menu.querySelector('.ag-hot-filter-menu__select');
    let valueInput = menu.querySelector('.ag-hot-filter-menu__input');
    let buttons = Array.from(menu.querySelectorAll('.ag-hot-filter-menu__button'));
    let okButton = buttons.find(button => button.textContent === 'OK');
    expect(modeSelect).toBeTruthy();
    expect(valueInput).toBeTruthy();
    expect(okButton).toBeTruthy();

    modeSelect.value = 'greaterThan';
    modeSelect.dispatchEvent(new global.window.Event('change', { bubbles: true }));
    valueInput.value = '2';
    okButton.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(hot.countRows()).toBe(3);
    expect(hot.getDataAtCell(1, 1)).toBe(3);
    const undoApplyResult = fixture.undoUntil(undoManager, () => hot.countRows() === 5);
    expect(undoApplyResult.reached).toBe(true);
    const redoApplyResult = fixture.redoUntil(undoManager, () => hot.countRows() === 3);
    expect(redoApplyResult.reached).toBe(true);

    menu = openMenu();
    buttons = Array.from(menu.querySelectorAll('.ag-hot-filter-menu__button'));
    const clearButton = buttons.find(button => button.textContent === 'Clear');
    expect(clearButton).toBeTruthy();
    clearButton.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));

    expect(hot.countRows()).toBe(5);
    const undoClearResult = fixture.undoUntil(undoManager, () => hot.countRows() === 3);
    expect(undoClearResult.reached).toBe(true);
    const redoClearResult = fixture.redoUntil(undoManager, () => hot.countRows() === 5);
    expect(redoClearResult.reached).toBe(true);
  });

  test('clicking row header selects the full row', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agRowHeaderSelectHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
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

  test('column header selection keeps grid container focused for keyboard shortcuts', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderFocusHot';
    document.body.appendChild(container);

    fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      { debugLabel: 'ag-header-focus', data: Shared.createEmptyData(4, 3) }
    );

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c1');
    container.appendChild(header);

    header.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));

    expect(document.activeElement).toBe(container);
  });
});
