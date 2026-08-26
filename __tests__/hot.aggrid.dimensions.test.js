describe('Shared.hot AG Grid dimensions', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.requestAnimationFrame = callback => setTimeout(callback, 0);
    window.Shared = {
      undoManager: {
        record: jest.fn(),
        undo: jest.fn(),
        redo: jest.fn()
      }
    };
    let capturedGridOptions = null;
    const listeners = {};
    const api = {
      getColumnState: jest.fn(() => [{ colId: '__rowHeader', width: 30 }]),
      applyColumnState: jest.fn(),
      addEventListener: jest.fn((eventName, handler) => { listeners[eventName] = handler; }),
      removeEventListener: jest.fn()
    };
    window.agGrid = {
      createGrid: (_container, gridOptions) => {
        capturedGridOptions = gridOptions;
        gridOptions?.onGridReady?.({ api, columnApi: api });
        return api;
      }
    };
    window.__getCapturedGridOptions = () => capturedGridOptions;
    window.__getGridApi = () => api;
    window.__getGridListeners = () => listeners;
    require('../js/shared/agGridAdapter.js');
    require('../js/shared/hot.js');
  });

  test('uses Excel-like default dimensions for every shared AG Grid table', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    window.Shared.hot.createStandardTable(container, { rows: 2, cols: 2 }, () => {}, {
      debugLabel: 'row-height-test'
    });

    expect(window.__getCapturedGridOptions().rowHeight).toBe(20);
    expect(window.__getCapturedGridOptions().headerHeight).toBe(20);
    expect(window.__getCapturedGridOptions().defaultColDef.width).toBe(80);
  });

  test.each([1, 2])('keeps %i pinned editable row(s) out of the normal body model', pinnedCount => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const data = [
      ['Group'],
      ['Condition'],
      ['1.5'],
      ['2.5']
    ];

    window.Shared.hot.createStandardTable(container, { rows: 4, cols: 1 }, () => {}, {
      debugLabel: 'pinned-row-model-test',
      data,
      pinFirstRow: pinnedCount
    });

    const options = window.__getCapturedGridOptions();
    expect(options.pinnedTopRowData.map(row => row.__rowIndex)).toEqual(
      Array.from({ length: pinnedCount }, (_, index) => index)
    );
    expect(options.rowData.map(row => row.__rowIndex)).toEqual(
      Array.from({ length: data.length - pinnedCount }, (_, index) => index + pinnedCount)
    );
    expect(options.getRowHeight).toBeUndefined();
  });

  test('aligns spreadsheet numeric values right and text values left', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const table = window.Shared.hot.createStandardTable(container, { rows: 3, cols: 2 }, () => {}, {
      debugLabel: 'cell-alignment-test'
    });

    table.loadData([['Header'], ['']]);

    const columnDef = window.__getCapturedGridOptions().columnDefs.find(def => def.colId === 'c0');
    const classFor = value => columnDef.cellClass({
      value,
      data: { __rowIndex: 1 },
      node: { rowIndex: 1 },
      column: { getColId: () => 'c0' },
      colDef: columnDef
    });

    expect(classFor('123')).toContain('hot-cell-numeric');
    expect(classFor('00123')).toContain('hot-cell-numeric');
    expect(classFor('-1.5e3')).toContain('hot-cell-numeric');
    expect(classFor('Group 1')).toContain('hot-cell-text');
    expect(classFor('123abc')).toContain('hot-cell-text');
    expect(classFor('=1+2')).toContain('hot-cell-text');
    expect(columnDef.valueFormatter({
      value: '00123',
      data: { __rowIndex: 1 },
      node: { rowIndex: 1 }
    })).toBe('123');
    expect(columnDef.valueFormatter({
      value: 'A00123',
      data: { __rowIndex: 1 },
      node: { rowIndex: 1 }
    })).toBe('A00123');

    columnDef.valueSetter({
      newValue: '00123',
      data: { __rowIndex: 1 },
      node: { rowIndex: 1 }
    });
    expect(table.getDataAtCell(1, 0)).toBe('123');
  });

  test('adapts row-header width to visible row labels', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    window.Shared.hot.createStandardTable(container, { rows: 2, cols: 2 }, () => {}, {
      debugLabel: 'row-header-width-test'
    });

    ['998', '999', '1000'].forEach(label => {
      const cell = document.createElement('div');
      cell.className = 'ag-cell hot-row-header';
      cell.setAttribute('col-id', '__rowHeader');
      cell.textContent = label;
      container.appendChild(cell);
    });

    window.__getGridListeners().viewportChanged({ type: 'viewportChanged' });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(window.__getGridApi().applyColumnState).toHaveBeenCalledWith({
      state: [{ colId: '__rowHeader', width: 46 }],
      applyOrder: false
    });
  });
});
