const fs = require('fs');
const path = require('path');
const prismThicknessToCssPixels = points => points === 0
  ? 0
  : 0.7182 * points + 0.7194;

describe('tableImport Prism import mappings', () => {
  let alertSpy;

  beforeEach(() => {
    jest.resetModules();
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    global.JSZip = require('jszip');
    window.JSZip = global.JSZip;
    global.pako = require('pako');
    window.pako = global.pako;
    require('../../js/shared/tableImport.js');
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
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism', 'v1', fixtureName);
    return importPrismBuffer(fs.readFileSync(fixturePath), fixtureName, dataset, options);
  }

  async function inspectPrismFixture(fixtureName, prismTableId = '') {
    return importPrismFixture(fixtureName, {}, {
      inspectPrismOnly: true,
      suppressPrismLimitations: true,
      prismTableId
    });
  }

  test('audits routing and known unsupported formats for every Prism v1 fixture', async () => {
    const expectedByFile = {
      'box-chart.prism': { count: 1, component: 'box', supported: true },
      'column.pzfx': { count: 1, component: 'box', supported: true },
      'contingency.pzfx': { count: 1, component: '', supported: false },
      'demo_dataset.prism': { count: 14, component: 'box', supported: true },
      'demo_dataset.pzfx': { count: 14, component: 'box', supported: true },
      'example-file-line.prism': { count: 1, component: 'line', supported: true },
      'example-file-line-y-axis.prism': { count: 1, component: 'line', supported: true },
      'example-file-line-y-axis2.prism': { count: 1, component: 'line', supported: true },
      'example-file-prism10-axis-thickness-0.5.prism': { count: 1, component: 'box', supported: true },
      'example-file-prism10-test.prism': { count: 1, component: 'box', supported: true },
      'example-file-prism10.prism': { count: 1, component: 'box', supported: true },
      'example-file-scatter-axes-titles.prism': { count: 1, component: 'scatter', supported: true },
      'example-file-scatter.prism': { count: 1, component: 'scatter', supported: true },
      'individual-chart.prism': { count: 1, component: 'box', supported: true },
      'parts_of_whole.pzfx': { count: 1, component: 'pie', supported: true },
      'pie-chart.prism': { count: 1, component: 'pie', supported: true },
      'survival-graph.prism': { count: 1, component: 'survival', supported: true },
      'survival.pzfx': { count: 1, component: 'survival', supported: true },
      'test.prism': { count: 1, component: 'scatter', supported: true },
      'violin-chart.prism': { count: 1, component: 'box', supported: true },
      'violin-chart2.prism': { count: 1, component: 'box', supported: true },
      'x_y_no_rep.pzfx': { count: 1, component: 'scatter', supported: true }
    };
    const fixtureDir = path.join(__dirname, '..', 'fixtures', 'prism', 'v1');
    const files = fs.readdirSync(fixtureDir).filter(file => /\.(?:prism|pzfx)$/i.test(file)).sort();
    expect(files).toEqual(Object.keys(expectedByFile).sort());
    const results = {};
    for(const file of files){
      const result = await inspectPrismFixture(file);
      results[file] = result;
      expect(result?.prismTableCount).toBe(expectedByFile[file].count);
      expect(result?.prismMeta?.component || '').toBe(expectedByFile[file].component);
      expect(result?.prismMeta?.supported !== false).toBe(expectedByFile[file].supported);
      expect(result?.prismTables).toHaveLength(expectedByFile[file].count);
    }

    const unsupportedDemoTables = file => results[file].prismTables
      .filter(table => table.prismMeta?.supported === false)
      .map(table => table.title);
    const unsupportedSummaryTitles = [
      'XY: Entering mean with error values',
      'Y SEN', 'Y CVN', 'Y SD', 'Y SE', 'Y CV', 'Y error', 'Y high low'
    ];
    expect(unsupportedDemoTables('demo_dataset.prism')).toEqual(unsupportedSummaryTitles);
    expect(unsupportedDemoTables('demo_dataset.pzfx')).toEqual(unsupportedSummaryTitles);

    const componentFor = (file, title) => results[file].prismTables
      .find(table => table.title === title)?.prismMeta?.component || '';
    expect(componentFor('demo_dataset.prism', 'Data - missing columns')).toBe('line');
    expect(componentFor('demo_dataset.pzfx', 'Data - missing columns')).toBe('line');
  });

  async function buildGroupedBarOverlayFixture() {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism', 'v1', 'individual-chart.prism');
    const zip = await global.JSZip.loadAsync(fs.readFileSync(fixturePath));
    const documentModel = JSON.parse(await zip.file('document.json').async('string'));
    const dataSheetId = documentModel.sheets.data[0];
    const graphSheetId = documentModel.sheets.graphs[0];
    const sheetPath = `data/sheets/${dataSheetId}/sheet.json`;
    const graphPath = `graphs/${graphSheetId}/data.bin`;
    const sheet = JSON.parse(await zip.file(sheetPath).async('string'));
    sheet.table.format = 'grouped';
    zip.file(sheetPath, JSON.stringify(sheet));

    const prismBinary = require('../../js/shared/prismBinary.js');
    const graph = Buffer.from(await zip.file(graphPath).async('uint8array'));
    const wrapperRecord = prismBinary.parseOuter(graph)?.records.find(record =>
      record.type === 0x0013 && record.size === 48);
    if(!wrapperRecord){
      throw new Error('Could not locate the typed Prism column graph record');
    }
    graph.writeUInt16LE(13, wrapperRecord.start + 42);
    zip.file(graphPath, graph);
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  function appendPzfxTemplate(pzfxBuffer, templateSourceBuffer){
    const sourceXml = Buffer.from(templateSourceBuffer).toString('utf8');
    const template = sourceXml.match(/<Template(?:\s[^>]*)?>[\s\S]*?<\/Template>/i)?.[0];
    if(!template){
      throw new Error('Could not find a PZFX graph template');
    }
    const xml = Buffer.from(pzfxBuffer).toString('utf8');
    const rootClose = /<\/GraphPadPrismFile\s*>/i;
    if(!rootClose.test(xml)){
      throw new Error('Could not find the PZFX project end tag');
    }
    return Buffer.from(xml.replace(rootClose, `${template}</GraphPadPrismFile>`));
  }

  function removePzfxTemplates(pzfxBuffer){
    const xml = Buffer.from(pzfxBuffer).toString('utf8');
    return Buffer.from(xml.replace(/<Template(?:\s[^>]*)?>[\s\S]*?<\/Template>/gi, ''));
  }

  async function buildPrismGraphRecordVariant(fixtureName){
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled', fixtureName);
    const zip = await global.JSZip.loadAsync(fs.readFileSync(fixturePath));
    const documentModel = JSON.parse(await zip.file('document.json').async('string'));
    const graphPath = `graphs/${documentModel.sheets.graphs[0]}/data.bin`;
    const graph = Buffer.from(await zip.file(graphPath).async('uint8array'));
    const prismBinary = require('../../js/shared/prismBinary.js');
    const outer = prismBinary.parseOuter(graph);
    if(!outer){
      throw new Error('Could not parse the Prism graph binary');
    }
    let styleObjectId = 88;
    const records = [graph.subarray(0, 8)];
    outer.records.forEach(record => {
      if((record.type & 0xC000) === 0x4000){
        records.push(graph.subarray(record.offset, record.offset + 2));
        return;
      }
      let type = record.type;
      let payload = Buffer.from(graph.subarray(record.start, record.start + record.size));
      if(type === 0x002C){
        type = 0x102C;
      }else if(type === 0x002D){
        type = 0x102D;
      }else if(type === 0x8025 && payload.length >= 2){
        payload.writeUInt16LE(payload.readUInt16LE(0) + 27, 0);
      }
      if(type === 0x009C && payload.length === 313){
        const extension = Buffer.alloc(8);
        extension.writeUInt32LE(styleObjectId++, 0);
        payload = Buffer.concat([payload, extension]);
      }
      const header = Buffer.alloc(6);
      header.writeUInt16LE(type, 0);
      header.writeUInt32LE(payload.length, 2);
      records.push(header, payload);
    });
    zip.file(graphPath, Buffer.concat(records));
    return zip.generateAsync({ type: 'nodebuffer' });
  }

  async function buildSingletonConditionPrismFixture() {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism', 'v1', 'demo_dataset.prism');
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

  test('shares Prism axis and font conversions across graph importers', () => {
    const style = {
      axisColor: '#123456',
      axisThickness: { points: 3 },
      axisTickLengths: { x: { preset: 'normal' }, y: { preset: 'short' } },
      axisGeometry: {
        x: { cssPixelsAt96Dpi: 288 },
        y: { cssPixelsAt96Dpi: 192 }
      },
      axisTextStyles: {
        x: { fontSizePt: 14, bold: false },
        y: { fontSizePt: 11, bold: true }
      },
      titleTextObjects: [{ fontSize: 16, bold: true }, { fontSize: 12, bold: false }, { fontSize: 13 }],
      fontFamily: 'Arial',
      fontColor: '#abcdef'
    };

    const axisStyle = window.Shared.tableImport.resolvePrismAxisStyle(style);
    expect(axisStyle).toMatchObject({
      color: '#123456',
      tickLengths: { x: 8, y: 6 },
      axisTargetPx: { x: 288, y: 192 }
    });
    expect(axisStyle.strokeWidth).toBeCloseTo(2.874, 3);
    expect(window.Shared.tableImport.resolvePrismFontStyles(style)).toEqual({
      xTick: { fontSize: '14pt', fontWeight: '400' },
      yTick: { fontSize: '11pt', fontWeight: '700' },
      graphTitle: { fontSize: '16pt', fontWeight: '700' },
      xTitle: { fontSize: '12pt', fontWeight: '400' },
      yTitle: { fontSize: '13pt' },
      __graph__: { fontFamily: 'Arial', fill: '#abcdef' }
    });
  });

  test('maps measured Prism point widths directly to Graphitix pixels', () => {
    const resolve = points => window.Shared.tableImport.resolvePrismAxisStyle({
      axisThickness: { points }
    }).strokeWidth;

    expect(resolve(1)).toBeCloseTo(1.4375, 3);
    expect(resolve(2)).toBeCloseTo(2.15625, 3);
    expect(resolve(3)).toBeCloseTo(2.874, 3);
  });

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

  test('decodes individual slice fills for Prism parts-of-whole charts', async () => {
    const controlled = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled');
    const read = async file => importPrismBuffer(
      fs.readFileSync(path.join(controlled, file)), file
    );
    const baseline = await read('pie-chart-import-baseline.prism');
    const redSlice = await read('pie-chart-import-slice-B-red.prism');

    expect(baseline.prismMeta.component).toBe('pie');
    expect(baseline.prismStyle.pieSlices.map(slice => slice.fillColor.hex))
      .toEqual(['#000000', '#a0a0a4', '#808080', '#d4d4d4', '#000000']);
    expect(redSlice.prismStyle.pieSlices.map(slice => slice.fillColor.hex))
      .toEqual(['#000000', '#ff0000', '#808080', '#d4d4d4', '#000000']);
    expect(redSlice.prismStyle.pieSlices[4].fillColor.opacity).toBe(0);
  });

  test('decodes enabled state and calibrated outer border width for Prism Pie charts', async () => {
    const controlled = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled');
    const read = async file => importPrismBuffer(
      fs.readFileSync(path.join(controlled, file)), file
    );
    const onePoint = await read('pie-outer-border-1pt.prism');
    const threePoint = await read('pie-outer-border-3pt.prism');
    const sixPoint = await read('pie-outer-border-6pt.prism');
    const disabled = await read('pie-outer-border-off.prism');
    const width = points => 0.7182 * points + 0.7194;

    expect(onePoint.prismStyle.pieBorder.outer).toMatchObject({
      enabled: true,
      thickness: { encodedValue: 9, points: 1 }
    });
    expect(threePoint.prismStyle.pieBorder.outer).toMatchObject({
      enabled: true,
      thickness: { encodedValue: 11, points: 3 }
    });
    expect(sixPoint.prismStyle.pieBorder.outer).toMatchObject({
      enabled: true,
      thickness: { encodedValue: 14, points: 6 }
    });
    expect(threePoint.prismStyle.pieBorder.outer.thickness.cssPixels).toBeCloseTo(width(3), 5);
    expect(disabled.prismStyle.pieBorder.outer).toMatchObject({
      enabled: false,
      thickness: { points: 3 }
    });
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
    expect(result.prismStyle.seriesStyles.map(style => style.dataSetTitle))
      .toEqual(['Control', 'Treated']);
    expect(result.prismStyle.seriesStyles.map(style => style.lineColor.hex))
      .toEqual(['#000000', '#000000']);
  });

  test('maps Prism Survival line styles and percentage ticks to their group labels', async () => {
    const file = 'survival-three-groups-tick-normal.prism';
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled', file);
    const result = await importPrismBuffer(fs.readFileSync(fixturePath), file);

    expect(result.prismMeta).toMatchObject({
      component: 'survival',
      groupLabels: ['Control', 'Treatment A', 'Treatment B']
    });
    expect(result.prismStyle.seriesStyles.map(style => style.dataSetTitle))
      .toEqual(['Control', 'Treatment A', 'Treatment B']);
    expect(result.prismStyle.seriesStyles.map(style => style.lineColor.hex))
      .toEqual(['#000000', '#000000', '#000000']);
    expect(result.prismStyle.axisRanges.primaryY).toMatchObject({
      manual: false,
      min: 0,
      max: 110,
      majorTickInterval: 50
    });
    expect(window.Shared.tableImport.resolvePrismAxisStyle(result.prismStyle).tickIntervals)
      .toEqual({ x: 100, y: 50 });
  });

  test('associates the sole graph with a one-table Prism Survival project', async () => {
    const controlled = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled');
    const baseline = await importPrismBuffer(
      fs.readFileSync(path.join(controlled, 'survival-baseline-20261026.prism')),
      'survival-baseline-20261026.prism'
    );
    const normalYTicks = await importPrismBuffer(
      fs.readFileSync(path.join(controlled, 'survival-yaxis-tick-normal-20261026.prism')),
      'survival-yaxis-tick-normal-20261026.prism'
    );
    const onePointLine = await importPrismBuffer(
      fs.readFileSync(path.join(controlled, 'survival-line-1pt-20261026.prism')),
      'survival-line-1pt-20261026.prism'
    );

    expect(baseline.prismMeta.component).toBe('survival');
    expect(baseline.prismStyle).toMatchObject({
      title: 'Survival proportions: Survival of Three groups',
      xLabel: 'Days',
      yLabel: 'Probability of Survival',
      axisGeometry: { x: { cssPixelsAt96Dpi: 288 }, y: { cssPixelsAt96Dpi: 192 } },
      axisThickness: { points: 2 },
      axisTextStyles: {
        x: { fontSizePt: 11, bold: true },
        y: { fontSizePt: 11, bold: true }
      }
    });
    expect(baseline.prismStyle.titleTextObjects.map(item => ({ fontSize: item.fontSize, bold: item.bold })))
      .toEqual([{ fontSize: 14, bold: true }, { fontSize: 12, bold: true }, { fontSize: 12, bold: true }]);
    expect(baseline.prismStyle.seriesStyles.map(item => item.dataSetTitle))
      .toEqual(['Control', 'Treatment A', 'Treatment B']);
    expect(baseline.prismStyle.seriesStyles.map(item => item.lineThickness.points)).toEqual([2, 2, 2]);
    expect(onePointLine.prismStyle.seriesStyles.map(item => item.lineThickness.points)).toEqual([2, 1, 2]);
    expect(onePointLine.prismStyle.seriesStyles.map(item => item.lineColor.hex))
      .toEqual(['#000000', '#000000', '#000000']);
    expect(normalYTicks.prismStyle.seriesStyles.map(item => [item.dataSetTitle, item.lineColor.hex]))
      .toEqual([
        ['Control', '#000000'],
        ['Treatment A', '#000000'],
        ['Treatment B', '#000000']
      ]);
    expect(normalYTicks.prismStyle.axisTickLengths.y).toEqual({ code: 3, storedValue: 3, preset: 'normal' });
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

  test('preserves XY replicate line graphs instead of inferring individual values', async () => {
    const result = await importPrismFixture('example-file-line-y-axis.prism');

    expect(result.prismMeta).toMatchObject({
      kind: 'line',
      component: 'line',
      adapter: 'xy-series',
      tableType: 'xy',
      tableFormat: 'grouped',
      replicatesCount: 3
    });
    expect(result.importedRows[0]).toEqual([
      'Hours', 'Control Rep 1', 'Control Rep 2', 'Control Rep 3',
      'Treated Rep 1', 'Treated Rep 2', 'Treated Rep 3'
    ]);
    expect(result.importedRows[1]).toEqual(['0', '45', '34', '', '34', '31', '29']);
    expect(result.prismStyle.graphType).toBeUndefined();
  });

  test.each([
    ['scatter-graph.prism', 'scatter', false],
    ['line-graph.prism', 'line', true]
  ])('routes XY %s by its connecting-line setting', async (file, graphType, connectLines) => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled', file);
    const result = await importPrismBuffer(fs.readFileSync(fixturePath), file);

    expect(result.prismMeta).toMatchObject({
      kind: graphType,
      component: graphType,
      graphType,
      graphTypeSource: 'series-connections',
      tableType: 'xy',
      dataFormat: 'y_single'
    });
    expect(result.prismTables.find(table => table.id === result.prismTableId)?.prismMeta).toMatchObject({
      component: graphType,
      graphType,
      graphTypeSource: 'series-connections'
    });
    expect(result.prismGraphBinary.seriesConnections).toHaveLength(3);
    expect(result.prismGraphBinary.seriesConnections.every(series => series.connectLines === connectLines)).toBe(true);
    expect(result.importedRows[1]).toEqual(graphType === 'line'
      ? ['0', '256.652', '253.412', '235.171']
      : ['', '0', '256.652', '253.412', '235.171']);
  });

  test.each([
    'xy-individual-values-baseline.prism',
    'xy-boxplot-baseline.prism',
    'treated-size-6.prism'
  ])('routes unconnected XY replicate tables to Scatter without discarding values: %s', async file => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled', file);
    const result = await importPrismBuffer(fs.readFileSync(fixturePath), file);

    expect(result.prismMeta).toMatchObject({
      kind: 'scatter',
      component: 'scatter',
      adapter: 'scatter-grouped',
      tableType: 'xy',
      tableFormat: 'grouped',
      replicatesCount: 3,
      graphType: 'scatter',
      graphTypeSource: 'series-connections'
    });
    expect(result.importedRows).toHaveLength(7);
    expect(result.importedRows.every(row => row.length === 8)).toBe(true);
    expect(result.prismStyle.graphType).toBeUndefined();
    expect(result.prismStyle.seriesPlotTypes.map(item => item.graphType)).toEqual(['', '']);
  });

  test('decodes a per-condition red square marker in a Prism individual-values graph', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled', 'individual-red-square.prism');
    const result = await importPrismBuffer(fs.readFileSync(fixturePath), 'individual-red-square.prism');

    expect(result.prismStyle.seriesStyles.map(style => style.shape)).toEqual(['circle', 'circle', 'square']);
    expect(result.prismStyle.seriesStyles.map(style => style.dataSetTitle)).toEqual(['Untreated', 'Placebo', 'Treated']);
    expect(result.prismStyle.seriesStyles.map(style => style.symbolColor.hex)).toEqual(['#000000', '#000000', '#ff0000']);
    expect(result.prismStyle.axisGeometry.x.approximateCm).toBeCloseTo(3.39, 2);
    expect(result.prismStyle.axisGeometry.y.approximateCm).toBeCloseTo(5.08, 2);
    expect(result.prismStyle.axisGeometry.x.cssPixelsAt96Dpi).toBe(128);
    expect(result.prismStyle.axisGeometry.y.cssPixelsAt96Dpi).toBe(192);
    expect(result.prismStyle.axisThickness.points).toBe(1);
  });

  test('decodes per-dataset bar and box fill, border color, and border thickness', async () => {
    const controlled = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled');
    const read = async file => importPrismBuffer(fs.readFileSync(path.join(controlled, file)), file);
    const baseline = await read('individual-baseline-boxplot.prism');
    const noBorder = await read('individual-baseline-bar-no-border.prism');
    const onePixel = await read('individual-baseline-boxplot-1px-border.prism');
    const redFill = await read('individual-baseline-boxplot-Treated-red-filled.prism');
    const redBorder = await read('individual-baseline-boxplot-treated-border-red.prism');

    expect(baseline.prismStyle.seriesStyles.map(style => style.fillColor.hex))
      .toEqual(['#000000', '#a0a0a4', '#808080']);
    expect(baseline.prismStyle.seriesStyles.map(style => style.borderColor.hex))
      .toEqual(['#000000', '#000000', '#000000']);
    expect(baseline.prismStyle.seriesStyles.map(style => style.borderThickness.encodedValue))
      .toEqual([18, 18, 18]);
    expect(baseline.prismStyle.seriesStyles.map(style => style.borderThickness.points))
      .toEqual([2, 2, 2]);
    baseline.prismStyle.seriesStyles.forEach(style => {
      expect(style.borderThickness.cssPixels).toBeCloseTo(prismThicknessToCssPixels(2), 4);
    });
    expect(baseline.prismStyle.seriesStyles[0].fillColor.opacity).toBeCloseTo(0.502, 3);

    expect(noBorder.prismStyle.seriesStyles.map(style => style.borderThickness))
      .toEqual(Array(3).fill({ encodedValue: 0, points: 0, cssPixels: 0 }));
    expect(onePixel.prismStyle.seriesStyles.map(style => style.borderThickness.points))
      .toEqual([2, 2, 1]);
    onePixel.prismStyle.seriesStyles.forEach((style, index) => {
      expect(style.borderThickness.cssPixels).toBeCloseTo(prismThicknessToCssPixels([2, 2, 1][index]), 4);
    });
    expect(redFill.prismStyle.seriesStyles[2].fillColor).toMatchObject({
      rgba: [255, 0, 0, 255], hex: '#ff0000', opacity: 1
    });
    expect(redFill.prismStyle.seriesStyles[2].borderColor.hex).toBe('#000000');
    expect(redBorder.prismStyle.seriesStyles[2].fillColor.hex).toBe('#808080');
    expect(redBorder.prismStyle.seriesStyles[2].borderColor).toMatchObject({
      rgba: [255, 0, 0, 255], hex: '#ff0000', opacity: 1
    });
    expect(redBorder.prismStyle.seriesStyles[2].borderThickness.cssPixels)
      .toBeCloseTo(prismThicknessToCssPixels(2), 4);
    expect(redBorder.prismStyle.seriesStyles.slice(0, 2).map(style => style.borderColor.hex))
      .toEqual(['#000000', '#000000']);
  });

  test('decodes Prism bar error-bar styles and logarithmic Y-axis bases', async () => {
    const controlled = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled');
    const read = async file => importPrismBuffer(fs.readFileSync(path.join(controlled, file)), file);
    const boxBaseline = await read('individual-baseline-boxplot-20261027.prism');
    const log2 = await read('individual-baseline-boxplot-log2-yaxis-20261027.prism');
    const log10 = await read('individual-baseline-boxplot-log10-yaxis-20261027.prism');
    const log2Scientific = await read('individual-baseline-boxplot-log2-yaxis-scientific-20261027.prism');
    const barBaseline = await read('individual-baseline-bar-20261027.prism');
    const barWidth = await read('individual-baseline-bar-treated-errorbar-5pt-20261027.prism');
    const barRed = await read('individual-baseline-bar-treated-errorbar-5pt-red-20261027.prism');

    expect(boxBaseline.prismStyle.axisScales).toMatchObject({
      x: { type: 'linear' }, primaryY: { type: 'linear' }, secondaryY: { type: 'linear' }
    });
    expect(log2.prismStyle.axisScales.primaryY).toEqual({ type: 'log', base: 2, code: 2 });
    expect(log10.prismStyle.axisScales.primaryY).toEqual({ type: 'log', base: 10, code: 1 });
    expect(log2.prismStyle.axisNumberFormats.primaryY).toEqual({ notation: 'decimal', code: 0 });
    expect(log2Scientific.prismStyle.axisScales.primaryY).toEqual({ type: 'log', base: 2, code: 2 });
    expect(log2Scientific.prismStyle.axisNumberFormats.primaryY).toEqual({ notation: 'scientific', code: 1 });
    expect(window.Shared.tableImport.resolvePrismAxisStyle(log2Scientific.prismStyle).numberFormats.primaryY)
      .toEqual({ notation: 'scientific', code: 1 });
    expect(log2.prismStyle.axisRanges.primaryY).toMatchObject({ min: 1, max: 4 });
    expect(log10.prismStyle.axisRanges.primaryY).toMatchObject({ min: 0, max: 1 });

    expect(barBaseline.prismStyle.seriesStyles.map(style => style.errorBarThickness.points))
      .toEqual([0.5, 0.5, 0.5]);
    expect(barWidth.prismStyle.seriesStyles.map(style => style.errorBarThickness.points))
      .toEqual([0.5, 0.5, 5]);
    expect(barWidth.prismStyle.seriesStyles.map(style => style.errorBarThickness.cssPixels))
      .toEqual([0.7182 * 0.5 + 0.7194, 0.7182 * 0.5 + 0.7194, 0.7182 * 5 + 0.7194]);
    expect(barRed.prismStyle.seriesStyles.map(style => style.errorColor.hex))
      .toEqual(['#000000', '#000000', '#ff0000']);
    expect(barRed.prismStyle.seriesStyles.map(style => style.errorBarThickness.points))
      .toEqual([0.5, 0.5, 5]);
  });

  test('keeps title font roles when Prism appends series text objects', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled', 'scatter-graph.prism');
    const result = await importPrismBuffer(fs.readFileSync(fixturePath), 'scatter-graph.prism');

    expect(result.prismStyle.textObjects.length).toBeGreaterThan(4);
    expect(result.prismStyle.titleTextObjects.map(item => item.fontSize)).toEqual([14, 12, 12]);
    expect(result.prismStyle.axisGeometry).toMatchObject({
      x: { cssPixelsAt96Dpi: 288 },
      y: { cssPixelsAt96Dpi: 192 }
    });
    expect(result.prismStyle.axisThickness.points).toBe(1);
    expect(result.prismStyle.axisTickLengths.x.preset).toBe('normal');
    expect(result.prismStyle.axisTickLengths.y.preset).toBe('normal');
  });

  test('imports extended multi-graph text, axis, and series-style records', async () => {
    const fixtureName = 'scatter-graph.prism';
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled', fixtureName);
    const baseline = await importPrismBuffer(fs.readFileSync(fixturePath), fixtureName);
    const variant = await buildPrismGraphRecordVariant(fixtureName);
    const result = await importPrismBuffer(variant, 'extended-graph-records.prism');

    expect(result.prismStyle.title).toBe(baseline.prismStyle.title);
    expect(result.prismStyle.xLabel).toBe(baseline.prismStyle.xLabel);
    expect(result.prismStyle.yLabel).toBe(baseline.prismStyle.yLabel);
    expect(result.prismStyle.titleTextObjects.map(item => ({ fontSize: item.fontSize, bold: item.bold })))
      .toEqual(baseline.prismStyle.titleTextObjects.map(item => ({ fontSize: item.fontSize, bold: item.bold })));
    expect(result.prismStyle.axisGeometry).toEqual(baseline.prismStyle.axisGeometry);
    expect(result.prismStyle.axisTextStyles).toEqual(baseline.prismStyle.axisTextStyles);
    expect(result.prismStyle.seriesStyles.map(style => style.fillColor.hex))
      .toEqual(baseline.prismStyle.seriesStyles.map(style => style.fillColor.hex));
  });

  test('decodes Prism X and Y tick length presets independently', async () => {
    const controlled = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled');
    const baseline = await importPrismBuffer(
      fs.readFileSync(path.join(controlled, 'individual-baseline.prism')),
      'individual-baseline.prism'
    );
    const shortY = await importPrismBuffer(
      fs.readFileSync(path.join(controlled, 'individual-baseline-yaxis-ticklength-short.prism')),
      'individual-baseline-yaxis-ticklength-short.prism'
    );

    expect(baseline.prismStyle.axisTickLengths).toEqual({
      x: { code: 3, storedValue: 3, preset: 'normal' },
      y: { code: 3, storedValue: 3, preset: 'normal' }
    });
    expect(shortY.prismStyle.axisTickLengths).toEqual({
      x: { code: 3, storedValue: 3, preset: 'normal' },
      y: { code: 2, storedValue: 2, preset: 'short' }
    });
  });

  test('scopes axis stroke and tick decoding away from per-series border records', () => {
    const bytes = new Uint8Array(4096);
    const view = new DataView(bytes.buffer);
    const records = [];
    let offset = 0;
    const addSection = ({ strokeIndex, strokeValue, tickCode = null }) => {
      records.push({ type: 0x8020, depth: 0, start: offset, size: 0 });
      offset += 1;
      if(strokeIndex != null){
        const start = offset;
        view.setUint16(start, strokeIndex, true);
        view.setUint32(start + 10, 1, true);
        view.setUint16(start + 14, strokeIndex, true);
        view.setUint32(start + 18, 1, true);
        view.setFloat32(start + 22, strokeValue, true);
        records.push({ type: 0x0023, depth: 1, start, size: 26 });
        offset += 26;
      }
      if(tickCode != null){
        const start = offset;
        view.setUint16(start, tickCode, true);
        view.setUint16(start + 8, tickCode, true);
        view.setUint16(start + 12, 1, true);
        view.setFloat32(start + 16, tickCode, true);
        records.push({ type: 0x0022, depth: 1, start, size: 20 });
        offset += 20;
      }
      records.push({ type: 0x4020, depth: 0, start: offset, size: 0 });
      offset += 2;
    };
    addSection({ strokeIndex: 10, strokeValue: 18, tickCode: 3 });
    for(let index = 0; index < 16; index += 1){
      addSection({ strokeIndex: 9, strokeValue: 12 });
    }
    addSection({ strokeIndex: 10, strokeValue: 18, tickCode: 3 });

    const prismBinary = window.Shared.prismBinary;
    const outer = { bytes, records };
    expect(prismBinary.extractAxisThickness(outer)).toEqual({ encodedValue: 18, points: 2 });
    expect(prismBinary.extractAxisTickLengths(outer)).toEqual({
      x: { code: 3, storedValue: 3, preset: 'normal' },
      y: { code: 3, storedValue: 3, preset: 'normal' }
    });
  });

  test('decodes controlled Prism frame and directional grid flags', async () => {
    const controlled = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled');
    const read = async file => importPrismBuffer(fs.readFileSync(path.join(controlled, file)), file);
    const baseline = await read('individual-baseline.prism');
    const noChange = await read('individual-baseline-nochange-20261026.prism');
    const frameOnly = await read('individual-baseline-frame-only-20261026.prism');
    const gridOnly = await read('individual-baseline-grid-only-20261026.prism');
    const frameAndGrid = await read('individual-baseline-frame-grid-20261026.prism');

    expect(noChange.prismStyle.axisFrameGrid).toEqual(baseline.prismStyle.axisFrameGrid);
    expect(baseline.prismStyle.axisFrameGrid).toEqual({
      showFrame: false,
      gridAxes: { x: false, y: false }
    });
    expect(frameOnly.prismStyle.axisFrameGrid).toEqual({
      showFrame: true,
      gridAxes: { x: false, y: false }
    });
    expect(gridOnly.prismStyle.axisFrameGrid).toEqual({
      showFrame: false,
      gridAxes: { x: false, y: true }
    });
    expect(frameAndGrid.prismStyle.axisFrameGrid).toEqual({
      showFrame: true,
      gridAxes: { x: false, y: true }
    });
    expect(window.Shared.tableImport.resolvePrismAxisStyle(gridOnly.prismStyle)).toMatchObject({
      showFrame: false,
      showGrid: null,
      gridAxes: { x: false, y: true }
    });
  });

  test('decodes X and Y tick-label size and bold settings independently', async () => {
    const controlled = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled');
    const cases = [
      ['individual-baseline.prism', { x: { fontSizePt: 11, bold: true }, y: { fontSizePt: 11, bold: true } }],
      ['individual-baseline-yaxis-labels-nonbold.prism', { x: { fontSizePt: 11, bold: true }, y: { fontSizePt: 11, bold: false } }],
      ['individual-baseline-xaxis-labels-nonbold.prism', { x: { fontSizePt: 11, bold: false }, y: { fontSizePt: 11, bold: true } }],
      ['individual-baseline-yaxis-labels-fontsize-14.prism', { x: { fontSizePt: 11, bold: true }, y: { fontSizePt: 14, bold: true } }],
      ['individual-baseline-xaxis-labels-fontsize-14.prism', { x: { fontSizePt: 14, bold: true }, y: { fontSizePt: 11, bold: true } }]
    ];

    for(const [file, expected] of cases){
      const result = await importPrismBuffer(fs.readFileSync(path.join(controlled, file)), file);
      expect(result.prismStyle.axisTextStyles).toEqual(expected);
    }
  });

  test('separates manually fixed Prism ranges from cached automatic ranges', async () => {
    const controlled = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled');
    const read = async file => importPrismBuffer(fs.readFileSync(path.join(controlled, file)), file);
    const baseline = await read('line-graph.prism');
    const yOnly = await read('line-graph-yaxis-range-probe.prism');
    const both = await read('line-graph-axis-range-probe.prism');

    expect(baseline.prismGraphBinary.axisRanges).toMatchObject({
      x: { manual: false, min: 0, max: 10, majorTickInterval: 2, tickStart: 0 },
      primaryY: { manual: false, min: 200, max: 400, majorTickInterval: 50, tickStart: 200 }
    });
    expect(yOnly.prismGraphBinary.axisRanges).toMatchObject({
      x: { manual: false, min: 0, max: 10 },
      primaryY: { manual: true, min: 220, max: 380, majorTickInterval: 40, tickStart: 220 }
    });
    expect(both.prismGraphBinary.axisRanges).toMatchObject({
      x: { manual: true, min: 1, max: 9, majorTickInterval: 2, tickStart: 1 },
      primaryY: { manual: true, min: 220, max: 380, majorTickInterval: 40, tickStart: 220 }
    });
    expect(window.Shared.tableImport.resolvePrismAxisStyle(baseline.prismStyle).ranges).toEqual({});
    expect(window.Shared.tableImport.resolvePrismAxisStyle(baseline.prismStyle).autoRanges).toEqual({
      x: { min: 0, max: 10, tickInterval: 2, tickStart: 0 },
      y: { min: 200, max: 400, tickInterval: 50, tickStart: 200 }
    });
    expect(window.Shared.tableImport.resolvePrismAxisStyle(baseline.prismStyle).tickIntervals).toEqual({ x: 2, y: 50 });
    expect(window.Shared.tableImport.resolvePrismAxisStyle(yOnly.prismStyle).ranges).toEqual({
      y: { min: 220, max: 380, tickInterval: 40, tickStart: 220 }
    });
    expect(window.Shared.tableImport.resolvePrismAxisStyle(yOnly.prismStyle).tickIntervals).toEqual({ x: 2, y: 40 });
    expect(window.Shared.tableImport.resolvePrismAxisStyle(both.prismStyle).ranges).toEqual({
      x: { min: 1, max: 9, tickInterval: 2, tickStart: 1 },
      y: { min: 220, max: 380, tickInterval: 40, tickStart: 220 }
    });
    expect(window.Shared.tableImport.resolvePrismAxisStyle(both.prismStyle).tickIntervals).toEqual({ x: 2, y: 40 });
    expect(window.Shared.tableImport.resolvePrismAxisStyle(yOnly.prismStyle).autoRanges).toEqual({
      x: { min: 0, max: 10, tickInterval: 2, tickStart: 0 }
    });
    expect(window.Shared.tableImport.resolvePrismAxisStyle(both.prismStyle).autoRanges).toEqual({});
  });

  test('does not treat missing Prism range values as zero', () => {
    const resolved = window.Shared.tableImport.resolvePrismAxisStyle({
      axisRanges: {
        x: { manual: false, min: null, max: 10, majorTickInterval: 2, tickStart: null },
        primaryY: { manual: true, min: 2, max: 8, majorTickInterval: 2, tickStart: null }
      }
    });

    expect(resolved.ranges).toEqual({});
    expect(resolved.autoRanges).toEqual({});
    expect(resolved.tickIntervals).toEqual({ x: 2, y: 2 });
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

  test.each([
    ['individual-baseline-bar.prism', 'bar', ''],
    ['individual-baseline-bar-plus-individual-value-overlay.prism', 'bar', 'overlay'],
    ['individual-baseline-boxplot.prism', 'box', '']
  ])('distinguishes Prism %s as a %s graph', async (file, graphType, pointMode) => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled', file);
    const result = await importPrismBuffer(fs.readFileSync(fixturePath), file);

    expect(result.prismMeta).toMatchObject({
      kind: 'column',
      component: 'box',
      graphType,
      graphTypeSource: 'pcff-record',
      pointMode
    });
    expect(result.prismStyle.graphType).toBe(graphType);
    expect(result.prismStyle.seriesPlotTypes.map(item => item.graphType)).toEqual(Array(3).fill(graphType));
    expect(result.prismGraphBinary.columnGraphType).toBe(graphType);
  });

  test('matches XY series styles by Prism dataset index and decodes line widths', async () => {
    const controlled = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'controlled');
    const read = async file => importPrismBuffer(fs.readFileSync(path.join(controlled, file)), file);
    const baseline = await read('line-graph.prism');
    const onePoint = await read('line-graph-mean-reaction-time-line-1pt-thickness.prism');
    const fourPoint = await read('line-graph-mean-reaction-time-line-4pt-thickness.prism');
    const red = await read('line-graph-mean-reaction-time-line-red.prism');
    const byTitle = result => Object.fromEntries(result.prismStyle.seriesStyles
      .map(series => [series.dataSetTitle, series]));
    const expectedShapes = {
      'Mean reaction time': { dataSetIndex: 0, shape: 'circle' },
      'Median reaction time': { dataSetIndex: 1, shape: 'square' },
      '25th percentile': { dataSetIndex: 2, shape: 'triangle-up' }
    };
    const expectedWidth = (points, mode, encodedValue) => ({
      encodedValue,
      points,
      mode,
      cssPixels: prismThicknessToCssPixels(points)
    });

    expect(baseline.prismMeta.component).toBe('line');
    [baseline, onePoint, fourPoint, red].forEach(result => {
      expect(byTitle(result)).toMatchObject(expectedShapes);
    });
    expect(Object.fromEntries(Object.entries(byTitle(baseline))
      .map(([title, series]) => [title, series.lineThickness])))
      .toEqual(Object.fromEntries(Object.keys(expectedShapes)
        .map(title => [title, expectedWidth(0.5, 'automatic', 8)])));
    expect(byTitle(onePoint)['Median reaction time'].lineThickness)
      .toEqual(expectedWidth(1, 'explicit', 9));
    expect(byTitle(fourPoint)['Median reaction time'].lineThickness)
      .toEqual(expectedWidth(4, 'explicit', 12));
    expect(byTitle(onePoint)['Mean reaction time'].lineThickness)
      .toEqual(expectedWidth(0.5, 'automatic', 8));
    expect(byTitle(fourPoint)['25th percentile'].lineThickness)
      .toEqual(expectedWidth(0.5, 'automatic', 8));
    expect(byTitle(red)['Median reaction time'].lineColor.hex).toBe('#ff0000');
    expect(byTitle(red)['Mean reaction time'].lineColor.hex).toBe('#000000');
    expect(byTitle(red)['25th percentile'].lineColor.hex).toBe('#000000');
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
      ['Category', '# of seeds', 'Expected'],
      ['Round and yellow', '315', ''],
      ['Round and green', '108', ''],
      ['Angular and yellow', '101', ''],
      ['Angular and green', '32', '']
    ]);
  });

  test('matches single-table PZFX styles to the equivalent Prism graph', async () => {
    const fixtureDir = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'matched-pzfx');
    const names = [
      'individual-baseline',
      'individual-baseline-axes-thickness-3pt',
      'individual-baseline-bar',
      'individual-baseline-boxplot',
      'individual-baseline-violin',
      'individual-baseline-boxplot-treated-border-red',
      'line-graph-mean-reaction-time-line-red',
      'pie-chart-import-outer-border-off-20261026'
    ];
    const seriesStyle = style => (style.seriesStyles || []).map(series => ({
      title: series.dataSetTitle,
      symbolSize: series.symbolSize,
      shape: series.shape,
      symbolColor: series.symbolColor?.hex,
      errorColor: series.errorColor?.hex,
      lineColor: series.lineColor?.hex,
      lineThickness: series.lineThickness?.points,
      fillColor: series.fillColor?.hex,
      borderColor: series.borderColor?.hex,
      borderThickness: series.borderThickness?.points
    }));

    for(const name of names){
      const prism = await importPrismBuffer(
        fs.readFileSync(path.join(fixtureDir, `${name}.prism`)), `${name}.prism`
      );
      const pzfx = await importPrismBuffer(
        fs.readFileSync(path.join(fixtureDir, `${name}.pzfx`)), `${name}.pzfx`
      );

      expect(pzfx.prismMeta.graphType).toBe(prism.prismMeta.graphType);
      expect(pzfx.prismMeta.graphTypeSource).toBe(prism.prismMeta.graphTypeSource);
      expect(pzfx.prismStyle.title).toBe(prism.prismStyle.title);
      expect(pzfx.prismStyle.axisRanges).toEqual(prism.prismStyle.axisRanges);
      expect(pzfx.prismStyle.axisNumberFormats).toEqual(prism.prismStyle.axisNumberFormats);
      expect(pzfx.prismStyle.axisGeometry).toEqual(prism.prismStyle.axisGeometry);
      expect(pzfx.prismStyle.axisThickness).toEqual(prism.prismStyle.axisThickness);
      expect(pzfx.prismStyle.axisTickLengths).toEqual(prism.prismStyle.axisTickLengths);
      expect(pzfx.prismStyle.axisTextStyles).toEqual(prism.prismStyle.axisTextStyles);
      expect(pzfx.prismStyle.pieSlices).toEqual(prism.prismStyle.pieSlices);
      expect(pzfx.prismStyle.pieBorder).toEqual(prism.prismStyle.pieBorder);
      expect(seriesStyle(pzfx.prismStyle)).toEqual(seriesStyle(prism.prismStyle));
      if(name === 'line-graph-mean-reaction-time-line-red'){
        for(const style of [prism.prismStyle, pzfx.prismStyle]){
          expect(style.seriesStyles.map(series => [series.dataSetTitle, series.shape])).toEqual([
            ['Mean reaction time', 'circle'],
            ['Median reaction time', 'square'],
            ['25th percentile', 'triangle-up']
          ]);
        }
      }
      expect(pzfx.importedRows).toEqual(prism.importedRows);
      expect(pzfx.prismUnassociatedBinary).toBeNull();
    }
  });

  test('matches derived Prism graph series to their source tables without losing per-series styles', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'matched-pzfx', 'testnew.prism');
    const buffer = fs.readFileSync(fixturePath);
    const index = await importPrismBuffer(buffer, 'testnew.prism', {}, {
      inspectPrismOnly: true,
      suppressPrismLimitations: true
    });
    const inspectTable = title => {
      const table = index.prismTables.find(item => item.title === title);
      expect(table).toBeTruthy();
      return importPrismBuffer(buffer, 'testnew.prism', {}, {
        inspectPrismOnly: true,
        suppressPrismLimitations: true,
        prismTableId: table.id
      });
    };
    const [xy, grouped, scatter, survival] = await Promise.all([
      inspectTable('XY: Entering replicate data'),
      inspectTable('Grouped: Entering replicate data'),
      inspectTable('Data 6'),
      inspectTable('Survival: Two groups')
    ]);

    const zip = await global.JSZip.loadAsync(buffer);
    const documentModel = JSON.parse(await zip.file('document.json').async('string'));
    const graphSheets = await Promise.all(documentModel.sheets.graphs.map(async id => ({
      id,
      ...JSON.parse(await zip.file(`graphs/${id}/sheet.json`).async('string'))
    })));
    const selectedXyGraph = graphSheets.find(graph => graph.title === 'XY: Entering replicate data');
    const selectedGraphImport = await importPrismBuffer(buffer, 'testnew.prism', {}, {
      inspectPrismOnly: true,
      suppressPrismLimitations: true,
      prismGraphId: selectedXyGraph.id
    });

    expect(xy.prismGraphAssociation).toMatchObject({ status: 'matched', method: 'unique-title-and-series-titles' });
    expect(selectedGraphImport).toMatchObject({
      prismTableTitle: 'XY: Entering replicate data',
      prismGraphAssociation: { status: 'matched', method: 'unique-title-and-series-titles', graphSheetId: selectedXyGraph.id }
    });
    expect(xy.prismMeta).toMatchObject({ component: 'line', graphType: 'line' });
    expect(xy.prismStyle).toMatchObject({
      title: 'XY: Entering replicate data',
      xLabel: 'Hours',
      yLabel: 'YTitle',
      axisRanges: { x: { max: 80 }, primaryY: { max: 150 } }
    });
    expect(xy.prismStyle.seriesStyles.map(item => [item.dataSetTitle, item.shape]))
      .toEqual([['Control', ''], ['Treated', '']]);

    expect(grouped.prismMeta).toMatchObject({
      component: 'box', graphType: 'strip', graphTypeSource: 'series-plot-modes'
    });
    expect(grouped.prismTables.find(table => table.title === 'Grouped: Entering replicate data')?.prismMeta)
      .toMatchObject({ component: 'box', graphType: 'strip', graphTypeSource: 'series-plot-modes' });
    expect(grouped.prismStyle.graphType).toBe('strip');
    expect(grouped.prismStyle.seriesPlotTypes.map(item => item.graphType)).toEqual(['strip', 'strip']);

    expect(scatter.prismGraphAssociation).toMatchObject({ status: 'matched', method: 'dataset-ids' });
    expect(scatter.prismStyle.yLabel).toBe('YTitle');
    expect(scatter.prismStyle.seriesStyles.map(item => [item.dataSetTitle, item.shape]))
      .toEqual([['Negative', 'circle'], ['Positive', 'square']]);
    expect(scatter.prismStyle.axisRanges).toMatchObject({ x: { max: 100 }, primaryY: { min: -100, max: 300 } });

    expect(survival.prismGraphAssociation).toMatchObject({ status: 'matched', method: 'unique-title-and-series-titles' });
    expect(survival.prismStyle).toMatchObject({
      title: 'Survival: Two groups',
      xLabel: 'Days elapsed',
      yLabel: 'Probability of Survival',
      axisRanges: { x: { max: 200 }, primaryY: { max: 110 } }
    });
    expect(survival.prismStyle.seriesStyles.map(item => item.dataSetTitle)).toEqual(['Control', 'Treated']);
    expect(survival.prismStyle.seriesStyles.map(item => [item.dataSetTitle, item.lineColor.hex]))
      .toEqual([['Control', '#000000'], ['Treated', '#a0a0a4']]);
    expect(survival.prismStyle.seriesStyles[1].barBoxBorderColor.hex).toBe('#a0a0a4');
  });

  test('emits decoded and handler-accepted Prism settings only when opted in', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'matched-pzfx', 'testnew.prism');
    const buffer = fs.readFileSync(fixturePath);
    const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
    const styleHandler = jest.fn(() => true);
    window.Shared.hot = {
      beginOwnerProjectionTransaction: () => ({ tabId: 'prism-trace-owner' }),
      isOwnerProjectionTransactionOwnerActive: () => true,
      isOwnerProjectionTransactionCurrent: () => true,
      runOwnerProjectionMutation: (_transaction, callback) => callback(),
      endOwnerProjectionTransaction: () => {},
      awaitOwnerProjectionPaint: async () => {}
    };
    try{
      await importPrismBuffer(buffer, 'testnew.prism', {}, {
        inspectPrismOnly: true,
        suppressPrismLimitations: true
      });
      expect(consoleSpy).not.toHaveBeenCalled();
      expect(window.Shared.tableImport.setPrismImportTrace(true)).toBe(true);
      await importPrismBuffer(buffer, 'testnew.prism', {}, {
        prismTableId: 'CCDF34B2-7AA7-4240-BA3D-BC85F813BA84',
        componentKey: 'scatter',
        onPrismStyle: styleHandler,
        suppressPrismLimitations: true
      });
      expect(styleHandler).toHaveBeenCalledTimes(1);
      const records = consoleSpy.mock.calls
        .filter(([message]) => message === '[Graphitix Prism import trace]')
        .map(([, record]) => record);
      expect(records.map(record => record.event)).toEqual(['started', 'decoded', 'application']);
      expect(records[1]).toMatchObject({
        association: { status: 'matched', method: 'dataset-ids' },
        decodedGroups: expect.arrayContaining(['labels', 'ranges', 'seriesStyles']),
        parameters: { labels: { y: 'YTitle' } }
      });
      expect(records[2]).toMatchObject({
        status: 'accepted', component: 'scatter',
        handlerAcceptedGroups: expect.arrayContaining(['labels', 'ranges', 'seriesStyles']),
        handlerAcceptedParameters: {
          labels: { y: 'YTitle' },
          series: expect.arrayContaining([
            expect.objectContaining({ dataset: 'Negative', shape: 'circle' }),
            expect.objectContaining({ dataset: 'Positive', shape: 'square' })
          ])
        }
      });
    }finally{
      window.Shared.tableImport.setPrismImportTrace(false);
      consoleSpy.mockRestore();
      delete window.Shared.hot;
    }
  });

  test('matches PZFX graphs across multiple templates only by a unique table title', async () => {
    const fixtureDir = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'matched-pzfx');
    const target = fs.readFileSync(path.join(fixtureDir, 'individual-baseline.pzfx'));
    const unrelated = fs.readFileSync(path.join(fixtureDir, 'line-graph-mean-reaction-time-line-red.pzfx'));
    const distinctTemplate = await importPrismBuffer(
      appendPzfxTemplate(target, unrelated), 'multi-template-distinct.pzfx'
    );
    expect(distinctTemplate.prismMeta.graphType).toBe('strip');
    expect(distinctTemplate.prismMeta.graphTypeSource).toBe('pcff-record');
    expect(distinctTemplate.prismStyle.seriesStyles.map(item => item.dataSetTitle))
      .toEqual(['Untreated', 'Placebo', 'Treated']);

    const duplicateTemplate = await importPrismBuffer(
      appendPzfxTemplate(target, target), 'multi-template-duplicate.pzfx'
    );
    expect(duplicateTemplate.prismGraphBinary).toBeNull();
    expect(duplicateTemplate.prismStyle).toBeUndefined();
    expect(duplicateTemplate.prismMeta.component).toBe('box');

    const noTemplate = await importPrismBuffer(
      removePzfxTemplates(target), 'no-template-column.pzfx'
    );
    expect(noTemplate.prismMeta.component).toBe('box');
    expect(noTemplate.prismMeta.graphType).toBe('');
    expect(noTemplate.prismStyle).toBeUndefined();
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
      ['A', '1', '100', '1', '5'],
      ['B', '2', '90', '2', '5'],
      ['C', '3', '80', '3', '5']
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
      ['XY: Entering replicate data', 'scatter'],
      ['XY: Entering mean with error values', 'unsupported'],
      ['Grouped: Entering replicate data', 'column'],
      ['Data 6', 'scatter'],
      ['Survival: Two groups', 'survival'],
      ['Data - missing columns', 'line'],
      ['Y SEN', 'unsupported'],
      ['Y CVN', 'unsupported'],
      ['Y SD', 'unsupported'],
      ['Y SE', 'unsupported'],
      ['Y CV', 'unsupported'],
      ['Y error', 'unsupported'],
      ['Y high low', 'unsupported'],
      ['Data 6', 'scatter']
    ]);
    expect(first.importedRows.slice(0, 3)).toEqual([
      ['CTRL', '', '', '', '', 'TREAT', '', '', '', ''],
      ['compound1', 'compound2', 'compound3', 'compound4', 'compound5', 'compound1', 'compound2', 'compound3', 'compound4', 'compound5'],
      ['0.7054', '0.6016', '0.5956', '0.6901', '0.602307', '1.3211', '1.137', '1.432', '1.4868', '1.599619']
    ]);
    expect(line).toMatchObject({ prismTableTitle: 'XY: Entering replicate data', prismMeta: { kind: 'scatter', component: 'scatter' } });
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

  test('routes PZFX XY tables to Scatter when no linked graph record is available', async () => {
    const first = await importPrismFixture('demo_dataset.pzfx');
    const summary = await inspectPrismFixture('demo_dataset.pzfx', 'Table5');
    const survival = await importPrismFixture('demo_dataset.pzfx', { prismTableId: 'Table14' });

    expect(first.prismTables.map(table => [table.title, table.prismMeta?.kind])).toEqual([
      ['XY: Entering replicate data', 'scatter'],
      ['XY: Entering mean with error values', 'unsupported'],
      ['Grouped: Entering replicate data', 'column'],
      ['Data 6', 'scatter'],
      ['Survival: Two groups', 'survival'],
      ['Data - missing columns', 'line'],
      ['Y SEN', 'unsupported'],
      ['Y CVN', 'unsupported'],
      ['Y SD', 'unsupported'],
      ['Y SE', 'unsupported'],
      ['Y CV', 'unsupported'],
      ['Y error', 'unsupported'],
      ['Y high low', 'unsupported'],
      ['Data 6', 'scatter']
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

  test('matches PZFX Line, Pie, and Survival styles to their Prism partners', async () => {
    const fixtureDir = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'matched-pzfx');
    const pairs = [
      { name: 'line-graph-mean-reaction-time-line-red', component: 'line' },
      { name: 'pie-chart-import-outer-border-off-20261026', component: 'pie' },
      { name: 'survival-line-1pt-20261026', component: 'survival' }
    ];
    const compareAxes = (left, right) => {
      expect(left.axisRanges).toEqual(right.axisRanges);
      expect(left.axisNumberFormats).toEqual(right.axisNumberFormats);
      expect(left.axisGeometry).toEqual(right.axisGeometry);
      expect(left.axisThickness).toEqual(right.axisThickness);
      expect(left.axisTickLengths).toEqual(right.axisTickLengths);
      expect(left.axisTextStyles).toEqual(right.axisTextStyles);
    };

    for(const pair of pairs){
      const prism = await importPrismBuffer(
        fs.readFileSync(path.join(fixtureDir, `${pair.name}.prism`)), `${pair.name}.prism`
      );
      const pzfx = await importPrismBuffer(
        fs.readFileSync(path.join(fixtureDir, `${pair.name}.pzfx`)), `${pair.name}.pzfx`
      );
      expect(pzfx.prismMeta.component).toBe(pair.component);
      expect(pzfx.prismGraphBinary).not.toBeNull();
      compareAxes(pzfx.prismStyle, prism.prismStyle);

      if(pair.component === 'line' || pair.component === 'survival'){
        const lineStyles = style => style.seriesStyles.map(series => ({
          title: series.dataSetTitle,
          color: series.lineColor?.hex,
          width: series.lineThickness?.points
        }));
        expect(lineStyles(pzfx.prismStyle)).toEqual(lineStyles(prism.prismStyle));
      }else{
        expect(pzfx.prismStyle.pieSlices.map(slice => slice.fillColor?.hex))
          .toEqual(prism.prismStyle.pieSlices.map(slice => slice.fillColor?.hex));
        expect(pzfx.prismStyle.pieBorder).toEqual(prism.prismStyle.pieBorder);
        expect(pzfx.prismStyle.pieBorder.outer).toMatchObject({
          enabled: false,
          thickness: expect.objectContaining({ points: 3 })
        });
      }
    }
  });

  test('matches graphs in a multi-table PZFX bundle by unique table and graph titles', async () => {
    const fixtureDir = path.join(__dirname, '..', 'fixtures', 'prism-binary', 'v10', 'matched-pzfx');
    const prismBuffer = fs.readFileSync(path.join(fixtureDir, 'testfile.prism'));
    const pzfxBuffer = fs.readFileSync(path.join(fixtureDir, 'testfile.pzfx'));
    const prismIndex = await importPrismBuffer(prismBuffer, 'testfile.prism');
    const pzfxIndex = await importPrismBuffer(pzfxBuffer, 'testfile.pzfx');
    const prismTitles = prismIndex.prismTables.map(table => table.title);
    expect(pzfxIndex.prismTables.map(table => table.title)).toEqual(prismTitles);

    for(const title of prismTitles){
      const prismTable = prismIndex.prismTables.find(table => table.title === title);
      const pzfxTable = pzfxIndex.prismTables.find(table => table.title === title);
      expect(pzfxTable.prismMeta).toMatchObject({
        component: prismTable.prismMeta.component,
        graphType: 'bar',
        graphTypeSource: 'pcff-record'
      });
      const prism = await importPrismBuffer(prismBuffer, 'testfile.prism', {}, {
        prismTableId: prismTable.id
      });
      const pzfx = await importPrismBuffer(pzfxBuffer, 'testfile.pzfx', {}, {
        prismTableId: pzfxTable.id
      });
      expect(pzfx.prismStyle.title).toBe(prism.prismStyle.title);
      expect(pzfx.importedRows).toEqual(prism.importedRows);
      expect(pzfx.prismStyle.xLabel).toBe(prism.prismStyle.xLabel);
      expect(pzfx.prismStyle.yLabel).toBe(prism.prismStyle.yLabel);
      expect(pzfx.prismStyle.axisRanges).toEqual(prism.prismStyle.axisRanges);
      expect(pzfx.prismStyle.axisGeometry).toEqual(prism.prismStyle.axisGeometry);
      expect(pzfx.prismStyle.axisThickness).toEqual(prism.prismStyle.axisThickness);
      expect(pzfx.prismStyle.axisTickLengths).toEqual(prism.prismStyle.axisTickLengths);
      expect(pzfx.prismStyle.axisTextStyles).toEqual(prism.prismStyle.axisTextStyles);
      expect(pzfx.prismStyle.axisFrameGrid).toEqual(prism.prismStyle.axisFrameGrid);
      expect(pzfx.prismStyle.seriesStyles.map(series => ({
        title: series.dataSetTitle,
        symbolSize: series.symbolSize,
        shape: series.shape,
        symbolColor: series.symbolColor?.hex,
        errorColor: series.errorColor?.hex,
        fillColor: series.fillColor?.hex,
        borderColor: series.borderColor?.hex,
        borderThickness: series.borderThickness?.points,
        lineColor: series.lineColor?.hex,
        lineThickness: series.lineThickness?.points
      }))).toEqual(prism.prismStyle.seriesStyles.map(series => ({
        title: series.dataSetTitle,
        symbolSize: series.symbolSize,
        shape: series.shape,
        symbolColor: series.symbolColor?.hex,
        errorColor: series.errorColor?.hex,
        fillColor: series.fillColor?.hex,
        borderColor: series.borderColor?.hex,
        borderThickness: series.borderThickness?.points,
        lineColor: series.lineColor?.hex,
        lineThickness: series.lineThickness?.points
      })));
    }
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
