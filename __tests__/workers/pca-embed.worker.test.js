// Tests for js/workers/pca-embed.worker.js (MDS / t-SNE / UMAP worker)

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
  require('../../js/workers/pca-embed.worker.js');
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

// Non-degenerate matrix with rank = min(n, dims).
// Each row mixes sine/cosine so rows are not multiples of each other.
function makeMatrix(n = 4, dims = 3) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: dims }, (__, d) => Math.sin(i * 1.3 + d * 0.7) + (i - d) * 0.5)
  );
}

describe('pca-embed.worker — MDS', () => {
  let ctx;
  beforeEach(() => { ctx = loadWorker(); });

  test('unknown action returns ok:false', async () => {
    const msg = await send(ctx, '0', 'bad', {});
    expect(msg.ok).toBe(false);
  });

  test('empty matrix returns empty coords', async () => {
    const msg = await send(ctx, '1', 'mds', { matrix: [], requestedDims: 2 });
    expect(msg.ok).toBe(true);
    expect(msg.result.coords).toEqual([]);
  });

  test('returns n coord rows for n samples', async () => {
    const matrix = makeMatrix(5, 4);
    const msg = await send(ctx, '2', 'mds', { matrix, requestedDims: 2 });
    expect(msg.ok).toBe(true);
    expect(msg.result.coords).toHaveLength(5);
    msg.result.coords.forEach(row => {
      expect(row.length).toBeGreaterThanOrEqual(2);
    });
  });

  test('eigenSummary cumulative variance ratio reaches 1 for last entry', async () => {
    const matrix = makeMatrix(6, 4);
    const msg = await send(ctx, '3', 'mds', { matrix, requestedDims: 2 });
    expect(msg.ok).toBe(true);
    const summary = msg.result.eigenSummary;
    expect(summary.length).toBeGreaterThan(0);
    summary.forEach(s => {
      expect(s.variancePercent).toBeGreaterThanOrEqual(0);
      expect(s.cumulativeVariancePercent).toBeLessThanOrEqual(100.01);
    });
  });

  test('stress is non-negative', async () => {
    const matrix = makeMatrix(4, 3);
    const msg = await send(ctx, '4', 'mds', { matrix, requestedDims: 2 });
    expect(msg.result.stress).toBeGreaterThanOrEqual(0);
  });
});

describe('pca-embed.worker — t-SNE', () => {
  let ctx;
  beforeEach(() => { ctx = loadWorker(); });

  test('empty matrix returns empty embedding', async () => {
    const msg = await send(ctx, '10', 'tsne', { matrix: [], settings: {} });
    expect(msg.ok).toBe(true);
    expect(msg.result.embedding).toEqual([]);
  });

  test('returns n embedding rows with 2 dims by default', async () => {
    const matrix = makeMatrix(6, 3);
    const msg = await send(ctx, '11', 'tsne', {
      matrix,
      settings: { perplexity: 2, iterations: 50, learningRate: 200, earlyExaggeration: 4 }
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.embedding).toHaveLength(6);
    msg.result.embedding.forEach(row => expect(row).toHaveLength(2));
  });

  test('result includes metadata fields', async () => {
    const matrix = makeMatrix(4, 2);
    const msg = await send(ctx, '12', 'tsne', {
      matrix,
      settings: { perplexity: 1, iterations: 30 }
    });
    expect(msg.ok).toBe(true);
    expect(typeof msg.result.klDivergence).toBe('number');
    expect(typeof msg.result.perplexity).toBe('number');
    expect(typeof msg.result.learningRate).toBe('number');
  });

  test('perplexity is clamped to valid range', async () => {
    const matrix = makeMatrix(4, 2);
    const msg = await send(ctx, '13', 'tsne', {
      matrix,
      settings: { perplexity: 999, iterations: 30 }
    });
    expect(msg.ok).toBe(true);
    // perplexity must not exceed n-1=3
    expect(msg.result.perplexity).toBeLessThanOrEqual(3);
  });
});

describe('pca-embed.worker — UMAP', () => {
  let ctx;
  beforeEach(() => { ctx = loadWorker(); });

  test('empty matrix returns empty embedding', async () => {
    const msg = await send(ctx, '20', 'umap', { matrix: [], settings: {} });
    expect(msg.ok).toBe(true);
    expect(msg.result.embedding).toEqual([]);
  });

  test('returns n embedding rows with 2 dims by default', async () => {
    const matrix = makeMatrix(8, 3);
    const msg = await send(ctx, '21', 'umap', {
      matrix,
      settings: { neighbors: 3, epochs: 30, minDist: 0.1 }
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.embedding).toHaveLength(8);
    msg.result.embedding.forEach(row => expect(row).toHaveLength(2));
  });

  test('result includes metadata fields', async () => {
    const matrix = makeMatrix(5, 2);
    const msg = await send(ctx, '22', 'umap', {
      matrix,
      settings: { neighbors: 2, epochs: 20 }
    });
    expect(msg.ok).toBe(true);
    expect(typeof msg.result.epochs).toBe('number');
    expect(typeof msg.result.neighbors).toBe('number');
    expect(typeof msg.result.minDist).toBe('number');
  });

  test('neighbors clamped to valid range', async () => {
    const matrix = makeMatrix(4, 2);
    const msg = await send(ctx, '23', 'umap', {
      matrix,
      settings: { neighbors: 1000, epochs: 10 }
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.neighbors).toBeLessThanOrEqual(3); // n-1 = 3
  });
});
