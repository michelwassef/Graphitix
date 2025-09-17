// Shared debounce tied to animation frame
// Attaches to window.Shared.debounceFrame for reuse across components
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  Shared.debounceFrame = function debounceFrame(fn){
    if(typeof fn !== 'function'){
      console.warn('Shared.debounceFrame requires a function callback', { received: typeof fn });
      return function noopDebounce(){
        console.debug('Debug: Shared.debounceFrame noop invoked'); // Debug: noop fallback invocation
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
      console.debug('Debug: Shared.debounceFrame configured with timeout fallback', { label }); // Debug: fallback selection
    }

    let frameId = null;
    return function debouncedCallback(...args){
      if(frameId !== null){
        cancel(frameId);
        frameId = null;
        console.debug('Debug: Shared.debounceFrame cancelled pending frame', { label, argsLength: args.length }); // Debug: cancellation notice
      }
      const scheduledAt = Date.now();
      console.debug('Debug: Shared.debounceFrame scheduling callback', { label, argsLength: args.length, usingAnimationFrame, scheduledAt }); // Debug: scheduling entry
      const context = this;
      frameId = request(function executeDebounced(){
        frameId = null;
        console.debug('Debug: Shared.debounceFrame executing callback', { label, scheduledAt, startedAt: Date.now() }); // Debug: execution entry
        try{
          fn.apply(context, args);
        }catch(err){
          console.error('Shared.debounceFrame error', err);
        }
      });
    };
  };
})(window);

