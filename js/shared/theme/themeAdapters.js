(function(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const namespace = Shared.themeAdapters = Shared.themeAdapters || {};

  function ensureObject(value){
    return value && typeof value === 'object' ? value : {};
  }

  function ensureArray(value){
    return Array.isArray(value) ? value : [];
  }

  function cloneValue(value){
    if(value === null || value === undefined) return value;
    try{ return JSON.parse(JSON.stringify(value)); }catch(_err){ return value; }
  }

  function applyAxisTokens(cfg, scheme){
    const next = ensureObject(cfg);
    const tokens = ensureObject(scheme?.tokens);
    next.axis = ensureObject(next.axis);
    if(tokens.axisColor){ next.axis.color = tokens.axisColor; }
    if(next.gridStyle && typeof next.gridStyle === 'object' && tokens.gridColor){
      next.gridStyle.color = tokens.gridColor;
    }
    if(tokens.background){ next.backgroundColor = tokens.background; }
    if(tokens.textColor){ next.textColor = tokens.textColor; }
    return next;
  }

  function createGenericAdapter(type){
    return function genericThemeAdapter(payload, scheme, context){
      if(typeof context?.legacyApply === 'function'){
        return context.legacyApply(type, payload, scheme, context?.options || {});
      }
      const next = cloneValue(payload) || { type, config: {} };
      next.type = type;
      const cfg = next.config = ensureObject(next.config);
      cfg.colorScheme = String(scheme?.id || cfg.colorScheme || 'scientific').toLowerCase();
      applyAxisTokens(cfg, scheme);
      return next;
    };
  }

  function installDefaultAdapters(){
    const compiler = Shared.themeCompiler;
    if(!compiler || typeof compiler.registerAdapter !== 'function'){
      return false;
    }
    ['scatter','line','pca','box','hist','pie','roc','survival','heatmap','surface'].forEach(type => {
      if(!compiler.hasAdapter?.(type)){
        compiler.registerAdapter(type, createGenericAdapter(type));
      }
    });
    if(!compiler.hasAdapter?.('venn')){
      compiler.registerAdapter('venn', (payload, scheme, context) => {
        if(typeof context?.legacyApply === 'function'){
          return context.legacyApply('venn', payload, scheme, context?.options || {});
        }
        const next = cloneValue(payload) || { type: 'venn', style: {} };
        next.type = 'venn';
        next.style = ensureObject(next.style);
        next.style.colorScheme = String(scheme?.id || next.style.colorScheme || 'scientific').toLowerCase();
        return next;
      });
    }
    return true;
  }

  namespace.installDefaultAdapters = installDefaultAdapters;
  namespace.createGenericAdapter = createGenericAdapter;
  namespace.applyAxisTokens = applyAxisTokens;
  namespace.cloneValue = cloneValue;
  namespace.ensureObject = ensureObject;
  namespace.ensureArray = ensureArray;
})(window);
