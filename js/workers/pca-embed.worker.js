/* PCA embedding worker for MDS/t-SNE/UMAP */
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

  function clampNumber(value, min, max, fallback){
    const num = Number(value);
    if(!Number.isFinite(num)){
      return fallback;
    }
    return Math.min(Math.max(num, min), max);
  }

  function zeroMeanPoints(points){
    if(!Array.isArray(points) || !points.length){ return; }
    const dims = points[0]?.length || 0;
    if(!dims){ return; }
    const means = new Array(dims).fill(0);
    points.forEach(row => {
      if(!row){ return; }
      for(let d=0; d<dims; d+=1){
        means[d] += row[d] || 0;
      }
    });
    for(let d=0; d<dims; d+=1){
      means[d] /= points.length;
    }
    points.forEach(row => {
      if(!row){ return; }
      for(let d=0; d<dims; d+=1){
        row[d] -= means[d];
      }
    });
  }

  function computePairwiseSquaredDistances(matrix){
    const n = Array.isArray(matrix) ? matrix.length : 0;
    if(n === 0){ return []; }
    const squared = new Array(n);
    for(let i=0; i<n; i+=1){
      squared[i] = new Float64Array(n);
    }
    for(let i=0; i<n; i+=1){
      squared[i][i] = 0;
      for(let j=i+1; j<n; j+=1){
        let sum = 0;
        const rowI = matrix[i];
        const rowJ = matrix[j];
        for(let k=0; k<rowI.length; k+=1){
          const diff = (rowI[k] || 0) - (rowJ[k] || 0);
          sum += diff * diff;
        }
        squared[i][j] = sum;
        squared[j][i] = sum;
      }
    }
    return squared;
  }

  function computeTsneProbabilities(squaredDistances, perplexity){
    const n = squaredDistances.length;
    const targetEntropy = Math.log(Math.max(perplexity, 1));
    const tolerance = 1e-5;
    const maxTries = 50;
    const conditional = new Array(n);
    for(let i=0; i<n; i+=1){
      const betaStats = { beta: 1, betamin: -Infinity, betamax: Infinity };
      const thisP = new Float64Array(n);
      let done = false;
      let tries = 0;
      while(!done && tries < maxTries){
        let sumP = 0;
        let entropy = 0;
        for(let j=0; j<n; j+=1){
          if(i === j){
            thisP[j] = 0;
            continue;
          }
          const val = Math.exp(-squaredDistances[i][j] * betaStats.beta);
          thisP[j] = val;
          sumP += val;
        }
        if(sumP === 0){ sumP = 1; }
        for(let j=0; j<n; j+=1){
          if(i === j){ continue; }
          const p = thisP[j] / sumP;
          entropy += squaredDistances[i][j] * p;
        }
        entropy = Math.log(sumP) + betaStats.beta * entropy;
        const diff = entropy - targetEntropy;
        if(Math.abs(diff) < tolerance){
          done = true;
        } else {
          if(diff > 0){
            betaStats.betamin = betaStats.beta;
            if(!Number.isFinite(betaStats.betamax)){
              betaStats.beta *= 2;
            } else {
              betaStats.beta = (betaStats.beta + betaStats.betamax) / 2;
            }
          } else {
            betaStats.betamax = betaStats.beta;
            if(!Number.isFinite(betaStats.betamin)){
              betaStats.beta /= 2;
            } else {
              betaStats.beta = (betaStats.beta + betaStats.betamin) / 2;
            }
          }
        }
        tries += 1;
      }
      let sumFinal = 0;
      for(let j=0; j<n; j+=1){
        if(i === j){
          thisP[j] = 0;
        } else {
          const val = Math.exp(-squaredDistances[i][j] * betaStats.beta);
          thisP[j] = val;
          sumFinal += val;
        }
      }
      if(sumFinal === 0){ sumFinal = 1; }
      const normalized = new Float64Array(n);
      for(let j=0; j<n; j+=1){
        normalized[j] = i === j ? 0 : thisP[j] / sumFinal;
      }
      conditional[i] = normalized;
    }
    const symmetrized = new Array(n);
    let sumAll = 0;
    for(let i=0; i<n; i+=1){
      symmetrized[i] = new Float64Array(n);
    }
    for(let i=0; i<n; i+=1){
      for(let j=i+1; j<n; j+=1){
        const value = (conditional[i][j] + conditional[j][i]) / (2 * n);
        symmetrized[i][j] = value;
        symmetrized[j][i] = value;
        sumAll += value * 2;
      }
    }
    const normalization = sumAll > 0 ? sumAll : 1;
    for(let i=0; i<n; i+=1){
      for(let j=0; j<n; j+=1){
        symmetrized[i][j] = symmetrized[i][j] / normalization;
      }
    }
    return symmetrized;
  }

  function computeInitialEmbedding(matrix, outputDims){
    const n = Array.isArray(matrix) ? matrix.length : 0;
    if(n === 0){ return []; }
    const dims = Math.max(2, Math.min(outputDims || 2, matrix[0]?.length || 2));
    try{
      const SVDLib = ensureSvd();
      const copy = matrix.map(row => row.slice());
      const svd = SVDLib.SVD(copy);
      const scores = new Array(n).fill(null).map(()=>new Array(dims).fill(0));
      const useDims = Math.min(dims, svd.q.length);
      for(let i=0; i<n; i+=1){
        for(let d=0; d<useDims; d+=1){
          scores[i][d] = svd.u[i][d] * (svd.q[d] || 1);
        }
      }
      zeroMeanPoints(scores);
      return scores;
    }catch(err){
      // fall through to random
    }
    const randomInit = new Array(n).fill(null).map(()=>{
      const row = new Array(dims);
      for(let d=0; d<dims; d+=1){
        row[d] = (Math.random() - 0.5) * 1e-3;
      }
      return row;
    });
    zeroMeanPoints(randomInit);
    return randomInit;
  }

  function computeTsneEmbedding(matrix, options){
    const opts = options || {};
    const n = Array.isArray(matrix) ? matrix.length : 0;
    const outputDims = Math.min(Math.max(opts.outputDims || 2, 2), 3);
    if(n === 0){
      return { embedding: [], iterations: 0, perplexity: opts.perplexity || 30, klDivergence: 0, learningRate: opts.learningRate || 200, earlyExaggeration: opts.earlyExaggeration || 12 };
    }
    const perplexity = clampNumber(opts.perplexity ?? 30, 1, Math.max(1, n - 1), 30);
    const learningRate = clampNumber(opts.learningRate ?? 200, 10, 2000, 200);
    const iterations = Math.round(clampNumber(opts.iterations ?? 1000, 200, 3000, 1000));
    const earlyFraction = typeof opts.earlyIterations === 'number' ? opts.earlyIterations : Math.max(1, Math.round(iterations * (opts.earlyIterationsFraction || 0.1)));
    const earlyExaggeration = clampNumber(opts.earlyExaggeration ?? 12, 1, 50, 12);
    const squaredDistances = computePairwiseSquaredDistances(matrix);
    const probabilities = computeTsneProbabilities(squaredDistances, perplexity);
    const initial = computeInitialEmbedding(matrix, outputDims);
    const embedding = new Array(n);
    for(let i=0; i<n; i+=1){
      embedding[i] = new Float64Array(outputDims);
      for(let d=0; d<outputDims; d+=1){
        embedding[i][d] = initial[i]?.[d] ?? (Math.random() - 0.5) * 1e-4;
      }
    }
    zeroMeanPoints(embedding);
    const gains = new Array(n).fill(null).map(()=>new Float64Array(outputDims).fill(1));
    const yIncs = new Array(n).fill(null).map(()=>new Float64Array(outputDims));
    const grads = new Array(n).fill(null).map(()=>new Float64Array(outputDims));
    const num = new Array(n).fill(null).map(()=>new Float64Array(n));
    let finalKl = 0;
    for(let iter=0; iter<iterations; iter+=1){
      let sumQ = 0;
      for(let i=0; i<n; i+=1){
        const Yi = embedding[i];
        for(let j=i+1; j<n; j+=1){
          const Yj = embedding[j];
          let distSq = 0;
          for(let d=0; d<outputDims; d+=1){
            const diff = Yi[d] - Yj[d];
            distSq += diff * diff;
          }
          const val = 1 / (1 + distSq);
          num[i][j] = val;
          num[j][i] = val;
          sumQ += 2 * val;
        }
        num[i][i] = 0;
      }
      sumQ = Math.max(sumQ, 1e-12);
      for(let i=0; i<n; i+=1){
        const gradRow = grads[i];
        for(let d=0; d<outputDims; d+=1){ gradRow[d] = 0; }
      }
      let kl = 0;
      for(let i=0; i<n; i+=1){
        for(let j=0; j<n; j+=1){
          if(i === j){ continue; }
          const pij = probabilities[i][j] * (iter < earlyFraction ? earlyExaggeration : 1);
          const qijRaw = num[i][j];
          const qij = qijRaw / sumQ;
          const mult = 4 * (pij - qij) * qijRaw;
          if(pij > 1e-12 && qij > 1e-12){
            kl += pij * Math.log(pij / qij);
          }
          for(let d=0; d<outputDims; d+=1){
            grads[i][d] += mult * (embedding[i][d] - embedding[j][d]);
          }
        }
      }
      finalKl = kl;
      const momentum = iter < earlyFraction ? 0.5 : 0.8;
      for(let i=0; i<n; i+=1){
        for(let d=0; d<outputDims; d+=1){
          const gradVal = grads[i][d];
          const inc = yIncs[i][d];
          const gain = gains[i][d];
          const signChanged = Math.sign(gradVal) !== Math.sign(inc) && inc !== 0;
          const newGain = signChanged ? gain + 0.2 : gain * 0.8;
          gains[i][d] = newGain < 0.01 ? 0.01 : newGain;
          const updatedInc = momentum * inc - learningRate * gains[i][d] * gradVal;
          yIncs[i][d] = updatedInc;
          embedding[i][d] += updatedInc;
        }
      }
      zeroMeanPoints(embedding);
    }
    const finalEmbedding = embedding.map(row => Array.from(row));
    return {
      embedding: finalEmbedding,
      iterations,
      perplexity,
      klDivergence: finalKl,
      learningRate,
      earlyExaggeration,
      earlyIterations: earlyFraction
    };
  }

  function computeSimpleUmapEmbedding(matrix, options){
    const opts = options || {};
    const n = Array.isArray(matrix) ? matrix.length : 0;
    const outputDims = Math.min(Math.max(opts.outputDims || 2, 2), 3);
    if(n === 0){
      return { embedding: [], epochs: 0, neighbors: opts.neighbors || 15, minDist: opts.minDist || 0.1, learningRate: opts.learningRate || 1 };
    }
    const neighbors = Math.round(clampNumber(opts.neighbors ?? 15, 2, Math.max(2, n - 1), 15));
    const minDist = clampNumber(opts.minDist ?? 0.1, 0, 0.99, 0.1);
    const learningRate = clampNumber(opts.learningRate ?? 1, 0.01, 10, 1);
    const epochs = Math.round(clampNumber(opts.epochs ?? 500, 50, 5000, 500));
    const negativeSampleRate = Math.round(clampNumber(opts.negativeSampleRate ?? 5, 1, 50, 5));
    const squared = computePairwiseSquaredDistances(matrix);
    const neighborGraph = new Array(n).fill(null).map(()=>[]);
    for(let i=0; i<n; i+=1){
      const candidates = [];
      for(let j=0; j<n; j+=1){
        if(i === j){ continue; }
        candidates.push({ index: j, dist: Math.sqrt(Math.max(squared[i][j], 0)) });
      }
      candidates.sort((a,b)=>a.dist-b.dist);
      const limit = Math.min(neighbors, candidates.length);
      let rho = limit > 0 ? candidates[0].dist : 0;
      const target = Math.log2(Math.max(neighbors, 2));
      let sigma = 1;
      let low = 0;
      let high = Infinity;
      for(let attempt=0; attempt<30; attempt+=1){
        let sum = 0;
        for(let k=0; k<limit; k+=1){
          const d = candidates[k].dist;
          const weight = d - rho <= 0 ? 1 : Math.exp(-(d - rho) / sigma);
          sum += weight;
        }
        const diff = sum - target;
        if(Math.abs(diff) < 1e-3){
          break;
        }
        if(diff > 0){
          high = sigma;
          sigma = low === 0 ? sigma / 2 : (sigma + low) / 2;
        } else {
          low = sigma;
          sigma = Number.isFinite(high) ? (sigma + high) / 2 : sigma * 2;
        }
      }
      for(let k=0; k<limit; k+=1){
        const cand = candidates[k];
        const d = cand.dist;
        const weight = d - rho <= 0 ? 1 : Math.exp(-(d - rho) / Math.max(sigma, 1e-6));
        neighborGraph[i].push({ index: cand.index, weight });
      }
    }
    const weightMatrix = new Array(n).fill(null).map(()=>new Map());
    neighborGraph.forEach((list, i)=>{
      list.forEach(entry => {
        weightMatrix[i].set(entry.index, entry.weight);
      });
    });
    const edges = [];
    for(let i=0; i<n; i+=1){
      neighborGraph[i].forEach(entry => {
        const j = entry.index;
        if(i >= j){ return; }
        const rev = weightMatrix[j]?.get(i) || 0;
        const combined = entry.weight + rev - entry.weight * rev;
        if(combined > 1e-6){
          edges.push({ i, j, weight: combined });
          weightMatrix[i].set(j, combined);
          weightMatrix[j]?.set?.(i, combined);
        }
      });
    }
    const initial = computeInitialEmbedding(matrix, outputDims);
    const embedding = initial.map(row => new Float64Array(row));
    zeroMeanPoints(embedding);
    const rand = Math.random;
    for(let epoch=0; epoch<epochs; epoch+=1){
      const lr = learningRate * (1 - epoch / Math.max(1, epochs));
      for(let e=0; e<edges.length; e+=1){
        const edge = edges[e];
        const source = embedding[edge.i];
        const target = embedding[edge.j];
        let distSq = 0;
        for(let d=0; d<outputDims; d+=1){
          const diff = source[d] - target[d];
          distSq += diff * diff;
        }
        const dist = Math.sqrt(distSq) + 1e-9;
        const force = edge.weight * (dist - minDist);
        const step = lr * force / dist;
        for(let d=0; d<outputDims; d+=1){
          const delta = step * (source[d] - target[d]);
          source[d] -= delta;
          target[d] += delta;
        }
        for(let nSample=0; nSample<negativeSampleRate; nSample+=1){
          let negIndex = Math.floor(rand() * n);
          if(negIndex === edge.i || negIndex === edge.j){ continue; }
          const other = embedding[negIndex];
          let negDistSq = 0;
          for(let d=0; d<outputDims; d+=1){
            const diff = source[d] - other[d];
            negDistSq += diff * diff;
          }
          const repel = lr / (1 + negDistSq);
          for(let d=0; d<outputDims; d+=1){
            const diff = source[d] - other[d];
            const adjust = repel * diff;
            source[d] += adjust;
            other[d] -= adjust;
          }
        }
      }
      if((epoch + 1) % 10 === 0){
        zeroMeanPoints(embedding);
      }
    }
    zeroMeanPoints(embedding);
    const finalEmbedding = embedding.map(row => Array.from(row));
    return {
      embedding: finalEmbedding,
      epochs,
      neighbors,
      minDist,
      learningRate,
      negativeSampleRate
    };
  }

  function computeMdsEmbedding(matrix, requestedDims){
    const nSamples = Array.isArray(matrix) ? matrix.length : 0;
    const nFeatures = nSamples ? (matrix[0]?.length || 0) : 0;
    if(!nSamples || !nFeatures){
      return { coords: [], eigenSummary: [], dimsToUse: 0, totalPositive: 0, stress: 0 };
    }
    const squaredDistances = new Array(nSamples);
    const distanceMatrix = new Array(nSamples);
    for(let i = 0; i < nSamples; i++){
      squaredDistances[i] = new Float64Array(nSamples);
      distanceMatrix[i] = new Float64Array(nSamples);
      for(let j = 0; j < nSamples; j++){
        let sumSq = 0;
        for(let k = 0; k < nFeatures; k++){
          const diff = matrix[i][k] - matrix[j][k];
          sumSq += diff * diff;
        }
        const dist = Math.sqrt(sumSq);
        distanceMatrix[i][j] = dist;
        squaredDistances[i][j] = sumSq;
      }
    }
    let totalMean = 0;
    const rowMeans = new Array(nSamples).fill(0);
    const colMeans = new Array(nSamples).fill(0);
    for(let i = 0; i < nSamples; i++){
      let rowSum = 0;
      for(let j = 0; j < nSamples; j++){
        rowSum += squaredDistances[i][j];
        colMeans[j] += squaredDistances[i][j];
      }
      rowMeans[i] = rowSum / nSamples;
      totalMean += rowSum;
    }
    totalMean /= (nSamples * nSamples);
    for(let j = 0; j < nSamples; j++){
      colMeans[j] /= nSamples;
    }
    const B = new Array(nSamples);
    for(let i = 0; i < nSamples; i++){
      B[i] = new Array(nSamples);
      for(let j = 0; j < nSamples; j++){
        B[i][j] = -0.5 * (squaredDistances[i][j] - rowMeans[i] - colMeans[j] + totalMean);
      }
    }
    const SVDLib = ensureSvd();
    const mdsSvd = SVDLib.SVD(B);
    const eigenValues = Array.isArray(mdsSvd.q) ? mdsSvd.q.slice() : [];
    const positiveEigen = eigenValues
      .map((val, idx) => ({ val, idx }))
      .filter(({ val }) => val > 1e-9);
    const dimsAvailable = positiveEigen.length;
    const requested = Math.max(2, Number(requestedDims) || 2);
    const dimsToUse = Math.min(Math.max(requested, 2), dimsAvailable);
    if(dimsToUse === 0){
      return { coords: [], eigenSummary: [], dimsToUse: 0, totalPositive: 0, stress: 0 };
    }
    const coords = [];
    for(let i = 0; i < nSamples; i++){
      const coordRow = new Array(dimsToUse).fill(0);
      for(let dim = 0; dim < dimsToUse; dim++){
        const eigenIdx = positiveEigen[dim].idx;
        const scale = Math.sqrt(Math.max(positiveEigen[dim].val, 0));
        coordRow[dim] = mdsSvd.u[i][eigenIdx] * scale;
      }
      coords.push(coordRow);
    }
    const totalPositive = positiveEigen.reduce((sum, entry) => sum + entry.val, 0);
    const eigenSummary = [];
    let cumulativeRatio = 0;
    for(let dim = 0; dim < dimsToUse; dim++){
      const eigenVal = positiveEigen[dim]?.val ?? 0;
      const ratio = totalPositive > 0 ? eigenVal / totalPositive : 0;
      cumulativeRatio += ratio;
      const pct = ratio * 100;
      const cumulativePercent = Math.min(100, cumulativeRatio * 100);
      eigenSummary.push({
        component: dim + 1,
        componentLabel: `Dim${dim + 1}`,
        eigenvalue: eigenVal,
        varianceRatio: ratio,
        variancePercent: pct,
        cumulativeVarianceRatio: Math.min(1, cumulativeRatio),
        cumulativeVariancePercent: cumulativePercent,
        singularValue: Math.sqrt(Math.max(eigenVal, 0))
      });
    }
    let stressNumerator = 0;
    let stressDenominator = 0;
    for(let i = 0; i < nSamples; i++){
      for(let j = i + 1; j < nSamples; j++){
        const dx = coords[i][0] - coords[j][0];
        const dy = coords[i][1] - coords[j][1];
        const fittedDist = Math.sqrt(dx * dx + dy * dy);
        const originalDist = distanceMatrix[i][j];
        const diff = originalDist - fittedDist;
        stressNumerator += diff * diff;
        stressDenominator += originalDist * originalDist;
      }
    }
    const stress = stressDenominator > 0 ? Math.sqrt(stressNumerator / stressDenominator) : 0;
    return { coords, eigenSummary, dimsToUse, totalPositive, stress };
  }

  function handleMessage(event){
    const data = event?.data || {};
    const id = data.id;
    const action = data.action;
    try{
      if(action === 'mds'){
        const payload = data.payload || {};
        const result = computeMdsEmbedding(payload.matrix || [], payload.requestedDims || 2);
        ctx.postMessage({ id, ok: true, result });
        return;
      }
      if(action === 'tsne'){
        const payload = data.payload || {};
        const result = computeTsneEmbedding(payload.matrix || [], payload.settings || {});
        ctx.postMessage({ id, ok: true, result });
        return;
      }
      if(action === 'umap'){
        const payload = data.payload || {};
        const result = computeSimpleUmapEmbedding(payload.matrix || [], payload.settings || {});
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
