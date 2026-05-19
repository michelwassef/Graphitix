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
});
