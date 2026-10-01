'use strict';
const { setupHotAggridClipboardFixture } = require('../../test-support/hotAggridClipboardSuite');

describe('Shared.hot AG Grid clipboard + selection behaviors', () => {
  const fixture = setupHotAggridClipboardFixture();

  test('drag handle drag moves a column without affecting selection', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agHeaderDragHandleMoveHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
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

  test('fill handle stays above selection outline for non-pinned selection', async () => {
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

    const hot = fixture.createTable(
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
    row.setAttribute('row-index', '0');
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
    const outline = container.querySelector('.hot-selection-outline');
    expect(outline).toBeTruthy();
    expect(Number(handle.style.zIndex)).toBeGreaterThan(Number(outline.style.zIndex));
    expect(handle.dataset.pinnedSelection).toBeUndefined();
  });

  test('fill handle hides when selected body cell is clipped into header level', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agFillHandleHiddenAtHeaderLevelHot';
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
      { rows: 8, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-fill-handle-hidden-header-level',
        data: Shared.createEmptyData(8, 3),
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
    const row = document.createElement('div');
    row.className = 'ag-row';
    row.setAttribute('row-index', '2');
    const cell = document.createElement('div');
    cell.className = 'ag-cell';
    cell.setAttribute('col-id', 'c1');
    cell.getBoundingClientRect = () => ({
      left: 100,
      top: 34,
      right: 200,
      bottom: 63,
      width: 100,
      height: 29
    });
    row.appendChild(cell);
    bodyViewport.appendChild(row);
    container.appendChild(bodyViewport);

    const header = document.createElement('div');
    header.className = 'ag-header';
    header.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 500,
      bottom: 60,
      width: 500,
      height: 28
    });
    container.appendChild(header);

    const floatingTop = document.createElement('div');
    floatingTop.className = 'ag-floating-top';
    floatingTop.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 500,
      bottom: 60,
      width: 500,
      height: 28
    });
    container.appendChild(floatingTop);

    hot.selectCell(2, 1, 2, 1);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const handle = container.querySelector('.hot-fill-handle');
    expect(handle).toBeTruthy();
    expect(handle.style.display).toBe('none');
  });

  test('selection outline does not spill into row headers when center columns in range are hidden behind pinned first column', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agSelectionOutlinePinnedLeftHiddenCenterHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 320,
      width: 500,
      height: 320
    });

    const hot = fixture.createTable(
      container,
      { rows: 12, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-selection-outline-pinned-left-hidden-center',
        data: Shared.createEmptyData(12, 4),
        pinFirstColumn: true
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 500,
      bottom: 320,
      width: 500,
      height: 260
    });
    container.appendChild(bodyViewport);

    const pinnedLeftViewport = document.createElement('div');
    pinnedLeftViewport.className = 'ag-pinned-left-cols-viewport';
    pinnedLeftViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 156,
      bottom: 320,
      width: 156,
      height: 260
    });
    bodyViewport.appendChild(pinnedLeftViewport);

    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    // Deliberately starts at x=0 to simulate center cells geometrically present
    // under pinned-left overlay while being visually hidden.
    centerViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 500,
      bottom: 320,
      width: 500,
      height: 260
    });
    bodyViewport.appendChild(centerViewport);

    const makeCellRect = (left, top) => ({
      left,
      top,
      right: left + 100,
      bottom: top + 28,
      width: 100,
      height: 28
    });

    for(let rowIndex = 2; rowIndex <= 4; rowIndex += 1){
      const rowTop = 60 + (rowIndex * 28);

      const pinnedRow = document.createElement('div');
      pinnedRow.className = 'ag-row';
      pinnedRow.setAttribute('row-index', String(rowIndex));

      const rowHeaderCell = document.createElement('div');
      rowHeaderCell.className = 'ag-cell';
      rowHeaderCell.setAttribute('col-id', '__rowHeader');
      rowHeaderCell.getBoundingClientRect = () => ({
        left: 0,
        top: rowTop,
        right: 56,
        bottom: rowTop + 28,
        width: 56,
        height: 28
      });
      pinnedRow.appendChild(rowHeaderCell);

      const colA = document.createElement('div');
      colA.className = 'ag-cell hot-selected-cell';
      colA.setAttribute('col-id', 'c0');
      colA.setAttribute('row-index', String(rowIndex));
      colA.getBoundingClientRect = () => makeCellRect(56, rowTop);
      pinnedRow.appendChild(colA);
      pinnedLeftViewport.appendChild(pinnedRow);

      const centerRow = document.createElement('div');
      centerRow.className = 'ag-row';
      centerRow.setAttribute('row-index', String(rowIndex));

      const hiddenCenterCell = document.createElement('div');
      hiddenCenterCell.className = 'ag-cell hot-selected-cell';
      hiddenCenterCell.setAttribute('col-id', 'c1');
      hiddenCenterCell.setAttribute('row-index', String(rowIndex));
      hiddenCenterCell.getBoundingClientRect = () => makeCellRect(20, rowTop);
      centerRow.appendChild(hiddenCenterCell);

      centerViewport.appendChild(centerRow);
    }

    hot.selectCell(2, 0, 4, 1);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const outline = container.querySelector('.hot-selection-outline');
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');
    expect(outline.style.left).toBe('56px');
    expect(outline.style.borderRightColor).toBe('transparent');
  });

  test('selection outline does not spill into column headers when body rows in range are hidden behind pinned first row', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agSelectionOutlinePinnedTopHiddenBodyHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 320,
      width: 500,
      height: 320
    });

    const hot = fixture.createTable(
      container,
      { rows: 12, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-selection-outline-pinned-top-hidden-body',
        data: Shared.createEmptyData(12, 4),
        pinFirstRow: true
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 500,
      bottom: 320,
      width: 500,
      height: 288
    });
    container.appendChild(bodyViewport);

    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    centerViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 500,
      bottom: 320,
      width: 500,
      height: 288
    });
    bodyViewport.appendChild(centerViewport);

    const floatingTop = document.createElement('div');
    floatingTop.className = 'ag-floating-top';
    const floatingCenterViewport = document.createElement('div');
    floatingCenterViewport.className = 'ag-floating-top-viewport';
    floatingCenterViewport.getBoundingClientRect = () => ({
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
    const pinnedCell1 = document.createElement('div');
    pinnedCell1.className = 'ag-cell hot-selected-cell';
    pinnedCell1.setAttribute('col-id', 'c1');
    pinnedCell1.setAttribute('row-index', 't-0');
    pinnedCell1.getBoundingClientRect = () => ({
      left: 100,
      top: 32,
      right: 200,
      bottom: 60,
      width: 100,
      height: 28
    });
    const pinnedCell2 = document.createElement('div');
    pinnedCell2.className = 'ag-cell hot-selected-cell';
    pinnedCell2.setAttribute('col-id', 'c2');
    pinnedCell2.setAttribute('row-index', 't-0');
    pinnedCell2.getBoundingClientRect = () => ({
      left: 200,
      top: 32,
      right: 300,
      bottom: 60,
      width: 100,
      height: 28
    });
    pinnedRow.appendChild(pinnedCell1);
    pinnedRow.appendChild(pinnedCell2);
    floatingCenterViewport.appendChild(pinnedRow);
    floatingTop.appendChild(floatingCenterViewport);
    container.appendChild(floatingTop);

    // Simulate the body row selected in the range but fully hidden beneath the pinned row area.
    const hiddenBodyRow = document.createElement('div');
    hiddenBodyRow.className = 'ag-row';
    hiddenBodyRow.setAttribute('row-index', '1');
    const hiddenBodyCell1 = document.createElement('div');
    hiddenBodyCell1.className = 'ag-cell hot-selected-cell';
    hiddenBodyCell1.setAttribute('col-id', 'c1');
    hiddenBodyCell1.setAttribute('row-index', '1');
    hiddenBodyCell1.getBoundingClientRect = () => ({
      left: 100,
      top: 18,
      right: 200,
      bottom: 30,
      width: 100,
      height: 12
    });
    const hiddenBodyCell2 = document.createElement('div');
    hiddenBodyCell2.className = 'ag-cell hot-selected-cell';
    hiddenBodyCell2.setAttribute('col-id', 'c2');
    hiddenBodyCell2.setAttribute('row-index', '1');
    hiddenBodyCell2.getBoundingClientRect = () => ({
      left: 200,
      top: 18,
      right: 300,
      bottom: 30,
      width: 100,
      height: 12
    });
    hiddenBodyRow.appendChild(hiddenBodyCell1);
    hiddenBodyRow.appendChild(hiddenBodyCell2);
    centerViewport.appendChild(hiddenBodyRow);

    hot.selectCell(0, 1, 1, 2);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const outline = container.querySelector('.hot-selection-outline');
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');
    expect(outline.style.top).toBe('32px');
    expect(outline.style.borderTopColor).not.toBe('transparent');
  });

  test('selection outline right edge scrolls under the vertical scrollbar when a pinned top row is selected', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agSelectionOutlinePinnedTopHorizontalClipHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 420,
      bottom: 320,
      width: 420,
      height: 320
    });

    const hot = fixture.createTable(
      container,
      { rows: 8, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-selection-outline-pinned-top-horizontal-clip',
        data: Shared.createEmptyData(8, 4),
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
    let horizontalOffset = 0;
    const pinnedRow = document.createElement('div');
    pinnedRow.className = 'ag-row';
    pinnedRow.setAttribute('row-index', 't-0');
    const pinnedStartCell = document.createElement('div');
    pinnedStartCell.className = 'ag-cell hot-selected-cell';
    pinnedStartCell.setAttribute('col-id', 'c1');
    pinnedStartCell.setAttribute('row-index', 't-0');
    pinnedStartCell.getBoundingClientRect = () => ({
      left: 240 + horizontalOffset,
      top: 32,
      right: 340 + horizontalOffset,
      bottom: 60,
      width: 100,
      height: 28
    });
    const pinnedClippedCell = document.createElement('div');
    pinnedClippedCell.className = 'ag-cell hot-selected-cell';
    pinnedClippedCell.setAttribute('col-id', 'c2');
    pinnedClippedCell.setAttribute('row-index', 't-0');
    pinnedClippedCell.getBoundingClientRect = () => ({
      left: 340 + horizontalOffset,
      top: 32,
      right: 440 + horizontalOffset,
      bottom: 60,
      width: 100,
      height: 28
    });
    pinnedRow.appendChild(pinnedStartCell);
    pinnedRow.appendChild(pinnedClippedCell);
    floatingViewport.appendChild(pinnedRow);
    floatingTop.appendChild(floatingViewport);
    container.appendChild(floatingTop);

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 420,
      bottom: 320,
      width: 420,
      height: 260
    });
    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    centerViewport.getBoundingClientRect = bodyViewport.getBoundingClientRect;
    const bodyRow = document.createElement('div');
    bodyRow.className = 'ag-row';
    bodyRow.setAttribute('row-index', '3');
    const bodyStartCell = document.createElement('div');
    bodyStartCell.className = 'ag-cell hot-selected-cell';
    bodyStartCell.setAttribute('col-id', 'c1');
    bodyStartCell.setAttribute('row-index', '3');
    bodyStartCell.getBoundingClientRect = () => ({
      left: 240 + horizontalOffset,
      top: 116,
      right: 340 + horizontalOffset,
      bottom: 144,
      width: 100,
      height: 28
    });
    const bodyClippedCell = document.createElement('div');
    bodyClippedCell.className = 'ag-cell hot-selected-cell';
    bodyClippedCell.setAttribute('col-id', 'c2');
    bodyClippedCell.setAttribute('row-index', '3');
    bodyClippedCell.getBoundingClientRect = () => ({
      left: 340 + horizontalOffset,
      top: 116,
      right: 440 + horizontalOffset,
      bottom: 144,
      width: 100,
      height: 28
    });
    bodyRow.appendChild(bodyStartCell);
    bodyRow.appendChild(bodyClippedCell);
    centerViewport.appendChild(bodyRow);
    bodyViewport.appendChild(centerViewport);
    container.appendChild(bodyViewport);

    const verticalScrollbar = document.createElement('div');
    verticalScrollbar.className = 'ag-body-vertical-scroll';
    verticalScrollbar.getBoundingClientRect = () => ({
      left: 400,
      top: 60,
      right: 420,
      bottom: 320,
      width: 20,
      height: 260
    });
    container.appendChild(verticalScrollbar);

    const readOutlineRight = outline => (
      Number.parseFloat(outline.style.left || '0')
      + Number.parseFloat(outline.style.width || '0')
    );

    hot.selectCell(0, 1, 3, 2);
    await fixture.waitForNextFrame();

    const outline = container.querySelector('.hot-selection-outline');
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');
    expect(outline.style.borderRightColor).toBe('transparent');
    expect(outline.querySelector('.hot-selection-outline-edge[data-edge="right"]').style.display).toBe('none');
    expect(readOutlineRight(outline)).toBeLessThanOrEqual(400);

    horizontalOffset = -30;
    hot.selectCell(0, 1, 3, 2);
    await fixture.waitForNextFrame();

    expect(outline.querySelector('.hot-selection-outline-edge[data-edge="right"]').style.display).toBe('none');
    expect(readOutlineRight(outline)).toBeLessThanOrEqual(400);

    horizontalOffset = -50;
    hot.selectCell(0, 1, 3, 2);
    await fixture.waitForNextFrame();

    expect(outline.querySelector('.hot-selection-outline-edge[data-edge="right"]').style.display).toBe('block');
    expect(readOutlineRight(outline)).toBeLessThan(400);
  });

  test('first body row selection keeps top border visible below pinned first row', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agSelectionOutlineFirstBodyBelowPinnedTopHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 320,
      width: 500,
      height: 320
    });

    const hot = fixture.createTable(
      container,
      { rows: 8, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-selection-outline-first-body-below-pinned-top',
        data: Shared.createEmptyData(8, 4),
        pinFirstRow: true
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 500,
      bottom: 320,
      width: 500,
      height: 260
    });
    container.appendChild(bodyViewport);

    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    centerViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 500,
      bottom: 320,
      width: 500,
      height: 260
    });
    bodyViewport.appendChild(centerViewport);

    const floatingTop = document.createElement('div');
    floatingTop.className = 'ag-floating-top';
    floatingTop.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 500,
      bottom: 60,
      width: 500,
      height: 28
    });
    const floatingCenterViewport = document.createElement('div');
    floatingCenterViewport.className = 'ag-floating-top-viewport';
    floatingCenterViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 500,
      bottom: 60,
      width: 500,
      height: 28
    });
    floatingTop.appendChild(floatingCenterViewport);
    container.appendChild(floatingTop);

    const bodyRow = document.createElement('div');
    bodyRow.className = 'ag-row';
    bodyRow.setAttribute('row-index', '0');
    const bodyCell = document.createElement('div');
    bodyCell.className = 'ag-cell hot-selected-cell';
    bodyCell.setAttribute('col-id', 'c1');
    bodyCell.setAttribute('row-index', '0');
    bodyCell.getBoundingClientRect = () => ({
      left: 100,
      top: 60,
      right: 200,
      bottom: 88,
      width: 100,
      height: 28
    });
    bodyRow.appendChild(bodyCell);
    centerViewport.appendChild(bodyRow);

    hot.selectCell(1, 1, 1, 1);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const outline = container.querySelector('.hot-selection-outline');
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');
    expect(outline.style.top).toBe('60px');
    expect(outline.style.borderTopColor).not.toBe('transparent');
  });

  test('topmost pinned-first-column selected cell keeps visible top and side borders despite 1px seam clipping', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agSelectionOutlineTopPinnedFirstColumnSeamHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 320,
      width: 500,
      height: 320
    });

    const hot = fixture.createTable(
      container,
      { rows: 12, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-selection-outline-top-pinned-first-column-seam',
        data: Shared.createEmptyData(12, 4),
        pinFirstColumn: true
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 61, // 1px lower than selected top-row cell top
      right: 500,
      bottom: 320,
      width: 500,
      height: 259
    });
    container.appendChild(bodyViewport);

    const pinnedLeftViewport = document.createElement('div');
    pinnedLeftViewport.className = 'ag-pinned-left-cols-viewport';
    pinnedLeftViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 61,
      right: 156,
      bottom: 320,
      width: 156,
      height: 259
    });
    bodyViewport.appendChild(pinnedLeftViewport);

    const row = document.createElement('div');
    row.className = 'ag-row';
    row.setAttribute('row-index', '0');

    const rowHeaderCell = document.createElement('div');
    rowHeaderCell.className = 'ag-cell';
    rowHeaderCell.setAttribute('col-id', '__rowHeader');
    rowHeaderCell.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 56,
      bottom: 88,
      width: 56,
      height: 28
    });
    row.appendChild(rowHeaderCell);

    const cell = document.createElement('div');
    cell.className = 'ag-cell hot-selected-cell';
    cell.setAttribute('col-id', 'c0');
    cell.setAttribute('row-index', '0');
    cell.getBoundingClientRect = () => ({
      left: 56,
      top: 60,
      right: 156,
      bottom: 88,
      width: 100,
      height: 28
    });
    row.appendChild(cell);
    pinnedLeftViewport.appendChild(row);

    hot.selectCell(0, 0, 0, 0);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const outline = container.querySelector('.hot-selection-outline');
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');
    expect(outline.style.borderTopColor).not.toBe('transparent');
    expect(outline.style.borderLeftColor).not.toBe('transparent');
    expect(outline.style.borderRightColor).not.toBe('transparent');
  });

  test('topmost pinned-first-column selected cell keeps borders even when selected-cell class is not present yet', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agSelectionOutlineTopPinnedFirstColumnNoSelectedClassHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 500,
      bottom: 320,
      width: 500,
      height: 320
    });

    const hot = fixture.createTable(
      container,
      { rows: 12, cols: 4 },
      () => {},
      {
        debugLabel: 'ag-selection-outline-top-pinned-first-column-no-selected-class',
        data: Shared.createEmptyData(12, 4),
        pinFirstColumn: true
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 500,
      bottom: 320,
      width: 500,
      height: 260
    });
    container.appendChild(bodyViewport);

    const pinnedLeftViewport = document.createElement('div');
    pinnedLeftViewport.className = 'ag-pinned-left-cols-viewport';
    pinnedLeftViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 156,
      bottom: 320,
      width: 156,
      height: 260
    });
    bodyViewport.appendChild(pinnedLeftViewport);

    const row = document.createElement('div');
    row.className = 'ag-row';
    row.setAttribute('row-index', '0');

    const rowHeaderCell = document.createElement('div');
    rowHeaderCell.className = 'ag-cell';
    rowHeaderCell.setAttribute('col-id', '__rowHeader');
    rowHeaderCell.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 56,
      bottom: 88,
      width: 56,
      height: 28
    });
    row.appendChild(rowHeaderCell);

    const cell = document.createElement('div');
    cell.className = 'ag-cell';
    cell.setAttribute('col-id', 'c0');
    cell.setAttribute('row-index', '0');
    cell.getBoundingClientRect = () => ({
      left: 56,
      top: 60,
      right: 156,
      bottom: 88,
      width: 100,
      height: 28
    });
    row.appendChild(cell);
    pinnedLeftViewport.appendChild(row);

    hot.selectCell(0, 0, 0, 0);

    if(typeof global.window.requestAnimationFrame === 'function'){
      await new Promise(resolve => global.window.requestAnimationFrame(resolve));
    }else{
      await new Promise(resolve => setTimeout(resolve, 20));
    }

    const outline = container.querySelector('.hot-selection-outline');
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');
    expect(outline.style.borderTopColor).not.toBe('transparent');
    expect(outline.style.borderLeftColor).not.toBe('transparent');
    expect(outline.style.borderRightColor).not.toBe('transparent');
  });
});
