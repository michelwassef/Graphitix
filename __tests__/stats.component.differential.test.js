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
    require('../js/components/pie.js');
    require('../js/components/roc.js');
    require('../js/components/line.js');
    require('../js/components/scatter.js');
    require('../js/components/survival.js');

    boxHooks = window.Components?.box?.__testHooks;
    pieHooks = window.Components?.pie?.__testHooks;
    rocHooks = window.Components?.roc?.__testHooks;
    lineHooks = window.Components?.line?.__testHooks;
    scatterHooks = window.Components?.scatter?.__testHooks;
    survivalHooks = window.Components?.survival?.__testHooks;
  });

  test('box / pie / roc / correlation / survival engines match oracle', () => {
    expect(boxHooks).toBeTruthy();
    expect(pieHooks).toBeTruthy();
    expect(rocHooks).toBeTruthy();
    expect(lineHooks).toBeTruthy();
    expect(scatterHooks).toBeTruthy();
    expect(survivalHooks).toBeTruthy();

    const cases = [
      { id: 'box-welch-2s', operation: 'box_ttest_welch', payload: { a: boxA, b: boxB, alternative: 'two-sided' } },
      { id: 'box-welch-greater', operation: 'box_ttest_welch', payload: { a: boxB, b: boxA, alternative: 'greater' } },
      { id: 'box-paired', operation: 'box_ttest_paired', payload: { a: pairedA, b: pairedB, alternative: 'two-sided' } },
      { id: 'box-one-sample', operation: 'box_ttest_one_sample', payload: { values: boxA, nullValue: 12, alternative: 'greater' } },
      { id: 'box-mw', operation: 'box_mann_whitney', payload: { a: boxA, b: boxB, alternative: 'two-sided' } },
      { id: 'box-wilcoxon-signed', operation: 'box_wilcoxon_signed_rank', payload: { a: pairedA, b: pairedB, alternative: 'two-sided', resamplingMode: 'asymptotic' } },
      { id: 'box-wilcoxon-onesample', operation: 'box_wilcoxon_one_sample', payload: { values: boxA, nullValue: 12, alternative: 'two-sided', resamplingMode: 'asymptotic' } },
      { id: 'box-anova', operation: 'box_anova', payload: { groups: [boxA, boxB, boxC] } },
      { id: 'box-kruskal', operation: 'box_kruskal', payload: { groups: [boxA, boxB, boxC] } },
      { id: 'box-friedman', operation: 'box_friedman', payload: { groups: friedmanGroups } },
      { id: 'box-rm-anova', operation: 'box_repeated_measures_anova', payload: { groups: friedmanGroups } },
      { id: 'pie-chi2', operation: 'pie_chi_square', payload: { observed: pieObserved, expected: pieExpected } },
      { id: 'roc-auc', operation: 'roc_curve_metric', payload: { pairs: rocPairs1, graphType: 'roc' } },
      { id: 'pr-ap', operation: 'roc_curve_metric', payload: { pairs: rocPairs1, graphType: 'pr' } },
      { id: 'roc-delong', operation: 'roc_delong_diff', payload: { pairs1: rocPairs1, pairs2: rocPairs2 } },
      { id: 'corr-pearson', operation: 'correlation', payload: { method: 'pearson', x: corrX, y: corrY } },
      { id: 'corr-spearman', operation: 'correlation', payload: { method: 'spearman', x: corrX, y: corrY } },
      { id: 'survival-logrank', operation: 'survival_logrank', payload: { series: survivalSeries } }
    ];

    const oracle = indexOracleResults(runPythonOracle(cases));

    const js = {};
    js['box-welch-2s'] = boxHooks.tTest(boxA, boxB, { alternative: 'two-sided' });
    js['box-welch-greater'] = boxHooks.tTest(boxB, boxA, { alternative: 'greater' });
    js['box-paired'] = boxHooks.tTestPaired(pairedA, pairedB, { alternative: 'two-sided' });
    js['box-one-sample'] = boxHooks.tTestOneSample(boxA, 12, { alternative: 'greater' });
    js['box-mw'] = boxHooks.mannWhitney(boxA, boxB, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    js['box-wilcoxon-signed'] = boxHooks.wilcoxonSignedRank(pairedA, pairedB, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    js['box-wilcoxon-onesample'] = boxHooks.wilcoxonOneSample(boxA, 12, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    js['box-anova'] = boxHooks.anova([boxA, boxB, boxC]);
    js['box-kruskal'] = boxHooks.kruskalWallis([boxA, boxB, boxC]);
    js['box-friedman'] = boxHooks.friedmanTest(friedmanGroups);
    js['box-rm-anova'] = boxHooks.repeatedMeasuresAnova(friedmanGroups);
    js['pie-chi2'] = pieHooks.computeChiSquare(pieObserved, pieExpected);
    js['roc-auc'] = { metric: rocHooks.computeCurveMetric(rocPairs1, 'roc') };
    js['pr-ap'] = { metric: rocHooks.computeCurveMetric(rocPairs1, 'pr') };
    js['roc-delong'] = rocHooks.delongCurveDiff(rocPairs1, rocPairs2);
    js['corr-pearson'] = lineHooks.computeLineCorrelationStats('pearson', corrX, corrY, global.jStat);
    js['corr-spearman'] = scatterHooks.computeScatterCorrelationStats('spearman', corrX, corrY);
    js['survival-logrank'] = survivalHooks.computeLogRank(survivalSeries);

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
