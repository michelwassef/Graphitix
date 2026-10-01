'use strict';
const { setupHotAggridClipboardFixture } = require('../../test-support/hotAggridClipboardSuite');

describe('Shared.hot AG Grid clipboard + selection behaviors', () => {
  const fixture = setupHotAggridClipboardFixture();

  test('Delete clears additive selected header columns', () => {
    const container = document.createElement('div');
    container.id = 'agDeleteHeaderColumnsHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-delete-header-columns',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1'],
          ['A2', 'B2', 'C2'],
          ['A3', 'B3', 'C3']
        ]
      }
    );

    const header0 = document.createElement('div');
    header0.className = 'ag-header-cell';
    header0.setAttribute('col-id', 'c0');
    container.appendChild(header0);
    const header2 = document.createElement('div');
    header2.className = 'ag-header-cell';
    header2.setAttribute('col-id', 'c2');
    container.appendChild(header2);

    header0.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    header2.dispatchEvent(new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true
    }));

    const activeTarget = document.activeElement || container;
    activeTarget.dispatchEvent(new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'Delete',
      keyCode: 46
    }));

    expect(hot.getDataAtCell(0, 0)).toBe('');
    expect(hot.getDataAtCell(1, 0)).toBe('');
    expect(hot.getDataAtCell(0, 2)).toBe('');
    expect(hot.getDataAtCell(1, 2)).toBe('');
    expect(hot.getDataAtCell(0, 1)).toBe('B0');
    expect(hot.getDataAtCell(1, 1)).toBe('B1');
  });

  test('Ctrl+C copies additive selected header columns only', async () => {
    const container = document.createElement('div');
    container.id = 'agCopyHeaderColumnsHot';
    document.body.appendChild(container);

    const writeText = jest.fn(async () => {});
    global.window.navigator.clipboard = { writeText };

    fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-copy-header-columns',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1'],
          ['A2', 'B2', 'C2'],
          ['A3', 'B3', 'C3']
        ]
      }
    );

    const header0 = document.createElement('div');
    header0.className = 'ag-header-cell';
    header0.setAttribute('col-id', 'c0');
    container.appendChild(header0);
    const header2 = document.createElement('div');
    header2.className = 'ag-header-cell';
    header2.setAttribute('col-id', 'c2');
    container.appendChild(header2);

    header0.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    header2.dispatchEvent(new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true
    }));

    const activeTarget = document.activeElement || container;
    activeTarget.dispatchEvent(new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      ctrlKey: true
    }));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe('A0\tC0\nA1\tC1\nA2\tC2\nA3\tC3');
  });

  test('Ctrl+X cuts additive selected header columns only', async () => {
    const container = document.createElement('div');
    container.id = 'agCutHeaderColumnsHot';
    document.body.appendChild(container);

    const writeText = jest.fn(async () => {});
    global.window.navigator.clipboard = { writeText };

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-cut-header-columns',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1'],
          ['A2', 'B2', 'C2'],
          ['A3', 'B3', 'C3']
        ]
      }
    );

    const header0 = document.createElement('div');
    header0.className = 'ag-header-cell';
    header0.setAttribute('col-id', 'c0');
    container.appendChild(header0);
    const header2 = document.createElement('div');
    header2.className = 'ag-header-cell';
    header2.setAttribute('col-id', 'c2');
    container.appendChild(header2);

    header0.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    header2.dispatchEvent(new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true
    }));

    const activeTarget = document.activeElement || container;
    activeTarget.dispatchEvent(new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'x',
      ctrlKey: true
    }));

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toBe('A0\tC0\nA1\tC1\nA2\tC2\nA3\tC3');
    expect(hot.getDataAtCell(0, 0)).toBe('');
    expect(hot.getDataAtCell(1, 0)).toBe('');
    expect(hot.getDataAtCell(0, 2)).toBe('');
    expect(hot.getDataAtCell(1, 2)).toBe('');
    expect(hot.getDataAtCell(0, 1)).toBe('B0');
    expect(hot.getDataAtCell(1, 1)).toBe('B1');
  });

  test('Ctrl+C copies non-contiguous rows selected through row headers', async () => {
    const container = document.createElement('div');
    container.id = 'agCopyHeaderRowsHot';
    document.body.appendChild(container);
    const writeText = jest.fn(async () => {});
    global.window.navigator.clipboard = { writeText };

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-copy-header-rows',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1'],
          ['A2', 'B2', 'C2'],
          ['A3', 'B3', 'C3']
        ]
      }
    );

    const createRowHeader = rowIndex => {
      const row = document.createElement('div');
      row.className = 'ag-row';
      row.setAttribute('row-index', String(rowIndex));
      const cell = document.createElement('div');
      cell.className = 'ag-cell hot-row-header';
      cell.setAttribute('col-id', '__rowHeader');
      row.appendChild(cell);
      container.appendChild(row);
      return cell;
    };
    createRowHeader(0).dispatchEvent(new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true
    }));
    createRowHeader(2).dispatchEvent(new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true
    }));
    // AG Grid may emit a selection-changed event after its own mouse handling.
    // That event must not replace the adapter-owned additive row selection.
    fixture.capturedGridOptions.onSelectionChanged({ api: fixture.capturedApi });

    container.blur();
    const keyboardTarget = document.activeElement === container ? document.body : document.activeElement;
    const copyEvent = new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      ctrlKey: true
    });
    (keyboardTarget || document.body).dispatchEvent(copyEvent);

    expect(copyEvent.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    await new Promise(resolve => setTimeout(resolve, 0));

    const padRow = values => values.concat(Array(Math.max(0, hot.countCols() - values.length)).fill('')).join('\t');
    expect(writeText).toHaveBeenCalledWith(`${padRow(['A0', 'B0', 'C0'])}\n${padRow(['A2', 'B2', 'C2'])}`);
  });

  test('multi-row clipboard output follows the current sorted display order', async () => {
    const container = document.createElement('div');
    container.id = 'agCopySortedHeaderRowsHot';
    document.body.appendChild(container);
    const writeText = jest.fn(async () => {});
    global.window.navigator.clipboard = { writeText };

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-copy-sorted-header-rows',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1'],
          ['A2', 'B2', 'C2'],
          ['A3', 'B3', 'C3']
        ]
      }
    );
    const displayedPhysicalRows = [2, 0, 3, 1];
    fixture.capturedApi.getDisplayedRowCount = jest.fn(() => displayedPhysicalRows.length);
    fixture.capturedApi.getDisplayedRowAtIndex = jest.fn(index => ({
      data: { __rowIndex: displayedPhysicalRows[index] }
    }));

    const selectDisplayedRow = visualRow => {
      const row = document.createElement('div');
      row.className = 'ag-row';
      row.setAttribute('row-index', String(visualRow));
      const cell = document.createElement('div');
      cell.className = 'ag-cell hot-row-header';
      cell.setAttribute('col-id', '__rowHeader');
      row.appendChild(cell);
      container.appendChild(row);
      cell.dispatchEvent(new global.window.MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        ctrlKey: true
      }));
    };
    selectDisplayedRow(0);
    selectDisplayedRow(3);

    container.dispatchEvent(new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      ctrlKey: true
    }));
    await new Promise(resolve => setTimeout(resolve, 0));

    const padRow = values => values.concat(Array(Math.max(0, hot.countCols() - values.length)).fill('')).join('\t');
    expect(writeText).toHaveBeenCalledWith(`${padRow(['A2', 'B2', 'C2'])}\n${padRow(['A1', 'B1', 'C1'])}`);
  });

  test('Ctrl+X clears every non-contiguous row selected through row headers', async () => {
    const container = document.createElement('div');
    container.id = 'agCutHeaderRowsHot';
    document.body.appendChild(container);
    const writeText = jest.fn(async () => {});
    global.window.navigator.clipboard = { writeText };

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-cut-header-rows',
        data: [
          ['A0', 'B0', 'C0'],
          ['A1', 'B1', 'C1'],
          ['A2', 'B2', 'C2'],
          ['A3', 'B3', 'C3']
        ]
      }
    );

    const selectRow = rowIndex => {
      const row = document.createElement('div');
      row.className = 'ag-row';
      row.setAttribute('row-index', String(rowIndex));
      const cell = document.createElement('div');
      cell.className = 'ag-cell hot-row-header';
      cell.setAttribute('col-id', '__rowHeader');
      row.appendChild(cell);
      container.appendChild(row);
      cell.dispatchEvent(new global.window.MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        ctrlKey: true
      }));
    };
    selectRow(1);
    selectRow(3);
    fixture.capturedGridOptions.onSelectionChanged({ api: fixture.capturedApi });

    container.blur();
    const keyboardTarget = document.activeElement === container ? document.body : document.activeElement;
    const cutEvent = new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'x',
      ctrlKey: true
    });
    (keyboardTarget || document.body).dispatchEvent(cutEvent);

    expect(cutEvent.defaultPrevented).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(hot.getDataAtCell(0, 0)).toBe('A0');
    expect(hot.getDataAtCell(2, 2)).toBe('C2');
    for(const rowIndex of [1, 3]){
      for(let col = 0; col < hot.countCols(); col += 1){
        expect(hot.getDataAtCell(rowIndex, col)).toBe('');
      }
    }
  });

  test('document-level clipboard routing stops after an outside pointer interaction', async () => {
    const container = document.createElement('div');
    container.id = 'agClipboardOutsideInteractionHot';
    const outsideButton = document.createElement('button');
    outsideButton.type = 'button';
    outsideButton.textContent = 'Outside';
    document.body.append(container, outsideButton);
    const writeText = jest.fn(async () => {});
    global.window.navigator.clipboard = { writeText };

    fixture.createTable(
      container,
      { rows: 3, cols: 2 },
      () => {},
      {
        debugLabel: 'ag-clipboard-outside-interaction',
        data: [
          ['A0', 'B0'],
          ['A1', 'B1'],
          ['A2', 'B2']
        ]
      }
    );

    const row = document.createElement('div');
    row.className = 'ag-row';
    row.setAttribute('row-index', '1');
    const rowHeader = document.createElement('div');
    rowHeader.className = 'ag-cell hot-row-header';
    rowHeader.setAttribute('col-id', '__rowHeader');
    row.appendChild(rowHeader);
    container.appendChild(row);
    rowHeader.dispatchEvent(new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true
    }));

    outsideButton.dispatchEvent(new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0
    }));
    outsideButton.focus();
    const copyEvent = new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      ctrlKey: true
    });
    outsideButton.dispatchEvent(copyEvent);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(copyEvent.defaultPrevented).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  test('double-clicking one separator auto-sizes every titled column when all titled columns are selected', async () => {
    const container = document.createElement('div');
    container.id = 'agAutosizeAllSelectedColumnsHot';
    document.body.appendChild(container);
    fixture.capturedApi.autoSizeColumns = jest.fn();
    fixture.capturedApi.ensureColumnVisible = jest.fn(colId => {
      const cell = document.createElement('div');
      cell.className = 'ag-cell';
      cell.setAttribute('col-id', colId);
      container.appendChild(cell);
    });

    const hot = fixture.createTable(
      container,
      { rows: 3, cols: 5 },
      () => {},
      {
        debugLabel: 'ag-autosize-all-selected-columns',
        pinFirstRow: true,
        data: [
          ['A very long pinned title', 'B', 'C', '', ''],
          [1, 2, 3, null, null],
          [4, 5, 6, null, null]
        ]
      }
    );
    hot.selectCell(0, 0, hot.countRows() - 1, 1);

    fixture.capturedGridOptions.onColumnResized({
      api: fixture.capturedApi,
      finished: true,
      source: 'uiColumnResized'
    });
    expect(fixture.capturedApi.autoSizeColumns).not.toHaveBeenCalled();

    const header = document.createElement('div');
    header.className = 'ag-header-cell';
    header.setAttribute('col-id', 'c0');
    const separator = document.createElement('div');
    separator.className = 'ag-header-cell-resize';
    header.appendChild(separator);
    container.appendChild(header);
    separator.dispatchEvent(new global.window.MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      button: 0
    }));
    expect(fixture.capturedApi.autoSizeColumns).not.toHaveBeenCalled();

    container.dispatchEvent(new global.window.KeyboardEvent('keydown', {
      key: 'a',
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    }));
    expect(hot.getSelectedLast()).toEqual([
      0,
      0,
      hot.countRows() - 1,
      hot.countCols() - 1
    ]);
    separator.dispatchEvent(new global.window.MouseEvent('dblclick', {
      bubbles: true,
      cancelable: true,
      button: 0
    }));

    await fixture.waitForNextFrame();
    await fixture.waitForNextFrame();
    await fixture.waitForNextFrame();
    await fixture.waitForNextFrame();
    const autosizedIds = fixture.capturedApi.autoSizeColumns.mock.calls
      .flatMap(call=>call[0]);
    expect(new Set(autosizedIds)).toEqual(new Set(['c0', 'c1', 'c2']));
    expect(fixture.capturedApi.ensureColumnVisible).toHaveBeenCalledWith('c1', 'middle');
    expect(fixture.capturedApi.ensureColumnVisible).toHaveBeenCalledWith('c2', 'middle');
  });

  test('paste writes into all additive selected header columns', () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteHeaderColumnsHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-paste-header-columns',
        data: Shared.createEmptyData(4, 3)
      }
    );

    const header0 = document.createElement('div');
    header0.className = 'ag-header-cell';
    header0.setAttribute('col-id', 'c0');
    container.appendChild(header0);
    const header2 = document.createElement('div');
    header2.className = 'ag-header-cell';
    header2.setAttribute('col-id', 'c2');
    container.appendChild(header2);

    header0.dispatchEvent(new global.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    header2.dispatchEvent(new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true
    }));

    const activeTarget = document.activeElement || container;
    const pasteEvent = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvent.clipboardData = { getData: () => 'X\tY\nM\tN' };
    activeTarget.dispatchEvent(pasteEvent);

    expect(hot.getDataAtCell(0, 0)).toBe('X');
    expect(hot.getDataAtCell(0, 2)).toBe('Y');
    expect(hot.getDataAtCell(1, 0)).toBe('M');
    expect(hot.getDataAtCell(1, 2)).toBe('N');
    expect(hot.getDataAtCell(0, 1)).toBe('');
    expect(hot.getDataAtCell(1, 1)).toBe('');
  });

  test('Delete clears all selected cells', () => {
    const container = document.createElement('div');
    container.id = 'agDeleteSelectionHot';
    document.body.appendChild(container);

    const hot = fixture.createTable(
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

  test('copy outline follows copied cells while scrolling', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agCopyOutlineScrollHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 420,
      bottom: 260,
      width: 420,
      height: 260
    });

    global.window.navigator.clipboard = {
      writeText: jest.fn(async () => {})
    };

    const hot = fixture.createTable(
      container,
      { rows: 6, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-copy-outline-scroll',
        data: Shared.createEmptyData(6, 3)
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 60,
      right: 420,
      bottom: 260,
      width: 420,
      height: 200
    });
    container.appendChild(bodyViewport);

    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    centerViewport.getBoundingClientRect = bodyViewport.getBoundingClientRect;
    bodyViewport.appendChild(centerViewport);

    let verticalOffset = 0;
    const makeRect = (left, top) => ({
      left,
      top: top + verticalOffset,
      right: left + 100,
      bottom: top + verticalOffset + 28,
      width: 100,
      height: 28
    });

    const row = document.createElement('div');
    row.className = 'ag-row';
    row.setAttribute('row-index', '2');
    const cellA = document.createElement('div');
    cellA.className = 'ag-cell hot-selected-cell';
    cellA.setAttribute('col-id', 'c0');
    cellA.setAttribute('row-index', '2');
    cellA.getBoundingClientRect = () => makeRect(60, 116);
    row.appendChild(cellA);
    const cellB = document.createElement('div');
    cellB.className = 'ag-cell hot-selected-cell';
    cellB.setAttribute('col-id', 'c1');
    cellB.setAttribute('row-index', '2');
    cellB.getBoundingClientRect = () => makeRect(160, 116);
    row.appendChild(cellB);
    centerViewport.appendChild(row);

    fixture.capturedGridOptions?.onFirstDataRendered?.();

    hot.selectCell(2, 0, 2, 1);

    const copyEvt = new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      ctrlKey: true
    });
    container.dispatchEvent(copyEvt);
    await fixture.waitForNextFrame();

    const outline = container.querySelector('.hot-clipboard-outline');
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');
    expect(outline.style.left).toBe('59px');
    expect(outline.style.top).toBe('115px');
    const selectionOutline = container.querySelector('.hot-selection-outline');
    if (selectionOutline) {
      expect(selectionOutline.style.display).toBe('none');
    }

    verticalOffset = 56;
    bodyViewport.dispatchEvent(new global.window.Event('scroll', { bubbles: true }));
    await fixture.waitForNextFrame();

    expect(outline.style.top).toBe('171px');
  });

  test('cut keeps clipboard outline visible until paste clears it', async () => {
    const container = document.createElement('div');
    container.id = 'agCutOutlineHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 320,
      bottom: 220,
      width: 320,
      height: 220
    });

    let clipboardText = '';
    global.window.navigator.clipboard = {
      writeText: jest.fn(async text => {
        clipboardText = text;
      })
    };

    const hot = fixture.createTable(
      container,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-cut-outline',
        data: [
          ['H1', 'H2', 'H3'],
          ['A', '', ''],
          ['', '', ''],
          ['', '', '']
        ]
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 320,
      bottom: 220,
      width: 320,
      height: 188
    });
    container.appendChild(bodyViewport);

    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    centerViewport.getBoundingClientRect = bodyViewport.getBoundingClientRect;
    bodyViewport.appendChild(centerViewport);

    const row = document.createElement('div');
    row.className = 'ag-row';
    row.setAttribute('row-index', '1');
    const cell = document.createElement('div');
    cell.className = 'ag-cell hot-selected-cell';
    cell.setAttribute('col-id', 'c0');
    cell.setAttribute('row-index', '1');
    cell.getBoundingClientRect = () => ({
      left: 60,
      top: 60,
      right: 160,
      bottom: 88,
      width: 100,
      height: 28
    });
    row.appendChild(cell);
    centerViewport.appendChild(row);

    fixture.capturedGridOptions?.onFirstDataRendered?.();

    hot.selectCell(1, 0);

    const cutEvt = new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'x',
      ctrlKey: true
    });
    container.dispatchEvent(cutEvt);
    await fixture.waitForNextFrame();

    const outline = container.querySelector('.hot-clipboard-outline');
    expect(clipboardText.trim()).toBe('A');
    expect(hot.getDataAtCell(1, 0)).toBe('');
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');

    const pasteEvt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvt.clipboardData = { getData: () => clipboardText };
    container.dispatchEvent(pasteEvt);
    await fixture.waitForNextFrame();

    expect(outline.style.display).toBe('none');
  });

  test('paste into another AG Grid clears the original clipboard outline', async () => {
    const Shared = global.window.Shared;
    const sourceContainer = document.createElement('div');
    sourceContainer.id = 'agCopySourceHot';
    document.body.appendChild(sourceContainer);

    sourceContainer.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 320,
      bottom: 220,
      width: 320,
      height: 220
    });

    let clipboardText = '';
    global.window.navigator.clipboard = {
      writeText: jest.fn(async text => {
        clipboardText = text;
      })
    };

    const sourceHot = fixture.createTable(
      sourceContainer,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-copy-source',
        data: [
          ['H1', 'H2', 'H3'],
          ['A', '', ''],
          ['', '', ''],
          ['', '', '']
        ]
      }
    );

    const sourceBodyViewport = document.createElement('div');
    sourceBodyViewport.className = 'ag-body-viewport';
    sourceBodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 320,
      bottom: 220,
      width: 320,
      height: 188
    });
    sourceContainer.appendChild(sourceBodyViewport);

    const sourceCenterViewport = document.createElement('div');
    sourceCenterViewport.className = 'ag-center-cols-viewport';
    sourceCenterViewport.getBoundingClientRect = sourceBodyViewport.getBoundingClientRect;
    sourceBodyViewport.appendChild(sourceCenterViewport);

    const sourceRow = document.createElement('div');
    sourceRow.className = 'ag-row';
    sourceRow.setAttribute('row-index', '1');
    const sourceCell = document.createElement('div');
    sourceCell.className = 'ag-cell hot-selected-cell';
    sourceCell.setAttribute('col-id', 'c0');
    sourceCell.setAttribute('row-index', '1');
    sourceCell.getBoundingClientRect = () => ({
      left: 60,
      top: 60,
      right: 160,
      bottom: 88,
      width: 100,
      height: 28
    });
    sourceRow.appendChild(sourceCell);
    sourceCenterViewport.appendChild(sourceRow);

    fixture.capturedGridOptions?.onFirstDataRendered?.();

    sourceHot.selectCell(1, 0);
    const copyEvt = new global.window.KeyboardEvent('keydown', {
      bubbles: true,
      cancelable: true,
      key: 'c',
      ctrlKey: true
    });
    sourceContainer.dispatchEvent(copyEvt);
    await fixture.waitForNextFrame();

    const outline = sourceContainer.querySelector('.hot-clipboard-outline');
    expect(clipboardText.trim()).toBe('A');
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');

    const targetContainer = document.createElement('div');
    targetContainer.id = 'agCopyTargetHot';
    document.body.appendChild(targetContainer);

    const targetHot = fixture.createTable(
      targetContainer,
      { rows: 4, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-copy-target',
        data: Shared.createEmptyData(4, 3)
      }
    );

    targetHot.selectCell(0, 0);

    const pasteEvt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvt.clipboardData = { getData: () => clipboardText };
    targetContainer.dispatchEvent(pasteEvt);
    await fixture.waitForNextFrame();

    expect(targetHot.getDataAtCell(0, 0)).toBe('A');
    expect(outline.style.display).toBe('none');
  });

  test('paste selects the full pasted block with live selection chrome', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteSelectionBlockHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 420,
      bottom: 260,
      width: 420,
      height: 260
    });

    const hot = fixture.createTable(
      container,
      { rows: 5, cols: 5 },
      () => {},
      {
        debugLabel: 'ag-paste-selection-block',
        data: Shared.createEmptyData(5, 5)
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 420,
      bottom: 260,
      width: 420,
      height: 228
    });
    container.appendChild(bodyViewport);

    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    centerViewport.getBoundingClientRect = bodyViewport.getBoundingClientRect;
    bodyViewport.appendChild(centerViewport);

    const makeCellRect = (left, top) => ({
      left,
      top,
      right: left + 100,
      bottom: top + 28,
      width: 100,
      height: 28
    });

    for (let rowIndex = 1; rowIndex <= 2; rowIndex += 1) {
      const row = document.createElement('div');
      row.className = 'ag-row';
      row.setAttribute('row-index', String(rowIndex));
      const rowTop = 32 + (rowIndex * 28);
      for (let colIndex = 1; colIndex <= 2; colIndex += 1) {
        const cell = document.createElement('div');
        cell.className = 'ag-cell hot-selected-cell';
        cell.setAttribute('col-id', `c${colIndex}`);
        cell.setAttribute('row-index', String(rowIndex));
        cell.getBoundingClientRect = () => makeCellRect(60 + ((colIndex - 1) * 100), rowTop);
        row.appendChild(cell);
      }
      centerViewport.appendChild(row);
    }

    fixture.capturedGridOptions?.onFirstDataRendered?.();

    hot.selectCell(1, 1);
    const pasteEvt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvt.clipboardData = { getData: () => 'A\tB\nC\tD' };
    container.dispatchEvent(pasteEvt);
    await fixture.waitForNextFrame();

    expect(hot.getSelectedLast()).toEqual([1, 1, 2, 2]);
    const outline = container.querySelector('.hot-selection-outline');
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');
    expect(outline.style.left).toBe('59px');
    expect(outline.style.top).toBe('59px');
    expect(outline.style.width).toBe('202px');
    expect(outline.style.height).toBe('58px');
    const clipboardOutline = container.querySelector('.hot-clipboard-outline');
    if (clipboardOutline) {
      expect(clipboardOutline.style.display).toBe('none');
    }
  });

  test('paste keeps full pasted block selected even if AG sync reports only the anchor cell', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteSelectionStabilizedHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 420,
      bottom: 260,
      width: 420,
      height: 260
    });

    const hot = fixture.createTable(
      container,
      { rows: 5, cols: 5 },
      () => {},
      {
        debugLabel: 'ag-paste-selection-stabilized',
        data: Shared.createEmptyData(5, 5)
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 420,
      bottom: 260,
      width: 420,
      height: 228
    });
    container.appendChild(bodyViewport);

    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    centerViewport.getBoundingClientRect = bodyViewport.getBoundingClientRect;
    bodyViewport.appendChild(centerViewport);

    const makeCellRect = (left, top) => ({
      left,
      top,
      right: left + 100,
      bottom: top + 28,
      width: 100,
      height: 28
    });

    for (let rowIndex = 1; rowIndex <= 2; rowIndex += 1) {
      const row = document.createElement('div');
      row.className = 'ag-row';
      row.setAttribute('row-index', String(rowIndex));
      const rowTop = 32 + (rowIndex * 28);
      for (let colIndex = 1; colIndex <= 2; colIndex += 1) {
        const cell = document.createElement('div');
        cell.className = 'ag-cell hot-selected-cell';
        cell.setAttribute('col-id', `c${colIndex}`);
        cell.setAttribute('row-index', String(rowIndex));
        cell.getBoundingClientRect = () => makeCellRect(60 + ((colIndex - 1) * 100), rowTop);
        row.appendChild(cell);
      }
      centerViewport.appendChild(row);
    }

    fixture.capturedGridOptions?.onFirstDataRendered?.();
    hot.selectCell(1, 1);

    fixture.capturedApi.getFocusedCell = jest.fn(() => ({
      rowIndex: 1,
      column: { getColId: () => 'c1' }
    }));

    const pasteEvt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvt.clipboardData = { getData: () => 'A\tB\nC\tD' };
    container.dispatchEvent(pasteEvt);

    fixture.capturedGridOptions?.onSelectionChanged?.({ api: fixture.capturedApi });

    for (let i = 0; i < 3; i += 1) {
      await fixture.waitForNextFrame();
    }

    expect(hot.getSelectedLast()).toEqual([1, 1, 2, 2]);
    const outline = container.querySelector('.hot-selection-outline');
    expect(outline).toBeTruthy();
    expect(outline.style.display).toBe('block');
    expect(outline.style.width).toBe('202px');
    expect(outline.style.height).toBe('58px');
  });

  test('paste selection lock ignores repeated anchor-only syncs until user makes a new selection', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteSelectionLockHot';
    document.body.appendChild(container);

    container.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      right: 420,
      bottom: 260,
      width: 420,
      height: 260
    });

    const hot = fixture.createTable(
      container,
      { rows: 5, cols: 5 },
      () => {},
      {
        debugLabel: 'ag-paste-selection-lock',
        data: Shared.createEmptyData(5, 5)
      }
    );

    const bodyViewport = document.createElement('div');
    bodyViewport.className = 'ag-body-viewport';
    bodyViewport.getBoundingClientRect = () => ({
      left: 0,
      top: 32,
      right: 420,
      bottom: 260,
      width: 420,
      height: 228
    });
    container.appendChild(bodyViewport);

    const centerViewport = document.createElement('div');
    centerViewport.className = 'ag-center-cols-viewport';
    centerViewport.getBoundingClientRect = bodyViewport.getBoundingClientRect;
    bodyViewport.appendChild(centerViewport);

    const makeCellRect = (left, top) => ({
      left,
      top,
      right: left + 100,
      bottom: top + 28,
      width: 100,
      height: 28
    });

    for (let rowIndex = 1; rowIndex <= 2; rowIndex += 1) {
      const row = document.createElement('div');
      row.className = 'ag-row';
      row.setAttribute('row-index', String(rowIndex));
      const rowTop = 32 + (rowIndex * 28);
      for (let colIndex = 1; colIndex <= 2; colIndex += 1) {
        const cell = document.createElement('div');
        cell.className = 'ag-cell hot-selected-cell';
        cell.setAttribute('col-id', `c${colIndex}`);
        cell.setAttribute('row-index', String(rowIndex));
        cell.getBoundingClientRect = () => makeCellRect(60 + ((colIndex - 1) * 100), rowTop);
        row.appendChild(cell);
      }
      centerViewport.appendChild(row);
    }

    fixture.capturedGridOptions?.onFirstDataRendered?.();
    hot.selectCell(1, 1);

    fixture.capturedApi.getFocusedCell = jest.fn(() => ({
      rowIndex: 1,
      column: { getColId: () => 'c1' }
    }));

    const pasteEvt = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvt.clipboardData = { getData: () => 'A\tB\nC\tD' };
    container.dispatchEvent(pasteEvt);

    for (let i = 0; i < 4; i += 1) {
      fixture.capturedGridOptions?.onSelectionChanged?.({ api: fixture.capturedApi });
      await fixture.waitForNextFrame();
      expect(hot.getSelectedLast()).toEqual([1, 1, 2, 2]);
    }

    const clickEvt = new global.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0
    });
    const clickedCell = document.createElement('div');
    clickedCell.className = 'ag-cell';
    clickedCell.setAttribute('col-id', 'c3');
    const clickedRow = document.createElement('div');
    clickedRow.className = 'ag-row';
    clickedRow.setAttribute('row-index', '3');
    clickedRow.appendChild(clickedCell);
    centerViewport.appendChild(clickedRow);
    clickedCell.dispatchEvent(clickEvt);
    hot.selectCell(3, 3);
    expect(hot.getSelectedLast()).toEqual([3, 3, 3, 3]);
  });
});
