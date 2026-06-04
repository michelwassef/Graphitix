(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const tableImport = Shared.tableImport = Shared.tableImport || {};

  let xlsxLoaderPromise = null;
  let zipLoaderPromise = null;
  let pakoLoaderPromise = null;
  const DEFAULT_SNAPSHOT_CELL_THRESHOLD = 12000;
  tableImport.snapshotCellThreshold = DEFAULT_SNAPSHOT_CELL_THRESHOLD;

  function isDebugEnabled(){
    try{
      return typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    }catch(err){
      return false;
    }
  }

  function tableImportDebug(message, payload){
    if(!isDebugEnabled()){
      return;
    }
    if(typeof payload === 'undefined'){
      console.debug(message);
    }else{
      console.debug(message, payload);
    }
  }

  function debugLog(step, detail, debugLabel){
    const payload = Object.assign({ debugLabel: debugLabel || 'tableImport' }, detail || {});
    tableImportDebug(`Debug: tableImport.${step}`, payload); // Debug: table import trace
  }

  const PRISM_IMPORT_LIMITATION_MESSAGE = [
    'PRISM/PZFX import is experimental.',
    'Only data tables are imported; graph-specific settings are not preserved.',
    'Saving/exporting back to PRISM/PZFX is not supported.'
  ].join('\n');

  function showPrismImportLimitations(){
    if(typeof global.alert !== 'function'){
      return;
    }
    try{
      global.alert(PRISM_IMPORT_LIMITATION_MESSAGE);
    }catch(err){
      tableImportDebug('Debug: tableImport.prismLimitationAlertSkipped', { message: err?.message || String(err) });
    }
  }

  function getImportFileBaseName(fileName){
    const raw = String(fileName || '').split(/[\\/]/).pop().trim();
    if(!raw){
      return '';
    }
    const withoutExtension = raw.replace(/\.[^.]*$/, '').trim();
    return withoutExtension || raw;
  }

  function renameActiveTabForImport(file, result, options = {}){
    if(!result || options.renameTab === false){
      return;
    }
    const nextTitleBase = getImportFileBaseName(file?.name || '');
    if(!nextTitleBase){
      return;
    }
    const tabsApi = global.Main?.tabs || null;
    const session = global.Main?.session || null;
    const activeTab = session?.getActiveTab?.() || tabsApi?.getActiveTab?.() || null;
    if(!activeTab || activeTab.isWelcome || !activeTab.id){
      return;
    }
    try{
      if(typeof tabsApi?.commitTabRename === 'function'){
        tabsApi.commitTabRename(activeTab.id, nextTitleBase, { reason: 'table-import-file-name' });
      }else{
        const previousTitle = activeTab.title || '';
        const nextTitle = typeof session?.generateUniqueTabTitle === 'function'
          ? session.generateUniqueTabTitle(nextTitleBase, { excludeTabId: activeTab.id })
          : nextTitleBase;
        activeTab.title = nextTitle;
        if(typeof tabsApi?.renderTabs === 'function'){
          tabsApi.renderTabs();
        }
        if(nextTitle !== previousTitle && typeof session?.markSessionDirty === 'function'){
          session.markSessionDirty('tab-title-updated-from-import', {
            tabId: activeTab.id,
            previousTitle,
            nextTitle,
            origin: 'user',
            fileName: file?.name || ''
          });
        }
      }
      debugLog('openFile.tabRenamed', { tabId: activeTab.id, title: nextTitleBase, fileName: file?.name || '' }, options.debugLabel || 'tableImport');
    }catch(err){
      debugLog('openFile.tabRenameError', { message: err?.message || String(err), fileName: file?.name || '' }, options.debugLabel || 'tableImport');
    }
  }

  function filterRows(rows){
    return (rows || []).filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));
  }

  function isPrismBlankCell(value){
    return String(value ?? '').trim() === '';
  }

  function detectDelimiter(text, fallback){
    if(typeof text !== 'string' || !text){
      return fallback || ',';
    }
    if(text.includes('\t')){
      return '\t';
    }
    const commaCount = (text.match(/,/g) || []).length;
    const semicolonCount = (text.match(/;/g) || []).length;
    if(commaCount === 0 && semicolonCount === 0){
      return fallback || ',';
    }
    if(commaCount >= semicolonCount && commaCount > 0){
      return ',';
    }
    if(semicolonCount > 0){
      return ';';
    }
    return fallback || ',';
  }

  function parseDelimitedText(text, delimiter){
    if(typeof text !== 'string') return [];
    return text.split(/\r?\n/).map(line => line.split(delimiter));
  }

  function normalizeDecimalSeparators(rows, delimiter, options = {}){
    if(!Array.isArray(rows)){
      return rows;
    }
    if(delimiter !== '\t' && delimiter !== ';'){
      return rows;
    }
    const regex = /^(\s*-?\d+),(\d+(?:[eE][+-]?\d+)?\s*)$/;
    let changed = 0;
    for(let r = 0; r < rows.length; r++){
      const row = rows[r];
      if(!Array.isArray(row)){
        continue;
      }
      for(let c = 0; c < row.length; c++){
        const cell = row[c];
        if(typeof cell !== 'string' || cell.indexOf(',') === -1 || cell.indexOf('.') !== -1){
          continue;
        }
        const match = cell.match(regex);
        if(match){
          row[c] = `${match[1]}.${match[2]}`;
          changed += 1;
        }
      }
    }
    if(changed && typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      tableImportDebug('Debug: tableImport.normalizeDecimalSeparators', {
        delimiter,
        changed,
        debugLabel: options.debugLabel || null
      });
    }
    return rows;
  }

  tableImport.normalizeDecimalSeparators = normalizeDecimalSeparators;

  async function getClipboardTextFromEvent(event){
    if(!event){
      return '';
    }
    try{
      const cd = event.clipboardData || event.originalEvent?.clipboardData || null;
      tableImportDebug('Debug: tableImport.getClipboardTextFromEvent entry', { hasEvent: !!event, hasClipboardData: !!cd });
      if(cd){
        // Prefer DataTransferItemList handling (works well in Firefox/Chrome)
        if(cd.items && cd.items.length){
          tableImportDebug('Debug: tableImport.getClipboardTextFromEvent using DataTransferItemList', { items: cd.items.length });
          for(let i = 0; i < cd.items.length; i++){
            const item = cd.items[i];
            try{
              if(item && item.kind === 'string' && typeof item.getAsString === 'function'){
                const text = await new Promise(resolve => item.getAsString(s => resolve(s)));
                tableImportDebug('Debug: tableImport.getClipboardTextFromEvent item.string', { index: i, length: (text || '').length, snippet: (text||'').slice(0,200) });
                if(text) return text;
              }
              if(item && item.kind === 'file' && typeof item.getAsFile === 'function'){
                const file = item.getAsFile();
                if(file){
                  tableImportDebug('Debug: tableImport.getClipboardTextFromEvent item.file', { index: i, name: file.name, size: file.size });
                  const txt = await readFileAsText(file);
                  if(txt) return txt;
                }
              }
            }catch(e){/* ignore individual item errors */}
          }
        }
        // Then try getData for common types, preferring plain text then HTML
        const tryTypes = ['text/plain','text','Text','text/unicode','text/html'];
        for(const t of tryTypes){
          try{
            const v = cd.getData(t);
            if(v){
              tableImportDebug('Debug: tableImport.getClipboardTextFromEvent getData', { type: t, length: (v || '').length, snippet: (v||'').slice(0,200) });
              if(t === 'text/html' && typeof global.document !== 'undefined'){
                const div = global.document.createElement('div');
                div.innerHTML = v;
                const vtext = div.innerText || div.textContent || '';
                if(vtext) return vtext;
              }else{
                return v;
              }
            }
          }catch(e){/* ignore */}
        }
      }
    }catch(e){/* ignore */}
    // IE/old fallback
    try{
      if(global.window && typeof global.window.clipboardData === 'object' && typeof global.window.clipboardData.getData === 'function'){
        const v = global.window.clipboardData.getData('Text');
        tableImportDebug('Debug: tableImport.getClipboardTextFromEvent window.clipboardData', { length: (v || '').length });
        if(v) return v;
      }
    }catch(e){/* ignore */}
    // Clipboard API: try read() to obtain ClipboardItems, then readText()
    try{
      const nav = global.navigator?.clipboard;
      if(nav){
        if(typeof nav.read === 'function'){
          const items = await nav.read();
          tableImportDebug('Debug: tableImport.getClipboardTextFromEvent navigator.read', { items: (items || []).length });
          for(const clipboardItem of items){
            for(const type of clipboardItem.types || []){
              try{
                if(type && type.startsWith('text')){
                  const blob = await clipboardItem.getType(type);
                  const s = await blob.text();
                  tableImportDebug('Debug: tableImport.getClipboardTextFromEvent navigator.read.type', { type, length: (s || '').length, snippet: (s||'').slice(0,200) });
                  if(s) return s;
                }
              }catch(e){/* ignore per-type errors */}
            }
          }
        }
        if(typeof nav.readText === 'function'){
          const v = await nav.readText();
          tableImportDebug('Debug: tableImport.getClipboardTextFromEvent navigator.readText', { length: (v || '').length, snippet: (v||'').slice(0,200) });
          if(v) return v;
        }
      }
    }catch(e){/* ignore */}
    return '';
  }

  // expose helper so other modules (e.g., Shared.hot) can reuse robust clipboard logic
  tableImport.getClipboardTextFromEvent = getClipboardTextFromEvent;

  function readFileAsText(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target?.result || '');
      reader.onerror = err => reject(err);
      reader.readAsText(file);
    });
  }

  function readFileAsArrayBuffer(file){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = ev => resolve(ev.target?.result || new ArrayBuffer(0));
      reader.onerror = err => reject(err);
      reader.readAsArrayBuffer(file);
    });
  }

  async function ensureXLSX(){
    if(global.XLSX){
      debugLog('xlsx.cacheHit', {}, 'xlsx'); // Debug: reuse existing XLSX
      return global.XLSX;
    }
    if(typeof Shared.lazyXlsx === 'function'){
      if(!xlsxLoaderPromise){
        debugLog('xlsx.lazyRequest', {}, 'xlsx'); // Debug: delegate to Shared.lazyXlsx
        xlsxLoaderPromise = Shared.lazyXlsx().then(lib => {
          debugLog('xlsx.loaded', { via: 'shared' }, 'xlsx');
          return lib;
        }).catch(err => {
          debugLog('xlsx.loadError', { message: err?.message || 'failed', via: 'shared' }, 'xlsx');
          xlsxLoaderPromise = null;
          throw err;
        });
      }
      return xlsxLoaderPromise;
    }
    if(xlsxLoaderPromise){
      return xlsxLoaderPromise;
    }
    if(!global.document){
      throw new Error('Document unavailable for XLSX loading');
    }
    xlsxLoaderPromise = new Promise((resolve, reject) => {
      const script = global.document.createElement('script');
      script.src = 'libs/xlsx.full.min.js';
      script.onload = () => {
        debugLog('xlsx.loaded', { via: 'fallback' }, 'xlsx');
        resolve(global.XLSX);
      };
      script.onerror = err => {
        debugLog('xlsx.loadError', { message: err?.message || 'failed', via: 'fallback' }, 'xlsx');
        reject(new Error('Failed to load XLSX script'));
      };
      global.document.head.appendChild(script);
    });
    return xlsxLoaderPromise;
  }

  async function ensureZip(){
    if(global.JSZip){
      return global.JSZip;
    }
    if(typeof Shared.lazyZip === 'function'){
      if(!zipLoaderPromise){
        zipLoaderPromise = Shared.lazyZip().catch(err => {
          zipLoaderPromise = null;
          throw err;
        });
      }
      return zipLoaderPromise;
    }
    if(zipLoaderPromise){
      return zipLoaderPromise;
    }
    if(!global.document){
      throw new Error('Document unavailable for ZIP loading');
    }
    zipLoaderPromise = new Promise((resolve, reject) => {
      const script = global.document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
      script.onload = () => resolve(global.JSZip);
      script.onerror = () => reject(new Error('Failed to load ZIP script'));
      global.document.head.appendChild(script);
    });
    return zipLoaderPromise;
  }

  async function ensurePako(){
    if(global.pako){
      return global.pako;
    }
    if(typeof require === 'function'){
      try{
        const required = require('pako');
        if(required){
          global.pako = required;
          return required;
        }
      }catch(err){
        prismDebug('pako.requireError', { message: err?.message || String(err) });
      }
    }
    if(pakoLoaderPromise){
      return pakoLoaderPromise;
    }
    if(!global.document){
      throw new Error('Document unavailable for pako loading');
    }
    pakoLoaderPromise = new Promise((resolve, reject) => {
      const script = global.document.createElement('script');
      const timer = global.setTimeout ? global.setTimeout(() => {
        reject(new Error('Timed out loading pako script'));
      }, 5000) : null;
      script.src = 'libs/pako.min.js';
      script.onload = () => {
        if(timer){
          global.clearTimeout(timer);
        }
        resolve(global.pako);
      };
      script.onerror = () => {
        if(timer){
          global.clearTimeout(timer);
        }
        reject(new Error('Failed to load pako script'));
      };
      global.document.head.appendChild(script);
    }).catch(err => {
      pakoLoaderPromise = null;
      throw err;
    });
    return pakoLoaderPromise;
  }

  function prismDebug(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      tableImportDebug('Debug: tableImport.prism ' + message, payload || {});
    }
  }

  function extractPrismText(value, depth = 0){
    if(typeof value === 'string'){
      return value;
    }
    if(typeof value === 'number' || typeof value === 'boolean'){
      return String(value);
    }
    if(!value || typeof value !== 'object' || depth > 4){
      return '';
    }
    if(Array.isArray(value)){
      for(const item of value){
        const found = extractPrismText(item, depth + 1);
        if(found){
          return found;
        }
      }
      return '';
    }
    const directKeys = ['string', 'text', 'value', 'title', 'label'];
    for(const key of directKeys){
      if(Object.prototype.hasOwnProperty.call(value, key)){
        const found = extractPrismText(value[key], depth + 1);
        if(found){
          return found;
        }
      }
    }
    for(const key of Object.keys(value)){
      const found = extractPrismText(value[key], depth + 1);
      if(found){
        return found;
      }
    }
    return '';
  }

  async function readZipText(zip, path){
    const entry = zip?.file ? zip.file(path) : null;
    if(!entry){
      return null;
    }
    return entry.async('string');
  }

  async function readZipBuffer(zip, path){
    const entry = zip?.file ? zip.file(path) : null;
    if(!entry){
      return null;
    }
    return entry.async('arraybuffer');
  }

  function normalizePrismString(value){
    if(value == null){
      return '';
    }
    let text = String(value);
    text = text.replace(/\0/g, '').trim();
    if(text.endsWith('-')){
      text = text.slice(0, -1).trim();
    }
    return text;
  }

  function isPrismReadableLabel(value){
    if(!value){
      return false;
    }
    const text = String(value).trim();
    if(!text){
      return false;
    }
    if(!/[A-Za-z]/.test(text)){
      return false;
    }
    return /^[A-Za-z0-9 .,:;()\-]+$/.test(text);
  }

  function isPrismPlaceholderLabel(value){
    if(!value){
      return false;
    }
    const trimmed = String(value).trim();
    if(!trimmed || /\s/.test(trimmed)){
      return false;
    }
    const compact = trimmed.toLowerCase();
    return compact === 'ytitle' || compact === 'xtitle' || compact === 'y1title' || compact === 'x1title';
  }

  function isPrismColorToken(value){
    if(!value){
      return false;
    }
    const raw = String(value).trim();
    const stripped = raw.startsWith('@') ? raw.slice(1) : raw;
    return /^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(stripped);
  }

  function extractPrismStringsFromBuffer(buffer){
    if(!buffer){
      return { text: '', strings: [] };
    }
    let decoded = '';
    try{
      const decoder = new TextDecoder('utf-8');
      decoded = decoder.decode(buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer));
    }catch(err){
      prismDebug('decodeError', { message: err?.message || String(err) });
      return { text: '', strings: [] };
    }
    const matches = decoded.match(/[\x20-\x7E]{4,}/g) || [];
    const strings = [];
    const seen = new Set();
    for(const raw of matches){
      const normalized = normalizePrismString(raw);
      if(!normalized || seen.has(normalized)){
        continue;
      }
      seen.add(normalized);
      strings.push(normalized);
    }
    return { text: decoded, strings };
  }

  function findPrismLabelAfterMarker(text, marker){
    if(!text || !marker){
      return '';
    }
    const idx = text.indexOf(marker);
    if(idx < 0){
      return '';
    }
    const slice = text.slice(idx + marker.length);
    const match = slice.match(/[\x20-\x7E]{4,}/);
    return match ? normalizePrismString(match[0]) : '';
  }

  function readInt32LE(bytes, offset){
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function findZlibHeader(bytes){
    if(!bytes || bytes.length < 2){
      return -1;
    }
    for(let i = 0; i < bytes.length - 1; i += 1){
      if(bytes[i] === 0x78 && (bytes[i + 1] === 0x9C || bytes[i + 1] === 0xDA || bytes[i + 1] === 0x01)){
        return i;
      }
    }
    return -1;
  }

  async function inflatePrismGraphData(buffer){
    if(!buffer){
      return null;
    }
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const zlibOffset = findZlibHeader(bytes);
    if(zlibOffset < 0){
      prismDebug('inflate.skip', { reason: 'zlibHeaderMissing' });
      return null;
    }
    if(typeof global.DecompressionStream === 'function'){
      const payload = bytes.subarray(zlibOffset + 2, bytes.length > 4 ? bytes.length - 4 : bytes.length);
      try{
        const stream = new Blob([payload]).stream().pipeThrough(new global.DecompressionStream('deflate'));
        const arrayBuffer = await new Response(stream).arrayBuffer();
        return new Uint8Array(arrayBuffer);
      }catch(err){
        prismDebug('inflate.decompressionStreamError', { message: err?.message || String(err) });
      }
    }
    try{
      const pako = await ensurePako();
      if(pako && typeof pako.inflate === 'function'){
        const inflated = pako.inflate(bytes.subarray(zlibOffset));
        return inflated instanceof Uint8Array ? inflated : new Uint8Array(inflated);
      }
      prismDebug('inflate.skip', { reason: 'pakoUnavailable' });
      return null;
    }catch(err){
      prismDebug('inflate.error', { message: err?.message || String(err) });
      return null;
    }
  }

  function parsePrismColorBytes(bytes){
    if(!bytes || bytes.length < 4){
      return '';
    }
    const b = bytes[0];
    const g = bytes[1];
    const r = bytes[2];
    const a = bytes[3];
    if(a === 0){
      return '';
    }
    const hex = value => value.toString(16).padStart(2, '0');
    return `#${hex(r)}${hex(g)}${hex(b)}`;
  }

  function collectPrismColorValues(data, key){
    if(!data || !key){
      return [];
    }
    const encoder = global.TextEncoder ? new global.TextEncoder() : null;
    if(!encoder){
      return [];
    }
    const pattern = encoder.encode(`${key}DvalMval`);
    const values = [];
    for(let i = 0; i <= data.length - pattern.length - 8; i += 1){
      let match = true;
      for(let j = 0; j < pattern.length; j += 1){
        if(data[i + j] !== pattern[j]){
          match = false;
          break;
        }
      }
      if(!match){
        continue;
      }
      const type = readInt32LE(data, i + pattern.length);
      const len = readInt32LE(data, i + pattern.length + 4);
      if(type !== 1 || len < 4 || i + pattern.length + 8 + len > data.length){
        continue;
      }
      const slice = data.subarray(i + pattern.length + 8, i + pattern.length + 12);
      const color = parsePrismColorBytes(slice);
      if(color){
        values.push(color);
      }
    }
    return values;
  }

  function pickMostCommon(values){
    if(!Array.isArray(values) || !values.length){
      return '';
    }
    const counts = new Map();
    let best = '';
    let bestCount = 0;
    values.forEach(value => {
      const next = (counts.get(value) || 0) + 1;
      counts.set(value, next);
      if(next > bestCount){
        bestCount = next;
        best = value;
      }
    });
    return best;
  }

  function filterPrismGraphCandidates(strings, options = {}){
    const sheetTitle = normalizePrismString(options.sheetTitle || '');
    const dataSetTitles = Array.isArray(options.dataSetTitles)
      ? options.dataSetTitles.map(title => normalizePrismString(title)).filter(Boolean)
      : [];
    const excluded = new Set(['PCFFGRA4','Y1Title','Zval','Zend']);
    if(sheetTitle){
      excluded.add(sheetTitle);
    }
    dataSetTitles.forEach(title => excluded.add(title));
    return (strings || []).filter(value => {
      const normalized = normalizePrismString(value);
      if(!normalized){
        return false;
      }
      if(isPrismColorToken(normalized)){
        return false;
      }
      if(!isPrismReadableLabel(normalized)){
        return false;
      }
      if(excluded.has(normalized)){
        return false;
      }
      if(/^[0-9a-f]{8}-[0-9a-f-]{8,}$/i.test(normalized)){
        return false;
      }
      return true;
    });
  }

  function prismStringsInclude(strings, matcher){
    if(!Array.isArray(strings) || typeof matcher !== 'function'){
      return false;
    }
    return strings.some(value => {
      const normalized = normalizePrismString(value).toLowerCase();
      return normalized ? matcher(normalized) : false;
    });
  }

  function prismDataIncludes(data, token){
    if(!data || !token){
      return false;
    }
    let pattern = null;
    if(typeof token === 'string'){
      const text = token;
      if(!text){
        return false;
      }
      const encoder = global.TextEncoder ? new global.TextEncoder() : null;
      if(!encoder){
        return false;
      }
      pattern = encoder.encode(text);
    }else if(token instanceof Uint8Array){
      pattern = token;
    }else if(ArrayBuffer.isView(token)){
      pattern = new Uint8Array(token.buffer, token.byteOffset, token.byteLength);
    }else if(token instanceof ArrayBuffer){
      pattern = new Uint8Array(token);
    }else{
      const text = String(token || '');
      if(!text){
        return false;
      }
      const encoder = global.TextEncoder ? new global.TextEncoder() : null;
      if(!encoder){
        return false;
      }
      pattern = encoder.encode(text);
    }
    if(!pattern.length || pattern.length > data.length){
      return false;
    }
    outer: for(let i = 0; i <= data.length - pattern.length; i += 1){
      for(let j = 0; j < pattern.length; j += 1){
        if(data[i + j] !== pattern[j]){
          continue outer;
        }
      }
      return true;
    }
    return false;
  }

  function prismWordSequenceToBytes(words){
    if(!Array.isArray(words) || !words.length){
      return new Uint8Array(0);
    }
    const bytes = new Uint8Array(words.length * 2);
    words.forEach((value, index) => {
      const normalized = Number(value) >>> 0;
      bytes[index * 2] = normalized & 0xFF;
      bytes[index * 2 + 1] = (normalized >>> 8) & 0xFF;
    });
    return bytes;
  }

  function prismDataIncludesWordSequence(data, words){
    const pattern = prismWordSequenceToBytes(words);
    if(!pattern.length){
      return false;
    }
    return prismDataIncludes(data, pattern);
  }

  function prismReadUInt16LE(data, offset){
    if(!data || offset < 0 || offset + 1 >= data.length){
      return null;
    }
    return data[offset] | (data[offset + 1] << 8);
  }

  function inferPrismColumnGraphTypeFromWrapperAt(rawData, baseOffset){
    if(!rawData){
      return '';
    }
    const base = Math.max(0, Number(baseOffset) || 0);
    const primaryKind = prismReadUInt16LE(rawData, base + 548);
    const secondaryKind = prismReadUInt16LE(rawData, base + 572);
    const tertiaryKind = prismReadUInt16LE(rawData, base + 574);
    const subtypeKind = prismReadUInt16LE(rawData, base + 576);
    if(primaryKind === 11 && secondaryKind === 11 && tertiaryKind === 11 && subtypeKind === 17){
      return 'violin';
    }
    if(primaryKind === 4 && secondaryKind === 4 && tertiaryKind === 4 && subtypeKind === 2){
      return 'box';
    }
    if(primaryKind === 3 && secondaryKind === 3 && tertiaryKind === 3 && subtypeKind === 1){
      return 'strip';
    }
    return '';
  }

  function inferPrismColumnGraphTypeFromWrapper(rawData){
    return inferPrismColumnGraphTypeFromWrapperAt(rawData, 0);
  }

  function inferPrismColumnGraphTypeFromEmbeddedWrapper(rawData){
    if(!rawData || rawData.length < 578){
      return '';
    }
    const maxOffset = Math.min(Math.max(0, rawData.length - 578), 1024 * 1024);
    for(let offset = 0; offset <= maxOffset; offset += 1){
      const graphType = inferPrismColumnGraphTypeFromWrapperAt(rawData, offset);
      if(graphType){
        return graphType;
      }
    }
    return '';
  }

  function inferPrismPreferredGraphType(strings, tableFormat, rawData, inflatedData){
    const format = normalizePrismString(tableFormat).toLowerCase();
    if(format === 'column'){
      const wrapperGraphType = inferPrismColumnGraphTypeFromWrapper(rawData)
        || inferPrismColumnGraphTypeFromEmbeddedWrapper(rawData);
      if(wrapperGraphType){
        return wrapperGraphType;
      }
      if(prismDataIncludes(inflatedData, 'PCFF_Plot::BarBoxBordercolor')){
        return 'box';
      }
      if(prismStringsInclude(strings, value => value.includes('violin'))){
        return 'violin';
      }
      if(prismStringsInclude(strings, value => value.includes('notched'))){
        return 'notched';
      }
      if(prismStringsInclude(strings, value => value.includes('individual') || value.includes('column scatter'))){
        return 'strip';
      }
      if(prismStringsInclude(strings, value => value.includes('box-and-whisker') || value.includes('box and whisker') || value === 'box')){
        return 'box';
      }
      if(prismStringsInclude(strings, value => value.includes('bar'))){
        return 'bar';
      }
    }
    return '';
  }


  function prismXmlLocalName(node){
    const rawName = node?.localName || node?.nodeName || '';
    const text = String(rawName || '');
    const colon = text.indexOf(':');
    return colon >= 0 ? text.slice(colon + 1) : text;
  }

  function prismXmlAttribute(node, name){
    if(!node || typeof node.getAttribute !== 'function' || !name){
      return '';
    }
    const direct = node.getAttribute(name);
    if(direct != null){
      return direct;
    }
    const target = String(name).toLowerCase();
    const attrs = node.attributes || [];
    for(let i = 0; i < attrs.length; i += 1){
      const attr = attrs[i];
      const attrName = prismXmlLocalName(attr).toLowerCase();
      if(attrName === target){
        return attr.value || '';
      }
    }
    return '';
  }

  function prismXmlChildren(node, localName){
    if(!node || !node.childNodes){
      return [];
    }
    const target = localName ? String(localName).toLowerCase() : '';
    const children = [];
    for(let i = 0; i < node.childNodes.length; i += 1){
      const child = node.childNodes[i];
      if(!child || child.nodeType !== 1){
        continue;
      }
      if(target && prismXmlLocalName(child).toLowerCase() !== target){
        continue;
      }
      children.push(child);
    }
    return children;
  }

  function prismXmlDescendants(node, localNames){
    if(!node || typeof node.getElementsByTagName !== 'function'){
      return [];
    }
    const names = Array.isArray(localNames) ? localNames : [localNames];
    const wanted = new Set(names.filter(Boolean).map(name => String(name).toLowerCase()));
    const matches = [];
    const all = node.getElementsByTagName('*');
    for(let i = 0; i < all.length; i += 1){
      const element = all[i];
      if(!wanted.size || wanted.has(prismXmlLocalName(element).toLowerCase())){
        matches.push(element);
      }
    }
    return matches;
  }

  function prismXmlFirstChild(node, localName){
    return prismXmlChildren(node, localName)[0] || null;
  }

  function prismXmlDirectText(node){
    if(!node){
      return '';
    }
    return normalizePrismString(node.textContent || '');
  }

  function prismXmlChildText(node, localName){
    return prismXmlDirectText(prismXmlFirstChild(node, localName));
  }

  function parsePrismXmlText(xmlText, sourceLabel){
    if(typeof global.DOMParser !== 'function'){
      throw new Error('XML parser unavailable in this environment');
    }
    const parser = new global.DOMParser();
    const doc = parser.parseFromString(String(xmlText || ''), 'application/xml');
    const parserErrors = prismXmlDescendants(doc, 'parsererror');
    if(parserErrors.length){
      const message = prismXmlDirectText(parserErrors[0]) || 'Invalid XML';
      throw new Error(`${sourceLabel || 'Prism XML'} parse error: ${message}`);
    }
    return doc;
  }

  function asciiStringToBytes(text){
    const raw = String(text || '');
    const bytes = new Uint8Array(raw.length);
    for(let i = 0; i < raw.length; i += 1){
      bytes[i] = raw.charCodeAt(i) & 0x7F;
    }
    return bytes;
  }

  function findByteSequence(bytes, sequence){
    if(!bytes || !sequence || !sequence.length || sequence.length > bytes.length){
      return -1;
    }
    outer: for(let i = 0; i <= bytes.length - sequence.length; i += 1){
      for(let j = 0; j < sequence.length; j += 1){
        if(bytes[i + j] !== sequence[j]){
          continue outer;
        }
      }
      return i;
    }
    return -1;
  }

  function decodeUtf8Bytes(bytes){
    const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if(typeof global.TextDecoder === 'function'){
      return new global.TextDecoder('utf-8').decode(source);
    }
    let text = '';
    for(let i = 0; i < source.length; i += 1){
      text += String.fromCharCode(source[i]);
    }
    return text;
  }

  function extractPzfxXmlAndOpaquePayload(input){
    if(typeof input === 'string'){
      const closeTag = '</GraphPadPrismFile>';
      const closeIndex = input.indexOf(closeTag);
      const xmlText = closeIndex >= 0 ? input.slice(0, closeIndex + closeTag.length) : input;
      return { xmlText, opaqueBytes: new Uint8Array(0), xmlByteLength: xmlText.length };
    }
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
    const closeTagBytes = asciiStringToBytes('</GraphPadPrismFile>');
    const closeOffset = findByteSequence(bytes, closeTagBytes);
    const xmlEnd = closeOffset >= 0 ? closeOffset + closeTagBytes.length : bytes.length;
    const xmlBytes = bytes.subarray(0, xmlEnd);
    const opaqueBytes = xmlEnd < bytes.length ? bytes.subarray(xmlEnd) : new Uint8Array(0);
    return {
      xmlText: decodeUtf8Bytes(xmlBytes),
      opaqueBytes,
      xmlByteLength: xmlEnd
    };
  }

  function isPzfxColumnRawValueFormat(formatKey){
    const key = String(formatKey || '').trim().toLowerCase();
    return !key || key === 'single' || key === 'y_single' || key === 'replicates';
  }

  function isPzfxColumnSummaryFormat(formatKey){
    const key = String(formatKey || '').trim().toLowerCase();
    return key === 'sdn' || key === 'sen' || key === 'cvn'
      || key === 'sd' || key === 'se' || key === 'cv'
      || key === 'low-high' || key === 'upper-lower-limits'
      || key === 'error';
  }

  function normalizePzfxFormat(value){
    return normalizePrismString(value);
  }

  function normalizePzfxDataValue(value, options = {}){
    if(value == null){
      return '';
    }
    if(options.excluded){
      return '';
    }
    let text = normalizePrismString(value);
    if(!text){
      return '';
    }
    if(text.indexOf(',') !== -1 && text.indexOf('.') === -1){
      const decimalComma = /^([+-]?(?:\d+|\d{1,3}(?:\.\d{3})*)),(\d+(?:[eE][+-]?\d+)?)$/.exec(text);
      if(decimalComma){
        text = `${decimalComma[1].replace(/\./g, '')}.${decimalComma[2]}`;
      }
    }
    if(/^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/.test(text)){
      const numeric = Number(text);
      if(Number.isFinite(numeric)){
        return String(numeric);
      }
    }
    return text;
  }

  function resolvePzfxSubcolumnNames(baseName, count, format){
    const base = normalizePrismString(baseName) || 'Y';
    const n = Math.max(0, Number(count) || 0);
    if(n <= 0){
      return [];
    }
    if(n === 1){
      return [base];
    }
    const normalized = normalizePzfxFormat(format);
    const formatKey = normalized.toLowerCase();
    const fixed = {
      error: ['_X', '_ERROR'],
      sdn: ['_MEAN', '_SD', '_N'],
      sen: ['_MEAN', '_SEM', '_N'],
      cvn: ['_MEAN', '_CV', '_N'],
      sd: ['_MEAN', '_SD'],
      se: ['_MEAN', '_SE'],
      cv: ['_MEAN', '_CV'],
      'low-high': ['_MEAN', '_PLUSERROR', '_MINUSERROR'],
      'upper-lower-limits': ['_MEAN', '_UPPERLIMIT', '_LOWERLIMIT']
    };
    if(formatKey === 'replicates'){
      return Array.from({ length: n }, (_, index) => `${base}_${index + 1}`);
    }
    const suffixes = fixed[formatKey];
    if(Array.isArray(suffixes) && suffixes.length === n){
      return suffixes.map(suffix => `${base}${suffix}`);
    }
    prismDebug('pzfx.columnFormatFallback', { base, count: n, format: normalized || '' });
    return Array.from({ length: n }, (_, index) => `${base}_${index + 1}`);
  }

  function readPzfxSubcolumn(subcolumn){
    const values = [];
    const valueNodes = prismXmlChildren(subcolumn);
    valueNodes.forEach(node => {
      const excluded = prismXmlAttribute(node, 'Excluded') === '1';
      values.push(normalizePzfxDataValue(node.textContent || '', { excluded }));
    });
    return values;
  }

  function readPzfxColumn(columnNode, options = {}){
    const requestedKind = options.kind || prismXmlLocalName(columnNode);
    const defaultName = options.defaultName || '';
    const format = options.format || '';
    const title = prismXmlChildText(columnNode, 'Title') || defaultName || requestedKind || 'Column';
    const subcolumnNodes = prismXmlChildren(columnNode, 'Subcolumn');
    const subcolumns = subcolumnNodes.map(readPzfxSubcolumn);
    if(!subcolumns.length){
      return {
        kind: requestedKind,
        title,
        names: [],
        subcolumns: [],
        rowCount: 0,
        format
      };
    }
    const names = resolvePzfxSubcolumnNames(title, subcolumns.length, format);
    const rowCount = subcolumns.reduce((max, values) => Math.max(max, values.length), 0);
    return {
      kind: requestedKind,
      title,
      names,
      subcolumns,
      rowCount,
      format
    };
  }

  function pzfxColumnValue(column, subcolumnIndex, rowIndex){
    const subcolumn = column?.subcolumns?.[subcolumnIndex];
    if(!Array.isArray(subcolumn) || rowIndex < 0 || rowIndex >= subcolumn.length){
      return '';
    }
    return subcolumn[rowIndex] ?? '';
  }

  function pzfxModelRowCount(model, columns){
    const relevant = Array.isArray(columns) ? columns : [];
    return relevant.reduce((max, column) => Math.max(max, column?.rowCount || 0), 0);
  }

  function pzfxColumnsToRows(columns){
    const activeColumns = (columns || []).filter(column => column && Array.isArray(column.names) && column.names.length);
    if(!activeColumns.length){
      return [];
    }
    const header = [];
    activeColumns.forEach(column => {
      column.names.forEach(name => header.push(name));
    });
    const rowCount = pzfxModelRowCount(null, activeColumns);
    const rows = [header];
    for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
      const row = [];
      activeColumns.forEach(column => {
        for(let sub = 0; sub < column.names.length; sub += 1){
          row.push(pzfxColumnValue(column, sub, rowIndex));
        }
      });
      rows.push(row);
    }
    return rows;
  }

  function normalizePzfxTableFormat(tableType){
    const raw = normalizePrismString(tableType).toLowerCase().replace(/[_\s-]+/g, ' ');
    if(!raw){
      return '';
    }
    if(raw.includes('parts') || raw.includes('whole') || raw.includes('pie')){
      return 'parts_of_whole';
    }
    if(raw.includes('survival')){
      return 'survival';
    }
    if(raw.includes('column')){
      return 'column';
    }
    if(raw.includes('contingency')){
      return 'contingency';
    }
    if(raw === 'xy' || raw.includes('xy')){
      return 'xy';
    }
    return raw.replace(/\s+/g, '_');
  }

  function selectPzfxTable(xmlDoc){
    const tables = prismXmlDescendants(xmlDoc, ['Table', 'HugeTable']);
    if(!tables.length){
      throw new Error('No Prism data tables found in PZFX file');
    }
    const sequence = prismXmlDescendants(xmlDoc, 'TableSequence')[0] || null;
    const selectedRefs = sequence
      ? prismXmlChildren(sequence, 'Ref').filter(ref => prismXmlAttribute(ref, 'Selected') === '1')
      : [];
    const selectedId = selectedRefs.length ? prismXmlAttribute(selectedRefs[0], 'ID') : '';
    if(selectedId){
      const selectedTable = tables.find(table => prismXmlAttribute(table, 'ID') === selectedId);
      if(selectedTable){
        return selectedTable;
      }
    }
    return tables[0];
  }

  function buildPzfxModel(tableNode){
    const title = prismXmlChildText(tableNode, 'Title');
    const tableType = prismXmlAttribute(tableNode, 'TableType');
    const tableFormat = normalizePzfxTableFormat(tableType);
    const xFormat = normalizePzfxFormat(prismXmlAttribute(tableNode, 'XFormat'));
    const yFormat = normalizePzfxFormat(prismXmlAttribute(tableNode, 'YFormat'));
    const childNodes = prismXmlChildren(tableNode);
    const rowTitleColumns = [];
    const xColumns = [];
    const xAdvancedColumns = [];
    const yColumns = [];
    childNodes.forEach(child => {
      const name = prismXmlLocalName(child);
      if(name === 'RowTitlesColumn'){
        rowTitleColumns.push(readPzfxColumn(child, { kind: 'rowTitles', defaultName: 'ROWTITLE', format: '' }));
      }else if(name === 'XColumn'){
        xColumns.push(readPzfxColumn(child, { kind: 'x', defaultName: 'X', format: xFormat === 'date' ? '' : xFormat }));
      }else if(name === 'XAdvancedColumn'){
        xAdvancedColumns.push(readPzfxColumn(child, { kind: 'xAdvanced', defaultName: 'X', format: '' }));
      }else if(name === 'YColumn'){
        yColumns.push(readPzfxColumn(child, { kind: 'y', defaultName: `Y${yColumns.length + 1}`, format: yFormat }));
      }
    });
    const useAdvancedDateX = xFormat.toLowerCase() === 'date' && xAdvancedColumns.some(column => column.names.length);
    const xColumn = useAdvancedDateX
      ? xAdvancedColumns.find(column => column.names.length) || null
      : xColumns.find(column => column.names.length) || null;
    const rowTitleColumn = rowTitleColumns.find(column => column.names.length) || null;
    const dataColumns = [];
    if(rowTitleColumn){
      dataColumns.push(rowTitleColumn);
    }
    if(xColumn){
      dataColumns.push(xColumn);
    }
    yColumns.forEach(column => {
      if(column.names.length){
        dataColumns.push(column);
      }
    });
    return {
      title,
      tableType,
      tableFormat,
      xFormat,
      yFormat,
      rowTitleColumn,
      xColumn,
      yColumns: yColumns.filter(column => column.names.length),
      rows: pzfxColumnsToRows(dataColumns)
    };
  }

  function pzfxBaseGroupLabels(model){
    const yColumns = model?.yColumns || [];
    return yColumns.length
      ? yColumns.map((column, index) => normalizePrismString(column.title) || `Series ${index + 1}`)
      : ['Series 1'];
  }

  function buildPzfxLineImport(model){
    const yColumns = model?.yColumns || [];
    if(!model?.xColumn || !yColumns.length){
      return null;
    }
    const replicateCount = yColumns.reduce((max, column) => Math.max(max, column.names.length || 0), 0) || 1;
    const groupLabels = pzfxBaseGroupLabels(model);
    const header = [normalizePrismString(model.xColumn.title) || 'X'];
    groupLabels.forEach(label => {
      for(let rep = 0; rep < replicateCount; rep += 1){
        header.push(`${label || 'Series'} Rep ${rep + 1}`);
      }
    });
    const rowCount = pzfxModelRowCount(model, [model.xColumn, ...yColumns]);
    const rows = [header];
    for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
      const row = [pzfxColumnValue(model.xColumn, 0, rowIndex)];
      yColumns.forEach(column => {
        for(let rep = 0; rep < replicateCount; rep += 1){
          row.push(pzfxColumnValue(column, rep, rowIndex));
        }
      });
      rows.push(row);
    }
    return {
      rows,
      meta: {
        kind: 'line',
        dataFormat: 'y_replicates',
        tableClass: 'PZFXTable',
        replicatesCount: replicateCount,
        groupLabels,
        xTitle: normalizePrismString(model.xColumn.title) || ''
      }
    };
  }

  function buildPzfxScatterImport(model){
    const yColumns = model?.yColumns || [];
    if(!model?.xColumn || !yColumns.length || yColumns.some(column => column.names.length !== 1)){
      return null;
    }
    const seriesCount = Math.max(1, yColumns.length);
    const headerLabel = model.rowTitleColumn ? (normalizePrismString(model.rowTitleColumn.title) || 'Labels') : 'Labels';
    const xHeader = normalizePrismString(model.xColumn.title) || 'X';
    const yHeader = seriesCount === 1 ? (normalizePrismString(yColumns[0].title) || 'Y') : 'Y';
    const rows = [[headerLabel, xHeader, yHeader]];
    const rowCount = pzfxModelRowCount(model, [model.rowTitleColumn, model.xColumn, ...yColumns].filter(Boolean));
    const groupLabels = pzfxBaseGroupLabels(model);
    for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
      const baseLabel = model.rowTitleColumn ? pzfxColumnValue(model.rowTitleColumn, 0, rowIndex) : '';
      yColumns.forEach((column, seriesIndex) => {
        const dsLabel = groupLabels[seriesIndex] || '';
        let label = baseLabel;
        if(seriesCount > 1 && dsLabel){
          const trimmedBase = normalizePrismString(baseLabel);
          label = trimmedBase ? `${trimmedBase} (${dsLabel})` : dsLabel;
        }
        rows.push([
          label || '',
          pzfxColumnValue(model.xColumn, 0, rowIndex),
          pzfxColumnValue(column, 0, rowIndex)
        ]);
      });
    }
    return {
      rows,
      meta: {
        kind: 'scatter',
        dataFormat: 'y_single',
        tableClass: 'PZFXTable',
        seriesCount,
        xTitle: xHeader,
        yTitles: groupLabels.slice(),
        headerRow: rows[0]
      }
    };
  }

  function buildPzfxSurvivalImport(model){
    const yColumns = model?.yColumns || [];
    const timeColumn = model?.xColumn || model?.rowTitleColumn || null;
    if(!timeColumn || !yColumns.length){
      return null;
    }
    const groupLabels = pzfxBaseGroupLabels(model);
    const rowCount = pzfxModelRowCount(model, [timeColumn, ...yColumns]);
    const rows = [];
    for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
      const timeValue = pzfxColumnValue(timeColumn, 0, rowIndex);
      yColumns.forEach((column, seriesIndex) => {
        const eventValue = pzfxColumnValue(column, 0, rowIndex);
        if(isPrismBlankCell(eventValue)){
          return;
        }
        rows.push([
          groupLabels[seriesIndex] || `Group ${seriesIndex + 1}`,
          timeValue,
          eventValue,
          '',
          '',
          '',
          ''
        ]);
      });
    }
    return {
      rows,
      meta: {
        kind: 'survival',
        dataFormat: 'y_single',
        tableClass: 'PZFXTable',
        seriesCount: groupLabels.length,
        groupLabels: groupLabels.slice(),
        xTitle: normalizePrismString(timeColumn.title) || 'Time'
      }
    };
  }

  function buildPzfxPieImport(model){
    const yColumns = model?.yColumns || [];
    if(!yColumns.length){
      return null;
    }
    const categoryColumn = model?.rowTitleColumn || model?.xColumn || null;
    const firstY = yColumns[0];
    const secondY = yColumns[1] || null;
    const headerRow = [
      categoryColumn ? (normalizePrismString(categoryColumn.title) || 'Category') : 'Category',
      normalizePrismString(firstY.title) || 'Value',
      secondY ? (normalizePrismString(secondY.title) || 'Expected') : 'Expected'
    ];
    const rows = [headerRow];
    const rowCount = pzfxModelRowCount(model, [categoryColumn, firstY, secondY].filter(Boolean));
    for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
      rows.push([
        categoryColumn ? pzfxColumnValue(categoryColumn, 0, rowIndex) : `Category ${rowIndex + 1}`,
        pzfxColumnValue(firstY, 0, rowIndex),
        secondY ? pzfxColumnValue(secondY, 0, rowIndex) : ''
      ]);
    }
    return {
      rows,
      meta: {
        kind: 'pie',
        dataFormat: 'y_single',
        tableClass: 'PZFXTable',
        seriesCount: yColumns.length || 1,
        categoryTitle: headerRow[0],
        valueTitles: yColumns.map(column => normalizePrismString(column.title)).filter(Boolean)
      }
    };
  }

  function inferPzfxColumnGraphType(model, options = {}){
    if((model?.tableFormat || '') !== 'column'){
      return '';
    }
    const yFormatKey = normalizePzfxFormat(model?.yFormat || '').toLowerCase();
    const graphMetadataType = normalizePrismString(options.graphMetadataType || '').toLowerCase();
    if(graphMetadataType && isPzfxColumnRawValueFormat(yFormatKey)){
      return graphMetadataType;
    }
    if(isPzfxColumnRawValueFormat(yFormatKey)){
      return 'strip';
    }
    return '';
  }

  async function inferPzfxOpaqueGraphMetadata(model, payload){
    if((model?.tableFormat || '') !== 'column'){
      return { graphMetadataType: '', source: 'none', stringCount: 0, inflated: false };
    }
    const bytes = payload?.opaqueBytes instanceof Uint8Array ? payload.opaqueBytes : new Uint8Array(0);
    if(!bytes.length){
      return { graphMetadataType: '', source: 'none', stringCount: 0, inflated: false };
    }
    const extracted = extractPrismStringsFromBuffer(bytes);
    const normalizedStrings = (extracted.strings || []).map(item => normalizePrismString(item));
    const inflated = await inflatePrismGraphData(bytes);
    const graphMetadataType = inferPrismPreferredGraphType(
      normalizedStrings,
      'column',
      bytes,
      inflated
    );
    return {
      graphMetadataType,
      source: graphMetadataType ? 'opaque-graph-payload' : 'none',
      stringCount: normalizedStrings.length,
      inflated: !!inflated
    };
  }

  function buildPzfxImportRowsAndMeta(model, graphMetadata = {}){
    const tableFormat = model?.tableFormat || '';
    const yFormat = normalizePzfxFormat(model?.yFormat || '');
    const yFormatKey = yFormat.toLowerCase();
    if((tableFormat === 'xy' || tableFormat === 'survival') && yFormatKey === 'replicates'){
      const lineImport = buildPzfxLineImport(model);
      if(lineImport){
        prismDebug('pzfx.xy.line', {
          replicatesCount: lineImport.meta.replicatesCount,
          seriesCount: lineImport.meta.groupLabels.length,
          rows: Math.max(0, lineImport.rows.length - 1)
        });
        return lineImport;
      }
    }
    if(tableFormat === 'survival'){
      const survivalImport = buildPzfxSurvivalImport(model);
      if(survivalImport){
        prismDebug('pzfx.xy.survival', {
          seriesCount: survivalImport.meta.groupLabels.length,
          rows: survivalImport.rows.length
        });
        return survivalImport;
      }
    }
    if(tableFormat === 'xy' && (!yFormatKey || yFormatKey === 'single')){
      const scatterImport = buildPzfxScatterImport(model);
      if(scatterImport){
        prismDebug('pzfx.xy.scatter', {
          seriesCount: scatterImport.meta.seriesCount,
          rows: Math.max(0, scatterImport.rows.length - 1)
        });
        return scatterImport;
      }
    }
    if(tableFormat === 'parts_of_whole'){
      const pieImport = buildPzfxPieImport(model);
      if(pieImport){
        prismDebug('pzfx.table.pie', {
          seriesCount: pieImport.meta.seriesCount,
          rows: Math.max(0, pieImport.rows.length - 1)
        });
        return pieImport;
      }
    }
    const meta = tableFormat === 'column'
      ? {
          kind: 'column',
          dataFormat: yFormat || 'y_single',
          tableClass: 'PZFXTable',
          seriesCount: model?.yColumns?.length || 0,
          groupLabels: (model?.yColumns || []).map(column => normalizePrismString(column.title)).filter(Boolean),
          graphType: inferPzfxColumnGraphType(model, graphMetadata),
          graphTypeSource: graphMetadata.source || '',
          graphMetadataType: graphMetadata.graphMetadataType || '',
          summaryFormat: isPzfxColumnSummaryFormat(yFormatKey),
          rawValueCompatible: isPzfxColumnRawValueFormat(yFormatKey)
        }
      : null;
    if(tableFormat === 'column'){
      prismDebug('pzfx.table.column', {
        seriesCount: meta.seriesCount,
        rows: Math.max(0, (model?.rows?.length || 1) - 1),
        graphType: meta.graphType || '',
        graphTypeSource: meta.graphTypeSource || '',
        yFormat,
        rawValueCompatible: meta.rawValueCompatible === true,
        summaryFormat: meta.summaryFormat === true
      });
    }else{
      prismDebug('pzfx.table.raw', {
        tableFormat,
        yFormat,
        rows: Math.max(0, (model?.rows?.length || 1) - 1)
      });
    }
    return { rows: model?.rows || [], meta };
  }

  async function parsePzfxInput(input){
    const payload = extractPzfxXmlAndOpaquePayload(input);
    const doc = parsePrismXmlText(payload.xmlText, 'PZFX');
    const tableNode = selectPzfxTable(doc);
    const model = buildPzfxModel(tableNode);
    const graphMetadata = await inferPzfxOpaqueGraphMetadata(model, payload);
    const built = buildPzfxImportRowsAndMeta(model, graphMetadata);
    const rows = filterRows(built.rows || []);
    return {
      rows,
      prismMeta: built.meta || null,
      tableTitle: model.title || '',
      tableFormat: model.tableFormat || '',
      yFormat: model.yFormat || '',
      opaqueBytes: payload.opaqueBytes?.length || 0,
      graphMetadata
    };
  }

  function parsePzfxText(xmlText){
    const doc = parsePrismXmlText(xmlText, 'PZFX');
    const tableNode = selectPzfxTable(doc);
    const model = buildPzfxModel(tableNode);
    const built = buildPzfxImportRowsAndMeta(model);
    const rows = filterRows(built.rows || []);
    return {
      rows,
      prismMeta: built.meta || null,
      tableTitle: model.title || '',
      tableFormat: model.tableFormat || '',
      yFormat: model.yFormat || ''
    };
  }

  async function readZipJson(zip, path){
    const text = await readZipText(zip, path);
    if(!text){
      return null;
    }
    try{
      return JSON.parse(text);
    }catch(err){
      prismDebug('parseJsonError', { path, message: err?.message || String(err) });
      throw err;
    }
  }

  function notifyError(options, message, err){
    const errorObj = err instanceof Error ? err : (err ? new Error(String(err)) : new Error(message || 'table import error'));
    if(typeof options.onError === 'function'){
      options.onError(errorObj, message);
      return;
    }
    if(err){
      console.error('tableImport error', message, err);
    }else{
      console.error('tableImport error', message);
    }
    if(message && typeof global.alert === 'function'){
      const alertMsg = err ? `${message}: ${errorObj.message}` : message;
      global.alert(alertMsg);
    }
  }

  function cloneOptions(options, extra){
    const { onRows, selection, ...rest } = options || {};
    return Object.assign({}, rest, extra);
  }

  function normalizeArea(totalRows, totalCols, area){
    if(!Array.isArray(area) || area.length !== 4){
      return [0, 0, Math.max(0, totalRows - 1), Math.max(0, totalCols - 1)];
    }
    const [sr, sc, er, ec] = area;
    const startRow = Math.max(0, Math.min(totalRows - 1, typeof sr === 'number' ? sr : 0));
    const startCol = Math.max(0, Math.min(totalCols - 1, typeof sc === 'number' ? sc : 0));
    const endRow = Math.max(startRow, Math.min(totalRows - 1, typeof er === 'number' ? er : startRow));
    const endCol = Math.max(startCol, Math.min(totalCols - 1, typeof ec === 'number' ? ec : startCol));
    return [startRow, startCol, endRow, endCol];
  }

  tableImport.captureHotSnapshot = function captureHotSnapshot(hot, options = {}){
    const debugLabel = options.debugLabel || 'tableImport.snapshot';
    if(!hot){
      debugLog('snapshot.skip', { reason: 'noHot' }, debugLabel); // Debug: snapshot skipped - missing hot
      return null;
    }
    const countRows = typeof hot.countSourceRows === 'function'
      ? hot.countSourceRows()
      : (typeof hot.countRows === 'function' ? hot.countRows() : 0);
    const countCols = typeof hot.countSourceCols === 'function'
      ? hot.countSourceCols()
      : (typeof hot.countCols === 'function' ? hot.countCols() : 0);
    if(countRows === 0 || countCols === 0){
      debugLog('snapshot.skip', { reason: 'emptyTable', rows: countRows, cols: countCols }, debugLabel);
      return { kind: 'empty', rows: countRows, cols: countCols };
    }
    const limit = typeof options.maxCells === 'number'
      ? options.maxCells
      : (typeof tableImport.snapshotCellThreshold === 'number'
        ? tableImport.snapshotCellThreshold
        : DEFAULT_SNAPSHOT_CELL_THRESHOLD);
    const area = normalizeArea(countRows, countCols, options.area);
    const areaRows = area[2] >= area[0] ? (area[2] - area[0] + 1) : 0;
    const areaCols = area[3] >= area[1] ? (area[3] - area[1] + 1) : 0;
    const areaCells = areaRows * areaCols;
    if(limit && areaCells > limit){
      debugLog('snapshot.degraded', {
        rows: countRows,
        cols: countCols,
        area,
        areaRows,
        areaCols,
        areaCells,
        limit
      }, debugLabel); // Debug: snapshot downgraded due to size
      return {
        kind: 'degraded',
        rows: countRows,
        cols: countCols,
        area,
        areaCells,
        limit
      };
    }
    let data = null;
    if(typeof hot.getData === 'function'){
      const raw = hot.getData(area[0], area[1], area[2], area[3]);
      data = Array.isArray(raw) ? raw.map(row => Array.isArray(row) ? row.slice() : []) : null;
    }else if(typeof hot.getSourceData === 'function'){
      const source = hot.getSourceData();
      data = [];
      for(let r = area[0]; r <= area[2]; r += 1){
        const row = source && source[r] ? source[r] : [];
        data.push(row.slice(area[1], area[3] + 1));
      }
    }
    if(!Array.isArray(data)){
      debugLog('snapshot.skip', { reason: 'noDataAccessor', rows: countRows, cols: countCols }, debugLabel);
      return null;
    }
    debugLog('snapshot.captured', {
      rows: countRows,
      cols: countCols,
      area,
      cellsCaptured: areaCells
    }, debugLabel);
    return {
      kind: 'area',
      rows: countRows,
      cols: countCols,
      area: {
        startRow: area[0],
        startCol: area[1],
        endRow: area[2],
        endCol: area[3]
      },
      data
    };
  };

  tableImport.restoreHotSnapshot = function restoreHotSnapshot(hot, snapshot, options = {}){
    const debugLabel = options.debugLabel || 'tableImport.snapshot';
    if(!hot || !snapshot){
      debugLog('snapshot.restore.skip', { reason: 'missingHotOrSnapshot' }, debugLabel);
      return false;
    }
    if(snapshot.kind !== 'area'){
      debugLog('snapshot.restore.unavailable', { kind: snapshot.kind || 'unknown' }, debugLabel);
      return false;
    }
    const { area, data } = snapshot;
    if(!area || !Array.isArray(data)){
      debugLog('snapshot.restore.skip', { reason: 'invalidSnapshot' }, debugLabel);
      return false;
    }
    const applySnapshot = ()=>{
      if(typeof hot.populateFromArray === 'function'){
        hot.populateFromArray(
          area.startRow,
          area.startCol,
          data,
          area.endRow,
          area.endCol,
          'overwrite',
          'UndoRedo.tableImport.restoreHotSnapshot'
        );
        return true;
      }
      if(typeof hot.setDataAtCell === 'function'){
        const changeList = [];
        for(let r = 0; r < data.length; r += 1){
          const row = data[r] || [];
          for(let c = 0; c < row.length; c += 1){
            changeList.push([
              area.startRow + r,
              area.startCol + c,
              row[c]
            ]);
          }
        }
        if(changeList.length){
          hot.setDataAtCell(changeList, 'UndoRedo.tableImport.restoreHotSnapshot');
        }
        return true;
      }
      if(typeof hot.loadData === 'function'
        && area.startRow === 0
        && area.startCol === 0
        && area.endRow - area.startRow + 1 === data.length){
        hot.loadData(data);
        return true;
      }
      return false;
    };
    let applied = false;
    if(typeof hot.batch === 'function'){
      hot.batch(()=>{
        applied = applySnapshot();
      });
    }else{
      applied = applySnapshot();
    }
    if(!applied){
      debugLog('snapshot.restore.failed', { reason: 'applyFailed' }, debugLabel);
      return false;
    }
    if(typeof options.minRows === 'number' || typeof options.minCols === 'number'){
      if(typeof hot.updateSettings === 'function'){
        const payload = {};
        if(typeof options.minRows === 'number') payload.minRows = options.minRows;
        if(typeof options.minCols === 'number') payload.minCols = options.minCols;
        hot.updateSettings(payload);
      }
    }
    if(typeof hot.render === 'function'){
      hot.render();
    }
    if(typeof options.scheduleDraw === 'function'){
      options.scheduleDraw();
    }
    debugLog('snapshot.restore.applied', { area }, debugLabel);
    return true;
  };

  function inferHotScope(hot, debugLabel){
    const root = hot?.rootElement || hot?.container || null;
    if(root && typeof root.closest === 'function'){
      const panel = root.closest('.panel');
      if(panel?.id) return panel.id;
      const svgbox = root.closest('.svgbox');
      if(svgbox?.id) return svgbox.id;
    }
    return root?.id || debugLabel;
  }

  function resolveRowAppendAction(currentRows){
    if(!(currentRows > 0)){
      return { action: 'insert_row_above', index: 0, removeIndex: 0 };
    }
    return { action: 'insert_row_below', index: currentRows - 1, removeIndex: currentRows };
  }

  function resolveColAppendAction(currentCols){
    if(!(currentCols > 0)){
      return { action: 'insert_col_start', index: 0, removeIndex: 0 };
    }
    return { action: 'insert_col_end', index: currentCols - 1, removeIndex: currentCols };
  }

  function resolveRowInsertFromMeta(meta){
    if(!meta){
      return null;
    }
    if(meta.action && typeof meta.index === 'number'){
      return { action: meta.action, index: meta.index };
    }
    const removeIndex = typeof meta.removeIndex === 'number'
      ? meta.removeIndex
      : (typeof meta.index === 'number' ? meta.index : null);
    if(removeIndex == null){
      return null;
    }
    if(removeIndex <= 0){
      return { action: 'insert_row_above', index: 0 };
    }
    return { action: 'insert_row_below', index: removeIndex - 1 };
  }

  function resolveColInsertFromMeta(meta){
    if(!meta){
      return null;
    }
    if(meta.action && typeof meta.index === 'number'){
      return { action: meta.action, index: meta.index };
    }
    const removeIndex = typeof meta.removeIndex === 'number'
      ? meta.removeIndex
      : (typeof meta.index === 'number' ? meta.index : null);
    if(removeIndex == null){
      return null;
    }
    if(removeIndex <= 0){
      return { action: 'insert_col_start', index: 0 };
    }
    return { action: 'insert_col_end', index: removeIndex - 1 };
  }

  tableImport.processRows = function processRows(rows, hot, options = {}){
    const debugLabel = options.debugLabel || 'tableImport';
    if(!rows || !rows.length){
      debugLog('processRows.noRows', { inputRows: rows ? rows.length : 0 }, debugLabel);
      return null;
    }
    if(!hot){
      debugLog('processRows.noHot', { reason: 'missing hot instance' }, debugLabel);
      return null;
    }
    const filteredRows = filterRows(rows);
    if(!filteredRows.length){
      debugLog('processRows.filteredEmpty', { inputRows: rows.length }, debugLabel);
      return null;
    }
    const rawStartRow = typeof options.startRow === 'number' ? options.startRow : 0;
    const rawStartCol = typeof options.startCol === 'number' ? options.startCol : 0;
    const startRow = rawStartRow < 0 ? 0 : rawStartRow;
    const startCol = rawStartCol < 0 ? 0 : rawStartCol;
    if(startRow !== rawStartRow || startCol !== rawStartCol){
      debugLog('processRows.startAdjusted', { rawStartRow, rawStartCol, startRow, startCol }, debugLabel); // Debug: clamp negative start positions
    }
    const incomingCols = filteredRows.reduce((max, row) => Math.max(max, row.length), 0);
    const incomingRows = filteredRows.length;
    const currentRows = typeof hot.countSourceRows === 'function'
      ? hot.countSourceRows()
      : (typeof hot.countRows === 'function' ? hot.countRows() : filteredRows.length);
    const currentCols = typeof hot.countSourceCols === 'function'
      ? hot.countSourceCols()
      : (typeof hot.countCols === 'function' ? hot.countCols() : incomingCols);
    const hotSettings = typeof hot.getSettings === 'function' ? hot.getSettings() : {};
    const previousMinRows = typeof hotSettings?.minRows === 'number' ? hotSettings.minRows : currentRows;
    const previousMinCols = typeof hotSettings?.minCols === 'number' ? hotSettings.minCols : currentCols;
    const minRows = options.minRows != null ? options.minRows : previousMinRows;
    const minCols = options.minCols != null ? options.minCols : previousMinCols;
    const fullReplace = startRow === 0
      && startCol === 0
      && !options.selection
      && options.preserveExisting !== true
      && (!options.onRows || options.onRows === tableImport.processRows);
    const allowShrink = options.allowShrink === true && fullReplace;
    const baseTargetRows = startRow + incomingRows;
    const baseTargetCols = startCol + incomingCols;
    const targetRows = allowShrink
      ? Math.max(minRows, baseTargetRows)
      : Math.max(minRows, currentRows, baseTargetRows);
    const targetCols = allowShrink
      ? Math.max(minCols, baseTargetCols)
      : Math.max(minCols, currentCols, baseTargetCols);
    const stats = {
      rowCount: incomingRows,
      colCount: incomingCols,
      startRow,
      startCol,
      targetRows,
      targetCols,
      delimiter: options.delimiter || null
    };
    debugLog('processRows.entry', stats, debugLabel);
    if(typeof options.onBeforeProcess === 'function'){
      options.onBeforeProcess(stats);
    }
    const resultMeta = {
      changes: [],
      insertedRows: null,
      insertedCols: null,
      previousMinRows,
      previousMinCols,
      nextMinRows: targetRows,
      nextMinCols: targetCols,
      fullReplace
    };
    let data;
    if(fullReplace){
      debugLog('processRows.fullReplace', { targetRows, targetCols, incomingRows }, debugLabel); // Debug: full replace branch
      data = new Array(targetRows);
      const padRow = (row)=>{
        const next = new Array(targetCols);
        const limit = Math.min(row.length, targetCols);
        for(let i = 0; i < limit; i++){
          next[i] = row[i];
        }
        for(let i = limit; i < targetCols; i++){
          next[i] = '';
        }
        return next;
      };
      for(let r = 0; r < incomingRows; r++){
        data[r] = padRow(filteredRows[r]);
      }
      for(let r = incomingRows; r < targetRows; r++){
        data[r] = new Array(targetCols).fill('');
      }
    }else{
      const extraRows = targetRows > currentRows ? targetRows - currentRows : 0;
      const extraCols = targetCols > currentCols ? targetCols - currentCols : 0;
      const hasAlter = typeof hot.alter === 'function';
      const batched = typeof hot.batch === 'function';
      const applyChanges = (changes, source)=>{
        if(!changes.length){
          return;
        }
        if(typeof hot.setDataAtCell === 'function'){
          hot.setDataAtCell(changes, source);
        }else if(typeof hot.populateFromArray === 'function'){
          const minRow = changes.reduce((min, entry)=>Math.min(min, entry[0]), Number.POSITIVE_INFINITY);
          const minCol = changes.reduce((min, entry)=>Math.min(min, entry[1]), Number.POSITIVE_INFINITY);
          const maxRow = changes.reduce((max, entry)=>Math.max(max, entry[0]), Number.NEGATIVE_INFINITY);
          const maxCol = changes.reduce((max, entry)=>Math.max(max, entry[1]), Number.NEGATIVE_INFINITY);
          const blockRows = maxRow - minRow + 1;
          const blockCols = maxCol - minCol + 1;
          const block = Array.from({ length: blockRows }, () => Array(blockCols).fill(''));
          changes.forEach(([rowIdx, colIdx, value]) => {
            const r = rowIdx - minRow;
            const c = colIdx - minCol;
            block[r][c] = value;
          });
          hot.populateFromArray(minRow, minCol, block, maxRow, maxCol, 'overwrite', source);
        }
      };
      const performUpdates = ()=>{
        if(hasAlter){
          if(extraRows > 0){
            const rowAction = resolveRowAppendAction(currentRows);
            debugLog('processRows.extendRows', { action: rowAction.action, index: rowAction.index, amount: extraRows }, debugLabel);
            hot.alter(rowAction.action, rowAction.index, extraRows, 'tableImport.processRows');
            resultMeta.insertedRows = {
              action: rowAction.action,
              index: rowAction.index,
              amount: extraRows,
              removeIndex: rowAction.removeIndex
            };
          }
          if(extraCols > 0){
            const colAction = resolveColAppendAction(currentCols);
            debugLog('processRows.extendCols', { action: colAction.action, index: colAction.index, amount: extraCols }, debugLabel);
            hot.alter(colAction.action, colAction.index, extraCols, 'tableImport.processRows');
            resultMeta.insertedCols = {
              action: colAction.action,
              index: colAction.index,
              amount: extraCols,
              removeIndex: colAction.removeIndex
            };
          }
        }
        const changeList = [];
        for(let r = 0; r < incomingRows; r++){
          const row = filteredRows[r];
          for(let c = 0; c < row.length; c++){
            const destRow = startRow + r;
            const destCol = startCol + c;
            if(destRow < 0 || destCol < 0){
              continue;
            }
            const incomingValue = row[c];
            const currentValue = typeof hot.getDataAtCell === 'function' ? hot.getDataAtCell(destRow, destCol) : null;
            const normalizedCurrent = currentValue != null ? currentValue : '';
            const normalizedIncoming = incomingValue != null ? incomingValue : '';
            if(options.preserveExisting === true && normalizedCurrent !== ''){
              continue;
            }
            if(normalizedCurrent === normalizedIncoming){
              continue;
            }
            resultMeta.changes.push({
              row: destRow,
              col: destCol,
              oldValue: normalizedCurrent,
              newValue: normalizedIncoming
            });
            changeList.push([destRow, destCol, normalizedIncoming]);
          }
        }
        applyChanges(changeList, 'tableImport.processRows');
      };
      if(batched){
        hot.batch(()=>{
          performUpdates();
        });
      }else{
        performUpdates();
      }
      if(typeof hot.render === 'function'){
        hot.render();
      }
    }
    if(typeof hot.updateSettings === 'function'){
      if(fullReplace){
        hot.updateSettings({ data, minRows: targetRows, minCols: targetCols, trimData: allowShrink });
      }else{
        hot.updateSettings({ minRows: targetRows, minCols: targetCols });
      }
    }else if(fullReplace && typeof hot.loadData === 'function'){
      hot.loadData(data);
    }
    if(typeof options.scheduleDraw === 'function'){
      options.scheduleDraw();
    }
    const result = Object.assign({ rows: targetRows, cols: targetCols }, stats, resultMeta);
    if(typeof options.onProcessed === 'function'){
      options.onProcessed(result);
    }
    try{
      if(startRow === 0 && Shared?.hot?.refreshHeaderWidths){
        const headerRow = filteredRows[0] || null;
        Shared.hot.refreshHeaderWidths(hot, { reason: 'tableImport', headerRow });
      }
    }catch(err){
      debugLog('processRows.headerWidthRefreshError', { error: err?.message || String(err) }, debugLabel);
    }
    debugLog('processRows.complete', result, debugLabel);
    return result;
  };

  tableImport.openFile = async function openFile(inputEl, options = {}){
    const debugLabel = options.debugLabel || inputEl?.id || 'tableImport';
    debugLog('openFile.entry', { inputId: inputEl?.id || null }, debugLabel);
    const file = inputEl?.files && inputEl.files[0];
    if(!file){
      debugLog('openFile.noFile', {}, debugLabel);
      return null;
    }
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    debugLog('openFile.fileSelected', { name: file.name, size: file.size, ext }, debugLabel);
    const defaultStartRow = options.startRow ?? 0;
    const defaultStartCol = options.startCol ?? 0;
    const allowShrink = options.allowShrink !== false;
    const applyRows = (rows, meta = {}) => {
      const handler = typeof options.onRows === 'function'
        ? options.onRows
        : (parsedRows, metaInfo) => tableImport.processRows(parsedRows, options.hot, cloneOptions(options, Object.assign({ startRow: defaultStartRow, startCol: defaultStartCol, allowShrink }, metaInfo)));
      return handler(rows, meta);
    };
    if(ext === 'pzfx'){
      showPrismImportLimitations();
      try{
        const buffer = await readFileAsArrayBuffer(file);
        prismDebug('pzfx.load', { name: file.name, size: file.size });
        const parsed = await parsePzfxInput(buffer);
        if(!parsed.rows.length){
          throw new Error('PZFX table contained no importable data');
        }
        const result = await applyRows(parsed.rows, { delimiter: '\t' });
        if(result && parsed.prismMeta){
          result.prismMeta = parsed.prismMeta;
        }
        renameActiveTabForImport(file, result, options);
        prismDebug('pzfx.import.complete', {
          tableTitle: parsed.tableTitle || '',
          tableFormat: parsed.tableFormat || '',
          yFormat: parsed.yFormat || '',
          rows: result?.rows || 0,
          cols: result?.cols || 0,
          opaqueBytes: parsed.opaqueBytes || 0,
          graphMetadataType: parsed.graphMetadata?.graphMetadataType || '',
          graphMetadataSource: parsed.graphMetadata?.source || ''
        });
        return result;
      }catch(err){
        notifyError(options, 'Failed to import PZFX Prism file', err);
        return null;
      }
    }
    if(ext === 'prism'){
      showPrismImportLimitations();
      try{
        const buffer = await readFileAsArrayBuffer(file);
        const JSZip = await ensureZip();
        prismDebug('zip.load', { name: file.name, size: file.size });
        const zip = await JSZip.loadAsync(buffer);
        const document = await readZipJson(zip, 'document.json');
        if(!document){
          throw new Error('Prism document.json not found');
        }
        const dataSheetId = document?.uiSettings?.currentSheets?.data
          || (Array.isArray(document?.sheets?.data) ? document.sheets.data[0] : null);
        if(!dataSheetId){
          throw new Error('Prism data sheet not found');
        }
        const sheet = await readZipJson(zip, `data/sheets/${dataSheetId}/sheet.json`);
        const tableId = sheet?.table?.uid || null;
        if(!tableId){
          throw new Error('Prism data table not found');
        }
        const fontFamily = typeof sheet?.font?.family === 'string' ? sheet.font.family.trim() : '';
        const fontSizeRaw = Number(sheet?.font?.size);
        const fontSize = Number.isFinite(fontSizeRaw) && fontSizeRaw > 0 ? fontSizeRaw : null;
        const dataCsv = await readZipText(zip, `data/tables/${tableId}/data.csv`);
        if(dataCsv == null){
          throw new Error('Prism data CSV not found');
        }
        const delimiter = detectDelimiter(dataCsv, ',');
        const rows = parseDelimitedText(dataCsv, delimiter);
        const filtered = filterRows(rows);
        const tableInfo = sheet?.table || {};
        const tableClass = typeof tableInfo?.['@class'] === 'string' ? tableInfo['@class'] : '';
        const tableFormat = typeof tableInfo?.format === 'string' ? tableInfo.format : '';
        const dataFormat = typeof tableInfo?.dataFormat === 'string' ? tableInfo.dataFormat : '';
        const rowTitlesId = tableInfo?.rowTitlesDataSet || '';
        const xDataSetId = tableInfo?.xDataSet || '';
        const dataSetIds = Array.isArray(tableInfo?.dataSets) ? tableInfo.dataSets : [];
        const readDataSetTitle = async uid => {
          if(!uid){
            return '';
          }
          const setInfo = await readZipJson(zip, `data/sets/${uid}.json`);
          const rawTitle = setInfo?.title;
          const title = normalizePrismString(extractPrismText(rawTitle));
          prismDebug('dataset.title', { uid, rawType: typeof rawTitle, title });
          return title;
        };
        let dataSetTitles = [];
        if(dataSetIds.length){
          const titles = await Promise.all(dataSetIds.map(readDataSetTitle));
          dataSetTitles = titles.filter(Boolean);
        }
        const xTitle = await readDataSetTitle(xDataSetId);
        const rowTitleLabel = await readDataSetTitle(rowTitlesId);
        let prismStyle = null;
        let prismGraphLabels = { title: '', xLabel: '', yLabel: '' };
        let prismPreferredGraphType = '';
        const sheetTitle = normalizePrismString(sheet?.title || '');
        const graphSheetId = document?.uiSettings?.currentSheets?.graph
          || (Array.isArray(document?.sheets?.graphs) ? document.sheets.graphs[0] : null);
        if(graphSheetId){
          const graphSheet = await readZipJson(zip, `graphs/${graphSheetId}/sheet.json`);
          const graphSheetTitle = normalizePrismString(graphSheet?.title || '');
          const graphBuffer = await readZipBuffer(zip, `graphs/${graphSheetId}/data.bin`);
          if(graphBuffer){
            const parsed = extractPrismStringsFromBuffer(graphBuffer);
            const normalizedStrings = (parsed.strings || []).map(item => normalizePrismString(item));
            const markerIndex = normalizedStrings.indexOf('Y1Title');
            let yLabel = '';
            let xLabel = '';
            let title = '';
            if(markerIndex > 0){
              const immediate = normalizedStrings[markerIndex - 1];
              if(immediate && !isPrismPlaceholderLabel(immediate) && isPrismReadableLabel(immediate)){
                yLabel = immediate;
                if(markerIndex > 1){
                  const xCandidate = normalizedStrings[markerIndex - 2];
                  if(xCandidate && !isPrismPlaceholderLabel(xCandidate) && isPrismReadableLabel(xCandidate)){
                    xLabel = xCandidate;
                    if(markerIndex > 2){
                      const titleCandidate = normalizedStrings[markerIndex - 3];
                      const normalizedTitle = normalizePrismString(titleCandidate);
                      if(normalizedTitle
                        && !isPrismPlaceholderLabel(normalizedTitle)
                        && isPrismReadableLabel(normalizedTitle)
                        && normalizedTitle !== graphSheetTitle
                        && normalizedTitle !== sheetTitle
                        && normalizedTitle !== xLabel
                        && normalizedTitle !== yLabel){
                        title = titleCandidate;
                      }
                    }
                  }
                }
              }
            }
            if(!xLabel && xTitle && isPrismReadableLabel(xTitle)){
              xLabel = xTitle;
            }
            prismGraphLabels = { title, xLabel, yLabel };
            const inflated = await inflatePrismGraphData(graphBuffer);
            prismPreferredGraphType = inferPrismPreferredGraphType(normalizedStrings, tableFormat, new Uint8Array(graphBuffer), inflated);
            let fontColor = '';
            let axisColor = '';
            if(inflated){
              fontColor = pickMostCommon(collectPrismColorValues(inflated, 'IPGAxSeg::textcolor'));
              axisColor = pickMostCommon(collectPrismColorValues(inflated, 'PCFF_LineStyle::linecolor'));
            }
            if(title || xLabel || yLabel || fontFamily || fontSize || fontColor || axisColor){
              prismStyle = {
                title,
                xLabel,
                yLabel,
                fontFamily: fontFamily || undefined,
                fontSize: fontSize || undefined,
                fontColor: fontColor || undefined,
                axisColor: axisColor || fontColor || undefined
              };
              prismDebug('graph.style', {
                graphSheetId,
                title,
                xLabel,
                yLabel,
                fontFamily,
                fontSize,
                fontColor,
                axisColor,
                candidateCount: parsed.strings?.length || 0,
                preferredGraphType: prismPreferredGraphType || ''
              });
            }
          }
        }
        let prismMeta = null;
        let importRows = filtered;
        const isXYTable = tableClass === 'XYDataTable' || tableFormat === 'xy' || tableFormat === 'survival';
        const isPieTable = tableFormat === 'parts_of_whole';
        if(isXYTable && dataFormat === 'y_replicates'){
          const replicateCountRaw = Number(tableInfo?.replicatesCount);
          const replicatesCount = Number.isFinite(replicateCountRaw) && replicateCountRaw > 0 ? replicateCountRaw : 1;
          const groupLabels = dataSetTitles.length
            ? dataSetTitles.slice()
            : Array.from({ length: Math.max(1, dataSetIds.length || 1) }, (_, idx) => `Series ${idx + 1}`);
          const header = [prismGraphLabels.xLabel || xTitle || rowTitleLabel || 'X'];
          groupLabels.forEach(label => {
            const base = label || 'Series';
            for(let rep = 0; rep < replicatesCount; rep += 1){
              header.push(`${base} Rep ${rep + 1}`);
            }
          });
          const xIndex = rowTitlesId ? 1 : 0;
          const yStart = xIndex + 1;
          const targetCols = 1 + groupLabels.length * replicatesCount;
          const dataRows = filtered.map(row => {
            const src = Array.isArray(row) ? row : [];
            const out = new Array(targetCols).fill('');
            out[0] = src[xIndex] ?? '';
            for(let s = 0; s < groupLabels.length; s += 1){
              for(let rep = 0; rep < replicatesCount; rep += 1){
                const srcIdx = yStart + s * replicatesCount + rep;
                const outIdx = 1 + s * replicatesCount + rep;
                out[outIdx] = srcIdx < src.length ? src[srcIdx] : '';
              }
            }
            return out;
          });
          importRows = [header, ...dataRows];
          prismMeta = {
            kind: 'line',
            dataFormat,
            tableClass,
            replicatesCount,
            groupLabels: groupLabels.slice(),
            xTitle: prismGraphLabels.xLabel || xTitle || rowTitleLabel || ''
          };
          prismDebug('xy.line', { replicatesCount, seriesCount: groupLabels.length, rows: dataRows.length });
        }else if(isXYTable && tableFormat === 'survival' && dataFormat === 'y_single'){
          const hasRowTitles = !!rowTitlesId;
          const xIndex = hasRowTitles ? 1 : 0;
          const yStart = xIndex + 1;
          const groupLabels = dataSetTitles.length
            ? dataSetTitles.slice()
            : Array.from({ length: Math.max(1, dataSetIds.length || 1) }, (_, idx) => `Group ${idx + 1}`);
          const survivalRows = [];
          filtered.forEach(row => {
            const src = Array.isArray(row) ? row : [];
            const timeValue = src[xIndex] ?? '';
            for(let s = 0; s < groupLabels.length; s += 1){
              const eventValue = src[yStart + s] ?? '';
              if(isPrismBlankCell(eventValue)){
                continue;
              }
              survivalRows.push([
                groupLabels[s] || `Group ${s + 1}`,
                timeValue,
                eventValue,
                '',
                '',
                '',
                ''
              ]);
            }
          });
          importRows = survivalRows;
          prismMeta = {
            kind: 'survival',
            dataFormat,
            tableClass,
            seriesCount: groupLabels.length,
            groupLabels: groupLabels.slice(),
            xTitle: prismGraphLabels.xLabel || xTitle || 'Time'
          };
          prismDebug('xy.survival', { seriesCount: groupLabels.length, rows: survivalRows.length, hasRowTitles });
        }else if(isXYTable && dataFormat === 'y_single'){
          const hasRowTitles = !!rowTitlesId;
          const xIndex = hasRowTitles ? 1 : 0;
          const yStart = xIndex + 1;
          const seriesCount = Math.max(1, dataSetTitles.length || 1);
          const headerLabel = rowTitleLabel || 'Labels';
          const xHeader = prismGraphLabels.xLabel || xTitle || 'X';
          const yHeader = prismGraphLabels.yLabel || (dataSetTitles[0] || 'Y');
          const headerRow = [headerLabel, xHeader, yHeader];
          const scatterRows = [];
          filtered.forEach(row => {
            const src = Array.isArray(row) ? row : [];
            const baseLabel = hasRowTitles ? (src[0] ?? '') : '';
            for(let s = 0; s < seriesCount; s += 1){
              const dsLabel = dataSetTitles[s] || '';
              let label = baseLabel;
              if(seriesCount > 1 && dsLabel){
                const trimmedBase = String(baseLabel ?? '').trim();
                label = trimmedBase ? `${trimmedBase} (${dsLabel})` : dsLabel;
              }
              const xValue = src[xIndex] ?? '';
              const yValue = src[yStart + s] ?? '';
              scatterRows.push([label ?? '', xValue ?? '', yValue ?? '']);
            }
          });
          importRows = [headerRow, ...scatterRows];
          prismMeta = {
            kind: 'scatter',
            dataFormat,
            tableClass,
            seriesCount,
            xTitle: prismGraphLabels.xLabel || xTitle || rowTitleLabel || '',
            yTitles: dataSetTitles.slice(),
            headerRow
          };
          prismDebug('xy.scatter', { seriesCount, rows: scatterRows.length, hasRowTitles });
        }else if(isPieTable && dataFormat === 'y_single'){
          const hasRowTitles = !!rowTitlesId;
          const categoryIndex = hasRowTitles ? 0 : -1;
          const valueStart = hasRowTitles ? 1 : 0;
          const headerRow = [
            rowTitleLabel || 'Category',
            prismGraphLabels.yLabel || dataSetTitles[0] || 'Value',
            dataSetTitles[1] || 'Expected'
          ];
          const pieRows = filtered.map((row, rowIndex) => {
            const src = Array.isArray(row) ? row : [];
            const categoryValue = categoryIndex >= 0
              ? (src[categoryIndex] ?? '')
              : (`Category ${rowIndex + 1}`);
            return [
              categoryValue,
              src[valueStart] ?? '',
              src[valueStart + 1] ?? ''
            ];
          });
          importRows = [headerRow, ...pieRows];
          prismMeta = {
            kind: 'pie',
            dataFormat,
            tableClass,
            seriesCount: dataSetTitles.length || 1,
            categoryTitle: rowTitleLabel || 'Category',
            valueTitles: dataSetTitles.slice()
          };
          prismDebug('table.pie', { seriesCount: dataSetTitles.length || 1, rows: pieRows.length, hasRowTitles });
        }else if(tableFormat === 'column' && dataFormat === 'y_single' && dataSetIds.length){
          if(dataSetTitles.some(title => String(title).trim() !== '')){
            importRows = [dataSetTitles.map(title => title), ...filtered];
          }
          prismMeta = {
            kind: 'column',
            dataFormat,
            tableClass,
            seriesCount: dataSetTitles.length || dataSetIds.length || 1,
            groupLabels: dataSetTitles.slice(),
            graphType: prismPreferredGraphType || ''
          };
          prismDebug('table.column', {
            seriesCount: dataSetTitles.length || dataSetIds.length || 1,
            rows: filtered.length,
            graphType: prismPreferredGraphType || ''
          });
        }else if(dataSetIds.length){
          if(dataSetTitles.some(title => String(title).trim() !== '')){
            importRows = [dataSetTitles.map(title => title), ...filtered];
          }
        }
        const result = await applyRows(importRows, { delimiter });
        if(result && prismMeta){
          result.prismMeta = prismMeta;
        }
        if(result && prismStyle){
          result.prismStyle = prismStyle;
          if(typeof options.onPrismStyle === 'function'){
            options.onPrismStyle(prismStyle);
          }
        }
        renameActiveTabForImport(file, result, options);
        prismDebug('import.complete', { rows: result?.rows || 0, cols: result?.cols || 0 });
        return result;
      }catch(err){
        notifyError(options, 'Failed to import Prism file', err);
        return null;
      }
    }
    if(['csv','tsv','txt'].includes(ext)){
      try{
        const text = await readFileAsText(file);
        const delimiter = ext === 'csv' ? ',' : ext === 'tsv' ? '\t' : detectDelimiter(text, options.delimiter);
        debugLog('openFile.delimiter', { delimiter, ext }, debugLabel);
        const rows = parseDelimitedText(text, delimiter);
        const filtered = filterRows(rows);
        debugLog('openFile.rows', { rows: filtered.length, cols: filtered[0]?.length || 0 }, debugLabel);
        const result = await applyRows(filtered, { delimiter });
        renameActiveTabForImport(file, result, options);
        debugLog('openFile.complete', { rows: result?.rows || 0, cols: result?.cols || 0 }, debugLabel);
        return result;
      }catch(err){
        notifyError(options, 'Failed to import text file', err);
        return null;
      }
    }
    if(['xls','xlsx','ods','odg'].includes(ext)){
      try{
        const buffer = await readFileAsArrayBuffer(file);
        const XLSX = await ensureXLSX();
        const data = new Uint8Array(buffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
        const filtered = filterRows(rows);
        debugLog('openFile.rows', { rows: filtered.length, cols: filtered[0]?.length || 0 }, debugLabel);
        const result = await applyRows(filtered, { delimiter: ',' });
        renameActiveTabForImport(file, result, options);
        debugLog('openFile.complete', { rows: result?.rows || 0, cols: result?.cols || 0 }, debugLabel);
        return result;
      }catch(err){
        notifyError(options, 'Failed to import spreadsheet', err);
        return null;
      }
    }
    notifyError(options, `Unsupported file format: ${ext}`);
    return null;
  };

  tableImport.handlePaste = async function handlePaste(event, hot, options = {}){
    const debugLabel = options.debugLabel || 'tableImport';
    if(!event){
      debugLog('handlePaste.noEvent', {}, debugLabel);
      return null;
    }
    event.preventDefault();
    event.stopPropagation();
    let clearedHighlight = false;
    const clearCopyHighlight = (stage)=>{
      if(clearedHighlight){
        return;
      }
      const reason = stage || 'tableImport.handlePaste';
      let cleared = false;
      if(Shared.hot && typeof Shared.hot.clearClipboardOutline === 'function'){
        cleared = Shared.hot.clearClipboardOutline(hot, reason);
      }else if(Shared.hot && typeof Shared.hot.clearCopyHighlight === 'function'){
        cleared = Shared.hot.clearCopyHighlight(hot, reason);
      }else if(hot && typeof hot.__hotClearClipboardOutline === 'function'){
        hot.__hotClearClipboardOutline(reason);
        cleared = true;
      }else if(hot && typeof hot.__hotClearCopyHighlight === 'function'){
        hot.__hotClearCopyHighlight(reason);
        cleared = true;
      }
      if(cleared){
        tableImportDebug('Debug: tableImport.handlePaste copy highlight cleared', { debugLabel, reason });
      }else{
        tableImportDebug('Debug: tableImport.handlePaste copy highlight clear skipped', { debugLabel, reason, hasHot: !!hot });
      }
      clearedHighlight = true;
    };
    try{
      let text = await getClipboardTextFromEvent(event);
      if(!text){
        debugLog('handlePaste.noText', {}, debugLabel);
        return null;
      }
      const delimiter = detectDelimiter(text, options.delimiter);
      debugLog('handlePaste.delimiter', { delimiter }, debugLabel);
      const rows = normalizeDecimalSeparators(parseDelimitedText(text, delimiter), delimiter, { debugLabel });
      const filtered = filterRows(rows);
      if(!filtered.length){
        debugLog('handlePaste.filteredEmpty', { delimiter }, debugLabel);
        return null;
      }
      const selection = options.selection || (hot && typeof hot.getSelectedLast === 'function' ? hot.getSelectedLast() : null);
      const startRow = options.startRow ?? (selection ? selection[0] : 0);
      const startCol = options.startCol ?? (selection ? selection[1] : 0);
      const shouldPreserveExisting = options.preserveExisting === true;
      debugLog('handlePaste.rows', {
        rows: filtered.length,
        cols: filtered[0]?.length || 0,
        startRow,
        startCol,
        preserveExisting: shouldPreserveExisting
      }, debugLabel);
      const processOptions = cloneOptions(options, { startRow, startCol, delimiter });
      if(shouldPreserveExisting){
        processOptions.preserveExisting = true;
        tableImportDebug('Debug: tableImport.handlePaste preserveExisting enforced', {
          debugLabel,
          startRow,
          startCol,
          rows: filtered.length,
          cols: filtered[0]?.length || 0
        });
      }
      const undoManager = Shared.undoManager;
      const snapshotThreshold = typeof options.snapshotCellThreshold === 'number'
        ? options.snapshotCellThreshold
        : (typeof tableImport.snapshotCellThreshold === 'number'
          ? tableImport.snapshotCellThreshold
          : DEFAULT_SNAPSHOT_CELL_THRESHOLD);
      const expectFullReplace = startRow === 0
        && startCol === 0
        && processOptions.preserveExisting !== true
        && !options.selection
        && (!options.onRows || options.onRows === tableImport.processRows);
      let snapshotBefore = null;
      if(expectFullReplace && hot){
        const totalRows = typeof hot.countSourceRows === 'function'
          ? hot.countSourceRows()
          : (typeof hot.countRows === 'function' ? hot.countRows() : filtered.length);
        const totalCols = typeof hot.countSourceCols === 'function'
          ? hot.countSourceCols()
          : (typeof hot.countCols === 'function' ? hot.countCols() : (filtered[0]?.length || 0));
        if(totalRows > 0 && totalCols > 0){
          const area = [0, 0, totalRows - 1, totalCols - 1];
          const captured = tableImport.captureHotSnapshot(hot, {
            area,
            maxCells: snapshotThreshold,
            debugLabel: `${debugLabel}.snapshotBefore`
          });
          if(captured && captured.kind === 'area'){
            snapshotBefore = captured;
          }else if(captured && captured.kind === 'degraded'){
            tableImportDebug('Debug: tableImport.handlePaste snapshot before degraded', {
              debugLabel,
              area,
              cells: captured.areaCells,
              limit: snapshotThreshold
            });
          }else{
            tableImportDebug('Debug: tableImport.handlePaste snapshot before unavailable', {
              debugLabel,
              reason: captured ? captured.kind : 'null'
            });
          }
        }
      }
      const result = tableImport.processRows(filtered, hot, processOptions);
      const changeSet = Array.isArray(result?.changes) ? result.changes : [];
      const isFullReplace = result?.fullReplace === true;
      const hasStructureChange = !isFullReplace && !!(result?.insertedRows || result?.insertedCols || (typeof result?.previousMinRows === 'number' && typeof result?.nextMinRows === 'number' && result.previousMinRows !== result.nextMinRows) || (typeof result?.previousMinCols === 'number' && typeof result?.nextMinCols === 'number' && result.previousMinCols !== result.nextMinCols));
      if(!isFullReplace && (changeSet.length || hasStructureChange) && undoManager && typeof undoManager.record === 'function'){
        const scope = options.scope || inferHotScope(hot, debugLabel);
        const label = `tableImport:${debugLabel}:paste`;
        tableImportDebug('Debug: tableImport.handlePaste undo prepared (diff)', {
          debugLabel,
          scope,
          label,
          changes: changeSet.length,
          rowsInserted: result?.insertedRows?.amount || 0,
          colsInserted: result?.insertedCols?.amount || 0
        });
        undoManager.record({
          label,
          scope,
          undo(){
            if(!hot){
              return false;
            }
            const revertChanges = changeSet.map(cell => [cell.row, cell.col, cell.oldValue != null ? cell.oldValue : '']);
            const rowsInserted = result?.insertedRows;
            const colsInserted = result?.insertedCols;
            const previousMinRows = result?.previousMinRows;
            const previousMinCols = result?.previousMinCols;
            const canAlter = typeof hot.alter === 'function';
            if(typeof hot.batch === 'function'){
              hot.batch(()=>{
                if(revertChanges.length && typeof hot.setDataAtCell === 'function'){
                  hot.setDataAtCell(revertChanges, 'UndoRedo.tableImport.handlePaste.undo');
                }
                if(rowsInserted?.amount && canAlter){
                  const removeIndex = typeof rowsInserted.removeIndex === 'number'
                    ? rowsInserted.removeIndex
                    : rowsInserted.index;
                  if(typeof removeIndex === 'number'){
                    hot.alter('remove_row', removeIndex, rowsInserted.amount, 'UndoRedo.tableImport.handlePaste.undo');
                  }
                }
                if(colsInserted?.amount && canAlter){
                  const removeIndex = typeof colsInserted.removeIndex === 'number'
                    ? colsInserted.removeIndex
                    : colsInserted.index;
                  if(typeof removeIndex === 'number'){
                    hot.alter('remove_col', removeIndex, colsInserted.amount, 'UndoRedo.tableImport.handlePaste.undo');
                  }
                }
              });
            }else{
              if(revertChanges.length && typeof hot.setDataAtCell === 'function'){
                hot.setDataAtCell(revertChanges, 'UndoRedo.tableImport.handlePaste.undo');
              }
              if(rowsInserted?.amount && canAlter){
                const removeIndex = typeof rowsInserted.removeIndex === 'number'
                  ? rowsInserted.removeIndex
                  : rowsInserted.index;
                if(typeof removeIndex === 'number'){
                  hot.alter('remove_row', removeIndex, rowsInserted.amount, 'UndoRedo.tableImport.handlePaste.undo');
                }
              }
              if(colsInserted?.amount && canAlter){
                const removeIndex = typeof colsInserted.removeIndex === 'number'
                  ? colsInserted.removeIndex
                  : colsInserted.index;
                if(typeof removeIndex === 'number'){
                  hot.alter('remove_col', removeIndex, colsInserted.amount, 'UndoRedo.tableImport.handlePaste.undo');
                }
              }
            }
            if((typeof previousMinRows === 'number' || typeof previousMinCols === 'number') && typeof hot.updateSettings === 'function'){
              const settingsPayload = {};
              if(typeof previousMinRows === 'number') settingsPayload.minRows = previousMinRows;
              if(typeof previousMinCols === 'number') settingsPayload.minCols = previousMinCols;
              hot.updateSettings(settingsPayload);
            }
            if(typeof hot.render === 'function'){
              hot.render();
            }
            if(typeof options.scheduleDraw === 'function'){
              options.scheduleDraw();
            }
            return true;
          },
          redo(){
            if(!hot){
              return false;
            }
            const applyChanges = changeSet.map(cell => [cell.row, cell.col, cell.newValue != null ? cell.newValue : '']);
            const rowsInserted = result?.insertedRows;
            const colsInserted = result?.insertedCols;
            const nextMinRows = result?.nextMinRows;
            const nextMinCols = result?.nextMinCols;
            const canAlter = typeof hot.alter === 'function';
            if(typeof hot.batch === 'function'){
              hot.batch(()=>{
                if(rowsInserted?.amount && canAlter){
                  const action = resolveRowInsertFromMeta(rowsInserted);
                  if(action){
                    hot.alter(action.action, action.index, rowsInserted.amount, 'UndoRedo.tableImport.handlePaste.redo');
                  }
                }
                if(colsInserted?.amount && canAlter){
                  const action = resolveColInsertFromMeta(colsInserted);
                  if(action){
                    hot.alter(action.action, action.index, colsInserted.amount, 'UndoRedo.tableImport.handlePaste.redo');
                  }
                }
                if(applyChanges.length && typeof hot.setDataAtCell === 'function'){
                  hot.setDataAtCell(applyChanges, 'UndoRedo.tableImport.handlePaste.redo');
                }
              });
            }else{
              if(rowsInserted?.amount && canAlter){
                const action = resolveRowInsertFromMeta(rowsInserted);
                if(action){
                  hot.alter(action.action, action.index, rowsInserted.amount, 'UndoRedo.tableImport.handlePaste.redo');
                }
              }
              if(colsInserted?.amount && canAlter){
                const action = resolveColInsertFromMeta(colsInserted);
                if(action){
                  hot.alter(action.action, action.index, colsInserted.amount, 'UndoRedo.tableImport.handlePaste.redo');
                }
              }
              if(applyChanges.length && typeof hot.setDataAtCell === 'function'){
                hot.setDataAtCell(applyChanges, 'UndoRedo.tableImport.handlePaste.redo');
              }
            }
            if((typeof nextMinRows === 'number' || typeof nextMinCols === 'number') && typeof hot.updateSettings === 'function'){
              const settingsPayload = {};
              if(typeof nextMinRows === 'number') settingsPayload.minRows = nextMinRows;
              if(typeof nextMinCols === 'number') settingsPayload.minCols = nextMinCols;
              hot.updateSettings(settingsPayload);
            }
            if(typeof hot.render === 'function'){
              hot.render();
            }
            if(typeof options.scheduleDraw === 'function'){
              options.scheduleDraw();
            }
            return true;
          }
        });
      }else if(isFullReplace && undoManager && typeof undoManager.record === 'function'){
        const totalRowsAfter = typeof hot?.countSourceRows === 'function'
          ? hot.countSourceRows()
          : (typeof hot?.countRows === 'function' ? hot.countRows() : (result?.nextMinRows || filtered.length));
        const totalColsAfter = typeof hot?.countSourceCols === 'function'
          ? hot.countSourceCols()
          : (typeof hot?.countCols === 'function' ? hot.countCols() : (filtered[0]?.length || 0));
        let snapshotAfter = null;
        if(totalRowsAfter > 0 && totalColsAfter > 0){
          const afterArea = [0, 0, totalRowsAfter - 1, totalColsAfter - 1];
          const capturedAfter = tableImport.captureHotSnapshot(hot, {
            area: afterArea,
            maxCells: snapshotThreshold,
            debugLabel: `${debugLabel}.snapshotAfter`
          });
          if(capturedAfter && capturedAfter.kind === 'area'){
            snapshotAfter = capturedAfter;
          }else if(capturedAfter && capturedAfter.kind === 'degraded'){
            tableImportDebug('Debug: tableImport.handlePaste snapshot after degraded', {
              debugLabel,
              area: afterArea,
              cells: capturedAfter.areaCells,
              limit: snapshotThreshold
            });
          }else{
            tableImportDebug('Debug: tableImport.handlePaste snapshot after unavailable', {
              debugLabel,
              reason: capturedAfter ? capturedAfter.kind : 'null'
            });
          }
        }
        if(snapshotBefore && snapshotAfter){
          const scope = options.scope || inferHotScope(hot, debugLabel);
          const label = `tableImport:${debugLabel}:pasteSnapshot`;
          tableImportDebug('Debug: tableImport.handlePaste undo prepared (snapshot)', {
            debugLabel,
            scope,
            label,
            cells: (snapshotBefore?.data?.length || 0) * (snapshotBefore?.data?.[0]?.length || 0)
          });
          undoManager.record({
            label,
            scope,
            undo(){
              return tableImport.restoreHotSnapshot(hot, snapshotBefore, {
                debugLabel: `${debugLabel}.undoSnapshot`,
                minRows: result?.previousMinRows,
                minCols: result?.previousMinCols,
                scheduleDraw: options.scheduleDraw
              });
            },
            redo(){
              return tableImport.restoreHotSnapshot(hot, snapshotAfter, {
                debugLabel: `${debugLabel}.redoSnapshot`,
                minRows: result?.nextMinRows,
                minCols: result?.nextMinCols,
                scheduleDraw: options.scheduleDraw
              });
            }
          });
        }else{
          tableImportDebug('Debug: tableImport.handlePaste snapshot undo skipped', {
            debugLabel,
            before: snapshotBefore ? snapshotBefore.kind : 'missing',
            after: snapshotAfter ? snapshotAfter.kind : 'missing',
            threshold: snapshotThreshold
          });
        }
      }else{
        tableImportDebug('Debug: tableImport.handlePaste undo skipped (no diff)', {
          debugLabel,
          hasResult: !!result,
          fullReplace: isFullReplace,
          changes: changeSet.length,
          structureChange: hasStructureChange
        });
      }
      return result;
    }finally{
      clearCopyHighlight('tableImport.handlePaste.finally');
    }
  };
})(window);
