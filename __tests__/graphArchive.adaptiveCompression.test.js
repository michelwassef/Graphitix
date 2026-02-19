describe('graphArchive adaptive compression', () => {
  function installGraphArchiveWithZipMock() {
    jest.resetModules();
    window.Shared = {};

    class JSZipMock {
      constructor() {
        this.files = [];
        JSZipMock.instance = this;
      }

      file(path, content, options) {
        this.files.push({ path, content, options });
        return this;
      }

      async generateAsync() {
        return new Blob(['zip'], { type: 'application/zip' });
      }
    }

    window.JSZip = JSZipMock;
    require('../js/shared/graphArchive.js');
    return {
      graphArchive: window.Shared.graphArchive,
      JSZipMock
    };
  }

  function findRawCsvEntry(zipInstance) {
    return (zipInstance?.files || []).find(entry => /\/raw\/data\.csv$/.test(entry.path)) || null;
  }

  function findEntry(zipInstance, suffixPattern) {
    return (zipInstance?.files || []).find(entry => suffixPattern.test(entry.path)) || null;
  }

  function buildScatterDefaults(labelCount) {
    const colors = ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffff33', '#a65628', '#f781bf', '#999999'];
    const shapes = ['circle', 'triangle', 'square', 'diamond', 'cross', 'plus', 'star'];
    const labelColors = {};
    const labelShapes = {};
    for (let i = 0; i < labelCount; i += 1) {
      const label = `L-${i}`;
      labelColors[label] = colors[i % colors.length];
      labelShapes[label] = shapes[i % shapes.length];
    }
    return { labelColors, labelShapes };
  }

  afterEach(() => {
    delete window.JSZip;
    delete window.Shared;
  });

  test('compresses raw csv when dataset exceeds 1MB threshold', async () => {
    const { graphArchive, JSZipMock } = installGraphArchiveWithZipMock();
    const largeCell = 'x'.repeat((1024 * 1024) + 128);
    const payload = {
      type: 'box',
      data: [[largeCell]]
    };

    await graphArchive.buildArchiveBlob({
      tabs: [{ title: 'Large tab', type: 'box', payload, layout: null }],
      activeIndex: 0,
      scope: 'tab',
      useWorker: false,
      compressionMode: 'adaptive'
    });

    const rawCsvEntry = findRawCsvEntry(JSZipMock.instance);
    expect(rawCsvEntry).toBeTruthy();
    expect(rawCsvEntry.options).toBeTruthy();
    expect(rawCsvEntry.options.compression).toBe('DEFLATE');
    expect(rawCsvEntry.options.compressionOptions).toEqual({ level: 1 });
  });

  test('keeps raw csv uncompressed below 1MB threshold', async () => {
    const { graphArchive, JSZipMock } = installGraphArchiveWithZipMock();
    const payload = {
      type: 'box',
      data: [['small dataset']]
    };

    await graphArchive.buildArchiveBlob({
      tabs: [{ title: 'Small tab', type: 'box', payload, layout: null }],
      activeIndex: 0,
      scope: 'tab',
      useWorker: false,
      compressionMode: 'adaptive'
    });

    const rawCsvEntry = findRawCsvEntry(JSZipMock.instance);
    expect(rawCsvEntry).toBeTruthy();
    expect(rawCsvEntry.options).toBeUndefined();
  });

  test('compacts large scatter default label maps in payload and config', async () => {
    const { graphArchive, JSZipMock } = installGraphArchiveWithZipMock();
    const { labelColors, labelShapes } = buildScatterDefaults(2000);
    const payload = {
      type: 'scatter',
      data: [['x', 'y', 'label']],
      exclusions: { rows: [], cols: [], cells: [] },
      config: {
        labelColors,
        labelShapes
      }
    };

    await graphArchive.buildArchiveBlob({
      tabs: [{ title: 'XY Plots', type: 'scatter', payload, layout: null }],
      activeIndex: 0,
      scope: 'tab',
      useWorker: false,
      compressionMode: 'adaptive'
    });

    const payloadEntry = findEntry(JSZipMock.instance, /\/payload\.json$/);
    const configEntry = findEntry(JSZipMock.instance, /\/graph-config\.json$/);
    expect(payloadEntry).toBeTruthy();
    expect(configEntry).toBeTruthy();

    const payloadJson = JSON.parse(payloadEntry.content);
    const configJson = JSON.parse(configEntry.content);
    expect(payloadJson.config.labelColors).toEqual({});
    expect(payloadJson.config.labelShapes).toEqual({});
    expect(configJson.config.labelColors).toEqual({});
    expect(configJson.config.labelShapes).toEqual({});
  });

  test('preserves non-default scatter label overrides while compacting defaults', async () => {
    const { graphArchive, JSZipMock } = installGraphArchiveWithZipMock();
    const { labelColors, labelShapes } = buildScatterDefaults(2000);
    labelColors['L-123'] = '#000000';
    labelShapes['L-456'] = 'hexagon';

    const payload = {
      type: 'scatter',
      data: [['x', 'y', 'label']],
      exclusions: { rows: [], cols: [], cells: [] },
      config: {
        labelColors,
        labelShapes
      }
    };

    await graphArchive.buildArchiveBlob({
      tabs: [{ title: 'XY Plots', type: 'scatter', payload, layout: null }],
      activeIndex: 0,
      scope: 'tab',
      useWorker: false,
      compressionMode: 'adaptive'
    });

    const payloadEntry = findEntry(JSZipMock.instance, /\/payload\.json$/);
    expect(payloadEntry).toBeTruthy();
    const payloadJson = JSON.parse(payloadEntry.content);
    expect(payloadJson.config.labelColors).toEqual({ 'L-123': '#000000' });
    expect(payloadJson.config.labelShapes).toEqual({ 'L-456': 'hexagon' });
  });
});
