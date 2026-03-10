const fixture = require('./fixtures/stats-oracle-cases.json');
const { runPythonOracle, indexOracleResults } = require('./helpers/pythonOracle');

const ADJUST_METHODS = ['none', 'bonferroni', 'sidak', 'holm', 'holm-sidak', 'hochberg', 'bh', 'by'];

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function compareNumber(actual, expected, label, tolerance = {}) {
  const absTol = isFiniteNumber(tolerance.abs) ? tolerance.abs : 1e-8;
  const relTol = isFiniteNumber(tolerance.rel) ? tolerance.rel : 1e-6;
  if (expected == null) {
    expect(actual == null || Number.isNaN(actual)).toBe(true);
    return;
  }
  if (typeof expected === 'number' && !Number.isFinite(expected)) {
    expect(typeof actual === 'number' && !Number.isFinite(actual)).toBe(true);
    return;
  }
  expect(isFiniteNumber(actual)).toBe(true);
  expect(isFiniteNumber(expected)).toBe(true);
  const diff = Math.abs(actual - expected);
  const limit = Math.max(absTol, relTol * Math.max(1, Math.abs(expected)));
  if (diff > limit) {
    throw new Error(`${label} differs: actual=${actual}, expected=${expected}, diff=${diff}, limit=${limit}`);
  }
}

function compareNumberArray(actual, expected, label, tolerance = {}) {
  expect(Array.isArray(actual)).toBe(true);
  expect(Array.isArray(expected)).toBe(true);
  if (actual.length !== expected.length) {
    throw new Error(`${label} length mismatch: actual=${actual.length}, expected=${expected.length}`);
  }
  for (let i = 0; i < expected.length; i += 1) {
    compareNumber(actual[i], expected[i], `${label}[${i}]`, tolerance);
  }
}

function regressionStatsByTerm(summary) {
  const map = new Map();
  const rows = Array.isArray(summary?.coefficientStats) ? summary.coefficientStats : [];
  rows.forEach(row => {
    if (row && typeof row.term === 'string') {
      map.set(row.term, row);
    }
  });
  return map;
}

function getDistributionUsedCount(values, distribution) {
  const key = String(distribution || '').toLowerCase();
  const finite = Array.isArray(values) ? values.filter(Number.isFinite) : [];
  if (key === 'normal') {
    return finite.length;
  }
  if (key === 'lognormal') {
    return finite.filter(v => v > 0).length;
  }
  if (key === 'exponential') {
    return finite.filter(v => v >= 0).length;
  }
  return finite.length;
}

