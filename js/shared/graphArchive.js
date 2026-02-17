(function(global) {
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const graphArchive = Shared.graphArchive = Shared.graphArchive || {};

  const ARCHIVE_FORMAT = 'venn-graph-archive';
  const ARCHIVE_VERSION = 2;
  const DEFAULT_TAB_TITLE = 'Workspace';
  const ZIP_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
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
    return rows.map(row => {
      const cells = Array.isArray(row) ? row : [row];
      return cells.map(escapeCsvCell).join(',');
    }).join('\r\n');
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

  function buildRawDataRows(data) {
    if (Array.isArray(data)) {
      if (data.every(item => Array.isArray(item))) {
        return { mode: 'matrix', rows: data.map(row => row.slice()) };
      }
      return { mode: 'vector', rows: data.map(item => [item]) };
    }
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      const rows = [['field', 'value']];
      keys.forEach(key => {
        const raw = data[key];
        const value = (raw !== null && typeof raw === 'object')
          ? JSON.stringify(raw)
          : String(raw == null ? '' : raw);
        rows.push([key, value]);
      });
      return { mode: 'object', rows };
    }
    if (data === undefined) {
      return { mode: 'none', rows: [] };
    }
    return { mode: 'value', rows: [[String(data)]] };
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
      config[key] = payload[key];
    }
    return config;
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

  graphArchive.buildArchiveBlob = async function buildArchiveBlob(options = {}) {
    const tabs = Array.isArray(options.tabs) ? options.tabs : [];
    const activeIndex = resolveActiveIndex(Number(options.activeIndex), tabs.length);
    const scope = normalizeScope(options.scope, tabs.length);
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
    tabs.forEach((tab, index) => {
      const tabTitle = String(tab?.title || `${DEFAULT_TAB_TITLE} ${index + 1}`).trim() || `${DEFAULT_TAB_TITLE} ${index + 1}`;
      const safeSegment = sanitizeSegment(tabTitle, `${DEFAULT_TAB_TITLE}-${index + 1}`);
      const uniqueSegment = makeUniqueFolderName(safeSegment, seenFolders);
      const folderPath = `tabs/${uniqueSegment}`;
      const payload = tab?.payload || null;
      const layout = tab?.layout || null;
      const rawData = buildRawDataRows(payload && typeof payload === 'object' ? payload.data : null);
      const csvText = rowsToCsv(rawData.rows);
      const config = stripRawDataFromPayload(payload);
      const exclusions = payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'exclusions')
        ? payload.exclusions
        : undefined;

      const tabManifest = {
        index,
        title: tabTitle,
        type: typeof tab?.type === 'string' ? tab.type : (typeof payload?.type === 'string' ? payload.type : null),
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
      }, null, 2));
      zip.file(tabManifest.files.payload, JSON.stringify(payload));
      zip.file(tabManifest.files.rawCsv, csvText);
      zip.file(tabManifest.files.config, JSON.stringify(config, null, 2));
      zip.file(tabManifest.files.layout, JSON.stringify(layout, null, 2));
      if (typeof exclusions !== 'undefined') {
        zip.file(tabManifest.files.exclusions, JSON.stringify(exclusions, null, 2));
      }
      manifest.tabs.push(tabManifest);
    });

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('README.txt', buildArchiveReadme(manifest));

    debugLog('build.start', {
      scope,
      tabCount: tabs.length,
      activeIndex,
      fileName: archiveName
    });
    const blob = await zip.generateAsync({
      type: 'blob',
      compression: options.compression === 'DEFLATE' ? 'DEFLATE' : 'STORE',
      compressionOptions: options.compression === 'DEFLATE' ? { level: 1 } : undefined,
      streamFiles: true
    });
    debugLog('build.complete', {
      tabCount: tabs.length,
      bytes: blob?.size || 0
    });
    return blob;
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
      let payload = await readJsonFileFromZip(zip, files.payload);
      if (!payload) {
        const config = await readJsonFileFromZip(zip, files.config);
        const csvText = await readTextFileFromZip(zip, files.rawCsv);
        const parsedRows = parseCsv(csvText || '');
        const data = restoreDataFromRows(parsedRows, entry.rawDataMode || 'matrix');
        const exclusions = await readJsonFileFromZip(zip, files.exclusions);
        payload = config || {};
        payload.data = data;
        if (exclusions !== null && typeof exclusions !== 'undefined') {
          payload.exclusions = exclusions;
        }
      }
      const layout = await readJsonFileFromZip(zip, files.layout);
      sessionTabs.push({
        title: entry.title || `${DEFAULT_TAB_TITLE} ${i + 1}`,
        type: entry.type || payload?.type || null,
        payload: payload || null,
        layout: layout || null
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

  graphArchive.constants = Object.freeze({
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
