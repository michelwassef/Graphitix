function loadWorker() {
  const ctx = { onmessage: null, postMessage: jest.fn(), importScripts: jest.fn() };
  ctx.Shared = {};
  const savedSelf = global.self;
  global.self = ctx;
  jest.resetModules();
  require('../../js/workers/box.worker.js');
  global.self = savedSelf;
  return ctx;
}

function send(ctx, id, action, payload) {
  return new Promise(resolve => {
    const orig = ctx.postMessage;
    ctx.postMessage = jest.fn(msg => { ctx.postMessage = orig; resolve(msg); });
    ctx.onmessage({ data: { id, action, payload } });
  });
}

function makeSwarmPoints(coords) {
  return coords.map((coord, index) => ({ index, coord, raw: coord }));
}

describe('box.worker — unknown action', () => {
  test('responds with ok=false and error text', async () => {
    const ctx = loadWorker();
    const msg = await send(ctx, 'x1', 'noop', {});
    expect(msg.ok).toBe(false);
    expect(typeof msg.error).toBe('string');
  });
});

describe('box.worker — box-swarm action', () => {
  let ctx;
  beforeEach(() => { ctx = loadWorker(); });

  test('empty array returns zero-length offsets', async () => {
    const msg = await send(ctx, 's0', 'box-swarm', { points: [], options: { pointRadius: 5 } });
    expect(msg.ok).toBe(true);
    expect(msg.result.offsets).toHaveLength(0);
    expect(msg.result.maxOffsetUsed).toBe(0);
  });

  test('n-point array returns n offsets, all finite', async () => {
    const points = makeSwarmPoints([1, 2, 3, 4, 5]);
    const msg = await send(ctx, 's1', 'box-swarm', { points, options: { pointRadius: 4, axisSpacing: 40 } });
    expect(msg.ok).toBe(true);
    expect(msg.result.offsets).toHaveLength(5);
    msg.result.offsets.forEach(o => expect(Number.isFinite(o)).toBe(true));
  });

  test('identical-coord points still return n offsets', async () => {
    const points = makeSwarmPoints([5, 5, 5, 5]);
    const msg = await send(ctx, 's2', 'box-swarm', { points, options: { pointRadius: 3 } });
    expect(msg.ok).toBe(true);
    expect(msg.result.offsets).toHaveLength(4);
  });

  test('maxOffsetUsed is non-negative', async () => {
    const points = makeSwarmPoints([1, 1.01, 3, 3.01, 5]);
    const msg = await send(ctx, 's3', 'box-swarm', { points, options: { pointRadius: 5, axisSpacing: 60 } });
    expect(msg.ok).toBe(true);
    expect(msg.result.maxOffsetUsed).toBeGreaterThanOrEqual(0);
  });

  test('horizontal orientation does not throw', async () => {
    const points = makeSwarmPoints([10, 20, 30]);
    const msg = await send(ctx, 's4', 'box-swarm', {
      points,
      options: { pointRadius: 4, orientation: 'horizontal' }
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.offsets).toHaveLength(3);
  });
});

describe('box.worker — box-swarm geometry invariants', () => {
  let ctx;
  beforeEach(() => { ctx = loadWorker(); });

  test('single point has offset 0 (no neighbours to dodge)', async () => {
    const points = makeSwarmPoints([5]);
    const msg = await send(ctx, 'g0', 'box-swarm', { points, options: { pointRadius: 5 } });
    expect(msg.ok).toBe(true);
    expect(msg.result.offsets[0]).toBe(0);
  });

  test('widely separated points have smaller offsets than closely packed ones', async () => {
    const sparse = makeSwarmPoints([1, 100, 200]);
    const dense  = makeSwarmPoints([1, 1.01, 1.02]);
    const [msgSparse, msgDense] = await Promise.all([
      send(ctx, 'g1', 'box-swarm', { points: sparse, options: { pointRadius: 6 } }),
      send(ctx, 'g2', 'box-swarm', { points: dense,  options: { pointRadius: 6 } })
    ]);
    const maxSparse = Math.max(...msgSparse.result.offsets.map(Math.abs));
    const maxDense  = Math.max(...msgDense.result.offsets.map(Math.abs));
    expect(maxSparse).toBeLessThanOrEqual(maxDense + 0.01);
  });

  test('larger pointRadius produces larger or equal maxOffsetUsed', async () => {
    const points = makeSwarmPoints([1, 1.5, 2, 2.5, 3]);
    const [small, large] = await Promise.all([
      send(ctx, 'g3', 'box-swarm', { points, options: { pointRadius: 3 } }),
      send(ctx, 'g4', 'box-swarm', { points, options: { pointRadius: 8 } })
    ]);
    expect(small.result.maxOffsetUsed).toBeLessThanOrEqual(large.result.maxOffsetUsed + 0.01);
  });

  test('offsets array length always equals input points length', async () => {
    for (const n of [1, 3, 7, 12]) {
      const points = makeSwarmPoints(Array.from({ length: n }, (_, i) => i * 0.5));
      const msg = await send(ctx, `g5_${n}`, 'box-swarm', { points, options: { pointRadius: 4 } });
      expect(msg.result.offsets).toHaveLength(n);
    }
  });
});

describe('box.worker — box-stats action', () => {
  let ctx;

  beforeEach(() => {
    ctx = loadWorker();
    ctx.jStat = require('jstat');
    ctx.Shared.stats = {
      adjustPValues: (values) => values.map(v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1)))
    };
  });

  test('empty selection returns ok=true with guidance message', async () => {
    const msg = await send(ctx, 'b0', 'box-stats', { selection: [] });
    expect(msg.ok).toBe(true);
    expect(typeof msg.result.message).toBe('string');
    expect(msg.result.message.length).toBeGreaterThan(0);
  });

  test('single-group selection returns guidance message (not enough groups)', async () => {
    const payload = {
      statsTest: 'parametric',
      selection: [{ index: 0, label: 'A', values: [1, 2, 3, 4, 5] }]
    };
    const msg = await send(ctx, 'b1', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.message).toMatch(/at least two/i);
  });

  test('two parametric groups → ok, groupCount=2, tables present', async () => {
    const payload = {
      statsTest: 'parametric',
      selection: [
        { index: 0, label: 'A', values: [1, 2, 3, 4, 5] },
        { index: 1, label: 'B', values: [6, 7, 8, 9, 10] }
      ]
    };
    const msg = await send(ctx, 'b2', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.mode).toBe('single');
    expect(msg.result.groupCount).toBe(2);
    expect(Array.isArray(msg.result.tables)).toBe(true);
  });

  test('two nonparametric groups → ok, uses nonparametric path', async () => {
    const payload = {
      statsTest: 'nonparametric',
      selection: [
        { index: 0, label: 'X', values: [1, 2, 3, 4, 5] },
        { index: 1, label: 'Y', values: [6, 7, 8, 9, 10] }
      ]
    };
    const msg = await send(ctx, 'b3', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.parametricVariant).toBe('nonparametric');
  });

  test('three groups → ok, groupCount=3', async () => {
    const payload = {
      statsTest: 'parametric',
      selection: [
        { index: 0, label: 'A', values: [1, 2, 3] },
        { index: 1, label: 'B', values: [4, 5, 6] },
        { index: 2, label: 'C', values: [7, 8, 9] }
      ]
    };
    const msg = await send(ctx, 'b4', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.groupCount).toBe(3);
  });

  test('paired groups of equal size → ok', async () => {
    const payload = {
      statsTest: 'parametric',
      statsPaired: true,
      selection: [
        { index: 0, label: 'Pre', values: [10, 12, 14, 16] },
        { index: 1, label: 'Post', values: [11, 13, 15, 17] }
      ]
    };
    const msg = await send(ctx, 'b5', 'box-stats', payload);
    expect(msg.ok).toBe(true);
  });

  test('paired groups of unequal size → message about equal sizes', async () => {
    const payload = {
      statsTest: 'parametric',
      statsPaired: true,
      selection: [
        { index: 0, label: 'A', values: [1, 2, 3] },
        { index: 1, label: 'B', values: [4, 5] }
      ]
    };
    const msg = await send(ctx, 'b6', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.message).toMatch(/equal/i);
  });

  test('one-sample mode with a single group → ok, no group-size error', async () => {
    const payload = {
      statsTest: 'parametric',
      statsMode: 'oneSample',
      selection: [{ index: 0, label: 'Group', values: [5, 6, 7, 8, 9, 10] }]
    };
    const msg = await send(ctx, 'b7', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.message).toBeNull();
  });

  test('assumptionDiagnostics is populated for two groups', async () => {
    const payload = {
      statsTest: 'parametric',
      selection: [
        { index: 0, label: 'A', values: [1, 2, 3, 4, 5, 6] },
        { index: 1, label: 'B', values: [7, 8, 9, 10, 11, 12] }
      ]
    };
    const msg = await send(ctx, 'b8', 'box-stats', payload);
    expect(msg.ok).toBe(true);
    expect(msg.result.assumptionDiagnostics).not.toBeNull();
  });
});