function runJsCase(testCase, context) {
  const operation = testCase.operation;
  const payload = testCase.payload || {};
  if (operation === 'adjust_pvalues') {
    return {
      adjusted: context.stats.adjustPValues(payload.pValues || [], { method: payload.method })
    };
  }
  if (operation === 'hypergeometric_right_tail') {
    return {
      pValue: context.stats.computeHypergeometricRightTail(payload)
    };
  }
  if (operation === 'distribution_fit') {
    const fit = context.stats.fitDistribution(payload.values || [], { distribution: payload.distribution });
    return {
      valid: !!fit?.valid,
      usedCount: getDistributionUsedCount(payload.values || [], payload.distribution),
      params: fit?.params || null
    };
  }
  if (operation === 'goodness_of_fit') {
    const fit = context.stats.fitDistribution(payload.values || [], { distribution: payload.distribution });
    const gof = context.stats.goodnessOfFit(payload.values || [], {
      distribution: payload.distribution,
      fit,
      alpha: payload.alpha
    });
    return {
      valid: !!gof,
      n: gof?.n || 0,
      ksStatistic: gof?.ks?.statistic,
      adStatistic: gof?.ad?.statistic,
      ksPValue: gof?.ks?.pValue
    };
  }
  if (operation === 'regression_linear') {
    const points = (payload.x || [])
      .map((x, idx) => ({ x: Number(x), y: Number((payload.y || [])[idx]) }))
      .filter(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y));
    const model = context.regressionTools.fitRegression(points, { mode: 'linear', alpha: payload.alpha });
    const summary = context.regressionTools.createSummary(model);
    return {
      valid: !!summary,
      sampleSize: summary?.metrics?.sampleSize,
      coefficients: summary?.coefficients || [],
      metrics: {
        sse: summary?.metrics?.sse,
        sst: summary?.metrics?.sst,
        r2: summary?.metrics?.r2,
        adjR2: summary?.metrics?.adjR2,
        rmse: summary?.metrics?.rmse,
        mae: summary?.metrics?.mae
      },
      coefficientStats: regressionStatsByTerm(summary)
    };
  }
  if (operation === 'regression_linear_through_origin') {
    const points = (payload.x || [])
      .map((x, idx) => ({ x: Number(x), y: Number((payload.y || [])[idx]) }))
      .filter(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y));
    const model = context.regressionTools.fitRegression(points, { mode: 'linearThroughOrigin', alpha: payload.alpha });
    const summary = context.regressionTools.createSummary(model);
    return {
      valid: !!summary,
      sampleSize: summary?.metrics?.sampleSize,
      coefficients: summary?.coefficients || [],
      metrics: {
        sse: summary?.metrics?.sse,
        sst: summary?.metrics?.sst,
        r2: summary?.metrics?.r2,
        adjR2: summary?.metrics?.adjR2,
        rmse: summary?.metrics?.rmse,
        mae: summary?.metrics?.mae
      },
      coefficientStats: regressionStatsByTerm(summary)
    };
  }
  if (operation === 'regression_polynomial') {
    const degree = Number(payload.degree);
    const mode = degree >= 3 ? 'cubic' : 'quadratic';
    const points = (payload.x || [])
      .map((x, idx) => ({ x: Number(x), y: Number((payload.y || [])[idx]) }))
      .filter(pt => Number.isFinite(pt.x) && Number.isFinite(pt.y));
    const model = context.regressionTools.fitRegression(points, { mode, alpha: payload.alpha });
    const summary = context.regressionTools.createSummary(model);
    return {
      valid: !!summary,
      degree: mode === 'cubic' ? 3 : 2,
      sampleSize: summary?.metrics?.sampleSize,
      coefficients: summary?.coefficients || [],
      metrics: {
        sse: summary?.metrics?.sse,
        sst: summary?.metrics?.sst,
        r2: summary?.metrics?.r2,
        adjR2: summary?.metrics?.adjR2,
        rmse: summary?.metrics?.rmse,
        mae: summary?.metrics?.mae
      },
      coefficientStats: regressionStatsByTerm(summary)
    };
  }
  throw new Error(`Unsupported JS operation: ${operation}`);
}

function compareRegressionMetricBlock(jsMetrics, pyMetrics, label, options = {}) {
  const skipAdjR2 = options.skipAdjR2 === true;
  compareNumber(jsMetrics.sse, pyMetrics.sse, `${label}.sse`, { abs: 1e-6, rel: 1e-5 });
  compareNumber(jsMetrics.sst, pyMetrics.sst, `${label}.sst`, { abs: 1e-6, rel: 1e-5 });
  compareNumber(jsMetrics.r2, pyMetrics.r2, `${label}.r2`, { abs: 1e-6, rel: 1e-5 });
  if (!skipAdjR2) {
    compareNumber(jsMetrics.adjR2, pyMetrics.adjR2, `${label}.adjR2`, { abs: 1e-6, rel: 1e-5 });
  }
  compareNumber(jsMetrics.rmse, pyMetrics.rmse, `${label}.rmse`, { abs: 1e-6, rel: 1e-5 });
  compareNumber(jsMetrics.mae, pyMetrics.mae, `${label}.mae`, { abs: 1e-6, rel: 1e-5 });
}

function compareRegressionTermStats(jsMap, pyMap, terms, label) {
  let compared = 0;
  terms.forEach(term => {
    const jsRow = jsMap.get(term);
    const pyRow = pyMap?.[term];
    if (!jsRow || !pyRow) {
      return;
    }
    compared += 1;
    compareNumber(jsRow.estimate, pyRow.estimate, `${label}.${term}.estimate`, { abs: 1e-6, rel: 1e-5 });
    compareNumber(jsRow.standardError, pyRow.standardError, `${label}.${term}.standardError`, { abs: 1e-6, rel: 1e-5 });
    compareNumber(jsRow.tStatistic, pyRow.tStatistic, `${label}.${term}.tStatistic`, { abs: 1e-6, rel: 1e-5 });
    compareNumber(jsRow.pValue, pyRow.pValue, `${label}.${term}.pValue`, { abs: 1e-6, rel: 1e-5 });
    compareNumber(jsRow.ciLow, pyRow.ciLow, `${label}.${term}.ciLow`, { abs: 1e-6, rel: 1e-5 });
    compareNumber(jsRow.ciHigh, pyRow.ciHigh, `${label}.${term}.ciHigh`, { abs: 1e-6, rel: 1e-5 });
  });
  return compared;
}

