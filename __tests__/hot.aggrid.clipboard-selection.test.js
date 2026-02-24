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
    require('../js/shared/undo.js');
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

  test('paste from text node inside contenteditable editor is not intercepted by table paste handler', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteEditableTextNodeHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
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

    const hot = Shared.hot.createStandardTable(
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

  test('dragging pinned first-row cells replaces prior body selection', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPinnedFirstRowDragHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
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

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-pinned-selected-class',
        data: Shared.createEmptyData(4, 3),
        pinFirstRow: true
      }
    );

    const colDef = (capturedGridOptions?.columnDefs || []).find(def => def?.colId === 'c1');
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

  test('fill handle appears for pinned header-row cells when ghost body row exists', async () => {
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

    const hot = Shared.hot.createStandardTable(
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

    const hot = Shared.hot.createStandardTable(
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

    const hot = Shared.hot.createStandardTable(
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

  test('fill handle keeps base z-index for non-pinned selection', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agFillHandleZIndexBodyHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 300,
      width: 500,
      height: 300
    });

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-fill-handle-zindex-body',
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
      bottom: 300,
      width: 500,
      height: 270
    });
    const row = document.createElement('div');
    row.className = 'ag-row';
    row.setAttribute('row-index', '1');
    const cell = document.createElement('div');
    cell.className = 'ag-cell';
    cell.setAttribute('col-id', 'c1');
    cell.getBoundingClientRect = () => ({
      left: 100,
      top: 58,
      right: 200,
      bottom: 86,
      width: 100,
      height: 28
    });
    row.appendChild(cell);
    bodyViewport.appendChild(row);
    container.appendChild(bodyViewport);

    hot.selectCell(1, 1, 1, 1);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const handle = container.querySelector('.hot-fill-handle');
    expect(handle).toBeTruthy();
    expect(handle.style.display).toBe('block');
    expect(handle.style.zIndex).toBe('2');
    expect(handle.dataset.pinnedSelection).toBeUndefined();
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
        capturedApi = api;
        capturedGridOptions = gridOptions;
        gridOptions?.onGridReady?.({ api, columnApi: {} });
        return api;
      }
    };

    const hot = Shared.hot.createStandardTable(
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

  test('column header context menu supports insert/delete for selected columns', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderContextMenuColsHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
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

    const deleteEntry = Array.from(menu.querySelectorAll('div')).find(node => node.textContent === 'Delete 2 column(s)');
    expect(deleteEntry).toBeTruthy();
    deleteEntry.dispatchEvent(new global.window.MouseEvent('click', { bubbles: true }));

    // After deleting cols 1..2, col1 should now contain former col3 (D0).
    expect(hot.getDataAtCell(0, 1)).toBe('D0');
  });

  test('row header context menu supports insert/delete for selected rows', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderContextMenuRowsHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
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
    capturedGridOptions.onCellContextMenu({
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
    capturedGridOptions.postSortRows({ nodes, api: { getSortModel: () => [{ colId: 'c0', sort: 'asc' }] } });

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
    capturedGridOptions.postSortRows({ nodes, api: { getSortModel: () => [{ colId: 'c0', sort: 'asc' }] } });

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
