/* PCA SVD worker */
(function(){
  'use strict';

  const ctx = typeof self !== 'undefined' ? self : this;
  const SVD_URL = 'https://cdn.jsdelivr.net/npm/svd-js@1.1.1/build-umd/svd-js.min.js';

  function ensureSvd(){
    if(ctx.SVDJS && typeof ctx.SVDJS.SVD === 'function'){
      return ctx.SVDJS;
    }
    if(typeof ctx.importScripts === 'function'){
      ctx.importScripts(SVD_URL);
    }
    if(ctx.SVDJS && typeof ctx.SVDJS.SVD === 'function'){
      return ctx.SVDJS;
    }
    throw new Error('SVDJS unavailable in worker');
  }

  function transpose2D(m){
    const rows = m.length | 0;
    const cols = rows ? (m[0].length | 0) : 0;
    const t = Array.from({ length: cols }, () => new Array(rows));
    for(let r = 0; r < rows; r += 1){
      const row = m[r];
      for(let c = 0; c < cols; c += 1){
        t[c][r] = row[c];
      }
    }
    return t;
  }

  function reorderColumns(mat, perm){
    if(!Array.isArray(mat) || !mat.length){
      return mat;
    }
    return mat.map(row => perm.map(i => row[i]));
  }

  function sortSvdDescending(svd){
    const qRaw = Array.isArray(svd.q) ? svd.q.slice() : [];
    const order = qRaw
      .map((val, idx) => [Number(val) || 0, idx])
      .sort((a, b) => b[0] - a[0])
      .map(pair => pair[1]);
    if(order.length && order.some((idx, pos) => idx !== pos)){
      svd.q = order.map(i => qRaw[i]);
      svd.u = reorderColumns(svd.u, order);
      svd.v = reorderColumns(svd.v, order);
    }
    return svd;
  }

  function handleMessage(event){
    const data = event?.data || {};
    const id = data.id;
    const action = data.action;
    try{
      if(action === 'pca-svd'){
        const payload = data.payload || {};
        const matrix = Array.isArray(payload.matrix) ? payload.matrix : [];
        const nSamples = Number(payload.nSamples) || 0;
        const nFeatures = Number(payload.nFeatures) || 0;
        const SVDLib = ensureSvd();
        let matrixForSvd = matrix;
        let useFactor = 'u';
        if(nSamples < nFeatures){
          matrixForSvd = transpose2D(matrix);
          useFactor = 'v';
        }
        const svd = SVDLib.SVD(matrixForSvd);
        sortSvdDescending(svd);
        ctx.postMessage({
          id,
          ok: true,
          result: {
            q: Array.isArray(svd.q) ? svd.q : [],
            u: Array.isArray(svd.u) ? svd.u : [],
            v: Array.isArray(svd.v) ? svd.v : [],
            useFactor
          }
        });
        return;
      }
      ctx.postMessage({ id, ok: false, error: 'Unknown action' });
    }catch(err){
      ctx.postMessage({ id, ok: false, error: err?.message || String(err) });
    }
  }

  ctx.onmessage = handleMessage;
})();
