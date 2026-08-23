function expectClose(actual, expected, tolerance = 1e-8) {
  expect(Number.isFinite(actual)).toBe(true);
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(expected)));
}

describe('Statistical audit remediation — shared engines', () => {
  let regressionTools;
  let stats;
  let boxStatsModel;

  beforeAll(() => {
    jest.resetModules();
    const jStatModule = require('jstat');
    const jStat = jStatModule?.jStat || jStatModule;
    global.Shared = {};
    global.jStat = jStat;
    if (typeof window !== 'undefined') {
      window.Shared = global.Shared;
      window.jStat = jStat;
    }
    require('../js/shared/stats.js');
    require('../js/shared/regression.js');
    boxStatsModel = require('../js/shared/boxStatsModel.js');
    regressionTools = global.Shared.regressionTools;
    stats = global.Shared.stats;
  });

  afterAll(() => {
    delete global.Shared;
    delete global.jStat;
  });

  test('ARIMA reconstructs levels for d=0 and recursively integrates d=2', () => {
    const nearLinear = Array.from({ length: 30 }, (_, index) => ({
      x: index,
      y: 5 + (0.7 * index) + (0.02 * Math.sin(index))
    }));
    const levelModel = regressionTools.fitRegression(nearLinear, {
      mode: 'arima',
      forecast: { autoTune: false, p: 1, d: 0, horizon: 4, maxP: 5, maxD: 2 }
    });
    expect(levelModel.metrics.r2).toBeGreaterThan(0.99);
    expect(levelModel.forecast.points[0].y).toBeGreaterThan(24);
    expect(levelModel.forecast.points[0].y).toBeLessThan(28);

    const quadratic = Array.from({ length: 20 }, (_, index) => ({ x: index, y: index * index }));
    const integratedModel = regressionTools.fitRegression(quadratic, {
      mode: 'arima',
      forecast: { autoTune: false, p: 0, d: 2, horizon: 3, maxP: 5, maxD: 2 }
    });
    expect(integratedModel.forecast.points.map(point => point.y)).toEqual([400, 441, 484]);
  });

  test('integrated ARIMA prediction uncertainty accumulates with horizon', () => {
    const points = Array.from({ length: 30 }, (_, index) => ({
      x: index,
      y: index * index + (0.05 * Math.sin(index * 1.7))
    }));
    const model = regressionTools.fitRegression(points, {
      mode: 'arima',
      forecast: { autoTune: false, p: 0, d: 2, horizon: 5, maxP: 5, maxD: 2 }
    });
    const standardErrors = model.forecast.points.map(point => point.stdErr);
    standardErrors.slice(1).forEach((value, index) => {
      expect(value).toBeGreaterThan(standardErrors[index]);
    });
  });

  test('pivoted QR polynomial fitting remains stable for large-offset x values', () => {
    const points = Array.from({ length: 30 }, (_, index) => {
      const x = 1_000_000 + index;
      const centered = x - 1_000_000;
      return { x, y: 2 - (3 * centered) + (0.5 * centered ** 2) - (0.01 * centered ** 3) };
    });
    const model = regressionTools.fitRegression(points, { mode: 'cubic' });
    expect(model.metrics.r2).toBeGreaterThan(0.999999999999);
    expect(model.metrics.sse).toBeLessThan(1e-12);
    points.forEach(point => expectClose(model.predict(point.x), point.y, 1e-10));
    expect(model.summary.numericalBasis?.kind).toBe('centered-scaled-polynomial');
    expect((model.warnings || []).join(' ')).not.toMatch(/numerically unstable/i);
  });

  test.each(['ols', 'wls', 'huber'])('nonlinear %s inference uses a finite final covariance', method => {
    const points = Array.from({ length: 41 }, (_, index) => {
      const x = -4 + (index * 0.2);
      return { x, y: 1 + (5 * Math.exp(-0.5 * ((x - 0.5) / 1.2) ** 2)) + (0.05 * Math.sin(index)) };
    });
    const model = regressionTools.fitRegression(points, { mode: 'gaussian', method, confidenceLevel: 95 });
    expect(model.metrics.inferenceAvailable).toBe(true);
    expect(model.diagnostics.inferenceAvailable).toBe(true);
    expect(model.coefficientStats).toHaveLength(4);
    expect(model.coefficientCovariance).toHaveLength(4);
    model.coefficientCovariance.flat().forEach(value => expect(Number.isFinite(value)).toBe(true));
  });

  test('complete logistic separation is diagnostic-only and suppresses ordinary MLE reporting', () => {
    const separated = [
      { x: -3, y: 0 }, { x: -2, y: 0 }, { x: -1, y: 0 },
      { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }
    ];
    const model = regressionTools.fitRegression(separated, { mode: 'logistic' });
    expect(model.available).toBe(false);
    expect(model.diagnosticOnly).toBe(true);
    expect(model.metrics.inferenceAvailable).toBe(false);
    expect(model.coefficientStats).toEqual([]);
    expect(model.coefficientCovariance).toBeNull();
    expect(model.intervals).toBeNull();
    expect(model.summary.primaryParameter.value).toBeNaN();
    expect(model.metrics.r2).toBeNaN();
    expect(model.metrics.aic).toBeNaN();
    expect(Number.isFinite(model.diagnosticMetrics.r2)).toBe(true);
    expect(Number.isFinite(model.diagnosticMetrics.aic)).toBe(true);
    expect(model.diagnosticCoefficients.every(Number.isFinite)).toBe(true);
  });

  test('through-origin R² keeps its uncentered definition through serialization', () => {
    const model = regressionTools.fitRegression([
      { x: 1, y: 1 }, { x: 2, y: 2.2 }, { x: 3, y: 2.8 }, { x: 4, y: 4.1 }
    ], { mode: 'linearThroughOrigin' });
    const summary = regressionTools.createSummary(model);
    expect(model.metrics.r2Kind).toBe('uncentered');
    expect(summary.metrics.r2Kind).toBe('uncentered');
    expect(summary.summary.r2Kind).toBe('uncentered');
  });

  test('hypergeometric inputs are validated and extreme tails retain log probability', () => {
    const invalid = stats.computeHypergeometricRightTailDetails({
      populationSize: 10,
      successPopulation: 3,
      draws: 4,
      observedSuccesses: 4
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.pValue).toBeNaN();

    const extreme = stats.computeHypergeometricRightTailDetails({
      populationSize: 1_000_000,
      successPopulation: 10_000,
      draws: 10_000,
      observedSuccesses: 2_000
    });
    expect(extreme.valid).toBe(true);
    expect(Number.isFinite(extreme.logPValue)).toBe(true);
    expect(extreme.logPValue).toBeLessThan(0);
    if (extreme.underflow) expect(extreme.pValue).toBe(0);

    const centralLower = stats.computeHypergeometricRightTailDetails({
      populationSize: 10_000,
      successPopulation: 5_000,
      draws: 5_000,
      observedSuccesses: 2_490
    });
    const centralUpper = stats.computeHypergeometricRightTailDetails({
      populationSize: 10_000,
      successPopulation: 5_000,
      draws: 5_000,
      observedSuccesses: 2_510
    });
    expectClose(centralLower.pValue, 0.6627562192919202, 1e-9);
    expectClose(centralUpper.pValue, 0.35197371405638456, 1e-9);
  });

  test('Holm adjustment is stable in log probability space', () => {
    const adjusted = stats.adjustHolmLogPValues([Math.log(0.001), Math.log(0.01), Math.log(0.04)]);
    expectClose(Math.exp(adjusted[0]), 0.003, 1e-12);
    expectClose(Math.exp(adjusted[1]), 0.02, 1e-12);
    expectClose(Math.exp(adjusted[2]), 0.04, 1e-12);
  });

  test('constant samples are unassessable by Shapiro-Wilk', () => {
    const result = boxStatsModel.computeShapiroWilk([4, 4, 4, 4, 4]);
    expect(result.available).toBe(false);
    expect(result.degenerate).toBe(true);
    expect(result.passed).toBeNull();
    expect(result.pValue).toBeNaN();
  });

  test('Holt-Winters auto-tuning reports SSE tuning rather than formal AIC/BIC', () => {
    const points = Array.from({ length: 32 }, (_, index) => ({
      x: index,
      y: 20 + (0.25 * index) + [2, -1, 1, -2][index % 4]
    }));
    const model = regressionTools.fitRegression(points, {
      mode: 'holtWinters',
      forecast: { horizon: 4, seasonLength: 4, autoTune: true }
    });
    expect(model.metrics.selectionCriterion).toBe('one-step-sse');
    expect(Number.isFinite(model.metrics.selectionScore)).toBe(true);
    expect(model.metrics.aic).toBeNaN();
    expect(model.metrics.bic).toBeNaN();
    expect(model.warnings.join(' ')).toMatch(/one-step-ahead SSE/i);
  });
});
