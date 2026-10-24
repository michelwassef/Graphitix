(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};

  function finite(value, fallback = 0){
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function getViewportCorrection(rect, options = {}){
    if(!rect){
      return { x: 0, y: 0 };
    }
    const margin = Math.max(0, finite(options.margin, 6));
    const viewportWidth = finite(options.viewportWidth);
    const viewportHeight = finite(options.viewportHeight);
    const x = rect.left < margin
      ? margin - rect.left
      : rect.right > viewportWidth - margin
        ? viewportWidth - margin - rect.right
        : 0;
    const y = rect.top < margin
      ? margin - rect.top
      : rect.bottom > viewportHeight - margin
        ? viewportHeight - margin - rect.bottom
        : 0;
    return { x, y };
  }

  function placeAtPagePoint(menu, pageX, pageY, options = {}){
    if(!menu?.style || typeof menu.getBoundingClientRect !== 'function'){
      return false;
    }
    const doc = menu.ownerDocument;
    const docEl = doc?.documentElement;
    const win = doc?.defaultView || global;
    const x = finite(pageX);
    const y = finite(pageY);
    const viewportWidth = finite(win.innerWidth || docEl?.clientWidth);
    const viewportHeight = finite(win.innerHeight || docEl?.clientHeight);
    const wasHidden = menu.hidden;

    menu.hidden = false;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    try{
      const rect = menu.getBoundingClientRect();
      if(rect && viewportWidth > 0 && viewportHeight > 0){
        const correction = getViewportCorrection(rect, {
          viewportWidth,
          viewportHeight,
          margin: options.margin
        });
        menu.style.left = `${x + correction.x}px`;
        menu.style.top = `${y + correction.y}px`;
      }
    }finally{
      menu.hidden = wasHidden;
    }
    return true;
  }

  Shared.menuPosition = Object.freeze({ getViewportCorrection, placeAtPagePoint });
})(typeof window !== 'undefined' ? window : globalThis);
