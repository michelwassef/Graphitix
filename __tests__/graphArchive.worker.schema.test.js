const fs = require('fs');
const path = require('path');
const vm = require('vm');

describe('graphArchive worker schema', () => {
  class JSZipMock {
    constructor() {
      this._files = {};
      this._options = {};
      JSZipMock.__lastInstance = this;
    }

    file(filePath, content, options) {
      this._files[filePath] = content;
      this._options[filePath] = options;
      return this;
    }

    async generateAsync() {
      JSZipMock.__lastFiles = { ...this._files };
      JSZipMock.__lastOptions = { ...this._options };
      return new ArrayBuffer(2);
    }
  }

  function loadWorker() {
    JSZipMock.__lastFiles = {};
    JSZipMock.__lastOptions = {};
    JSZipMock.__lastInstance = null;
    const workerPath = path.join(__dirname, '..', 'js', 'workers', 'graphArchive.worker.js');
    const workerDir = path.dirname(workerPath);
    const source = fs.readFileSync(workerPath, 'utf8');
    const messages = [];
    let context;
    const self = {
      JSZip: JSZipMock,
      importScripts: jest.fn(scriptPath => {
        if (/^https?:\/\//i.test(String(scriptPath || ''))) {
          return;
        }
        const resolved = path.resolve(workerDir, scriptPath);
        const importedSource = fs.readFileSync(resolved, 'utf8');
        vm.runInContext(importedSource, context, { filename: resolved });
      }),
      postMessage: message => {
        messages.push(message);
      }
    };
    context = vm.createContext({
      self,
      console,
      Object,
      String,
      Number,
      Array,
      ArrayBuffer,
      Date,
      JSON,
      RegExp,
      Math,
      Set
    });
    vm.runInContext(source, context, { filename: workerPath });
    return { self, messages };
  }

  async function buildWorkerFiles(payload) {
    const { self, messages } = loadWorker();
    await self.onmessage({
      data: {
        id: 'archive-1',
        action: 'build-archive',
        payload
      }
    });
    expect(messages[0]?.ok).toBe(true);
    return { ...JSZipMock.__lastFiles };
  }

  async function buildMainFiles(payload) {
    jest.resetModules();
    JSZipMock.__lastFiles = {};
    JSZipMock.__lastOptions = {};
    JSZipMock.__lastInstance = null;
    window.Shared = {};
    window.JSZip = JSZipMock;
    require('../js/shared/graphArchive.js');
    await window.Shared.graphArchive.buildArchiveBlob({
      ...payload,
      useWorker: false
    });
    return { ...JSZipMock.__lastFiles };
  }

  function normalizeManifestForParity(manifestText) {
    const manifest = JSON.parse(manifestText);
    delete manifest.createdAt;
    return manifest;
  }

  afterEach(() => {
    delete window.Shared;
    delete window.JSZip;
  });

  test('build-archive writes ui-state.json and advertises it in the manifest', async () => {
    const files = await buildWorkerFiles({
      tabs: [{
        title: 'Box on Data',
        type: 'box',
        payload: { type: 'box', data: [['', 'A'], ['s1', 1]], config: {} },
        layout: { version: 1, component: 'box' },
        uiState: {
          toolbarActiveSection: 'data',
          component: {
            table: {
              firstDisplayedRow: 12,
              scrollTopPx: 360,
              selection: { from: { row: 2, col: 1 }, to: { row: 4, col: 1 } }
            }
          }
        }
      }],
      activeIndex: 0,
      scope: 'workspace',
      fileName: 'worker.graph',
      payloadMode: 'full',
      compression: 'STORE'
    });

    const manifest = JSON.parse(files['manifest.json']);
    const uiStatePath = manifest.tabs[0].files.uiState;

    expect(uiStatePath).toBe('tabs/Box on Data/ui-state.json');
    expect(JSON.parse(files[uiStatePath])).toEqual({
      toolbarActiveSection: 'data',
      component: {
        table: {
          firstDisplayedRow: 12,
          scrollTopPx: 360,
          selection: { from: { row: 2, col: 1 }, to: { row: 4, col: 1 } }
        }
      }
    });
  });

  test('worker and main-thread builders both source raw.csv from the Raw DataView', async () => {
    const payload = {
      tabs: [{
        title: 'Derived active',
        type: 'scatter',
        payload: {
          type: 'scatter',
          data: [['DERIVED']],
          dataViews: {
            version: 3,
            activeViewId: 'view-2',
            views: [
              { id: 'raw', kind: 'raw', title: 'Raw', data: [['RAW'], [10]] },
              { id: 'view-2', kind: 'derived', title: 'Derived', sourceViewId: 'raw', data: [['DERIVED'], [1]] }
            ]
          },
          activeDataViewId: 'view-2',
          config: {}
        },
        layout: null
      }],
      activeIndex: 0,
      scope: 'tab',
      fileName: 'raw-contract.graph',
      payloadMode: 'full',
      compression: 'STORE'
    };

    const mainFiles = await buildMainFiles(payload);
    const workerFiles = await buildWorkerFiles(payload);
    const mainManifest = JSON.parse(mainFiles['manifest.json']);
    const workerManifest = JSON.parse(workerFiles['manifest.json']);
    const mainRawPath = mainManifest.tabs[0].files.rawCsv;
    const workerRawPath = workerManifest.tabs[0].files.rawCsv;

    expect(mainFiles[mainRawPath]).toBe('RAW\r\n10');
    expect(workerFiles[workerRawPath]).toBe('RAW\r\n10');
    expect(workerFiles[workerRawPath]).toBe(mainFiles[mainRawPath]);

    const mainPayloadPath = mainManifest.tabs[0].files.payload;
    const workerPayloadPath = workerManifest.tabs[0].files.payload;
    expect(JSON.parse(mainFiles[mainPayloadPath]).data).toEqual([['RAW'], [10]]);
    expect(JSON.parse(workerFiles[workerPayloadPath]).data).toEqual([['RAW'], [10]]);
  });


  test('worker and main-thread lite payloads retain only non-replayable derived matrices', async () => {
    const payload = {
      tabs: [{
        title: 'Lite DataViews',
        type: 'heatmap',
        payload: {
          type: 'heatmap',
          data: [['RAW']],
          dataViews: {
            version: 3,
            activeViewId: 'materialized',
            views: [
              { id: 'raw', kind: 'raw', data: [['RAW']] },
              {
                id: 'replayable',
                kind: 'derived',
                sourceViewId: 'raw',
                replayable: true,
                transformOptions: { headerRows: 0, startCol: 0 },
                transformSpec: { type: 'add', value: 1 },
                data: [['REPLAYABLE']]
              },
              {
                id: 'materialized',
                kind: 'derived',
                sourceViewId: 'raw',
                replayable: false,
                transformOptions: null,
                transformSpec: { type: 'heatmapCorrelationMatrix' },
                data: [['MATERIALIZED']]
              }
            ]
          },
          activeDataViewId: 'materialized',
          config: {}
        },
        layout: null
      }],
      activeIndex: 0,
      scope: 'tab',
      fileName: 'lite-dataviews.graph',
      payloadMode: 'lite',
      compression: 'STORE'
    };

    const mainFiles = await buildMainFiles(payload);
    const workerFiles = await buildWorkerFiles(payload);
    const mainManifest = JSON.parse(mainFiles['manifest.json']);
    const workerManifest = JSON.parse(workerFiles['manifest.json']);
    const mainPayload = JSON.parse(mainFiles[mainManifest.tabs[0].files.payload]);
    const workerPayload = JSON.parse(workerFiles[workerManifest.tabs[0].files.payload]);
    const mainConfig = JSON.parse(mainFiles[mainManifest.tabs[0].files.config]);
    const workerConfig = JSON.parse(workerFiles[workerManifest.tabs[0].files.config]);

    expect(mainPayload.dataViews).toEqual(workerPayload.dataViews);
    expect(Object.prototype.hasOwnProperty.call(mainPayload.dataViews.views[0], 'data')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(mainPayload.dataViews.views[1], 'data')).toBe(false);
    expect(mainPayload.dataViews.views[2].data).toEqual([['MATERIALIZED']]);
    expect(mainConfig.dataViews.views.every(view => !Object.prototype.hasOwnProperty.call(view, 'data'))).toBe(true);
    expect(workerConfig.dataViews.views.every(view => !Object.prototype.hasOwnProperty.call(view, 'data'))).toBe(true);
  });

  test('main-thread and worker archive builders advertise the same schema files', async () => {
    const payload = {
      tabs: [{
        title: 'Box/One',
        type: 'box',
        payload: {
          type: 'box',
          data: [['Group A', 'Group B'], [1, 2]],
          exclusions: { rows: [2], cols: [], cells: [] },
          config: { stats: { test: 'anova' } },
          dataViews: {
            activeViewId: 'filtered',
            views: [
              { id: 'base', data: [['Group A', 'Group B'], [1, 2]] },
              { id: 'filtered', data: [['Group A'], [1]] }
            ]
          }
        },
        layout: { version: 1, component: 'box' },
        previewMarkup: '<svg></svg>',
        previewSignature: 'preview:sig',
        previewMeta: { rows: 2 },
        archiveRenderCache: { plot: '<svg data-cache="1"></svg>' },
        archiveRenderCacheSignature: 'payload:sig',
        archiveRenderCacheLayoutSignature: 'layout:sig',
        uiState: {
          toolbarActiveSection: 'data',
          component: {
            table: {
              firstDisplayedRow: 5
            }
          }
        }
      }],
      activeIndex: 0,
      scope: 'workspace',
      fileName: 'parity.graph',
      payloadMode: 'full',
      compression: 'STORE'
    };

    const mainFiles = await buildMainFiles(payload);
    const workerFiles = await buildWorkerFiles(payload);
    const mainManifest = normalizeManifestForParity(mainFiles['manifest.json']);
    const workerManifest = normalizeManifestForParity(workerFiles['manifest.json']);

    expect(workerManifest).toEqual(mainManifest);
    expect(Object.keys(workerFiles).sort()).toEqual(Object.keys(mainFiles).sort());
    [
      'tabs/Box_One/payload.json',
      'tabs/Box_One/graph-config.json',
      'tabs/Box_One/layout.json',
      'tabs/Box_One/preview.json',
      'tabs/Box_One/render-cache.json',
      'tabs/Box_One/ui-state.json'
    ].forEach(filePath => {
      expect(workerFiles[filePath]).toEqual(mainFiles[filePath]);
    });
    expect(workerFiles['README.txt']).toContain('ui-state.json');
    expect(mainFiles['README.txt']).toContain('ui-state.json');
  });
});
