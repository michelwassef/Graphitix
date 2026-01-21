(function(global) {
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const debugState = Shared.__debugState || { enabled: false };
  Shared.__debugState = debugState;

  if(typeof Shared.setDebugLogging !== 'function'){
    Shared.setDebugLogging = function setDebugLogging(enabled){
      debugState.enabled = !!enabled;
      return debugState.enabled;
    };
  }
  if(typeof Shared.enableDebugLogging !== 'function'){
    Shared.enableDebugLogging = function enableDebugLogging(){
      return Shared.setDebugLogging(true);
    };
  }
  if(typeof Shared.disableDebugLogging !== 'function'){
    Shared.disableDebugLogging = function disableDebugLogging(){
      return Shared.setDebugLogging(false);
    };
  }
  if(typeof Shared.isDebugEnabled !== 'function'){
    Shared.isDebugEnabled = function isDebugEnabled(){
      return !!debugState.enabled;
    };
  }
  if(typeof Shared.debug !== 'function'){
    Shared.debug = function debug(message, payload){
      if(!Shared.isDebugEnabled()){
        return;
      }
      if(typeof console !== 'undefined' && typeof console.debug === 'function'){
        if(typeof payload === 'undefined'){
          console.debug(message);
        }else{
          console.debug(message, payload);
        }
      }
    };
  }

  const loaderState = {};

  function debugLog(name, phase, detail) {
    Shared.debug(`Debug: loaders.${name}.${phase}`, detail || {}); // Debug: loader lifecycle trace
  }

  function createScriptLoader({ name, url, globalKey }) {
    const state = loaderState[name] = loaderState[name] || { promise: null };
    return function lazyLoader() {
      const existing = globalKey ? global[globalKey] : undefined;
      if (existing) {
        debugLog(name, 'cacheHit', { hasGlobal: true });
        return Promise.resolve(existing);
      }
      if (state.promise) {
        debugLog(name, 'pending', { url });
        return state.promise;
      }
      if (!global.document || !global.document.createElement) {
        debugLog(name, 'noDocument', { hasDocument: !!global.document });
        return Promise.reject(new Error(`${name} loader requires a browser-like document`));
      }
      state.promise = new Promise((resolve, reject) => {
        const script = global.document.createElement('script');
        script.src = url;
        script.async = true;
        if (script.dataset) {
          script.dataset.loader = name;
        } else {
          script.setAttribute('data-loader', name);
        }
        script.onload = () => {
          const loaded = globalKey ? global[globalKey] : undefined;
          if (!loaded) {
            state.promise = null;
            debugLog(name, 'missingGlobal', { globalKey });
            reject(new Error(`${name} loaded but global ${globalKey} missing`));
            return;
          }
          debugLog(name, 'loaded', { url });
          resolve(loaded);
        };
        script.onerror = (err) => {
          state.promise = null;
          const message = err?.message || 'unknown error';
          debugLog(name, 'error', { message, url });
          reject(new Error(`Failed to load ${name} script`));
        };
        debugLog(name, 'append', { url });
        global.document.head.appendChild(script);
      });
      return state.promise;
    };
  }

  Shared.lazyChart = Shared.lazyChart || createScriptLoader({
    name: 'chart',
    url: 'https://cdn.jsdelivr.net/npm/chart.js',
    globalKey: 'Chart'
  });

  Shared.lazySvd = Shared.lazySvd || createScriptLoader({
    name: 'svd',
    url: 'https://cdn.jsdelivr.net/npm/svd-js@1.1.1/build-umd/svd-js.min.js',
    globalKey: 'SVDJS'
  });

  Shared.lazyXlsx = Shared.lazyXlsx || createScriptLoader({
    name: 'xlsx',
    url: 'libs/xlsx.full.min.js',
    globalKey: 'XLSX'
  });

  Shared.lazyZip = Shared.lazyZip || createScriptLoader({
    name: 'zip',
    url: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
    globalKey: 'JSZip'
  });
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
