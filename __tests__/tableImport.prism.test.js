const fs = require('fs');
const path = require('path');

describe('tableImport Prism import mappings', () => {
  let alertSpy;

  beforeEach(() => {
    jest.resetModules();
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    global.JSZip = require('jszip');
    window.JSZip = global.JSZip;
    global.pako = require('pako');
    window.pako = global.pako;
    require('../js/shared/tableImport.js');
  });

  afterEach(() => {
    alertSpy?.mockRestore();
    delete window.Main;
    delete global.Main;
    delete global.JSZip;
    delete window.JSZip;
    delete global.pako;
    delete window.pako;
  });

  async function importPrismFixture(fixtureName) {
    const fixturePath = path.join(__dirname, '..', 'prism files', fixtureName);
    const fileBuffer = fs.readFileSync(fixturePath);
    const prismFile = new window.File([fileBuffer], fixtureName, {
      type: 'application/octet-stream'
    });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      value: [prismFile],
      configurable: true
    });
    return window.Shared.tableImport.openFile(input, {
      onRows: rows => ({
        rows: rows.length,
        cols: rows[0]?.length || 0,
        importedRows: rows
      })
    });
  }

  function expectPrismImportWarning() {
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const message = alertSpy.mock.calls[0]?.[0] || '';
    expect(message.split('\n')).toHaveLength(3);
    expect(message).toContain('experimental');
    expect(message).toContain('Only data tables are imported');
    expect(message).toContain('graph-specific settings are not preserved');
    expect(message).toContain('Saving/exporting back to PRISM/PZFX is not supported');
  }

  test('maps parts-of-whole Prism files into pie grid rows', async () => {
    const result = await importPrismFixture('pie-chart.prism');

    expectPrismImportWarning();
    expect(result.prismMeta).toMatchObject({
      kind: 'pie',
      dataFormat: 'y_single',
      tableClass: 'DataTable'
    });
    expect(result.importedRows).toEqual([
      ['Category', 'Number of Students', 'Expected'],
      ['A', '23', ''],
      ['B', '29', ''],
      ['C', '7', ''],
      ['D', '2', ''],
      ['E', '0', '']
    ]);
  });

  test('maps survival Prism files into survival grid rows', async () => {
    const result = await importPrismFixture('survival-graph.prism');

    expect(result.prismMeta).toMatchObject({
      kind: 'survival',
      dataFormat: 'y_single',
      tableClass: 'XYDataTable',
      groupLabels: ['Control', 'Treated'],
      xTitle: 'Days elapsed'
    });
    expect(result.importedRows).toEqual([
      ['Control', '46', '1', '', '', '', ''],
      ['Control', '46', '0', '', '', '', ''],
      ['Control', '64', '0', '', '', '', ''],
      ['Control', '78', '1', '', '', '', ''],
      ['Control', '124', '1', '', '', '', ''],
      ['Control', '130', '0', '', '', '', ''],
      ['Control', '150', '0', '', '', '', ''],
      ['Control', '150', '0', '', '', '', ''],
      ['Treated', '9', '1', '', '', '', ''],
      ['Treated', '26', '1', '', '', '', ''],
      ['Treated', '43', '0', '', '', '', ''],
      ['Treated', '46', '1', '', '', '', ''],
      ['Treated', '64', '1', '', '', '', ''],
      ['Treated', '75', '1', '', '', '', ''],
      ['Treated', '100', '1', '', '', '', ''],
      ['Treated', '130', '0', '', '', '', ''],
      ['Treated', '150', '0', '', '', '', '']
    ]);
  });

  test('captures explicit Prism box graph subtype for column data', async () => {
    const result = await importPrismFixture('box-chart.prism');

    expect(result.prismMeta).toMatchObject({
      kind: 'column',
      dataFormat: 'y_single',
      tableClass: 'DataTable',
      graphType: 'box'
    });
  });

  test('keeps explicit Prism individual-value subtype for column data', async () => {
    const result = await importPrismFixture('individual-chart.prism');

    expect(result.prismMeta).toMatchObject({
      kind: 'column',
      dataFormat: 'y_single',
      tableClass: 'DataTable',
      graphType: 'strip'
    });
  });

  test('captures explicit Prism violin subtype for column data', async () => {
    const result = await importPrismFixture('violin-chart.prism');

    expect(result.prismMeta).toMatchObject({
      kind: 'column',
      dataFormat: 'y_single',
      tableClass: 'DataTable',
      graphType: 'violin'
    });
  });

  test('captures Prism violin subtype variant for column data', async () => {
    const result = await importPrismFixture('violin-chart2.prism');

    expect(result.prismMeta).toMatchObject({
      kind: 'column',
      dataFormat: 'y_single',
      tableClass: 'DataTable',
      graphType: 'violin'
    });
  });

  test('maps parts-of-whole PZFX files into pie grid rows', async () => {
    const result = await importPrismFixture('parts_of_whole.pzfx');

    expectPrismImportWarning();
    expect(result.prismMeta).toMatchObject({
      kind: 'pie',
      dataFormat: 'y_single',
      tableClass: 'PZFXTable',
      valueTitles: ['# of seeds']
    });
    expect(result.importedRows).toEqual([
      ['ROWTITLE', '# of seeds', 'Expected'],
      ['Round and yellow', '315', ''],
      ['Round and green', '108', ''],
      ['Angular and yellow', '101', ''],
      ['Angular and green', '32', '']
    ]);
  });

  test('maps survival PZFX files into survival grid rows', async () => {
    const result = await importPrismFixture('survival.pzfx');

    expect(result.prismMeta).toMatchObject({
      kind: 'survival',
      dataFormat: 'y_single',
      tableClass: 'PZFXTable',
      groupLabels: ['Control', 'Treatment A', 'Treatment B'],
      xTitle: 'Days'
    });
    expect(result.importedRows.slice(0, 3)).toEqual([
      ['Control', '78', '1', '', '', '', ''],
      ['Control', '34', '1', '', '', '', ''],
      ['Control', '123', '0', '', '', '', '']
    ]);
  });

  test('maps XY PZFX files into line grid rows', async () => {
    const result = await importPrismFixture('x_y_no_rep.pzfx');

    expect(result.prismMeta).toMatchObject({
      kind: 'line',
      dataFormat: 'y_replicates',
      tableClass: 'PZFXTable',
      replicatesCount: 1,
      groupLabels: ['Ya', 'Yb', 'Yc'],
      xTitle: 'XX'
    });
    expect(result.importedRows).toEqual([
      ['XX', 'Ya Rep 1', 'Yb Rep 1', 'Yc Rep 1'],
      ['1', '100', '1', '5'],
      ['2', '90', '2', '5'],
      ['3', '80', '3', '5']
    ]);
  });

  test('does not show Prism limitation warning for regular text imports', async () => {
    const file = new window.File(['A,B\n1,2\n'], 'regular.csv', { type: 'text/csv' });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true
    });

    const result = await window.Shared.tableImport.openFile(input, {
      onRows: rows => ({ importedRows: rows })
    });

    expect(alertSpy).not.toHaveBeenCalled();
    expect(result.importedRows).toEqual([
      ['A', 'B'],
      ['1', '2']
    ]);
  });

  test('renames the active tab to the imported file name without extension', async () => {
    const activeTab = { id: 'tab-1', title: 'Histogram', type: 'hist' };
    window.Main = global.Main = {
      session: {
        getActiveTab: jest.fn(() => activeTab)
      },
      tabs: {
        commitTabRename: jest.fn((tabId, title) => {
          activeTab.title = title;
        })
      }
    };
    const file = new window.File(['A,B\n1,2\n'], 'Dose response.csv', { type: 'text/csv' });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', {
      value: [file],
      configurable: true
    });

    await window.Shared.tableImport.openFile(input, {
      onRows: rows => ({ importedRows: rows })
    });

    expect(window.Main.tabs.commitTabRename).toHaveBeenCalledWith(
      'tab-1',
      'Dose response',
      { reason: 'table-import-file-name' }
    );
    expect(activeTab.title).toBe('Dose response');
  });
});
