const {
  runPythonOracle,
  indexOracleResults,
  detectPythonOracleAvailability
} = require('./helpers/pythonOracle');

const oracleAvailability = detectPythonOracleAvailability();
const testWithOracle = oracleAvailability.available ? test : test.skip;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function expectClose(actual, expected, label, tolerance = {}) {
  const abs = isFiniteNumber(tolerance.abs) ? tolerance.abs : 1e-8;
  const rel = isFiniteNumber(tolerance.rel) ? tolerance.rel : 1e-6;
  if (expected == null) {
    expect(actual == null || !Number.isFinite(actual)).toBe(true);
    return;
  }
  if (typeof expected === 'number' && !Number.isFinite(expected)) {
    expect(typeof actual === 'number' && !Number.isFinite(actual)).toBe(true);
    return;
  }
  expect(isFiniteNumber(actual)).toBe(true);
  expect(isFiniteNumber(expected)).toBe(true);
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
  const keys = Array.isArray(options.keys)
    ? options.keys
    : ['sse', 'r2', 'rmse', 'mae'];
  keys.forEach(key => {
    expectClose(actual?.[key], expected?.[key], `${label}.${key}`, options.tolerance || { abs: 1e-6, rel: 1e-5 });
  });
}

function compareLinearLikeRegression(actualRegression, expected, label, options = {}) {
  expect(actualRegression).toBeTruthy();
  expect(expected?.valid).toBe(true);
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
    expectClose(
      actualRegression.summary?.primaryParameter?.value,
      expectedSummary.primaryParameter.value,
      `${label}.summary.primaryParameter.value`,
      tolerance
    );
  }
}

function buildBoxCases() {
  const exactA = [1, 2, 3, 4, 5, 6];
  const exactB = [7, 8, 9, 10, 11, 12];
  const equalVarA = [10, 11, 9, 10, 11, 9];
  const equalVarB = [12, 13, 11, 12, 13, 11];
  const pairedA = [11, 14, 18, 25, 31, 38];
  const pairedB = [10, 12, 15, 21, 26, 32];
  const oneSample = [11, 12, 13, 14, 15, 16];
  const anovaGroups = [
    [10, 11, 9, 10, 11, 9],
    [12, 13, 11, 12, 13, 11],
    [14, 15, 13, 14, 15, 13]
  ];
  const welchGroups = [
    [5.1, 5.3, 4.9, 5.0, 5.2, 5.1],
    [7.5, 10.2, 6.8, 11.9, 9.7, 8.4],
    [2.2, 2.5, 2.0, 2.7, 2.3, 2.4]
  ];
  const kruskalGroups = [
    [1, 2, 2, 3, 3, 4],
    [5, 6, 6, 7, 7, 8],
    [2, 2, 3, 3, 4, 4]
  ];
  const friedmanExact = [
    [1, 2, 3],
    [2, 3, 4],
    [3, 4, 5]
  ];
  const friedmanAsymptotic = [
    [11, 12, 13, 14, 15, 16, 17, 18],
    [12, 13, 14, 15, 16, 17, 18, 19],
    [14, 15, 16, 17, 18, 19, 20, 21]
  ];
  const ksA = [0.2, 0.5, 0.9, 1.1, 1.4, 1.8, 2.0, 2.3];
  const ksB = [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9];

  return {
    exactA,
    exactB,
    equalVarA,
    equalVarB,
    pairedA,
    pairedB,
    oneSample,
    anovaGroups,
    welchGroups,
    kruskalGroups,
    friedmanExact,
    friedmanAsymptotic,
    ksA,
    ksB
  };
}

