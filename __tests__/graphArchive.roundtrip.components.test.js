describe('graphArchive component round-trip', () => {
  class JSZipMock {
    constructor() {
      this._files = {};
    }

    file(path, content) {
      this._files[path] = content;
      return this;
    }

    async generateAsync() {
      JSZipMock.__lastFiles = { ...this._files };
      return new Blob(['PK'], { type: 'application/zip' });
    }

    static async loadAsync() {
      const files = JSZipMock.__lastFiles || {};
      return {
        file(path) {
          if (!Object.prototype.hasOwnProperty.call(files, path)) {
            return null;
          }
          return {
            async: async () => files[path]
          };
        }
      };
    }
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createComponentFixtures() {
    return [
      {
        title: 'Venn',
        type: 'venn',
        payload: {
          type: 'venn',
          data: { labelA: 'A', labelB: 'B', labelC: 'C', listA: 'x\ny', listB: 'y\nz', listC: '' },
          style: { plotType: 'venn', opacity: '0.6', upset: { sort: 'size', maxIntersections: 10 } },
          notes: { text: 'note', open: true },
          analysis: { activeResultsTab: 'go', goPerformed: true, goResult: [{ term: 'GO:0001', p: 0.01 }] }
        },
        layout: { version: 1, component: 'venn', minSvgWidth: 560 }
      },
      {
        title: 'Box',
        type: 'box',
        payload: {
          type: 'box',
          data: [['Group', 'A', 'B'], ['', '1', '2']],
          exclusions: { rows: [1], cols: [], cells: [] },
          dataViews: {
            version: 1,
            activeViewId: 'raw',
            views: [{ id: 'raw', kind: 'raw', title: 'Raw', data: [['Group', 'A', 'B'], ['', '1', '2']] }]
          },
          activeDataViewId: 'raw',
          config: { title: 'Box', stats: { test: 'parametric', alpha: 0.05 }, notes: { text: '', open: false } }
        },
        layout: { version: 1, component: 'box', minSvgWidth: 620 }
      },
      {
        title: 'Scatter',
        type: 'scatter',
        payload: {
          type: 'scatter',
          data: [['', 'X', 'Y'], ['', '1', '2']],
          exclusions: { rows: [], cols: [], cells: [] },
          dataViews: {
            version: 1,
            activeViewId: 'view-1',
            views: [
              { id: 'raw', kind: 'raw', title: 'Raw', data: [['', 'X', 'Y'], ['', '1', '2']] },
              { id: 'view-1', kind: 'derived', title: 'Log', sourceViewId: 'raw', transformSpec: { type: 'log10' }, data: [['', 'X', 'Y'], ['', '0', '0.3010']] }
            ]
          },
          activeDataViewId: 'view-1',
          config: { graphType: 'scatter', stats: { statType: 'pearson', showCI: true }, notes: { text: 'scatter', open: false } }
        },
        layout: { version: 1, component: 'scatter', minSvgWidth: 640 }
      },
      {
        title: 'PCA',
        type: 'pca',
        payload: {
          type: 'pca',
          data: [['Label', false, false], ['Sample', 'S1', 'S2'], ['F1', '1', '2']],
          exclusions: { rows: [], cols: [], cells: [] },
          dataViews: { version: 1, activeViewId: 'raw', views: [{ id: 'raw', kind: 'raw', title: 'Raw', data: [['Label', false, false], ['Sample', 'S1', 'S2'], ['F1', '1', '2']] }] },
          activeDataViewId: 'raw',
          config: { method: 'pca', axisSelection: { x: 1, y: 2, z: 3 }, notes: { text: '', open: false }, stats: { resultsModel: { schemaVersion: 1, kind: 'stats-panel', children: [{ type: 'element', tag: 'div', children: [{ type: 'text', text: 'ok' }] }] } } },
          stats: { method: 'pca', dimensions: 2, scree: [0.8, 0.2] }
        },
        layout: { version: 1, component: 'pca', minSvgWidth: 600 }
      },
      {
        title: 'Line',
        type: 'line',
        payload: {
          type: 'line',
          data: [['X', 'S1'], ['1', '2']],
          exclusions: { rows: [], cols: [], cells: [] },
          dataViews: { version: 1, activeViewId: 'raw', views: [{ id: 'raw', kind: 'raw', title: 'Raw', data: [['X', 'S1'], ['1', '2']] }] },
          activeDataViewId: 'raw',
          config: { viewMode: '2d', showTrendLine: true, stats: { signature: 'sig-1', version: 3, lastRunVersion: 3, resultsModel: { schemaVersion: 1, kind: 'stats-panel', children: [{ type: 'element', tag: 'table' }] } }, notes: { text: '', open: false } }
        },
        layout: { version: 1, component: 'line', minSvgWidth: 600 }
      },
      {
        title: 'Heatmap',
        type: 'heatmap',
        payload: {
          type: 'heatmap',
          data: [['', 'S1'], ['G1', '1.5']],
          exclusions: { rows: [], cols: [], cells: [] },
          dataViews: { version: 1, activeViewId: 'raw', views: [{ id: 'raw', kind: 'raw', title: 'Raw', data: [['', 'S1'], ['G1', '1.5']] }] },
          activeDataViewId: 'raw',
          stats: { type: 'values', rowCount: 1, colCount: 1, min: 1.5, max: 1.5, decimals: 2 },
          config: { method: 'pearson', notes: { text: '', open: false } }
        },
        layout: { version: 1, component: 'heatmap', minSvgWidth: 580 }
      },
      {
        title: 'Surface',
        type: 'surface',
        payload: {
          type: 'surface',
          data: [['X', 'Y', 'Z'], ['1', '2', '3']],
          exclusions: { rows: [], cols: [], cells: [] },
          dataViews: { version: 1, activeViewId: 'raw', views: [{ id: 'raw', kind: 'raw', title: 'Raw', data: [['X', 'Y', 'Z'], ['1', '2', '3']] }] },
          activeDataViewId: 'raw',
          stats: { vertexCount: 1, faceCount: 0, zMin: 3, zMax: 3, skipped: 0, gridColumns: 1, gridRows: 1, gridComplete: false },
          config: { axisMap: { x: 0, y: 1, z: 2 }, notes: { text: '', open: false } }
        },
        layout: { version: 1, component: 'surface', minSvgWidth: 620 }
      },
      {
        title: 'ROC',
        type: 'roc',
        payload: {
          type: 'roc',
          data: [['Label', 'Score'], ['1', '0.9']],
          exclusions: { rows: [], cols: [], cells: [] },
          dataViews: {
            version: 1,
            activeViewId: 'derived-1',
            views: [
              { id: 'raw', kind: 'raw', title: 'Raw', data: [['Label', 'Score'], ['1', '0.9']] },
              { id: 'derived-1', kind: 'derived', title: 'Filtered', sourceViewId: 'raw', transformSpec: { type: 'filterRows' }, data: [['Label', 'Score'], ['1', '0.9']] }
            ]
          },
          activeDataViewId: 'derived-1',
          config: { graphType: 'roc', showLegend: true, notes: { text: '', open: false } },
          stats: { diffMethod: 'delong', compareSelection: '0,1' }
        },
        layout: { version: 1, component: 'roc', minSvgWidth: 590 }
      },
      {
        title: 'Survival',
        type: 'survival',
        payload: {
          type: 'survival',
          data: [['A', '1', '1', ''], ['B', '2', '0', '']],
          exclusions: { rows: [], cols: [], cells: [] },
          dataViews: { version: 1, activeViewId: 'raw', views: [{ id: 'raw', kind: 'raw', title: 'Raw', data: [['A', '1', '1', ''], ['B', '2', '0', '']] }] },
          activeDataViewId: 'raw',
          config: { fitCoxModel: true, covariateSettings: { Age: { enabled: true, type: 'baseline' } }, notes: { text: 'survival', open: true } },
          stats: { logRank: { available: true, p: 0.04 } }
        },
        layout: { version: 1, component: 'survival', minSvgWidth: 610 }
      },
      {
        title: 'Hist',
        type: 'hist',
        payload: {
          type: 'hist',
          data: [['Value'], ['1']],
          exclusions: { rows: [], cols: [], cells: [] },
          dataViews: { version: 1, activeViewId: 'raw', views: [{ id: 'raw', kind: 'raw', title: 'Raw', data: [['Value'], ['1']] }] },
          activeDataViewId: 'raw',
          config: { bins: '12', stats: { diagnosticsMode: 'normality' }, notes: { text: '', open: false } }
        },
        layout: { version: 1, component: 'hist', minSvgWidth: 560 }
      },
      {
        title: 'Pie',
        type: 'pie',
        payload: {
          type: 'pie',
          data: [['Category', 'Value', 'Expected'], ['A', '10', '12']],
          exclusions: { rows: [], cols: [], cells: [] },
          dataViews: { version: 1, activeViewId: 'raw', views: [{ id: 'raw', kind: 'raw', title: 'Raw', data: [['Category', 'Value', 'Expected'], ['A', '10', '12']] }] },
          activeDataViewId: 'raw',
          config: { chartType: 'pie', stats: { scope: 'gof', test: 'chi-square', alpha: 0.05 }, notes: { text: '', open: false } }
        },
        layout: { version: 1, component: 'pie', minSvgWidth: 560 }
      }
    ];
  }

  beforeEach(() => {
    jest.resetModules();
    JSZipMock.__lastFiles = {};
    window.JSZip = JSZipMock;
    window.Shared = {};
    require('../js/shared/graphArchive.js');
  });

  afterEach(() => {
    delete window.JSZip;
    delete window.Shared;
  });

  test('full-mode .graph archives round-trip payload and layout for every component fixture', async () => {
    const graphArchive = window.Shared.graphArchive;
    const tabs = createComponentFixtures().map(tab => ({
      title: tab.title,
      type: tab.type,
      payload: clone(tab.payload),
      layout: clone(tab.layout)
    }));
    const expectedTabs = clone(tabs);

    await graphArchive.buildArchiveBlob({
      tabs,
      activeIndex: 3,
      scope: 'workspace',
      fileName: 'publication.graph',
      payloadMode: 'full',
      compression: 'STORE'
    });

    const parsed = await graphArchive.parseArchiveBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, {
      fileName: 'publication.graph'
    });

    expect(parsed?.source).toBe('graph-archive');
    expect(parsed?.session?.scope).toBe('workspace');
    expect(parsed?.session?.activeIndex).toBe(3);
    expect(Array.isArray(parsed?.session?.tabs)).toBe(true);
    expect(parsed.session.tabs.length).toBe(expectedTabs.length);
    expectedTabs.forEach((expected, idx) => {
      const actual = parsed.session.tabs[idx];
      expect(actual.title).toBe(expected.title);
      expect(actual.type).toBe(expected.type);
      expect(actual.payload).toEqual(expected.payload);
      expect(actual.layout).toEqual(expected.layout);
    });
  });

  test('uiState round-trips through .graph archives (toolbar active sub-page)', async () => {
    const graphArchive = window.Shared.graphArchive;
    const tabs = [
      {
        title: 'Box on Format',
        type: 'box',
        payload: { type: 'box', data: [['', 'A', 'B'], ['s1', 1, 2]], config: {} },
        layout: { version: 1, component: 'box' },
        uiState: { toolbarActiveSection: 'format', toolbarManualSection: 'format' }
      },
      {
        title: 'Scatter on Data',
        type: 'scatter',
        payload: { type: 'scatter', data: [['', 'X', 'Y'], ['p1', 1, 2]], config: {} },
        layout: { version: 1, component: 'scatter' },
        uiState: { toolbarActiveSection: 'data' }
      }
    ];
    const expectedUiStates = tabs.map(t => clone(t.uiState));

    await graphArchive.buildArchiveBlob({
      tabs,
      activeIndex: 0,
      scope: 'workspace',
      fileName: 'workspace.graph',
      payloadMode: 'full',
      compression: 'STORE'
    });

    const parsed = await graphArchive.parseArchiveBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, {
      fileName: 'workspace.graph'
    });

    expect(parsed?.session?.tabs?.length).toBe(2);
    expect(parsed.session.tabs[0].uiState).toEqual(expectedUiStates[0]);
    expect(parsed.session.tabs[1].uiState).toEqual(expectedUiStates[1]);
  });

  test('uiState.component (table scroll + selection) round-trips through .graph archives', async () => {
    const graphArchive = window.Shared.graphArchive;
    const tabs = [
      {
        title: 'Box with table state',
        type: 'box',
        payload: { type: 'box', data: [['', 'A', 'B'], ['s1', 1, 2], ['s2', 3, 4]], config: {} },
        layout: { version: 1, component: 'box' },
        uiState: {
          toolbarActiveSection: 'data',
          component: {
            table: {
              firstDisplayedRow: 47,
              scrollTopPx: 1280,
              selection: { from: { row: 5, col: 1 }, to: { row: 8, col: 3 } }
            }
          }
        }
      }
    ];
    const expected = clone(tabs[0].uiState);

    await graphArchive.buildArchiveBlob({
      tabs,
      activeIndex: 0,
      scope: 'workspace',
      fileName: 'workspace.graph',
      payloadMode: 'full',
      compression: 'STORE'
    });

    const parsed = await graphArchive.parseArchiveBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, {
      fileName: 'workspace.graph'
    });

    expect(parsed?.session?.tabs?.[0]?.uiState).toEqual(expected);
  });

  test('uiState absence stays null after a round-trip (back-compat with older archives)', async () => {
    const graphArchive = window.Shared.graphArchive;
    const tabs = [
      {
        title: 'No UI state',
        type: 'box',
        payload: { type: 'box', data: [['', 'A'], ['s1', 1]], config: {} },
        layout: { version: 1, component: 'box' }
      }
    ];

    await graphArchive.buildArchiveBlob({
      tabs,
      activeIndex: 0,
      scope: 'workspace',
      fileName: 'no-uistate.graph',
      payloadMode: 'full',
      compression: 'STORE'
    });

    const parsed = await graphArchive.parseArchiveBuffer(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer, {
      fileName: 'no-uistate.graph'
    });

    expect(parsed?.session?.tabs?.[0]?.uiState ?? null).toBeNull();
  });
});
