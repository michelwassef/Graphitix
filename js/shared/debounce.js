// Shared debounce tied to animation frame
// Attaches to window.Shared.debounceFrame for reuse across components
(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  Shared.debounceFrame = function debounceFrame(fn){
    let frame;
    return (...args)=>{
      if(frame) cancelAnimationFrame(frame);
      console.debug('Debug: debounceFrame scheduled', fn && fn.name, args.length); // Debug: debounce scheduling
      frame = requestAnimationFrame(()=>{
        console.debug('Debug: debounceFrame executing', fn && fn.name); // Debug: debounce execution
        frame = null;
        try { fn && fn(...args); } catch(err){ console.error('debounceFrame error', err); }
      });
    };
  };
})(window);

