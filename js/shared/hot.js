// Shared helpers for grid setup (AG Grid-backed) and wrapper sizing
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

  function createStandardTableAgGrid(container, dimensions, scheduleDraw, overrides){
    const debugLabel = overrides?.debugLabel || container?.id || 'hot-ag';
    const htCalls = global.__HT_CALLS__ = global.__HT_CALLS__ || [];
    const recordCall = (type, payload)=>{
      try{
        htCalls.push(Object.assign({ type }, payload || {}));
      }catch(err){
        // best-effort only
      }
    };
    const trimRow = (row)=>{
      if(!Array.isArray(row)){
        return row;
      }
      let end = row.length;
      while(end > 0 && (row[end - 1] === '' || typeof row[end - 1] === 'undefined' || row[end - 1] === null)){
        end -= 1;
      }
      return row.slice(0, end);
    };
    if(!container){
      console.warn('Shared.hot.createStandardTable (ag-grid) missing container', { debugLabel });
      return null;
    }
    const agNS = Shared.agGrid || {};
    const hasAgGrid = !!(global.agGrid && (typeof global.agGrid.createGrid === 'function' || typeof global.agGrid.Grid === 'function'));
    const scheduleFn = typeof scheduleDraw === 'function' ? scheduleDraw : null;
    let rowCount = Math.max(0, Number(dimensions?.rows ?? 0));
    const requestedColCount = Math.max(0, Number(dimensions?.cols ?? 0));
    let colCount = Math.max(MIN_INPUT_COLS, requestedColCount);
    const scheduleOnLoadData = overrides?.scheduleOnLoadData ?? true;
    const treatFirstRowAsHeader = overrides?.firstRowIsHeader !== false;
    const firstRowClassName = overrides?.firstRowClassName || 'hot-header-row';
    const preserveExclusionsOnLoad = overrides?.preserveExclusionsOnLoad === true;
    const baseData = Array.isArray(overrides?.data) ? overrides.data : null;
    const hotOptions = overrides?.hotOptions || {};
    const userAfterChange = hotOptions.afterChange;
    const userAfterLoadData = hotOptions.afterLoadData;
    const userAfterSelectionEnd = hotOptions.afterSelectionEnd;
    const userAfterPaste = hotOptions.afterPaste;
    const userAfterCopy = hotOptions.afterCopy;
    const userAfterCreateRow = hotOptions.afterCreateRow;
    const userAfterCreateCol = hotOptions.afterCreateCol;
    const userAfterRemoveRow = hotOptions.afterRemoveRow;
    const userAfterRemoveCol = hotOptions.afterRemoveCol;
    const userAfterColumnMove = hotOptions.afterColumnMove;
    const userBeforeKeyDown = hotOptions.beforeKeyDown;
    let colHeadersSetting = hotOptions.colHeaders;
    let rowHeadersSetting = hotOptions.rowHeaders;
    let nestedHeadersSetting = hotOptions.nestedHeaders;
    const headerWidthManager = { invalidateColumns: noop, reset: noop }; // placeholder for compat
    const hasEnterprise = !!(global.agGrid?.ModuleRegistry?.registeredModules && global.agGrid.ModuleRegistry.registeredModules.some(mod => /Enterprise/i.test(mod?.moduleName || '')));

    const ensureDims = (matrix, targetRows, targetCols)=>{
      const totalRows = Math.max(targetRows, matrix.length);
      let maxCols = Math.max(targetCols, MIN_INPUT_COLS);
      for(let r = 0; r < matrix.length; r++){
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        maxCols = Math.max(maxCols, row.length);
      }
      for(let r = 0; r < totalRows; r++){
        if(!Array.isArray(matrix[r])){
          matrix[r] = [];
        }
        if(matrix[r].length < maxCols){
          matrix[r].length = maxCols;
        }
        for(let c = 0; c < matrix[r].length; c++){
          if(typeof matrix[r][c] === 'undefined'){
            matrix[r][c] = '';
          }
        }
      }
      colCount = Math.max(colCount, maxCols);
      return matrix;
    };

    let data = baseData ? ensureDims(baseData, rowCount, colCount) : createEmptyData(rowCount, colCount);
    const dataHandle = { current: data };
    recordCall('construct', { containerId: container?.id || null, rows: data.length, cols: colCount });
    const resolveColHeaders = (count)=>{
      if(Array.isArray(colHeadersSetting)){
        return colHeadersSetting.slice(0, count).concat(Array.from({ length: Math.max(0, count - colHeadersSetting.length) }, (_, idx)=>`Column ${colHeadersSetting.length + idx + 1}`));
      }
      if(typeof colHeadersSetting === 'function'){
        return Array.from({ length: count }, (_, idx)=>{
          try{
            const label = colHeadersSetting(idx);
            return label == null ? '' : String(label);
          }catch(err){
            return `Column ${idx + 1}`;
          }
        });
      }
      if(colHeadersSetting === false){
        return null;
      }
      return Array.from({ length: count }, (_, idx)=>`Column ${idx + 1}`);
    };
    let colHeaders = resolveColHeaders(colCount);
    let colHeadersEnabled = colHeadersSetting !== false;
    let rowHeadersEnabled = rowHeadersSetting !== false;

    const exclusionController = createExclusionController(()=>instance, debugLabel, (scope)=>{
      triggerSchedule(scope || 'exclusion-change', { scope });
    });

    const hooks = {
      afterChange: [],
      afterLoadData: [],
      afterSelectionEnd: [],
      afterPaste: [],
      afterCopy: [],
      afterCreateRow: [],
      afterCreateCol: [],
      afterRemoveRow: [],
      afterRemoveCol: [],
      afterColumnMove: [],
      beforeKeyDown: []
    };
    const addHook = (name, fn)=>{
      if(!fn || typeof fn !== 'function' || !hooks[name]){
        return;
      }
      hooks[name].push(fn);
    };
    const fireHook = (name, ...args)=>{
      if(!hooks[name]){
        return;
      }
      for(let i = 0; i < hooks[name].length; i++){
        try{
          hooks[name][i](...args);
        }catch(err){
          console.error(`Shared.hot AG hook error (${name})`, err);
        }
      }
    };

    addHook('afterChange', userAfterChange);
    addHook('afterLoadData', userAfterLoadData);
    addHook('afterSelectionEnd', userAfterSelectionEnd);
    addHook('afterPaste', userAfterPaste);
    addHook('afterCopy', userAfterCopy);
    addHook('afterCreateRow', userAfterCreateRow);
    addHook('afterCreateCol', userAfterCreateCol);
    addHook('afterRemoveRow', userAfterRemoveRow);
    addHook('afterRemoveCol', userAfterRemoveCol);
    addHook('afterColumnMove', userAfterColumnMove);
    addHook('beforeKeyDown', userBeforeKeyDown);

    let lastRange = null;
    let copyHighlightRange = null;
    let normalizedSelectionRange = null;
    let normalizedCopyHighlightRange = null;

    const normalizeRange = (range)=>{
      if(!range || !range.from || !range.to){
        return null;
      }
      const fromRow = Number(range.from.row);
      const fromCol = Number(range.from.col);
      const toRow = Number(range.to.row);
      const toCol = Number(range.to.col);
      if(!Number.isInteger(fromRow) || !Number.isInteger(fromCol) || !Number.isInteger(toRow) || !Number.isInteger(toCol)){
        return null;
      }
      return {
        from: { row: Math.min(fromRow, toRow), col: Math.min(fromCol, toCol) },
        to: { row: Math.max(fromRow, toRow), col: Math.max(fromCol, toCol) }
      };
    };

    const setLastRange = (range)=>{
      lastRange = range || null;
      normalizedSelectionRange = normalizeRange(lastRange);
    };

    const setCopyHighlightRange = (range)=>{
      copyHighlightRange = range || null;
      normalizedCopyHighlightRange = normalizeRange(copyHighlightRange);
    };

    const cleanupFns = [];
    const runCleanup = ()=>{
      while(cleanupFns.length){
        const fn = cleanupFns.pop();
        try{
          fn?.();
        }catch(err){
          // best-effort cleanup
        }
      }
    };

    let isDragSelecting = false;
    let dragAnchor = null;
    let suppressNextCellClick = false;
    let pendingDragCell = null;
    let dragRafPending = false;
    let pendingHeaderSortSuppression = null;

    const MAX_CLIPBOARD_CELLS = 200000;

    const normalizeClipboardText = (text)=>{
      if(typeof text !== 'string'){
        return '';
      }
      return text.replace(/\r\n?/g, '\n').trimEnd();
    };

    // --- Undo/redo support for AG Grid path (Community) ---
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
    const UNDO_STACK_LIMIT = 60;
    let undoStack = [];
    let undoPointer = -1;
    let undoLockDepth = 0;
    let undoStepSeq = 0;

    let pendingCutMove = null;
    let pendingCutMoveTimer = null;
    let pendingPasteText = '';

    const withUndoLock = (phase, fn)=>{
      undoLockDepth += 1;
      try{
        return typeof fn === 'function' ? fn() : undefined;
      }finally{
        undoLockDepth = Math.max(0, undoLockDepth - 1);
      }
    };

    const dedupePhysicalChanges = (changes)=>{
      const seen = new Map();
      (Array.isArray(changes) ? changes : []).forEach(change=>{
        if(!change){
          return;
        }
        const key = `${change.row}:${change.col}`;
        seen.set(key, change);
      });
      return Array.from(seen.values());
    };

    const applyPhysicalChanges = (physicalChanges, direction, changeSource)=>{
      const matrix = dataHandle.current;
      const list = Array.isArray(physicalChanges) ? physicalChanges : [];
      if(!list.length){
        return;
      }
      let maxRow = -1;
      let maxCol = -1;
      for(let i = 0; i < list.length; i++){
        const { row, col } = list[i] || {};
        if(Number.isInteger(row) && row >= 0){
          maxRow = Math.max(maxRow, row);
        }
        if(Number.isInteger(col) && col >= 0){
          maxCol = Math.max(maxCol, col);
        }
      }
      if(maxRow < 0 || maxCol < 0){
        return;
      }
      const prevRows = matrix.length;
      const prevCols = colCount;
      ensureDims(matrix, Math.max(maxRow + 1, rowCount), Math.max(maxCol + 1, colCount));
      for(let i = 0; i < list.length; i++){
        const change = list[i];
        if(!change){
          continue;
        }
        const row = change.row;
        const col = change.col;
        if(!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0){
          continue;
        }
        matrix[row][col] = direction === 'undo' ? change.prev : change.next;
      }
      dataHandle.current = matrix;
      if(matrix.length !== prevRows){
        syncRowData(instance.gridApi);
      }
      if(colCount !== prevCols){
        colHeaders = resolveColHeaders(colCount);
        rebuildColumns(instance.gridApi);
      }
      triggerSchedule('afterChange', { source: changeSource || `UndoRedo.${direction}` });
      renderAg(instance.gridApi);
    };

    const applyUndoStepById = (direction, id)=>{
      const idx = undoStack.findIndex(step => step?.id === id);
      if(idx < 0){
        return false;
      }
      if(direction === 'undo'){
        undoPointer = Math.min(undoPointer, idx);
        if(undoPointer < 0){
          return false;
        }
        const step = undoStack[undoPointer];
        withUndoLock('undo', ()=>{
          applyPhysicalChanges(step.changes, 'undo', 'UndoRedo.undo');
        });
        undoPointer = Math.max(-1, undoPointer - 1);
        return true;
      }
      // redo
      undoPointer = Math.max(undoPointer, idx - 1);
      if(undoPointer + 1 >= undoStack.length){
        return false;
      }
      const step = undoStack[undoPointer + 1];
      withUndoLock('redo', ()=>{
        applyPhysicalChanges(step.changes, 'redo', 'UndoRedo.redo');
      });
      undoPointer += 1;
      return true;
    };

    const pushUndoStep = (label, physicalChanges)=>{
      if(!Array.isArray(physicalChanges) || !physicalChanges.length){
        return;
      }
      const safeChanges = dedupePhysicalChanges(physicalChanges);
      if(!safeChanges.length){
        return;
      }
      if(undoPointer < undoStack.length - 1){
        undoStack = undoStack.slice(0, undoPointer + 1);
      }
      const step = {
        id: ++undoStepSeq,
        label: label || `table:${debugLabel}:change`,
        changes: safeChanges
      };
      undoStack.push(step);
      if(undoStack.length > UNDO_STACK_LIMIT){
        const overflow = undoStack.length - UNDO_STACK_LIMIT;
        undoStack.splice(0, overflow);
        undoPointer = Math.max(-1, undoPointer - overflow);
      }
      undoPointer = undoStack.length - 1;
      if(hasGlobalUndo){
        undoManager.record({
          label: step.label,
          scope: undoScope,
          undo: ()=>applyUndoStepById('undo', step.id),
          redo: ()=>applyUndoStepById('redo', step.id)
        });
      }
    };

    const flushPendingCutMove = (reason)=>{
      if(pendingCutMoveTimer){
        try{
          const doc = container?.ownerDocument || document;
          const win = doc.defaultView || global;
          win?.clearTimeout?.(pendingCutMoveTimer);
        }catch(err){
          // ignore
        }
        pendingCutMoveTimer = null;
      }
      if(!pendingCutMove){
        return;
      }
      const pending = pendingCutMove;
      pendingCutMove = null;
      pushUndoStep(`table:${debugLabel}:cut`, pending.changes);
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot AG cut undo step flushed', { debugLabel, reason: reason || null });
      }
    };

    const buildPhysicalChangeListFromVisualChanges = (changesForHook)=>{
      const list = [];
      if(!Array.isArray(changesForHook)){
        return list;
      }
      for(let i = 0; i < changesForHook.length; i++){
        const entry = changesForHook[i];
        if(!Array.isArray(entry) || entry.length < 4){
          continue;
        }
        const visualRow = Number(entry[0]);
        const visualCol = Number(entry[1]);
        if(!Number.isInteger(visualRow) || !Number.isInteger(visualCol) || visualRow < 0 || visualCol < 0){
          continue;
        }
        const physicalRow = toPhysicalRowIndex(visualRow);
        const physicalCol = toPhysicalColIndex(visualCol);
        if(!Number.isInteger(physicalRow) || !Number.isInteger(physicalCol) || physicalRow < 0 || physicalCol < 0){
          continue;
        }
        list.push({ row: physicalRow, col: physicalCol, prev: entry[2], next: entry[3] });
      }
      return list;
    };

    const recordUndoFromVisualChanges = (changeLabel, changesForHook, source)=>{
      if(undoLockDepth > 0){
        return;
      }
      if(typeof source === 'string' && source.startsWith('UndoRedo.')){
        return;
      }
      const physical = buildPhysicalChangeListFromVisualChanges(changesForHook);
      if(!physical.length){
        return;
      }
      pushUndoStep(`table:${debugLabel}:${changeLabel || (source || 'change')}`, physical);
    };

    const buildClipboardTextFromRange = (range)=>{
      const normalized = normalizeRange(range);
      if(!normalized){
        return null;
      }
      const rowCountLocal = normalized.to.row - normalized.from.row + 1;
      const colCountLocal = normalized.to.col - normalized.from.col + 1;
      if(rowCountLocal <= 0 || colCountLocal <= 0){
        return '';
      }
      const totalCells = rowCountLocal * colCountLocal;
      if(totalCells > MAX_CLIPBOARD_CELLS){
        console.warn('Shared.hot AG copy skipped: selection too large', { debugLabel, totalCells, limit: MAX_CLIPBOARD_CELLS });
        return null;
      }
      const matrix = dataHandle.current;
      const lines = [];
      for(let visualRow = normalized.from.row; visualRow <= normalized.to.row; visualRow++){
        const physicalRow = toPhysicalRowIndex(visualRow);
        const row = Number.isInteger(physicalRow) && Array.isArray(matrix[physicalRow]) ? matrix[physicalRow] : [];
        const values = [];
        for(let visualCol = normalized.from.col; visualCol <= normalized.to.col; visualCol++){
          const physicalCol = toPhysicalColIndex(visualCol);
          const value = Number.isInteger(physicalCol) ? row[physicalCol] : null;
          values.push(value == null ? '' : String(value));
        }
        lines.push(values.join('\t'));
      }
      return lines.join('\n');
    };

    const writeClipboardText = async (text)=>{
      if(typeof text !== 'string'){
        return false;
      }
      try{
        if(typeof navigator?.clipboard?.writeText === 'function'){
          await navigator.clipboard.writeText(text);
          return true;
        }
      }catch(err){
        // fallback below
      }
      try{
        const doc = container?.ownerDocument || document;
        const textarea = doc.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '0';
        textarea.style.opacity = '0';
        doc.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);
        const ok = typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false;
        doc.body.removeChild(textarea);
        return !!ok;
      }catch(err){
        return false;
      }
    };

    const fireAfterCopy = (normalized)=>{
      if(!normalized){
        return;
      }
      const coords = [{
        startRow: normalized.from.row,
        startCol: normalized.from.col,
        endRow: normalized.to.row,
        endCol: normalized.to.col
      }];
      fireHook('afterCopy', null, coords);
    };

    const copySelectionToClipboard = async ()=>{
      const normalized = normalizedSelectionRange || normalizeRange(lastRange);
      const text = buildClipboardTextFromRange(normalized);
      if(text == null){
        return false;
      }
      const ok = await writeClipboardText(text);
      if(ok){
        setCopyHighlightRange(normalized);
        renderAg(instance.gridApi);
        fireAfterCopy(normalized);
      }
      return ok;
    };

    const cutSelectionToClipboard = async ()=>{
      if(pendingCutMove){
        flushPendingCutMove('new-cut');
      }
      const normalized = normalizedSelectionRange || normalizeRange(lastRange);
      const text = buildClipboardTextFromRange(normalized);
      if(text == null || !normalized){
        return false;
      }
      const ok = await writeClipboardText(text);
      if(!ok){
        return false;
      }
      fireAfterCopy(normalized);
      try{
        const matrix = dataHandle.current;
        const cutChanges = [];
        for(let r = normalized.from.row; r <= normalized.to.row; r++){
          for(let c = normalized.from.col; c <= normalized.to.col; c++){
            const physicalRow = toPhysicalRowIndex(r);
            const physicalCol = toPhysicalColIndex(c);
            if(!Number.isInteger(physicalRow) || !Number.isInteger(physicalCol) || physicalRow < 0 || physicalCol < 0){
              continue;
            }
            const prev = matrix?.[physicalRow]?.[physicalCol];
            cutChanges.push({ row: physicalRow, col: physicalCol, prev, next: '' });
          }
        }
        pendingCutMove = {
          clipboardText: normalizeClipboardText(text),
          createdAt: Date.now(),
          changes: dedupePhysicalChanges(cutChanges)
        };
        const doc = container?.ownerDocument || document;
        const win = doc.defaultView || global;
        pendingCutMoveTimer = win?.setTimeout?.(()=>flushPendingCutMove('timeout'), 15000) || null;
      }catch(err){
        pendingCutMove = null;
        pendingCutMoveTimer = null;
      }
      const rowCountLocal = normalized.to.row - normalized.from.row + 1;
      const colCountLocal = normalized.to.col - normalized.from.col + 1;
      const totalCells = rowCountLocal * colCountLocal;
      if(totalCells > MAX_CLIPBOARD_CELLS){
        return true;
      }
      const changes = [];
      for(let r = normalized.from.row; r <= normalized.to.row; r++){
        for(let c = normalized.from.col; c <= normalized.to.col; c++){
          changes.push([r, c, '']);
        }
      }
      instance.setDataAtCell(changes, 'cut');
      setCopyHighlightRange(null);
      renderAg(instance.gridApi);
      return true;
    };

    const buildRowData = ()=>Shared.agGrid?.buildRowData
      ? Shared.agGrid.buildRowData(dataHandle.current)
      : Array.from({ length: dataHandle.current.length }, (_, idx)=>({ __rowIndex: idx }));
    let rowData = buildRowData();

    const buildRowHeaderColDef = ()=>{
      if(!rowHeadersEnabled){
        return null;
      }
      return {
        headerName: '',
        colId: '__rowHeader',
        pinned: 'left',
        lockPinned: true,
        suppressMovable: true,
        suppressNavigable: true,
        editable: false,
        resizable: false,
        width: 56,
        valueGetter(params){
          const rowIndex = params?.node?.rowIndex ?? params?.data?.__rowIndex ?? 0;
          if(typeof rowHeadersSetting === 'function'){
            try{
              const label = rowHeadersSetting(rowIndex);
              return label == null ? '' : String(label);
            }catch(err){
              return String(rowIndex + 1);
            }
          }
          return String(rowIndex + 1);
        },
        cellClass: 'hot-row-header',
        headerClass: 'hot-row-header'
      };
    };

    const applyNestedHeadersToDefs = (defs)=>{
      const nested = nestedHeadersSetting;
      if(!nested || nested === false){
        return defs;
      }
      if(!Array.isArray(nested) || !Array.isArray(nested[0])){
        return defs;
      }

      const normalizeEntry = (entry)=>{
        if(typeof entry === 'string'){
          return { label: entry, colspan: 1 };
        }
        if(!entry || typeof entry !== 'object'){
          return null;
        }
        const label = entry.label != null ? String(entry.label) : '';
        const colspan = Math.max(1, Number(entry.colspan) || 1);
        return { label, colspan };
      };

      const leafCount = (def)=>{
        if(def && typeof def === 'object' && Array.isArray(def.children)){
          return def.children.reduce((acc, child)=>acc + leafCount(child), 0);
        }
        return 1;
      };

      const groupRow = (currentDefs, rowEntries)=>{
        if(!Array.isArray(currentDefs) || !currentDefs.length){
          return currentDefs;
        }
        const normalizedRow = (Array.isArray(rowEntries) ? rowEntries : []).map(normalizeEntry).filter(Boolean);
        if(!normalizedRow.length){
          return currentDefs;
        }
        let cursor = 0;
        const nextDefs = [];
        for(let i = 0; i < normalizedRow.length && cursor < currentDefs.length; i++){
          const entry = normalizedRow[i];
          const span = entry.colspan;
          const headerName = entry.label;

          let remaining = span;
          const children = [];
          while(remaining > 0 && cursor < currentDefs.length){
            const candidate = currentDefs[cursor];
            const candidateLeafCount = leafCount(candidate);
            if(candidateLeafCount > remaining){
              return currentDefs;
            }
            children.push(candidate);
            cursor += 1;
            remaining -= candidateLeafCount;
          }
          if(!children.length){
            continue;
          }
          if(span === 1 && (!headerName || headerName.trim() === '')){
            nextDefs.push(children[0]);
            continue;
          }
          nextDefs.push({ headerName: headerName || '', children });
        }
        while(cursor < currentDefs.length){
          nextDefs.push(currentDefs[cursor]);
          cursor += 1;
        }
        return nextDefs;
      };

      const rows = nested.filter(Array.isArray);
      if(!rows.length){
        return defs;
      }
      let result = defs;
      for(let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex--){
        result = groupRow(result, rows[rowIndex]);
      }
      return result;
    };

    const valueComparator = (a, b, _nodeA, _nodeB, isDescending)=>{
      const isEmpty = (v)=>v === null || v === undefined || v === '';
      const aEmpty = isEmpty(a);
      const bEmpty = isEmpty(b);
      if(aEmpty && bEmpty){
        return 0;
      }
      if(aEmpty){
        // In descending, AG inverts comparator; return -1 so inversion pushes empty to bottom.
        return isDescending ? -1 : 1;
      }
      if(bEmpty){
        return isDescending ? 1 : -1;
      }
      const toNumber = (v)=>{
        if(typeof v === 'number'){
          return Number.isFinite(v) ? v : null;
        }
        if(typeof v === 'string'){
          const trimmed = v.trim();
          if(trimmed === ''){
            return null;
          }
          const n = Number(trimmed);
          return Number.isFinite(n) ? n : null;
        }
        return null;
      };
      const aNum = toNumber(a);
      const bNum = toNumber(b);
      if(aNum !== null && bNum !== null){
        if(aNum === bNum){
          return 0;
        }
        return aNum < bNum ? -1 : 1;
      }
      const aStr = String(a).toLowerCase();
      const bStr = String(b).toLowerCase();
      const cmp = aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
      if(cmp !== 0){
        return cmp;
      }
      return 0;
    };

    const buildColumnDefs = ()=>{
      const dataColumnDefs = Shared.agGrid?.createColumnDefs
        ? Shared.agGrid.createColumnDefs(colCount, { dataHandle, colHeaders })
        : Array.from({ length: colCount }, (_, col)=>{
          const headerName = colHeaders && colHeaders[col] ? colHeaders[col] : `Col ${col + 1}`;
          return {
            headerName,
            colId: `c${col}`,
            field: `c${col}`,
            editable: true,
            resizable: true,
            comparator: valueComparator,
            cellClass: params => {
              const physicalRow = params?.data?.__rowIndex ?? params?.node?.rowIndex ?? 0;
              return (treatFirstRowAsHeader && physicalRow === 0) ? firstRowClassName : null;
            }
          };
        });
      const enhancedDataColumnDefs = dataColumnDefs.map(def=>{
        if(!def || typeof def !== 'object'){
          return def;
        }
        const existing = def.cellClassRules && typeof def.cellClassRules === 'object'
          ? Object.assign({}, def.cellClassRules)
          : {};
        existing['hot-selected-cell'] = params=>{
          if(!normalizedSelectionRange){
            return false;
          }
          const rowIndex = params?.node?.rowIndex ?? params?.rowIndex;
          const colId = params?.column?.getColId?.() ?? params?.colDef?.colId;
          if(!Number.isInteger(rowIndex)){
            return false;
          }
          const col = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          if(!Number.isInteger(col)){
            return false;
          }
          return rowIndex >= normalizedSelectionRange.from.row
            && rowIndex <= normalizedSelectionRange.to.row
            && col >= normalizedSelectionRange.from.col
            && col <= normalizedSelectionRange.to.col;
        };
        existing['hot-copy-highlight-cell'] = params=>{
          if(!normalizedCopyHighlightRange){
            return false;
          }
          const rowIndex = params?.node?.rowIndex ?? params?.rowIndex;
          const colId = params?.column?.getColId?.() ?? params?.colDef?.colId;
          if(!Number.isInteger(rowIndex)){
            return false;
          }
          const col = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          if(!Number.isInteger(col)){
            return false;
          }
          return rowIndex >= normalizedCopyHighlightRange.from.row
            && rowIndex <= normalizedCopyHighlightRange.to.row
            && col >= normalizedCopyHighlightRange.from.col
            && col <= normalizedCopyHighlightRange.to.col;
        };
        existing['hot-cell-excluded'] = params=>{
          const physicalRow = params?.data?.__rowIndex;
          if(!Number.isInteger(physicalRow) || physicalRow < 0){
            return false;
          }
          if(treatFirstRowAsHeader && physicalRow === 0){
            return false;
          }
          const colId = params?.column?.getColId?.() ?? params?.colDef?.colId;
          const physicalCol = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          if(!Number.isInteger(physicalCol) || physicalCol < 0){
            return false;
          }
          const state = exclusionController.resolveCellState(physicalRow, physicalCol);
          return state.fromCell || state.fromRow || state.fromCol;
        };
        existing['hot-cell-excluded-row'] = params=>{
          const physicalRow = params?.data?.__rowIndex;
          if(!Number.isInteger(physicalRow) || physicalRow < 0){
            return false;
          }
          if(treatFirstRowAsHeader && physicalRow === 0){
            return false;
          }
          const colId = params?.column?.getColId?.() ?? params?.colDef?.colId;
          const physicalCol = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          if(!Number.isInteger(physicalCol) || physicalCol < 0){
            return false;
          }
          return exclusionController.resolveCellState(physicalRow, physicalCol).fromRow;
        };
        existing['hot-cell-excluded-column'] = params=>{
          const physicalRow = params?.data?.__rowIndex;
          if(!Number.isInteger(physicalRow) || physicalRow < 0){
            return false;
          }
          if(treatFirstRowAsHeader && physicalRow === 0){
            return false;
          }
          const colId = params?.column?.getColId?.() ?? params?.colDef?.colId;
          const physicalCol = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          if(!Number.isInteger(physicalCol) || physicalCol < 0){
            return false;
          }
          return exclusionController.resolveCellState(physicalRow, physicalCol).fromCol;
        };
        existing['hot-cell-excluded-cell'] = params=>{
          const physicalRow = params?.data?.__rowIndex;
          if(!Number.isInteger(physicalRow) || physicalRow < 0){
            return false;
          }
          if(treatFirstRowAsHeader && physicalRow === 0){
            return false;
          }
          const colId = params?.column?.getColId?.() ?? params?.colDef?.colId;
          const physicalCol = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          if(!Number.isInteger(physicalCol) || physicalCol < 0){
            return false;
          }
          return exclusionController.resolveCellState(physicalRow, physicalCol).fromCell;
        };
        def.cellClassRules = existing;
        return def;
      });
      const rowHeaderCol = buildRowHeaderColDef();
      const withNested = applyNestedHeadersToDefs(enhancedDataColumnDefs);
      return rowHeaderCol ? [rowHeaderCol, ...withNested] : withNested;
    };
    let columnDefs = buildColumnDefs();

    const colIdToIndex = (id)=>{
      if(id === '__rowHeader'){
        return 0;
      }
      if(typeof id === 'string' && id.startsWith('c')){
        const num = Number(id.slice(1));
        return Number.isFinite(num) ? num : 0;
      }
      return 0;
    };

    const toPhysicalRowIndex = (visualRow)=>{
      const row = Number(visualRow);
      if(!Number.isInteger(row) || row < 0){
        return null;
      }
      const api = instance?.gridApi;
      if(api && typeof api.getDisplayedRowAtIndex === 'function'){
        try{
          const node = api.getDisplayedRowAtIndex(row);
          const physical = node?.data?.__rowIndex;
          if(Number.isInteger(physical) && physical >= 0){
            return physical;
          }
        }catch(err){
          // ignore mapping failures
        }
      }
      return row;
    };

    const toPhysicalColIndex = (visualCol)=>{
      const col = Number(visualCol);
      if(!Number.isInteger(col) || col < 0){
        return null;
      }
      return col;
    };

    const getVisualRowCount = ()=>{
      const api = instance?.gridApi;
      if(api && typeof api.getDisplayedRowCount === 'function'){
        try{
          const count = api.getDisplayedRowCount();
          return Number.isInteger(count) && count >= 0 ? count : dataHandle.current.length;
        }catch(err){
          // ignore
        }
      }
      return dataHandle.current.length;
    };
    const updateSelectionFromApi = (api)=>{
      if(!api){
        return;
      }
      if(hasEnterprise && typeof api.getCellRanges === 'function'){
        try{
          const ranges = api.getCellRanges();
          if(Array.isArray(ranges) && ranges.length){
            const range = ranges[ranges.length - 1];
            const startRow = range.startRow?.rowIndex ?? range.startRow?.rowPinned ?? 0;
            const endRow = range.endRow?.rowIndex ?? range.endRow?.rowPinned ?? startRow;
            const startColId = range.startColumn?.getColId?.() ?? range.columns?.[0]?.getColId?.();
            const endColId = range.endColumn?.getColId?.() ?? startColId;
            const startCol = colIdToIndex(startColId);
            const endCol = colIdToIndex(endColId);
            setLastRange({
              from: { row: Math.min(startRow, endRow), col: Math.min(startCol, endCol) },
              to: { row: Math.max(startRow, endRow), col: Math.max(startCol, endCol) }
            });
            renderAg(api);
            fireHook('afterSelectionEnd', startRow, startCol, endRow, endCol);
            return;
          }
        }catch(err){
          console.debug('Debug: ag selection range not available', err);
        }
      }
      if(typeof api.getFocusedCell === 'function'){
        try{
          const focused = api.getFocusedCell();
          if(focused && Number.isInteger(focused.rowIndex)){
            const row = focused.rowIndex;
            const col = colIdToIndex(focused.column?.getColId?.());
            setLastRange({ from: { row, col }, to: { row, col } });
            renderAg(api);
            fireHook('afterSelectionEnd', row, col, row, col);
          }
        }catch(err){
          console.debug('Debug: ag focused cell not available', err);
        }
      }
    };

    const resolveViewport = ()=>{
      if(!container || typeof container.querySelector !== 'function'){
        return null;
      }
      return container.querySelector('.ag-body-viewport');
    };

    const scrollViewportToTop = ()=>{
      const viewport = resolveViewport();
      if(!viewport){
        return;
      }
      try{
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
      }catch(err){
        // best effort
      }
    };

    const captureViewportScroll = ()=>{
      const viewport = resolveViewport();
      if(!viewport){
        return null;
      }
      return {
        top: viewport.scrollTop,
        left: viewport.scrollLeft,
        scrollHeight: viewport.scrollHeight,
        clientHeight: viewport.clientHeight,
        capturedAt: Date.now()
      };
    };

    let pendingViewportRestore = null;
    const restoreViewportScroll = ()=>{
      if(!pendingViewportRestore){
        return;
      }
      const snapshot = pendingViewportRestore;
      pendingViewportRestore = null;
      const viewport = resolveViewport();
      if(!viewport){
        return;
      }
      const doc = viewport.ownerDocument || document;
      const win = doc.defaultView || global;
      const rafLocal = typeof win?.requestAnimationFrame === 'function'
        ? win.requestAnimationFrame.bind(win)
        : (fn)=>win.setTimeout(fn, 16);
      rafLocal(()=>{
        const prevHeight = snapshot.scrollHeight || 0;
        const newHeight = viewport.scrollHeight || prevHeight;
        const deltaHeight = newHeight - prevHeight;
        const prevTop = snapshot.top || 0;
        const prevClient = snapshot.clientHeight || viewport.clientHeight || 0;
        const prevRemaining = Math.max(0, (prevHeight - prevClient) - prevTop);
        const nearBottom = prevRemaining <= (autoGrowthConfig.rowThresholdPx * 2);
        let targetTop;
        if(nearBottom){
          targetTop = Math.max(0, newHeight - viewport.clientHeight);
        }else{
          targetTop = Math.max(0, prevTop + deltaHeight);
        }
        viewport.scrollTop = targetTop;
        viewport.scrollLeft = snapshot.left || 0;
      });
    };

    const autoGrowthDefaults = {
      enabled: true,
      rowThresholdPx: 200,
      colThresholdPx: 200,
      rowBatchSize: 50,
      colBatchSize: 5,
      rowCap: Math.max(rowCount, 50000),
      colCap: Math.max(colCount, 200),
      selectionThreshold: 2
    };
    const autoGrowthConfig = Object.assign({}, autoGrowthDefaults, overrides?.autoGrowth || {});
    autoGrowthConfig.rowBatchSize = Math.max(1, autoGrowthConfig.rowBatchSize | 0);
    autoGrowthConfig.colBatchSize = Math.max(1, autoGrowthConfig.colBatchSize | 0);
    autoGrowthConfig.rowCap = Math.max(rowCount, autoGrowthConfig.rowCap | 0 || rowCount);
    autoGrowthConfig.colCap = Math.max(colCount, autoGrowthConfig.colCap | 0 || colCount);
    autoGrowthConfig.selectionThreshold = Math.max(0, autoGrowthConfig.selectionThreshold | 0);

    const autoGrowthState = { viewportScrollAttached: false, viewportScrollHandler: null };

    const shouldGrowRows = ()=>{
      if(!autoGrowthConfig.enabled){
        return false;
      }
      const totalRows = dataHandle.current.length;
      if(totalRows >= autoGrowthConfig.rowCap){
        return false;
      }
      const selection = normalizedSelectionRange || normalizeRange(lastRange);
      let nearSelection = false;
      if(selection && Number.isInteger(selection.to?.row)){
        nearSelection = (totalRows - 1 - selection.to.row) <= autoGrowthConfig.selectionThreshold;
      }
      let nearScroll = false;
      const viewport = resolveViewport();
      if(viewport){
        const remaining = viewport.scrollHeight - (viewport.scrollTop + viewport.clientHeight);
        nearScroll = remaining <= autoGrowthConfig.rowThresholdPx;
      }
      return nearSelection || nearScroll;
    };

    const shouldGrowCols = ()=>{
      if(!autoGrowthConfig.enabled){
        return false;
      }
      if(colCount >= autoGrowthConfig.colCap){
        return false;
      }
      const selection = normalizedSelectionRange || normalizeRange(lastRange);
      let nearSelection = false;
      if(selection && Number.isInteger(selection.to?.col)){
        nearSelection = (colCount - 1 - selection.to.col) <= autoGrowthConfig.selectionThreshold;
      }
      let nearScroll = false;
      const viewport = resolveViewport();
      if(viewport){
        const remaining = viewport.scrollWidth - (viewport.scrollLeft + viewport.clientWidth);
        nearScroll = remaining <= autoGrowthConfig.colThresholdPx;
      }
      return nearSelection || nearScroll;
    };

    const maybeGrowRows = (reason)=>{
      if(!shouldGrowRows()){
        return;
      }
      const prevScroll = captureViewportScroll();
      const totalRows = dataHandle.current.length;
      const amount = Math.min(autoGrowthConfig.rowBatchSize, autoGrowthConfig.rowCap - totalRows);
      if(amount <= 0){
        return;
      }
      appendRows(amount);
      if(prevScroll){
        pendingViewportRestore = prevScroll;
      }
      triggerSchedule('autoGrowRows', { amount, reason });
    };

    const maybeGrowCols = (reason)=>{
      if(!shouldGrowCols()){
        return;
      }
      const prevScroll = captureViewportScroll();
      const insertAt = Math.max(0, colCount - 1);
      const amount = Math.min(autoGrowthConfig.colBatchSize, autoGrowthConfig.colCap - colCount);
      if(amount <= 0){
        return;
      }
      instance.alter('insert_col_end', insertAt, amount, 'autoGrow');
      if(prevScroll){
        pendingViewportRestore = prevScroll;
      }
      triggerSchedule('autoGrowCols', { amount, reason });
    };

    const ensureViewportScrollHandler = ()=>{
      if(autoGrowthState.viewportScrollAttached){
        return;
      }
      const viewport = resolveViewport();
      if(!viewport){
        return;
      }
      const onScroll = ()=>{
        maybeGrowRows('scroll');
        maybeGrowCols('scroll');
      };
      viewport.addEventListener('scroll', onScroll, { passive: true });
      autoGrowthState.viewportScrollAttached = true;
      autoGrowthState.viewportScrollHandler = onScroll;
    };

    const captureExclusionState = ()=>exclusionController.exportState();
    const recordExclusionUndo = (label, prevState, nextState)=>{
      const before = prevState || captureExclusionState();
      const after = nextState || captureExclusionState();
      if(JSON.stringify(before) === JSON.stringify(after)){
        return;
      }
      if(hasGlobalUndo){
        undoManager.record({
          label: label || `table:${debugLabel}:exclusion`,
          scope: undoScope,
          undo: ()=>exclusionController.importState(before),
          redo: ()=>exclusionController.importState(after)
        });
      }
    };

    const applyExclusionChange = (label, fn)=>{
      const prev = captureExclusionState();
      fn();
      const next = captureExclusionState();
      recordExclusionUndo(label, prev, next);
    };

    let batchDepth = 0;
    let pendingRender = false;
    let pendingRebuildColumns = false;
    let pendingSyncRowData = false;
    let pendingSchedulePayload = null;

    const applyColumnDefs = (api, defs)=>{
      if(!api || !Array.isArray(defs)){
        return;
      }
      try{
        if(typeof api.setGridOption === 'function'){
          api.setGridOption('columnDefs', defs);
          return;
        }
        if(typeof api.setColumnDefs === 'function'){
          api.setColumnDefs(defs);
        }
      }catch(err){
        console.error('Shared.hot AG applyColumnDefs error', err);
      }
    };

    const applyRowData = (api, rows)=>{
      if(!api || !Array.isArray(rows)){
        return;
      }
      try{
        if(typeof api.setGridOption === 'function'){
          api.setGridOption('rowData', rows);
          return;
        }
        if(typeof api.setRowData === 'function'){
          api.setRowData(rows);
        }
      }catch(err){
        console.error('Shared.hot AG applyRowData error', err);
      }
    };

    const applyHeaderHeight = (api, height)=>{
      if(!api){
        return;
      }
      try{
        if(typeof api.setHeaderHeight === 'function'){
          api.setHeaderHeight(height);
          return;
        }
        if(typeof api.setGridOption === 'function'){
          api.setGridOption('headerHeight', height);
        }
      }catch(err){
        console.error('Shared.hot AG headerHeight update error', err);
      }
    };

    const triggerSchedule = (reason, meta)=>{
      if(!scheduleFn){
        return;
      }
      const payload = Object.assign({ reason }, meta || {});
      if(batchDepth > 0){
        pendingSchedulePayload = payload;
        return;
      }
      try{
        scheduleFn(payload);
      }catch(err){
        console.error('Shared.hot AG schedule error', err);
      }
    };

    const renderAg = (api)=>{
      if(batchDepth > 0){
        pendingRender = true;
        return;
      }
      if(api && typeof api.refreshCells === 'function'){
        try{
          api.refreshCells({ force: true });
        }catch(err){
          console.error('Shared.hot AG refreshCells error', err);
        }
      }
    };

    const autoSizeColumnsEnabled = overrides?.autoSizeColumns !== false;
    let autoSizeScheduled = false;
    const autoSizeColumnsNow = (reason)=>{
      if(!autoSizeColumnsEnabled){
        return;
      }
      const api = instance.gridApi;
      const columnApi = instance.columnApi || api?.columnApi || null;
      if(!columnApi){
        return;
      }
      try{
        let columns = [];
        if(typeof columnApi.getAllDisplayedColumns === 'function'){
          columns = columnApi.getAllDisplayedColumns() || [];
        }else if(typeof columnApi.getAllColumns === 'function'){
          columns = columnApi.getAllColumns() || [];
        }
        const colIds = columns
          .map(col => (typeof col?.getColId === 'function' ? col.getColId() : (col?.colId ?? null)))
          .filter(id => id && id !== '__rowHeader' && String(id).startsWith('c'));
        if(!colIds.length){
          return;
        }
        if(typeof columnApi.autoSizeColumns === 'function'){
          columnApi.autoSizeColumns(colIds, false);
        }else if(typeof api?.autoSizeColumns === 'function'){
          api.autoSizeColumns(colIds, false);
        }else if(typeof api?.autoSizeAllColumns === 'function'){
          api.autoSizeAllColumns(false);
        }
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot AG autoSizeColumns', { debugLabel, reason: reason || null, colCount: colIds.length });
        }
      }catch(err){
        // best-effort only
      }
    };

    const scheduleAutoSizeColumns = (reason)=>{
      if(!autoSizeColumnsEnabled || autoSizeScheduled){
        return;
      }
      autoSizeScheduled = true;
      const doc = container?.ownerDocument || document;
      const win = doc.defaultView || global;
      const rafLocal = typeof win?.requestAnimationFrame === 'function'
        ? win.requestAnimationFrame.bind(win)
        : (fn)=>win.setTimeout(fn, 16);

      // Two RAFs makes this more reliable when the grid is inside a flex layout or just became visible.
      rafLocal(()=>{
        rafLocal(()=>{
          autoSizeScheduled = false;
          autoSizeColumnsNow(reason);
        });
      });
    };

    const rebuildColumns = (api)=>{
      columnDefs = buildColumnDefs();
      if(batchDepth > 0){
        pendingRebuildColumns = true;
        return;
      }
      applyColumnDefs(api, columnDefs);
      applyHeaderHeight(api, colHeadersEnabled ? 24 : 0);
      scheduleAutoSizeColumns('rebuildColumns');
    };

    const syncRowData = (api)=>{
      rowData = buildRowData();
      if(batchDepth > 0){
        pendingSyncRowData = true;
        return;
      }
      applyRowData(api, rowData);
      restoreViewportScroll();
      scheduleAutoSizeColumns('rowData');
    };

    const appendRows = (count)=>{
      const amount = Math.max(0, Number(count) || 0);
      if(amount <= 0){
        return;
      }
      const startIndex = dataHandle.current.length;
      const cols = Math.max(colCount, MIN_INPUT_COLS);
      for(let i = 0; i < amount; i++){
        const row = Array.from({ length: cols }, ()=>'');
        dataHandle.current.push(row);
      }
      rowCount = dataHandle.current.length;
      colCount = cols;
      const newRowData = Array.from({ length: amount }, (_, idx)=>({ __rowIndex: startIndex + idx }));
      rowData.push(...newRowData);

      const api = instance.gridApi;
      let usedTransaction = false;
      if(api && typeof api.applyTransaction === 'function'){
        try{
          api.applyTransaction({ add: newRowData });
          usedTransaction = true;
        }catch(err){
          console.debug('Debug: ag appendRows transaction failed, falling back', { debugLabel, err });
        }
      }
      if(!usedTransaction){
        applyRowData(api, rowData);
      }
    };

    const flushBatch = ()=>{
      if(batchDepth > 0){
        return;
      }
      const api = instance.gridApi;
      if(pendingSyncRowData){
        pendingSyncRowData = false;
        applyRowData(api, rowData);
        restoreViewportScroll();
      }
      if(pendingRebuildColumns){
        pendingRebuildColumns = false;
        applyColumnDefs(api, columnDefs);
        applyHeaderHeight(api, colHeadersEnabled ? 24 : 0);
      }
      if(pendingRender){
        pendingRender = false;
        renderAg(api);
      }
      scheduleAutoSizeColumns('batch');
      if(pendingSchedulePayload){
        const payload = pendingSchedulePayload;
        pendingSchedulePayload = null;
        try{
          scheduleFn(payload);
        }catch(err){
          console.error('Shared.hot AG schedule flush error', err);
        }
      }
    };

    const getHeaderLabel = (col)=>{
      if(!colHeaders){
        return null;
      }
      if(typeof col === 'number'){
        return colHeaders[col];
      }
      return colHeaders.slice();
    };

    const instance = {
      rootElement: container,
      __hotDebugLabel: debugLabel,
      __hotExclusionController: exclusionController,
      __hotClearCopyHighlight(){
        setCopyHighlightRange(null);
        renderAg(instance.gridApi);
      },
      __hotRefreshHeaderWidths: noop,
      __hotHeaderWidthManager: headerWidthManager,
      getSettings(){
        return { minRows: rowCount, minCols: colCount };
      },
      updateSettings(opts){
        data = dataHandle.current;
        if(!opts || typeof opts !== 'object'){
          return;
        }
        let needsSync = false;
        let needsRebuild = false;
        let needsSchedule = false;
        const hasIncomingData = Object.prototype.hasOwnProperty.call(opts, 'data') && Array.isArray(opts.data);
        const existingExclusions = hasIncomingData && preserveExclusionsOnLoad ? exclusionController.exportState() : null;

        if(Object.prototype.hasOwnProperty.call(opts, 'rowHeaders')){
          rowHeadersSetting = opts.rowHeaders;
          rowHeadersEnabled = rowHeadersSetting !== false;
          needsRebuild = true;
        }
        if(Object.prototype.hasOwnProperty.call(opts, 'colHeaders')){
          colHeadersSetting = opts.colHeaders;
          colHeadersEnabled = colHeadersSetting !== false;
          needsRebuild = true;
        }
        if(hasIncomingData){
          data = ensureDims(opts.data, rowCount, colCount);
          dataHandle.current = data;
          needsSync = true;
          needsSchedule = true;
          if(existingExclusions){
            exclusionController.importState(existingExclusions);
          }else{
            exclusionController.clearAll(true);
          }
          pendingViewportRestore = null;
        }
        if(Number.isFinite(opts.minRows)){
          rowCount = Math.max(0, Number(opts.minRows));
          ensureDims(data, rowCount, colCount);
          dataHandle.current = data;
          needsSync = true;
          needsSchedule = true;
        }
        if(Number.isFinite(opts.minCols)){
          colCount = Math.max(MIN_INPUT_COLS, Number(opts.minCols));
          ensureDims(data, rowCount, colCount);
          dataHandle.current = data;
          needsSync = true;
          needsRebuild = true;
          needsSchedule = true;
        }
        if(Object.prototype.hasOwnProperty.call(opts, 'nestedHeaders')){
          nestedHeadersSetting = opts.nestedHeaders;
          instance.__agNestedHeaders = opts.nestedHeaders;
          needsRebuild = true;
        }

        if(needsRebuild){
          colHeaders = resolveColHeaders(colCount);
        }
        if(needsSync){
          syncRowData(instance.gridApi);
        }
        if(needsRebuild){
          rebuildColumns(instance.gridApi);
        }
        if(needsSchedule){
          if(hasIncomingData){
            fireHook('afterLoadData');
            triggerSchedule('afterLoadData', { source: 'updateSettings' });
          }else{
            triggerSchedule('updateSettings', { source: 'updateSettings' });
          }
        }
        renderAg(instance.gridApi);
      },
      countRows(){ return dataHandle.current.length; },
      countCols(){ return colCount; },
      countSourceRows(){ return dataHandle.current.length; },
      countSourceCols(){ return colCount; },
      getSourceData(){ return dataHandle.current; },
      getData(rowStart, colStart, rowEnd, colEnd){
        if([rowStart, colStart, rowEnd, colEnd].every(v => typeof v === 'undefined')){
          return dataHandle.current;
        }
        const rs = Math.max(0, rowStart || 0);
        const cs = Math.max(0, colStart || 0);
        const matrix = dataHandle.current;
        const visualRowCount = getVisualRowCount();
        const re = Math.min(Math.max(0, visualRowCount - 1), typeof rowEnd === 'number' ? rowEnd : (visualRowCount - 1));
        const ce = Math.min(colCount - 1, typeof colEnd === 'number' ? colEnd : colCount - 1);
        const slice = [];
        for(let visualRow = rs; visualRow <= re; visualRow++){
          const physicalRow = toPhysicalRowIndex(visualRow);
          const row = Number.isInteger(physicalRow) ? (matrix[physicalRow] || []) : [];
          slice.push(row.slice(cs, ce + 1));
        }
        return slice;
      },
      getColHeader(col){
        return getHeaderLabel(col);
      },
      toPhysicalRow(row){ return toPhysicalRowIndex(row); },
      toPhysicalColumn(col){ return toPhysicalColIndex(col); },
      getSelectedLast(){
        if(!normalizedSelectionRange){
          return null;
        }
        return [
          normalizedSelectionRange.from.row,
          normalizedSelectionRange.from.col,
          normalizedSelectionRange.to.row,
          normalizedSelectionRange.to.col
        ];
      },
      getSelectedRangeLast(){
        return normalizedSelectionRange ? Object.assign({}, normalizedSelectionRange) : null;
      },
      selectCell(row, col, endRow, endCol){
        const r1 = Number(row);
        const c1 = Number(col);
        const r2 = Number.isFinite(endRow) ? Number(endRow) : r1;
        const c2 = Number.isFinite(endCol) ? Number(endCol) : c1;
        setLastRange({ from: { row: r1, col: c1 }, to: { row: r2, col: c2 } });
        renderAg(instance.gridApi);
        const normalized = normalizedSelectionRange || normalizeRange(lastRange) || { from: { row: r1, col: c1 }, to: { row: r2, col: c2 } };
        fireHook('afterSelectionEnd', normalized.from.row, normalized.from.col, normalized.to.row, normalized.to.col);
      },
      getDataAtCell(row, col){
        const matrix = dataHandle.current;
        const r = Number(row);
        const c = Number(col);
        if(!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0){
          return null;
        }
        const physicalRow = toPhysicalRowIndex(r);
        const physicalCol = toPhysicalColIndex(c);
        if(!Number.isInteger(physicalRow) || !Number.isInteger(physicalCol) || physicalRow < 0 || physicalCol < 0){
          return null;
        }
        if(exclusionController.isCellExcluded(physicalRow, physicalCol)){
          return null;
        }
        return matrix[physicalRow]?.[physicalCol];
      },
      getDataAtRow(row){
        const matrix = dataHandle.current;
        const r = Number(row);
        if(!Number.isInteger(r) || r < 0){
          return [];
        }
        const physicalRow = toPhysicalRowIndex(r);
        if(!Number.isInteger(physicalRow) || physicalRow < 0 || physicalRow >= matrix.length){
          return [];
        }
        const values = [];
        for(let visualCol = 0; visualCol < colCount; visualCol++){
          const physicalCol = toPhysicalColIndex(visualCol);
          if(!Number.isInteger(physicalCol) || physicalCol < 0){
            values.push(null);
            continue;
          }
          const excluded = exclusionController.isCellExcluded(physicalRow, physicalCol);
          values.push(excluded ? null : matrix[physicalRow][physicalCol]);
        }
        return values;
      },
      getDataAtCol(col){
        const matrix = dataHandle.current;
        const c = Number(col);
        if(!Number.isInteger(c) || c < 0){
          return [];
        }
        const physicalCol = toPhysicalColIndex(c);
        if(!Number.isInteger(physicalCol) || physicalCol < 0 || physicalCol >= colCount){
          return [];
        }
        const values = [];
        const visualRowCount = getVisualRowCount();
        for(let visualRow = 0; visualRow < visualRowCount; visualRow++){
          const physicalRow = toPhysicalRowIndex(visualRow);
          if(!Number.isInteger(physicalRow) || physicalRow < 0){
            values.push(null);
            continue;
          }
          const excluded = exclusionController.isCellExcluded(physicalRow, physicalCol);
          values.push(excluded ? null : matrix[physicalRow]?.[physicalCol]);
        }
        return values;
      },
      setDataAtCell(rowOrChanges, colOrSource, value, source){
        data = dataHandle.current;
        if(Array.isArray(rowOrChanges)){
          const entries = rowOrChanges;
          const changeSource = typeof colOrSource === 'string'
            ? colOrSource
            : (typeof source === 'string' ? source : 'edit');
          if(!entries.length){
            return;
          }
          let maxPhysicalRow = -1;
          let maxPhysicalCol = -1;
          for(let i = 0; i < entries.length; i++){
            const entry = entries[i];
            if(!Array.isArray(entry) || entry.length < 3){
              continue;
            }
            const r = Number(entry[0]);
            const c = Number(entry[1]);
            if(!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0){
              continue;
            }
            const physicalRow = toPhysicalRowIndex(r);
            const physicalCol = toPhysicalColIndex(c);
            if(!Number.isInteger(physicalRow) || !Number.isInteger(physicalCol) || physicalRow < 0 || physicalCol < 0){
              continue;
            }
            maxPhysicalRow = Math.max(maxPhysicalRow, physicalRow);
            maxPhysicalCol = Math.max(maxPhysicalCol, physicalCol);
          }
          if(maxPhysicalRow < 0 || maxPhysicalCol < 0){
            return;
          }
          const prevRows = data.length;
          const prevCols = colCount;
          ensureDims(data, Math.max(maxPhysicalRow + 1, rowCount), Math.max(maxPhysicalCol + 1, colCount));
          const changesForHook = [];
          for(let i = 0; i < entries.length; i++){
            const entry = entries[i];
            if(!Array.isArray(entry) || entry.length < 3){
              continue;
            }
            const r = Number(entry[0]);
            const c = Number(entry[1]);
            if(!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0){
              continue;
            }
            const physicalRow = toPhysicalRowIndex(r);
            const physicalCol = toPhysicalColIndex(c);
            if(!Number.isInteger(physicalRow) || !Number.isInteger(physicalCol) || physicalRow < 0 || physicalCol < 0){
              continue;
            }
            const hasOldAndNew = entry.length >= 4;
            const prev = hasOldAndNew ? entry[2] : data[physicalRow][physicalCol];
            const next = hasOldAndNew ? entry[3] : entry[2];
            if(prev === next){
              continue;
            }
            data[physicalRow][physicalCol] = next;
            changesForHook.push([r, c, prev, next]);
          }
          if(!changesForHook.length){
            return;
          }
          dataHandle.current = data;
          if(data.length !== prevRows){
            syncRowData(instance.gridApi);
          }
          if(colCount !== prevCols){
            colHeaders = resolveColHeaders(colCount);
            rebuildColumns(instance.gridApi);
          }
          if(!(changeSource === 'cut' && pendingCutMove) && !(changeSource === 'paste' && pendingCutMove)){
            recordUndoFromVisualChanges(changeSource, changesForHook, changeSource);
          }
          fireHook('afterChange', changesForHook, changeSource);
          triggerSchedule('afterChange', { source: changeSource });
          scheduleAutoSizeColumns(changeSource);
          renderAg(instance.gridApi);
          return;
        }
        const r = Number(rowOrChanges);
        const c = Number(colOrSource);
        const changeSource = typeof source === 'string' ? source : 'edit';
        if(!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || c < 0){
          return;
        }
        const physicalRow = toPhysicalRowIndex(r);
        const physicalCol = toPhysicalColIndex(c);
        if(!Number.isInteger(physicalRow) || !Number.isInteger(physicalCol) || physicalRow < 0 || physicalCol < 0){
          return;
        }
        const prevCols = colCount;
        ensureDims(data, Math.max(physicalRow + 1, rowCount), Math.max(physicalCol + 1, colCount));
        const prev = data[physicalRow][physicalCol];
        if(prev === value){
          return;
        }
        data[physicalRow][physicalCol] = value;
        dataHandle.current = data;
        if(colCount !== prevCols){
          colHeaders = resolveColHeaders(colCount);
          rebuildColumns(instance.gridApi);
        }
        if(!(changeSource === 'cut' && pendingCutMove) && !(changeSource === 'paste' && pendingCutMove)){
          recordUndoFromVisualChanges(changeSource, [[r, c, prev, value]], changeSource);
        }
        fireHook('afterChange', [[r, c, prev, value]], changeSource);
        triggerSchedule('afterChange', { source: changeSource });
        scheduleAutoSizeColumns(changeSource);
        renderAg(instance.gridApi);
      },
      loadData(nextData){
        const existingExclusions = preserveExclusionsOnLoad ? exclusionController.exportState() : null;
        data = Array.isArray(nextData) ? ensureDims(nextData, rowCount, colCount) : createEmptyData(rowCount, colCount);
        dataHandle.current = data;
        colHeaders = resolveColHeaders(colCount);
        if(existingExclusions){
          exclusionController.importState(existingExclusions);
        }else{
          exclusionController.clearAll(true);
        }
        syncRowData(instance.gridApi);
        rebuildColumns(instance.gridApi);
        recordCall('loadData', {
          containerId: container?.id || null,
          rows: data.length,
          firstRow: trimRow(Array.isArray(data[0]) ? data[0] : null)
        });
        fireHook('afterLoadData');
        if(scheduleOnLoadData){
          triggerSchedule('afterLoadData', { source: 'loadData' });
        }
        pendingViewportRestore = null;
        scrollViewportToTop();
        setLastRange({ from: { row: 0, col: 0 }, to: { row: 0, col: 0 } });
        renderAg(instance.gridApi);
      },
      alter(action, index, amount, source){
        data = dataHandle.current;
        const safeAmount = Math.max(0, Number(amount) || 0);
        const at = Math.max(0, Number(index) || 0);
        const changeSource = typeof source === 'string' ? source : action;
        if(safeAmount === 0){
          return;
        }
        if(action === 'insert_row_above' || action === 'insert_row_below' || action === 'insert_row'){
          const insertAt = action === 'insert_row_above' ? at : at + (action === 'insert_row_below' ? 1 : 0);
          const rows = Array.from({ length: safeAmount }, ()=>Array.from({ length: colCount }, ()=>''));
          data.splice(insertAt, 0, ...rows);
          ensureDims(data, data.length, colCount);
          dataHandle.current = data;
          syncRowData(instance.gridApi);
          fireHook('afterCreateRow', insertAt, safeAmount, changeSource);
          triggerSchedule('afterCreateRow', { source: changeSource });
        }else if(action === 'remove_row'){
          const removed = data.splice(at, safeAmount);
          exclusionController.shiftRowsForRemoval(Array.from({ length: safeAmount }, (_, idx)=>at + idx));
          ensureDims(data, rowCount, colCount);
          dataHandle.current = data;
          syncRowData(instance.gridApi);
          fireHook('afterRemoveRow', at, safeAmount, Array.isArray(removed) ? removed.map((_, idx)=>at + idx) : null, changeSource);
          triggerSchedule('afterRemoveRow', { source: changeSource });
        }else if(action === 'insert_col' || action === 'insert_col_right' || action === 'insert_col_left' || action === 'insert_col_start' || action === 'insert_col_end'){
          const insertAt = action === 'insert_col_start'
            ? 0
            : (action === 'insert_col_left'
              ? at
              : at + (action === 'insert_col_right' || action === 'insert_col_end' ? 1 : 0));
          for(let r = 0; r < data.length; r++){
            const row = data[r] || [];
            const emptyCols = Array.from({ length: safeAmount }, ()=>'');
            row.splice(insertAt, 0, ...emptyCols);
            data[r] = row;
          }
          dataHandle.current = data;
          colHeaders = resolveColHeaders(colCount + safeAmount);
          colCount = Math.max(colCount + safeAmount, MIN_INPUT_COLS);
          rebuildColumns(instance.gridApi);
          renderAg(instance.gridApi);
          fireHook('afterCreateCol', insertAt, safeAmount, changeSource);
          triggerSchedule('afterCreateCol', { source: changeSource });
        }else if(action === 'remove_col'){
          const removedCols = [];
          for(let r = 0; r < data.length; r++){
            const row = data[r] || [];
            for(let k = 0; k < safeAmount; k++){
              row.splice(at, 1);
            }
          }
          for(let k = 0; k < safeAmount; k++){
            removedCols.push(at + k);
          }
          exclusionController.shiftColsForRemoval(removedCols);
          dataHandle.current = data;
          colCount = Math.max(MIN_INPUT_COLS, colCount - safeAmount);
          colHeaders = resolveColHeaders(colCount);
          rebuildColumns(instance.gridApi);
          renderAg(instance.gridApi);
          fireHook('afterRemoveCol', at, safeAmount, removedCols, changeSource);
          triggerSchedule('afterRemoveCol', { source: changeSource });
        }
      },
      populateFromArray(startRow, startCol, block, endRow, endCol, _method, source){
        data = dataHandle.current;
        if(!Array.isArray(block)){
          return;
        }
        const sr = Math.max(0, Number(startRow) || 0);
        const sc = Math.max(0, Number(startCol) || 0);
        const dataRows = block.length;
        const dataCols = dataRows > 0 && Array.isArray(block[0]) ? block[0].length : 0;
        const er = Math.max(sr + dataRows - 1, Number(endRow) || (sr + dataRows - 1));
        const ec = Math.max(sc + dataCols - 1, Number(endCol) || (sc + dataCols - 1));
        const physicalRows = Array.from({ length: dataRows }, (_, idx)=>{
          const physical = toPhysicalRowIndex(sr + idx);
          return Number.isInteger(physical) && physical >= 0 ? physical : null;
        });
        const physicalCols = Array.from({ length: dataCols }, (_, idx)=>{
          const physical = toPhysicalColIndex(sc + idx);
          return Number.isInteger(physical) && physical >= 0 ? physical : null;
        });
        const maxPhysicalRow = physicalRows.reduce((acc, value)=>value == null ? acc : Math.max(acc, value), -1);
        const maxPhysicalCol = physicalCols.reduce((acc, value)=>value == null ? acc : Math.max(acc, value), -1);
        if(maxPhysicalRow >= 0 && maxPhysicalCol >= 0){
          ensureDims(data, Math.max(maxPhysicalRow + 1, rowCount), Math.max(maxPhysicalCol + 1, colCount));
        }
        const changes = [];
        for(let r = 0; r < dataRows; r++){
          const physicalRow = physicalRows[r];
          if(physicalRow == null){
            continue;
          }
          for(let c = 0; c < dataCols; c++){
            const targetRow = sr + r;
            const targetCol = sc + c;
            const physicalCol = physicalCols[c];
            if(physicalCol == null){
              continue;
            }
            const prev = data[physicalRow][physicalCol];
            const next = block[r][c];
            if(prev === next){
              continue;
            }
            data[physicalRow][physicalCol] = next;
            changes.push([targetRow, targetCol, prev, next]);
          }
        }
        dataHandle.current = data;
        syncRowData(instance.gridApi);
        rebuildColumns(instance.gridApi);
        if(changes.length){
          const sourceLabel = typeof source === 'string' ? source : 'populateFromArray';
          if(pendingCutMove && sourceLabel !== 'paste'){
            flushPendingCutMove('nonPaste');
          }
          if(sourceLabel === 'paste' && pendingCutMove && normalizeClipboardText(pendingPasteText) === pendingCutMove.clipboardText){
            const pastePhysical = buildPhysicalChangeListFromVisualChanges(changes);
            const composite = dedupePhysicalChanges([...(pendingCutMove.changes || []), ...pastePhysical]);
            const timerToClear = pendingCutMoveTimer;
            pendingCutMove = null;
            pendingPasteText = '';
            pendingCutMoveTimer = null;
            if(timerToClear){
              try{
                const doc = container?.ownerDocument || document;
                const win = doc.defaultView || global;
                win?.clearTimeout?.(timerToClear);
              }catch(err){
                // ignore
              }
            }
            pushUndoStep(`table:${debugLabel}:move`, composite);
          }else{
            recordUndoFromVisualChanges(sourceLabel, changes, sourceLabel);
          }
        }
        if(changes.length){
          fireHook('afterChange', changes, source || 'populateFromArray');
        }
        fireHook('afterPaste', block, [{ startRow: sr, startCol: sc, endRow: er, endCol: ec }]);
        triggerSchedule('afterPaste', { source: source || 'populateFromArray' });
        scheduleAutoSizeColumns(source || 'paste');
        renderAg(instance.gridApi);
      },
      render(){
        renderAg(instance.gridApi);
      },
      refreshHeaderWidths(){
        renderAg(instance.gridApi);
      },
      addHook(name, fn){
        addHook(name, fn);
      },
      isUndoAvailable(){
        return undoPointer >= 0;
      },
      isRedoAvailable(){
        return undoPointer + 1 < undoStack.length;
      },
      undo(){
        if(undoPointer < 0){
          return false;
        }
        const step = undoStack[undoPointer];
        return step ? applyUndoStepById('undo', step.id) : false;
      },
      redo(){
        if(undoPointer + 1 >= undoStack.length){
          return false;
        }
        const step = undoStack[undoPointer + 1];
        return step ? applyUndoStepById('redo', step.id) : false;
      },
      destroy(){
        flushPendingCutMove('destroy');
        runCleanup();
        if(autoGrowthState.viewportScrollAttached){
          const viewport = resolveViewport();
          if(viewport && autoGrowthState.viewportScrollHandler){
            viewport.removeEventListener('scroll', autoGrowthState.viewportScrollHandler);
          }
        }
        if(instance.gridApi && typeof instance.gridApi.destroy === 'function'){
          instance.gridApi.destroy();
        }
      }
      ,
      batch(fn){
        if(typeof fn !== 'function'){
          return;
        }
        batchDepth += 1;
        try{
          fn();
        }finally{
          batchDepth = Math.max(0, batchDepth - 1);
          if(batchDepth === 0){
            flushBatch();
          }
        }
      }
    };
    Object.defineProperty(instance, '_data', {
      get(){ return dataHandle.current; },
      set(value){
        if(Array.isArray(value)){
          data = ensureDims(value, rowCount, colCount);
          dataHandle.current = data;
          syncRowData(instance.gridApi);
          rebuildColumns(instance.gridApi);
          renderAg(instance.gridApi);
        }
      }
    });
    Object.defineProperty(instance, '_settings', {
      get(){ return { minRows: rowCount, minCols: colCount }; },
      set(value){
        if(!value || typeof value !== 'object'){
          return;
        }
        if(Number.isFinite(value.minRows)){
          rowCount = Math.max(0, Number(value.minRows));
        }
        if(Number.isFinite(value.minCols)){
          colCount = Math.max(MIN_INPUT_COLS, Number(value.minCols));
        }
        data = dataHandle.current;
        ensureDims(data, rowCount, colCount);
        dataHandle.current = data;
        syncRowData(instance.gridApi);
        rebuildColumns(instance.gridApi);
        renderAg(instance.gridApi);
      }
    });

    let customContextMenu = null;
    const closeCustomMenu = ()=>{
      if(customContextMenu && customContextMenu.parentNode){
        customContextMenu.parentNode.removeChild(customContextMenu);
      }
      customContextMenu = null;
    };
    const openCustomMenu = (event, items)=>{
      closeCustomMenu();
      const doc = container?.ownerDocument || document;
      const menu = doc.createElement('div');
      menu.className = 'ag-hot-menu';
      menu.style.position = 'fixed';
      menu.style.zIndex = '9999';
      menu.style.background = '#fff';
      menu.style.border = '1px solid #ccc';
      menu.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      menu.style.fontSize = '13px';
      menu.style.minWidth = '180px';
      items.forEach(item=>{
        if(item === 'separator'){
          const sep = doc.createElement('div');
          sep.style.borderTop = '1px solid #eee';
          menu.appendChild(sep);
          return;
        }
        const entry = doc.createElement('div');
        entry.textContent = item.label;
        entry.style.padding = '6px 10px';
        entry.style.cursor = item.disabled ? 'not-allowed' : 'pointer';
        entry.style.color = item.disabled ? '#aaa' : '#222';
        entry.addEventListener('click', ()=>{
          if(item.disabled){ return; }
          item.action?.();
          closeCustomMenu();
        });
        menu.appendChild(entry);
      });
      menu.addEventListener('mouseleave', ()=>setTimeout(closeCustomMenu, 150));
      doc.body.appendChild(menu);
      const x = event?.clientX ?? 0;
      const y = event?.clientY ?? 0;
      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
      customContextMenu = menu;
      doc.addEventListener('click', closeCustomMenu, { once: true });
    };

    const gridOptions = {
      rowData,
      columnDefs,
      defaultColDef: {
        editable: true,
        resizable: true,
        minWidth: 40,
        suppressHeaderMenuButton: true,
        comparator: valueComparator
      },
      rowSelection: { mode: 'multiRow', headerCheckbox: false },
      suppressRowHoverHighlight: true,
      suppressMenuHide: true,
      ensureDomOrder: true,
      headerHeight: colHeadersEnabled ? 24 : 0,
      autoSizeStrategy: autoSizeColumnsEnabled ? { type: 'fitCellContents' } : undefined,
      postSortRows: function(params){
        try{
          const nodes = params?.nodes;
          if(!Array.isArray(nodes) || nodes.length < 2){
            return;
          }
          const matrix = dataHandle.current;
          const isValueEmpty = (value)=>{
            if(value == null){
              return true;
            }
            if(typeof value === 'string'){
              return value.trim() === '';
            }
            return false;
          };
          const isPhysicalRowAllEmpty = (physicalRow)=>{
            if(!Number.isInteger(physicalRow) || physicalRow < 0){
              return false;
            }
            const rowValues = Array.isArray(matrix?.[physicalRow]) ? matrix[physicalRow] : [];
            for(let c = 0; c < colCount; c++){
              if(!isValueEmpty(rowValues[c])){
                return false;
              }
            }
            return true;
          };

          const headerNodes = [];
          const nonEmptyNodes = [];
          const emptyNodes = [];
          for(let i = 0; i < nodes.length; i++){
            const node = nodes[i];
            const physicalRow = node?.data?.__rowIndex ?? node?.rowIndex;
            if(treatFirstRowAsHeader && physicalRow === 0){
              headerNodes.push(node);
              continue;
            }
            if(isPhysicalRowAllEmpty(physicalRow)){
              emptyNodes.push(node);
            }else{
              nonEmptyNodes.push(node);
            }
          }

          const emptyNodesHavePhysical = emptyNodes.every(node => Number.isInteger(node?.data?.__rowIndex ?? node?.rowIndex));
          if(emptyNodesHavePhysical){
            emptyNodes.sort((a, b)=>{
              const aRow = a?.data?.__rowIndex ?? a?.rowIndex ?? 0;
              const bRow = b?.data?.__rowIndex ?? b?.rowIndex ?? 0;
              return aRow - bRow;
            });
          }

          nodes.length = 0;
          headerNodes.forEach(node => nodes.push(node));
          nonEmptyNodes.forEach(node => nodes.push(node));
          emptyNodes.forEach(node => nodes.push(node));
        }catch(err){
          console.debug('Debug: Shared.hot AG postSortRows error', { debugLabel, err });
        }
      },
      onGridReady(params){
        instance.gridApi = params.api;
        instance.columnApi = params.columnApi;
        updateSelectionFromApi(params.api);
        scheduleAutoSizeColumns('gridReady');
        ensureViewportScrollHandler();
        maybeGrowRows('gridReady');
        maybeGrowCols('gridReady');
      },
      onFirstDataRendered(){
        scheduleAutoSizeColumns('firstDataRendered');
        ensureViewportScrollHandler();
      },
      onCellValueChanged(event){
        const rowIndex = event?.node?.rowIndex ?? event?.rowIndex ?? 0;
        const colId = event?.column?.getColId?.() ?? event?.colId;
        const colIndex = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : 0;
        if(undoLockDepth === 0){
          const physicalRow = event?.node?.data?.__rowIndex;
          const physicalCol = colIndex;
          if(Number.isInteger(physicalRow) && physicalRow >= 0 && Number.isInteger(physicalCol) && physicalCol >= 0){
            pushUndoStep(`table:${debugLabel}:edit`, [{ row: physicalRow, col: physicalCol, prev: event.oldValue, next: event.newValue }]);
          }
        }
        fireHook('afterChange', [[rowIndex, colIndex, event.oldValue, event.newValue]], event.source || 'edit');
        triggerSchedule('afterChange', { source: event.source || 'edit' });
        scheduleAutoSizeColumns('edit');
      },
      onPasteEnd(event){
        try{
          const dataBlocks = event?.data || [];
          const selection = event?.source === 'clipboard' ? instance.getSelectedLast() : null;
          const ranges = Array.isArray(selection) && selection.length === 4
            ? [{ startRow: selection[0], startCol: selection[1], endRow: selection[2], endCol: selection[3] }]
            : [];
          fireHook('afterPaste', dataBlocks, ranges);
          triggerSchedule('afterPaste', { source: 'paste' });
          maybeGrowRows('paste');
          maybeGrowCols('paste');
        }catch(err){
          console.error('Shared.hot AG paste handler error', err);
        }
      },
      onSelectionChanged(params){
        if(isDragSelecting){
          return;
        }
        if(normalizedSelectionRange && (normalizedSelectionRange.from.row !== normalizedSelectionRange.to.row || normalizedSelectionRange.from.col !== normalizedSelectionRange.to.col)){
          return;
        }
        updateSelectionFromApi(params.api);
        maybeGrowRows('selection');
        maybeGrowCols('selection');
      },
      onCellClicked(params){
        if(suppressNextCellClick){
          suppressNextCellClick = false;
          return;
        }
        if(isDragSelecting){
          return;
        }
        const row = params?.node?.rowIndex ?? 0;
        const colId = params?.column?.getColId?.();
        if(colId === '__rowHeader'){
          return;
        }
        const col = colIdToIndex(colId);
        setLastRange({ from: { row, col }, to: { row, col } });
        renderAg(params?.api || instance.gridApi);
        fireHook('afterSelectionEnd', row, col, row, col);
        maybeGrowRows('click');
        maybeGrowCols('click');
      },
      onColumnMoved(){
        fireHook('afterColumnMove');
        triggerSchedule('afterColumnMove', { source: 'columnMove' });
      },
      onColumnHeaderContextMenu(params){
        if(hasEnterprise){
          return;
        }
        const event = params?.event;
        if(event){
          event.preventDefault?.();
          event.stopPropagation?.();
        }
        const colIdRaw = params?.column?.getColId?.();
        const colIdx = typeof colIdRaw === 'string' && colIdRaw.startsWith('c') ? Number(colIdRaw.slice(1)) : null;
        if(!Number.isInteger(colIdx) || colIdx < 0){
          return;
        }
        const canExclude = !exclusionController.isColumnExcluded(colIdx);
        const canInclude = exclusionController.isColumnExcluded(colIdx);
        const items = [
          {
            label: 'Exclude column from analysis',
            disabled: !canExclude,
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:exclude-col`, ()=>{
                exclusionController.markColumns([colIdx], true);
              });
              triggerSchedule('exclusion-change', { scope: 'column', exclude: true });
            }
          },
          {
            label: 'Include column in analysis',
            disabled: !canInclude,
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:include-col`, ()=>{
                exclusionController.markColumns([colIdx], false);
              });
              triggerSchedule('exclusion-change', { scope: 'column', exclude: false });
            }
          }
        ];
        openCustomMenu(event, items);
      },
      getRowClass(params){
        const physicalRow = params?.data?.__rowIndex ?? params?.node?.rowIndex ?? 0;
        if(treatFirstRowAsHeader && physicalRow === 0){
          return firstRowClassName;
        }
        return null;
      },
      onCellContextMenu(params){
        if(hasEnterprise){
          return;
        }
        const event = params?.event;
        if(event){
          event.preventDefault?.();
          event.stopPropagation?.();
        }
        const colIdRaw = params?.column?.getColId?.();
        if(colIdRaw === '__rowHeader'){
          const physicalRow = params?.node?.data?.__rowIndex ?? params?.node?.rowIndex;
          if(!Number.isInteger(physicalRow) || physicalRow < 0 || (treatFirstRowAsHeader && physicalRow === 0)){
            return;
          }
          const rowList = [physicalRow];
          const canExcludeRow = !exclusionController.isRowExcluded(physicalRow);
          const canIncludeRow = exclusionController.isRowExcluded(physicalRow);
          const items = [
            {
              label: 'Exclude row(s) from analysis',
              disabled: !canExcludeRow,
              action: ()=>{
                applyExclusionChange(`table:${debugLabel}:exclude-rows`, ()=>{
                  exclusionController.markRows(rowList, true);
                });
                triggerSchedule('exclusion-change', { scope: 'row', exclude: true });
              }
            },
            {
              label: 'Include row(s) in analysis',
              disabled: !canIncludeRow,
              action: ()=>{
                applyExclusionChange(`table:${debugLabel}:include-rows`, ()=>{
                  exclusionController.markRows(rowList, false);
                });
                triggerSchedule('exclusion-change', { scope: 'row', exclude: false });
              }
            }
          ];
          openCustomMenu(event, items);
          return;
        }
        const colIdx = typeof colIdRaw === 'string' && colIdRaw.startsWith('c') ? Number(colIdRaw.slice(1)) : 0;
        const sel = normalizedSelectionRange || normalizeRange(lastRange) || {
          from: { row: params?.node?.rowIndex ?? 0, col: colIdx },
          to: { row: params?.node?.rowIndex ?? 0, col: colIdx }
        };
        const pairs = [];
        const physicalRows = new Set();
        const physicalCols = new Set();
        for(let r = sel.from.row; r <= sel.to.row; r++){
          for(let c = sel.from.col; c <= sel.to.col; c++){
            const physicalRow = toPhysicalRowIndex(r);
            const physicalCol = toPhysicalColIndex(c);
            if(!Number.isInteger(physicalRow) || !Number.isInteger(physicalCol) || physicalRow < 0 || physicalCol < 0){
              continue;
            }
            if(treatFirstRowAsHeader && physicalRow === 0){
              continue;
            }
            pairs.push({ row: physicalRow, col: physicalCol });
            physicalRows.add(physicalRow);
            physicalCols.add(physicalCol);
          }
        }
        const rowList = Array.from(physicalRows);
        const colList = Array.from(physicalCols);
        const canExcludeRows = rowList.some(row => !exclusionController.isRowExcluded(row));
        const canIncludeRows = rowList.some(row => exclusionController.isRowExcluded(row));
        const canExcludeCols = colList.some(col => !exclusionController.isColumnExcluded(col));
        const canIncludeCols = colList.some(col => exclusionController.isColumnExcluded(col));
        const canExcludeCells = pairs.some(pair => !exclusionController.isCellExcluded(pair.row, pair.col));
        const canIncludeCells = pairs.some(pair => exclusionController.isCellExcluded(pair.row, pair.col));
        const items = [
          {
            label: 'Paste -> Transposed',
            disabled: false,
            action: async ()=>{
              let text = '';
              if(typeof navigator?.clipboard?.readText === 'function'){
                try{
                  text = await navigator.clipboard.readText();
                }catch(err){
                  console.error('Shared.hot AG clipboard read failed', err);
                }
              }
              if(!text){
                return;
              }
              const rows = text.split(/\r?\n/).filter(line=>line.length).map(line=>line.split(/\t/));
              const transposed = rows[0]?.map((_, colIndex)=>rows.map(row=>row[colIndex] ?? '')) || [];
              instance.populateFromArray(sel.from.row, sel.from.col, transposed, sel.from.row + transposed.length - 1, sel.from.col + (transposed[0]?.length || 1) - 1, 'transpose', 'transpose');
            }
          },
          'separator',
          {
            label: 'Exclude selection from analysis',
            disabled: !canExcludeCells,
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:exclude-cells`, ()=>{
                exclusionController.markCells(pairs, true);
              });
              triggerSchedule('exclusion-change', { scope: 'cell', exclude: true });
            }
          },
          {
            label: 'Include selection in analysis',
            disabled: !canIncludeCells,
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:include-cells`, ()=>{
                exclusionController.markCells(pairs, false);
              });
              triggerSchedule('exclusion-change', { scope: 'cell', exclude: false });
            }
          },
          {
            label: 'Exclude row(s) from analysis',
            disabled: !canExcludeRows,
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:exclude-rows`, ()=>{
                exclusionController.markRows(rowList, true);
              });
              triggerSchedule('exclusion-change', { scope: 'row', exclude: true });
            }
          },
          {
            label: 'Include row(s) in analysis',
            disabled: !canIncludeRows,
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:include-rows`, ()=>{
                exclusionController.markRows(rowList, false);
              });
              triggerSchedule('exclusion-change', { scope: 'row', exclude: false });
            }
          },
          {
            label: 'Exclude column(s) from analysis',
            disabled: !canExcludeCols,
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:exclude-cols`, ()=>{
                exclusionController.markColumns(colList, true);
              });
              triggerSchedule('exclusion-change', { scope: 'column', exclude: true });
            }
          },
          {
            label: 'Include column(s) in analysis',
            disabled: !canIncludeCols,
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:include-cols`, ()=>{
                exclusionController.markColumns(colList, false);
              });
              triggerSchedule('exclusion-change', { scope: 'column', exclude: false });
            }
          }
        ];
        openCustomMenu(event, items);
      },
      getContextMenuItems: hasEnterprise ? undefined : null
    };

    agNS.ensureTheme?.(container);
    if(hasAgGrid){
      try{
        const createGridFn = global.agGrid?.createGrid;
        if(typeof createGridFn === 'function'){
          instance.gridApi = createGridFn(container, gridOptions);
        }else{
          instance.gridApi = new global.agGrid.Grid(container, gridOptions);
        }
      }catch(err){
        console.error('Shared.hot createStandardTable (ag-grid) init error', err);
      }
    }else{
      instance.gridApi = null;
      instance.columnApi = null;
    }

    if(container && typeof container.addEventListener === 'function'){
      const doc = container.ownerDocument || document;
      const win = doc.defaultView || global;
      const raf = typeof win?.requestAnimationFrame === 'function'
        ? win.requestAnimationFrame.bind(win)
        : (fn)=>win.setTimeout(fn, 16);

      const isEditableTarget = (target)=>{
        const node = target && target.nodeType === 1 ? target : null;
        if(!node){
          return false;
        }
        if(node.isContentEditable){
          return true;
        }
        const tag = node.tagName;
        if(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'){
          return true;
        }
        if(typeof node.closest === 'function'){
          return !!node.closest('input,textarea,select,[contenteditable=\"true\"]');
        }
        return false;
      };

      const resolveCellCoords = (event)=>{
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(!target || typeof target.closest !== 'function'){
          return null;
        }
        const cell = target.closest('.ag-cell');
        if(!cell){
          return null;
        }
        if(cell.getAttribute('col-id') === '__rowHeader'){
          return null;
        }
        const rowAttr = cell.getAttribute('row-index') ?? cell.closest('.ag-row')?.getAttribute?.('row-index');
        const colAttr = cell.getAttribute('col-id');
        if(rowAttr == null || colAttr == null){
          return null;
        }
        const row = Number(rowAttr);
        const col = colIdToIndex(colAttr);
        if(!Number.isInteger(row) || row < 0){
          return null;
        }
        if(!Number.isInteger(col) || col < 0){
          return null;
        }
        return { row, col };
      };

      const selectRowByHeader = (row, extend)=>{
        const visualRow = Number(row);
        if(!Number.isInteger(visualRow) || visualRow < 0){
          return;
        }
        const fromCol = 0;
        const toCol = Math.max(0, colCount - 1);
        let fromRow = visualRow;
        let toRow = visualRow;
        if(extend && normalizedSelectionRange){
          fromRow = Math.min(normalizedSelectionRange.from.row, visualRow);
          toRow = Math.max(normalizedSelectionRange.to.row, visualRow);
        }
        setLastRange({ from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } });
        renderAg(instance.gridApi);
        fireHook('afterSelectionEnd', fromRow, fromCol, toRow, toCol);
      };

      const selectColumnByHeader = (col, extend)=>{
        const visualCol = Number(col);
        if(!Number.isInteger(visualCol) || visualCol < 0){
          return;
        }
        const lastRow = Math.max(0, getVisualRowCount() - 1);
        let fromCol = visualCol;
        let toCol = visualCol;
        if(extend && normalizedSelectionRange){
          fromCol = Math.min(normalizedSelectionRange.from.col, visualCol);
          toCol = Math.max(normalizedSelectionRange.to.col, visualCol);
        }
        setLastRange({ from: { row: 0, col: fromCol }, to: { row: lastRow, col: toCol } });
        renderAg(instance.gridApi);
        fireHook('afterSelectionEnd', 0, fromCol, lastRow, toCol);
      };

      const rangesEqual = (rangeA, rangeB)=>{
        if(!rangeA || !rangeB){
          return !rangeA && !rangeB;
        }
        return rangeA.from.row === rangeB.from.row
          && rangeA.from.col === rangeB.from.col
          && rangeA.to.row === rangeB.to.row
          && rangeA.to.col === rangeB.to.col;
      };

      const clearHeaderSortSuppression = ()=>{
        pendingHeaderSortSuppression = null;
      };

      const armHeaderSortSuppression = (colId)=>{
        if(typeof colId !== 'string' || !colId){
          return;
        }
        clearHeaderSortSuppression();
        pendingHeaderSortSuppression = { colId };
      };

      const handleRowHeaderMouseDown = (event)=>{
        if(event?.button !== 0){
          return;
        }
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(!target || typeof target.closest !== 'function'){
          return;
        }
        const cell = target.closest('.ag-cell[col-id="__rowHeader"]');
        if(!cell){
          return;
        }
        const rowAttr = cell.closest('.ag-row')?.getAttribute?.('row-index');
        const row = Number(rowAttr);
        if(!Number.isInteger(row) || row < 0){
          return;
        }
        isDragSelecting = false;
        dragAnchor = null;
        pendingDragCell = null;
        selectRowByHeader(row, !!event.shiftKey);
      };

      const handleColumnHeaderMouseDown = (event)=>{
        if(event?.button !== 0){
          return;
        }
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(!target || typeof target.closest !== 'function'){
          return;
        }
        const headerCell = target.closest('.ag-header-cell');
        if(!headerCell){
          return;
        }
        const colId = headerCell.getAttribute('col-id');
        if(typeof colId !== 'string' || !colId.startsWith('c')){
          return;
        }
        const col = Number(colId.slice(1));
        if(!Number.isInteger(col) || col < 0){
          return;
        }
        const selectionBefore = normalizedSelectionRange;
        selectColumnByHeader(col, !!event.shiftKey);
        const selectionAfter = normalizedSelectionRange;
        const selectionChanged = !rangesEqual(selectionBefore, selectionAfter);
        if(event.shiftKey || selectionChanged){
          armHeaderSortSuppression(colId);
        }
      };

      const handleColumnHeaderMouseUp = (event)=>{
        if(!pendingHeaderSortSuppression){
          return;
        }
        // If a click isn't emitted (drag/move/resize), don't let the suppression linger.
        // setTimeout(0) runs after the click event dispatch in browsers.
        win?.setTimeout?.(()=>clearHeaderSortSuppression(), 0);
      };

      const handleColumnHeaderClick = (event)=>{
        const suppression = pendingHeaderSortSuppression;
        if(!suppression){
          return;
        }
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(!target || typeof target.closest !== 'function'){
          clearHeaderSortSuppression();
          return;
        }
        if(!container.contains(target)){
          clearHeaderSortSuppression();
          return;
        }
        const headerCell = target.closest('.ag-header-cell');
        if(!headerCell){
          clearHeaderSortSuppression();
          return;
        }
        const colId = headerCell.getAttribute('col-id');
        if(colId !== suppression.colId){
          clearHeaderSortSuppression();
          return;
        }
        clearHeaderSortSuppression();
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
      };

      const handleMouseDown = (event)=>{
        if(event?.button !== 0){
          return;
        }
        const coords = resolveCellCoords(event);
        if(!coords){
          return;
        }
        isDragSelecting = true;
        pendingDragCell = coords;
        dragAnchor = (event.shiftKey && normalizedSelectionRange) ? normalizedSelectionRange.from : coords;
        setLastRange({ from: dragAnchor, to: coords });
        renderAg(instance.gridApi);
      };

      const handleMouseMove = (event)=>{
        if(!isDragSelecting){
          return;
        }
        const coords = resolveCellCoords(event);
        if(!coords){
          return;
        }
        pendingDragCell = coords;
        if(dragRafPending){
          return;
        }
        dragRafPending = true;
        raf(()=>{
          dragRafPending = false;
          if(!isDragSelecting || !pendingDragCell){
            return;
          }
          const anchor = dragAnchor || pendingDragCell;
          setLastRange({ from: anchor, to: pendingDragCell });
          renderAg(instance.gridApi);
        });
      };

      const handleMouseUp = ()=>{
        if(!isDragSelecting){
          return;
        }
        isDragSelecting = false;
        dragRafPending = false;
        const normalized = normalizedSelectionRange;
        if(normalized && (normalized.from.row !== normalized.to.row || normalized.from.col !== normalized.to.col)){
          suppressNextCellClick = true;
          win?.setTimeout?.(()=>{ suppressNextCellClick = false; }, 50);
        }
        if(normalized){
          fireHook('afterSelectionEnd', normalized.from.row, normalized.from.col, normalized.to.row, normalized.to.col);
        }
        dragAnchor = null;
        pendingDragCell = null;
      };

      const handleKeyDown = (event)=>{
        if(!event){
          return;
        }
        fireHook('beforeKeyDown', event);
        const key = event.key || '';
        const keyCode = typeof event.keyCode === 'number' ? event.keyCode : null;
        const isEnter = key === 'Enter' || key === 'NumpadEnter' || keyCode === 13;
        if(isEnter && normalizedCopyHighlightRange){
          setCopyHighlightRange(null);
          renderAg(instance.gridApi);
        }
        const isDelete = key === 'Delete' || keyCode === 46;
        const isBackspace = key === 'Backspace' || keyCode === 8;
        if((isDelete || isBackspace) && !isEditableTarget(event.target)){
          const selection = normalizedSelectionRange || normalizeRange(lastRange);
          if(selection){
            event.preventDefault?.();
            event.stopPropagation?.();
            const changes = [];
            for(let r = selection.from.row; r <= selection.to.row; r++){
              for(let c = selection.from.col; c <= selection.to.col; c++){
                changes.push([r, c, '']);
              }
            }
            if(changes.length){
              instance.setDataAtCell(changes, 'delete');
              setCopyHighlightRange(null);
              renderAg(instance.gridApi);
            }
          }
          return;
        }
        const isCmd = !!(event.ctrlKey || event.metaKey);
        if(!isCmd || isEditableTarget(event.target)){
          return;
        }
        const normalizedKey = typeof key === 'string' ? key.toLowerCase() : '';
        if(normalizedKey === 'c'){
          event.preventDefault?.();
          event.stopPropagation?.();
          copySelectionToClipboard();
        }else if(normalizedKey === 'x'){
          event.preventDefault?.();
          event.stopPropagation?.();
          cutSelectionToClipboard();
        }
      };

      const parsePastedText = (text)=>{
        if(typeof text !== 'string' || !text){
          return [];
        }
        const sanitized = text.replace(/\r\n?/g, '\n');
        const lines = sanitized.split('\n');
        if(lines.length && lines[lines.length - 1] === ''){
          lines.pop();
        }
        if(!lines.length){
          return [];
        }
        let delimiter = null;
        if(sanitized.indexOf('\t') !== -1){
          delimiter = '\t';
        }else{
          const commaCount = (sanitized.match(/,/g) || []).length;
          const semicolonCount = (sanitized.match(/;/g) || []).length;
          if(commaCount || semicolonCount){
            delimiter = commaCount >= semicolonCount ? ',' : ';';
          }
        }
        return lines.map(line => {
          if(delimiter){
            return line.split(delimiter);
          }
          return [line];
        }).filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));
      };

      const handlePaste = (event)=>{
        if(!event || event.defaultPrevented){
          return;
        }
        if(isEditableTarget(event.target)){
          return;
        }
        let selection = normalizedSelectionRange || normalizeRange(lastRange);
        if(!selection){
          const coords = resolveCellCoords(event);
          if(coords){
            setLastRange({ from: coords, to: coords });
            selection = normalizeRange({ from: coords, to: coords });
          }
        }
        if(!selection){
          return;
        }
        const plain = event.clipboardData?.getData?.('text/plain')
          || event.clipboardData?.getData?.('text')
          || '';
        pendingPasteText = normalizeClipboardText(plain);
        const rows = parsePastedText(plain);
        if(!rows.length){
          pendingPasteText = '';
          return;
        }
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
        const selRowCount = selection.to.row - selection.from.row + 1;
        const selColCount = selection.to.col - selection.from.col + 1;
        let block = rows;
        if((selRowCount > 1 || selColCount > 1) && rows.length === 1 && rows[0].length === 1){
          const value = rows[0][0];
          block = Array.from({ length: selRowCount }, ()=>Array.from({ length: selColCount }, ()=>value));
        }
        const endRow = selection.from.row + block.length - 1;
        const endCol = selection.from.col + (block[0]?.length || 1) - 1;
        try{
          instance.populateFromArray(selection.from.row, selection.from.col, block, endRow, endCol, 'clipboard', 'paste');
          setLastRange({
            from: { row: selection.from.row, col: selection.from.col },
            to: { row: endRow, col: endCol }
          });
          setCopyHighlightRange(null);
          renderAg(instance.gridApi);
          fireHook('afterSelectionEnd', selection.from.row, selection.from.col, endRow, endCol);
        }catch(err){
          console.error('Shared.hot AG paste handler failed', { debugLabel, err });
        }finally{
          pendingPasteText = '';
        }
      };

      const handleContextMenu = (event)=>{
        if(!event || event.defaultPrevented){
          return;
        }
        if(isEditableTarget(event.target)){
          return;
        }
        event.preventDefault?.();
      };

      const handleHeaderContextMenuProxy = (event)=>{
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(!target || typeof target.closest !== 'function'){
          return;
        }
        const headerCell = target.closest('.ag-header-cell');
        if(!headerCell){
          return;
        }
        const colIdAttr = headerCell.getAttribute('col-id');
        if(!colIdAttr || colIdAttr === '__rowHeader'){
          return;
        }
        event.preventDefault?.();
        event.stopPropagation?.();
        const colIdx = colIdToIndex(colIdAttr);
        if(!Number.isInteger(colIdx) || colIdx < 0){
          return;
        }
        const canExclude = !exclusionController.isColumnExcluded(colIdx);
        const canInclude = exclusionController.isColumnExcluded(colIdx);
        const items = [
          {
            label: 'Exclude column from analysis',
            disabled: !canExclude,
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:exclude-col`, ()=>{
                exclusionController.markColumns([colIdx], true);
              });
              triggerSchedule('exclusion-change', { scope: 'column', exclude: true });
            }
          },
          {
            label: 'Include column in analysis',
            disabled: !canInclude,
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:include-col`, ()=>{
                exclusionController.markColumns([colIdx], false);
              });
              triggerSchedule('exclusion-change', { scope: 'column', exclude: false });
            }
          }
        ];
        openCustomMenu(event, items);
      };

      container.addEventListener('mousedown', handleRowHeaderMouseDown, true);
      container.addEventListener('mousedown', handleColumnHeaderMouseDown, true);
      container.addEventListener('mousedown', handleMouseDown, true);
      win?.addEventListener?.('mousemove', handleMouseMove, true);
      win?.addEventListener?.('mouseup', handleMouseUp, true);
      win?.addEventListener?.('mouseup', handleColumnHeaderMouseUp, true);
      doc.addEventListener('click', handleColumnHeaderClick, true);
      container.addEventListener('keydown', handleKeyDown, true);
      container.addEventListener('contextmenu', handleContextMenu, true);
      container.addEventListener('contextmenu', handleHeaderContextMenuProxy, true);
      container.addEventListener('paste', handlePaste, true);
      cleanupFns.push(()=>{
        container.removeEventListener('mousedown', handleRowHeaderMouseDown, true);
        container.removeEventListener('mousedown', handleColumnHeaderMouseDown, true);
        container.removeEventListener('mousedown', handleMouseDown, true);
        win?.removeEventListener?.('mousemove', handleMouseMove, true);
        win?.removeEventListener?.('mouseup', handleMouseUp, true);
        win?.removeEventListener?.('mouseup', handleColumnHeaderMouseUp, true);
        doc.removeEventListener('click', handleColumnHeaderClick, true);
        clearHeaderSortSuppression();
        container.removeEventListener('keydown', handleKeyDown, true);
        container.removeEventListener('contextmenu', handleContextMenu, true);
        container.removeEventListener('contextmenu', handleHeaderContextMenuProxy, true);
        container.removeEventListener('paste', handlePaste, true);
      });
    }

    instance.exportExclusions = function(){
      return hotNS.exportExclusions(instance);
    };
    instance.applyExclusions = function(payload){
      return hotNS.applyExclusions(instance, payload);
    };
    instance.clearExclusions = function(){
      return hotNS.clearExclusions(instance);
    };
    instance.getAnalysisData = function(options){
      return hotNS.getAnalysisData(instance, options);
    };
    if(overrides?.exclusions){
      exclusionController.importState(overrides.exclusions);
    }
    if(typeof overrides?.onCreate === 'function'){
      try{
        overrides.onCreate(instance);
      }catch(err){
        console.error('Shared.hot.createStandardTable (ag-grid) onCreate error', err);
      }
    }
    return instance;
  }

  function createStandardTable(container, dimensions, scheduleDraw, overrides){
    const preferAg = overrides?.engine !== 'handsontable';
    if(preferAg){
      try{
        const agInstance = createStandardTableAgGrid(container, dimensions, scheduleDraw, overrides);
        if(agInstance){
          return agInstance;
        }
      }catch(err){
        console.error('Shared.hot createStandardTable ag-grid path failed, falling back to Handsontable', err);
      }
    }
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
    const firstRowClassName = overrides?.firstRowClassName || 'hot-header-row';
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
      applyExclusionChange(`table:${debugLabel}:exclude-cells`, ()=>{
        exclusionController.markCells(targets, exclude);
      });
    };

    const toggleSelectionRows = (exclude)=>{
      const details = collectSelectionDetails();
      if(!details || !details.physicalRows.length){
        console.debug('Debug: Shared.hot toggleSelectionRows skipped', { debugLabel, exclude });
        return;
      }
      applyExclusionChange(`table:${debugLabel}:exclude-rows`, ()=>{
        exclusionController.markRows(details.physicalRows, exclude);
      });
    };

    const toggleSelectionCols = (exclude)=>{
      const details = collectSelectionDetails();
      if(!details || !details.physicalCols.length){
        console.debug('Debug: Shared.hot toggleSelectionCols skipped', { debugLabel, exclude });
        return;
      }
      applyExclusionChange(`table:${debugLabel}:exclude-cols`, ()=>{
        exclusionController.markColumns(details.physicalCols, exclude);
      });
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
    instance.__hotHeaderWidthManager = headerWidthManager;
    instance.__hotRefreshHeaderWidths = function(reason, headerRow){
      if(headerRow){
        headerWidthManager.setHeaderRowRef(headerRow);
      }
      headerWidthManager.reset();
      scheduleHeaderWidthRefresh(reason || 'external');
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

  function refreshHeaderWidths(instance, options){
    const inst = resolveInstance(instance);
    if(!inst){
      return false;
    }
    if(typeof inst.__hotRefreshHeaderWidths === 'function'){
      try{
        inst.__hotRefreshHeaderWidths(options?.reason, options?.headerRow);
        console.debug('Debug: Shared.hot.refreshHeaderWidths invoked', { debugLabel: getInstanceDebugLabel(inst), reason: options?.reason || 'external' });
        return true;
      }catch(err){
        console.error('Shared.hot.refreshHeaderWidths error', err);
      }
    }else{
      console.debug('Debug: Shared.hot.refreshHeaderWidths skipped - handler missing', { debugLabel: getInstanceDebugLabel(inst) });
    }
    return false;
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
  hotNS.refreshHeaderWidths = refreshHeaderWidths;

  const isMeaningfulCell = (value) => {
    if(value === null || value === undefined){
      return false;
    }
    if(typeof value === 'number'){
      return Number.isFinite(value);
    }
    if(typeof value === 'string'){
      return value.trim().length > 0;
    }
    return true;
  };

  const estimateFilledShape = (hot) => {
    try{
      const source = typeof hot?.getSourceData === 'function' ? hot.getSourceData() : null;
      if(!Array.isArray(source)){
        return { rows: 0, cols: 0 };
      }
      let lastRow = -1;
      let lastCol = -1;
      for(let r = source.length - 1; r >= 0; r -= 1){
        const row = Array.isArray(source[r]) ? source[r] : [];
        let rowHasData = false;
        for(let c = row.length - 1; c >= 0; c -= 1){
          if(!rowHasData && isMeaningfulCell(row[c])){
            rowHasData = true;
          }
          if(isMeaningfulCell(row[c]) && c > lastCol){
            lastCol = c;
          }
        }
        if(rowHasData && lastRow < 0){
          lastRow = r;
          if(lastCol >= 0){
            break;
          }
        }
      }
      return {
        rows: Math.max(0, lastRow + 1),
        cols: Math.max(0, lastCol + 1)
      };
    }catch(err){
      console.debug('Debug: Shared.hot estimateFilledShape error', { message: err?.message || String(err) });
      return { rows: 0, cols: 0 };
    }
  };

  hotNS.estimateFilledShape = estimateFilledShape;
  const resolveAutoDrawElement = (value) => {
    if(typeof value === 'function'){
      try{
        return value();
      }catch(err){
        console.error('Shared.hot autoDraw element resolver error', err);
        return null;
      }
    }
    return value || null;
  };
  const normalizeAutoDrawOptions = (options) => {
    if(!options){
      return {};
    }
    if(typeof options === 'string'){
      return { reason: options };
    }
    if(typeof options === 'object'){
      return options;
    }
    return {};
  };
  const nowMs = () => (global.performance && typeof global.performance.now === 'function')
    ? global.performance.now()
    : Date.now();

  const ensureAutoDrawStateDefaults = (state) => {
    const target = state && typeof state === 'object' ? state : {};
    if(typeof target.autoDrawEnabled !== 'boolean'){
      target.autoDrawEnabled = true;
    }
    if(target.autoDrawReason === undefined){
      target.autoDrawReason = null;
    }
    if(typeof target.autoDrawLockedByThreshold !== 'boolean'){
      target.autoDrawLockedByThreshold = false;
    }
    if(typeof target.drawPending !== 'boolean'){
      target.drawPending = false;
    }
    if(!target.lastDataShape || typeof target.lastDataShape !== 'object'){
      target.lastDataShape = { rows: 0, cols: 0 };
    }else{
      target.lastDataShape.rows = Number(target.lastDataShape.rows) || 0;
      target.lastDataShape.cols = Number(target.lastDataShape.cols) || 0;
    }
    if(target.lastAutoDrawEvaluation === undefined){
      target.lastAutoDrawEvaluation = null;
    }
    return target;
  };

  hotNS.createAutoDrawManager = function createAutoDrawManager(config = {}){
    const component = config.component || 'component';
    const getHot = typeof config.getHot === 'function' ? config.getHot : () => null;
    const debugLog = typeof config.debugLog === 'function'
      ? config.debugLog
      : (label, payload) => {
        try{
          if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
            return;
          }
        }catch(err){
          // ignore toggle failures
        }
        if(typeof console?.debug === 'function'){
          console.debug(label, payload);
        }
      };
    const state = ensureAutoDrawStateDefaults(config.state);
    const thresholds = {
      rows: Number.isFinite(config.thresholds?.rows) ? config.thresholds.rows : 5000,
      cols: Number.isFinite(config.thresholds?.cols) ? config.thresholds.cols : 5000,
      cells: Number.isFinite(config.thresholds?.cells) ? config.thresholds.cells : 50000
    };
    const resolveElements = () => ({
      renderRow: resolveAutoDrawElement(config.elements?.renderRow ?? config.renderRow),
      renderButton: resolveAutoDrawElement(config.elements?.renderButton ?? config.renderButton),
      notice: resolveAutoDrawElement(config.elements?.notice ?? config.notice)
    });
    let elementConfig = resolveElements();
    let scheduleRaw = typeof config.scheduleRaw === 'function' ? config.scheduleRaw : () => {};

    const setElements = (elements) => {
      if(!elements || typeof elements !== 'object'){
        return;
      }
      config.elements = {
        renderRow: elements.renderRow ?? config.elements?.renderRow,
        renderButton: elements.renderButton ?? config.elements?.renderButton,
        notice: elements.notice ?? config.elements?.notice
      };
      elementConfig = resolveElements();
    };

    const setScheduleRaw = (fn) => {
      scheduleRaw = typeof fn === 'function' ? fn : () => {};
    };

    const setEnabled = (enabled, meta = {}) => {
      const nextEnabled = !!enabled;
      const previousEnabled = !!state.autoDrawEnabled;
      let disabledNow = false;
      state.autoDrawEnabled = nextEnabled;
      if(!nextEnabled){
        if(previousEnabled && meta.renderImmediate !== false){
          disabledNow = true;
        }
        if(meta.reason === 'threshold'){
          const rows = Number(meta.rows ?? meta.totalRows);
          const cols = Number(meta.cols ?? meta.totalCols);
          state.autoDrawReason = {
            type: 'threshold',
            rows: Number.isFinite(rows) ? rows : null,
            cols: Number.isFinite(cols) ? cols : null
          };
        }else if(meta.reason){
          state.autoDrawReason = { type: meta.reason };
        }else if(!state.autoDrawReason){
          state.autoDrawReason = { type: 'manual' };
        }
      }else if(meta.reason === 'threshold-cleared' || !meta.preserveReason){
        state.autoDrawReason = null;
      }
      if(nextEnabled){
        state.drawPending = false;
      }
      updateUi(meta);
      if(previousEnabled !== nextEnabled){
        debugLog(`Debug: ${component} autoDraw toggled`, {
          enabled: nextEnabled,
          reason: meta.reason || null
        });
      }
      return { changed: previousEnabled !== nextEnabled, disabledNow };
    };

    function updateDataShape(shape){
      if(!shape || typeof shape !== 'object'){
        return;
      }
      const rows = Number(shape.rows);
      const cols = Number(shape.cols);
      const normalizedRows = Number.isFinite(rows) ? rows : state.lastDataShape.rows;
      const normalizedCols = Number.isFinite(cols) ? cols : state.lastDataShape.cols;
      if(normalizedRows === state.lastDataShape.rows && normalizedCols === state.lastDataShape.cols){
        return;
      }
      state.lastDataShape = { rows: normalizedRows, cols: normalizedCols };
      debugLog(`Debug: ${component} data shape updated`, { rows: normalizedRows, cols: normalizedCols });
    }

    function updateUi(meta = {}){
      elementConfig = resolveElements();
      const renderRow = elementConfig.renderRow;
      const renderButton = elementConfig.renderButton;
      const notice = elementConfig.notice;
      const manualMode = !state.autoDrawEnabled;
      const pendingWhileAuto = !manualMode && !!state.drawPending;
      const shouldShowRenderRow = manualMode || pendingWhileAuto;
      if(renderRow && renderRow.hidden === shouldShowRenderRow){
        renderRow.hidden = !shouldShowRenderRow;
      }
      if(renderButton){
        const shouldDisable = !manualMode && !state.drawPending;
        if(renderButton.disabled !== shouldDisable){
          renderButton.disabled = shouldDisable;
        }
        if(renderButton.hidden === shouldShowRenderRow){
          renderButton.hidden = !shouldShowRenderRow;
        }
      }
      if(notice){
        let text = '';
        let hidden = !shouldShowRenderRow;
        if(!hidden && manualMode){
          const reason = state.autoDrawReason?.type || 'manual';
          if(reason === 'threshold'){
            const rows = state.autoDrawReason?.rows;
            const summary = Number.isFinite(rows) ? ` (${rows.toLocaleString()} rows)` : '';
            text = `Live updates are paused for large datasets${summary}. Use Update Plot after making changes.`;
          }else{
            text = 'Live updates are disabled. Use Update Plot after making changes.';
          }
          if(state.drawPending){
            text += ' Changes are waiting to be rendered.';
          }
        }else if(!hidden && pendingWhileAuto){
          hidden = false;
          text = 'Changes are waiting to be rendered. Use Update Plot to redraw immediately.';
        }
        if(!hidden && notice.textContent !== text){
          notice.textContent = text;
        }
        notice.hidden = hidden || !text;
      }
    }

    function evaluateThresholds(meta = {}){
      const hot = getHot();
      const perfStart = nowMs();
      if(!hot){
        return { autoDrawEnabled: state.autoDrawEnabled, disabledNow: false, reason: null };
      }
      let totalRows = Number(meta?.shape?.rows);
      let totalCols = Number(meta?.shape?.cols);
      if(!Number.isFinite(totalRows) || totalRows < 0){
        if(typeof hot.countSourceRows === 'function'){
          totalRows = hot.countSourceRows();
        }else if(typeof hot.getSourceData === 'function'){
          const source = hot.getSourceData();
          totalRows = Array.isArray(source) ? source.length : 0;
        }else if(typeof hot.countRows === 'function'){
          totalRows = hot.countRows();
        }else{
          totalRows = state.lastDataShape.rows;
        }
      }
      if(!Number.isFinite(totalCols) || totalCols < 0){
        if(typeof hot.countSourceCols === 'function'){
          totalCols = hot.countSourceCols();
        }else if(typeof hot.getSourceData === 'function'){
          const source = hot.getSourceData();
          const firstRow = Array.isArray(source) && source.length ? source[0] : null;
          totalCols = Array.isArray(firstRow) ? firstRow.length : 0;
        }else if(typeof hot.countCols === 'function'){
          totalCols = hot.countCols();
        }else{
          totalCols = state.lastDataShape.cols;
        }
      }
      // Re-evaluate shape using filled cells to avoid stale counts after large->small dataset swaps
      if(typeof hotNS.estimateFilledShape === 'function'){
        const filled = hotNS.estimateFilledShape(hot);
        if(Number.isFinite(filled?.rows) && filled.rows >= 0 && filled.rows < totalRows){
          totalRows = filled.rows;
        }
        if(Number.isFinite(filled?.cols) && filled.cols >= 0 && filled.cols < totalCols){
          totalCols = filled.cols;
        }
      }
      const cellEstimate = Math.max(0, totalRows) * Math.max(1, totalCols);
      const thresholdExceeded = totalRows >= thresholds.rows
        || totalCols >= thresholds.cols
        || cellEstimate >= thresholds.cells;
      state.lastAutoDrawEvaluation = {
        totalRows,
        totalCols,
        cellEstimate,
        thresholdExceeded,
        totalMs: nowMs() - perfStart
      };
      updateDataShape({ rows: totalRows, cols: totalCols });
      debugLog(`Debug: ${component} autoDraw evaluation`, state.lastAutoDrawEvaluation);
      if(thresholdExceeded){
        state.autoDrawLockedByThreshold = true;
        const toggleResult = setEnabled(false, {
          reason: 'threshold',
          rows: totalRows,
          cols: totalCols,
          preserveReason: true
        });
        return {
          autoDrawEnabled: state.autoDrawEnabled,
          disabledNow: !!toggleResult?.disabledNow,
          reason: 'threshold'
        };
      }
      const needsUnlock = !thresholdExceeded
        && state.autoDrawReason?.type === 'threshold'
        && !state.autoDrawEnabled;
      const previouslyLocked = !!state.autoDrawLockedByThreshold;
      state.autoDrawLockedByThreshold = false;
      if(previouslyLocked || needsUnlock){
        setEnabled(true, { reason: 'threshold-cleared', preserveReason: false });
      }
      return { autoDrawEnabled: state.autoDrawEnabled, disabledNow: false, reason: null };
    }

    function schedule(options){
      const opts = normalizeAutoDrawOptions(options);
      debugLog(`Debug: ${component} autoDraw schedule request`, {
        hasForce: !!opts.force,
        reason: opts.reason || null,
        viewOnly: !!opts.viewOnly,
        skipThresholdEvaluation: !!opts.skipThresholdEvaluation
      });
      if(opts.force){
        if(!opts.skipThresholdEvaluation){
          evaluateThresholds();
        }
        state.drawPending = false;
        updateUi(opts);
        scheduleRaw(opts);
        debugLog(`Debug: ${component} autoDraw force dispatched`, {
          reason: opts.reason || null
        });
        return;
      }
      const evalResult = evaluateThresholds({ markPending: true });
      if(evalResult?.disabledNow){
        state.drawPending = false;
        updateUi({ reason: evalResult.reason || opts.reason });
        scheduleRaw(opts);
        debugLog(`Debug: ${component} autoDraw dispatched after threshold disable`, {
          evalReason: evalResult.reason || null,
          requestReason: opts.reason || null
        });
        return;
      }
      if(!state.autoDrawEnabled){
        state.drawPending = true;
        updateUi(opts);
        debugLog(`Debug: ${component} draw suppressed`, { reason: opts.reason || 'auto-draw-disabled' });
        return;
      }
      state.drawPending = false;
      updateUi(opts);
      scheduleRaw(opts);
      debugLog(`Debug: ${component} autoDraw dispatched`, {
        reason: opts.reason || null,
        viewOnly: !!opts.viewOnly
      });
    }

    updateUi();

    return {
      setScheduleRaw,
      schedule,
      evaluateThresholds,
      updateUi,
      setEnabled,
      setElements
    };
  };
})(window);
