describe('graphArchive payload lite load', () => {
  function installGraphArchiveWithZipLoadMock(files, transformsApi) {
    jest.resetModules();
    class JSZipMock {}
    JSZipMock.loadAsync = jest.fn(async () => ({
      file: path => {
        if (!Object.prototype.hasOwnProperty.call(files, path)) {
          return null;
        }
        return {
          async: async () => files[path]
        };
      }
    }));

    window.JSZip = JSZipMock;
    window.Shared = {
      dataTransforms: transformsApi || null
    };
    require('../js/shared/graphArchive.js');
    return window.Shared.graphArchive;
  }

  afterEach(() => {
    delete window.JSZip;
    delete window.Shared;
  });

  test('rehydrates payload data and sparse dataViews for lite payload mode', async () => {
    const files = {
      'manifest.json': JSON.stringify({
        format: 'venn-graph-archive',
        version: 2,
        scope: 'tab',
        createdAt: new Date().toISOString(),
        activeIndex: 0,
        tabCount: 1,
        tabs: [{
          index: 0,
          title: 'XY Plots',
          type: 'scatter',
          folder: 'tabs/XY Plots',
          rawDataMode: 'matrix',
          payloadMode: 'lite',
          files: {
            payload: 'tabs/XY Plots/payload.json',
            rawCsv: 'tabs/XY Plots/raw/data.csv',
            exclusions: 'tabs/XY Plots/raw/exclusions.json',
            layout: 'tabs/XY Plots/layout.json'
          }
        }]
      }),
      'tabs/XY Plots/payload.json': JSON.stringify({
        type: 'scatter',
        config: { title: 'XY' },
        dataViews: {
          version: 1,
          activeViewId: 'view-2',
          views: [
            { id: 'raw', kind: 'raw', title: 'Raw' },
            { id: 'view-2', kind: 'derived', title: 'Derived', sourceViewId: 'raw', transformSpec: { type: 'add', value: 1 } }
          ]
        },
        activeDataViewId: 'view-2'
      }),
      'tabs/XY Plots/raw/data.csv': 'A,B\r\n1,2',
      'tabs/XY Plots/raw/exclusions.json': JSON.stringify({ rows: [1], cols: [], cells: [] }),
      'tabs/XY Plots/layout.json': 'null'
    };
    const transformsApi = {
      applyTransform: jest.fn((matrix, spec) => ({
        ok: true,
        spec,
        data: Array.isArray(matrix) ? matrix.map(row => Array.isArray(row) ? row.slice() : row) : [],
        summary: { hydrated: true }
      }))
    };
    const graphArchive = installGraphArchiveWithZipLoadMock(files, transformsApi);

    const parsed = await graphArchive.parseArchiveBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, {
      fileName: 'workspace.graph'
    });

    expect(parsed?.session?.tabs?.length).toBe(1);
    const payload = parsed.session.tabs[0].payload;
    expect(Array.isArray(payload.data)).toBe(true);
    expect(payload.data.length).toBe(2);
    expect(payload.exclusions).toEqual({ rows: [1], cols: [], cells: [] });
    expect(payload.dataViews.views[0].data).toEqual(payload.data);
    expect(Array.isArray(payload.dataViews.views[1].data)).toBe(true);
    expect(payload.dataViews.views[1].data.length).toBe(2);
    expect(transformsApi.applyTransform).toHaveBeenCalled();
  });
});
