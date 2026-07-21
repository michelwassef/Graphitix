describe('tableImport.handlePaste with AG Grid hot instance', () => {
  let originalAgGrid;
  let capturedGridOptions;
  let capturedApi;

  beforeEach(() => {
    jest.resetModules();
    capturedGridOptions = null;
    capturedApi = null;

    originalAgGrid = global.window?.agGrid;
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
    require('../js/shared/agGridAdapter.js');
    require('../js/shared/hot.js');
    require('../js/shared/tableImport.js');
  });

  afterEach(() => {
    global.window.agGrid = originalAgGrid;
    capturedGridOptions = null;
    capturedApi = null;
  });

  test('pastes TSV into the selected cell and schedules a draw', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteHot';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 5, cols: 5 },
      () => {},
      {
        debugLabel: 'ag-paste',
        data: Shared.createEmptyData(5, 5)
      }
    );

    expect(hot).toBeTruthy();
    expect(capturedApi).toBeTruthy();
    expect(hot.gridApi).toBe(capturedApi);

    hot.selectCell(0, 0);

    const scheduleDraw = jest.fn();
    const pasteEvent = {
      clipboardData: {
        getData: () => 'A\tB\nC\tD'
      },
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    await Shared.tableImport.handlePaste(pasteEvent, hot, {
      minCols: 5,
      minRows: 5,
      scheduleDraw,
      debugLabel: 'agPasteTest'
    });

    expect(pasteEvent.preventDefault).toHaveBeenCalled();
    expect(hot.getDataAtCell(0, 0)).toBe('A');
    expect(hot.getDataAtCell(0, 1)).toBe('B');
    expect(hot.getDataAtCell(1, 0)).toBe('C');
    expect(hot.getDataAtCell(1, 1)).toBe('D');
    expect(scheduleDraw).toHaveBeenCalled();
  });

  test('overwrites an existing value when pasting a single cell', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    container.id = 'agPasteHotSingle';
    document.body.appendChild(container);

    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      {
        debugLabel: 'ag-paste-single',
        data: Shared.createEmptyData(3, 3)
      }
    );

    hot.setDataAtCell(0, 0, 'Existing', 'test');
    expect(hot.getDataAtCell(0, 0)).toBe('Existing');

    hot.selectCell(0, 0);

    const pasteEvent = {
      clipboardData: {
        getData: () => 'New'
      },
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    await Shared.tableImport.handlePaste(pasteEvent, hot, {
      minCols: 3,
      minRows: 3,
      debugLabel: 'agPasteSingleTest'
    });

    expect(pasteEvent.preventDefault).toHaveBeenCalled();
    expect(hot.getDataAtCell(0, 0)).toBe('New');
  });

  test('pastes spreadsheet decimal commas as dot-decimal cells', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      { debugLabel: 'ag-spreadsheet-decimals', data: Shared.createEmptyData(3, 3) }
    );
    hot.selectCell(0, 0);
    const html = '<table><tr><td>1,2</td><td>5,6</td></tr><tr><td>3,4</td><td>7,8</td></tr></table>';
    const pasteEvent = {
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsString: callback => callback('1,2\t5,6\n3,4\t7,8') },
          { kind: 'string', type: 'text/html', getAsString: callback => callback(html) }
        ],
        getData: () => ''
      },
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    await Shared.tableImport.handlePaste(pasteEvent, hot, { minCols: 3, minRows: 3 });

    expect(hot.getDataAtCell(0, 0)).toBe('1.2');
    expect(hot.getDataAtCell(0, 1)).toBe('5.6');
    expect(hot.getDataAtCell(1, 0)).toBe('3.4');
    expect(hot.getDataAtCell(1, 1)).toBe('7.8');
  });

  test('keeps plain CSV paste split into columns', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      { debugLabel: 'ag-plain-csv', data: Shared.createEmptyData(3, 3) }
    );
    hot.selectCell(0, 0);
    const pasteEvent = {
      clipboardData: {
        items: [
          { kind: 'string', type: 'text/plain', getAsString: callback => callback('1,2\n3,4') }
        ],
        getData: () => ''
      },
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    };

    await Shared.tableImport.handlePaste(pasteEvent, hot, { minCols: 3, minRows: 3 });

    expect(hot.getDataAtCell(0, 0)).toBe('1');
    expect(hot.getDataAtCell(0, 1)).toBe('2');
    expect(hot.getDataAtCell(1, 0)).toBe('3');
    expect(hot.getDataAtCell(1, 1)).toBe('4');
  });

  test('AG Grid paste event keeps an ambiguous spreadsheet column intact', async () => {
    const Shared = global.window.Shared;
    const container = document.createElement('div');
    document.body.appendChild(container);
    const hot = Shared.hot.createStandardTable(
      container,
      { rows: 3, cols: 3 },
      () => {},
      { debugLabel: 'ag-spreadsheet-single-column', data: Shared.createEmptyData(3, 3) }
    );
    hot.selectCell(0, 0);
    const html = '<table><tr><td>1,2</td></tr><tr><td>3,4</td></tr></table>';
    const pasteEvent = new global.window.Event('paste', { bubbles: true, cancelable: true });
    pasteEvent.clipboardData = {
      items: [
        { kind: 'string', type: 'text/plain', getAsString: callback => callback('1,2\n3,4') },
        { kind: 'string', type: 'text/html', getAsString: callback => callback(html) }
      ],
      getData: type => type === 'text/plain' ? '1,2\n3,4' : (type === 'text/html' ? html : '')
    };

    container.dispatchEvent(pasteEvent);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(pasteEvent.defaultPrevented).toBe(true);
    expect(hot.getDataAtCell(0, 0)).toBe('1.2');
    expect(hot.getDataAtCell(1, 0)).toBe('3.4');
    expect(hot.getDataAtCell(0, 1)).toBe('');
  });
});
