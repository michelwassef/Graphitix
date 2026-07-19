(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const resampling = Shared.resampling = Shared.resampling || {};

  const DEFAULT_SEED = 1337;
  const DEFAULT_ITERATIONS = 200;
  const MAX_ITERATIONS = 1000000;

  function hashText(value, seed = 2166136261){
    const text = String(value == null ? '' : value);
    let hash = seed >>> 0;
    for(let index = 0; index < text.length; index += 1){
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function stableSerialize(value, seen = new WeakSet()){
    if(value == null || typeof value === 'number' || typeof value === 'boolean'){
      return JSON.stringify(value);
    }
    if(typeof value === 'string'){
      return JSON.stringify(value);
    }
    if(typeof value !== 'object'){
      return JSON.stringify(String(value));
    }
    if(seen.has(value)){
      throw new TypeError('Cannot derive a resampling seed from a circular value');
    }
    seen.add(value);
    let result;
    if(Array.isArray(value)){
      result = `[${value.map(item => stableSerialize(item, seen)).join(',')}]`;
    }else{
      const keys = Object.keys(value).sort();
      result = `{${keys.map(key => `${JSON.stringify(key)}:${stableSerialize(value[key], seen)}`).join(',')}}`;
    }
    seen.delete(value);
    return result;
  }

  resampling.normalizeSeed = function normalizeSeed(value, fallback = DEFAULT_SEED){
    if(typeof value === 'number' && Number.isFinite(value)){
      return (Math.trunc(value) >>> 0) || (Math.trunc(fallback) >>> 0) || DEFAULT_SEED;
    }
    const text = String(value == null ? '' : value).trim();
    if(text){
      const numeric = Number(text);
      if(Number.isFinite(numeric)){
        return (Math.trunc(numeric) >>> 0) || (Math.trunc(fallback) >>> 0) || DEFAULT_SEED;
      }
      return hashText(text) || DEFAULT_SEED;
    }
    return (Math.trunc(Number(fallback)) >>> 0) || DEFAULT_SEED;
  };

  resampling.normalizeIterations = function normalizeIterations(value, fallback = DEFAULT_ITERATIONS, options = {}){
    const minimum = Number.isFinite(Number(options.min)) ? Math.max(1, Math.trunc(Number(options.min))) : 1;
    const maximum = Number.isFinite(Number(options.max))
      ? Math.max(minimum, Math.trunc(Number(options.max)))
      : MAX_ITERATIONS;
    const numeric = Number(value);
    const fallbackValue = Number.isFinite(Number(fallback)) ? Number(fallback) : DEFAULT_ITERATIONS;
    return Math.max(minimum, Math.min(maximum, Math.trunc(Number.isFinite(numeric) ? numeric : fallbackValue)));
  };

  resampling.deriveSeed = function deriveSeed(baseSeed, ...scopeParts){
    let hash = resampling.normalizeSeed(baseSeed, DEFAULT_SEED);
    scopeParts.forEach(part => {
      const serialized = stableSerialize(part);
      hash = hashText(serialized, hash ^ 0x9e3779b9);
    });
    return hash || DEFAULT_SEED;
  };

  resampling.createRandom = function createRandom(seed = DEFAULT_SEED){
    let state = resampling.normalizeSeed(seed, DEFAULT_SEED);
    return function nextRandom(){
      state = (state + 0x6D2B79F5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  };

  resampling.createScopedRandom = function createScopedRandom(baseSeed, ...scopeParts){
    return resampling.createRandom(resampling.deriveSeed(baseSeed, ...scopeParts));
  };

  resampling.sampleIndex = function sampleIndex(random, length){
    const size = Math.max(0, Math.trunc(Number(length)));
    if(size < 1){
      return -1;
    }
    const nextRandom = typeof random === 'function' ? random : resampling.createRandom(DEFAULT_SEED);
    return Math.min(size - 1, Math.floor(nextRandom() * size));
  };

  resampling.DEFAULT_SEED = DEFAULT_SEED;
  resampling.DEFAULT_ITERATIONS = DEFAULT_ITERATIONS;
  resampling.MAX_ITERATIONS = MAX_ITERATIONS;
})(typeof window !== 'undefined' ? window : globalThis);
