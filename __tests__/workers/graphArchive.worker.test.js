// Tests for js/workers/graphArchive.worker.js
// The worker wraps everything in an IIFE and binds ctx.onmessage.
// We drive it via fake postMessage calls for pure utility paths
// and separately test CSV / archive helpers via the message protocol.
//
// JSZip and graphArchiveSchema are provided as minimal stubs so
// build-archive can run end-to-end in Node.

const JSZip = require('jszip');

// Minimal archiveSchema stub — mirrors the real API surface used by the worker.
const archiveSchemaStub = {
  buildTabFileMap(folderPath, flags = {}) {
    const base = `${folderPath}/`;
    return {
      tab: `${base}tab.json`,
      payload: `${base}payload.json`,
      rawCsv: `${base}data.csv`,
      config: `${base}config.json`,
      layout: `${base}layout.json`,
      exclusions: `${base}exclusions.json`,
      preview: flags.preview ? `${base}preview.json` : null,
      renderCache: flags.renderCache ? `${base}renderCache.json` : null,
      uiState: flags.uiState ? `${base}uiState.json` : null
    };
  },
  buildArchiveReadme(manifest) {
    return `Graphitix archive — ${manifest.tabCount} tab(s)`;
  }
};

function loadWorker() {
  const ctx = {
    onmessage: null,
    postMessage: jest.fn(),
    importScripts: jest.fn(),
    JSZip,
    Shared: { graphArchiveSchema: archiveSchemaStub }
  };
  const savedSelf = global.self;
  global.self = ctx;
  jest.resetModules();
  require('../../js/workers/graphArchive.worker.js');
  global.self = savedSelf;
  return ctx;
}

function send(ctx, id, action, payload) {
  return new Promise(resolve => {
    const original = ctx.postMessage;
    ctx.postMessage = jest.fn(msg => {
      ctx.postMessage = original;
      resolve(msg);
    });
    ctx.onmessage({ data: { id, action, payload } });
  });
}

