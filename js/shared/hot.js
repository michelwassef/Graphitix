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
    const gridCalls = global.__GRID_CALLS__ = global.__GRID_CALLS__ || [];
    const recordCall = (type, payload)=>{
      try{
        gridCalls.push(Object.assign({ type }, payload || {}));
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
    const shrinkOnLoadData = overrides?.shrinkOnLoadData !== false;
    const baseData = Array.isArray(overrides?.data) ? overrides.data : null;
    const hotOptions = overrides?.hotOptions || {};
    let instance;
    const disableBuiltInPaste = overrides?.disablePaste === true || hotOptions.disablePaste === true;
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

    const getMatrixShape = (matrix)=>{
      if(!Array.isArray(matrix)){
        return { rows: 0, cols: 0 };
      }
      let maxCols = 0;
      for(let r = 0; r < matrix.length; r++){
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        if(row.length > maxCols){
          maxCols = row.length;
        }
      }
      return { rows: matrix.length, cols: maxCols };
    };
    const isMeaningfulValue = (value)=>{
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
    const getMatrixFilledShape = (matrix)=>{
      if(!Array.isArray(matrix) || !matrix.length){
        return { rows: 0, cols: 0 };
      }
      let lastRow = -1;
      let lastCol = -1;
      for(let r = matrix.length - 1; r >= 0; r -= 1){
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        let rowHasData = false;
        for(let c = row.length - 1; c >= 0; c -= 1){
          if(!rowHasData && isMeaningfulValue(row[c])){
            rowHasData = true;
          }
          if(isMeaningfulValue(row[c]) && c > lastCol){
            lastCol = c;
          }
        }
        if(rowHasData){
          lastRow = r;
          if(lastCol >= 0){
            break;
          }
        }
      }
      return { rows: Math.max(0, lastRow + 1), cols: Math.max(0, lastCol + 1) };
    };
    const trimMatrixToShape = (matrix, shape)=>{
      if(!Array.isArray(matrix)){
        return [];
      }
      const rows = Math.max(0, Number(shape?.rows) || 0);
      const cols = Math.max(0, Number(shape?.cols) || 0);
      if(rows === 0){
        return [];
      }
      const trimmed = [];
      for(let r = 0; r < rows; r++){
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        trimmed.push(cols > 0 ? row.slice(0, cols) : []);
      }
      return trimmed;
    };

    let data = baseData ? ensureDims(baseData, rowCount, colCount) : createEmptyData(rowCount, colCount);
    const baseRowCount = rowCount;
    const baseColCount = colCount;
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
    let fillHandle = null;
    let fillHandleUpdatePending = false;
    let isFillHandleDragging = false;
    let fillDragStartSelection = null;
    let fillDragDirection = null;
    let fillDragStartPoint = null;
    let fillPreviewRange = null;
    let normalizedFillPreviewRange = null;
    let fillDragRafPending = false;
    let pendingFillTarget = null;
    let fillDragButtonsSeen = false;
    let fillDragLastPointer = null;
    let fillAutoScrollRafId = null;
    let selectionDragLastPointer = null;
    let selectionAutoScrollRafId = null;

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
      scheduleFillHandleUpdate('selection');
    };

    const setCopyHighlightRange = (range)=>{
      copyHighlightRange = range || null;
      normalizedCopyHighlightRange = normalizeRange(copyHighlightRange);
    };

    const setFillPreviewRange = (range, options)=>{
      fillPreviewRange = range || null;
      normalizedFillPreviewRange = normalizeRange(fillPreviewRange);
      if(options?.render !== false){
        renderAg(instance.gridApi);
      }
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

    const ensureFillHandle = ()=>{
      if(fillHandle){
        return fillHandle;
      }
      if(!container || typeof container.appendChild !== 'function'){
        return null;
      }
      const doc = container.ownerDocument || document;
      const handle = doc.createElement('div');
      handle.className = 'hot-fill-handle';
      handle.setAttribute('aria-hidden', 'true');
      handle.tabIndex = -1;
      const stopEvent = (event)=>{
        if(event?.type === 'pointerdown' || event?.type === 'mousedown'){
          startFillHandleDrag(event);
        }
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot fill handle pointerdown', { debugLabel });
        }
      };
      handle.addEventListener('pointerdown', stopEvent);
      handle.addEventListener('mousedown', stopEvent);
      if(container.classList){
        container.classList.add('hot-fill-handle-host');
      }
      container.appendChild(handle);
      fillHandle = handle;
      cleanupFns.push(()=>{
        handle.removeEventListener('pointerdown', stopEvent);
        handle.removeEventListener('mousedown', stopEvent);
        if(handle.parentNode){
          handle.parentNode.removeChild(handle);
        }
        if(container.classList){
          container.classList.remove('hot-fill-handle-host');
        }
        if(fillHandle === handle){
          fillHandle = null;
        }
      });
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot fill handle created', { debugLabel });
      }
      return handle;
    };

    const resolveCellCoordsFromNode = (node)=>{
      const target = node && node.nodeType === 1 ? node : null;
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

    const resolveFillHandleCell = (row, col)=>{
      if(!container || !Number.isInteger(row) || !Number.isInteger(col)){
        return null;
      }
      const colId = `c${col}`;
      const direct = container.querySelector(`.ag-cell[row-index="${row}"][col-id="${colId}"]`);
      if(direct){
        return direct;
      }
      return container.querySelector(`.ag-row[row-index="${row}"] .ag-cell[col-id="${colId}"]`);
    };

    const hideFillHandle = ()=>{
      if(fillHandle && fillHandle.style.display !== 'none'){
        fillHandle.style.display = 'none';
      }
    };

    const updateFillHandlePosition = (reason)=>{
      const selection = normalizedSelectionRange;
      if(!selection){
        hideFillHandle();
        return;
      }
      const handle = ensureFillHandle();
      if(!handle){
        return;
      }
      const cell = resolveFillHandleCell(selection.to.row, selection.to.col);
      if(!cell){
        hideFillHandle();
        return;
      }
      const cellRect = cell.getBoundingClientRect();
      const hostRect = container.getBoundingClientRect();
      if(!cellRect || cellRect.width === 0 || cellRect.height === 0){
        hideFillHandle();
        return;
      }
      const viewport = resolveViewport();
      if(viewport && typeof viewport.getBoundingClientRect === 'function'){
        const viewportRect = viewport.getBoundingClientRect();
        const intersects = cellRect.right > viewportRect.left
          && cellRect.left < viewportRect.right
          && cellRect.bottom > viewportRect.top
          && cellRect.top < viewportRect.bottom;
        if(!intersects){
          hideFillHandle();
          return;
        }
      }
      handle.style.display = 'block';
      handle.style.left = `${cellRect.right - hostRect.left}px`;
      handle.style.top = `${cellRect.bottom - hostRect.top}px`;
    };

    const scheduleFillHandleUpdate = (reason)=>{
      if(fillHandleUpdatePending || !container){
        return;
      }
      fillHandleUpdatePending = true;
      const doc = container.ownerDocument || document;
      const win = doc.defaultView || global;
      const rafLocal = typeof win?.requestAnimationFrame === 'function'
        ? win.requestAnimationFrame.bind(win)
        : (fn)=>win.setTimeout(fn, 16);
      rafLocal(()=>{
        fillHandleUpdatePending = false;
        updateFillHandlePosition(reason);
      });
    };

    const FILL_DRAG_THRESHOLD = 4;

    const normalizeFillValue = (value)=>{
      if(value === null || typeof value === 'undefined'){
        return '';
      }
      return value;
    };

    const coerceNumber = (value)=>{
      if(typeof value === 'number'){
        return Number.isFinite(value) ? value : null;
      }
      if(typeof value === 'string'){
        const trimmed = value.trim();
        if(trimmed === ''){
          return null;
        }
        const num = Number(trimmed);
        return Number.isFinite(num) ? num : null;
      }
      return null;
    };

    const isEmptySeedValue = (value)=>{
      if(value === null || typeof value === 'undefined'){
        return true;
      }
      if(typeof value === 'string'){
        return value.trim() === '';
      }
      return false;
    };

    const classifySeedValue = (value)=>{
      if(isEmptySeedValue(value)){
        return { type: 'EMPTY', raw: '' };
      }
      const numeric = coerceNumber(value);
      if(numeric !== null){
        return { type: 'NUMBER', raw: value, numeric };
      }
      return { type: 'TEXT', raw: value };
    };

    const parseTextNumericSuffix = (value)=>{
      if(typeof value !== 'string'){
        return null;
      }
      const match = value.match(/^(.*?)(-?\d+(?:\.\d+)?)$/);
      if(!match){
        return null;
      }
      return { prefix: match[1], numberText: match[2] };
    };

    const countDecimalPlaces = (value)=>{
      const str = String(value);
      const dot = str.indexOf('.');
      if(dot === -1){
        return 0;
      }
      return str.length - dot - 1;
    };

    const formatNumericSuffix = (value, decimals)=>{
      if(decimals > 0){
        return Number(value).toFixed(decimals);
      }
      const num = Number(value);
      return Number.isFinite(num) && Math.floor(num) === num ? String(num) : String(value);
    };

    const computeTextNumberSeries = (typed, direction, count)=>{
      const entries = typed.filter(entry => entry.type === 'TEXT');
      if(entries.length < 2){
        return null;
      }
      const parsed = entries.map(entry => {
        const raw = String(entry.raw ?? '');
        const info = parseTextNumericSuffix(raw);
        return info ? { raw, prefix: info.prefix, numberText: info.numberText } : null;
      });
      if(parsed.some(item => !item)){
        return null;
      }
      const prefix = parsed[0].prefix;
      if(!parsed.every(item => item.prefix === prefix)){
        return null;
      }
      const numericValues = parsed.map(item => Number(item.numberText)).filter(num => Number.isFinite(num));
      if(numericValues.length < 2){
        return null;
      }
      const decimals = Math.max(...parsed.map(item => countDecimalPlaces(item.numberText)));
      const isForward = direction === 'down' || direction === 'right';
      const step = numericValues[numericValues.length - 1] - numericValues[numericValues.length - 2];
      const anchor = isForward ? numericValues[numericValues.length - 1] : numericValues[0];
      const signedStep = isForward ? step : -step;
      const results = [];
      for(let i = 0; i < count; i++){
        const nextValue = anchor + signedStep * (i + 1);
        results.push(`${prefix}${formatNumericSuffix(nextValue, decimals)}`);
      }
      return results;
    };

    const computeFillValues = (seedSequence, direction, count)=>{
      const results = [];
      const total = Math.max(0, Number(count) || 0);
      if(!seedSequence || seedSequence.length === 0 || total === 0){
        return results;
      }
      const typed = seedSequence.map(classifySeedValue);
      const hasNumber = typed.some(entry => entry.type === 'NUMBER');
      const hasText = typed.some(entry => entry.type === 'TEXT');
      const hasEmpty = typed.some(entry => entry.type === 'EMPTY');
      const isForward = direction === 'down' || direction === 'right';

      if(hasNumber && hasText){
        const pattern = seedSequence.map(normalizeFillValue);
        const len = pattern.length;
        for(let i = 0; i < total; i++){
          const idx = isForward ? (i % len) : ((len - 1 - (i % len) + len) % len);
          results.push(pattern[idx]);
        }
        return results;
      }

      if(hasNumber){
        const numericValues = typed.filter(entry => entry.type === 'NUMBER').map(entry => entry.numeric);
        if(numericValues.length === 0){
          for(let i = 0; i < total; i++){
            results.push('');
          }
          return results;
        }
        if(numericValues.length === 1){
          const val = numericValues[0];
          for(let i = 0; i < total; i++){
            results.push(val);
          }
          return results;
        }
        const step = numericValues[numericValues.length - 1] - numericValues[numericValues.length - 2];
        const anchor = isForward ? numericValues[numericValues.length - 1] : numericValues[0];
        const signedStep = isForward ? step : -step;
        for(let i = 0; i < total; i++){
          results.push(anchor + signedStep * (i + 1));
        }
        return results;
      }

      const textValues = typed.filter(entry => entry.type === 'TEXT').map(entry => entry.raw);
      if(textValues.length === 0){
        for(let i = 0; i < total; i++){
          results.push('');
        }
        return results;
      }
      if(!hasEmpty){
        const series = computeTextNumberSeries(typed, direction, total);
        if(series){
          return series;
        }
      }
      const allSameText = textValues.every(value => value === textValues[0]);
      if(!hasEmpty && allSameText){
        for(let i = 0; i < total; i++){
          results.push(textValues[0]);
        }
        return results;
      }
      const pattern = seedSequence.map(normalizeFillValue);
      const len = pattern.length;
      for(let i = 0; i < total; i++){
        const idx = isForward ? (i % len) : ((len - 1 - (i % len) + len) % len);
        results.push(pattern[idx]);
      }
      return results;
    };

    const getSeedSequenceForColumn = (selection, col)=>{
      if(!selection){
        return [];
      }
      const values = [];
      for(let r = selection.from.row; r <= selection.to.row; r++){
        values.push(instance.getDataAtCell(r, col));
      }
      return values;
    };

    const getSeedSequenceForRow = (selection, row)=>{
      if(!selection){
        return [];
      }
      const values = [];
      for(let c = selection.from.col; c <= selection.to.col; c++){
        values.push(instance.getDataAtCell(row, c));
      }
      return values;
    };

    const ensureRowsForTarget = (targetRow)=>{
      if(!Number.isInteger(targetRow) || targetRow < 0){
        return;
      }
      const currentRows = dataHandle.current.length;
      const rowCap = autoGrowthConfig.rowCap || currentRows;
      if(targetRow < currentRows || currentRows >= rowCap){
        return;
      }
      const needed = targetRow + 1 - currentRows;
      const allowed = Math.max(0, rowCap - currentRows);
      const amount = Math.min(needed, allowed);
      if(amount > 0){
        appendRows(amount);
      }
    };

    const ensureColsForTarget = (targetCol)=>{
      if(!Number.isInteger(targetCol) || targetCol < 0){
        return;
      }
      const colCap = autoGrowthConfig.colCap || colCount;
      if(targetCol < colCount || colCount >= colCap){
        return;
      }
      const needed = targetCol + 1 - colCount;
      const allowed = Math.max(0, colCap - colCount);
      const amount = Math.min(needed, allowed);
      if(amount > 0){
        instance.alter('insert_col_end', Math.max(0, colCount - 1), amount, 'fillGrow');
      }
    };

    const resolveFillDirection = (target)=>{
      if(fillDragDirection){
        return fillDragDirection;
      }
      const start = fillDragStartPoint;
      if(!start || typeof target?.clientX !== 'number' || typeof target?.clientY !== 'number'){
        return null;
      }
      const dx = target.clientX - start.x;
      const dy = target.clientY - start.y;
      if(Math.abs(dx) < FILL_DRAG_THRESHOLD && Math.abs(dy) < FILL_DRAG_THRESHOLD){
        return null;
      }
      if(Math.abs(dx) >= Math.abs(dy)){
        return dx >= 0 ? 'right' : 'left';
      }
      return dy >= 0 ? 'down' : 'up';
    };

    const buildFillPreviewRange = (selection, direction, target)=>{
      if(!selection || !direction){
        return null;
      }
      if(direction === 'down'){
        const targetRow = Number(target);
        if(!Number.isInteger(targetRow) || targetRow <= selection.to.row){
          return null;
        }
        return {
          from: { row: selection.to.row + 1, col: selection.from.col },
          to: { row: targetRow, col: selection.to.col }
        };
      }
      if(direction === 'up'){
        const targetRow = Number(target);
        if(!Number.isInteger(targetRow) || targetRow >= selection.from.row){
          return null;
        }
        return {
          from: { row: targetRow, col: selection.from.col },
          to: { row: selection.from.row - 1, col: selection.to.col }
        };
      }
      if(direction === 'right'){
        const targetCol = Number(target);
        if(!Number.isInteger(targetCol) || targetCol <= selection.to.col){
          return null;
        }
        return {
          from: { row: selection.from.row, col: selection.to.col + 1 },
          to: { row: selection.to.row, col: targetCol }
        };
      }
      if(direction === 'left'){
        const targetCol = Number(target);
        if(!Number.isInteger(targetCol) || targetCol >= selection.from.col){
          return null;
        }
        return {
          from: { row: selection.from.row, col: targetCol },
          to: { row: selection.to.row, col: selection.from.col - 1 }
        };
      }
      return null;
    };

    const applyFillDragPreview = ()=>{
      const selection = fillDragStartSelection;
      const direction = fillDragDirection;
      const preview = normalizedFillPreviewRange;
      if(!selection || !direction || !preview){
        return false;
      }
      const changes = [];
      if(direction === 'down' || direction === 'up'){
        const targetRows = [];
        if(direction === 'down'){
          for(let r = preview.from.row; r <= preview.to.row; r++){
            targetRows.push(r);
          }
        }else{
          for(let r = preview.to.row; r >= preview.from.row; r--){
            targetRows.push(r);
          }
        }
        if(!targetRows.length){
          return false;
        }
        for(let c = selection.from.col; c <= selection.to.col; c++){
          const seedSequence = getSeedSequenceForColumn(selection, c);
          const fillValues = computeFillValues(seedSequence, direction, targetRows.length);
          for(let i = 0; i < targetRows.length; i++){
            changes.push([targetRows[i], c, fillValues[i]]);
          }
        }
      }else{
        const targetCols = [];
        if(direction === 'right'){
          for(let c = preview.from.col; c <= preview.to.col; c++){
            targetCols.push(c);
          }
        }else{
          for(let c = preview.to.col; c >= preview.from.col; c--){
            targetCols.push(c);
          }
        }
        if(!targetCols.length){
          return false;
        }
        for(let r = selection.from.row; r <= selection.to.row; r++){
          const seedSequence = getSeedSequenceForRow(selection, r);
          const fillValues = computeFillValues(seedSequence, direction, targetCols.length);
          for(let i = 0; i < targetCols.length; i++){
            changes.push([r, targetCols[i], fillValues[i]]);
          }
        }
      }
      if(changes.length){
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot fill applied', {
            debugLabel,
            direction,
            cells: changes.length
          });
        }
        instance.setDataAtCell(changes, 'fill');
        return true;
      }
      return false;
    };

    const resetFillHandleDrag = (reason)=>{
      isFillHandleDragging = false;
      fillDragStartSelection = null;
      fillDragDirection = null;
      fillDragStartPoint = null;
      fillDragRafPending = false;
      pendingFillTarget = null;
      fillDragButtonsSeen = false;
      fillDragLastPointer = null;
      fillAutoScrollRafId = null;
      if(normalizedFillPreviewRange){
        setFillPreviewRange(null);
      }
    };

    const resetSelectionAutoScroll = ()=>{
      selectionDragLastPointer = null;
      selectionAutoScrollRafId = null;
    };

    function startFillHandleDrag(event){
      if(isFillHandleDragging){
        return;
      }
      const selection = normalizedSelectionRange;
      if(!selection){
        return;
      }
      isFillHandleDragging = true;
      fillDragStartSelection = {
        from: { row: selection.from.row, col: selection.from.col },
        to: { row: selection.to.row, col: selection.to.col }
      };
      fillDragDirection = null;
      fillDragStartPoint = {
        x: typeof event?.clientX === 'number' ? event.clientX : 0,
        y: typeof event?.clientY === 'number' ? event.clientY : 0
      };
      pendingFillTarget = null;
      fillDragButtonsSeen = false;
      fillDragLastPointer = {
        x: typeof event?.clientX === 'number' ? event.clientX : null,
        y: typeof event?.clientY === 'number' ? event.clientY : null
      };
      if(normalizedFillPreviewRange){
        setFillPreviewRange(null);
      }
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot fill handle drag start', { debugLabel, selection: fillDragStartSelection });
      }
    }

    let isDragSelecting = false;
    let dragAnchor = null;
    let suppressNextCellClick = false;
    let pendingDragCell = null;
    let dragRafPending = false;
    let enterPressedDuringEdit = false;
    let pendingHeaderSortSuppression = null;
    let isHeaderDragSelecting = false;
    let headerDragScope = null; // 'row' | 'column'
    let headerDragAnchor = null;
    let pendingHeaderDragIndex = null;
    let headerDragRafPending = false;
    let headerDragMouseDown = false;
    let headerDragColId = null;
    let isColumnHandleDragging = false;
    let columnHandleDragColIds = null;
    let columnHandleLastTargetIndex = null;
    let pendingColumnHandleMoveIndex = null;
    let columnHandleMoveRafPending = false;

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

    const fixedDataColWidth = Math.round((Number.isFinite(overrides?.fixedColumnWidth) && overrides.fixedColumnWidth > 0
      ? overrides.fixedColumnWidth
      : 80) * 1.2);

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

      class HotAgColumnHeader{
        init(params){
          this.params = params;
          const doc = container?.ownerDocument || document;
          const root = doc.createElement('div');
          root.className = 'hot-ag-header';

          const handle = doc.createElement('span');
          handle.className = 'hot-col-drag-handle';
          handle.setAttribute('title', 'Drag to reorder columns');
          handle.setAttribute('aria-label', 'Drag to reorder columns');
          handle.tabIndex = -1;

          const label = doc.createElement('span');
          label.className = 'hot-ag-header-label';
          label.textContent = params?.displayName ?? params?.column?.getColDef?.()?.headerName ?? '';

          const sortIndicator = doc.createElement('span');
          sortIndicator.className = 'hot-sort-indicator';

          this.updateSortIndicator = ()=>{
            const sort = params?.column?.getSort?.() || '';
            sortIndicator.classList.toggle('is-asc', sort === 'asc');
            sortIndicator.classList.toggle('is-desc', sort === 'desc');
          };

          this.sortListener = ()=>{
            this.updateSortIndicator?.();
          };

          if(params?.api?.addEventListener){
            params.api.addEventListener('sortChanged', this.sortListener);
          }

          root.addEventListener('click', (event)=>{
            if(event?.defaultPrevented){
              return;
            }
            if(event?.target && typeof event.target.closest === 'function' && event.target.closest('.hot-col-drag-handle')){
              return;
            }
            if(!params?.enableSorting){
              return;
            }
            if(typeof params?.progressSort === 'function'){
              params.progressSort(!!event.shiftKey);
              return;
            }
            if(typeof params?.setSort === 'function'){
              const current = params?.column?.getSort?.();
              const next = current === 'asc' ? 'desc' : (current === 'desc' ? null : 'asc');
              params.setSort(next, !!event.shiftKey);
              return;
            }
          });

          root.appendChild(handle);
          root.appendChild(label);
          root.appendChild(sortIndicator);
          this.eGui = root;
          this.updateSortIndicator();
        }
        getGui(){
          return this.eGui;
        }
        destroy(){
          if(this.params?.api?.removeEventListener && this.sortListener){
            this.params.api.removeEventListener('sortChanged', this.sortListener);
          }
          this.eGui = null;
          this.params = null;
        }
      }

      const enhancedDataColumnDefs = dataColumnDefs.map(def=>{
        if(!def || typeof def !== 'object'){
          return def;
        }
        const colId = def.colId ?? null;
        const isDataColumn = typeof colId === 'string' && colId.startsWith('c');
        if(isDataColumn){
          def.width = fixedDataColWidth;
          if(def.suppressMovable !== false){
            def.suppressMovable = true;
          }
          if(typeof def.sortable === 'undefined'){
            def.sortable = true;
          }
          if(!def.headerComponent){
            def.headerComponent = HotAgColumnHeader;
          }
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
        existing['hot-fill-preview-cell'] = params=>{
          if(!normalizedFillPreviewRange){
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
          if(normalizedSelectionRange
            && rowIndex >= normalizedSelectionRange.from.row
            && rowIndex <= normalizedSelectionRange.to.row
            && col >= normalizedSelectionRange.from.col
            && col <= normalizedSelectionRange.to.col){
            return false;
          }
          return rowIndex >= normalizedFillPreviewRange.from.row
            && rowIndex <= normalizedFillPreviewRange.to.row
            && col >= normalizedFillPreviewRange.from.col
            && col <= normalizedFillPreviewRange.to.col;
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

    const resolveSelectedColumnSpanForHeader = (colIdx)=>{
      const idx = Number(colIdx);
      if(!Number.isInteger(idx) || idx < 0){
        return { start: 0, count: 0 };
      }
      const normalized = normalizedSelectionRange;
      const lastRow = Math.max(0, getVisualRowCount() - 1);
      const isFullColumnSelection = normalized
        && normalized.from.row === 0
        && normalized.to.row === lastRow
        && idx >= normalized.from.col
        && idx <= normalized.to.col;
      if(isFullColumnSelection){
        const start = normalized.from.col;
        const count = normalized.to.col - normalized.from.col + 1;
        return { start, count };
      }
      return { start: idx, count: 1 };
    };

    const resolveSelectedRowSpanForHeader = (rowIdx)=>{
      const idx = Number(rowIdx);
      if(!Number.isInteger(idx) || idx < 0){
        return { start: 0, count: 0 };
      }
      const normalized = normalizedSelectionRange;
      const isFullRowSelection = normalized
        && normalized.from.col === 0
        && normalized.to.col === Math.max(0, colCount - 1)
        && idx >= normalized.from.row
        && idx <= normalized.to.row;
      if(isFullRowSelection){
        const start = normalized.from.row;
        const count = normalized.to.row - normalized.from.row + 1;
        return { start, count };
      }
      return { start: idx, count: 1 };
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

    const autoGrowthState = { viewportScrollAttached: false, viewportScrollHandler: null, scrollElements: [] };

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
      const viewport = resolveViewport();
      if(!viewport || !container || typeof container.querySelector !== 'function'){
        return;
      }
      const horizontalViewport = container.querySelector('.ag-body-horizontal-scroll-viewport');
      const horizontalScroll = container.querySelector('.ag-body-horizontal-scroll');
      if(!autoGrowthState.viewportScrollHandler){
        autoGrowthState.viewportScrollHandler = ()=>{
          maybeGrowRows('scroll');
          maybeGrowCols('scroll');
          scheduleFillHandleUpdate('scroll');
        };
      }
      const handler = autoGrowthState.viewportScrollHandler;
      const existing = Array.isArray(autoGrowthState.scrollElements) ? autoGrowthState.scrollElements : [];
      const elements = [viewport, horizontalViewport, horizontalScroll].filter((el, idx, list)=>el && list.indexOf(el) === idx);
      elements.forEach(el=>{
        if(existing.indexOf(el) === -1){
          el.addEventListener('scroll', handler, { passive: true });
          existing.push(el);
        }
      });
      autoGrowthState.viewportScrollAttached = existing.length > 0;
      autoGrowthState.scrollElements = existing;
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

    const captureColumnWidths = (api)=>{
      const columnApi = api?.columnApi || instance?.columnApi || null;
      if(!columnApi || typeof columnApi.getColumnState !== 'function'){
        return null;
      }
      try{
        const state = columnApi.getColumnState() || [];
        const widths = new Map();
        state.forEach(entry=>{
          if(entry?.colId && Number.isFinite(entry.width) && entry.width > 0){
            widths.set(entry.colId, entry.width);
          }
        });
        return widths.size ? widths : null;
      }catch(err){
        return null;
      }
    };

    const applyCapturedColumnWidths = (api, widths)=>{
      if(!api || !widths || !widths.size){
        return;
      }
      const columnApi = api?.columnApi || instance?.columnApi || null;
      if(!columnApi || typeof columnApi.applyColumnState !== 'function'){
        return;
      }
      try{
        const state = Array.from(widths.entries()).map(([colId, width])=>({ colId, width }));
        columnApi.applyColumnState({ state, applyOrder: false });
      }catch(err){
        // best-effort only
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
      scheduleFillHandleUpdate('render');
    };

 


    const rebuildColumns = (api)=>{
      columnDefs = buildColumnDefs();
      if(batchDepth > 0){
        pendingRebuildColumns = true;
        return;
      }
      const preservedWidths = captureColumnWidths(api);
      applyColumnDefs(api, columnDefs);
      applyHeaderHeight(api, colHeadersEnabled ? 24 : 0);
      applyCapturedColumnWidths(api, preservedWidths);
    };

    const syncRowData = (api)=>{
      rowData = buildRowData();
      if(batchDepth > 0){
        pendingSyncRowData = true;
        return;
      }
      applyRowData(api, rowData);
      restoreViewportScroll();
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

    instance = {
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
        const hasMinRows = Number.isFinite(opts.minRows);
        const hasMinCols = Number.isFinite(opts.minCols);
        const trimIncoming = hasIncomingData && (opts.trimData === true || opts.allowShrink === true);
        const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
        const prevColCount = colCount;

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
          let incomingData = opts.data;
          let nextRows = trimIncoming ? 0 : rowCount;
          let nextCols = trimIncoming ? MIN_INPUT_COLS : colCount;
          if(trimIncoming){
            const shape = getMatrixShape(incomingData);
            const filledShape = getMatrixFilledShape(incomingData);
            const trimmedShape = {
              rows: Math.max(0, Math.min(shape.rows, filledShape.rows)),
              cols: Math.max(0, Math.min(shape.cols, filledShape.cols))
            };
            if(trimmedShape.rows < shape.rows || trimmedShape.cols < shape.cols){
              incomingData = trimMatrixToShape(incomingData, trimmedShape);
              if(debugEnabled){
                console.debug('Debug: Shared.hot updateSettings trimmed', {
                  debugLabel,
                  previousRows: shape.rows,
                  previousCols: shape.cols,
                  trimmedRows: trimmedShape.rows,
                  trimmedCols: trimmedShape.cols
                });
              }
            }
            nextRows = trimmedShape.rows;
            nextCols = Math.max(trimmedShape.cols, MIN_INPUT_COLS);
          }
          if(hasMinRows){
            nextRows = Math.max(nextRows, Math.max(0, Number(opts.minRows)));
          }
          if(hasMinCols){
            nextCols = Math.max(nextCols, Math.max(MIN_INPUT_COLS, Number(opts.minCols)));
          }
          rowCount = Number.isFinite(nextRows) ? Math.max(0, nextRows) : rowCount;
          colCount = Number.isFinite(nextCols) ? Math.max(MIN_INPUT_COLS, nextCols) : colCount;
          data = ensureDims(incomingData, rowCount, colCount);
          dataHandle.current = data;
          needsSync = true;
          needsSchedule = true;
          if(colCount !== prevColCount){
            needsRebuild = true;
          }
          if(existingExclusions){
            exclusionController.importState(existingExclusions);
          }else{
            exclusionController.clearAll(true);
          }
          pendingViewportRestore = null;
        }
        if(!hasIncomingData && hasMinRows){
          rowCount = Math.max(0, Number(opts.minRows));
          ensureDims(data, rowCount, colCount);
          dataHandle.current = data;
          needsSync = true;
          needsSchedule = true;
        }
        if(!hasIncomingData && hasMinCols){
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
        renderAg(instance.gridApi);
      },
      loadData(nextData){
        const existingExclusions = preserveExclusionsOnLoad ? exclusionController.exportState() : null;
        let incoming = Array.isArray(nextData) ? nextData : null;
        if(incoming && shrinkOnLoadData){
          const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
          const shape = getMatrixShape(incoming);
          const filledShape = getMatrixFilledShape(incoming);
          const trimmedShape = {
            rows: Math.max(0, Math.min(shape.rows, filledShape.rows)),
            cols: Math.max(0, Math.min(shape.cols, filledShape.cols))
          };
          if(trimmedShape.rows < shape.rows || trimmedShape.cols < shape.cols){
            incoming = trimMatrixToShape(incoming, trimmedShape);
            if(debugEnabled){
              console.debug('Debug: Shared.hot loadData trimmed', {
                debugLabel,
                previousRows: shape.rows,
                previousCols: shape.cols,
                trimmedRows: trimmedShape.rows,
                trimmedCols: trimmedShape.cols
              });
            }
          }
          const nextRows = Math.max(baseRowCount, trimmedShape.rows);
          const nextCols = Math.max(baseColCount, trimmedShape.cols, MIN_INPUT_COLS);
          if(nextRows !== rowCount || nextCols !== colCount){
            if(debugEnabled){
              console.debug('Debug: Shared.hot loadData resized', {
                debugLabel,
                previousRows: rowCount,
                previousCols: colCount,
                nextRows,
                nextCols,
                incomingRows: shape.rows,
                incomingCols: shape.cols,
                trimmedRows: trimmedShape.rows,
                trimmedCols: trimmedShape.cols
              });
            }
            rowCount = nextRows;
            colCount = nextCols;
          }
        }
        data = incoming ? ensureDims(incoming, rowCount, colCount) : createEmptyData(rowCount, colCount);
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
          exclusionController.shiftRowsForInsert(insertAt, safeAmount);
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
          exclusionController.shiftColsForInsert(insertAt, safeAmount);
          for(let r = 0; r < data.length; r++){
            const row = data[r] || [];
            const emptyCols = Array.from({ length: safeAmount }, ()=>'');
            row.splice(insertAt, 0, ...emptyCols);
            data[r] = row;
          }
          dataHandle.current = data;
          if(Array.isArray(colHeadersSetting)){
            colHeadersSetting.splice(insertAt, 0, ...Array.from({ length: safeAmount }, ()=>''));
          }
            colCount = Math.max(colCount + safeAmount, MIN_INPUT_COLS);
            ensureDims(data, data.length, colCount);
            colHeaders = resolveColHeaders(colCount);
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
          if(Array.isArray(colHeadersSetting)){
            colHeadersSetting.splice(at, safeAmount);
          }
          exclusionController.shiftColsForRemoval(removedCols);
          dataHandle.current = data;
          colCount = Math.max(MIN_INPUT_COLS, colCount - safeAmount);
          ensureDims(data, data.length, colCount);
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
          const handler = autoGrowthState.viewportScrollHandler;
          if(handler){
            (autoGrowthState.scrollElements || []).forEach(el=>{
              el?.removeEventListener?.('scroll', handler);
            });
          }
          autoGrowthState.scrollElements = [];
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

    const getDisplayedDataColumnPositions = ()=>{
      const api = instance.gridApi || null;
      const columnApi = instance.columnApi || api?.columnApi || null;
      const getAllDisplayedColumns = (columnApi && typeof columnApi.getAllDisplayedColumns === 'function')
        ? columnApi.getAllDisplayedColumns.bind(columnApi)
        : (api && typeof api.getAllDisplayedColumns === 'function')
          ? api.getAllDisplayedColumns.bind(api)
          : null;
      if(!getAllDisplayedColumns){
        return null;
      }
      try{
        const displayed = getAllDisplayedColumns();
        if(!Array.isArray(displayed) || !displayed.length){
          return null;
        }
        const dataPositions = [];
        const idAt = (col)=>{
          try{
            return typeof col?.getColId === 'function' ? col.getColId() : (col?.colId ?? null);
          }catch(err){
            return null;
          }
        };
        for(let i = 0; i < displayed.length; i++){
          const colId = idAt(displayed[i]);
          if(typeof colId === 'string' && colId.startsWith('c')){
            dataPositions.push({ index: i, colId });
          }
        }
        return dataPositions.length ? dataPositions : null;
      }catch(err){
        return null;
      }
    };

    const getMoveColumnState = (colIdx)=>{
      const positions = getDisplayedDataColumnPositions();
      const colId = `c${colIdx}`;
      if(!positions){
        return { colId, canMoveLeft: false, canMoveRight: false, targetIndexLeft: null, targetIndexRight: null };
      }
      const currentDataIdx = positions.findIndex(entry => entry.colId === colId);
      if(currentDataIdx < 0){
        return { colId, canMoveLeft: false, canMoveRight: false, targetIndexLeft: null, targetIndexRight: null };
      }
      const canMoveLeft = currentDataIdx > 0;
      const canMoveRight = currentDataIdx < positions.length - 1;
      return {
        colId,
        canMoveLeft,
        canMoveRight,
        targetIndexLeft: canMoveLeft ? positions[currentDataIdx - 1].index : null,
        targetIndexRight: canMoveRight ? positions[currentDataIdx + 1].index : null
      };
    };

    const moveDisplayedColumnTo = (colId, targetIndex)=>{
      const api = instance.gridApi || null;
      const columnApi = instance.columnApi || api?.columnApi || null;
      const toIndex = Number(targetIndex);
      if(!Number.isInteger(toIndex) || toIndex < 0){
        return false;
      }
      try{
        const moved = (()=>{
          if(columnApi && typeof columnApi.moveColumns === 'function'){
            columnApi.moveColumns([colId], toIndex);
            return true;
          }
          if(columnApi && typeof columnApi.moveColumn === 'function'){
            columnApi.moveColumn(colId, toIndex); // deprecated in AG Grid >=31.1, retained as fallback
            return true;
          }
          if(api && typeof api.moveColumns === 'function'){
            api.moveColumns([colId], toIndex);
            return true;
          }
          if(api && typeof api.moveColumn === 'function'){
            api.moveColumn(colId, toIndex); // deprecated in AG Grid >=31.1, retained as fallback
            return true;
          }
          return false;
        })();
        if(!moved){
          return false;
        }
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot moved displayed column', { debugLabel, colId, toIndex });
        }
        return true;
      }catch(err){
        return false;
      }
    };

    const resolveSelectedColumnGroup = (colIdx)=>{
      const idx = Number(colIdx);
      if(!Number.isInteger(idx) || idx < 0){
        return null;
      }
      const normalized = normalizedSelectionRange;
      if(!normalized){
        return [idx];
      }
      const lastRow = Math.max(0, getVisualRowCount() - 1);
      const isFullColumnSelection = normalized.from.row === 0 && normalized.to.row === lastRow;
      if(!isFullColumnSelection){
        return [idx];
      }
      if(idx < normalized.from.col || idx > normalized.to.col){
        return [idx];
      }
      const cols = [];
      for(let c = normalized.from.col; c <= normalized.to.col; c++){
        cols.push(c);
      }
      return cols.length ? cols : [idx];
    };

    const startColumnHandleDrag = (colIds)=>{
      const list = Array.isArray(colIds) ? colIds.filter(id => typeof id === 'string' && id.startsWith('c')) : [];
      if(!list.length){
        return;
      }
      isColumnHandleDragging = true;
      columnHandleDragColIds = Array.from(new Set(list));
      columnHandleLastTargetIndex = null;
      pendingColumnHandleMoveIndex = null;
      columnHandleMoveRafPending = false;
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot column handle drag start', { debugLabel, colIds: columnHandleDragColIds.slice() });
      }
    };

    const stopColumnHandleDrag = ()=>{
      if(!isColumnHandleDragging){
        return;
      }
      const movedCols = Array.isArray(columnHandleDragColIds) ? columnHandleDragColIds.slice() : null;
      commitDisplayedColumnOrderToData('columnHandleDrag', movedCols);
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot column handle drag end', { debugLabel, colIds: columnHandleDragColIds || null });
      }
      isColumnHandleDragging = false;
      columnHandleDragColIds = null;
      columnHandleLastTargetIndex = null;
      pendingColumnHandleMoveIndex = null;
      columnHandleMoveRafPending = false;
    };

    const moveDisplayedColumnsTo = (colIds, targetIndex)=>{
      const ids = Array.isArray(colIds) ? colIds.filter(id => typeof id === 'string' && id.startsWith('c')) : [];
      if(!ids.length){
        return false;
      }
      const api = instance.gridApi || null;
      const columnApi = instance.columnApi || api?.columnApi || null;
      const toIndex = Number(targetIndex);
      if(!Number.isInteger(toIndex) || toIndex < 0){
        return false;
      }
      try{
        const moved = (()=>{
          if(columnApi && typeof columnApi.moveColumns === 'function'){
            columnApi.moveColumns(ids, toIndex);
            return true;
          }
          if(api && typeof api.moveColumns === 'function'){
            api.moveColumns(ids, toIndex);
            return true;
          }
          if(ids.length === 1){
            return moveDisplayedColumnTo(ids[0], toIndex);
          }
          return false;
        })();
        if(!moved){
          return false;
        }
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot moved displayed columns', { debugLabel, colIds: ids.slice(), toIndex });
        }
        return true;
      }catch(err){
        return false;
      }
    };

    const getDisplayedDataColumnOrder = ()=>{
      const positions = getDisplayedDataColumnPositions();
      if(!positions){
        return null;
      }
      const colIds = positions.map(entry => entry.colId).filter(id => typeof id === 'string' && id.startsWith('c'));
      return colIds.length ? colIds : null;
    };

    const applyColumnPermutationToData = (permutationOldByNew)=>{
      if(!Array.isArray(permutationOldByNew) || permutationOldByNew.length !== colCount){
        return false;
      }
      const permutation = permutationOldByNew.map(idx => Number(idx));
      if(!permutation.every(idx => Number.isInteger(idx) && idx >= 0)){
        return false;
      }
      const seen = new Set(permutation);
      if(seen.size !== permutation.length){
        return false;
      }

      const matrix = dataHandle.current;
      for(let r = 0; r < matrix.length; r++){
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        const nextRow = new Array(Math.max(row.length, colCount));
        for(let c = 0; c < nextRow.length; c++){
          const oldIndex = c < colCount ? permutation[c] : c;
          nextRow[c] = (oldIndex < row.length) ? row[oldIndex] : '';
        }
        matrix[r] = nextRow;
      }

      if(Array.isArray(colHeadersSetting)){
        try{
          const nextHeaders = new Array(colHeadersSetting.length);
          for(let c = 0; c < colHeadersSetting.length; c++){
            const oldIndex = c < colCount ? permutation[c] : c;
            nextHeaders[c] = (oldIndex < colHeadersSetting.length) ? colHeadersSetting[oldIndex] : `Column ${c + 1}`;
          }
          colHeadersSetting = nextHeaders;
        }catch(err){
          // ignore
        }
      }
      colHeaders = resolveColHeaders(colCount);

      const exclusionState = exclusionController.exportState();
      const oldToNew = new Map();
      for(let newIdx = 0; newIdx < permutation.length; newIdx++){
        oldToNew.set(permutation[newIdx], newIdx);
      }
      const nextExcludedCols = (Array.isArray(exclusionState?.cols) ? exclusionState.cols : [])
        .map(oldIdx => oldToNew.get(oldIdx))
        .filter(idx => Number.isInteger(idx) && idx >= 0);
      const nextExcludedCells = (Array.isArray(exclusionState?.cells) ? exclusionState.cells : [])
        .map(cell => ({ row: cell?.row ?? cell?.[0], col: oldToNew.get(cell?.col ?? cell?.[1]) }))
        .filter(cell => Number.isInteger(cell.row) && cell.row >= 0 && Number.isInteger(cell.col) && cell.col >= 0);
      exclusionController.importState({
        rows: Array.isArray(exclusionState?.rows) ? exclusionState.rows : [],
        cols: nextExcludedCols,
        cells: nextExcludedCells
      });

      // Reset column state to default c0.. ordering (data has been permuted to match the requested order).
      rebuildColumns(instance.gridApi);
      renderAg(instance.gridApi);
      return true;
    };

    const applyColumnPermutation = (permutationOldByNew, options)=>{
      const reason = options?.reason || null;
      const movedColIds = Array.isArray(options?.movedColIds) ? options.movedColIds : null;
      const skipSelection = options?.skipSelection === true;

      const applied = applyColumnPermutationToData(permutationOldByNew);
      if(!applied){
        return false;
      }

      if(!skipSelection && Array.isArray(movedColIds) && movedColIds.length){
        const permutation = permutationOldByNew.map(idx => Number(idx));
        const oldToNew = new Map();
        for(let newIdx = 0; newIdx < permutation.length; newIdx++){
          oldToNew.set(permutation[newIdx], newIdx);
        }
        const movedOld = movedColIds
          .map(id => Number(String(id).slice(1)))
          .filter(idx => Number.isInteger(idx) && idx >= 0);
        const movedNew = movedOld.map(oldIdx => oldToNew.get(oldIdx)).filter(idx => Number.isInteger(idx) && idx >= 0);
        if(movedNew.length){
          const minNew = Math.min(...movedNew);
          const maxNew = Math.max(...movedNew);
          const lastRow = Math.max(0, getVisualRowCount() - 1);
          setLastRange({ from: { row: 0, col: minNew }, to: { row: lastRow, col: maxNew } });
          renderAg(instance.gridApi);
        }
      }

      fireHook('afterColumnMove');
      triggerSchedule('afterColumnMove', { source: reason || 'columnPermutation' });
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot applied column permutation', { debugLabel, reason: reason || null });
      }
      return true;
    };

    const commitDisplayedColumnOrderToData = (reason, movedColIds)=>{
      const currentOrder = getDisplayedDataColumnOrder();
      if(!currentOrder || currentOrder.length !== colCount){
        return false;
      }
      const permutationOldByNew = currentOrder.map(id => Number(id.slice(1)));
      if(!permutationOldByNew.every(idx => Number.isInteger(idx) && idx >= 0)){
        return false;
      }
      const isIdentity = permutationOldByNew.every((oldIdx, newIdx)=>oldIdx === newIdx);
      if(isIdentity){
        return false;
      }

      const inverse = new Array(permutationOldByNew.length);
      for(let newIdx = 0; newIdx < permutationOldByNew.length; newIdx++){
        inverse[permutationOldByNew[newIdx]] = newIdx;
      }

      const applied = applyColumnPermutation(permutationOldByNew, { reason: reason || 'columnOrderCommit', movedColIds });
      if(!applied){
        return false;
      }

      if(hasGlobalUndo){
        undoManager.record({
          label: `table:${debugLabel}:reorder-columns`,
          scope: undoScope,
          undo: ()=>applyColumnPermutation(inverse, { reason: 'undo:reorder-columns', skipSelection: true }),
          redo: ()=>applyColumnPermutation(permutationOldByNew, { reason: 'redo:reorder-columns', skipSelection: true })
        });
      }

      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot committed column order to data', { debugLabel, reason: reason || null });
      }
      return true;
    };

    const gridOptions = {
      rowData,
      columnDefs,
      defaultColDef: {
        editable: true,
        resizable: true,
        minWidth: 40,
        width: fixedDataColWidth,
        suppressHeaderMenuButton: true,
        comparator: valueComparator
      },
      rowSelection: { mode: 'multiRow', headerCheckbox: false },
        suppressRowHoverHighlight: true,
        suppressMenuHide: true,
        ensureDomOrder: true,
        alwaysShowHorizontalScroll: true,
        headerHeight: colHeadersEnabled ? 24 : 0,
      postSortRows: function(params){
        try{
          const nodes = params?.nodes;
          if(!Array.isArray(nodes) || nodes.length < 2){
            return;
          }
          const sortModel = params?.api?.getSortModel?.();
          let hasSort = Array.isArray(sortModel) && sortModel.length > 0;
          if(!hasSort){
            const columnState = params?.columnApi?.getColumnState?.();
            hasSort = Array.isArray(columnState) && columnState.some(state => state?.sort === 'asc' || state?.sort === 'desc');
          }
          const headerNodes = [];
          const dataNodes = [];
          if(treatFirstRowAsHeader){
            for(let i = 0; i < nodes.length; i++){
              const node = nodes[i];
              const physicalRow = node?.data?.__rowIndex ?? node?.rowIndex;
              if(physicalRow === 0){
                headerNodes.push(node);
              }else{
                dataNodes.push(node);
              }
            }
          }else{
            dataNodes.push(...nodes);
          }
          if(!hasSort){
            if(!headerNodes.length){
              return;
            }
            nodes.length = 0;
            headerNodes.forEach(node => nodes.push(node));
            dataNodes.forEach(node => nodes.push(node));
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

          const nonEmptyNodes = [];
          const emptyNodes = [];
          for(let i = 0; i < dataNodes.length; i++){
            const node = dataNodes[i];
            const physicalRow = node?.data?.__rowIndex ?? node?.rowIndex;
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
          ensureViewportScrollHandler();
          maybeGrowRows('gridReady');
          maybeGrowCols('gridReady');
        },
        onFirstDataRendered(){
          ensureViewportScrollHandler();
        },
        onColumnResized(params){
          if(params?.finished === false){
            return;
          }
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
      },
      onCellEditingStopped(event){
        try{
          if(!enterPressedDuringEdit){
            return;
          }
          enterPressedDuringEdit = false;
          const api = instance.gridApi;
          const rowIndex = event?.node?.rowIndex ?? event?.rowIndex ?? 0;
          const colId = event?.column?.getColId?.() ?? event?.colId;
          const col = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : 0;
          const nextRow = Number.isInteger(rowIndex) ? (rowIndex + 1) : null;
          if(nextRow == null){
            return;
          }
          // If moving past the last row, append one row so selection can move.
          if(nextRow >= getVisualRowCount()){
            try{ appendRows(1); }catch(err){}
          }
          setLastRange({ from: { row: nextRow, col }, to: { row: nextRow, col } });
          renderAg(api);
          try{
            if(api && typeof api.setFocusedCell === 'function'){
              api.setFocusedCell(nextRow, colId);
              if(typeof api.ensureIndexVisible === 'function'){
                api.ensureIndexVisible(nextRow);
              }
            }
          }catch(err){
            // best-effort focus move
          }
        }catch(err){
          // swallow handler errors
        }
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
        const moveState = getMoveColumnState(colIdx);
        const selectionSpan = resolveSelectedColumnSpanForHeader(colIdx);
        const canDelete = selectionSpan.count > 0;
        const insertLabelCount = selectionSpan.count || 1;
        const selectionStart = selectionSpan.start;
        const selectionEnd = selectionSpan.start + selectionSpan.count - 1;
        const canExclude = !exclusionController.isColumnExcluded(colIdx);
        const canInclude = exclusionController.isColumnExcluded(colIdx);
        const items = [
          {
            label: `Insert ${insertLabelCount} column(s) before`,
            disabled: selectionSpan.count <= 0,
            action: ()=>{
              const prevExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              instance.alter('insert_col_left', selectionStart, insertLabelCount, 'header-menu');
              const nextExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              if(hasGlobalUndo){
                undoManager.record({
                  label: `table:${debugLabel}:insert-cols`,
                  scope: undoScope,
                  undo: ()=>{ exclusionController.importState(prevExclusions); instance.alter('remove_col', selectionStart, insertLabelCount, 'undo:insert-cols'); exclusionController.importState(prevExclusions); },
                  redo: ()=>{ instance.alter('insert_col_left', selectionStart, insertLabelCount, 'redo:insert-cols'); if(nextExclusions) exclusionController.importState(nextExclusions); }
                });
              }
            }
          },
          {
            label: `Insert ${insertLabelCount} column(s) after`,
            disabled: selectionSpan.count <= 0,
            action: ()=>{
              const prevExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              instance.alter('insert_col_right', selectionEnd, insertLabelCount, 'header-menu');
              const nextExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              if(hasGlobalUndo){
                const insertAt = selectionEnd + 1;
                undoManager.record({
                  label: `table:${debugLabel}:insert-cols`,
                  scope: undoScope,
                  undo: ()=>{ exclusionController.importState(prevExclusions); instance.alter('remove_col', insertAt, insertLabelCount, 'undo:insert-cols'); exclusionController.importState(prevExclusions); },
                  redo: ()=>{ instance.alter('insert_col_right', selectionEnd, insertLabelCount, 'redo:insert-cols'); if(nextExclusions) exclusionController.importState(nextExclusions); }
                });
              }
            }
          },
          {
            label: `Delete ${selectionSpan.count || 1} column(s)`,
            disabled: !canDelete,
            action: ()=>{
              const at = selectionStart;
              const count = selectionSpan.count || 1;
              const beforeExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              const beforeHeaders = Array.isArray(colHeadersSetting) ? colHeadersSetting.slice(at, at + count) : null;
              const beforeData = dataHandle.current.map(row => (Array.isArray(row) ? row.slice(at, at + count) : Array.from({ length: count }, ()=>'')));
              instance.alter('remove_col', at, count, 'header-menu');
              const afterExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              if(hasGlobalUndo){
                undoManager.record({
                  label: `table:${debugLabel}:delete-cols`,
                  scope: undoScope,
                  undo: ()=>{
                    instance.alter('insert_col_left', at, count, 'undo:delete-cols');
                    const matrix = dataHandle.current;
                    for(let r = 0; r < matrix.length; r++){
                      const row = matrix[r] || [];
                      for(let c = 0; c < count; c++){
                        row[at + c] = beforeData[r]?.[c] ?? '';
                      }
                    }
                    if(Array.isArray(colHeadersSetting) && Array.isArray(beforeHeaders)){
                      colHeadersSetting.splice(at, count, ...beforeHeaders);
                      colHeaders = resolveColHeaders(colCount);
                    }
                    exclusionController.importState(beforeExclusions);
                    rebuildColumns(instance.gridApi);
                    renderAg(instance.gridApi);
                  },
                  redo: ()=>{
                    instance.alter('remove_col', at, count, 'redo:delete-cols');
                    if(afterExclusions){
                      exclusionController.importState(afterExclusions);
                      renderAg(instance.gridApi);
                    }
                  }
                });
              }
            }
          },
          'separator',
          {
            label: 'Move column left',
            disabled: !moveState.canMoveLeft,
            action: ()=>{
              if(moveDisplayedColumnTo(moveState.colId, moveState.targetIndexLeft)){
                commitDisplayedColumnOrderToData('columnMenuMove', [moveState.colId]);
              }
            }
          },
          {
            label: 'Move column right',
            disabled: !moveState.canMoveRight,
            action: ()=>{
              if(moveDisplayedColumnTo(moveState.colId, moveState.targetIndexRight)){
                commitDisplayedColumnOrderToData('columnMenuMove', [moveState.colId]);
              }
            }
          },
          'separator',
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
          const visualRow = params?.node?.rowIndex ?? 0;
          const physicalRow = params?.node?.data?.__rowIndex ?? visualRow;
          if(!Number.isInteger(physicalRow) || physicalRow < 0 || (treatFirstRowAsHeader && physicalRow === 0)){
            return;
          }
          const selectionSpan = resolveSelectedRowSpanForHeader(visualRow);
          const visualStart = selectionSpan.start;
          const visualEnd = selectionSpan.start + selectionSpan.count - 1;
          const rowCountToAct = Math.max(1, selectionSpan.count || 1);
          const rowStart = Math.max(0, visualStart);
          const rowEnd = rowStart + rowCountToAct - 1;
          const rowList = [];
          for(let r = visualStart; r <= visualEnd; r++){
            const pr = toPhysicalRowIndex(r);
            if(!Number.isInteger(pr) || pr < 0){
              continue;
            }
            if(treatFirstRowAsHeader && pr === 0){
              continue;
            }
            rowList.push(pr);
          }
          const uniqueRowList = Array.from(new Set(rowList));
          const canExcludeRow = uniqueRowList.some(row => !exclusionController.isRowExcluded(row));
          const canIncludeRow = uniqueRowList.some(row => exclusionController.isRowExcluded(row));
          const items = [
            {
              label: `Insert ${rowCountToAct} row(s) above`,
              disabled: rowCountToAct <= 0,
              action: ()=>{
                const beforeExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
                instance.alter('insert_row_above', rowStart, rowCountToAct, 'row-header-menu');
                const afterExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
                if(hasGlobalUndo){
                  undoManager.record({
                    label: `table:${debugLabel}:insert-rows`,
                    scope: undoScope,
                    undo: ()=>{ instance.alter('remove_row', rowStart, rowCountToAct, 'undo:insert-rows'); if(beforeExclusions) exclusionController.importState(beforeExclusions); },
                    redo: ()=>{ instance.alter('insert_row_above', rowStart, rowCountToAct, 'redo:insert-rows'); if(afterExclusions) exclusionController.importState(afterExclusions); }
                  });
                }
              }
            },
            {
              label: `Insert ${rowCountToAct} row(s) below`,
              disabled: rowCountToAct <= 0,
              action: ()=>{
                const beforeExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
                instance.alter('insert_row_below', rowEnd, rowCountToAct, 'row-header-menu');
                const afterExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
                if(hasGlobalUndo){
                  const insertAt = rowEnd + 1;
                  undoManager.record({
                    label: `table:${debugLabel}:insert-rows`,
                    scope: undoScope,
                    undo: ()=>{ instance.alter('remove_row', insertAt, rowCountToAct, 'undo:insert-rows'); if(beforeExclusions) exclusionController.importState(beforeExclusions); },
                    redo: ()=>{ instance.alter('insert_row_below', rowEnd, rowCountToAct, 'redo:insert-rows'); if(afterExclusions) exclusionController.importState(afterExclusions); }
                  });
                }
              }
            },
            {
              label: `Delete ${rowCountToAct} row(s)`,
              disabled: rowCountToAct <= 0,
              action: ()=>{
                const at = rowStart;
                const count = rowCountToAct;
                const beforeExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
                const beforeData = dataHandle.current.slice(at, at + count).map(row => Array.isArray(row) ? row.slice() : []);
                instance.alter('remove_row', at, count, 'row-header-menu');
                const afterExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
                if(hasGlobalUndo){
                  undoManager.record({
                    label: `table:${debugLabel}:delete-rows`,
                    scope: undoScope,
                    undo: ()=>{
                      instance.alter('insert_row_above', at, count, 'undo:delete-rows');
                      const matrix = dataHandle.current;
                      for(let r = 0; r < count; r++){
                        matrix[at + r] = Array.isArray(beforeData[r]) ? beforeData[r].slice() : [];
                      }
                      ensureDims(matrix, matrix.length, colCount);
                      dataHandle.current = matrix;
                      syncRowData(instance.gridApi);
                      if(beforeExclusions){
                        exclusionController.importState(beforeExclusions);
                      }
                      renderAg(instance.gridApi);
                    },
                    redo: ()=>{
                      instance.alter('remove_row', at, count, 'redo:delete-rows');
                      if(afterExclusions){
                        exclusionController.importState(afterExclusions);
                        renderAg(instance.gridApi);
                      }
                    }
                  });
                }
              }
            },
            'separator',
            {
              label: 'Exclude row(s) from analysis',
              disabled: !canExcludeRow,
              action: ()=>{
                applyExclusionChange(`table:${debugLabel}:exclude-rows`, ()=>{
                  exclusionController.markRows(uniqueRowList, true);
                });
                triggerSchedule('exclusion-change', { scope: 'row', exclude: true });
              }
            },
            {
              label: 'Include row(s) in analysis',
              disabled: !canIncludeRow,
              action: ()=>{
                applyExclusionChange(`table:${debugLabel}:include-rows`, ()=>{
                  exclusionController.markRows(uniqueRowList, false);
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
        return resolveCellCoordsFromNode(target);
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

      const armHeaderSortSuppression = (colId, options)=>{
        if(typeof colId !== 'string' || !colId){
          return;
        }
        clearHeaderSortSuppression();
        pendingHeaderSortSuppression = { colId, any: !!options?.any };
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
        isHeaderDragSelecting = true;
        headerDragScope = 'row';
        headerDragAnchor = { row: (event.shiftKey && normalizedSelectionRange) ? normalizedSelectionRange.from.row : row };
        pendingHeaderDragIndex = row;
        headerDragRafPending = false;
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot header drag selection start', { debugLabel, scope: 'row', row });
        }
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
        if(target.closest('.hot-col-drag-handle')){
          const headerCell = target.closest('.ag-header-cell');
          const colId = headerCell?.getAttribute?.('col-id');
          if(typeof colId === 'string' && colId.startsWith('c')){
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
            isDragSelecting = false;
            isHeaderDragSelecting = false;
            headerDragMouseDown = false;
            headerDragScope = null;
            headerDragAnchor = null;
            pendingHeaderDragIndex = null;
            headerDragRafPending = false;
            const colIdx = Number(colId.slice(1));
            const selectedCols = resolveSelectedColumnGroup(colIdx) || [colIdx];
            const dragColIds = selectedCols.map(idx => `c${idx}`);
            startColumnHandleDrag(dragColIds);
          }
          return;
        }
        if(target.closest('.ag-header-cell-resize') || target.closest('.ag-header-icon') || target.closest('.ag-header-cell-menu-button')){
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
        if(event.altKey){
          return;
        }
        isDragSelecting = false;
        dragAnchor = null;
        pendingDragCell = null;
        isHeaderDragSelecting = false;
        headerDragScope = 'column';
        headerDragAnchor = { col: (event.shiftKey && normalizedSelectionRange) ? normalizedSelectionRange.from.col : col };
        pendingHeaderDragIndex = col;
        headerDragRafPending = false;
        headerDragMouseDown = true;
        headerDragColId = colId;
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot header drag selection armed', { debugLabel, scope: 'column', col });
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
        if(!suppression.any){
          const colId = headerCell.getAttribute('col-id');
          if(colId !== suppression.colId){
            clearHeaderSortSuppression();
            return;
          }
        }
        clearHeaderSortSuppression();
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
      };

      const resolveRowIndexFromEvent = (event)=>{
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(!target || typeof target.closest !== 'function'){
          const x = typeof event?.clientX === 'number' ? event.clientX : null;
          const y = typeof event?.clientY === 'number' ? event.clientY : null;
          if(x != null && y != null){
            try{
              const doc = container?.ownerDocument || document;
              const hit = doc.elementFromPoint?.(x, y);
              const coords = resolveCellCoordsFromNode(hit);
              if(coords){
                return coords.row;
              }
            }catch(err){
              // ignore
            }
            const estimated = estimateRowIndexFromPointer(y);
            if(estimated != null){
              return estimated;
            }
          }
          return null;
        }
        const rowNode = target.closest('.ag-row');
        const rowAttr = rowNode?.getAttribute?.('row-index');
        const row = Number(rowAttr);
        if(Number.isInteger(row) && row >= 0){
          return row;
        }
        const coords = resolveCellCoords(event);
        if(coords){
          return coords.row;
        }
        const x = typeof event?.clientX === 'number' ? event.clientX : null;
        const y = typeof event?.clientY === 'number' ? event.clientY : null;
        if(x != null && y != null){
          try{
            const doc = container?.ownerDocument || document;
            const hit = doc.elementFromPoint?.(x, y);
            const coordsFromPoint = resolveCellCoordsFromNode(hit);
            if(coordsFromPoint){
              return coordsFromPoint.row;
            }
          }catch(err){
            // ignore
          }
          const estimated = estimateRowIndexFromPointer(y);
          if(estimated != null){
            return estimated;
          }
        }
        return null;
      };

      const resolveColIndexFromEvent = (event)=>{
        const resolveFromNode = (node)=>{
          if(!node || typeof node.closest !== 'function'){
            return null;
          }
          const headerCell = node.closest('.ag-header-cell');
          if(headerCell){
            const colId = headerCell.getAttribute('col-id');
            if(typeof colId === 'string' && colId.startsWith('c')){
              const col = Number(colId.slice(1));
              if(Number.isInteger(col) && col >= 0){
                return col;
              }
            }
          }
          const cell = node.closest('.ag-cell');
          if(cell){
            const colId = cell.getAttribute('col-id');
            if(typeof colId === 'string' && colId.startsWith('c')){
              const col = Number(colId.slice(1));
              if(Number.isInteger(col) && col >= 0){
                return col;
              }
            }
          }
          return null;
        };

        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        const fromTarget = resolveFromNode(target);
        if(fromTarget != null){
          return fromTarget;
        }

        const x = typeof event?.clientX === 'number' ? event.clientX : null;
        const y = typeof event?.clientY === 'number' ? event.clientY : null;
        if(x != null && y != null){
          try{
            const doc = container?.ownerDocument || document;
            const hit = doc.elementFromPoint?.(x, y);
            const fromPoint = resolveFromNode(hit);
            if(fromPoint != null){
              return fromPoint;
            }
          }catch(err){
            // ignore
          }
        }
        const coords = resolveCellCoords(event);
        return coords ? coords.col : null;
      };

      const resolveCellCoordsFromPoint = (x, y)=>{
        if(x == null || y == null){
          return null;
        }
        try{
          const doc = container?.ownerDocument || document;
          const hit = doc.elementFromPoint?.(x, y);
          return resolveCellCoordsFromNode(hit);
        }catch(err){
          return null;
        }
      };

      const queueFillDragPreviewUpdate = (target)=>{
        pendingFillTarget = target;
        if(fillDragRafPending){
          return;
        }
        fillDragRafPending = true;
        raf(()=>{
          fillDragRafPending = false;
          const activeTarget = pendingFillTarget;
          pendingFillTarget = null;
          if(!isFillHandleDragging || !activeTarget){
            return;
          }
          const selection = fillDragStartSelection;
          if(!selection){
            return;
          }
          const direction = resolveFillDirection(activeTarget);
          if(direction){
            fillDragDirection = direction;
          }
          const activeDirection = fillDragDirection;
          if(!activeDirection){
            if(normalizedFillPreviewRange){
              setFillPreviewRange(null);
            }
            return;
          }
          if(activeDirection === 'down' || activeDirection === 'up'){
            let row = activeTarget.row;
            if(!Number.isInteger(row)){
              row = estimateRowIndexFromPointer(activeTarget.clientY);
            }
            if(!Number.isInteger(row)){
              return;
            }
            const cappedRow = Math.max(0, Math.min(row, Math.max(0, autoGrowthConfig.rowCap - 1)));
            ensureRowsForTarget(cappedRow);
            const preview = buildFillPreviewRange(selection, activeDirection, cappedRow);
            if(!rangesEqual(preview, normalizedFillPreviewRange)){
              setFillPreviewRange(preview);
            }
            return;
          }
          const col = activeTarget.col;
          if(!Number.isInteger(col)){
            return;
          }
          const cappedCol = Math.max(0, Math.min(col, Math.max(0, autoGrowthConfig.colCap - 1)));
          ensureColsForTarget(cappedCol);
          const preview = buildFillPreviewRange(selection, activeDirection, cappedCol);
          if(!rangesEqual(preview, normalizedFillPreviewRange)){
            setFillPreviewRange(preview);
          }
        });
      };

      const AUTO_SCROLL_THRESHOLD = 24;
      const AUTO_SCROLL_MAX_STEP = 28;
      const computeAutoScrollStep = (distance)=>{
        const ratio = Math.min(1, Math.max(0, distance / AUTO_SCROLL_THRESHOLD));
        return Math.max(4, Math.round(AUTO_SCROLL_MAX_STEP * ratio));
      };

      const resolveVerticalScrollTargets = ()=>{
        const candidates = [
          resolveViewport(),
          container?.querySelector?.('.ag-body-viewport'),
          container?.querySelector?.('.ag-center-cols-viewport'),
          container?.querySelector?.('.ag-body-vertical-scroll-viewport'),
          container?.querySelector?.('.ag-body-vertical-scroll')
        ];
        const unique = [];
        candidates.forEach(el=>{
          if(el && unique.indexOf(el) === -1){
            unique.push(el);
          }
        });
        return unique;
      };

      const resolveHorizontalScrollTargets = ()=>{
        const candidates = [
          container?.querySelector?.('.ag-body-horizontal-scroll-viewport'),
          container?.querySelector?.('.ag-body-horizontal-scroll'),
          resolveViewport()
        ];
        const unique = [];
        candidates.forEach(el=>{
          if(el && unique.indexOf(el) === -1){
            unique.push(el);
          }
        });
        return unique;
      };

      const applyScrollDelta = (targets, prop, delta)=>{
        let moved = false;
        (targets || []).forEach(el=>{
          if(!el || typeof el[prop] !== 'number'){
            return;
          }
          const prev = el[prop];
          el[prop] = prev + delta;
          if(el[prop] !== prev){
            moved = true;
          }
        });
        return moved;
      };

      const resolveEffectiveVerticalRect = (baseRect)=>{
        if(!baseRect){
          return null;
        }
        let bottom = baseRect.bottom;
        const doc = container?.ownerDocument || document;
        const dock = doc.getElementById('workspaceTabsDock') || doc.querySelector('.workspace-tabs-dock');
        if(dock && typeof dock.getBoundingClientRect === 'function'){
          const dockRect = dock.getBoundingClientRect();
          if(dockRect.top < bottom && dockRect.bottom > baseRect.top){
            bottom = Math.min(bottom, dockRect.top);
          }
        }
        const win = doc.defaultView || global;
        if(container && typeof doc.elementFromPoint === 'function' && win){
          const maxX = Number.isFinite(win.innerWidth) ? win.innerWidth : baseRect.right;
          const maxY = Number.isFinite(win.innerHeight) ? win.innerHeight : baseRect.bottom;
          const sampleX = Math.min(Math.max(baseRect.left + 4, 0), Math.max(0, maxX - 1));
          const sampleY = Math.min(Math.max(baseRect.bottom - 1, 0), Math.max(0, maxY - 1));
          try{
            const hit = doc.elementFromPoint(sampleX, sampleY);
            if(hit && !container.contains(hit) && typeof hit.getBoundingClientRect === 'function'){
              const hitRect = hit.getBoundingClientRect();
              if(hitRect.top < bottom && hitRect.bottom > baseRect.top){
                bottom = Math.min(bottom, hitRect.top);
              }
            }
          }catch(err){
            // ignore overlay hit-test failures
          }
        }
        return {
          top: baseRect.top,
          bottom,
          left: baseRect.left,
          right: baseRect.right
        };
      };

      const getGridRowHeight = ()=>{
        const style = container ? (container.ownerDocument || document).defaultView?.getComputedStyle(container) : null;
        if(style && typeof style.getPropertyValue === 'function'){
          const raw = style.getPropertyValue('--ag-row-height') || '';
          const parsed = Number.parseFloat(raw);
          if(Number.isFinite(parsed) && parsed > 0){
            return parsed;
          }
        }
        return 28;
      };

      const getDisplayedRowRange = (api)=>{
        const count = typeof api?.getDisplayedRowCount === 'function' ? api.getDisplayedRowCount() : dataHandle.current.length;
        const total = Math.max(0, Number(count) || 0);
        let first = typeof api?.getFirstDisplayedRow === 'function' ? api.getFirstDisplayedRow() : 0;
        let last = typeof api?.getLastDisplayedRow === 'function' ? api.getLastDisplayedRow() : (total > 0 ? total - 1 : 0);
        if(!Number.isInteger(first) || first < 0){
          first = 0;
        }
        if(!Number.isInteger(last) || last < 0){
          last = total > 0 ? total - 1 : 0;
        }
        return { first, last, count: total };
      };

      const estimateRowIndexFromPointer = (pointerY)=>{
        const api = instance?.gridApi;
        if(!api || pointerY == null){
          return null;
        }
        const viewport = resolveViewport()
          || container?.querySelector?.('.ag-body-viewport')
          || container?.querySelector?.('.ag-center-cols-viewport')
          || container?.querySelector?.('.ag-body-vertical-scroll-viewport');
        if(!viewport || typeof viewport.getBoundingClientRect !== 'function'){
          return null;
        }
        const rect = resolveEffectiveVerticalRect(viewport.getBoundingClientRect());
        const rectHeight = rect ? (rect.bottom - rect.top) : 0;
        if(!rect || rectHeight <= 0){
          return null;
        }
        const rowHeight = getGridRowHeight();
        let first = typeof api.getFirstDisplayedRow === 'function' ? api.getFirstDisplayedRow() : 0;
        if(!Number.isInteger(first) || first < 0){
          first = 0;
        }
        const count = typeof api.getDisplayedRowCount === 'function' ? api.getDisplayedRowCount() : dataHandle.current.length;
        const maxIndex = Math.max(0, (Number(count) || 0) - 1);
        const offset = pointerY - rect.top;
        const delta = Math.floor(offset / Math.max(1, rowHeight));
        let index = first + delta;
        if(!Number.isFinite(index)){
          return null;
        }
        index = Math.max(0, Math.min(maxIndex, Math.round(index)));
        return index;
      };

      const scrollGridVerticallyByRows = (direction, distance)=>{
        const api = instance?.gridApi;
        if(!api || typeof api.ensureIndexVisible !== 'function'){
          return false;
        }
        if(typeof api.getVerticalPixelRange === 'function' && typeof api.setVerticalScrollPosition === 'function'){
          try{
            const range = api.getVerticalPixelRange();
            const delta = computeAutoScrollStep(distance) * (direction === 'up' ? -1 : 1);
            api.setVerticalScrollPosition((range?.top || 0) + delta);
            return true;
          }catch(err){
            // fall back to row-based scroll
          }
        }
        const range = getDisplayedRowRange(api);
        if(range.count <= 0){
          return false;
        }
        const rowHeight = getGridRowHeight();
        const stepRows = Math.max(1, Math.round(computeAutoScrollStep(distance) / Math.max(1, rowHeight)));
        if(direction === 'up'){
          const target = Math.max(0, range.first - stepRows);
          try{
            api.ensureIndexVisible(target, 'top');
          }catch(err){
            api.ensureIndexVisible(target);
          }
          return true;
        }
        if(direction === 'down'){
          const maxIndex = Math.max(0, range.count - 1);
          const target = Math.min(maxIndex, range.last + stepRows);
          try{
            api.ensureIndexVisible(target, 'bottom');
          }catch(err){
            api.ensureIndexVisible(target);
          }
          return true;
        }
        return false;
      };

      const maybeAutoScrollPointer = (pointer)=>{
        if(!pointer){
          return false;
        }
        const pointerX = pointer.x;
        const pointerY = pointer.y;
        if(pointerX == null && pointerY == null){
          return false;
        }
        const verticalViewport = resolveViewport()
          || container?.querySelector?.('.ag-body-viewport')
          || container?.querySelector?.('.ag-center-cols-viewport')
          || container?.querySelector?.('.ag-body-vertical-scroll-viewport')
          || container;
        const verticalRect = resolveEffectiveVerticalRect(verticalViewport?.getBoundingClientRect?.());
        let scrolled = false;
        if(verticalRect && pointerY != null){
          const distTop = (verticalRect.top + AUTO_SCROLL_THRESHOLD) - pointerY;
          const distBottom = pointerY - (verticalRect.bottom - AUTO_SCROLL_THRESHOLD);
          if(distTop > 0){
            const delta = -computeAutoScrollStep(distTop);
            const moved = applyScrollDelta(resolveVerticalScrollTargets(), 'scrollTop', delta);
            scrolled = moved || scrolled;
            if(!moved){
              scrolled = scrollGridVerticallyByRows('up', distTop) || scrolled;
            }
          }else if(distBottom > 0){
            const delta = computeAutoScrollStep(distBottom);
            const moved = applyScrollDelta(resolveVerticalScrollTargets(), 'scrollTop', delta);
            scrolled = moved || scrolled;
            if(!moved){
              scrolled = scrollGridVerticallyByRows('down', distBottom) || scrolled;
            }
          }
        }

        const horizontalViewport = container?.querySelector?.('.ag-body-horizontal-scroll-viewport')
          || container?.querySelector?.('.ag-body-horizontal-scroll')
          || verticalViewport;
        const horizontalRect = horizontalViewport?.getBoundingClientRect?.();
        if(horizontalRect && pointerX != null){
          const distLeft = (horizontalRect.left + AUTO_SCROLL_THRESHOLD) - pointerX;
          const distRight = pointerX - (horizontalRect.right - AUTO_SCROLL_THRESHOLD);
          if(distLeft > 0){
            scrolled = applyScrollDelta(resolveHorizontalScrollTargets(), 'scrollLeft', -computeAutoScrollStep(distLeft)) || scrolled;
          }else if(distRight > 0){
            scrolled = applyScrollDelta(resolveHorizontalScrollTargets(), 'scrollLeft', computeAutoScrollStep(distRight)) || scrolled;
          }
        }
        return scrolled;
      };

      const scheduleFillAutoScroll = ()=>{
        if(fillAutoScrollRafId != null){
          return;
        }
        fillAutoScrollRafId = raf(()=>{
          fillAutoScrollRafId = null;
          if(!isFillHandleDragging){
            return;
          }
          const didScroll = maybeAutoScrollPointer(fillDragLastPointer);
          if(didScroll && fillDragLastPointer){
            const proxyEvent = { clientX: fillDragLastPointer.x, clientY: fillDragLastPointer.y, target: null };
            const nextTarget = {
              row: resolveRowIndexFromEvent(proxyEvent),
              col: resolveColIndexFromEvent(proxyEvent),
              clientX: fillDragLastPointer.x,
              clientY: fillDragLastPointer.y
            };
            queueFillDragPreviewUpdate(nextTarget);
          }
          scheduleFillAutoScroll();
        });
      };

      const queueSelectionDragUpdate = (coords)=>{
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

      const scheduleSelectionAutoScroll = ()=>{
        if(selectionAutoScrollRafId != null){
          return;
        }
        selectionAutoScrollRafId = raf(()=>{
          selectionAutoScrollRafId = null;
          if(!isDragSelecting){
            return;
          }
          const didScroll = maybeAutoScrollPointer(selectionDragLastPointer);
          if(didScroll && selectionDragLastPointer){
            let coords = resolveCellCoordsFromPoint(selectionDragLastPointer.x, selectionDragLastPointer.y);
            if(!coords){
              const row = estimateRowIndexFromPointer(selectionDragLastPointer.y);
              let col = resolveColIndexFromEvent({ clientX: selectionDragLastPointer.x, clientY: selectionDragLastPointer.y, target: null });
              if(Number.isInteger(row)){
                if(!Number.isInteger(col)){
                  col = pendingDragCell?.col ?? dragAnchor?.col ?? normalizedSelectionRange?.to?.col ?? null;
                }
                if(Number.isInteger(col)){
                  coords = { row, col };
                }
              }
            }
            if(coords){
              queueSelectionDragUpdate(coords);
            }
          }
          scheduleSelectionAutoScroll();
        });
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
        selectionDragLastPointer = {
          x: typeof event?.clientX === 'number' ? event.clientX : null,
          y: typeof event?.clientY === 'number' ? event.clientY : null
        };
        pendingDragCell = coords;
        isHeaderDragSelecting = false;
        headerDragScope = null;
        headerDragAnchor = null;
        pendingHeaderDragIndex = null;
        headerDragRafPending = false;
        headerDragMouseDown = false;
        headerDragColId = null;
        dragAnchor = (event.shiftKey && normalizedSelectionRange) ? normalizedSelectionRange.from : coords;
        setLastRange({ from: dragAnchor, to: coords });
        renderAg(instance.gridApi);
      };

      const handleMouseMove = (event)=>{
        if(isFillHandleDragging){
          const buttons = typeof event?.buttons === 'number' ? event.buttons : null;
          if(buttons !== null){
            if((buttons & 1) === 1){
              fillDragButtonsSeen = true;
            }else if(fillDragButtonsSeen){
              resetFillHandleDrag('button-up');
              return;
            }
          }
          const clientX = typeof event?.clientX === 'number' ? event.clientX : null;
          const clientY = typeof event?.clientY === 'number' ? event.clientY : null;
          fillDragLastPointer = { x: clientX, y: clientY };
          const target = {
            row: resolveRowIndexFromEvent(event),
            col: resolveColIndexFromEvent(event),
            clientX,
            clientY
          };
          queueFillDragPreviewUpdate(target);
          scheduleFillAutoScroll();
          event.preventDefault?.();
          event.stopPropagation?.();
          event.stopImmediatePropagation?.();
          return;
        }
        if(isColumnHandleDragging){
          const buttons = typeof event?.buttons === 'number' ? event.buttons : null;
          const leftDown = buttons !== null ? ((buttons & 1) === 1) : true;
          if(!leftDown){
            stopColumnHandleDrag();
            return;
          }
          const positions = getDisplayedDataColumnPositions();
          if(!positions || !Array.isArray(columnHandleDragColIds) || !columnHandleDragColIds.length){
            return;
          }

          const draggedEntries = positions
            .filter(entry => columnHandleDragColIds.includes(entry.colId))
            .sort((a, b)=>a.index - b.index);
          if(!draggedEntries.length){
            return;
          }
          const draggedColIdsOrdered = draggedEntries.map(entry => entry.colId);
          const movingIndices = draggedEntries.map(entry => entry.index);
          const minMovingIndex = movingIndices[0];
          const maxMovingIndex = movingIndices[movingIndices.length - 1];
          const movingCount = movingIndices.length;

          const minIndex = positions[0].index;
          const maxIndex = positions[positions.length - 1].index;
          let targetBefore = null;

          const x = typeof event?.clientX === 'number' ? event.clientX : null;
          const y = typeof event?.clientY === 'number' ? event.clientY : null;
          const docLocal = container?.ownerDocument || document;
          if(x != null && y != null && typeof docLocal?.elementFromPoint === 'function'){
            try{
              const hit = docLocal.elementFromPoint(x, y);
              const headerCell = hit?.closest?.('.ag-header-cell') || null;
              const hitColId = headerCell?.getAttribute?.('col-id') || null;
              const hoverEntry = positions.find(entry => entry.colId === hitColId) || null;
              if(hoverEntry && !columnHandleDragColIds.includes(hitColId)){
                const rect = headerCell.getBoundingClientRect?.();
                const rectWidth = Number(rect?.width);
                const rectLeft = Number(rect?.left);
                const placeAfter = Number.isFinite(rectWidth) && rectWidth > 0 && Number.isFinite(rectLeft)
                  ? ((x - rectLeft) / rectWidth) >= 0.5
                  : false;
                targetBefore = hoverEntry.index + (placeAfter ? 1 : 0);
              }
            }catch(err){
              // ignore hit-test failures; fall back to coarse targeting
            }
          }

          if(targetBefore == null){
            const overColIdx = resolveColIndexFromEvent(event);
            if(overColIdx == null){
              return;
            }
            const overColId = `c${overColIdx}`;
            const hoverEntry = positions.find(entry => entry.colId === overColId) || null;
            if(!hoverEntry || columnHandleDragColIds.includes(overColId)){
              return;
            }
            targetBefore = hoverEntry.index;
          }

          targetBefore = Math.min(maxIndex + 1, Math.max(minIndex, targetBefore));
          if(targetBefore >= minMovingIndex && targetBefore <= (maxMovingIndex + 1)){
            return;
          }

          const countMovingBefore = movingIndices.filter(idx => idx < targetBefore).length;
          let effectiveToIndex = targetBefore - countMovingBefore;
          effectiveToIndex = Math.max(0, effectiveToIndex);

          if(targetBefore > maxMovingIndex){
            effectiveToIndex = Math.max(0, Math.min(effectiveToIndex, (maxIndex + 1) - movingCount));
          }
          pendingColumnHandleMoveIndex = effectiveToIndex;
          if(!columnHandleMoveRafPending){
            columnHandleMoveRafPending = true;
            raf(()=>{
              columnHandleMoveRafPending = false;
              if(!isColumnHandleDragging || !Array.isArray(columnHandleDragColIds) || !columnHandleDragColIds.length || pendingColumnHandleMoveIndex == null){
                return;
              }
              const nextTarget = pendingColumnHandleMoveIndex;
              pendingColumnHandleMoveIndex = null;
              if(columnHandleLastTargetIndex === nextTarget){
                return;
              }
              columnHandleLastTargetIndex = nextTarget;
              moveDisplayedColumnsTo(draggedColIdsOrdered, nextTarget);
            });
          }
          event.preventDefault?.();
          event.stopPropagation?.();
          event.stopImmediatePropagation?.();
          return;
        }
        if(headerDragMouseDown && headerDragScope === 'column' && !isHeaderDragSelecting){
          const buttons = typeof event?.buttons === 'number' ? event.buttons : null;
          const leftDown = buttons !== null ? ((buttons & 1) === 1) : !!(event?.which === 1);
          if(leftDown){
            isHeaderDragSelecting = true;
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
            if(headerDragColId){
              armHeaderSortSuppression(headerDragColId, { any: true });
            }
            if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
              console.debug('Debug: Shared.hot header drag selection start', { debugLabel, scope: 'column' });
            }
          }
        }
        if(isHeaderDragSelecting){
          const scope = headerDragScope;
          const anchor = headerDragAnchor;
          if(!scope || !anchor){
            return;
          }
          const nextIndex = scope === 'row' ? resolveRowIndexFromEvent(event) : resolveColIndexFromEvent(event);
          if(nextIndex == null){
            return;
          }
          pendingHeaderDragIndex = nextIndex;
          if(headerDragRafPending){
            return;
          }
          headerDragRafPending = true;
          raf(()=>{
            headerDragRafPending = false;
            if(!isHeaderDragSelecting || pendingHeaderDragIndex == null || !headerDragAnchor){
              return;
            }
            if(headerDragScope === 'row'){
              const nextRow = pendingHeaderDragIndex;
              const anchorRow = Number(headerDragAnchor.row ?? nextRow);
              const fromRow = Math.min(anchorRow, nextRow);
              const toRow = Math.max(anchorRow, nextRow);
              const fromCol = 0;
              const toCol = Math.max(0, colCount - 1);
              setLastRange({ from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } });
              renderAg(instance.gridApi);
              return;
            }
            const nextCol = pendingHeaderDragIndex;
            const anchorCol = Number(headerDragAnchor.col ?? nextCol);
            const lastRow = Math.max(0, getVisualRowCount() - 1);
            const fromCol = Math.min(anchorCol, nextCol);
            const toCol = Math.max(anchorCol, nextCol);
            setLastRange({ from: { row: 0, col: fromCol }, to: { row: lastRow, col: toCol } });
            renderAg(instance.gridApi);
          });
          return;
        }
        if(!isDragSelecting){
          return;
        }
        const clientX = typeof event?.clientX === 'number' ? event.clientX : null;
        const clientY = typeof event?.clientY === 'number' ? event.clientY : null;
        let coords = resolveCellCoords(event);
        if(!coords && clientX != null && clientY != null){
          coords = resolveCellCoordsFromPoint(clientX, clientY);
          if(!coords){
            const row = estimateRowIndexFromPointer(clientY);
            let col = resolveColIndexFromEvent({ clientX, clientY, target: null });
            if(Number.isInteger(row)){
              if(!Number.isInteger(col)){
                col = pendingDragCell?.col ?? dragAnchor?.col ?? normalizedSelectionRange?.to?.col ?? null;
              }
              if(Number.isInteger(col)){
                coords = { row, col };
              }
            }
          }
        }
        selectionDragLastPointer = { x: clientX, y: clientY };
        if(coords){
          queueSelectionDragUpdate(coords);
        }
        scheduleSelectionAutoScroll();
      };

      const handleMouseUp = ()=>{
        if(isFillHandleDragging){
          const selection = fillDragStartSelection;
          const preview = normalizedFillPreviewRange;
          const applied = applyFillDragPreview();
          if(selection){
            if(preview){
              const nextSelection = {
                from: {
                  row: Math.min(selection.from.row, preview.from.row),
                  col: Math.min(selection.from.col, preview.from.col)
                },
                to: {
                  row: Math.max(selection.to.row, preview.to.row),
                  col: Math.max(selection.to.col, preview.to.col)
                }
              };
              setLastRange(nextSelection);
              renderAg(instance.gridApi);
              fireHook('afterSelectionEnd', nextSelection.from.row, nextSelection.from.col, nextSelection.to.row, nextSelection.to.col);
            }else if(applied){
              fireHook('afterSelectionEnd', selection.from.row, selection.from.col, selection.to.row, selection.to.col);
            }
          }
          resetFillHandleDrag('mouseup');
          return;
        }
        if(isHeaderDragSelecting){
          isHeaderDragSelecting = false;
          headerDragScope = null;
          headerDragAnchor = null;
          pendingHeaderDragIndex = null;
          headerDragRafPending = false;
          headerDragMouseDown = false;
          headerDragColId = null;
          const normalized = normalizedSelectionRange;
          if(normalized){
            fireHook('afterSelectionEnd', normalized.from.row, normalized.from.col, normalized.to.row, normalized.to.col);
            if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
              console.debug('Debug: Shared.hot header drag selection end', { debugLabel, selection: normalized });
            }
          }
          return;
        }
        if(isColumnHandleDragging){
          stopColumnHandleDrag();
          return;
        }
        if(headerDragMouseDown){
          headerDragMouseDown = false;
          headerDragColId = null;
          headerDragScope = null;
          headerDragAnchor = null;
          pendingHeaderDragIndex = null;
          headerDragRafPending = false;
        }
        if(!isDragSelecting){
          return;
        }
        isDragSelecting = false;
        dragRafPending = false;
        resetSelectionAutoScroll();
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
        const isEscape = key === 'Escape' || keyCode === 27;
        if(isEscape && isFillHandleDragging){
          resetFillHandleDrag('escape');
          return;
        }
        const isEnter = key === 'Enter' || key === 'NumpadEnter' || keyCode === 13;
        if(isEnter && normalizedCopyHighlightRange){
          setCopyHighlightRange(null);
          renderAg(instance.gridApi);
        }
        if(isEnter && !isEditableTarget(event.target)){
          const selection = normalizedSelectionRange || normalizeRange(lastRange);
          if(selection
            && selection.from.row === selection.to.row
            && selection.from.col === selection.to.col){
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
            const nextRow = selection.to.row + 1;
            if(nextRow >= getVisualRowCount()){
              try{ appendRows(1); }catch(err){}
            }
            setLastRange({ from: { row: nextRow, col: selection.to.col }, to: { row: nextRow, col: selection.to.col } });
            renderAg(instance.gridApi);
            try{
              const api = instance.gridApi;
              if(api && typeof api.setFocusedCell === 'function'){
                const colId = `c${selection.to.col}`;
                api.setFocusedCell(nextRow, colId);
                if(typeof api.ensureIndexVisible === 'function'){
                  api.ensureIndexVisible(nextRow);
                }
              }
            }catch(err){
              // best-effort focus move
            }
            return;
          }
        }
        // If Enter was pressed while editing an input (editable target), mark it
        // so we can move the selection down after editing finishes.
        if(isEnter && isEditableTarget(event.target)){
          enterPressedDuringEdit = true;
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

      const normalizeDecimalSeparators = (rows, delimiter)=>{
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
          console.debug('Debug: hot.normalizeDecimalSeparators', { delimiter, changed, debugLabel });
        }
        return rows;
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
        const rows = lines.map(line => {
          if(delimiter){
            return line.split(delimiter);
          }
          return [line];
        }).filter(row => Array.isArray(row) && row.some(cell => String(cell ?? '').trim() !== ''));
        return normalizeDecimalSeparators(rows, delimiter);
      };

      const handlePaste = async (event)=>{
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
        let plain = '';
        try{
          plain = event.clipboardData?.getData?.('text/plain') || event.clipboardData?.getData?.('text') || '';
        }catch(e){ plain = '' }
        // prevent default immediately so async clipboard reads don't allow the
        // browser to perform its native paste before we handle it (Firefox)
        try{ event.preventDefault?.(); event.stopImmediatePropagation?.(); event.stopPropagation?.(); }catch(e){}

        // Try shared tableImport helper first (centralized, robust logic)
        try{
          if(typeof Shared?.tableImport?.getClipboardTextFromEvent === 'function'){
            console.debug('Debug: hot.handlePaste calling Shared.tableImport.getClipboardTextFromEvent');
            plain = await Shared.tableImport.getClipboardTextFromEvent(event);
            console.debug('Debug: hot.handlePaste helper returned', { length: (plain || '').length });
          }
        }catch(e){
          console.debug('Debug: hot.handlePaste helper threw', { message: e?.message || String(e) });
        }

        // Fallback: if helper didn't return anything, keep the previous local fallbacks
        if(!plain){
          try{
            const items = event.clipboardData?.items;
            if(items && items.length){
              for(let i = 0; i < items.length; i++){
                const item = items[i];
                try{
                  if(item && item.kind === 'string' && typeof item.getAsString === 'function'){
                    plain = await new Promise(resolve => item.getAsString(s => resolve(s)));
                    if(plain) break;
                  }
                  if(item && item.kind === 'file' && typeof item.getAsFile === 'function'){
                    const file = item.getAsFile();
                    if(file){
                      plain = await new Promise(res => {
                        const reader = new FileReader();
                        reader.onload = e => res(e.target?.result || '');
                        reader.onerror = () => res('');
                        reader.readAsText(file);
                      });
                      if(plain) break;
                    }
                  }
                }catch(e){/* ignore item errors */}
              }
            }
          }catch(e){/* ignore */}
        }
        if(!plain){
          try{
            const nav = globalThis.navigator?.clipboard;
            if(nav && typeof nav.readText === 'function'){
              plain = await nav.readText();
            }
          }catch(e){/* ignore */}
        }
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
        const moveState = getMoveColumnState(colIdx);
        const selectionSpan = resolveSelectedColumnSpanForHeader(colIdx);
        const insertLabelCount = selectionSpan.count || 1;
        const selectionStart = selectionSpan.start;
        const selectionEnd = selectionSpan.start + selectionSpan.count - 1;
        const canExclude = !exclusionController.isColumnExcluded(colIdx);
        const canInclude = exclusionController.isColumnExcluded(colIdx);
        const items = [
          {
            label: `Insert ${insertLabelCount} column(s) before`,
            disabled: selectionSpan.count <= 0,
            action: ()=>{
              const prevExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              instance.alter('insert_col_left', selectionStart, insertLabelCount, 'header-menu');
              const nextExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              if(hasGlobalUndo){
                undoManager.record({
                  label: `table:${debugLabel}:insert-cols`,
                  scope: undoScope,
                  undo: ()=>{ instance.alter('remove_col', selectionStart, insertLabelCount, 'undo:insert-cols'); if(prevExclusions) exclusionController.importState(prevExclusions); },
                  redo: ()=>{ instance.alter('insert_col_left', selectionStart, insertLabelCount, 'redo:insert-cols'); if(nextExclusions) exclusionController.importState(nextExclusions); }
                });
              }
            }
          },
          {
            label: `Insert ${insertLabelCount} column(s) after`,
            disabled: selectionSpan.count <= 0,
            action: ()=>{
              const prevExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              instance.alter('insert_col_right', selectionEnd, insertLabelCount, 'header-menu');
              const nextExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              if(hasGlobalUndo){
                const insertAt = selectionEnd + 1;
                undoManager.record({
                  label: `table:${debugLabel}:insert-cols`,
                  scope: undoScope,
                  undo: ()=>{ instance.alter('remove_col', insertAt, insertLabelCount, 'undo:insert-cols'); if(prevExclusions) exclusionController.importState(prevExclusions); },
                  redo: ()=>{ instance.alter('insert_col_right', selectionEnd, insertLabelCount, 'redo:insert-cols'); if(nextExclusions) exclusionController.importState(nextExclusions); }
                });
              }
            }
          },
          {
            label: `Delete ${selectionSpan.count || 1} column(s)`,
            disabled: selectionSpan.count <= 0,
            action: ()=>{
              const at = selectionStart;
              const count = selectionSpan.count || 1;
              const beforeExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              const beforeHeaders = Array.isArray(colHeadersSetting) ? colHeadersSetting.slice(at, at + count) : null;
              const beforeData = dataHandle.current.map(row => (Array.isArray(row) ? row.slice(at, at + count) : Array.from({ length: count }, ()=>'')));
              instance.alter('remove_col', at, count, 'header-menu');
              const afterExclusions = hasGlobalUndo ? exclusionController.exportState() : null;
              if(hasGlobalUndo){
                undoManager.record({
                  label: `table:${debugLabel}:delete-cols`,
                  scope: undoScope,
                  undo: ()=>{
                    instance.alter('insert_col_left', at, count, 'undo:delete-cols');
                    const matrix = dataHandle.current;
                    for(let r = 0; r < matrix.length; r++){
                      const row = matrix[r] || [];
                      for(let c = 0; c < count; c++){
                        row[at + c] = beforeData[r]?.[c] ?? '';
                      }
                    }
                    if(Array.isArray(colHeadersSetting) && Array.isArray(beforeHeaders)){
                      colHeadersSetting.splice(at, count, ...beforeHeaders);
                      colHeaders = resolveColHeaders(colCount);
                    }
                    if(beforeExclusions){
                      exclusionController.importState(beforeExclusions);
                    }
                    rebuildColumns(instance.gridApi);
                    renderAg(instance.gridApi);
                  },
                  redo: ()=>{
                    instance.alter('remove_col', at, count, 'redo:delete-cols');
                    if(afterExclusions){
                      exclusionController.importState(afterExclusions);
                      renderAg(instance.gridApi);
                    }
                  }
                });
              }
            }
          },
          'separator',
          {
            label: 'Move column left',
            disabled: !moveState.canMoveLeft,
            action: ()=>{
              if(moveDisplayedColumnTo(moveState.colId, moveState.targetIndexLeft)){
                commitDisplayedColumnOrderToData('columnMenuMove', [moveState.colId]);
              }
            }
          },
          {
            label: 'Move column right',
            disabled: !moveState.canMoveRight,
            action: ()=>{
              if(moveDisplayedColumnTo(moveState.colId, moveState.targetIndexRight)){
                commitDisplayedColumnOrderToData('columnMenuMove', [moveState.colId]);
              }
            }
          },
          'separator',
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
      win?.addEventListener?.('pointermove', handleMouseMove, true);
      win?.addEventListener?.('mouseup', handleMouseUp, true);
      win?.addEventListener?.('pointerup', handleMouseUp, true);
      win?.addEventListener?.('pointercancel', handleMouseUp, true);
      win?.addEventListener?.('mouseup', handleColumnHeaderMouseUp, true);
      doc.addEventListener('click', handleColumnHeaderClick, true);
      container.addEventListener('keydown', handleKeyDown, true);
      container.addEventListener('contextmenu', handleContextMenu, true);
      container.addEventListener('contextmenu', handleHeaderContextMenuProxy, true);
      if(!disableBuiltInPaste){
        container.addEventListener('paste', handlePaste, true);
        try{
          document.addEventListener('paste', handlePaste, true);
          console.debug('Debug: hot.js registered document paste listener for hot container', { containerId: container?.id || null });
        }catch(e){
          console.debug('Debug: hot.js failed to register document paste listener', { message: e?.message || String(e) });
        }
      }else if(typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: hot.js paste handler disabled', { containerId: container?.id || null, debugLabel });
      }
      cleanupFns.push(()=>{
        container.removeEventListener('mousedown', handleRowHeaderMouseDown, true);
        container.removeEventListener('mousedown', handleColumnHeaderMouseDown, true);
        container.removeEventListener('mousedown', handleMouseDown, true);
        win?.removeEventListener?.('mousemove', handleMouseMove, true);
        win?.removeEventListener?.('pointermove', handleMouseMove, true);
        win?.removeEventListener?.('mouseup', handleMouseUp, true);
        win?.removeEventListener?.('pointerup', handleMouseUp, true);
        win?.removeEventListener?.('pointercancel', handleMouseUp, true);
        win?.removeEventListener?.('mouseup', handleColumnHeaderMouseUp, true);
        doc.removeEventListener('click', handleColumnHeaderClick, true);
        clearHeaderSortSuppression();
        container.removeEventListener('keydown', handleKeyDown, true);
        container.removeEventListener('contextmenu', handleContextMenu, true);
        container.removeEventListener('contextmenu', handleHeaderContextMenuProxy, true);
        if(!disableBuiltInPaste){
          container.removeEventListener('paste', handlePaste, true);
          try{ document.removeEventListener('paste', handlePaste, true); }catch(e){}
        }
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
    return createStandardTableAgGrid(container, dimensions, scheduleDraw, overrides);
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
      if(opts.viewOnly){
        scheduleRaw(opts);
        debugLog(`Debug: ${component} autoDraw view-only dispatched`, {
          reason: opts.reason || null
        });
        return;
      }
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
