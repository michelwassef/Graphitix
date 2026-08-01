(function initRenderCacheDiagnostics(global){
  'use strict';

  const Shared = global.Shared = global.Shared || {};
  const MAX_EVENTS = 4000;
  let sequence = 0;
  const events = [];

  function normalizeText(value){
    const text = String(value == null ? '' : value).trim();
    return text || null;
  }

  function emit(input = {}){
    const event = Object.freeze({
      index: ++sequence,
      timestamp: Date.now(),
      tabId: normalizeText(input.tabId),
      component: normalizeText(input.component || input.type),
      phase: normalizeText(input.phase) || 'unknown',
      outcome: normalizeText(input.outcome) || 'observed',
      reason: normalizeText(input.reason),
      source: normalizeText(input.source),
      cacheOwnerTabId: normalizeText(input.cacheOwnerTabId),
      runtimeOwnerTabId: normalizeText(input.runtimeOwnerTabId || input.tabId),
      payloadSignature: normalizeText(input.payloadSignature),
      layoutSignature: normalizeText(input.layoutSignature),
      details: input.details && typeof input.details === 'object'
        ? Object.freeze({ ...input.details })
        : null
    });
    events.push(event);
    if(events.length > MAX_EVENTS){
      events.splice(0, events.length - MAX_EVENTS);
    }
    return event;
  }

  function getCursor(){
    return sequence;
  }

  function getEvents(options = {}){
    const afterCursor = Math.max(0, Number(options.afterCursor) || 0);
    const tabId = normalizeText(options.tabId);
    const component = normalizeText(options.component || options.type);
    const phase = normalizeText(options.phase);
    const outcome = normalizeText(options.outcome);
    return events.filter(event => (
      event.index > afterCursor
      && (!tabId || event.tabId === tabId)
      && (!component || event.component === component)
      && (!phase || event.phase === phase)
      && (!outcome || event.outcome === outcome)
    ));
  }

  function clear(){
    events.length = 0;
    return sequence;
  }

  Shared.renderCacheDiagnostics = Object.freeze({ emit, getCursor, getEvents, clear });
})(window);
