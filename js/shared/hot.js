// Shared helpers for Handsontable setup and wrapper sizing
// Exposes Shared.ensureHotWrapperStyles(wrapper) and Shared.createEmptyData(rows, cols)
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const hotNS = Shared.hot = Shared.hot || {};

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
    if(global.Handsontable && global.Handsontable.helper && global.Handsontable.helper.createEmptySpreadsheetData){
      return global.Handsontable.helper.createEmptySpreadsheetData(rows, cols);
    }
    // Fallback if Handsontable is not present yet (tests)
    return Array.from({length: rows}, () => Array.from({length: cols}, () => ''));
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
    const colCount = Math.max(0, Number(dimensions?.cols ?? 0));
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
      ...otherHotOptions
    } = hotOptions;

    const baseData = overrides?.data || createEmptyData(rowCount, colCount);

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
      afterColumnMove: wrapHook('afterColumnMove', userAfterColumnMove, afterColumnMoveBase)
    });

    console.debug('Debug: createStandardTable options prepared', { debugLabel, rowCount, colCount });
    const instance = new Handsontable(container, options);
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

