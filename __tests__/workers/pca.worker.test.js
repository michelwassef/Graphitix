// Tests for js/workers/pca.worker.js (SVD worker)
// We inject a simple SVD implementation so the worker can run in Node.

const SVDJS = require('svd-js');

function loadWorker() {
  const ctx = {
    onmessage: null,
    postMessage: jest.fn(),
    importScripts: jest.fn(),
    SVDJS
  };
  const savedSelf = global.self;
  global.self = ctx;
  jest.resetModules();
  require('../../js/workers/pca.worker.js');
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

describe('pca.worker — pca-svd', () => {
  let ctx;

  beforeEach(() => { ctx = loadWorker(); });

  test('unknown action returns ok:false', async () => {
    const msg = await send(ctx, '0', 'unknown', {});
    expect(msg.ok).toBe(false);
    expect(typeof msg.error).toBe('string');
  });

  test('returns q, u, v arrays for valid matrix', async () => {
    // 3 samples × 4 features (n < p case)
    const matrix = [
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10, 11, 12]
    ];
    const msg = await send(ctx, '1', 'pca-svd', { matrix, nSamples: 3, nFeatures: 4 });
    expect(msg.ok).toBe(true);
    expect(Array.isArray(msg.result.q)).toBe(true);
    expect(Array.isArray(msg.result.u)).toBe(true);
    expect(Array.isArray(msg.result.v)).toBe(true);
  });

  test('singular values are sorted in descending order', async () => {
    const matrix = [
      [1, 0, 0],
      [0, 2, 0],
      [0, 0, 3]
    ];
    const msg = await send(ctx, '2', 'pca-svd', { matrix, nSamples: 3, nFeatures: 3 });
    expect(msg.ok).toBe(true);
    const q = msg.result.q;
    for (let i = 1; i < q.length; i++) {
      expect(q[i - 1]).toBeGreaterThanOrEqual(q[i]);
    }
  });

  test('n >= p case uses u factor (no transpose)', async () => {
    // 5 samples × 2 features → nSamples > nFeatures → no transpose → useFactor = 'u'
    const matrix = [
      [1, 2], [3, 4], [5, 6], [7, 8], [9, 10]
    ];
    const msg = await send(ctx, '3', 'pca-svd', { matrix, nSamples: 5, nFeatures: 2 });
    expect(msg.ok).toBe(true);
    expect(msg.result.useFactor).toBe('u');
  });

  test('n < p case uses v factor (transposes matrix)', async () => {
    // 2 samples × 5 features → nSamples < nFeatures → transpose → useFactor = 'v'
    const matrix = [
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10]
    ];
    const msg = await send(ctx, '4', 'pca-svd', { matrix, nSamples: 2, nFeatures: 5 });
    expect(msg.ok).toBe(true);
    expect(msg.result.useFactor).toBe('v');
  });

  test('identity matrix singular values are all 1', async () => {
    const I = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const msg = await send(ctx, '5', 'pca-svd', { matrix: I, nSamples: 3, nFeatures: 3 });
    expect(msg.ok).toBe(true);
    msg.result.q.forEach(v => expect(Math.abs(v)).toBeCloseTo(1, 4));
  });

  test('zero matrix does not throw', async () => {
    const Z = [[0, 0], [0, 0], [0, 0]];
    const msg = await send(ctx, '6', 'pca-svd', { matrix: Z, nSamples: 3, nFeatures: 2 });
    expect(msg.ok).toBe(true);
    msg.result.q.forEach(v => expect(Math.abs(v)).toBeCloseTo(0, 4));
  });

  test('result q has expected length (min of dimensions)', async () => {
    // 4 samples × 3 features → at most 3 singular values
    const matrix = [
      [1, 2, 3], [4, 5, 6], [7, 8, 9], [10, 11, 12]
    ];
    const msg = await send(ctx, '7', 'pca-svd', { matrix, nSamples: 4, nFeatures: 3 });
    expect(msg.ok).toBe(true);
    expect(msg.result.q.length).toBeLessThanOrEqual(3);
  });
});
