(function initRenderCacheSchema(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const SCHEMA_VERSION = 2;

  function normalizeText(value){
    const text = String(value == null ? '' : value).trim();
    return text || null;
  }

  function safeRead(object, key){
    try {
      return object?.[key];
    } catch (_err) {
      return undefined;
    }
  }

  function getMetadata(cache){
    const metadata = safeRead(cache, '__graphitixRenderCache');
    return metadata && typeof metadata === 'object' ? metadata : null;
  }

  function uniqueNormalized(values){
    return Array.from(new Set(values.map(normalizeText).filter(Boolean)));
  }

  function inspect(cache){
    const metadata = getMetadata(cache);
    const ownerValues = cache && typeof cache === 'object'
      ? uniqueNormalized([safeRead(metadata, 'tabId'), safeRead(cache, 'tabId')])
      : [];
    const componentValues = cache && typeof cache === 'object'
      ? uniqueNormalized([
          safeRead(metadata, 'component'),
          safeRead(metadata, 'type')
        ])
      : [];
    const numericVersion = Number(safeRead(metadata, 'version'));
    return Object.freeze({
      metadata,
      version: Number.isFinite(numericVersion) ? numericVersion : null,
      complete: safeRead(metadata, 'complete') === true,
      ownerTabId: ownerValues[0] || null,
      componentType: componentValues[0] || null,
      ownerValues: Object.freeze(ownerValues),
      componentValues: Object.freeze(componentValues),
      ownerConflict: ownerValues.length > 1,
      componentConflict: componentValues.length > 1
    });
  }

  function validate(cache, expected = {}, options = {}){
    const info = inspect(cache);
    const expectedOwnerTabId = normalizeText(expected.tabId || expected.ownerTabId);
    const expectedComponentType = normalizeText(expected.component || expected.type || expected.componentType);
    const errors = [];
    if(!cache || typeof cache !== 'object'){
      errors.push('missing-cache-object');
    }
    if(!info.metadata){
      errors.push('missing-metadata');
    }
    if(info.ownerConflict){
      errors.push('owner-alias-conflict');
    }
    if(info.componentConflict){
      errors.push('component-alias-conflict');
    }
    if(options.requireVersion === true && info.version !== SCHEMA_VERSION){
      errors.push(info.version == null ? 'version-missing' : 'version-mismatch');
    }
    if(options.requireComplete === true && info.complete !== true){
      errors.push('incomplete-cache');
    }
    if(expectedOwnerTabId){
      if(!info.ownerTabId){
        errors.push('owner-missing');
      }else if(info.ownerTabId !== expectedOwnerTabId){
        errors.push('owner-mismatch');
      }
    }
    if(expectedComponentType){
      if(!info.componentType){
        errors.push('component-missing');
      }else if(info.componentType !== expectedComponentType){
        errors.push('component-mismatch');
      }
    }
    return Object.freeze({
      ok: errors.length === 0,
      errors: Object.freeze(errors),
      ...info,
      expectedOwnerTabId,
      expectedComponentType
    });
  }

  function createMetadata(input = {}){
    const component = normalizeText(input.component || input.type || input.componentType);
    const tabId = normalizeText(input.tabId || input.ownerTabId);
    const extra = input.extra && typeof input.extra === 'object' ? input.extra : {};
    return {
      ...extra,
      version: SCHEMA_VERSION,
      component,
      type: component,
      tabId,
      complete: input.complete === true
    };
  }

  function withPresentationMetadata(cache, input = {}){
    if(!cache || typeof cache !== 'object'){
      return cache || null;
    }
    const previous = getMetadata(cache);
    if(!previous){
      return null;
    }
    const graphicKey = normalizeText(input.graphicKey) || normalizeText(previous.graphicKey);
    const previewKey = normalizeText(input.previewKey) || graphicKey || normalizeText(previous.previewKey);
    const nextMetadata = {
      ...previous,
      ...(graphicKey ? { graphicKey } : {}),
      ...(previewKey ? { previewKey } : {}),
      normalizedAt: Number(input.normalizedAt) || Date.now(),
      reason: normalizeText(input.reason) || normalizeText(previous.reason) || 'render-cache-normalize'
    };
    const next = {
      ...cache,
      __graphitixRenderCache: nextMetadata
    };
    if(graphicKey && !next.graphicKey){
      next.graphicKey = graphicKey;
    }
    return next;
  }

  function createRollbackView(cache, expected = {}){
    if(!cache || typeof cache !== 'object'){
      return cache || null;
    }
    try {
      const previous = getMetadata(cache) || {};
      const component = normalizeText(expected.component || expected.type || expected.componentType);
      const tabId = normalizeText(expected.tabId || expected.ownerTabId);
      return {
        ...cache,
        __graphitixRenderCache: createMetadata({
          component,
          tabId,
          complete: true,
          extra: {
            ...previous,
            rollbackOnly: true,
            reason: normalizeText(expected.reason) || 'render-cache-capture-rollback'
          }
        })
      };
    } catch (_err) {
      return cache;
    }
  }

  Shared.renderCacheSchema = Object.freeze({
    SCHEMA_VERSION,
    normalizeText,
    getMetadata,
    inspect,
    validate,
    createMetadata,
    withPresentationMetadata,
    createRollbackView,
    getOwnerTabId: cache => inspect(cache).ownerTabId,
    getComponentType: cache => inspect(cache).componentType,
    matches: (cache, expected = {}, options = {}) => validate(cache, expected, options).ok
  });
})(window);
