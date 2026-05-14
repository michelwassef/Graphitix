(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.themeCatalog = Shared.themeCatalog || {};

  const state = {
    schemes: {},
    typeDefaults: {},
    typeOptions: {},
    initialized: false
  };

  function normalizeId(value){
    const raw = String(value || '').trim().toLowerCase();
    return raw || '';
  }

  function cloneValue(value){
    if(value === null || value === undefined){ return value; }
    try{ return JSON.parse(JSON.stringify(value)); }catch(_err){ return value; }
  }

  function registerScheme(id, scheme){
    const key = normalizeId(id || scheme?.id);
    if(!key || !scheme || typeof scheme !== 'object') return false;
    state.schemes[key] = Object.freeze({ ...scheme, id: key });
    return true;
  }

  function registerAll(schemes){
    const source = schemes && typeof schemes === 'object' ? schemes : {};
    Object.keys(source).forEach(key => registerScheme(key, source[key]));
    state.initialized = true;
    return namespace.list();
  }

  function getScheme(id, fallbackId){
    const key = normalizeId(id);
    if(key && state.schemes[key]) return state.schemes[key];
    const fallback = normalizeId(fallbackId);
    if(fallback && state.schemes[fallback]) return state.schemes[fallback];
    return null;
  }

  function list(){
    return Object.keys(state.schemes).sort().map(key => state.schemes[key]);
  }

  function setTypeDefault(type, schemeId){
    const t = normalizeId(type);
    const s = normalizeId(schemeId);
    if(!t || !s) return false;
    state.typeDefaults[t] = s;
    return true;
  }

  function getTypeDefault(type, fallback){
    const t = normalizeId(type);
    return state.typeDefaults[t] || normalizeId(fallback || 'scientific');
  }

  function setTypeOptions(type, optionIds){
    const t = normalizeId(type);
    if(!t || !Array.isArray(optionIds)) return false;
    state.typeOptions[t] = optionIds.map(normalizeId).filter(Boolean);
    return true;
  }

  function getTypeOptions(type){
    const t = normalizeId(type);
    return (state.typeOptions[t] || []).slice();
  }

  namespace.registerScheme = registerScheme;
  namespace.registerAll = registerAll;
  namespace.getScheme = getScheme;
  namespace.list = list;
  namespace.setTypeDefault = setTypeDefault;
  namespace.getTypeDefault = getTypeDefault;
  namespace.setTypeOptions = setTypeOptions;
  namespace.getTypeOptions = getTypeOptions;
  namespace.snapshot = function snapshot(){
    return {
      schemes: cloneValue(state.schemes),
      typeDefaults: cloneValue(state.typeDefaults),
      typeOptions: cloneValue(state.typeOptions)
    };
  };
})(window);
