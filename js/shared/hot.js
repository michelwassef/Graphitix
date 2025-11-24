// Shared helpers for Handsontable setup and wrapper sizing
// Exposes Shared.ensureHotWrapperStyles(wrapper) and Shared.createEmptyData(rows, cols)
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const hotNS = Shared.hot = Shared.hot || {};
  const MIN_INPUT_COLS = 12;
  const tabTablePools = hotNS.__tabTablePools = hotNS.__tabTablePools || {};
  const resolveActiveTabId = () => {
    try{
      const tab = global.Main?.session?.getActiveTab?.();
      return tab?.id || null;
    }catch(err){
      return null;
    }
  };
  hotNS.resolveActiveTabId = resolveActiveTabId;

  const EXCLUSION_SCOPES = Object.freeze({
    CELL: 'cell',
    ROW: 'row',
    COLUMN: 'column'
  });

  const noop = ()=>{};

  const appendClassName = (existing, cls)=>{
    if(!cls){
      return existing || '';
    }
    if(!existing){
      return cls;
    }
    const parts = new Set(String(existing).split(/\s+/).filter(Boolean));
    parts.add(cls);
    return Array.from(parts).join(' ');
  };

  const appendTitle = (existing, addition)=>{
    if(!addition){
      return existing || '';
    }
    if(!existing){
      return addition;
    }
    if(String(existing).includes(addition)){
      return existing;
    }
    return `${existing}\n${addition}`;
  };

  const toNumber = (value)=>{
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };

  const parseCellKey = (key)=>{
    if(typeof key !== 'string'){
      return { row: null, col: null };
    }
    const parts = key.split(':');
    if(parts.length !== 2){
      return { row: null, col: null };
    }
    return { row: Number(parts[0]), col: Number(parts[1]) };
  };

  function createExclusionController(instanceAccessor, debugLabel, scheduleChange){
    const rows = new Set();
    const cols = new Set();
    const cells = new Set();

    const getInstance = ()=>{
      const inst = typeof instanceAccessor === 'function' ? instanceAccessor() : null;
      return inst || null;
    };

    const schedule = (scope, payload)=>{
      if(typeof scheduleChange === 'function'){
        try{
          scheduleChange(scope, payload || {});
        }catch(err){
          console.error('Shared.hot exclusion schedule error', err);
        }
      }
    };

    const render = ()=>{
      const inst = getInstance();
      if(inst && typeof inst.render === 'function'){
        try{
          inst.render();
        }catch(err){
          console.error('Shared.hot exclusion render error', err);
        }
      }
    };

    const cellKey = (row, col)=>`${row}:${col}`;

    const normalizeIndex = (index)=>{
      const value = Number(index);
      return Number.isInteger(value) && value >= 0 ? value : null;
    };

    const exportCells = ()=>Array.from(cells).map(key=>{
      const { row, col } = parseCellKey(key);
      return [row, col];
    }).filter(pair=>pair.every(num=>Number.isInteger(num) && num >= 0));

    const updateSetBulk = (set, indices, exclude)=>{
      let changed = false;
      indices.forEach(idx=>{
        const normalized = normalizeIndex(idx);
        if(normalized === null){
          return;
        }
        if(exclude){
          if(!set.has(normalized)){
            set.add(normalized);
            changed = true;
          }
        }else if(set.delete(normalized)){
          changed = true;
        }
      });
      return changed;
    };

    const updateCellsBulk = (pairs, exclude)=>{
      let changed = false;
      pairs.forEach(pair=>{
        if(!pair){
          return;
        }
        const row = normalizeIndex(pair.row ?? pair[0]);
        const col = normalizeIndex(pair.col ?? pair[1]);
        if(row === null || col === null){
          return;
        }
        const key = cellKey(row, col);
        if(exclude){
          if(!cells.has(key)){
            cells.add(key);
            changed = true;
          }
        }else if(cells.delete(key)){
          changed = true;
        }
      });
      return changed;
    };

    const shiftSetForInsert = (set, index, amount)=>{
      if(!set.size || amount <= 0){
        return false;
      }
      const updated = new Set();
      let changed = false;
      set.forEach(value=>{
        if(value >= index){
          updated.add(value + amount);
          if(value + amount !== value){
            changed = true;
          }
        }else{
          updated.add(value);
        }
      });
      if(changed){
        set.clear();
        updated.forEach(v=>set.add(v));
      }
      return changed;
    };

    const shiftSetForRemoval = (set, removedIndices)=>{
      if(!set.size || !Array.isArray(removedIndices) || !removedIndices.length){
        return false;
      }
      const sorted = removedIndices.slice().map(toNumber).filter(num=>Number.isInteger(num) && num >= 0).sort((a,b)=>a-b);
      if(!sorted.length){
        return false;
      }
      const updated = new Set();
      let changed = false;
      set.forEach(value=>{
        let removed = false;
        let shift = 0;
        for(let i = 0; i < sorted.length; i++){
          const removedIdx = sorted[i];
          if(removedIdx === value){
            removed = true;
            changed = true;
            break;
          }
          if(removedIdx < value){
            shift += 1;
          }
        }
        if(!removed){
          const newValue = value - shift;
          if(newValue !== value){
            changed = true;
          }
          updated.add(newValue);
        }
      });
      if(changed){
        set.clear();
        updated.forEach(v=>set.add(v));
      }
      return changed;
    };

    const shiftCellsForInsert = (index, amount, axis)=>{
      if(!cells.size || amount <= 0){
        return false;
      }
      const updated = new Set();
      let changed = false;
      cells.forEach(key=>{
        const { row, col } = parseCellKey(key);
        if(!Number.isInteger(row) || !Number.isInteger(col)){
          return;
        }
        let nextRow = row;
        let nextCol = col;
        if(axis === 'row' && row >= index){
          nextRow = row + amount;
        }
        if(axis === 'col' && col >= index){
          nextCol = col + amount;
        }
        if(nextRow !== row || nextCol !== col){
          changed = true;
        }
        updated.add(cellKey(nextRow, nextCol));
      });
      if(changed){
        cells.clear();
        updated.forEach(key=>cells.add(key));
      }
      return changed;
    };

    const shiftCellsForRemoval = (removedIndices, axis)=>{
      if(!cells.size || !Array.isArray(removedIndices) || !removedIndices.length){
        return false;
      }
      const sorted = removedIndices.slice().map(toNumber).filter(num=>Number.isInteger(num) && num >= 0).sort((a,b)=>a-b);
      if(!sorted.length){
        return false;
      }
      const updated = new Set();
      let changed = false;
      cells.forEach(key=>{
        const { row, col } = parseCellKey(key);
        if(!Number.isInteger(row) || !Number.isInteger(col)){
          return;
        }
        let nextRow = row;
        let nextCol = col;
        let removed = false;
        if(axis === 'row'){
          let shift = 0;
          for(let i = 0; i < sorted.length; i++){
            const removedIdx = sorted[i];
            if(removedIdx === row){
              removed = true;
              changed = true;
              break;
            }
            if(removedIdx < row){
              shift += 1;
            }
          }
          if(!removed){
            nextRow = row - shift;
            if(nextRow !== row){
              changed = true;
            }
          }
        }else if(axis === 'col'){
          let shift = 0;
          for(let i = 0; i < sorted.length; i++){
            const removedIdx = sorted[i];
            if(removedIdx === col){
              removed = true;
              changed = true;
              break;
            }
            if(removedIdx < col){
              shift += 1;
            }
          }
          if(!removed){
            nextCol = col - shift;
            if(nextCol !== col){
              changed = true;
            }
          }
        }
        if(!removed){
          updated.add(cellKey(nextRow, nextCol));
        }
      });
      if(changed){
        cells.clear();
        updated.forEach(key=>cells.add(key));
      }
      return changed;
    };

    const controller = {
      markRows(indices, exclude){
        const changed = updateSetBulk(rows, indices, exclude);
        if(changed){
          console.debug('Debug: hot exclusion rows updated', { debugLabel, exclude, rows: Array.from(rows) });
          render();
          schedule(EXCLUSION_SCOPES.ROW, { exclude, indices: Array.from(indices || []) });
        }
      },
      markColumns(indices, exclude){
        const changed = updateSetBulk(cols, indices, exclude);
        if(changed){
          console.debug('Debug: hot exclusion columns updated', { debugLabel, exclude, cols: Array.from(cols) });
          render();
          schedule(EXCLUSION_SCOPES.COLUMN, { exclude, indices: Array.from(indices || []) });
        }
      },
      markCells(pairs, exclude){
        const changed = updateCellsBulk(pairs, exclude);
        if(changed){
          console.debug('Debug: hot exclusion cells updated', { debugLabel, exclude, cells: exportCells() });
          render();
          schedule(EXCLUSION_SCOPES.CELL, { exclude, pairs: exportCells() });
        }
      },
      isRowExcluded(physicalRow){
        const idx = normalizeIndex(physicalRow);
        return idx !== null && rows.has(idx);
      },
      isColumnExcluded(physicalCol){
        const idx = normalizeIndex(physicalCol);
        return idx !== null && cols.has(idx);
      },
      isCellExcluded(physicalRow, physicalCol){
        const rowIdx = normalizeIndex(physicalRow);
        const colIdx = normalizeIndex(physicalCol);
        if(rowIdx === null || colIdx === null){
          return false;
        }
        if(rows.has(rowIdx) || cols.has(colIdx)){
          return true;
        }
        return cells.has(cellKey(rowIdx, colIdx));
      },
      resolveCellState(physicalRow, physicalCol){
        const rowIdx = normalizeIndex(physicalRow);
        const colIdx = normalizeIndex(physicalCol);
        const fromRow = rowIdx !== null && rows.has(rowIdx);
        const fromCol = colIdx !== null && cols.has(colIdx);
        const fromCell = rowIdx !== null && colIdx !== null && cells.has(cellKey(rowIdx, colIdx));
        return { excluded: fromRow || fromCol || fromCell, fromRow, fromCol, fromCell };
      },
      clearAll(silent){
        const had = rows.size || cols.size || cells.size;
        if(had){
          rows.clear();
          cols.clear();
          cells.clear();
          console.debug('Debug: hot exclusion cleared', { debugLabel });
          render();
          if(!silent){
            schedule('clear', {});
          }
        }
      },
      exportState(){
        return {
          rows: Array.from(rows),
          cols: Array.from(cols),
          cells: exportCells()
        };
      },
      importState(payload){
        const nextRows = Array.isArray(payload?.rows) ? payload.rows : [];
        const nextCols = Array.isArray(payload?.cols) ? payload.cols : [];
        const nextCells = Array.isArray(payload?.cells) ? payload.cells : [];
        rows.clear();
        cols.clear();
        cells.clear();
        updateSetBulk(rows, nextRows, true);
        updateSetBulk(cols, nextCols, true);
        updateCellsBulk(nextCells.map(pair=>({ row: pair?.row ?? pair?.[0], col: pair?.col ?? pair?.[1] })), true);
        console.debug('Debug: hot exclusion imported', { debugLabel, rows: Array.from(rows), cols: Array.from(cols), cells: exportCells() });
        render();
        schedule('import', {});
      },
      shiftRowsForInsert(index, amount){
        const changedRows = shiftSetForInsert(rows, index, amount);
        const changedCells = shiftCellsForInsert(index, amount, 'row');
        if(changedRows || changedCells){
          console.debug('Debug: hot exclusion rows shifted for insert', { debugLabel, index, amount, rows: Array.from(rows) });
          render();
        }
      },
      shiftRowsForRemoval(physicalRows){
        const changedRows = shiftSetForRemoval(rows, physicalRows);
        const changedCells = shiftCellsForRemoval(physicalRows, 'row');
        if(changedRows || changedCells){
          console.debug('Debug: hot exclusion rows shifted for removal', { debugLabel, physicalRows, rows: Array.from(rows) });
          render();
        }
      },
      shiftColsForInsert(index, amount){
        const changedCols = shiftSetForInsert(cols, index, amount);
        const changedCells = shiftCellsForInsert(index, amount, 'col');
        if(changedCols || changedCells){
          console.debug('Debug: hot exclusion cols shifted for insert', { debugLabel, index, amount, cols: Array.from(cols) });
          render();
        }
      },
      shiftColsForRemoval(physicalCols){
        const changedCols = shiftSetForRemoval(cols, physicalCols);
        const changedCells = shiftCellsForRemoval(physicalCols, 'col');
        if(changedCols || changedCells){
          console.debug('Debug: hot exclusion cols shifted for removal', { debugLabel, physicalCols, cols: Array.from(cols) });
          render();
        }
      }
    };

    return controller;
  }

  function ensureHotWrapperStyles(wrapper){
    if(!wrapper){
      console.debug('Debug: ensureHotWrapperStyles skipped - no wrapper');
      return;
    }
    wrapper.style.overflow = 'auto';
    wrapper.style.width = '100%';
    wrapper.style.maxWidth = '100%';
    wrapper.style.minWidth = '0';
    wrapper.style.height = '100%';
    wrapper.style.flex = '1 1 auto';
    wrapper.style.flexShrink = '1';
    wrapper.style.minHeight = '0';
    wrapper.style.boxSizing = 'border-box';
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

  hotNS.mountTableForTab = function mountTableForTab(options){
    const {
      type,
      tabId,
      wrapper,
      templateContainer,
      createInstance
    } = options || {};
    if(!type || !tabId || !wrapper){
      console.debug('Debug: hot mountTableForTab skipped', {
        type,
        tabId,
        hasWrapper: !!wrapper
      });
      return null;
    }
    const pool = tabTablePools[type] = tabTablePools[type] || {
      byTab: {},
      currentTabId: null,
      template: null,
      initialClaimed: false
    };
    if(!pool.template && templateContainer){
      try{
        pool.template = templateContainer.cloneNode(false);
      }catch(err){
        console.error('hot mountTableForTab template clone error', err);
      }
    }
    if(pool.currentTabId && pool.currentTabId !== tabId){
      const currentEntry = pool.byTab[pool.currentTabId];
      if(currentEntry?.instance && typeof currentEntry.instance.suspendRender === 'function'){
        try{
          currentEntry.instance.suspendRender();
        }catch(err){
          console.error('hot mountTableForTab suspendRender error', { type, tabId: pool.currentTabId, err });
        }
      }
      if(currentEntry && currentEntry.container && currentEntry.container.parentNode === wrapper){
        wrapper.removeChild(currentEntry.container);
      }
    }
    let entry = pool.byTab[tabId];
    if(entry && entry.container){
      if(entry.container.parentNode !== wrapper){
        // detach from previous parent before reattaching
        if(entry.container.parentNode){
          entry.container.parentNode.removeChild(entry.container);
        }
        wrapper.appendChild(entry.container);
      }
      pool.currentTabId = tabId;
      if(entry.instance && !entry.creating){
        const resume = entry.instance.resumeRender || entry.instance.render;
        if(typeof resume === 'function'){
          const schedule = global.requestAnimationFrame || global.setTimeout;
          schedule(() => {
            try{
              resume.call(entry.instance);
            }catch(err){
              console.error('hot mountTableForTab resumeRender error', { type, tabId, err });
            }
          }, 0);
        }
      }
      return entry;
    }
    let container = null;
    if(!pool.initialClaimed && templateContainer && templateContainer.parentNode){
      container = templateContainer;
      pool.initialClaimed = true;
    }else if(pool.template){
      try{
        container = pool.template.cloneNode(false);
      }catch(err){
        console.error('hot mountTableForTab clone error', err);
      }
    }
    if(!container){
      container = document.createElement('div');
    }
    if(!container.id && templateContainer?.id){
      container.id = templateContainer.id;
    }
    if(container.parentNode !== wrapper){
      if(container.parentNode){
        container.parentNode.removeChild(container);
      }
      // avoid appending a parent into its own descendant
      if(container !== wrapper && !wrapper.contains(container)){
        wrapper.appendChild(container);
      }
    }
    // mark entry before instantiation to guard against re-entrant calls
    entry = pool.byTab[tabId] = { container, instance: null, creating: true };
    pool.currentTabId = tabId;
    const instance = typeof createInstance === 'function' ? createInstance(container) : null;
    entry.instance = instance;
    if(instance && typeof instance.resumeRender === 'function'){
      try{
        instance.resumeRender();
      }catch(err){
        console.error('hot mountTableForTab resumeRender error', { type, tabId, err });
      }
    }
    delete entry.creating;
    return entry;
  };

  hotNS.ensureTableForTab = function ensureTableForTab(options){
    const {
      type,
      tabId: explicitTabId,
      wrapper,
      container,
      createInstance
    } = options || {};
    const tabId = explicitTabId || resolveActiveTabId() || `${type || 'hot'}-default`;
    if(typeof hotNS.mountTableForTab !== 'function' || !wrapper){
      const instance = typeof createInstance === 'function' ? createInstance(container) : null;
      return { instance, container, tabId };
    }
    const entry = hotNS.mountTableForTab({
      type: type || 'hot',
      tabId,
      wrapper,
      templateContainer: container,
      createInstance
    });
    return entry || { instance: null, container, tabId };
  };

  hotNS.ensureStandardTableForTab = function ensureStandardTableForTab(options){
    const {
      type,
      tabId,
      wrapper,
      container,
      dimensions,
      scheduleDraw,
      overrides
    } = options || {};
    const createInstance = targetContainer => hotNS.createStandardTable(targetContainer, dimensions, scheduleDraw, overrides);
    return hotNS.ensureTableForTab({
      type,
      tabId,
      wrapper,
      container,
      createInstance
    });
  };

  function createStandardTable(container, dimensions, scheduleDraw, overrides){
    const debugLabel = overrides?.debugLabel || container?.id || 'hot';
    console.debug('Debug: createStandardTable entry', { debugLabel, containerId: container?.id || null });
    if(!container){
      console.warn('Shared.hot.createStandardTable missing container', { debugLabel });
      return null;
    }
    const Handsontable = global.Handsontable || globalThis.Handsontable;
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
    const preserveExclusionsOnLoad = overrides?.preserveExclusionsOnLoad === true;
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
      afterLoadData: userAfterLoadData,
      afterSelectionEnd: userAfterSelectionEnd,
      afterScrollVertically: userAfterScrollVertically,
      afterScrollHorizontally: userAfterScrollHorizontally,
      afterPaste: userAfterPaste,
      afterCopy: userAfterCopy,
      beforeKeyDown: userBeforeKeyDown,
      beforeAutofill: userBeforeAutofill,
      beforeColumnSort: userBeforeColumnSort,
      afterColumnSort: userAfterColumnSort,
      afterGetColHeader: userAfterGetColHeader,
      afterGetRowHeader: userAfterGetRowHeader,
      afterRender: userAfterRender,
      afterContextMenuDefaultOptions: userAfterContextMenuDefaultOptions,
      columnSorting: userColumnSorting,
      colWidths: userColWidths,
      colWidth: userColWidth,
      ...otherHotOptions
    } = hotOptions;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const performanceDefaults = {
      autoRowSize: hotOptions.autoRowSize ?? false,
      autoColumnSize: hotOptions.autoColumnSize ?? false,
      renderAllRows: hotOptions.renderAllRows ?? false,
      viewportRowRenderingOffset: hotOptions.viewportRowRenderingOffset ?? clamp(30, 6, 40),
      viewportColumnRenderingOffset: hotOptions.viewportColumnRenderingOffset ?? clamp(8, 4, 16),
      preventOverflow: hotOptions.preventOverflow ?? 'vertical',
      rowHeights: hotOptions.rowHeights ?? hotOptions.rowHeight ?? 22,
      colWidths: hotOptions.colWidths ?? hotOptions.colWidth ?? undefined
    };

    const hotDebugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
    const hotDebug = (message, payload) => {
      if(!hotDebugEnabled){ return; }
      if(typeof payload === 'undefined'){
        console.debug(message);
      }else{
        console.debug(message, payload);
      }
    };

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

    let instance = null;
    const userColWidthOption = typeof userColWidths !== 'undefined' ? userColWidths : userColWidth;
    const resolveUserColWidth = (colIndex)=>{
      const source = userColWidthOption;
      if(typeof source === 'function'){
        try{
          const value = source(colIndex);
          const numeric = toNumber(value);
          return numeric > 0 ? numeric : null;
        }catch(err){
          console.error('Shared.hot colWidth resolver error', err);
          return null;
        }
      }
      if(Array.isArray(source)){
        const numeric = toNumber(source[colIndex]);
        return numeric > 0 ? numeric : null;
      }
      const numeric = toNumber(source);
      return numeric > 0 ? numeric : null;
    };

    // Lazily derive column widths from the first-row header text to avoid scanning large datasets.
    const headerWidthManager = (function(){
      const cache = new Map();
      let headerRowRef = treatFirstRowAsHeader && Array.isArray(baseData) ? baseData[0] : null;
      const canvas = typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : null;
      const ctx = typeof canvas?.getContext === 'function' ? canvas.getContext('2d') : null;
      let resolvedFont = null;
      const MIN_HEADER_COL_WIDTH = Math.max(60, resolveUserColWidth(-1) || 0);
      const MAX_HEADER_COL_WIDTH = Math.max(MIN_HEADER_COL_WIDTH, 420);
      const HEADER_PADDING = 28;

      const resolveFont = ()=>{
        if(resolvedFont){
          return resolvedFont;
        }
        try{
          const source = container || document.body;
          const style = source ? global.getComputedStyle(source) : null;
          const fontSize = style?.fontSize || '12px';
          const fontFamily = style?.fontFamily || 'Arial, sans-serif';
          const fontWeight = style?.fontWeight || '400';
          resolvedFont = `${fontWeight} ${fontSize} ${fontFamily}`;
        }catch(err){
          resolvedFont = '12px Arial, sans-serif';
        }
        return resolvedFont;
      };

      const measure = (text)=>{
        const value = text || '';
        if(ctx && typeof ctx.measureText === 'function'){
          try{
            ctx.font = resolveFont();
            const metrics = ctx.measureText(value);
            if(metrics && Number.isFinite(metrics.width)){
              return metrics.width;
            }
          }catch(err){
            console.error('Shared.hot header width measure error', err);
          }
        }
        return value.length * 8;
      };

      const getHeaderText = (colIndex)=>{
        if(!treatFirstRowAsHeader){
          return '';
        }
        if(instance && typeof instance.getDataAtCell === 'function'){
          try{
            const value = instance.getDataAtCell(0, colIndex);
            return value == null ? '' : String(value);
          }catch(err){
            console.error('Shared.hot header width cell read error', err);
          }
        }
        if(Array.isArray(headerRowRef)){
          const value = headerRowRef[colIndex];
          return value == null ? '' : String(value);
        }
        return '';
      };

      const normalizeText = (value)=>{
        if(value === null || typeof value === 'undefined'){
          return '';
        }
        const text = String(value);
        return text.length > 120 ? text.slice(0, 120) : text;
      };

      const getWidth = (colIndex)=>{
        if(!Number.isInteger(colIndex) || colIndex < 0){
          return resolveUserColWidth(colIndex) || MIN_HEADER_COL_WIDTH;
        }
        if(cache.has(colIndex)){
          return cache.get(colIndex);
        }
        const userWidth = resolveUserColWidth(colIndex) || 0;
        const headerText = normalizeText(getHeaderText(colIndex));
        const measured = measure(headerText);
        const minWidth = Math.max(MIN_HEADER_COL_WIDTH, userWidth);
        const computed = clamp(Math.ceil(measured + HEADER_PADDING), minWidth, MAX_HEADER_COL_WIDTH);
        cache.set(colIndex, computed);
        hotDebug('Debug: Shared.hot header width computed', { debugLabel, col: colIndex, width: computed, textLength: headerText.length });
        return computed;
      };

      const invalidateColumns = (cols)=>{
        if(!cols || !cols.length){
          return;
        }
        cols.forEach(colIndex => cache.delete(colIndex));
      };

      const reset = ()=>{
        cache.clear();
      };

      const setHeaderRowRef = (rowRef)=>{
        headerRowRef = Array.isArray(rowRef) ? rowRef : null;
      };

      return {
        getWidth,
        invalidateColumns,
        reset,
        setHeaderRowRef
      };
    })();

    const resolveColumnWidth = function(colIndex){
      return headerWidthManager.getWidth(colIndex);
    };

    let pendingHeaderWidthSync = null;
    const scheduleHeaderWidthRefresh = function(reason){
      if(!treatFirstRowAsHeader){
        return;
      }
      if(!instance || typeof instance.updateSettings !== 'function'){
        hotDebug('Debug: Shared.hot header width refresh skipped', { debugLabel, reason, hasInstance: !!instance });
        return;
      }
      if(pendingHeaderWidthSync){
        return;
      }
      pendingHeaderWidthSync = raf(()=>{
        pendingHeaderWidthSync = null;
        try{
          if(instance){
            if(typeof instance.forceFullRender !== 'undefined'){
              instance.forceFullRender = true;
            }
            instance.updateSettings({ colWidths: resolveColumnWidth }, false);
            if(typeof instance.render === 'function'){
              instance.render();
            }
            hotDebug('Debug: Shared.hot header widths refreshed', { debugLabel, reason });
          }
        }catch(err){
          console.error('Shared.hot header width refresh error', err);
        }
      });
      hotDebug('Debug: Shared.hot header width refresh scheduled', { debugLabel, reason });
    };

    const baseMinRows = Math.max(rowCount, 0);
    const baseMinCols = Math.max(colCount, MIN_INPUT_COLS);

    const resolveMatrixSize = (matrix)=>{
      if(!Array.isArray(matrix)){
        return { rows: 0, cols: 0 };
      }
      let cols = 0;
      for(let r = 0; r < matrix.length; r++){
        const row = matrix[r];
        if(Array.isArray(row)){
          cols = Math.max(cols, row.length);
        }
      }
      return { rows: matrix.length, cols };
    };

    const enforceMinDimensions = (matrix)=>{
      if(!instance || typeof instance.updateSettings !== 'function'){
        return;
      }
      const { rows, cols } = resolveMatrixSize(matrix);
      const targetMinRows = Math.max(baseMinRows, rows);
      const targetMinCols = Math.max(baseMinCols, cols);
      const settings = typeof instance.getSettings === 'function' ? instance.getSettings() : null;
      const currentMinRows = settings?.minRows;
      const currentMinCols = settings?.minCols;
      if(currentMinRows !== targetMinRows || currentMinCols !== targetMinCols){
        instance.updateSettings({ minRows: targetMinRows, minCols: targetMinCols });
        console.debug('Debug: Shared.hot min dimensions enforced', { debugLabel, targetMinRows, targetMinCols });
      }
    };

    const copyHighlightState = {
      overlay: null,
      range: null,
      color: null
    };

    const selectionState = {
      lastRange: null
    };

    const triggerSchedule = (reason, payload)=>{
      if(!scheduleFn){
        console.debug('Debug: Shared.hot schedule skipped', { debugLabel, reason });
        return;
      }
      console.debug('Debug: Shared.hot schedule triggered', { debugLabel, reason, payload: payload || null });
      scheduleFn();
    };

    console.debug('Debug: Shared.hot firstRowMode', { debugLabel, firstRowIsHeader: treatFirstRowAsHeader }); // Debug: header mode flag

    const exclusionController = createExclusionController(()=>instance, debugLabel, (scope, payload)=>{
      triggerSchedule('exclusionChanged', Object.assign({ scope }, payload || {}));
    });

    const rowHeaders = function(index){
      const defaultLabel = treatFirstRowAsHeader ? (index === 0 ? '' : index) : (index + 1);
      const value = typeof userRowHeaders === 'function' ? userRowHeaders.call(this, index) : defaultLabel;
      hotDebug('Debug: Shared.hot rowHeader', { debugLabel, index, label: value });
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
      const inst = this || instance;
      const toPhysicalRow = typeof inst?.toPhysicalRow === 'function' ? inst.toPhysicalRow.bind(inst) : null;
      const toPhysicalCol = typeof inst?.toPhysicalColumn === 'function' ? inst.toPhysicalColumn.bind(inst) : null;
      const physicalRow = toPhysicalRow ? toPhysicalRow(row) : row;
      const physicalCol = toPhysicalCol ? toPhysicalCol(col) : col;
      const cellState = exclusionController.resolveCellState(physicalRow, physicalCol);
      if(cellState.excluded){
        const titleParts = [];
        props.className = appendClassName(props.className, 'hot-cell-excluded');
        if(cellState.fromRow){
          props.className = appendClassName(props.className, 'hot-cell-excluded-row');
          titleParts.push('row');
        }
        if(cellState.fromCol){
          props.className = appendClassName(props.className, 'hot-cell-excluded-column');
          titleParts.push('column');
        }
        if(cellState.fromCell){
          props.className = appendClassName(props.className, 'hot-cell-excluded-cell');
          titleParts.push('cell');
        }
        const titleSuffix = titleParts.length ? ` (${titleParts.join(', ')})` : '';
        props.title = appendTitle(props.title, `Excluded from analysis${titleSuffix}`);
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

    const normalizeRange = (range)=>{
      if(!range){
        return null;
      }
      const start = range.from || range.highlight || range.start || range;
      const end = range.to || range.end || range;
      if(!start || !end){
        return null;
      }
      const startRow = Number.isInteger(start.row) ? start.row : null;
      const startCol = Number.isInteger(start.col) ? start.col : null;
      const endRow = Number.isInteger(end.row) ? end.row : null;
      const endCol = Number.isInteger(end.col) ? end.col : null;
      if(startRow === null || startCol === null || endRow === null || endCol === null){
        return null;
      }
      const rowStart = Math.min(startRow, endRow);
      const rowEnd = Math.max(startRow, endRow);
      const colStart = Math.min(startCol, endCol);
      const colEnd = Math.max(startCol, endCol);
      return { from: { row: rowStart, col: colStart }, to: { row: rowEnd, col: colEnd } };
    };

    const rangesEqual = (a, b)=>{
      if(!a || !b){
        return false;
      }
      return a.from.row === b.from.row && a.from.col === b.from.col && a.to.row === b.to.row && a.to.col === b.to.col;
    };

    const getHotRootElement = ()=>{
      if(instance?.rootElement){
        return instance.rootElement;
      }
      if(container?.classList?.contains('handsontable')){
        return container;
      }
      return container?.querySelector?.('.handsontable') || null;
    };

    const applyCopyHighlightColor = ()=>{
      if(!copyHighlightState.overlay){
        return;
      }
      let color = copyHighlightState.color;
      const root = getHotRootElement();
      if(root && typeof global.getComputedStyle === 'function'){
        const borderEl = root.querySelector?.('.wtBorder.current');
        if(borderEl){
          const computed = global.getComputedStyle(borderEl);
          const resolvedColor = computed?.borderTopColor || computed?.borderLeftColor || computed?.borderColor;
          if(resolvedColor && resolvedColor !== 'transparent'){
            color = resolvedColor;
            copyHighlightState.color = resolvedColor;
          }
        }
      }
      if(color){
        copyHighlightState.overlay.style.borderColor = color;
      }
    };

    const ensureCopyHighlightOverlay = ()=>{
      if(copyHighlightState.overlay && copyHighlightState.overlay.isConnected){
        return copyHighlightState.overlay;
      }
      if(typeof document === 'undefined'){
        return null;
      }
      const root = getHotRootElement();
      const hider = root?.querySelector?.('.ht_master .wtHider');
      if(!hider){
        console.debug('Debug: Shared.hot copyHighlight overlay unavailable', { debugLabel, hasRoot: !!root });
        return null;
      }
      const overlay = document.createElement('div');
      overlay.className = 'hot-copy-highlight';
      overlay.style.display = 'none';
      hider.appendChild(overlay);
      copyHighlightState.overlay = overlay;
      applyCopyHighlightColor();
      console.debug('Debug: Shared.hot copyHighlight overlay created', { debugLabel });
      return overlay;
    };

    const clearCopyHighlightRange = (reason)=>{
      const details = {
        debugLabel,
        reason: reason || 'unspecified'
      };
      if(copyHighlightState.range || (copyHighlightState.overlay && copyHighlightState.overlay.style.display !== 'none')){
        console.debug('Debug: Shared.hot copyHighlight cleared', details);
      }
      copyHighlightState.range = null;
      if(copyHighlightState.overlay){
        copyHighlightState.overlay.style.display = 'none';
      }
    };

    const refreshCopyHighlightPosition = ()=>{
      const range = copyHighlightState.range;
      if(!range){
        return;
      }
      const inst = instance;
      if(!inst || typeof inst.getCell !== 'function'){
        return;
      }
      const overlay = ensureCopyHighlightOverlay();
      const root = getHotRootElement();
      const hider = root?.querySelector?.('.ht_master .wtHider');
      if(!overlay || !hider){
        return;
      }
      const topLeftCell = inst.getCell(range.from.row, range.from.col, true);
      const bottomRightCell = inst.getCell(range.to.row, range.to.col, true);
      if(!topLeftCell || !bottomRightCell){
        overlay.style.display = 'none';
        console.debug('Debug: Shared.hot copyHighlight refresh skipped - missing cells', { debugLabel, range });
        return;
      }
      const hiderRect = hider.getBoundingClientRect();
      const topLeftRect = topLeftCell.getBoundingClientRect();
      const bottomRightRect = bottomRightCell.getBoundingClientRect();
      overlay.style.display = 'block';
      overlay.style.left = `${topLeftRect.left - hiderRect.left}px`;
      overlay.style.top = `${topLeftRect.top - hiderRect.top}px`;
      overlay.style.width = `${bottomRightRect.right - topLeftRect.left}px`;
      overlay.style.height = `${bottomRightRect.bottom - topLeftRect.top}px`;
      applyCopyHighlightColor();
    };

    const setCopyHighlightRange = (range)=>{
      if(!range){
        clearCopyHighlightRange('setCopyHighlightRange:empty');
        return;
      }
      copyHighlightState.range = range;
      if(ensureCopyHighlightOverlay()){
        refreshCopyHighlightPosition();
        console.debug('Debug: Shared.hot copyHighlight activated', { debugLabel, range });
      }
    };

    const parseTrailingNumber = (value)=>{
      if(value === null || typeof value === 'undefined'){
        return null;
      }
      const text = String(value);
      const match = text.match(/^(.*?)(-?\d+)$/);
      if(!match){
        return null;
      }
      const numericText = match[2];
      const numericValue = Number(numericText);
      if(Number.isNaN(numericValue) || !Number.isFinite(numericValue)){
        return null;
      }
      const unsignedText = numericText.startsWith('-') ? numericText.slice(1) : numericText;
      const digits = unsignedText.length || 1;
      const hasLeadingZeros = unsignedText.length > 1 && unsignedText.startsWith('0');
      return {
        prefix: match[1],
        numericValue,
        digits,
        hasLeadingZeros
      };
    };

    const formatAutofillValue = (parsed, offset)=>{
      const value = parsed.numericValue + offset;
      if(value < 0){
        return `${parsed.prefix}${value}`;
      }
      if(parsed.hasLeadingZeros){
        const padded = String(value).padStart(parsed.digits, '0');
        return `${parsed.prefix}${padded}`;
      }
      return `${parsed.prefix}${value}`;
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
      if(instance && typeof instance.getSelectedRangeLast === 'function'){
        const selection = instance.getSelectedRangeLast();
        const normalized = normalizeRange(selection);
        selectionState.lastRange = normalized;
        console.debug('Debug: Shared.hot selection updated', { debugLabel, selection: normalized });
        if(copyHighlightState.range){
          refreshCopyHighlightPosition();
          if(normalized && !rangesEqual(copyHighlightState.range, normalized)){
            console.debug('Debug: Shared.hot copyHighlight persisted across selection change', {
              debugLabel,
              copyRange: copyHighlightState.range,
              newSelection: normalized
            });
          }
        }
      }else{
        selectionState.lastRange = null;
        if(copyHighlightState.range){
          clearCopyHighlightRange('afterSelectionEnd:noInstance');
        }
      }
    };

    const afterScrollVerticallyBase = function(){
      if(autoGrowthConfig.enabled){
        console.debug('Debug: autoGrow afterScrollVerticallyBase invoked', { debugLabel, args: Array.from(arguments) });
        scheduleRowGrowth('afterScrollVertically');
      }
      if(copyHighlightState.range){
        refreshCopyHighlightPosition();
      }
    };

    const afterScrollHorizontallyBase = function(){
      if(autoGrowthConfig.enabled){
        console.debug('Debug: autoGrow afterScrollHorizontallyBase invoked', { debugLabel, args: Array.from(arguments) });
        scheduleColGrowth('afterScrollHorizontally');
      }
      if(copyHighlightState.range){
        refreshCopyHighlightPosition();
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
      const physicalCol = typeof instance?.toPhysicalColumn === 'function' ? instance.toPhysicalColumn(col) : col;
      const colExcluded = exclusionController.isColumnExcluded(physicalCol);
      if(colExcluded){
        TH.classList.add('hot-header-excluded');
        TH.classList.add('hot-column-header-excluded');
        TH.title = appendTitle(TH.title || TH.getAttribute('title') || '', 'Excluded from analysis (column)');
      }else{
        TH.classList.remove('hot-header-excluded');
        TH.classList.remove('hot-column-header-excluded');
      }
      try{
        if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
          return;
        }
      }catch(err){ /* ignore */ }
      console.debug('Debug: Shared.hot afterGetColHeaderBase applied', { debugLabel, column: col, order, headerLabel });
    };

    const afterGetRowHeaderBase = function(row, TH){
      if(!TH || typeof row !== 'number' || row < 0){
        return;
      }
      const physicalRow = typeof instance?.toPhysicalRow === 'function' ? instance.toPhysicalRow(row) : row;
      const rowExcluded = exclusionController.isRowExcluded(physicalRow);
      if(rowExcluded){
        TH.classList.add('hot-header-excluded');
        TH.classList.add('hot-row-header-excluded');
        TH.title = appendTitle(TH.title || TH.getAttribute('title') || '', 'Excluded from analysis (row)');
      }else{
        TH.classList.remove('hot-header-excluded');
        TH.classList.remove('hot-row-header-excluded');
      }
      try{
        if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
          return;
        }
      }catch(err){ /* ignore */ }
      hotDebug('Debug: Shared.hot afterGetRowHeaderBase applied', { debugLabel, row, rowExcluded });
    };

    const afterChangeBase = function(changes, source){
      if(!changes){
        return;
      }
      if(!scheduleOnLoadData && source === 'loadData'){
        console.debug('Debug: Shared.hot afterChange skipped loadData', { debugLabel, count: changes.length });
        return;
      }
      if(copyHighlightState.range && source === 'CopyPaste.paste'){
        console.debug('Debug: Shared.hot afterChange clearing copy highlight for paste', {
          debugLabel,
          count: changes.length
        });
        clearCopyHighlightRange('afterChange:paste');
      }
      if(treatFirstRowAsHeader){
        const headerCols = new Set();
        for(let i = 0; i < changes.length; i++){
          const change = changes[i];
          if(!Array.isArray(change)){
            continue;
          }
          const changeRow = Number(change[0]);
          if(changeRow !== 0){
            continue;
          }
          const changeCol = Number(change[1]);
          if(Number.isInteger(changeCol) && changeCol >= 0){
            headerCols.add(changeCol);
          }
        }
        if(headerCols.size){
          headerWidthManager.invalidateColumns(headerCols);
          scheduleHeaderWidthRefresh('headerChange');
        }
      }
      if(hasGlobalUndo && source !== 'loadData' && source !== 'UndoRedo.undo' && source !== 'UndoRedo.redo'){
        queueUndoRegistration('change', { count: changes.length, source });
      }
      triggerSchedule('afterChange', { count: changes.length, source });
    };
    const afterCreateRowBase = function(index, amount, source){
      exclusionController.shiftRowsForInsert(index, amount);
      if(hasGlobalUndo && source !== 'UndoRedo.undo' && source !== 'UndoRedo.redo'){
        queueUndoRegistration('createRow', { index, amount, source });
      }
      triggerSchedule('afterCreateRow');
    };
    const afterCreateColBase = function(index, amount, source){
      exclusionController.shiftColsForInsert(index, amount);
      if(hasGlobalUndo && source !== 'UndoRedo.undo' && source !== 'UndoRedo.redo'){
        queueUndoRegistration('createCol', { index, amount, source });
      }
      headerWidthManager.reset();
      scheduleHeaderWidthRefresh('afterCreateCol');
      triggerSchedule('afterCreateCol');
    };
    const afterRemoveRowBase = function(index, amount, physicalRows, source){
      if(Array.isArray(physicalRows)){
        exclusionController.shiftRowsForRemoval(physicalRows);
      }
      if(hasGlobalUndo && source !== 'UndoRedo.undo' && source !== 'UndoRedo.redo'){
        queueUndoRegistration('removeRow', { index, amount, physicalRows, source });
      }
      triggerSchedule('afterRemoveRow');
    };
    const afterRemoveColBase = function(index, amount, physicalColumns, source){
      if(Array.isArray(physicalColumns)){
        exclusionController.shiftColsForRemoval(physicalColumns);
      }
      if(hasGlobalUndo && source !== 'UndoRedo.undo' && source !== 'UndoRedo.redo'){
        queueUndoRegistration('removeCol', { index, amount, physicalColumns, source });
      }
      headerWidthManager.reset();
      scheduleHeaderWidthRefresh('afterRemoveCol');
      triggerSchedule('afterRemoveCol');
    };
    const afterUndoBase = function(){ triggerSchedule('afterUndo'); };
    const afterRedoBase = function(){ triggerSchedule('afterRedo'); };
    const afterColumnMoveBase = function(_moved, _finalIndex, _dropIndex, _possible, orderChanged){
      if(orderChanged){
        if(hasGlobalUndo){
          queueUndoRegistration('columnMove', { finalIndex: _finalIndex, dropIndex: _dropIndex });
        }
        headerWidthManager.reset();
        scheduleHeaderWidthRefresh('afterColumnMove');
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
      clearCopyHighlightRange('afterPaste');
    };

    const afterCopyBase = function(_data, coords){
      if(instance && typeof instance.getSelectedRangeLast === 'function'){
        const selection = instance.getSelectedRangeLast();
        const normalized = normalizeRange(selection);
        selectionState.lastRange = normalized;
        if(normalized){
          setCopyHighlightRange(normalized);
        }else{
          clearCopyHighlightRange('afterCopy:noSelection');
        }
        console.debug('Debug: Shared.hot afterCopyBase processed', { debugLabel, coords, selection: normalized });
      }else{
        console.debug('Debug: Shared.hot afterCopyBase skipped - no selection', { debugLabel, hasInstance: !!instance });
      }
    };

    const beforeKeyDownBase = function(event){
      const key = event?.key || '';
      const keyCode = typeof event?.keyCode === 'number' ? event.keyCode : null;
      const isEnter = key === 'Enter' || key === 'NumpadEnter' || keyCode === 13;
      if(isEnter && copyHighlightState.range){
        console.debug('Debug: Shared.hot beforeKeyDown clearing copy highlight for Enter', {
          debugLabel,
          key,
          keyCode
        });
        clearCopyHighlightRange('beforeKeyDown:enter');
      }
    };

    const beforeAutofillBase = function(selectionData, selectionRange, targetRange, direction){
      if(!Array.isArray(selectionData) || selectionData.length === 0){
        return selectionData;
      }
      const normalizedSelection = normalizeRange(selectionRange);
      const normalizedTarget = normalizeRange(targetRange);
      if(!normalizedSelection || !normalizedTarget){
        return selectionData;
      }
      const selectionHeight = normalizedSelection.to.row - normalizedSelection.from.row + 1;
      const selectionWidth = normalizedSelection.to.col - normalizedSelection.from.col + 1;
      const targetHeight = normalizedTarget.to.row - normalizedTarget.from.row + 1;
      const targetWidth = normalizedTarget.to.col - normalizedTarget.from.col + 1;
      const expands = targetHeight > selectionHeight || targetWidth > selectionWidth;
      if(!expands){
        return selectionData;
      }
      if(selectionHeight !== 1 || selectionWidth !== 1){
        console.debug('Debug: Shared.hot beforeAutofillBase skipped - multi-cell seed', { debugLabel, selectionHeight, selectionWidth, direction });
        return selectionData;
      }
      const row = selectionData[0];
      const baseValue = Array.isArray(row) ? row[0] : row;
      const parsed = parseTrailingNumber(baseValue);
      const isVertical = direction === 'up' || direction === 'down';
      const isHorizontal = direction === 'left' || direction === 'right';
      if(!parsed || (!isVertical && !isHorizontal)){
        console.debug('Debug: Shared.hot beforeAutofillBase skipped - unsupported seed', { debugLabel, baseValue, direction });
        return selectionData;
      }
      const result = [];
      for(let r = 0; r < targetHeight; r++){
        const rowValues = [];
        for(let c = 0; c < targetWidth; c++){
          const actualRow = normalizedTarget.from.row + r;
          const actualCol = normalizedTarget.from.col + c;
          const offset = isVertical ? (actualRow - normalizedSelection.from.row) : (actualCol - normalizedSelection.from.col);
          rowValues.push(formatAutofillValue(parsed, offset));
        }
        result.push(rowValues);
      }
      console.debug('Debug: Shared.hot beforeAutofillBase applied', {
        debugLabel,
        direction,
        startValue: parsed.numericValue,
        targetHeight,
        targetWidth
      });
      return result;
    };

    const afterRenderBase = function(){
      if(copyHighlightState.range){
        refreshCopyHighlightPosition();
        console.debug('Debug: Shared.hot afterRenderBase refreshed copy highlight', { debugLabel, range: copyHighlightState.range });
      }
    };

    const afterLoadDataBase = function(_sourceData, initialLoad){
      enforceMinDimensions(_sourceData);
      if(!preserveExclusionsOnLoad && !initialLoad){
        exclusionController.clearAll(true);
        console.debug('Debug: Shared.hot afterLoadData cleared exclusions', { debugLabel });
      }
      if(treatFirstRowAsHeader){
        const headerRow = Array.isArray(_sourceData?.[0]) ? _sourceData[0] : null;
        headerWidthManager.setHeaderRowRef(headerRow);
        headerWidthManager.reset();
        scheduleHeaderWidthRefresh(initialLoad ? 'loadData:init' : 'loadData');
      }
      if(scheduleOnLoadData || !initialLoad){
        triggerSchedule('afterLoadData');
      }
      clearCopyHighlightRange('afterLoadData');
    };

    const collectSelectionDetails = ()=>{
      const inst = instance;
      if(!inst || typeof inst.getSelectedRangeLast !== 'function'){
        console.debug('Debug: Shared.hot collectSelectionDetails missing instance or selection', { debugLabel });
        return null;
      }
      const selection = inst.getSelectedRangeLast();
      if(!selection){
        console.debug('Debug: Shared.hot collectSelectionDetails no selection', { debugLabel });
        return null;
      }
      const from = selection.from || selection.highlight || selection.start || selection;
      const to = selection.to || selection.end || selection;
      if(!from || !to){
        console.debug('Debug: Shared.hot collectSelectionDetails invalid selection object', { debugLabel });
        return null;
      }
      const rowStart = Math.min(from.row, to.row);
      const rowEnd = Math.max(from.row, to.row);
      const colStart = Math.min(from.col, to.col);
      const colEnd = Math.max(from.col, to.col);
      const visualRows = [];
      const visualCols = [];
      const physicalRows = new Set();
      const physicalCols = new Set();
      const physicalPairs = [];
      let hasExcluded = false;
      let hasIncluded = false;
      for(let row = rowStart; row <= rowEnd; row++){
        visualRows.push(row);
        const physicalRow = typeof inst.toPhysicalRow === 'function' ? inst.toPhysicalRow(row) : row;
        if(Number.isInteger(physicalRow) && physicalRow >= 0){
          physicalRows.add(physicalRow);
        }
      }
      for(let col = colStart; col <= colEnd; col++){
        visualCols.push(col);
        const physicalCol = typeof inst.toPhysicalColumn === 'function' ? inst.toPhysicalColumn(col) : col;
        if(Number.isInteger(physicalCol) && physicalCol >= 0){
          physicalCols.add(physicalCol);
        }
      }
      for(let row = rowStart; row <= rowEnd; row++){
        const physicalRow = typeof inst.toPhysicalRow === 'function' ? inst.toPhysicalRow(row) : row;
        if(!Number.isInteger(physicalRow) || physicalRow < 0){
          continue;
        }
        for(let col = colStart; col <= colEnd; col++){
          const physicalCol = typeof inst.toPhysicalColumn === 'function' ? inst.toPhysicalColumn(col) : col;
          if(!Number.isInteger(physicalCol) || physicalCol < 0){
            continue;
          }
          const state = exclusionController.resolveCellState(physicalRow, physicalCol);
          if(state.excluded){
            hasExcluded = true;
          }else{
            hasIncluded = true;
          }
          physicalPairs.push({ row: physicalRow, col: physicalCol, state });
        }
      }
      const physicalRowList = Array.from(physicalRows);
      const physicalColList = Array.from(physicalCols);
      const allRowsExcluded = physicalRowList.length > 0 && physicalRowList.every(row=>exclusionController.isRowExcluded(row));
      const allColsExcluded = physicalColList.length > 0 && physicalColList.every(col=>exclusionController.isColumnExcluded(col));
      const anyRowExcluded = physicalRowList.some(row=>exclusionController.isRowExcluded(row));
      const anyColExcluded = physicalColList.some(col=>exclusionController.isColumnExcluded(col));
      const result = {
        visualRows,
        visualCols,
        physicalRows: physicalRowList,
        physicalCols: physicalColList,
        physicalPairs,
        hasExcluded,
        hasIncluded,
        allRowsExcluded,
        allColsExcluded,
        anyRowExcluded,
        anyColExcluded
      };
      console.debug('Debug: Shared.hot selection details collected', Object.assign({ debugLabel }, result));
      return result;
    };

    const toggleSelectionCells = (exclude)=>{
      const details = collectSelectionDetails();
      if(!details || !details.physicalPairs.length){
        console.debug('Debug: Shared.hot toggleSelectionCells skipped', { debugLabel, exclude });
        return;
      }
      const targets = details.physicalPairs.map(pair=>({ row: pair.row, col: pair.col }));
      exclusionController.markCells(targets, exclude);
    };

    const toggleSelectionRows = (exclude)=>{
      const details = collectSelectionDetails();
      if(!details || !details.physicalRows.length){
        console.debug('Debug: Shared.hot toggleSelectionRows skipped', { debugLabel, exclude });
        return;
      }
      exclusionController.markRows(details.physicalRows, exclude);
    };

    const toggleSelectionCols = (exclude)=>{
      const details = collectSelectionDetails();
      if(!details || !details.physicalCols.length){
        console.debug('Debug: Shared.hot toggleSelectionCols skipped', { debugLabel, exclude });
        return;
      }
      exclusionController.markColumns(details.physicalCols, exclude);
    };

    const afterContextMenuDefaultOptionsBase = function(defaultOptions){
      const items = defaultOptions?.items || defaultOptions;
      if(!items || typeof items !== 'object'){
        console.debug('Debug: Shared.hot context menu injection skipped', { debugLabel, hasItems: !!items });
        return;
      }
      const hasNavigatorClipboard = typeof navigator !== 'undefined' && !!(navigator?.clipboard && typeof navigator.clipboard.readText === 'function'); // eslint-disable-line no-undef
      if(!items.paste_transpose){
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
      }
      const separatorKey = 'exclusion_separator';
      const separatorValue = Handsontable?.plugins?.ContextMenu?.SEPARATOR || '---------';
      if(!items[separatorKey]){
        items[separatorKey] = separatorValue;
      }
      if(!items.exclude_selection_analysis){
        items.exclude_selection_analysis = {
          name: 'Exclude selection from analysis',
          callback(){
            toggleSelectionCells(true);
          },
          disabled(){
            const info = collectSelectionDetails();
            const disabledState = !(info && info.hasIncluded);
            console.debug('Debug: Shared.hot exclude selection disabled check', { debugLabel, disabled: disabledState, hasInfo: !!info });
            return disabledState;
          }
        };
      }
      if(!items.include_selection_analysis){
        items.include_selection_analysis = {
          name: 'Include selection in analysis',
          callback(){
            toggleSelectionCells(false);
          },
          disabled(){
            const info = collectSelectionDetails();
            const disabledState = !(info && info.hasExcluded);
            console.debug('Debug: Shared.hot include selection disabled check', { debugLabel, disabled: disabledState, hasInfo: !!info });
            return disabledState;
          }
        };
      }
      if(!items.exclude_rows_analysis){
        items.exclude_rows_analysis = {
          name: 'Exclude row(s) from analysis',
          callback(){
            toggleSelectionRows(true);
          },
          disabled(){
            const info = collectSelectionDetails();
            const disabledState = !(info && info.physicalRows.length && info.physicalRows.some(row=>!exclusionController.isRowExcluded(row)));
            console.debug('Debug: Shared.hot exclude rows disabled check', { debugLabel, disabled: disabledState, rows: info?.physicalRows || [] });
            return disabledState;
          }
        };
      }
      if(!items.include_rows_analysis){
        items.include_rows_analysis = {
          name: 'Include row(s) in analysis',
          callback(){
            toggleSelectionRows(false);
          },
          disabled(){
            const info = collectSelectionDetails();
            const disabledState = !(info && info.physicalRows.length && info.physicalRows.some(row=>exclusionController.isRowExcluded(row)));
            console.debug('Debug: Shared.hot include rows disabled check', { debugLabel, disabled: disabledState, rows: info?.physicalRows || [] });
            return disabledState;
          }
        };
      }
      if(!items.exclude_columns_analysis){
        items.exclude_columns_analysis = {
          name: 'Exclude column(s) from analysis',
          callback(){
            toggleSelectionCols(true);
          },
          disabled(){
            const info = collectSelectionDetails();
            const disabledState = !(info && info.physicalCols.length && info.physicalCols.some(col=>!exclusionController.isColumnExcluded(col)));
            console.debug('Debug: Shared.hot exclude columns disabled check', { debugLabel, disabled: disabledState, cols: info?.physicalCols || [] });
            return disabledState;
          }
        };
      }
      if(!items.include_columns_analysis){
        items.include_columns_analysis = {
          name: 'Include column(s) in analysis',
          callback(){
            toggleSelectionCols(false);
          },
          disabled(){
            const info = collectSelectionDetails();
            const disabledState = !(info && info.physicalCols.length && info.physicalCols.some(col=>exclusionController.isColumnExcluded(col)));
            console.debug('Debug: Shared.hot include columns disabled check', { debugLabel, disabled: disabledState, cols: info?.physicalCols || [] });
            return disabledState;
          }
        };
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
      cells,
      columnSorting: columnSortingSettings
    }, performanceDefaults, otherHotOptions, {
      colWidths: resolveColumnWidth,
      afterChange: wrapHook('afterChange', userAfterChange, afterChangeBase),
      afterCreateRow: wrapHook('afterCreateRow', userAfterCreateRow, afterCreateRowBase),
      afterCreateCol: wrapHook('afterCreateCol', userAfterCreateCol, afterCreateColBase),
      afterRemoveRow: wrapHook('afterRemoveRow', userAfterRemoveRow, afterRemoveRowBase),
      afterRemoveCol: wrapHook('afterRemoveCol', userAfterRemoveCol, afterRemoveColBase),
      afterUndo: wrapHook('afterUndo', userAfterUndo, afterUndoBase),
      afterRedo: wrapHook('afterRedo', userAfterRedo, afterRedoBase),
      afterColumnMove: wrapHook('afterColumnMove', userAfterColumnMove, afterColumnMoveBase),
      afterLoadData: wrapHook('afterLoadData', userAfterLoadData, afterLoadDataBase),
      afterSelectionEnd: wrapHook('afterSelectionEnd', userAfterSelectionEnd, afterSelectionEndBase),
      afterScrollVertically: wrapHook('afterScrollVertically', userAfterScrollVertically, afterScrollVerticallyBase),
      afterScrollHorizontally: wrapHook('afterScrollHorizontally', userAfterScrollHorizontally, afterScrollHorizontallyBase),
      afterPaste: wrapHook('afterPaste', userAfterPaste, afterPasteBase),
      afterCopy: wrapHook('afterCopy', userAfterCopy, afterCopyBase),
      beforeKeyDown: wrapHook('beforeKeyDown', userBeforeKeyDown, beforeKeyDownBase),
      beforeAutofill: wrapHook('beforeAutofill', userBeforeAutofill, beforeAutofillBase),
      afterRender: wrapHook('afterRender', userAfterRender, afterRenderBase),
      beforeColumnSort: wrapHook('beforeColumnSort', userBeforeColumnSort, beforeColumnSortBase),
      afterColumnSort: wrapHook('afterColumnSort', userAfterColumnSort, afterColumnSortBase),
      afterGetColHeader: wrapHook('afterGetColHeader', userAfterGetColHeader, afterGetColHeaderBase),
      afterGetRowHeader: wrapHook('afterGetRowHeader', userAfterGetRowHeader, afterGetRowHeaderBase),
      afterContextMenuDefaultOptions: wrapHook('afterContextMenuDefaultOptions', userAfterContextMenuDefaultOptions, afterContextMenuDefaultOptionsBase)
    });

    console.debug('Debug: createStandardTable options prepared', { debugLabel, rowCount, colCount });
    instance = new Handsontable(container, options);
    if(instance && typeof instance.loadData === 'function'){
      const originalLoadData = instance.loadData.bind(instance);
      instance.loadData = function patchedLoadData(data){
        enforceMinDimensions(data);
        return originalLoadData(data);
      };
    }
    baseOrderSnapshot = captureCurrentOrder();
    attachScrollHandler();
    scheduleRowGrowth('init');
    scheduleColGrowth('init');
    instance.__hotDebugLabel = debugLabel;
    instance.__hotExclusionController = exclusionController;
    instance.__hotClearCopyHighlight = function(reason){
      const label = reason || 'instance.__hotClearCopyHighlight';
      clearCopyHighlightRange(label);
    };
    console.debug('Debug: createStandardTable clearCopyHighlight hook registered', { debugLabel });
    instance.getAnalysisData = function(options){
      return hotNS.getAnalysisData(instance, options);
    };
    instance.exportExclusions = function(){
      return hotNS.exportExclusions(instance);
    };
    instance.applyExclusions = function(payload){
      return hotNS.applyExclusions(instance, payload);
    };
    instance.clearExclusions = function(){
      return hotNS.clearExclusions(instance);
    };
    const originalGetDataAtCell = typeof instance.getDataAtCell === 'function' ? instance.getDataAtCell.bind(instance) : null;
    if(originalGetDataAtCell){
      instance.getDataAtCell = function(row, col){
        const value = originalGetDataAtCell(row, col);
        const physicalRow = toPhysicalRow(instance, row);
        const physicalCol = toPhysicalColumn(instance, col);
        return exclusionController.isCellExcluded(physicalRow, physicalCol) ? null : value;
      };
    }
    const originalGetDataAtRow = typeof instance.getDataAtRow === 'function' ? instance.getDataAtRow.bind(instance) : null;
    if(originalGetDataAtRow){
      instance.getDataAtRow = function(row){
        const raw = originalGetDataAtRow(row) || [];
        const physicalRow = toPhysicalRow(instance, row);
        if(physicalRow === null){
          return raw;
        }
        return raw.map((value, colIndex)=>{
          const physicalCol = toPhysicalColumn(instance, colIndex);
          return exclusionController.isCellExcluded(physicalRow, physicalCol) ? null : value;
        });
      };
    }
    const originalGetDataAtCol = typeof instance.getDataAtCol === 'function' ? instance.getDataAtCol.bind(instance) : null;
    if(originalGetDataAtCol){
      instance.getDataAtCol = function(col){
        const raw = originalGetDataAtCol(col) || [];
        const physicalCol = toPhysicalColumn(instance, col);
        if(physicalCol === null){
          return raw;
        }
        return raw.map((value, rowIndex)=>{
          const physicalRow = toPhysicalRow(instance, rowIndex);
          return exclusionController.isCellExcluded(physicalRow, physicalCol) ? null : value;
        });
      };
    }
    if(overrides?.exclusions){
      exclusionController.importState(overrides.exclusions);
    }
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

  const resolveInstance = (instance)=>{
    if(instance && typeof instance.countRows === 'function' && typeof instance.countCols === 'function'){
      return instance;
    }
    return null;
  };

  const getInstanceDebugLabel = (instance)=>{
    if(!instance){
      return 'hot';
    }
    return instance.__hotDebugLabel || instance.rootElement?.id || 'hot';
  };

  const getControllerFromInstance = (instance)=>{
    const inst = resolveInstance(instance);
    if(!inst){
      return null;
    }
    const controller = inst.__hotExclusionController || null;
    if(!controller){
      console.debug('Debug: Shared.hot controller missing', { debugLabel: getInstanceDebugLabel(inst) });
    }
    return controller;
  };

  const normalizeSelectionIndex = (value)=>{
    const num = Number(value);
    return Number.isInteger(num) && num >= 0 ? num : null;
  };

  const toPhysicalRow = (instance, visualRow)=>{
    const inst = resolveInstance(instance);
    if(!inst){
      return null;
    }
    if(typeof inst.toPhysicalRow === 'function'){
      const physical = inst.toPhysicalRow(visualRow);
      if(Number.isInteger(physical) && physical >= 0){
        return physical;
      }
    }
    return normalizeSelectionIndex(visualRow);
  };

  const toPhysicalColumn = (instance, visualCol)=>{
    const inst = resolveInstance(instance);
    if(!inst){
      return null;
    }
    if(typeof inst.toPhysicalColumn === 'function'){
      const physical = inst.toPhysicalColumn(visualCol);
      if(Number.isInteger(physical) && physical >= 0){
        return physical;
      }
    }
    return normalizeSelectionIndex(visualCol);
  };

  const EMPTY_EXCLUSION_STATE = Object.freeze({ rows: [], cols: [], cells: [] });

  function exportExclusions(instance){
    const inst = resolveInstance(instance);
    const controller = getControllerFromInstance(inst);
    if(!controller){
      return EMPTY_EXCLUSION_STATE;
    }
    const state = controller.exportState();
    console.debug('Debug: Shared.hot exportExclusions', { debugLabel: getInstanceDebugLabel(inst), state });
    return state;
  }

  function applyExclusions(instance, payload){
    const inst = resolveInstance(instance);
    const controller = getControllerFromInstance(inst);
    if(!controller){
      return EMPTY_EXCLUSION_STATE;
    }
    controller.importState(payload || {});
    return controller.exportState();
  }

  function clearExclusions(instance){
    const inst = resolveInstance(instance);
    const controller = getControllerFromInstance(inst);
    if(!controller){
      return false;
    }
    controller.clearAll();
    return true;
  }

  function isRowExcluded(instance, row, options){
    const inst = resolveInstance(instance);
    const controller = getControllerFromInstance(inst);
    if(!controller){
      return false;
    }
    const usePhysical = options?.mode === 'physical';
    const physicalRow = usePhysical ? normalizeSelectionIndex(row) : toPhysicalRow(inst, row);
    return physicalRow !== null ? controller.isRowExcluded(physicalRow) : false;
  }

  function isColumnExcluded(instance, col, options){
    const inst = resolveInstance(instance);
    const controller = getControllerFromInstance(inst);
    if(!controller){
      return false;
    }
    const usePhysical = options?.mode === 'physical';
    const physicalCol = usePhysical ? normalizeSelectionIndex(col) : toPhysicalColumn(inst, col);
    return physicalCol !== null ? controller.isColumnExcluded(physicalCol) : false;
  }

  function isCellExcluded(instance, row, col, options){
    const inst = resolveInstance(instance);
    const controller = getControllerFromInstance(inst);
    if(!controller){
      return false;
    }
    const usePhysical = options?.mode === 'physical';
    const physicalRow = usePhysical ? normalizeSelectionIndex(row) : toPhysicalRow(inst, row);
    const physicalCol = usePhysical ? normalizeSelectionIndex(col) : toPhysicalColumn(inst, col);
    if(physicalRow === null || physicalCol === null){
      return false;
    }
    return controller.isCellExcluded(physicalRow, physicalCol);
  }

  function getAnalysisData(instance, options){
    const inst = resolveInstance(instance);
    if(!inst){
      return {
        data: [],
        rowCount: 0,
        colCount: 0,
        excluded: EMPTY_EXCLUSION_STATE,
        isRowExcluded: ()=>false,
        isColumnExcluded: ()=>false,
        isCellExcluded: ()=>false,
        getColumnValues: ()=>[],
        getRowValues: ()=>[],
        toPhysicalRow: ()=>null,
        toPhysicalColumn: ()=>null
      };
    }
    const controller = getControllerFromInstance(inst);
    const rowCount = inst.countRows();
    const colCount = inst.countCols();
    const visualToPhysicalRow = Array.from({ length: rowCount }, (_, row)=>toPhysicalRow(inst, row));
    const visualToPhysicalCol = Array.from({ length: colCount }, (_, col)=>toPhysicalColumn(inst, col));
    const data = [];
    for(let row = 0; row < rowCount; row++){
      const rowValues = [];
      for(let col = 0; col < colCount; col++){
        const physicalRow = visualToPhysicalRow[row];
        const physicalCol = visualToPhysicalCol[col];
        const excluded = controller ? controller.isCellExcluded(physicalRow, physicalCol) : false;
        if(excluded){
          rowValues.push(null);
        }else{
          try{
            rowValues.push(inst.getDataAtCell(row, col));
          }catch(err){
            console.error('Shared.hot getAnalysisData cell read error', err);
            rowValues.push(null);
          }
        }
      }
      data.push(rowValues);
    }
    const analysis = {
      data,
      rowCount,
      colCount,
      excluded: controller ? controller.exportState() : EMPTY_EXCLUSION_STATE,
      isRowExcluded(visualRow){
        const physicalRow = visualToPhysicalRow[visualRow];
        return physicalRow != null && controller ? controller.isRowExcluded(physicalRow) : false;
      },
      isColumnExcluded(visualCol){
        const physicalCol = visualToPhysicalCol[visualCol];
        return physicalCol != null && controller ? controller.isColumnExcluded(physicalCol) : false;
      },
      isCellExcluded(visualRow, visualCol){
        const physicalRow = visualToPhysicalRow[visualRow];
        const physicalCol = visualToPhysicalCol[visualCol];
        if(physicalRow == null || physicalCol == null || !controller){
          return false;
        }
        return controller.isCellExcluded(physicalRow, physicalCol);
      },
      getColumnValues(visualCol, opts){
        const optionsLocal = opts || {};
        const skipHeader = optionsLocal.skipHeader === true;
        const includeEmpty = optionsLocal.includeEmpty === true;
        const values = [];
        for(let row = 0; row < data.length; row++){
          if(skipHeader && row === 0){
            continue;
          }
          const value = data[row][visualCol];
          if(value === null){
            continue;
          }
          if(!includeEmpty && (value === '' || typeof value === 'undefined')){
            continue;
          }
          values.push(value);
        }
        console.debug('Debug: Shared.hot getColumnValues', { debugLabel: getInstanceDebugLabel(inst), visualCol, count: values.length });
        return values;
      },
      getRowValues(visualRow, opts){
        const optionsLocal = opts || {};
        if(optionsLocal.skipHeader === true && visualRow === 0){
          return [];
        }
        const includeEmpty = optionsLocal.includeEmpty === true;
        const rowData = data[visualRow] || [];
        const values = [];
        for(let col = 0; col < rowData.length; col++){
          const value = rowData[col];
          if(value === null){
            continue;
          }
          if(!includeEmpty && (value === '' || typeof value === 'undefined')){
            continue;
          }
          values.push(value);
        }
        console.debug('Debug: Shared.hot getRowValues', { debugLabel: getInstanceDebugLabel(inst), visualRow, count: values.length });
        return values;
      },
      toPhysicalRow(visualRow){
        return visualToPhysicalRow[visualRow] ?? null;
      },
      toPhysicalColumn(visualCol){
        return visualToPhysicalCol[visualCol] ?? null;
      }
    };
    console.debug('Debug: Shared.hot getAnalysisData complete', { debugLabel: getInstanceDebugLabel(inst), rowCount, colCount });
    return analysis;
  }

  function getIncludedColumn(instance, visualCol, options){
    const analysis = getAnalysisData(instance, options);
    return analysis.getColumnValues(visualCol, options);
  }

  function getIncludedRow(instance, visualRow, options){
    const analysis = getAnalysisData(instance, options);
    return analysis.getRowValues(visualRow, options);
  }

  hotNS.clearCopyHighlight = function(instance, reason){
    const inst = resolveInstance(instance);
    const label = reason || 'Shared.hot.clearCopyHighlight';
    const debugLabel = getInstanceDebugLabel(inst);
    if(inst && typeof inst.__hotClearCopyHighlight === 'function'){
      inst.__hotClearCopyHighlight(label);
      console.debug('Debug: Shared.hot.clearCopyHighlight invoked', { debugLabel, reason: label });
      return true;
    }
    console.debug('Debug: Shared.hot.clearCopyHighlight skipped', {
      debugLabel,
      reason: label,
      hasHandler: !!(inst && inst.__hotClearCopyHighlight)
    });
    return false;
  };

  Shared.ensureHotWrapperStyles = ensureHotWrapperStyles;
  Shared.createEmptyData = createEmptyData;
  hotNS.ensureHotWrapperStyles = ensureHotWrapperStyles;
  hotNS.createEmptyData = createEmptyData;
  hotNS.createStandardTable = createStandardTable;
  hotNS.exportExclusions = exportExclusions;
  hotNS.applyExclusions = applyExclusions;
  hotNS.clearExclusions = clearExclusions;
  hotNS.isRowExcluded = isRowExcluded;
  hotNS.isColumnExcluded = isColumnExcluded;
  hotNS.isCellExcluded = isCellExcluded;
  hotNS.getAnalysisData = getAnalysisData;
  hotNS.getIncludedColumn = getIncludedColumn;
  hotNS.getIncludedRow = getIncludedRow;
})(window);

