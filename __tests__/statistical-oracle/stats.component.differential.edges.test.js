/* global beforeEach, describe, expect, test */
'use strict';

const { createFixtures, createRng, expectClose, indexOracleResults, isFiniteNumber, loadStatsHooks, randn, runPythonOracle, testWithOracle } = require('../../test-support/statsComponentDifferentialSuite');

describe('Component statistical edge cases and randomized checks', () => {
  let boxHooks;
  let histHooks;
  let pieHooks;
  let rocHooks;
  let lineHooks;
  let scatterHooks;
  let survivalHooks;
  const { boxA, boxB, rocPairs1, corrX, corrY } = createFixtures();

  beforeEach(() => {
    const loaded = loadStatsHooks();
    boxHooks = loaded.boxHooks;
    histHooks = loaded.histHooks;
    pieHooks = loaded.pieHooks;
    rocHooks = loaded.rocHooks;
    lineHooks = loaded.lineHooks;
    scatterHooks = loaded.scatterHooks;
    survivalHooks = loaded.survivalHooks;
  });

  test('perfect Pearson correlation uses the zero-p limit', () => {
    const result = scatterHooks.computeScatterCorrelationStats('pearson', [1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    expect(result.r).toBeCloseTo(1, 12);
    expect(result.p).toBe(0);
  });

  test('invalid count inputs do not produce a p-value from implicit zeros', () => {
    expect(pieHooks.computeChiSquare([null, 10], [5, 5]).available).toBe(false);
    expect(pieHooks.computeGofStats(['', 10], [5, 5]).ok).toBe(false);
    expect(pieHooks.computeContingencyTest([[1, false], [2, 3]]).ok).toBe(false);
  });

  testWithOracle('hist descriptive and distribution-comparison hooks match oracle', () => {
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
    const identicalKs = histHooks.kolmogorovSmirnovTwoSample(ksA, ksA);
    expect(identicalKs.available).toBe(true);
    expect(identicalKs.D).toBe(0);
    expect(identicalKs.p).toBe(1);

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

  testWithOracle('randomized component differential checks stay aligned with oracle', () => {
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

