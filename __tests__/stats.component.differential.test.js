const { runPythonOracle, indexOracleResults } = require('./helpers/pythonOracle');

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
  expect(isFiniteNumber(actual)).toBe(true);
  expect(isFiniteNumber(expected)).toBe(true);
  const diff = Math.abs(actual - expected);
  const limit = Math.max(abs, rel * Math.max(1, Math.abs(expected)));
  if (diff > limit) {
    throw new Error(`${label} mismatch: actual=${actual}, expected=${expected}, diff=${diff}, limit=${limit}`);
  }
}

function createRng(seed = 123456789) {
  let state = seed >>> 0;
  return () => {
    state = ((1664525 * state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randn(rng) {
  const u1 = Math.max(1e-12, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

describe('Component statistical engines vs Python oracle', () => {
  let boxHooks;
  let histHooks;
  let pieHooks;
  let rocHooks;
  let lineHooks;
  let scatterHooks;
  let survivalHooks;

  const boxA = [12, 14, 11, 13, 15, 16, 14, 13, 12, 15];
  const boxB = [15, 17, 14, 16, 18, 19, 16, 15, 14, 17];
  const boxC = [9, 10, 11, 10, 12, 13, 11, 9, 10, 12];
  const pairedA = [22, 19, 25, 27, 30, 24, 26, 28];
  const pairedB = [20, 18, 23, 24, 29, 22, 24, 26];
  const ratioA = [4.2, 5.1, 6.8, 7.4, 8.9, 10.2, 11.6, 13.1];
  const ratioB = [3.1, 4.0, 5.4, 5.9, 7.1, 8.0, 9.4, 10.5];
  const logBoxA = [2.2, 2.8, 3.5, 4.9, 5.6, 6.4, 7.8, 9.1];
  const logBoxB = [1.8, 2.1, 2.9, 3.2, 4.4, 5.1, 5.7, 6.8];
  const logBoxC = [2.7, 3.6, 4.1, 5.8, 6.5, 7.9, 9.6, 11.2];
  const boxLabels = ['A', 'B', 'C'];

  const friedmanGroups = [
    [11, 12, 13, 14, 15, 16, 14, 13, 17, 18, 16, 15, 19, 20, 18],
    [12, 13, 14, 15, 16, 17, 15, 14, 18, 19, 17, 16, 20, 21, 19],
    [14, 15, 16, 17, 18, 19, 17, 16, 20, 21, 19, 18, 22, 23, 21]
  ];

  const pieObserved = [120, 90, 60, 130];
  const pieExpected = [100, 100, 80, 120];

  const rocPairs1 = [
    { label: 1, score: 0.95 }, { label: 1, score: 0.90 }, { label: 1, score: 0.84 }, { label: 1, score: 0.82 },
    { label: 1, score: 0.78 }, { label: 1, score: 0.76 }, { label: 1, score: 0.71 }, { label: 1, score: 0.66 },
    { label: 1, score: 0.62 }, { label: 1, score: 0.58 }, { label: 0, score: 0.73 }, { label: 0, score: 0.69 },
    { label: 0, score: 0.61 }, { label: 0, score: 0.57 }, { label: 0, score: 0.52 }, { label: 0, score: 0.49 },
    { label: 0, score: 0.42 }, { label: 0, score: 0.37 }, { label: 0, score: 0.33 }, { label: 0, score: 0.27 }
  ];
  const rocPairs2 = rocPairs1.map((row, idx) => ({
    label: row.label,
    score: row.label === 1 ? row.score - 0.04 + ((idx % 3) * 0.005) : row.score + 0.03 - ((idx % 4) * 0.004)
  }));

  const corrX = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const corrY = [2.2, 4.2, 6.3, 8.1, 9.6, 12.5, 13.9, 16.2, 17.4, 20.1, 22.2, 23.8];

  const survivalSeries = [
    {
      name: 'Control',
      records: [
        { time: 2.0, event: true }, { time: 3.1, event: false }, { time: 4.2, event: true }, { time: 5.6, event: true },
        { time: 6.1, event: false }, { time: 7.3, event: true }, { time: 8.0, event: false }, { time: 9.5, event: true }
      ]
    },
    {
      name: 'Treatment',
      records: [
        { time: 2.4, event: false }, { time: 3.8, event: true }, { time: 4.9, event: false }, { time: 6.4, event: true },
        { time: 7.0, event: false }, { time: 8.6, event: true }, { time: 9.2, event: false }, { time: 10.8, event: true }
      ]
    }
  ];
  const survivalTrendSeries = [
    {
      name: 'Dose 1',
      records: [
        { time: 2.1, event: true }, { time: 3.0, event: true }, { time: 4.1, event: false }, { time: 5.0, event: true },
        { time: 6.1, event: false }, { time: 6.9, event: true }, { time: 7.8, event: false }, { time: 8.6, event: true }
      ]
    },
    {
      name: 'Dose 2',
      records: [
        { time: 2.8, event: false }, { time: 3.6, event: true }, { time: 4.8, event: false }, { time: 5.9, event: true },
        { time: 6.8, event: false }, { time: 7.9, event: true }, { time: 8.8, event: false }, { time: 10.0, event: true }
      ]
    },
    {
      name: 'Dose 3',
      records: [
        { time: 3.4, event: false }, { time: 4.7, event: false }, { time: 5.9, event: true }, { time: 7.1, event: false },
        { time: 8.0, event: true }, { time: 9.5, event: false }, { time: 10.4, event: true }, { time: 11.8, event: false }
      ]
    }
  ];

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
    require('../js/components/hist.js');
    require('../js/components/pie.js');
    require('../js/components/roc.js');
    require('../js/components/line.js');
    require('../js/components/scatter.js');
    require('../js/components/survival.js');

    boxHooks = window.Components?.box?.__testHooks;
    histHooks = window.Components?.hist?.__testHooks;
    pieHooks = window.Components?.pie?.__testHooks;
    rocHooks = window.Components?.roc?.__testHooks;
    lineHooks = window.Components?.line?.__testHooks;
    scatterHooks = window.Components?.scatter?.__testHooks;
    survivalHooks = window.Components?.survival?.__testHooks;
  });

  test('box / pie / roc / correlation / survival engines match oracle', () => {
    expect(boxHooks).toBeTruthy();
    expect(histHooks).toBeTruthy();
    expect(pieHooks).toBeTruthy();
    expect(rocHooks).toBeTruthy();
    expect(lineHooks).toBeTruthy();
    expect(scatterHooks).toBeTruthy();
    expect(survivalHooks).toBeTruthy();

    const cases = [
      { id: 'box-welch-2s', operation: 'box_ttest_welch', payload: { a: boxA, b: boxB, alternative: 'two-sided' } },
      { id: 'box-welch-greater', operation: 'box_ttest_welch', payload: { a: boxB, b: boxA, alternative: 'greater' } },
      { id: 'box-paired', operation: 'box_ttest_paired', payload: { a: pairedA, b: pairedB, alternative: 'two-sided' } },
      { id: 'box-ratio', operation: 'box_ratio_ttest', payload: { a: ratioA, b: ratioB, alternative: 'two-sided' } },
      { id: 'box-log-ttest', operation: 'box_lognormal_ttest_equal_variance', payload: { a: logBoxA, b: logBoxB, alternative: 'two-sided' } },
      { id: 'box-log-welch', operation: 'box_lognormal_ttest_welch', payload: { a: logBoxA, b: logBoxB, alternative: 'two-sided' } },
      { id: 'box-one-sample', operation: 'box_ttest_one_sample', payload: { values: boxA, nullValue: 12, alternative: 'greater' } },
      { id: 'box-mw', operation: 'box_mann_whitney', payload: { a: boxA, b: boxB, alternative: 'two-sided' } },
      { id: 'box-wilcoxon-signed', operation: 'box_wilcoxon_signed_rank', payload: { a: pairedA, b: pairedB, alternative: 'two-sided', resamplingMode: 'asymptotic' } },
      { id: 'box-wilcoxon-onesample', operation: 'box_wilcoxon_one_sample', payload: { values: boxA, nullValue: 12, alternative: 'two-sided', resamplingMode: 'asymptotic' } },
      { id: 'box-anova', operation: 'box_anova', payload: { groups: [boxA, boxB, boxC] } },
      { id: 'box-log-anova', operation: 'box_lognormal_anova', payload: { groups: [logBoxA, logBoxB, logBoxC] } },
      { id: 'box-log-welch-anova', operation: 'box_lognormal_welch_anova', payload: { groups: [logBoxA, logBoxB, logBoxC] } },
      { id: 'box-brown-forsythe', operation: 'box_brown_forsythe', payload: { groups: [boxA, boxB, boxC], labels: boxLabels } },
      { id: 'box-bartlett', operation: 'box_bartlett', payload: { groups: [boxA, boxB, boxC], labels: boxLabels } },
      { id: 'box-lognormal-comparison', operation: 'box_lognormal_comparison', payload: { values: logBoxA.concat(logBoxB).concat(logBoxC) } },
      { id: 'box-linear-trend', operation: 'box_linear_trend', payload: { groups: [boxC, boxA, boxB], labels: ['Low', 'Mid', 'High'], alternative: 'greater' } },
      { id: 'box-tamhane', operation: 'box_tamhane_t2', payload: { groups: [boxA, boxB, boxC], labels: boxLabels, alpha: 0.05 } },
      { id: 'box-kruskal', operation: 'box_kruskal', payload: { groups: [boxA, boxB, boxC] } },
      { id: 'box-friedman', operation: 'box_friedman', payload: { groups: friedmanGroups } },
      { id: 'box-rm-anova', operation: 'box_repeated_measures_anova', payload: { groups: friedmanGroups } },
      { id: 'pie-chi2', operation: 'pie_chi_square', payload: { observed: pieObserved, expected: pieExpected } },
      { id: 'roc-auc', operation: 'roc_curve_metric', payload: { pairs: rocPairs1, graphType: 'roc' } },
      { id: 'roc-auc-uncertainty', operation: 'roc_auc_uncertainty', payload: { pairs: rocPairs1, alpha: 0.05 } },
      { id: 'roc-thresholds', operation: 'roc_threshold_table', payload: { pairs: rocPairs1, alpha: 0.05 } },
      { id: 'pr-ap', operation: 'roc_curve_metric', payload: { pairs: rocPairs1, graphType: 'pr' } },
      { id: 'roc-delong', operation: 'roc_delong_diff', payload: { pairs1: rocPairs1, pairs2: rocPairs2 } },
      { id: 'corr-pearson', operation: 'correlation', payload: { method: 'pearson', x: corrX, y: corrY } },
      { id: 'corr-spearman', operation: 'correlation', payload: { method: 'spearman', x: corrX, y: corrY } },
      { id: 'survival-logrank', operation: 'survival_logrank', payload: { series: survivalSeries } },
      { id: 'survival-gehan', operation: 'survival_gehan_breslow', payload: { series: survivalSeries } },
      { id: 'survival-trend', operation: 'survival_logrank_trend', payload: { series: survivalTrendSeries } }
    ];

    const oracle = indexOracleResults(runPythonOracle(cases));

    const js = {};
    js['box-welch-2s'] = boxHooks.tTest(boxA, boxB, { alternative: 'two-sided' });
    js['box-welch-greater'] = boxHooks.tTest(boxB, boxA, { alternative: 'greater' });
    js['box-paired'] = boxHooks.tTestPaired(pairedA, pairedB, { alternative: 'two-sided' });
    js['box-ratio'] = boxHooks.ratioTTest(ratioA, ratioB, { alternative: 'two-sided' });
    js['box-log-ttest'] = boxHooks.lognormalTTestEqualVariance(logBoxA, logBoxB, { alternative: 'two-sided' });
    js['box-log-welch'] = boxHooks.lognormalWelchTTest(logBoxA, logBoxB, { alternative: 'two-sided' });
    js['box-one-sample'] = boxHooks.tTestOneSample(boxA, 12, { alternative: 'greater' });
    js['box-mw'] = boxHooks.mannWhitney(boxA, boxB, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    js['box-wilcoxon-signed'] = boxHooks.wilcoxonSignedRank(pairedA, pairedB, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    js['box-wilcoxon-onesample'] = boxHooks.wilcoxonOneSample(boxA, 12, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    js['box-anova'] = boxHooks.anova([boxA, boxB, boxC]);
    js['box-log-anova'] = boxHooks.lognormalAnova([logBoxA, logBoxB, logBoxC]);
    js['box-log-welch-anova'] = boxHooks.lognormalWelchAnova([logBoxA, logBoxB, logBoxC]);
    js['box-brown-forsythe'] = boxHooks.brownForsytheVarianceDiagnostics([boxA, boxB, boxC], boxLabels, { alpha: 0.05 });
    js['box-bartlett'] = boxHooks.bartlettVarianceDiagnostics([boxA, boxB, boxC], boxLabels, { alpha: 0.05 });
    js['box-lognormal-comparison'] = boxHooks.lognormalComparison(logBoxA.concat(logBoxB).concat(logBoxC), {});
    js['box-linear-trend'] = boxHooks.linearTrendTest([boxC, boxA, boxB], ['Low', 'Mid', 'High'], { alternative: 'greater' });
    js['box-tamhane'] = boxHooks.tamhaneT2Comparisons([boxA, boxB, boxC], boxLabels, { alpha: 0.05 });
    js['box-kruskal'] = boxHooks.kruskalWallis([boxA, boxB, boxC]);
    js['box-friedman'] = boxHooks.friedmanTest(friedmanGroups);
    js['box-rm-anova'] = boxHooks.repeatedMeasuresAnova(friedmanGroups);
    js['pie-chi2'] = pieHooks.computeChiSquare(pieObserved, pieExpected);
    js['roc-auc'] = { metric: rocHooks.computeCurveMetric(rocPairs1, 'roc') };
    js['roc-auc-uncertainty'] = rocHooks.computeSingleAucUncertainty(rocPairs1, 0.05);
    js['roc-thresholds'] = { rows: rocHooks.buildThresholdMetricsTable(rocPairs1, 0.05) };
    js['pr-ap'] = { metric: rocHooks.computeCurveMetric(rocPairs1, 'pr') };
    js['roc-delong'] = rocHooks.delongCurveDiff(rocPairs1, rocPairs2);
    js['corr-pearson'] = lineHooks.computeLineCorrelationStats('pearson', corrX, corrY, global.jStat);
    js['corr-spearman'] = scatterHooks.computeScatterCorrelationStats('spearman', corrX, corrY);
    js['survival-logrank'] = survivalHooks.computeLogRank(survivalSeries);
    js['survival-gehan'] = survivalHooks.computeGehanBreslowWilcoxon(survivalSeries);
    js['survival-trend'] = survivalHooks.computeLogRankTrend(survivalTrendSeries);

    const get = id => {
      const entry = oracle.get(id);
      expect(entry).toBeTruthy();
      expect(entry.ok).toBe(true);
      return entry.result;
    };

    {
      const ref = get('box-welch-2s');
      expectClose(js['box-welch-2s'].t, ref.t, 'box-welch-2s.t', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-welch-2s'].df, ref.df, 'box-welch-2s.df', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-welch-2s'].p, ref.p, 'box-welch-2s.p', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-welch-greater');
      expectClose(js['box-welch-greater'].p, ref.p, 'box-welch-greater.p', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-paired');
      expectClose(js['box-paired'].t, ref.t, 'box-paired.t', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-paired'].p, ref.p, 'box-paired.p', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-ratio');
      expectClose(js['box-ratio'].t, ref.t, 'box-ratio.t', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-ratio'].p, ref.p, 'box-ratio.p', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-ratio'].ratio, ref.ratio, 'box-ratio.ratio', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-log-ttest');
      expectClose(js['box-log-ttest'].t, ref.t, 'box-log-ttest.t', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-log-ttest'].p, ref.p, 'box-log-ttest.p', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-log-ttest'].ratio, ref.ratio, 'box-log-ttest.ratio', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-log-welch');
      expectClose(js['box-log-welch'].t, ref.t, 'box-log-welch.t', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-log-welch'].p, ref.p, 'box-log-welch.p', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-log-welch'].ratio, ref.ratio, 'box-log-welch.ratio', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-one-sample');
      expectClose(js['box-one-sample'].t, ref.t, 'box-one-sample.t', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-one-sample'].p, ref.p, 'box-one-sample.p', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-mw');
      expectClose(js['box-mw'].U1, ref.U1, 'box-mw.U1', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-mw'].p, ref.p, 'box-mw.p', { abs: 5e-4, rel: 1e-3 });
    }
    {
      const ref = get('box-wilcoxon-signed');
      expectClose(js['box-wilcoxon-signed'].W, ref.W, 'box-wilcoxon-signed.W', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-wilcoxon-signed'].p, ref.p, 'box-wilcoxon-signed.p', { abs: 5e-4, rel: 1e-3 });
    }
    {
      const ref = get('box-wilcoxon-onesample');
      expectClose(js['box-wilcoxon-onesample'].W, ref.W, 'box-wilcoxon-onesample.W', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-wilcoxon-onesample'].p, ref.p, 'box-wilcoxon-onesample.p', { abs: 5e-4, rel: 1e-3 });
    }
    {
      const ref = get('box-anova');
      expectClose(js['box-anova'].F, ref.F, 'box-anova.F', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-anova'].p, ref.p, 'box-anova.p', { abs: 1e-6, rel: 1e-5 });
      expect(js['box-anova'].dfBetween).toBe(ref.dfBetween);
      expect(js['box-anova'].dfWithin).toBe(ref.dfWithin);
    }
    {
      const ref = get('box-log-anova');
      expectClose(js['box-log-anova'].F, ref.F, 'box-log-anova.F', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-log-anova'].p, ref.p, 'box-log-anova.p', { abs: 1e-6, rel: 1e-5 });
      expect(js['box-log-anova'].dfBetween).toBe(ref.dfBetween);
      expect(js['box-log-anova'].dfWithin).toBe(ref.dfWithin);
    }
    {
      const ref = get('box-log-welch-anova');
      expectClose(js['box-log-welch-anova'].F, ref.F, 'box-log-welch-anova.F', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-log-welch-anova'].p, ref.p, 'box-log-welch-anova.p', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-log-welch-anova'].df1, ref.df1, 'box-log-welch-anova.df1', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-log-welch-anova'].df2, ref.df2, 'box-log-welch-anova.df2', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-brown-forsythe');
      expectClose(js['box-brown-forsythe'].statistic, ref.statistic, 'box-brown-forsythe.statistic', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-brown-forsythe'].pValue, ref.pValue, 'box-brown-forsythe.pValue', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-bartlett');
      expectClose(js['box-bartlett'].statistic, ref.statistic, 'box-bartlett.statistic', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-bartlett'].pValue, ref.pValue, 'box-bartlett.pValue', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-lognormal-comparison');
      expect(js['box-lognormal-comparison'].preferred).toBe(ref.preferred);
      expectClose(js['box-lognormal-comparison'].normalAicc, ref.normalAicc, 'box-lognormal-comparison.normalAicc', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-lognormal-comparison'].lognormalAicc, ref.lognormalAicc, 'box-lognormal-comparison.lognormalAicc', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-linear-trend');
      expect(js['box-linear-trend'].available).toBe(true);
      expectClose(js['box-linear-trend'].slope, ref.slope, 'box-linear-trend.slope', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-linear-trend'].t, ref.t, 'box-linear-trend.t', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-linear-trend'].p, ref.p, 'box-linear-trend.p', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-tamhane');
      expect(js['box-tamhane'].ok).toBe(true);
      expect(ref.ok).toBe(true);
      expect(js['box-tamhane'].pairs.length).toBe(ref.pairs.length);
      js['box-tamhane'].pairs.forEach((row, index) => {
        const expected = ref.pairs[index];
        expectClose(Math.abs(row.t), Math.abs(expected.t), `box-tamhane.pairs[${index}].t`, { abs: 1e-6, rel: 1e-5 });
        expectClose(row.df, expected.df, `box-tamhane.pairs[${index}].df`, { abs: 1e-6, rel: 1e-5 });
        expectClose(row.p, expected.p, `box-tamhane.pairs[${index}].p`, { abs: 1e-6, rel: 1e-5 });
        expectClose(row.adjustedP ?? row.pAdj, expected.adjustedP, `box-tamhane.pairs[${index}].adjustedP`, { abs: 1e-6, rel: 1e-5 });
      });
    }
    {
      const ref = get('box-kruskal');
      expectClose(js['box-kruskal'].H, ref.H, 'box-kruskal.H', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-kruskal'].p, ref.p, 'box-kruskal.p', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-friedman');
      expect(js['box-friedman'].ok).toBe(true);
      expectClose(js['box-friedman'].Q, ref.Q, 'box-friedman.Q', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-friedman'].p, ref.p, 'box-friedman.p', { abs: 1e-6, rel: 1e-5 });
    }
    {
      const ref = get('box-rm-anova');
      expect(js['box-rm-anova'].ok).toBe(true);
      expectClose(js['box-rm-anova'].F, ref.F, 'box-rm-anova.F', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-rm-anova'].p, ref.p, 'box-rm-anova.p', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['box-rm-anova'].df1, ref.df1, 'box-rm-anova.df1', { abs: 0, rel: 0 });
      expectClose(js['box-rm-anova'].df2, ref.df2, 'box-rm-anova.df2', { abs: 0, rel: 0 });
    }
    {
      const ref = get('pie-chi2');
      expect(js['pie-chi2'].available).toBe(true);
      expectClose(js['pie-chi2'].chi2, ref.chi2, 'pie-chi2.chi2', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-chi2'].p, ref.p, 'pie-chi2.p', { abs: 1e-6, rel: 1e-5 });
      expect(js['pie-chi2'].df).toBe(ref.df);
    }
    {
      const ref = get('roc-auc');
      expectClose(js['roc-auc'].metric, ref.metric, 'roc-auc.metric', { abs: 1e-9, rel: 1e-7 });
    }
    {
      const ref = get('roc-auc-uncertainty');
      expectClose(js['roc-auc-uncertainty'].auc, ref.auc, 'roc-auc-uncertainty.auc', { abs: 1e-9, rel: 1e-7 });
      expectClose(js['roc-auc-uncertainty'].se, ref.se, 'roc-auc-uncertainty.se', { abs: 1e-9, rel: 1e-7 });
      expectClose(js['roc-auc-uncertainty'].ciLow, ref.ciLow, 'roc-auc-uncertainty.ciLow', { abs: 1e-9, rel: 1e-7 });
      expectClose(js['roc-auc-uncertainty'].ciHigh, ref.ciHigh, 'roc-auc-uncertainty.ciHigh', { abs: 1e-9, rel: 1e-7 });
    }
    {
      const ref = get('roc-thresholds');
      expect(js['roc-thresholds'].rows.length).toBe(ref.rows.length);
      [0, Math.floor(ref.rows.length / 2), ref.rows.length - 1].forEach(index => {
        const actual = js['roc-thresholds'].rows[index];
        const expected = ref.rows[index];
        expectClose(actual.threshold, expected.threshold, `roc-thresholds.rows[${index}].threshold`, { abs: 1e-9, rel: 1e-7 });
        expectClose(actual.sensitivity, expected.sensitivity, `roc-thresholds.rows[${index}].sensitivity`, { abs: 1e-9, rel: 1e-7 });
        expectClose(actual.specificity, expected.specificity, `roc-thresholds.rows[${index}].specificity`, { abs: 1e-9, rel: 1e-7 });
        expectClose(actual.ppv, expected.ppv, `roc-thresholds.rows[${index}].ppv`, { abs: 1e-9, rel: 1e-7 });
        expectClose(actual.npv, expected.npv, `roc-thresholds.rows[${index}].npv`, { abs: 1e-9, rel: 1e-7 });
        if(Number.isFinite(expected.lrPositive)){
          expectClose(actual.lrPositive, expected.lrPositive, `roc-thresholds.rows[${index}].lrPositive`, { abs: 1e-9, rel: 1e-7 });
        }else{
          expect(Number.isFinite(actual.lrPositive)).toBe(false);
        }
        if(Number.isFinite(expected.lrNegative)){
          expectClose(actual.lrNegative, expected.lrNegative, `roc-thresholds.rows[${index}].lrNegative`, { abs: 1e-9, rel: 1e-7 });
        }else{
          expect(Number.isFinite(actual.lrNegative)).toBe(false);
        }
      });
    }
    {
      const ref = get('pr-ap');
      expectClose(js['pr-ap'].metric, ref.metric, 'pr-ap.metric', { abs: 1e-9, rel: 1e-7 });
    }
    {
      const ref = get('roc-delong');
      expectClose(js['roc-delong'].diff, ref.diff, 'roc-delong.diff', { abs: 1e-8, rel: 1e-6 });
      expectClose(js['roc-delong'].p, ref.p, 'roc-delong.p', { abs: 1e-8, rel: 1e-6 });
      expectClose(js['roc-delong'].ci[0], ref.ci[0], 'roc-delong.ci.low', { abs: 1e-8, rel: 1e-6 });
      expectClose(js['roc-delong'].ci[1], ref.ci[1], 'roc-delong.ci.high', { abs: 1e-8, rel: 1e-6 });
    }
    {
      const ref = get('corr-pearson');
      expectClose(js['corr-pearson'].r, ref.r, 'corr-pearson.r', { abs: 1e-8, rel: 1e-6 });
      expectClose(js['corr-pearson'].p, ref.p, 'corr-pearson.p', { abs: 1e-8, rel: 1e-6 });
    }
    {
      const ref = get('corr-spearman');
      expectClose(js['corr-spearman'].r, ref.r, 'corr-spearman.r', { abs: 1e-8, rel: 1e-6 });
      expectClose(js['corr-spearman'].p, ref.p, 'corr-spearman.p', { abs: 1e-8, rel: 1e-6 });
    }
    {
      const ref = get('survival-logrank');
      expect(js['survival-logrank'].available).toBe(true);
      expectClose(js['survival-logrank'].chi2, ref.chi2, 'survival-logrank.chi2', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['survival-logrank'].p, ref.p, 'survival-logrank.p', { abs: 1e-6, rel: 1e-5 });
      expect(js['survival-logrank'].df).toBe(ref.df);
    }
    {
      const ref = get('survival-gehan');
      expect(js['survival-gehan'].available).toBe(true);
      expectClose(js['survival-gehan'].chi2, ref.chi2, 'survival-gehan.chi2', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['survival-gehan'].p, ref.p, 'survival-gehan.p', { abs: 1e-6, rel: 1e-5 });
      expect(js['survival-gehan'].df).toBe(ref.df);
    }
    {
      const ref = get('survival-trend');
      expect(js['survival-trend'].available).toBe(true);
      expectClose(js['survival-trend'].chi2, ref.chi2, 'survival-trend.chi2', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['survival-trend'].p, ref.p, 'survival-trend.p', { abs: 1e-6, rel: 1e-5 });
      expect(js['survival-trend'].df).toBe(ref.df);
    }
  });

  test('hist descriptive and distribution-comparison hooks match oracle', () => {
    expect(histHooks).toBeTruthy();

    const summaryValues = [1.2, 2.1, 2.4, 3.8, 4.1, 5.0, 5.6];
    const skewedValues = [0.42, 0.58, 0.77, 1.1, 1.55, 2.4, 3.9, 6.1];
    const ksA = [0.2, 0.5, 0.9, 1.1, 1.4, 1.8, 2.0, 2.3];
    const ksB = [0.1, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.9];

    const cases = [
      { id: 'hist-summary', operation: 'hist_descriptive_summary', payload: { values: summaryValues } },
      { id: 'hist-lognormal', operation: 'hist_lognormal_comparison', payload: { values: skewedValues } },
      { id: 'hist-normal-gof', operation: 'goodness_of_fit', payload: { values: summaryValues, distribution: 'normal', alpha: 0.05 } },
      { id: 'hist-ks', operation: 'hist_kolmogorov_smirnov', payload: { a: ksA, b: ksB } }
    ];

    const oracle = indexOracleResults(runPythonOracle(cases));
    const summary = histHooks.computeSummary(summaryValues);
    const comparison = histHooks.computeLognormalComparison(skewedValues);
    const normalFit = histHooks.computeNormalFitDiagnostic(summaryValues, { alpha: 0.05 });
    const ks = histHooks.kolmogorovSmirnovTwoSample(ksA, ksB);

    {
      const ref = oracle.get('hist-summary')?.result;
      expect(ref?.available).toBe(true);
      expect(summary).toBeTruthy();
      expect(summary.n).toBe(ref.n);
      expectClose(summary.mean, ref.mean, 'hist-summary.mean', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.median, ref.median, 'hist-summary.median', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.variance, ref.variance, 'hist-summary.variance', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.sd, ref.sd, 'hist-summary.sd', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.sem, ref.sem, 'hist-summary.sem', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.q1, ref.q1, 'hist-summary.q1', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.q3, ref.q3, 'hist-summary.q3', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.iqr, ref.iqr, 'hist-summary.iqr', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.cv, ref.cv, 'hist-summary.cv', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.skewness, ref.skewness, 'hist-summary.skewness', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.kurtosis, ref.kurtosis, 'hist-summary.kurtosis', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.geometricMean, ref.geometricMean, 'hist-summary.geometricMean', { abs: 1e-8, rel: 1e-6 });
      expectClose(summary.harmonicMean, ref.harmonicMean, 'hist-summary.harmonicMean', { abs: 1e-8, rel: 1e-6 });
    }
    {
      const ref = oracle.get('hist-lognormal')?.result;
      expect(ref?.available).toBe(true);
      expect(comparison).toBeTruthy();
      expect(String(comparison.preferred)).toBe(String(ref.preferred));
      expectClose(comparison.normalAicc, ref.normalAicc, 'hist-lognormal.normalAicc', { abs: 1e-8, rel: 1e-6 });
      expectClose(comparison.lognormalAicc, ref.lognormalAicc, 'hist-lognormal.lognormalAicc', { abs: 1e-8, rel: 1e-6 });
      expectClose(comparison.deltaAicc, ref.deltaAicc, 'hist-lognormal.deltaAicc', { abs: 1e-8, rel: 1e-6 });
    }
    {
      const ref = oracle.get('hist-normal-gof')?.result;
      expect(ref?.valid).toBe(true);
      expect(normalFit?.available).toBe(true);
      expect(normalFit?.gof).toBeTruthy();
      expectClose(normalFit.gof.ks.statistic, ref.ksStatistic, 'hist-normal-gof.ksStatistic', { abs: 2e-7, rel: 1e-6 });
      expectClose(normalFit.gof.ad.statistic, ref.adStatistic, 'hist-normal-gof.adStatistic', { abs: 2e-7, rel: 1e-6 });
    }
    {
      const ref = oracle.get('hist-ks')?.result;
      expect(ref?.available).toBe(true);
      expect(ks?.available).toBe(true);
      expectClose(ks.D, ref.D, 'hist-ks.D', { abs: 1e-8, rel: 1e-6 });
      expectClose(ks.p, ref.p, 'hist-ks.p', { abs: 5e-4, rel: 1e-3 });
    }
  });

  test('hist auto binning follows Prism-compatible defaults', () => {
    expect(histHooks).toBeTruthy();
    expect(typeof histHooks.computeAutoBinWidth).toBe('function');
    expect(typeof histHooks.buildFrequencyModel).toBe('function');
    expect(typeof histHooks.getDefaultFrequencySettings).toBe('function');
    expect(histHooks.getDefaultFrequencySettings().binningMode).toBe('auto');

    const integerWidth = histHooks.computeAutoBinWidth([
      { values: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
      { values: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] }
    ]);
    expect(integerWidth).toBe(2);

    const averagedWidth = histHooks.computeAutoBinWidth([
      { values: Array.from({ length: 100 }, (_, i) => i) },
      { values: Array.from({ length: 100 }, (_, i) => i / 10) }
    ]);
    expect(averagedWidth).toBe(5);

    const decimalWidth = histHooks.computeAutoBinWidth([
      { values: [0.0, 0.1, 0.2, 0.3, 0.4] }
    ]);
    expectClose(decimalWidth, 0.1, 'hist-auto-binning.decimalWidth', { abs: 1e-12, rel: 1e-9 });

    const exampleValues = [
      38, 42, 45, 47, 49, 50, 52, 53, 54, 55,
      56, 57, 58, 59, 60, 61, 62, 63, 64, 65,
      66, 67, 68, 69, 70, 71, 72, 73, 74, 75,
      76, 77, 78, 79, 80, 81, 82, 83, 84, 85,
      86, 87, 88, 89, 90, 91, 92, 93, 94, 95,
      96, 97, 98, 99, 100
    ];
    const model = histHooks.buildFrequencyModel([
      { key: 'exam', label: 'Exam Score', values: exampleValues }
    ], {
      min: 0,
      max: 125,
      countInputValue: 10,
      settings: { binningMode: 'auto' }
    });
    expect(model).toBeTruthy();
    expectClose(model.binWidth, 5, 'hist-auto-binning.example.binWidth', { abs: 1e-12, rel: 1e-9 });
    expect(model.centers.slice(0, 6)).toEqual([40, 45, 50, 55, 60, 65]);
    expect(model.centers[model.centers.length - 1]).toBe(100);
    expectClose(model.edges[0], 37.5, 'hist-auto-binning.example.firstEdge', { abs: 1e-12, rel: 1e-9 });
    expectClose(model.edges[model.edges.length - 1], 102.5, 'hist-auto-binning.example.lastEdge', { abs: 1e-12, rel: 1e-9 });

    const countModel = histHooks.buildFrequencyModel([
      { key: 'exam', label: 'Exam Score', values: exampleValues }
    ], {
      min: 0,
      max: 125,
      countInputValue: 10,
      settings: { binningMode: 'count' }
    });
    expect(countModel).toBeTruthy();
    expectClose(countModel.edges[0], 38, 'hist-auto-binning.countRange.firstEdge', { abs: 1e-12, rel: 1e-9 });
    expectClose(countModel.edges[countModel.edges.length - 1], 100, 'hist-auto-binning.countRange.lastEdge', { abs: 1e-12, rel: 1e-9 });
  });

  test('randomized component differential checks stay aligned with oracle', () => {
    const rng = createRng(20260310);
    const cases = [];
    const js = {};
    const iterations = 8;
    for (let i = 0; i < iterations; i += 1) {
      const a = Array.from({ length: 12 }, () => (8 + (1.2 * randn(rng))));
      const b = Array.from({ length: 12 }, () => (8.6 + (1.2 * randn(rng))));
      const welchId = `rnd-welch-${i}`;
      const mwId = `rnd-mw-${i}`;
      cases.push({ id: welchId, operation: 'box_ttest_welch', payload: { a, b, alternative: 'two-sided' } });
      cases.push({ id: mwId, operation: 'box_mann_whitney', payload: { a, b, alternative: 'two-sided' } });
      js[welchId] = boxHooks.tTest(a, b, { alternative: 'two-sided' });
      js[mwId] = boxHooks.mannWhitney(a, b, { alternative: 'two-sided', resamplingMode: 'asymptotic' });

      const x = Array.from({ length: 20 }, (_, idx) => (idx + 1) + (0.15 * randn(rng)));
      const y = x.map(v => (1.7 * v) + (0.8 * randn(rng)));
      const pearsonId = `rnd-corr-pearson-${i}`;
      const spearmanId = `rnd-corr-spearman-${i}`;
      cases.push({ id: pearsonId, operation: 'correlation', payload: { method: 'pearson', x, y } });
      cases.push({ id: spearmanId, operation: 'correlation', payload: { method: 'spearman', x, y } });
      js[pearsonId] = lineHooks.computeLineCorrelationStats('pearson', x, y, global.jStat);
      js[spearmanId] = scatterHooks.computeScatterCorrelationStats('spearman', x, y);

      const pairs = [];
      for (let j = 0; j < 20; j += 1) {
        pairs.push({ label: 1, score: Math.max(0, Math.min(1, 0.72 + (0.14 * randn(rng)))) });
      }
      for (let j = 0; j < 20; j += 1) {
        pairs.push({ label: 0, score: Math.max(0, Math.min(1, 0.34 + (0.14 * randn(rng)))) });
      }
      const rocId = `rnd-roc-${i}`;
      cases.push({ id: rocId, operation: 'roc_curve_metric', payload: { pairs, graphType: 'roc' } });
      js[rocId] = { metric: rocHooks.computeCurveMetric(pairs, 'roc') };

      const buildSurvivalGroup = (name, hazard, size) => {
        const records = [];
        for (let k = 0; k < size; k += 1) {
          const tEvent = -Math.log(Math.max(1e-12, 1 - rng())) / hazard;
          const tCensor = -Math.log(Math.max(1e-12, 1 - rng())) / 0.07;
          const event = tEvent <= tCensor;
          records.push({ time: event ? tEvent : tCensor, event });
        }
        if (!records.some(r => r.event)) {
          records[0].event = true;
        }
        return { name, records };
      };
      const series = [
        buildSurvivalGroup('G1', 0.12, 14),
        buildSurvivalGroup('G2', 0.08, 14)
      ];
      const survivalId = `rnd-survival-${i}`;
      cases.push({ id: survivalId, operation: 'survival_logrank', payload: { series } });
      js[survivalId] = survivalHooks.computeLogRank(series);
    }

    const oracle = indexOracleResults(runPythonOracle(cases));

    for (let i = 0; i < iterations; i += 1) {
      {
        const id = `rnd-welch-${i}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expectClose(js[id].t, ref.t, `${id}.t`, { abs: 1e-6, rel: 1e-5 });
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 1e-6, rel: 1e-5 });
      }
      {
        const id = `rnd-mw-${i}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expectClose(js[id].U1, ref.U1, `${id}.U1`, { abs: 1e-6, rel: 1e-5 });
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 8e-4, rel: 2e-3 });
      }
      {
        const id = `rnd-corr-pearson-${i}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expectClose(js[id].r, ref.r, `${id}.r`, { abs: 1e-8, rel: 1e-6 });
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 1e-8, rel: 1e-6 });
      }
      {
        const id = `rnd-corr-spearman-${i}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expectClose(js[id].r, ref.r, `${id}.r`, { abs: 1e-8, rel: 1e-6 });
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 1e-4, rel: 1e-3 });
      }
      {
        const id = `rnd-roc-${i}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expectClose(js[id].metric, ref.metric, `${id}.metric`, { abs: 1e-9, rel: 1e-7 });
      }
      {
        const id = `rnd-survival-${i}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expect(js[id].available).toBe(true);
        expectClose(js[id].chi2, ref.chi2, `${id}.chi2`, { abs: 1e-6, rel: 1e-5 });
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 1e-6, rel: 1e-5 });
      }
    }
  });

  test('parameter wiring changes the computed result in expected directions', () => {
    const twoSided = boxHooks.tTest(boxB, boxA, { alternative: 'two-sided' });
    const greater = boxHooks.tTest(boxB, boxA, { alternative: 'greater' });
    const less = boxHooks.tTest(boxB, boxA, { alternative: 'less' });
    expect(greater.p).toBeLessThan(twoSided.p);
    expect(less.p).toBeGreaterThan(greater.p);

    const pearson = lineHooks.computeLineCorrelationStats('pearson', corrX, corrY, global.jStat);
    const spearman = lineHooks.computeLineCorrelationStats('spearman', corrX, corrY, global.jStat);
    expect(String(pearson.label || '').toLowerCase()).toBe('pearson');
    expect(String(spearman.label || '').toLowerCase()).toBe('spearman');

    const rocMetric = rocHooks.computeCurveMetric(rocPairs1, 'roc');
    const prMetric = rocHooks.computeCurveMetric(rocPairs1, 'pr');
    expect(isFiniteNumber(rocMetric)).toBe(true);
    expect(isFiniteNumber(prMetric)).toBe(true);
    expect(rocMetric).not.toBe(prMetric);
  });
});
