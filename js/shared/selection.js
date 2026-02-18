(function(global){
  "use strict";

  const Shared = global.Shared = global.Shared || {};

  const logDebug = (message, payload) => {
    if(typeof Shared.isDebugEnabled === 'function' && Shared.isDebugEnabled()){
      console.debug(`[SelectionGuard] ${message}`, payload || {});
    }
  };

  const state = Shared.__textSelectionGuard = Shared.__textSelectionGuard || {
    installed: false,
    enabled: true,
    allowSelector: 'input,textarea,select,option,[contenteditable="true"],[contenteditable=""],.allow-text-selection,.inline-edit-overlay,[data-font-controls-overlay="1"],[data-notes-editor="1"]'
  };

  function normalizeTargetElement(target){
    if(!target){
      return null;
    }
    if(target.nodeType === 1){
      return target;
    }
    if(target.nodeType === 3 && target.parentElement){
      return target.parentElement;
    }
    if(target.parentElement){
      return target.parentElement;
    }
    if(target.parentNode && target.parentNode.nodeType === 1){
      return target.parentNode;
    }
    return null;
  }

  function isAllowedTarget(target){
    const resolvedTarget = normalizeTargetElement(target);
    if(!resolvedTarget || typeof resolvedTarget.closest !== 'function'){ return false; }
    try {
      return !!resolvedTarget.closest(state.allowSelector);
    } catch (err) {
      logDebug('invalid allowSelector; falling back to inputs only', { allowSelector: state.allowSelector, err });
      state.allowSelector = 'input,textarea,select,option,[contenteditable="true"],[contenteditable=""]';
      return !!resolvedTarget.closest(state.allowSelector);
    }
  }

  function onSelectStart(evt){
    if(!state.enabled){ return; }
    const target = evt?.target;
    if(isAllowedTarget(target)){ return; }
    evt.preventDefault();
    logDebug('prevented selectstart', {
      tag: target?.tagName || null,
      id: target?.id || null,
      className: target?.className || null
    });
  }

  Shared.disableBrowserTextSelection = function disableBrowserTextSelection(options = {}){
    if(options && typeof options.allowSelector === 'string'){
      state.allowSelector = options.allowSelector;
    }
    state.enabled = true;
    if(state.installed){ return; }
    if(!global.document || typeof global.document.addEventListener !== 'function'){
      logDebug('skipped install (no document)', {});
      return;
    }
    global.document.addEventListener('selectstart', onSelectStart, true);
    state.installed = true;
    logDebug('installed', { allowSelector: state.allowSelector });
  };

  Shared.enableBrowserTextSelection = function enableBrowserTextSelection(){
    state.enabled = false;
    logDebug('disabled guard', {});
  };

  Shared.disableBrowserTextSelection();
})(typeof window !== 'undefined' ? window : globalThis);
