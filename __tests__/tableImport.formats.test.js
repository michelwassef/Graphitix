describe('table import format registry', () => {
  beforeEach(() => {
    jest.resetModules();
    global.Shared = {};
    window.Shared = global.Shared;
    document.body.innerHTML = `
      <input id="table-file" type="file" data-file-formats="table">
      <input id="session-file" type="file" data-file-formats="session">
      <span id="welcome-formats" data-file-formats-label="welcome"></span>
    `;
    require('../js/shared/tableImport.js');
  });

  test('one registry drives accept metadata, labels, and dispatch', () => {
    const api = window.Shared.tableImport;
    api.applyFormatMetadata(document);

    expect(document.getElementById('table-file').getAttribute('accept')).toBe(
      '.csv,.tsv,.txt,.xls,.xlsx,.ods,.prism,.pzfx'
    );
    expect(document.getElementById('session-file').getAttribute('accept')).toBe('.graph,.json');
    expect(document.getElementById('welcome-formats').textContent).not.toContain('.json');
    expect(document.getElementById('welcome-formats').textContent).not.toContain('.session');
    expect(document.getElementById('welcome-formats').textContent).toContain('.pzfx');
    expect(document.getElementById('welcome-formats').textContent).toContain('.txt');
    expect(api.getDispatchKind('.xlsx')).toBe('spreadsheet');
    expect(api.getDispatchKind('csv')).toBe('tabular-text');
    expect(api.getDispatchKind('prism')).toBe('prism');
    expect(api.supportsExtension('pzfx', 'table')).toBe(true);
    expect(api.supportsExtension('graph', 'table')).toBe(false);
  });

  test('selected tab import options are requested before parsing', async () => {
    const api = window.Shared.tableImport;
    const OriginalFileReader = global.FileReader;
    global.FileReader = class FileReader {
      readAsText() {
        this.onload({ target: { result: 'Heading A,Heading B\n 1 , 2 ' } });
      }
    };
    const prompt = jest.fn().mockResolvedValue({
      sourceStartRow: 2,
      firstRowIsTitles: true,
      trimCells: true
    });
    const onRows = jest.fn(rows => ({ rows: rows.length, cols: rows[0]?.length || 0 }));
    api.setImportOptionsPrompt(prompt);

    try {
      const file = new File(['ignored'], 'data.csv', { type: 'text/csv' });
      await api.openFile({ id: 'boxFile', files: [file], dataset: {} }, {
        renameTab: false,
        onRows
      });

      expect(prompt).toHaveBeenCalledTimes(1);
      expect(onRows).toHaveBeenCalledWith([['1', '2']], expect.objectContaining({ delimiter: ',' }));
    } finally {
      global.FileReader = OriginalFileReader;
    }
  });
  test('source column selection and transpose are applied before header handling', () => {
    const api = window.Shared.tableImport;
    const rows = [
      ['ignore', 'Sample', 'A', 'B'],
      ['ignore', 'S1', '1', '2'],
      ['ignore', 'S2', '3', '4']
    ];

    expect(api.prepareImportedRows(rows, null, {
      sourceStartColumn: 2,
      transposeData: true,
      firstRowIsTitles: true,
      trimCells: true
    })).toEqual([
      ['Sample', 'S1', 'S2'],
      ['A', '1', '3'],
      ['B', '2', '4']
    ]);
  });

  test('fixed-header tables strip a source title row instead of importing a synthetic header', () => {
    const api = window.Shared.tableImport;
    const rows = [
      ['Group', 'Time', 'Event'],
      ['A', '5', '1'],
      ['A', '9', '0']
    ];

    expect(api.prepareImportedRows(rows, null, {
      firstRowIsTitles: true,
      targetFirstRowIsHeader: false
    })).toEqual([
      ['A', '5', '1'],
      ['A', '9', '0']
    ]);
  });

  test('component layout assessment explains incompatible ROC input', () => {
    const api = window.Shared.tableImport;
    const assessment = api.assessComponentLayout([
      ['Label', 'Score'],
      ['case-a', 'high'],
      ['case-b', 'low'],
      ['case-c', 'medium']
    ], 'roc', { firstRowIsTitles: true });

    expect(assessment.status).toBe('warning');
    expect(assessment.message).toContain('exactly two outcome classes');
    expect(assessment.message).toContain('numeric score');
    expect(assessment.message).toContain('binary class-label column');
  });

});
