(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.themeCompiler = Shared.themeCompiler || {};

  const adapters = new Map();

  function normalizeType(value){
    return String(value || '').trim().toLowerCase();
  }

  function registerAdapter(type, adapter){
    const key = normalizeType(type);
    if(!key || typeof adapter !== 'function') return false;
    adapters.set(key, adapter);
    return true;
  }

  function hasAdapter(type){
    return adapters.has(normalizeType(type));
  }

  function compilePayload(type, payload, scheme, context){
    const key = normalizeType(type);
    const adapter = adapters.get(key);
    if(!adapter) return null;
    return adapter(payload, scheme, context || {});
  }

  function listAdapters(){
    return Array.from(adapters.keys()).sort();
  }

  namespace.registerAdapter = registerAdapter;
  namespace.hasAdapter = hasAdapter;
  namespace.compilePayload = compilePayload;
  namespace.listAdapters = listAdapters;
})(window);
