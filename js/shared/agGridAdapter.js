// Shared helpers for AG Grid integration. Keeps data stored as plain arrays to minimize memory use.
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const agNS = Shared.agGrid = Shared.agGrid || {};

  const logDebug = (label, payload)=>{
    try{
      if(typeof Shared.isDebugEnabled === 'function' && !Shared.isDebugEnabled()){
        return;
      }
    }catch(err){
      // ignore debug toggle failures
    }
    if(typeof console?.debug === 'function'){
      console.debug(label, payload || {});
    }
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

  agNS.isAvailable = function isAvailable(){
    return !!(global.agGrid && (typeof global.agGrid.createGrid === 'function' || typeof global.agGrid.Grid === 'function'));
  };

  agNS.getVersion = function getVersion(){
    if(!agNS.isAvailable()){
      return null;
    }
    return global.agGrid?.VERSION || global.agGrid?.version || null;
  };

  agNS.ensureTheme = function ensureTheme(container, theme){
    const themeClass = theme || 'ag-theme-balham';
    if(container && container.classList && !container.classList.contains(themeClass)){
      container.classList.add(themeClass);
      logDebug('Debug: agGrid theme applied', { id: container.id || null, theme: themeClass });
    }
    return themeClass;
  };

  agNS.buildRowData = function buildRowData(dataMatrix){
    const rowCount = Array.isArray(dataMatrix) ? dataMatrix.length : 0;
    return Array.from({ length: rowCount }, (_, idx) => ({ __rowIndex: idx }));
  };

  agNS.createColumnDefs = function createColumnDefs(colCount, options){
    const opts = options || {};
    const dataHandle = opts.dataHandle;
    const dataRef = opts.dataRef;
    const colHeaders = Array.isArray(opts.colHeaders) ? opts.colHeaders : null;
    const columns = [];
    for(let c = 0; c < colCount; c++){
      const fieldId = `c${c}`;
      const rawHeader = colHeaders ? colHeaders[c] : null;
      const headerName = rawHeader == null || rawHeader === ''
        ? toExcelColumnLabel(c)
        : rawHeader;
      columns.push({
        headerName,
        colId: fieldId,
        field: fieldId,
        valueGetter(params){
          const rowIndex = params?.data?.__rowIndex ?? params?.node?.rowIndex ?? 0;
          const matrix = dataHandle?.current || dataRef;
          if(!Array.isArray(matrix?.[rowIndex])){
            return '';
          }
          const value = matrix[rowIndex][c];
          return typeof value === 'undefined' ? '' : value;
        },
        valueSetter(params){
          const rowIndex = params?.data?.__rowIndex ?? params?.node?.rowIndex ?? 0;
          const matrix = dataHandle?.current || dataRef;
          if(!Array.isArray(matrix)){
            return false;
          }
          const row = typeof dataHandle?.ensureMutableRow === 'function'
            ? dataHandle.ensureMutableRow(rowIndex, c + 1)
            : null;
          if(row){
            row[c] = params.newValue;
            if(typeof dataHandle?.markDataChanged === 'function'){
              dataHandle.markDataChanged('agGrid:valueSetter');
            }
          }else{
            if(!Array.isArray(matrix[rowIndex])){
              matrix[rowIndex] = [];
            }
            matrix[rowIndex][c] = params.newValue;
          }
          return true;
        }
      });
    }
    logDebug('Debug: agGrid column defs created', { colCount, hasHeaders: !!colHeaders });
    return columns;
  };
})(typeof window !== 'undefined' ? window : globalThis);
