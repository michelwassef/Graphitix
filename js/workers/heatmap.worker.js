/* Heatmap clustering worker */
(function(){
  'use strict';

  const ctx = typeof self !== 'undefined' ? self : this;

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
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    let sumY2 = 0;
    for(let i = 0; i < length; i += 1){
      const x = vecA[i];
      const y = vecB[i];
      if(!Number.isFinite(x) || !Number.isFinite(y)){ continue; }
      count += 1;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
      sumY2 += y * y;
    }
    if(count === 0){
      return { distance: 1, count: 0 };
    }
    let corr;
    if(metric === 'uncentered'){
      const denominator = Math.sqrt(sumX2 * sumY2);
      corr = denominator === 0 ? NaN : sumXY / denominator;
    }else{
      const numerator = (count * sumXY) - (sumX * sumY);
      const denominator = Math.sqrt(
        ((count * sumX2) - (sumX * sumX))
        * ((count * sumY2) - (sumY * sumY))
      );
      corr = denominator === 0 ? NaN : numerator / denominator;
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

  const MAX_EXACT_PACKED_DISTANCE_BYTES = 128 * 1024 * 1024;

  function flattenTree(root){
    const order = [];
    const stack = root ? [root] : [];
    while(stack.length){
      const node = stack.pop();
      if(!node.left || !node.right){
        const index = Array.isArray(node.indices) ? node.indices[0] : null;
        if(Number.isInteger(index)){
          order.push(index);
        }
        continue;
      }
      stack.push(node.right);
      stack.push(node.left);
    }
    return order;
  }

  function clusterTwoPointCorrelation(items, vectors, linkage){
    const steps = [];
    let maxDistance = 0;
    const mergeNodes = (first, second, distance) => {
      const left = first.minIndex <= second.minIndex ? first : second;
      const right = left === first ? second : first;
      const merged = {
        left,
        right,
        distance,
        minIndex: Math.min(first.minIndex, second.minIndex),
        size: first.size + second.size
      };
      steps.push({ left: [left.minIndex], right: [right.minIndex], distance });
      maxDistance = Math.max(maxDistance, distance);
      return merged;
    };
    const groups = new Map([
      ['ascending', []],
      ['descending', []],
      ['neutral', []]
    ]);
    items.forEach((item, position) => {
      const index = Number.isInteger(item?.index) ? item.index : position;
      const vector = vectors[position] || [];
      const difference = vector.length >= 2 && Number.isFinite(vector[0]) && Number.isFinite(vector[1])
        ? vector[0] - vector[1]
        : 0;
      const kind = difference < 0 ? 'ascending' : (difference > 0 ? 'descending' : 'neutral');
      groups.get(kind).push({
        indices: [index],
        left: null,
        right: null,
        distance: 0,
        minIndex: index,
        size: 1
      });
    });
    let nextId = 0;
    const active = [];
    groups.forEach((leaves, kind) => {
      let level = leaves.sort((a, b) => a.minIndex - b.minIndex);
      const withinDistance = kind === 'neutral' ? 1 : 0;
      while(level.length > 1){
        const next = [];
        for(let index = 0; index < level.length; index += 2){
          next.push(level[index + 1]
            ? mergeNodes(level[index], level[index + 1], withinDistance)
            : level[index]);
        }
        level = next;
      }
      if(level[0]){
        active.push({ id: nextId++, kind, node: level[0], size: level[0].size });
      }
    });
    const distances = new Map();
    const distanceKey = (a, b) => a < b ? `${a}:${b}` : `${b}:${a}`;
    const initialDistance = (kindA, kindB) => {
      if(kindA === 'neutral' || kindB === 'neutral'){ return 1; }
      return kindA === kindB ? 0 : 2;
    };
    for(let first = 0; first < active.length; first += 1){
      for(let second = first + 1; second < active.length; second += 1){
        distances.set(
          distanceKey(active[first].id, active[second].id),
          initialDistance(active[first].kind, active[second].kind)
        );
      }
    }
    while(active.length > 1){
      let bestFirst = 0;
      let bestSecond = 1;
      let bestDistance = distances.get(distanceKey(active[0].id, active[1].id));
      for(let first = 0; first < active.length; first += 1){
        for(let second = first + 1; second < active.length; second += 1){
          const distance = distances.get(distanceKey(active[first].id, active[second].id));
          if(distance < bestDistance){
            bestFirst = first;
            bestSecond = second;
            bestDistance = distance;
          }
        }
      }
      const clusterA = active[bestFirst];
      const clusterB = active[bestSecond];
      const merged = {
        id: nextId++,
        kind: 'merged',
        node: mergeNodes(clusterA.node, clusterB.node, bestDistance),
        size: clusterA.size + clusterB.size
      };
      active.splice(bestSecond, 1);
      active.splice(bestFirst, 1);
      active.forEach(other => {
        const distanceA = distances.get(distanceKey(clusterA.id, other.id));
        const distanceB = distances.get(distanceKey(clusterB.id, other.id));
        let distance;
        if(linkage === 'single'){
          distance = Math.min(distanceA, distanceB);
        }else if(linkage === 'complete'){
          distance = Math.max(distanceA, distanceB);
        }else{
          distance = ((clusterA.size * distanceA) + (clusterB.size * distanceB)) / merged.size;
        }
        distances.set(distanceKey(merged.id, other.id), distance);
      });
      active.push(merged);
    }
    const root = active[0]?.node || null;
    return {
      order: flattenTree(root),
      tree: root,
      steps,
      maxDistance,
      algorithm: 'two-point-correlation',
      baseDistances: { size: items.length, values: [] }
    };
  }

  function normalizeCompleteCorrelationVectors(vectors){
    const dimension = vectors[0]?.length || 0;
    if(dimension < 2 || !vectors.every(vector => vector.length === dimension)){
      return null;
    }
    const normalized = new Float64Array(vectors.length * dimension);
    for(let row = 0; row < vectors.length; row += 1){
      const vector = vectors[row];
      let finiteCount = 0;
      let sum = 0;
      for(let column = 0; column < dimension; column += 1){
        if(Number.isFinite(vector[column])){
          finiteCount += 1;
          sum += vector[column];
        }
      }
      if(finiteCount < 2){
        continue;
      }
      if(finiteCount !== dimension){
        return null;
      }
      const mean = sum / dimension;
      let normSquared = 0;
      for(let column = 0; column < dimension; column += 1){
        const centered = vector[column] - mean;
        normalized[row * dimension + column] = centered;
        normSquared += centered * centered;
      }
      if(normSquared === 0){
        continue;
      }
      const inverseNorm = 1 / Math.sqrt(normSquared);
      for(let column = 0; column < dimension; column += 1){
        normalized[row * dimension + column] *= inverseNorm;
      }
    }
    return { dimension, values: normalized };
  }

  function clusterAverageCorrelation(items, normalizedVectors){
    const countItems = items.length;
    const dimension = normalizedVectors.dimension;
    const sums = normalizedVectors.values;
    const activeSlots = Array.from({ length: countItems }, (_, index) => index);
    const activePositions = new Uint32Array(countItems);
    for(let index = 0; index < countItems; index += 1){
      activePositions[index] = index;
    }
    const sizes = new Uint32Array(countItems);
    sizes.fill(1);
    const nodes = items.map((item, position) => {
      const index = Number.isInteger(item?.index) ? item.index : position;
      return {
        indices: [index],
        left: null,
        right: null,
        distance: 0,
        minIndex: index,
        size: 1
      };
    });
    const steps = [];
    const chain = [];
    let activeCount = countItems;
    let maxDistance = 0;
    const firstActive = () => activeSlots[0] ?? -1;
    const removeActiveSlot = slot => {
      const position = activePositions[slot];
      const last = activeSlots.pop();
      if(position < activeSlots.length){
        activeSlots[position] = last;
        activePositions[last] = position;
      }
    };
    const distanceBetweenClusters = (first, second) => {
      const firstOffset = first * dimension;
      const secondOffset = second * dimension;
      let dot;
      if(dimension === 3){
        dot = (sums[firstOffset] * sums[secondOffset])
          + (sums[firstOffset + 1] * sums[secondOffset + 1])
          + (sums[firstOffset + 2] * sums[secondOffset + 2]);
      }else{
        dot = 0;
        for(let column = 0; column < dimension; column += 1){
          dot += sums[firstOffset + column] * sums[secondOffset + column];
        }
      }
      return 1 - (dot / (sizes[first] * sizes[second]));
    };
    const nearestActive = slot => {
      let nearest = -1;
      let nearestDistance = Infinity;
      for(let position = 0; position < activeSlots.length; position += 1){
        const candidate = activeSlots[position];
        if(candidate === slot){ continue; }
        const distance = distanceBetweenClusters(slot, candidate);
        if(distance < nearestDistance || (distance === nearestDistance && candidate < nearest)){
          nearest = candidate;
          nearestDistance = distance;
        }
      }
      return { slot: nearest, distance: nearestDistance };
    };

    while(activeCount > 1){
      if(!chain.length){
        chain.push(firstActive());
      }
      const current = chain[chain.length - 1];
      const nearest = nearestActive(current);
      if(nearest.slot < 0){ break; }
      if(chain.length < 2 || nearest.slot !== chain[chain.length - 2]){
        chain.push(nearest.slot);
        continue;
      }
      const slotA = chain[chain.length - 2];
      const slotB = chain[chain.length - 1];
      const keep = Math.min(slotA, slotB);
      const drop = Math.max(slotA, slotB);
      const nodeA = nodes[slotA];
      const nodeB = nodes[slotB];
      const left = nodeA.minIndex <= nodeB.minIndex ? nodeA : nodeB;
      const right = left === nodeA ? nodeB : nodeA;
      const mergeDistance = Number.isFinite(nearest.distance) ? nearest.distance : 1;
      const keepOffset = keep * dimension;
      const dropOffset = drop * dimension;
      for(let column = 0; column < dimension; column += 1){
        sums[keepOffset + column] += sums[dropOffset + column];
        sums[dropOffset + column] = 0;
      }
      const mergedSize = sizes[slotA] + sizes[slotB];
      nodes[keep] = {
        left,
        right,
        distance: mergeDistance,
        minIndex: Math.min(nodeA.minIndex, nodeB.minIndex),
        size: mergedSize
      };
      nodes[drop] = null;
      sizes[keep] = mergedSize;
      sizes[drop] = 0;
      removeActiveSlot(drop);
      activeCount -= 1;
      steps.push({ left: [left.minIndex], right: [right.minIndex], distance: mergeDistance });
      maxDistance = Math.max(maxDistance, mergeDistance);
      chain.length = 0;
    }
    const rootSlot = firstActive();
    const root = rootSlot >= 0 ? nodes[rootSlot] : null;
    return {
      order: flattenTree(root),
      tree: root,
      steps,
      maxDistance,
      algorithm: 'average-correlation-vector',
      baseDistances: { size: countItems, values: [] }
    };
  }

  function hierarchicalCluster(items, metric, linkage){
    const countItems = Array.isArray(items) ? items.length : 0;
    if(countItems === 0){
      return { order: [], tree: null, maxDistance: 0, steps: [], baseDistances: { size: 0, values: [] } };
    }
    if(countItems === 1){
      const index = Number.isInteger(items[0]?.index) ? items[0].index : 0;
      return {
        order: [index],
        tree: { indices: [index], left: null, right: null, distance: 0 },
        maxDistance: 0,
        steps: [],
        baseDistances: { size: 1, values: [] }
      };
    }

    const vectors = metric === 'spearman'
      ? items.map(item => {
          const vector = Array.isArray(item?.vector) ? item.vector : [];
          const finite = vector.map((value, index) => ({ value, index })).filter(entry => Number.isFinite(entry.value));
          const rankedFinite = rankValues(finite.map(entry => entry.value));
          const ranked = new Array(vector.length).fill(NaN);
          finite.forEach((entry, index) => { ranked[entry.index] = rankedFinite[index]; });
          return ranked;
        })
      : items.map(item => Array.isArray(item?.vector) ? item.vector : []);
    const effectiveMetric = metric === 'spearman' ? 'pearson' : metric;
    if(effectiveMetric === 'pearson'
      && linkage !== 'centroid'
      && vectors.every(vector => vector.length <= 2)){
      return clusterTwoPointCorrelation(items, vectors, linkage);
    }
    if(effectiveMetric === 'pearson' && linkage === 'average'){
      const normalizedVectors = normalizeCompleteCorrelationVectors(vectors);
      if(normalizedVectors){
        return clusterAverageCorrelation(items, normalizedVectors);
      }
    }

    const packedBytes = ((countItems * (countItems - 1)) / 2) * Float32Array.BYTES_PER_ELEMENT;
    if(packedBytes > MAX_EXACT_PACKED_DISTANCE_BYTES){
      throw new Error('Exact hierarchical clustering exceeds the worker memory limit');
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
        const { distance } = distanceBetweenVectors(vectors[i], vectors[j], effectiveMetric);
        const safeDistance = Number.isFinite(distance) ? distance : 1;
        writeBaseDistance(i, j, safeDistance);
      }
    }

    const clusters = items.map((item, position) => {
      const index = Number.isInteger(item?.index) ? item.index : position;
      return {
        indices: [index],
        left: null,
        right: null,
        distance: 0,
        minIndex: index,
        size: 1
      };
    });
    const active = new Uint8Array(countItems);
    active.fill(1);
    const sizes = new Uint32Array(countItems);
    sizes.fill(1);
    const nodes = clusters.slice();
    const centroids = vectors.map(vector => vector.slice());
    const steps = [];
    let maxDistance = 0;
    let activeCount = countItems;
    const chain = [];
    const firstActive = () => {
      for(let index = 0; index < countItems; index += 1){
        if(active[index]){ return index; }
      }
      return -1;
    };
    const nearestActive = slot => {
      let nearest = -1;
      let nearestDistance = Infinity;
      for(let candidate = 0; candidate < countItems; candidate += 1){
        if(candidate === slot || !active[candidate]){ continue; }
        const distance = readBaseDistance(slot, candidate);
        if(distance < nearestDistance || (distance === nearestDistance && candidate < nearest)){
          nearest = candidate;
          nearestDistance = distance;
        }
      }
      return { slot: nearest, distance: nearestDistance };
    };
    const mergeCentroids = (a, b, sizeA, sizeB) => {
      const vectorA = centroids[a] || [];
      const vectorB = centroids[b] || [];
      const length = Math.max(vectorA.length, vectorB.length);
      const centroid = new Array(length);
      for(let index = 0; index < length; index += 1){
        const valueA = vectorA[index];
        const valueB = vectorB[index];
        if(Number.isFinite(valueA) && Number.isFinite(valueB)){
          centroid[index] = ((valueA * sizeA) + (valueB * sizeB)) / (sizeA + sizeB);
        }else{
          centroid[index] = Number.isFinite(valueA) ? valueA : valueB;
        }
      }
      return centroid;
    };

    while(activeCount > 1){
      if(!chain.length){
        chain.push(firstActive());
      }
      const current = chain[chain.length - 1];
      const nearest = nearestActive(current);
      if(nearest.slot < 0){ break; }
      if(chain.length < 2 || nearest.slot !== chain[chain.length - 2]){
        chain.push(nearest.slot);
        continue;
      }

      const slotA = chain[chain.length - 2];
      const slotB = chain[chain.length - 1];
      const keep = Math.min(slotA, slotB);
      const drop = Math.max(slotA, slotB);
      const nodeA = nodes[slotA];
      const nodeB = nodes[slotB];
      const left = nodeA.minIndex <= nodeB.minIndex ? nodeA : nodeB;
      const right = left === nodeA ? nodeB : nodeA;
      const sizeA = sizes[slotA];
      const sizeB = sizes[slotB];
      const mergeDistance = Number.isFinite(nearest.distance) ? nearest.distance : 1;
      const centroid = mergeCentroids(slotA, slotB, sizeA, sizeB);
      const merged = {
        left,
        right,
        distance: mergeDistance,
        minIndex: Math.min(nodeA.minIndex, nodeB.minIndex),
        size: sizeA + sizeB
      };

      for(let other = 0; other < countItems; other += 1){
        if(!active[other] || other === slotA || other === slotB){ continue; }
        const distanceA = readBaseDistance(slotA, other);
        const distanceB = readBaseDistance(slotB, other);
        let nextDistance;
        if(linkage === 'single'){
          nextDistance = Math.min(distanceA, distanceB);
        }else if(linkage === 'complete'){
          nextDistance = Math.max(distanceA, distanceB);
        }else if(linkage === 'centroid'){
          nextDistance = distanceBetweenVectors(centroid, centroids[other] || [], effectiveMetric).distance;
        }else{
          nextDistance = ((sizeA * distanceA) + (sizeB * distanceB)) / (sizeA + sizeB);
        }
        writeBaseDistance(keep, other, Number.isFinite(nextDistance) ? nextDistance : 1);
      }

      nodes[keep] = merged;
      centroids[keep] = centroid;
      sizes[keep] = sizeA + sizeB;
      active[drop] = 0;
      nodes[drop] = null;
      centroids[drop] = null;
      sizes[drop] = 0;
      activeCount -= 1;
      steps.push({ left: [left.minIndex], right: [right.minIndex], distance: mergeDistance });
      maxDistance = Math.max(maxDistance, mergeDistance);
      chain.length = 0;
    }

    const rootSlot = firstActive();
    const root = rootSlot >= 0 ? nodes[rootSlot] : null;
    if(!root){
      return {
        order: clusters.map(cluster => cluster.minIndex),
        tree: null,
        steps,
        maxDistance,
        baseDistances: { size: countItems, values: [] }
      };
    }
    const order = flattenTree(root);
    return {
      order,
      tree: root,
      steps,
      maxDistance,
      algorithm: 'nearest-neighbor-chain',
      baseDistances: { size: countItems, values: [] }
    };
  }

  function parseNumber(value){
    if(typeof value === 'number'){
      return Number.isFinite(value) ? value : NaN;
    }
    if(value == null){ return NaN; }
    const text = String(value).trim();
    if(!text){ return NaN; }
    const numeric = Number(text.replace(/,/g, ''));
    return Number.isFinite(numeric) ? numeric : NaN;
  }

  function normalizeMode(value){
    const mode = String(value || '').trim().toLowerCase();
    return mode === 'mean' || mode === 'median' ? mode : null;
  }

  function median(values){
    const finite = [];
    for(let index = 0; index < values.length; index += 1){
      if(Number.isFinite(values[index])){ finite.push(values[index]); }
    }
    if(!finite.length){ return NaN; }
    finite.sort((left, right) => left - right);
    const middle = Math.floor(finite.length / 2);
    return finite.length % 2
      ? finite[middle]
      : (finite[middle - 1] + finite[middle]) / 2;
  }

  function parseTransformInput(data){
    if(!Array.isArray(data) || data.length < 2){ return null; }
    const header = Array.isArray(data[0]) ? data[0] : [];
    if(!header.length){ return null; }
    let hasLabelColumn = false;
    for(let rowIndex = 1; rowIndex < data.length; rowIndex += 1){
      const row = Array.isArray(data[rowIndex]) ? data[rowIndex] : [];
      const cell = row[0];
      if(cell != null && String(cell).trim() && !Number.isFinite(parseNumber(cell))){
        hasLabelColumn = true;
        break;
      }
    }
    const startColumn = hasLabelColumn ? 1 : 0;
    if(header.length <= startColumn){ return null; }
    const columnLabels = [];
    for(let column = startColumn; column < header.length; column += 1){
      const raw = header[column];
      columnLabels.push(raw != null && String(raw).trim() ? String(raw).trim() : `Column ${column - startColumn + 1}`);
    }
    const matrix = [];
    const rowLabels = [];
    let skippedRows = 0;
    for(let rowIndex = 1; rowIndex < data.length; rowIndex += 1){
      const source = Array.isArray(data[rowIndex]) ? data[rowIndex] : [];
      const row = new Array(columnLabels.length);
      let hasNumeric = false;
      for(let column = 0; column < columnLabels.length; column += 1){
        const value = parseNumber(source[column + startColumn]);
        row[column] = value;
        hasNumeric = hasNumeric || Number.isFinite(value);
      }
      if(!hasNumeric){
        skippedRows += 1;
        continue;
      }
      const rawLabel = hasLabelColumn ? source[0] : null;
      rowLabels.push(rawLabel != null && String(rawLabel).trim() ? String(rawLabel).trim() : `Row ${rowLabels.length + 1}`);
      matrix.push(row);
    }
    if(!matrix.length){ return null; }
    return {
      matrix,
      rowLabels,
      columnLabels,
      rowHeaderLabel: hasLabelColumn && header[0] != null && String(header[0]).trim()
        ? String(header[0]).trim()
        : 'Row',
      skippedRows
    };
  }

  function pruneColumns(matrix, columnLabels){
    const columnCount = columnLabels.length;
    const keep = new Uint8Array(columnCount);
    let keptCount = 0;
    for(let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1){
      const row = matrix[rowIndex];
      for(let column = 0; column < columnCount; column += 1){
        if(!keep[column] && Number.isFinite(row[column])){
          keep[column] = 1;
          keptCount += 1;
        }
      }
      if(keptCount === columnCount){ break; }
    }
    if(keptCount === columnCount){
      return { matrix, columnLabels, removed: 0 };
    }
    const labels = [];
    for(let column = 0; column < columnCount; column += 1){
      if(keep[column]){ labels.push(columnLabels[column]); }
    }
    const nextMatrix = matrix.map(row => {
      const next = new Array(keptCount);
      let target = 0;
      for(let column = 0; column < columnCount; column += 1){
        if(keep[column]){ next[target++] = row[column]; }
      }
      return next;
    });
    return { matrix: nextMatrix, columnLabels: labels, removed: columnCount - keptCount };
  }

  function transformRows(parsed, settings){
    const filters = settings?.filters || {};
    const adjust = settings?.adjust || {};
    const logTransform = !!adjust.logTransform;
    const logPlusOne = !!adjust.logPlusOne;
    const presentThreshold = Number(filters.presentThreshold);
    const sdThreshold = Number(filters.sdThreshold);
    const absValue = Number(filters.absValue);
    const absCount = Number(filters.absCount);
    const rangeThreshold = Number(filters.rangeThreshold);
    const matrix = [];
    const rowLabels = [];
    let filteredRows = 0;
    let logApplied = 0;

    for(let rowIndex = 0; rowIndex < parsed.matrix.length; rowIndex += 1){
      const source = parsed.matrix[rowIndex];
      const row = new Array(source.length);
      let count = 0;
      let sum = 0;
      let sumSq = 0;
      let min = Infinity;
      let max = -Infinity;
      let absoluteMatches = 0;
      for(let column = 0; column < source.length; column += 1){
        let value = source[column];
        if(Number.isFinite(value) && logTransform){
          value = logPlusOne && value >= 0
            ? Math.log2(value + 1)
            : (!logPlusOne && value > 0 ? Math.log2(value) : NaN);
          if(Number.isFinite(value)){ logApplied += 1; }
        }
        row[column] = value;
        if(!Number.isFinite(value)){ continue; }
        count += 1;
        sum += value;
        sumSq += value * value;
        if(value < min){ min = value; }
        if(value > max){ max = value; }
        if(Number.isFinite(absValue) && Math.abs(value) >= absValue){ absoluteMatches += 1; }
      }
      const percentPresent = source.length ? (count / source.length) * 100 : 0;
      const variance = count > 1 ? (sumSq - ((sum * sum) / count)) / (count - 1) : NaN;
      const standardDeviation = Number.isFinite(variance) ? Math.sqrt(Math.max(variance, 0)) : NaN;
      const passes = (!filters.presentEnabled || !Number.isFinite(presentThreshold) || percentPresent >= presentThreshold)
        && (!filters.sdEnabled || !Number.isFinite(sdThreshold) || (Number.isFinite(standardDeviation) && standardDeviation >= sdThreshold))
        && (!filters.absEnabled || !Number.isFinite(absValue) || !Number.isFinite(absCount) || absoluteMatches >= absCount)
        && (!filters.rangeEnabled || !Number.isFinite(rangeThreshold) || (count > 0 && max - min >= rangeThreshold));
      if(!passes){
        filteredRows += 1;
        continue;
      }
      matrix.push(row);
      rowLabels.push(parsed.rowLabels[rowIndex]);
    }
    return { matrix, rowLabels, filteredRows, logApplied };
  }

  function adjustMatrix(matrix, adjust){
    const rowMode = normalizeMode(adjust?.centerRowsMode ?? adjust?.centerRows);
    const columnMode = normalizeMode(adjust?.centerColumnsMode ?? adjust?.centerColumns);
    const normalizeRows = !!adjust?.normalizeRows;
    const normalizeColumns = !!adjust?.normalizeColumns;
    const rowCount = matrix.length;
    const columnCount = matrix[0]?.length || 0;

    for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
      const row = matrix[rowIndex];
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for(let column = 0; column < columnCount; column += 1){
        const value = row[column];
        if(Number.isFinite(value)){
          sum += value;
          sumSq += value * value;
          count += 1;
        }
      }
      const mean = count ? sum / count : NaN;
      const center = rowMode === 'median' ? median(row) : mean;
      if(rowMode && Number.isFinite(center) && center !== 0){
        for(let column = 0; column < columnCount; column += 1){
          if(Number.isFinite(row[column])){ row[column] -= center; }
        }
      }
      if(normalizeRows && count > 1){
        if(rowMode && Number.isFinite(center) && center !== 0){
          sum = 0;
          sumSq = 0;
          for(let column = 0; column < columnCount; column += 1){
            const value = row[column];
            if(Number.isFinite(value)){
              sum += value;
              sumSq += value * value;
            }
          }
        }
        const normalizedMean = sum / count;
        const variance = (sumSq - ((sum * sum) / count)) / (count - 1);
        const standardDeviation = Math.sqrt(Math.max(variance, 0));
        if(Number.isFinite(standardDeviation) && standardDeviation !== 0){
          for(let column = 0; column < columnCount; column += 1){
            if(Number.isFinite(row[column])){ row[column] = (row[column] - normalizedMean) / standardDeviation; }
          }
        }
      }
    }

    for(let column = 0; column < columnCount; column += 1){
      const values = columnMode === 'median' ? new Array(rowCount) : null;
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
        const value = matrix[rowIndex][column];
        if(values){ values[rowIndex] = value; }
        if(Number.isFinite(value)){
          sum += value;
          sumSq += value * value;
          count += 1;
        }
      }
      const mean = count ? sum / count : NaN;
      const center = columnMode === 'median' ? median(values) : mean;
      if(columnMode && Number.isFinite(center) && center !== 0){
        for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
          if(Number.isFinite(matrix[rowIndex][column])){ matrix[rowIndex][column] -= center; }
        }
      }
      if(normalizeColumns && count > 1){
        if(columnMode && Number.isFinite(center) && center !== 0){
          sum = 0;
          sumSq = 0;
          for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
            const value = matrix[rowIndex][column];
            if(Number.isFinite(value)){
              sum += value;
              sumSq += value * value;
            }
          }
        }
        const normalizedMean = sum / count;
        const variance = (sumSq - ((sum * sum) / count)) / (count - 1);
        const standardDeviation = Math.sqrt(Math.max(variance, 0));
        if(Number.isFinite(standardDeviation) && standardDeviation !== 0){
          for(let rowIndex = 0; rowIndex < rowCount; rowIndex += 1){
            const value = matrix[rowIndex][column];
            if(Number.isFinite(value)){ matrix[rowIndex][column] = (value - normalizedMean) / standardDeviation; }
          }
        }
      }
    }
  }

  function materializeDataTransform(payload){
    const parsed = parseTransformInput(payload?.data);
    if(!parsed){ return { ok: false, reason: 'no-data' }; }
    const initialColumns = parsed.columnLabels.length;
    const initialPruned = pruneColumns(parsed.matrix, parsed.columnLabels);
    parsed.matrix = initialPruned.matrix;
    parsed.columnLabels = initialPruned.columnLabels;
    if(!parsed.columnLabels.length){ return { ok: false, reason: 'no-data' }; }
    const transformed = transformRows(parsed, payload?.settings || {});
    if(!transformed.matrix.length){ return { ok: false, reason: 'filtered-out' }; }
    let pruned = pruneColumns(transformed.matrix, parsed.columnLabels);
    if(!pruned.matrix.length || !pruned.columnLabels.length){
      return { ok: false, reason: 'adjustment-empty' };
    }
    adjustMatrix(pruned.matrix, payload?.settings?.adjust || {});
    pruned = pruneColumns(pruned.matrix, pruned.columnLabels);
    if(!pruned.columnLabels.length){ return { ok: false, reason: 'adjustment-empty' }; }
    let finiteCount = 0;
    for(let rowIndex = 0; rowIndex < pruned.matrix.length; rowIndex += 1){
      for(let column = 0; column < pruned.matrix[rowIndex].length; column += 1){
        if(Number.isFinite(pruned.matrix[rowIndex][column])){ finiteCount += 1; }
      }
    }
    const data = [[parsed.rowHeaderLabel, ...pruned.columnLabels]];
    for(let rowIndex = 0; rowIndex < pruned.matrix.length; rowIndex += 1){
      data.push([
        transformed.rowLabels[rowIndex],
        ...pruned.matrix[rowIndex].map(value => Number.isFinite(value) ? value : '')
      ]);
    }
    return {
      ok: true,
      data,
      summary: {
        rows: pruned.matrix.length,
        cols: pruned.columnLabels.length,
        finiteCount,
        rowsFiltered: transformed.filteredRows,
        columnsRemoved: initialColumns - pruned.columnLabels.length,
        skippedRows: parsed.skippedRows,
        logApplied: transformed.logApplied
      }
    };
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
      if(action === 'materializeDataTransform'){
        const result = materializeDataTransform(data.payload || {});
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
