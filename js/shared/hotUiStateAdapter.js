(function initHotUiStateAdapter(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.hotUiStateAdapter = Shared.hotUiStateAdapter || {};

  function createHotUiStateAdapter({ reportError, debug } = {}){
    const logError = typeof reportError === 'function' ? reportError : (()=>{});
    const trace = typeof debug === 'function' ? debug : (()=>{});

    function capture(instance){
      if(!instance){ return null; }
      const captured = {};
      const gridApi = instance.gridApi || null;
      if(gridApi && typeof gridApi.getFirstDisplayedRowIndex === 'function'){
        try{
          const firstRow = gridApi.getFirstDisplayedRowIndex();
          if(Number.isInteger(firstRow) && firstRow >= 0){
            captured.firstDisplayedRow = firstRow;
          }
        }catch(err){
          logError('Shared.hot.captureHotUiState getFirstDisplayedRowIndex error', err);
        }
      }
      if(gridApi && typeof gridApi.getVerticalPixelRange === 'function'){
        try{
          const range = gridApi.getVerticalPixelRange();
          if(range && Number.isFinite(range.top)){
            captured.scrollTopPx = Math.max(0, Math.round(range.top));
          }
        }catch(err){
          // Pixel range is opportunistic; firstDisplayedRow above is the source of truth.
        }
      }
      if(typeof instance.getSelectedRangeLast === 'function'){
        try{
          const selection = instance.getSelectedRangeLast();
          if(selection && selection.from && selection.to){
            captured.selection = {
              from: { row: Number(selection.from.row), col: Number(selection.from.col) },
              to: { row: Number(selection.to.row), col: Number(selection.to.col) }
            };
          }
        }catch(err){
          logError('Shared.hot.captureHotUiState getSelectedRangeLast error', err);
        }
      }
      if(typeof instance.getColumnWidths === 'function'){
        try{
          const columnWidths = instance.getColumnWidths();
          if(columnWidths && typeof columnWidths === 'object' && Object.keys(columnWidths).length){
            captured.columnWidths = columnWidths;
          }
        }catch(err){
          logError('Shared.hot.captureHotUiState getColumnWidths error', err);
        }
      }
      return captured;
    }

    function apply(instance, state, { ownerTabId = null, reason = 'apply-hot-uiState' } = {}){
      if(!instance || !state || typeof state !== 'object'){ return false; }
      if(state.tabId && ownerTabId && String(state.tabId) !== String(ownerTabId)){
        trace('Debug: Shared.hot.applyHotUiState skipped due to tab ownership mismatch', {
          stateTabId: state.tabId,
          ownerTabId,
          reason
        });
        return false;
      }
      let appliedAny = false;
      const gridApi = instance.gridApi || null;
      if(state.columnWidths && typeof instance.applyColumnWidths === 'function'){
        try{
          if(instance.applyColumnWidths(state.columnWidths)){
            appliedAny = true;
          }
        }catch(err){
          logError('Shared.hot.applyHotUiState column widths error', err, { reason });
        }
      }
      if(Number.isInteger(state.firstDisplayedRow) && state.firstDisplayedRow >= 0
        && gridApi && typeof gridApi.ensureIndexVisible === 'function'){
        try{
          gridApi.ensureIndexVisible(state.firstDisplayedRow, 'top');
          appliedAny = true;
        }catch(err){
          logError('Shared.hot.applyHotUiState ensureIndexVisible error', err, { reason });
        }
      }
      if(Number.isFinite(Number(state.scrollTopPx)) && Number(state.scrollTopPx) >= 0
        && gridApi && typeof gridApi.setVerticalScrollPosition === 'function'){
        try{
          gridApi.setVerticalScrollPosition(Math.max(0, Math.round(Number(state.scrollTopPx))));
          appliedAny = true;
        }catch(err){
          logError('Shared.hot.applyHotUiState setVerticalScrollPosition error', err, { reason });
        }
      }
      if(state.selection && state.selection.from && state.selection.to
        && typeof instance.selectCell === 'function'){
        const from = state.selection.from;
        const to = state.selection.to;
        if(Number.isInteger(from.row) && Number.isInteger(from.col)
          && Number.isInteger(to.row) && Number.isInteger(to.col)){
          try{
            instance.selectCell(from.row, from.col, to.row, to.col);
            appliedAny = true;
          }catch(err){
            logError('Shared.hot.applyHotUiState selectCell error', err, { reason });
          }
        }
      }
      return appliedAny;
    }

    function makeTableUiStateHooks(getHot, label, operations = {}){
      const componentLabel = String(label || 'component');
      return {
        capture(){
          const hot = typeof getHot === 'function' ? getHot() : getHot;
          if(!hot || typeof operations.capture !== 'function'){ return null; }
          const tableState = operations.capture(hot);
          if(!tableState){ return null; }
          return { table: tableState };
        },
        apply(uiState, meta = {}){
          if(!uiState || typeof uiState !== 'object' || !uiState.table
            || typeof operations.apply !== 'function'){
            return false;
          }
          const hot = typeof getHot === 'function' ? getHot() : getHot;
          if(!hot){ return false; }
          return operations.apply(hot, uiState.table, {
            reason: meta.reason || (componentLabel + '-apply-uiState'),
            tabId: meta.tabId || uiState.table.tabId || null
          });
        }
      };
    }

    return Object.freeze({ capture, apply, makeTableUiStateHooks });
  }

  namespace.createHotUiStateAdapter = createHotUiStateAdapter;
})(typeof window !== 'undefined' ? window : globalThis);
