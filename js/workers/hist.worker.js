/* Histogram statistics worker */
(function(){
  'use strict';

  const ctx = typeof self !== 'undefined' ? self : this;
  const Shared = ctx.Shared = ctx.Shared || {};

  function ensureStats(){
    if(typeof Shared.stats?.kolmogorovSmirnovTwoSample === 'function'){
      return Shared.stats;
    }
    if(typeof ctx.importScripts === 'function'){
      ctx.importScripts('../shared/stats.js');
    }
    if(typeof Shared.stats?.kolmogorovSmirnovTwoSample === 'function'){
      return Shared.stats;
    }
    throw new Error('Shared.stats Kolmogorov-Smirnov test is unavailable in worker');
  }

  ctx.onmessage = event => {
    const message = event?.data || {};
    const { id, action, payload = {} } = message;
    try{
      if(action !== 'hist-ks-two-sample'){
        ctx.postMessage({ id, ok: false, error: 'Unknown action' });
        return;
      }
      const stats = ensureStats();
      const result = stats.kolmogorovSmirnovTwoSample(
        payload.sampleA,
        payload.sampleB,
        payload.options || {}
      );
      ctx.postMessage({ id, ok: true, result });
    }catch(error){
      ctx.postMessage({ id, ok: false, error: error?.message || String(error) });
    }
  };
})();
