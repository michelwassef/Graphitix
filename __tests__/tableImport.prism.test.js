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

  async function importPrismBuffer(fileBuffer, fixtureName, dataset = {}, options = {}) {
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
      ...options,
      onRows: options.onRows || (rows => ({
        rows: rows.length,
        cols: rows[0]?.length || 0,
        importedRows: rows
      }))
    });
  }

  async function importPrismFixture(fixtureName, dataset = {}, options = {}) {
    const fixturePath = path.join(__dirname, '..', 'prism files', fixtureName);
    return importPrismBuffer(fs.readFileSync(fixturePath), fixtureName, dataset, options);
  }

  async function inspectPrismFixture(fixtureName, prismTableId = '') {
    return importPrismFixture(fixtureName, {}, {
      inspectPrismOnly: true,
      suppressPrismLimitations: true,
      prismTableId
    });
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

  async function buildSingletonConditionPrismFixture() {
    const fixturePath = path.join(__dirname, '..', 'prism files', 'demo_dataset.prism');
    const zip = await global.JSZip.loadAsync(fs.readFileSync(fixturePath));
    const documentModel = JSON.parse(await zip.file('document.json').async('string'));
    for (const dataSheetId of documentModel.sheets.data) {
      const sheetPath = `data/sheets/${dataSheetId}/sheet.json`;
      const sheet = JSON.parse(await zip.file(sheetPath).async('string'));
      if (String(sheet.table?.format || '').toLowerCase() !== 'grouped') continue;
      const tablePath = `data/tables/${sheet.table.uid}/data.csv`;
      const rows = (await zip.file(tablePath).async('string')).trim().split(/\r?\n/);
      zip.file(tablePath, `${rows[0]}\n`);
      break;
    }
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  function expectPrismImportWarning() {
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const message = alertSpy.mock.calls[0]?.[0] || '';
    expect(message).toContain('experimental');
    expect(message).toContain('Raw XY, Column, Grouped, Survival, and Parts-of-whole tables');
    expect(message).toContain('summary/error tables');
    expect(message).toContain('Prism analyses are not imported');
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

  test('maps single-value multi-series XY PZFX files into grouped scatter rows', async () => {
    const result = await importPrismFixture('x_y_no_rep.pzfx');

    expect(result.prismMeta).toMatchObject({
      kind: 'scatter',
      component: 'scatter',
      adapter: 'scatter-grouped',
      tableType: 'xy',
      replicatesCount: 1,
      groupLabels: ['Ya', 'Yb', 'Yc'],
      xTitle: 'XX'
    });
    expect(result.importedRows).toEqual([
      ['Labels', 'XX', 'Ya Rep 1', 'Yb Rep 1', 'Yc Rep 1'],
      ['', '1', '100', '1', '5'],
      ['', '2', '90', '2', '5'],
      ['', '3', '80', '3', '5']
    ]);
  });

  test('discovers every demo Prism data sheet, groups raw two-way data, and marks summaries unsupported', async () => {
    const first = await importPrismFixture('demo_dataset.prism');
    const lineTable = first.prismTables.find(table => table.title === 'XY: Entering replicate data');
    const summaryTable = first.prismTables.find(table => table.title === 'XY: Entering mean with error values');
    const survivalTable = first.prismTables.find(table => table.title === 'Survival: Two groups');
    const line = await importPrismFixture('demo_dataset.prism', { prismTableId: lineTable.id });
    const summary = await inspectPrismFixture('demo_dataset.prism', summaryTable.id);
    const survival = await importPrismFixture('demo_dataset.prism', { prismTableId: survivalTable.id });

    expect(first).toMatchObject({
      prismTableTitle: 'Grouped: Entering replicate data',
      prismTableCount: 14,
      prismMeta: { component: 'box', tableFormat: 'grouped', adapter: 'box-grouped' }
    });
    expect(first.prismTables.map(table => [table.title, table.prismMeta?.kind])).toEqual([
      ['XY: Entering replicate data', 'line'],
      ['XY: Entering mean with error values', 'unsupported'],
      ['Grouped: Entering replicate data', 'column'],
      ['Data 6', 'line'],
      ['Survival: Two groups', 'survival'],
      ['Data - missing columns', 'scatter'],
      ['Y SEN', 'unsupported'],
      ['Y CVN', 'unsupported'],
      ['Y SD', 'unsupported'],
      ['Y SE', 'unsupported'],
      ['Y CV', 'unsupported'],
      ['Y error', 'unsupported'],
      ['Y high low', 'unsupported'],
      ['Data 6', 'line']
    ]);
    expect(first.importedRows.slice(0, 3)).toEqual([
      ['CTRL', '', '', '', '', 'TREAT', '', '', '', ''],
      ['compound1', 'compound2', 'compound3', 'compound4', 'compound5', 'compound1', 'compound2', 'compound3', 'compound4', 'compound5'],
      ['0.7054', '0.6016', '0.5956', '0.6901', '0.602307', '1.3211', '1.137', '1.432', '1.4868', '1.599619']
    ]);
    expect(line).toMatchObject({ prismTableTitle: 'XY: Entering replicate data', prismMeta: { kind: 'line', component: 'line' } });
    expect(summary.prismMeta).toMatchObject({
      kind: 'unsupported',
      supported: false,
      tableType: 'xy'
    });
    expect(summary.prismMeta.unsupportedReason).toMatch(/summary data/i);
    expect(survival).toMatchObject({ prismTableTitle: 'Survival: Two groups', prismMeta: { kind: 'survival', component: 'survival' } });
  });

  test('imports a singleton-condition grouped Prism table as a single Box table', async () => {
    const result = await importPrismBuffer(
      await buildSingletonConditionPrismFixture(),
      'singleton-condition.prism'
    );

    expect(result.prismMeta).toMatchObject({
      component: 'box',
      adapter: 'box-single',
      tableType: 'grouped',
      tableFormat: 'single',
      collapsedSingletonCondition: true,
      conditionLabels: ['compound1'],
      groupLabels: ['CTRL', 'TREAT']
    });
    expect(result.importedRows.slice(0, 4)).toEqual([
      ['CTRL', 'TREAT'],
      ['0.7054', '1.3211'],
      ['0.7299', '1.1908'],
      ['0.8065', '1.2463']
    ]);
  });

  test('hands a multi-table Prism import to the workspace batch orchestrator once', async () => {
    const handler = jest.fn();
    window.Shared.tableImport.setPrismBatchHandler(handler);

    const first = await importPrismFixture('demo_dataset.prism');
    handler.mockClear();
    const batchRoot = await importPrismFixture('demo_dataset.prism', {
      prismTableId: first.prismTables[0].id,
      prismBatchRoot: 'true'
    });
    await importPrismFixture('demo_dataset.prism', { prismTableId: first.prismTables[0].id });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][1]).toBe(batchRoot);
  });

  test('discovers every demo PZFX table with the same semantic routing as .prism', async () => {
    const first = await importPrismFixture('demo_dataset.pzfx');
    const summary = await inspectPrismFixture('demo_dataset.pzfx', 'Table5');
    const survival = await importPrismFixture('demo_dataset.pzfx', { prismTableId: 'Table14' });

    expect(first.prismTables.map(table => [table.title, table.prismMeta?.kind])).toEqual([
      ['XY: Entering replicate data', 'line'],
      ['XY: Entering mean with error values', 'unsupported'],
      ['Grouped: Entering replicate data', 'column'],
      ['Data 6', 'line'],
      ['Survival: Two groups', 'survival'],
      ['Data - missing columns', 'scatter'],
      ['Y SEN', 'unsupported'],
      ['Y CVN', 'unsupported'],
      ['Y SD', 'unsupported'],
      ['Y SE', 'unsupported'],
      ['Y CV', 'unsupported'],
      ['Y error', 'unsupported'],
      ['Y high low', 'unsupported'],
      ['Data 6', 'line']
    ]);
    expect(first).toMatchObject({
      prismTableId: 'Table7',
      prismTableCount: 14,
      prismMeta: { kind: 'column', component: 'box', tableFormat: 'grouped', adapter: 'box-grouped' }
    });
    expect(first.importedRows.slice(0, 3)).toEqual([
      ['CTRL', '', '', '', '', 'TREAT', '', '', '', ''],
      ['compound1', 'compound2', 'compound3', 'compound4', 'compound5', 'compound1', 'compound2', 'compound3', 'compound4', 'compound5'],
      ['0.7054', '0.6016', '0.5956', '0.6901', '0.602307', '1.3211', '1.137', '1.432', '1.4868', '1.599619']
    ]);
    expect(summary.prismMeta).toMatchObject({ kind: 'unsupported', supported: false, tableType: 'xy' });
    expect(survival).toMatchObject({ prismTableId: 'Table14', prismTableTitle: 'Survival: Two groups', prismMeta: { kind: 'survival', component: 'survival' } });
  });

  test('maps the repository HEK grouped Prism table into Box grouped-table rows', async () => {
    const fixturePath = path.join(__dirname, '..', 'HEK_RNA_ses_KD_tpm.prism');
    const result = await importPrismBuffer(fs.readFileSync(fixturePath), 'HEK_RNA_ses_KD_tpm.prism');

    expect(result).toMatchObject({
      prismTableTitle: 'STAG1_RNA_seq2',
      prismMeta: {
        kind: 'column',
        component: 'box',
        adapter: 'box-grouped',
        tableType: 'grouped',
        tableFormat: 'grouped',
        groupedReplicatesPerGroup: 1
      }
    });
    expect(result.importedRows.slice(0, 3)).toEqual([
      ['HEK_WT_NT_R1_JB', 'HEK_WT _NT_R2_JB', 'HEK_WT_STAG1_R1', 'HEK_WT_STAG1_R2', 'HEK_tKO_NT_R1', 'HEK_tKO_NT_R2', 'HEK_tKO_STAG1_R1', 'HEK_tKO_STAG1_R2'],
      ['STAG1', 'STAG1', 'STAG1', 'STAG1', 'STAG1', 'STAG1', 'STAG1', 'STAG1'],
      ['49.99', '44.22', '0.47', '0.19', '52.57', '34.9', '3.27', '4.46']
    ]);
  });

  test('preserves PZFX excluded values as Graphitix cell exclusions instead of erasing them', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GraphPadPrismFile>
<TableSequence><Ref ID="Table0" Selected="1"/></TableSequence>
<Table ID="Table0" XFormat="numbers" YFormat="replicates" Replicates="1" TableType="XY">
<Title>Excluded XY</Title>
<XColumn><Title>X</Title><Subcolumn><d></d><d>1</d><d>2</d></Subcolumn></XColumn>
<YColumn><Title>Y</Title><Subcolumn><d></d><d>10</d><d Excluded="1">20</d></Subcolumn></YColumn>
</Table>
</GraphPadPrismFile>`;
    const result = await importPrismBuffer(Buffer.from(xml), 'excluded.pzfx');

    expect(result.importedRows).toEqual([
      ['Labels', 'X', 'Y'],
      ['', '1', '10'],
      ['', '2', '20']
    ]);
    expect(result.prismExclusions).toEqual({
      rows: [],
      cols: [],
      cells: [{ row: 2, col: 2 }]
    });
  });

  test('uses the numeric PZFX X representation for date tables', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GraphPadPrismFile>
<TableSequence><Ref ID="Table0" Selected="1"/></TableSequence>
<Table ID="Table0" XFormat="date" YFormat="replicates" Replicates="1" TableType="XY">
<Title>Date XY</Title>
<XColumn><Title>Date</Title><Subcolumn><d>0</d><d>1</d></Subcolumn></XColumn>
<XAdvancedColumn><Title>Date</Title><Subcolumn><d>8-Sep-2008</d><d>9-Sep-2008</d></Subcolumn></XAdvancedColumn>
<YColumn><Title>Y</Title><Subcolumn><d>10</d><d>20</d></Subcolumn></YColumn>
</Table>
</GraphPadPrismFile>`;
    const result = await importPrismBuffer(Buffer.from(xml), 'date.pzfx');

    expect(result.prismMeta).toMatchObject({ component: 'scatter', dateX: true });
    expect(result.importedRows.slice(0, 3)).toEqual([
      ['Labels', 'Date', 'Y'],
      ['', '0', '10'],
      ['', '1', '20']
    ]);
  });

  test('maps ordinary PZFX OneWay tables into Box single-table rows', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GraphPadPrismFile>
<TableSequence><Ref ID="Table0" Selected="1"/></TableSequence>
<Table ID="Table0" XFormat="none" YFormat="replicates" Replicates="1" TableType="OneWay">
<Title>Column data</Title>
<YColumn><Title>Control</Title><Subcolumn><d>10</d><d>11</d></Subcolumn></YColumn>
<YColumn><Title>Treated</Title><Subcolumn><d>20</d><d>21</d></Subcolumn></YColumn>
</Table>
</GraphPadPrismFile>`;
    const result = await importPrismBuffer(Buffer.from(xml), 'oneway.pzfx');

    expect(result.prismMeta).toMatchObject({
      kind: 'column',
      component: 'box',
      adapter: 'box-single',
      tableType: 'column',
      tableFormat: 'single'
    });
    expect(result.importedRows).toEqual([
      ['Control', 'Treated'],
      ['10', '20'],
      ['11', '21']
    ]);
  });

  test('imports a singleton-condition grouped PZFX table as a single Box table', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GraphPadPrismFile>
<TableSequence><Ref ID="Table0" Selected="1"/></TableSequence>
<Table ID="Table0" XFormat="none" YFormat="replicates" Replicates="2" TableType="TwoWay">
<Title>Singleton condition</Title>
<RowTitlesColumn><Title>Gene</Title><Subcolumn><d>STAG1</d></Subcolumn></RowTitlesColumn>
<YColumn><Title>Sample A</Title><Subcolumn><d>10</d></Subcolumn><Subcolumn><d>11</d></Subcolumn></YColumn>
<YColumn><Title>Sample B</Title><Subcolumn><d>20</d></Subcolumn><Subcolumn><d Excluded="1">21</d></Subcolumn></YColumn>
</Table>
</GraphPadPrismFile>`;
    const result = await importPrismBuffer(Buffer.from(xml), 'singleton-condition.pzfx');

    expect(result.prismMeta).toMatchObject({
      component: 'box',
      adapter: 'box-single',
      tableType: 'grouped',
      tableFormat: 'single',
      collapsedSingletonCondition: true,
      conditionLabels: ['STAG1'],
      groupLabels: ['Sample A', 'Sample B']
    });
    expect(result.importedRows).toEqual([
      ['Sample A', 'Sample B'],
      ['10', '20'],
      ['11', '21']
    ]);
    expect(result.prismExclusions).toEqual({
      rows: [],
      cols: [],
      cells: [{ row: 2, col: 1 }]
    });
  });

  test('marks precomputed PZFX summaries and unsupported table organizations as non-importable', async () => {
    const summaryXml = `<?xml version="1.0" encoding="UTF-8"?>
<GraphPadPrismFile>
<TableSequence><Ref ID="Table0" Selected="1"/></TableSequence>
<Table ID="Table0" XFormat="numbers" YFormat="SDN" TableType="XY">
<Title>Summary</Title>
<XColumn><Title>X</Title><Subcolumn><d>1</d></Subcolumn></XColumn>
<YColumn><Title>Y</Title><Subcolumn><d>10</d></Subcolumn><Subcolumn><d>2</d></Subcolumn><Subcolumn><d>4</d></Subcolumn></YColumn>
</Table>
</GraphPadPrismFile>`;
    const contingencyXml = `<?xml version="1.0" encoding="UTF-8"?>
<GraphPadPrismFile>
<TableSequence><Ref ID="Table0" Selected="1"/></TableSequence>
<Table ID="Table0" XFormat="none" YFormat="single" TableType="Contingency">
<Title>Counts</Title>
<YColumn><Title>A</Title><Subcolumn><d>10</d></Subcolumn></YColumn>
</Table>
</GraphPadPrismFile>`;
    const summary = await importPrismBuffer(Buffer.from(summaryXml), 'summary.pzfx', {}, {
      inspectPrismOnly: true,
      suppressPrismLimitations: true
    });
    const contingency = await importPrismBuffer(Buffer.from(contingencyXml), 'contingency.pzfx', {}, {
      inspectPrismOnly: true,
      suppressPrismLimitations: true
    });

    expect(summary.prismMeta).toMatchObject({ kind: 'unsupported', supported: false, tableType: 'xy' });
    expect(summary.prismMeta.unsupportedReason).toMatch(/summary data/i);
    expect(contingency.prismMeta).toMatchObject({ kind: 'unsupported', supported: false, tableType: 'contingency' });
    expect(contingency.prismMeta.unsupportedReason).toMatch(/contingency/i);
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
