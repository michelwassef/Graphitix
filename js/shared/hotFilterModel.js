(function initHotFilterModel(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.hotFilterModel = Shared.hotFilterModel || {};
  const FILTER_VERSION = 1;
  const FILTER_KIND_SET = 'set';
  const FILTER_KIND_CONDITION = 'condition';
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

  Object.assign(namespace, {
    FILTER_VERSION,
    FILTER_KIND_SET,
    FILTER_KIND_CONDITION,
    EMPTY_FILTER_STATE,
    normalizeFilterColId,
    normalizeFilterOperator,
    normalizeFilterSelectionValues,
    cloneFilterModel,
    cloneFilterState,
    areFilterStatesEqual
  });

  if(typeof module !== 'undefined' && module.exports){
    module.exports = namespace;
  }
})(typeof window !== 'undefined' ? window : globalThis);