function compareCaseResult(testCase, jsResult, pyResult) {
  const caseLabel = testCase.id || testCase.operation;
  if (testCase.operation === 'adjust_pvalues') {
    compareNumberArray(jsResult.adjusted, pyResult.adjusted, `${caseLabel}.adjusted`, { abs: 1e-10, rel: 1e-8 });
    return;
  }
  if (testCase.operation === 'hypergeometric_right_tail') {
    compareNumber(jsResult.pValue, pyResult.pValue, `${caseLabel}.pValue`, { abs: 1e-12, rel: 1e-8 });
    return;
  }
  if (testCase.operation === 'distribution_fit') {
    expect(jsResult.valid).toBe(pyResult.valid);
    expect(jsResult.usedCount).toBe(pyResult.usedCount);
    if (jsResult.valid && pyResult.valid) {
      const keys = Object.keys(pyResult.params || {});
      keys.forEach(key => {
        compareNumber(jsResult.params?.[key], pyResult.params?.[key], `${caseLabel}.params.${key}`, { abs: 1e-10, rel: 1e-8 });
      });
    }
    return;
  }
  if (testCase.operation === 'goodness_of_fit') {
    expect(jsResult.valid).toBe(pyResult.valid);
    if (!jsResult.valid || !pyResult.valid) {
      return;
    }
    expect(jsResult.n).toBe(pyResult.n);
    compareNumber(jsResult.ksStatistic, pyResult.ksStatistic, `${caseLabel}.ksStatistic`, { abs: 2e-7, rel: 1e-6 });
    compareNumber(jsResult.adStatistic, pyResult.adStatistic, `${caseLabel}.adStatistic`, { abs: 2e-7, rel: 1e-6 });
    return;
  }
  if (testCase.operation === 'regression_linear') {
    expect(jsResult.valid).toBe(true);
    expect(pyResult.valid).toBe(true);
    compareNumber(jsResult.sampleSize, pyResult.sampleSize, `${caseLabel}.sampleSize`, { abs: 0, rel: 0 });
    compareNumberArray(jsResult.coefficients, pyResult.coefficients, `${caseLabel}.coefficients`, { abs: 1e-6, rel: 1e-5 });
    compareRegressionMetricBlock(jsResult.metrics, pyResult.metrics, caseLabel);
    compareRegressionTermStats(jsResult.coefficientStats, pyResult.coefficientStats, ['Intercept', 'Slope'], caseLabel);
    return;
  }
  if (testCase.operation === 'regression_linear_through_origin') {
    expect(jsResult.valid).toBe(true);
    expect(pyResult.valid).toBe(true);
    compareNumber(jsResult.sampleSize, pyResult.sampleSize, `${caseLabel}.sampleSize`, { abs: 0, rel: 0 });
    compareNumberArray(jsResult.coefficients, pyResult.coefficients, `${caseLabel}.coefficients`, { abs: 1e-6, rel: 1e-5 });
    // Adjusted R² conventions differ for through-origin fits; compare shared metrics only.
    compareRegressionMetricBlock(jsResult.metrics, pyResult.metrics, caseLabel, { skipAdjR2: true });
    compareRegressionTermStats(jsResult.coefficientStats, pyResult.coefficientStats, ['Slope'], caseLabel);
    return;
  }
  if (testCase.operation === 'regression_polynomial') {
    expect(jsResult.valid).toBe(true);
    expect(pyResult.valid).toBe(true);
    compareNumber(jsResult.degree, pyResult.degree, `${caseLabel}.degree`, { abs: 0, rel: 0 });
    compareNumber(jsResult.sampleSize, pyResult.sampleSize, `${caseLabel}.sampleSize`, { abs: 0, rel: 0 });
    compareNumberArray(jsResult.coefficients, pyResult.coefficients, `${caseLabel}.coefficients`, { abs: 1e-5, rel: 1e-4 });
    compareRegressionMetricBlock(jsResult.metrics, pyResult.metrics, caseLabel);
    const terms = Object.keys(pyResult.coefficientStats || {});
    compareRegressionTermStats(jsResult.coefficientStats, pyResult.coefficientStats, terms, caseLabel);
    return;
  }
  throw new Error(`No comparator for operation ${testCase.operation}`);
}

