(function initAxisRange(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const axisRange = Shared.axisRange = Shared.axisRange || {};

  axisRange.includeZero = function includeZero(bounds, options = {}){
    const min = Number(bounds?.min);
    const max = Number(bounds?.max);
    if(options.enabled !== true || options.log === true){
      return { min, max };
    }
    return {
      min: options.autoMin === false ? min : Math.min(min, 0),
      max: options.autoMax === false ? max : Math.max(max, 0)
    };
  };

  axisRange.includeValue = function includeValue(bounds, value, options = {}){
    const min = Number(bounds?.min);
    const max = Number(bounds?.max);
    const numericValue = Number(value);
    if(options.enabled !== true || !Number.isFinite(numericValue)
      || (options.log === true && numericValue <= 0)){
      return { min, max };
    }
    return {
      min: options.autoMin === false ? min : Math.min(min, numericValue),
      max: options.autoMax === false ? max : Math.max(max, numericValue)
    };
  };

  axisRange.resolveOrigin = function resolveOrigin(options = {}){
    const min = Number(options.min);
    const max = Number(options.max);
    const mode = options.mode;
    const requested = mode === 'zero'
      ? (options.log === true ? min : 0)
      : (mode === 'custom' ? Number(options.custom) : min);
    const finiteRequested = Number.isFinite(requested) ? requested : min;
    return Math.min(Math.max(finiteRequested, min), max);
  };
})(typeof window !== 'undefined' ? window : globalThis);
