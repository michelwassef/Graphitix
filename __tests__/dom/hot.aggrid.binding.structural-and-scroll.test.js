'use strict';
const { setupHotAggridBindingFixture } = require('../../test-support/hotAggridBindingSuite');

describe('Shared.hot AG Grid binding', () => {
  const fixture = setupHotAggridBindingFixture();

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
      const def = fixture.capturedGridOptions.columnDefs.find(col => col.colId === `c${colIndex}`);
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

    const columnDef = fixture.capturedGridOptions.columnDefs.find(col => col.colId === 'c0');
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

    const columnDef = fixture.capturedGridOptions.columnDefs.find(col => col.colId === 'c0');
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

    fixture.capturedGridOptions.onFirstDataRendered();
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

      fixture.capturedGridOptions.onFirstDataRendered();
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
