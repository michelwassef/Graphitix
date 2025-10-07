// Shared helpers for Handsontable setup and wrapper sizing
// Exposes Shared.ensureHotWrapperStyles(wrapper) and Shared.createEmptyData(rows, cols)
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const hotNS = Shared.hot = Shared.hot || {};
  const MIN_INPUT_COLS = 12;

  function ensureHotWrapperStyles(wrapper){
    if(!wrapper){
      console.debug('Debug: ensureHotWrapperStyles skipped - no wrapper');
      return;
    }
    wrapper.style.overflow = 'auto';
    wrapper.style.height = '100%';
    wrapper.style.flex = '1 1 auto';
    wrapper.style.minHeight = '0';
    console.debug('Debug: hotWrapper style updated', wrapper.id || '', wrapper.style.cssText); // Debug: wrapper style
  }

  function createEmptyData(rows, cols){
    const targetRows = Math.max(0, rows | 0);
    const enforcedCols = Math.max(MIN_INPUT_COLS, cols | 0);
    console.debug('Debug: createEmptyData enforcing minimum columns', { requestedRows: rows, requestedCols: cols, targetRows, enforcedCols }); // Debug: verify min column enforcement
    if(global.Handsontable && global.Handsontable.helper && global.Handsontable.helper.createEmptySpreadsheetData){
      return global.Handsontable.helper.createEmptySpreadsheetData(targetRows, enforcedCols);
    }
    // Fallback if Handsontable is not present yet (tests)
    return Array.from({length: targetRows}, () => Array.from({length: enforcedCols}, () => ''));
  }

  function createStandardTable(container, dimensions, scheduleDraw, overrides){
    const debugLabel = overrides?.debugLabel || container?.id || 'hot';
    console.debug('Debug: createStandardTable entry', { debugLabel, containerId: container?.id || null });
    if(!container){
      console.warn('Shared.hot.createStandardTable missing container', { debugLabel });
      return null;
    }
    const Handsontable = global.Handsontable;
    if(!Handsontable){
      console.error('Shared.hot.createStandardTable missing global.Handsontable', { debugLabel });
      return null;
    }

    const rowCount = Math.max(0, Number(dimensions?.rows ?? 0));
    const requestedColCount = Math.max(0, Number(dimensions?.cols ?? 0));
    let colCount = Math.max(MIN_INPUT_COLS, requestedColCount);
    const scheduleFn = typeof scheduleDraw === 'function' ? scheduleDraw : null;
    const scheduleOnLoadData = overrides?.scheduleOnLoadData ?? false;
    const treatFirstRowAsHeader = overrides?.firstRowIsHeader !== false;
    const firstRowClassName = overrides?.firstRowClassName || '';
    const firstRowRenderer = overrides?.firstRowRenderer;
    const applyCellMeta = overrides?.applyCellMeta;
    const hotOptions = overrides?.hotOptions || {};
    const {
      rowHeaders: userRowHeaders,
      cells: userCells,
      afterChange: userAfterChange,
      afterCreateRow: userAfterCreateRow,
      afterCreateCol: userAfterCreateCol,
      afterRemoveRow: userAfterRemoveRow,
      afterRemoveCol: userAfterRemoveCol,
      afterUndo: userAfterUndo,
      afterRedo: userAfterRedo,
      afterColumnMove: userAfterColumnMove,
      afterSelectionEnd: userAfterSelectionEnd,
      afterScrollVertically: userAfterScrollVertically,
      afterScrollHorizontally: userAfterScrollHorizontally,
      afterPaste: userAfterPaste,
      beforeColumnSort: userBeforeColumnSort,
      afterColumnSort: userAfterColumnSort,
      afterGetColHeader: userAfterGetColHeader,
      afterContextMenuDefaultOptions: userAfterContextMenuDefaultOptions,
      columnSorting: userColumnSorting,
      ...otherHotOptions
    } = hotOptions;

    const padRowToLength = (row, targetCols)=>{
      const safeRow = Array.isArray(row) ? row.slice() : [];
      if(safeRow.length < targetCols){
        safeRow.length = targetCols;
      }
      for(let i = 0; i < safeRow.length; i++){
        if(typeof safeRow[i] === 'undefined'){
          safeRow[i] = '';
        }
      }
      return safeRow;
    };

    const normalizeDataMatrix = (matrix, targetRows, targetCols)=>{
      const source = Array.isArray(matrix) ? matrix.slice() : [];
      let maxCols = targetCols;
      for(let r = 0; r < source.length; r++){
        const row = Array.isArray(source[r]) ? source[r] : [];
        maxCols = Math.max(maxCols, row.length);
      }
      maxCols = Math.max(maxCols, MIN_INPUT_COLS);
      const normalized = [];
      const totalRows = Math.max(targetRows, source.length);
      for(let r = 0; r < totalRows; r++){
        const row = r < source.length ? source[r] : [];
        normalized.push(padRowToLength(row, maxCols));
      }
      console.debug('Debug: normalizeDataMatrix enforced dimensions', { debugLabel, requestedRows: targetRows, requestedCols: targetCols, normalizedRows: normalized.length, normalizedCols: maxCols }); // Debug: matrix normalization summary
      return { data: normalized, colCount: maxCols };
    };

    const baseMatrix = overrides?.data;
    let baseData;
    if(baseMatrix){
      const normalized = normalizeDataMatrix(baseMatrix, rowCount, colCount);
      baseData = normalized.data;
      colCount = normalized.colCount;
    }else{
      baseData = createEmptyData(rowCount, colCount);
    }
    console.debug('Debug: createStandardTable column enforcement', { debugLabel, requestedColCount, effectiveColCount: colCount }); // Debug: column enforcement trace

    const triggerSchedule = (reason, payload)=>{
      if(!scheduleFn){
        console.debug('Debug: Shared.hot schedule skipped', { debugLabel, reason });
        return;
      }
      console.debug('Debug: Shared.hot schedule triggered', { debugLabel, reason, payload: payload || null });
      scheduleFn();
    };

    console.debug('Debug: Shared.hot firstRowMode', { debugLabel, firstRowIsHeader: treatFirstRowAsHeader }); // Debug: header mode flag

    const rowHeaders = function(index){
      const defaultLabel = treatFirstRowAsHeader ? (index === 0 ? '' : index) : (index + 1);
      const value = typeof userRowHeaders === 'function' ? userRowHeaders.call(this, index) : defaultLabel;
      console.debug('Debug: Shared.hot rowHeader', { debugLabel, index, label: value });
      return value;
    };

    const cells = function(row, col){
      const props = typeof userCells === 'function' ? (userCells.call(this, row, col) || {}) : {};
      const isHeaderRow = treatFirstRowAsHeader && row === 0;
      if(isHeaderRow){
        const previousRenderer = props.renderer;
        props.renderer = function(){
          if(typeof previousRenderer === 'function'){
            previousRenderer.apply(this, arguments);
          }else if(Handsontable?.renderers?.TextRenderer){
            Handsontable.renderers.TextRenderer.apply(this, arguments);
          }
          const td = arguments[1];
          if(td){
            td.style.background = '#e9ecef';
            td.style.fontWeight = '600';
            td.title = 'Header (first row)';
          }
          if(typeof firstRowRenderer === 'function'){
            firstRowRenderer.apply(this, arguments);
          }
        };
        if(firstRowClassName){
          props.className = props.className ? `${props.className} ${firstRowClassName}` : firstRowClassName;
        }
      }else if(row === 0 && typeof firstRowRenderer === 'function'){
        const previousRenderer = props.renderer;
        props.renderer = function(){
          if(typeof previousRenderer === 'function'){
            previousRenderer.apply(this, arguments);
          }else if(Handsontable?.renderers?.TextRenderer){
            Handsontable.renderers.TextRenderer.apply(this, arguments);
          }
          firstRowRenderer.apply(this, arguments);
        };
      }
      if(typeof applyCellMeta === 'function'){
        try{
          applyCellMeta({ row, col, cellProperties: props, debugLabel });
        }catch(err){
          console.error('Shared.hot.applyCellMeta error', err);
        }
      }
      return props;
    };

    const wrapHook = (name, userFn, baseFn)=>{
      if(typeof userFn === 'function'){
        return function(){
          try{
            userFn.apply(this, arguments);
          }catch(err){
            console.error(`Shared.hot ${name} user hook error`, err);
          }
          if(typeof baseFn === 'function'){
            baseFn.apply(this, arguments);
          }
        };
      }
      return baseFn;
    };

    const autoGrowthDefaults = {
      enabled: true,
      rowThresholdPx: 200,
      colThresholdPx: 200,
      rowBatchSize: 20,
      colBatchSize: 5,
      rowCap: Math.max(rowCount, 1000),
      colCap: Math.max(colCount, 100),
      selectionThreshold: 2
    };
    const autoGrowthConfig = Object.assign({}, autoGrowthDefaults, overrides?.autoGrowth || {});
    autoGrowthConfig.rowBatchSize = Math.max(1, autoGrowthConfig.rowBatchSize | 0);
    autoGrowthConfig.colBatchSize = Math.max(1, autoGrowthConfig.colBatchSize | 0);
    autoGrowthConfig.rowCap = Math.max(rowCount, autoGrowthConfig.rowCap | 0 || rowCount);
    autoGrowthConfig.colCap = Math.max(colCount, autoGrowthConfig.colCap | 0 || colCount);
    autoGrowthConfig.selectionThreshold = Math.max(0, autoGrowthConfig.selectionThreshold | 0);
    console.debug('Debug: Shared.hot autoGrowth config prepared', { debugLabel, autoGrowthConfig }); // Debug: auto growth config

    const raf = global.requestAnimationFrame || function(cb){ return setTimeout(cb, 16); };

    const prepareSortValue = (rawValue)=>{
      if(rawValue === null || typeof rawValue === 'undefined'){
        return { empty: true, numeric: false, number: 0, text: '' };
      }
      if(typeof rawValue === 'number'){
        if(Number.isFinite(rawValue)){
          return { empty: false, numeric: true, number: rawValue, text: String(rawValue) };
        }
        return { empty: true, numeric: false, number: 0, text: '' };
      }
      const stringValue = String(rawValue).trim();
      if(stringValue === ''){
        return { empty: true, numeric: false, number: 0, text: '' };
      }
      const numericValue = Number(stringValue);
      if(!Number.isNaN(numericValue) && Number.isFinite(numericValue)){
        return { empty: false, numeric: true, number: numericValue, text: stringValue };
      }
      return { empty: false, numeric: false, number: 0, text: stringValue.toLowerCase() };
    };

    const collator = typeof Intl !== 'undefined' && Intl?.Collator ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }) : null;

    const columnSortingSettings = Object.assign({
      indicator: false,
      headerAction: !treatFirstRowAsHeader,
      sortEmptyCells: false,
      compareFunctionFactory(sortOrder){
        const multiplier = sortOrder === 'desc' ? -1 : 1;
        return function(valueA, valueB, rowA, rowB){
          if(treatFirstRowAsHeader){
            const aIsHeader = rowA === 0;
            const bIsHeader = rowB === 0;
            if(aIsHeader && bIsHeader){
              return 0;
            }
            if(aIsHeader){
              return -1;
            }
            if(bIsHeader){
              return 1;
            }
          }
          const preparedA = prepareSortValue(valueA);
          const preparedB = prepareSortValue(valueB);
          if(preparedA.empty && preparedB.empty){
            return (rowA - rowB) * multiplier;
          }
          if(preparedA.empty){
            return 1;
          }
          if(preparedB.empty){
            return -1;
          }
          if(preparedA.numeric && preparedB.numeric){
            const diff = preparedA.number - preparedB.number;
            if(diff !== 0){
              return diff * multiplier;
            }
          }
          if(collator){
            const result = collator.compare(preparedA.text, preparedB.text);
            if(result !== 0){
              return result * multiplier;
            }
          }else{
            const textA = preparedA.text;
            const textB = preparedB.text;
            if(textA !== textB){
              return (textA > textB ? 1 : -1) * multiplier;
            }
          }
          return (rowA - rowB) * multiplier;
        };
      }
    }, userColumnSorting || {});
    console.debug('Debug: Shared.hot columnSorting configured', { debugLabel, columnSortingSettings, treatFirstRowAsHeader }); // Debug: column sorting config

    const sanitizeSortConfigs = (sortConfigs)=>{
      if(!Array.isArray(sortConfigs)){
        return [];
      }
      const sanitized = [];
      for(let i = 0; i < sortConfigs.length; i++){
        const config = sortConfigs[i] || {};
        const columnIndex = typeof config.column === 'number' ? config.column : null;
        const rawOrder = typeof config.sortOrder === 'string' ? config.sortOrder.toLowerCase() : '';
        const sortOrder = rawOrder === 'asc' || rawOrder === 'desc' ? rawOrder : null;
        if(columnIndex !== null && sortOrder){
          sanitized.push({ column: columnIndex, sortOrder });
        }
      }
      console.debug('Debug: Shared.hot sanitizeSortConfigs', { debugLabel, requested: sortConfigs, sanitized });
      return sanitized;
    };

    const runUserHookSafely = (name, hookFn, args)=>{
      if(typeof hookFn !== 'function'){
        return undefined;
      }
      try{
        return hookFn.apply(instance, args);
      }catch(err){
        console.error(`Shared.hot ${name} user hook error`, err);
        return undefined;
      }
    };

    let currentSortState = sanitizeSortConfigs(userColumnSorting?.initialConfig || []);
    let manualSortInProgress = false;
    let baseOrderSnapshot = null;

    let instance = null;

    // === Global undo support (from codex branch) ===
    const undoManager = Shared.undoManager || null;
    const undoScope = (()=>{
      if(container?.closest){
        const panel = container.closest('.panel');
        if(panel?.id){
          return panel.id;
        }
        const svgBox = container.closest('.svgbox');
        if(svgBox?.id){
          return svgBox.id;
        }
      }
      return container?.id || debugLabel;
    })();
    const hasGlobalUndo = !!(undoManager && typeof undoManager.record === 'function');
    let undoRecordLock = 0;
    let pendingUndoRegistration = null;
    let pendingUndoScheduled = false;
    let pendingUndoScheduleMode = 'microtask';

    const getUndoPlugin = ()=>{
      const localInstance = instance;
      if(!localInstance) return null;
      if(typeof localInstance.getPlugin === 'function'){
        return localInstance.getPlugin('undoRedo') || localInstance.getPlugin('UndoRedo') || null;
      }
      if(localInstance.undoRedo) return localInstance.undoRedo;
      if(localInstance.UndoRedo) return localInstance.UndoRedo;
      return null;
    };

    const withUndoLock = (phase, fn)=>{
      undoRecordLock += 1;
      console.debug('Debug: hot undo lock engaged', { debugLabel, phase, lockDepth: undoRecordLock });
      try{
        return typeof fn === 'function' ? fn() : undefined;
      }finally{
        undoRecordLock = Math.max(0, undoRecordLock - 1);
        console.debug('Debug: hot undo lock released', { debugLabel, phase, lockDepth: undoRecordLock });
      }
    };

    const applyHandsontableUndoRedo = (direction, meta)=>{
      const localInstance = instance;
      if(!localInstance){
        console.debug('Debug: hot undo apply skipped - missing instance', { debugLabel, direction });
        return false;
      }
      const plugin = getUndoPlugin();
      const availabilityKey = direction === 'redo' ? 'isRedoAvailable' : 'isUndoAvailable';
      if(plugin && typeof plugin[availabilityKey] === 'function' && !plugin[availabilityKey]()){
        console.debug('Debug: hot undo apply skipped - not available', { debugLabel, direction, meta });
        return false;
      }
      try{
        if(typeof localInstance[direction] === 'function'){
          console.debug('Debug: hot undo apply via instance', { debugLabel, direction, meta });
          localInstance[direction]();
          return true;
        }else if(plugin && typeof plugin[direction] === 'function'){
          console.debug('Debug: hot undo apply via plugin', { debugLabel, direction, meta });
          plugin[direction]();
          return true;
        }else{
          console.warn('Shared.hot undo/redo missing methods', { debugLabel, direction });
        }
      }catch(err){
        console.error('Shared.hot undo apply error', err);
      }
      return false;
    };

    const flushPendingUndoRegistration = ()=>{
      const payload = pendingUndoRegistration;
      pendingUndoRegistration = null;
      if(!payload){
        return;
      }
      if(!hasGlobalUndo){
        console.debug('Debug: hot undo registration skipped - no global undo', { debugLabel });
        return;
      }
      if(undoRecordLock > 0){
        console.debug('Debug: hot undo registration skipped - lock engaged', { debugLabel, lockDepth: undoRecordLock });
        return;
      }
      if(!instance){
        console.debug('Debug: hot undo registration skipped - missing instance', { debugLabel });
        return;
      }
      const plugin = getUndoPlugin();
      if(plugin && typeof plugin.isUndoAvailable === 'function' && !plugin.isUndoAvailable()){
        payload.attempts = (payload.attempts || 0) + 1;
        if(payload.attempts <= 3){
          console.debug('Debug: hot undo registration retry scheduled - plugin empty', { debugLabel, attempts: payload.attempts, reasons: Array.from(payload.reasons || []) });
          pendingUndoRegistration = payload;
          scheduleUndoFlush('raf');
          return;
        }
        console.debug('Debug: hot undo registration proceeding after retries', { debugLabel, attempts: payload.attempts });
      }
      const reasons = Array.from(payload.reasons || []);
      const labelSuffix = reasons.length ? reasons.join('+') : 'change';
      const label = `table:${debugLabel}:${labelSuffix}`;
      console.debug('Debug: hot undo registration flush', { debugLabel, label, reasons, meta: payload.meta });
      undoManager.record({
        label,
        scope: undoScope,
        undo: ()=> withUndoLock('undo', ()=> applyHandsontableUndoRedo('undo', { label, reasons })),
        redo: ()=> withUndoLock('redo', ()=> applyHandsontableUndoRedo('redo', { label, reasons }))
      });
    };

    const scheduleUndoFlush = (mode = 'microtask')=>{
      if(pendingUndoScheduled && pendingUndoScheduleMode === mode){
        return;
      }
      pendingUndoScheduled = true;
      pendingUndoScheduleMode = mode;
      const finalize = ()=>{
        pendingUndoScheduled = false;
        pendingUndoScheduleMode = 'microtask';
        flushPendingUndoRegistration();
      };
      if(mode === 'raf'){
        if(typeof raf === 'function'){
          raf(finalize);
        }else{
          setTimeout(finalize, 16);
        }
        return;
      }
      if(typeof global.Promise === 'function'){
        global.Promise.resolve().then(finalize);
      }else{
        setTimeout(finalize, 0);
      }
    };

    const queueUndoRegistration = (reason, meta)=>{
      if(!hasGlobalUndo) return;
      if(undoRecordLock > 0) return;
      if(!instance) return;
      if(!pendingUndoRegistration){
        pendingUndoRegistration = { scope: undoScope, reasons: new Set(), meta: [], attempts: 0 };
        scheduleUndoFlush();
      }
      pendingUndoRegistration.reasons.add(reason);
      if(meta){
        pendingUndoRegistration.meta.push({ reason, detail: meta });
      }
      console.debug('Debug: hot undo registration queued', { debugLabel, reason, meta });
    };

    if(hasGlobalUndo){
      console.debug('Debug: hot undo scope resolved', { debugLabel, undoScope });
    }

    // === Clipboard transpose support (from main branch) ===
    let clipboardCache = '';

    const updateClipboardCache = (text, meta)=>{
      if(typeof text !== 'string'){
        return;
      }
      clipboardCache = text;
      console.debug('Debug: Shared.hot clipboard cache updated', { debugLabel, length: text.length, meta: meta || null });
    };

    const containerPasteListener = (event)=>{
      const plain = event?.clipboardData?.getData?.('text/plain') || event?.clipboardData?.getData?.('text') || '';
      if(plain){
        updateClipboardCache(plain, { trigger: 'pasteEvent' });
      }
    };

    if(container && !container.__hotTransposePasteBound && typeof container.addEventListener === 'function'){
      container.addEventListener('paste', containerPasteListener);
      container.__hotTransposePasteBound = true;
      console.debug('Debug: Shared.hot container paste listener bound', { debugLabel });
    }

    const normalizeClipboardRows = (text)=>{
      if(typeof text !== 'string' || !text){
        return [];
      }
      const sanitized = text.replace(/\r\n?/g, '\n');
      const lines = sanitized.split('\n');
      if(lines.length && lines[lines.length - 1] === ''){
        lines.pop();
      }
      return lines.map((line)=>{
        if(line.indexOf('\t') !== -1){
          return line.split('\t');
        }
        if(line.indexOf(',') !== -1){
          return line.split(',');
        }
        return [line];
      });
    };

    const transposeMatrix = (matrix)=>{
      if(!Array.isArray(matrix) || !matrix.length){
        return [];
      }
      let maxCols = 0;
      for(let r = 0; r < matrix.length; r++){
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        maxCols = Math.max(maxCols, row.length);
      }
      const transposed = [];
      for(let c = 0; c < maxCols; c++){
        const newRow = [];
        for(let r = 0; r < matrix.length; r++){
          const row = Array.isArray(matrix[r]) ? matrix[r] : [];
          newRow.push(row[c] != null ? row[c] : '');
        }
        transposed.push(newRow);
      }
      console.debug('Debug: Shared.hot transpose computed', { debugLabel, sourceRows: matrix.length, sourceCols: maxCols, targetRows: transposed.length, targetCols: transposed[0]?.length || 0 });
      return transposed;
    };

    const readClipboardText = async()=>{
      if(typeof navigator === 'undefined'){
        console.debug('Debug: Shared.hot navigator clipboard unavailable', { debugLabel });
        return null;
      }
      const clip = navigator?.clipboard;
      if(!clip || typeof clip.readText !== 'function'){
        console.debug('Debug: Shared.hot clipboard.readText unavailable', { debugLabel });
        return null;
      }
      try{
        const text = await clip.readText();
        console.debug('Debug: Shared.hot clipboard.readText success', { debugLabel, length: text?.length || 0 });
        return text;
      }catch(err){
        console.error('Shared.hot clipboard.readText failed', err);
        return null;
      }
    };

    const applyTransposeFromText = (text, source)=>{
      if(!instance){
        console.debug('Debug: Shared.hot transpose skipped - no instance', { debugLabel });
        return;
      }
      const selection = typeof instance.getSelectedRangeLast === 'function' ? instance.getSelectedRangeLast() : null;
      if(!selection){
        console.debug('Debug: Shared.hot transpose skipped - no selection', { debugLabel, source });
        return;
      }
      const matrix = normalizeClipboardRows(text);
      if(!matrix.length){
        console.debug('Debug: Shared.hot transpose skipped - empty matrix', { debugLabel, source });
        return;
      }
      const transposed = transposeMatrix(matrix);
      if(!transposed.length){
        console.debug('Debug: Shared.hot transpose skipped - empty transpose', { debugLabel, source });
        return;
      }
      const startRow = Math.max(selection.from?.row ?? 0, 0);
      const startCol = Math.max(selection.from?.col ?? 0, 0);
      const endRow = startRow + transposed.length - 1;
      const endCol = startCol + (transposed[0]?.length || 1) - 1;
      console.debug('Debug: Shared.hot transpose populateFromArray', { debugLabel, startRow, startCol, endRow, endCol, source });
      try{
        instance.populateFromArray(startRow, startCol, transposed, endRow, endCol, 'ContextMenu.pasteTranspose', 'transpose');
        triggerSchedule('pasteTranspose', { rows: transposed.length, cols: transposed[0]?.length || 0, source });
      }catch(err){
        console.error('Shared.hot transpose populate error', err);
      }
    };

    const requestTransposePaste = ()=>{
      console.debug('Debug: Shared.hot transpose requested', { debugLabel });
      (async()=>{
        const direct = await readClipboardText();
        if(direct){
          updateClipboardCache(direct, { trigger: 'navigatorClipboard' });
          applyTransposeFromText(direct, 'navigatorClipboard');
          return;
        }
        if(clipboardCache){
          console.debug('Debug: Shared.hot transpose using cache', { debugLabel });
          applyTransposeFromText(clipboardCache, 'cachedClipboard');
          return;
        }
        console.warn('Shared.hot transpose failed - clipboard unavailable', { debugLabel });
        if(typeof window !== 'undefined' && typeof window.alert === 'function'){
          window.alert('Unable to read clipboard data for transposed paste. Please allow clipboard access or paste normally first.');
        }
      })();
    };

    const autoGrowthState = {
      scrollAttached: false,
      pendingRowHandle: null,
      pendingColHandle: null
    };

    const resolveHolder = ()=>{
      const localInstance = instance;
      const holder = localInstance?.view?.wt?.wtTable?.holder || container?.querySelector?.('.wtHolder') || null;
      if(!holder){
        console.debug('Debug: autoGrow resolveHolder missing holder', { debugLabel });
      }
      return holder;
    };

    const evaluateSelectionState = ()=>{
      const localInstance = instance;
      if(!localInstance || typeof localInstance.getSelectedRangeLast !== 'function'){
        return null;
      }
      const range = localInstance.getSelectedRangeLast();
      if(!range){
        return null;
      }
      const totalRows = typeof localInstance.countRows === 'function' ? localInstance.countRows() : 0;
      const totalCols = typeof localInstance.countCols === 'function' ? localInstance.countCols() : 0;
      const headRow = Math.min(range.from?.row ?? Number.POSITIVE_INFINITY, range.to?.row ?? Number.POSITIVE_INFINITY);
      const headCol = Math.min(range.from?.col ?? Number.POSITIVE_INFINITY, range.to?.col ?? Number.POSITIVE_INFINITY);
      const tailRow = Math.max(range.from?.row ?? -1, range.to?.row ?? -1);
      const tailCol = Math.max(range.from?.col ?? -1, range.to?.col ?? -1);
      const coversAllRows = totalRows > 0 && headRow <= 0 && tailRow >= (totalRows - 1);
      const coversAllCols = totalCols > 0 && headCol <= 0 && tailCol >= (totalCols - 1);
      const selectionState = {
        tailRow,
        tailCol,
        coversAllRows,
        coversAllCols
      };
      console.debug('Debug: autoGrow evaluateSelectionState', { debugLabel, selectionState, totalRows, totalCols }); // Debug: selection state trace
      return selectionState;
    };

    const shouldGrowRows = ()=>{
      if(!autoGrowthConfig.enabled){
        return false;
      }
      const localInstance = instance;
      if(!localInstance){
        return false;
      }
      const totalRows = localInstance.countRows();
      if(totalRows >= autoGrowthConfig.rowCap){
        console.debug('Debug: autoGrow rows capped', { debugLabel, totalRows, rowCap: autoGrowthConfig.rowCap });
        return false;
      }
      let nearByScroll = false;
      const holder = resolveHolder();
      if(holder){
        const distance = holder.scrollHeight - holder.clientHeight - holder.scrollTop;
        nearByScroll = distance <= autoGrowthConfig.rowThresholdPx;
        console.debug('Debug: autoGrow row distance', { debugLabel, distance, threshold: autoGrowthConfig.rowThresholdPx, nearByScroll });
      }
      let nearBySelection = false;
      const selection = evaluateSelectionState();
      if(selection){
        if(selection.coversAllRows){
          console.debug('Debug: autoGrow shouldGrowRows skipped full-table selection', { debugLabel, selection }); // Debug: prevent Ctrl+A growth for rows
          return false;
        }
        if(selection.tailRow >= 0){
          nearBySelection = (totalRows - 1 - selection.tailRow) <= autoGrowthConfig.selectionThreshold;
        }
      }
      const shouldGrow = nearByScroll || nearBySelection;
      console.debug('Debug: autoGrow shouldGrowRows evaluation', { debugLabel, shouldGrow, nearByScroll, nearBySelection, totalRows });
      return shouldGrow;
    };

    const shouldGrowCols = ()=>{
      if(!autoGrowthConfig.enabled){
        return false;
      }
      const localInstance = instance;
      if(!localInstance){
        return false;
      }
      const totalCols = localInstance.countCols();
      if(totalCols >= autoGrowthConfig.colCap){
        console.debug('Debug: autoGrow cols capped', { debugLabel, totalCols, colCap: autoGrowthConfig.colCap });
        return false;
      }
      let nearByScroll = false;
      const holder = resolveHolder();
      if(holder){
        const distance = holder.scrollWidth - holder.clientWidth - holder.scrollLeft;
        nearByScroll = distance <= autoGrowthConfig.colThresholdPx;
        console.debug('Debug: autoGrow col distance', { debugLabel, distance, threshold: autoGrowthConfig.colThresholdPx, nearByScroll });
      }
      let nearBySelection = false;
      const selection = evaluateSelectionState();
      if(selection){
        if(selection.coversAllCols){
          console.debug('Debug: autoGrow shouldGrowCols skipped full-table selection', { debugLabel, selection }); // Debug: prevent Ctrl+A growth for columns
          return false;
        }
        if(selection.tailCol >= 0){
          nearBySelection = (totalCols - 1 - selection.tailCol) <= autoGrowthConfig.selectionThreshold;
        }
      }
      const shouldGrow = nearByScroll || nearBySelection;
      console.debug('Debug: autoGrow shouldGrowCols evaluation', { debugLabel, shouldGrow, nearByScroll, nearBySelection, totalCols });
      return shouldGrow;
    };

    const resolveRowInsertAction = (totalRows)=>{
      if(totalRows <= 0){
        console.debug('Debug: autoGrow resolveRowInsertAction selecting insert_row_above for empty table', { debugLabel, totalRows });
        return { action: 'insert_row_above', index: 0 };
      }
      const index = Math.max(totalRows - 1, 0);
      console.debug('Debug: autoGrow resolveRowInsertAction selecting insert_row_below', { debugLabel, totalRows, index });
      return { action: 'insert_row_below', index };
    };

    const resolveColInsertAction = (totalCols)=>{
      if(totalCols <= 0){
        console.debug('Debug: autoGrow resolveColInsertAction selecting insert_col_start for empty table', { debugLabel, totalCols });
        return { action: 'insert_col_start', index: 0 };
      }
      const index = Math.max(totalCols - 1, 0);
      console.debug('Debug: autoGrow resolveColInsertAction selecting insert_col_end', { debugLabel, totalCols, index });
      return { action: 'insert_col_end', index };
    };

    const triggerRowInsert = (reason)=>{
      const localInstance = instance;
      if(!localInstance){
        return;
      }
      const totalRows = localInstance.countRows();
      const remaining = autoGrowthConfig.rowCap - totalRows;
      if(remaining <= 0){
        console.debug('Debug: autoGrow triggerRowInsert skipped - no remaining capacity', { debugLabel, totalRows, rowCap: autoGrowthConfig.rowCap, reason });
        return;
      }
      const amount = Math.min(autoGrowthConfig.rowBatchSize, remaining);
      if(amount <= 0){
        return;
      }
      console.debug('Debug: autoGrow triggerRowInsert executing', { debugLabel, amount, reason, totalRows });
      const { action, index } = resolveRowInsertAction(totalRows);
      console.debug('Debug: autoGrow triggerRowInsert action resolved', { debugLabel, action, index, amount, reason });
      localInstance.alter(action, index, amount, 'autoGrow');
      triggerSchedule('autoGrowRows', { amount, reason, totalRows });
    };

    const triggerColInsert = (reason)=>{
      const localInstance = instance;
      if(!localInstance){
        return;
      }
      const totalCols = localInstance.countCols();
      const remaining = autoGrowthConfig.colCap - totalCols;
      if(remaining <= 0){
        console.debug('Debug: autoGrow triggerColInsert skipped - no remaining capacity', { debugLabel, totalCols, colCap: autoGrowthConfig.colCap, reason });
        return;
      }
      const amount = Math.min(autoGrowthConfig.colBatchSize, remaining);
      if(amount <= 0){
        return;
      }
      console.debug('Debug: autoGrow triggerColInsert executing', { debugLabel, amount, reason, totalCols });
      const { action, index } = resolveColInsertAction(totalCols);
      console.debug('Debug: autoGrow triggerColInsert action resolved', { debugLabel, action, index, amount, reason });
      localInstance.alter(action, index, amount, 'autoGrow');
      triggerSchedule('autoGrowCols', { amount, reason, totalCols });
    };

    const scheduleRowGrowth = (reason)=>{
      if(!autoGrowthConfig.enabled){
        return;
      }
      if(autoGrowthState.pendingRowHandle){
        console.debug('Debug: autoGrow scheduleRowGrowth skipped - already pending', { debugLabel, reason });
        return;
      }
      autoGrowthState.pendingRowHandle = raf(()=>{
        autoGrowthState.pendingRowHandle = null;
        if(shouldGrowRows()){
          triggerRowInsert(reason);
        }else{
          console.debug('Debug: autoGrow scheduleRowGrowth check resolved no-op', { debugLabel, reason });
        }
      });
      console.debug('Debug: autoGrow scheduleRowGrowth queued', { debugLabel, reason });
    };

    const scheduleColGrowth = (reason)=>{
      if(!autoGrowthConfig.enabled){
        return;
      }
      if(autoGrowthState.pendingColHandle){
        console.debug('Debug: autoGrow scheduleColGrowth skipped - already pending', { debugLabel, reason });
        return;
      }
      autoGrowthState.pendingColHandle = raf(()=>{
        autoGrowthState.pendingColHandle = null;
        if(shouldGrowCols()){
          triggerColInsert(reason);
        }else{
          console.debug('Debug: autoGrow scheduleColGrowth check resolved no-op', { debugLabel, reason });
        }
      });
      console.debug('Debug: autoGrow scheduleColGrowth queued', { debugLabel, reason });
    };

    const attachScrollHandler = ()=>{
      if(autoGrowthState.scrollAttached){
        return;
      }
      const holder = resolveHolder();
      if(holder){
        const onScroll = ()=>{
          scheduleRowGrowth('scroll');
          scheduleColGrowth('scroll');
        };
        holder.addEventListener('scroll', onScroll, { passive: true });
        autoGrowthState.scrollAttached = true;
        autoGrowthState.holderScrollHandler = onScroll;
        console.debug('Debug: autoGrow scroll handler attached', { debugLabel });
      }
    };

    const afterSelectionEndBase = function(){
      if(autoGrowthConfig.enabled){
        console.debug('Debug: autoGrow afterSelectionEndBase invoked', { debugLabel, args: Array.from(arguments) });
        scheduleRowGrowth('selection');
        scheduleColGrowth('selection');
      }
    };

    const afterScrollVerticallyBase = function(){
      if(autoGrowthConfig.enabled){
        console.debug('Debug: autoGrow afterScrollVerticallyBase invoked', { debugLabel, args: Array.from(arguments) });
        scheduleRowGrowth('afterScrollVertically');
      }
    };

    const afterScrollHorizontallyBase = function(){
      if(autoGrowthConfig.enabled){
        console.debug('Debug: autoGrow afterScrollHorizontallyBase invoked', { debugLabel, args: Array.from(arguments) });
        scheduleColGrowth('afterScrollHorizontally');
      }
    };

    const captureCurrentOrder = ()=>{
      if(!instance || typeof instance.getSourceData !== 'function'){
        return null;
      }
      const data = instance.getSourceData();
      if(!Array.isArray(data)){
        return null;
      }
      const snapshot = data.slice();
      console.debug('Debug: Shared.hot captureCurrentOrder', { debugLabel, length: snapshot.length });
      return snapshot;
    };

    const applyRowOrder = (rows)=>{
      if(!instance || !Array.isArray(rows)){
        console.debug('Debug: Shared.hot applyRowOrder skipped', { debugLabel, hasInstance: !!instance, rowsValid: Array.isArray(rows) });
        return false;
      }
      console.debug('Debug: Shared.hot applyRowOrder executing', { debugLabel, rowCount: rows.length });
      instance.loadData(rows);
      return true;
    };

    const sortBodyRows = (sortConfigs)=>{
      if(!instance || typeof instance.getSourceData !== 'function'){
        return false;
      }
      const data = instance.getSourceData();
      if(!Array.isArray(data) || data.length <= 1){
        console.debug('Debug: Shared.hot sortBodyRows skipped - insufficient data', { debugLabel, length: data ? data.length : 0 });
        return false;
      }
      const headerRow = data[0];
      const bodyEntries = [];
      for(let idx = 1; idx < data.length; idx++){
        bodyEntries.push({ row: data[idx], originalIndex: idx });
      }
      if(bodyEntries.length === 0){
        console.debug('Debug: Shared.hot sortBodyRows skipped - empty body', { debugLabel });
        return false;
      }
      const comparators = sortConfigs.map((config)=>{
        const multiplier = config.sortOrder === 'desc' ? -1 : 1;
        return (a, b)=>{
          const valueA = Array.isArray(a.row) ? a.row[config.column] : undefined;
          const valueB = Array.isArray(b.row) ? b.row[config.column] : undefined;
          const preparedA = prepareSortValue(valueA);
          const preparedB = prepareSortValue(valueB);
          if(preparedA.empty && preparedB.empty){
            return (a.originalIndex - b.originalIndex);
          }
          if(preparedA.empty){
            return 1;
          }
          if(preparedB.empty){
            return -1;
          }
          if(preparedA.numeric && preparedB.numeric){
            const diff = preparedA.number - preparedB.number;
            if(diff !== 0){
              return diff * multiplier;
            }
          }
          if(collator){
            const result = collator.compare(preparedA.text, preparedB.text);
            if(result !== 0){
              return result * multiplier;
            }
          }else{
            if(preparedA.text !== preparedB.text){
              return (preparedA.text > preparedB.text ? 1 : -1) * multiplier;
            }
          }
          return (a.originalIndex - b.originalIndex);
        };
      });
      bodyEntries.sort((a, b)=>{
        for(let i = 0; i < comparators.length; i++){
          const diff = comparators[i](a, b);
          if(diff !== 0){
            return diff;
          }
        }
        return a.originalIndex - b.originalIndex;
      });
      const orderedRows = [headerRow];
      for(let i = 0; i < bodyEntries.length; i++){
        orderedRows.push(bodyEntries[i].row);
      }
      console.debug('Debug: Shared.hot sortBodyRows completed', { debugLabel, sortConfigs, bodyLength: bodyEntries.length });
      return orderedRows;
    };

    const applySortState = (sortConfigs)=>{
      currentSortState = sortConfigs;
      if(instance && typeof instance.render === 'function'){
        instance.render();
      }
      console.debug('Debug: Shared.hot applySortState', { debugLabel, currentSortState });
    };

    const clearSortState = ()=>{
      currentSortState = [];
      if(instance && typeof instance.render === 'function'){
        instance.render();
      }
      console.debug('Debug: Shared.hot clearSortState', { debugLabel });
    };

    const beforeColumnSortBase = function(currentSortConfig, destinationSortConfigs){
      console.debug('Debug: Shared.hot beforeColumnSortBase invoked', { debugLabel, currentSortConfig, destinationSortConfigs });
      if(!treatFirstRowAsHeader){
        const sanitized = sanitizeSortConfigs(destinationSortConfigs);
        if(!sanitized.length){
          clearSortState();
        }else{
          currentSortState = sanitized;
          if(instance && typeof instance.render === 'function'){
            instance.render();
          }
        }
        return;
      }
      if(manualSortInProgress){
        console.debug('Debug: Shared.hot manual sort already running - skipping', { debugLabel });
        return false;
      }
      const sanitized = sanitizeSortConfigs(destinationSortConfigs);
      if(!sanitized.length){
        if(currentSortState.length > 0 && Array.isArray(baseOrderSnapshot)){
          manualSortInProgress = true;
          try{
            if(applyRowOrder(baseOrderSnapshot.slice())){
              clearSortState();
              baseOrderSnapshot = captureCurrentOrder();
              triggerSchedule('manualColumnSortReset', { currentSortConfig, destinationSortConfigs });
            }
          }finally{
            manualSortInProgress = false;
          }
          return false;
        }
        clearSortState();
        baseOrderSnapshot = captureCurrentOrder();
        return;
      }
      if(currentSortState.length === 0){
        baseOrderSnapshot = captureCurrentOrder();
      }
      manualSortInProgress = true;
      try{
        const orderedRows = sortBodyRows(sanitized);
        if(Array.isArray(orderedRows) && orderedRows.length){
          applyRowOrder(orderedRows);
          applySortState(sanitized);
          triggerSchedule('manualColumnSort', { currentSortConfig, destinationSortConfigs: sanitized });
        }
      }finally{
        manualSortInProgress = false;
      }
      return false;
    };

    const afterColumnSortBase = function(currentSortConfig, destinationSortConfigs){
      console.debug('Debug: Shared.hot afterColumnSortBase invoked', { debugLabel, currentSortConfig, destinationSortConfigs });
      if(!treatFirstRowAsHeader){
        triggerSchedule('afterColumnSort', { currentSortConfig, destinationSortConfigs });
      }
    };

    const executeSortPipeline = (destinationSortConfigs, meta)=>{
      const sanitized = sanitizeSortConfigs(destinationSortConfigs);
      const currentSnapshot = Array.isArray(currentSortState) ? currentSortState.slice() : [];
      console.debug('Debug: Shared.hot executeSortPipeline start', { debugLabel, sanitized, meta, currentSnapshot });
      const beforeResult = runUserHookSafely('beforeColumnSort', userBeforeColumnSort, [currentSnapshot.slice(), sanitized.slice()]);
      if(beforeResult === false){
        console.debug('Debug: Shared.hot executeSortPipeline cancelled by user hook', { debugLabel, meta, sanitized });
        return false;
      }
      const baseResult = beforeColumnSortBase.call(instance, currentSnapshot, sanitized);
      runUserHookSafely('afterColumnSort', userAfterColumnSort, [currentSnapshot.slice(), sanitized.slice()]);
      afterColumnSortBase.call(instance, currentSnapshot, sanitized);
      console.debug('Debug: Shared.hot executeSortPipeline complete', { debugLabel, sanitized, meta, baseResult });
      return true;
    };

    const requestManualSortForColumn = (column, order, meta)=>{
      const normalizedColumn = typeof column === 'number' ? column : null;
      if(normalizedColumn === null){
        console.debug('Debug: Shared.hot requestManualSortForColumn skipped - invalid column', { debugLabel, column, order, meta });
        return false;
      }
      const active = currentSortState.find((config)=>config.column === normalizedColumn) || null;
      if(!treatFirstRowAsHeader){
        const plugin = instance?.getPlugin?.('columnSorting') || null;
        if(!plugin){
          console.debug('Debug: Shared.hot requestManualSortForColumn plugin missing', { debugLabel, column: normalizedColumn, order, meta });
          return false;
        }
        if(active && active.sortOrder === order){
          if(typeof plugin.clearSort === 'function'){
            plugin.clearSort();
          }else if(typeof plugin.sort === 'function'){
            plugin.sort([]);
          }
          clearSortState();
          return true;
        }
        if(typeof plugin.sort === 'function'){
          plugin.sort({ column: normalizedColumn, sortOrder: order });
          currentSortState = [{ column: normalizedColumn, sortOrder: order }];
          if(instance && typeof instance.render === 'function'){
            instance.render();
          }
          console.debug('Debug: Shared.hot requestManualSortForColumn delegated to plugin', { debugLabel, column: normalizedColumn, order, meta });
          return true;
        }
        console.debug('Debug: Shared.hot requestManualSortForColumn plugin sort unavailable', { debugLabel, column: normalizedColumn, order, meta });
        return false;
      }
      if(active && active.sortOrder === order){
        console.debug('Debug: Shared.hot requestManualSortForColumn toggling off', { debugLabel, column: normalizedColumn, order, meta });
        return executeSortPipeline([], Object.assign({}, meta, { column: normalizedColumn, order, action: 'clear' }));
      }
      const destination = [{ column: normalizedColumn, sortOrder: order }];
      console.debug('Debug: Shared.hot requestManualSortForColumn applying', { debugLabel, column: normalizedColumn, order, meta });
      return executeSortPipeline(destination, Object.assign({}, meta, { column: normalizedColumn, order, action: 'apply' }));
    };

    const clearManualSortForColumn = (column, meta)=>{
      const normalizedColumn = typeof column === 'number' ? column : null;
      console.debug('Debug: Shared.hot clearManualSortForColumn invoked', { debugLabel, column: normalizedColumn, meta });
      if(!treatFirstRowAsHeader){
        const plugin = instance?.getPlugin?.('columnSorting') || null;
        if(plugin){
          if(typeof plugin.clearSort === 'function'){
            plugin.clearSort();
          }else if(typeof plugin.sort === 'function'){
            plugin.sort([]);
          }
        }
        clearSortState();
        return true;
      }
      return executeSortPipeline([], Object.assign({}, meta, { column: normalizedColumn, action: 'clear' }));
    };

    const cycleSortForColumn = (column, meta)=>{
      const normalizedColumn = typeof column === 'number' ? column : null;
      if(normalizedColumn === null){
        console.debug('Debug: Shared.hot cycleSortForColumn skipped - invalid column', { debugLabel, column, meta });
        return false;
      }
      const active = currentSortState.find((config)=>config.column === normalizedColumn) || null;
      if(!active){
        return requestManualSortForColumn(normalizedColumn, 'asc', Object.assign({}, meta, { cycleStep: 'asc' }));
      }
      if(active.sortOrder === 'asc'){
        return requestManualSortForColumn(normalizedColumn, 'desc', Object.assign({}, meta, { cycleStep: 'desc' }));
      }
      return clearManualSortForColumn(normalizedColumn, Object.assign({}, meta, { cycleStep: 'clear' }));
    };

    const afterGetColHeaderBase = function(col, TH){
      if(!TH || typeof col !== 'number' || col < 0){
        return;
      }
      TH.classList.add('hot-header-sortable');
      const active = currentSortState.find((config)=>config.column === col);
      const order = active ? active.sortOrder : 'none';
      TH.setAttribute('data-sort-order', order);
      let headerLabel = '';
      if(typeof instance?.getColHeader === 'function'){
        try{
          const headerLookup = instance.getColHeader(col);
          if(Array.isArray(headerLookup)){
            headerLabel = headerLookup[col] != null ? String(headerLookup[col]) : '';
          }else if(headerLookup != null){
            headerLabel = String(headerLookup);
          }
        }catch(err){
          console.error('Shared.hot getColHeader lookup failed', err);
        }
      }
      if(!headerLabel){
        const existingLabel = TH.querySelector('.hot-sort-label');
        if(existingLabel && existingLabel.textContent){
          headerLabel = existingLabel.textContent;
        }
      }
      if(!headerLabel){
        const fallbackText = TH.textContent || '';
        headerLabel = fallbackText.trim();
      }
      if(!headerLabel){
        headerLabel = `Column ${col + 1}`;
      }
      TH.dataset.sortLabel = headerLabel;
      let wrapper = TH.querySelector('.hot-sort-wrapper');
      if(!wrapper){
        wrapper = document.createElement('div');
        wrapper.className = 'hot-sort-wrapper';
        const labelSpan = document.createElement('span');
        labelSpan.className = 'hot-sort-label';
        wrapper.appendChild(labelSpan);
        const buttonGroup = document.createElement('div');
        buttonGroup.className = 'hot-sort-buttons';
        const ascButton = document.createElement('button');
        ascButton.type = 'button';
        ascButton.className = 'hot-sort-button hot-sort-button--asc';
        ascButton.innerHTML = '<span aria-hidden="true">▲</span>';
        const descButton = document.createElement('button');
        descButton.type = 'button';
        descButton.className = 'hot-sort-button hot-sort-button--desc';
        descButton.innerHTML = '<span aria-hidden="true">▼</span>';
        buttonGroup.appendChild(ascButton);
        buttonGroup.appendChild(descButton);
        wrapper.appendChild(buttonGroup);
        TH.textContent = '';
        TH.appendChild(wrapper);
        if(!ascButton.dataset.bound){
          ascButton.dataset.bound = 'true';
          ascButton.addEventListener('click', function(event){
            event.preventDefault();
            event.stopPropagation();
            requestManualSortForColumn(col, 'asc', { trigger: 'headerButtonAsc' });
          });
        }
        if(!descButton.dataset.bound){
          descButton.dataset.bound = 'true';
          descButton.addEventListener('click', function(event){
            event.preventDefault();
            event.stopPropagation();
            requestManualSortForColumn(col, 'desc', { trigger: 'headerButtonDesc' });
          });
        }
        if(TH.dataset.sortClickBound !== 'true'){
          TH.dataset.sortClickBound = 'true';
          TH.addEventListener('click', function(event){
            if(event.target.closest('.hot-sort-button')){
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            cycleSortForColumn(col, { trigger: 'headerLabelClick' });
          });
        }
        console.debug('Debug: Shared.hot header controls attached', { debugLabel, column: col });
      }
      const labelNode = TH.querySelector('.hot-sort-label');
      if(labelNode){
        labelNode.textContent = headerLabel;
        labelNode.title = headerLabel;
      }
      const ascNode = TH.querySelector('.hot-sort-button--asc');
      if(ascNode){
        const ascActive = order === 'asc';
        ascNode.classList.toggle('is-active', ascActive);
        ascNode.setAttribute('aria-pressed', ascActive ? 'true' : 'false');
        ascNode.setAttribute('aria-label', `${headerLabel} ascending sort${ascActive ? ' (active)' : ''}`);
      }
      const descNode = TH.querySelector('.hot-sort-button--desc');
      if(descNode){
        const descActive = order === 'desc';
        descNode.classList.toggle('is-active', descActive);
        descNode.setAttribute('aria-pressed', descActive ? 'true' : 'false');
        descNode.setAttribute('aria-label', `${headerLabel} descending sort${descActive ? ' (active)' : ''}`);
      }
      console.debug('Debug: Shared.hot afterGetColHeaderBase applied', { debugLabel, column: col, order, headerLabel });
    };

    const afterChangeBase = function(changes, source){
      if(!changes){
        return;
      }
      if(!scheduleOnLoadData && source === 'loadData'){
        console.debug('Debug: Shared.hot afterChange skipped loadData', { debugLabel, count: changes.length });
        return;
      }
      if(hasGlobalUndo && source !== 'loadData' && source !== 'UndoRedo.undo' && source !== 'UndoRedo.redo'){
        queueUndoRegistration('change', { count: changes.length, source });
      }
      triggerSchedule('afterChange', { count: changes.length, source });
    };
    const afterCreateRowBase = function(index, amount, source){
      if(hasGlobalUndo && source !== 'UndoRedo.undo' && source !== 'UndoRedo.redo'){
        queueUndoRegistration('createRow', { index, amount, source });
      }
      triggerSchedule('afterCreateRow');
    };
    const afterCreateColBase = function(index, amount, source){
      if(hasGlobalUndo && source !== 'UndoRedo.undo' && source !== 'UndoRedo.redo'){
        queueUndoRegistration('createCol', { index, amount, source });
      }
      triggerSchedule('afterCreateCol');
    };
    const afterRemoveRowBase = function(index, amount, physicalRows, source){
      if(hasGlobalUndo && source !== 'UndoRedo.undo' && source !== 'UndoRedo.redo'){
        queueUndoRegistration('removeRow', { index, amount, physicalRows, source });
      }
      triggerSchedule('afterRemoveRow');
    };
    const afterRemoveColBase = function(index, amount, physicalColumns, source){
      if(hasGlobalUndo && source !== 'UndoRedo.undo' && source !== 'UndoRedo.redo'){
        queueUndoRegistration('removeCol', { index, amount, physicalColumns, source });
      }
      triggerSchedule('afterRemoveCol');
    };
    const afterUndoBase = function(){ triggerSchedule('afterUndo'); };
    const afterRedoBase = function(){ triggerSchedule('afterRedo'); };
    const afterColumnMoveBase = function(_moved, _finalIndex, _dropIndex, _possible, orderChanged){
      if(orderChanged){
        if(hasGlobalUndo){
          queueUndoRegistration('columnMove', { finalIndex: _finalIndex, dropIndex: _dropIndex });
        }
        triggerSchedule('afterColumnMove');
      }else{
        console.debug('Debug: Shared.hot afterColumnMove ignored', { debugLabel, orderChanged });
      }
    };
    const afterPasteBase = function(data, coords){
      if(hasGlobalUndo){
        const rowCount = Array.isArray(data) ? data.length : 0;
        const colCount = rowCount > 0 && Array.isArray(data[0]) ? data[0].length : 0;
        queueUndoRegistration('paste', { rowCount, colCount, coords });
      }
      triggerSchedule('afterPaste', { dataLength: Array.isArray(data) ? data.length : 0, coords });
    };

    const afterContextMenuDefaultOptionsBase = function(defaultOptions){
      const items = defaultOptions?.items || defaultOptions;
      if(!items || typeof items !== 'object'){
        console.debug('Debug: Shared.hot context menu injection skipped', { debugLabel, hasItems: !!items });
        return;
      }
      if(items.paste_transpose){
        console.debug('Debug: Shared.hot context menu already contains transpose', { debugLabel });
        return;
      }
      const hasNavigatorClipboard = typeof navigator !== 'undefined' && !!(navigator?.clipboard && typeof navigator.clipboard.readText === 'function'); // eslint-disable-line no-undef
      items.paste_transpose = {
        name: 'Paste → Transposed',
        callback(){
          requestTransposePaste();
        },
        disabled(){
          const selection = instance?.getSelectedRangeLast?.() || null;
          const validSelection = !!selection;
          const hasClipboardData = hasNavigatorClipboard || !!clipboardCache;
          const disabledState = !(validSelection && hasClipboardData);
          console.debug('Debug: Shared.hot transpose disabled check', { debugLabel, validSelection, hasClipboardData, disabled: disabledState });
          return disabledState;
        }
      };
      console.debug('Debug: Shared.hot context menu transpose injected', { debugLabel });
    };

    const options = Object.assign({
      data: baseData,
      rowHeaders,
      colHeaders: true,
      minRows: rowCount,
      minCols: colCount,
      contextMenu: true,
      undo: true,
      licenseKey: 'non-commercial-and-evaluation',
      cells,
      columnSorting: columnSortingSettings
    }, otherHotOptions, {
      afterChange: wrapHook('afterChange', userAfterChange, afterChangeBase),
      afterCreateRow: wrapHook('afterCreateRow', userAfterCreateRow, afterCreateRowBase),
      afterCreateCol: wrapHook('afterCreateCol', userAfterCreateCol, afterCreateColBase),
      afterRemoveRow: wrapHook('afterRemoveRow', userAfterRemoveRow, afterRemoveRowBase),
      afterRemoveCol: wrapHook('afterRemoveCol', userAfterRemoveCol, afterRemoveColBase),
      afterUndo: wrapHook('afterUndo', userAfterUndo, afterUndoBase),
      afterRedo: wrapHook('afterRedo', userAfterRedo, afterRedoBase),
      afterColumnMove: wrapHook('afterColumnMove', userAfterColumnMove, afterColumnMoveBase),
      afterSelectionEnd: wrapHook('afterSelectionEnd', userAfterSelectionEnd, afterSelectionEndBase),
      afterScrollVertically: wrapHook('afterScrollVertically', userAfterScrollVertically, afterScrollVerticallyBase),
      afterScrollHorizontally: wrapHook('afterScrollHorizontally', userAfterScrollHorizontally, afterScrollHorizontallyBase),
      afterPaste: wrapHook('afterPaste', userAfterPaste, afterPasteBase),
      beforeColumnSort: wrapHook('beforeColumnSort', userBeforeColumnSort, beforeColumnSortBase),
      afterColumnSort: wrapHook('afterColumnSort', userAfterColumnSort, afterColumnSortBase),
      afterGetColHeader: wrapHook('afterGetColHeader', userAfterGetColHeader, afterGetColHeaderBase),
      afterContextMenuDefaultOptions: wrapHook('afterContextMenuDefaultOptions', userAfterContextMenuDefaultOptions, afterContextMenuDefaultOptionsBase)
    });

    console.debug('Debug: createStandardTable options prepared', { debugLabel, rowCount, colCount });
    instance = new Handsontable(container, options);
    baseOrderSnapshot = captureCurrentOrder();
    attachScrollHandler();
    scheduleRowGrowth('init');
    scheduleColGrowth('init');
    console.debug('Debug: createStandardTable created', { debugLabel });
    if(typeof overrides?.onCreate === 'function'){
      try{
        overrides.onCreate(instance);
      }catch(err){
        console.error('Shared.hot.createStandardTable onCreate error', err);
      }
    }
    return instance;
  }

  Shared.ensureHotWrapperStyles = ensureHotWrapperStyles;
  Shared.createEmptyData = createEmptyData;
  hotNS.ensureHotWrapperStyles = ensureHotWrapperStyles;
  hotNS.createEmptyData = createEmptyData;
  hotNS.createStandardTable = createStandardTable;
})(window);