describe('Generated component statistics matrix', () => {
  let boxHooks;
  let lineHooks;
  let scatterHooks;

  beforeEach(() => {
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
    require('../js/components/box.js');
    require('../js/components/line.js');
    require('../js/components/scatter.js');

    boxHooks = window.Components?.box?.__testHooks;
    lineHooks = window.Components?.line?.__testHooks;
    scatterHooks = window.Components?.scatter?.__testHooks;
  });

  testWithOracle('box matrix covers parametric, non-parametric, paired, unpaired, exact, and asymptotic branches against oracle', () => {
    const data = buildBoxCases();
    expect(boxHooks).toBeTruthy();

    const alternatives = ['two-sided', 'greater', 'less'];
    const cases = [];
    const js = {};

    alternatives.forEach(alternative => {
      const welchId = `box-welch-${alternative}`;
      const pooledId = `box-pooled-${alternative}`;
      const pairedId = `box-paired-${alternative}`;
      const oneSampleId = `box-one-sample-${alternative}`;
      cases.push({ id: welchId, operation: 'box_ttest_welch', payload: { a: data.exactA, b: data.exactB, alternative } });
      cases.push({ id: pooledId, operation: 'box_ttest_equal_variance', payload: { a: data.equalVarA, b: data.equalVarB, alternative } });
      cases.push({ id: pairedId, operation: 'box_ttest_paired', payload: { a: data.pairedA, b: data.pairedB, alternative } });
      cases.push({ id: oneSampleId, operation: 'box_ttest_one_sample', payload: { values: data.oneSample, nullValue: 10, alternative } });
      js[welchId] = boxHooks.tTest(data.exactA, data.exactB, { alternative });
      js[pooledId] = boxHooks.tTestEqualVariance(data.equalVarA, data.equalVarB, { alternative });
      js[pairedId] = boxHooks.tTestPaired(data.pairedA, data.pairedB, { alternative });
      js[oneSampleId] = boxHooks.tTestOneSample(data.oneSample, 10, { alternative });

      const mwExactId = `box-mw-exact-${alternative}`;
      const mwAsymId = `box-mw-asym-${alternative}`;
      const wsrExactId = `box-wsr-exact-${alternative}`;
      const wsrAsymId = `box-wsr-asym-${alternative}`;
      const w1ExactId = `box-w1-exact-${alternative}`;
      const w1AsymId = `box-w1-asym-${alternative}`;
      cases.push({ id: mwExactId, operation: 'box_mann_whitney', payload: { a: data.exactA, b: data.exactB, alternative, resamplingMode: 'auto' } });
      cases.push({ id: mwAsymId, operation: 'box_mann_whitney', payload: { a: data.exactA, b: data.exactB, alternative, resamplingMode: 'asymptotic' } });
      cases.push({ id: wsrExactId, operation: 'box_wilcoxon_signed_rank', payload: { a: data.pairedA, b: data.pairedB, alternative, resamplingMode: 'auto' } });
      cases.push({ id: wsrAsymId, operation: 'box_wilcoxon_signed_rank', payload: { a: data.pairedA, b: data.pairedB, alternative, resamplingMode: 'asymptotic' } });
      cases.push({ id: w1ExactId, operation: 'box_wilcoxon_one_sample', payload: { values: data.oneSample, nullValue: 10, alternative, resamplingMode: 'auto' } });
      cases.push({ id: w1AsymId, operation: 'box_wilcoxon_one_sample', payload: { values: data.oneSample, nullValue: 10, alternative, resamplingMode: 'asymptotic' } });
      js[mwExactId] = boxHooks.mannWhitney(data.exactA, data.exactB, { alternative, resamplingMode: 'auto' });
      js[mwAsymId] = boxHooks.mannWhitney(data.exactA, data.exactB, { alternative, resamplingMode: 'asymptotic' });
      js[wsrExactId] = boxHooks.wilcoxonSignedRank(data.pairedA, data.pairedB, { alternative, resamplingMode: 'auto' });
      js[wsrAsymId] = boxHooks.wilcoxonSignedRank(data.pairedA, data.pairedB, { alternative, resamplingMode: 'asymptotic' });
      js[w1ExactId] = boxHooks.wilcoxonOneSample(data.oneSample, 10, { alternative, resamplingMode: 'auto' });
      js[w1AsymId] = boxHooks.wilcoxonOneSample(data.oneSample, 10, { alternative, resamplingMode: 'asymptotic' });
    });

    cases.push({ id: 'box-anova', operation: 'box_anova', payload: { groups: data.anovaGroups } });
    cases.push({ id: 'box-welch-anova', operation: 'box_welch_anova', payload: { groups: data.welchGroups } });
    cases.push({ id: 'box-kruskal', operation: 'box_kruskal', payload: { groups: data.kruskalGroups } });
    cases.push({ id: 'box-friedman-exact', operation: 'box_friedman', payload: { groups: data.friedmanExact, resamplingMode: 'auto' } });
    cases.push({ id: 'box-friedman-asym', operation: 'box_friedman', payload: { groups: data.friedmanAsymptotic, resamplingMode: 'asymptotic' } });
    cases.push({ id: 'box-rm-anova', operation: 'box_repeated_measures_anova', payload: { groups: data.friedmanAsymptotic } });
    cases.push({ id: 'box-ks', operation: 'box_kolmogorov_smirnov', payload: { a: data.ksA, b: data.ksB } });
    js['box-anova'] = boxHooks.anova(data.anovaGroups);
    js['box-welch-anova'] = boxHooks.welchAnova(data.welchGroups);
    js['box-kruskal'] = boxHooks.kruskalWallis(data.kruskalGroups);
    js['box-friedman-exact'] = boxHooks.friedmanTest(data.friedmanExact, { resamplingMode: 'auto' });
    js['box-friedman-asym'] = boxHooks.friedmanTest(data.friedmanAsymptotic, { resamplingMode: 'asymptotic' });
    js['box-rm-anova'] = boxHooks.repeatedMeasuresAnova(data.friedmanAsymptotic);
    js['box-ks'] = boxHooks.kolmogorovSmirnovTwoSample(data.ksA, data.ksB);

    const oracle = indexOracleResults(runPythonOracle(cases));
    expect(oracle.size).toBe(cases.length);

    alternatives.forEach(alternative => {
      ['welch', 'pooled', 'paired', 'one-sample'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expectClose(js[id].t, ref.t, `${id}.t`, { abs: 1e-6, rel: 1e-5 });
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 1e-6, rel: 1e-5 });
      });
      ['mw-exact', 'mw-asym'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expectClose(js[id].U1, ref.U1, `${id}.U1`, { abs: 1e-6, rel: 1e-5 });
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 2e-3, rel: 2e-3 });
      });
      ['wsr-exact', 'w1-exact'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const exactP = kind === 'wsr-exact'
          ? computeSignedRankExactP(data.pairedA.map((value, index) => value - data.pairedB[index]), alternative)
          : computeSignedRankExactP(data.oneSample.map(value => value - 10), alternative);
        expectClose(js[id].p, exactP, `${id}.p`, { abs: 1e-12, rel: 1e-9 });
      });
      ['wsr-asym', 'w1-asym'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        if (alternative === 'two-sided') {
          expectClose(js[id].W, ref.W, `${id}.W`, { abs: 1e-6, rel: 1e-5 });
        }
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 1e-2, rel: 1e-2 });
      });
    });

    {
      const ref = oracle.get('box-anova')?.result;
      expectClose(js['box-anova'].F, ref.F, 'box-anova.F', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-anova'].p, ref.p, 'box-anova.p', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = oracle.get('box-welch-anova')?.result;
      expect(js['box-welch-anova'].ok).toBe(true);
      expectClose(js['box-welch-anova'].F, ref.F, 'box-welch-anova.F', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-welch-anova'].p, ref.p, 'box-welch-anova.p', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-welch-anova'].df1, ref.df1, 'box-welch-anova.df1', { abs: 0, rel: 0 });
      expectClose(js['box-welch-anova'].df2, ref.df2, 'box-welch-anova.df2', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = oracle.get('box-kruskal')?.result;
      expectClose(js['box-kruskal'].H, ref.H, 'box-kruskal.H', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-kruskal'].p, ref.p, 'box-kruskal.p', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = oracle.get('box-friedman-exact')?.result;
      expect(js['box-friedman-exact'].ok).toBe(true);
      expectClose(js['box-friedman-exact'].Q, ref.Q, 'box-friedman-exact.Q', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-friedman-exact'].p, ref.p, 'box-friedman-exact.p', { abs: 1e-10, rel: 1e-8 });
    }
    {
      const ref = oracle.get('box-friedman-asym')?.result;
      expect(js['box-friedman-asym'].ok).toBe(true);
      expectClose(js['box-friedman-asym'].Q, ref.Q, 'box-friedman-asym.Q', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-friedman-asym'].p, ref.p, 'box-friedman-asym.p', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = oracle.get('box-rm-anova')?.result;
      expect(js['box-rm-anova'].ok).toBe(true);
      expectClose(js['box-rm-anova'].F, ref.F, 'box-rm-anova.F', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-rm-anova'].p, ref.p, 'box-rm-anova.p', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = oracle.get('box-ks')?.result;
      expectClose(js['box-ks'].D, ref.D, 'box-ks.D', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-ks'].p, ref.p, 'box-ks.p', { abs: 5e-4, rel: 1e-3 });
    }
  });

  test('box Monte Carlo wiring is deterministic with seed and responsive to iteration changes', () => {
    const mwA = [1, 1, 2, 2, 3, 3, 4, 4];
    const mwB = [2, 2, 3, 3, 4, 4, 5, 5];
    const wA = [10, 10, 11, 11, 12, 12];
    const wB = [9, 9, 10, 10, 11, 11];
    const friedmanMc = [
      [1, 2, 2, 3, 3, 4],
      [2, 2, 3, 3, 4, 4],
      [3, 3, 4, 4, 5, 5]
    ];

    const mw1 = boxHooks.mannWhitney(mwA, mwB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 99 });
    const mw2 = boxHooks.mannWhitney(mwA, mwB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 99 });
    const mw3 = boxHooks.mannWhitney(mwA, mwB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 1000, seed: 99 });
    expectClose(mw1.p, mw2.p, 'mw auto deterministic', { abs: 0, rel: 0 });
    expect(mw3.p).not.toBe(mw1.p);

    const wsr1 = boxHooks.wilcoxonSignedRank(wA, wB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 17 });
    const wsr2 = boxHooks.wilcoxonSignedRank(wA, wB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 17 });
    const wsr3 = boxHooks.wilcoxonSignedRank(wA, wB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 1000, seed: 17 });
    expectClose(wsr1.p, wsr2.p, 'wsr auto deterministic', { abs: 0, rel: 0 });
    expect(wsr3.p).not.toBe(wsr1.p);

    const fried1 = boxHooks.friedmanTest(friedmanMc, { resamplingMode: 'auto', iterations: 600, seed: 123 });
    const fried2 = boxHooks.friedmanTest(friedmanMc, { resamplingMode: 'auto', iterations: 600, seed: 123 });
    const fried3 = boxHooks.friedmanTest(friedmanMc, { resamplingMode: 'auto', iterations: 1200, seed: 123 });
    expect(fried1.ok).toBe(true);
    expectClose(fried1.p, fried2.p, 'friedman auto deterministic', { abs: 0, rel: 0 });
    expect(fried3.p).not.toBe(fried1.p);
  });

  test('box tied Wilcoxon signed-rank Monte Carlo stays significant for strong paired shifts', () => {
    const a = [10, 11, 9, 10, 12, 11, 10, 9, 11, 10, 12, 11];
    const b = [20, 21, 19, 20, 22, 21, 20, 19, 21, 20, 22, 21];

    const auto = boxHooks.wilcoxonSignedRank(a, b, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 10000, seed: 1337 });
    const mc = boxHooks.wilcoxonSignedRank(a, b, { alternative: 'two-sided', resamplingMode: 'monte-carlo', iterations: 10000, seed: 1337 });
    const asym = boxHooks.wilcoxonSignedRank(a, b, { alternative: 'two-sided', resamplingMode: 'asymptotic' });

    expect(auto.method).toBe('monte-carlo');
    expect(mc.method).toBe('monte-carlo');
    expect(auto.p).toBeLessThan(0.01);
    expect(mc.p).toBeLessThan(0.01);
    expectClose(auto.p, mc.p, 'wilcoxon monte-carlo auto/manual parity', { abs: 0, rel: 0 });
    expectClose(mc.p, asym.p, 'wilcoxon monte-carlo vs asymptotic tie-heavy shift', { abs: 0.01, rel: 0.25 });
  });

  testWithOracle('line matrix covers visible correlation and regression modes against oracle', () => {
    expect(lineHooks).toBeTruthy();

    const lineSpecs = [
      {
        mode: 'linear',
        x: [-3, -2, -1, 0, 1, 2, 3, 4, 5],
        y: [-3.7, -1.8, -0.1, 1.6, 3.2, 5.1, 6.8, 8.5, 10.3]
      },
      {
        mode: 'quadratic',
        x: [-3, -2, -1, 0, 1, 2, 3, 4],
        y: [16.1, 8.4, 3.0, 1.2, 2.8, 7.7, 15.9, 27.4]
      },
      {
        mode: 'cubic',
        x: [-3, -2, -1, 0, 1, 2, 3, 4],
        y: [-13.2, -2.5, 0.4, 1.1, 2.0, 6.8, 18.9, 42.5]
      },
      {
        mode: 'exponential',
        x: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
        y: [2.2, 2.7, 3.6, 4.6, 6.0, 7.8, 10.1, 12.8]
      },
      {
        mode: 'power',
        x: [1, 2, 3, 4, 5, 6, 7, 8],
        y: [2.6, 7.1, 13.5, 21.1, 29.6, 39.2, 49.7, 61.4]
      },
      {
        mode: 'spline',
        x: [0, 1, 2, 3, 4, 5],
        y: [0, 1.6, 0.4, 1.9, 0.3, 1.4]
      },
      {
        mode: 'logistic',
        x: [-3, -2.5, -2, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3],
        y: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]
      }
    ];
    const methods = ['pearson', 'spearman'];
    const cases = [];
    const js = {};

    lineSpecs.forEach(spec => {
      methods.forEach(method => {
        const id = `line-${spec.mode}-${method}`;
        const oracleRegression = regressionOperationForMode(spec.mode);
        const exactEligibleSpearman = method === 'spearman'
          && spec.x.length <= 9
          && (new Set(spec.x)).size === spec.x.length
          && (new Set(spec.y)).size === spec.y.length;
        cases.push({ id: `${id}-regression`, operation: oracleRegression.operation, payload: { x: spec.x, y: spec.y, alpha: 0.05, ...oracleRegression.payloadExtra } });
        cases.push({ id: `${id}-correlation`, operation: 'correlation', payload: { method, x: spec.x, y: spec.y, exactPermutation: exactEligibleSpearman } });
        js[id] = lineHooks.computeLineStats(toPoints(spec.x, spec.y), method, { regressionMode: spec.mode });
      });
    });

    const oracle = indexOracleResults(runPythonOracle(cases));

    lineSpecs.forEach(spec => {
      methods.forEach(method => {
        const id = `line-${spec.mode}-${method}`;
        const regressionRef = oracle.get(`${id}-regression`)?.result;
        const corrRef = oracle.get(`${id}-correlation`)?.result;
        const actual = js[id];
        expect(actual).toBeTruthy();
        expectClose(actual.r, corrRef.r, `${id}.r`, { abs: 1e-8, rel: 1e-6 });
        expectClose(actual.p, corrRef.p, `${id}.p`, { abs: 1e-5, rel: 1e-4 });
        compareLinearLikeRegression(actual.regression, regressionRef, `${id}.regression`, {
          keys: spec.mode === 'logistic'
            ? ['sse', 'r2', 'rmse', 'mae', 'logLoss']
            : ['sse', 'r2', 'rmse', 'mae'],
          skipCoefficients: spec.mode === 'exponential' || spec.mode === 'power'
        });
        if (spec.mode === 'exponential') {
          expectClose(actual.regression?.summary?.parameters?.Amplitude, regressionRef?.summary?.amplitude, `${id}.amplitude`, { abs: 1e-5, rel: 1e-4 });
          expectClose(actual.regression?.summary?.parameters?.Rate, regressionRef?.summary?.rate, `${id}.rate`, { abs: 1e-5, rel: 1e-4 });
        }
        if (spec.mode === 'power') {
          expectClose(actual.regression?.summary?.parameters?.Scale, regressionRef?.summary?.scale, `${id}.scale`, { abs: 1e-5, rel: 1e-4 });
          expectClose(actual.regression?.summary?.parameters?.Exponent, regressionRef?.summary?.exponent, `${id}.exponent`, { abs: 1e-5, rel: 1e-4 });
        }
      });
    });
  });

  testWithOracle('line exact Spearman branch and forecast modes are differentially validated against oracle', () => {
    const exactX = [1, 2, 3, 4, 5, 6, 7];
    const exactY = [4, 1, 6, 2, 7, 3, 5];
    const exact = lineHooks.computeLineStats(toPoints(exactX, exactY), 'spearman', { regressionMode: 'linear' });
    const exactP = createSpearmanExactP(exact.r, exactX.length);
    expect(String(exact.pMethod || '').toLowerCase()).toContain('exact');
    expectClose(exact.p, exactP, 'line spearman exact p', { abs: 1e-12, rel: 1e-9 });

    const arimaX = Array.from({ length: 18 }, (_, idx) => idx + 1);
    const arimaY = [10, 12, 11, 13, 15, 14, 16, 18, 17, 19, 21, 20, 22, 24, 23, 25, 27, 26];
    const seasonalX = Array.from({ length: 20 }, (_, idx) => idx + 1);
    const seasonalY = [18, 24, 29, 22, 21, 27, 32, 25, 24, 30, 35, 28, 27, 33, 38, 31, 30, 36, 41, 34];
    const arimaPoints = toPoints(arimaX, arimaY);
    const seasonalPoints = toPoints(seasonalX, seasonalY);

    const specs = [
      {
        id: 'line-arima-manual',
        mode: 'arima',
        points: arimaPoints,
        forecast: { horizon: 4, p: 1, d: 0, autoTune: false },
        summaryKeys: ['Horizon', 'AR order (p)', 'Differencing (d)', 'AR1']
      },
      {
        id: 'line-arima-auto',
        mode: 'arima',
        points: arimaPoints,
        forecast: { horizon: 5, autoTune: true, criterion: 'bic', maxP: 2, maxD: 1 },
        summaryKeys: ['Horizon', 'AR order (p)', 'Differencing (d)']
      },
      {
        id: 'line-hw-manual',
        mode: 'holtWinters',
        points: seasonalPoints,
        forecast: { horizon: 4, seasonLength: 4, autoTune: false, level: 0.2, trend: 0.1, seasonal: 0.1 },
        summaryKeys: ['Season length', 'Horizon', 'Level α', 'Trend β', 'Season γ', 'Seasonal 1', 'Seasonal 2', 'Seasonal 3', 'Seasonal 4']
      },
      {
        id: 'line-hw-auto',
        mode: 'holtWinters',
        points: seasonalPoints,
        forecast: { horizon: 5, seasonLength: 4, autoTune: true, criterion: 'bic' },
        summaryKeys: ['Season length', 'Horizon', 'Level α', 'Trend β', 'Season γ', 'Seasonal 1', 'Seasonal 2', 'Seasonal 3', 'Seasonal 4']
      }
    ];

    const cases = specs.map(spec => ({
      id: spec.id,
      operation: regressionOperationForMode(spec.mode).operation,
      payload: {
        x: spec.points.map(point => point.x),
        y: spec.points.map(point => point.y),
        forecast: spec.forecast
      }
    }));
    const oracle = indexOracleResults(runPythonOracle(cases));

    specs.forEach(spec => {
      const actual = lineHooks.computeLineStats(spec.points, 'pearson', { regressionMode: spec.mode, forecast: spec.forecast });
      const ref = oracle.get(spec.id)?.result;
      expect(actual?.regression?.mode).toBe(spec.mode);
      compareRegressionMetrics(actual.regression?.metrics, ref?.metrics, `${spec.id}.metrics`, {
        keys: ['sse', 'rmse', 'mae', 'mape', 'smape', 'aic', 'bic', 'horizon'],
        tolerance: { abs: 1e-6, rel: 1e-5 }
      });
      compareSummaryParameters(actual.regression, ref?.summary, spec.summaryKeys, spec.id, { abs: 1e-6, rel: 1e-5 });
      expect(actual.regression?.forecast?.points?.length).toBe(ref?.forecast?.points?.length);
      ref.forecast.points.forEach((point, index) => {
        expectClose(actual.regression?.forecast?.points?.[index]?.x, point.x, `${spec.id}.forecast[${index}].x`, { abs: 1e-8, rel: 1e-8 });
        expectClose(actual.regression?.forecast?.points?.[index]?.y, point.y, `${spec.id}.forecast[${index}].y`, { abs: 1e-6, rel: 1e-5 });
        expectClose(actual.regression?.forecast?.points?.[index]?.lower, point.lower, `${spec.id}.forecast[${index}].lower`, { abs: 1e-6, rel: 1e-5 });
        expectClose(actual.regression?.forecast?.points?.[index]?.upper, point.upper, `${spec.id}.forecast[${index}].upper`, { abs: 1e-6, rel: 1e-5 });
        expectClose(actual.regression?.forecast?.points?.[index]?.stdErr, point.stdErr, `${spec.id}.forecast[${index}].stdErr`, { abs: 1e-6, rel: 1e-5 });
        if (spec.mode === 'holtWinters') {
          expectClose(actual.regression?.forecast?.points?.[index]?.seasonal, point.seasonal, `${spec.id}.forecast[${index}].seasonal`, { abs: 1e-6, rel: 1e-5 });
        }
      });
      if (spec.mode === 'holtWinters') {
        expect(actual.regression?.forecast?.seasonLength).toBe(ref?.forecast?.seasonLength);
      }
    });
  });

  testWithOracle('scatter oracle-backed matrix covers supported regression families and parameter routing', () => {
    expect(scatterHooks).toBeTruthy();

    const saturatingX = [0.2, 0.4, 0.8, 1.5, 2.5, 4, 6, 9, 13, 18];
    const logDoseX = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
    const gaussianX = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
    const lowessX = [0, 1, 2, 3, 4, 5, 6, 7];
    const scatterSpecs = [
      {
        mode: 'linear',
        x: [1, 2, 3, 4, 5, 6, 7, 8],
        y: [3.1, 4.8, 6.9, 8.7, 10.2, 12.1, 14.3, 15.8],
        expectedAssociation: 'pearson',
        fitSpec: {}
      },
      {
        mode: 'linearThroughOrigin',
        x: [1, 2, 3, 4, 5, 6, 7, 8],
        y: [2.0, 4.1, 5.9, 8.2, 10.0, 11.7, 14.1, 15.8],
        expectedAssociation: 'pearson',
        fitSpec: {}
      },
      {
        mode: 'quadratic',
        x: [-3, -2, -1, 0, 1, 2, 3, 4],
        y: [15.7, 8.1, 3.2, 1.0, 2.7, 7.8, 15.8, 27.2],
        expectedAssociation: 'none',
        fitSpec: {}
      },
      {
        mode: 'cubic',
        x: [-3, -2, -1, 0, 1, 2, 3, 4],
        y: [-13.1, -2.4, 0.2, 1.1, 2.3, 6.9, 18.7, 42.7],
        expectedAssociation: 'none',
        fitSpec: {}
      },
      {
        mode: 'exponential',
        x: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
        y: [2.2, 2.8, 3.5, 4.7, 6.0, 7.7, 10.0, 12.7],
        expectedAssociation: 'spearman',
        fitSpec: {}
      },
      {
        mode: 'power',
        x: [1, 2, 3, 4, 5, 6, 7, 8],
        y: [2.8, 7.3, 13.2, 21.0, 29.4, 39.0, 49.5, 61.2],
        expectedAssociation: 'spearman',
        fitSpec: {}
      },
      {
        mode: 'logistic',
        x: [-3, -2.5, -2, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3],
        y: [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1],
        expectedAssociation: 'spearman',
        fitSpec: {}
      },
      {
        mode: 'spline',
        x: [0, 1, 2, 3, 4, 5],
        y: [0, 1.5, 0.3, 1.8, 0.2, 1.4],
        expectedAssociation: 'none',
        fitSpec: {}
      },
      {
        mode: 'deming',
        x: [1, 2, 3, 4, 5, 6, 7, 8],
        y: [3.4, 5.2, 7.7, 9.5, 11.8, 14.1, 15.9, 18.5],
        expectedAssociation: 'pearson',
        fitSpec: { errorRatio: 2.5 }
      },
      {
        mode: 'orthogonal',
        x: [1, 2, 3, 4, 5, 6, 7, 8],
        y: [3.4, 5.2, 7.7, 9.5, 11.8, 14.1, 15.9, 18.5],
        expectedAssociation: 'pearson',
        fitSpec: {}
      },
      {
        mode: 'doseResponse3pl',
        points: sampleModelPoints(logDoseX, x => 92 / (1 + Math.pow(10, (0.35 - x) * 1.15))),
        expectedAssociation: 'spearman',
        fitSpec: {},
        summaryKeys: ['Bottom', 'Top', 'LogIC50', 'IC50', 'HillSlope']
      },
      {
        mode: 'doseResponse4pl',
        points: sampleModelPoints(logDoseX, x => 7 + ((96 - 7) / (1 + Math.pow(10, (0.25 - x) * 1.2)))),
        expectedAssociation: 'spearman',
        fitSpec: {},
        summaryKeys: ['Bottom', 'Top', 'LogIC50', 'IC50', 'HillSlope']
      },
      {
        mode: 'doseResponse5pl',
        points: sampleModelPoints(logDoseX, x => 5 + ((90 - 5) / Math.pow(1 + Math.pow(10, (0.15 - x) * 1.05), 1.35))),
        expectedAssociation: 'spearman',
        fitSpec: {}
      },
      {
        mode: 'onePhaseAssociation',
        points: sampleModelPoints(saturatingX, x => 3 + ((48 - 3) * (1 - Math.exp(-0.24 * x)))),
        expectedAssociation: 'spearman',
        fitSpec: {},
        summaryKeys: ['Y0', 'Plateau', 'K']
      },
      {
        mode: 'onePhaseDecay',
        points: sampleModelPoints(saturatingX, x => 8 + ((75 - 8) * Math.exp(-0.2 * x))),
        expectedAssociation: 'spearman',
        fitSpec: {},
        summaryKeys: ['Y0', 'Plateau', 'K']
      },
      {
        mode: 'gompertz',
        points: sampleModelPoints(saturatingX, x => 4 + ((98 - 4) * Math.exp(-Math.exp(-0.42 * (x - 5.5))))),
        expectedAssociation: 'spearman',
        fitSpec: {},
        summaryKeys: ['Lower', 'Upper', 'K', 'X0']
      },
      {
        mode: 'gaussian',
        points: sampleModelPoints(gaussianX, x => 1.5 + (19 * Math.exp(-0.5 * Math.pow((x - 0.5) / 1.4, 2)))),
        expectedAssociation: 'none',
        fitSpec: {},
        summaryKeys: ['Baseline', 'Amplitude', 'Center', 'Sigma']
      },
      {
        mode: 'bindingSaturation',
        points: sampleModelPoints(saturatingX, x => ((82 * x) / (2.8 + x)) + (0.45 * x)),
        expectedAssociation: 'spearman',
        fitSpec: {},
        summaryKeys: ['Bmax', 'Kd', 'NS']
      },
      {
        mode: 'bindingCompetitive',
        points: sampleModelPoints(saturatingX, x => 6 + ((97 - 6) / (1 + Math.pow(x / 3.8, 1.25)))),
        expectedAssociation: 'spearman',
        fitSpec: {},
        summaryKeys: ['Top', 'Bottom', 'IC50', 'HillSlope']
      },
      {
        mode: 'enzymeKineticsSubstrate',
        points: sampleModelPoints(saturatingX, x => 2 + ((88 * x) / (2.4 + x))),
        expectedAssociation: 'spearman',
        fitSpec: {},
        summaryKeys: ['Vmax', 'Km', 'Baseline']
      },
      {
        mode: 'enzymeKineticsInhibition',
        points: sampleModelPoints(saturatingX, x => 4 + (84 / (1 + Math.pow(x / 3.2, 1.4)))),
        expectedAssociation: 'spearman',
        fitSpec: {},
        summaryKeys: ['Vmax', 'IC50', 'HillSlope', 'Baseline']
      }
    ];

    const cases = [];
    const js = {};

    scatterSpecs.forEach(spec => {
      const points = Array.isArray(spec.points) ? spec.points : toPoints(spec.x, spec.y);
      const x = points.map(point => point.x);
      const y = points.map(point => point.y);
      const op = regressionOperationForMode(spec.mode);
      const payload = {
        x,
        y,
        alpha: 0.05,
        evalXs: uniqueSorted(x),
        ...op.payloadExtra
      };
      if (spec.mode === 'deming') {
        payload.errorRatio = spec.fitSpec.errorRatio;
      }
      if (spec.mode === 'lowess') {
        payload.span = spec.fitSpec.span;
      }
      cases.push({ id: `scatter-${spec.mode}-regression`, operation: op.operation, payload });
      if (spec.expectedAssociation !== 'none') {
        cases.push({ id: `scatter-${spec.mode}-correlation`, operation: 'correlation', payload: { method: spec.expectedAssociation, x, y } });
      }
      js[spec.mode] = scatterHooks.computeScatterStats(
        points,
        'auto',
        { regressionMode: spec.mode, associationSelection: 'auto', fitMethod: 'ols', fitSpec: spec.fitSpec }
      );
    });

    const oracle = indexOracleResults(runPythonOracle(cases));
    const predictionModes = new Set([
      'lowess',
      'spline',
      'doseResponse3pl',
      'doseResponse4pl',
      'doseResponse5pl',
      'onePhaseAssociation',
      'onePhaseDecay',
      'gompertz',
      'gaussian',
      'bindingSaturation',
      'bindingCompetitive',
      'enzymeKineticsSubstrate',
      'enzymeKineticsInhibition'
    ]);

    scatterSpecs.forEach(spec => {
      const actual = js[spec.mode];
      const regressionRef = oracle.get(`scatter-${spec.mode}-regression`)?.result;
      const metricTolerance = spec.mode === 'doseResponse5pl'
        ? { abs: 1e-1, rel: 1e-2 }
        : ((spec.mode === 'deming' || spec.mode === 'orthogonal')
          ? { abs: 2e-4, rel: 1e-3 }
          : { abs: 1e-5, rel: 1e-4 });
      const predictionTolerance = spec.mode === 'doseResponse5pl'
        ? { abs: 2e-1, rel: 2e-2 }
        : { abs: 1e-5, rel: 1e-4 };
      const summaryTolerance = spec.mode === 'doseResponse5pl'
        ? { abs: 2e-1, rel: 2e-2 }
        : { abs: 1e-4, rel: 1e-3 };
      expect(actual).toBeTruthy();
      expect(actual.associationMethod).toBe(spec.expectedAssociation);
      if (spec.expectedAssociation !== 'none') {
        const corrRef = oracle.get(`scatter-${spec.mode}-correlation`)?.result;
        expectClose(actual.r, corrRef.r, `scatter-${spec.mode}.r`, { abs: 1e-6, rel: 1e-5 });
        expectClose(actual.p, corrRef.p, `scatter-${spec.mode}.p`, { abs: 1e-5, rel: 1e-4 });
      }
      compareRegressionMetrics(actual.regression?.metrics, regressionRef?.metrics, `scatter-${spec.mode}.metrics`, {
        keys: (spec.mode === 'deming' || spec.mode === 'orthogonal')
          ? ['sse', 'rmse', 'mae']
          : (spec.mode === 'logistic'
            ? ['sse', 'r2', 'rmse', 'mae', 'logLoss']
            : ['sse', 'r2', 'rmse', 'mae']),
        tolerance: metricTolerance
      });
      if (predictionModes.has(spec.mode)) {
        const evalXs = uniqueSorted((Array.isArray(spec.points) ? spec.points : toPoints(spec.x, spec.y)).map(point => point.x));
        compareRegressionPredictions(actual.regression, evalXs, regressionRef.predictions, `scatter-${spec.mode}`, predictionTolerance);
        if (Array.isArray(spec.summaryKeys) && spec.summaryKeys.length) {
          compareSummaryParameters(actual.regression, regressionRef.summary, spec.summaryKeys, `scatter-${spec.mode}`, summaryTolerance);
        }
      } else if ((spec.mode === 'exponential') || (spec.mode === 'power')) {
        if (spec.mode === 'exponential') {
          expectClose(actual.regression?.summary?.parameters?.Amplitude, regressionRef?.summary?.amplitude, `scatter-${spec.mode}.amplitude`, { abs: 1e-5, rel: 1e-4 });
          expectClose(actual.regression?.summary?.parameters?.Rate, regressionRef?.summary?.rate, `scatter-${spec.mode}.rate`, { abs: 1e-5, rel: 1e-4 });
        } else {
          expectClose(actual.regression?.summary?.parameters?.Scale, regressionRef?.summary?.scale, `scatter-${spec.mode}.scale`, { abs: 1e-5, rel: 1e-4 });
          expectClose(actual.regression?.summary?.parameters?.Exponent, regressionRef?.summary?.exponent, `scatter-${spec.mode}.exponent`, { abs: 1e-5, rel: 1e-4 });
        }
      } else if (Array.isArray(regressionRef?.coefficients) && regressionRef.coefficients.length) {
        regressionRef.coefficients.forEach((value, index) => {
          expectClose(
            actual.regression?.coefficients?.[index],
            value,
            `scatter-${spec.mode}.coefficients[${index}]`,
            (spec.mode === 'deming' || spec.mode === 'orthogonal')
              ? { abs: 1e-2, rel: 1e-2 }
              : { abs: 1e-4, rel: 1e-3 }
          );
        });
      }
    });
  });

  testWithOracle('scatter LOWESS fitter is differentially validated against oracle', () => {
    expect(typeof scatterHooks?.fitScatterLowessRegression).toBe('function');
    const points = toPoints(
      [0, 1, 2, 3, 4, 5, 6, 7],
      [1.2, 2.8, 2.1, 4.4, 3.6, 5.1, 4.8, 6.2]
    );
    const x = points.map(point => point.x);
    const y = points.map(point => point.y);
    const span = 0.65;
    const actual = scatterHooks.fitScatterLowessRegression(points, { fitSpec: { span } });
    const oracle = indexOracleResults(runPythonOracle([
      {
        id: 'scatter-lowess-direct',
        operation: 'regression_lowess',
        payload: { x, y, span, evalXs: uniqueSorted(x) }
      }
    ]));
    const ref = oracle.get('scatter-lowess-direct')?.result;

    expect(actual).toBeTruthy();
    compareRegressionMetrics(actual.metrics, ref.metrics, 'scatter-lowess-direct.metrics', {
      keys: ['sampleSize', 'parameterCount', 'residualDf', 'sse', 'r2', 'rmse', 'mae', 'aic', 'aicc', 'bic'],
      tolerance: { abs: 1e-6, rel: 1e-5 }
    });
    compareRegressionPredictions(actual, uniqueSorted(x), ref.predictions, 'scatter-lowess-direct', { abs: 1e-6, rel: 1e-5 });
    compareSummaryParameters({ summary: actual.summary }, ref.summary, ['Span'], 'scatter-lowess-direct', { abs: 1e-12, rel: 1e-9 });
  });

  test('scatter visible modes all execute, auto-association matches policy, and special routing is exercised', () => {
    const linearData = toPoints(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [3.0, 4.5, 5.7, 7.8, 9.9, 11.2, 13.5, 15.7, 17.8, 19.9]
    );
    const saturatingData = toPoints(
      [0.2, 0.4, 0.8, 1.5, 2.5, 4, 6, 9, 13, 18],
      [4.3, 8.8, 16.8, 28.1, 42.3, 58.5, 73.3, 86.2, 94.1, 98.2]
    );
    const decayData = toPoints(
      [0.2, 0.4, 0.8, 1.5, 2.5, 4, 6, 9, 13, 18],
      [101.2, 95.8, 88.1, 79.3, 67.8, 53.4, 39.5, 25.8, 15.2, 8.7]
    );
    const bellData = toPoints(
      [-4, -3, -2, -1, 0, 1, 2, 3, 4],
      [1.4, 3.1, 8.8, 16.2, 21.0, 16.2, 8.8, 3.1, 1.4]
    );
    const powerData = toPoints(
      [1, 2, 3, 4, 5, 6, 7, 8],
      [3.0, 7.4, 13.1, 20.8, 29.3, 38.9, 49.2, 60.6]
    );
    const binaryLogisticData = toPoints(
      [-3, -2.5, -2, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3],
      [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]
    );

    const visibleModes = [
      { mode: 'linear', expectedAssociation: 'pearson', points: linearData },
      { mode: 'linearThroughOrigin', expectedAssociation: 'pearson', points: linearData },
      { mode: 'quadratic', expectedAssociation: 'none', points: linearData },
      { mode: 'cubic', expectedAssociation: 'none', points: linearData },
      { mode: 'logistic', expectedAssociation: 'spearman', points: binaryLogisticData },
      { mode: 'doseResponse3pl', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'doseResponse4pl', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'doseResponse5pl', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'exponential', expectedAssociation: 'spearman', points: decayData },
      { mode: 'onePhaseAssociation', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'onePhaseDecay', expectedAssociation: 'spearman', points: decayData },
      { mode: 'gompertz', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'power', expectedAssociation: 'spearman', points: powerData },
      { mode: 'gaussian', expectedAssociation: 'none', points: bellData },
      { mode: 'spline', expectedAssociation: 'none', points: linearData },
      { mode: 'bindingSaturation', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'bindingCompetitive', expectedAssociation: 'spearman', points: decayData },
      { mode: 'enzymeKineticsSubstrate', expectedAssociation: 'spearman', points: saturatingData },
      { mode: 'enzymeKineticsInhibition', expectedAssociation: 'spearman', points: decayData },
      { mode: 'deming', expectedAssociation: 'pearson', points: linearData },
      { mode: 'orthogonal', expectedAssociation: 'pearson', points: linearData },
      { mode: 'lowess', expectedAssociation: 'none', points: linearData }
    ];

    visibleModes.forEach(entry => {
      const stats = scatterHooks.computeScatterStats(entry.points, 'auto', {
        regressionMode: entry.mode,
        associationSelection: 'auto',
        fitMethod: 'ols',
        fitSpec: entry.mode === 'lowess' ? { span: 0.65 } : {}
      });
      expect(stats).toBeTruthy();
      expect(stats.regression).toBeTruthy();
      expect(stats.associationMethod).toBe(entry.expectedAssociation);
      expectFinite(stats.pointCount, `${entry.mode}.pointCount`);
      expect(Array.isArray(stats.regression.warnings || [])).toBe(true);
    });

    const nonBinaryLogistic = scatterHooks.computeScatterStats(saturatingData, 'auto', {
      regressionMode: 'logistic',
      associationSelection: 'auto'
    });
    expect(nonBinaryLogistic.regression).toBeTruthy();
    expect(String(nonBinaryLogistic.regression.mode || '').toLowerCase()).toBe('doseresponse4pl');
    expect(nonBinaryLogistic.regression.warnings.join(' ')).toContain('four-parameter dose-response');

    const outlierData = toPoints(
      [1, 2, 3, 4, 5, 6, 7, 8],
      [2.0, 4.1, 6.3, 8.0, 10.2, 12.1, 14.0, 100]
    );
    const linearOls = scatterHooks.computeScatterStats(outlierData, 'auto', { regressionMode: 'linear', fitMethod: 'ols', associationSelection: 'auto' });
    const linearWls = scatterHooks.computeScatterStats(outlierData, 'auto', { regressionMode: 'linear', fitMethod: 'wls_y2', associationSelection: 'auto' });
    expect(String(linearOls.regression?.fitMethod || '').toLowerCase()).toBe('ols');
    expect(String(linearWls.regression?.fitMethod || '').toLowerCase()).not.toBe('ols');
    expect(linearWls.regression?.summary).toBeTruthy();

    const lowessTight = scatterHooks.computeScatterStats(linearData, 'auto', { regressionMode: 'lowess', associationSelection: 'auto', fitSpec: { span: 0.3 } });
    const lowessWide = scatterHooks.computeScatterStats(linearData, 'auto', { regressionMode: 'lowess', associationSelection: 'auto', fitSpec: { span: 0.9 } });
    expect(lowessTight.associationMethod).toBe('none');
    expect(lowessWide.associationMethod).toBe('none');
    expectClose(lowessTight.regression?.fitSpec?.span, 0.3, 'lowess tight span', { abs: 1e-12, rel: 1e-9 });
    expectClose(lowessWide.regression?.fitSpec?.span, 0.9, 'lowess wide span', { abs: 1e-12, rel: 1e-9 });
  });
});
