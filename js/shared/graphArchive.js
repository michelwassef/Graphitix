(function(global) {
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const graphArchive = Shared.graphArchive = Shared.graphArchive || {};

  const ARCHIVE_FORMAT = 'venn-graph-archive';
  const ARCHIVE_VERSION = 3;
  const DEFAULT_TAB_TITLE = 'Workspace';
  const ZIP_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  const GRAPH_ARCHIVE_WORKER_URL = 'js/workers/graphArchive.worker.js';
  const ADAPTIVE_COMPRESS_THRESHOLD_BYTES = 1024 * 1024;
  const ADAPTIVE_COMPRESS_LEVEL = 1;
  const ADAPTIVE_PAYLOAD_LITE_THRESHOLD_BYTES = 1024 * 1024;
  const WORKER_TIMEOUT_MS = 120000;
  const SCATTER_DEFAULT_LABEL_COLORS = Object.freeze([
    '#0000ff', '#ff0000', '#00aa00', '#ff8c00', '#800080',
    '#00a6d6', '#8b4513', '#ff1493', '#666666'
  ]);
  const SCATTER_DEFAULT_LABEL_SHAPES = Object.freeze([
    'circle', 'triangle', 'square', 'diamond', 'cross', 'plus', 'star'
  ]);
  let zipLoaderPromise = null;

  function isDebugEnabled() {
    return typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
  }

  function debugLog(message, payload) {
    if (!isDebugEnabled()) {
      return;
    }
    if (typeof console !== 'undefined' && typeof console.debug === 'function') {
      console.debug('Debug: graphArchive.' + message, payload || {});
    }
  }

  function cloneValue(value) {
    if (value === null || value === undefined) {
      return value;
    }
    if (typeof global.structuredClone === 'function') {
      try {
        return global.structuredClone(value);
      } catch (err) {
        debugLog('clone.structuredCloneFallback', { error: err?.message || String(err) });
      }
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      debugLog('clone.jsonFallback', { error: err?.message || String(err) });
      return value;
    }
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
    if (!sanitized) {
      return fallbackValue;
    }
    return sanitized;
  }

  function ensureGraphExtension(name, fallback) {
    const base = String(name || '').trim() || String(fallback || '').trim() || 'workspace.graph';
    return /\.graph$/i.test(base) ? base : (base + '.graph');
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

  function ensureZipLibrary() {
    if (global.JSZip) {
      return Promise.resolve(global.JSZip);
    }
    if (typeof Shared.lazyZip === 'function') {
      return Shared.lazyZip();
    }
    if (zipLoaderPromise) {
      return zipLoaderPromise;
    }
    if (!global.document || !global.document.createElement) {
      return Promise.reject(new Error('JSZip unavailable and no document to load it.'));
    }
    zipLoaderPromise = new Promise((resolve, reject) => {
      const script = global.document.createElement('script');
      script.src = ZIP_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        if (global.JSZip) {
          resolve(global.JSZip);
        } else {
          reject(new Error('JSZip script loaded but global.JSZip is missing.'));
        }
      };
      script.onerror = () => {
        zipLoaderPromise = null;
        reject(new Error('Failed to load JSZip script.'));
      };
      global.document.head.appendChild(script);
    });
    return zipLoaderPromise;
  }

  function estimateUtf8Bytes(text) {
    const source = String(text || '');
    if (!source) {
      return 0;
    }
    if (typeof global.TextEncoder === 'function') {
      try {
        return new global.TextEncoder().encode(source).byteLength;
      } catch (err) {
        debugLog('estimateUtf8Bytes.textEncoderFallback', { error: err?.message || String(err) });
      }
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

  function resolveAdaptiveCompressionPolicy(options = {}) {
    const mode = options.compressionMode || 'adaptive';
    const thresholdBytes = Number.isFinite(options.compressThresholdBytes) ? options.compressThresholdBytes : ADAPTIVE_COMPRESS_THRESHOLD_BYTES;
    const level = Number.isFinite(options.adaptiveCompressionLevel) ? options.adaptiveCompressionLevel : ADAPTIVE_COMPRESS_LEVEL;
    if (mode !== 'adaptive') {
      return {
        mode,
        enabled: false,
        thresholdBytes,
        level
      };
    }
    return {
      mode,
      enabled: true,
      thresholdBytes,
      level
    };
  }

  function resolvePayloadStoragePolicy(options = {}) {
    const mode = options.payloadMode || 'full';
    const thresholdBytes = Number.isFinite(options.payloadLiteThresholdBytes)
      ? options.payloadLiteThresholdBytes
      : ADAPTIVE_PAYLOAD_LITE_THRESHOLD_BYTES;
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

  function parseCsv(text) {
    const source = String(text || '');
    if (!source) {
      return [];
    }
    const rows = [];
    let row = [];
    let cell = '';
    let i = 0;
    let inQuotes = false;
    while (i < source.length) {
      const ch = source[i];
      if (inQuotes) {
        if (ch === '"') {
          if (source[i + 1] === '"') {
            cell += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        cell += ch;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i += 1;
        continue;
      }
      if (ch === ',') {
        row.push(cell);
        cell = '';
        i += 1;
        continue;
      }
      if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        i += 1;
        continue;
      }
      if (ch === '\r') {
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
    }
    row.push(cell);
    rows.push(row);
    if (rows.length === 1 && rows[0].length === 1 && rows[0][0] === '') {
      return [];
    }
    return rows;
  }

  function looksLikeJson(value) {
    if (typeof value !== 'string') {
      return false;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return false;
    }
    return (trimmed.startsWith('{') && trimmed.endsWith('}'))
      || (trimmed.startsWith('[') && trimmed.endsWith(']'))
      || trimmed === 'null'
      || trimmed === 'true'
      || trimmed === 'false'
      || /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed);
  }

  function parseMaybeJson(value) {
    if (!looksLikeJson(value)) {
      return value;
    }
    try {
      return JSON.parse(value);
    } catch (err) {
      return value;
    }
  }

  function buildRawDataExport(data) {
    if (Array.isArray(data)) {
      const isMatrix = data.length === 0 || data.every(item => Array.isArray(item));
      if (isMatrix) {
        return {
          mode: 'matrix',
          csvText: rowsToCsv(data)
        };
      }
      const lines = new Array(data.length);
      for (let i = 0; i < data.length; i += 1) {
        lines[i] = escapeCsvCell(data[i]);
      }
      return {
        mode: 'vector',
        csvText: lines.join('\r\n')
      };
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
      return {
        mode: 'object',
        csvText: rowsToCsv(rows)
      };
    }
    if (data === undefined) {
      return { mode: 'none', csvText: '' };
    }
    return {
      mode: 'value',
      csvText: escapeCsvCell(String(data))
    };
  }

  function restoreDataFromRows(rows, mode) {
    if (!Array.isArray(rows)) {
      return null;
    }
    if (mode === 'matrix') {
      return rows.map(row => Array.isArray(row) ? row.slice() : [row]);
    }
    if (mode === 'vector') {
      return rows.map(row => Array.isArray(row) ? row[0] : row);
    }
    if (mode === 'object') {
      const result = {};
      const start = rows.length && Array.isArray(rows[0]) && rows[0][0] === 'field' ? 1 : 0;
      for (let i = start; i < rows.length; i += 1) {
        const row = Array.isArray(rows[i]) ? rows[i] : [];
        const key = row[0];
        if (!key) {
          continue;
        }
        result[key] = parseMaybeJson(row[1] == null ? '' : String(row[1]));
      }
      return result;
    }
    if (mode === 'value') {
      const firstRow = rows[0] || [];
      return firstRow[0] == null ? '' : firstRow[0];
    }
    if (mode === 'none') {
      return null;
    }
    return rows;
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
    if (!keys.length) {
      return mapValue;
    }
    // Run compaction only on large dictionaries where archive bloat is material.
    if (keys.length < 1000) {
      return mapValue;
    }
    const compact = {};
    let prunedCount = 0;
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const value = mapValue[key];
      const defaultValue = defaults[i % defaults.length];
      if (matchesScatterDefaultValue(value, i, defaults)) {
        prunedCount += 1;
      } else {
        compact[key] = value;
      }
    }
    if (!prunedCount) {
      return mapValue;
    }
    debugLog('scatterMap.compacted', {
      total: keys.length,
      pruned: prunedCount,
      kept: keys.length - prunedCount
    });
    return compact;
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

  function decodeBufferToText(buffer) {
    const decoder = typeof global.TextDecoder === 'function'
      ? new global.TextDecoder('utf-8')
      : null;
    if (decoder) {
      return decoder.decode(buffer);
    }
    const bytes = new Uint8Array(buffer);
    let result = '';
    for (let i = 0; i < bytes.length; i += 1) {
      result += String.fromCharCode(bytes[i]);
    }
    return result;
  }

  function isZipBuffer(buffer) {
    if (!buffer || buffer.byteLength < 4) {
      return false;
    }
    const bytes = new Uint8Array(buffer);
    return bytes[0] === 0x50 && bytes[1] === 0x4b;
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

  function buildArchiveReadme(manifest) {
    const lines = [
      'Graph Archive (.graph)',
      '======================',
      '',
      'This .graph file is a ZIP archive designed for transparent scientific workflows.',
      '',
      'Contents:',
      '- manifest.json: archive index (version, tabs, active tab).',
      '- tabs/<Tab Name>/raw/data.csv: raw tabular input.',
      '- tabs/<Tab Name>/graph-config.json: graph/stat settings.',
      '- tabs/<Tab Name>/payload.json: payload snapshot (may omit raw data in lite mode).',
      '- tabs/<Tab Name>/layout.json: panel/layout state.',
      '- tabs/<Tab Name>/preview.json: cached tab preview markup (when available).',
      '- tabs/<Tab Name>/render-cache.json: serialized one-shot render snapshot for redraw-free restore (when available).',
      '',
      `Archive format: ${manifest.format}`,
      `Archive version: ${manifest.version}`,
      `Scope: ${manifest.scope || 'unknown'}`,
      `Saved at: ${manifest.createdAt}`,
      `Tab count: ${manifest.tabCount}`
    ];
    return lines.join('\r\n');
  }

  async function readJsonFileFromZip(zip, path) {
    if (!path) {
      return null;
    }
    const entry = zip.file(path);
    if (!entry) {
      return null;
    }
    const text = await entry.async('string');
    if (!text) {
      return null;
    }
    return JSON.parse(text);
  }

  async function readTextFileFromZip(zip, path) {
    if (!path) {
      return null;
    }
    const entry = zip.file(path);
    if (!entry) {
      return null;
    }
    return entry.async('string');
  }

  function isMatrixLike(value) {
    return Array.isArray(value);
  }

  function hydratePayloadDataViews(payload) {
    if (!isPlainObject(payload) || !isPlainObject(payload.dataViews) || !Array.isArray(payload.dataViews.views)) {
      return payload;
    }
    const rawData = isMatrixLike(payload.data) ? payload.data : [];
    const sourceViews = payload.dataViews.views;
    const nextViews = new Array(sourceViews.length);
    let changed = false;
    let hasRawView = false;

    for (let i = 0; i < sourceViews.length; i += 1) {
      const sourceView = sourceViews[i];
      if (!isPlainObject(sourceView)) {
        nextViews[i] = sourceView;
        continue;
      }
      const nextView = { ...sourceView };
      const id = String(nextView.id || '').trim().toLowerCase();
      const kind = String(nextView.kind || '').trim().toLowerCase();
      const isRaw = kind === 'raw' || (!hasRawView && (id === 'raw' || i === 0));
      if (isRaw) {
        hasRawView = true;
        if (!Array.isArray(nextView.data) || nextView.data.length === 0) {
          nextView.data = rawData;
          changed = true;
        }
        if (!nextView.id) {
          nextView.id = 'raw';
          changed = true;
        }
      }
      nextViews[i] = nextView;
    }

    if (!hasRawView) {
      nextViews.unshift({
        id: 'raw',
        kind: 'raw',
        title: 'Raw',
        data: rawData,
        sourceViewId: null,
        transformSpec: null,
        summary: null,
        exclusions: null,
        createdAt: Date.now()
      });
      changed = true;
    }

    const transformsApi = Shared?.dataTransforms;
    if (transformsApi && typeof transformsApi.applyTransform === 'function') {
      const maxPasses = nextViews.length;
      for (let pass = 0; pass < maxPasses; pass += 1) {
        let progressed = false;
        const byId = new Map();
        for (let i = 0; i < nextViews.length; i += 1) {
          const view = nextViews[i];
          if (!isPlainObject(view)) {
            continue;
          }
          byId.set(String(view.id || '').trim(), view);
        }
        for (let i = 0; i < nextViews.length; i += 1) {
          const view = nextViews[i];
          if (!isPlainObject(view)) {
            continue;
          }
          if (String(view.kind || '').toLowerCase() === 'raw') {
            continue;
          }
          if (Array.isArray(view.data) && view.data.length) {
            continue;
          }
          if (!view.transformSpec) {
            continue;
          }
          const sourceViewId = String(view.sourceViewId || 'raw').trim() || 'raw';
          const sourceView = byId.get(sourceViewId);
          const sourceData = Array.isArray(sourceView?.data) ? sourceView.data : null;
          if (!sourceData || !sourceData.length) {
            continue;
          }
          try {
            const result = transformsApi.applyTransform(sourceData, view.transformSpec, { componentKey: 'graph-archive' });
            if (!result || result.ok === false || !Array.isArray(result.data)) {
              continue;
            }
            view.data = result.data;
            if (!view.summary && result.summary) {
              view.summary = result.summary;
            }
            changed = true;
            progressed = true;
          } catch (err) {
            debugLog('hydratePayloadDataViews.transformFailed', {
              viewId: view.id || null,
              error: err?.message || String(err)
            });
          }
        }
        if (!progressed) {
          break;
        }
      }
    }

    if (!changed) {
      return payload;
    }
    return {
      ...payload,
      dataViews: {
        ...payload.dataViews,
        views: nextViews
      }
    };
  }

  function buildSingleTabLegacySession(payload, fileName) {
    const inferredType = typeof payload?.type === 'string' ? payload.type : null;
    const fallbackTitle = sanitizeSegment(String(fileName || '').replace(/\.[^/.]+$/, ''), DEFAULT_TAB_TITLE);
    return {
      version: 1,
      scope: 'tab',
      savedAt: new Date().toISOString(),
      activeIndex: 0,
      tabs: [{
        title: fallbackTitle,
        type: inferredType,
        payload: cloneValue(payload),
        layout: null
      }]
    };
  }

  graphArchive.ensureGraphFileName = function ensureGraphFileName(name, fallback) {
    return ensureGraphExtension(name, fallback);
  };

  async function buildArchiveBlobInMainThread(options = {}) {
    const tabs = Array.isArray(options.tabs) ? options.tabs : [];
    const activeIndex = resolveActiveIndex(Number(options.activeIndex), tabs.length);
    const scope = normalizeScope(options.scope, tabs.length);
    const compressionPolicy = resolveAdaptiveCompressionPolicy(options);
    const payloadPolicy = resolvePayloadStoragePolicy(options);
    const archiveName = ensureGraphExtension(options.fileName || '', 'workspace.graph');
    const JSZip = await ensureZipLibrary();
    const zip = new JSZip();
    const seenFolders = new Set();
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
    const startedAt = typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
      ? global.performance.now()
      : Date.now();
    let compressedCsvCount = 0;
    for (let index = 0; index < tabs.length; index += 1) {
      const tab = tabs[index];
      const tabTitle = String(tab?.title || `${DEFAULT_TAB_TITLE} ${index + 1}`).trim() || `${DEFAULT_TAB_TITLE} ${index + 1}`;
      const safeSegment = sanitizeSegment(tabTitle, `${DEFAULT_TAB_TITLE}-${index + 1}`);
      const uniqueSegment = makeUniqueFolderName(safeSegment, seenFolders);
      const folderPath = `tabs/${uniqueSegment}`;
      const payload = optimizePayloadForArchive(tab?.payload || null);
      const rawPayload = isPlainObject(payload) ? payload : null;
      const layout = tab?.layout || null;
      const rawData = buildRawDataExport(rawPayload ? rawPayload.data : null);
      const rawCsvText = rawData.csvText || '';
      const rawCsvByteLength = estimateUtf8Bytes(rawCsvText);
      const payloadMode = resolvePayloadModeFromByteLength(rawCsvByteLength, payloadPolicy);
      const payloadForArchive = payloadMode === 'lite' ? buildLitePayload(payload) : payload;
      const config = stripRawDataFromPayload(payload);
      const exclusions = rawPayload && Object.prototype.hasOwnProperty.call(rawPayload, 'exclusions')
        ? payload.exclusions
        : undefined;
      const hasPreview = typeof tab?.previewMarkup === 'string' && tab.previewMarkup.trim().length > 0;
      const hasArchiveRenderCache = !!(tab?.archiveRenderCache && typeof tab.archiveRenderCache === 'object');
      const hasUiState = !!(tab?.uiState && typeof tab.uiState === 'object' && Object.keys(tab.uiState).length > 0);

      const tabManifest = {
        index,
        title: tabTitle,
        type: typeof tab?.type === 'string' ? tab.type : (typeof payload?.type === 'string' ? payload.type : null),
        folder: folderPath,
        rawDataMode: rawData.mode,
        payloadMode,
        files: {
          tab: `${folderPath}/tab.json`,
          payload: `${folderPath}/payload.json`,
          rawCsv: `${folderPath}/raw/data.csv`,
          config: `${folderPath}/graph-config.json`,
          layout: `${folderPath}/layout.json`,
          exclusions: `${folderPath}/raw/exclusions.json`,
          preview: hasPreview ? `${folderPath}/preview.json` : null,
          renderCache: hasArchiveRenderCache ? `${folderPath}/render-cache.json` : null,
          uiState: hasUiState ? `${folderPath}/ui-state.json` : null
        }
      };

      zip.file(tabManifest.files.tab, JSON.stringify({
        title: tabManifest.title,
        type: tabManifest.type,
        rawDataMode: tabManifest.rawDataMode,
        payloadMode: tabManifest.payloadMode,
        files: tabManifest.files
      }));
      zip.file(tabManifest.files.payload, JSON.stringify(payloadForArchive));
      const rawCsvOptions = compressionPolicy?.enabled && rawCsvByteLength >= compressionPolicy.thresholdBytes
        ? {
          compression: 'DEFLATE',
          compressionOptions: { level: compressionPolicy.level },
          __debug: {
            byteLength: rawCsvByteLength,
            thresholdBytes: compressionPolicy.thresholdBytes,
            level: compressionPolicy.level
          }
        }
        : null;
      if (rawCsvOptions) {
        compressedCsvCount += 1;
      }
      zip.file(tabManifest.files.rawCsv, rawCsvText, rawCsvOptions || undefined);
      zip.file(tabManifest.files.config, JSON.stringify(config));
      zip.file(tabManifest.files.layout, JSON.stringify(layout));
      if (typeof exclusions !== 'undefined') {
        zip.file(tabManifest.files.exclusions, JSON.stringify(exclusions));
      }
      if (hasPreview && tabManifest.files.preview) {
        const previewPayload = {
          markup: tab.previewMarkup,
          signature: tab.previewSignature || null,
          meta: tab.previewMeta || null
        };
        zip.file(tabManifest.files.preview, JSON.stringify(previewPayload), {
          compression: 'DEFLATE',
          compressionOptions: { level: 1 }
        });
      }
      if (hasArchiveRenderCache && tabManifest.files.renderCache) {
        const renderCachePayload = {
          cache: tab.archiveRenderCache,
          payloadSignature: tab.archiveRenderCacheSignature || null,
          layoutSignature: tab.archiveRenderCacheLayoutSignature || null
        };
        zip.file(tabManifest.files.renderCache, JSON.stringify(renderCachePayload), {
          compression: 'DEFLATE',
          compressionOptions: { level: 1 }
        });
      }
      if (hasUiState && tabManifest.files.uiState) {
        zip.file(tabManifest.files.uiState, JSON.stringify(tab.uiState));
      }
      manifest.tabs.push(tabManifest);
    }

    zip.file('manifest.json', JSON.stringify(manifest));
    zip.file('README.txt', buildArchiveReadme(manifest));

    debugLog('build.start', {
      scope,
      tabCount: tabs.length,
      activeIndex,
      fileName: archiveName,
      compressionMode: compressionPolicy.mode,
      thresholdBytes: compressionPolicy.thresholdBytes
    });
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: options.compression === 'DEFLATE' ? 'DEFLATE' : 'STORE',
      compressionOptions: options.compression === 'DEFLATE' ? { level: 1 } : undefined,
      streamFiles: true
    });
    debugLog('build.complete', {
      tabCount: tabs.length,
      bytes: blob?.size || 0,
      compressedCsvCount,
      elapsedMs: Math.round(((typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
        ? global.performance.now()
        : Date.now()) - startedAt) * 10) / 10
    });
    return blob;
  }

  async function buildArchiveBlobWithWorker(options = {}) {
    const tabs = Array.isArray(options.tabs) ? options.tabs : [];
    const SharedWorkers = Shared?.Workers;
    if (!SharedWorkers || typeof SharedWorkers.runTask !== 'function') {
      return buildArchiveBlobInMainThread(options);
    }
    const timeoutMs = Number.isFinite(options.workerTimeoutMs) ? options.workerTimeoutMs : WORKER_TIMEOUT_MS;
    const startedAt = typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
      ? global.performance.now()
      : Date.now();
    try {
      const result = await SharedWorkers.runTask({
        name: 'graph-archive',
        url: GRAPH_ARCHIVE_WORKER_URL,
        action: 'build-archive',
        payload: {
          tabs,
          activeIndex: Number(options.activeIndex),
          scope: options.scope,
          fileName: options.fileName,
          compression: options.compression,
          compressionMode: options.compressionMode || 'adaptive',
          compressThresholdBytes: Number.isFinite(options.compressThresholdBytes) ? options.compressThresholdBytes : ADAPTIVE_COMPRESS_THRESHOLD_BYTES,
          adaptiveCompressionLevel: Number.isFinite(options.adaptiveCompressionLevel) ? options.adaptiveCompressionLevel : ADAPTIVE_COMPRESS_LEVEL,
          payloadMode: options.payloadMode || 'full',
          payloadLiteThresholdBytes: Number.isFinite(options.payloadLiteThresholdBytes)
            ? options.payloadLiteThresholdBytes
            : ADAPTIVE_PAYLOAD_LITE_THRESHOLD_BYTES
        },
        timeoutMs,
        fallback: () => buildArchiveBlobInMainThread(options)
      });
      if (!result || !(result.buffer instanceof ArrayBuffer)) {
        return buildArchiveBlobInMainThread(options);
      }
      const blob = new global.Blob([result.buffer], { type: 'application/zip' });
      debugLog('build.worker.complete', {
        tabCount: tabs.length,
        bytes: blob.size,
        compressedCsvCount: result.compressedCsvCount || 0,
        elapsedMs: Math.round(((typeof global.performance !== 'undefined' && typeof global.performance.now === 'function'
          ? global.performance.now()
          : Date.now()) - startedAt) * 10) / 10
      });
      return blob;
    } catch (err) {
      debugLog('build.worker.fallback', { error: err?.message || String(err) });
      return buildArchiveBlobInMainThread(options);
    }
  }

  graphArchive.buildArchiveBlob = async function buildArchiveBlob(options = {}) {
    const wantsWorker = options.useWorker !== false;
    if (wantsWorker) {
      return buildArchiveBlobWithWorker(options);
    }
    return buildArchiveBlobInMainThread(options);
  };

  graphArchive.parseArchiveBuffer = async function parseArchiveBuffer(buffer, options = {}) {
    if (!buffer) {
      throw new Error('Missing archive buffer.');
    }
    if (!isZipBuffer(buffer)) {
      const text = decodeBufferToText(buffer);
      const parsed = JSON.parse(text);
      if (parsed && Array.isArray(parsed.tabs)) {
        const scope = normalizeScope(parsed.scope, parsed.tabs.length);
        const activeIndex = resolveActiveIndex(Number(parsed.activeIndex), parsed.tabs.length);
        return {
          source: 'legacy-session-json',
          manifest: null,
          session: {
            version: 1,
            scope,
            savedAt: parsed.savedAt || new Date().toISOString(),
            activeIndex,
            tabs: parsed.tabs.map((tab, index) => ({
              title: tab?.title || `${DEFAULT_TAB_TITLE} ${index + 1}`,
              type: tab?.type || tab?.payload?.type || null,
              payload: tab?.payload || null,
              layout: tab?.layout || null
            }))
          }
        };
      }
      return {
        source: 'legacy-graph-json',
        manifest: null,
        session: buildSingleTabLegacySession(parsed, options.fileName || 'workspace.graph')
      };
    }

    const JSZip = await ensureZipLibrary();
    const zip = await JSZip.loadAsync(buffer);
    const manifest = await readJsonFileFromZip(zip, 'manifest.json');
    if (!manifest || !Array.isArray(manifest.tabs)) {
      throw new Error('Invalid .graph archive: missing manifest.json tabs array.');
    }

    const sessionTabs = [];
    for (let i = 0; i < manifest.tabs.length; i += 1) {
      const entry = manifest.tabs[i] || {};
      const files = entry.files || {};
      const payloadMode = entry.payloadMode === 'lite' ? 'lite' : 'full';
      let payload = await readJsonFileFromZip(zip, files.payload);
      if (!isPlainObject(payload)) {
        payload = null;
      }
      const shouldHydrateData = payloadMode === 'lite'
        || !payload
        || !Object.prototype.hasOwnProperty.call(payload, 'data');
      const shouldHydrateExclusions = payloadMode === 'lite'
        || !payload
        || !Object.prototype.hasOwnProperty.call(payload, 'exclusions');
      if (!payload) {
        payload = await readJsonFileFromZip(zip, files.config);
        if (!isPlainObject(payload)) {
          payload = {};
        }
      }
      if (shouldHydrateData) {
        const csvText = await readTextFileFromZip(zip, files.rawCsv);
        const parsedRows = parseCsv(csvText || '');
        const data = restoreDataFromRows(parsedRows, entry.rawDataMode || 'matrix');
        payload.data = data;
      }
      if (shouldHydrateExclusions) {
        const exclusions = await readJsonFileFromZip(zip, files.exclusions);
        if (exclusions !== null && typeof exclusions !== 'undefined') {
          payload.exclusions = exclusions;
        }
      }
      if (payloadMode === 'lite' || shouldHydrateData) {
        payload = hydratePayloadDataViews(payload);
      }
      const layout = await readJsonFileFromZip(zip, files.layout);
      const previewData = files.preview ? await readJsonFileFromZip(zip, files.preview) : null;
      const renderCacheData = files.renderCache ? await readJsonFileFromZip(zip, files.renderCache) : null;
      const uiStateData = files.uiState ? await readJsonFileFromZip(zip, files.uiState) : null;
      sessionTabs.push({
        title: entry.title || `${DEFAULT_TAB_TITLE} ${i + 1}`,
        type: entry.type || payload?.type || null,
        payload: payload || null,
        layout: layout || null,
        previewMarkup: typeof previewData?.markup === 'string' ? previewData.markup : null,
        previewSignature: previewData?.signature || null,
        previewMeta: previewData?.meta && typeof previewData.meta === 'object' ? previewData.meta : null,
        archiveRenderCache: renderCacheData?.cache && typeof renderCacheData.cache === 'object' ? renderCacheData.cache : null,
        archiveRenderCacheSignature: renderCacheData?.payloadSignature || null,
        archiveRenderCacheLayoutSignature: renderCacheData?.layoutSignature || null,
        uiState: uiStateData && typeof uiStateData === 'object' ? uiStateData : null
      });
    }

    const activeIndex = resolveActiveIndex(Number(manifest.activeIndex), sessionTabs.length);
    const scope = normalizeScope(manifest.scope, sessionTabs.length);
    return {
      source: 'graph-archive',
      manifest,
      session: {
        version: 1,
        scope,
        savedAt: manifest.createdAt || new Date().toISOString(),
        activeIndex,
        tabs: sessionTabs
      }
    };
  };

  graphArchive.parseFile = async function parseFile(file, options = {}) {
    if (!file || typeof file.arrayBuffer !== 'function') {
      throw new Error('Invalid file input.');
    }
    const buffer = await file.arrayBuffer();
    return graphArchive.parseArchiveBuffer(buffer, {
      fileName: options.fileName || file.name || ''
    });
  };

  graphArchive.preload = function preload() {
    return ensureZipLibrary().then(() => true).catch(() => false);
  };

  graphArchive.constants = Object.freeze({
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    adaptiveCompressThresholdBytes: ADAPTIVE_COMPRESS_THRESHOLD_BYTES,
    adaptivePayloadLiteThresholdBytes: ADAPTIVE_PAYLOAD_LITE_THRESHOLD_BYTES
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
