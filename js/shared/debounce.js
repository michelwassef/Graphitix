// Shared debounce tied to animation frame
// Attaches to window.Shared.debounceFrame for reuse across components
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const debugState = Shared.__debugState || { enabled: false };
  Shared.__debugState = debugState;

  Shared.setDebugLogging = function setDebugLogging(enabled){
    debugState.enabled = !!enabled;
    return debugState.enabled;
  };

  Shared.enableDebugLogging = function enableDebugLogging(){
    return Shared.setDebugLogging(true);
  };

  Shared.disableDebugLogging = function disableDebugLogging(){
    return Shared.setDebugLogging(false);
  };

  Shared.isDebugEnabled = function isDebugEnabled(){
    return !!debugState.enabled;
  };

  function logDebug(message, payload){
    if(Shared.isDebugEnabled()){
      if(typeof payload === 'undefined'){
        console.debug(message);
      }else{
        console.debug(message, payload);
      }
    }
  }
  Shared.debounceFrame = function debounceFrame(fn){
    if(typeof fn !== 'function'){
      console.warn('Shared.debounceFrame requires a function callback', { received: typeof fn });
      return function noopDebounce(){
        logDebug('Debug: Shared.debounceFrame noop invoked'); // Debug: noop fallback invocation
      };
    }

    const label = fn.name || 'anonymous';
    const usingAnimationFrame = typeof global.requestAnimationFrame === 'function';
    const request = usingAnimationFrame
      ? global.requestAnimationFrame.bind(global)
      : function scheduleWithTimeout(callback){
          const timeoutFn = global.setTimeout || setTimeout;
          return timeoutFn(callback, 16);
        };

    let missingCancelWarned = false;
    const cancel = usingAnimationFrame
      ? (typeof global.cancelAnimationFrame === 'function'
        ? global.cancelAnimationFrame.bind(global)
        : function missingCancel(){
            if(!missingCancelWarned){
              missingCancelWarned = true;
              console.warn('Shared.debounceFrame missing cancelAnimationFrame; unable to cancel frames safely', { label });
            }
          })
      : function cancelTimeout(id){
          const clearFn = global.clearTimeout || clearTimeout;
          clearFn(id);
        };

    if(!usingAnimationFrame){
      logDebug('Debug: Shared.debounceFrame configured with timeout fallback', { label }); // Debug: fallback selection
    }

    let frameId = null;
    return function debouncedCallback(...args){
      if(frameId !== null){
        cancel(frameId);
        frameId = null;
        logDebug('Debug: Shared.debounceFrame cancelled pending frame', { label, argsLength: args.length }); // Debug: cancellation notice
      }
      const scheduledAt = Date.now();
      logDebug('Debug: Shared.debounceFrame scheduling callback', { label, argsLength: args.length, usingAnimationFrame, scheduledAt }); // Debug: scheduling entry
      const context = this;
      frameId = request(function executeDebounced(){
        frameId = null;
        logDebug('Debug: Shared.debounceFrame executing callback', { label, scheduledAt, startedAt: Date.now() }); // Debug: execution entry
        try{
          const meta = args && args[0] && typeof args[0] === 'object'
            ? (args[0].__workspaceSessionMeta || null)
            : null;
          if(meta && Shared.workspaceTabs?.isSessionMetaCurrent && !Shared.workspaceTabs.isSessionMetaCurrent(meta.componentKey || null, meta)){
            logDebug('Debug: Shared.debounceFrame skipped stale workspace callback', {
              label,
              tabId: meta.tabId || null,
              sessionGeneration: meta.sessionGeneration || 0,
              componentKey: meta.componentKey || null
            });
            return;
          }
          fn.apply(context, args);
        }catch(err){
          console.error('Shared.debounceFrame error', err);
        }
      });
    };
  };

  if(typeof require === 'function'){
    try {
      require('./workspaceToolbar.js');
      console.debug('Debug: debounce workspaceToolbar required');
    } catch(err){
      console.debug('Debug: debounce workspaceToolbar require failed', { err });
    }
  }
})(window);
