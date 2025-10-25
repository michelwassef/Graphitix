(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};

  const TEXT_CLASS = 'graph-edit-highlight--text';
  const AXIS_CLASS = 'graph-edit-highlight--axis';
  const AXIS_OVERLAY_CLASS = 'graph-edit-highlight--axis-overlay';
  const TEXT_FILTER = 'drop-shadow(0 0 4px rgba(255, 152, 0, 0.55))';
  const AXIS_FILTER = 'drop-shadow(0 0 4px rgba(255, 152, 0, 0.5))';

  const state = {
    textTargets: [],
    axis: null,
    axisFilter: '',
    overlay: null
  };

  function logDebug(message, payload){
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug(`Debug: editHighlight ${message}`, payload || {});
    }
  }

  function mergeFilter(previous, highlight){
    const base = (previous || '').trim();
    if(!highlight){ return base; }
    if(!base){ return highlight; }
    if(base.includes(highlight)){ return base; }
    return `${base} ${highlight}`.trim();
  }

  function applyFilter(target, value){
    if(!target || !target.style){ return; }
    if(value){
      target.style.filter = value;
    } else {
      target.style.filter = '';
    }
  }

  function clearText(reason){
    if(!state.textTargets.length){ return; }
    const cleared = [];
    for(let i = 0; i < state.textTargets.length; i += 1){
      const entry = state.textTargets[i];
      const target = entry && entry.node;
      if(!target){ continue; }
      if(target.classList){
        target.classList.remove(TEXT_CLASS);
      }
      applyFilter(target, entry.filter);
      cleared.push(target.id || target.textContent || `index-${i}`);
    }
    logDebug('text highlight cleared', { reason, count: cleared.length, targets: cleared });
    state.textTargets = [];
  }

  function clearAxis(reason){
    if(!state.axis && !state.overlay){ return; }
    if(state.axis && state.axis.classList){
      state.axis.classList.remove(AXIS_CLASS);
    }
    if(state.axis){
      applyFilter(state.axis, state.axisFilter);
    }
    if(state.overlay && state.overlay.classList){
      state.overlay.classList.remove(AXIS_OVERLAY_CLASS);
    }
    logDebug('axis highlight cleared', { reason, id: state.axis ? state.axis.id || null : null });
    state.axis = null;
    state.axisFilter = '';
    state.overlay = null;
  }

  function escapeAttribute(value){
    if(typeof value !== 'string'){ return ''; }
    if(typeof global.CSS !== 'undefined' && typeof global.CSS.escape === 'function'){
      return global.CSS.escape(value);
    }
    return value.replace(/"/g, '\\"').replace(/\\/g, '\\\\');
  }

  function collectTextGroup(target){
    if(!target){ return []; }
    const dataset = target.dataset || {};
    const key = dataset.fontKey || null;
    const scope = dataset.fontScope || null;
    const doc = target.ownerDocument || global.document;
    if(!key || !doc){ return [target]; }
    let selector = `text[data-font-key="${escapeAttribute(key)}"]`;
    if(scope){
      selector += `[data-font-scope="${escapeAttribute(scope)}"]`;
    }
    let candidates = [];
    try {
      candidates = Array.from(doc.querySelectorAll(selector));
    } catch(queryErr){
      logDebug('collectTextGroup query failed', { error: queryErr && queryErr.message, selector });
    }
    if(!candidates.includes(target)){
      candidates.push(target);
    }
    const unique = [];
    const seen = new Set();
    for(let i = 0; i < candidates.length; i += 1){
      const node = candidates[i];
      if(!node || seen.has(node)){ continue; }
      seen.add(node);
      unique.push(node);
    }
    return unique.length ? unique : [target];
  }

  function isSameTextGroup(group){
    if(state.textTargets.length !== group.length){ return false; }
    for(let i = 0; i < group.length; i += 1){
      if(state.textTargets[i]?.node !== group[i]){ return false; }
    }
    return true;
  }

  function highlightText(target){
    if(!target){ return; }
    const group = collectTextGroup(target);
    if(!group.length){ return; }
    if(isSameTextGroup(group)){
      logDebug('text highlight retained', { reason: 'same-group', count: group.length });
      return;
    }
    clearAxis('text-selected');
    clearText('replace');
    state.textTargets = group.map(node => ({
      node,
      filter: node?.style?.filter || ''
    }));
    for(let i = 0; i < state.textTargets.length; i += 1){
      const entry = state.textTargets[i];
      const node = entry.node;
      if(!node){ continue; }
      if(node.classList){
        node.classList.add(TEXT_CLASS);
      }
      applyFilter(node, mergeFilter(entry.filter, TEXT_FILTER));
    }
    logDebug('text highlight applied', {
      count: state.textTargets.length,
      key: target.dataset?.fontKey || null,
      scope: target.dataset?.fontScope || null
    });
  }

  function highlightAxis(target, options){
    if(!target){ return; }
    if(state.axis === target && state.overlay === (options && options.overlay)){
      logDebug('axis highlight retained', { reason: 'same-target', id: target.id || null });
      return;
    }
    clearText('axis-selected');
    clearAxis('replace');
    state.axis = target;
    state.overlay = options && options.overlay ? options.overlay : null;
    state.axisFilter = target?.style?.filter || '';
    if(target.classList){
      target.classList.add(AXIS_CLASS);
    }
    applyFilter(target, mergeFilter(state.axisFilter, AXIS_FILTER));
    if(state.overlay && state.overlay.classList){
      state.overlay.classList.add(AXIS_OVERLAY_CLASS);
    }
    logDebug('axis highlight applied', { id: target.id || null });
  }

  function clearAll(reason){
    clearText(reason || 'clear-all');
    clearAxis(reason || 'clear-all');
  }

  Shared.editHighlight = {
    highlightText,
    highlightAxis,
    clearText,
    clearAxis,
    clearAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
