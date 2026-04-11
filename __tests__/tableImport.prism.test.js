const fs = require('fs');
const path = require('path');

describe('tableImport Prism import mappings', () => {
  beforeEach(() => {
    jest.resetModules();
    global.JSZip = require('jszip');
    window.JSZip = global.JSZip;
    global.pako = require('pako');
    window.pako = global.pako;
    require('../js/shared/tableImport.js');
  });

  afterEach(() => {
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

  test('maps parts-of-whole Prism files into pie grid rows', async () => {
    const result = await importPrismFixture('pie-chart.prism');

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
});
