/* global expect, jest, test */

const {
  runPythonOracle,
  indexOracleResults,
  detectPythonOracleAvailability
} = require('../__tests__/helpers/pythonOracle');

const oracleAvailability = detectPythonOracleAvailability();
const testWithOracle = oracleAvailability.available ? test : test.skip;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function expectClose(actual, expected, label, tolerance = {}) {
  const abs = isFiniteNumber(tolerance.abs) ? tolerance.abs : 1e-8;
  const rel = isFiniteNumber(tolerance.rel) ? tolerance.rel : 1e-6;
  if (expected == null) {
    if (!(actual == null || !Number.isFinite(actual))) {
      throw new Error(`${label}: expected no finite value, received ${actual}`);
    }
    return;
  }
  if (typeof expected === 'number' && !Number.isFinite(expected)) {
    expect(typeof actual === 'number' && !Number.isFinite(actual)).toBe(true);
    return;
  }
  if (!isFiniteNumber(actual) || !isFiniteNumber(expected)) {
    throw new Error(`${label}: expected finite values, received actual=${actual}, expected=${expected}`);
  }
  const diff = Math.abs(actual - expected);
  const limit = Math.max(abs, rel * Math.max(1, Math.abs(expected)));
  if (diff > limit) {
    throw new Error(`${label} mismatch: actual=${actual}, expected=${expected}, diff=${diff}, limit=${limit}`);
  }
}

function expectFinite(value, label) {
  if (!isFiniteNumber(value)) {
    throw new Error(`${label} must be finite, got ${value}`);
  }
}

function toPoints(x, y) {
  return x.map((xValue, index) => ({ x: xValue, y: y[index] }));
}

function uniqueSorted(values) {
  return Array.from(new Set(values.map(Number))).sort((a, b) => a - b);
}

function sampleModelPoints(x, predict) {
  return x.map(xValue => ({ x: Number(xValue), y: Number(predict(Number(xValue))) }));
}

function createSpearmanExactP(rho, n) {
  const size = Number(n);
  const observed = Math.abs(Number(rho));
  if (!Number.isFinite(size) || !Number.isFinite(observed) || size < 3 || size > 9) {
    return null;
  }
  const ranks = Array.from({ length: size }, (_, idx) => idx + 1);
  let total = 0;
  let extreme = 0;
  const denom = size * ((size * size) - 1);
  const tolerance = 1e-12;
  const backtrack = index => {
    if (index >= size) {
      let d2 = 0;
      for (let i = 0; i < size; i += 1) {
        const d = (i + 1) - ranks[i];
        d2 += d * d;
      }
      const permRho = 1 - ((6 * d2) / denom);
      total += 1;
      if (Math.abs(permRho) >= observed - tolerance) {
        extreme += 1;
      }
      return;
    }
    for (let i = index; i < size; i += 1) {
      const tmp = ranks[index];
      ranks[index] = ranks[i];
      ranks[i] = tmp;
      backtrack(index + 1);
      ranks[i] = ranks[index];
      ranks[index] = tmp;
    }
  };
  backtrack(0);
  return total ? (extreme / total) : null;
}

function rankAverage(values) {
  const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = Array(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i + 1;
    while (j < order.length && order[j].value === order[i].value) {
      j += 1;
    }
    const avg = ((i + 1) + j) / 2;
    for (let k = i; k < j; k += 1) {
      ranks[order[k].index] = avg;
    }
    i = j;
  }
  return ranks;
}

function exactTwoSidedFromTails(lowerTail, upperTail) {
  if (!Number.isFinite(lowerTail) || !Number.isFinite(upperTail)) {
    return NaN;
  }
  return Math.max(0, Math.min(1, 2 * Math.min(lowerTail, upperTail)));
}

function buildSignedRankExactDistribution(n) {
  const maxSum = (n * (n + 1)) / 2;
  const counts = new Array(maxSum + 1).fill(0);
  counts[0] = 1;
  for (let rank = 1; rank <= n; rank += 1) {
    for (let sum = maxSum - rank; sum >= 0; sum -= 1) {
      if (counts[sum]) {
        counts[sum + rank] += counts[sum];
      }
    }
  }
  return counts;
}