function createRandomRegressionData(random, options = {}) {
  const n = options.n;
  const slope = options.slope;
  const intercept = options.intercept;
  const noise = options.noise;
  const x = [];
  const y = [];
  for (let i = 0; i < n; i += 1) {
    const xv = -5 + 10 * (i / Math.max(n - 1, 1)) + (random() - 0.5) * 0.25;
    const eps = (random() - 0.5) * 2 * noise;
    x.push(xv);
    y.push(intercept + slope * xv + eps);
  }
  return { x, y };
}

function createRandomPolynomialData(random, degree, n) {
  const coeffs = [(-2 + random() * 4), (-3 + random() * 6), (-1.5 + random() * 3), (-0.5 + random())];
  const x = [];
  const y = [];
  const noise = 0.05 + random() * 0.8;
  for (let i = 0; i < n; i += 1) {
    const xv = -4 + 8 * (i / Math.max(n - 1, 1)) + (random() - 0.5) * 0.35;
    let yv = coeffs[0] + coeffs[1] * xv + coeffs[2] * xv * xv;
    if (degree >= 3) {
      yv += coeffs[3] * xv * xv * xv;
    }
    yv += (random() - 0.5) * 2 * noise;
    x.push(xv);
    y.push(yv);
  }
  return { x, y };
}

function buildRandomDifferentialCases(seed = 20260309) {
  const random = mulberry32(seed);
  const cases = [];
  let idCounter = 0;
  const nextId = prefix => `${prefix}-${idCounter++}`;

  for (let i = 0; i < 48; i += 1) {
    const method = ADJUST_METHODS[i % ADJUST_METHODS.length];
    const count = 3 + Math.floor(random() * 15);
    const pValues = [];
    for (let j = 0; j < count; j += 1) {
      const roll = random();
      if (roll < 0.05) pValues.push(0);
      else if (roll > 0.95) pValues.push(1);
      else pValues.push(Math.min(1, Math.max(0, roll)));
    }
    cases.push({
      id: nextId('rnd-adjust'),
      operation: 'adjust_pvalues',
      payload: { method, pValues }
    });
  }

  for (let i = 0; i < 90; i += 1) {
    const populationSize = 60 + Math.floor(random() * 8000);
    const successPopulation = 1 + Math.floor(random() * (populationSize - 1));
    const draws = 1 + Math.floor(random() * (populationSize - 1));
    const maxObs = Math.min(successPopulation, draws);
    const observedSuccesses = Math.floor(random() * (maxObs + 1));
    cases.push({
      id: nextId('rnd-hypergeom'),
      operation: 'hypergeometric_right_tail',
      payload: {
        populationSize,
        successPopulation,
        draws,
        observedSuccesses
      }
    });
  }

  for (let i = 0; i < 60; i += 1) {
    const n = 10 + Math.floor(random() * 35);
    const slope = -4 + random() * 8;
    const intercept = -3 + random() * 6;
    const noise = 0.05 + random() * 2.0;
    const data = createRandomRegressionData(random, { n, slope, intercept, noise });
    cases.push({
      id: nextId('rnd-linear'),
      operation: 'regression_linear',
      payload: { alpha: 0.05, x: data.x, y: data.y }
    });
  }

  for (let i = 0; i < 28; i += 1) {
    const n = 9 + Math.floor(random() * 30);
    const slope = -3 + random() * 6;
    const noise = 0.05 + random() * 1.5;
    const x = [];
    const y = [];
    for (let j = 0; j < n; j += 1) {
      const xv = -5 + 10 * (j / Math.max(n - 1, 1)) + (random() - 0.5) * 0.35;
      x.push(xv);
      y.push(slope * xv + (random() - 0.5) * 2 * noise);
    }
    cases.push({
      id: nextId('rnd-origin'),
      operation: 'regression_linear_through_origin',
      payload: { alpha: 0.05, x, y }
    });
  }

  for (let i = 0; i < 36; i += 1) {
    const degree = random() < 0.5 ? 2 : 3;
    const n = degree + 7 + Math.floor(random() * 20);
    const data = createRandomPolynomialData(random, degree, n);
    cases.push({
      id: nextId('rnd-poly'),
      operation: 'regression_polynomial',
      payload: { degree, alpha: 0.05, x: data.x, y: data.y }
    });
  }

  return cases;
}

