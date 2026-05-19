// Tests for js/workers/scatter.worker.js
// We provide jStat from the devDependency and a stub regressionTools,
// then drive the worker through its onmessage handler.

const jStat = require('jstat');

function loadWorker() {
  const ctx = {
    onmessage: null,
    postMessage: jest.fn(),
    // suppress importScripts — jStat is injected directly below
    importScripts: jest.fn()
  };
  const savedSelf = global.self;
  global.self = ctx;
  // Pre-inject jStat so ensureJStat() finds it without importScripts
  ctx.jStat = jStat;
  // Minimal regression stub
  ctx.Shared = {
    regressionTools: {
      fitRegression: (points, opts) => {
        if (!points || points.length < 2) return null;
        const n = points.length;
        const xMean = points.reduce((s, p) => s + p.x, 0) / n;
        const yMean = points.reduce((s, p) => s + p.y, 0) / n;
        let num = 0, den = 0;
        points.forEach(p => { const dx = p.x - xMean; num += dx * (p.y - yMean); den += dx * dx; });
        const slope = den !== 0 ? num / den : 0;
        const intercept = yMean - slope * xMean;
        const mode = opts?.mode || 'linear';
        return {
          mode,
          fitMethod: 'ols',
          coefficients: [intercept, slope],
          metrics: { r2: 0.99 },
          residuals: null,
          diagnostics: null,
          coefficientStats: [],
          summary: { slope, intercept, equation: null, parameters: null, primaryParameter: null },
          intervals: null,
          domain: null,
          warnings: [],
          forecast: null,
          fitSpec: {}
        };
      },
      sampleCurve: (model, opts) => {
        const { minX, maxX, sampleCount = 10 } = opts || {};
        if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return [];
        return Array.from({ length: sampleCount }, (_, i) => {
          const x = minX + (maxX - minX) * i / (sampleCount - 1);
          return { x, y: x };
        });
      }
    }
  };

  jest.resetModules();
  require('../../js/workers/scatter.worker.js');
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

describe('scatter.worker — scatter-stats', () => {
  let ctx;

  beforeEach(() => { ctx = loadWorker(); });

  test('unknown action returns ok:false', async () => {
    const msg = await send(ctx, '0', 'unknown', {});
    expect(msg.ok).toBe(false);
  });

  test('fewer than 3 points returns NaN stats', async () => {
    const msg = await send(ctx, '1', 'scatter-stats', {
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
      method: 'pearson'
    });
    expect(msg.ok).toBe(true);
    expect(Number.isNaN(msg.result.r)).toBe(true);
    expect(msg.result.pointCount).toBe(2);
  });

  test('collinear points (r=1) produce p≈0', async () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: 2 * (i + 1) + 1 }));
    const msg = await send(ctx, '2', 'scatter-stats', { points, method: 'pearson' });
    expect(msg.ok).toBe(true);
    expect(msg.result.r).toBeCloseTo(1, 5);
    expect(msg.result.p).toBeLessThan(0.001);
  });

  test('anticorrelated points yield r≈-1', async () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i + 1, y: -(i + 1) }));
    const msg = await send(ctx, '3', 'scatter-stats', { points, method: 'pearson' });
    expect(msg.ok).toBe(true);
    expect(msg.result.r).toBeCloseTo(-1, 5);
  });

  test('spearman method is used when specified', async () => {
    const points = Array.from({ length: 8 }, (_, i) => ({ x: i + 1, y: i * i }));
    const msg = await send(ctx, '4', 'scatter-stats', { points, method: 'spearman' });
    expect(msg.ok).toBe(true);
    expect(msg.result.method).toBe('Spearman');
  });

  test('pearson is the default method', async () => {
    const points = Array.from({ length: 5 }, (_, i) => ({ x: i, y: i * 2 }));
    const msg = await send(ctx, '5', 'scatter-stats', { points });
    expect(msg.result.method).toBe('Pearson');
  });

  test('filters non-finite points before computing', async () => {
    const points = [
      { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 },
      { x: NaN, y: 4 }, { x: 5, y: Infinity }
    ];
    const msg = await send(ctx, '6', 'scatter-stats', { points, method: 'pearson' });
    expect(msg.ok).toBe(true);
    expect(msg.result.pointCount).toBe(3);
  });

  test('r2 is between 0 and 1 for typical data', async () => {
    const points = [
      { x: 1, y: 2.1 }, { x: 2, y: 3.9 }, { x: 3, y: 6.2 },
      { x: 4, y: 7.8 }, { x: 5, y: 10.1 }
    ];
    const msg = await send(ctx, '7', 'scatter-stats', { points });
    expect(msg.result.r2).toBeGreaterThanOrEqual(0);
    expect(msg.result.r2).toBeLessThanOrEqual(1);
  });

  test('correlationCI is returned for valid data', async () => {
    const points = Array.from({ length: 10 }, (_, i) => ({ x: i, y: i * 1.5 + Math.random() * 0.01 }));
    const msg = await send(ctx, '8', 'scatter-stats', { points });
    expect(msg.result.correlationCI).not.toBeNull();
    expect(typeof msg.result.correlationCI.low).toBe('number');
    expect(typeof msg.result.correlationCI.high).toBe('number');
    expect(msg.result.correlationCI.low).toBeLessThan(msg.result.correlationCI.high);
  });

  test('regression result is included when fitRegression succeeds', async () => {
    const points = Array.from({ length: 6 }, (_, i) => ({ x: i + 1, y: 2 * (i + 1) }));
    const msg = await send(ctx, '9', 'scatter-stats', { points });
    expect(msg.result.regression).not.toBeNull();
    expect(typeof msg.result.m).toBe('number');
    expect(typeof msg.result.b).toBe('number');
  });
});

