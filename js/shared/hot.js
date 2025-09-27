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

    let instance = null;
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

    const evaluateSelectionTail = ()=>{
      const localInstance = instance;
      if(!localInstance || typeof localInstance.getSelectedRangeLast !== 'function'){
        return null;
      }
      const range = localInstance.getSelectedRangeLast();
      if(!range){
        return null;
      }
      const tail = {
        row: Math.max(range.to?.row ?? -1, range.from?.row ?? -1),
        col: Math.max(range.to?.col ?? -1, range.from?.col ?? -1)
      };
      console.debug('Debug: autoGrow evaluateSelectionTail', { debugLabel, tail });
      return tail;
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
      const tail = evaluateSelectionTail();
      if(tail && tail.row >= 0){
        nearBySelection = (totalRows - 1 - tail.row) <= autoGrowthConfig.selectionThreshold;
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
      const tail = evaluateSelectionTail();
      if(tail && tail.col >= 0){
        nearBySelection = (totalCols - 1 - tail.col) <= autoGrowthConfig.selectionThreshold;
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

    const afterChangeBase = function(changes, source){
      if(!changes){
        return;
      }
      if(!scheduleOnLoadData && source === 'loadData'){
        console.debug('Debug: Shared.hot afterChange skipped loadData', { debugLabel, count: changes.length });
        return;
      }
      triggerSchedule('afterChange', { count: changes.length, source });
    };
    const afterCreateRowBase = function(){ triggerSchedule('afterCreateRow'); };
    const afterCreateColBase = function(){ triggerSchedule('afterCreateCol'); };
    const afterRemoveRowBase = function(){ triggerSchedule('afterRemoveRow'); };
    const afterRemoveColBase = function(){ triggerSchedule('afterRemoveCol'); };
    const afterUndoBase = function(){ triggerSchedule('afterUndo'); };
    const afterRedoBase = function(){ triggerSchedule('afterRedo'); };
    const afterColumnMoveBase = function(_moved, _finalIndex, _dropIndex, _possible, orderChanged){
      if(orderChanged){
        triggerSchedule('afterColumnMove');
      }else{
        console.debug('Debug: Shared.hot afterColumnMove ignored', { debugLabel, orderChanged });
      }
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
      cells
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
      afterScrollHorizontally: wrapHook('afterScrollHorizontally', userAfterScrollHorizontally, afterScrollHorizontallyBase)
    });

    console.debug('Debug: createStandardTable options prepared', { debugLabel, rowCount, colCount });
    instance = new Handsontable(container, options);
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

