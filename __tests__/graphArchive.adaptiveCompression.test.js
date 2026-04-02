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

  function parseManifest(zipInstance) {
    const manifestEntry = findEntry(zipInstance, /^manifest\.json$/);
    expect(manifestEntry).toBeTruthy();
    return JSON.parse(manifestEntry.content);
  }

  function buildScatterDefaults(labelCount) {
    const colors = ['#0000ff', '#ff0000', '#00aa00', '#ff8c00', '#800080', '#00a6d6', '#8b4513', '#ff1493', '#666666'];
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
      compressionMode: 'adaptive',
      payloadMode: 'adaptive'
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
      compressionMode: 'adaptive',
      payloadMode: 'adaptive'
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
      compressionMode: 'adaptive',
      payloadMode: 'adaptive'
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

  test('stores payload in lite mode for datasets above 1MB threshold', async () => {
    const { graphArchive, JSZipMock } = installGraphArchiveWithZipMock();
    const largeCell = 'x'.repeat((1024 * 1024) + 128);
    const payload = {
      type: 'box',
      data: [[largeCell]],
      config: { title: 'Large' }
    };

    await graphArchive.buildArchiveBlob({
      tabs: [{ title: 'Large tab', type: 'box', payload, layout: null }],
      activeIndex: 0,
      scope: 'tab',
      useWorker: false,
      compressionMode: 'adaptive',
      payloadMode: 'adaptive'
    });

    const manifest = parseManifest(JSZipMock.instance);
    expect(manifest.tabs[0].payloadMode).toBe('lite');
    const payloadEntry = findEntry(JSZipMock.instance, /\/payload\.json$/);
    expect(payloadEntry).toBeTruthy();
    const payloadJson = JSON.parse(payloadEntry.content);
    expect(Object.prototype.hasOwnProperty.call(payloadJson, 'data')).toBe(false);
  });

  test('keeps payload in full mode for datasets below 1MB threshold', async () => {
    const { graphArchive, JSZipMock } = installGraphArchiveWithZipMock();
    const payload = {
      type: 'box',
      data: [['small']],
      config: { title: 'Small' }
    };

    await graphArchive.buildArchiveBlob({
      tabs: [{ title: 'Small tab', type: 'box', payload, layout: null }],
      activeIndex: 0,
      scope: 'tab',
      useWorker: false,
      compressionMode: 'adaptive',
      payloadMode: 'adaptive'
    });

    const manifest = parseManifest(JSZipMock.instance);
    expect(manifest.tabs[0].payloadMode).toBe('full');
    const payloadEntry = findEntry(JSZipMock.instance, /\/payload\.json$/);
    expect(payloadEntry).toBeTruthy();
    const payloadJson = JSON.parse(payloadEntry.content);
    expect(Array.isArray(payloadJson.data)).toBe(true);
  });

  test('removes inline data from serialized dataViews when payload mode is lite', async () => {
    const { graphArchive, JSZipMock } = installGraphArchiveWithZipMock();
    const largeCell = 'x'.repeat((1024 * 1024) + 128);
    const payload = {
      type: 'scatter',
      data: [[largeCell]],
      dataViews: {
        version: 1,
        activeViewId: 'raw',
        views: [
          { id: 'raw', kind: 'raw', title: 'Raw', data: [[largeCell]] },
          { id: 'view-2', kind: 'derived', title: 'Derived', sourceViewId: 'raw', transformSpec: { type: 'add', value: 1 }, data: [[largeCell]] }
        ]
      },
      config: {}
    };

    await graphArchive.buildArchiveBlob({
      tabs: [{ title: 'XY Plots', type: 'scatter', payload, layout: null }],
      activeIndex: 0,
      scope: 'tab',
      useWorker: false,
      compressionMode: 'adaptive',
      payloadMode: 'adaptive'
    });

    const payloadEntry = findEntry(JSZipMock.instance, /\/payload\.json$/);
    const configEntry = findEntry(JSZipMock.instance, /\/graph-config\.json$/);
    expect(payloadEntry).toBeTruthy();
    expect(configEntry).toBeTruthy();
    const payloadJson = JSON.parse(payloadEntry.content);
    const configJson = JSON.parse(configEntry.content);
    expect(payloadJson.dataViews.views.every(view => !Object.prototype.hasOwnProperty.call(view, 'data'))).toBe(true);
    expect(configJson.dataViews.views.every(view => !Object.prototype.hasOwnProperty.call(view, 'data'))).toBe(true);
  });
});
