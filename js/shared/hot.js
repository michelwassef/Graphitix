// Shared helpers for Handsontable setup and wrapper sizing
// Exposes Shared.ensureHotWrapperStyles(wrapper) and Shared.createEmptyData(rows, cols)
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};

  Shared.ensureHotWrapperStyles = function ensureHotWrapperStyles(wrapper){
    if(!wrapper) return;
    wrapper.style.overflow='auto';
    wrapper.style.height='100%';
    wrapper.style.flex='1 1 auto';
    wrapper.style.minHeight='0';
    console.debug('Debug: hotWrapper style updated', wrapper.id || '', wrapper.style.cssText); // Debug: wrapper style
  };

  Shared.createEmptyData = function createEmptyData(rows, cols){
    if(global.Handsontable && global.Handsontable.helper && global.Handsontable.helper.createEmptySpreadsheetData){
      return global.Handsontable.helper.createEmptySpreadsheetData(rows, cols);
    }
    // Fallback if Handsontable is not present yet (tests)
    return Array.from({length: rows}, () => Array.from({length: cols}, () => ''));
  };
})(window);

