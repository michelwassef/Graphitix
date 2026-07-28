// Tests for js/workers/heatmap.worker.js
// Strategy: provide a fake `self` with postMessage before loading, so the IIFE
// binds onmessage to our fake context. Then drive tests through onmessage calls.

function loadWorker() {
  const ctx = {
    onmessage: null,
    postMessage: jest.fn()
  };
  const savedSelf = global.self;
  global.self = ctx;
  jest.resetModules();
  require('../../js/workers/heatmap.worker.js');
  global.self = savedSelf;
  return ctx;
}

function send(ctx, id, action, payload) {
  return new Promise(resolve => {
    const original = ctx.postMessage;
    ctx.postMessage = jest.fn(msg => {
      ctx.postMessage = original;
      resolve(msg);
    });
    ctx.onmessage({ data: { id, action, payload } });
  });
}

function pearsonDistance(first, second) {
  const pairs = first.map((value, index) => [value, second[index]])
    .filter(([left, right]) => Number.isFinite(left) && Number.isFinite(right));
  if (pairs.length < 2) return 1;
  const meanLeft = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const meanRight = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let numerator = 0;
  let leftSquares = 0;
  let rightSquares = 0;
  pairs.forEach(([left, right]) => {
    const centeredLeft = left - meanLeft;
    const centeredRight = right - meanRight;
    numerator += centeredLeft * centeredRight;
    leftSquares += centeredLeft * centeredLeft;
    rightSquares += centeredRight * centeredRight;
  });
  const denominator = Math.sqrt(leftSquares * rightSquares);
  return denominator ? 1 - (numerator / denominator) : 1;
}

function referenceAverageMergeDistances(items) {
  const clusters = items.map((_, index) => [index]);
  const distances = [];
  while (clusters.length > 1) {
    let best = { first: 0, second: 1, distance: Infinity };
    for (let first = 0; first < clusters.length; first += 1) {
      for (let second = first + 1; second < clusters.length; second += 1) {
        let sum = 0;
        let count = 0;
        clusters[first].forEach(left => clusters[second].forEach(right => {
          sum += pearsonDistance(items[left].vector, items[right].vector);
          count += 1;
        }));
        const distance = sum / count;
        if (distance < best.distance) best = { first, second, distance };
      }
    }
    distances.push(best.distance);
    clusters[best.first] = clusters[best.first].concat(clusters[best.second]);
    clusters.splice(best.second, 1);
  }
  return distances.sort((left, right) => left - right);
}

