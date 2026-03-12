(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const palette = Shared.palette = Shared.palette || {};
  const FALLBACK_SCATTER_COLORS = [
    '#0000ff', '#ff0000', '#00aa00', '#ff8c00', '#800080',
    '#00a6d6', '#8b4513', '#ff1493', '#666666'
  ];

  function resolveDefaultScatterColors(){
    const paletteColors = Array.isArray(palette.DEFAULT_SCATTER_COLORS) && palette.DEFAULT_SCATTER_COLORS.length
      ? palette.DEFAULT_SCATTER_COLORS
      : null;
    const globalColors = Array.isArray(global.DEFAULT_SCATTER_COLORS) && global.DEFAULT_SCATTER_COLORS.length
      ? global.DEFAULT_SCATTER_COLORS
      : null;
    const resolved = paletteColors || globalColors || FALLBACK_SCATTER_COLORS;
    palette.DEFAULT_SCATTER_COLORS = resolved;
    if(global.DEFAULT_SCATTER_COLORS !== resolved){
      global.DEFAULT_SCATTER_COLORS = resolved;
    }
    return resolved;
  }

  palette.ensureDefaultScatterColors = function ensureDefaultScatterColors(){
    return resolveDefaultScatterColors();
  };

  palette.setDefaultScatterColors = function setDefaultScatterColors(colors){
    if(!Array.isArray(colors) || !colors.length){
      return resolveDefaultScatterColors();
    }
    const target = Array.isArray(palette.DEFAULT_SCATTER_COLORS)
      ? palette.DEFAULT_SCATTER_COLORS
      : [];
    target.length = 0;
    colors.forEach(color => {
      if(typeof color === 'string' && color.trim()){
        target.push(color.trim());
      }
    });
    if(!target.length){
      FALLBACK_SCATTER_COLORS.forEach(color => target.push(color));
    }
    palette.DEFAULT_SCATTER_COLORS = target;
    global.DEFAULT_SCATTER_COLORS = target;
    return target;
  };

  resolveDefaultScatterColors();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
