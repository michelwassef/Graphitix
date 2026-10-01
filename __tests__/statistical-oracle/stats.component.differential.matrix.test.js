/* global beforeEach, describe, expect */
'use strict';

const { createFixtures, expectClose, indexOracleResults, loadStatsHooks, runPythonOracle, testWithOracle } = require('../../test-support/statsComponentDifferentialSuite');

describe('Component statistical engines vs Python oracle', () => {
  let boxHooks;
  let histHooks;
  let pieHooks;
  let rocHooks;
  let lineHooks;
  let scatterHooks;
  let survivalHooks;
  const { boxA, boxB, boxC, pairedA, pairedB, ratioA, ratioB, logBoxA, logBoxB, logBoxC, boxLabels, friedmanGroups, pieObserved, pieExpected, pieContingency, pieContingency2x2, rocPairs1, rocPairs2, corrX, corrY, survivalSeries, survivalTrendSeries } = createFixtures();

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

  testWithOracle('box / pie / roc / correlation / survival engines match oracle', () => {
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
      { id: 'pie-gof-chi2', operation: 'pie_gof_test', payload: { observed: pieObserved, expected: pieExpected, method: 'chi-square' } },
      { id: 'pie-gof-gtest', operation: 'pie_gof_test', payload: { observed: pieObserved, expected: pieExpected, method: 'g-test' } },
      {
        id: 'pie-cont-chi2',
        operation: 'pie_contingency_test',
        payload: { table: pieContingency, method: 'chi-square', sparseThreshold: 5, yatesCorrection: false }
      },
      {
        id: 'pie-cont-gtest',
        operation: 'pie_contingency_test',
        payload: { table: pieContingency, method: 'g-test', sparseThreshold: 5, yatesCorrection: false }
      },
      {
        id: 'pie-cont-yates',
        operation: 'pie_contingency_test',
        payload: { table: pieContingency2x2, method: 'chi-square', sparseThreshold: 5, yatesCorrection: true }
      },
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
    js['pie-gof-chi2'] = pieHooks.computeGofStats(pieObserved, pieExpected, { method: 'chi-square' });
    js['pie-gof-gtest'] = pieHooks.computeGofStats(pieObserved, pieExpected, { method: 'g-test' });
    js['pie-cont-chi2'] = pieHooks.computeContingencyTest(pieContingency, { method: 'chi-square', sparseThreshold: 5, yatesCorrection: false });
    js['pie-cont-gtest'] = pieHooks.computeContingencyTest(pieContingency, { method: 'g-test', sparseThreshold: 5, yatesCorrection: false });
    js['pie-cont-yates'] = pieHooks.computeContingencyTest(pieContingency2x2, { method: 'chi-square', sparseThreshold: 5, yatesCorrection: true });
    js['roc-auc'] = { metric: rocHooks.computeCurveMetric(rocPairs1, 'roc') };
    js['roc-auc-uncertainty'] = rocHooks.computeSingleAucInference(rocPairs1, 0.05, 'auto');
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
      const ref = get('pie-gof-chi2');
      expect(js['pie-gof-chi2'].ok).toBe(true);
      expect(ref.ok).toBe(true);
      expect(String(js['pie-gof-chi2'].method)).toBe(String(ref.method));
      expectClose(js['pie-gof-chi2'].statistic, ref.statistic, 'pie-gof-chi2.statistic', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-gof-chi2'].pearsonStatistic, ref.pearsonStatistic, 'pie-gof-chi2.pearsonStatistic', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-gof-chi2'].pValue, ref.pValue, 'pie-gof-chi2.pValue', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-gof-chi2'].cohensW, ref.cohensW, 'pie-gof-chi2.cohensW', { abs: 1e-6, rel: 1e-5 });
      expect(js['pie-gof-chi2'].df).toBe(ref.df);
    }
    {
      const ref = get('pie-gof-gtest');
      expect(js['pie-gof-gtest'].ok).toBe(true);
      expect(ref.ok).toBe(true);
      expect(String(js['pie-gof-gtest'].method)).toBe(String(ref.method));
      expectClose(js['pie-gof-gtest'].statistic, ref.statistic, 'pie-gof-gtest.statistic', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-gof-gtest'].pearsonStatistic, ref.pearsonStatistic, 'pie-gof-gtest.pearsonStatistic', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-gof-gtest'].gStatistic, ref.gStatistic, 'pie-gof-gtest.gStatistic', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-gof-gtest'].pValue, ref.pValue, 'pie-gof-gtest.pValue', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-gof-gtest'].cohensW, ref.cohensW, 'pie-gof-gtest.cohensW', { abs: 1e-6, rel: 1e-5 });
      expect(js['pie-gof-gtest'].df).toBe(ref.df);
    }
    {
      const ref = get('pie-cont-chi2');
      expect(js['pie-cont-chi2'].ok).toBe(true);
      expect(ref.ok).toBe(true);
      expect(String(js['pie-cont-chi2'].method)).toBe(String(ref.method));
      expectClose(js['pie-cont-chi2'].statistic, ref.statistic, 'pie-cont-chi2.statistic', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-cont-chi2'].pValue, ref.pValue, 'pie-cont-chi2.pValue', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-cont-chi2'].cramersV, ref.cramersV, 'pie-cont-chi2.cramersV', { abs: 1e-6, rel: 1e-5 });
      expect(js['pie-cont-chi2'].df).toBe(ref.df);
      expect(js['pie-cont-chi2'].sparseCellCount).toBe(ref.sparseCellCount);
      expect(js['pie-cont-chi2'].yatesApplied).toBe(ref.yatesApplied);
    }
    {
      const ref = get('pie-cont-gtest');
      expect(js['pie-cont-gtest'].ok).toBe(true);
      expect(ref.ok).toBe(true);
      expect(String(js['pie-cont-gtest'].method)).toBe(String(ref.method));
      expectClose(js['pie-cont-gtest'].statistic, ref.statistic, 'pie-cont-gtest.statistic', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-cont-gtest'].pValue, ref.pValue, 'pie-cont-gtest.pValue', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-cont-gtest'].cramersV, ref.cramersV, 'pie-cont-gtest.cramersV', { abs: 1e-6, rel: 1e-5 });
      expect(js['pie-cont-gtest'].df).toBe(ref.df);
      expect(js['pie-cont-gtest'].sparseCellCount).toBe(ref.sparseCellCount);
      expect(js['pie-cont-gtest'].yatesApplied).toBe(ref.yatesApplied);
    }
    {
      const ref = get('pie-cont-yates');
      expect(js['pie-cont-yates'].ok).toBe(true);
      expect(ref.ok).toBe(true);
      expect(js['pie-cont-yates'].yatesApplied).toBe(true);
      expect(ref.yatesApplied).toBe(true);
      expectClose(js['pie-cont-yates'].statistic, ref.statistic, 'pie-cont-yates.statistic', { abs: 1e-6, rel: 1e-5 });
      expectClose(js['pie-cont-yates'].pValue, ref.pValue, 'pie-cont-yates.pValue', { abs: 1e-6, rel: 1e-5 });
      expect(js['pie-cont-yates'].df).toBe(ref.df);
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
});

