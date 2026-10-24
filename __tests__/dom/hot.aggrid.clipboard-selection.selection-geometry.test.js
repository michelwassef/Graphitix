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


  // Rectangles model native content coordinates. JSDOM does not composite
  // scroll layers; the browser contract covers actual clipping and movement.
  const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });
  const makeCase = (options = {}) => {
    const root = document.createElement('div');
    root.getBoundingClientRect = () => rect(0, 0, 500, 350);
    document.body.appendChild(root);
    const hot = fixture.createTable(root, { rows: 20, cols: 6 }, () => {}, {
      data: global.window.Shared.createEmptyData(20, 6),
      pinFirstRow: true,
      autoGrowth: { enabled: false },
      ...options
    });
    return { root, hot };
  };
  const addPane = (root, { pinnedTop = false, pinnedLeft = false, left = 50, top = 60, width = 1200, height = 600 } = {}) => {
    const scroll = { x: 0, y: 0 };
    const section = document.createElement('div');
    section.className = pinnedTop ? 'ag-floating-top' : 'ag-body-viewport';
    const viewport = document.createElement('div');
    viewport.className = pinnedTop ? 'ag-floating-top-viewport' : 'ag-center-cols-viewport';
    viewport.getBoundingClientRect = () => rect(left, top, pinnedLeft ? 100 : 400, pinnedTop ? 28 : 280);
    const pane = document.createElement('div');
    pane.className = pinnedTop
      ? (pinnedLeft ? 'ag-pinned-left-floating-top' : 'ag-floating-top-container')
      : (pinnedLeft ? 'ag-pinned-left-cols-container' : 'ag-center-cols-container');
    pane.getBoundingClientRect = () => rect(left - (pinnedLeft ? 0 : scroll.x), top - (pinnedTop ? 0 : scroll.y), width, height);
    Object.defineProperties(pane, { clientWidth: { get: () => width }, clientHeight: { get: () => height } });
    viewport.appendChild(pane);
    section.appendChild(viewport);
    root.appendChild(section);
    const cells = [];
    const addCell = (row, col, { selectedClass = false, cellWidth = 100 } = {}) => {
      const rowIndex = pinnedTop ? 't-' + row : String(row - 1);
      let rowNode = pane.querySelector('.ag-row[row-index="' + rowIndex + '"]');
      if (!rowNode) {
        rowNode = document.createElement('div');
        rowNode.className = 'ag-row';
        rowNode.setAttribute('row-index', rowIndex);
        pane.appendChild(rowNode);
      }
      const cell = document.createElement('div');
      cell.className = 'ag-cell' + (selectedClass ? ' hot-selected-cell' : '');
      cell.setAttribute('col-id', 'c' + col);
      cell.getBoundingClientRect = () => {
        const bounds = pane.getBoundingClientRect();
        return rect(bounds.left + col * 100, bounds.top + (pinnedTop ? row : row - 1) * 28, parseFloat(cell.style.width) || cellWidth, 28);
      };
      rowNode.appendChild(cell);
      cells.push(cell);
      return cell;
    };
    return { pane, viewport, section, scroll, addCell, cells };
  };
  const outlineIn = pane => pane.querySelector('.hot-selection-outline');
  const edge = (outline, name) => outline.querySelector('[data-edge="' + name + '"]').style.display;
  const flushMutations = async () => { await Promise.resolve(); await Promise.resolve(); };

  test('fill handle and outer border keep content offsets through native and fractional scroll reprojection', async () => {
    const { root, hot } = makeCase();
    const body = addPane(root);
    body.addCell(3, 1);
    hot.selectCell(3, 1);
    const outline = outlineIn(body.pane);
    const handle = body.pane.querySelector('.hot-fill-handle');
    expect(outline.parentElement).toBe(handle.parentElement);
    expect(outline.parentElement.parentElement).toBe(body.pane);
    expect(Number(handle.style.zIndex)).toBeGreaterThan(Number(outline.style.zIndex));
    const local = { left: outline.style.left, top: outline.style.top, handleLeft: handle.style.left, handleTop: handle.style.top };
    body.scroll.x = 71;
    body.scroll.y = 35;
    // No scroll callback, animation frame or re-render runs here.
    expect(outline.style.left).toBe(local.left);
    expect(outline.style.top).toBe(local.top);
    expect(handle.style.left).toBe(local.handleLeft);
    expect(handle.style.top).toBe(local.handleTop);
    const paneRect = body.pane.getBoundingClientRect();
    const cellRect = body.cells[0].getBoundingClientRect();
    expect(paneRect.left + parseFloat(handle.style.left)).toBe(cellRect.right);
    expect(paneRect.top + parseFloat(handle.style.top)).toBe(cellRect.bottom);
    body.scroll.x = 71.375;
    body.scroll.y = 35.625;
    body.cells[0].style.width = '100px';
    await flushMutations();
    expect(outline.style.left).toBe(local.left);
    expect(outline.style.top).toBe(local.top);
    expect(handle.style.left).toBe(local.handleLeft);
    expect(handle.style.top).toBe(local.handleTop);
  });

  test('body selections and handles inherit the body viewport clipping beneath the pinned header', () => {
    const { root, hot } = makeCase();
    const body = addPane(root);
    body.addCell(2, 1);
    hot.selectCell(2, 1);
    body.scroll.y = 57;
    const handle = body.pane.querySelector('.hot-fill-handle');
    expect(handle.closest('.ag-body-viewport')).toBe(body.section);
    expect(handle.closest('.ag-floating-top')).toBeNull();
    expect(body.pane.getBoundingClientRect().top + parseFloat(handle.style.top)).toBeLessThan(body.viewport.getBoundingClientRect().top);
    expect(outlineIn(body.pane).parentElement.className).toBe('hot-grid-selection-layer');
  });

  test('mixed pinned-column ranges render only their outer edges and cannot paint over row headers', () => {
    const { root, hot } = makeCase({ pinFirstColumn: true });
    const left = addPane(root, { pinnedLeft: true, left: 50, width: 100 });
    const center = addPane(root, { left: 150 });
    for (let row = 2; row <= 4; row++) {
      left.addCell(row, 0);
      center.addCell(row, 1);
    }
    hot.selectCell(2, 0, 4, 1);
    expect(edge(outlineIn(left.pane), 'left')).toBe('block');
    expect(edge(outlineIn(left.pane), 'right')).toBe('none');
    expect(edge(outlineIn(center.pane), 'left')).toBe('none');
    expect(edge(outlineIn(center.pane), 'right')).toBe('block');
    expect(outlineIn(left.pane).style.left).toBe('0px');
    center.scroll.x = 180;
    expect(outlineIn(center.pane).closest('.ag-center-cols-viewport')).toBe(center.viewport);
  });

  test('mixed pinned-row ranges join without a horizontal border across their pane seam', () => {
    const { root, hot } = makeCase();
    const pinned = addPane(root, { pinnedTop: true, top: 32, height: 28 });
    const body = addPane(root);
    pinned.addCell(0, 1);
    body.addCell(1, 1);
    body.addCell(2, 1);
    hot.selectCell(0, 1, 2, 1);
    expect(edge(outlineIn(pinned.pane), 'top')).toBe('block');
    expect(edge(outlineIn(pinned.pane), 'bottom')).toBe('none');
    expect(edge(outlineIn(body.pane), 'top')).toBe('none');
    expect(edge(outlineIn(body.pane), 'bottom')).toBe('block');
    body.scroll.y = 80;
    expect(outlineIn(pinned.pane).style.top).toBe('0px');
    expect(outlineIn(body.pane).closest('.ag-body-viewport')).toBe(body.section);
  });

  test('pinned-row right edges remain in horizontally scrolling content and beneath native scrollbar clipping', () => {
    const { root, hot } = makeCase();
    const pinned = addPane(root, { pinnedTop: true, top: 32, height: 28 });
    pinned.addCell(0, 1);
    pinned.addCell(0, 2);
    hot.selectCell(0, 1, 0, 2);
    const outline = outlineIn(pinned.pane);
    const localRight = parseFloat(outline.style.left) + parseFloat(outline.style.width);
    pinned.scroll.x = 36;
    expect(outline.parentElement.parentElement).toBe(pinned.pane);
    expect(parseFloat(outline.style.left) + parseFloat(outline.style.width)).toBe(localRight);
    expect(edge(outline, 'right')).toBe('block');
    expect(outline.closest('.ag-floating-top-viewport')).toBe(pinned.viewport);
  });

  test('first body row selection keeps its top border inside the first body cell', () => {
    const { root, hot } = makeCase();
    const body = addPane(root);
    body.addCell(1, 1);
    hot.selectCell(1, 1);
    const outline = outlineIn(body.pane);
    expect(outline.style.top).toBe('0px');
    expect(edge(outline, 'top')).toBe('block');
  });

  test('single-cell selection resolves its target without scanning every rendered cell', () => {
    const { root, hot } = makeCase();
    const body = addPane(root);
    body.addCell(3, 1);
    const querySelectorAll = root.querySelectorAll.bind(root);
    const selectors = [];
    const queryAllSpy = jest.spyOn(root, 'querySelectorAll').mockImplementation(selector => {
      selectors.push(selector);
      return querySelectorAll(selector);
    });

    hot.selectCell(3, 1);

    expect(selectors).not.toContain('.ag-cell');
    expect(outlineIn(body.pane).style.display).toBe('block');
    queryAllSpy.mockRestore();
  });

  for (const selectedClass of [false, true]) {
    test('pinned first-column seam borders do not depend on selected-cell classes: ' + selectedClass, () => {
      const { root, hot } = makeCase({ pinFirstColumn: true });
      const left = addPane(root, { pinnedLeft: true, width: 100 });
      left.addCell(1, 0, { selectedClass });
      hot.selectCell(1, 0);
      const outline = outlineIn(left.pane);
      expect(outline.style.left).toBe('0px');
      expect(outline.style.top).toBe('0px');
      for (const side of ['top', 'bottom', 'left', 'right']) expect(edge(outline, side)).toBe('block');
    });
  }

  test('virtualized cells and recycled row indices update native borders before the next frame', async () => {
    const { root, hot } = makeCase();
    const body = addPane(root);
    const first = body.addCell(3, 1);
    hot.selectCell(3, 1, 5, 1);
    expect(edge(outlineIn(body.pane), 'bottom')).toBe('none');
    const last = body.addCell(5, 1);
    await flushMutations();
    expect(edge(outlineIn(body.pane), 'bottom')).toBe('block');
    last.closest('.ag-row').setAttribute('row-index', '5');
    await flushMutations();
    expect(edge(outlineIn(body.pane), 'bottom')).toBe('none');
    first.closest('.ag-row').remove();
    await flushMutations();
    expect(outlineIn(body.pane)).toBeNull();
  });

  test('whole-column selection uses native child-column bounds independently of pinned-header scroll timing', async () => {
    const { root, hot } = makeCase();
    const top = addPane(root, { pinnedTop: true, top: 32, height: 28 });
    const body = addPane(root);
    top.addCell(0, 1, { cellWidth: 300 });
    const bodyCell = body.addCell(1, 1);
    const lastRow = hot.countRows() - 1;
    body.addCell(lastRow, 1);
    hot.selectCell(0, 1, lastRow, 1);
    expect(parseFloat(outlineIn(top.pane).style.width)).toBeLessThan(110);
    expect(edge(outlineIn(top.pane), 'top')).toBe('none');
    expect(edge(outlineIn(body.pane), 'top')).toBe('none');
    const left = outlineIn(top.pane).style.left;
    body.scroll.x = 37.25;
    bodyCell.style.width = '100px';
    await flushMutations();
    expect(outlineIn(top.pane).style.left).toBe(left);
    top.scroll.x = 37.25;
    expect(outlineIn(top.pane).style.left).toBe(left);
  });

  test('virtualized columns and column resizing update the real outer edge and corner handle before painting', async () => {
    const { root, hot } = makeCase();
    const body = addPane(root);
    body.addCell(2, 1);
    hot.selectCell(2, 1, 2, 2);
    expect(edge(outlineIn(body.pane), 'right')).toBe('none');
    const last = body.addCell(2, 2);
    await flushMutations();
    expect(edge(outlineIn(body.pane), 'right')).toBe('block');
    expect(outlineIn(body.pane).style.width).toBe('202px');
    last.style.width = '140px';
    await flushMutations();
    expect(outlineIn(body.pane).style.width).toBe('242px');
    expect(body.pane.querySelector('.hot-fill-handle').style.left).toBe('340px');
  });

  test('whole-column ranges retain their final edge when a merged header omits selected child cells', () => {
    const { root, hot } = makeCase();
    const top = addPane(root, { pinnedTop: true, top: 32, height: 28 });
    const body = addPane(root);
    top.addCell(0, 1, { cellWidth: 300 });
    body.addCell(1, 1);
    body.addCell(1, 2);
    const last = hot.countRows() - 1;
    body.addCell(last, 1);
    body.addCell(last, 2);
    hot.selectCell(0, 1, last, 2);
    expect(outlineIn(top.pane).style.width).toBe('202px');
    expect(edge(outlineIn(top.pane), 'right')).toBe('block');
    expect(edge(outlineIn(top.pane), 'bottom')).toBe('none');
  });

  test('clipboard borders share native panes, suppress duplicate green chrome and clear without leaving stale fragments', () => {
    const { root, hot } = makeCase();
    const top = addPane(root, { pinnedTop: true, top: 32, height: 28 });
    const body = addPane(root);
    top.addCell(0, 1);
    body.addCell(1, 1);
    hot.selectCell(0, 1, 1, 1);
    hot.__hotSetClipboardOutlineState({ mode: 'copy', ranges: [{ from: { row: 0, col: 1 }, to: { row: 1, col: 1 } }], clipboardText: 'test' }, 'native-test');
    expect(root.querySelector('.hot-selection-outline')).toBeNull();
    const pinned = top.pane.querySelector('.hot-clipboard-outline');
    const scrolling = body.pane.querySelector('.hot-clipboard-outline');
    expect(edge(pinned, 'bottom')).toBe('none');
    expect(edge(scrolling, 'top')).toBe('none');
    const localTop = scrolling.style.top;
    body.scroll.y = 16;
    expect(scrolling.style.top).toBe(localTop);
    hot.__hotClearClipboardOutline('native-test-clear');
    expect(root.querySelector('.hot-clipboard-outline')).toBeNull();
    expect(outlineIn(top.pane)).toBeTruthy();
    expect(outlineIn(body.pane)).toBeTruthy();
  });

  test('native decoration observers and scheduled updates belong to their table and are removed on destroy', async () => {
    const first = makeCase();
    const second = makeCase();
    const a = addPane(first.root);
    const b = addPane(second.root);
    a.addCell(2, 1);
    b.addCell(2, 1);
    first.hot.selectCell(2, 1);
    second.hot.selectCell(2, 1);
    const secondOutline = outlineIn(b.pane);
    first.hot.destroy();
    a.addCell(3, 1);
    await flushMutations();
    expect(first.root.querySelector('.hot-grid-selection-layer')).toBeNull();
    expect(outlineIn(b.pane)).toBe(secondOutline);
    expect(secondOutline.style.display).toBe('block');
  });
});