describe('heatmap.worker — hierarchicalCluster', () => {
  let ctx;

  beforeEach(() => {
    ctx = loadWorker();
  });

  test('unknown action returns ok:false', async () => {
    const msg = await send(ctx, '1', 'badAction', {});
    expect(msg.ok).toBe(false);
    expect(typeof msg.error).toBe('string');
  });

  test('empty items returns empty order and null tree', async () => {
    const msg = await send(ctx, '2', 'hierarchicalCluster', { items: [], metric: 'pearson', linkage: 'average' });
    expect(msg.ok).toBe(true);
    expect(msg.result.order).toEqual([]);
    expect(msg.result.tree).toBeNull();
  });

  test('single item returns trivial result', async () => {
    const msg = await send(ctx, '3', 'hierarchicalCluster', {
      items: [{ index: 0, vector: [1, 2, 3] }],
      metric: 'pearson',
      linkage: 'average'
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.order).toEqual([0]);
  });

  test('two items produces one merge step', async () => {
    const msg = await send(ctx, '4', 'hierarchicalCluster', {
      items: [
        { index: 0, vector: [1, 2, 3] },
        { index: 1, vector: [4, 5, 6] }
      ],
      metric: 'pearson',
      linkage: 'average'
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.order).toHaveLength(2);
    expect(msg.result.steps).toHaveLength(1);
    expect(Number.isFinite(msg.result.maxDistance)).toBe(true);
  });

  test('pearson correlation — perfectly correlated vectors get distance ~0', async () => {
    const msg = await send(ctx, '5', 'hierarchicalCluster', {
      items: [
        { index: 0, vector: [1, 2, 3, 4] },
        { index: 1, vector: [2, 4, 6, 8] }   // scale of first — r = 1
      ],
      metric: 'pearson',
      linkage: 'average'
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.maxDistance).toBeCloseTo(0, 5);
  });

  test('euclidean metric clusters correctly for 3 items', async () => {
    // Items A,B are close; C is far. Expected merge order: A+B first, then +C.
    const msg = await send(ctx, '6', 'hierarchicalCluster', {
      items: [
        { index: 0, vector: [0, 0] },
        { index: 1, vector: [0.1, 0.1] },
        { index: 2, vector: [100, 100] }
      ],
      metric: 'euclidean',
      linkage: 'average'
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.steps).toHaveLength(2);
    // First merge distance must be much smaller than second
    const [step1, step2] = msg.result.steps;
    expect(step1.distance).toBeLessThan(step2.distance);
  });

  test('spearman metric supported', async () => {
    const msg = await send(ctx, '7', 'hierarchicalCluster', {
      items: [
        { index: 0, vector: [1, 5, 3] },
        { index: 1, vector: [2, 6, 4] }
      ],
      metric: 'spearman',
      linkage: 'single'
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.order).toHaveLength(2);
  });

  test('complete linkage works', async () => {
    const msg = await send(ctx, '8', 'hierarchicalCluster', {
      items: [
        { index: 0, vector: [1, 2] },
        { index: 1, vector: [1.5, 2.5] },
        { index: 2, vector: [10, 10] }
      ],
      metric: 'euclidean',
      linkage: 'complete'
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.steps).toHaveLength(2);
  });

  test('centroid linkage works', async () => {
    const msg = await send(ctx, '9', 'hierarchicalCluster', {
      items: [
        { index: 0, vector: [0, 0] },
        { index: 1, vector: [1, 1] },
        { index: 2, vector: [5, 5] }
      ],
      metric: 'euclidean',
      linkage: 'centroid'
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.steps).toHaveLength(2);
  });

  test('tree root indices cover all items', async () => {
    const n = 5;
    const items = Array.from({ length: n }, (_, i) => ({
      index: i,
      vector: [Math.sin(i), Math.cos(i), i * 0.3]
    }));
    const msg = await send(ctx, '10', 'hierarchicalCluster', { items, metric: 'pearson', linkage: 'average' });
    expect(msg.ok).toBe(true);
    const order = msg.result.order;
    expect(order).toHaveLength(n);
    expect(new Set(order).size).toBe(n);
  });

  test('uncentered metric does not throw', async () => {
    const msg = await send(ctx, '11', 'hierarchicalCluster', {
      items: [
        { index: 0, vector: [1, 2, 3] },
        { index: 1, vector: [2, 3, 4] }
      ],
      metric: 'uncentered',
      linkage: 'average'
    });
    expect(msg.ok).toBe(true);
  });

  test('vectors with NaN/Inf values are skipped gracefully', async () => {
    const msg = await send(ctx, '12', 'hierarchicalCluster', {
      items: [
        { index: 0, vector: [1, NaN, 3] },
        { index: 1, vector: [2, 3, Infinity] }
      ],
      metric: 'pearson',
      linkage: 'average'
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.order).toHaveLength(2);
  });

  test('large two-value Pearson clustering remains exact without the quadratic heap', async () => {
    const items = Array.from({ length: 7358 }, (_, index) => ({
      index,
      vector: index % 3 === 0 ? [1, 2] : (index % 3 === 1 ? [2, 1] : [1, 1])
    }));
    const msg = await send(ctx, '13', 'hierarchicalCluster', {
      items,
      metric: 'pearson',
      linkage: 'average'
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.algorithm).toBe('two-point-correlation');
    expect(msg.result.order).toHaveLength(items.length);
    expect(new Set(msg.result.order).size).toBe(items.length);
    expect(msg.result.steps).toHaveLength(items.length - 1);
    expect(msg.result.maxDistance).toBeCloseTo(7358 / 4905, 5);
  });

  test('average-correlation vector path matches exact average linkage', async () => {
    const items = [
      { index: 0, vector: [1, 2, 4] },
      { index: 1, vector: [2, 4, 8] },
      { index: 2, vector: [4, 3, 1] },
      { index: 3, vector: [3, 7, 2] },
      { index: 4, vector: [1, NaN, NaN] }
    ];
    const msg = await send(ctx, '14', 'hierarchicalCluster', {
      items,
      metric: 'pearson',
      linkage: 'average'
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.algorithm).toBe('average-correlation-vector');
    const expected = referenceAverageMergeDistances(items);
    const actual = msg.result.steps.map(step => step.distance).sort((left, right) => left - right);
    expect(actual).toHaveLength(expected.length);
    actual.forEach((distance, index) => expect(distance).toBeCloseTo(expected[index], 10));
  });

  test('materializes combined row filters and z-score adjustments in one task', async () => {
    const msg = await send(ctx, '15', 'materializeDataTransform', {
      data: [
        ['Gene', 'A', 'B', 'C'],
        ['keep', 1, 2, 3],
        ['remove', 1, '', '']
      ],
      settings: {
        filters: {
          presentEnabled: true,
          presentThreshold: 80
        },
        adjust: {
          normalizeRows: true
        }
      }
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.ok).toBe(true);
    expect(msg.result.data).toHaveLength(2);
    expect(msg.result.data[1][0]).toBe('keep');
    expect(msg.result.data[1].slice(1)).toEqual([-1, 0, 1]);
    expect(msg.result.summary.rowsFiltered).toBe(1);
    expect(msg.result.summary.finiteCount).toBe(3);
  });

  test('preserves adjustment order when centering and normalizing columns', async () => {
    const msg = await send(ctx, '16', 'materializeDataTransform', {
      data: [
        ['Gene', 'A', 'B'],
        ['one', 1, 10],
        ['two', 3, 14],
        ['three', 5, 18]
      ],
      settings: {
        filters: {},
        adjust: {
          centerColumnsMode: 'median',
          normalizeColumns: true
        }
      }
    });
    expect(msg.result.ok).toBe(true);
    expect(msg.result.data.map(row => row.slice(1))).toEqual([
      ['A', 'B'],
      [-1, -1],
      [0, 0],
      [1, 1]
    ]);
  });
});
