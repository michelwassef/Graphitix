/* Heatmap clustering worker */
(function(){
  'use strict';

  const ctx = typeof self !== 'undefined' ? self : this;

  function computePearson(xs, ys){
    const n = xs.length;
    if(n <= 1) return NaN;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for(let i = 0; i < n; i += 1){
      const x = xs[i];
      const y = ys[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    const numerator = (n * sumXY) - (sumX * sumY);
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    if(denominator === 0) return NaN;
    return numerator / denominator;
  }

  function rankValues(values){
    const entries = values.map((value, index) => ({ value, index }));
    entries.sort((a, b) => a.value - b.value);
    const ranks = new Array(values.length);
    let i = 0;
    while(i < entries.length){
      let j = i + 1;
      while(j < entries.length && entries[j].value === entries[i].value){
        j += 1;
      }
      const rank = (i + j + 1) / 2;
      for(let k = i; k < j; k += 1){
        ranks[entries[k].index] = rank;
      }
      i = j;
    }
    return ranks;
  }

  function computeCorrelation(xs, ys, method){
    if(xs.length !== ys.length || xs.length < 2) return NaN;
    if(method === 'spearman'){
      const rankX = rankValues(xs);
      const rankY = rankValues(ys);
      return computePearson(rankX, rankY);
    }
    return computePearson(xs, ys);
  }

  function alignVectors(vecA, vecB){
    const length = Math.min(vecA?.length || 0, vecB?.length || 0);
    const xs = [];
    const ys = [];
    for(let i = 0; i < length; i += 1){
      const a = vecA[i];
      const b = vecB[i];
      if(Number.isFinite(a) && Number.isFinite(b)){
        xs.push(a);
        ys.push(b);
      }
    }
    return { xs, ys };
  }

  function computeUncenteredCorrelation(xs, ys){
    const n = xs.length;
    if(n === 0){
      return NaN;
    }
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    for(let i = 0; i < n; i += 1){
      const x = xs[i];
      const y = ys[i];
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    const denom = Math.sqrt(sumX2 * sumY2);
    if(denom === 0){
      return NaN;
    }
    return sumXY / denom;
  }

  function distanceBetweenVectors(vecA, vecB, metric){
    const length = Math.min(vecA?.length || 0, vecB?.length || 0);
    if(length === 0){
      return { distance: 1, count: 0 };
    }
    if(metric === 'euclidean'){
      let sumSq = 0;
      let count = 0;
      for(let i = 0; i < length; i += 1){
        const a = vecA[i];
        const b = vecB[i];
        if(Number.isFinite(a) && Number.isFinite(b)){
          const diff = a - b;
          sumSq += diff * diff;
          count += 1;
        }
      }
      if(count === 0){
        return { distance: 1, count: 0 };
      }
      const distance = Math.sqrt(sumSq / count);
      return { distance, count };
    }
    const { xs, ys } = alignVectors(vecA, vecB);
    const count = xs.length;
    if(count === 0){
      return { distance: 1, count: 0 };
    }
    let corr;
    if(metric === 'spearman'){
      corr = computeCorrelation(xs, ys, 'spearman');
    }else if(metric === 'uncentered'){
      corr = computeUncenteredCorrelation(xs, ys);
    }else{
      corr = computeCorrelation(xs, ys, 'pearson');
    }
    const normalizedCorr = Number.isFinite(corr) ? Math.max(-1, Math.min(1, corr)) : NaN;
    const distance = Number.isFinite(normalizedCorr) ? 1 - normalizedCorr : 1;
    return { distance, count, corr: normalizedCorr };
  }

  function packedDistanceIndex(size, i, j){
    if(i === j){ return -1; }
    let a = i;
    let b = j;
    if(a > b){
      a = j;
      b = i;
    }
    return (a * (2 * size - a - 1)) / 2 + (b - a - 1);
  }

  function createMinHeap(compare){
    const data = [];
    const swap = (i, j) => {
      const tmp = data[i];
      data[i] = data[j];
      data[j] = tmp;
    };
    const bubbleUp = index => {
      let i = index;
      while(i > 0){
        const parent = Math.floor((i - 1) / 2);
        if(compare(data[i], data[parent]) >= 0){ break; }
        swap(i, parent);
        i = parent;
      }
    };
    const bubbleDown = index => {
      let i = index;
      while(true){
        const left = i * 2 + 1;
        const right = left + 1;
        let smallest = i;
        if(left < data.length && compare(data[left], data[smallest]) < 0){
          smallest = left;
        }
        if(right < data.length && compare(data[right], data[smallest]) < 0){
          smallest = right;
        }
        if(smallest === i){ break; }
        swap(i, smallest);
        i = smallest;
      }
    };
    return {
      push(item){
        data.push(item);
        bubbleUp(data.length - 1);
      },
      pop(){
        if(data.length === 0){ return null; }
        const top = data[0];
        const last = data.pop();
        if(data.length > 0 && last !== undefined){
          data[0] = last;
          bubbleDown(0);
        }
        return top;
      },
      size(){
        return data.length;
      }
    };
  }

  function hierarchicalCluster(items, metric, linkage){
    const countItems = Array.isArray(items) ? items.length : 0;
    if(countItems === 0){
      return { order: [], tree: null, maxDistance: 0, steps: [], baseDistances: { size: 0, values: [] } };
    }
    if(countItems === 1){
      return {
        order: [items[0].index ?? 0],
        tree: { indices: [0], left: null, right: null, distance: 0 },
        maxDistance: 0,
        steps: [],
        baseDistances: { size: 1, values: [] }
      };
    }

    const baseDistanceStore = {
      size: countItems,
      values: new Float32Array((countItems * (countItems - 1)) / 2)
    };
    const baseValues = baseDistanceStore.values;
    const writeBaseDistance = (i, j, value) => {
      if(i === j){ return; }
      const idx = packedDistanceIndex(countItems, i, j);
      if(idx >= 0){
        baseValues[idx] = value;
      }
    };
    const readBaseDistance = (i, j) => {
      if(i === j){ return 0; }
      const idx = packedDistanceIndex(countItems, i, j);
      if(idx < 0){ return 0; }
      return baseValues[idx];
    };

    for(let i = 0; i < countItems; i += 1){
      for(let j = i + 1; j < countItems; j += 1){
        const { distance } = distanceBetweenVectors(items[i].vector, items[j].vector, metric);
        const safeDistance = Number.isFinite(distance) ? distance : 1;
        writeBaseDistance(i, j, safeDistance);
      }
    }

    const distanceCache = new Map();
    const makeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    const setDistance = (a, b, value) => {
      if(a === b){ return; }
      distanceCache.set(makeKey(a, b), value);
    };
    const getDistance = (a, b) => {
      if(a === b){ return 0; }
      const key = makeKey(a, b);
      if(distanceCache.has(key)){
        return distanceCache.get(key);
      }
      if(a < countItems && b < countItems){
        const base = readBaseDistance(a, b);
        distanceCache.set(key, base);
        return base;
      }
      return 1;
    };

    const computeCentroidForIndices = indices => {
      const length = items[0]?.vector?.length || 0;
      const sums = Array.from({ length }, () => 0);
      const counts = Array.from({ length }, () => 0);
      for(const idx of indices){
        const vector = items[idx].vector;
        for(let i = 0; i < length; i += 1){
          const value = vector[i];
          if(Number.isFinite(value)){
            sums[i] += value;
            counts[i] += 1;
          }
        }
      }
      return sums.map((sum, idx) => counts[idx] > 0 ? sum / counts[idx] : NaN);
    };

    const getClusterCentroid = cluster => {
      if(!cluster){ return []; }
      if(!cluster.centroid){
        cluster.centroid = computeCentroidForIndices(cluster.indices);
      }
      return cluster.centroid;
    };

    const linkageDistance = (clusterA, clusterB) => {
      if(!clusterA || !clusterB){ return 1; }
      const indicesA = clusterA.indices;
      const indicesB = clusterB.indices;
      if(linkage === 'centroid'){
        const centroidA = getClusterCentroid(clusterA);
        const centroidB = getClusterCentroid(clusterB);
        const { distance } = distanceBetweenVectors(centroidA, centroidB, metric);
        return Number.isFinite(distance) ? distance : 1;
      }
      let best = Infinity;
      let worst = -Infinity;
      let sum = 0;
      let pairCount = 0;
      for(const idxA of indicesA){
        for(const idxB of indicesB){
          const dist = readBaseDistance(idxA, idxB);
          if(!Number.isFinite(dist)){ continue; }
          if(linkage === 'single'){
            if(dist < best){ best = dist; }
          }else if(linkage === 'complete'){
            if(dist > worst){ worst = dist; }
          }else{
            sum += dist;
            pairCount += 1;
          }
        }
      }
      if(linkage === 'single'){
        return Number.isFinite(best) ? best : 1;
      }
      if(linkage === 'complete'){
        return Number.isFinite(worst) ? worst : 1;
      }
      return pairCount > 0 ? sum / pairCount : 1;
    };

    const clusters = items.map((item, index) => ({
      id: index,
      indices: [index],
      left: null,
      right: null,
      distance: 0,
      centroid: null,
      version: 0,
      size: 1
    }));
    const active = new Map();
    clusters.forEach(cluster => {
      active.set(cluster.id, cluster);
    });
    const steps = [];
    let maxDistance = 0;
    let nextClusterId = countItems;
    const heap = createMinHeap((a, b) => a.distance - b.distance);

    const pushCandidate = (idA, idB) => {
      if(idA === idB){ return; }
      const clusterA = active.get(idA);
      const clusterB = active.get(idB);
      if(!clusterA || !clusterB){ return; }
      const firstId = idA < idB ? idA : idB;
      const secondId = idA < idB ? idB : idA;
      const distance = linkageDistance(clusterA, clusterB);
      const safeDistance = Number.isFinite(distance) ? distance : 1;
      heap.push({
        distance: safeDistance,
        aId: firstId,
        bId: secondId,
        aVersion: clusterA.version,
        bVersion: clusterB.version,
        aSize: clusterA.size,
        bSize: clusterB.size
      });
    };

    for(let i = 0; i < clusters.length; i += 1){
      for(let j = i + 1; j < clusters.length; j += 1){
        pushCandidate(clusters[i].id, clusters[j].id);
      }
    }

    const pollNextPair = () => {
      while(heap.size() > 0){
        const entry = heap.pop();
        if(!entry){ break; }
        const clusterA = active.get(entry.aId);
        const clusterB = active.get(entry.bId);
        if(!clusterA || !clusterB){
          continue;
        }
        if(clusterA.version !== entry.aVersion || clusterB.version !== entry.bVersion){
          continue;
        }
        return { clusterA, clusterB, distance: entry.distance };
      }
      return null;
    };

    while(active.size > 1){
      let nextPair = pollNextPair();
      if(!nextPair){
        const remaining = Array.from(active.values());
        if(remaining.length < 2){
          break;
        }
        const clusterA = remaining[0];
        const clusterB = remaining[1];
        const fallbackDistance = linkageDistance(clusterA, clusterB);
        nextPair = { clusterA, clusterB, distance: Number.isFinite(fallbackDistance) ? fallbackDistance : 1 };
      }

      const { clusterA, clusterB } = nextPair;
      active.delete(clusterA.id);
      active.delete(clusterB.id);
      const mergedIndices = clusterA.indices.concat(clusterB.indices).sort((a, b) => a - b);

      const merged = {
        id: nextClusterId,
        indices: mergedIndices,
        left: clusterA,
        right: clusterB,
        distance: Number.isFinite(nextPair.distance) ? nextPair.distance : 0,
        centroid: null,
        version: 0,
        size: clusterA.size + clusterB.size
      };
      nextClusterId += 1;
      active.set(merged.id, merged);

      for(const other of active.values()){
        if(other.id === merged.id){ continue; }
        pushCandidate(merged.id, other.id);
      }

      steps.push({
        left: clusterA.indices.slice(),
        right: clusterB.indices.slice(),
        distance: Number.isFinite(nextPair.distance) ? nextPair.distance : 0
      });
      maxDistance = Math.max(maxDistance, Number.isFinite(nextPair.distance) ? nextPair.distance : 0);
      clusterA.version += 1;
      clusterB.version += 1;
    }

    const [root] = active.values();
    if(!root){
      return {
        order: clusters.map(cluster => cluster.id),
        tree: null,
        steps,
        maxDistance,
        baseDistances: { size: countItems, values: [] }
      };
    }
    const flatten = node => {
      if(!node.left || !node.right){
        return node.indices.slice();
      }
      const leftOrder = flatten(node.left);
      const rightOrder = flatten(node.right);
      const leftMin = Math.min(...leftOrder);
      const rightMin = Math.min(...rightOrder);
      return leftMin <= rightMin ? leftOrder.concat(rightOrder) : rightOrder.concat(leftOrder);
    };
    const order = flatten(root);
    return { order, tree: root, steps, maxDistance, baseDistances: { size: countItems, values: [] } };
  }

  function handleMessage(event){
    const data = event?.data || {};
    const id = data.id;
    const action = data.action;
    try{
      if(action === 'hierarchicalCluster'){
        const payload = data.payload || {};
        const items = Array.isArray(payload.items) ? payload.items : [];
        const metric = payload.metric || 'pearson';
        const linkage = payload.linkage || 'average';
        const result = hierarchicalCluster(items, metric, linkage);
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
