(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const tableImport = Shared.tableImport = Shared.tableImport || {};

  let xlsxLoaderPromise = null;

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
      return global.XLSX;
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
        debugLog('xlsx.loaded', {}, 'xlsx');
        resolve(global.XLSX);
      };
      script.onerror = err => {
        debugLog('xlsx.loadError', { message: err?.message || 'failed' }, 'xlsx');
        reject(new Error('Failed to load XLSX script'));
      };
      global.document.head.appendChild(script);
    });
    return xlsxLoaderPromise;
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

  function cloneMatrix(matrix){
    if(!Array.isArray(matrix)) return [];
    return matrix.map(row => Array.isArray(row) ? row.slice() : []);
  }

  function captureHotSnapshot(hot, debugLabel){
    if(!hot) return null;
    try{
      const settings = typeof hot.getSettings === 'function' ? hot.getSettings() : {};
      const minRows = typeof settings?.minRows === 'number' ? settings.minRows : (typeof hot.countRows === 'function' ? hot.countRows() : 0);
      const minCols = typeof settings?.minCols === 'number' ? settings.minCols : (typeof hot.countCols === 'function' ? hot.countCols() : 0);
      const data = typeof hot.getData === 'function' ? cloneMatrix(hot.getData()) : [];
      console.debug('Debug: tableImport.snapshot.captured', { debugLabel, minRows, minCols, rows: data.length, cols: data[0]?.length || 0 });
      return { data, minRows, minCols };
    }catch(err){
      console.error('tableImport snapshot capture failed', err);
      return null;
    }
  }

  function cloneSnapshotData(snapshot){
    if(!snapshot) return [];
    return cloneMatrix(snapshot.data);
  }

  function restoreHotSnapshot(hot, snapshot, reason, debugLabel){
    if(!hot || !snapshot) return false;
    try{
      const payload = {
        data: cloneSnapshotData(snapshot),
        minRows: snapshot.minRows,
        minCols: snapshot.minCols
      };
      if(typeof hot.updateSettings === 'function'){
        hot.updateSettings(payload);
      }else if(typeof hot.loadData === 'function'){
        hot.loadData(payload.data);
        if(typeof hot.updateSettings === 'function'){
          hot.updateSettings({ minRows: snapshot.minRows, minCols: snapshot.minCols });
        }
      }
      if(typeof hot.render === 'function'){
        hot.render();
      }
      console.debug('Debug: tableImport.snapshot.restored', { debugLabel, reason, rows: payload.data.length, cols: payload.data[0]?.length || 0 });
      return true;
    }catch(err){
      console.error('tableImport snapshot restore failed', err);
      return false;
    }
  }

  function snapshotsEqual(a, b){
    if(!a || !b) return false;
    if(a.minRows !== b.minRows || a.minCols !== b.minCols) return false;
    const rowsA = Array.isArray(a.data) ? a.data.length : 0;
    const rowsB = Array.isArray(b.data) ? b.data.length : 0;
    if(rowsA !== rowsB) return false;
    for(let r = 0; r < rowsA; r++){
      const rowA = Array.isArray(a.data[r]) ? a.data[r] : [];
      const rowB = Array.isArray(b.data[r]) ? b.data[r] : [];
      if(rowA.length !== rowB.length) return false;
      for(let c = 0; c < rowA.length; c++){
        if(rowA[c] !== rowB[c]) return false;
      }
    }
    return true;
  }

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
    const minRows = options.minRows != null ? options.minRows : currentRows;
    const minCols = options.minCols != null ? options.minCols : currentCols;
    const targetRows = Math.max(minRows, currentRows, startRow + incomingRows);
    const targetCols = Math.max(minCols, currentCols, startCol + incomingCols);
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
    const fullReplace = startRow === 0
      && startCol === 0
      && !options.selection
      && options.preserveExisting !== true
      && (!options.onRows || options.onRows === tableImport.processRows);
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
      data = Array.from({ length: targetRows }, () => Array(targetCols).fill(''));
      if(typeof hot.getData === 'function'){
        const existing = hot.getData();
        for(let r = 0; r < Math.min(existing.length, targetRows); r++){
          const row = existing[r];
          for(let c = 0; c < Math.min(row.length, targetCols); c++){
            data[r][c] = row[c];
          }
        }
      }
      for(let r = 0; r < incomingRows; r++){
        const row = filteredRows[r];
        for(let c = 0; c < row.length; c++){
          data[startRow + r][startCol + c] = row[c];
        }
      }
    }
    if(typeof hot.updateSettings === 'function'){
      hot.updateSettings({ data, minRows: targetRows, minCols: targetCols });
    }else if(typeof hot.loadData === 'function'){
      hot.loadData(data);
    }
    if(typeof options.scheduleDraw === 'function'){
      options.scheduleDraw();
    }
    const result = Object.assign({ rows: targetRows, cols: targetCols }, stats);
    if(typeof options.onProcessed === 'function'){
      options.onProcessed(result);
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
    const applyRows = (rows, meta = {}) => {
      const handler = typeof options.onRows === 'function'
        ? options.onRows
        : (parsedRows, metaInfo) => tableImport.processRows(parsedRows, options.hot, cloneOptions(options, Object.assign({ startRow: defaultStartRow, startCol: defaultStartCol }, metaInfo)));
      return handler(rows, meta);
    };
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
      let text = event.clipboardData?.getData('text/plain');
      if(!text){
        try{
          const clip = global.navigator?.clipboard;
          if(clip && typeof clip.readText === 'function'){
            text = await clip.readText();
            debugLog('handlePaste.fallback', { usedNavigator: true }, debugLabel);
          }
        }catch(err){
          notifyError(options, 'Failed to read clipboard text', err);
          return null;
        }
      }
      if(!text){
        debugLog('handlePaste.noText', {}, debugLabel);
        return null;
      }
      const delimiter = detectDelimiter(text, options.delimiter);
      debugLog('handlePaste.delimiter', { delimiter }, debugLabel);
      const rows = parseDelimitedText(text, delimiter);
      const filtered = filterRows(rows);
      if(!filtered.length){
        debugLog('handlePaste.filteredEmpty', { delimiter }, debugLabel);
        return null;
      }
      const selection = options.selection || (hot && typeof hot.getSelectedLast === 'function' ? hot.getSelectedLast() : null);
      const startRow = options.startRow ?? (selection ? selection[0] : 0);
      const startCol = options.startCol ?? (selection ? selection[1] : 0);
      const singleRowPaste = filtered.length === 1;
      const selectionTuple = Array.isArray(selection) ? selection : null;
      const singleRowSelection = selectionTuple ? selectionTuple[0] === selectionTuple[2] : false;
      const shouldPreserveExisting = options.preserveExisting === true
        || (singleRowPaste && singleRowSelection);
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
      const beforeSnapshot = captureHotSnapshot(hot, debugLabel);
      const result = tableImport.processRows(filtered, hot, processOptions);
      const afterSnapshot = captureHotSnapshot(hot, debugLabel);
      if(result && beforeSnapshot && afterSnapshot && !snapshotsEqual(beforeSnapshot, afterSnapshot) && undoManager && typeof undoManager.record === 'function'){
        const scope = options.scope || inferHotScope(hot, debugLabel);
        const label = `tableImport:${debugLabel}:paste`;
        console.debug('Debug: tableImport.handlePaste undo prepared', { debugLabel, scope, label });
        undoManager.record({
          label,
          scope,
          undo(){
            const restored = restoreHotSnapshot(hot, beforeSnapshot, 'undo', debugLabel);
            if(restored && typeof options.scheduleDraw === 'function'){
              options.scheduleDraw();
            }
            return restored;
          },
          redo(){
            const restored = restoreHotSnapshot(hot, afterSnapshot, 'redo', debugLabel);
            if(restored && typeof options.scheduleDraw === 'function'){
              options.scheduleDraw();
            }
            return restored;
          }
        });
      }else{
        console.debug('Debug: tableImport.handlePaste undo skipped', { debugLabel, hasResult: !!result, hasBefore: !!beforeSnapshot, hasAfter: !!afterSnapshot });
      }
      return result;
    }finally{
      clearCopyHighlight('tableImport.handlePaste.finally');
    }
  };
})(window);
