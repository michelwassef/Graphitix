(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const symbolGeometry = Shared.symbolGeometry = Shared.symbolGeometry || {};
  symbolGeometry.RENDER_GEOMETRY_VERSION = 1;

  symbolGeometry.resolveEqualAreaHalfExtent = function resolveEqualAreaHalfExtent(shape, halfExtent){
    const extent = Number(halfExtent);
    if(!Number.isFinite(extent) || extent < 0){
      return 0;
    }
    return String(shape || '').toLowerCase() === 'diamond'
      ? extent * Math.SQRT2
      : extent;
  };

  symbolGeometry.isRenderCacheCurrent = function isRenderCacheCurrent(cache){
    return Number(cache?.__graphitixRenderCache?.symbolGeometryVersion)
      === symbolGeometry.RENDER_GEOMETRY_VERSION;
  };

  if(typeof module !== 'undefined' && module.exports){
    module.exports = symbolGeometry;
  }
})(typeof window !== 'undefined' ? window : globalThis);
