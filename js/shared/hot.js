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
  const FILTER_VERSION = 1;
  const FILTER_KIND_SET = 'set';
  const FILTER_KIND_CONDITION = 'condition';
  const FILTER_MENU_MAX_VISIBLE_VALUES = 400;
  const FILTER_OPERATORS = new Set([
    'isBlank',
    'isNotBlank',
    'equals',
    'notEqual',
    'contains',
    'notContains',
    'startsWith',
    'endsWith',
    'greaterThan',
    'greaterThanOrEqual',
    'lessThan',
    'lessThanOrEqual',
    'between',
    'topN',
    'aboveAverage',
    'belowAverage'
  ]);
  const EMPTY_FILTER_STATE = Object.freeze({
    version: FILTER_VERSION,
    columns: Object.freeze({})
  });
  hotNS.__instanceSeq = Number.isInteger(hotNS.__instanceSeq) ? hotNS.__instanceSeq : 0;
  hotNS.__activeClipboardSelectionOwner = hotNS.__activeClipboardSelectionOwner || null;

  const clearActiveClipboardSelectionOwner = (reason)=>{
    const owner = hotNS.__activeClipboardSelectionOwner;
    if(owner && typeof owner.__hotSetClipboardOutlineState === 'function'){
      owner.__hotSetClipboardOutlineState(null, reason || 'Shared.hot.clearActiveClipboardSelectionOwner', {
        skipGlobal: true
      });
    }
    if(hotNS.__activeClipboardSelectionOwner === owner){
      hotNS.__activeClipboardSelectionOwner = null;
    }
    return !!owner;
  };

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

  const toExcelColumnLabel = (colIndex)=>{
    let n = Number(colIndex);
    if(!Number.isInteger(n) || n < 0){
      return 'A';
    }
    let out = '';
    while(n >= 0){
      out = String.fromCharCode((n % 26) + 65) + out;
      n = Math.floor(n / 26) - 1;
    }
    return out;
  };

  const buildExcelColHeaders = (count)=>{
    const safeCount = Math.max(0, Number(count) || 0);
    return Array.from({ length: safeCount }, (_, idx)=>toExcelColumnLabel(idx));
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

  function normalizeFilterColId(value){
    if(typeof value !== 'string'){
      return null;
    }
    const trimmed = value.trim();
    return /^c\d+$/.test(trimmed) ? trimmed : null;
  }

  function normalizeFilterOperator(value){
    if(typeof value !== 'string'){
      return null;
    }
    const trimmed = value.trim();
    return FILTER_OPERATORS.has(trimmed) ? trimmed : null;
  }

  function normalizeFilterSelectionValues(values){
    const source = Array.isArray(values) ? values : [];
    const seen = new Set();
    const normalized = [];
    for(let i = 0; i < source.length; i += 1){
      const entry = source[i];
      if(entry == null){
        continue;
      }
      const text = String(entry);
      if(seen.has(text)){
        continue;
      }
      seen.add(text);
      normalized.push(text);
    }
    normalized.sort();
    return normalized;
  }

  function cloneFilterModel(model){
    const source = model && typeof model === 'object' ? model : null;
    if(!source){
      return null;
    }
    const kind = source.kind === FILTER_KIND_CONDITION
      ? FILTER_KIND_CONDITION
      : FILTER_KIND_SET;
    if(kind === FILTER_KIND_SET){
      const selected = normalizeFilterSelectionValues(source.selected || source.values || source.keys);
      return {
        kind: FILTER_KIND_SET,
        selected
      };
    }
    const operator = normalizeFilterOperator(source.operator);
    if(!operator){
      return null;
    }
    const cloned = {
      kind: FILTER_KIND_CONDITION,
      operator
    };
    if(Object.prototype.hasOwnProperty.call(source, 'value')){
      cloned.value = source.value == null ? '' : String(source.value);
    }
    if(Object.prototype.hasOwnProperty.call(source, 'valueTo')){
      cloned.valueTo = source.valueTo == null ? '' : String(source.valueTo);
    }
    if(typeof source.columnType === 'string' && source.columnType.trim()){
      cloned.columnType = source.columnType.trim();
    }
    return cloned;
  }

  function cloneFilterState(state){
    if(!state || typeof state !== 'object'){
      return EMPTY_FILTER_STATE;
    }
    const rawColumns = state.columns && typeof state.columns === 'object'
      ? state.columns
      : state;
    const columnIds = Object.keys(rawColumns)
      .map(normalizeFilterColId)
      .filter(Boolean)
      .sort((a, b)=>Number(a.slice(1)) - Number(b.slice(1)));
    if(!columnIds.length){
      return EMPTY_FILTER_STATE;
    }
    const columns = {};
    for(let i = 0; i < columnIds.length; i += 1){
      const colId = columnIds[i];
      const cloned = cloneFilterModel(rawColumns[colId]);
      if(cloned){
        columns[colId] = cloned;
      }
    }
    if(!Object.keys(columns).length){
      return EMPTY_FILTER_STATE;
    }
    return {
      version: FILTER_VERSION,
      columns
    };
  }

  function areFilterStatesEqual(left, right){
    return JSON.stringify(cloneFilterState(left)) === JSON.stringify(cloneFilterState(right));
  }

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
    wrapper.style.overflow = 'hidden';
    wrapper.style.overflowX = 'hidden';
    wrapper.style.overflowY = 'hidden';
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
    let headerRowIndex = treatFirstRowAsHeader
      ? (Number.isInteger(overrides?.headerRowIndex) ? Math.max(0, overrides.headerRowIndex) : 0)
      : null;
    let headerRowCount = treatFirstRowAsHeader
      ? (Number.isInteger(overrides?.headerRowCount) ? Math.max(1, overrides.headerRowCount) : 1)
      : 0;
    const isHeaderRow = (physicalRow)=>(
      treatFirstRowAsHeader
      && Number.isInteger(physicalRow)
      && physicalRow >= headerRowIndex
      && physicalRow < headerRowIndex + headerRowCount
    );
    const firstRowClassName = overrides?.firstRowClassName || 'hot-header-row';
    const preserveExclusionsOnLoad = overrides?.preserveExclusionsOnLoad === true;
    const preserveFiltersOnLoad = overrides?.preserveFiltersOnLoad === true;
    const shrinkOnLoadData = overrides?.shrinkOnLoadData !== false;
    const baseData = Array.isArray(overrides?.data) ? overrides.data : null;
    const hotOptions = overrides?.hotOptions || {};
    const singleClickEdit = typeof hotOptions.singleClickEdit === 'boolean'
      ? hotOptions.singleClickEdit
      : false;
    const explicitDisableFormulaReferenceSelection = overrides?.enableFormulaReferenceSelection === false
      || hotOptions?.enableFormulaReferenceSelection === false;
    const explicitEnableFormulaReferenceSelection = overrides?.enableFormulaReferenceSelection === true
      || hotOptions?.enableFormulaReferenceSelection === true;
    const enableFormulaReferenceSelection = explicitDisableFormulaReferenceSelection
      ? false
      : (explicitEnableFormulaReferenceSelection || true);
    const explicitDisableFormulaReferenceOverlay = overrides?.enableFormulaReferenceOverlay === false
      || hotOptions?.enableFormulaReferenceOverlay === false;
    const explicitEnableFormulaReferenceOverlay = overrides?.enableFormulaReferenceOverlay === true
      || hotOptions?.enableFormulaReferenceOverlay === true;
    const enableFormulaReferenceOverlay = explicitDisableFormulaReferenceOverlay
      ? false
      : (explicitEnableFormulaReferenceOverlay || enableFormulaReferenceSelection);
    const explicitDisableFormulaEvaluation = overrides?.enableFormulaEvaluation === false
      || hotOptions?.enableFormulaEvaluation === false;
    const explicitEnableFormulaEvaluation = overrides?.enableFormulaEvaluation === true
      || hotOptions?.enableFormulaEvaluation === true;
    const enableFormulaEvaluation = explicitDisableFormulaEvaluation
      ? false
      : (explicitEnableFormulaEvaluation || true);
    const resolveFormulaReferenceInput = typeof overrides?.resolveFormulaReferenceInput === 'function'
      ? overrides.resolveFormulaReferenceInput
      : (typeof hotOptions?.resolveFormulaReferenceInput === 'function' ? hotOptions.resolveFormulaReferenceInput : null);
    const getFormulaA1RowOffset = ()=>{
      const overrideOffset = Number(overrides?.formulaA1RowOffset);
      if(Number.isInteger(overrideOffset) && overrideOffset >= 0){
        return overrideOffset;
      }
      const optionOffset = Number(hotOptions?.formulaA1RowOffset);
      if(Number.isInteger(optionOffset) && optionOffset >= 0){
        return optionOffset;
      }
      return Math.max(0, Number(headerRowCount) || 0);
    };
    const DEFAULT_FORMULA_REFERENCE_OVERLAY_COLORS = Object.freeze([
      '#1a73e8',
      '#d93025',
      '#188038',
      '#9334e6',
      '#e37400',
      '#00897b'
    ]);
    const resolveFormulaReferenceOverlayColors = ()=>{
      const optionColors = Array.isArray(overrides?.formulaReferenceOverlayColors)
        ? overrides.formulaReferenceOverlayColors
        : (Array.isArray(hotOptions?.formulaReferenceOverlayColors) ? hotOptions.formulaReferenceOverlayColors : null);
      if(!optionColors || !optionColors.length){
        return DEFAULT_FORMULA_REFERENCE_OVERLAY_COLORS.slice();
      }
      const sanitized = optionColors
        .map(value => typeof value === 'string' ? value.trim() : '')
        .filter(Boolean);
      return sanitized.length ? sanitized : DEFAULT_FORMULA_REFERENCE_OVERLAY_COLORS.slice();
    };
    const formulaReferenceOverlayColors = resolveFormulaReferenceOverlayColors();
    const formulaReferenceOverlayMaxCells = Number.isFinite(Number(overrides?.formulaReferenceOverlayMaxCells))
      ? Math.max(1, Math.floor(Number(overrides.formulaReferenceOverlayMaxCells)))
      : (Number.isFinite(Number(hotOptions?.formulaReferenceOverlayMaxCells))
        ? Math.max(1, Math.floor(Number(hotOptions.formulaReferenceOverlayMaxCells)))
        : 2048);
    const colDefEnhancer = typeof overrides?.colDefEnhancer === 'function' ? overrides.colDefEnhancer : null;
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
    const normalizeValueForComparison = (value)=>{
      if(value === null || value === undefined){
        return { type: 'empty', value: '' };
      }
      if(typeof value === 'number'){
        return Number.isFinite(value)
          ? { type: 'number', value }
          : { type: 'other', value: String(value) };
      }
      if(typeof value === 'string'){
        const trimmed = value.trim();
        if(!trimmed){
          return { type: 'empty', value: '' };
        }
        if(/^[-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[-+]?\d+)?$/i.test(trimmed)){
          const num = Number(trimmed);
          if(Number.isFinite(num)){
            return { type: 'number', value: num };
          }
        }
        return { type: 'string', value: trimmed };
      }
      if(typeof value === 'boolean'){
        return { type: 'string', value: value ? 'true' : 'false' };
      }
      return { type: 'other', value: String(value) };
    };
    const valuesMatchForChange = (prevValue, nextValue)=>{
      const prev = normalizeValueForComparison(prevValue);
      const next = normalizeValueForComparison(nextValue);
      if(prev.type !== next.type){
        return false;
      }
      if(prev.type === 'number'){
        return Object.is(prev.value, next.value);
      }
      return prev.value === next.value;
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
          if(isMeaningfulValue(row[c])){
            rowHasData = true;
            if(c > lastCol){
              lastCol = c;
            }
          }
        }
        if(lastRow < 0 && rowHasData){
          lastRow = r;
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
    const formulaEvaluationState = {
      enabled: !!enableFormulaEvaluation,
      model: null,
      dirty: !!enableFormulaEvaluation,
      headerRows: Math.max(0, Number(headerRowCount) || 0),
      a1RowOffset: Math.max(0, Number(getFormulaA1RowOffset()) || 0),
      unavailableLogged: false,
      createdLogged: false
    };
    const isFormulaEvaluationDebugEnabled = ()=>(
      typeof Shared.isDebugEnabled === 'function'
      && Shared.isDebugEnabled()
    );
    const logFormulaEvaluationDebug = (message, payload)=>{
      if(!isFormulaEvaluationDebugEnabled()){
        return;
      }
      try{
        console.debug(message, payload || {});
      }catch(err){
        // ignore debug logging failures
      }
    };
    const markFormulaModelDirty = (reason)=>{
      if(!formulaEvaluationState.enabled){
        return;
      }
      formulaEvaluationState.dirty = true;
      if(isFormulaEvaluationDebugEnabled()){
        logFormulaEvaluationDebug('Debug: Shared.hot formula model marked dirty', {
          debugLabel,
          reason: reason || 'unspecified'
        });
      }
    };
    const ensureFormulaModel = (reason)=>{
      if(!formulaEvaluationState.enabled){
        return null;
      }
      const formulaNS = Shared.formulaEngine || {};
      if(typeof formulaNS.createModel !== 'function'){
        if(!formulaEvaluationState.unavailableLogged){
          formulaEvaluationState.unavailableLogged = true;
          console.warn('Shared.hot formula evaluation requested but Shared.formulaEngine.createModel is unavailable', { debugLabel });
        }
        return null;
      }
      const nextHeaderRows = Math.max(0, Number(headerRowCount) || 0);
      const nextA1RowOffset = Math.max(0, Number(getFormulaA1RowOffset()) || 0);
      const shouldRecreate = !formulaEvaluationState.model
        || formulaEvaluationState.headerRows !== nextHeaderRows
        || formulaEvaluationState.a1RowOffset !== nextA1RowOffset;
      if(!shouldRecreate){
        return formulaEvaluationState.model;
      }
      formulaEvaluationState.headerRows = nextHeaderRows;
      formulaEvaluationState.a1RowOffset = nextA1RowOffset;
      formulaEvaluationState.model = formulaNS.createModel({
        headerRows: nextHeaderRows,
        a1RowOffset: nextA1RowOffset,
        debugLog: (msg, details)=>{
          if(!isFormulaEvaluationDebugEnabled()){
            return;
          }
          console.debug('Debug: Shared.hot formula model', {
            debugLabel,
            reason: reason || 'ensure',
            message: msg,
            details: details || null
          });
        }
      });
      formulaEvaluationState.dirty = true;
      if(!formulaEvaluationState.createdLogged || isFormulaEvaluationDebugEnabled()){
        formulaEvaluationState.createdLogged = true;
        logFormulaEvaluationDebug('Debug: Shared.hot formula model created', {
          debugLabel,
          reason: reason || 'ensure',
          headerRows: nextHeaderRows,
          a1RowOffset: nextA1RowOffset
        });
      }
      return formulaEvaluationState.model;
    };
    const rebuildFormulaModelFromMatrix = (reason)=>{
      const model = ensureFormulaModel(reason || 'rebuild');
      if(!model){
        return false;
      }
      try{
        model.rebuildFromMatrix(dataHandle.current || []);
        formulaEvaluationState.dirty = false;
        logFormulaEvaluationDebug('Debug: Shared.hot formula model rebuilt', {
          debugLabel,
          reason: reason || 'rebuild',
          rows: Array.isArray(dataHandle.current) ? dataHandle.current.length : 0,
          cols: colCount
        });
        return true;
      }catch(err){
        formulaEvaluationState.dirty = true;
        console.error('Shared.hot formula model rebuild failed', {
          debugLabel,
          reason: reason || 'rebuild',
          message: err?.message || String(err)
        });
        return false;
      }
    };
    const ensureFormulaModelCurrent = (reason)=>{
      const model = ensureFormulaModel(reason || 'ensure-current');
      if(!model){
        return null;
      }
      if(formulaEvaluationState.dirty){
        rebuildFormulaModelFromMatrix(reason || 'ensure-current');
      }
      return formulaEvaluationState.model;
    };
    const setFormulaModelRawCell = (physicalRow, physicalCol, value, reason)=>{
      if(!formulaEvaluationState.enabled){
        return false;
      }
      const row = Number(physicalRow);
      const col = Number(physicalCol);
      if(!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0){
        return false;
      }
      const model = ensureFormulaModel(reason || 'set-cell');
      if(!model){
        return false;
      }
      if(formulaEvaluationState.dirty){
        return false;
      }
      try{
        model.setCellRaw(row, col, value);
        return true;
      }catch(err){
        console.error('Shared.hot formula model setCellRaw failed', {
          debugLabel,
          reason: reason || 'set-cell',
          row,
          col,
          message: err?.message || String(err)
        });
        formulaEvaluationState.dirty = true;
        return false;
      }
    };
    const resolveFormulaRawValue = (physicalRow, physicalCol, fallbackValue)=>{
      if(!formulaEvaluationState.enabled){
        return fallbackValue;
      }
      const row = Number(physicalRow);
      const col = Number(physicalCol);
      if(!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0){
        return fallbackValue;
      }
      const model = ensureFormulaModelCurrent('resolve-raw');
      if(!model){
        return fallbackValue;
      }
      return model.getRawAt(row, col);
    };
    const resolveFormulaDisplayValue = (physicalRow, physicalCol, fallbackValue)=>{
      if(!formulaEvaluationState.enabled){
        return fallbackValue;
      }
      const row = Number(physicalRow);
      const col = Number(physicalCol);
      if(!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0){
        return fallbackValue;
      }
      if(isHeaderRow(row)){
        return fallbackValue;
      }
      const model = ensureFormulaModelCurrent('resolve-display');
      if(!model){
        return fallbackValue;
      }
      return model.getResolvedAt(row, col);
    };
    recordCall('construct', { containerId: container?.id || null, rows: data.length, cols: colCount });
    const resolveColHeaders = (count)=>{
      if(Array.isArray(colHeadersSetting)){
        return colHeadersSetting.slice(0, count).concat(Array.from({ length: Math.max(0, count - colHeadersSetting.length) }, (_, idx)=>toExcelColumnLabel(colHeadersSetting.length + idx)));
      }
      if(typeof colHeadersSetting === 'function'){
        return Array.from({ length: count }, (_, idx)=>{
          try{
            const label = colHeadersSetting(idx);
            return label == null ? '' : String(label);
          }catch(err){
            return toExcelColumnLabel(idx);
          }
        });
      }
      if(colHeadersSetting === false){
        return null;
      }
      return buildExcelColHeaders(count);
    };
    let colHeaders = resolveColHeaders(colCount);
    let colHeadersEnabled = colHeadersSetting !== false;
    let rowHeadersEnabled = rowHeadersSetting !== false;

    const exclusionController = createExclusionController(()=>instance, debugLabel, (scope)=>{
      triggerSchedule(scope || 'exclusion-change', { scope });
    });
    const FILTER_STATE_EVENT = 'hot:filter-state-changed';
    let activeColumnFilters = new Map();
    let compiledColumnFilters = new Map();
    let fallbackDisplayedPhysicalRows = null;
    let pendingFilterChangeMeta = null;

    const isBlankFilterValue = (value)=>{
      if(value == null){
        return true;
      }
      return typeof value === 'string' && value.trim() === '';
    };

    const serializeFilterCellValue = (value)=>{
      if(isBlankFilterValue(value)){
        return '__blank__';
      }
      if(typeof value === 'number' && Number.isFinite(value)){
        return `n:${String(value)}`;
      }
      if(typeof value === 'boolean'){
        return `b:${value ? '1' : '0'}`;
      }
      return `s:${String(value)}`;
    };

    const formatFilterCellValue = (value)=>{
      if(isBlankFilterValue(value)){
        return '(Blanks)';
      }
      return String(value);
    };

    const coerceFilterNumber = (value)=>{
      if(typeof value === 'number'){
        return Number.isFinite(value) ? value : null;
      }
      if(typeof value === 'string'){
        const trimmed = value.trim();
        if(!trimmed){
          return null;
        }
        const normalized = trimmed.replace(',', '.');
        const num = Number(normalized);
        return Number.isFinite(num) ? num : null;
      }
      return null;
    };

    const getFilterCellDisplayValue = (physicalRow, physicalCol)=>{
      const rawValue = Array.isArray(dataHandle.current?.[physicalRow])
        ? dataHandle.current[physicalRow][physicalCol]
        : '';
      return resolveFormulaDisplayValue(physicalRow, physicalCol, rawValue);
    };

    const buildColumnFilterContext = (physicalCol)=>{
      const rowTotal = Array.isArray(dataHandle.current) ? dataHandle.current.length : 0;
      const uniqueMap = new Map();
      const numericValues = [];
      let numericCount = 0;
      let textCount = 0;
      for(let physicalRow = 0; physicalRow < rowTotal; physicalRow += 1){
        if(isHeaderRow(physicalRow)){
          continue;
        }
        const value = getFilterCellDisplayValue(physicalRow, physicalCol);
        const key = serializeFilterCellValue(value);
        const existing = uniqueMap.get(key);
        if(existing){
          existing.count += 1;
        }else{
          uniqueMap.set(key, {
            key,
            value,
            label: formatFilterCellValue(value),
            count: 1,
            blank: isBlankFilterValue(value)
          });
        }
        if(isBlankFilterValue(value)){
          continue;
        }
        const numericValue = coerceFilterNumber(value);
        if(numericValue !== null){
          numericValues.push(numericValue);
          numericCount += 1;
        }else{
          textCount += 1;
        }
      }
      const uniqueOptions = Array.from(uniqueMap.values()).sort((left, right)=>{
        if(left.blank && !right.blank){
          return 1;
        }
        if(!left.blank && right.blank){
          return -1;
        }
        const leftNumber = coerceFilterNumber(left.value);
        const rightNumber = coerceFilterNumber(right.value);
        if(leftNumber !== null && rightNumber !== null){
          return leftNumber - rightNumber;
        }
        return String(left.label).localeCompare(String(right.label), undefined, { sensitivity: 'base', numeric: true });
      });
      const columnType = numericCount > 0 && textCount === 0
        ? 'numeric'
        : (numericCount === 0 ? 'text' : 'mixed');
      return {
        physicalCol,
        uniqueOptions,
        numericValues,
        numericCount,
        textCount,
        columnType
      };
    };

    const exportActiveFilterState = ()=>{
      if(!activeColumnFilters.size){
        return EMPTY_FILTER_STATE;
      }
      const columns = {};
      activeColumnFilters.forEach((model, colId)=>{
        const cloned = cloneFilterModel(model);
        if(cloned){
          columns[colId] = cloned;
        }
      });
      if(!Object.keys(columns).length){
        return EMPTY_FILTER_STATE;
      }
      return {
        version: FILTER_VERSION,
        columns
      };
    };

    const dispatchFilterStateChanged = (reason)=>{
      const docLocal = container?.ownerDocument || document;
      const winLocal = docLocal?.defaultView || global;
      if(typeof winLocal?.CustomEvent !== 'function' || typeof container?.dispatchEvent !== 'function'){
        return;
      }
      try{
        container.dispatchEvent(new winLocal.CustomEvent(FILTER_STATE_EVENT, {
          detail: {
            reason: reason || 'filter',
            state: exportActiveFilterState()
          }
        }));
      }catch(err){
        // ignore event dispatch failures
      }
    };

    const buildCompiledColumnFilter = (colId, model)=>{
      const physicalCol = Number(colId.slice(1));
      if(!Number.isInteger(physicalCol) || physicalCol < 0 || physicalCol >= colCount){
        return null;
      }
      const clonedModel = cloneFilterModel(model);
      if(!clonedModel){
        return null;
      }
      const context = buildColumnFilterContext(physicalCol);
      if(clonedModel.kind === FILTER_KIND_SET){
        const selected = normalizeFilterSelectionValues(clonedModel.selected);
        const availableKeys = context.uniqueOptions.map(option => option.key);
        const allSelected = availableKeys.length > 0
          && availableKeys.every(key => selected.indexOf(key) !== -1);
        if(allSelected){
          return null;
        }
        const selectedSet = new Set(selected);
        return {
          colId,
          physicalCol,
          model: {
            kind: FILTER_KIND_SET,
            selected
          },
          context,
          evaluator(physicalRow){
            if(isHeaderRow(physicalRow)){
              return true;
            }
            const value = getFilterCellDisplayValue(physicalRow, physicalCol);
            return selectedSet.has(serializeFilterCellValue(value));
          }
        };
      }
      const operator = normalizeFilterOperator(clonedModel.operator);
      if(!operator){
        return null;
      }
      const textValue = String(clonedModel.value == null ? '' : clonedModel.value).trim();
      const textValueLower = textValue.toLowerCase();
      const textValueTo = String(clonedModel.valueTo == null ? '' : clonedModel.valueTo).trim();
      const textValueToLower = textValueTo.toLowerCase();
      const numericValue = coerceFilterNumber(clonedModel.value);
      const numericValueTo = coerceFilterNumber(clonedModel.valueTo);
      let threshold = null;
      let average = null;
      if(operator === 'topN'){
        const count = Math.max(1, Math.floor(coerceFilterNumber(clonedModel.value) || 10));
        const sortedDescending = context.numericValues.slice().sort((a, b)=>b - a);
        if(!sortedDescending.length){
          return null;
        }
        threshold = sortedDescending[Math.min(sortedDescending.length - 1, count - 1)];
      }
      if(operator === 'aboveAverage' || operator === 'belowAverage'){
        if(!context.numericValues.length){
          return null;
        }
        average = context.numericValues.reduce((sum, value)=>sum + value, 0) / context.numericValues.length;
      }
      if((operator === 'greaterThan'
        || operator === 'greaterThanOrEqual'
        || operator === 'lessThan'
        || operator === 'lessThanOrEqual'
        || operator === 'between')
        && numericValue === null){
        return null;
      }
      if(operator === 'between' && numericValueTo === null){
        return null;
      }
      if((operator === 'contains'
        || operator === 'notContains'
        || operator === 'startsWith'
        || operator === 'endsWith'
        || operator === 'equals'
        || operator === 'notEqual')
        && !textValue
        && numericValue === null
        && operator !== 'equals'
        && operator !== 'notEqual'){
        return null;
      }
      const evaluator = (physicalRow)=>{
        if(isHeaderRow(physicalRow)){
          return true;
        }
        const value = getFilterCellDisplayValue(physicalRow, physicalCol);
        const blank = isBlankFilterValue(value);
        if(operator === 'isBlank'){
          return blank;
        }
        if(operator === 'isNotBlank'){
          return !blank;
        }
        if(blank){
          return false;
        }
        const cellNumber = coerceFilterNumber(value);
        const cellText = String(value).trim();
        const cellTextLower = cellText.toLowerCase();
        switch(operator){
          case 'equals':
            if(numericValue !== null && cellNumber !== null){
              return cellNumber === numericValue;
            }
            return cellTextLower === (numericValue !== null ? String(numericValue).toLowerCase() : textValueLower);
          case 'notEqual':
            if(numericValue !== null && cellNumber !== null){
              return cellNumber !== numericValue;
            }
            return cellTextLower !== (numericValue !== null ? String(numericValue).toLowerCase() : textValueLower);
          case 'contains':
            return textValueLower ? cellTextLower.includes(textValueLower) : true;
          case 'notContains':
            return textValueLower ? !cellTextLower.includes(textValueLower) : true;
          case 'startsWith':
            return textValueLower ? cellTextLower.startsWith(textValueLower) : true;
          case 'endsWith':
            return textValueLower ? cellTextLower.endsWith(textValueLower) : true;
          case 'greaterThan':
            return cellNumber !== null && cellNumber > numericValue;
          case 'greaterThanOrEqual':
            return cellNumber !== null && cellNumber >= numericValue;
          case 'lessThan':
            return cellNumber !== null && cellNumber < numericValue;
          case 'lessThanOrEqual':
            return cellNumber !== null && cellNumber <= numericValue;
          case 'between': {
            if(cellNumber === null){
              return false;
            }
            const min = Math.min(numericValue, numericValueTo);
            const max = Math.max(numericValue, numericValueTo);
            return cellNumber >= min && cellNumber <= max;
          }
          case 'topN':
            return cellNumber !== null && threshold !== null && cellNumber >= threshold;
          case 'aboveAverage':
            return cellNumber !== null && average !== null && cellNumber > average;
          case 'belowAverage':
            return cellNumber !== null && average !== null && cellNumber < average;
          default:
            return true;
        }
      };
      return {
        colId,
        physicalCol,
        model: clonedModel,
        context,
        evaluator
      };
    };

    const rebuildCompiledColumnFilters = ()=>{
      const nextCompiled = new Map();
      activeColumnFilters.forEach((model, colId)=>{
        const compiled = buildCompiledColumnFilter(colId, model);
        if(compiled){
          nextCompiled.set(colId, compiled);
        }
      });
      compiledColumnFilters = nextCompiled;
      if(!compiledColumnFilters.size){
        fallbackDisplayedPhysicalRows = null;
        return;
      }
      const nextRows = [];
      const totalRows = Array.isArray(dataHandle.current) ? dataHandle.current.length : 0;
      for(let physicalRow = 0; physicalRow < totalRows; physicalRow += 1){
        let include = true;
        compiledColumnFilters.forEach(compiled=>{
          if(include && !compiled.evaluator(physicalRow)){
            include = false;
          }
        });
        if(include){
          nextRows.push(physicalRow);
        }
      }
      fallbackDisplayedPhysicalRows = nextRows;
    };

    const pruneActiveColumnFilters = ()=>{
      if(!activeColumnFilters.size){
        return false;
      }
      const nextFilters = new Map();
      let changed = false;
      activeColumnFilters.forEach((model, colId)=>{
        const physicalCol = Number(colId.slice(1));
        if(!Number.isInteger(physicalCol) || physicalCol < 0 || physicalCol >= colCount){
          changed = true;
          return;
        }
        const cloned = cloneFilterModel(model);
        if(!cloned){
          changed = true;
          return;
        }
        nextFilters.set(colId, cloned);
      });
      if(!changed && nextFilters.size === activeColumnFilters.size){
        return false;
      }
      activeColumnFilters = nextFilters;
      return true;
    };

    const syncSelectionToFilteredRows = ()=>{
      const visibleRows = Math.max(0, getVisualRowCount());
      if(visibleRows <= 0){
        lastRange = null;
        normalizedSelectionRange = null;
        clearSelectionRangeOverride();
        setClipboardOutlineState(null, 'filter-empty', { render: false });
        clearSelectedHeaderColumns();
        return;
      }
      const normalized = getEffectiveSelectionRange();
      if(!normalized){
        return;
      }
      const lastVisibleRow = visibleRows - 1;
      const clamped = {
        from: {
          row: Math.max(0, Math.min(lastVisibleRow, normalized.from.row)),
          col: normalized.from.col
        },
        to: {
          row: Math.max(0, Math.min(lastVisibleRow, normalized.to.row)),
          col: normalized.to.col
        }
      };
      setLastRange(clamped);
      if(selectionRangeOverride){
        setSelectionRangeOverride(clamped);
      }
    };

    const applyColumnFilterRefreshLocally = (reason, options = {})=>{
      syncSelectionToFilteredRows();
      renderAg(instance?.gridApi || null);
      if(options.schedule !== false){
        triggerSchedule('filter-change', { source: reason || 'filter-change' });
      }
    };

    const notifyColumnFiltersChanged = (reason, options = {})=>{
      pruneActiveColumnFilters();
      rebuildCompiledColumnFilters();
      dispatchFilterStateChanged(reason);
      const apiRef = instance?.gridApi || null;
      const columnStateApi = instance?.columnApi || apiRef?.columnApi || null;
      if(typeof columnStateApi?.refreshHeader === 'function'){
        try{
          columnStateApi.refreshHeader();
        }catch(err){
          // ignore header refresh failures
        }
      }else if(typeof apiRef?.refreshHeader === 'function'){
        try{
          apiRef.refreshHeader();
        }catch(err){
          // ignore header refresh failures
        }
      }
      pendingFilterChangeMeta = {
        reason: reason || 'filter-change',
        schedule: options.schedule !== false
      };
      if(apiRef && typeof apiRef.onFilterChanged === 'function'){
        try{
          apiRef.onFilterChanged();
          return;
        }catch(err){
          // fall through to local refresh path
        }
      }
      applyColumnFilterRefreshLocally(reason, options);
      pendingFilterChangeMeta = null;
    };
    const refreshColumnFiltersForDataMutation = (reason)=>{
      if(!activeColumnFilters.size && !compiledColumnFilters.size){
        return;
      }
      notifyColumnFiltersChanged(reason, { schedule: false });
    };

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

    const hotInstanceId = `hot-${++hotNS.__instanceSeq}`;
    let lastRange = null;
    let normalizedSelectionRange = null;
    let selectedHeaderColumns = new Set();
    let clipboardOutlineState = null;
    let normalizedClipboardOutlineRanges = [];
    let selectionOutline = null;
    let clipboardOutlines = [];
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
    let selectionRangeOverride = null;
    let pasteSelectionLockRange = null;
    let pendingSelectionReassertRange = null;
    let pendingSelectionReassertReason = null;
    let pendingSelectionReassertAttempts = 0;
    let selectionReassertScheduled = false;

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

    const setSelectionRangeOverride = (range)=>{
      const normalized = normalizeRange(range);
      selectionRangeOverride = normalized
        ? {
            from: { row: normalized.from.row, col: normalized.from.col },
            to: { row: normalized.to.row, col: normalized.to.col }
          }
        : null;
      scheduleFillHandleUpdate('selection-override');
    };

    const clearSelectionRangeOverride = ()=>{
      if(!selectionRangeOverride){
        return;
      }
      selectionRangeOverride = null;
      scheduleFillHandleUpdate('selection-override-cleared');
    };

    const getEffectiveSelectionRange = ()=>{
      return selectionRangeOverride || normalizedSelectionRange || normalizeRange(lastRange);
    };

    const syncGridApiSelectionToRange = (api, range)=>{
      const normalized = normalizeRange(range);
      if(!api || !normalized){
        return false;
      }
      const anchorColId = `c${normalized.from.col}`;
      let synced = false;
      try{
        if(typeof api.clearRangeSelection === 'function'){
          api.clearRangeSelection();
          synced = true;
        }
      }catch(err){
        // best-effort only
      }
      try{
        if(typeof api.addCellRange === 'function'){
          api.addCellRange({
            rowStartIndex: normalized.from.row,
            rowEndIndex: normalized.to.row,
            columnStart: `c${normalized.from.col}`,
            columnEnd: `c${normalized.to.col}`
          });
          synced = true;
        }
      }catch(err){
        // best-effort only
      }
      try{
        if(typeof api.setFocusedCell === 'function'){
          api.setFocusedCell(normalized.from.row, anchorColId);
          synced = true;
        }
      }catch(err){
        // best-effort only
      }
      try{
        if(typeof api.redrawRows === 'function'){
          api.redrawRows();
        }
      }catch(err){
        // best-effort only
      }
      return synced;
    };

    const applyProgrammaticSelectionRange = (range, options = {})=>{
      const normalized = normalizeRange(range);
      if(!normalized){
        return false;
      }
      const api = options.api || instance?.gridApi || null;
      pendingSelectionReassertRange = normalized;
      if(options.preservePasteSelectionLock !== true){
        clearPasteDrivenSelectionState();
      }
      clearSelectedHeaderColumns();
      setLastRange(normalized);
      if(options.syncGridApi !== false){
        syncGridApiSelectionToRange(api, normalized);
      }
      if(options.render !== false){
        renderAg(api);
      }
      if(options.fireHook){
        fireHook('afterSelectionEnd', normalized.from.row, normalized.from.col, normalized.to.row, normalized.to.col);
      }
      return true;
    };

    const scheduleSelectionReassert = (range, reason, options = {})=>{
      const normalized = normalizeRange(range);
      if(!normalized || !container){
        return;
      }
      pendingSelectionReassertRange = normalized;
      pendingSelectionReassertReason = reason || null;
      pendingSelectionReassertAttempts = Math.max(
        pendingSelectionReassertAttempts,
        Number.isFinite(options.attempts) ? Math.max(1, Number(options.attempts)) : 6
      );
      if(selectionReassertScheduled){
        return;
      }
      selectionReassertScheduled = true;
      const doc = container.ownerDocument || document;
      const win = doc.defaultView || global;
      const rafLocal = typeof win?.requestAnimationFrame === 'function'
        ? win.requestAnimationFrame.bind(win)
        : (fn)=>win.setTimeout(fn, 16);
      const run = ()=>{
        selectionReassertScheduled = false;
        const nextRange = pendingSelectionReassertRange;
        const nextReason = pendingSelectionReassertReason;
        const remaining = pendingSelectionReassertAttempts;
        if(!nextRange || remaining <= 0){
          pendingSelectionReassertRange = null;
          pendingSelectionReassertReason = null;
          pendingSelectionReassertAttempts = 0;
          return;
        }
        pendingSelectionReassertAttempts = Math.max(0, remaining - 1);
        applyProgrammaticSelectionRange(nextRange, {
          api: instance?.gridApi || null,
          render: true,
          syncGridApi: true,
          fireHook: false,
          preservePasteSelectionLock: true
        });
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot selection reasserted', {
            debugLabel,
            reason: nextReason,
            range: nextRange,
            remainingAttempts: pendingSelectionReassertAttempts
          });
        }
        if(pendingSelectionReassertAttempts > 0){
          selectionReassertScheduled = true;
          rafLocal(run);
        }else{
          pendingSelectionReassertRange = null;
          pendingSelectionReassertReason = null;
        }
      };
      rafLocal(run);
    };

    const clearSelectedHeaderColumns = ()=>{
      if(selectedHeaderColumns.size){
        selectedHeaderColumns = new Set();
      }
    };

    const clearGridCellFocus = (api)=>{
      const gridApi = api || instance?.gridApi || null;
      try{
        if(gridApi && typeof gridApi.clearFocusedCell === 'function'){
          gridApi.clearFocusedCell();
        }
      }catch(err){
        console.debug('Debug: Shared.hot clearFocusedCell unavailable', { debugLabel, err });
      }
      const doc = container?.ownerDocument || document;
      const activeEl = doc?.activeElement && doc.activeElement.nodeType === 1 ? doc.activeElement : null;
      if(activeEl && container?.contains?.(activeEl) && typeof activeEl.closest === 'function' && activeEl.closest('.ag-cell')){
        try{
          activeEl.blur?.();
        }catch(err){
          // ignore blur failures
        }
      }
    };

    const focusGridContainer = ()=>{
      if(!container || typeof container.focus !== 'function'){
        return;
      }
      try{
        if(typeof container.getAttribute === 'function' && !container.getAttribute('tabindex')){
          container.setAttribute('tabindex', '-1');
        }
        container.focus({ preventScroll: true });
      }catch(err){
        try{
          container.focus();
        }catch(focusErr){
          // ignore focus failures
        }
      }
    };

    const normalizeRangeList = (ranges)=>{
      const source = Array.isArray(ranges)
        ? ranges
        : (ranges ? [ranges] : []);
      const normalized = [];
      for(let i = 0; i < source.length; i += 1){
        const entry = normalizeRange(source[i]);
        if(entry){
          normalized.push(entry);
        }
      }
      return normalized;
    };

    const hasClipboardOutline = ()=>normalizedClipboardOutlineRanges.length > 0;

    const areNormalizedRangesEqual = (leftRange, rightRange)=>{
      const left = normalizeRange(leftRange);
      const right = normalizeRange(rightRange);
      if(!left || !right){
        return false;
      }
      return left.from.row === right.from.row
        && left.from.col === right.from.col
        && left.to.row === right.to.row
        && left.to.col === right.to.col;
    };

    const cloneNormalizedRange = (range)=>{
      const normalized = normalizeRange(range);
      if(!normalized){
        return null;
      }
      return {
        from: { row: normalized.from.row, col: normalized.from.col },
        to: { row: normalized.to.row, col: normalized.to.col }
      };
    };

    const rangeContainsRange = (outerRange, innerRange)=>{
      const outer = normalizeRange(outerRange);
      const inner = normalizeRange(innerRange);
      if(!outer || !inner){
        return false;
      }
      return inner.from.row >= outer.from.row
        && inner.from.col >= outer.from.col
        && inner.to.row <= outer.to.row
        && inner.to.col <= outer.to.col;
    };

    const armPasteSelectionLock = (range)=>{
      pasteSelectionLockRange = cloneNormalizedRange(range);
    };

    const clearPasteSelectionLock = ()=>{
      pasteSelectionLockRange = null;
    };

    const clearPasteDrivenSelectionState = ()=>{
      clearPasteSelectionLock();
      clearSelectionRangeOverride();
    };

    const shouldIgnoreApiSelectionRange = (range)=>{
      const nextRange = normalizeRange(range);
      if(!pasteSelectionLockRange || !nextRange){
        return false;
      }
      if(areNormalizedRangesEqual(pasteSelectionLockRange, nextRange)){
        return false;
      }
      return rangeContainsRange(pasteSelectionLockRange, nextRange);
    };

    const shouldSuppressLiveSelectionChrome = ()=>{
      const activeSelection = getEffectiveSelectionRange();
      if(!activeSelection || !hasClipboardOutline()){
        return false;
      }
      for(let i = 0; i < normalizedClipboardOutlineRanges.length; i += 1){
        if(areNormalizedRangesEqual(activeSelection, normalizedClipboardOutlineRanges[i])){
          return true;
        }
      }
      return false;
    };

    const setClipboardOutlineState = (payload, reason, options = {})=>{
      const normalizedRanges = payload ? normalizeRangeList(payload.ranges) : [];
      const nextState = normalizedRanges.length
        ? {
            mode: payload?.mode === 'cut' ? 'cut' : 'copy',
            ranges: normalizedRanges,
            clipboardText: typeof payload?.clipboardText === 'string' ? payload.clipboardText : ''
          }
        : null;
      if(!options.skipGlobal){
        if(nextState){
          const activeOwner = hotNS.__activeClipboardSelectionOwner;
          if(activeOwner && activeOwner !== instance && typeof activeOwner.__hotSetClipboardOutlineState === 'function'){
            activeOwner.__hotSetClipboardOutlineState(null, reason || 'clipboard-replaced', { skipGlobal: true });
          }
          if(instance){
            hotNS.__activeClipboardSelectionOwner = instance;
          }
        }else if(hotNS.__activeClipboardSelectionOwner === instance){
          hotNS.__activeClipboardSelectionOwner = null;
        }
      }
      clipboardOutlineState = nextState;
      normalizedClipboardOutlineRanges = nextState ? nextState.ranges.slice() : [];
      if(options.render !== false){
        renderAg(instance?.gridApi || null);
      }
      return nextState;
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

    const formulaReferenceOverlayState = {
      formulaText: '',
      ranges: [],
      a1RowOffset: getFormulaA1RowOffset(),
      overlayRoot: null,
      hostRoot: null,
      hostPositionNode: null,
      hostPositionInlineBeforePatch: null,
      docRef: null,
      winRef: null,
      listenersAttached: false,
      scrollHandler: null,
      wheelHandler: null,
      touchMoveHandler: null,
      resizeHandler: null,
      focusHandler: null,
      visibilityHandler: null,
      scrollTargets: [],
      gridApiRef: null,
      gridBodyScrollHandler: null,
      gridViewportChangedHandler: null,
      mutationObserver: null,
      frameId: null,
      frameKind: null,
      retryTimerId: null,
      retryCount: 0,
      suppressMutationUntil: 0
    };

    const isFormulaReferenceOverlayDebugEnabled = ()=>{
      try{
        return typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
      }catch(err){
        return false;
      }
    };

    const cancelFormulaReferenceOverlayFrame = ()=>{
      if(formulaReferenceOverlayState.frameId == null){
        return;
      }
      if(formulaReferenceOverlayState.frameKind === 'raf' && typeof global.cancelAnimationFrame === 'function'){
        global.cancelAnimationFrame(formulaReferenceOverlayState.frameId);
      }else{
        global.clearTimeout?.(formulaReferenceOverlayState.frameId);
      }
      formulaReferenceOverlayState.frameId = null;
      formulaReferenceOverlayState.frameKind = null;
    };

    const cancelFormulaReferenceOverlayRetry = ()=>{
      if(formulaReferenceOverlayState.retryTimerId == null){
        return;
      }
      global.clearTimeout?.(formulaReferenceOverlayState.retryTimerId);
      formulaReferenceOverlayState.retryTimerId = null;
    };

    const restoreFormulaReferenceOverlayHostPosition = ()=>{
      const hostNode = formulaReferenceOverlayState.hostPositionNode;
      if(!hostNode){
        return;
      }
      const previousInline = formulaReferenceOverlayState.hostPositionInlineBeforePatch;
      formulaReferenceOverlayState.hostPositionNode = null;
      formulaReferenceOverlayState.hostPositionInlineBeforePatch = null;
      if(!hostNode.style){
        return;
      }
      // Restore only when still untouched since our patch.
      if(hostNode.style.position !== 'relative'){
        return;
      }
      hostNode.style.position = previousInline || '';
    };

    const clearFormulaReferenceOverlayLayer = ()=>{
      const layer = formulaReferenceOverlayState.overlayRoot;
      if(!layer){
        return;
      }
      if(typeof layer.replaceChildren === 'function'){
        layer.replaceChildren();
      }else{
        layer.innerHTML = '';
      }
    };

    const removeFormulaReferenceOverlayLayer = ()=>{
      const layer = formulaReferenceOverlayState.overlayRoot;
      if(layer && layer.parentNode){
        layer.parentNode.removeChild(layer);
      }
      restoreFormulaReferenceOverlayHostPosition();
      formulaReferenceOverlayState.overlayRoot = null;
      formulaReferenceOverlayState.hostRoot = null;
    };

    const detachFormulaReferenceOverlayListeners = ()=>{
      if(!formulaReferenceOverlayState.listenersAttached){
        return;
      }
      const hostRoot = formulaReferenceOverlayState.hostRoot;
      const docRef = formulaReferenceOverlayState.docRef || container?.ownerDocument || document;
      const winRef = formulaReferenceOverlayState.winRef || docRef?.defaultView || global;
      const scrollHandler = formulaReferenceOverlayState.scrollHandler;
      if(hostRoot && scrollHandler){
        hostRoot.removeEventListener('scroll', scrollHandler, true);
      }
      if(hostRoot && formulaReferenceOverlayState.wheelHandler){
        hostRoot.removeEventListener('wheel', formulaReferenceOverlayState.wheelHandler, true);
      }
      if(hostRoot && formulaReferenceOverlayState.touchMoveHandler){
        hostRoot.removeEventListener('touchmove', formulaReferenceOverlayState.touchMoveHandler, true);
      }
      if(Array.isArray(formulaReferenceOverlayState.scrollTargets) && formulaReferenceOverlayState.scrollTargets.length && scrollHandler){
        formulaReferenceOverlayState.scrollTargets.forEach((target)=>{
          try{
            target?.removeEventListener?.('scroll', scrollHandler, true);
          }catch(err){
            // ignore per-target detach failures
          }
        });
      }
      const gridApiRef = formulaReferenceOverlayState.gridApiRef;
      if(gridApiRef && typeof gridApiRef.removeEventListener === 'function'){
        if(formulaReferenceOverlayState.gridBodyScrollHandler){
          try{
            gridApiRef.removeEventListener('bodyScroll', formulaReferenceOverlayState.gridBodyScrollHandler);
          }catch(err){
            // ignore ag-grid body scroll detach failures
          }
          try{
            gridApiRef.removeEventListener('bodyScrollEnd', formulaReferenceOverlayState.gridBodyScrollHandler);
          }catch(err){
            // ignore ag-grid body scroll end detach failures
          }
        }
        if(formulaReferenceOverlayState.gridViewportChangedHandler){
          try{
            gridApiRef.removeEventListener('viewportChanged', formulaReferenceOverlayState.gridViewportChangedHandler);
          }catch(err){
            // ignore ag-grid viewport detach failures
          }
          try{
            gridApiRef.removeEventListener('modelUpdated', formulaReferenceOverlayState.gridViewportChangedHandler);
          }catch(err){
            // ignore ag-grid model detach failures
          }
        }
      }
      if(winRef && formulaReferenceOverlayState.resizeHandler){
        winRef.removeEventListener?.('resize', formulaReferenceOverlayState.resizeHandler, true);
      }
      if(winRef && formulaReferenceOverlayState.focusHandler){
        winRef.removeEventListener?.('focus', formulaReferenceOverlayState.focusHandler, true);
      }
      if(docRef && formulaReferenceOverlayState.visibilityHandler){
        docRef.removeEventListener?.('visibilitychange', formulaReferenceOverlayState.visibilityHandler, true);
      }
      if(formulaReferenceOverlayState.mutationObserver && typeof formulaReferenceOverlayState.mutationObserver.disconnect === 'function'){
        try{
          formulaReferenceOverlayState.mutationObserver.disconnect();
        }catch(err){
          // ignore observer disconnect failures
        }
      }
      cancelFormulaReferenceOverlayRetry();
      formulaReferenceOverlayState.retryCount = 0;
      formulaReferenceOverlayState.docRef = null;
      formulaReferenceOverlayState.winRef = null;
      formulaReferenceOverlayState.focusHandler = null;
      formulaReferenceOverlayState.visibilityHandler = null;
      formulaReferenceOverlayState.mutationObserver = null;
      formulaReferenceOverlayState.resizeHandler = null;
      formulaReferenceOverlayState.scrollHandler = null;
      formulaReferenceOverlayState.wheelHandler = null;
      formulaReferenceOverlayState.touchMoveHandler = null;
      formulaReferenceOverlayState.scrollTargets = [];
      formulaReferenceOverlayState.gridApiRef = null;
      formulaReferenceOverlayState.gridBodyScrollHandler = null;
      formulaReferenceOverlayState.gridViewportChangedHandler = null;
      formulaReferenceOverlayState.suppressMutationUntil = 0;
      formulaReferenceOverlayState.listenersAttached = false;
    };

    const scheduleFormulaReferenceOverlayRetry = (reason)=>{
      if(!formulaReferenceOverlayState.ranges.length){
        return;
      }
      if(formulaReferenceOverlayState.retryCount >= 600){
        return;
      }
      if(formulaReferenceOverlayState.retryTimerId != null){
        return;
      }
      formulaReferenceOverlayState.retryTimerId = global.setTimeout(()=>{
        formulaReferenceOverlayState.retryTimerId = null;
        formulaReferenceOverlayState.retryCount += 1;
        scheduleFormulaReferenceOverlayRender(`retry:${reason || 'unknown'}`);
      }, 100);
      if(isFormulaReferenceOverlayDebugEnabled()){
        console.debug('Debug: Shared.hot formula overlay retry scheduled', {
          debugLabel,
          reason: reason || 'unknown',
          retryCount: formulaReferenceOverlayState.retryCount
        });
      }
    };

    const resolveFormulaReferenceOverlayHost = ()=>{
      return instance?.rootElement || container || null;
    };

    const ensureFormulaReferenceOverlayRoot = (hostRoot)=>{
      if(!hostRoot || !global.document){
        return null;
      }
      const current = formulaReferenceOverlayState.overlayRoot;
      if(current && current.parentNode && current.parentNode !== hostRoot){
        current.parentNode.removeChild(current);
      }
      if(!formulaReferenceOverlayState.overlayRoot){
        const layer = global.document.createElement('div');
        layer.className = 'hot-formula-ref-overlay';
        layer.setAttribute('aria-hidden', 'true');
        formulaReferenceOverlayState.overlayRoot = layer;
      }
      const computed = global.getComputedStyle?.(hostRoot);
      if(computed?.position === 'static'){
        if(formulaReferenceOverlayState.hostPositionNode && formulaReferenceOverlayState.hostPositionNode !== hostRoot){
          restoreFormulaReferenceOverlayHostPosition();
        }
        if(formulaReferenceOverlayState.hostPositionNode !== hostRoot){
          formulaReferenceOverlayState.hostPositionNode = hostRoot;
          formulaReferenceOverlayState.hostPositionInlineBeforePatch = hostRoot.style?.position || '';
        }
        hostRoot.style.position = 'relative';
      }
      if(formulaReferenceOverlayState.overlayRoot.parentNode !== hostRoot){
        hostRoot.appendChild(formulaReferenceOverlayState.overlayRoot);
      }
      formulaReferenceOverlayState.hostRoot = hostRoot;
      return formulaReferenceOverlayState.overlayRoot;
    };

    const parseFormulaReferenceOverlayA1 = (refText, a1RowOffset)=>{
      const formulaNS = Shared.formulaEngine || {};
      const parseA1 = typeof formulaNS.parseA1 === 'function' ? formulaNS.parseA1 : null;
      if(!parseA1){
        return null;
      }
      const normalizedRef = String(refText || '').replace(/\$/g, '');
      const parsed = parseA1(normalizedRef);
      if(!parsed){
        return null;
      }
      const offset = Math.max(0, Number(a1RowOffset) || 0);
      return {
        row: parsed.row + offset,
        col: parsed.col
      };
    };

    const extractFormulaReferenceOverlayRanges = (rawFormula, a1RowOffset)=>{
      const source = typeof rawFormula === 'string' ? rawFormula.trim() : '';
      if(!source || source[0] !== '='){
        return [];
      }
      const offset = Math.max(0, Number(a1RowOffset) || 0);
      const formulaNS = Shared.formulaEngine || {};
      const parsedRanges = typeof formulaNS.extractReferences === 'function'
        ? formulaNS.extractReferences(source, { a1RowOffset: offset })
        : [];
      const fallbackMatches = Array.from(source.toUpperCase().matchAll(/(\$?[A-Z]+\$?[1-9]\d*)(\s*:\s*(\$?[A-Z]+\$?[1-9]\d*))?/g));
      const fallbackRanges = fallbackMatches.map(match => ({
        start: parseFormulaReferenceOverlayA1(match[1], offset),
        end: parseFormulaReferenceOverlayA1(match[3] || match[1], offset)
      }));
      const sourceRanges = Array.isArray(parsedRanges) && parsedRanges.length ? parsedRanges : fallbackRanges;
      const ranges = [];
      let tokenIndex = 0;
      for(const entry of sourceRanges){
        const start = entry?.start || null;
        const end = entry?.end || start;
        if(!start || !end){
          tokenIndex += 1;
          continue;
        }
        const startRow = Number(start.row);
        const startCol = Number(start.col);
        const endRow = Number(end.row);
        const endCol = Number(end.col);
        if(!Number.isInteger(startRow) || !Number.isInteger(startCol) || !Number.isInteger(endRow) || !Number.isInteger(endCol)){
          tokenIndex += 1;
          continue;
        }
        if(startRow < 0 || startCol < 0 || endRow < 0 || endCol < 0){
          tokenIndex += 1;
          continue;
        }
        ranges.push({
          start: { row: startRow, col: startCol },
          end: { row: endRow, col: endCol },
          colorIndex: tokenIndex % formulaReferenceOverlayColors.length
        });
        tokenIndex += 1;
      }
      return ranges;
    };

    const expandFormulaReferenceOverlayCells = (ranges)=>{
      const uniqueCells = new Map();
      let traversed = 0;
      for(const range of ranges){
        const minRow = Math.min(range.start.row, range.end.row);
        const maxRow = Math.max(range.start.row, range.end.row);
        const minCol = Math.min(range.start.col, range.end.col);
        const maxCol = Math.max(range.start.col, range.end.col);
        for(let row = minRow; row <= maxRow; row += 1){
          for(let col = minCol; col <= maxCol; col += 1){
            if(traversed >= formulaReferenceOverlayMaxCells){
              break;
            }
            traversed += 1;
            const key = `${row}:${col}`;
            if(!uniqueCells.has(key)){
              uniqueCells.set(key, { row, col, colorIndex: range.colorIndex });
            }
          }
          if(traversed >= formulaReferenceOverlayMaxCells){
            break;
          }
        }
        if(traversed >= formulaReferenceOverlayMaxCells){
          break;
        }
      }
      return Array.from(uniqueCells.values());
    };

    const mapFormulaReferenceOverlayRowsToDisplayedRows = (gridApi, requiredRows)=>{
      const rowMap = new Map();
      if(!gridApi || typeof gridApi.getDisplayedRowCount !== 'function'){
        return rowMap;
      }
      const needed = requiredRows instanceof Set ? requiredRows : new Set(requiredRows || []);
      if(!needed.size){
        return rowMap;
      }
      const totalRows = Math.max(0, Number(gridApi.getDisplayedRowCount()) || 0);
      needed.forEach((value)=>{
        const visualRow = Number(value);
        if(!Number.isInteger(visualRow) || visualRow < 0 || visualRow >= totalRows){
          return;
        }
        rowMap.set(visualRow, visualRow);
      });
      return rowMap;
    };

    const resolveFormulaReferenceOverlayOcclusionEdge = (hostRoot, selector, edge)=>{
      if(!hostRoot || typeof hostRoot.querySelectorAll !== 'function'){
        return null;
      }
      const nodes = hostRoot.querySelectorAll(selector);
      if(!nodes || !nodes.length){
        return null;
      }
      const isLeftEdge = edge === 'left';
      let resolved = isLeftEdge ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      let found = false;
      for(let i = 0; i < nodes.length; i += 1){
        const node = nodes[i];
        if(!node || typeof node.getBoundingClientRect !== 'function'){
          continue;
        }
        const rect = node.getBoundingClientRect();
        if(!rect || rect.width <= 0 || rect.height <= 0){
          continue;
        }
        const raw = rect?.[edge];
        if(!Number.isFinite(raw)){
          continue;
        }
        resolved = isLeftEdge ? Math.min(resolved, raw) : Math.max(resolved, raw);
        found = true;
      }
      return found ? resolved : null;
    };

    const resolveFormulaReferenceOverlayVisibilityContext = (hostRoot)=>{
      return {
        pinnedLeftRight: resolveFormulaReferenceOverlayOcclusionEdge(
          hostRoot,
          '.ag-pinned-left-cols-viewport, .ag-pinned-left-cols-container, .ag-pinned-left-header-viewport, .ag-pinned-left-header, .ag-pinned-left-floating-top',
          'right'
        ),
        pinnedRightLeft: resolveFormulaReferenceOverlayOcclusionEdge(
          hostRoot,
          '.ag-pinned-right-cols-viewport, .ag-pinned-right-cols-container, .ag-pinned-right-header-viewport, .ag-pinned-right-header, .ag-pinned-right-floating-top',
          'left'
        ),
        pinnedTopBottom: resolveFormulaReferenceOverlayOcclusionEdge(
          hostRoot,
          '.ag-floating-top, .ag-pinned-top, .ag-floating-top-viewport, .ag-pinned-top-viewport, .ag-floating-top-left, .ag-floating-top-center, .ag-floating-top-right, .ag-pinned-left-floating-top, .ag-pinned-right-floating-top',
          'bottom'
        ),
        stickyTopBottom: resolveFormulaReferenceOverlayOcclusionEdge(
          hostRoot,
          '.ag-row.hot-sticky-row',
          'bottom'
        ),
        headerBottom: resolveFormulaReferenceOverlayOcclusionEdge(
          hostRoot,
          '.ag-header, .ag-header-viewport',
          'bottom'
        )
      };
    };

    const resolveFormulaReferenceOverlayVisibleRect = (cellEl, rect, hostRect, visibilityContext = null)=>{
      if(!cellEl || !rect || !hostRect){
        return null;
      }
      let clipLeft = hostRect.left;
      let clipTop = hostRect.top;
      let clipRight = hostRect.right;
      let clipBottom = hostRect.bottom;

      const viewport = cellEl.closest?.(
        '.ag-pinned-left-floating-top, .ag-pinned-right-floating-top, .ag-floating-top-viewport, .ag-pinned-top-viewport, .ag-center-cols-viewport, .ag-pinned-left-cols-viewport, .ag-pinned-right-cols-viewport'
      );
      if(viewport && typeof viewport.getBoundingClientRect === 'function'){
        const viewportRect = viewport.getBoundingClientRect();
        if(viewportRect && viewportRect.width > 0 && viewportRect.height > 0){
          clipLeft = Math.max(clipLeft, viewportRect.left);
          clipTop = Math.max(clipTop, viewportRect.top);
          clipRight = Math.min(clipRight, viewportRect.right);
          clipBottom = Math.min(clipBottom, viewportRect.bottom);
        }
      }

      const isCenterCell = !!(cellEl && typeof cellEl.closest === 'function'
        && cellEl.closest('.ag-center-cols-viewport, .ag-center-cols-container, .ag-center-cols-clipper'));
      const isFloatingTopCell = !!(cellEl && typeof cellEl.closest === 'function'
        && cellEl.closest('.ag-floating-top, .ag-pinned-top, .ag-floating-top-viewport, .ag-pinned-top-viewport, .ag-pinned-left-floating-top, .ag-pinned-right-floating-top'));
      const isStickyTopCell = !!(cellEl && typeof cellEl.closest === 'function'
        && cellEl.closest('.ag-row.hot-sticky-row'));

      if(isCenterCell && visibilityContext){
        const pinnedLeftRight = visibilityContext.pinnedLeftRight;
        const pinnedRightLeft = visibilityContext.pinnedRightLeft;
        if(Number.isFinite(pinnedLeftRight)){
          clipLeft = Math.max(clipLeft, pinnedLeftRight);
        }
        if(Number.isFinite(pinnedRightLeft)){
          clipRight = Math.min(clipRight, pinnedRightLeft);
        }
      }
      if(!isFloatingTopCell && !isStickyTopCell && visibilityContext){
        const pinnedTopBottom = visibilityContext.pinnedTopBottom;
        if(Number.isFinite(pinnedTopBottom)){
          clipTop = Math.max(clipTop, pinnedTopBottom);
        }
        const stickyTopBottom = visibilityContext.stickyTopBottom;
        if(Number.isFinite(stickyTopBottom)){
          clipTop = Math.max(clipTop, stickyTopBottom);
        }
        const headerBottom = visibilityContext.headerBottom;
        if(Number.isFinite(headerBottom)){
          clipTop = Math.max(clipTop, headerBottom);
        }
      }

      const left = Math.max(rect.left, clipLeft);
      const top = Math.max(rect.top, clipTop);
      const right = Math.min(rect.right, clipRight);
      const bottom = Math.min(rect.bottom, clipBottom);
      if(!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)){
        return null;
      }
      if(right <= (left + 0.5) || bottom <= (top + 0.5)){
        return null;
      }
      return { left, top, right, bottom };
    };

    const buildFormulaReferenceOverlayRenderedCellLookup = (hostRoot, hostRect, visibilityContext)=>{
      const renderedRows = new Set();
      const lookup = new Map();
      if(!hostRoot || typeof hostRoot.querySelectorAll !== 'function'){
        return { renderedRows, lookup };
      }
      const renderedCells = hostRoot.querySelectorAll('.ag-row[row-index] .ag-cell[col-id^="c"]');
      for(let i = 0; i < renderedCells.length; i += 1){
        const cellEl = renderedCells[i];
        if(!cellEl || typeof cellEl.getBoundingClientRect !== 'function'){
          continue;
        }
        const colId = cellEl.getAttribute?.('col-id') || '';
        if(typeof colId !== 'string' || !colId.startsWith('c')){
          continue;
        }
        const rowAttr = cellEl.getAttribute?.('row-index') ?? cellEl.closest?.('.ag-row')?.getAttribute?.('row-index');
        const displayRow = parseVisualRowIndex(rowAttr);
        if(!Number.isInteger(displayRow) || displayRow < 0){
          continue;
        }
        const rect = cellEl.getBoundingClientRect();
        if(!rect || rect.width <= 1 || rect.height <= 1){
          continue;
        }
        const visibleRect = resolveFormulaReferenceOverlayVisibleRect(cellEl, rect, hostRect, visibilityContext);
        if(!visibleRect){
          continue;
        }
        const area = Math.max(0, visibleRect.right - visibleRect.left) * Math.max(0, visibleRect.bottom - visibleRect.top);
        if(area <= 0){
          continue;
        }
        renderedRows.add(displayRow);
        const key = `${displayRow}:${colId}`;
        const current = lookup.get(key);
        if(current && current.area >= area){
          continue;
        }
        lookup.set(key, { cellEl, rect, visibleRect, area });
      }
      return { renderedRows, lookup };
    };

    const renderFormulaReferenceOverlay = ()=>{
      const ranges = Array.isArray(formulaReferenceOverlayState.ranges)
        ? formulaReferenceOverlayState.ranges
        : [];
      if(!ranges.length){
        clearFormulaReferenceOverlayLayer();
        return;
      }
      const hostRoot = resolveFormulaReferenceOverlayHost();
      const gridApi = instance?.gridApi || null;
      if(!hostRoot || !gridApi){
        clearFormulaReferenceOverlayLayer();
        scheduleFormulaReferenceOverlayRetry('host-or-grid-missing');
        return;
      }
      const overlayRoot = ensureFormulaReferenceOverlayRoot(hostRoot);
      if(!overlayRoot || !global.document){
        scheduleFormulaReferenceOverlayRetry('overlay-root-missing');
        return;
      }
      const hostRect = hostRoot.getBoundingClientRect();
      if(hostRect.width <= 1 || hostRect.height <= 1){
        clearFormulaReferenceOverlayLayer();
        scheduleFormulaReferenceOverlayRetry('host-rect-zero');
        return;
      }
      const cells = expandFormulaReferenceOverlayCells(ranges);
      if(!cells.length){
        clearFormulaReferenceOverlayLayer();
        return;
      }
      const visibilityContext = resolveFormulaReferenceOverlayVisibilityContext(hostRoot);
      const renderedLookup = buildFormulaReferenceOverlayRenderedCellLookup(hostRoot, hostRect, visibilityContext);
      const renderedRows = renderedLookup.renderedRows;
      const cellLookup = renderedLookup.lookup;
      if(!renderedRows.size || !cellLookup.size){
        clearFormulaReferenceOverlayLayer();
        scheduleFormulaReferenceOverlayRetry('rendered-cells-missing');
        return;
      }
      const requiredRows = new Set(cells.map(cell => cell.row));
      const rowMap = mapFormulaReferenceOverlayRowsToDisplayedRows(gridApi, requiredRows);
      const fragment = global.document.createDocumentFragment();
      let drawn = 0;
      cells.forEach(cell => {
        const displayRow = rowMap.get(cell.row);
        if(!Number.isInteger(displayRow) || displayRow < 0){
          return;
        }
        if(!renderedRows.has(displayRow)){
          return;
        }
        const lookupEntry = cellLookup.get(`${displayRow}:c${cell.col}`);
        if(!lookupEntry){
          return;
        }
        const visibleRect = lookupEntry.visibleRect || resolveFormulaReferenceOverlayVisibleRect(
          lookupEntry.cellEl,
          lookupEntry.rect,
          hostRect,
          visibilityContext
        );
        if(!visibleRect){
          return;
        }
        const left = visibleRect.left - hostRect.left + 1;
        const top = visibleRect.top - hostRect.top + 1;
        const width = Math.max(0, (visibleRect.right - visibleRect.left) - 2);
        const height = Math.max(0, (visibleRect.bottom - visibleRect.top) - 2);
        if(width <= 0 || height <= 0){
          return;
        }
        const outline = global.document.createElement('div');
        outline.className = 'hot-formula-ref-outline';
        outline.dataset.row = String(cell.row);
        outline.dataset.col = String(cell.col);
        outline.dataset.colorIndex = String(cell.colorIndex);
        outline.style.left = `${left}px`;
        outline.style.top = `${top}px`;
        outline.style.width = `${width}px`;
        outline.style.height = `${height}px`;
        outline.style.borderColor = formulaReferenceOverlayColors[cell.colorIndex % formulaReferenceOverlayColors.length];
        fragment.appendChild(outline);
        drawn += 1;
      });
      if(drawn === 0 && rowMap.size > 0){
        scheduleFormulaReferenceOverlayRetry('drawn-zero');
      }else{
        cancelFormulaReferenceOverlayRetry();
        formulaReferenceOverlayState.retryCount = 0;
      }
      if(typeof overlayRoot.replaceChildren === 'function'){
        overlayRoot.replaceChildren(fragment);
      }else{
        overlayRoot.innerHTML = '';
        overlayRoot.appendChild(fragment);
      }
      if(isFormulaReferenceOverlayDebugEnabled()){
        console.debug('Debug: Shared.hot formula overlay rendered', {
          debugLabel,
          formula: formulaReferenceOverlayState.formulaText,
          ranges: ranges.length,
          cells: cells.length,
          drawn
        });
      }
    };

    const renderFormulaReferenceOverlayImmediate = (reason)=>{
      cancelFormulaReferenceOverlayFrame();
      if(!formulaReferenceOverlayState.ranges.length){
        return;
      }
      renderFormulaReferenceOverlay();
      // Ignore immediate mutation callbacks caused by our own overlay DOM writes.
      formulaReferenceOverlayState.suppressMutationUntil = Date.now() + 34;
      if(isFormulaReferenceOverlayDebugEnabled()){
        console.debug('Debug: Shared.hot formula overlay immediate render', {
          debugLabel,
          reason: reason || 'unknown'
        });
      }
    };

    const scheduleFormulaReferenceOverlayRender = (reason, options = {})=>{
      if(!formulaReferenceOverlayState.ranges.length){
        return;
      }
      if(options && options.immediate === true){
        renderFormulaReferenceOverlayImmediate(reason);
        return;
      }
      cancelFormulaReferenceOverlayFrame();
      const run = ()=>{
        formulaReferenceOverlayState.frameId = null;
        formulaReferenceOverlayState.frameKind = null;
        renderFormulaReferenceOverlay();
      };
      if(typeof global.requestAnimationFrame === 'function'){
        formulaReferenceOverlayState.frameKind = 'raf';
        formulaReferenceOverlayState.frameId = global.requestAnimationFrame(run);
      }else{
        formulaReferenceOverlayState.frameKind = 'timeout';
        formulaReferenceOverlayState.frameId = global.setTimeout(run, 0);
      }
      if(isFormulaReferenceOverlayDebugEnabled()){
        console.debug('Debug: Shared.hot formula overlay scheduled', {
          debugLabel,
          reason: reason || 'unknown'
        });
      }
    };

    const attachFormulaReferenceOverlayListeners = (hostRoot)=>{
      if(formulaReferenceOverlayState.listenersAttached || !hostRoot){
        return;
      }
      const docRef = hostRoot.ownerDocument || container?.ownerDocument || document;
      const winRef = docRef?.defaultView || global;
      formulaReferenceOverlayState.scrollHandler = ()=>scheduleFormulaReferenceOverlayRender('scroll', { immediate: true });
      formulaReferenceOverlayState.wheelHandler = ()=>scheduleFormulaReferenceOverlayRender('wheel', { immediate: true });
      formulaReferenceOverlayState.touchMoveHandler = ()=>scheduleFormulaReferenceOverlayRender('touchmove', { immediate: true });
      formulaReferenceOverlayState.resizeHandler = ()=>scheduleFormulaReferenceOverlayRender('resize');
      formulaReferenceOverlayState.focusHandler = ()=>scheduleFormulaReferenceOverlayRender('window-focus');
      formulaReferenceOverlayState.visibilityHandler = ()=>{
        if(docRef?.visibilityState === 'hidden'){
          return;
        }
        scheduleFormulaReferenceOverlayRender('visibility');
      };
      hostRoot.addEventListener('scroll', formulaReferenceOverlayState.scrollHandler, true);
      hostRoot.addEventListener('wheel', formulaReferenceOverlayState.wheelHandler, { capture: true, passive: true });
      hostRoot.addEventListener('touchmove', formulaReferenceOverlayState.touchMoveHandler, { capture: true, passive: true });
      const explicitScrollTargets = Array.from(new Set(Array.from(hostRoot.querySelectorAll(
        '.ag-body-viewport, .ag-center-cols-viewport, .ag-body-horizontal-scroll-viewport, .ag-body-vertical-scroll-viewport, .ag-pinned-left-cols-viewport, .ag-pinned-right-cols-viewport, .ag-floating-top-viewport, .ag-pinned-top-viewport'
      ))));
      formulaReferenceOverlayState.scrollTargets = explicitScrollTargets;
      explicitScrollTargets.forEach((target)=>{
        try{
          target?.addEventListener?.('scroll', formulaReferenceOverlayState.scrollHandler, true);
        }catch(err){
          // ignore per-target attach failures
        }
      });
      winRef.addEventListener?.('resize', formulaReferenceOverlayState.resizeHandler, true);
      winRef.addEventListener?.('focus', formulaReferenceOverlayState.focusHandler, true);
      docRef.addEventListener?.('visibilitychange', formulaReferenceOverlayState.visibilityHandler, true);
      const gridApi = instance?.gridApi || null;
      formulaReferenceOverlayState.gridApiRef = gridApi;
      if(gridApi && typeof gridApi.addEventListener === 'function'){
        formulaReferenceOverlayState.gridBodyScrollHandler = ()=>scheduleFormulaReferenceOverlayRender('grid-body-scroll', { immediate: true });
        formulaReferenceOverlayState.gridViewportChangedHandler = ()=>scheduleFormulaReferenceOverlayRender('grid-viewport', { immediate: true });
        try{
          gridApi.addEventListener('bodyScroll', formulaReferenceOverlayState.gridBodyScrollHandler);
        }catch(err){
          // ignore grid body scroll attach failures
        }
        try{
          gridApi.addEventListener('bodyScrollEnd', formulaReferenceOverlayState.gridBodyScrollHandler);
        }catch(err){
          // ignore grid body scroll end attach failures
        }
        try{
          gridApi.addEventListener('viewportChanged', formulaReferenceOverlayState.gridViewportChangedHandler);
        }catch(err){
          // ignore viewport listener attach failures
        }
        try{
          gridApi.addEventListener('modelUpdated', formulaReferenceOverlayState.gridViewportChangedHandler);
        }catch(err){
          // ignore model listener attach failures
        }
      }
      if(typeof global.MutationObserver === 'function'){
        try{
          formulaReferenceOverlayState.mutationObserver = new global.MutationObserver((mutations)=>{
            if(Date.now() < (formulaReferenceOverlayState.suppressMutationUntil || 0)){
              return;
            }
            const overlayRoot = formulaReferenceOverlayState.overlayRoot;
            if(overlayRoot && Array.isArray(mutations) && mutations.length){
              const hasExternalMutation = mutations.some((mutation)=>{
                const target = mutation?.target;
                return !target || !overlayRoot.contains(target);
              });
              if(!hasExternalMutation){
                return;
              }
            }
            scheduleFormulaReferenceOverlayRender('mutation');
          });
          formulaReferenceOverlayState.mutationObserver.observe(hostRoot, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'row-index', 'col-id']
          });
        }catch(err){
          formulaReferenceOverlayState.mutationObserver = null;
        }
      }
      formulaReferenceOverlayState.docRef = docRef;
      formulaReferenceOverlayState.winRef = winRef;
      formulaReferenceOverlayState.listenersAttached = true;
    };

    const clearFormulaReferenceOverlay = (options = {})=>{
      formulaReferenceOverlayState.formulaText = '';
      formulaReferenceOverlayState.ranges = [];
      cancelFormulaReferenceOverlayFrame();
      cancelFormulaReferenceOverlayRetry();
      formulaReferenceOverlayState.retryCount = 0;
      clearFormulaReferenceOverlayLayer();
      if(options.keepListeners !== true){
        detachFormulaReferenceOverlayListeners();
      }
      if(options.removeLayer === true){
        removeFormulaReferenceOverlayLayer();
      }
    };

    const setFormulaReferenceOverlay = (rawFormula, options = {})=>{
      const source = typeof rawFormula === 'string' ? rawFormula.trim() : '';
      const a1RowOffset = Number.isInteger(Number(options.a1RowOffset))
        ? Math.max(0, Number(options.a1RowOffset))
        : getFormulaA1RowOffset();
      const ranges = extractFormulaReferenceOverlayRanges(source, a1RowOffset);
      if(!ranges.length){
        clearFormulaReferenceOverlay({
          removeLayer: options.removeLayer === true
        });
        return false;
      }
      const hostRoot = resolveFormulaReferenceOverlayHost();
      if(!hostRoot){
        return false;
      }
      formulaReferenceOverlayState.formulaText = source;
      formulaReferenceOverlayState.ranges = ranges;
      formulaReferenceOverlayState.a1RowOffset = a1RowOffset;
      cancelFormulaReferenceOverlayRetry();
      formulaReferenceOverlayState.retryCount = 0;
      ensureFormulaReferenceOverlayRoot(hostRoot);
      attachFormulaReferenceOverlayListeners(hostRoot);
      scheduleFormulaReferenceOverlayRender('formula-input');
      return true;
    };

    const refreshFormulaReferenceOverlay = (reason)=>{
      if(!formulaReferenceOverlayState.ranges.length){
        return false;
      }
      scheduleFormulaReferenceOverlayRender(reason || 'refresh');
      return true;
    };

    cleanupFns.push(()=>{
      clearFormulaReferenceOverlay({ removeLayer: true });
    });

    const ensureSelectionOutline = ()=>{
      if(selectionOutline){
        return selectionOutline;
      }
      if(!container || typeof container.appendChild !== 'function'){
        return null;
      }
      const doc = container.ownerDocument || document;
      const outline = doc.createElement('div');
      outline.className = 'hot-selection-outline';
      outline.setAttribute('aria-hidden', 'true');
      outline.style.display = 'none';
      container.appendChild(outline);
      selectionOutline = outline;
      cleanupFns.push(()=>{
        if(outline.parentNode){
          outline.parentNode.removeChild(outline);
        }
        if(selectionOutline === outline){
          selectionOutline = null;
        }
      });
      return outline;
    };

    const hideSelectionOutline = ()=>{
      if(selectionOutline && selectionOutline.style.display !== 'none'){
        selectionOutline.style.display = 'none';
      }
    };

    const ensureClipboardOutline = (index)=>{
      const outlineIndex = Number(index);
      if(!Number.isInteger(outlineIndex) || outlineIndex < 0){
        return null;
      }
      if(clipboardOutlines[outlineIndex]){
        return clipboardOutlines[outlineIndex];
      }
      if(!container || typeof container.appendChild !== 'function'){
        return null;
      }
      const doc = container.ownerDocument || document;
      const outline = doc.createElement('div');
      outline.className = 'hot-clipboard-outline';
      outline.setAttribute('aria-hidden', 'true');
      outline.style.display = 'none';
      ['top', 'right', 'bottom', 'left'].forEach(edge=>{
        const edgeEl = doc.createElement('div');
        edgeEl.className = 'hot-clipboard-outline-edge';
        edgeEl.dataset.edge = edge;
        outline.appendChild(edgeEl);
      });
      container.appendChild(outline);
      clipboardOutlines[outlineIndex] = outline;
      cleanupFns.push(()=>{
        if(outline.parentNode){
          outline.parentNode.removeChild(outline);
        }
        const existingIndex = clipboardOutlines.indexOf(outline);
        if(existingIndex >= 0){
          clipboardOutlines.splice(existingIndex, 1);
        }
      });
      return outline;
    };

    const hideClipboardOutline = (outline)=>{
      if(outline && outline.style.display !== 'none'){
        outline.style.display = 'none';
      }
    };

    const hideClipboardOutlines = ()=>{
      for(let i = 0; i < clipboardOutlines.length; i += 1){
        hideClipboardOutline(clipboardOutlines[i]);
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
      const handleDoubleClick = (event)=>{
        const applied = applyFillHandleDoubleClickAutoFill();
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot fill handle double-click', { debugLabel, applied });
        }
      };
      handle.addEventListener('pointerdown', stopEvent);
      handle.addEventListener('mousedown', stopEvent);
      handle.addEventListener('dblclick', handleDoubleClick);
      if(container.classList){
        container.classList.add('hot-fill-handle-host');
      }
      container.appendChild(handle);
      fillHandle = handle;
      cleanupFns.push(()=>{
        handle.removeEventListener('pointerdown', stopEvent);
        handle.removeEventListener('mousedown', stopEvent);
        handle.removeEventListener('dblclick', handleDoubleClick);
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

    const parseVisualRowIndex = (value)=>{
      if(Number.isInteger(value) && value >= 0){
        return value;
      }
      if(typeof value !== 'string'){
        return null;
      }
      const trimmed = value.trim();
      if(!trimmed){
        return null;
      }
      if(/^\d+$/.test(trimmed)){
        const direct = Number(trimmed);
        return Number.isInteger(direct) && direct >= 0 ? direct : null;
      }
      const prefixedMatch = trimmed.match(/^[A-Za-z][A-Za-z0-9_-]*-(\d+)$/);
      if(prefixedMatch){
        const parsed = Number(prefixedMatch[1]);
        if(Number.isInteger(parsed) && parsed >= 0){
          return parsed;
        }
      }
      const suffixedMatch = trimmed.match(/^[A-Za-z][A-Za-z0-9_-]*(\d+)$/);
      if(suffixedMatch){
        const parsed = Number(suffixedMatch[1]);
        if(Number.isInteger(parsed) && parsed >= 0){
          return parsed;
        }
      }
      return null;
    };

    const resolveVisualRowIndex = (params)=>{
      const direct = params?.node?.rowIndex ?? params?.rowIndex;
      if(Number.isInteger(direct) && direct >= 0){
        return direct;
      }
      if(params?.node?.rowPinned){
        const physical = params?.data?.__rowIndex;
        if(Number.isInteger(physical) && physical >= 0){
          return physical;
        }
      }
      return null;
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
      const row = parseVisualRowIndex(rowAttr);
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
      const preferPinnedTopCell = !!(usePinnedRows && Number.isInteger(row) && row >= 0 && row < pinRowCount);
      const isRenderableCell = (candidate)=>{
        if(!candidate || typeof candidate.getBoundingClientRect !== 'function'){
          return false;
        }
        try{
          const rect = candidate.getBoundingClientRect();
          return !!(rect && rect.width > 0 && rect.height > 0);
        }catch(err){
          return false;
        }
      };
      const isPinnedGhostCell = (candidate)=>{
        if(!candidate || typeof candidate.closest !== 'function'){
          return false;
        }
        return !!candidate.closest('.ag-row.hot-pinned-ghost-row');
      };
      const isPinnedTopCell = (candidate)=>{
        if(!candidate || typeof candidate.closest !== 'function'){
          return false;
        }
        return !!candidate.closest('.ag-pinned-top, .ag-floating-top, .ag-pinned-top-viewport, .ag-floating-top-viewport');
      };
      const candidateMatchesRow = (candidate)=>{
        if(!candidate){
          return false;
        }
        const rowAttr = candidate.getAttribute?.('row-index') ?? candidate.closest?.('.ag-row')?.getAttribute?.('row-index');
        const parsed = parseVisualRowIndex(rowAttr);
        if(Number.isInteger(parsed)){
          return parsed === row;
        }
        return false;
      };
      const chooseBestCell = (nodes)=>{
        if(!nodes || !nodes.length){
          return null;
        }
        let best = null;
        let bestScore = Number.NEGATIVE_INFINITY;
        for(let i = 0; i < nodes.length; i++){
          const candidate = nodes[i];
          if(!candidate){
            continue;
          }
          const renderable = isRenderableCell(candidate);
          const ghost = isPinnedGhostCell(candidate);
          const pinnedTop = isPinnedTopCell(candidate);
          const selected = !!candidate.classList?.contains?.('hot-selected-cell');
          let score = renderable ? 100 : 0;
          if(ghost){
            score -= 80;
          }else{
            score += 20;
          }
          if(preferPinnedTopCell){
            score += pinnedTop ? 40 : -10;
          }else if(pinnedTop){
            score -= 5;
          }
          if(selected){
            score += 5;
          }
          if(score > bestScore){
            best = candidate;
            bestScore = score;
          }
        }
        return best || nodes[0];
      };
      const resolvePinnedTopCellFallback = ()=>{
        if(!preferPinnedTopCell || typeof container.querySelectorAll !== 'function'){
          return null;
        }
        const fallbackScopes = [
          '.ag-floating-top',
          '.ag-pinned-top',
          '.ag-floating-top-viewport',
          '.ag-pinned-top-viewport'
        ];
        for(let i = 0; i < fallbackScopes.length; i++){
          const scopeSelector = fallbackScopes[i];
          const scopedCandidates = Array.from(container.querySelectorAll(`${scopeSelector} .ag-cell[col-id="${colId}"]`));
          if(!scopedCandidates.length){
            continue;
          }
          const rowMatched = scopedCandidates.filter(candidateMatchesRow);
          const candidate = chooseBestCell(rowMatched.length ? rowMatched : scopedCandidates);
          if(candidate){
            if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
              console.debug('Debug: Shared.hot fill handle pinned row fallback', {
                debugLabel,
                row,
                col,
                scopeSelector,
                usedRowMatch: rowMatched.length > 0
              });
            }
            return candidate;
          }
        }
        const pinnedRows = Array.from(container.querySelectorAll('.ag-floating-top .ag-row, .ag-pinned-top .ag-row'));
        if(!pinnedRows.length){
          return null;
        }
        const targetRow = pinnedRows[Math.min(Math.max(0, row), pinnedRows.length - 1)];
        if(!targetRow || typeof targetRow.querySelector !== 'function'){
          return null;
        }
        const cell = targetRow.querySelector(`.ag-cell[col-id="${colId}"]`);
        if(cell){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot fill handle pinned row fallback by order', {
              debugLabel,
              row,
              col,
              pinnedRowCount: pinnedRows.length
            });
          }
          return cell;
        }
        return null;
      };
      const pinnedTopFallback = resolvePinnedTopCellFallback();
      if(pinnedTopFallback){
        return pinnedTopFallback;
      }
      const selectors = [
        `.ag-cell[row-index="t-${row}"][col-id="${colId}"]`,
        `.ag-row[row-index="t-${row}"] .ag-cell[col-id="${colId}"]`,
        `.ag-cell[row-index="${row}"][col-id="${colId}"]`,
        `.ag-row[row-index="${row}"] .ag-cell[col-id="${colId}"]`
      ];
      for(let i = 0; i < selectors.length; i++){
        const nodeList = container.querySelectorAll(selectors[i]);
        const candidate = chooseBestCell(nodeList);
        if(candidate){
          return candidate;
        }
      }
      const candidates = container.querySelectorAll(`.ag-cell[col-id="${colId}"]`);
      const matched = [];
      for(let i = 0; i < candidates.length; i++){
        const candidate = candidates[i];
        const rowAttr = candidate.getAttribute('row-index') ?? candidate.closest('.ag-row')?.getAttribute?.('row-index');
        const parsed = parseVisualRowIndex(rowAttr);
        if(parsed === row){
          matched.push(candidate);
        }
      }
      return chooseBestCell(matched);
    };

    const hideFillHandle = ()=>{
      if(fillHandle && fillHandle.style.display !== 'none'){
        fillHandle.style.display = 'none';
      }
    };

    const resolveSelectionOcclusionEdge = (selector, edge)=>{
      if(!container || typeof container.querySelectorAll !== 'function'){
        return null;
      }
      const nodes = container.querySelectorAll(selector);
      if(!nodes || !nodes.length){
        return null;
      }
      const isLeftEdge = edge === 'left';
      let resolved = isLeftEdge ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      let found = false;
      for(let i = 0; i < nodes.length; i += 1){
        const node = nodes[i];
        if(!node || typeof node.getBoundingClientRect !== 'function'){
          continue;
        }
        const rect = node.getBoundingClientRect();
        if(!rect || rect.width <= 0 || rect.height <= 0){
          continue;
        }
        const raw = rect?.[edge];
        if(!Number.isFinite(raw)){
          continue;
        }
        resolved = isLeftEdge ? Math.min(resolved, raw) : Math.max(resolved, raw);
        found = true;
      }
      return found ? resolved : null;
    };

    const resolveSelectionVisibilityContext = ()=>{
      return {
        pinnedLeftRight: resolveSelectionOcclusionEdge(
          '.ag-pinned-left-cols-viewport, .ag-pinned-left-cols-container, .ag-pinned-left-header-viewport, .ag-pinned-left-header, .ag-pinned-left-floating-top',
          'right'
        ),
        pinnedRightLeft: resolveSelectionOcclusionEdge(
          '.ag-pinned-right-cols-viewport, .ag-pinned-right-cols-container, .ag-pinned-right-header-viewport, .ag-pinned-right-header, .ag-pinned-right-floating-top',
          'left'
        ),
        pinnedTopBottom: resolveSelectionOcclusionEdge(
          '.ag-floating-top, .ag-pinned-top, .ag-floating-top-viewport, .ag-pinned-top-viewport, .ag-floating-top-left, .ag-floating-top-center, .ag-floating-top-right, .ag-pinned-left-floating-top, .ag-pinned-right-floating-top',
          'bottom'
        )
      };
    };

    const resolveVisibleCellRect = (cell, rect, visibilityContext = null)=>{
      if(!cell || !rect || typeof rect !== 'object'){
        return null;
      }
      let clipLeft = Number.NEGATIVE_INFINITY;
      let clipTop = Number.NEGATIVE_INFINITY;
      let clipRight = Number.POSITIVE_INFINITY;
      let clipBottom = Number.POSITIVE_INFINITY;
      const viewport = resolveFillHandleViewport(cell, { preferPinnedTop: false });
      const viewportRect = (viewport && typeof viewport.getBoundingClientRect === 'function')
        ? viewport.getBoundingClientRect()
        : null;
      if(viewportRect){
        clipLeft = viewportRect.left;
        clipTop = viewportRect.top;
        clipRight = viewportRect.right;
        clipBottom = viewportRect.bottom;
      }
      const isCenterCell = !!(cell && typeof cell.closest === 'function'
        && cell.closest('.ag-center-cols-viewport, .ag-center-cols-container, .ag-center-cols-clipper'));
      const isFloatingTopCell = !!(cell && typeof cell.closest === 'function'
        && cell.closest('.ag-floating-top, .ag-pinned-top, .ag-floating-top-viewport, .ag-pinned-top-viewport, .ag-pinned-left-floating-top, .ag-pinned-right-floating-top'));
      if(isCenterCell && visibilityContext){
        const pinnedLeftRight = visibilityContext.pinnedLeftRight;
        const pinnedRightLeft = visibilityContext.pinnedRightLeft;
        if(Number.isFinite(pinnedLeftRight)){
          clipLeft = Math.max(clipLeft, pinnedLeftRight);
        }
        if(Number.isFinite(pinnedRightLeft)){
          clipRight = Math.min(clipRight, pinnedRightLeft);
        }
      }
      if(!isFloatingTopCell && visibilityContext){
        const pinnedTopBottom = visibilityContext.pinnedTopBottom;
        if(Number.isFinite(pinnedTopBottom)){
          clipTop = Math.max(clipTop, pinnedTopBottom);
        }
      }
      const left = Number.isFinite(clipLeft) ? Math.max(rect.left, clipLeft) : rect.left;
      const top = Number.isFinite(clipTop) ? Math.max(rect.top, clipTop) : rect.top;
      const right = Number.isFinite(clipRight) ? Math.min(rect.right, clipRight) : rect.right;
      const bottom = Number.isFinite(clipBottom) ? Math.min(rect.bottom, clipBottom) : rect.bottom;
      if(!Number.isFinite(left) || !Number.isFinite(top) || !Number.isFinite(right) || !Number.isFinite(bottom)){
        return null;
      }
      const visibleHorizontally = right > (left + 0.5);
      const visibleVertically = bottom > (top + 0.5);
      if(!visibleHorizontally || !visibleVertically){
        return null;
      }
      return { left, top, right, bottom };
    };

    const forEachRenderedCellInRange = (range, visitor)=>{
      const normalized = normalizeRange(range);
      if(!normalized || !container || typeof container.querySelectorAll !== 'function' || typeof visitor !== 'function'){
        return 0;
      }
      const cells = container.querySelectorAll('.ag-cell');
      let count = 0;
      for(let i = 0; i < cells.length; i += 1){
        const cell = cells[i];
        if(!cell || typeof cell.getBoundingClientRect !== 'function'){
          continue;
        }
        if(cell.closest?.('.hot-pinned-ghost-row')){
          continue;
        }
        const colId = cell.getAttribute?.('col-id');
        if(typeof colId !== 'string' || !colId.startsWith('c')){
          continue;
        }
        const col = Number(colId.slice(1));
        if(!Number.isInteger(col) || col < normalized.from.col || col > normalized.to.col){
          continue;
        }
        const rowAttr = cell.getAttribute('row-index') ?? cell.closest?.('.ag-row')?.getAttribute?.('row-index');
        const row = parseVisualRowIndex(rowAttr);
        if(!Number.isInteger(row) || row < normalized.from.row || row > normalized.to.row){
          continue;
        }
        count += 1;
        visitor(cell, row, col);
      }
      return count;
    };

    const resolveVisibleRangeBounds = (range, visibilityContext)=>{
      let left = Number.POSITIVE_INFINITY;
      let top = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;
      let count = 0;
      forEachRenderedCellInRange(range, cell=>{
        const rect = cell.getBoundingClientRect();
        if(!rect || rect.width <= 0 || rect.height <= 0){
          return;
        }
        const visibleRect = resolveVisibleCellRect(cell, rect, visibilityContext);
        if(!visibleRect){
          return;
        }
        left = Math.min(left, visibleRect.left);
        top = Math.min(top, visibleRect.top);
        right = Math.max(right, visibleRect.right);
        bottom = Math.max(bottom, visibleRect.bottom);
        count += 1;
      });
      if(!count){
        return null;
      }
      return { left, top, right, bottom };
    };

    const resolveRangeOutlineEdgeVisibility = (selection, visibilityContext, options = {})=>{
      const visible = {
        left: false,
        right: false,
        top: false,
        bottom: false
      };
      if(!selection || !container || typeof container.querySelectorAll !== 'function'){
        return visible;
      }
      const edgeClipTolerance = 1.5;
      const isEdgeClipped = (visibleEdge, rawEdge, direction)=>{
        const raw = Number(rawEdge);
        const clipped = Number(visibleEdge);
        if(!Number.isFinite(raw) || !Number.isFinite(clipped)){
          return true;
        }
        if(direction === 'left' || direction === 'top'){
          return (clipped - raw) > edgeClipTolerance;
        }
        return (raw - clipped) > edgeClipTolerance;
      };
      const markVisibleFromCell = (cell, row, col, rect)=>{
        if(!cell || !Number.isInteger(row) || !Number.isInteger(col)){
          return;
        }
        const isCenterCell = !!(cell && typeof cell.closest === 'function'
          && cell.closest('.ag-center-cols-viewport, .ag-center-cols-container, .ag-center-cols-clipper'));
        const rawRect = (rect && typeof rect === 'object') ? rect : cell.getBoundingClientRect?.();
        if(!rawRect || rawRect.width <= 0 || rawRect.height <= 0){
          return;
        }
        // Pinned/floating cells define visible boundaries by construction.
        // Apply occlusion-based suppression only for center-body cells.
        if(!isCenterCell){
          if(col === selection.from.col){
            visible.left = true;
          }
          if(col === selection.to.col){
            visible.right = true;
          }
          if(row === selection.from.row){
            visible.top = true;
          }
          if(row === selection.to.row){
            visible.bottom = true;
          }
          return;
        }
        const visibleRect = resolveVisibleCellRect(cell, rawRect, visibilityContext);
        if(!visibleRect){
          return;
        }
        if(col === selection.from.col && !isEdgeClipped(visibleRect.left, rawRect.left, 'left')){
          visible.left = true;
        }
        if(col === selection.to.col && !isEdgeClipped(visibleRect.right, rawRect.right, 'right')){
          visible.right = true;
        }
        if(row === selection.from.row && !isEdgeClipped(visibleRect.top, rawRect.top, 'top')){
          visible.top = true;
        }
        if(row === selection.to.row && !isEdgeClipped(visibleRect.bottom, rawRect.bottom, 'bottom')){
          visible.bottom = true;
        }
      };
      forEachRenderedCellInRange(selection, (cell, row, col)=>{
        const rect = cell.getBoundingClientRect();
        markVisibleFromCell(cell, row, col, rect);
      });
      const startCell = options.startCell;
      const endCell = options.endCell;
      const startRectRaw = options.startRectRaw;
      const endRectRaw = options.endRectRaw;
      if((!visible.left || !visible.top) && startCell){
        markVisibleFromCell(startCell, selection.from.row, selection.from.col, startRectRaw);
      }
      if((!visible.right || !visible.bottom) && endCell){
        markVisibleFromCell(endCell, selection.to.row, selection.to.col, endRectRaw);
      }
      return visible;
    };

    const resolveRangeOutlinePlacement = (selection, visibilityContext, hostRect)=>{
      const normalized = normalizeRange(selection);
      if(!normalized || !hostRect){
        return null;
      }
      const startCell = resolveFillHandleCell(normalized.from.row, normalized.from.col);
      const endCell = resolveFillHandleCell(normalized.to.row, normalized.to.col);
      const startRectRaw = startCell?.getBoundingClientRect?.() || null;
      const endRectRaw = endCell?.getBoundingClientRect?.() || null;
      const startRect = resolveVisibleCellRect(startCell, startRectRaw, visibilityContext);
      const endRect = resolveVisibleCellRect(endCell, endRectRaw, visibilityContext);
      let bounds = null;
      if(startRect && endRect){
        bounds = {
          left: Math.min(startRect.left, endRect.left),
          top: Math.min(startRect.top, endRect.top),
          right: Math.max(startRect.right, endRect.right),
          bottom: Math.max(startRect.bottom, endRect.bottom)
        };
      }else{
        bounds = resolveVisibleRangeBounds(normalized, visibilityContext);
      }
      if(!bounds){
        return null;
      }
      const isNodeInPinnedLeft = (node)=>!!(node && typeof node.closest === 'function'
        && node.closest('.ag-pinned-left, .ag-pinned-left-header, .ag-pinned-left-header-viewport, .ag-pinned-left-cols-viewport, .ag-pinned-left-cols-container'));
      const isNodeInPinnedTop = (node)=>!!(node && typeof node.closest === 'function'
        && node.closest('.ag-pinned-top, .ag-floating-top, .ag-pinned-top-viewport, .ag-floating-top-viewport'));
      const selectionInsidePinnedLeft = isNodeInPinnedLeft(startCell) && isNodeInPinnedLeft(endCell);
      const selectionInsidePinnedTop = isNodeInPinnedTop(startCell) && isNodeInPinnedTop(endCell);
      const selectionIncludesPinnedDataColumn = !!(pinFirstDataColumn
        && Number.isInteger(normalized.from?.col)
        && Number.isInteger(normalized.to?.col)
        && normalized.from.col <= 0
        && normalized.to.col >= 0);
      const selectionIncludesPinnedTopRow = !!(usePinnedRows
        && Number.isInteger(normalized.from?.row)
        && Number.isInteger(normalized.to?.row)
        && normalized.from.row >= 0
        && normalized.from.row < pinRowCount
        && normalized.to.row >= normalized.from.row);
      let left = bounds.left - hostRect.left - 1;
      let top = bounds.top - hostRect.top - 1;
      let right = bounds.right - hostRect.left + 1;
      let bottom = bounds.bottom - hostRect.top + 1;
      // Pinned containers clip outside-paint aggressively; keep outline edges
      // inside their real cell bounds so top/side borders remain visible.
      if(selectionInsidePinnedLeft){
        left = Math.max(left, bounds.left - hostRect.left);
        right = Math.min(right, bounds.right - hostRect.left);
      }
      if(selectionInsidePinnedTop){
        top = Math.max(top, bounds.top - hostRect.top);
        bottom = Math.min(bottom, bounds.bottom - hostRect.top);
      }
      // Keep first pinned data-column selections out of row-header space.
      if(selectionIncludesPinnedDataColumn){
        left = Math.max(left, bounds.left - hostRect.left);
      }
      // Keep mixed pinned-row/body selections out of column-header space.
      if(selectionIncludesPinnedTopRow){
        top = Math.max(top, bounds.top - hostRect.top);
      }
      const width = Math.max(0, right - left);
      const height = Math.max(0, bottom - top);
      if(width <= 0 || height <= 0){
        return null;
      }
      const isPinnedSelectionRange = !!(usePinnedRows
        && Number.isInteger(normalized.from?.row)
        && normalized.from.row >= 0
        && normalized.from.row < pinRowCount);
      const shouldOverlayPinnedLeft = selectionInsidePinnedLeft || selectionIncludesPinnedDataColumn;
      const edgeVisibility = resolveRangeOutlineEdgeVisibility(normalized, visibilityContext, {
        startCell,
        endCell,
        startRectRaw,
        endRectRaw
      });
      const bodySelectionClippedUnderPinnedTop = !!(usePinnedRows
        && !isPinnedSelectionRange
        && edgeVisibility.top === false);
      return {
        left,
        top,
        width,
        height,
        edgeVisibility,
        zIndex: isPinnedSelectionRange
          ? '9'
          : (bodySelectionClippedUnderPinnedTop ? '2' : (shouldOverlayPinnedLeft ? '7' : '5'))
      };
    };

    const updateSelectionOutlinePosition = ()=>{
      const selection = getEffectiveSelectionRange();
      if(!selection || shouldSuppressLiveSelectionChrome()){
        hideSelectionOutline();
        return false;
      }
      const outline = ensureSelectionOutline();
      if(!outline){
        return false;
      }
      const hostRect = container?.getBoundingClientRect?.();
      if(!hostRect){
        hideSelectionOutline();
        return false;
      }
      const visibilityContext = resolveSelectionVisibilityContext();
      const placement = resolveRangeOutlinePlacement(selection, visibilityContext, hostRect);
      if(!placement){
        hideSelectionOutline();
        return false;
      }
      const outlineColor = 'var(--hot-selection-outline-color, #005fb8)';
      outline.style.display = 'block';
      outline.style.left = `${placement.left}px`;
      outline.style.top = `${placement.top}px`;
      outline.style.width = `${placement.width}px`;
      outline.style.height = `${placement.height}px`;
      outline.style.borderLeftColor = placement.edgeVisibility.left ? outlineColor : 'transparent';
      outline.style.borderRightColor = placement.edgeVisibility.right ? outlineColor : 'transparent';
      outline.style.borderTopColor = placement.edgeVisibility.top ? outlineColor : 'transparent';
      outline.style.borderBottomColor = placement.edgeVisibility.bottom ? outlineColor : 'transparent';
      outline.style.zIndex = placement.zIndex;
      return true;
    };

    const updateClipboardOutlinePosition = ()=>{
      if(!hasClipboardOutline()){
        hideClipboardOutlines();
        return false;
      }
      const hostRect = container?.getBoundingClientRect?.();
      if(!hostRect){
        hideClipboardOutlines();
        return false;
      }
      const visibilityContext = resolveSelectionVisibilityContext();
      for(let i = 0; i < normalizedClipboardOutlineRanges.length; i += 1){
        const range = normalizedClipboardOutlineRanges[i];
        const outline = ensureClipboardOutline(i);
        if(!outline){
          continue;
        }
        const placement = resolveRangeOutlinePlacement(range, visibilityContext, hostRect);
        if(!placement){
          hideClipboardOutline(outline);
          continue;
        }
        outline.style.display = 'block';
        outline.style.left = `${placement.left}px`;
        outline.style.top = `${placement.top}px`;
        outline.style.width = `${placement.width}px`;
        outline.style.height = `${placement.height}px`;
        outline.style.zIndex = placement.zIndex;
        outline.dataset.mode = clipboardOutlineState?.mode === 'cut' ? 'cut' : 'copy';
        const edges = outline.querySelectorAll('.hot-clipboard-outline-edge');
        for(let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1){
          const edge = edges[edgeIndex];
          const edgeName = edge?.dataset?.edge;
          edge.style.display = placement.edgeVisibility[edgeName] ? 'block' : 'none';
        }
      }
      for(let i = normalizedClipboardOutlineRanges.length; i < clipboardOutlines.length; i += 1){
        hideClipboardOutline(clipboardOutlines[i]);
      }
      return true;
    };

    const updateFillHandlePosition = (reason)=>{
      updateClipboardOutlinePosition();
      const selection = getEffectiveSelectionRange();
      if(!selection){
        hideFillHandle();
        hideSelectionOutline();
        return;
      }
      if(shouldSuppressLiveSelectionChrome()){
        hideFillHandle();
        hideSelectionOutline();
        return;
      }
      updateSelectionOutlinePosition();
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
      let handleWidth = 8;
      let handleHeight = 8;
      const handleDoc = handle.ownerDocument || document;
      const handleWin = handleDoc.defaultView || global;
      if(handleWin && typeof handleWin.getComputedStyle === 'function'){
        try{
          const handleStyle = handleWin.getComputedStyle(handle);
          const styleWidth = Number.parseFloat(handleStyle?.width);
          const styleHeight = Number.parseFloat(handleStyle?.height);
          if(Number.isFinite(styleWidth) && styleWidth > 0){
            handleWidth = styleWidth;
          }
          if(Number.isFinite(styleHeight) && styleHeight > 0){
            handleHeight = styleHeight;
          }
        }catch(styleErr){
          // best-effort size read
        }
      }
      if(Number.isFinite(handle?.offsetWidth) && handle.offsetWidth > 0){
        handleWidth = handle.offsetWidth;
      }
      if(Number.isFinite(handle?.offsetHeight) && handle.offsetHeight > 0){
        handleHeight = handle.offsetHeight;
      }
      const isPinnedSelectionRow = !!(usePinnedRows && Number.isInteger(selection.to.row) && selection.to.row >= 0 && selection.to.row < pinRowCount);
      const visibilityContext = resolveSelectionVisibilityContext();
      const visibleCellRect = resolveVisibleCellRect(cell, cellRect, visibilityContext);
      const bodySelectionClippedUnderPinnedTop = !!(usePinnedRows
        && !isPinnedSelectionRow
        && visibleCellRect
        && (visibleCellRect.top - cellRect.top) > 1.5);
      const viewport = resolveFillHandleViewport(cell, { preferPinnedTop: isPinnedSelectionRow });
      if(viewport && typeof viewport.getBoundingClientRect === 'function'){
        const viewportRect = viewport.getBoundingClientRect();
        const markerRect = {
          left: cellRect.right - (handleWidth / 2),
          top: cellRect.bottom - (handleHeight / 2),
          right: cellRect.right + (handleWidth / 2),
          bottom: cellRect.bottom + (handleHeight / 2)
        };
        const edgeTolerance = isPinnedSelectionRow ? Math.max(2, handleWidth / 2) : Math.max(0.5, handleWidth / 2);
        const markerInsideViewport = markerRect.left >= (viewportRect.left - edgeTolerance)
          && markerRect.right <= (viewportRect.right + edgeTolerance)
          && markerRect.top >= (viewportRect.top - edgeTolerance)
          && markerRect.bottom <= (viewportRect.bottom + edgeTolerance);
        let allowHandle = markerInsideViewport;
        if(!allowHandle && isPinnedSelectionRow){
          // Pinned/floating top sections often clip by 1px at container seams.
          // Keep the handle visible when its anchor corner is still inside.
          const centerTolerance = Math.max(1, Math.min(handleWidth, handleHeight) / 2);
          const anchorInsideViewport = cellRect.right >= (viewportRect.left - centerTolerance)
            && cellRect.right <= (viewportRect.right + centerTolerance)
            && cellRect.bottom >= (viewportRect.top - centerTolerance)
            && cellRect.bottom <= (viewportRect.bottom + centerTolerance);
          if(anchorInsideViewport){
            allowHandle = true;
          }
        }
        if(!allowHandle){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot fill handle hidden (marker overlaps viewport boundary)', {
              debugLabel,
              markerRect,
              handleWidth,
              handleHeight,
              viewportLeft: viewportRect.left,
              viewportRight: viewportRect.right,
              viewportTop: viewportRect.top,
              viewportBottom: viewportRect.bottom
            });
          }
          hideFillHandle();
          return;
        }
      }
      const isPinnedLeftSelectionCell = !!(cell && typeof cell.closest === 'function'
        && cell.closest('.ag-pinned-left, .ag-pinned-left-cols-viewport, .ag-pinned-left-cols-container, .ag-pinned-left-floating-top'));
      // Keep handle above pinned top rows only when the selection itself is pinned.
      // For pinned-left selections, lift it just above the pinned column so the
      // resize square is not obscured by the adjacent body cell below.
      // Other body selections keep the lower z-index so pinned-row masks overlap naturally.
      handle.style.zIndex = isPinnedSelectionRow
        ? '12'
        : ((isPinnedLeftSelectionCell && !bodySelectionClippedUnderPinnedTop) ? '7' : '2');
      if(handle.dataset){
        if(isPinnedSelectionRow){
          handle.dataset.pinnedSelection = '1';
        }else{
          delete handle.dataset.pinnedSelection;
        }
        if(isPinnedLeftSelectionCell){
          handle.dataset.pinnedLeftSelection = '1';
        }else{
          delete handle.dataset.pinnedLeftSelection;
        }
      }
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot fill handle layer', {
          debugLabel,
          pinnedSelection: isPinnedSelectionRow,
          pinnedLeftSelection: isPinnedLeftSelectionCell,
          clippedUnderPinnedTop: bodySelectionClippedUnderPinnedTop,
          zIndex: handle.style.zIndex
        });
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

    const isFormulaLikeValue = value=>typeof value === 'string' && value.trim().startsWith('=');

    const resolveSeedPatternIndex = (direction, sequenceLength, outputIndex)=>{
      const len = Math.max(0, Number(sequenceLength) || 0);
      const idx = Math.max(0, Number(outputIndex) || 0);
      if(len <= 0){
        return 0;
      }
      if(direction === 'up' || direction === 'left'){
        return (len - 1 - (idx % len) + len) % len;
      }
      return idx % len;
    };

    const shiftFormulaForFill = (value, rowDelta, colDelta)=>{
      if(!isFormulaLikeValue(value)){
        return normalizeFillValue(value);
      }
      const formulaNS = Shared.formulaEngine || {};
      if(typeof formulaNS.shiftFormulaReferences === 'function'){
        try{
          const shifted = formulaNS.shiftFormulaReferences(value, { rowDelta, colDelta });
          if(typeof shifted === 'string' && shifted.trim().startsWith('=')){
            return shifted;
          }
        }catch(err){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot formula fill shift failed', {
              debugLabel,
              rowDelta,
              colDelta,
              message: err?.message || String(err)
            });
          }
        }
      }
      return normalizeFillValue(value);
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
          const hasFormulaSeed = seedSequence.some(isFormulaLikeValue);
          const seedLength = seedSequence.length;
          for(let i = 0; i < targetRows.length; i++){
            let nextValue = fillValues[i];
            if(hasFormulaSeed && seedLength > 0){
              const seedIndex = resolveSeedPatternIndex(direction, seedLength, i);
              const sourceRow = selection.from.row + seedIndex;
              const sourceValue = seedSequence[seedIndex];
              if(isFormulaLikeValue(sourceValue)){
                nextValue = shiftFormulaForFill(sourceValue, targetRows[i] - sourceRow, 0);
              }
            }
            changes.push([targetRows[i], c, nextValue]);
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
          const hasFormulaSeed = seedSequence.some(isFormulaLikeValue);
          const seedLength = seedSequence.length;
          for(let i = 0; i < targetCols.length; i++){
            let nextValue = fillValues[i];
            if(hasFormulaSeed && seedLength > 0){
              const seedIndex = resolveSeedPatternIndex(direction, seedLength, i);
              const sourceCol = selection.from.col + seedIndex;
              const sourceValue = seedSequence[seedIndex];
              if(isFormulaLikeValue(sourceValue)){
                nextValue = shiftFormulaForFill(sourceValue, 0, targetCols[i] - sourceCol);
              }
            }
            changes.push([r, targetCols[i], nextValue]);
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

    const collectFillDownChangesForRows = (selection, targetRows)=>{
      if(!selection || !Array.isArray(targetRows) || !targetRows.length){
        return [];
      }
      const changes = [];
      for(let c = selection.from.col; c <= selection.to.col; c++){
        const seedSequence = getSeedSequenceForColumn(selection, c);
        const fillValues = computeFillValues(seedSequence, 'down', targetRows.length);
        const hasFormulaSeed = seedSequence.some(isFormulaLikeValue);
        const seedLength = seedSequence.length;
        for(let i = 0; i < targetRows.length; i++){
          let nextValue = fillValues[i];
          if(hasFormulaSeed && seedLength > 0){
            const seedIndex = resolveSeedPatternIndex('down', seedLength, i);
            const sourceRow = selection.from.row + seedIndex;
            const sourceValue = seedSequence[seedIndex];
            if(isFormulaLikeValue(sourceValue)){
              nextValue = shiftFormulaForFill(sourceValue, targetRows[i] - sourceRow, 0);
            }
          }
          changes.push([targetRows[i], c, nextValue]);
        }
      }
      return changes;
    };

    const parseA1LooseForAutoFill = (token, a1RowOffset)=>{
      const normalized = String(token == null ? '' : token).trim().toUpperCase().replace(/\$/g, '');
      const match = normalized.match(/^([A-Z]+)(\d+)$/);
      if(!match){
        return null;
      }
      const letters = match[1];
      let col = 0;
      for(let i = 0; i < letters.length; i += 1){
        col = (col * 26) + (letters.charCodeAt(i) - 64);
      }
      col -= 1;
      const row = Number(match[2]) - 1 + a1RowOffset;
      if(!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0){
        return null;
      }
      return { row, col };
    };

    const extractFormulaReferenceRangesForAutoFill = (formulaValue, cache)=>{
      const key = String(formulaValue == null ? '' : formulaValue);
      const memo = cache instanceof Map ? cache : null;
      if(memo && memo.has(key)){
        return memo.get(key);
      }
      const formulaNS = Shared.formulaEngine || {};
      const a1RowOffset = Math.max(0, Number(getFormulaA1RowOffset()) || 0);
      let ranges = [];
      if(typeof formulaNS.extractReferences === 'function'){
        try{
          const extracted = formulaNS.extractReferences(key, { a1RowOffset });
          if(Array.isArray(extracted) && extracted.length){
            ranges = extracted
              .map(item => ({
                start: item?.start || null,
                end: item?.end || null
              }))
              .filter(item => item.start && item.end);
          }
        }catch(err){
          ranges = [];
        }
      }
      if(!ranges.length){
        const tokenRe = /\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?/g;
        const fallback = [];
        let match;
        while((match = tokenRe.exec(key)) !== null){
          const token = String(match[0] || '');
          if(!token){
            continue;
          }
          const parts = token.split(':');
          const start = parseA1LooseForAutoFill(parts[0], a1RowOffset);
          const end = parseA1LooseForAutoFill(parts[1] || parts[0], a1RowOffset);
          if(start && end){
            fallback.push({ start, end });
          }
        }
        ranges = fallback;
      }
      if(memo){
        memo.set(key, ranges);
      }
      return ranges;
    };

    const isFormulaReferenceRangePopulatedForAutoFill = (range)=>{
      if(!range?.start || !range?.end){
        return false;
      }
      const minRow = Math.min(range.start.row, range.end.row);
      const maxRow = Math.max(range.start.row, range.end.row);
      const minCol = Math.min(range.start.col, range.end.col);
      const maxCol = Math.max(range.start.col, range.end.col);
      for(let row = minRow; row <= maxRow; row += 1){
        for(let col = minCol; col <= maxCol; col += 1){
          const value = typeof instance.__hotGetDisplayDataAtCell === 'function'
            ? instance.__hotGetDisplayDataAtCell(row, col)
            : instance.getDataAtCell(row, col);
          if(!isMeaningfulValue(value)){
            return false;
          }
        }
      }
      return true;
    };

    const resolveFillHandleAutoFillDownTargetRow = (selection)=>{
      if(!selection){
        return null;
      }
      const visualRowCount = Math.max(0, Number(getVisualRowCount()) || 0);
      if(visualRowCount <= 0 || selection.to.row >= (visualRowCount - 1)){
        return null;
      }
      const formulaRangeCache = new Map();
      let hasReferenceDrivenFormula = false;
      for(let c = selection.from.col; c <= selection.to.col; c += 1){
        const seedSequence = getSeedSequenceForColumn(selection, c);
        for(let i = 0; i < seedSequence.length; i += 1){
          const seedValue = seedSequence[i];
          if(!isFormulaLikeValue(seedValue)){
            continue;
          }
          const ranges = extractFormulaReferenceRangesForAutoFill(seedValue, formulaRangeCache);
          if(Array.isArray(ranges) && ranges.length){
            hasReferenceDrivenFormula = true;
            break;
          }
        }
        if(hasReferenceDrivenFormula){
          break;
        }
      }
      if(!hasReferenceDrivenFormula){
        return null;
      }
      let targetEndRow = selection.to.row;
      for(let targetRow = selection.to.row + 1; targetRow < visualRowCount; targetRow += 1){
        const targetOffset = targetRow - (selection.to.row + 1);
        let canFillRow = true;
        for(let c = selection.from.col; c <= selection.to.col; c += 1){
          const seedSequence = getSeedSequenceForColumn(selection, c);
          const seedLength = seedSequence.length;
          if(seedLength <= 0){
            continue;
          }
          const hasFormulaSeed = seedSequence.some(isFormulaLikeValue);
          if(!hasFormulaSeed){
            continue;
          }
          const seedIndex = resolveSeedPatternIndex('down', seedLength, targetOffset);
          const sourceRow = selection.from.row + seedIndex;
          const sourceValue = seedSequence[seedIndex];
          if(!isFormulaLikeValue(sourceValue)){
            continue;
          }
          const shiftedFormula = shiftFormulaForFill(sourceValue, targetRow - sourceRow, 0);
          const ranges = extractFormulaReferenceRangesForAutoFill(shiftedFormula, formulaRangeCache);
          for(let i = 0; i < ranges.length; i += 1){
            if(!isFormulaReferenceRangePopulatedForAutoFill(ranges[i])){
              canFillRow = false;
              break;
            }
          }
          if(!canFillRow){
            break;
          }
        }
        if(!canFillRow){
          break;
        }
        targetEndRow = targetRow;
      }
      return targetEndRow > selection.to.row ? targetEndRow : null;
    };

    const applyFillHandleDoubleClickAutoFill = ()=>{
      const selection = getEffectiveSelectionRange();
      if(!selection){
        return false;
      }
      const targetEndRow = resolveFillHandleAutoFillDownTargetRow(selection);
      if(!Number.isInteger(targetEndRow) || targetEndRow <= selection.to.row){
        return false;
      }
      const targetRows = [];
      for(let row = selection.to.row + 1; row <= targetEndRow; row += 1){
        targetRows.push(row);
      }
      const changes = collectFillDownChangesForRows(selection, targetRows);
      if(!changes.length){
        return false;
      }
      instance.setDataAtCell(changes, 'fill:auto');
      const nextSelection = {
        from: { row: selection.from.row, col: selection.from.col },
        to: { row: targetEndRow, col: selection.to.col }
      };
      setLastRange(nextSelection);
      renderAg(instance.gridApi);
      fireHook('afterSelectionEnd', nextSelection.from.row, nextSelection.from.col, nextSelection.to.row, nextSelection.to.col);
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot fill handle auto-fill applied', {
          debugLabel,
          rowsFilled: targetRows.length,
          fromRow: selection.to.row + 1,
          toRow: targetEndRow
        });
      }
      return true;
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
      const selection = getEffectiveSelectionRange();
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
    let formulaReferenceDragState = null;
    let formulaReferenceDragLastPointer = null;
    let formulaReferenceAutoScrollRafId = null;
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
    let headerDragStartPointer = null;
    let suppressNextHeaderLabelClickSelection = false;
    let isColumnHandleDragging = false;
    let columnHandleDragColIds = null;
    let columnHandleLastTargetIndex = null;
    let pendingColumnHandleMoveIndex = null;
    let columnHandleMoveRafPending = false;
    let pendingDeferredColumnMoveCommitId = null;
    const MAX_DEFERRED_COLUMN_MOVE_COMMIT_ATTEMPTS = 8;
    let suppressColumnMoveCommitDepth = 0;
    let clearSortSelectionGuard = ()=>{};
    let armSortSelectionSnapshot = ()=>{};
    let restoreSortSelectionSnapshot = ()=>{};
    let pendingSortSelectionSnapshot = null;
    let suppressApiSelectionSyncForSort = false;
    let sortSelectionGuardTimerId = null;
    let isApplyingSortSelectionSnapshot = false;

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
    const DEFAULT_LOAD_DATA_UNDO_MAX_CELLS = 12000;
    const loadDataUndoMaxCells = Number.isFinite(overrides?.loadDataUndoMaxCells)
      ? Math.max(0, Number(overrides.loadDataUndoMaxCells))
      : DEFAULT_LOAD_DATA_UNDO_MAX_CELLS;
    let undoStack = [];
    let undoPointer = -1;
    let undoLockDepth = 0;
    let undoStepSeq = 0;

    let lockedMutationChangeCapture = null;
    if(!Object.prototype.hasOwnProperty.call(hotNS, '__pendingClipboardMove')){
      hotNS.__pendingClipboardMove = null;
    }

    const withUndoLock = (phase, fn)=>{
      undoLockDepth += 1;
      try{
        return typeof fn === 'function' ? fn() : undefined;
      }finally{
        undoLockDepth = Math.max(0, undoLockDepth - 1);
      }
    };

    const cloneMatrix = (matrix)=>{
      if(!Array.isArray(matrix)){
        return [];
      }
      const cloned = new Array(matrix.length);
      for(let r = 0; r < matrix.length; r++){
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        cloned[r] = row.slice();
      }
      return cloned;
    };

    const normalizeExclusionIndices = (indices)=>{
      if(!Array.isArray(indices)){
        return [];
      }
      return indices
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value >= 0)
        .sort((a, b)=>a - b);
    };

    const normalizeExclusionCells = (cells)=>{
      if(!Array.isArray(cells)){
        return [];
      }
      const normalized = [];
      for(let i = 0; i < cells.length; i++){
        const cell = cells[i];
        const row = Number(cell?.row ?? cell?.[0]);
        const col = Number(cell?.col ?? cell?.[1]);
        if(!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0){
          continue;
        }
        normalized.push({ row, col });
      }
      normalized.sort((a, b)=>{
        if(a.row !== b.row){
          return a.row - b.row;
        }
        return a.col - b.col;
      });
      return normalized;
    };

    const cloneExclusionState = (state)=>{
      const normalized = state && typeof state === 'object' ? state : {};
      return {
        rows: normalizeExclusionIndices(normalized.rows),
        cols: normalizeExclusionIndices(normalized.cols),
        cells: normalizeExclusionCells(normalized.cells)
      };
    };

    const normalizeLoadDataOptions = (options)=>{
      const normalized = {
        source: 'loadData',
        recordUndo: false,
        skipUndo: false,
        undoLabel: null,
        maxUndoCells: loadDataUndoMaxCells
      };
      if(typeof options === 'string' && options.trim()){
        normalized.source = options.trim();
        return normalized;
      }
      if(!options || typeof options !== 'object'){
        return normalized;
      }
      if(typeof options.source === 'string' && options.source.trim()){
        normalized.source = options.source.trim();
      }
      if(options.recordUndo === true){
        normalized.recordUndo = true;
      }
      if(options.skipUndo === true){
        normalized.skipUndo = true;
      }
      if(typeof options.undoLabel === 'string' && options.undoLabel.trim()){
        normalized.undoLabel = options.undoLabel.trim();
      }
      if(Number.isFinite(options.maxUndoCells)){
        normalized.maxUndoCells = Math.max(0, Number(options.maxUndoCells));
      }
      return normalized;
    };

    const composePhysicalChanges = (changeGroups)=>{
      const composed = new Map();
      const groups = Array.isArray(changeGroups) ? changeGroups : [changeGroups];
      for(let groupIndex = 0; groupIndex < groups.length; groupIndex += 1){
        const group = Array.isArray(groups[groupIndex]) ? groups[groupIndex] : [];
        for(let changeIndex = 0; changeIndex < group.length; changeIndex += 1){
          const change = group[changeIndex];
          if(!change){
            continue;
          }
          const row = Number(change.row);
          const col = Number(change.col);
          if(!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0){
            continue;
          }
          const key = `${row}:${col}`;
          const prev = change.prev;
          const next = change.next;
          if(!composed.has(key)){
            if(valuesMatchForChange(prev, next)){
              continue;
            }
            composed.set(key, { row, col, prev, next });
            continue;
          }
          const existing = composed.get(key);
          existing.next = next;
          if(valuesMatchForChange(existing.prev, existing.next)){
            composed.delete(key);
          }
        }
      }
      return Array.from(composed.values());
    };

    const captureLockedMutationChanges = (changes)=>{
      if(!Array.isArray(lockedMutationChangeCapture) || !Array.isArray(changes) || !changes.length){
        return;
      }
      for(let i = 0; i < changes.length; i += 1){
        const entry = changes[i];
        if(!Array.isArray(entry)){
          continue;
        }
        lockedMutationChangeCapture.push(entry.slice());
      }
    };

    const captureLockedMutationChangesDuring = (fn)=>{
      const previousCapture = lockedMutationChangeCapture;
      const captured = [];
      lockedMutationChangeCapture = captured;
      try{
        if(typeof fn === 'function'){
          fn();
        }
      }finally{
        lockedMutationChangeCapture = previousCapture;
      }
      return captured;
    };

    const areMatricesEqual = (left, right)=>{
      if(left === right){
        return true;
      }
      if(!Array.isArray(left) || !Array.isArray(right)){
        return false;
      }
      if(left.length !== right.length){
        return false;
      }
      for(let r = 0; r < left.length; r++){
        const leftRow = Array.isArray(left[r]) ? left[r] : [];
        const rightRow = Array.isArray(right[r]) ? right[r] : [];
        if(leftRow.length !== rightRow.length){
          return false;
        }
        for(let c = 0; c < leftRow.length; c++){
          if(!valuesMatchForChange(leftRow[c], rightRow[c])){
            return false;
          }
        }
      }
      return true;
    };

    const areExclusionStatesEqual = (left, right)=>{
      const a = cloneExclusionState(left);
      const b = cloneExclusionState(right);
      if(a.rows.length !== b.rows.length || a.cols.length !== b.cols.length || a.cells.length !== b.cells.length){
        return false;
      }
      for(let i = 0; i < a.rows.length; i++){
        if(a.rows[i] !== b.rows[i]){
          return false;
        }
      }
      for(let i = 0; i < a.cols.length; i++){
        if(a.cols[i] !== b.cols[i]){
          return false;
        }
      }
      for(let i = 0; i < a.cells.length; i++){
        if(a.cells[i].row !== b.cells[i].row || a.cells[i].col !== b.cells[i].col){
          return false;
        }
      }
      return true;
    };

    const areLoadDataSnapshotsEqual = (beforeSnapshot, afterSnapshot)=>{
      if(!beforeSnapshot || !afterSnapshot){
        return false;
      }
      if(beforeSnapshot.kind !== 'full' || afterSnapshot.kind !== 'full'){
        return false;
      }
      if(beforeSnapshot.rowCount !== afterSnapshot.rowCount || beforeSnapshot.colCount !== afterSnapshot.colCount){
        return false;
      }
      if(!areMatricesEqual(beforeSnapshot.data, afterSnapshot.data)){
        return false;
      }
      if(!areExclusionStatesEqual(beforeSnapshot.exclusions, afterSnapshot.exclusions)){
        return false;
      }
      return areFilterStatesEqual(beforeSnapshot.filters, afterSnapshot.filters);
    };

    const captureLoadDataUndoSnapshot = (maxCells)=>{
      const snapshotLimit = Number.isFinite(maxCells)
        ? Math.max(0, Number(maxCells))
        : loadDataUndoMaxCells;
      const matrix = dataHandle.current;
      const shape = getMatrixShape(matrix);
      const totalCells = Math.max(0, shape.rows * Math.max(shape.cols, colCount));
      if(snapshotLimit > 0 && totalCells > snapshotLimit){
        return {
          kind: 'degraded',
          rowCount,
          colCount,
          rows: shape.rows,
          cols: Math.max(shape.cols, colCount),
          totalCells,
          maxCells: snapshotLimit
        };
      }
      return {
        kind: 'full',
        rowCount,
        colCount,
        data: cloneMatrix(matrix),
        exclusions: cloneExclusionState(exclusionController.exportState()),
        filters: cloneFilterState(exportActiveFilterState())
      };
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
      let formulaSynchronized = false;
      if(formulaEvaluationState.enabled){
        const model = ensureFormulaModelCurrent('apply-physical-changes');
        if(model){
          try{
            for(let i = 0; i < list.length; i += 1){
              const change = list[i];
              if(!change){
                continue;
              }
              const row = Number(change.row);
              const col = Number(change.col);
              if(!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0){
                continue;
              }
              model.setCellRaw(row, col, direction === 'undo' ? change.prev : change.next);
            }
            formulaEvaluationState.dirty = false;
            formulaSynchronized = true;
          }catch(err){
            formulaSynchronized = false;
          }
        }
        if(!formulaSynchronized){
          markFormulaModelDirty('apply-physical-changes');
        }
      }
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

    const invalidatePendingClipboardMove = (reason, matcher)=>{
      const pending = hotNS.__pendingClipboardMove;
      if(!pending){
        return false;
      }
      if(typeof matcher === 'function' && !matcher(pending)){
        return false;
      }
      hotNS.__pendingClipboardMove = null;
      if(pending.step && pending.step.pendingClipboardMove){
        pending.step.pendingClipboardMove = false;
      }
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot pending clipboard move invalidated', {
          debugLabel,
          reason: reason || null
        });
      }
      return true;
    };

    const applyUndoStep = (step, direction)=>{
      if(!step){
        return false;
      }
      const operations = Array.isArray(step.operations) && step.operations.length
        ? step.operations
        : [{ apply: applyPhysicalChanges, changes: step.changes }];
      let applied = false;
      for(let i = 0; i < operations.length; i += 1){
        const operation = operations[i];
        const safeChanges = composePhysicalChanges([operation?.changes]);
        if(!safeChanges.length){
          continue;
        }
        const applyOperation = typeof operation?.apply === 'function'
          ? operation.apply
          : applyPhysicalChanges;
        applyOperation(safeChanges, direction, `UndoRedo.${direction}`);
        applied = true;
      }
      return applied;
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
        invalidatePendingClipboardMove(`undo:${step?.label || id}`, pending => pending?.step?.id === step?.id);
        withUndoLock('undo', ()=>{
          applyUndoStep(step, 'undo');
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
      invalidatePendingClipboardMove(`redo:${step?.label || id}`, pending => pending?.step?.id === step?.id);
      withUndoLock('redo', ()=>{
        applyUndoStep(step, 'redo');
      });
      undoPointer += 1;
      return true;
    };

    const pushUndoStep = (label, physicalChanges, options = {})=>{
      const safeChanges = composePhysicalChanges([physicalChanges]);
      const safeOperations = Array.isArray(options.operations)
        ? options.operations
          .map(operation=>{
            const operationChanges = composePhysicalChanges([operation?.changes]);
            if(!operationChanges.length){
              return null;
            }
            return {
              apply: typeof operation?.apply === 'function' ? operation.apply : applyPhysicalChanges,
              changes: operationChanges
            };
          })
          .filter(Boolean)
        : [];
      if(!safeChanges.length && !safeOperations.length){
        return;
      }
      if(options.preservePendingClipboardMove !== true){
        invalidatePendingClipboardMove(options.invalidateReason || label || 'pushUndoStep');
      }
      if(undoPointer < undoStack.length - 1){
        undoStack = undoStack.slice(0, undoPointer + 1);
      }
      const step = {
        id: ++undoStepSeq,
        label: label || `table:${debugLabel}:change`,
        changes: safeChanges
      };
      if(safeOperations.length){
        step.operations = safeOperations;
      }
      if(options.pendingClipboardMove === true){
        step.pendingClipboardMove = true;
      }
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
      return step;
    };

    const registerPendingClipboardMove = (clipboardText, sourceChanges)=>{
      const safeSourceChanges = composePhysicalChanges([sourceChanges]);
      if(!safeSourceChanges.length || !clipboardText){
        hotNS.__pendingClipboardMove = null;
        return null;
      }
      const step = pushUndoStep(`table:${debugLabel}:cut`, safeSourceChanges, {
        preservePendingClipboardMove: true,
        pendingClipboardMove: true,
        operations: [
          {
            apply: applyPhysicalChanges,
            changes: safeSourceChanges
          }
        ]
      });
      if(!step){
        hotNS.__pendingClipboardMove = null;
        return null;
      }
      const pending = {
        step,
        clipboardText,
        sourceChanges: safeSourceChanges,
        sourceInstance: instance,
        sourceDebugLabel: debugLabel,
        sourceApplyPhysicalChanges: applyPhysicalChanges
      };
      hotNS.__pendingClipboardMove = pending;
      return pending;
    };

    const getPendingClipboardMoveForPaste = (clipboardText)=>{
      const pending = hotNS.__pendingClipboardMove;
      if(!pending || !pending.step || pending.step.pendingClipboardMove !== true){
        return null;
      }
      if(!clipboardText || clipboardText !== pending.clipboardText){
        return null;
      }
      return pending;
    };

    const upgradePendingClipboardMoveForPaste = (pending, pastePhysicalChanges, targetApplyPhysicalChanges, targetLabel)=>{
      if(!pending || !pending.step){
        return false;
      }
      const step = pending.step;
      const sourceChanges = composePhysicalChanges([pending.sourceChanges]);
      const targetChanges = composePhysicalChanges([pastePhysicalChanges]);
      const sourceApply = typeof pending.sourceApplyPhysicalChanges === 'function'
        ? pending.sourceApplyPhysicalChanges
        : applyPhysicalChanges;
      const targetApply = typeof targetApplyPhysicalChanges === 'function'
        ? targetApplyPhysicalChanges
        : applyPhysicalChanges;
      const operations = [];
      if(sourceApply === targetApply){
        operations.push({
          apply: sourceApply,
          changes: composePhysicalChanges([sourceChanges, targetChanges])
        });
      }else{
        if(sourceChanges.length){
          operations.push({
            apply: sourceApply,
            changes: sourceChanges
          });
        }
        if(targetChanges.length){
          operations.push({
            apply: targetApply,
            changes: targetChanges
          });
        }
      }
      step.label = `table:${pending.sourceDebugLabel}:move`;
      step.pendingClipboardMove = false;
      step.clipboardMoveMerged = true;
      step.operations = operations;
      step.changes = operations.length === 1
        ? operations[0].changes.slice()
        : sourceChanges.slice();
      hotNS.__pendingClipboardMove = null;
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot clipboard move step upgraded for paste', {
          debugLabel,
          sourceDebugLabel: pending.sourceDebugLabel,
          targetDebugLabel: targetLabel || debugLabel,
          operationCount: operations.length
        });
      }
      return true;
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

    const applyLoadDataMatrix = (nextData, options = {})=>{
      const source = typeof options.source === 'string' && options.source ? options.source : 'loadData';
      const hasForcedRows = Number.isFinite(options.forceRowCount);
      const hasForcedCols = Number.isFinite(options.forceColCount);
      const hasForcedDims = hasForcedRows || hasForcedCols;
      const explicitExclusions = options.exclusionsState;
      const explicitFilters = options.filtersState;
      const existingExclusions = explicitExclusions
        ? null
        : (preserveExclusionsOnLoad ? exclusionController.exportState() : null);
      const existingFilters = explicitFilters
        ? EMPTY_FILTER_STATE
        : (preserveFiltersOnLoad ? cloneFilterState(exportActiveFilterState()) : EMPTY_FILTER_STATE);
      let incoming = Array.isArray(nextData) ? nextData : null;
      if(incoming && shrinkOnLoadData && !hasForcedDims){
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
      if(hasForcedRows){
        rowCount = Math.max(0, Number(options.forceRowCount) || 0);
      }
      if(hasForcedCols){
        colCount = Math.max(MIN_INPUT_COLS, Number(options.forceColCount) || MIN_INPUT_COLS);
      }
      data = incoming ? ensureDims(incoming, rowCount, colCount) : createEmptyData(rowCount, colCount);
      dataHandle.current = data;
      markFormulaModelDirty('load-data');
      colHeaders = resolveColHeaders(colCount);
      if(explicitExclusions && typeof explicitExclusions === 'object'){
        exclusionController.importState(cloneExclusionState(explicitExclusions));
      }else if(existingExclusions){
        exclusionController.importState(existingExclusions);
      }else{
        exclusionController.clearAll(true);
      }
      if(explicitFilters && typeof explicitFilters === 'object'){
        activeColumnFilters = new Map(Object.entries(cloneFilterState(explicitFilters).columns || {}));
      }else if(existingFilters && existingFilters !== EMPTY_FILTER_STATE){
        activeColumnFilters = new Map(Object.entries(existingFilters.columns || {}));
      }else{
        activeColumnFilters = new Map();
      }
      pruneActiveColumnFilters();
      rebuildCompiledColumnFilters();
      syncRowData(instance.gridApi);
      rebuildColumns(instance.gridApi);
      if(activeColumnFilters.size || compiledColumnFilters.size){
        notifyColumnFiltersChanged(source, { schedule: false });
      }else{
        dispatchFilterStateChanged(source);
      }
      recordCall('loadData', {
        containerId: container?.id || null,
        source,
        rows: data.length,
        firstRow: trimRow(Array.isArray(data[0]) ? data[0] : null)
      });
      fireHook('afterLoadData');
      if(scheduleOnLoadData){
        triggerSchedule('afterLoadData', { source });
      }
      pendingViewportRestore = null;
      scrollViewportToTop();
      setLastRange({ from: { row: 0, col: 0 }, to: { row: 0, col: 0 } });
      renderAg(instance.gridApi);
      return true;
    };

    const applyLoadDataUndoSnapshot = (snapshot, source)=>{
      if(!snapshot || snapshot.kind !== 'full'){
        return false;
      }
      return withUndoLock('loadDataSnapshot', ()=>applyLoadDataMatrix(
        cloneMatrix(snapshot.data),
        {
          source: typeof source === 'string' && source ? source : 'UndoRedo.loadData',
          forceRowCount: snapshot.rowCount,
          forceColCount: snapshot.colCount,
          exclusionsState: snapshot.exclusions,
          filtersState: snapshot.filters
        }
      )) !== false;
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
        console.warn('Shared.hot AG clipboard export skipped: selection too large', { debugLabel, totalCells, limit: MAX_CLIPBOARD_CELLS });
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

    const getSelectedHeaderColumnsSorted = ()=>{
      if(!selectedHeaderColumns.size){
        return [];
      }
      return Array.from(selectedHeaderColumns)
        .map(col => Number(col))
        .filter(col => Number.isInteger(col) && col >= 0 && col < colCount)
        .sort((a, b)=>a - b);
    };

    const resolveRowSpanForSelection = ()=>{
      const normalized = getEffectiveSelectionRange();
      if(normalized){
        return {
          startRow: normalized.from.row,
          endRow: normalized.to.row
        };
      }
      const lastRow = Math.max(0, getVisualRowCount() - 1);
      return { startRow: 0, endRow: lastRow };
    };

    const buildClipboardTextFromColumns = (columns, rowStart, rowEnd)=>{
      const sortedColumns = Array.isArray(columns)
        ? columns.filter(col => Number.isInteger(col) && col >= 0 && col < colCount).slice().sort((a, b)=>a - b)
        : [];
      if(!sortedColumns.length){
        return '';
      }
      const startRow = Number.isInteger(rowStart) ? Math.max(0, rowStart) : 0;
      const endRowResolved = Number.isInteger(rowEnd) ? Math.max(startRow, rowEnd) : startRow;
      const totalCells = (endRowResolved - startRow + 1) * sortedColumns.length;
      if(totalCells > MAX_CLIPBOARD_CELLS){
        console.warn('Shared.hot AG clipboard export skipped: selection too large', { debugLabel, totalCells, limit: MAX_CLIPBOARD_CELLS });
        return null;
      }
      const matrix = dataHandle.current;
      const lines = [];
      for(let visualRow = startRow; visualRow <= endRowResolved; visualRow += 1){
        const physicalRow = toPhysicalRowIndex(visualRow);
        const row = Number.isInteger(physicalRow) && Array.isArray(matrix[physicalRow]) ? matrix[physicalRow] : [];
        const values = sortedColumns.map(visualCol => {
          const physicalCol = toPhysicalColIndex(visualCol);
          const value = Number.isInteger(physicalCol) ? row[physicalCol] : null;
          return value == null ? '' : String(value);
        });
        lines.push(values.join('\t'));
      }
      return lines.join('\n');
    };

    const isContiguousColumnSelection = (columns)=>{
      if(!Array.isArray(columns) || !columns.length){
        return false;
      }
      for(let i = 1; i < columns.length; i += 1){
        if(columns[i] !== columns[i - 1] + 1){
          return false;
        }
      }
      return true;
    };

    const buildSelectionRangesFromColumns = (columns, rowStart, rowEnd)=>{
      if(!Array.isArray(columns) || !columns.length){
        return [];
      }
      const ranges = [];
      for(let i = 0; i < columns.length; i += 1){
        ranges.push({
          startRow: rowStart,
          startCol: columns[i],
          endRow: rowEnd,
          endCol: columns[i]
        });
      }
      return ranges;
    };

    const buildVisualClearChangesForColumns = (columns, rowStart, rowEnd)=>{
      if(!Array.isArray(columns) || !columns.length){
        return [];
      }
      const startRowResolved = Number.isInteger(rowStart) ? rowStart : 0;
      const endRowResolved = Number.isInteger(rowEnd) ? Math.max(startRowResolved, rowEnd) : startRowResolved;
      const changes = [];
      for(let r = startRowResolved; r <= endRowResolved; r += 1){
        for(let i = 0; i < columns.length; i += 1){
          changes.push([r, columns[i], '']);
        }
      }
      return changes;
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

    const fireAfterCopy = (normalizedOrRanges)=>{
      if(Array.isArray(normalizedOrRanges)){
        if(normalizedOrRanges.length){
          fireHook('afterCopy', null, normalizedOrRanges);
        }
        return;
      }
      const normalized = normalizeRange(normalizedOrRanges);
      if(!normalized){
        return;
      }
      fireHook('afterCopy', null, [{
        startRow: normalized.from.row,
        startCol: normalized.from.col,
        endRow: normalized.to.row,
        endCol: normalized.to.col
      }]);
    };

    const copySelectionToClipboard = async ()=>{
      const normalized = getEffectiveSelectionRange();
      const selectedColumns = getSelectedHeaderColumnsSorted();
      const useSelectedColumns = selectedColumns.length > 0;
      const rowSpan = useSelectedColumns ? resolveRowSpanForSelection() : null;
      const text = useSelectedColumns
        ? buildClipboardTextFromColumns(selectedColumns, rowSpan.startRow, rowSpan.endRow)
        : buildClipboardTextFromRange(normalized);
      if(text == null){
        return false;
      }
      const ok = await writeClipboardText(text);
      if(ok){
        invalidatePendingClipboardMove('copy');
        const ranges = useSelectedColumns
          ? buildSelectionRangesFromColumns(selectedColumns, rowSpan.startRow, rowSpan.endRow)
          : (normalized ? [normalized] : []);
        setClipboardOutlineState({
          mode: 'copy',
          ranges,
          clipboardText: normalizeClipboardText(text)
        }, 'copy');
        fireAfterCopy(useSelectedColumns
          ? ranges
          : normalized);
      }
      return ok;
    };

    const cutSelectionToClipboard = async ()=>{
      invalidatePendingClipboardMove('new-cut');
      const normalized = getEffectiveSelectionRange();
      const selectedColumns = getSelectedHeaderColumnsSorted();
      const useSelectedColumns = selectedColumns.length > 0;
      const rowSpan = useSelectedColumns ? resolveRowSpanForSelection() : null;
      const text = useSelectedColumns
        ? buildClipboardTextFromColumns(selectedColumns, rowSpan.startRow, rowSpan.endRow)
        : buildClipboardTextFromRange(normalized);
      if(text == null || (!normalized && !useSelectedColumns)){
        return false;
      }
      const ok = await writeClipboardText(text);
      if(!ok){
        return false;
      }
      const normalizedClipboard = normalizeClipboardText(text);
      const copiedRanges = useSelectedColumns
        ? buildSelectionRangesFromColumns(selectedColumns, rowSpan.startRow, rowSpan.endRow)
        : (normalized ? [normalized] : []);
      setClipboardOutlineState({
        mode: 'cut',
        ranges: copiedRanges,
        clipboardText: normalizedClipboard
      }, 'cut');
      fireAfterCopy(useSelectedColumns
        ? copiedRanges
        : normalized);
      const changes = useSelectedColumns
        ? buildVisualClearChangesForColumns(selectedColumns, rowSpan.startRow, rowSpan.endRow)
        : buildVisualClearChangesForColumns(
          Array.from({ length: Math.max(0, normalized.to.col - normalized.from.col + 1) }, (_, offset)=>normalized.from.col + offset),
          normalized.from.row,
          normalized.to.row
        );
      const capturedChanges = withUndoLock('clipboard-cut-clear', ()=>captureLockedMutationChangesDuring(()=>{
        instance.setDataAtCell(changes, 'cut');
      })) || [];
      const cutPhysicalChanges = buildPhysicalChangeListFromVisualChanges(capturedChanges);
      registerPendingClipboardMove(normalizedClipboard, cutPhysicalChanges);
      return true;
    };


    const pinFirstRow = overrides?.pinFirstRow;
    let pinRowCount = Number.isInteger(pinFirstRow)
      ? Math.max(0, pinFirstRow)
      : (pinFirstRow === true ? 1 : 0);
    const shouldPinRows = pinRowCount > 0;
    const isFirefox = (() => {
      if(typeof navigator === 'undefined'){
        return false;
      }
      const ua = navigator.userAgent || '';
      if(/firefox/i.test(ua) || /fxios/i.test(ua)){
        return true;
      }
      const brands = navigator.userAgentData && Array.isArray(navigator.userAgentData.brands)
        ? navigator.userAgentData.brands
        : [];
      return brands.some(entry => /firefox/i.test(entry.brand || ''));
    })();
    const preferPinnedTransform = isFirefox;
    const virtualizationConfig = (() => {
      const raw = Object.assign({}, hotOptions.virtualization || {}, overrides?.virtualization || {});
      const enabled = raw.enabled !== false;
      const thresholds = {
        rows: Number.isFinite(raw.thresholds?.rows) ? raw.thresholds.rows : 2000,
        cols: Number.isFinite(raw.thresholds?.cols) ? raw.thresholds.cols : 200,
        cells: Number.isFinite(raw.thresholds?.cells) ? raw.thresholds.cells : 200000
      };
      const rowBuffer = Number.isFinite(raw.rowBuffer) ? raw.rowBuffer : null;
      const columnBuffer = Number.isFinite(raw.columnBuffer) ? raw.columnBuffer : null;
      const rowBufferLarge = Number.isFinite(raw.rowBufferLarge)
        ? raw.rowBufferLarge
        : (Number.isFinite(raw.rowBuffer) ? raw.rowBuffer : 6);
      const columnBufferLarge = Number.isFinite(raw.columnBufferLarge)
        ? raw.columnBufferLarge
        : (Number.isFinite(raw.columnBuffer) ? raw.columnBuffer : 2);
      const forcePinnedRows = raw.forcePinnedRows === true || (enabled && raw.forcePinnedRows !== false);
      const preferStickyHeaderRow = raw.preferStickyHeaderRow === true;
      const suppressColumnVirtualisation = typeof raw.suppressColumnVirtualisation === 'boolean'
        ? raw.suppressColumnVirtualisation
        : null;
      return {
        enabled,
        thresholds,
        rowBuffer,
        columnBuffer,
        rowBufferLarge,
        columnBufferLarge,
        forcePinnedRows,
        preferStickyHeaderRow,
        suppressColumnVirtualisation
      };
    })();
    const useStickyHeaderRow = shouldPinRows
      && isFirefox
      && !virtualizationConfig.forcePinnedRows
      && (virtualizationConfig.preferStickyHeaderRow || virtualizationConfig.enabled === false);
    const usePinnedRows = shouldPinRows && !useStickyHeaderRow;
    if(shouldPinRows && isFirefox && usePinnedRows && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: Shared.hot pinFirstRow virtualization using pinned rows on Firefox', { debugLabel });
    }
    const isPinnedPhysicalRow = (physicalRow)=>(
      shouldPinRows
      && Number.isInteger(physicalRow)
      && physicalRow >= 0
      && physicalRow < pinRowCount
    );
    const isPinnedTopRow = (physicalRow)=>(
      usePinnedRows
      && isPinnedPhysicalRow(physicalRow)
    );
    const isStickyRow = (physicalRow)=>(
      useStickyHeaderRow
      && isPinnedPhysicalRow(physicalRow)
    );
    const isPinnedOrHeaderRow = (physicalRow)=>(
      isHeaderRow(physicalRow)
      || isPinnedPhysicalRow(physicalRow)
    );

    const resolveVirtualizationState = (shape)=>{
      const rows = Math.max(0, Number(shape?.rows) || 0);
      const cols = Math.max(0, Number(shape?.cols) || 0);
      const cells = rows * cols;
      if(!virtualizationConfig.enabled){
        return {
          enabled: false,
          rows,
          cols,
          cells,
          isLarge: false,
          rowBuffer: null,
          columnBuffer: null,
          suppressColumnVirtualisation: virtualizationConfig.suppressColumnVirtualisation
        };
      }
      const isLarge = rows >= virtualizationConfig.thresholds.rows
        || cols >= virtualizationConfig.thresholds.cols
        || cells >= virtualizationConfig.thresholds.cells;
      return {
        enabled: true,
        rows,
        cols,
        cells,
        isLarge,
        rowBuffer: isLarge ? virtualizationConfig.rowBufferLarge : virtualizationConfig.rowBuffer,
        columnBuffer: isLarge ? virtualizationConfig.columnBufferLarge : virtualizationConfig.columnBuffer,
        suppressColumnVirtualisation: virtualizationConfig.suppressColumnVirtualisation
      };
    };

    const getDataShape = ()=>({
      rows: Array.isArray(dataHandle.current) ? dataHandle.current.length : 0,
      cols: colCount
    });

    const virtualizationStateMatches = (prev, next)=>(
      !!prev
      && prev.isLarge === next.isLarge
      && prev.rowBuffer === next.rowBuffer
      && prev.columnBuffer === next.columnBuffer
      && prev.suppressColumnVirtualisation === next.suppressColumnVirtualisation
    );

    let virtualizationState = resolveVirtualizationState(getDataShape());
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: Shared.hot virtualization initialized', Object.assign({ debugLabel }, virtualizationState));
    }

    const buildRowData = ()=>Shared.agGrid?.buildRowData
      ? Shared.agGrid.buildRowData(dataHandle.current)
      : Array.from({ length: dataHandle.current.length }, (_, idx)=>({ __rowIndex: idx }));
    let rowData = buildRowData();
    if(shouldPinRows && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug('Debug: Shared.hot pinFirstRow enabled', {
        debugLabel,
        count: pinRowCount,
        mode: usePinnedRows ? 'pinned' : 'sticky'
      });
    }
    if(useStickyHeaderRow && container?.classList){
      container.classList.add('hot-sticky-header');
      cleanupFns.push(()=>container.classList.remove('hot-sticky-header'));
    }

    const getPinnedTopRowData = ()=>{
      if(!usePinnedRows){
        return null;
      }
      if(!Array.isArray(rowData) || !rowData.length){
        return [];
      }
      return rowData.slice(0, Math.min(pinRowCount, rowData.length));
    };

    const applyPinnedTopRowData = (api)=>{
      if(!usePinnedRows || !api){
        return;
      }
      const pinned = getPinnedTopRowData() || [];
      try{
        let updated = false;
        if(typeof api.setPinnedTopRowData === 'function'){
          api.setPinnedTopRowData(pinned);
          updated = true;
        }else if(typeof api.setGridOption === 'function'){
          api.setGridOption('pinnedTopRowData', pinned);
          updated = true;
        }
        if(updated){
          syncPinnedTopRowScroll('pinned-data');
          schedulePinnedTopRowSync('pinned-data-follow');
        }
      }catch(err){
        console.error('Shared.hot AG pinned top row update error', err);
      }
    };

    let pinnedTopScrollLeft = null;
    let pinnedTopViewport = null;
    let pinnedTopContainer = null;
    let centerColsContainer = null;
    let pinnedTopObserver = null;
    let pinnedTopObservedTarget = null;
    let pinnedTopSyncAttempts = 0;
    let pinnedTopSyncRafId = null;
    let pinnedTopSyncStableFrames = 0;

    const resolvePinnedTopElements = ()=>{
      if(!container || typeof container.querySelector !== 'function'){
        pinnedTopViewport = null;
        pinnedTopContainer = null;
        centerColsContainer = null;
        return;
      }
      if(!pinnedTopViewport || !pinnedTopViewport.isConnected){
        pinnedTopViewport = container.querySelector('.ag-floating-top .ag-center-cols-viewport')
          || container.querySelector('.ag-pinned-top .ag-center-cols-viewport')
          || container.querySelector('.ag-floating-top-viewport')
          || container.querySelector('.ag-pinned-top-viewport')
          || container.querySelector('.ag-floating-top')
          || container.querySelector('.ag-pinned-top')
          || null;
      }
      if(!pinnedTopContainer || !pinnedTopContainer.isConnected){
        pinnedTopContainer = container.querySelector('.ag-floating-top .ag-center-cols-container')
          || container.querySelector('.ag-pinned-top .ag-center-cols-container')
          || container.querySelector('.ag-floating-top-container')
          || container.querySelector('.ag-pinned-top-container')
          || null;
      }
      if(!centerColsContainer || !centerColsContainer.isConnected){
        centerColsContainer = container.querySelector('.ag-body-viewport .ag-center-cols-container')
          || container.querySelector('.ag-center-cols-viewport .ag-center-cols-container')
          || container.querySelector('.ag-body .ag-center-cols-container')
          || container.querySelector('.ag-center-cols-container')
          || null;
      }
    };

    const attachPinnedTopObserver = ()=>{
      if(!usePinnedRows || typeof MutationObserver !== 'function'){
        return;
      }
      resolvePinnedTopElements();
      const target = centerColsContainer;
      if(!target){
        return;
      }
      if(pinnedTopObservedTarget === target){
        return;
      }
      if(pinnedTopObserver){
        pinnedTopObserver.disconnect();
      }
      pinnedTopObserver = new MutationObserver(() => {
        syncPinnedTopRowScroll('center-transform');
      });
      pinnedTopObserver.observe(target, { attributes: true, attributeFilter: ['style', 'class'] });
      pinnedTopObservedTarget = target;
      cleanupFns.push(()=>{
        if(pinnedTopObserver){
          pinnedTopObserver.disconnect();
          pinnedTopObserver = null;
        }
        pinnedTopObservedTarget = null;
      });
    };

    const parseTranslateX = (value)=>{
      if(!value || value === 'none'){
        return null;
      }
      const raw = String(value).trim();
      let match = raw.match(/^matrix3d\((.+)\)$/);
      if(match){
        const parts = match[1].split(',').map(part => Number(part.trim()));
        if(parts.length >= 13 && Number.isFinite(parts[12])){
          return parts[12];
        }
        return null;
      }
      match = raw.match(/^matrix\((.+)\)$/);
      if(match){
        const parts = match[1].split(',').map(part => Number(part.trim()));
        if(parts.length >= 6 && Number.isFinite(parts[4])){
          return parts[4];
        }
        return null;
      }
      match = raw.match(/translate3d\(([^)]+)\)/i);
      if(match){
        const parts = match[1].split(',').map(part => Number(String(part).trim().replace('px', '')));
        if(parts.length >= 1 && Number.isFinite(parts[0])){
          return parts[0];
        }
        return null;
      }
      match = raw.match(/translateX\(([^)]+)\)/i);
      if(match){
        const valuePart = Number(String(match[1]).trim().replace('px', ''));
        return Number.isFinite(valuePart) ? valuePart : null;
      }
      match = raw.match(/translate\(([^)]+)\)/i);
      if(match){
        const parts = match[1].split(',').map(part => Number(String(part).trim().replace('px', '')));
        if(parts.length >= 1 && Number.isFinite(parts[0])){
          return parts[0];
        }
      }
      return null;
    };

    const resolveTransformTranslateX = (el)=>{
      if(!el){
        return null;
      }
      const doc = el.ownerDocument || document;
      const win = doc.defaultView || global;
      const style = typeof win?.getComputedStyle === 'function' ? win.getComputedStyle(el) : null;
      const transform = style?.transform || style?.webkitTransform || el.style?.transform || '';
      return parseTranslateX(transform);
    };

    const resolveHorizontalScrollLeft = ()=>{
      if(!container || typeof container.querySelector !== 'function'){
        return 0;
      }
      const centerViewport = container.querySelector('.ag-center-cols-viewport');
      const horizontalViewport = container.querySelector('.ag-body-horizontal-scroll-viewport');
      const horizontalScroll = container.querySelector('.ag-body-horizontal-scroll');
      const bodyViewport = container.querySelector('.ag-body-viewport');
      const candidates = [
        centerViewport,
        horizontalViewport,
        horizontalScroll,
        bodyViewport
      ];
      let maxLeft = 0;
      candidates.forEach(el=>{
        if(el && typeof el.scrollLeft === 'number' && el.scrollLeft > maxLeft){
          maxLeft = el.scrollLeft;
        }
      });
      if(maxLeft > 0){
        return maxLeft;
      }
      const transformX = resolveTransformTranslateX(centerColsContainer);
      if(Number.isFinite(transformX) && transformX !== 0){
        return Math.abs(transformX);
      }
      return 0;
    };

    const applyPinnedTopTranslateX = (el, offset)=>{
      if(!el || !el.style){
        return false;
      }
      if(!el.style.willChange){
        el.style.willChange = 'transform';
      }
      const next = `translate3d(${offset}px, 0px, 0px)`;
      const current = el.style.transform || '';
      if(current && /translate3d\(/i.test(current)){
        const updated = current.replace(/translate3d\([^)]+\)/i, next);
        if(updated !== current){
          el.style.transform = updated;
        }
        return true;
      }
      if(current && /translateX\(/i.test(current)){
        const updated = current.replace(/translateX\([^)]+\)/i, next);
        if(updated !== current){
          el.style.transform = updated;
        }
        return true;
      }
      if(current && /translate\(/i.test(current)){
        const updated = current.replace(/translate\([^)]+\)/i, next);
        if(updated !== current){
          el.style.transform = updated;
        }
        return true;
      }
      if(current && current !== 'none'){
        el.style.transform = `${current} ${next}`.trim();
        return true;
      }
      el.style.transform = next;
      return true;
    };

    const alignPinnedTopByRect = (reason)=>{
      if(!usePinnedRows || !isFirefox || !pinnedTopContainer || !centerColsContainer){
        return false;
      }
      if(typeof pinnedTopContainer.getBoundingClientRect !== 'function' || typeof centerColsContainer.getBoundingClientRect !== 'function'){
        return false;
      }
      const centerRect = centerColsContainer.getBoundingClientRect();
      const pinnedRect = pinnedTopContainer.getBoundingClientRect();
      if(!centerRect || !pinnedRect){
        return false;
      }
      const delta = centerRect.left - pinnedRect.left;
      if(!Number.isFinite(delta) || Math.abs(delta) < 0.5){
        return false;
      }
      const currentOffset = resolveTransformTranslateX(pinnedTopContainer) || 0;
      const nextOffset = currentOffset + delta;
      if(!Number.isFinite(nextOffset)){
        return false;
      }
      pinnedTopScrollLeft = nextOffset;
      const applied = applyPinnedTopTranslateX(pinnedTopContainer, nextOffset);
      if(applied && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot pinFirstRow rect sync', { debugLabel, reason, delta, nextOffset });
      }
      return applied;
    };

    const resolveCellLeft = (root)=>{
      if(!root || typeof root.querySelector !== 'function'){
        return null;
      }
      const row = root.querySelector('.ag-row');
      if(!row){
        return null;
      }
      const cell = row.querySelector('.ag-cell');
      if(!cell || typeof cell.getBoundingClientRect !== 'function'){
        return null;
      }
      const rect = cell.getBoundingClientRect();
      return Number.isFinite(rect.left) ? rect.left : null;
    };

    const alignPinnedTopByCells = (reason)=>{
      if(!usePinnedRows || !isFirefox || !pinnedTopContainer || !centerColsContainer){
        return false;
      }
      const bodyLeft = resolveCellLeft(centerColsContainer);
      const pinnedLeft = resolveCellLeft(pinnedTopContainer);
      if(!Number.isFinite(bodyLeft) || !Number.isFinite(pinnedLeft)){
        return false;
      }
      const delta = bodyLeft - pinnedLeft;
      if(!Number.isFinite(delta) || Math.abs(delta) < 0.5){
        return false;
      }
      const currentOffset = resolveTransformTranslateX(pinnedTopContainer) || 0;
      const nextOffset = currentOffset + delta;
      if(!Number.isFinite(nextOffset)){
        return false;
      }
      pinnedTopScrollLeft = nextOffset;
      const applied = applyPinnedTopTranslateX(pinnedTopContainer, nextOffset);
      if(applied && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot pinFirstRow cell sync', { debugLabel, reason, delta, nextOffset });
      }
      return applied;
    };

    const schedulePinnedTopRowSync = (reason)=>{
      if(!usePinnedRows){
        return;
      }
      const doc = container?.ownerDocument || document;
      const win = doc.defaultView || global;
      const raf = typeof win?.requestAnimationFrame === 'function'
        ? win.requestAnimationFrame.bind(win)
        : (fn)=>win.setTimeout(fn, 16);
      if(pinnedTopSyncRafId != null){
        return;
      }
      pinnedTopSyncRafId = raf(()=>{
        pinnedTopSyncRafId = null;
        const prev = pinnedTopScrollLeft;
        syncPinnedTopRowScroll(reason || 'raf');
        alignPinnedTopByRect(reason || 'raf');
        alignPinnedTopByCells(reason || 'raf');
        const current = pinnedTopScrollLeft;
        if(current === prev){
          pinnedTopSyncStableFrames += 1;
        }else{
          pinnedTopSyncStableFrames = 0;
        }
        const stableThreshold = isFirefox ? 6 : 2;
        if(pinnedTopSyncStableFrames < stableThreshold){
          schedulePinnedTopRowSync('raf-follow');
        }
      });
    };

    const syncPinnedTopRowScroll = (reason)=>{
      if(!usePinnedRows || !container || typeof container.querySelector !== 'function'){
        return;
      }
      resolvePinnedTopElements();
      attachPinnedTopObserver();
      const hasPinnedTarget = !!(pinnedTopViewport || pinnedTopContainer);
      if(!hasPinnedTarget){
        pinnedTopScrollLeft = null;
        return;
      }
      const transformX = resolveTransformTranslateX(centerColsContainer);
      const useTransformOffset = preferPinnedTransform && Number.isFinite(transformX) && transformX !== 0;
      const scrollLeft = useTransformOffset ? Math.abs(transformX) : resolveHorizontalScrollLeft();
      const offset = useTransformOffset ? transformX : -scrollLeft;
      const needsForceSync = preferPinnedTransform
        && pinnedTopViewport
        && typeof pinnedTopViewport.scrollLeft === 'number'
        && pinnedTopViewport.scrollLeft !== 0;
      if(offset === pinnedTopScrollLeft && !needsForceSync){
        return;
      }
      pinnedTopScrollLeft = offset;
      let applied = false;
      const useTransform = (preferPinnedTransform || useTransformOffset) && !!pinnedTopContainer;
      if(useTransform){
        if(pinnedTopViewport && typeof pinnedTopViewport.scrollLeft === 'number' && pinnedTopViewport.scrollLeft !== 0){
          pinnedTopViewport.scrollLeft = 0;
        }
        applied = applyPinnedTopTranslateX(pinnedTopContainer, offset);
      }else if(pinnedTopViewport && typeof pinnedTopViewport.scrollLeft === 'number'){
        pinnedTopViewport.scrollLeft = scrollLeft;
        applied = true;
      }else if(pinnedTopContainer){
        applied = applyPinnedTopTranslateX(pinnedTopContainer, offset);
      }
      if(!applied && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        pinnedTopSyncAttempts += 1;
        if(pinnedTopSyncAttempts <= 3){
          console.debug('Debug: Shared.hot pinFirstRow scroll sync skipped', { debugLabel, reason, scrollLeft });
        }
      }
      if(applied && isFirefox){
        alignPinnedTopByCells(reason || 'scroll');
      }
    };

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
          const node = params?.node;
          const isPinnedTop = !!(node && node.rowPinned === 'top');

          const rawRowIndex = node?.rowIndex ?? params?.data?.__rowIndex ?? 0;

          // Start numbering at the first NON pinned row (the first row below pinned rows)
          const offset = (usePinnedRows && Number.isInteger(pinRowCount) && pinRowCount > 0) ? pinRowCount : 0;
          const logicalRowIndex = rawRowIndex - offset;

          // Do not show a number on pinned rows (these are "header like" rows)
          if(isPinnedTop){
            if(typeof Shared !== 'undefined' && Shared && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
              console.debug('Debug: Shared.hot rowHeader pinned row number suppressed', { debugLabel, rawRowIndex, offset });
            }
            return '';
          }

          // Guard: if a ghost row ever becomes visible, do not label it
          if(offset > 0 && logicalRowIndex < 0){
            if(typeof Shared !== 'undefined' && Shared && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
              console.debug('Debug: Shared.hot rowHeader ghost row number suppressed', { debugLabel, rawRowIndex, logicalRowIndex, offset });
            }
            return '';
          }

          if(typeof rowHeadersSetting === 'function'){
            try{
              // Pass logical index so numbering aligns with "first row below pinned rows"
              const label = rowHeadersSetting(logicalRowIndex);
              return label == null ? '' : String(label);
            }catch(err){
              console.error('Shared.hot rowHeader rowHeadersSetting error', {
                debugLabel,
                message: err?.message || String(err),
                rawRowIndex,
                logicalRowIndex,
                offset
              });
              return String(logicalRowIndex + 1);
            }
          }

          return String(logicalRowIndex + 1);
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
    const pinFirstDataColumn = overrides?.pinFirstColumn === true;
    const rowSelectionConfig = (Object.prototype.hasOwnProperty.call(overrides || {}, 'rowSelection'))
      ? overrides.rowSelection
      : { mode: 'multiRow', headerCheckbox: false };
    const columnWidthOverrides = new Map();

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
    const FORMULA_FUNCTION_SPECS = Object.freeze([
      Object.freeze({
        name: 'SUM',
        args: Object.freeze(['number1', '[number2]', '...']),
        description: 'Adds numbers or cell ranges.'
      }),
      Object.freeze({
        name: 'AVERAGE',
        args: Object.freeze(['number1', '[number2]', '...']),
        description: 'Returns the arithmetic mean of numbers or ranges.'
      }),
      Object.freeze({
        name: 'AVG',
        args: Object.freeze(['number1', '[number2]', '...']),
        description: 'Alias of AVERAGE.'
      }),
      Object.freeze({
        name: 'MIN',
        args: Object.freeze(['number1', '[number2]', '...']),
        description: 'Returns the smallest numeric value.'
      }),
      Object.freeze({
        name: 'MAX',
        args: Object.freeze(['number1', '[number2]', '...']),
        description: 'Returns the largest numeric value.'
      }),
      Object.freeze({
        name: 'COUNT',
        args: Object.freeze(['value1', '[value2]', '...']),
        description: 'Counts numeric values in the provided arguments.'
      })
    ]);
    const FORMULA_FUNCTION_SPECS_BY_NAME = new Map(FORMULA_FUNCTION_SPECS.map(spec => [spec.name, spec]));
    const FORMULA_FUNCTION_SUGGESTION_LIMIT = 8;
    const escapeFormulaAssistHtml = (value)=>String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const resolveFormulaFunctionPrefixContext = (value, caretPos)=>{
      const source = String(value ?? '');
      const caret = Number.isFinite(Number(caretPos))
        ? Math.max(0, Math.min(source.length, Math.floor(Number(caretPos))))
        : source.length;
      const before = source.slice(0, caret);
      const afterChar = source[caret] || '';
      if(/[A-Za-z0-9_]/.test(afterChar)){
        return null;
      }
      const trimmedLeading = before.trimStart();
      if(!trimmedLeading.startsWith('=')){
        return null;
      }
      const match = before.match(/(?:^|[=+\-*/,(;])\s*([A-Za-z][A-Za-z0-9_]*)$/);
      if(!match || !match[1]){
        return null;
      }
      const rawPrefix = String(match[1] || '');
      const start = caret - rawPrefix.length;
      if(start < 0){
        return null;
      }
      return {
        prefix: rawPrefix.toUpperCase(),
        start,
        end: caret
      };
    };
    const resolveFormulaFunctionCallContext = (value, caretPos)=>{
      const source = String(value ?? '');
      const caret = Number.isFinite(Number(caretPos))
        ? Math.max(0, Math.min(source.length, Math.floor(Number(caretPos))))
        : source.length;
      const before = source.slice(0, caret);
      if(!before.trimStart().startsWith('=')){
        return null;
      }
      const stack = [];
      let token = '';
      let pendingIdentifier = null;
      const flushToken = ()=>{
        if(token){
          pendingIdentifier = token.toUpperCase();
          token = '';
        }
      };
      for(let i = 0; i < before.length; i += 1){
        const ch = before[i];
        if(/[A-Za-z0-9_]/.test(ch)){
          token += ch;
          continue;
        }
        flushToken();
        if(ch === '('){
          const spec = pendingIdentifier ? FORMULA_FUNCTION_SPECS_BY_NAME.get(pendingIdentifier) : null;
          if(spec){
            stack.push({ type: 'function', name: spec.name, argIndex: 0 });
          }else{
            stack.push({ type: 'group' });
          }
          pendingIdentifier = null;
          continue;
        }
        if(ch === ')'){
          if(stack.length){
            stack.pop();
          }
          pendingIdentifier = null;
          continue;
        }
        if(ch === ',' || ch === ';'){
          const top = stack[stack.length - 1];
          if(top && top.type === 'function'){
            top.argIndex += 1;
          }
          pendingIdentifier = null;
          continue;
        }
        if(/\s/.test(ch)){
          continue;
        }
        pendingIdentifier = null;
      }
      flushToken();
      for(let i = stack.length - 1; i >= 0; i -= 1){
        const entry = stack[i];
        if(!entry || entry.type !== 'function'){
          continue;
        }
        const spec = FORMULA_FUNCTION_SPECS_BY_NAME.get(entry.name);
        if(!spec){
          continue;
        }
        return {
          spec,
          argIndex: Math.max(0, Number(entry.argIndex) || 0)
        };
      }
      return null;
    };
    const buildFormulaFunctionSignatureHtml = (spec, argIndex)=>{
      if(!spec){
        return '';
      }
      const args = Array.isArray(spec.args) ? spec.args : [];
      const maxArgIndex = args.length > 0 ? args.length - 1 : 0;
      const activeArg = Math.max(0, Math.min(maxArgIndex, Number(argIndex) || 0));
      const argsHtml = args.map((arg, index)=>{
        const cls = index === activeArg ? 'hot-formula-fn-arg is-active' : 'hot-formula-fn-arg';
        return `<span class="${cls}">${escapeFormulaAssistHtml(arg)}</span>`;
      }).join(', ');
      return `<span class="hot-formula-fn-name">${escapeFormulaAssistHtml(spec.name)}</span>(${argsHtml})`;
    };
    const autoCloseFormulaParentheses = (value)=>{
      const source = String(value ?? '');
      const trimmedLeading = source.trimStart();
      if(!trimmedLeading.startsWith('=')){
        return source;
      }
      const trailingWhitespace = source.match(/\s*$/)?.[0] || '';
      const coreLength = Math.max(0, source.length - trailingWhitespace.length);
      const core = source.slice(0, coreLength);
      let depth = 0;
      let inString = false;
      for(let i = 0; i < core.length; i += 1){
        const ch = core[i];
        if(ch === '"'){
          if(inString && core[i + 1] === '"'){
            i += 1;
            continue;
          }
          inString = !inString;
          continue;
        }
        if(inString){
          continue;
        }
        if(ch === '('){
          depth += 1;
          continue;
        }
        if(ch === ')' && depth > 0){
          depth -= 1;
        }
      }
      if(depth <= 0){
        return source;
      }
      return `${core}${')'.repeat(depth)}${trailingWhitespace}`;
    };

    const SharedFormulaCellEditor = function SharedFormulaCellEditor() {};
    SharedFormulaCellEditor.prototype.init = function init(params){
      const doc = container?.ownerDocument || document;
      const win = doc?.defaultView || global;
      const input = doc.createElement('input');
      input.type = 'text';
      input.className = 'ag-input-field-input ag-text-field-input';
      input.spellcheck = false;
      input.autocapitalize = 'off';
      input.autocomplete = 'off';
      input.autocorrect = 'off';
      const physicalRow = Number(params?.data?.__rowIndex ?? params?.node?.data?.__rowIndex ?? params?.node?.rowIndex);
      const colId = params?.column?.getColId?.() || params?.colDef?.colId || '';
      const physicalCol = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
      const rawModelValue = (Number.isInteger(physicalRow) && physicalRow >= 0 && Number.isInteger(physicalCol) && physicalCol >= 0)
        ? resolveFormulaRawValue(physicalRow, physicalCol, params?.value ?? '')
        : (params?.value ?? '');
      const typedChar = typeof params?.charPress === 'string' && params.charPress.length === 1
        ? params.charPress
        : '';
      const eventKey = typeof params?.eventKey === 'string' ? params.eventKey : '';
      const hasModifier = !!(params?.event && (params.event.ctrlKey || params.event.metaKey || params.event.altKey));
      const inferredTypedKey = !typedChar && !hasModifier && eventKey.length === 1
        ? eventKey
        : '';
      const clearOnEditStart = eventKey === 'Backspace' || eventKey === 'Delete';
      const initialTypedValue = typedChar || inferredTypedKey;
      this._startedWithTyping = !!initialTypedValue;
      input.value = initialTypedValue || (clearOnEditStart ? '' : (rawModelValue == null ? '' : String(rawModelValue)));
      this.eInput = input;
      this.fnSuggestions = [];
      this.fnSuggestionIndex = 0;
      this.fnPrefixContext = null;
      this.fnSuggestRoot = doc.createElement('div');
      this.fnSuggestRoot.className = 'hot-formula-fn-suggest';
      this.fnSuggestRoot.setAttribute('hidden', 'hidden');
      this.fnSuggestRoot.setAttribute('role', 'listbox');
      this.fnSuggestRoot.setAttribute('aria-label', 'Formula function suggestions');
      this.fnTooltipRoot = doc.createElement('div');
      this.fnTooltipRoot.className = 'hot-formula-fn-tooltip';
      this.fnTooltipRoot.setAttribute('hidden', 'hidden');
      this.fnTooltipRoot.setAttribute('aria-hidden', 'true');
      doc.body?.appendChild?.(this.fnSuggestRoot);
      doc.body?.appendChild?.(this.fnTooltipRoot);
      this.getEditorRect = ()=>{
        const rect = this.eInput?.getBoundingClientRect?.();
        if(!rect || !Number.isFinite(rect.left) || !Number.isFinite(rect.top)){
          return null;
        }
        return rect;
      };
      this.hideFunctionSuggestions = ()=>{
        this.fnSuggestions = [];
        this.fnSuggestionIndex = 0;
        if(this.fnSuggestRoot){
          this.fnSuggestRoot.setAttribute('hidden', 'hidden');
          this.fnSuggestRoot.innerHTML = '';
        }
      };
      this.hideFunctionTooltip = ()=>{
        if(this.fnTooltipRoot){
          this.fnTooltipRoot.setAttribute('hidden', 'hidden');
          this.fnTooltipRoot.innerHTML = '';
        }
      };
      this.hideFunctionAssist = ()=>{
        this.hideFunctionSuggestions();
        this.hideFunctionTooltip();
      };
      this.positionFunctionAssist = ()=>{
        const rect = this.getEditorRect?.();
        if(!rect){
          return;
        }
        const viewportWidth = Number(win?.innerWidth) || 1024;
        const viewportHeight = Number(win?.innerHeight) || 768;
        const clampLeft = (desired, width)=>{
          if(!Number.isFinite(desired)){
            return 4;
          }
          if(!Number.isFinite(width)){
            return Math.max(4, desired);
          }
          return Math.min(Math.max(4, desired), Math.max(4, viewportWidth - width - 4));
        };
        let suggestionsBottom = rect.bottom + 4;
        if(this.fnSuggestRoot && !this.fnSuggestRoot.hasAttribute('hidden')){
          const desiredWidth = Math.max(220, Math.min(420, Math.round(rect.width + 120)));
          this.fnSuggestRoot.style.minWidth = `${Math.max(220, Math.round(rect.width))}px`;
          this.fnSuggestRoot.style.maxWidth = '440px';
          const menuWidth = Math.min(desiredWidth, viewportWidth - 8);
          const left = clampLeft(rect.left, menuWidth);
          this.fnSuggestRoot.style.left = `${left}px`;
          this.fnSuggestRoot.style.width = `${menuWidth}px`;
          const menuHeight = this.fnSuggestRoot.offsetHeight || 0;
          let top = rect.bottom + 4;
          if(menuHeight > 0 && top + menuHeight > viewportHeight - 4){
            top = Math.max(4, rect.top - menuHeight - 4);
          }
          this.fnSuggestRoot.style.top = `${top}px`;
          suggestionsBottom = top + menuHeight + 2;
        }
        if(this.fnTooltipRoot && !this.fnTooltipRoot.hasAttribute('hidden')){
          const tooltipWidth = Math.min(Math.max(220, Math.round(rect.width + 80)), viewportWidth - 8);
          const left = clampLeft(rect.left, tooltipWidth);
          this.fnTooltipRoot.style.maxWidth = `${tooltipWidth}px`;
          this.fnTooltipRoot.style.left = `${left}px`;
          const tooltipHeight = this.fnTooltipRoot.offsetHeight || 0;
          let top = suggestionsBottom;
          if(top + tooltipHeight > viewportHeight - 4){
            top = Math.max(4, rect.top - tooltipHeight - 4);
          }
          this.fnTooltipRoot.style.top = `${top}px`;
        }
      };
      this.renderFunctionSuggestions = ()=>{
        if(!this.fnSuggestRoot){
          return;
        }
        const suggestions = Array.isArray(this.fnSuggestions) ? this.fnSuggestions : [];
        if(!suggestions.length){
          this.hideFunctionSuggestions();
          return;
        }
        this.fnSuggestionIndex = Math.max(0, Math.min(suggestions.length - 1, Number(this.fnSuggestionIndex) || 0));
        this.fnSuggestRoot.innerHTML = suggestions.map((spec, idx)=>{
          const active = idx === this.fnSuggestionIndex;
          const cls = active ? 'hot-formula-fn-item is-active' : 'hot-formula-fn-item';
          return `<button type="button" class="${cls}" data-index="${idx}" role="option" aria-selected="${active ? 'true' : 'false'}"><span class="hot-formula-fn-item-name">${escapeFormulaAssistHtml(spec.name)}</span><span class="hot-formula-fn-item-desc">${escapeFormulaAssistHtml(spec.description)}</span></button>`;
        }).join('');
        this.fnSuggestRoot.removeAttribute('hidden');
      };
      this.renderFunctionTooltip = ()=>{
        if(!this.fnTooltipRoot || !this.eInput){
          return;
        }
        const value = String(this.eInput.value ?? '');
        const caret = Number.isInteger(this.eInput.selectionStart) ? this.eInput.selectionStart : value.length;
        const context = resolveFormulaFunctionCallContext(value, caret);
        if(!context || !context.spec){
          this.hideFunctionTooltip();
          return;
        }
        this.fnTooltipRoot.innerHTML = `<div class="hot-formula-fn-tooltip-signature">${buildFormulaFunctionSignatureHtml(context.spec, context.argIndex)}</div><div class="hot-formula-fn-tooltip-desc">${escapeFormulaAssistHtml(context.spec.description)}</div>`;
        this.fnTooltipRoot.removeAttribute('hidden');
      };
      this.updateFunctionAssist = ()=>{
        if(!this.eInput){
          this.hideFunctionAssist();
          return;
        }
        const value = String(this.eInput.value ?? '');
        const caret = Number.isInteger(this.eInput.selectionStart) ? this.eInput.selectionStart : value.length;
        const context = resolveFormulaFunctionPrefixContext(value, caret);
        this.fnPrefixContext = context;
        if(context && context.prefix){
          const prefix = context.prefix;
          const suggestions = FORMULA_FUNCTION_SPECS
            .filter(spec => spec.name.startsWith(prefix))
            .slice(0, FORMULA_FUNCTION_SUGGESTION_LIMIT);
          if(suggestions.length){
            const selectedName = this.fnSuggestions[this.fnSuggestionIndex]?.name || null;
            this.fnSuggestions = suggestions;
            const selectedIndex = selectedName
              ? suggestions.findIndex(spec => spec.name === selectedName)
              : 0;
            this.fnSuggestionIndex = selectedIndex >= 0 ? selectedIndex : 0;
            this.renderFunctionSuggestions();
          }else{
            this.hideFunctionSuggestions();
          }
        }else{
          this.hideFunctionSuggestions();
        }
        this.renderFunctionTooltip();
        this.positionFunctionAssist();
      };
      this.applyFunctionSuggestion = (index)=>{
        if(!this.eInput || !this.fnPrefixContext){
          return false;
        }
        const suggestions = Array.isArray(this.fnSuggestions) ? this.fnSuggestions : [];
        const nextIndex = Number(index);
        if(!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= suggestions.length){
          return false;
        }
        const spec = suggestions[nextIndex];
        if(!spec || !spec.name){
          return false;
        }
        const value = String(this.eInput.value ?? '');
        const start = Math.max(0, Number(this.fnPrefixContext.start) || 0);
        const end = Math.max(start, Number(this.fnPrefixContext.end) || start);
        const nextValue = `${value.slice(0, start)}${spec.name}(${value.slice(end)}`;
        this.eInput.value = nextValue;
        const nextCaret = start + spec.name.length + 1;
        try{
          this.eInput.setSelectionRange(nextCaret, nextCaret);
        }catch(err){
          // caret placement is best-effort only
        }
        this.hideFunctionSuggestions();
        this.updateFunctionAssist();
        this.handleInput();
        return true;
      };
      this.handleSuggestMouseDown = event=>{
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        const option = target && typeof target.closest === 'function'
          ? target.closest('.hot-formula-fn-item')
          : null;
        if(!option){
          return;
        }
        event.preventDefault?.();
        event.stopPropagation?.();
        const idx = Number(option.getAttribute('data-index'));
        this.applyFunctionSuggestion(idx);
      };
      this.handleInput = ()=>{
        try{
          if(enableFormulaReferenceOverlay){
            setFormulaReferenceOverlay(this.eInput?.value || '', {
              a1RowOffset: getFormulaA1RowOffset()
            });
          }
          ensureFormulaOverlayLoop('shared-formula-editor-input');
        }catch(err){
          // ignore overlay update failures
        }
        this.updateFunctionAssist();
      };
      this.maybeAutoCloseFormulaParenthesesOnCommit = ()=>{
        if(!this.eInput){
          return false;
        }
        const shouldAutoClose = this.eInput.__hotFormulaAutoCloseParensOnCommit === true;
        if(!shouldAutoClose){
          return false;
        }
        const current = String(this.eInput.value ?? '');
        const next = autoCloseFormulaParentheses(current);
        this.eInput.__hotFormulaAutoCloseParensOnCommit = false;
        if(next === current){
          return false;
        }
        this.eInput.value = next;
        try{
          const caret = next.length;
          this.eInput.setSelectionRange?.(caret, caret);
        }catch(err){
          // best-effort caret placement
        }
        this.handleInput();
        return true;
      };
      this.handleFocus = ()=>{
        try{
          ensureFormulaOverlayLoop('shared-formula-editor-focus');
        }catch(err){
          // ignore overlay update failures
        }
        this.updateFunctionAssist();
      };
      this.handleBlur = ()=>{
        win?.setTimeout?.(()=>{
          if(!this.eInput){
            return;
          }
          const active = doc?.activeElement && doc.activeElement.nodeType === 1 ? doc.activeElement : null;
          if(active === this.eInput){
            return;
          }
          this.hideFunctionAssist();
        }, 0);
      };
      this.handleKeyDown = event=>{
        if(!event){
          return;
        }
        const hasSuggestions = Array.isArray(this.fnSuggestions)
          && this.fnSuggestions.length > 0
          && this.fnSuggestRoot
          && !this.fnSuggestRoot.hasAttribute('hidden');
        if(hasSuggestions){
          if(event.key === 'ArrowDown'){
            this.fnSuggestionIndex = Math.min(this.fnSuggestions.length - 1, this.fnSuggestionIndex + 1);
            this.renderFunctionSuggestions();
            this.positionFunctionAssist();
            event.preventDefault?.();
            return;
          }
          if(event.key === 'ArrowUp'){
            this.fnSuggestionIndex = Math.max(0, this.fnSuggestionIndex - 1);
            this.renderFunctionSuggestions();
            this.positionFunctionAssist();
            event.preventDefault?.();
            return;
          }
          if((event.key === 'Enter' || event.key === 'Tab') && this.applyFunctionSuggestion(this.fnSuggestionIndex)){
            event.preventDefault?.();
            return;
          }
          if(event.key === 'Escape'){
            this.hideFunctionSuggestions();
            this.positionFunctionAssist();
            return;
          }
        }
        if(event.key === 'Enter' || event.key === 'NumpadEnter'){
          this.maybeAutoCloseFormulaParenthesesOnCommit();
        }
        if(event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End'){
          win?.setTimeout?.(()=>{
            this.updateFunctionAssist();
          }, 0);
        }
      };
      this.handleCaretChange = ()=>{
        this.updateFunctionAssist();
      };
      this.handleViewportChange = ()=>{
        this.positionFunctionAssist();
      };
      this.fnSuggestRoot.addEventListener('mousedown', this.handleSuggestMouseDown, true);
      input.addEventListener('input', this.handleInput);
      input.addEventListener('focus', this.handleFocus);
      input.addEventListener('blur', this.handleBlur);
      input.addEventListener('keydown', this.handleKeyDown);
      input.addEventListener('keyup', this.handleCaretChange);
      input.addEventListener('click', this.handleCaretChange);
      input.addEventListener('mouseup', this.handleCaretChange);
      win?.addEventListener?.('resize', this.handleViewportChange, true);
      win?.addEventListener?.('scroll', this.handleViewportChange, true);
    };
    SharedFormulaCellEditor.prototype.getGui = function getGui(){ return this.eInput; };
    SharedFormulaCellEditor.prototype.afterGuiAttached = function afterGuiAttached(){
      this.eInput?.focus?.();
      const placeCaretAtEnd = ()=>{
        const valueLength = this.eInput?.value?.length || 0;
        try{
          this.eInput?.setSelectionRange?.(valueLength, valueLength);
        }catch(err){
          // caret placement is best-effort only
        }
      };
      placeCaretAtEnd();
      if(typeof global.requestAnimationFrame === 'function'){
        global.requestAnimationFrame(placeCaretAtEnd);
      }
      try{
        ensureFormulaOverlayLoop('shared-formula-editor-attached');
      }catch(err){
        // ignore overlay update failures
      }
      this.updateFunctionAssist?.();
    };
    SharedFormulaCellEditor.prototype.getValue = function getValue(){
      if(typeof this.maybeAutoCloseFormulaParenthesesOnCommit === 'function'){
        try{
          this.maybeAutoCloseFormulaParenthesesOnCommit();
        }catch(err){
          // best-effort normalization only
        }
      }
      return this.eInput?.value ?? '';
    };
    SharedFormulaCellEditor.prototype.destroy = function destroy(){
      if(this.eInput){
        if(this.handleInput){
          this.eInput.removeEventListener('input', this.handleInput);
        }
        if(this.handleFocus){
          this.eInput.removeEventListener('focus', this.handleFocus);
        }
        if(this.handleBlur){
          this.eInput.removeEventListener('blur', this.handleBlur);
        }
        if(this.handleKeyDown){
          this.eInput.removeEventListener('keydown', this.handleKeyDown);
        }
        if(this.handleCaretChange){
          this.eInput.removeEventListener('keyup', this.handleCaretChange);
          this.eInput.removeEventListener('click', this.handleCaretChange);
          this.eInput.removeEventListener('mouseup', this.handleCaretChange);
        }
      }
      const doc = container?.ownerDocument || document;
      const win = doc?.defaultView || global;
      if(this.handleViewportChange){
        win?.removeEventListener?.('resize', this.handleViewportChange, true);
        win?.removeEventListener?.('scroll', this.handleViewportChange, true);
      }
      if(this.fnSuggestRoot){
        if(this.handleSuggestMouseDown){
          this.fnSuggestRoot.removeEventListener('mousedown', this.handleSuggestMouseDown, true);
        }
        this.fnSuggestRoot.remove?.();
      }
      if(this.fnTooltipRoot){
        this.fnTooltipRoot.remove?.();
      }
      this.handleInput = null;
      this.maybeAutoCloseFormulaParenthesesOnCommit = null;
      this.handleFocus = null;
      this.handleBlur = null;
      this.handleKeyDown = null;
      this.handleCaretChange = null;
      this.handleViewportChange = null;
      this.handleSuggestMouseDown = null;
      this.fnSuggestions = [];
      this.fnSuggestionIndex = 0;
      this.fnPrefixContext = null;
      this.fnSuggestRoot = null;
      this.fnTooltipRoot = null;
      this.eInput = null;
      this._startedWithTyping = false;
    };

    const buildColumnDefs = ()=>{
      const dataColumnDefs = Shared.agGrid?.createColumnDefs
        ? Shared.agGrid.createColumnDefs(colCount, { dataHandle, colHeaders })
        : Array.from({ length: colCount }, (_, col)=>{
          const headerName = colHeaders && colHeaders[col] ? colHeaders[col] : toExcelColumnLabel(col);
          return {
            headerName,
            colId: `c${col}`,
            field: `c${col}`,
            editable: true,
            resizable: true,
            comparator: valueComparator,
            cellClass: params => {
              const physicalRow = params?.data?.__rowIndex ?? params?.node?.rowIndex ?? 0;
              return isHeaderRow(physicalRow) ? firstRowClassName : null;
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

          const actionButton = doc.createElement('button');
          actionButton.type = 'button';
          actionButton.className = 'hot-header-action hot-filter-indicator';
          actionButton.setAttribute('aria-label', 'Open column filter');
          actionButton.setAttribute('aria-haspopup', 'dialog');
          actionButton.setAttribute('title', 'Open column filter');
          const sortBadge = doc.createElement('span');
          sortBadge.className = 'hot-header-action__sort-badge';
          sortBadge.setAttribute('aria-hidden', 'true');
          sortBadge.hidden = true;
          actionButton.appendChild(sortBadge);

          this.updateActionState = ()=>{
            const colId = params?.column?.getColId?.() || '';
            const sort = params?.column?.getSort?.() || '';
            const filtered = compiledColumnFilters.has(colId);
            actionButton.classList.toggle('is-filtered', filtered);
            actionButton.classList.toggle('is-sorted', sort === 'asc' || sort === 'desc');
            actionButton.classList.toggle('is-sorted-asc', sort === 'asc');
            actionButton.classList.toggle('is-sorted-desc', sort === 'desc');
            sortBadge.textContent = '';
            sortBadge.hidden = !(sort === 'asc' || sort === 'desc');
            const titleParts = ['Open column filter'];
            if(filtered){
              titleParts.push('Filter active');
            }
            if(sort === 'asc'){
              titleParts.push('Sorted ascending');
            }else if(sort === 'desc'){
              titleParts.push('Sorted descending');
            }
            actionButton.setAttribute('title', titleParts.join('\n'));
          };

          this.headerStateListener = ()=>{
            this.updateActionState?.();
          };

          if(params?.api?.addEventListener){
            params.api.addEventListener('sortChanged', this.headerStateListener);
          }
          if(typeof container?.addEventListener === 'function'){
            container.addEventListener(FILTER_STATE_EVENT, this.headerStateListener);
          }

          root.addEventListener('click', (event)=>{
            if(event?.defaultPrevented){
              return;
            }
            const target = event?.target && event.target.nodeType === 1 ? event.target : null;
            if(!target || typeof target.closest !== 'function'){
              return;
            }
            if(target.closest('.hot-col-drag-handle')){
              return;
            }
            if(!target.closest('.hot-header-action')){
              return;
            }
            const colId = params?.column?.getColId?.();
            const colIndex = typeof colId === 'string' && colId.startsWith('c')
              ? Number(colId.slice(1))
              : null;
            if(Number.isInteger(colIndex) && colIndex >= 0){
              event.preventDefault?.();
              event.stopPropagation?.();
              event.stopImmediatePropagation?.();
              openColumnFilterMenu(actionButton, colIndex);
            }
          });

          root.appendChild(handle);
          root.appendChild(label);
          root.appendChild(actionButton);
          this.eGui = root;
          this.updateActionState();
        }
        getGui(){
          return this.eGui;
        }
        destroy(){
          if(this.params?.api?.removeEventListener && this.headerStateListener){
            this.params.api.removeEventListener('sortChanged', this.headerStateListener);
          }
          if(typeof container?.removeEventListener === 'function' && this.headerStateListener){
            container.removeEventListener(FILTER_STATE_EVENT, this.headerStateListener);
          }
          this.eGui = null;
          this.params = null;
        }
      }

      const enhancedDataColumnDefs = dataColumnDefs.map((def, colIndex)=>{
        let colDef = def;
        if(colDefEnhancer && colDef && typeof colDef === 'object'){
          try{
            colDef = colDefEnhancer(colDef, { colIndex, colId: colDef.colId, isRowHeader: false }) || colDef;
          }catch(err){
            console.error('Shared.hot column def enhancer error', err);
          }
        }
        if(!colDef || typeof colDef !== 'object'){
          return colDef;
        }
        const colId = colDef.colId ?? null;
        const isDataColumn = typeof colId === 'string' && colId.startsWith('c');
        if(isDataColumn){
          const existingHeaderClass = colDef.headerClass;
          colDef.headerClass = params=>{
            const classes = [];
            if(typeof existingHeaderClass === 'function'){
              const result = existingHeaderClass(params);
              if(Array.isArray(result)){
                classes.push(...result.filter(Boolean));
              }else if(typeof result === 'string' && result.trim()){
                classes.push(result.trim());
              }
            }else if(Array.isArray(existingHeaderClass)){
              classes.push(...existingHeaderClass.filter(Boolean));
            }else if(typeof existingHeaderClass === 'string' && existingHeaderClass.trim()){
              classes.push(existingHeaderClass.trim());
            }
            const headerColId = params?.column?.getColId?.() ?? colDef.colId;
            const headerCol = typeof headerColId === 'string' && headerColId.startsWith('c')
              ? Number(headerColId.slice(1))
              : null;
            if(Number.isInteger(headerCol) && isHeaderColumnSelected(headerCol)){
              classes.push('hot-selected-column-header');
            }
            if(Number.isInteger(headerCol) && headerCol >= 0){
              const headerNameRaw = params?.column?.getColDef?.()?.headerName;
              const headerName = headerNameRaw == null ? '' : String(headerNameRaw).trim();
              if(headerName && headerName === toExcelColumnLabel(headerCol)){
                classes.push('hot-excel-colheader');
              }
            }
            return classes.length ? classes.join(' ') : null;
          };
          const widthOverride = columnWidthOverrides.get(colId);
          colDef.width = Number.isFinite(widthOverride) && widthOverride > 0
            ? widthOverride
            : fixedDataColWidth;
          if(pinFirstDataColumn && colId === 'c0'){
            colDef.pinned = 'left';
            colDef.lockPinned = true;
          }
          if(typeof colDef.suppressMovable === 'undefined'){
            colDef.suppressMovable = false;
          }
          if(typeof colDef.sortable === 'undefined'){
            colDef.sortable = true;
          }
          if(!colDef.headerComponent){
            colDef.headerComponent = HotAgColumnHeader;
          }
          if(enableFormulaEvaluation){
            const formulaColIndex = Number(colId.slice(1));
            if(Number.isInteger(formulaColIndex) && formulaColIndex >= 0){
              const existingValueGetter = colDef.valueGetter;
              const existingValueSetter = colDef.valueSetter;
              colDef.valueGetter = params=>{
                const fallbackValue = typeof existingValueGetter === 'function'
                  ? existingValueGetter(params)
                  : (() => {
                    const physicalRow = Number(params?.data?.__rowIndex ?? params?.node?.data?.__rowIndex ?? params?.node?.rowIndex);
                    if(!Number.isInteger(physicalRow) || physicalRow < 0){
                      return '';
                    }
                    const rowValues = Array.isArray(dataHandle.current?.[physicalRow]) ? dataHandle.current[physicalRow] : [];
                    const value = rowValues[formulaColIndex];
                    return typeof value === 'undefined' ? '' : value;
                  })();
                const physicalRow = Number(params?.data?.__rowIndex ?? params?.node?.data?.__rowIndex ?? params?.node?.rowIndex);
                if(!Number.isInteger(physicalRow) || physicalRow < 0){
                  return fallbackValue;
                }
                return resolveFormulaDisplayValue(physicalRow, formulaColIndex, fallbackValue);
              };
              colDef.valueSetter = params=>{
                let wrote = true;
                if(typeof existingValueSetter === 'function'){
                  wrote = existingValueSetter(params);
                }else{
                  const matrix = dataHandle.current;
                  const physicalRow = Number(params?.data?.__rowIndex ?? params?.node?.data?.__rowIndex ?? params?.node?.rowIndex);
                  if(!Number.isInteger(physicalRow) || physicalRow < 0){
                    wrote = false;
                  }else{
                    ensureDims(matrix, Math.max(physicalRow + 1, rowCount), Math.max(formulaColIndex + 1, colCount));
                    matrix[physicalRow][formulaColIndex] = params?.newValue;
                    dataHandle.current = matrix;
                    wrote = true;
                  }
                }
                if(wrote === false){
                  return false;
                }
                const physicalRow = Number(params?.data?.__rowIndex ?? params?.node?.data?.__rowIndex ?? params?.node?.rowIndex);
                const synchronized = Number.isInteger(physicalRow) && physicalRow >= 0
                  ? setFormulaModelRawCell(physicalRow, formulaColIndex, params?.newValue, 'value-setter')
                  : false;
                if(!synchronized){
                  markFormulaModelDirty('value-setter-fallback');
                }
                return true;
              };
              if(!colDef.cellEditor && !colDef.cellEditorSelector){
                colDef.cellEditor = SharedFormulaCellEditor;
              }
            }
          }
        }
        const existing = colDef.cellClassRules && typeof colDef.cellClassRules === 'object'
          ? Object.assign({}, colDef.cellClassRules)
          : {};
        existing['hot-selected-cell'] = params=>{
          const activeSelection = getEffectiveSelectionRange();
          const rowIndex = resolveVisualRowIndex(params);
          const colId = params?.column?.getColId?.() ?? params?.colDef?.colId;
          if(!Number.isInteger(rowIndex)){
            return false;
          }
          const col = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          if(!Number.isInteger(col)){
            return false;
          }
          if(selectedHeaderColumns.size && selectedHeaderColumns.has(col)){
            return true;
          }
          if(!activeSelection){
            return false;
          }
          return rowIndex >= activeSelection.from.row
            && rowIndex <= activeSelection.to.row
            && col >= activeSelection.from.col
            && col <= activeSelection.to.col;
        };
        existing['hot-selected-range-fill'] = params=>{
          const activeSelection = getEffectiveSelectionRange();
          if(selectedHeaderColumns.size){
            return false;
          }
          if(!activeSelection){
            return false;
          }
          const rangeRows = activeSelection.to.row - activeSelection.from.row + 1;
          const rangeCols = activeSelection.to.col - activeSelection.from.col + 1;
          if(rangeRows <= 1 && rangeCols <= 1){
            return false;
          }
          const rowIndex = resolveVisualRowIndex(params);
          const colId = params?.column?.getColId?.() ?? params?.colDef?.colId;
          if(!Number.isInteger(rowIndex)){
            return false;
          }
          const col = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          if(!Number.isInteger(col)){
            return false;
          }
          const inRange = rowIndex >= activeSelection.from.row
            && rowIndex <= activeSelection.to.row
            && col >= activeSelection.from.col
            && col <= activeSelection.to.col;
          if(!inRange){
            return false;
          }
          const anchor = lastRange?.from;
          const anchorRow = Number(anchor?.row);
          const anchorCol = Number(anchor?.col);
          if(Number.isInteger(anchorRow) && Number.isInteger(anchorCol) && rowIndex === anchorRow && col === anchorCol){
            return false;
          }
          return true;
        };
        existing['hot-selected-anchor'] = params=>{
          const activeSelection = getEffectiveSelectionRange();
          if(selectedHeaderColumns.size){
            return false;
          }
          if(!activeSelection){
            return false;
          }
          const rowIndex = resolveVisualRowIndex(params);
          const colId = params?.column?.getColId?.() ?? params?.colDef?.colId;
          if(!Number.isInteger(rowIndex)){
            return false;
          }
          const col = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          if(!Number.isInteger(col)){
            return false;
          }
          const inRange = rowIndex >= activeSelection.from.row
            && rowIndex <= activeSelection.to.row
            && col >= activeSelection.from.col
            && col <= activeSelection.to.col;
          if(!inRange){
            return false;
          }
          const anchor = lastRange?.from;
          const anchorRow = Number(anchor?.row);
          const anchorCol = Number(anchor?.col);
          if(Number.isInteger(anchorRow) && Number.isInteger(anchorCol)){
            return rowIndex === anchorRow && col === anchorCol;
          }
          return rowIndex === activeSelection.from.row && col === activeSelection.from.col;
        };
        existing['hot-fill-preview-cell'] = params=>{
          const activeSelection = getEffectiveSelectionRange();
          if(!normalizedFillPreviewRange){
            return false;
          }
          const rowIndex = resolveVisualRowIndex(params);
          const colId = params?.column?.getColId?.() ?? params?.colDef?.colId;
          if(!Number.isInteger(rowIndex)){
            return false;
          }
          const col = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          if(!Number.isInteger(col)){
            return false;
          }
          if(activeSelection
            && rowIndex >= activeSelection.from.row
            && rowIndex <= activeSelection.to.row
            && col >= activeSelection.from.col
            && col <= activeSelection.to.col){
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
          if(isPinnedOrHeaderRow(physicalRow)){
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
          if(isPinnedOrHeaderRow(physicalRow)){
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
          if(isPinnedOrHeaderRow(physicalRow)){
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
          if(isPinnedOrHeaderRow(physicalRow)){
            return false;
          }
          const colId = params?.column?.getColId?.() ?? params?.colDef?.colId;
          const physicalCol = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          if(!Number.isInteger(physicalCol) || physicalCol < 0){
            return false;
          }
          return exclusionController.resolveCellState(physicalRow, physicalCol).fromCell;
        };
        colDef.cellClassRules = existing;
        return colDef;
      });
      const rowHeaderCol = buildRowHeaderColDef();
      const withNested = applyNestedHeadersToDefs(enhancedDataColumnDefs);
      return rowHeaderCol ? [rowHeaderCol, ...withNested] : withNested;
    };
    if(formulaEvaluationState.enabled){
      rebuildFormulaModelFromMatrix('initial');
    }
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
      if(Array.isArray(fallbackDisplayedPhysicalRows)){
        const physical = fallbackDisplayedPhysicalRows[row];
        return Number.isInteger(physical) && physical >= 0 ? physical : null;
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
    const syncFormulaModelForVisualChanges = (changesForHook, reason)=>{
      if(!formulaEvaluationState.enabled){
        return;
      }
      const list = Array.isArray(changesForHook) ? changesForHook : [];
      if(!list.length){
        return;
      }
      const model = ensureFormulaModelCurrent(reason || 'sync-visual-changes');
      if(!model){
        return;
      }
      const updates = [];
      for(let i = 0; i < list.length; i += 1){
        const entry = list[i];
        if(!Array.isArray(entry) || entry.length < 4){
          continue;
        }
        const visualRow = Number(entry[0]);
        const visualCol = Number(entry[1]);
        if(!Number.isInteger(visualRow) || visualRow < 0 || !Number.isInteger(visualCol) || visualCol < 0){
          continue;
        }
        const physicalRow = toPhysicalRowIndex(visualRow);
        const physicalCol = toPhysicalColIndex(visualCol);
        if(!Number.isInteger(physicalRow) || physicalRow < 0 || !Number.isInteger(physicalCol) || physicalCol < 0){
          continue;
        }
        updates.push({ row: physicalRow, col: physicalCol, value: entry[3] });
      }
      if(updates.length === 0){
        return;
      }
      try{
        if(typeof model.setCellsRaw === 'function'){
          model.setCellsRaw(updates);
        }else{
          for(let i = 0; i < updates.length; i += 1){
            const update = updates[i];
            model.setCellRaw(update.row, update.col, update.value);
          }
        }
      }catch(err){
        markFormulaModelDirty(reason || 'sync-visual-changes-error');
        return;
      }
      formulaEvaluationState.dirty = false;
      logFormulaEvaluationDebug('Debug: Shared.hot formula model synchronized from visual changes', {
        debugLabel,
        reason: reason || 'sync-visual-changes',
        synchronized: updates.length,
        batched: typeof model.setCellsRaw === 'function'
      });
    };

    const resolveSelectedColumnSpanForHeader = (colIdx)=>{
      const idx = Number(colIdx);
      if(!Number.isInteger(idx) || idx < 0){
        return { start: 0, count: 0 };
      }
      const headerSelection = resolveHeaderColumnSelectionInfo(idx);
      if(headerSelection.count){
        if(headerSelection.contiguous){
          return { start: headerSelection.start, count: headerSelection.count };
        }
        return { start: idx, count: 1 };
      }
      const normalized = getEffectiveSelectionRange();
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
      const normalized = getEffectiveSelectionRange();
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
      if(Array.isArray(fallbackDisplayedPhysicalRows)){
        return fallbackDisplayedPhysicalRows.length;
      }
      return dataHandle.current.length;
    };
    const updateSelectionFromApi = (api)=>{
      if(!api){
        return;
      }
      if(pendingSelectionReassertRange || selectionRangeOverride){
        return;
      }
      clearSelectedHeaderColumns();
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
            const nextRange = {
              from: { row: Math.min(startRow, endRow), col: Math.min(startCol, endCol) },
              to: { row: Math.max(startRow, endRow), col: Math.max(startCol, endCol) }
            };
            if(shouldIgnoreApiSelectionRange(nextRange)){
              return;
            }
            clearPasteDrivenSelectionState();
            setLastRange(nextRange);
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
            const nextRange = { from: { row, col }, to: { row, col } };
            if(shouldIgnoreApiSelectionRange(nextRange)){
              return;
            }
            clearPasteDrivenSelectionState();
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

    const resolveFillHandleViewport = (cell, options = {})=>{
      const preferPinnedTop = options?.preferPinnedTop === true;
      const resolveScopedViewport = (scope)=>{
        if(!scope || typeof scope.querySelector !== 'function'){
          return null;
        }
        return scope.querySelector('.ag-pinned-left-floating-top, .ag-pinned-right-floating-top, .ag-floating-top-viewport, .ag-pinned-top-viewport, .ag-center-cols-viewport, .ag-pinned-left-cols-viewport, .ag-pinned-right-cols-viewport');
      };
      if(cell && typeof cell.closest === 'function'){
        const scopedPinnedFloatingViewport = cell.closest('.ag-pinned-left-floating-top, .ag-pinned-right-floating-top');
        if(scopedPinnedFloatingViewport){
          return scopedPinnedFloatingViewport;
        }
        const scopedFloatingViewport = cell.closest('.ag-floating-top-viewport, .ag-pinned-top-viewport');
        if(scopedFloatingViewport){
          return scopedFloatingViewport;
        }
        const scopedFloatingSection = cell.closest('.ag-floating-top, .ag-pinned-top');
        if(scopedFloatingSection){
          return resolveScopedViewport(scopedFloatingSection) || scopedFloatingSection;
        }
        const scopedCenterViewport = cell.closest('.ag-center-cols-viewport');
        if(scopedCenterViewport){
          return scopedCenterViewport;
        }
        const scopedPinnedViewport = cell.closest('.ag-pinned-left-cols-viewport, .ag-pinned-right-cols-viewport');
        if(scopedPinnedViewport){
          return scopedPinnedViewport;
        }
        const scopedBodyViewport = cell.closest('.ag-body-viewport');
        if(scopedBodyViewport){
          return scopedBodyViewport;
        }
      }
      if(!container || typeof container.querySelector !== 'function'){
        return null;
      }
      if(preferPinnedTop){
        const globalFloatingViewport = container.querySelector('.ag-floating-top-viewport, .ag-pinned-top-viewport')
          || container.querySelector('.ag-floating-top .ag-pinned-left-floating-top, .ag-pinned-top .ag-pinned-left-floating-top')
          || container.querySelector('.ag-floating-top .ag-pinned-right-floating-top, .ag-pinned-top .ag-pinned-right-floating-top')
          || container.querySelector('.ag-floating-top .ag-center-cols-viewport, .ag-pinned-top .ag-center-cols-viewport')
          || container.querySelector('.ag-floating-top .ag-pinned-left-cols-viewport, .ag-pinned-top .ag-pinned-left-cols-viewport')
          || container.querySelector('.ag-floating-top .ag-pinned-right-cols-viewport, .ag-pinned-top .ag-pinned-right-cols-viewport')
          || container.querySelector('.ag-floating-top, .ag-pinned-top');
        if(globalFloatingViewport){
          return globalFloatingViewport;
        }
      }
      return container.querySelector('.ag-center-cols-viewport')
        || container.querySelector('.ag-pinned-left-cols-viewport')
        || container.querySelector('.ag-pinned-right-cols-viewport')
        || resolveViewport();
    };

    const scrollViewportToTop = ()=>{
      const viewport = resolveViewport();
      if(!viewport){
        return;
      }
      try{
        viewport.scrollTop = 0;
        viewport.scrollLeft = 0;
        syncPinnedTopRowScroll('scroll-top');
        schedulePinnedTopRowSync('scroll-top-follow');
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
        syncPinnedTopRowScroll('restore');
        schedulePinnedTopRowSync('restore-follow');
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
      selectionThreshold: 2,
      scheduleOnGrow: false
    };
    const autoGrowthConfig = Object.assign({}, autoGrowthDefaults, overrides?.autoGrowth || {});
    autoGrowthConfig.rowBatchSize = Math.max(1, autoGrowthConfig.rowBatchSize | 0);
    autoGrowthConfig.colBatchSize = Math.max(1, autoGrowthConfig.colBatchSize | 0);
    autoGrowthConfig.rowCap = Math.max(rowCount, autoGrowthConfig.rowCap | 0 || rowCount);
    autoGrowthConfig.colCap = Math.max(colCount, autoGrowthConfig.colCap | 0 || colCount);
    autoGrowthConfig.selectionThreshold = Math.max(0, autoGrowthConfig.selectionThreshold | 0);

    const shouldScheduleAutoGrowChange = (source)=>(
      source !== 'autoGrow' || !!autoGrowthConfig.scheduleOnGrow
    );

    const autoGrowthState = { viewportScrollAttached: false, viewportScrollHandler: null, scrollElements: [] };

    const shouldGrowRows = ()=>{
      if(!autoGrowthConfig.enabled){
        return false;
      }
      const totalRows = dataHandle.current.length;
      if(totalRows >= autoGrowthConfig.rowCap){
        return false;
      }
      const selection = getEffectiveSelectionRange();
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
      const selection = getEffectiveSelectionRange();
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
      if(autoGrowthConfig.scheduleOnGrow){
        triggerSchedule('autoGrowRows', { amount, reason });
      }
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
      if(autoGrowthConfig.scheduleOnGrow){
        triggerSchedule('autoGrowCols', { amount, reason });
      }
    };

    const ensureViewportScrollHandler = ()=>{
      const viewport = resolveViewport();
      if(!viewport || !container || typeof container.querySelector !== 'function'){
        return;
      }
      const centerViewport = container.querySelector('.ag-center-cols-viewport');
      const horizontalViewport = container.querySelector('.ag-body-horizontal-scroll-viewport');
      const horizontalScroll = container.querySelector('.ag-body-horizontal-scroll');
        if(!autoGrowthState.viewportScrollHandler){
        autoGrowthState.viewportScrollHandler = ()=>{
          maybeGrowRows('scroll');
          maybeGrowCols('scroll');
          syncPinnedTopRowScroll('scroll');
          schedulePinnedTopRowSync('scroll-follow');
          scheduleFillHandleUpdate('scroll');
        };
      }
      const handler = autoGrowthState.viewportScrollHandler;
      const existing = Array.isArray(autoGrowthState.scrollElements) ? autoGrowthState.scrollElements : [];
      const elements = [viewport, centerViewport, horizontalViewport, horizontalScroll].filter((el, idx, list)=>el && list.indexOf(el) === idx);
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
    const captureFilterState = ()=>cloneFilterState(exportActiveFilterState());
    const applyCapturedFilterState = (state, reason, options = {})=>{
      const normalized = cloneFilterState(state);
      const previous = captureFilterState();
      if(areFilterStatesEqual(previous, normalized)){
        return previous;
      }
      activeColumnFilters = new Map(Object.entries(normalized.columns || {}));
      notifyColumnFiltersChanged(reason || 'filter-change', {
        schedule: options.schedule !== false
      });
      return captureFilterState();
    };
    const recordFilterUndo = (label, prevState, nextState)=>{
      const before = cloneFilterState(prevState || captureFilterState());
      const after = cloneFilterState(nextState || captureFilterState());
      if(!hasGlobalUndo || undoLockDepth > 0 || areFilterStatesEqual(before, after)){
        return false;
      }
      undoManager.record({
        label: label || `table:${debugLabel}:filter`,
        scope: undoScope,
        undo: ()=>withUndoLock('undo:filter', ()=>applyCapturedFilterState(before, 'UndoRedo.undo.filter', { schedule: true })),
        redo: ()=>withUndoLock('redo:filter', ()=>applyCapturedFilterState(after, 'UndoRedo.redo.filter', { schedule: true }))
      });
      return true;
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

    const resolveColumnStateApi = (api)=>{
      const candidates = [
        api?.columnApi,
        instance?.columnApi,
        api,
        instance?.gridApi
      ];
      for(let i = 0; i < candidates.length; i++){
        const candidate = candidates[i];
        if(candidate && typeof candidate.getColumnState === 'function'){
          return candidate;
        }
      }
      return null;
    };

    const captureColumnWidths = (api)=>{
      const columnStateApi = resolveColumnStateApi(api);
      if(!columnStateApi){
        return null;
      }
      try{
        const state = columnStateApi.getColumnState() || [];
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
      const columnStateApi = resolveColumnStateApi(api);
      if(!columnStateApi || typeof columnStateApi.applyColumnState !== 'function'){
        return;
      }
      try{
        const state = Array.from(widths.entries()).map(([colId, width])=>({ colId, width }));
        columnStateApi.applyColumnState({ state, applyOrder: false });
      }catch(err){
        // best-effort only
      }
    };

    const persistColumnWidthOverrides = (api, reason)=>{
      const widths = captureColumnWidths(api);
      if(!widths || !widths.size){
        return;
      }
      widths.forEach((width, colId)=>{
        if(typeof colId !== 'string' || !colId.startsWith('c')){
          return;
        }
        if(Number.isFinite(width) && width > 0){
          columnWidthOverrides.set(colId, width);
        }
      });
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot persisted column width overrides', {
          debugLabel,
          reason,
          count: columnWidthOverrides.size
        });
      }
    };

    const applyRowData = (api, rows)=>{
      if(!api || !Array.isArray(rows)){
        return;
      }
      try{
        if(typeof api.setGridOption === 'function'){
          api.setGridOption('rowData', rows);
          applyPinnedTopRowData(api);
          return;
        }
        if(typeof api.setRowData === 'function'){
          api.setRowData(rows);
        }
        applyPinnedTopRowData(api);
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

    const applyVirtualizationState = (api, nextState, reason)=>{
      if(!nextState || !nextState.enabled){
        virtualizationState = nextState || virtualizationState;
        return;
      }
      const updates = {};
      if(Number.isFinite(nextState.rowBuffer) && nextState.rowBuffer >= 0){
        updates.rowBuffer = nextState.rowBuffer;
      }
      if(Number.isFinite(nextState.columnBuffer) && nextState.columnBuffer >= 0){
        updates.columnBuffer = nextState.columnBuffer;
      }
      if(typeof nextState.suppressColumnVirtualisation === 'boolean'){
        updates.suppressColumnVirtualisation = nextState.suppressColumnVirtualisation;
      }
      const hasUpdates = Object.keys(updates).length > 0;
      virtualizationState = nextState;
      if(!api || !hasUpdates){
        return;
      }
      try{
        if(typeof api.setGridOption === 'function'){
          Object.keys(updates).forEach((key)=>{
            api.setGridOption(key, updates[key]);
          });
        }else{
          Object.assign(api, updates);
        }
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot virtualization updated', Object.assign({ debugLabel, reason }, updates));
        }
      }catch(err){
        console.error('Shared.hot AG virtualization update error', err);
      }
    };

    const updateVirtualizationState = (reason)=>{
      const nextState = resolveVirtualizationState(getDataShape());
      if(virtualizationStateMatches(virtualizationState, nextState)){
        return;
      }
      applyVirtualizationState(instance?.gridApi, nextState, reason || 'update');
    };

    const mergeScheduleInvalidation = (prevValue, nextValue)=>{
      const prev = typeof prevValue === 'string' ? prevValue : '';
      const next = typeof nextValue === 'string' ? nextValue : '';
      if(prev === 'data' || next === 'data'){
        return 'data';
      }
      if(prev === 'layout' || next === 'layout'){
        return 'layout';
      }
      if(prev === 'style' || next === 'style'){
        return 'style';
      }
      return next || prev || null;
    };
    const classifyScheduleInvalidation = (reason, payload)=>{
      const currentReason = typeof reason === 'string' ? reason : '';
      const source = typeof payload?.source === 'string' ? payload.source : '';
      if(
        currentReason === 'afterChange'
        || currentReason === 'afterPaste'
        || currentReason === 'afterLoadData'
        || currentReason === 'afterCreateRow'
        || currentReason === 'afterRemoveRow'
        || currentReason === 'afterCreateCol'
        || currentReason === 'afterRemoveCol'
        || currentReason === 'exclusion-change'
        || currentReason === 'autoGrowRows'
        || currentReason === 'autoGrowCols'
      ){
        return 'data';
      }
      if(currentReason === 'afterColumnMove'){
        return 'layout';
      }
      if(currentReason === 'updateSettings'){
        if(source === 'columnMove' || source === 'afterColumnMove'){
          return 'layout';
        }
        return 'data';
      }
      return null;
    };
    const triggerSchedule = (reason, meta)=>{
      if(!scheduleFn){
        return;
      }
      const payload = Object.assign({ reason }, meta || {});
      if(!payload.invalidate){
        const inferredInvalidate = classifyScheduleInvalidation(reason, payload);
        if(inferredInvalidate){
          payload.invalidate = inferredInvalidate;
        }
      }
      if(batchDepth > 0){
        if(pendingSchedulePayload && typeof pendingSchedulePayload === 'object'){
          pendingSchedulePayload = Object.assign({}, pendingSchedulePayload, payload, {
            invalidate: mergeScheduleInvalidation(pendingSchedulePayload.invalidate, payload.invalidate)
          });
        }else{
          pendingSchedulePayload = payload;
        }
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
      if(formulaEvaluationState.enabled){
        ensureFormulaModelCurrent('render');
      }
      if(api && typeof api.refreshHeader === 'function'){
        try{
          api.refreshHeader();
        }catch(err){
          console.error('Shared.hot AG refreshHeader error', err);
        }
      }
      if(api && typeof api.refreshCells === 'function'){
        try{
          api.refreshCells({ force: true });
        }catch(err){
          console.error('Shared.hot AG refreshCells error', err);
        }
      }
      scheduleFillHandleUpdate('render');
      if(formulaReferenceOverlayState.ranges.length){
        scheduleFormulaReferenceOverlayRender('render');
      }
    };

 


    const pruneColumnWidthOverrides = ()=>{
      if(!columnWidthOverrides.size){
        return;
      }
      const validIds = new Set(Array.from({ length: Math.max(0, colCount) }, (_, idx)=>`c${idx}`));
      Array.from(columnWidthOverrides.keys()).forEach(colId=>{
        if(!validIds.has(colId)){
          columnWidthOverrides.delete(colId);
        }
      });
    };

    const rebuildColumns = (api)=>{
      if(batchDepth > 0){
        pendingRebuildColumns = true;
        return;
      }
      updateVirtualizationState('rebuildColumns');
      const preservedWidths = captureColumnWidths(api);
      if(preservedWidths?.size){
        preservedWidths.forEach((width, colId)=>{
          if(typeof colId === 'string' && colId.startsWith('c') && Number.isFinite(width) && width > 0){
            columnWidthOverrides.set(colId, width);
          }
        });
      }
      pruneColumnWidthOverrides();
      columnDefs = buildColumnDefs();
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
      updateVirtualizationState('syncRowData');
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
      markFormulaModelDirty('append-rows');

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
      refreshColumnFiltersForDataMutation('append-rows');
    };

    const flushBatch = ()=>{
      if(batchDepth > 0){
        return;
      }
      const api = instance.gridApi;
      if(pendingSyncRowData){
        pendingSyncRowData = false;
        updateVirtualizationState('flushBatch');
        applyRowData(api, rowData);
        restoreViewportScroll();
      }
      if(pendingRebuildColumns){
        pendingRebuildColumns = false;
        updateVirtualizationState('flushBatch-columns');
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
      __hotInstanceId: hotInstanceId,
      __hotDebugLabel: debugLabel,
      __hotExclusionController: exclusionController,
      __hotSetClipboardOutlineState(payload, reason, options){
        return setClipboardOutlineState(payload, reason, options);
      },
      __hotClearClipboardOutline(){
        setClipboardOutlineState(null, 'instance-clear-clipboard-outline');
      },
      __hotClearCopyHighlight(){
        return this.__hotClearClipboardOutline();
      },
      __hotRefreshHeaderWidths: noop,
      __hotHeaderWidthManager: headerWidthManager,
      setFormulaReferenceOverlay(rawFormula, options){
        return setFormulaReferenceOverlay(rawFormula, options);
      },
      clearFormulaReferenceOverlay(options){
        clearFormulaReferenceOverlay(options);
      },
      refreshFormulaReferenceOverlay(reason){
        return refreshFormulaReferenceOverlay(reason);
      },
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
        let pinConfigChanged = false;
        let formulaSettingsChanged = false;
        const hasIncomingData = Object.prototype.hasOwnProperty.call(opts, 'data') && Array.isArray(opts.data);
        const existingExclusions = hasIncomingData && preserveExclusionsOnLoad ? exclusionController.exportState() : null;
        const hasMinRows = Number.isFinite(opts.minRows);
        const hasMinCols = Number.isFinite(opts.minCols);
        const trimIncoming = hasIncomingData && (opts.trimData === true || opts.allowShrink === true);
        const debugEnabled = typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled();
        const prevColCount = colCount;

        if(treatFirstRowAsHeader){
          if(Object.prototype.hasOwnProperty.call(opts, 'headerRowIndex')){
            const nextHeaderRowIndex = Number.isInteger(opts.headerRowIndex)
              ? Math.max(0, opts.headerRowIndex)
              : headerRowIndex;
            if(nextHeaderRowIndex !== headerRowIndex){
              headerRowIndex = nextHeaderRowIndex;
              formulaSettingsChanged = true;
            }
          }
          if(Object.prototype.hasOwnProperty.call(opts, 'headerRowCount')){
            const nextHeaderRowCount = Number.isInteger(opts.headerRowCount)
              ? Math.max(1, opts.headerRowCount)
              : headerRowCount;
            if(nextHeaderRowCount !== headerRowCount){
              headerRowCount = nextHeaderRowCount;
              formulaSettingsChanged = true;
            }
          }
        }
        if(shouldPinRows && Object.prototype.hasOwnProperty.call(opts, 'pinFirstRow')){
          const rawPinFirstRow = opts.pinFirstRow;
          const nextPinRowCount = Number.isInteger(rawPinFirstRow)
            ? Math.max(0, rawPinFirstRow)
            : (rawPinFirstRow === true ? 1 : 0);
          if(nextPinRowCount !== pinRowCount){
            pinRowCount = nextPinRowCount;
            pinConfigChanged = true;
          }
        }

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
        if(formulaEvaluationState.enabled && (formulaSettingsChanged || needsSync || needsRebuild)){
          markFormulaModelDirty('update-settings');
        }
        if(needsSync){
          syncRowData(instance.gridApi);
        }
        if(needsRebuild){
          rebuildColumns(instance.gridApi);
        }
        if(needsSync || needsRebuild){
          refreshColumnFiltersForDataMutation('update-settings');
        }
        if (pinConfigChanged) {
          applyPinnedTopRowData(instance.gridApi);

          // When pinFirstRow changes, AG Grid may keep stale internal rowTop values
          // for the first render pass. That produces a 1-row blank band.
          // Force a full height + rowTop recompute now, and again on next frame.
          try {
            const api = instance.gridApi;

            if (api && typeof api.resetRowHeights === "function") {
              api.resetRowHeights();

              if (typeof api.onRowHeightChanged === "function") {
                api.onRowHeightChanged();
              }

              if (debugEnabled) {
                console.debug("Debug: Shared.hot pinFirstRow height recompute (immediate)", {
                  debugLabel,
                  pinRowCount,
                  usePinnedRows,
                });
              }
            }

            // Extra pass next frame to catch the first-layout timing issue.
            if (api && typeof requestAnimationFrame === "function") {
              requestAnimationFrame(() => {
                try {
                  if (typeof api.resetRowHeights === "function") {
                    api.resetRowHeights();
                  }
                  if (typeof api.onRowHeightChanged === "function") {
                    api.onRowHeightChanged();
                  }
                  if (typeof api.redrawRows === "function") {
                    api.redrawRows();
                  } else if (typeof api.refreshCells === "function") {
                    api.refreshCells({ force: true });
                  }

                  if (debugEnabled) {
                    console.debug("Debug: Shared.hot pinFirstRow height recompute (raf)", {
                      debugLabel,
                      pinRowCount,
                      usePinnedRows,
                    });
                  }
                } catch (err2) {
                  console.error("Shared.hot pinFirstRow raf recompute error", {
                    debugLabel,
                    message: err2?.message || String(err2),
                  });
                }
              });
            }
          } catch (err) {
            console.error("Shared.hot pinFirstRow recompute error", {
              debugLabel,
              message: err?.message || String(err),
            });
          }
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
      countRows(){ return getVisualRowCount(); },
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
        const selection = getEffectiveSelectionRange();
        if(!selection){
          return null;
        }
        return [
          selection.from.row,
          selection.from.col,
          selection.to.row,
          selection.to.col
        ];
      },
      getSelectedRangeLast(){
        const selection = getEffectiveSelectionRange();
        return selection ? Object.assign({}, selection) : null;
      },
      selectCell(row, col, endRow, endCol){
        clearPasteDrivenSelectionState();
        const r1 = Number(row);
        const c1 = Number(col);
        const r2 = Number.isFinite(endRow) ? Number(endRow) : r1;
        const c2 = Number.isFinite(endCol) ? Number(endCol) : c1;
        setLastRange({ from: { row: r1, col: c1 }, to: { row: r2, col: c2 } });
        renderAg(instance.gridApi);
        const normalized = getEffectiveSelectionRange() || { from: { row: r1, col: c1 }, to: { row: r2, col: c2 } };
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
      __hotGetDisplayDataAtCell(row, col){
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
        const rawValue = matrix[physicalRow]?.[physicalCol];
        return resolveFormulaDisplayValue(physicalRow, physicalCol, rawValue);
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
          syncFormulaModelForVisualChanges(changesForHook, 'set-data-at-cell:batch');
          if(data.length !== prevRows){
            syncRowData(instance.gridApi);
          }
          if(colCount !== prevCols){
            colHeaders = resolveColHeaders(colCount);
            rebuildColumns(instance.gridApi);
          }
          refreshColumnFiltersForDataMutation('set-data-at-cell:batch');
          captureLockedMutationChanges(changesForHook);
          recordUndoFromVisualChanges(changeSource, changesForHook, changeSource);
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
        const synchronized = setFormulaModelRawCell(physicalRow, physicalCol, value, 'set-data-at-cell:single');
        if(formulaEvaluationState.enabled && !synchronized){
          markFormulaModelDirty('set-data-at-cell:single');
        }
        if(colCount !== prevCols){
          colHeaders = resolveColHeaders(colCount);
          rebuildColumns(instance.gridApi);
        }
        refreshColumnFiltersForDataMutation('set-data-at-cell:single');
        captureLockedMutationChanges([[r, c, prev, value]]);
        recordUndoFromVisualChanges(changeSource, [[r, c, prev, value]], changeSource);
        fireHook('afterChange', [[r, c, prev, value]], changeSource);
        triggerSchedule('afterChange', { source: changeSource });
        renderAg(instance.gridApi);
      },
      loadData(nextData, loadOptions){
        const options = normalizeLoadDataOptions(loadOptions);
        const isUndoSource = typeof options.source === 'string' && options.source.startsWith('UndoRedo.');
        const shouldRecordUndo = !!(
          options.recordUndo
          && !options.skipUndo
          && !isUndoSource
          && hasGlobalUndo
          && undoLockDepth === 0
        );
        let beforeSnapshot = null;
        if(shouldRecordUndo){
          beforeSnapshot = captureLoadDataUndoSnapshot(options.maxUndoCells);
          if(beforeSnapshot.kind !== 'full' && typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot loadData undo snapshot skipped (before)', {
              debugLabel,
              source: options.source,
              kind: beforeSnapshot.kind || 'unknown',
              totalCells: beforeSnapshot.totalCells || null,
              maxCells: beforeSnapshot.maxCells || null
            });
          }
        }

        applyLoadDataMatrix(nextData, { source: options.source });

        if(!shouldRecordUndo || !beforeSnapshot || beforeSnapshot.kind !== 'full'){
          return;
        }

        const afterSnapshot = captureLoadDataUndoSnapshot(options.maxUndoCells);
        if(afterSnapshot.kind !== 'full'){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot loadData undo snapshot skipped (after)', {
              debugLabel,
              source: options.source,
              kind: afterSnapshot.kind || 'unknown',
              totalCells: afterSnapshot.totalCells || null,
              maxCells: afterSnapshot.maxCells || null
            });
          }
          return;
        }
        if(areLoadDataSnapshotsEqual(beforeSnapshot, afterSnapshot)){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot loadData undo skipped (no changes)', {
              debugLabel,
              source: options.source
            });
          }
          return;
        }

        undoManager.record({
          label: options.undoLabel || `table:${debugLabel}:${options.source || 'loadData'}`,
          scope: undoScope,
          undo: ()=>applyLoadDataUndoSnapshot(beforeSnapshot, 'UndoRedo.undo.loadData'),
          redo: ()=>applyLoadDataUndoSnapshot(afterSnapshot, 'UndoRedo.redo.loadData')
        });

        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot loadData undo recorded', {
            debugLabel,
            source: options.source,
            rowCount: afterSnapshot.rowCount,
            colCount: afterSnapshot.colCount
          });
        }
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
          markFormulaModelDirty('alter:insert-row');
          syncRowData(instance.gridApi);
          refreshColumnFiltersForDataMutation('alter:insert-row');
          fireHook('afterCreateRow', insertAt, safeAmount, changeSource);
          if(shouldScheduleAutoGrowChange(changeSource)){
            triggerSchedule('afterCreateRow', { source: changeSource });
          }
        }else if(action === 'remove_row'){
          const removed = data.splice(at, safeAmount);
          exclusionController.shiftRowsForRemoval(Array.from({ length: safeAmount }, (_, idx)=>at + idx));
          ensureDims(data, rowCount, colCount);
          dataHandle.current = data;
          markFormulaModelDirty('alter:remove-row');
          syncRowData(instance.gridApi);
          refreshColumnFiltersForDataMutation('alter:remove-row');
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
          markFormulaModelDirty('alter:insert-col');
          if(Array.isArray(colHeadersSetting)){
            colHeadersSetting.splice(insertAt, 0, ...Array.from({ length: safeAmount }, ()=>''));
          }
            colCount = Math.max(colCount + safeAmount, MIN_INPUT_COLS);
            ensureDims(data, data.length, colCount);
            colHeaders = resolveColHeaders(colCount);
            rebuildColumns(instance.gridApi);
            refreshColumnFiltersForDataMutation('alter:insert-col');
            renderAg(instance.gridApi);
            fireHook('afterCreateCol', insertAt, safeAmount, changeSource);
            if(shouldScheduleAutoGrowChange(changeSource)){
              triggerSchedule('afterCreateCol', { source: changeSource });
            }
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
          markFormulaModelDirty('alter:remove-col');
          colCount = Math.max(MIN_INPUT_COLS, colCount - safeAmount);
          ensureDims(data, data.length, colCount);
          colHeaders = resolveColHeaders(colCount);
          rebuildColumns(instance.gridApi);
          refreshColumnFiltersForDataMutation('alter:remove-col');
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
        syncFormulaModelForVisualChanges(changes, 'populate-from-array');
        syncRowData(instance.gridApi);
        rebuildColumns(instance.gridApi);
        refreshColumnFiltersForDataMutation('populate-from-array');
        if(changes.length){
          const sourceLabel = typeof source === 'string' ? source : 'populateFromArray';
          captureLockedMutationChanges(changes);
          recordUndoFromVisualChanges(sourceLabel, changes, sourceLabel);
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
        invalidatePendingClipboardMove('destroy', pending => pending?.sourceInstance === instance);
        if(hotNS.__activeClipboardSelectionOwner === instance){
          hotNS.__activeClipboardSelectionOwner = null;
        }
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
          markFormulaModelDirty('_data-setter');
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
        markFormulaModelDirty('_settings-setter');
        syncRowData(instance.gridApi);
        rebuildColumns(instance.gridApi);
        renderAg(instance.gridApi);
      }
    });

    let customContextMenu = null;
    let customContextMenuCleanup = null;
    const closeCustomMenu = ()=>{
      if(typeof customContextMenuCleanup === 'function'){
        try{
          customContextMenuCleanup();
        }catch(err){
          // ignore popup cleanup failures
        }
      }
      customContextMenuCleanup = null;
      if(customContextMenu && customContextMenu.parentNode){
        customContextMenu.parentNode.removeChild(customContextMenu);
      }
      customContextMenu = null;
    };
    const positionCustomPopup = (popup, options = {})=>{
      const doc = container?.ownerDocument || document;
      const win = doc?.defaultView || global;
      const viewportWidth = Number(win?.innerWidth || doc?.documentElement?.clientWidth || 0);
      const viewportHeight = Number(win?.innerHeight || doc?.documentElement?.clientHeight || 0);
      const anchorRect = options.anchorRect || null;
      let left = Number(options.left);
      let top = Number(options.top);
      if(!Number.isFinite(left)){
        left = anchorRect ? anchorRect.left : 4;
      }
      if(!Number.isFinite(top)){
        top = anchorRect ? anchorRect.bottom + 4 : 4;
      }
      const width = popup.offsetWidth || Number(options.width) || 0;
      const height = popup.offsetHeight || Number(options.height) || 0;
      if(viewportWidth > 0 && width > 0){
        left = Math.min(Math.max(4, left), Math.max(4, viewportWidth - width - 4));
      }else{
        left = Math.max(4, left);
      }
      if(viewportHeight > 0 && height > 0){
        const preferredAbove = anchorRect ? (anchorRect.top - height - 4) : null;
        if(anchorRect && top + height > viewportHeight - 4 && Number.isFinite(preferredAbove) && preferredAbove >= 4){
          top = preferredAbove;
        }else{
          top = Math.min(Math.max(4, top), Math.max(4, viewportHeight - height - 4));
        }
      }else{
        top = Math.max(4, top);
      }
      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;
    };
    const attachPopupDismissHandlers = (popup, options = {})=>{
      const doc = container?.ownerDocument || document;
      const win = doc?.defaultView || global;
      const anchor = options.anchor || null;
      const isWithinPopupOrAnchor = (target)=>{
        if(!target || target.nodeType !== 1){
          return false;
        }
        return popup.contains(target) || !!(anchor && anchor.contains?.(target));
      };
      const handlePointerDown = (event)=>{
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(!target){
          return;
        }
        if(isWithinPopupOrAnchor(target)){
          return;
        }
        closeCustomMenu();
      };
      const handleKeyDown = (event)=>{
        if((event?.key || '') === 'Escape'){
          event.preventDefault?.();
          closeCustomMenu();
        }
      };
      const handleViewportChange = (event)=>{
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(isWithinPopupOrAnchor(target)){
          return;
        }
        closeCustomMenu();
      };
      doc.addEventListener('mousedown', handlePointerDown, true);
      doc.addEventListener('keydown', handleKeyDown, true);
      win?.addEventListener?.('resize', handleViewportChange, true);
      win?.addEventListener?.('scroll', handleViewportChange, true);
      return ()=>{
        doc.removeEventListener('mousedown', handlePointerDown, true);
        doc.removeEventListener('keydown', handleKeyDown, true);
        win?.removeEventListener?.('resize', handleViewportChange, true);
        win?.removeEventListener?.('scroll', handleViewportChange, true);
      };
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
      const handleAutoClose = ()=>closeCustomMenu();
      doc.addEventListener('click', handleAutoClose, { once: true });
      customContextMenuCleanup = ()=>{
        doc.removeEventListener('click', handleAutoClose);
      };
    };

    const applyColumnSortState = (colId, nextSort, multiSort)=>{
      const apiRef = instance?.gridApi || null;
      const columnStateApi = instance?.columnApi || apiRef?.columnApi || null;
      const applyColumnState = (apiRef && typeof apiRef.applyColumnState === 'function')
        ? apiRef.applyColumnState.bind(apiRef)
        : (columnStateApi && typeof columnStateApi.applyColumnState === 'function')
          ? columnStateApi.applyColumnState.bind(columnStateApi)
          : null;
      if(!applyColumnState || typeof colId !== 'string' || !colId){
        return false;
      }
      try{
        const payload = {
          state: [{ colId, sort: nextSort || null }]
        };
        if(!multiSort){
          payload.defaultState = { sort: null };
        }
        applyColumnState(payload);
        return true;
      }catch(sortErr){
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot applyColumnSortState failed', {
            debugLabel,
            colId,
            sort: nextSort || null,
            error: sortErr?.message || String(sortErr)
          });
        }
        return false;
      }
    };
    const getColumnSortState = (colId)=>{
      const apiRef = instance?.gridApi || null;
      const columnStateApi = resolveColumnStateApi(apiRef);
      if(!columnStateApi || typeof columnStateApi.getColumnState !== 'function'){
        return '';
      }
      try{
        const state = columnStateApi.getColumnState() || [];
        const entry = Array.isArray(state) ? state.find(item => item?.colId === colId) : null;
        return entry?.sort === 'asc' || entry?.sort === 'desc' ? entry.sort : '';
      }catch(err){
        return '';
      }
    };

    const openColumnFilterMenu = (anchorEl, colIdx)=>{
      const idx = Number(colIdx);
      if(!Number.isInteger(idx) || idx < 0 || idx >= colCount){
        return;
      }
      const existingColId = customContextMenu?.getAttribute?.('data-col-id') || null;
      const isSameFilterMenu = customContextMenu?.getAttribute?.('data-menu-type') === 'filter'
        && existingColId === `c${idx}`;
      if(isSameFilterMenu){
        closeCustomMenu();
        return;
      }
      closeCustomMenu();
      const doc = container?.ownerDocument || document;
      const colId = `c${idx}`;
      const context = buildColumnFilterContext(idx);
      const currentModel = cloneFilterModel(activeColumnFilters.get(colId));
      const currentSort = getColumnSortState(colId);
      const popup = doc.createElement('div');
      popup.className = 'ag-hot-menu ag-hot-filter-menu';
      popup.setAttribute('data-menu-type', 'filter');
      popup.setAttribute('data-col-id', colId);
      popup.setAttribute('role', 'dialog');
      popup.setAttribute('aria-label', `Filter ${colHeaders?.[idx] || toExcelColumnLabel(idx)}`);
      popup.style.position = 'fixed';
      popup.style.zIndex = '10020';
      popup.style.minWidth = '260px';
      popup.style.maxWidth = '320px';

      const sortSection = doc.createElement('div');
      sortSection.className = 'ag-hot-filter-menu__sort';
      const buildSortButton = (label, sortValue)=>{
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'ag-hot-filter-menu__sort-button';
        button.textContent = label;
        const isActive = (sortValue || '') === currentSort;
        button.disabled = sortValue === null ? !currentSort : isActive;
        button.classList.toggle('is-active', isActive);
        button.addEventListener('click', ()=>{
          armSortSelectionSnapshot();
          if(applyColumnSortState(colId, sortValue, false)){
            closeCustomMenu();
          }
        });
        return button;
      };
      if(context.columnType === 'numeric'){
        sortSection.appendChild(buildSortButton('Sort smallest to largest', 'asc'));
        sortSection.appendChild(buildSortButton('Sort largest to smallest', 'desc'));
      }else{
        sortSection.appendChild(buildSortButton('Sort A to Z', 'asc'));
        sortSection.appendChild(buildSortButton('Sort Z to A', 'desc'));
      }
      sortSection.appendChild(buildSortButton('Clear sort', null));
      popup.appendChild(sortSection);

      const modeLabel = doc.createElement('label');
      modeLabel.className = 'ag-hot-filter-menu__label';
      modeLabel.textContent = 'Filter';
      popup.appendChild(modeLabel);

      const modeSelect = doc.createElement('select');
      modeSelect.className = 'ag-hot-filter-menu__select';
      const modeOptions = [{ value: FILTER_KIND_SET, label: 'Selected values' }];
      modeOptions.push({ value: 'isBlank', label: 'Is blank' });
      modeOptions.push({ value: 'isNotBlank', label: 'Is not blank' });
      modeOptions.push({ value: 'equals', label: 'Equals' });
      modeOptions.push({ value: 'notEqual', label: 'Does not equal' });
      if(context.columnType !== 'numeric'){
        modeOptions.push({ value: 'contains', label: 'Contains' });
        modeOptions.push({ value: 'notContains', label: 'Does not contain' });
        modeOptions.push({ value: 'startsWith', label: 'Starts with' });
        modeOptions.push({ value: 'endsWith', label: 'Ends with' });
      }
      if(context.columnType !== 'text'){
        modeOptions.push({ value: 'greaterThan', label: 'Greater than' });
        modeOptions.push({ value: 'greaterThanOrEqual', label: 'Greater than or equal' });
        modeOptions.push({ value: 'lessThan', label: 'Less than' });
        modeOptions.push({ value: 'lessThanOrEqual', label: 'Less than or equal' });
        modeOptions.push({ value: 'between', label: 'Between' });
        modeOptions.push({ value: 'topN', label: 'Top N' });
        modeOptions.push({ value: 'aboveAverage', label: 'Above average' });
        modeOptions.push({ value: 'belowAverage', label: 'Below average' });
      }
      modeOptions.forEach(option=>{
        const entry = doc.createElement('option');
        entry.value = option.value;
        entry.textContent = option.label;
        modeSelect.appendChild(entry);
      });
      popup.appendChild(modeSelect);

      const searchInput = doc.createElement('input');
      searchInput.type = 'search';
      searchInput.className = 'ag-hot-filter-menu__search';
      searchInput.placeholder = 'Search values';

      const valueSelectRow = doc.createElement('label');
      valueSelectRow.className = 'ag-hot-filter-menu__check';
      const valueSelectAll = doc.createElement('input');
      valueSelectAll.type = 'checkbox';
      const valueSelectAllText = doc.createElement('span');
      valueSelectAllText.textContent = '(Select all shown)';
      valueSelectRow.appendChild(valueSelectAll);
      valueSelectRow.appendChild(valueSelectAllText);

      const valueSummary = doc.createElement('div');
      valueSummary.className = 'ag-hot-filter-menu__summary';

      const valueList = doc.createElement('div');
      valueList.className = 'ag-hot-filter-menu__values';
      valueList.style.maxHeight = '108px';

      const hint = doc.createElement('div');
      hint.className = 'ag-hot-filter-menu__hint';

      const inputWrap = doc.createElement('div');
      inputWrap.className = 'ag-hot-filter-menu__inputs';
      const valueInput = doc.createElement('input');
      valueInput.type = 'text';
      valueInput.className = 'ag-hot-filter-menu__input';
      valueInput.placeholder = 'Value';
      const valueToInput = doc.createElement('input');
      valueToInput.type = 'text';
      valueToInput.className = 'ag-hot-filter-menu__input';
      valueToInput.placeholder = 'And';
      inputWrap.appendChild(valueInput);
      inputWrap.appendChild(valueToInput);

      popup.appendChild(searchInput);
      popup.appendChild(valueSelectRow);
      popup.appendChild(valueSummary);
      popup.appendChild(valueList);
      popup.appendChild(hint);
      popup.appendChild(inputWrap);

      const footer = doc.createElement('div');
      footer.className = 'ag-hot-filter-menu__footer';
      const applyButton = doc.createElement('button');
      applyButton.type = 'button';
      applyButton.className = 'ag-hot-filter-menu__button';
      applyButton.textContent = 'OK';
      const clearButton = doc.createElement('button');
      clearButton.type = 'button';
      clearButton.className = 'ag-hot-filter-menu__button';
      clearButton.textContent = 'Clear';
      const cancelButton = doc.createElement('button');
      cancelButton.type = 'button';
      cancelButton.className = 'ag-hot-filter-menu__button';
      cancelButton.textContent = 'Cancel';
      footer.appendChild(applyButton);
      footer.appendChild(clearButton);
      footer.appendChild(cancelButton);
      popup.appendChild(footer);

      const focusPreferredField = ()=>{
        const mode = modeSelect.value || FILTER_KIND_SET;
        if(mode === FILTER_KIND_SET && !searchInput.hidden && !searchInput.disabled){
          searchInput.focus?.();
          searchInput.select?.();
          return;
        }
        if(!inputWrap.hidden && !valueInput.hidden && !valueInput.disabled){
          valueInput.focus?.();
          valueInput.select?.();
          return;
        }
        modeSelect.focus?.();
      };
      const setPopupSectionVisible = (element, visible)=>{
        if(!element){
          return;
        }
        element.hidden = !visible;
        if(visible){
          element.style.removeProperty('display');
        }else{
          element.style.display = 'none';
        }
      };

      let selectedKeys = new Set(
        currentModel?.kind === FILTER_KIND_SET
          ? normalizeFilterSelectionValues(currentModel.selected)
          : context.uniqueOptions.map(option => option.key)
      );
      const getCurrentSearchNeedle = ()=>String(searchInput.value || '').trim().toLowerCase();
      const getMatchingOptions = ()=>{
        const needle = getCurrentSearchNeedle();
        return context.uniqueOptions.filter(option=>{
          if(!needle){
            return true;
          }
          return option.label.toLowerCase().includes(needle);
        });
      };

      const renderValueList = ()=>{
        const needle = getCurrentSearchNeedle();
        const matching = getMatchingOptions();
        const visible = matching.slice(0, FILTER_MENU_MAX_VISIBLE_VALUES);
        const selectedMatchingCount = matching.filter(option => selectedKeys.has(option.key)).length;
        valueSummary.textContent = needle
          ? `${selectedMatchingCount} of ${matching.length} matching values selected`
          : `${selectedKeys.size} of ${context.uniqueOptions.length} values selected`;
        const allShownSelected = matching.length > 0 && matching.every(option => selectedKeys.has(option.key));
        valueSelectAll.checked = allShownSelected;
        valueSelectAll.indeterminate = !allShownSelected && matching.some(option => selectedKeys.has(option.key));
        valueSelectAll.disabled = matching.length === 0;
        valueSelectAllText.textContent = needle ? '(Select all matching)' : '(Select all)';
        valueList.innerHTML = '';
        visible.forEach(option=>{
          const row = doc.createElement('label');
          row.className = 'ag-hot-filter-menu__check';
          const checkbox = doc.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = selectedKeys.has(option.key);
          checkbox.addEventListener('change', ()=>{
            if(checkbox.checked){
              selectedKeys.add(option.key);
            }else{
              selectedKeys.delete(option.key);
            }
            renderValueList();
          });
          const text = doc.createElement('span');
          text.textContent = option.count > 1 ? `${option.label} (${option.count})` : option.label;
          row.appendChild(checkbox);
          row.appendChild(text);
          valueList.appendChild(row);
        });
        if(matching.length > visible.length){
          hint.classList.remove('is-error');
          hint.textContent = `Showing ${visible.length} of ${matching.length} matching values. Refine the search to narrow the list.`;
        }else if(!matching.length){
          hint.classList.remove('is-error');
          hint.textContent = 'No matching values.';
        }else{
          hint.textContent = '';
          hint.classList.remove('is-error');
        }
      };

      valueSelectAll.addEventListener('change', ()=>{
        getMatchingOptions().forEach(option=>{
          if(valueSelectAll.checked){
            selectedKeys.add(option.key);
          }else{
            selectedKeys.delete(option.key);
          }
        });
        renderValueList();
      });
      searchInput.addEventListener('input', renderValueList);

      const syncModeUi = ()=>{
        const mode = modeSelect.value || FILTER_KIND_SET;
        const isValueMode = mode === FILTER_KIND_SET;
        const isInputlessCondition = mode === 'isBlank'
          || mode === 'isNotBlank'
          || mode === 'aboveAverage'
          || mode === 'belowAverage';
        const useNumericInput = context.columnType === 'numeric'
          && mode !== FILTER_KIND_SET
          && mode !== 'contains'
          && mode !== 'notContains'
          && mode !== 'startsWith'
          && mode !== 'endsWith'
          && !isInputlessCondition;
        const showConditionInputs = !isValueMode && !isInputlessCondition;
        setPopupSectionVisible(searchInput, isValueMode);
        setPopupSectionVisible(valueSummary, isValueMode);
        setPopupSectionVisible(valueSelectRow, isValueMode);
        setPopupSectionVisible(valueList, isValueMode);
        setPopupSectionVisible(inputWrap, showConditionInputs);
        valueInput.type = 'text';
        valueToInput.type = 'text';
        valueInput.inputMode = useNumericInput ? 'decimal' : 'text';
        valueToInput.inputMode = useNumericInput ? 'decimal' : 'text';
        if(useNumericInput){
          valueInput.setAttribute('data-filter-input-mode', 'numeric');
          valueToInput.setAttribute('data-filter-input-mode', 'numeric');
        }else{
          valueInput.removeAttribute('data-filter-input-mode');
          valueToInput.removeAttribute('data-filter-input-mode');
        }
        if(mode === 'topN'){
          valueInput.placeholder = '10';
        }else if(mode === 'between'){
          valueInput.placeholder = 'Minimum';
          valueToInput.placeholder = 'Maximum';
        }else{
          valueInput.placeholder = 'Value';
        }
        setPopupSectionVisible(valueInput, showConditionInputs);
        setPopupSectionVisible(valueToInput, showConditionInputs && mode === 'between');
        if(!isValueMode){
          if(mode === 'topN'){
            hint.textContent = 'Keeps the highest numeric values in this column.';
          }else if((mode === 'aboveAverage' || mode === 'belowAverage') && context.numericValues.length){
            const average = context.numericValues.reduce((sum, value)=>sum + value, 0) / context.numericValues.length;
            hint.textContent = `Column average: ${formatFilterCellValue(average)}`;
          }else{
            hint.textContent = '';
          }
          hint.classList.remove('is-error');
        }
      };

      const currentMode = currentModel?.kind === FILTER_KIND_CONDITION
        ? currentModel.operator
        : FILTER_KIND_SET;
      if(Array.from(modeSelect.options).some(option => option.value === currentMode)){
        modeSelect.value = currentMode;
      }else{
        modeSelect.value = FILTER_KIND_SET;
      }
      valueInput.value = currentModel?.kind === FILTER_KIND_CONDITION ? String(currentModel.value ?? '') : '';
      valueToInput.value = currentModel?.kind === FILTER_KIND_CONDITION ? String(currentModel.valueTo ?? '') : '';
      modeSelect.addEventListener('change', ()=>{
        syncModeUi();
        focusPreferredField();
      });
      syncModeUi();
      renderValueList();

      const applyCurrentFilter = ()=>{
        const mode = modeSelect.value || FILTER_KIND_SET;
        const previousState = captureFilterState();
        let nextModel = null;
        if(mode === FILTER_KIND_SET){
          const availableKeys = context.uniqueOptions.map(option => option.key);
          const needle = getCurrentSearchNeedle();
          const selected = normalizeFilterSelectionValues(
            needle
              ? getMatchingOptions()
                  .filter(option => selectedKeys.has(option.key))
                  .map(option => option.key)
              : Array.from(selectedKeys)
          );
          const allSelected = availableKeys.length > 0 && availableKeys.every(key => selected.indexOf(key) !== -1);
          if(!allSelected){
            nextModel = {
              kind: FILTER_KIND_SET,
              selected
            };
          }
        }else{
          nextModel = cloneFilterModel({
            kind: FILTER_KIND_CONDITION,
            operator: mode,
            value: valueInput.value,
            valueTo: valueToInput.value,
            columnType: context.columnType
          });
          const compiled = nextModel ? buildCompiledColumnFilter(colId, nextModel) : null;
          if(!compiled && nextModel){
            hint.classList.add('is-error');
            hint.textContent = 'Enter a valid filter value.';
            focusPreferredField();
            return;
          }
        }
        if(nextModel){
          activeColumnFilters.set(colId, nextModel);
        }else{
          activeColumnFilters.delete(colId);
        }
        const nextState = captureFilterState();
        if(!areFilterStatesEqual(previousState, nextState)){
          notifyColumnFiltersChanged(`filter:${colId}`);
          recordFilterUndo(`table:${debugLabel}:filter:${colId}`, previousState, captureFilterState());
        }
        closeCustomMenu();
      };

      applyButton.addEventListener('click', applyCurrentFilter);
      clearButton.addEventListener('click', ()=>{
        const previousState = captureFilterState();
        if(activeColumnFilters.has(colId)){
          activeColumnFilters.delete(colId);
          notifyColumnFiltersChanged(`filter-clear:${colId}`);
          recordFilterUndo(`table:${debugLabel}:filter-clear:${colId}`, previousState, captureFilterState());
        }
        closeCustomMenu();
      });
      cancelButton.addEventListener('click', ()=>closeCustomMenu());
      popup.addEventListener('keydown', (event)=>{
        if((event?.key || '') === 'Enter' && !(event.target instanceof HTMLTextAreaElement)){
          event.preventDefault?.();
          applyCurrentFilter();
        }
      });

      doc.body.appendChild(popup);
      positionCustomPopup(popup, {
        anchorRect: anchorEl?.getBoundingClientRect?.() || null,
        left: anchorEl?.getBoundingClientRect?.()?.left,
        top: anchorEl?.getBoundingClientRect?.()?.bottom
      });
      customContextMenu = popup;
      customContextMenuCleanup = attachPopupDismissHandlers(popup, { anchor: anchorEl });
      clearButton.disabled = !activeColumnFilters.has(colId);
      focusPreferredField();
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

    const getAllDisplayedColumnIds = ()=>{
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
        const out = [];
        for(let i = 0; i < displayed.length; i += 1){
          const col = displayed[i];
          const colId = (typeof col?.getColId === 'function') ? col.getColId() : (col?.colId ?? null);
          if(typeof colId === 'string' && colId){
            out.push(colId);
          }
        }
        return out.length ? out : null;
      }catch(err){
        return null;
      }
    };

    const applyDisplayedColumnOrder = (orderedColIds)=>{
      const order = Array.isArray(orderedColIds)
        ? orderedColIds.filter(id => typeof id === 'string' && id)
        : [];
      if(!order.length){
        return false;
      }
      const api = instance.gridApi || null;
      const columnApi = instance.columnApi || api?.columnApi || null;
      const applyColumnState = (columnApi && typeof columnApi.applyColumnState === 'function')
        ? columnApi.applyColumnState.bind(columnApi)
        : (api && typeof api.applyColumnState === 'function')
          ? api.applyColumnState.bind(api)
          : null;
      if(!applyColumnState){
        return false;
      }
      try{
        const state = order.map((colId, index)=>({ colId, order: index }));
        const applied = applyColumnState({ state, applyOrder: true });
        return applied !== false;
      }catch(err){
        return false;
      }
    };

    const hasActiveSorts = ()=>{
      const api = instance.gridApi || null;
      const columnApi = instance.columnApi || api?.columnApi || null;
      const getColumnState = (columnApi && typeof columnApi.getColumnState === 'function')
        ? columnApi.getColumnState.bind(columnApi)
        : (api && typeof api.getColumnState === 'function')
          ? api.getColumnState.bind(api)
          : null;
      if(!getColumnState){
        return false;
      }
      try{
        const state = getColumnState();
        return Array.isArray(state) && state.some(entry => entry?.sort === 'asc' || entry?.sort === 'desc');
      }catch(err){
        return false;
      }
    };

    const hasVisualRowTransforms = ()=>compiledColumnFilters.size > 0 || hasActiveSorts();

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
          const ordered = getAllDisplayedColumnIds();
          if(Array.isArray(ordered) && ordered.length){
            const currentIndex = ordered.indexOf(colId);
            if(currentIndex >= 0){
              ordered.splice(currentIndex, 1);
              const insertIndex = Math.max(0, Math.min(toIndex, ordered.length));
              ordered.splice(insertIndex, 0, colId);
              return applyDisplayedColumnOrder(ordered);
            }
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

    const getFullColumnSelectionColumns = ()=>{
      const normalized = getEffectiveSelectionRange();
      if(!normalized){
        return [];
      }
      const lastRow = Math.max(0, getVisualRowCount() - 1);
      const isFullColumnSelection = normalized.from.row === 0 && normalized.to.row === lastRow;
      if(!isFullColumnSelection){
        return [];
      }
      const cols = [];
      for(let c = normalized.from.col; c <= normalized.to.col; c += 1){
        cols.push(c);
      }
      return cols;
    };

    const isHeaderColumnSelected = (colIdx)=>{
      const idx = Number(colIdx);
      if(!Number.isInteger(idx) || idx < 0){
        return false;
      }
      if(selectedHeaderColumns.has(idx)){
        return true;
      }
      return getFullColumnSelectionColumns().indexOf(idx) !== -1;
    };

    const resolveSelectedColumnGroup = (colIdx)=>{
      const idx = Number(colIdx);
      if(!Number.isInteger(idx) || idx < 0){
        return null;
      }
      if(selectedHeaderColumns.size){
        const selected = Array.from(selectedHeaderColumns)
          .filter(col => Number.isInteger(col) && col >= 0)
          .sort((a, b)=>a - b);
        if(selected.indexOf(idx) !== -1){
          return selected.length ? selected : [idx];
        }
      }
      const rangeCols = getFullColumnSelectionColumns();
      if(!rangeCols.length || idx < rangeCols[0] || idx > rangeCols[rangeCols.length - 1]){
        return [idx];
      }
      return rangeCols;
    };

    const resolveHeaderColumnSelectionInfo = (colIdx)=>{
      const selected = resolveSelectedColumnGroup(colIdx) || [];
      const sorted = selected
        .filter(col => Number.isInteger(col) && col >= 0)
        .sort((a, b)=>a - b);
      const count = sorted.length;
      if(!count){
        return { columns: [], contiguous: false, start: 0, count: 0 };
      }
      let contiguous = true;
      for(let i = 1; i < sorted.length; i += 1){
        if(sorted[i] !== sorted[i - 1] + 1){
          contiguous = false;
          break;
        }
      }
      return {
        columns: sorted,
        contiguous,
        start: sorted[0],
        count
      };
    };

    const normalizeSelectedColumnsForMenu = (cols, fallbackColIdx)=>{
      const normalized = Array.isArray(cols)
        ? cols.filter(col => Number.isInteger(col) && col >= 0 && col < colCount)
        : [];
      if(!normalized.length && Number.isInteger(fallbackColIdx) && fallbackColIdx >= 0 && fallbackColIdx < colCount){
        normalized.push(fallbackColIdx);
      }
      return Array.from(new Set(normalized)).sort((a, b)=>a - b);
    };

    const primeHeaderColumnSelectionForMenu = (cols, fallbackColIdx)=>{
      const selectedCols = normalizeSelectedColumnsForMenu(cols, fallbackColIdx);
      if(!selectedCols.length){
        return [];
      }
      const firstCol = selectedCols[0];
      const lastCol = selectedCols[selectedCols.length - 1];
      const lastRow = Math.max(0, getVisualRowCount() - 1);
      clearGridCellFocus(instance.gridApi);
      focusGridContainer();
      selectedHeaderColumns = new Set(selectedCols);
      setLastRange({ from: { row: 0, col: firstCol }, to: { row: lastRow, col: lastCol } });
      renderAg(instance.gridApi);
      fireHook('afterSelectionEnd', 0, firstCol, lastRow, lastCol);
      return selectedCols;
    };
    const primeCellSelectionForMenu = (range, fallbackCell)=>{
      const normalized = normalizeRange(range)
        || (fallbackCell && Number.isInteger(fallbackCell.row) && Number.isInteger(fallbackCell.col)
          ? normalizeRange({ from: fallbackCell, to: fallbackCell })
          : null);
      if(!normalized){
        return null;
      }
      clearGridCellFocus(instance.gridApi);
      focusGridContainer();
      clearSelectedHeaderColumns();
      setLastRange(normalized);
      renderAg(instance.gridApi);
      fireHook('afterSelectionEnd', normalized.from.row, normalized.from.col, normalized.to.row, normalized.to.col);
      return normalized;
    };

    const dispatchPasteWithText = (text)=>{
      if(typeof text !== 'string' || !text){
        return false;
      }
      const doc = container?.ownerDocument || document;
      const view = doc?.defaultView || global;
      let pasteEvent = null;
      try{
        pasteEvent = new view.Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(pasteEvent, 'clipboardData', {
          value: {
            getData: (type)=>{
              if(type === 'text/plain' || type === 'text' || type == null){
                return text;
              }
              return '';
            }
          }
        });
      }catch(err){
        pasteEvent = null;
      }
      if(!pasteEvent){
        return false;
      }
      return !!container.dispatchEvent(pasteEvent);
    };

    const openColumnHeaderMenu = (event, colIdx)=>{
      const idx = Number(colIdx);
      if(!Number.isInteger(idx) || idx < 0){
        return;
      }
      const moveState = getMoveColumnState(idx);
      const headerSelection = resolveHeaderColumnSelectionInfo(idx);
      const selectedCols = normalizeSelectedColumnsForMenu(headerSelection.columns, idx);
      const selectionSpan = resolveSelectedColumnSpanForHeader(idx);
      const canDelete = selectionSpan.count > 0;
      const insertLabelCount = selectionSpan.count || 1;
      const selectionStart = selectionSpan.start;
      const selectionEnd = selectionSpan.start + selectionSpan.count - 1;
      const canExclude = selectedCols.some(col => !exclusionController.isColumnExcluded(col));
      const canInclude = selectedCols.some(col => exclusionController.isColumnExcluded(col));
      const canPaste = !!(navigator?.clipboard && typeof navigator.clipboard.readText === 'function');
      const pluralSuffix = selectedCols.length === 1 ? '' : 's';
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
          label: `Copy column${pluralSuffix}`,
          disabled: !selectedCols.length,
          action: ()=>{
            primeHeaderColumnSelectionForMenu(selectedCols, idx);
            copySelectionToClipboard();
          }
        },
        {
          label: `Cut column${pluralSuffix}`,
          disabled: !selectedCols.length,
          action: ()=>{
            primeHeaderColumnSelectionForMenu(selectedCols, idx);
            cutSelectionToClipboard();
          }
        },
        {
          label: `Paste into column${pluralSuffix}`,
          disabled: !selectedCols.length || !canPaste,
          action: async ()=>{
            const colsToUse = primeHeaderColumnSelectionForMenu(selectedCols, idx);
            if(!colsToUse.length){
              return;
            }
            let text = '';
            try{
              text = await navigator.clipboard.readText();
            }catch(err){
              console.error('Shared.hot AG header menu paste read failed', err);
              return;
            }
            dispatchPasteWithText(text);
          }
        },
        'separator',
        {
          label: `Exclude column${pluralSuffix} from analysis`,
          disabled: !canExclude,
          action: ()=>{
            applyExclusionChange(`table:${debugLabel}:exclude-col`, ()=>{
              exclusionController.markColumns(selectedCols, true);
            });
            triggerSchedule('exclusion-change', { scope: 'column', exclude: true });
          }
        }
      ];
      if(canInclude){
        items.push({
          label: `Include column${pluralSuffix} in analysis`,
          disabled: false,
          action: ()=>{
            applyExclusionChange(`table:${debugLabel}:include-col`, ()=>{
              exclusionController.markColumns(selectedCols, false);
            });
            triggerSchedule('exclusion-change', { scope: 'column', exclude: false });
          }
        });
      }
      openCustomMenu(event, items);
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
      const committed = commitDisplayedColumnOrderToData('columnHandleDrag', movedCols);
      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot column handle drag end', {
          debugLabel,
          colIds: columnHandleDragColIds || null,
          committed
        });
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
          const ordered = getAllDisplayedColumnIds();
          if(Array.isArray(ordered) && ordered.length){
            const idSet = new Set(ids);
            const moving = ordered.filter(colId => idSet.has(colId));
            if(moving.length){
              const remaining = ordered.filter(colId => !idSet.has(colId));
              const insertIndex = Math.max(0, Math.min(toIndex, remaining.length));
              const nextOrder = remaining.slice(0, insertIndex).concat(moving).concat(remaining.slice(insertIndex));
              return applyDisplayedColumnOrder(nextOrder);
            }
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
        const columnStateApi = resolveColumnStateApi(instance.gridApi || null);
        if(!columnStateApi || typeof columnStateApi.getColumnState !== 'function'){
          return null;
        }
        try{
          const state = columnStateApi.getColumnState() || [];
          const ordered = state
            .map(entry => entry?.colId)
            .filter(id => typeof id === 'string' && id.startsWith('c'));
          return ordered.length ? ordered : null;
        }catch(err){
          return null;
        }
      }
      const colIds = positions.map(entry => entry.colId).filter(id => typeof id === 'string' && id.startsWith('c'));
      return colIds.length ? colIds : null;
    };

    const clearDeferredColumnMoveCommit = ()=>{
      if(pendingDeferredColumnMoveCommitId == null){
        return;
      }
      const docLocal = container?.ownerDocument || document;
      const winLocal = docLocal?.defaultView || global;
      try{
        if(typeof winLocal?.cancelAnimationFrame === 'function'){
          winLocal.cancelAnimationFrame(pendingDeferredColumnMoveCommitId);
        }else{
          winLocal?.clearTimeout?.(pendingDeferredColumnMoveCommitId);
        }
      }catch(err){
        // ignore cleanup failures
      }
      pendingDeferredColumnMoveCommitId = null;
    };

    const scheduleDeferredColumnMoveCommit = (reason, movedColIds, attempt = 0)=>{
      if(pendingDeferredColumnMoveCommitId != null){
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot deferred column move commit already scheduled', {
            debugLabel,
            reason: reason || null,
            movedColIds: Array.isArray(movedColIds) ? movedColIds.slice() : null,
            attempt
          });
        }
        return;
      }
      const docLocal = container?.ownerDocument || document;
      const winLocal = docLocal?.defaultView || global;
      const run = ()=>{
        pendingDeferredColumnMoveCommitId = null;
        if(isColumnHandleDragging || suppressColumnMoveCommitDepth !== 0){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot deferred column move commit skipped (guard)', {
              debugLabel,
              reason: reason || null,
              isColumnHandleDragging,
              suppressColumnMoveCommitDepth,
              attempt
            });
          }
          return;
        }
        const displayedOrder = getDisplayedDataColumnOrder();
        const orderReady = !!(displayedOrder && displayedOrder.length === colCount);
        if(!orderReady && attempt < (MAX_DEFERRED_COLUMN_MOVE_COMMIT_ATTEMPTS - 1)){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot deferred column move commit postponed (displayed order not ready)', {
              debugLabel,
              reason: reason || null,
              attempt,
              displayedOrderLength: Array.isArray(displayedOrder) ? displayedOrder.length : null,
              colCount
            });
          }
          scheduleDeferredColumnMoveCommit(reason, movedColIds, attempt + 1);
          return;
        }
        const committed = commitDisplayedColumnOrderToData(reason || 'ag-column-moved:deferred', movedColIds);
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot deferred column move commit result', {
            debugLabel,
            reason: reason || null,
            committed,
            movedColIds: Array.isArray(movedColIds) ? movedColIds.slice() : null,
            attempt,
            orderReady
          });
        }
        if(!committed){
          fireHook('afterColumnMove');
          triggerSchedule('afterColumnMove', { source: reason || 'columnMove' });
        }
      };
      if(typeof winLocal?.requestAnimationFrame === 'function'){
        pendingDeferredColumnMoveCommitId = winLocal.requestAnimationFrame(run);
      }else{
        pendingDeferredColumnMoveCommitId = winLocal?.setTimeout?.(run, 0) || null;
      }
    };

    const applyColumnPermutationToData = (permutationOldByNew)=>{
      if(!Array.isArray(permutationOldByNew) || permutationOldByNew.length === 0){
        return false;
      }
      const permutationLength = permutationOldByNew.length;
      // Allow replaying historical column permutations even if the table has
      // grown since the permutation was recorded (extra trailing columns keep
      // identity mapping). Shrink is not replay-safe.
      if(permutationLength > colCount){
        return false;
      }
      const permutation = permutationOldByNew.map(idx => Number(idx));
      if(!permutation.every(idx => Number.isInteger(idx) && idx >= 0 && idx < permutationLength)){
        return false;
      }
      const seen = new Set(permutation);
      if(seen.size !== permutationLength){
        return false;
      }

      const matrix = dataHandle.current;
      for(let r = 0; r < matrix.length; r++){
        const row = Array.isArray(matrix[r]) ? matrix[r] : [];
        const nextRow = new Array(Math.max(row.length, colCount));
        for(let c = 0; c < nextRow.length; c++){
          const oldIndex = c < permutationLength ? permutation[c] : c;
          nextRow[c] = (oldIndex < row.length) ? row[oldIndex] : '';
        }
        matrix[r] = nextRow;
      }
      dataHandle.current = matrix;
      markFormulaModelDirty('column-permutation');

      if(Array.isArray(colHeadersSetting)){
        try{
          const nextHeaders = new Array(colHeadersSetting.length);
          for(let c = 0; c < colHeadersSetting.length; c++){
            const oldIndex = c < permutationLength ? permutation[c] : c;
            nextHeaders[c] = (oldIndex < colHeadersSetting.length) ? colHeadersSetting[oldIndex] : toExcelColumnLabel(c);
          }
          colHeadersSetting = nextHeaders;
        }catch(err){
          // ignore
        }
      }
      colHeaders = resolveColHeaders(colCount);

      const exclusionState = exclusionController.exportState();
      const oldToNew = new Map();
      for(let newIdx = 0; newIdx < permutationLength; newIdx++){
        oldToNew.set(permutation[newIdx], newIdx);
      }
      for(let idx = permutationLength; idx < colCount; idx++){
        oldToNew.set(idx, idx);
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
      // Guard against recursive reorder commits from AG Grid move events fired by internal updates.
      suppressColumnMoveCommitDepth += 1;
      try{
        rebuildColumns(instance.gridApi);
        renderAg(instance.gridApi);
      }finally{
        suppressColumnMoveCommitDepth = Math.max(0, suppressColumnMoveCommitDepth - 1);
      }
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
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot column order commit skipped (invalid displayed order)', {
            debugLabel,
            reason: reason || null,
            hasOrder: !!currentOrder,
            displayedOrderLength: Array.isArray(currentOrder) ? currentOrder.length : null,
            colCount
          });
        }
        return false;
      }
      const permutationOldByNew = currentOrder.map(id => Number(id.slice(1)));
      if(!permutationOldByNew.every(idx => Number.isInteger(idx) && idx >= 0)){
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot column order commit skipped (invalid permutation)', {
            debugLabel,
            reason: reason || null,
            currentOrder: currentOrder.slice(),
            permutationOldByNew: permutationOldByNew.slice()
          });
        }
        return false;
      }
      const isIdentity = permutationOldByNew.every((oldIdx, newIdx)=>oldIdx === newIdx);
      if(isIdentity){
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot column order commit skipped (identity)', {
            debugLabel,
            reason: reason || null,
            currentOrder: currentOrder.slice()
          });
        }
        return false;
      }

      const inverse = new Array(permutationOldByNew.length);
      for(let newIdx = 0; newIdx < permutationOldByNew.length; newIdx++){
        inverse[permutationOldByNew[newIdx]] = newIdx;
      }

      const applied = applyColumnPermutation(permutationOldByNew, { reason: reason || 'columnOrderCommit', movedColIds });
      if(!applied){
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot column order commit failed (apply permutation failed)', {
            debugLabel,
            reason: reason || null,
            permutationOldByNew: permutationOldByNew.slice()
          });
        }
        return false;
      }

      if(hasGlobalUndo){
        const undoLabel = `table:${debugLabel}:reorder-columns`;
        undoManager.record({
          label: undoLabel,
          scope: undoScope,
          undo: ()=>{
            const ok = applyColumnPermutation(inverse, { reason: 'undo:reorder-columns', skipSelection: true });
            if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
              console.debug('Debug: Shared.hot reorder undo closure executed', {
                debugLabel,
                label: undoLabel,
                ok,
                inverseLength: inverse.length,
                currentColCount: colCount
              });
            }
            return ok;
          },
          redo: ()=>{
            const ok = applyColumnPermutation(permutationOldByNew, { reason: 'redo:reorder-columns', skipSelection: true });
            if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
              console.debug('Debug: Shared.hot reorder redo closure executed', {
                debugLabel,
                label: undoLabel,
                ok,
                permutationLength: permutationOldByNew.length,
                currentColCount: colCount
              });
            }
            return ok;
          }
        });
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot reorder undo record created', {
            debugLabel,
            reason: reason || null,
            label: undoLabel,
            movedColIds: Array.isArray(movedColIds) ? movedColIds.slice() : null,
            permutationOldByNew: permutationOldByNew.slice()
          });
        }
      }

      if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
        console.debug('Debug: Shared.hot committed column order to data', {
          debugLabel,
          reason: reason || null,
          movedColIds: Array.isArray(movedColIds) ? movedColIds.slice() : null,
          permutationOldByNew: permutationOldByNew.slice()
        });
      }
      return true;
    };

    const resolveMovedDataColumnIdsFromEvent = (params)=>{
      const candidates = [];
      if(Array.isArray(params?.columns)){
        candidates.push(...params.columns);
      }else if(params?.column){
        candidates.push(params.column);
      }
      const out = [];
      for(let i = 0; i < candidates.length; i += 1){
        const col = candidates[i];
        const colId = (typeof col?.getColId === 'function') ? col.getColId() : col?.colId;
        if(typeof colId === 'string' && colId.startsWith('c')){
          out.push(colId);
        }
      }
      return out;
    };

    const initialRowBuffer = Number.isFinite(virtualizationState.rowBuffer) ? virtualizationState.rowBuffer : undefined;
    const initialColumnBuffer = Number.isFinite(virtualizationState.columnBuffer) ? virtualizationState.columnBuffer : undefined;
    const initialSuppressColumnVirtualisation = typeof virtualizationState.suppressColumnVirtualisation === 'boolean'
      ? virtualizationState.suppressColumnVirtualisation
      : undefined;
    let ensureFormulaOverlayLoop = ()=>{};
    let stopFormulaOverlayLoop = ()=>{};
    const formulaEditRawSnapshots = new Map();
    let formulaEditRawSnapshotSeq = 0;
    const buildFormulaEditSnapshotKey = (physicalRow, physicalCol)=>`${physicalRow}:${physicalCol}`;
    const resolveEventFormulaCellContext = (event)=>{
      const colId = event?.column?.getColId?.() ?? event?.colId ?? '';
      const col = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
      if(!Number.isInteger(col) || col < 0){
        return null;
      }
      const visualRow = resolveVisualRowIndex(event);
      let physicalRow = Number(event?.node?.data?.__rowIndex ?? event?.data?.__rowIndex);
      if(!Number.isInteger(physicalRow) || physicalRow < 0){
        const mapped = toPhysicalRowIndex(visualRow);
        physicalRow = Number.isInteger(mapped) ? mapped : null;
      }
      if(!Number.isInteger(physicalRow) || physicalRow < 0){
        return {
          visualRow: Number.isInteger(visualRow) ? visualRow : 0,
          physicalRow: null,
          col,
          colId
        };
      }
      return {
        visualRow: Number.isInteger(visualRow) ? visualRow : 0,
        physicalRow,
        col,
        colId
      };
    };
    const resolveCurrentRawCellValue = (physicalRow, physicalCol)=>{
      const row = Number(physicalRow);
      const col = Number(physicalCol);
      if(!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0){
        return undefined;
      }
      const rowValues = Array.isArray(dataHandle.current?.[row]) ? dataHandle.current[row] : null;
      return rowValues ? rowValues[col] : undefined;
    };
    const gridOptions = {
      rowData,
      pinnedTopRowData: usePinnedRows ? getPinnedTopRowData() : null,

      // IMPORTANT: The first N rows exist twice when using pinnedTopRowData:
      // - as pinned rows (rowPinned === 'top')
      // - and as normal body rows (ghost duplicates)
      // If we only hide the ghost rows with CSS, AG Grid still reserves their space.
      // Returning height 0 removes the blank band while keeping indexing stable.
      getRowHeight: (params) => {
        try {
          const node = params?.node;
          if (
            usePinnedRows &&
            pinRowCount > 0 &&
            node &&
            !node.rowPinned &&
            Number.isInteger(node.rowIndex) &&
            node.rowIndex >= 0 &&
            node.rowIndex < pinRowCount
          ) {
            return 0;
          }
        } catch (err) {
          console.error("Shared.hot getRowHeight error", {
            message: err?.message || String(err),
          });
        }
        return undefined; // default height
      },

      columnDefs,
      rowBuffer: initialRowBuffer,
      columnBuffer: initialColumnBuffer,
      suppressColumnVirtualisation: initialSuppressColumnVirtualisation,
      defaultColDef: {
        editable: true,
        resizable: true,
        minWidth: 40,
        width: fixedDataColWidth,
        suppressHeaderMenuButton: true,
        comparator: valueComparator
      },
      singleClickEdit,
      getRowHeight(params){
        if(!usePinnedRows){
          return undefined;
        }
        const node = params?.node;
        if(node?.rowPinned){
          return undefined;
        }
        const physicalRow = node?.data?.__rowIndex ?? node?.rowIndex ?? null;
        if(isPinnedTopRow(physicalRow)){
          return 0;
        }
        return undefined;
      },
      getRowStyle(params){
        if(!useStickyHeaderRow){
          return null;
        }
        const physicalRow = params?.data?.__rowIndex ?? params?.node?.rowIndex ?? null;
        if(!isPinnedPhysicalRow(physicalRow)){
          return null;
        }
        const nodeHeight = Number(params?.node?.rowHeight);
        const themeHeight = Number(params?.api?.getSizesForCurrentTheme?.()?.rowHeight);
        const rowHeight = Number.isFinite(nodeHeight) && nodeHeight > 0
          ? nodeHeight
          : (Number.isFinite(themeHeight) && themeHeight > 0 ? themeHeight : 28);
        const offset = Math.max(0, physicalRow) * rowHeight;
        return {
          '--hot-sticky-offset': `${offset}px`
        };
      },
      suppressRowVirtualisation: useStickyHeaderRow,
      suppressRowTransform: useStickyHeaderRow,
      rowSelection: rowSelectionConfig || undefined,
        suppressRowHoverHighlight: true,
        suppressMenuHide: true,
        ensureDomOrder: true,
        alwaysShowHorizontalScroll: true,
        headerHeight: colHeadersEnabled ? 24 : 0,
      isExternalFilterPresent(){
        return compiledColumnFilters.size > 0;
      },
      doesExternalFilterPass(params){
        if(!compiledColumnFilters.size){
          return true;
        }
        const physicalRow = params?.data?.__rowIndex ?? params?.node?.data?.__rowIndex ?? params?.node?.rowIndex;
        if(!Number.isInteger(physicalRow) || physicalRow < 0){
          return true;
        }
        let include = true;
        compiledColumnFilters.forEach(compiled=>{
          if(include && !compiled.evaluator(physicalRow)){
            include = false;
          }
        });
        return include;
      },
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
          const pinnedNodes = [];
          const headerNodes = [];
          const dataNodes = [];
          const resolvePhysicalRow = (node)=>node?.data?.__rowIndex ?? node?.rowIndex ?? null;
          for(let i = 0; i < nodes.length; i++){
            const node = nodes[i];
            const physicalRow = resolvePhysicalRow(node);
            if(isPinnedPhysicalRow(physicalRow)){
              pinnedNodes.push(node);
            }else if(isHeaderRow(physicalRow)){
              headerNodes.push(node);
            }else{
              dataNodes.push(node);
            }
          }
          if(!hasSort){
            if(!pinnedNodes.length && !headerNodes.length){
              return;
            }
            nodes.length = 0;
            pinnedNodes.forEach(node => nodes.push(node));
            headerNodes.forEach(node => nodes.push(node));
            dataNodes.forEach(node => nodes.push(node));
            return;
          }
          const pinnedNodesHavePhysical = pinnedNodes.length > 1
            && pinnedNodes.every(node => Number.isInteger(resolvePhysicalRow(node)));
          if(pinnedNodesHavePhysical){
            pinnedNodes.sort((a, b)=>resolvePhysicalRow(a) - resolvePhysicalRow(b));
          }
          const headerNodesHavePhysical = headerNodes.length > 1
            && headerNodes.every(node => Number.isInteger(resolvePhysicalRow(node)));
          if(headerNodesHavePhysical){
            headerNodes.sort((a, b)=>resolvePhysicalRow(a) - resolvePhysicalRow(b));
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
          pinnedNodes.forEach(node => nodes.push(node));
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
          syncPinnedTopRowScroll('grid-ready');
          schedulePinnedTopRowSync('grid-ready-follow');
          maybeGrowRows('gridReady');
          maybeGrowCols('gridReady');
        },
        onFirstDataRendered(){
          ensureViewportScrollHandler();
          syncPinnedTopRowScroll('first-data-render');
          schedulePinnedTopRowSync('first-data-render-follow');
        },
        onBodyScroll(params){
          if(params?.direction && params.direction !== 'horizontal'){
            return;
          }
          syncPinnedTopRowScroll('body-scroll');
          schedulePinnedTopRowSync('body-scroll-follow');
        },
        onSortChanged(params){
          const apiRef = params?.api || instance?.gridApi;
          const docLocal = container?.ownerDocument || document;
          const winLocal = docLocal?.defaultView || global;
          const rafLocal = typeof winLocal?.requestAnimationFrame === 'function'
            ? winLocal.requestAnimationFrame.bind(winLocal)
            : (fn)=>winLocal.setTimeout(fn, 16);
          rafLocal(()=>{
            if(isApplyingSortSelectionSnapshot){
              return;
            }
            restoreSortSelectionSnapshot(apiRef);
          });
        },
        onFilterChanged(params){
          const meta = pendingFilterChangeMeta || { reason: 'filter-change', schedule: true };
          pendingFilterChangeMeta = null;
          syncSelectionToFilteredRows();
          renderAg(params?.api || instance?.gridApi);
          if(meta.schedule !== false){
            triggerSchedule('filter-change', { source: meta.reason || 'filter-change' });
          }
        },
        onColumnResized(params){
          const apiRef = params?.api || instance?.gridApi;
          const isFinalResizeEvent = params?.finished !== false;
          if(isFinalResizeEvent){
            persistColumnWidthOverrides(apiRef, 'column-resized');
          }
          scheduleFillHandleUpdate(isFinalResizeEvent ? 'column-resize-finished' : 'column-resize-live');
          if(formulaReferenceOverlayState.ranges.length){
            scheduleFormulaReferenceOverlayRender(isFinalResizeEvent ? 'column-resize-finished' : 'column-resize-live');
          }
        },
      onCellValueChanged(event){
        const context = resolveEventFormulaCellContext(event);
        const visualRow = context?.visualRow ?? (resolveVisualRowIndex(event) ?? 0);
        const colIndex = context?.col ?? (() => {
          const colId = event?.column?.getColId?.() ?? event?.colId;
          return typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : 0;
        })();
        const physicalRow = context?.physicalRow;
        const snapshotKey = Number.isInteger(physicalRow) && physicalRow >= 0 && Number.isInteger(colIndex) && colIndex >= 0
          ? buildFormulaEditSnapshotKey(physicalRow, colIndex)
          : null;
        const editSnapshot = snapshotKey ? formulaEditRawSnapshots.get(snapshotKey) : null;
        const rawCurrent = Number.isInteger(physicalRow) && physicalRow >= 0 && Number.isInteger(colIndex) && colIndex >= 0
          ? resolveCurrentRawCellValue(physicalRow, colIndex)
          : undefined;
        const isFormulaManagedCell = !!(formulaEvaluationState.enabled
          && Number.isInteger(physicalRow)
          && physicalRow >= 0
          && Number.isInteger(colIndex)
          && colIndex >= 0);
        const normalizedOldValue = isFormulaManagedCell
          ? (typeof editSnapshot?.rawValue !== 'undefined'
            ? editSnapshot.rawValue
            : resolveFormulaRawValue(physicalRow, colIndex, event?.oldValue))
          : event?.oldValue;
        const normalizedNewValue = isFormulaManagedCell
          ? (typeof rawCurrent !== 'undefined'
            ? rawCurrent
            : resolveFormulaRawValue(physicalRow, colIndex, event?.newValue))
          : event?.newValue;
        const valuesMatch = valuesMatchForChange(normalizedOldValue, normalizedNewValue);
        if(valuesMatch){
          if(snapshotKey){
            formulaEditRawSnapshots.delete(snapshotKey);
          }
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot AG change ignored (no-op)', {
              debugLabel,
              row: event?.node?.rowIndex ?? event?.rowIndex,
              colId: event?.column?.getColId?.() ?? event?.colId,
              rawOld: normalizedOldValue,
              rawNew: normalizedNewValue
            });
          }
          return;
        }
        const synchronized = Number.isInteger(physicalRow) && physicalRow >= 0 && Number.isInteger(colIndex) && colIndex >= 0
          ? setFormulaModelRawCell(physicalRow, colIndex, normalizedNewValue, 'ag-cell-value-changed')
          : false;
        if(formulaEvaluationState.enabled && !synchronized){
          markFormulaModelDirty('ag-cell-value-changed');
        }
        if(undoLockDepth === 0){
          const physicalCol = colIndex;
          if(Number.isInteger(physicalRow) && physicalRow >= 0 && Number.isInteger(physicalCol) && physicalCol >= 0){
            pushUndoStep(`table:${debugLabel}:edit`, [{ row: physicalRow, col: physicalCol, prev: normalizedOldValue, next: normalizedNewValue }]);
          }
        }
        refreshColumnFiltersForDataMutation('ag-cell-value-changed');
        fireHook('afterChange', [[visualRow, colIndex, normalizedOldValue, normalizedNewValue]], event.source || 'edit');
        triggerSchedule('afterChange', { source: event.source || 'edit' });
        if(snapshotKey){
          formulaEditRawSnapshots.delete(snapshotKey);
        }
        if(formulaEvaluationState.enabled){
          renderAg(event?.api || instance?.gridApi);
        }
      },
      onCellEditingStarted(event){
        const context = resolveEventFormulaCellContext(event);
        if(context && Number.isInteger(context.physicalRow) && context.physicalRow >= 0 && Number.isInteger(context.col) && context.col >= 0){
          const rawValue = resolveCurrentRawCellValue(context.physicalRow, context.col);
          const key = buildFormulaEditSnapshotKey(context.physicalRow, context.col);
          formulaEditRawSnapshotSeq += 1;
          formulaEditRawSnapshots.set(key, {
            seq: formulaEditRawSnapshotSeq,
            rawValue
          });
        }
        try{
          ensureFormulaOverlayLoop('cell-editing-started');
        }catch(err){
          // ignore overlay lifecycle errors
        }
      },
      onCellEditingStopped(event){
        const context = resolveEventFormulaCellContext(event);
        if(context && Number.isInteger(context.physicalRow) && context.physicalRow >= 0 && Number.isInteger(context.col) && context.col >= 0){
          const key = buildFormulaEditSnapshotKey(context.physicalRow, context.col);
          const snapshot = formulaEditRawSnapshots.get(key);
          if(snapshot){
            const snapshotSeq = snapshot.seq;
            const docLocal = container?.ownerDocument || document;
            const winLocal = docLocal?.defaultView || global;
            winLocal?.setTimeout?.(()=>{
              const latest = formulaEditRawSnapshots.get(key);
              if(latest && latest.seq === snapshotSeq){
                formulaEditRawSnapshots.delete(key);
              }
            }, 0);
          }
        }
        try{
          ensureFormulaOverlayLoop('cell-editing-stopped');
        }catch(err){
          // ignore overlay lifecycle errors
        }
        try{
          if(!enterPressedDuringEdit){
            return;
          }
          enterPressedDuringEdit = false;
          const api = instance.gridApi;
          const rowIndex = resolveVisualRowIndex(event) ?? 0;
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
        if(suppressApiSelectionSyncForSort || isApplyingSortSelectionSnapshot){
          return;
        }
        const activeSelection = getEffectiveSelectionRange();
        if(activeSelection && (activeSelection.from.row !== activeSelection.to.row || activeSelection.from.col !== activeSelection.to.col)){
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
        clearPasteDrivenSelectionState();
        clearSelectedHeaderColumns();
        const row = resolveVisualRowIndex(params) ?? 0;
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
      onColumnMoved(params){
        const source = typeof params?.source === 'string' ? params.source : '';
        const finished = params?.finished;
        const movedColIds = resolveMovedDataColumnIdsFromEvent(params);
        const isApiMove = source === 'api';
        const canCommitFromEvent = !isApiMove
          && finished !== false
          && !isColumnHandleDragging
          && suppressColumnMoveCommitDepth === 0;
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot onColumnMoved event', {
            debugLabel,
            source,
            finished,
            movedColIds: movedColIds.slice(),
            isApiMove,
            isColumnHandleDragging,
            suppressColumnMoveCommitDepth,
            canCommitFromEvent
          });
        }
        if(canCommitFromEvent){
          const committed = commitDisplayedColumnOrderToData('ag-column-moved', movedColIds);
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot onColumnMoved commit attempt result', {
              debugLabel,
              source,
              finished,
              committed,
              movedColIds: movedColIds.slice()
            });
          }
          if(committed){
            return;
          }
          scheduleDeferredColumnMoveCommit('ag-column-moved', movedColIds);
          return;
        }
        fireHook('afterColumnMove');
        triggerSchedule('afterColumnMove', { source: source || 'columnMove' });
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
        openColumnHeaderMenu(event, colIdx);
      },
      getRowClass(params){
        const physicalRow = params?.data?.__rowIndex ?? params?.node?.rowIndex ?? 0;
        const classes = [];
        if(isHeaderRow(physicalRow) && firstRowClassName){
          classes.push(firstRowClassName);
        }
        if(isStickyRow(physicalRow)){
          classes.push('hot-sticky-row');
        }
        if(usePinnedRows && isPinnedTopRow(physicalRow) && !params?.node?.rowPinned){
          classes.push('hot-pinned-ghost-row');
        }
        if(usePinnedRows && pinRowCount > 0 && Number.isInteger(physicalRow) && physicalRow === pinRowCount){
          classes.push('hot-pinned-first-body-row');
        }
        return classes.length ? classes.join(' ') : null;
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
          if(!Number.isInteger(physicalRow) || physicalRow < 0 || isPinnedOrHeaderRow(physicalRow)){
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
            if(isPinnedOrHeaderRow(pr)){
              continue;
            }
            rowList.push(pr);
          }
          const uniqueRowList = Array.from(new Set(rowList));
          const canExcludeRow = uniqueRowList.some(row => !exclusionController.isRowExcluded(row));
          const canIncludeRow = uniqueRowList.some(row => exclusionController.isRowExcluded(row));
          const visualTransformLocked = hasVisualRowTransforms();
          const items = [
            {
              label: `Insert ${rowCountToAct} row(s) above`,
              disabled: rowCountToAct <= 0 || visualTransformLocked,
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
              disabled: rowCountToAct <= 0 || visualTransformLocked,
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
              disabled: rowCountToAct <= 0 || visualTransformLocked,
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
                      markFormulaModelDirty('undo-delete-rows-restore');
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
            }
          ];
          if(canIncludeRow){
            items.push({
              label: 'Include row(s) in analysis',
              action: ()=>{
                applyExclusionChange(`table:${debugLabel}:include-rows`, ()=>{
                  exclusionController.markRows(uniqueRowList, false);
                });
                triggerSchedule('exclusion-change', { scope: 'row', exclude: false });
              }
            });
          }
          openCustomMenu(event, items);
          return;
        }
        const colIdx = typeof colIdRaw === 'string' && colIdRaw.startsWith('c') ? Number(colIdRaw.slice(1)) : 0;
        const clickedRange = {
          from: { row: params?.node?.rowIndex ?? 0, col: colIdx },
          to: { row: params?.node?.rowIndex ?? 0, col: colIdx }
        };
        const activeSelection = getEffectiveSelectionRange();
        const sel = rangeContainsRange(activeSelection, clickedRange) ? activeSelection : clickedRange;
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
            if(isPinnedOrHeaderRow(physicalRow)){
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
        const canPaste = !!(navigator?.clipboard && typeof navigator.clipboard.readText === 'function');
        const items = [
          {
            label: 'Copy',
            disabled: !pairs.length,
            action: ()=>{
              if(!primeCellSelectionForMenu(sel, clickedRange.from)){
                return;
              }
              copySelectionToClipboard();
            }
          },
          {
            label: 'Cut',
            disabled: !pairs.length,
            action: ()=>{
              if(!primeCellSelectionForMenu(sel, clickedRange.from)){
                return;
              }
              cutSelectionToClipboard();
            }
          },
          {
            label: 'Paste',
            disabled: !canPaste,
            action: async ()=>{
              let text = '';
              try{
                text = await navigator.clipboard.readText();
              }catch(err){
                console.error('Shared.hot AG body menu paste read failed', err);
                return;
              }
              if(!text){
                return;
              }
              if(!primeCellSelectionForMenu(sel, clickedRange.from)){
                return;
              }
              dispatchPasteWithText(text);
            }
          },
          'separator',
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
            label: 'Exclude column(s) from analysis',
            disabled: !canExcludeCols,
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:exclude-cols`, ()=>{
                exclusionController.markColumns(colList, true);
              });
              triggerSchedule('exclusion-change', { scope: 'column', exclude: true });
            }
          }
        ];
        if(canIncludeCells){
          items.push({
            label: 'Include selection in analysis',
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:include-cells`, ()=>{
                exclusionController.markCells(pairs, false);
              });
              triggerSchedule('exclusion-change', { scope: 'cell', exclude: false });
            }
          });
        }
        if(canIncludeRows){
          items.push({
            label: 'Include row(s) in analysis',
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:include-rows`, ()=>{
                exclusionController.markRows(rowList, false);
              });
              triggerSchedule('exclusion-change', { scope: 'row', exclude: false });
            }
          });
        }
        if(canIncludeCols){
          items.push({
            label: 'Include column(s) in analysis',
            action: ()=>{
              applyExclusionChange(`table:${debugLabel}:include-cols`, ()=>{
                exclusionController.markColumns(colList, false);
              });
              triggerSchedule('exclusion-change', { scope: 'column', exclude: false });
            }
          });
        }
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

      const resolveTargetElement = (target)=>{
        if(target && target.nodeType === 1){
          return target;
        }
        if(target && target.nodeType === 3){
          const parent = target.parentElement || target.parentNode;
          return parent && parent.nodeType === 1 ? parent : null;
        }
        return null;
      };

      const isEditableTarget = (target)=>{
        const node = resolveTargetElement(target);
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
          return !!node.closest('input,textarea,select,[contenteditable]:not([contenteditable=\"false\"]),[role=\"textbox\"],.ag-cell-inline-editing,.ag-popup-editor,.ag-cell-editor,.ag-input-field-input');
        }
        return false;
      };

      const isInlineEditorActive = ()=>{
        const api = instance?.gridApi;
        if(api && typeof api.getEditingCells === 'function'){
          try{
            const editing = api.getEditingCells();
            if(Array.isArray(editing) && editing.length){
              return true;
            }
          }catch(err){
            // ignore editor state probe errors
          }
        }
        const activeEl = doc?.activeElement && doc.activeElement.nodeType === 1 ? doc.activeElement : null;
        if(activeEl){
          if(isEditableTarget(activeEl)){
            return true;
          }
          if(typeof activeEl.closest === 'function' && activeEl.closest('.ag-cell-inline-editing,.ag-popup-editor,.ag-cell-editor')){
            return true;
          }
        }
        if(container && typeof container.querySelector === 'function'){
          if(container.querySelector('.ag-cell-inline-editing .ag-input-field-input,.ag-cell-inline-editing [contenteditable],.ag-cell-inline-editing input,.ag-cell-inline-editing textarea')){
            return true;
          }
        }
        return false;
      };

      const resolveCellCoords = (event)=>{
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        return resolveCellCoordsFromNode(target);
      };

      const colToA1LabelFallback = (col)=>{
        return toExcelColumnLabel(col);
      };

      const resolveFormulaEditingContext = ()=>{
        if(!enableFormulaReferenceSelection){
          return null;
        }
        let input = null;
        let editingRow = null;
        let editingCol = null;
        let allowExternalInput = false;
        if(resolveFormulaReferenceInput){
          try{
            const resolved = resolveFormulaReferenceInput({
              instance,
              container,
              headerRowCount,
              getFormulaA1RowOffset
            });
            if(resolved && typeof resolved === 'object'){
              input = resolved.input || null;
              editingRow = Number(resolved.editingRow);
              editingCol = Number(resolved.editingCol);
              allowExternalInput = resolved.allowExternalInput === true;
            }else if(resolved && resolved.nodeType === 1){
              input = resolved;
            }
          }catch(err){
            if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
              console.debug('Debug: Shared.hot resolveFormulaReferenceInput failed', {
                debugLabel,
                message: err?.message || String(err)
              });
            }
          }
        }
        if(!input){
          const active = doc?.activeElement && doc.activeElement.nodeType === 1 ? doc.activeElement : null;
          if(active && isEditableTarget(active)){
            input = active;
          }
        }
        if(!input){
          return null;
        }
        if(!allowExternalInput && !container.contains(input)){
          return null;
        }
        const textValue = String(input.value ?? '');
        if(!textValue.trim().startsWith('=')){
          return null;
        }
        if(!(Number.isInteger(editingRow) && editingRow >= 0 && Number.isInteger(editingCol) && editingCol >= 0)){
          const api = instance?.gridApi;
          if(api && typeof api.getEditingCells === 'function'){
            try{
              const editingCells = api.getEditingCells();
              const candidate = Array.isArray(editingCells)
                ? editingCells.find(item => {
                  const colId = item?.column?.getColId?.() || item?.colId || '';
                  return typeof colId === 'string' && colId.startsWith('c');
                })
                : null;
              if(candidate){
                editingRow = Number(candidate.rowIndex);
                const colId = candidate.column?.getColId?.() || candidate.colId || '';
                editingCol = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
              }
            }catch(err){
              // ignore editing probe errors
            }
          }
        }
        if(!Number.isInteger(editingRow) || editingRow < 0 || !Number.isInteger(editingCol) || editingCol < 0){
          return null;
        }
        return { input, editingRow, editingCol };
      };

      const resolveA1ReferenceForVisualCell = (row, col)=>{
        const visualRow = Number(row);
        const visualCol = Number(col);
        if(!Number.isInteger(visualRow) || visualRow < 0 || !Number.isInteger(visualCol) || visualCol < 0){
          return null;
        }
        const formulaNS = Shared.formulaEngine || {};
        const rowOffset = getFormulaA1RowOffset();
        if(typeof formulaNS.toA1 === 'function'){
          const ref = formulaNS.toA1(visualRow, visualCol, { a1RowOffset: rowOffset });
          if(typeof ref === 'string' && ref){
            return ref;
          }
          return null;
        }
        const a1Row = visualRow - rowOffset + 1;
        if(!Number.isInteger(a1Row) || a1Row < 1){
          return null;
        }
        const label = typeof formulaNS.colToLabel === 'function'
          ? formulaNS.colToLabel(visualCol)
          : colToA1LabelFallback(visualCol);
        return `${label}${a1Row}`;
      };

      const resolveA1ReferenceRangeForVisualCells = (start, end)=>{
        if(!start || !end){
          return null;
        }
        const startRef = resolveA1ReferenceForVisualCell(start.row, start.col);
        if(!startRef){
          return null;
        }
        const endRef = resolveA1ReferenceForVisualCell(end.row, end.col);
        if(!endRef){
          return null;
        }
        if(start.row === end.row && start.col === end.col){
          return startRef;
        }
        return `${startRef}:${endRef}`;
      };

      const insertReferenceIntoFormulaInput = (input, reference, options = {})=>{
        if(!input || typeof reference !== 'string' || !reference){
          return null;
        }
        const current = String(input.value ?? '');
        if(!current.trim().startsWith('=')){
          return null;
        }
        const length = current.length;
        const rawStart = Number(input.selectionStart);
        const rawEnd = Number(input.selectionEnd);
        const defaultCaret = length;
        let start = Number.isInteger(rawStart) ? Math.max(0, Math.min(length, rawStart)) : defaultCaret;
        let end = Number.isInteger(rawEnd) ? Math.max(0, Math.min(length, rawEnd)) : start;
        if(start > end){
          const temp = start;
          start = end;
          end = temp;
        }
        let replaceStart = Number.isInteger(Number(options.replaceStart))
          ? Math.max(0, Math.min(length, Number(options.replaceStart)))
          : start;
        let replaceEnd = Number.isInteger(Number(options.replaceEnd))
          ? Math.max(0, Math.min(length, Number(options.replaceEnd)))
          : end;
        if(replaceStart > replaceEnd){
          const temp = replaceStart;
          replaceStart = replaceEnd;
          replaceEnd = temp;
        }
        const shouldProbeToken = options.probeToken !== false;
        if(shouldProbeToken && replaceStart === replaceEnd){
          let left = replaceStart;
          let right = replaceEnd;
          const tokenChar = ch => /[A-Za-z0-9$:]/.test(ch || '');
          while(left > 0 && tokenChar(current[left - 1])){
            left -= 1;
          }
          while(right < current.length && tokenChar(current[right])){
            right += 1;
          }
          const token = current.slice(left, right);
          if(/^\$?[A-Za-z]+\$?\d+(?::\$?[A-Za-z]+\$?\d+)?$/.test(token)){
            replaceStart = left;
            replaceEnd = right;
          }
        }
        const nextValue = `${current.slice(0, replaceStart)}${reference}${current.slice(replaceEnd)}`;
        const nextCaret = replaceStart + reference.length;
        input.value = nextValue;
        if(options.markAutoCloseOnCommit === true){
          try{
            input.__hotFormulaAutoCloseParensOnCommit = true;
          }catch(err){
            // non-critical metadata write
          }
        }
        try{
          input.setSelectionRange?.(nextCaret, nextCaret);
        }catch(err){
          // best-effort caret placement
        }
        input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
        input.focus?.();
        return {
          applied: true,
          replaceStart,
          replaceEnd: replaceStart + reference.length,
          nextCaret,
          value: nextValue
        };
      };

      const resolveFormulaReferenceCoordsFromPointer = (event, options = {})=>{
        const fallbackCol = Number(options?.fallbackCol);
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        let coords = null;
        const directCell = target && typeof target.closest === 'function'
          ? target.closest('.ag-cell[col-id^="c"]')
          : null;
        if(directCell){
          const colId = directCell.getAttribute?.('col-id') || '';
          const col = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          const rowAttr = directCell.closest?.('.ag-row')?.getAttribute?.('row-index') || '';
          const row = parseVisualRowIndex(rowAttr);
          if(Number.isInteger(row) && row >= 0 && Number.isInteger(col) && col >= 0){
            coords = { row, col };
          }
        }
        if(!coords){
          coords = resolveCellCoords(event);
        }
        if(!coords){
          const x = typeof event?.clientX === 'number' ? event.clientX : null;
          const y = typeof event?.clientY === 'number' ? event.clientY : null;
          if(x != null && y != null){
            coords = resolveCellCoordsFromPoint(x, y);
            if(!coords){
              const row = estimateRowIndexFromPointer(y);
              let col = resolveColIndexFromEvent(event);
              if(!Number.isInteger(col) && Number.isInteger(fallbackCol) && fallbackCol >= 0){
                col = fallbackCol;
              }
              if(Number.isInteger(row) && row >= 0 && Number.isInteger(col) && col >= 0){
                coords = { row, col };
              }
            }
          }
        }
        if(!coords){
          const colId = directCell?.getAttribute?.('col-id') || '';
          const col = typeof colId === 'string' && colId.startsWith('c') ? Number(colId.slice(1)) : null;
          const row = resolveRowIndexFromEvent(event);
          if(Number.isInteger(row) && row >= 0 && Number.isInteger(col) && col >= 0){
            coords = { row, col };
          }
        }
        return coords;
      };

      const stopFormulaReferenceDrag = (reason)=>{
        if(formulaReferenceAutoScrollRafId != null){
          try{
            if(typeof win?.cancelAnimationFrame === 'function'){
              win.cancelAnimationFrame(formulaReferenceAutoScrollRafId);
            }else{
              win?.clearTimeout?.(formulaReferenceAutoScrollRafId);
            }
          }catch(err){
            // ignore cancellation errors
          }
          formulaReferenceAutoScrollRafId = null;
        }
        formulaReferenceDragLastPointer = null;
        if(!formulaReferenceDragState){
          return false;
        }
        formulaReferenceDragState = null;
        suppressNextCellClick = true;
        win?.setTimeout?.(()=>{ suppressNextCellClick = false; }, 80);
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot formula reference drag end', { debugLabel, reason: reason || 'unknown' });
        }
        return true;
      };

      const updateFormulaReferenceDragFromPointer = (event, options = {})=>{
        const state = formulaReferenceDragState;
        if(!state?.input || !state?.anchor){
          return false;
        }
        const fallbackCol = Number.isInteger(Number(options?.fallbackCol))
          ? Number(options.fallbackCol)
          : (state.current?.col ?? state.anchor.col);
        const coords = resolveFormulaReferenceCoordsFromPointer(event, { fallbackCol });
        if(!coords){
          return false;
        }
        const prev = state.current;
        if(prev && prev.row === coords.row && prev.col === coords.col){
          return true;
        }
        const reference = resolveA1ReferenceRangeForVisualCells(state.anchor, coords);
        if(!reference){
          return false;
        }
        const inserted = insertReferenceIntoFormulaInput(state.input, reference, {
          replaceStart: state.replaceStart,
          replaceEnd: state.replaceEnd,
          probeToken: false,
          markAutoCloseOnCommit: true
        });
        if(!inserted || inserted.applied !== true){
          return false;
        }
        state.current = coords;
        state.replaceStart = inserted.replaceStart;
        state.replaceEnd = inserted.replaceEnd;
        if(enableFormulaReferenceOverlay){
          setFormulaReferenceOverlay(state.input.value || '', {
            a1RowOffset: getFormulaA1RowOffset()
          });
          ensureFormulaOverlayLoop('pointer-range-drag');
        }
        return true;
      };

      const scheduleFormulaReferenceAutoScroll = ()=>{
        if(formulaReferenceAutoScrollRafId != null){
          return;
        }
        formulaReferenceAutoScrollRafId = raf(()=>{
          formulaReferenceAutoScrollRafId = null;
          if(!formulaReferenceDragState){
            return;
          }
          const didScroll = maybeAutoScrollPointer(formulaReferenceDragLastPointer);
          if(didScroll && formulaReferenceDragLastPointer){
            updateFormulaReferenceDragFromPointer({
              clientX: formulaReferenceDragLastPointer.x,
              clientY: formulaReferenceDragLastPointer.y,
              target: null
            }, {
              fallbackCol: formulaReferenceDragState.current?.col ?? formulaReferenceDragState.anchor?.col
            });
          }
          scheduleFormulaReferenceAutoScroll();
        });
      };

      const startFormulaReferenceDragFromPointer = (event)=>{
        const context = resolveFormulaEditingContext();
        if(!context){
          return false;
        }
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(target && (target === context.input || context.input.contains?.(target))){
          return false;
        }
        const anchorCoords = resolveFormulaReferenceCoordsFromPointer(event);
        if(!anchorCoords){
          return false;
        }
        const reference = resolveA1ReferenceRangeForVisualCells(anchorCoords, anchorCoords);
        if(!reference){
          return false;
        }
        const inserted = insertReferenceIntoFormulaInput(context.input, reference, {
          markAutoCloseOnCommit: true
        });
        if(!inserted || inserted.applied !== true){
          return false;
        }
        formulaReferenceDragState = {
          input: context.input,
          anchor: anchorCoords,
          current: anchorCoords,
          replaceStart: inserted.replaceStart,
          replaceEnd: inserted.replaceEnd
        };
        formulaReferenceDragLastPointer = {
          x: typeof event?.clientX === 'number' ? event.clientX : null,
          y: typeof event?.clientY === 'number' ? event.clientY : null
        };
        if(enableFormulaReferenceOverlay){
          setFormulaReferenceOverlay(context.input.value || '', {
            a1RowOffset: getFormulaA1RowOffset()
          });
          ensureFormulaOverlayLoop('pointer-range-start');
        }
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot formula reference drag start', {
            debugLabel,
            anchor: anchorCoords
          });
        }
        event.preventDefault?.();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        return true;
      };

      const hasEditingCellsForCurrentGrid = ()=>{
        const api = instance?.gridApi;
        if(!api || typeof api.getEditingCells !== 'function'){
          return false;
        }
        try{
          const editing = api.getEditingCells();
          return Array.isArray(editing) && editing.some(item => {
            const colId = item?.column?.getColId?.() || item?.colId || '';
            return typeof colId === 'string' && colId.startsWith('c');
          });
        }catch(err){
          return false;
        }
      };

      const resolveActiveFormulaOverlayInput = ()=>{
        let input = null;
        let allowExternalInput = false;
        if(resolveFormulaReferenceInput){
          try{
            const resolved = resolveFormulaReferenceInput({
              instance,
              container,
              headerRowCount,
              getFormulaA1RowOffset
            });
            if(resolved && typeof resolved === 'object' && resolved.nodeType !== 1){
              input = resolved.input || null;
              allowExternalInput = resolved.allowExternalInput === true;
            }else if(resolved && resolved.nodeType === 1){
              input = resolved;
            }
          }catch(err){
            if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
              console.debug('Debug: Shared.hot resolveActiveFormulaOverlayInput resolver failed', {
                debugLabel,
                message: err?.message || String(err)
              });
            }
          }
        }
        if(!input){
          const active = doc?.activeElement && doc.activeElement.nodeType === 1 ? doc.activeElement : null;
          if(active && isEditableTarget(active)){
            input = active;
          }
        }
        if(!input && typeof container?.querySelector === 'function'){
          input = container.querySelector('.ag-cell-inline-editing .ag-input-field-input,.ag-cell-inline-editing input,.ag-cell-inline-editing textarea,.ag-cell-inline-editing [contenteditable],.ag-cell-editor .ag-input-field-input,.ag-cell-editor input,.ag-cell-editor textarea,.ag-cell-editor [contenteditable]');
        }
        if(!input && hasEditingCellsForCurrentGrid()){
          const active = doc?.activeElement && doc.activeElement.nodeType === 1 ? doc.activeElement : null;
          if(active && isEditableTarget(active) && typeof active.closest === 'function' && active.closest('.ag-popup-editor,.ag-cell-editor')){
            input = active;
          }else{
            input = doc?.querySelector?.('.ag-popup-editor .ag-input-field-input,.ag-popup-editor input,.ag-popup-editor textarea,.ag-popup-editor [contenteditable]') || null;
          }
        }
        if(!input || !isEditableTarget(input)){
          return null;
        }
        if(container.contains(input) || allowExternalInput){
          return input;
        }
        const isPopupEditorInput = typeof input.closest === 'function' && !!input.closest('.ag-popup-editor,.ag-cell-editor');
        if(isPopupEditorInput && hasEditingCellsForCurrentGrid()){
          return input;
        }
        return null;
      };

      const updateFormulaReferenceOverlayFromInput = (input, options = {})=>{
        if(!enableFormulaReferenceOverlay || !input){
          return false;
        }
        const rawValue = String(input.value ?? '');
        if(rawValue.trim().startsWith('=')){
          return setFormulaReferenceOverlay(rawValue, {
            a1RowOffset: Number.isInteger(Number(options.a1RowOffset))
              ? Math.max(0, Number(options.a1RowOffset))
              : getFormulaA1RowOffset()
          });
        }
        return false;
      };

      let formulaOverlayLoopTimerId = null;
      const stopFormulaOverlayLoopInternal = ()=>{
        if(formulaOverlayLoopTimerId == null){
          return;
        }
        win?.clearTimeout?.(formulaOverlayLoopTimerId);
        formulaOverlayLoopTimerId = null;
      };
      const runFormulaOverlayLoop = (reason)=>{
        formulaOverlayLoopTimerId = null;
        if(!enableFormulaReferenceOverlay){
          clearFormulaReferenceOverlay({ removeLayer: true });
          return;
        }
        const input = resolveActiveFormulaOverlayInput();
        const updated = input
          ? updateFormulaReferenceOverlayFromInput(input, { a1RowOffset: getFormulaA1RowOffset() })
          : false;
        if(!updated){
          clearFormulaReferenceOverlay({ removeLayer: true });
          return;
        }
        formulaOverlayLoopTimerId = win?.setTimeout?.(()=>runFormulaOverlayLoop(`tick:${reason || 'unknown'}`), 120);
      };
      ensureFormulaOverlayLoop = (reason)=>{
        if(!enableFormulaReferenceOverlay){
          return;
        }
        if(formulaOverlayLoopTimerId == null){
          runFormulaOverlayLoop(reason || 'start');
        }
      };
      stopFormulaOverlayLoop = ()=>{
        stopFormulaOverlayLoopInternal();
      };

      const handleFormulaReferenceOverlayInput = ()=>{
        ensureFormulaOverlayLoop('input');
      };

      const handleFormulaReferenceOverlayFocusIn = ()=>{
        ensureFormulaOverlayLoop('focusin');
      };

      const handleFormulaReferenceOverlayFocusOut = ()=>{
        ensureFormulaOverlayLoop('focusout');
      };

      const selectRowByHeader = (row, extend)=>{
        const visualRow = Number(row);
        if(!Number.isInteger(visualRow) || visualRow < 0){
          return;
        }
        clearGridCellFocus(instance.gridApi);
        focusGridContainer();
        clearSelectedHeaderColumns();
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

      const selectColumnByHeader = (col, extend, additive, options)=>{
        const visualCol = Number(col);
        if(!Number.isInteger(visualCol) || visualCol < 0){
          return;
        }
        const shouldRender = options?.render !== false;
        const deferRender = !!options?.deferRender;
        const renderSelection = ()=>{
          if(!shouldRender){
            return;
          }
          if(deferRender){
            return;
          }
          renderAg(instance.gridApi);
        };
        clearGridCellFocus(instance.gridApi);
        focusGridContainer();
        const lastRow = Math.max(0, getVisualRowCount() - 1);
        if(additive){
          const seed = selectedHeaderColumns.size
            ? Array.from(selectedHeaderColumns)
            : getFullColumnSelectionColumns();
          const next = new Set(seed);
          if(next.has(visualCol)){
            next.delete(visualCol);
          }else{
            next.add(visualCol);
          }
          selectedHeaderColumns = next;
          setLastRange({ from: { row: 0, col: visualCol }, to: { row: lastRow, col: visualCol } });
          renderSelection();
          fireHook('afterSelectionEnd', 0, visualCol, lastRow, visualCol);
          return;
        }
        clearSelectedHeaderColumns();
        let fromCol = visualCol;
        let toCol = visualCol;
        if(extend && normalizedSelectionRange){
          fromCol = Math.min(normalizedSelectionRange.from.col, visualCol);
          toCol = Math.max(normalizedSelectionRange.to.col, visualCol);
        }
        setLastRange({ from: { row: 0, col: fromCol }, to: { row: lastRow, col: toCol } });
        renderSelection();
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

      const cloneRange = (range)=>{
        const normalized = normalizeRange(range);
        if(!normalized){
          return null;
        }
        return {
          from: { row: normalized.from.row, col: normalized.from.col },
          to: { row: normalized.to.row, col: normalized.to.col }
        };
      };

      clearSortSelectionGuard = ()=>{
        const docLocal = container?.ownerDocument || document;
        const winLocal = docLocal?.defaultView || global;
        if(sortSelectionGuardTimerId != null){
          try{
            winLocal?.clearTimeout?.(sortSelectionGuardTimerId);
          }catch(err){
            // ignore
          }
        }
        sortSelectionGuardTimerId = null;
        suppressApiSelectionSyncForSort = false;
      };

      const armSortSelectionGuard = ()=>{
        const docLocal = container?.ownerDocument || document;
        const winLocal = docLocal?.defaultView || global;
        if(sortSelectionGuardTimerId != null){
          try{
            winLocal?.clearTimeout?.(sortSelectionGuardTimerId);
          }catch(err){
            // ignore
          }
          sortSelectionGuardTimerId = null;
        }
        sortSelectionGuardTimerId = winLocal?.setTimeout?.(()=>{
          pendingSortSelectionSnapshot = null;
          clearSortSelectionGuard();
        }, 1200) || null;
      };

      armSortSelectionSnapshot = ()=>{
        const rangeSnapshot = cloneRange(normalizedSelectionRange || lastRange);
        const headerCols = selectedHeaderColumns.size
          ? Array.from(selectedHeaderColumns).filter(idx => Number.isInteger(idx) && idx >= 0)
          : [];
        if(!rangeSnapshot && !headerCols.length){
          pendingSortSelectionSnapshot = null;
          return;
        }
        const anchorRow = Number(lastRange?.from?.row);
        const anchorCol = Number(lastRange?.from?.col);
        pendingSortSelectionSnapshot = {
          range: rangeSnapshot,
          headerCols,
          anchor: (Number.isInteger(anchorRow) && Number.isInteger(anchorCol))
            ? { row: anchorRow, col: anchorCol }
            : null
        };
        suppressApiSelectionSyncForSort = true;
        armSortSelectionGuard();
      };

      restoreSortSelectionSnapshot = (api)=>{
        const snapshot = pendingSortSelectionSnapshot;
        pendingSortSelectionSnapshot = null;
        if(!snapshot){
          clearSortSelectionGuard();
          scheduleFillHandleUpdate('sort-changed');
          if(formulaReferenceOverlayState.ranges.length){
            scheduleFormulaReferenceOverlayRender('sort-changed');
          }
          return;
        }
        isApplyingSortSelectionSnapshot = true;
        try{
          if(Array.isArray(snapshot.headerCols) && snapshot.headerCols.length){
            selectedHeaderColumns = new Set(snapshot.headerCols);
          }else{
            clearSelectedHeaderColumns();
          }
          if(snapshot.range){
            const restoredRange = cloneRange(snapshot.range);
            if(restoredRange){
              setLastRange(restoredRange);
              const anchor = snapshot.anchor;
              if(anchor
                && restoredRange.from.row === restoredRange.to.row
                && restoredRange.from.col === restoredRange.to.col
                && Number.isInteger(anchor.row)
                && Number.isInteger(anchor.col)){
                const colId = `c${anchor.col}`;
                try{
                  if(typeof api?.setFocusedCell === 'function'){
                    api.setFocusedCell(anchor.row, colId);
                  }
                }catch(err){
                  // ignore focus restore failures
                }
              }
              fireHook('afterSelectionEnd', restoredRange.from.row, restoredRange.from.col, restoredRange.to.row, restoredRange.to.col);
            }
          }
          renderAg(api || instance.gridApi);
        }finally{
          isApplyingSortSelectionSnapshot = false;
          clearSortSelectionGuard();
        }
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
        clearPasteDrivenSelectionState();
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(!target || typeof target.closest !== 'function'){
          return;
        }
        const cell = target.closest('.ag-cell[col-id="__rowHeader"]');
        if(!cell){
          return;
        }
        const rowAttr = cell.closest('.ag-row')?.getAttribute?.('row-index');
        const row = parseVisualRowIndex(rowAttr);
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
        clearPasteDrivenSelectionState();
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
            headerDragStartPointer = null;
            const colIdx = Number(colId.slice(1));
            const selectedCols = resolveSelectedColumnGroup(colIdx) || [colIdx];
            const dragColIds = selectedCols.map(idx => `c${idx}`);
            startColumnHandleDrag(dragColIds);
          }
          return;
        }
        if(target.closest('.hot-header-action')){
          // The right-side header action opens the filter popup; do not
          // rewrite selection on mousedown.
          isHeaderDragSelecting = false;
          headerDragScope = null;
          headerDragAnchor = null;
          pendingHeaderDragIndex = null;
          headerDragRafPending = false;
          headerDragMouseDown = false;
          headerDragColId = null;
          headerDragStartPointer = null;
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
        const additiveSelection = !!(event.ctrlKey || event.metaKey);
        const selectionIntent = !!(event.shiftKey || additiveSelection);
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
        headerDragStartPointer = {
          x: typeof event?.clientX === 'number' ? event.clientX : null,
          y: typeof event?.clientY === 'number' ? event.clientY : null
        };
        if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
          console.debug('Debug: Shared.hot header drag selection armed', { debugLabel, scope: 'column', col });
        }
        // Keep plain header clicks non-destructive: do not replace the active
        // cell selection unless the user is explicitly extending/toggling a
        // header selection with Shift/Ctrl/Cmd.
        if(!selectionIntent){
          focusGridContainer();
        }
        if(selectionIntent){
          selectColumnByHeader(col, !!event.shiftKey, additiveSelection, {
            deferRender: false
          });
        }
        // Keep sort active on plain header clicks; only suppress sorting when
        // the intent is multi-select/extend selection.
        if(event.shiftKey || additiveSelection){
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
        const target = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(!target || typeof target.closest !== 'function'){
          return;
        }
        if(!container?.contains?.(target)){
          return;
        }
        const headerCell = target.closest('.ag-header-cell');
        if(!headerCell){
          return;
        }
        const colId = headerCell.getAttribute('col-id');
        const isDataColumn = typeof colId === 'string' && colId.startsWith('c');
        if(!isDataColumn){
          const suppressionNonData = pendingHeaderSortSuppression;
          if(suppressionNonData){
            clearHeaderSortSuppression();
          }
          return;
        }
        const onSortIndicator = !!target.closest('.hot-header-action');
        const onDragHandle = !!target.closest('.hot-col-drag-handle');
        const onResizeHandle = !!target.closest('.ag-header-cell-resize');
        const onMenuButton = !!target.closest('.ag-header-cell-menu-button');
        const onHeaderIcon = !!target.closest('.ag-header-icon');
        const col = Number(colId.slice(1));
        const isValidCol = Number.isInteger(col) && col >= 0;
        if(!onSortIndicator && !onDragHandle && !onResizeHandle && !onMenuButton && !onHeaderIcon){
          if(suppressNextHeaderLabelClickSelection){
            suppressNextHeaderLabelClickSelection = false;
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
            return;
          }
          if(isValidCol){
            const additiveSelection = !!(event.ctrlKey || event.metaKey);
            const extendSelection = !!event.shiftKey;
            selectColumnByHeader(col, extendSelection, additiveSelection, {
              deferRender: false
            });
          }
          event.preventDefault?.();
          event.stopPropagation?.();
          event.stopImmediatePropagation?.();
          return;
        }
        const suppression = pendingHeaderSortSuppression;
        if(!suppression){
          return;
        }
        if(!suppression.any && colId !== suppression.colId){
          clearHeaderSortSuppression();
          return;
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
        const row = parseVisualRowIndex(rowAttr);
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
          container?.querySelector?.('.ag-center-cols-viewport'),
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
        let first = typeof api?.getFirstDisplayedRowIndex === 'function'
          ? api.getFirstDisplayedRowIndex()
          : (typeof api?.getFirstDisplayedRow === 'function' ? api.getFirstDisplayedRow() : 0);
        let last = typeof api?.getLastDisplayedRowIndex === 'function'
          ? api.getLastDisplayedRowIndex()
          : (typeof api?.getLastDisplayedRow === 'function' ? api.getLastDisplayedRow() : (total > 0 ? total - 1 : 0));
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
        let first = typeof api.getFirstDisplayedRowIndex === 'function'
          ? api.getFirstDisplayedRowIndex()
          : (typeof api.getFirstDisplayedRow === 'function' ? api.getFirstDisplayedRow() : 0);
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
        clearPasteDrivenSelectionState();
        if(startFormulaReferenceDragFromPointer(event)){
          return;
        }
        let coords = resolveCellCoords(event);
        if(!coords){
          const target = event?.target && event.target.nodeType === 1 ? event.target : null;
          const cell = target && typeof target.closest === 'function' ? target.closest('.ag-cell') : null;
          const colId = cell?.getAttribute?.('col-id') || null;
          if(cell && typeof colId === 'string' && colId.startsWith('c')){
            const row = resolveRowIndexFromEvent(event);
            const col = colIdToIndex(colId);
            if(Number.isInteger(row) && row >= 0 && Number.isInteger(col) && col >= 0){
              coords = { row, col };
            }
          }
        }
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
        if(formulaReferenceDragState){
          const buttons = typeof event?.buttons === 'number' ? event.buttons : null;
          if(buttons !== null && (buttons & 1) !== 1){
            stopFormulaReferenceDrag('button-up');
            return;
          }
          const clientX = typeof event?.clientX === 'number' ? event.clientX : null;
          const clientY = typeof event?.clientY === 'number' ? event.clientY : null;
          formulaReferenceDragLastPointer = { x: clientX, y: clientY };
          updateFormulaReferenceDragFromPointer(event);
          scheduleFormulaReferenceAutoScroll();
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
            const dragThreshold = 3;
            const startX = Number(headerDragStartPointer?.x);
            const startY = Number(headerDragStartPointer?.y);
            const nextX = typeof event?.clientX === 'number' ? event.clientX : null;
            const nextY = typeof event?.clientY === 'number' ? event.clientY : null;
            if(Number.isFinite(startX) && Number.isFinite(startY) && Number.isFinite(nextX) && Number.isFinite(nextY)){
              const movedX = Math.abs(nextX - startX);
              const movedY = Math.abs(nextY - startY);
              if(Math.max(movedX, movedY) < dragThreshold){
                const anchorCol = (typeof headerDragColId === 'string' && headerDragColId.startsWith('c'))
                  ? Number(headerDragColId.slice(1))
                  : null;
                const hoverCol = resolveColIndexFromEvent(event);
                if(!Number.isInteger(anchorCol) || !Number.isInteger(hoverCol) || hoverCol === anchorCol){
                  return;
                }
              }
            }
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
              clearGridCellFocus(instance.gridApi);
              setLastRange({ from: { row: fromRow, col: fromCol }, to: { row: toRow, col: toCol } });
              renderAg(instance.gridApi);
              return;
            }
            const nextCol = pendingHeaderDragIndex;
            const anchorCol = Number(headerDragAnchor.col ?? nextCol);
            const lastRow = Math.max(0, getVisualRowCount() - 1);
            const fromCol = Math.min(anchorCol, nextCol);
            const toCol = Math.max(anchorCol, nextCol);
            clearGridCellFocus(instance.gridApi);
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
        if(formulaReferenceDragState){
          stopFormulaReferenceDrag('mouseup');
          return;
        }
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
          suppressNextHeaderLabelClickSelection = true;
          win?.setTimeout?.(()=>{ suppressNextHeaderLabelClickSelection = false; }, 80);
          headerDragScope = null;
          headerDragAnchor = null;
          pendingHeaderDragIndex = null;
          headerDragRafPending = false;
          headerDragMouseDown = false;
          headerDragColId = null;
          headerDragStartPointer = null;
          const normalized = getEffectiveSelectionRange();
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
          headerDragStartPointer = null;
        }
        if(!isDragSelecting){
          return;
        }
        isDragSelecting = false;
        dragRafPending = false;
        resetSelectionAutoScroll();
        const normalized = getEffectiveSelectionRange();
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
        const normalizedKey = typeof key === 'string' ? key.toLowerCase() : '';
        const isCmd = !!(event.ctrlKey || event.metaKey);
        const isSelectionNavigationKey = key === 'ArrowLeft'
          || key === 'ArrowRight'
          || key === 'ArrowUp'
          || key === 'ArrowDown'
          || key === 'Tab'
          || key === 'Home'
          || key === 'End'
          || key === 'PageUp'
          || key === 'PageDown';
        if(!isCmd && (isSelectionNavigationKey || key === 'Enter' || key === 'NumpadEnter')){
          clearPasteDrivenSelectionState();
        }
        const isEscape = key === 'Escape' || keyCode === 27;
        if(isEscape && isFillHandleDragging){
          resetFillHandleDrag('escape');
          return;
        }
        if(isEscape && hasClipboardOutline()){
          setClipboardOutlineState(null, 'escape');
        }
        const isEnter = key === 'Enter' || key === 'NumpadEnter' || keyCode === 13;
        if(isEnter && hasClipboardOutline()){
          setClipboardOutlineState(null, 'enter');
        }
        if(isEnter && !isEditableTarget(event.target)){
          const selection = getEffectiveSelectionRange();
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
          const selectedColumns = getSelectedHeaderColumnsSorted();
          const useSelectedColumns = selectedColumns.length > 0;
          const selection = getEffectiveSelectionRange();
          if(selection || useSelectedColumns){
            event.preventDefault?.();
            event.stopPropagation?.();
            const rowSpan = useSelectedColumns ? resolveRowSpanForSelection() : null;
            const changes = useSelectedColumns
              ? buildVisualClearChangesForColumns(selectedColumns, rowSpan.startRow, rowSpan.endRow)
              : buildVisualClearChangesForColumns(
                Array.from({ length: Math.max(0, selection.to.col - selection.from.col + 1) }, (_, offset)=>selection.from.col + offset),
                selection.from.row,
                selection.to.row
              );
            if(changes.length){
              instance.setDataAtCell(changes, 'delete');
              setClipboardOutlineState(null, 'delete');
            }
          }
          return;
        }
        if(!isCmd || isEditableTarget(event.target)){
          return;
        }
        if((normalizedKey === 'z' || normalizedKey === 'y') && event.defaultPrevented){
          return;
        }
        if((normalizedKey === 'z' || normalizedKey === 'y') && Shared.undoManager?.__globalKeydownAttached){
          return;
        }
        if(normalizedKey === 'z'){
          const manager = Shared.undoManager || null;
          const handled = event.shiftKey
            ? !!(manager && typeof manager.redo === 'function' && manager.redo())
            : !!(manager && typeof manager.undo === 'function' && manager.undo());
          if(handled){
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
          }
          return;
        }
        if(normalizedKey === 'y'){
          const manager = Shared.undoManager || null;
          const handled = !!(manager && typeof manager.redo === 'function' && manager.redo());
          if(handled){
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
          }
          return;
        }
        if(normalizedKey === 'a'){
          event.preventDefault?.();
          event.stopPropagation?.();
          event.stopImmediatePropagation?.();
          clearPasteDrivenSelectionState();
          const lastRow = Math.max(0, getVisualRowCount() - 1);
          const lastCol = Math.max(0, colCount - 1);
          setLastRange({ from: { row: 0, col: 0 }, to: { row: lastRow, col: lastCol } });
          renderAg(instance.gridApi);
          fireHook('afterSelectionEnd', 0, 0, lastRow, lastCol);
          return;
        }
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
        if(isEditableTarget(event.target) || isInlineEditorActive()){
          if(typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: hot.handlePaste ignored (inline editing active)', {
              debugLabel,
              targetTag: resolveTargetElement(event.target)?.tagName || null
            });
          }
          return;
        }
        const targetNode = event?.target && event.target.nodeType === 1 ? event.target : null;
        if(targetNode && !container.contains(targetNode)){
          const activeEl = doc?.activeElement && doc.activeElement.nodeType === 1 ? doc.activeElement : null;
          if(!activeEl || !container.contains(activeEl)){
            if(typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
              console.debug('Debug: hot.handlePaste ignored (outside container)', {
                debugLabel,
                target: targetNode?.tagName || null,
                activeTag: activeEl?.tagName || null
              });
            }
            return;
          }
        }
        let selection = getEffectiveSelectionRange();
        if(!selection){
          const coords = resolveCellCoords(event);
          if(coords){
            setLastRange({ from: coords, to: coords });
            selection = normalizeRange({ from: coords, to: coords });
          }
        }
        const selectedColumns = getSelectedHeaderColumnsSorted();
        const useSelectedColumns = selectedColumns.length > 0;
        if(!selection && useSelectedColumns){
          const lastRow = Math.max(0, getVisualRowCount() - 1);
          selection = {
            from: { row: 0, col: selectedColumns[0] },
            to: { row: lastRow, col: selectedColumns[selectedColumns.length - 1] }
          };
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
        const normalizedClipboardText = normalizeClipboardText(plain);
        const pendingClipboardMove = getPendingClipboardMoveForPaste(normalizedClipboardText);
        if(hotNS.__pendingClipboardMove && !pendingClipboardMove){
          invalidatePendingClipboardMove('paste-mismatch');
        }
        const rows = parsePastedText(plain);
        if(!rows.length){
          return;
        }
        event.preventDefault?.();
        event.stopImmediatePropagation?.();
        event.stopPropagation?.();
        const selRowCount = selection.to.row - selection.from.row + 1;
        const selColCount = useSelectedColumns
          ? selectedColumns.length
          : (selection.to.col - selection.from.col + 1);
        let block = rows;
        if((selRowCount > 1 || selColCount > 1) && rows.length === 1 && rows[0].length === 1){
          const value = rows[0][0];
          block = Array.from({ length: selRowCount }, ()=>Array.from({ length: selColCount }, ()=>value));
        }
        const endRow = selection.from.row + block.length - 1;
        const endCol = useSelectedColumns
          ? selectedColumns[selectedColumns.length - 1]
          : (selection.from.col + (block[0]?.length || 1) - 1);
        try{
          let capturedPasteChanges = [];
          const applyPasteMutation = ()=>{
            if(useSelectedColumns){
              const sourceColCount = block.reduce((max, row)=>Math.max(max, Array.isArray(row) ? row.length : 0), 0);
              const changes = [];
              for(let r = 0; r < block.length; r += 1){
                const sourceRow = Array.isArray(block[r]) ? block[r] : [block[r]];
                for(let c = 0; c < selectedColumns.length; c += 1){
                  const visualCol = selectedColumns[c];
                  let sourceColIndex = 0;
                  if(sourceColCount > 1){
                    if(sourceColCount >= selectedColumns.length){
                      sourceColIndex = c;
                    }else{
                      sourceColIndex = c % sourceColCount;
                    }
                  }
                  const value = sourceRow[sourceColIndex];
                  changes.push([selection.from.row + r, visualCol, value == null ? '' : value]);
                }
              }
              if(changes.length){
                instance.setDataAtCell(changes, 'paste');
              }
              return;
            }
            instance.populateFromArray(selection.from.row, selection.from.col, block, endRow, endCol, 'clipboard', 'paste');
          };

          if(pendingClipboardMove){
            capturedPasteChanges = withUndoLock('clipboard-move-paste', ()=>captureLockedMutationChangesDuring(()=>{
              applyPasteMutation();
            })) || [];
            const pastePhysicalChanges = buildPhysicalChangeListFromVisualChanges(capturedPasteChanges);
            upgradePendingClipboardMoveForPaste(
              pendingClipboardMove,
              pastePhysicalChanges,
              applyPhysicalChanges,
              debugLabel
            );
          }else{
            applyPasteMutation();
          }
          const pastedSelectionRange = {
            from: { row: selection.from.row, col: useSelectedColumns ? selectedColumns[0] : selection.from.col },
            to: { row: endRow, col: endCol }
          };
          armPasteSelectionLock(pastedSelectionRange);
          setSelectionRangeOverride(pastedSelectionRange);
          applyProgrammaticSelectionRange(pastedSelectionRange, {
            api: instance.gridApi,
            render: true,
            syncGridApi: true,
            fireHook: false,
            preservePasteSelectionLock: true
          });
          clearActiveClipboardSelectionOwner('paste');
          fireHook('afterSelectionEnd', pastedSelectionRange.from.row, pastedSelectionRange.from.col, pastedSelectionRange.to.row, pastedSelectionRange.to.col);
          scheduleSelectionReassert(pastedSelectionRange, 'paste');
        }catch(err){
          console.error('Shared.hot AG paste handler failed', { debugLabel, err });
        }
      };

      container.__undoManagerHandleKeydown = (event)=>{
        if(!event){
          return false;
        }
        const normalizedKey = typeof event.key === 'string' ? event.key.toLowerCase() : '';
        if((!event.ctrlKey && !event.metaKey) || event.altKey){
          return false;
        }
        if(normalizedKey !== 'z' && normalizedKey !== 'y'){
          return false;
        }
        if(isEditableTarget(event.target) || isInlineEditorActive()){
          return false;
        }
        if(normalizedKey === 'z'){
          if(event.shiftKey){
            return !!(typeof instance.redo === 'function' && instance.redo());
          }
          return !!(typeof instance.undo === 'function' && instance.undo());
        }
        return !!(typeof instance.redo === 'function' && instance.redo());
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

      const handleWindowBlur = ()=>{
        if(isColumnHandleDragging){
          stopColumnHandleDrag();
        }
      };

      let touchPointerTapState = null;
      let pendingTouchEditTap = null;
      const TOUCH_TAP_MAX_DELAY_MS = 420;
      const TOUCH_TAP_MAX_DIST_SQ = 18 * 18;
      const TOUCH_EDIT_REPEAT_WINDOW_MS = 1200;
      const resolveEditableCellTap = (event)=>{
        const target = resolveTargetElement(event?.target);
        const cell = target?.closest?.('.ag-cell[col-id^="c"]');
        if(!cell){
          return null;
        }
        const coords = resolveCellCoordsFromNode(cell);
        if(!coords){
          return null;
        }
        if(coords.col >= colCount){
          return null;
        }
        return coords;
      };
      const handleTouchPointerDown = (event)=>{
        if(singleClickEdit || event?.pointerType !== 'touch'){
          return;
        }
        const coords = resolveEditableCellTap(event);
        if(!coords){
          touchPointerTapState = null;
          pendingTouchEditTap = null;
          return;
        }
        touchPointerTapState = {
          pointerId: typeof event.pointerId === 'number' ? event.pointerId : null,
          row: coords.row,
          col: coords.col,
          startX: Number(event.clientX) || 0,
          startY: Number(event.clientY) || 0,
          startTs: Date.now()
        };
      };
      const handleTouchPointerUp = (event)=>{
        if(singleClickEdit || event?.pointerType !== 'touch' || !touchPointerTapState){
          return;
        }
        const state = touchPointerTapState;
        touchPointerTapState = null;
        if(state.pointerId != null && typeof event.pointerId === 'number' && event.pointerId !== state.pointerId){
          return;
        }
        const elapsed = Date.now() - state.startTs;
        const dx = (Number(event.clientX) || 0) - state.startX;
        const dy = (Number(event.clientY) || 0) - state.startY;
        if(elapsed > TOUCH_TAP_MAX_DELAY_MS || ((dx * dx) + (dy * dy)) > TOUCH_TAP_MAX_DIST_SQ){
          return;
        }
        const coords = resolveEditableCellTap(event) || { row: state.row, col: state.col };
        if(!Number.isInteger(coords.row) || coords.row < 0 || !Number.isInteger(coords.col) || coords.col < 0){
          pendingTouchEditTap = null;
          return;
        }
        const now = Date.now();
        const isRepeatTouchEditTap = !!(
          pendingTouchEditTap
          && pendingTouchEditTap.row === coords.row
          && pendingTouchEditTap.col === coords.col
          && (now - pendingTouchEditTap.ts) <= TOUCH_EDIT_REPEAT_WINDOW_MS
        );
        pendingTouchEditTap = {
          row: coords.row,
          col: coords.col,
          ts: now
        };
        if(!isRepeatTouchEditTap){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot touch edit tap armed', {
              debugLabel,
              row: coords.row,
              col: coords.col
            });
          }
          return;
        }
        pendingTouchEditTap = null;
        if(isInlineEditorActive()){
          return;
        }
        const api = instance?.gridApi;
        if(!api || typeof api.startEditingCell !== 'function'){
          return;
        }
        const colKey = `c${coords.col}`;
        try{
          api.startEditingCell({
            rowIndex: coords.row,
            colKey,
            rowPinned: null
          });
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot touch edit tap start', {
              debugLabel,
              row: coords.row,
              col: coords.col
            });
          }
          event.preventDefault?.();
        }catch(err){
          if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: Shared.hot touch tap edit failed', {
              debugLabel,
              row: coords.row,
              col: coords.col,
              message: err?.message || String(err)
            });
          }
        }
      };
      const handleTouchPointerCancel = ()=>{
        touchPointerTapState = null;
        pendingTouchEditTap = null;
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
        openColumnHeaderMenu(event, colIdx);
      };

      container.addEventListener('mousedown', handleRowHeaderMouseDown, true);
      container.addEventListener('mousedown', handleColumnHeaderMouseDown, true);
      container.addEventListener('mousedown', handleMouseDown, true);
      container.addEventListener('pointerdown', handleTouchPointerDown, true);
      container.addEventListener('pointerup', handleTouchPointerUp, true);
      container.addEventListener('pointercancel', handleTouchPointerCancel, true);
      container.addEventListener('input', handleFormulaReferenceOverlayInput, true);
      container.addEventListener('focusin', handleFormulaReferenceOverlayFocusIn, true);
      container.addEventListener('focusout', handleFormulaReferenceOverlayFocusOut, true);
      win?.addEventListener?.('mousemove', handleMouseMove, true);
      win?.addEventListener?.('pointermove', handleMouseMove, true);
      win?.addEventListener?.('mouseup', handleMouseUp, true);
      win?.addEventListener?.('pointerup', handleMouseUp, true);
      win?.addEventListener?.('pointercancel', handleMouseUp, true);
      win?.addEventListener?.('blur', handleWindowBlur, true);
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
      }else{
        const handleDocumentPasteRelay = (event)=>{
          if(!event || event.defaultPrevented){
            return;
          }
          const targetNode = resolveTargetElement(event.target);
          if(targetNode && container.contains(targetNode)){
            return;
          }
          const activeEl = doc?.activeElement && doc.activeElement.nodeType === 1 ? doc.activeElement : null;
          if(!activeEl || !container.contains(activeEl)){
            return;
          }
          if(isEditableTarget(activeEl) || isInlineEditorActive()){
            return;
          }
          let relayed = null;
          try{
            relayed = new Event('paste', { bubbles: true, cancelable: true });
            Object.defineProperty(relayed, 'clipboardData', {
              value: event.clipboardData || event.originalEvent?.clipboardData || null
            });
          }catch(err){
            relayed = null;
          }
          if(!relayed){
            return;
          }
          container.dispatchEvent(relayed);
          if(relayed.defaultPrevented){
            try{
              event.preventDefault?.();
              event.stopImmediatePropagation?.();
              event.stopPropagation?.();
            }catch(err){}
          }
        };
        try{
          doc.addEventListener('paste', handleDocumentPasteRelay, true);
          cleanupFns.push(()=>{ try{ doc.removeEventListener('paste', handleDocumentPasteRelay, true); }catch(e){}; });
          if(typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: hot.js registered document paste relay (disablePaste)', { containerId: container?.id || null, debugLabel });
          }
        }catch(e){
          if(typeof Shared?.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
            console.debug('Debug: hot.js failed to register document paste relay (disablePaste)', { message: e?.message || String(e), debugLabel });
          }
        }
      }
      cleanupFns.push(()=>{
        clearDeferredColumnMoveCommit();
        stopFormulaOverlayLoop();
        stopFormulaReferenceDrag('cleanup');
        pendingSortSelectionSnapshot = null;
        clearSortSelectionGuard();
        container.removeEventListener('mousedown', handleRowHeaderMouseDown, true);
        container.removeEventListener('mousedown', handleColumnHeaderMouseDown, true);
        container.removeEventListener('mousedown', handleMouseDown, true);
        container.removeEventListener('pointerdown', handleTouchPointerDown, true);
        container.removeEventListener('pointerup', handleTouchPointerUp, true);
        container.removeEventListener('pointercancel', handleTouchPointerCancel, true);
        container.removeEventListener('input', handleFormulaReferenceOverlayInput, true);
        container.removeEventListener('focusin', handleFormulaReferenceOverlayFocusIn, true);
        container.removeEventListener('focusout', handleFormulaReferenceOverlayFocusOut, true);
        win?.removeEventListener?.('mousemove', handleMouseMove, true);
        win?.removeEventListener?.('pointermove', handleMouseMove, true);
        win?.removeEventListener?.('mouseup', handleMouseUp, true);
        win?.removeEventListener?.('pointerup', handleMouseUp, true);
        win?.removeEventListener?.('pointercancel', handleMouseUp, true);
        win?.removeEventListener?.('blur', handleWindowBlur, true);
        win?.removeEventListener?.('mouseup', handleColumnHeaderMouseUp, true);
        doc.removeEventListener('click', handleColumnHeaderClick, true);
        clearHeaderSortSuppression();
        container.removeEventListener('keydown', handleKeyDown, true);
        container.removeEventListener('contextmenu', handleContextMenu, true);
        container.removeEventListener('contextmenu', handleHeaderContextMenuProxy, true);
        if(container.__undoManagerHandleKeydown){
          try{
            delete container.__undoManagerHandleKeydown;
          }catch(err){
            container.__undoManagerHandleKeydown = null;
          }
        }
        if(!disableBuiltInPaste){
          container.removeEventListener('paste', handlePaste, true);
          try{ document.removeEventListener('paste', handlePaste, true); }catch(e){}
        }
      });
    }

    instance.__hotExportFilters = function(){
      return exportActiveFilterState();
    };
    instance.__hotApplyFilters = function(payload, options = {}){
      const normalized = cloneFilterState(payload);
      const previous = exportActiveFilterState();
      if(areFilterStatesEqual(previous, normalized)){
        return previous;
      }
      const next = applyCapturedFilterState(normalized, options.reason || 'apply-filters', {
        schedule: options.schedule !== false
      });
      if(options.recordUndo === true){
        recordFilterUndo(options.undoLabel || `table:${debugLabel}:apply-filters`, previous, next);
      }
      return next;
    };
    instance.__hotClearFilters = function(options = {}){
      const previous = exportActiveFilterState();
      if(previous === EMPTY_FILTER_STATE || !Object.keys(previous.columns || {}).length){
        return previous;
      }
      const next = applyCapturedFilterState(EMPTY_FILTER_STATE, options.reason || 'clear-filters', {
        schedule: options.schedule !== false
      });
      if(options.recordUndo === true){
        recordFilterUndo(options.undoLabel || `table:${debugLabel}:clear-filters`, previous, next);
      }
      return next;
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
    instance.exportFilters = function(){
      return hotNS.exportFilters(instance);
    };
    instance.applyFilters = function(payload, options){
      return hotNS.applyFilters(instance, payload, options);
    };
    instance.clearFilters = function(options){
      return hotNS.clearFilters(instance, options);
    };
    instance.getAnalysisData = function(options){
      return hotNS.getAnalysisData(instance, options);
    };
    instance.getIncludedDataMatrix = function(options){
      return hotNS.getIncludedDataMatrix(instance, options);
    };
    if(overrides?.exclusions){
      exclusionController.importState(overrides.exclusions);
    }
    if(overrides?.filters){
      instance.applyFilters(overrides.filters, { schedule: false });
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

  function exportFilters(instance){
    const inst = resolveInstance(instance);
    if(!inst || typeof inst.__hotExportFilters !== 'function'){
      return EMPTY_FILTER_STATE;
    }
    return cloneFilterState(inst.__hotExportFilters());
  }

  function applyFilters(instance, payload, options){
    const inst = resolveInstance(instance);
    if(!inst || typeof inst.__hotApplyFilters !== 'function'){
      return EMPTY_FILTER_STATE;
    }
    return cloneFilterState(inst.__hotApplyFilters(payload, options || {}));
  }

  function clearFilters(instance, options){
    const inst = resolveInstance(instance);
    if(!inst || typeof inst.__hotClearFilters !== 'function'){
      return EMPTY_FILTER_STATE;
    }
    return cloneFilterState(inst.__hotClearFilters(options || {}));
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
            if(typeof inst.__hotGetDisplayDataAtCell === 'function'){
              rowValues.push(inst.__hotGetDisplayDataAtCell(row, col));
            }else{
              rowValues.push(inst.getDataAtCell(row, col));
            }
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

  function applyExclusionsToMatrix(matrix, exclusions){
    const sourceMatrix = Array.isArray(matrix) ? matrix : [];
    const rowSet = new Set(Array.isArray(exclusions?.rows) ? exclusions.rows.map(normalizeSelectionIndex).filter(idx => idx !== null) : []);
    const colSet = new Set(Array.isArray(exclusions?.cols) ? exclusions.cols.map(normalizeSelectionIndex).filter(idx => idx !== null) : []);
    const cellSet = new Set(
      Array.isArray(exclusions?.cells)
        ? exclusions.cells
            .map(cell => {
              if(Array.isArray(cell) && cell.length >= 2){
                const row = normalizeSelectionIndex(cell[0]);
                const col = normalizeSelectionIndex(cell[1]);
                return row !== null && col !== null ? `${row}:${col}` : null;
              }
              if(cell && typeof cell === 'object'){
                const row = normalizeSelectionIndex(cell.row);
                const col = normalizeSelectionIndex(cell.col);
                return row !== null && col !== null ? `${row}:${col}` : null;
              }
              return null;
            })
            .filter(Boolean)
        : []
    );
    return sourceMatrix.map((row, rowIndex)=>{
      const sourceRow = Array.isArray(row) ? row : [];
      return sourceRow.map((value, colIndex)=>{
        if(rowSet.has(rowIndex) || colSet.has(colIndex) || cellSet.has(`${rowIndex}:${colIndex}`)){
          return null;
        }
        return value;
      });
    });
  }

  function getIncludedDataMatrix(instance, options){
    const analysis = getAnalysisData(instance, options);
    const rowCount = Number(analysis?.rowCount) || (Array.isArray(analysis?.data) ? analysis.data.length : 0);
    const colCount = Number(analysis?.colCount) || (Array.isArray(analysis?.data?.[0]) ? analysis.data[0].length : 0);
    const matrix = [];
    for(let row = 0; row < rowCount; row += 1){
      const rowValues = [];
      const rowExcluded = !!analysis.isRowExcluded?.(row);
      for(let col = 0; col < colCount; col += 1){
        const colExcluded = !!analysis.isColumnExcluded?.(col);
        const cellExcluded = !!analysis.isCellExcluded?.(row, col);
        if(rowExcluded || colExcluded || cellExcluded){
          rowValues.push(null);
        }else{
          rowValues.push(analysis?.data?.[row]?.[col] ?? null);
        }
      }
      matrix.push(rowValues);
    }
    console.debug('Debug: Shared.hot getIncludedDataMatrix complete', {
      debugLabel: getInstanceDebugLabel(resolveInstance(instance)),
      rowCount,
      colCount
    });
    return matrix;
  }

  function getIncludedColumn(instance, visualCol, options){
    const analysis = getAnalysisData(instance, options);
    return analysis.getColumnValues(visualCol, options);
  }

  function getIncludedRow(instance, visualRow, options){
    const analysis = getAnalysisData(instance, options);
    return analysis.getRowValues(visualRow, options);
  }

  function setFormulaReferenceOverlayForInstance(instance, rawFormula, options){
    const inst = resolveInstance(instance);
    if(!inst || typeof inst.setFormulaReferenceOverlay !== 'function'){
      return false;
    }
    return inst.setFormulaReferenceOverlay(rawFormula, options);
  }

  function clearFormulaReferenceOverlayForInstance(instance, options){
    const inst = resolveInstance(instance);
    if(!inst || typeof inst.clearFormulaReferenceOverlay !== 'function'){
      return false;
    }
    inst.clearFormulaReferenceOverlay(options);
    return true;
  }

  function refreshFormulaReferenceOverlayForInstance(instance, reason){
    const inst = resolveInstance(instance);
    if(!inst || typeof inst.refreshFormulaReferenceOverlay !== 'function'){
      return false;
    }
    return inst.refreshFormulaReferenceOverlay(reason);
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

  hotNS.clearClipboardOutline = function(instance, reason){
    const inst = resolveInstance(instance);
    const label = reason || 'Shared.hot.clearClipboardOutline';
    const activeOwner = hotNS.__activeClipboardSelectionOwner;
    const target = activeOwner && typeof activeOwner.__hotClearClipboardOutline === 'function'
      ? activeOwner
      : inst;
    const debugLabel = getInstanceDebugLabel(target);
    if(target && typeof target.__hotClearClipboardOutline === 'function'){
      target.__hotClearClipboardOutline(label);
      console.debug('Debug: Shared.hot.clearClipboardOutline invoked', { debugLabel, reason: label });
      return true;
    }
    if(clearActiveClipboardSelectionOwner(label)){
      console.debug('Debug: Shared.hot.clearClipboardOutline invoked via active-owner fallback', { reason: label });
      return true;
    }
    console.debug('Debug: Shared.hot.clearClipboardOutline skipped', {
      debugLabel,
      reason: label,
      hasHandler: !!(inst && inst.__hotClearClipboardOutline)
    });
    return false;
  };
  hotNS.clearCopyHighlight = function(instance, reason){
    return hotNS.clearClipboardOutline(instance, reason || 'Shared.hot.clearCopyHighlight');
  };

  Shared.ensureHotWrapperStyles = ensureHotWrapperStyles;
  Shared.createEmptyData = createEmptyData;
  hotNS.ensureHotWrapperStyles = ensureHotWrapperStyles;
  hotNS.createEmptyData = createEmptyData;
  hotNS.createStandardTable = createStandardTable;
  hotNS.exportExclusions = exportExclusions;
  hotNS.applyExclusions = applyExclusions;
  hotNS.clearExclusions = clearExclusions;
  hotNS.exportFilters = exportFilters;
  hotNS.applyFilters = applyFilters;
  hotNS.clearFilters = clearFilters;
  hotNS.applyExclusionsToMatrix = applyExclusionsToMatrix;
  hotNS.isRowExcluded = isRowExcluded;
  hotNS.isColumnExcluded = isColumnExcluded;
  hotNS.isCellExcluded = isCellExcluded;
  hotNS.getAnalysisData = getAnalysisData;
  hotNS.getIncludedDataMatrix = getIncludedDataMatrix;
  hotNS.getIncludedColumn = getIncludedColumn;
  hotNS.getIncludedRow = getIncludedRow;
  hotNS.toExcelColumnLabel = toExcelColumnLabel;
  hotNS.buildExcelColHeaders = buildExcelColHeaders;
  hotNS.setFormulaReferenceOverlay = setFormulaReferenceOverlayForInstance;
  hotNS.clearFormulaReferenceOverlay = clearFormulaReferenceOverlayForInstance;
  hotNS.refreshFormulaReferenceOverlay = refreshFormulaReferenceOverlayForInstance;
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
