(function(ctx) {
  'use strict';

  const ZIP_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  const Shared = ctx.Shared = ctx.Shared || {};
  if (!Shared.graphArchiveSchema) {
    ctx.importScripts('../shared/graphArchiveSchema.js');
  }
  const archiveSchema = Shared.graphArchiveSchema;
  const ARCHIVE_FORMAT = 'venn-graph-archive';
  const ARCHIVE_VERSION = 3;
  const DEFAULT_TAB_TITLE = 'Workspace';
  const DEFAULT_THRESHOLD_BYTES = 1024 * 1024;
  const DEFAULT_LEVEL = 1;
  const DEFAULT_PAYLOAD_LITE_THRESHOLD_BYTES = 1024 * 1024;
  const SCATTER_DEFAULT_LABEL_COLORS = Object.freeze([
    '#0000ff', '#ff0000', '#00aa00', '#ff8c00', '#800080',
    '#00a6d6', '#8b4513', '#ff1493', '#666666'
  ]);
  const SCATTER_DEFAULT_LABEL_SHAPES = Object.freeze([
    'circle', 'triangle', 'square', 'diamond', 'cross', 'plus', 'star'
  ]);

  function ensureZip() {
    if (ctx.JSZip) {
      return ctx.JSZip;
    }
    ctx.importScripts(ZIP_SCRIPT_URL);
    if (!ctx.JSZip) {
      throw new Error('JSZip unavailable in graphArchive worker.');
    }
    return ctx.JSZip;
  }

  function sanitizeSegment(value, fallback) {
    const base = String(value || '').trim();
    const fallbackValue = String(fallback || 'workspace').trim() || 'workspace';
    const source = base || fallbackValue;
    const sanitized = source
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/[\u0000-\u001f\u007f]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return sanitized || fallbackValue;
  }

  function ensureGraphExtension(name, fallback) {
    const base = String(name || '').trim() || String(fallback || '').trim() || 'workspace.graph';
    return /\.graph$/i.test(base) ? base : `${base}.graph`;
  }

  function resolveActiveIndex(activeIndex, tabCount) {
    if (!Number.isFinite(activeIndex)) {
      return tabCount > 0 ? 0 : -1;
    }
    if (activeIndex < 0 || activeIndex >= tabCount) {
      return tabCount > 0 ? 0 : -1;
    }
    return activeIndex;
  }

  function normalizeScope(scope, tabCount) {
    if (scope === 'tab' || scope === 'workspace') {
      return scope;
    }
    if (tabCount > 1) {
      return 'workspace';
    }
    if (tabCount === 1) {
      return 'tab';
    }
    return null;
  }

  function makeUniqueFolderName(baseName, seen) {
    let next = baseName || 'workspace';
    let suffix = 2;
    while (seen.has(next.toLowerCase())) {
      next = `${baseName} (${suffix++})`;
    }
    seen.add(next.toLowerCase());
    return next;
  }


  function cloneValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      return value;
    }
  }

  function remapRuntimeWorkspaceString(value, targetTabId) {
    const target = String(targetTabId || '').trim();
    if (!target || typeof value !== 'string') {
      return value;
    }
    return value.replace(/workspace-\d+/g, target);
  }

  function rehomeTabScopedArchiveState(value, targetTabId, seen = new WeakSet()) {
    const target = String(targetTabId || '').trim();
    if (!target || value === null || value === undefined) {
      return value;
    }
    if (typeof value === 'string') {
      return remapRuntimeWorkspaceString(value, target);
    }
    if (typeof value !== 'object' || seen.has(value)) {
      return value;
    }
    seen.add(value);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        value[i] = rehomeTabScopedArchiveState(value[i], target, seen);
      }
      return value;
    }
    Object.keys(value).forEach(key => {
      const nextKey = remapRuntimeWorkspaceString(key, target);
      const nextValue = rehomeTabScopedArchiveState(value[key], target, seen);
      if (nextKey !== key) {
        delete value[key];
      }
      value[nextKey] = nextValue;
    });
    return value;
  }

  function cloneAndRehomeTabScopedArchiveState(value, targetTabId) {
    if (value === null || value === undefined) {
      return value;
    }
    return rehomeTabScopedArchiveState(cloneValue(value), targetTabId);
  }

  function escapeCsvCell(value) {
    const text = value == null ? '' : String(value);
    if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function rowsToCsv(rows) {
    if (!Array.isArray(rows) || !rows.length) {
      return '';
    }
    const lines = new Array(rows.length);
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (Array.isArray(row)) {
        const cells = new Array(row.length);
        for (let j = 0; j < row.length; j += 1) {
          cells[j] = escapeCsvCell(row[j]);
        }
        lines[i] = cells.join(',');
      } else {
        lines[i] = escapeCsvCell(row);
      }
    }
    return lines.join('\r\n');
  }

  function buildRawDataExport(data) {
    if (Array.isArray(data)) {
      const isMatrix = data.length === 0 || data.every(item => Array.isArray(item));
      if (isMatrix) {
        return { mode: 'matrix', csvText: rowsToCsv(data) };
      }
      const lines = new Array(data.length);
      for (let i = 0; i < data.length; i += 1) {
        lines[i] = escapeCsvCell(data[i]);
      }
      return { mode: 'vector', csvText: lines.join('\r\n') };
    }
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      const rows = new Array(keys.length + 1);
      rows[0] = ['field', 'value'];
      for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        const raw = data[key];
        const value = (raw !== null && typeof raw === 'object')
          ? JSON.stringify(raw)
          : String(raw == null ? '' : raw);
        rows[i + 1] = [key, value];
      }
      return { mode: 'object', csvText: rowsToCsv(rows) };
    }
    if (data === undefined) {
      return { mode: 'none', csvText: '' };
    }
    return { mode: 'value', csvText: escapeCsvCell(String(data)) };
  }

  function stripRawDataFromPayload(payload) {
    if (!payload || typeof payload !== 'object') {
      return payload;
    }
    const config = {};
    const keys = Object.keys(payload);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key === 'data' || key === 'exclusions') {
        continue;
      }
      if (key === 'dataViews') {
        config[key] = sanitizeDataViewsForArchive(payload[key], false);
        continue;
      }
      config[key] = payload[key];
    }
    return config;
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function matchesScatterDefaultValue(value, index, defaults) {
    const currentDefault = defaults[index % defaults.length];
    if (value === currentDefault) {
      return true;
    }
    return false;
  }

  function compactScatterCategoricalMap(mapValue, defaults) {
    if (!isPlainObject(mapValue) || !Array.isArray(defaults) || !defaults.length) {
      return mapValue;
    }
    const keys = Object.keys(mapValue);
    if (!keys.length || keys.length < 1000) {
      return mapValue;
    }
    const compact = {};
    let prunedCount = 0;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = mapValue[key];
      if (matchesScatterDefaultValue(value, i, defaults)) {
        prunedCount += 1;
      } else {
        compact[key] = value;
      }
    }
    return prunedCount ? compact : mapValue;
  }

  function optimizePayloadForArchive(rawPayload) {
    if (!isPlainObject(rawPayload)) {
      return rawPayload;
    }
    if (rawPayload.type !== 'scatter' || !isPlainObject(rawPayload.config)) {
      return rawPayload;
    }
    const config = rawPayload.config;
    const nextLabelColors = compactScatterCategoricalMap(config.labelColors, SCATTER_DEFAULT_LABEL_COLORS);
    const nextLabelShapes = compactScatterCategoricalMap(config.labelShapes, SCATTER_DEFAULT_LABEL_SHAPES);
    const changed = nextLabelColors !== config.labelColors || nextLabelShapes !== config.labelShapes;
    if (!changed) {
      return rawPayload;
    }
    return {
      ...rawPayload,
      config: {
        ...config,
        labelColors: nextLabelColors,
        labelShapes: nextLabelShapes
      }
    };
  }

  function estimateUtf8Bytes(text) {
    const source = String(text || '');
    if (!source) {
      return 0;
    }
    let bytes = 0;
    for (let i = 0; i < source.length; i += 1) {
      const code = source.charCodeAt(i);
      if (code < 0x80) {
        bytes += 1;
      } else if (code < 0x800) {
        bytes += 2;
      } else if (code >= 0xd800 && code <= 0xdbff) {
        i += 1;
        bytes += 4;
      } else {
        bytes += 3;
      }
    }
    return bytes;
  }

  function resolvePayloadStoragePolicy(options) {
    const mode = options?.payloadMode || 'adaptive';
    const thresholdBytes = Number.isFinite(options?.payloadLiteThresholdBytes)
      ? options.payloadLiteThresholdBytes
      : DEFAULT_PAYLOAD_LITE_THRESHOLD_BYTES;
    if (mode === 'full' || mode === 'lite') {
      return {
        mode,
        thresholdBytes
      };
    }
    return {
      mode: 'adaptive',
      thresholdBytes
    };
  }

  function resolvePayloadModeFromByteLength(byteLength, policy) {
    if (!policy || policy.mode === 'full') {
      return 'full';
    }
    if (policy.mode === 'lite') {
      return 'lite';
    }
    return byteLength >= policy.thresholdBytes ? 'lite' : 'full';
  }

  function sanitizeDataViewsForArchive(dataViewsValue, includeData) {
    if (!isPlainObject(dataViewsValue) || !Array.isArray(dataViewsValue.views)) {
      return dataViewsValue;
    }
    if (includeData !== false) {
      return dataViewsValue;
    }
    const sourceViews = dataViewsValue.views;
    const nextViews = new Array(sourceViews.length);
    let changed = false;
    for (let i = 0; i < sourceViews.length; i += 1) {
      const view = sourceViews[i];
      if (!isPlainObject(view)) {
        nextViews[i] = view;
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(view, 'data')) {
        nextViews[i] = view;
        continue;
      }
      const nextView = { ...view };
      delete nextView.data;
      nextViews[i] = nextView;
      changed = true;
    }
    if (!changed) {
      return dataViewsValue;
    }
    return {
      ...dataViewsValue,
      views: nextViews
    };
  }

  function buildLitePayload(rawPayload) {
    if (!isPlainObject(rawPayload)) {
      return rawPayload;
    }
    const lite = {};
    const keys = Object.keys(rawPayload);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      if (key === 'data' || key === 'exclusions') {
        continue;
      }
      if (key === 'dataViews') {
        lite[key] = sanitizeDataViewsForArchive(rawPayload[key], false);
        continue;
      }
      lite[key] = rawPayload[key];
    }
    return lite;
  }

  function buildArchiveReadme(manifest) {
    return archiveSchema.buildArchiveReadme(manifest);
  }

  async function buildArchive(payload) {
    const options = payload || {};
    const tabs = Array.isArray(options.tabs) ? options.tabs : [];
    const activeIndex = resolveActiveIndex(Number(options.activeIndex), tabs.length);
    const scope = normalizeScope(options.scope, tabs.length);
    const archiveName = ensureGraphExtension(options.fileName || '', 'workspace.graph');
    const payloadPolicy = resolvePayloadStoragePolicy(options);
    const JSZip = ensureZip();
    const zip = new JSZip();
    const seenFolders = new Set();
    let compressedCsvCount = 0;

    const manifest = {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      scope,
      createdAt: new Date().toISOString(),
      fileName: archiveName,
      activeIndex,
      tabCount: tabs.length,
      tabs: []
    };

    for (let index = 0; index < tabs.length; index += 1) {
      const tab = tabs[index] || {};
      const tabTitle = String(tab.title || `${DEFAULT_TAB_TITLE} ${index + 1}`).trim() || `${DEFAULT_TAB_TITLE} ${index + 1}`;
      const safeSegment = sanitizeSegment(tabTitle, `${DEFAULT_TAB_TITLE}-${index + 1}`);
      const uniqueSegment = makeUniqueFolderName(safeSegment, seenFolders);
      const folderPath = `tabs/${uniqueSegment}`;
      const payloadData = optimizePayloadForArchive(tab.payload || null);
      const rawPayload = isPlainObject(payloadData) ? payloadData : null;
      const layout = tab.layout || null;
      const rawData = buildRawDataExport(rawPayload ? rawPayload.data : null);
      const csvText = rawData.csvText || '';
      const rawCsvByteLength = estimateUtf8Bytes(csvText);
      const payloadMode = resolvePayloadModeFromByteLength(rawCsvByteLength, payloadPolicy);
      const payloadForArchive = payloadMode === 'lite' ? buildLitePayload(payloadData) : payloadData;
      const config = stripRawDataFromPayload(payloadData);
      const exclusions = rawPayload && Object.prototype.hasOwnProperty.call(rawPayload, 'exclusions')
        ? payloadData.exclusions
        : undefined;
      const hasPreview = typeof tab?.previewMarkup === 'string' && tab.previewMarkup.trim().length > 0;
      const hasArchiveRenderCache = !!(tab?.archiveRenderCache && typeof tab.archiveRenderCache === 'object');
      const hasUiState = !!(tab?.uiState && typeof tab.uiState === 'object' && Object.keys(tab.uiState).length > 0);

      const tabFiles = archiveSchema.buildTabFileMap(folderPath, {
        preview: hasPreview,
        renderCache: hasArchiveRenderCache,
        uiState: hasUiState
      });
      const runtimeTabId = typeof tab.runtimeTabId === 'string'
        ? tab.runtimeTabId
        : (typeof tab.id === 'string' ? tab.id : null);
      const rehomeForRuntimeTab = value => runtimeTabId ? cloneAndRehomeTabScopedArchiveState(value, runtimeTabId) : value;
      const tabManifest = {
        index,
        title: tabTitle,
        type: typeof tab.type === 'string' ? tab.type : (typeof payloadData?.type === 'string' ? payloadData.type : null),
        folder: folderPath,
        runtimeTabId,
        rawDataMode: rawData.mode,
        payloadMode,
        files: tabFiles
      };

      zip.file(tabManifest.files.tab, JSON.stringify({
        title: tabManifest.title,
        type: tabManifest.type,
        runtimeTabId: tabManifest.runtimeTabId || null,
        rawDataMode: tabManifest.rawDataMode,
        payloadMode: tabManifest.payloadMode,
        files: tabManifest.files
      }));
      zip.file(tabManifest.files.payload, JSON.stringify(payloadForArchive));
      const rawCsvOptions = options.compressionMode === 'adaptive'
        && rawCsvByteLength >= (Number.isFinite(options.compressThresholdBytes) ? options.compressThresholdBytes : DEFAULT_THRESHOLD_BYTES)
        ? {
          compression: 'DEFLATE',
          compressionOptions: {
            level: Number.isFinite(options.adaptiveCompressionLevel) ? options.adaptiveCompressionLevel : DEFAULT_LEVEL
          }
        }
        : null;
      if (rawCsvOptions) {
        compressedCsvCount += 1;
      }
      zip.file(tabManifest.files.rawCsv, csvText, rawCsvOptions || undefined);
      zip.file(tabManifest.files.config, JSON.stringify(config));
      zip.file(tabManifest.files.layout, JSON.stringify(rehomeForRuntimeTab(layout)));
      if (typeof exclusions !== 'undefined') {
        zip.file(tabManifest.files.exclusions, JSON.stringify(exclusions));
      }
      if (hasPreview && tabManifest.files.preview) {
        const previewPayload = {
          markup: runtimeTabId ? remapRuntimeWorkspaceString(tab.previewMarkup, runtimeTabId) : tab.previewMarkup,
          signature: tab.previewSignature || null,
          meta: rehomeForRuntimeTab(tab.previewMeta || null)
        };
        zip.file(tabManifest.files.preview, JSON.stringify(previewPayload), {
          compression: 'DEFLATE',
          compressionOptions: { level: 1 }
        });
      }
      if (hasArchiveRenderCache && tabManifest.files.renderCache) {
        const renderCachePayload = {
          cache: rehomeForRuntimeTab(tab.archiveRenderCache),
          payloadSignature: tab.archiveRenderCacheSignature || null,
          layoutSignature: tab.archiveRenderCacheLayoutSignature || null
        };
        zip.file(tabManifest.files.renderCache, JSON.stringify(renderCachePayload), {
          compression: 'DEFLATE',
          compressionOptions: { level: 1 }
        });
      }
      if (hasUiState && tabManifest.files.uiState) {
        zip.file(tabManifest.files.uiState, JSON.stringify(rehomeForRuntimeTab(tab.uiState)));
      }
      manifest.tabs.push(tabManifest);
    }

    zip.file('manifest.json', JSON.stringify(manifest));
    zip.file('README.txt', buildArchiveReadme(manifest));
    const buffer = await zip.generateAsync({
      type: 'arraybuffer',
      compression: options.compression === 'DEFLATE' ? 'DEFLATE' : 'STORE',
      compressionOptions: options.compression === 'DEFLATE' ? { level: 1 } : undefined,
      streamFiles: true
    });
    return {
      buffer,
      compressedCsvCount
    };
  }

  async function handleMessage(event) {
    const message = event?.data || {};
    const id = message.id;
    const action = message.action;
    try {
      if (action === 'build-archive') {
        const result = await buildArchive(message.payload || {});
        const transfer = (result && result.buffer instanceof ArrayBuffer) ? [result.buffer] : [];
        ctx.postMessage({ id, ok: true, result }, transfer);
        return;
      }
      ctx.postMessage({ id, ok: false, error: 'Unknown action' });
    } catch (err) {
      ctx.postMessage({ id, ok: false, error: err?.message || String(err) });
    }
  }

  ctx.onmessage = handleMessage;
})(typeof self !== 'undefined' ? self : this);
