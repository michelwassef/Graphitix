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
    const hotSettings = typeof hot.getSettings === 'function' ? hot.getSettings() : {};
    const previousMinRows = typeof hotSettings?.minRows === 'number' ? hotSettings.minRows : currentRows;
    const previousMinCols = typeof hotSettings?.minCols === 'number' ? hotSettings.minCols : currentCols;
    const minRows = options.minRows != null ? options.minRows : previousMinRows;
    const minCols = options.minCols != null ? options.minCols : previousMinCols;
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
            hot.alter('insert_row', currentRows, extraRows, 'tableImport.processRows');
            resultMeta.insertedRows = { index: currentRows, amount: extraRows };
          }
          if(extraCols > 0){
            hot.alter('insert_col', currentCols, extraCols, 'tableImport.processRows');
            resultMeta.insertedCols = { index: currentCols, amount: extraCols };
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
        hot.updateSettings({ data, minRows: targetRows, minCols: targetCols });
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
                  hot.alter('remove_row', rowsInserted.index, rowsInserted.amount, 'tableImport.handlePaste.undo');
                }
                if(colsInserted?.amount && canAlter){
                  hot.alter('remove_col', colsInserted.index, colsInserted.amount, 'tableImport.handlePaste.undo');
                }
              });
            }else{
              if(revertChanges.length && typeof hot.setDataAtCell === 'function'){
                hot.setDataAtCell(revertChanges, 'tableImport.handlePaste.undo');
              }
              if(rowsInserted?.amount && canAlter){
                hot.alter('remove_row', rowsInserted.index, rowsInserted.amount, 'tableImport.handlePaste.undo');
              }
              if(colsInserted?.amount && canAlter){
                hot.alter('remove_col', colsInserted.index, colsInserted.amount, 'tableImport.handlePaste.undo');
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
                  hot.alter('insert_row', rowsInserted.index, rowsInserted.amount, 'tableImport.handlePaste.redo');
                }
                if(colsInserted?.amount && canAlter){
                  hot.alter('insert_col', colsInserted.index, colsInserted.amount, 'tableImport.handlePaste.redo');
                }
                if(applyChanges.length && typeof hot.setDataAtCell === 'function'){
                  hot.setDataAtCell(applyChanges, 'tableImport.handlePaste.redo');
                }
              });
            }else{
              if(rowsInserted?.amount && canAlter){
                hot.alter('insert_row', rowsInserted.index, rowsInserted.amount, 'tableImport.handlePaste.redo');
              }
              if(colsInserted?.amount && canAlter){
                hot.alter('insert_col', colsInserted.index, colsInserted.amount, 'tableImport.handlePaste.redo');
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