describe('graphArchive.worker — utility logic via build-archive', () => {
  let ctx;

  beforeEach(() => { ctx = loadWorker(); });

  test('unknown action returns ok:false', async () => {
    const msg = await send(ctx, '0', 'bad', {});
    expect(msg.ok).toBe(false);
    expect(typeof msg.error).toBe('string');
  });

  test('empty tabs list produces valid archive with 0 tabs', async () => {
    const msg = await send(ctx, '1', 'build-archive', { tabs: [], scope: null });
    expect(msg.ok).toBe(true);
    expect(msg.result.buffer).toBeInstanceOf(ArrayBuffer);
    // Unpack and inspect the manifest
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    expect(manifest.tabCount).toBe(0);
    expect(manifest.tabs).toHaveLength(0);
    expect(manifest.format).toBe('venn-graph-archive');
  });

  test('single-tab archive contains required files', async () => {
    const msg = await send(ctx, '2', 'build-archive', {
      tabs: [{
        title: 'My Scatter',
        type: 'scatter',
        payload: { type: 'scatter', config: { colorScheme: 'scientific' }, data: [['x', 'y'], [1, 2]] }
      }]
    });
    expect(msg.ok).toBe(true);
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    expect(manifest.tabCount).toBe(1);
    expect(manifest.tabs[0].title).toBe('My Scatter');
    expect(manifest.tabs[0].type).toBe('scatter');
    // payload.json and config.json must exist
    const payloadFile = zip.file(manifest.tabs[0].files.payload);
    const configFile = zip.file(manifest.tabs[0].files.config);
    expect(payloadFile).not.toBeNull();
    expect(configFile).not.toBeNull();
  });

  test('manifest activeIndex is clamped to valid range', async () => {
    const tabs = [{ title: 'T1', type: 'box', payload: null }, { title: 'T2', type: 'scatter', payload: null }];
    const msg = await send(ctx, '3', 'build-archive', { tabs, activeIndex: 99 });
    expect(msg.ok).toBe(true);
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    // 99 > tabCount, should be clamped to 0
    expect(manifest.activeIndex).toBe(0);
  });

  test('manifest activeIndex -1 for empty tabs', async () => {
    const msg = await send(ctx, '4', 'build-archive', { tabs: [] });
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    expect(manifest.activeIndex).toBe(-1);
  });

  test('scope is "workspace" for multi-tab', async () => {
    const tabs = [
      { title: 'A', type: 'box', payload: null },
      { title: 'B', type: 'scatter', payload: null }
    ];
    const msg = await send(ctx, '5', 'build-archive', { tabs });
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    expect(manifest.scope).toBe('workspace');
  });

  test('scope is "tab" for single tab', async () => {
    const tabs = [{ title: 'A', type: 'box', payload: null }];
    const msg = await send(ctx, '6', 'build-archive', { tabs });
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    expect(manifest.scope).toBe('tab');
  });

  test('duplicate tab titles get unique folder names', async () => {
    const tabs = [
      { title: 'Box Plot', type: 'box', payload: null },
      { title: 'Box Plot', type: 'box', payload: null }
    ];
    const msg = await send(ctx, '7', 'build-archive', { tabs });
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    const folders = manifest.tabs.map(t => t.folder);
    expect(new Set(folders).size).toBe(2);
  });

  test('README.txt is present', async () => {
    const msg = await send(ctx, '8', 'build-archive', { tabs: [] });
    const zip = await JSZip.loadAsync(msg.result.buffer);
    expect(zip.file('README.txt')).not.toBeNull();
  });

  test('archiveName gets .graph extension when missing', async () => {
    const msg = await send(ctx, '9', 'build-archive', { tabs: [], fileName: 'my-experiment' });
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    expect(manifest.fileName).toMatch(/\.graph$/i);
  });

  test('archiveName is unchanged when .graph already present', async () => {
    const msg = await send(ctx, '10', 'build-archive', { tabs: [], fileName: 'data.graph' });
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    expect(manifest.fileName).toBe('data.graph');
  });

  test('lite payload mode strips data key', async () => {
    const largeData = Array.from({ length: 2000 }, (_, i) => [i, i * 2, i * 3]);
    const msg = await send(ctx, '11', 'build-archive', {
      tabs: [{
        title: 'Big',
        type: 'scatter',
        payload: { type: 'scatter', config: {}, data: largeData }
      }],
      payloadMode: 'lite'
    });
    expect(msg.ok).toBe(true);
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    const payloadStr = await zip.file(manifest.tabs[0].files.payload).async('string');
    const payload = JSON.parse(payloadStr);
    expect(payload.data).toBeUndefined();
  });

  test('compressedCsvCount is 0 when no CSV exceeds threshold', async () => {
    const msg = await send(ctx, '12', 'build-archive', {
      tabs: [{ title: 'Small', type: 'scatter', payload: { data: [['x', 'y'], [1, 2]] } }],
      compressionMode: 'adaptive',
      compressThresholdBytes: 999999999
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.compressedCsvCount).toBe(0);
  });

  test('tab-scoped workspace id remapping in layout', async () => {
    const msg = await send(ctx, '13', 'build-archive', {
      tabs: [{
        title: 'T',
        type: 'scatter',
        runtimeTabId: 'workspace-42',
        payload: null,
        layout: { panelId: 'workspace-99-panel' }
      }]
    });
    expect(msg.ok).toBe(true);
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    const layoutStr = await zip.file(manifest.tabs[0].files.layout).async('string');
    const layout = JSON.parse(layoutStr);
    expect(layout.panelId).toBe('workspace-42-panel');
  });

  test('preview file is included when previewMarkup is provided', async () => {
    const msg = await send(ctx, '14', 'build-archive', {
      tabs: [{
        title: 'WithPreview',
        type: 'scatter',
        payload: null,
        previewMarkup: '<svg>...</svg>',
        previewSignature: 'abc123'
      }]
    });
    expect(msg.ok).toBe(true);
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    const previewFile = zip.file(manifest.tabs[0].files.preview);
    expect(previewFile).not.toBeNull();
    const preview = JSON.parse(await previewFile.async('string'));
    expect(preview.signature).toBe('abc123');
  });

  test('sanitizes special characters in tab title for folder name', async () => {
    const msg = await send(ctx, '15', 'build-archive', {
      tabs: [{ title: 'A/B*C?D', type: 'scatter', payload: null }]
    });
    expect(msg.ok).toBe(true);
    const zip = await JSZip.loadAsync(msg.result.buffer);
    const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
    // Folder path must not contain forbidden chars
    expect(manifest.tabs[0].folder).not.toMatch(/[*?"<>|]/);
  });
});
