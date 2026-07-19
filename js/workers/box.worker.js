/* Box stats and swarm worker */
(function(){
  'use strict';

  const ctx = typeof self !== 'undefined' ? self : this;
  const Shared = ctx.Shared = ctx.Shared || {};

  function hasUsableBoxStatsModel(candidate){
    return !!candidate
      && typeof candidate.computeBoxStatsModel === 'function'
      && typeof candidate.computeSwarmOffsets === 'function';
  }

  function attachBoxStatsModel(candidate){
    if(hasUsableBoxStatsModel(candidate)){
      Shared.boxStatsModel = candidate;
      return candidate;
    }
    return null;
  }

  function loadBoxStatsModelViaCommonJs(){
    if(typeof require !== 'function'){
      return null;
    }
    const root = typeof globalThis !== 'undefined' ? globalThis : null;
    const previousSelf = root ? root.self : undefined;
    try{
      if(root){
        root.self = ctx;
      }
      const requiredModel = require('../shared/boxStatsModel.js');
      return attachBoxStatsModel(requiredModel || Shared.boxStatsModel);
    }catch(_err){
      return null;
    }finally{
      if(root){
        if(typeof previousSelf === 'undefined'){
          try{ delete root.self; }catch(_deleteErr){ root.self = previousSelf; }
        }else{
          root.self = previousSelf;
        }
      }
    }
  }

  function ensureBoxStatsModel(){
    if(hasUsableBoxStatsModel(Shared.boxStatsModel)){
      return Shared.boxStatsModel;
    }
    if(typeof ctx.importScripts === 'function'){
      ctx.importScripts('../shared/debug.js');
      ctx.importScripts('../shared/boxStatsModel.js');
    }
    if(hasUsableBoxStatsModel(Shared.boxStatsModel)){
      return Shared.boxStatsModel;
    }
    const commonJsModel = loadBoxStatsModelViaCommonJs();
    if(hasUsableBoxStatsModel(commonJsModel)){
      return commonJsModel;
    }
    throw new Error('Shared.boxStatsModel unavailable in worker');
  }

  function handleMessage(event){
    const data = event?.data || {};
    const id = data.id;
    const action = data.action;
    try{
      if(action === 'box-swarm'){
        const boxStatsModel = ensureBoxStatsModel();
        const result = boxStatsModel.computeSwarmOffsets(data.payload?.points || [], data.payload?.options || {});
        ctx.postMessage({ id, ok: true, result });
        return;
      }
      if(action === 'box-stats'){
        const boxStatsModel = ensureBoxStatsModel();
        const result = boxStatsModel.computeBoxStatsModel(data.payload || {});
        ctx.postMessage({ id, ok: true, result });
        return;
      }
      ctx.postMessage({ id, ok: false, error: 'Unknown action' });
    }catch(err){
      ctx.postMessage({ id, ok: false, error: err?.message || String(err) });
    }
  }

  ctx.onmessage = handleMessage;
})();
