(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const persistence = Shared.dataViewPersistence = Shared.dataViewPersistence || {};

  function isObject(value){
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  const REPLAYABLE_TRANSFORM_TYPES = new Set([
    'identity',
    'scale',
    'multiply',
    'divide',
    'add',
    'subtract',
    'log',
    'log2',
    'log10',
    'custom',
    'formula',
    'cpm',
    'centerrows',
    'centercolumns',
    'normalizerows',
    'normalizecolumns',
    'rnaseqnormalizedlog',
    'rna-seq-normalized-log'
  ]);

  function isTransformSpecReplayable(transformSpec){
    if(!isObject(transformSpec) || transformSpec.runtimeOnly === true){
      return false;
    }
    const type = String(transformSpec.type || '').trim().toLowerCase();
    if(type === 'pipeline'){
      const specs = Array.isArray(transformSpec.specs) ? transformSpec.specs : [];
      return specs.every(isTransformSpecReplayable);
    }
    return REPLAYABLE_TRANSFORM_TYPES.has(type);
  }

  function isViewReplayable(view){
    if(!isObject(view)){
      return false;
    }
    const kind = String(view.kind || '').trim().toLowerCase();
    const id = String(view.id || '').trim().toLowerCase();
    if(kind === 'raw' || id === 'raw' || view.replayable !== true || !isObject(view.transformOptions)){
      return false;
    }
    // A persisted replayability stamp is advisory only. The current archive
    // loader must still understand the transform spec and have the exact
    // execution options that produced the matrix; otherwise stripping it
    // would make reopen lossy.
    return isTransformSpecReplayable(view.transformSpec);
  }

  function resolveRawViewIndex(views){
    for(let index = 0; index < views.length; index += 1){
      const view = views[index];
      if(!isObject(view)){
        continue;
      }
      const kind = String(view.kind || '').trim().toLowerCase();
      const id = String(view.id || '').trim().toLowerCase();
      if(kind === 'raw' || id === 'raw'){
        return index;
      }
    }
    return views.findIndex(isObject);
  }

  function createReplayContext(serializedDataViews){
    const views = Array.isArray(serializedDataViews?.views) ? serializedDataViews.views : [];
    const byId = new Map();
    for(let index = 0; index < views.length; index += 1){
      const view = views[index];
      if(!isObject(view)){
        continue;
      }
      const id = String(view.id || '').trim();
      if(id){
        byId.set(id, index);
      }
    }
    return {
      views,
      byId,
      rawIndex: resolveRawViewIndex(views),
      memo: new Map()
    };
  }

  function canReplayViewFromArchive(context, index, visiting){
    const view = context.views[index];
    if(!isObject(view)){
      return false;
    }
    if(index === context.rawIndex){
      return true;
    }
    if(context.memo.has(index)){
      return context.memo.get(index);
    }
    if(visiting.has(index)){
      context.memo.set(index, false);
      return false;
    }
    if(!isViewReplayable(view)){
      const retained = Array.isArray(view.data);
      context.memo.set(index, retained);
      return retained;
    }

    visiting.add(index);
    const sourceViewId = String(view.sourceViewId || 'raw').trim() || 'raw';
    let sourceIndex = context.byId.get(sourceViewId);
    if(sourceIndex == null && sourceViewId.toLowerCase() === 'raw'){
      sourceIndex = context.rawIndex >= 0 ? context.rawIndex : null;
    }
    const replayable = sourceIndex != null
      && canReplayViewFromArchive(context, sourceIndex, visiting);
    visiting.delete(index);
    context.memo.set(index, replayable);
    return replayable;
  }

  function shouldRetainDataInLiteArchive(view, index, serializedDataViews, replayContext){
    if(!isObject(view)){
      return false;
    }
    const context = replayContext || createReplayContext(serializedDataViews);
    if(Number(index) === context.rawIndex || (!context.views.length && Number(index) === 0)){
      return false;
    }
    if(!isViewReplayable(view)){
      return true;
    }
    if(!context.views.length){
      return false;
    }
    return !canReplayViewFromArchive(context, Number(index), new Set());
  }

  function sanitizeDataViewsForArchive(dataViewsValue, options){
    if(!isObject(dataViewsValue) || !Array.isArray(dataViewsValue.views)){
      return dataViewsValue;
    }
    const retainNonReplayable = options?.retainNonReplayable === true;
    const sourceViews = dataViewsValue.views;
    const nextViews = new Array(sourceViews.length);
    const replayContext = retainNonReplayable ? createReplayContext(dataViewsValue) : null;
    let changed = false;
    for(let index = 0; index < sourceViews.length; index += 1){
      const view = sourceViews[index];
      if(!isObject(view) || !Object.prototype.hasOwnProperty.call(view, 'data')){
        nextViews[index] = view;
        continue;
      }
      if(retainNonReplayable && shouldRetainDataInLiteArchive(view, index, dataViewsValue, replayContext)){
        nextViews[index] = view;
        continue;
      }
      const nextView = { ...view };
      delete nextView.data;
      nextViews[index] = nextView;
      changed = true;
    }
    if(!changed){
      return dataViewsValue;
    }
    return {
      ...dataViewsValue,
      views: nextViews
    };
  }

  function prepareDataViewsForLiteArchive(dataViewsValue){
    return sanitizeDataViewsForArchive(dataViewsValue, { retainNonReplayable: true });
  }

  function stripAllDataViewMatrices(dataViewsValue){
    return sanitizeDataViewsForArchive(dataViewsValue, { retainNonReplayable: false });
  }

  function findRawView(serializedDataViews){
    const views = Array.isArray(serializedDataViews?.views) ? serializedDataViews.views : [];
    for(let index = 0; index < views.length; index += 1){
      const view = views[index];
      if(!isObject(view)){
        continue;
      }
      const kind = String(view.kind || '').trim().toLowerCase();
      const id = String(view.id || '').trim().toLowerCase();
      if(kind === 'raw' || id === 'raw'){
        return view;
      }
    }
    // DataViews v1 payloads did not always stamp kind/id consistently. The
    // restore contract already treats the first serialized view as Raw when
    // no explicit Raw record exists, so persistence must use the same rule.
    return views.find(isObject) || null;
  }

  function resolveRawDataForPersistence(serializedDataViews, fallbackData){
    const rawView = findRawView(serializedDataViews);
    return Array.isArray(rawView?.data) ? rawView.data : fallbackData;
  }

  persistence.findRawView = findRawView;
  persistence.isTransformSpecReplayable = isTransformSpecReplayable;
  persistence.isViewReplayable = isViewReplayable;
  persistence.shouldRetainDataInLiteArchive = shouldRetainDataInLiteArchive;
  persistence.prepareDataViewsForLiteArchive = prepareDataViewsForLiteArchive;
  persistence.stripAllDataViewMatrices = stripAllDataViewMatrices;
  persistence.resolveRawDataForPersistence = resolveRawDataForPersistence;

  if(typeof module !== 'undefined' && module.exports){
    module.exports = persistence;
  }
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : globalThis));