function computeSignedRankExactP(diffs, alternative) {
  const nonZero = (Array.isArray(diffs) ? diffs : []).filter(value => isFiniteNumber(value) && value !== 0);
  const ranks = rankAverage(nonZero.map(Math.abs));
  const wPos = ranks.reduce((sum, rank, index) => sum + (nonZero[index] > 0 ? rank : 0), 0);
  const dist = buildSignedRankExactDistribution(nonZero.length);
  const total = Math.pow(2, nonZero.length);
  const observed = Math.round(wPos);
  let lowerCount = 0;
  let upperCount = 0;
  for (let u = 0; u < dist.length; u += 1) {
    const count = Number(dist[u]) || 0;
    if (u <= observed) lowerCount += count;
    if (u >= observed) upperCount += count;
  }
  const lowerTail = lowerCount / total;
  const upperTail = upperCount / total;
  if (alternative === 'greater') return upperTail;
  if (alternative === 'less') return lowerTail;
  return exactTwoSidedFromTails(lowerTail, upperTail);
}

function regressionOperationForMode(mode) {
  const key = String(mode || '').trim();
  if (key === 'linear') return { operation: 'regression_linear', payloadExtra: {} };
  if (key === 'linearThroughOrigin') return { operation: 'regression_linear_through_origin', payloadExtra: {} };
  if (key === 'quadratic') return { operation: 'regression_polynomial', payloadExtra: { degree: 2 } };
  if (key === 'cubic') return { operation: 'regression_polynomial', payloadExtra: { degree: 3 } };
  if (key === 'exponential') return { operation: 'regression_exponential', payloadExtra: {} };
  if (key === 'power') return { operation: 'regression_power', payloadExtra: {} };
  if (key === 'logistic') return { operation: 'regression_logistic', payloadExtra: {} };
  if (key === 'spline') return { operation: 'regression_spline_natural', payloadExtra: {} };
  if (key === 'deming') return { operation: 'regression_deming', payloadExtra: { mode: 'deming' } };
  if (key === 'orthogonal') return { operation: 'regression_deming', payloadExtra: { mode: 'orthogonal' } };
  if (key === 'lowess') return { operation: 'regression_lowess', payloadExtra: {} };
  if (key === 'gaussian') return { operation: 'regression_gaussian', payloadExtra: {} };
  if (key === 'onePhaseAssociation') return { operation: 'regression_one_phase_association', payloadExtra: {} };
  if (key === 'onePhaseDecay') return { operation: 'regression_one_phase_decay', payloadExtra: {} };
  if (key === 'gompertz') return { operation: 'regression_gompertz', payloadExtra: {} };
  if (key === 'bindingSaturation') return { operation: 'regression_binding_saturation', payloadExtra: {} };
  if (key === 'bindingCompetitive') return { operation: 'regression_binding_competitive', payloadExtra: {} };
  if (key === 'enzymeKineticsSubstrate') return { operation: 'regression_enzyme_kinetics_substrate', payloadExtra: {} };
  if (key === 'enzymeKineticsInhibition') return { operation: 'regression_enzyme_kinetics_inhibition', payloadExtra: {} };
  if (key === 'doseResponse3pl') return { operation: 'regression_dose_response_3pl', payloadExtra: {} };
  if (key === 'doseResponse4pl') return { operation: 'regression_dose_response_4pl', payloadExtra: {} };
  if (key === 'doseResponse5pl') return { operation: 'regression_dose_response_5pl', payloadExtra: {} };
  if (key === 'arima') return { operation: 'regression_arima', payloadExtra: {} };
  if (key === 'holtWinters') return { operation: 'regression_holt_winters', payloadExtra: {} };
  throw new Error(`No oracle operation mapping for regression mode ${mode}`);
}

function compareRegressionMetrics(actual, expected, label, options = {}) {
  const keys = Array.isArray(options.keys) ? options.keys : ['sse', 'r2', 'rmse', 'mae'];
  keys.forEach(key => {
    expectClose(actual?.[key], expected?.[key], `${label}.${key}`, options.tolerance || { abs: 1e-6, rel: 1e-5 });
  });
}

function compareLinearLikeRegression(actualRegression, expected, label, options = {}) {
  expect(actualRegression).toBeTruthy();
  if (expected?.valid !== true) {
    throw new Error(`${label}: oracle did not return a valid regression result`);
  }
  compareRegressionMetrics(actualRegression.metrics, expected.metrics, `${label}.metrics`, options);
  if (!options.skipCoefficients && Array.isArray(expected.coefficients) && expected.coefficients.length) {
    expect(Array.isArray(actualRegression.coefficients)).toBe(true);
    expect(actualRegression.coefficients.length).toBe(expected.coefficients.length);
    expected.coefficients.forEach((value, index) => {
      expectClose(actualRegression.coefficients[index], value, `${label}.coefficients[${index}]`, { abs: 1e-5, rel: 1e-4 });
    });
  }
}