describe('Differential statistical validation against Python oracle', () => {
  let context;

  beforeEach(() => {
    jest.resetModules();
    global.Shared = {};
    const jStatModule = require('jstat');
    const jStat = jStatModule?.jStat || jStatModule;
    global.jStat = jStat;
    if (typeof window !== 'undefined') {
      window.jStat = jStat;
    }
    require('../js/vendor.js');
    require('../js/shared/stats.js');
    require('../js/shared/regression.js');
    context = {
      stats: global.Shared.stats,
      regressionTools: global.Shared.regressionTools
    };
  });

  test('curated reference cases match Python oracle', () => {
    const cases = fixture.cases || [];
    const oracleResults = indexOracleResults(runPythonOracle(cases));
    expect(oracleResults.size).toBe(cases.length);
    cases.forEach(testCase => {
      const oracle = oracleResults.get(testCase.id);
      expect(oracle).toBeTruthy();
      expect(oracle.ok).toBe(true);
      const jsResult = runJsCase(testCase, context);
      compareCaseResult(testCase, jsResult, oracle.result);
    });
  });

  test('randomized differential suite matches Python oracle', () => {
    const cases = buildRandomDifferentialCases();
    const oracleResults = indexOracleResults(runPythonOracle(cases));
    expect(oracleResults.size).toBe(cases.length);
    cases.forEach(testCase => {
      const oracle = oracleResults.get(testCase.id);
      expect(oracle).toBeTruthy();
      expect(oracle.ok).toBe(true);
      const jsResult = runJsCase(testCase, context);
      compareCaseResult(testCase, jsResult, oracle.result);
    });
  });

  test('metamorphic invariants hold for key statistics', () => {
    const pValues = [0.002, 0.25, 0.11, 0.73, 0.05, 0.9, 0.33];
    const permutation = [3, 0, 5, 2, 6, 1, 4];
    ADJUST_METHODS.forEach(method => {
      const adjusted = context.stats.adjustPValues(pValues, { method });
      const permutedInput = permutation.map(idx => pValues[idx]);
      const adjustedPermuted = context.stats.adjustPValues(permutedInput, { method });
      adjustedPermuted.forEach((value, idx) => {
        compareNumber(value, adjusted[permutation[idx]], `metamorphic.adjust.${method}[${idx}]`, { abs: 1e-12, rel: 1e-9 });
      });
    });

    const regressionPayload = {
      operation: 'regression_linear',
      payload: {
        alpha: 0.05,
        x: [0, 1, 2, 3, 4, 5, 6],
        y: [1.2, 3.0, 4.7, 7.4, 9.1, 10.9, 12.6]
      }
    };
    const baseline = runJsCase(regressionPayload, context);
    const permuted = runJsCase({
      operation: 'regression_linear',
      payload: {
        alpha: 0.05,
        x: permutation.slice(0, 7).map(idx => regressionPayload.payload.x[idx]),
        y: permutation.slice(0, 7).map(idx => regressionPayload.payload.y[idx])
      }
    }, context);
    compareNumberArray(permuted.coefficients, baseline.coefficients, 'metamorphic.regression.coefficients', { abs: 1e-10, rel: 1e-9 });
    compareRegressionMetricBlock(permuted.metrics, baseline.metrics, 'metamorphic.regression.metrics');

    const tailValues = [];
    for (let observed = 0; observed <= 25; observed += 1) {
      tailValues.push(context.stats.computeHypergeometricRightTail({
        populationSize: 300,
        successPopulation: 80,
        draws: 40,
        observedSuccesses: observed
      }));
    }
    for (let i = 1; i < tailValues.length; i += 1) {
      expect(tailValues[i]).toBeLessThanOrEqual(tailValues[i - 1] + 1e-12);
    }
  });
});
