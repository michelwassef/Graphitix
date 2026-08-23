(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  // Style-specific undo helper for aggregate-risk controls.
  // Shared.undoManager remains the undo/redo engine; scalar-only controls may use it directly.
  const styleUndo = Shared.styleUndo = Shared.styleUndo || {};
  const AGGREGATE_SNAPSHOT_MARKER = '__graphitixStyleUndoAggregateSnapshot';

  function getUndoManager(){
    const manager = Shared.undoManager || null;
    if(manager && (typeof manager.recordStateChange === 'function' || typeof manager.record === 'function')){
      return manager;
    }
    return null;
  }

  function defaultSnapshotContext(context){
    const ctx = context && typeof context === 'object' ? context : {};
    return {
      scope: ctx.scope || null,
      scopeValue: ctx.scopeValue || null,
      scopeDataset: ctx.scopeDataset || null,
      target: ctx.target || null
    };
  }

  function isAggregateScopeContext(context){
    const scope = String(context?.scope || '').trim().toLowerCase();
    return scope === 'global' || scope === 'graph';
  }

  function captureAggregateState(options = {}){
    const context = options.context;
    const capture = options.capture;
    if(typeof capture !== 'function' || !isAggregateScopeContext(context)){
      return null;
    }
    return {
      [AGGREGATE_SNAPSHOT_MARKER]: true,
      field: String(options.field || '').trim() || null,
      state: capture(String(options.field || '').trim() || null, context)
    };
  }

  function isAggregateStateSnapshot(value){
    return !!(value && typeof value === 'object' && value[AGGREGATE_SNAPSHOT_MARKER] === true);
  }

  function captureScopedValues(options = {}){
    const context = options.context;
    const getter = options.getter;
    if(typeof getter !== 'function' || !isAggregateScopeContext(context)){
      return null;
    }
    const snapshotContext = typeof options.snapshotContext === 'function' ? options.snapshotContext : defaultSnapshotContext;
    const buildContextFromScopeOption = typeof options.buildContextFromScopeOption === 'function'
      ? options.buildContextFromScopeOption
      : null;
    const scopeOptions = Array.isArray(options.scopeOptions) ? options.scopeOptions : [];
    const onScopeContext = typeof options.onScopeContext === 'function' ? options.onScopeContext : null;
    const originalContext = snapshotContext(context);
    const snapshots = [];
    const addSnapshot = scopedContext => {
      if(!scopedContext || !scopedContext.scope){ return; }
      const resolvedContext = snapshotContext(scopedContext);
      if(onScopeContext){
        try{ onScopeContext(resolvedContext, originalContext); }catch(err){}
      }
      snapshots.push({
        context: snapshotContext(resolvedContext),
        value: getter(resolvedContext)
      });
    };
    try{
      addSnapshot(context);
      scopeOptions.forEach(option => {
        if(!option || option.disabled || !buildContextFromScopeOption){ return; }
        const scopedContext = buildContextFromScopeOption(option);
        if(!scopedContext?.scope || isAggregateScopeContext(scopedContext)){ return; }
        addSnapshot(scopedContext);
      });
      return snapshots.length > 1 ? snapshots : null;
    }finally{
      if(onScopeContext){
        try{ onScopeContext(originalContext, originalContext); }catch(err){}
      }
    }
  }

  function recordStateChange(options = {}){
    const manager = options.manager || getUndoManager();
    if(!manager || typeof manager.recordStateChange !== 'function'){
      return false;
    }
    const compare = typeof options.equals === 'function'
      ? options.equals
      : ((a, b) => (a === b) || (a === null && b === null));
    const aggregateFrom = isAggregateStateSnapshot(options.aggregateFrom) ? options.aggregateFrom : null;
    const aggregateTo = isAggregateStateSnapshot(options.aggregateTo) ? options.aggregateTo : null;
    const hasAggregateState = !!(aggregateFrom && aggregateTo && typeof options.applyAggregate === 'function');
    const scopedFrom = !hasAggregateState && Array.isArray(options.scopedFrom) ? options.scopedFrom : null;
    const fromValue = hasAggregateState ? aggregateFrom.state : (scopedFrom || options.from);
    const toValue = hasAggregateState ? aggregateTo.state : options.to;
    if(!hasAggregateState && !scopedFrom && compare(options.from, options.to)){
      return false;
    }
    const restoreContext = typeof options.restoreContext === 'function'
      ? options.restoreContext
      : (snapshot => defaultSnapshotContext(snapshot));
    const apply = typeof options.apply === 'function' ? options.apply : null;
    const beforeApply = typeof options.beforeApply === 'function' ? options.beforeApply : null;
    const afterApply = typeof options.afterApply === 'function' ? options.afterApply : null;
    const sync = typeof options.sync === 'function' ? options.sync : null;
    manager.recordStateChange({
      label: options.label || 'style',
      scope: options.scope || null,
      from: fromValue,
      to: toValue,
      equals: (hasAggregateState || scopedFrom) ? () => false : compare,
      apply(value, phase){
        if(beforeApply){ beforeApply(value, phase); }
        try{
          if(hasAggregateState){
            options.applyAggregate(value, restoreContext(options.context), phase);
          }else if(apply){
            if(phase === 'undo' && Array.isArray(value)){
              value.forEach(item => {
                apply(item?.value, restoreContext(item?.context), phase, item);
              });
            }else{
              apply(value, restoreContext(options.context), phase, null);
            }
          }
        }finally{
          if(afterApply){ afterApply(value, phase); }
        }
        if(sync){ sync(value, phase); }
        return true;
      }
    });
    return true;
  }

  function recordCommand(options = {}){
    const manager = options.manager || getUndoManager();
    if(!manager || typeof manager.record !== 'function'){
      return false;
    }
    if(typeof options.undo !== 'function' || typeof options.redo !== 'function'){
      return false;
    }
    manager.record({
      label: options.label || 'style',
      scope: options.scope || null,
      undo: options.undo,
      redo: options.redo
    });
    return true;
  }

  styleUndo.getUndoManager = getUndoManager;
  styleUndo.isAggregateScopeContext = isAggregateScopeContext;
  styleUndo.captureAggregateState = captureAggregateState;
  styleUndo.isAggregateStateSnapshot = isAggregateStateSnapshot;
  styleUndo.captureScopedValues = captureScopedValues;
  styleUndo.recordStateChange = recordStateChange;
  styleUndo.recordCommand = recordCommand;
})(typeof window !== 'undefined' ? window : globalThis);