describe('scatter.worker — scatter-render', () => {
  let ctx;

  beforeEach(() => { ctx = loadWorker(); });

  test('returns geometry arrays matching input point count', async () => {
    const points = [{ x: 0.5, y: 0.5 }, { x: 1.5, y: 1.5 }, { x: 2.5, y: 2.5 }];
    const msg = await send(ctx, '10', 'scatter-render', {
      points,
      xScale: { min: 0, max: 3 },
      yScale: { min: 0, max: 3 },
      plotW: 300,
      plotH: 300,
      margin: { left: 50, top: 30 }
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.geometry.xv).toHaveLength(3);
    expect(msg.result.geometry.cx).toHaveLength(3);
    expect(msg.result.geometry.cy).toHaveLength(3);
  });

  test('log scale transforms x/y values', async () => {
    const points = [{ x: 10, y: 100 }];
    const msg = await send(ctx, '11', 'scatter-render', {
      points,
      logX: true,
      logY: true,
      xScale: { min: 0, max: 2 },
      yScale: { min: 0, max: 3 },
      plotW: 200,
      plotH: 200
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.geometry.xv[0]).toBeCloseTo(1, 5);  // log10(10) = 1
    expect(msg.result.geometry.yv[0]).toBeCloseTo(2, 5);  // log10(100) = 2
  });

  test('non-finite points produce NaN canvas coords', async () => {
    const points = [{ x: -1, y: 0 }];   // log10(-1) = NaN
    const msg = await send(ctx, '12', 'scatter-render', {
      points,
      logX: true,
      xScale: { min: 0, max: 1 },
      yScale: { min: 0, max: 1 },
      plotW: 100,
      plotH: 100
    });
    expect(msg.ok).toBe(true);
    expect(Number.isNaN(msg.result.geometry.cx[0])).toBe(true);
  });

  test('density is computed when densityEnabled is true', async () => {
    const points = Array.from({ length: 20 }, (_, i) => ({ x: i * 5, y: i * 5 }));
    const msg = await send(ctx, '13', 'scatter-render', {
      points,
      xScale: { min: 0, max: 100 },
      yScale: { min: 0, max: 100 },
      plotW: 200,
      plotH: 200,
      densityEnabled: true
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.density).not.toBeNull();
    expect(msg.result.density.values).toHaveLength(points.length);
    expect(msg.result.density.max).toBeGreaterThan(0);
  });

  test('density is null when densityEnabled is false', async () => {
    const points = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
    const msg = await send(ctx, '14', 'scatter-render', {
      points,
      xScale: { min: 0, max: 3 },
      yScale: { min: 0, max: 3 },
      plotW: 100,
      plotH: 100
    });
    expect(msg.result.density).toBeNull();
  });

  test('empty points produce empty geometry arrays', async () => {
    const msg = await send(ctx, '15', 'scatter-render', {
      points: [],
      xScale: { min: 0, max: 1 },
      yScale: { min: 0, max: 1 },
      plotW: 100,
      plotH: 100
    });
    expect(msg.ok).toBe(true);
    expect(msg.result.geometry.cx).toHaveLength(0);
  });
});
