describe('Shared.tableImport incremental operations', () => {
  let tableImport;
  let undoManager;
  let HotConstructor;
  beforeEach(() => {
    jest.resetModules();
    if(typeof global.__resetHT__ === 'function'){
      global.__resetHT__();
    }
    document.body.innerHTML = '';
    global.Shared = { hot: { clearCopyHighlight: jest.fn() } };
    if(global.window){
      global.window.Shared = global.Shared;
    }
    require('../js/shared/undo.js');
    require('../js/shared/tableImport.js');
    tableImport = global.Shared.tableImport;
    undoManager = global.Shared.undoManager;
    HotConstructor = global.Handsontable;
  });

  afterEach(() => {
    if(undoManager && typeof undoManager.clear === 'function'){
      undoManager.clear();
    }
  });

  function createHotWithData(id, rows, cols){
    const container = document.createElement('div');
    container.id = id;
    document.body.appendChild(container);
    const data = Array.from({ length: rows }, (_, r) => {
      return Array.from({ length: cols }, (_, c) => `R${r}C${c}`);
    });
    return new HotConstructor(container, { data, minRows: rows, minCols: cols });
  }

  test('processRows performs incremental update without full data replace', () => {
    const hot = createHotWithData('sheetA', 50, 20);
    const scheduleDraw = jest.fn();
    const pasteRows = [
      ['x1', 'x2', 'x3'],
      ['y1', 'y2', 'y3']
    ];
    const baseline = (global.__HT_CALLS__ || []).length;
    const result = tableImport.processRows(pasteRows, hot, {
      startRow: 10,
      startCol: 5,
      scheduleDraw,
      debugLabel: 'testPartial'
    });
    expect(scheduleDraw).toHaveBeenCalled();
    expect(result).toMatchObject({ rowCount: 2, colCount: 3 });
    expect(Array.isArray(result.changes)).toBe(true);
    expect(result.changes.length).toBe(6);
    const calls = (global.__HT_CALLS__ || []).slice(baseline);
    const setCalls = calls.filter(call => call.type === 'setDataAtCell');
    expect(setCalls.length).toBeGreaterThan(0);
    const updateWithData = calls.filter(call => call.type === 'updateSettings' && call.hasData);
    expect(updateWithData.length).toBe(0);
    expect(hot.getDataAtCell(10, 5)).toBe('x1');
    expect(hot.getDataAtCell(11, 7)).toBe('y3');
  });

  test('processRows honors preserveExisting flag', () => {
    const hot = createHotWithData('sheetB', 5, 5);
    hot.setDataAtCell([
      [2, 2, 'LOCKED'],
      [2, 3, ''],
      [3, 2, ''],
      [3, 3, '']
    ]);
    const pasteRows = [['a', 'b'], ['c', 'd']];
    const result = tableImport.processRows(pasteRows, hot, {
      startRow: 2,
      startCol: 2,
      preserveExisting: true,
      scheduleDraw: jest.fn(),
      debugLabel: 'testPreserve'
    });
    expect(result.changes.length).toBe(3);
    expect(hot.getDataAtCell(2, 2)).toBe('LOCKED');
    expect(hot.getDataAtCell(3, 3)).toBe('d');
  });

  test('handlePaste records undo and redo diff for incremental changes', async () => {
    const hot = createHotWithData('sheetC', 3, 3);
    const data = [
      ['r0c0', 'r0c1', 'r0c2'],
      ['r1c0', '', 'r1c2'],
      ['r2c0', 'r2c1', 'r2c2']
    ];
    hot.loadData(data);
    hot._selected = [1, 1, 2, 2];
    const event = {
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
      clipboardData: {
        getData: jest.fn().mockImplementation((type) => {
          return type === 'text/plain' ? 'p11\tp12\np21\tp22' : '';
        })
      }
    };
    const scheduleDraw = jest.fn();
    const result = await tableImport.handlePaste(event, hot, {
      scheduleDraw,
      debugLabel: 'handlePasteTest'
    });
    expect(result).toBeTruthy();
    expect(result.changes.length).toBe(4);
    expect(scheduleDraw).toHaveBeenCalled();
    expect(hot.getDataAtCell(1, 1)).toBe('p11');
    expect(hot.getDataAtCell(2, 2)).toBe('p22');
    const undoOutcome = undoManager.undo();
    expect(undoOutcome).toBe(true);
    expect(hot.getDataAtCell(1, 1)).toBe('');
    expect(hot.getDataAtCell(1, 2)).toBe('r1c2');
    expect(hot.getDataAtCell(2, 1)).toBe('r2c1');
    expect(hot.getDataAtCell(2, 2)).toBe('r2c2');
    const redoOutcome = undoManager.redo();
    expect(redoOutcome).toBe(true);
    expect(hot.getDataAtCell(1, 1)).toBe('p11');
    expect(hot.getDataAtCell(2, 2)).toBe('p22');
  });
});