function compareRegressionPredictions(actualRegression, evalXs, expectedPredictions, label, tolerance = { abs: 1e-5, rel: 1e-4 }) {
  expect(actualRegression).toBeTruthy();
  const actualPredictions = evalXs.map(xValue => actualRegression.predict(xValue));
  expect(actualPredictions.length).toBe(expectedPredictions.length);
  actualPredictions.forEach((value, index) => {
    expectClose(value, expectedPredictions[index], `${label}.predictions[${index}]`, tolerance);
  });
}

function compareSummaryParameters(actualRegression, expectedSummary, keys, label, tolerance = { abs: 1e-5, rel: 1e-4 }) {
  expect(actualRegression?.summary?.parameters).toBeTruthy();
  expect(expectedSummary?.parameters).toBeTruthy();
  keys.forEach(key => {
    expectClose(actualRegression.summary.parameters[key], expectedSummary.parameters[key], `${label}.summary.parameters.${key}`, tolerance);
  });
  if (expectedSummary?.primaryParameter?.label) {
    expect(String(actualRegression.summary?.primaryParameter?.label || '')).toBe(String(expectedSummary.primaryParameter.label));
    expectClose(actualRegression.summary?.primaryParameter?.value, expectedSummary.primaryParameter.value, `${label}.summary.primaryParameter.value`, tolerance);
  }
}

function buildBoxCases() {
  return {
    exactA: [1, 2, 3, 4, 5, 6],
    exactB: [7, 8, 9, 10, 11, 12],
    equalVarA: [10, 11, 9, 10, 11, 9],
    equalVarB: [12, 13, 11, 12, 13, 11],
    pairedA: [11, 14, 18, 25, 31, 38],
    pairedB: [10, 12, 15, 21, 26, 32],
    oneSample: [11, 12, 13, 14, 15, 16],
    anovaGroups: [[10, 11, 9, 10, 11, 9], [12, 13, 11, 12, 13, 11], [14, 15, 13, 14, 15, 13]],
    welchGroups: [[5.1, 5.3, 4.9, 5.0, 5.2, 5.1], [7.5, 10.2, 6.8, 11.9, 9.7, 8.4], [2.2, 2.5, 2.0, 2.7, 2.3, 2.4]],
    kruskalGroups: [[1, 2, 2, 3, 3, 4], [5, 6, 6, 7, 7, 8], [2, 2, 3, 3, 4, 4]],
    friedmanExact: [[1, 2, 3], [2, 3, 4], [3, 4, 5]],
    friedmanAsymptotic: [[11, 12, 13, 14, 15, 16, 17, 18], [12, 13, 14, 15, 16, 17, 18, 19], [14, 15, 16, 17, 18, 19, 20, 21]],
    ksA: [0.2, 0.5, 0.9, 1.1, 1.4, 1.8, 2.0, 2.3],
    ksB: [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9]
  };
}

function loadStatsHooks(components) {
  jest.resetModules();
  global.Shared = {};
  global.Components = {};
  const jStatModule = require('jstat');
  const jStat = jStatModule?.jStat || jStatModule;
  global.jStat = jStat;
  if (typeof window !== 'undefined') {
    window.jStat = jStat;
    window.Shared = global.Shared;
    window.Components = global.Components;
  }
  require('../js/vendor.js');
  require('../js/shared/stats.js');
  require('../js/shared/regression.js');
  components.forEach(component => require(`../js/components/${component}.js`));
  return components.reduce((hooks, component) => {
    hooks[component] = window.Components?.[component]?.__testHooks;
    return hooks;
  }, {});
}

module.exports = {
  buildBoxCases,
  compareLinearLikeRegression,
  compareRegressionMetrics,
  compareRegressionPredictions,
  compareSummaryParameters,
  computeSignedRankExactP,
  createSpearmanExactP,
  expectClose,
  expectFinite,
  indexOracleResults,
  loadStatsHooks,
  regressionOperationForMode,
  runPythonOracle,
  sampleModelPoints,
  testWithOracle,
  toPoints,
  uniqueSorted
};
