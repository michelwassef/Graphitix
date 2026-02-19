(function(ctx) {
  'use strict';

  const ZIP_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  const ARCHIVE_FORMAT = 'venn-graph-archive';
  const ARCHIVE_VERSION = 2;
  const DEFAULT_TAB_TITLE = 'Workspace';
  const DEFAULT_THRESHOLD_BYTES = 1024 * 1024;
  const DEFAULT_LEVEL = 1;
  const SCATTER_DEFAULT_LABEL_COLORS = Object.freeze([
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
    '#ffff33', '#a65628', '#f781bf', '#999999'
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
      config[key] = payload[key];
    }
    return config;
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
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
      const defaultValue = defaults[i % defaults.length];
      if (value === defaultValue) {
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

  function resolveRawCsvZipOptions(csvText, options) {
    if (options.compressionMode !== 'adaptive') {
      return null;
    }
    const threshold = Number.isFinite(options.compressThresholdBytes) ? options.compressThresholdBytes : DEFAULT_THRESHOLD_BYTES;
    const level = Number.isFinite(options.adaptiveCompressionLevel) ? options.adaptiveCompressionLevel : DEFAULT_LEVEL;
    const byteLength = estimateUtf8Bytes(csvText);
    if (byteLength < threshold) {
      return null;
    }
    return {
      compression: 'DEFLATE',
      compressionOptions: { level }
    };
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
      '- tabs/<Tab Name>/payload.json: full payload used for fast, lossless reload.',
      '- tabs/<Tab Name>/layout.json: panel/layout state.',
      '',
      `Archive format: ${manifest.format}`,
      `Archive version: ${manifest.version}`,
      `Scope: ${manifest.scope || 'unknown'}`,
      `Saved at: ${manifest.createdAt}`,
      `Tab count: ${manifest.tabCount}`
    ];
    return lines.join('\r\n');
  }

  async function buildArchive(payload) {
    const options = payload || {};
    const tabs = Array.isArray(options.tabs) ? options.tabs : [];
    const activeIndex = resolveActiveIndex(Number(options.activeIndex), tabs.length);
    const scope = normalizeScope(options.scope, tabs.length);
    const archiveName = ensureGraphExtension(options.fileName || '', 'workspace.graph');
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
      const layout = tab.layout || null;
      const rawData = buildRawDataExport(payloadData && typeof payloadData === 'object' ? payloadData.data : null);
      const config = stripRawDataFromPayload(payloadData);
      const exclusions = payloadData && typeof payloadData === 'object' && Object.prototype.hasOwnProperty.call(payloadData, 'exclusions')
        ? payloadData.exclusions
        : undefined;

      const tabManifest = {
        index,
        title: tabTitle,
        type: typeof tab.type === 'string' ? tab.type : (typeof payloadData?.type === 'string' ? payloadData.type : null),
        folder: folderPath,
        rawDataMode: rawData.mode,
        files: {
          tab: `${folderPath}/tab.json`,
          payload: `${folderPath}/payload.json`,
          rawCsv: `${folderPath}/raw/data.csv`,
          config: `${folderPath}/graph-config.json`,
          layout: `${folderPath}/layout.json`,
          exclusions: `${folderPath}/raw/exclusions.json`
        }
      };

      zip.file(tabManifest.files.tab, JSON.stringify({
        title: tabManifest.title,
        type: tabManifest.type,
        rawDataMode: tabManifest.rawDataMode,
        files: tabManifest.files
      }));
      zip.file(tabManifest.files.payload, JSON.stringify(payloadData));
      const csvText = rawData.csvText || '';
      const rawCsvOptions = resolveRawCsvZipOptions(csvText, options);
      if (rawCsvOptions) {
        compressedCsvCount += 1;
      }
      zip.file(tabManifest.files.rawCsv, csvText, rawCsvOptions || undefined);
      zip.file(tabManifest.files.config, JSON.stringify(config));
      zip.file(tabManifest.files.layout, JSON.stringify(layout));
      if (typeof exclusions !== 'undefined') {
        zip.file(tabManifest.files.exclusions, JSON.stringify(exclusions));
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
