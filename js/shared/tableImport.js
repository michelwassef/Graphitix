(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const tableImport = Shared.tableImport = Shared.tableImport || {};

  let xlsxLoaderPromise = null;
  let zipLoaderPromise = null;
  const DEFAULT_SNAPSHOT_CELL_THRESHOLD = 12000;
  tableImport.snapshotCellThreshold = DEFAULT_SNAPSHOT_CELL_THRESHOLD;

  function debugLog(step, detail, debugLabel){
    const payload = Object.assign({ debugLabel: debugLabel || 'tableImport' }, detail || {});
    console.debug(`Debug: tableImport.${step}`, payload); // Debug: table import trace
  }

  function filterRows(rows){
    return (rows || []).filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));
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
      console.debug('Debug: tableImport.normalizeDecimalSeparators', {
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
      console.debug('Debug: tableImport.getClipboardTextFromEvent entry', { hasEvent: !!event, hasClipboardData: !!cd });
      if(cd){
        // Prefer DataTransferItemList handling (works well in Firefox/Chrome)
        if(cd.items && cd.items.length){
          console.debug('Debug: tableImport.getClipboardTextFromEvent using DataTransferItemList', { items: cd.items.length });
          for(let i = 0; i < cd.items.length; i++){
            const item = cd.items[i];
            try{
              if(item && item.kind === 'string' && typeof item.getAsString === 'function'){
                const text = await new Promise(resolve => item.getAsString(s => resolve(s)));
                console.debug('Debug: tableImport.getClipboardTextFromEvent item.string', { index: i, length: (text || '').length, snippet: (text||'').slice(0,200) });
                if(text) return text;
              }
              if(item && item.kind === 'file' && typeof item.getAsFile === 'function'){
                const file = item.getAsFile();
                if(file){
                  console.debug('Debug: tableImport.getClipboardTextFromEvent item.file', { index: i, name: file.name, size: file.size });
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
              console.debug('Debug: tableImport.getClipboardTextFromEvent getData', { type: t, length: (v || '').length, snippet: (v||'').slice(0,200) });
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
        console.debug('Debug: tableImport.getClipboardTextFromEvent window.clipboardData', { length: (v || '').length });
        if(v) return v;
      }
    }catch(e){/* ignore */}
    // Clipboard API: try read() to obtain ClipboardItems, then readText()
    try{
      const nav = global.navigator?.clipboard;
      if(nav){
        if(typeof nav.read === 'function'){
          const items = await nav.read();
          console.debug('Debug: tableImport.getClipboardTextFromEvent navigator.read', { items: (items || []).length });
          for(const clipboardItem of items){
            for(const type of clipboardItem.types || []){
              try{
                if(type && type.startsWith('text')){
                  const blob = await clipboardItem.getType(type);
                  const s = await blob.text();
                  console.debug('Debug: tableImport.getClipboardTextFromEvent navigator.read.type', { type, length: (s || '').length, snippet: (s||'').slice(0,200) });
                  if(s) return s;
                }
              }catch(e){/* ignore per-type errors */}
            }
          }
        }
        if(typeof nav.readText === 'function'){
          const v = await nav.readText();
          console.debug('Debug: tableImport.getClipboardTextFromEvent navigator.readText', { length: (v || '').length, snippet: (v||'').slice(0,200) });
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

  function prismDebug(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: tableImport.prism ' + message, payload || {});
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
    if(typeof global.DecompressionStream !== 'function'){
      prismDebug('inflate.skip', { reason: 'noDecompressionStream' });
      return null;
    }
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const zlibOffset = findZlibHeader(bytes);
    if(zlibOffset < 0){
      prismDebug('inflate.skip', { reason: 'zlibHeaderMissing' });
      return null;
    }
    const payload = bytes.subarray(zlibOffset + 2, bytes.length > 4 ? bytes.length - 4 : bytes.length);
    try{
      const stream = new Blob([payload]).stream().pipeThrough(new global.DecompressionStream('deflate'));
      const arrayBuffer = await new Response(stream).arrayBuffer();
      return new Uint8Array(arrayBuffer);
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
      if(excluded.has(normalized)){
        return false;
      }
      if(/^[0-9a-f]{8}-[0-9a-f-]{8,}$/i.test(normalized)){
        return false;
      }
      return true;
    });
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
    const countRows = typeof hot.countRows === 'function' ? hot.countRows() : 0;
    const countCols = typeof hot.countCols === 'function' ? hot.countCols() : 0;
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
          'tableImport.restoreHotSnapshot'
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
          hot.setDataAtCell(changeList, 'tableImport.restoreHotSnapshot');
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
    const currentRows = typeof hot.countRows === 'function' ? hot.countRows() : filteredRows.length;
    const currentCols = typeof hot.countCols === 'function' ? hot.countCols() : incomingCols;
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
    if(ext === 'prism'){
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
        const dataSetIds = Array.isArray(sheet?.table?.dataSets) ? sheet.table.dataSets : [];
        let dataSetTitles = [];
        if(dataSetIds.length){
          const titlePromises = dataSetIds.map(async uid => {
            const setInfo = await readZipJson(zip, `data/sets/${uid}.json`);
            const rawTitle = setInfo?.title;
            const title = extractPrismText(rawTitle);
            prismDebug('dataset.title', { uid, rawType: typeof rawTitle, title });
            return title;
          });
          const titles = await Promise.all(titlePromises);
          dataSetTitles = titles.map(title => normalizePrismString(title)).filter(Boolean);
          if(titles.some(title => String(title).trim() !== '')){
            filtered.unshift(titles);
          }
        }
        let prismStyle = null;
        const graphSheetId = document?.uiSettings?.currentSheets?.graph
          || (Array.isArray(document?.sheets?.graphs) ? document.sheets.graphs[0] : null);
        if(graphSheetId){
          const graphBuffer = await readZipBuffer(zip, `graphs/${graphSheetId}/data.bin`);
          if(graphBuffer){
            const parsed = extractPrismStringsFromBuffer(graphBuffer);
            const candidates = filterPrismGraphCandidates(parsed.strings, {
              sheetTitle: sheet?.title || '',
              dataSetTitles
            });
            let yLabel = normalizePrismString(findPrismLabelAfterMarker(parsed.text, 'Y1Title'));
            if(yLabel && (dataSetTitles.includes(yLabel) || isPrismColorToken(yLabel) || yLabel === 'Zval' || yLabel === 'Zend')){
              yLabel = '';
            }
            const remaining = candidates.filter(item => item !== yLabel);
            const title = remaining[0] || '';
            const xLabel = remaining[1] || '';
            if(!yLabel && remaining.length > 2){
              yLabel = remaining[2];
            }
            const inflated = await inflatePrismGraphData(graphBuffer);
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
                candidateCount: candidates.length
              });
            }
          }
        }
        const result = await applyRows(filtered, { delimiter });
        if(result && prismStyle){
          result.prismStyle = prismStyle;
          if(typeof options.onPrismStyle === 'function'){
            options.onPrismStyle(prismStyle);
          }
        }
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
      if(Shared.hot && typeof Shared.hot.clearCopyHighlight === 'function'){
        cleared = Shared.hot.clearCopyHighlight(hot, reason);
      }else if(hot && typeof hot.__hotClearCopyHighlight === 'function'){
        hot.__hotClearCopyHighlight(reason);
        cleared = true;
      }
      if(cleared){
        console.debug('Debug: tableImport.handlePaste copy highlight cleared', { debugLabel, reason });
      }else{
        console.debug('Debug: tableImport.handlePaste copy highlight clear skipped', { debugLabel, reason, hasHot: !!hot });
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
        console.debug('Debug: tableImport.handlePaste preserveExisting enforced', {
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
        const totalRows = typeof hot.countRows === 'function' ? hot.countRows() : filtered.length;
        const totalCols = typeof hot.countCols === 'function' ? hot.countCols() : (filtered[0]?.length || 0);
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
            console.debug('Debug: tableImport.handlePaste snapshot before degraded', {
              debugLabel,
              area,
              cells: captured.areaCells,
              limit: snapshotThreshold
            });
          }else{
            console.debug('Debug: tableImport.handlePaste snapshot before unavailable', {
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
        console.debug('Debug: tableImport.handlePaste undo prepared (diff)', {
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
                  hot.setDataAtCell(revertChanges, 'tableImport.handlePaste.undo');
                }
                if(rowsInserted?.amount && canAlter){
                  const removeIndex = typeof rowsInserted.removeIndex === 'number'
                    ? rowsInserted.removeIndex
                    : rowsInserted.index;
                  if(typeof removeIndex === 'number'){
                    hot.alter('remove_row', removeIndex, rowsInserted.amount, 'tableImport.handlePaste.undo');
                  }
                }
                if(colsInserted?.amount && canAlter){
                  const removeIndex = typeof colsInserted.removeIndex === 'number'
                    ? colsInserted.removeIndex
                    : colsInserted.index;
                  if(typeof removeIndex === 'number'){
                    hot.alter('remove_col', removeIndex, colsInserted.amount, 'tableImport.handlePaste.undo');
                  }
                }
              });
            }else{
              if(revertChanges.length && typeof hot.setDataAtCell === 'function'){
                hot.setDataAtCell(revertChanges, 'tableImport.handlePaste.undo');
              }
              if(rowsInserted?.amount && canAlter){
                const removeIndex = typeof rowsInserted.removeIndex === 'number'
                  ? rowsInserted.removeIndex
                  : rowsInserted.index;
                if(typeof removeIndex === 'number'){
                  hot.alter('remove_row', removeIndex, rowsInserted.amount, 'tableImport.handlePaste.undo');
                }
              }
              if(colsInserted?.amount && canAlter){
                const removeIndex = typeof colsInserted.removeIndex === 'number'
                  ? colsInserted.removeIndex
                  : colsInserted.index;
                if(typeof removeIndex === 'number'){
                  hot.alter('remove_col', removeIndex, colsInserted.amount, 'tableImport.handlePaste.undo');
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
                    hot.alter(action.action, action.index, rowsInserted.amount, 'tableImport.handlePaste.redo');
                  }
                }
                if(colsInserted?.amount && canAlter){
                  const action = resolveColInsertFromMeta(colsInserted);
                  if(action){
                    hot.alter(action.action, action.index, colsInserted.amount, 'tableImport.handlePaste.redo');
                  }
                }
                if(applyChanges.length && typeof hot.setDataAtCell === 'function'){
                  hot.setDataAtCell(applyChanges, 'tableImport.handlePaste.redo');
                }
              });
            }else{
              if(rowsInserted?.amount && canAlter){
                const action = resolveRowInsertFromMeta(rowsInserted);
                if(action){
                  hot.alter(action.action, action.index, rowsInserted.amount, 'tableImport.handlePaste.redo');
                }
              }
              if(colsInserted?.amount && canAlter){
                const action = resolveColInsertFromMeta(colsInserted);
                if(action){
                  hot.alter(action.action, action.index, colsInserted.amount, 'tableImport.handlePaste.redo');
                }
              }
              if(applyChanges.length && typeof hot.setDataAtCell === 'function'){
                hot.setDataAtCell(applyChanges, 'tableImport.handlePaste.redo');
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
        const totalRowsAfter = typeof hot?.countRows === 'function' ? hot.countRows() : result?.nextMinRows || filtered.length;
        const totalColsAfter = typeof hot?.countCols === 'function' ? hot.countCols() : (filtered[0]?.length || 0);
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
            console.debug('Debug: tableImport.handlePaste snapshot after degraded', {
              debugLabel,
              area: afterArea,
              cells: capturedAfter.areaCells,
              limit: snapshotThreshold
            });
          }else{
            console.debug('Debug: tableImport.handlePaste snapshot after unavailable', {
              debugLabel,
              reason: capturedAfter ? capturedAfter.kind : 'null'
            });
          }
        }
        if(snapshotBefore && snapshotAfter){
          const scope = options.scope || inferHotScope(hot, debugLabel);
          const label = `tableImport:${debugLabel}:pasteSnapshot`;
          console.debug('Debug: tableImport.handlePaste undo prepared (snapshot)', {
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
          console.debug('Debug: tableImport.handlePaste snapshot undo skipped', {
            debugLabel,
            before: snapshotBefore ? snapshotBefore.kind : 'missing',
            after: snapshotAfter ? snapshotAfter.kind : 'missing',
            threshold: snapshotThreshold
          });
        }
      }else{
        console.debug('Debug: tableImport.handlePaste undo skipped (no diff)', {
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
