(function(global){
  'use strict';
  const Shared = global.Shared = global.Shared || {};
  const palette = Shared.palette = Shared.palette || {};
  const FALLBACK_SCATTER_COLORS = [
    '#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00',
    '#ffff33', '#a65628', '#f781bf', '#999999'
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

  resolveDefaultScatterColors();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
