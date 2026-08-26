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

  async function importPrismBuffer(fileBuffer, fixtureName, dataset = {}) {
    const prismFile = new window.File([fileBuffer], fixtureName, {
      type: 'application/octet-stream'
    });
    const input = document.createElement('input');
    input.type = 'file';
    Object.assign(input.dataset, dataset);
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

  async function importPrismFixture(fixtureName, dataset = {}) {
    const fixturePath = path.join(__dirname, '..', 'prism files', fixtureName);
    return importPrismBuffer(fs.readFileSync(fixturePath), fixtureName, dataset);
  }

  async function buildGroupedBarOverlayFixture() {
    const fixturePath = path.join(__dirname, '..', 'prism files', 'individual-chart.prism');
    const zip = await global.JSZip.loadAsync(fs.readFileSync(fixturePath));
    const documentModel = JSON.parse(await zip.file('document.json').async('string'));
    const dataSheetId = documentModel.sheets.data[0];
    const graphSheetId = documentModel.sheets.graphs[0];
    const sheetPath = `data/sheets/${dataSheetId}/sheet.json`;
    const graphPath = `graphs/${graphSheetId}/data.bin`;
    const sheet = JSON.parse(await zip.file(sheetPath).async('string'));
    sheet.table.format = 'grouped';
    zip.file(sheetPath, JSON.stringify(sheet));

    const graph = Buffer.from(await zip.file(graphPath).async('uint8array'));
    const marker = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, 0x2C, 0x01, 0x00, 0x00]);
    const markerOffset = graph.indexOf(marker);
    const shifted = Buffer.concat([
      graph.subarray(0, markerOffset + marker.length),
      Buffer.from([0]),
      graph.subarray(markerOffset + marker.length)
    ]);
    shifted.writeUInt16LE(13, markerOffset + 37 + 28);
    zip.file(graphPath, shifted);
    return zip.generateAsync({ type: 'nodebuffer' });
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

  test('keeps grouped Prism bar charts with individual-value overlays', async () => {
    const result = await importPrismBuffer(
      await buildGroupedBarOverlayFixture(),
      'grouped-bar-overlay.prism'
    );

    expect(result.prismMeta).toMatchObject({
      kind: 'column',
      dataFormat: 'y_single',
      tableClass: 'DataTable',
      graphType: 'bar',
      pointMode: 'overlay'
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

  test('discovers every demo Prism data sheet and can select mixed table types', async () => {
    const first = await importPrismFixture('demo_dataset.prism');
    const lineTable = first.prismTables.find(table => table.title === 'XY: Entering replicate data');
    const summaryTable = first.prismTables.find(table => table.title === 'XY: Entering mean with error values');
    const survivalTable = first.prismTables.find(table => table.title === 'Survival: Two groups');
    const line = await importPrismFixture('demo_dataset.prism', { prismTableId: lineTable.id });
    const summary = await importPrismFixture('demo_dataset.prism', { prismTableId: summaryTable.id });
    const survival = await importPrismFixture('demo_dataset.prism', { prismTableId: survivalTable.id });

    expect(first).toMatchObject({
      prismTableTitle: 'Grouped: Entering replicate data',
      prismTableCount: 14
    });
    expect(first.prismTables.map(table => [table.title, table.prismMeta?.kind])).toEqual([
      ['XY: Entering replicate data', 'line'],
      ['XY: Entering mean with error values', 'scatter'],
      ['Grouped: Entering replicate data', 'column'],
      ['Data 6', 'line'],
      ['Survival: Two groups', 'survival'],
      ['Data - missing columns', 'scatter'],
      ['Y SEN', 'scatter'],
      ['Y CVN', 'scatter'],
      ['Y SD', 'scatter'],
      ['Y SE', 'scatter'],
      ['Y CV', 'scatter'],
      ['Y error', 'scatter'],
      ['Y high low', 'scatter'],
      ['Data 6', 'line']
    ]);
    expect(first.importedRows.slice(0, 2)).toEqual([
      ['CTRL Rep 1', 'CTRL Rep 2', 'CTRL Rep 3', 'TREAT Rep 1', 'TREAT Rep 2', 'TREAT Rep 3'],
      ['0.7054', '0.7299', '0.8065', '1.3211', '1.1908', '1.2463']
    ]);
    expect(line).toMatchObject({ prismTableTitle: 'XY: Entering replicate data', prismMeta: { kind: 'line' } });
    expect(summary.importedRows.slice(0, 3)).toEqual([
      ['Labels', 'Hours', 'Control'],
      ['Control', '0', '45.9'],
      ['Treated', '0', '39.9']
    ]);
    expect(survival).toMatchObject({ prismTableTitle: 'Survival: Two groups', prismMeta: { kind: 'survival' } });
  });

  test('hands a multi-table Prism import to the workspace batch orchestrator once', async () => {
    const handler = jest.fn();
    window.Shared.tableImport.setPrismBatchHandler(handler);

    const first = await importPrismFixture('demo_dataset.prism');
    await importPrismFixture('demo_dataset.prism', { prismTableId: first.prismTables[0].id });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1]).toBe(first);
  });

  test('discovers every demo PZFX table and preserves Prism type parity', async () => {
    const first = await importPrismFixture('demo_dataset.pzfx');
    const summary = await importPrismFixture('demo_dataset.pzfx', { prismTableId: 'Table5' });
    const survival = await importPrismFixture('demo_dataset.pzfx', { prismTableId: 'Table14' });

    expect(first.prismTables.map(table => [table.title, table.prismMeta?.kind])).toEqual([
      ['XY: Entering replicate data', 'line'],
      ['XY: Entering mean with error values', 'scatter'],
      ['Grouped: Entering replicate data', 'column'],
      ['Data 6', 'line'],
      ['Survival: Two groups', 'survival'],
      ['Data - missing columns', 'line'],
      ['Y SEN', 'scatter'],
      ['Y CVN', 'scatter'],
      ['Y SD', 'scatter'],
      ['Y SE', 'scatter'],
      ['Y CV', 'scatter'],
      ['Y error', 'scatter'],
      ['Y high low', 'scatter'],
      ['Data 6', 'line']
    ]);
    expect(first).toMatchObject({ prismTableId: 'Table7', prismTableCount: 14, prismMeta: { kind: 'column' } });
    expect(first.importedRows.slice(0, 2)).toEqual([
      ['CTRL_1', 'CTRL_2', 'CTRL_3', 'TREAT_1', 'TREAT_2', 'TREAT_3'],
      ['0.7054', '0.7299', '0.8065', '1.3211', '1.1908', '1.2463']
    ]);
    expect(summary.importedRows.slice(0, 3)).toEqual([
      ['Labels', 'Hours', 'Y'],
      ['Control', '0', '45.9'],
      ['Treated', '0', '39.9']
    ]);
    expect(survival).toMatchObject({ prismTableId: 'Table14', prismTableTitle: 'Survival: Two groups', prismMeta: { kind: 'survival' } });
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
