function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function expectClose(actual, expected, label, tolerance = {}) {
  const abs = isFiniteNumber(tolerance.abs) ? tolerance.abs : 1e-8;
  const rel = isFiniteNumber(tolerance.rel) ? tolerance.rel : 1e-6;
  expect(isFiniteNumber(actual)).toBe(true);
  expect(isFiniteNumber(expected)).toBe(true);
  const diff = Math.abs(actual - expected);
  const limit = Math.max(abs, rel * Math.max(1, Math.abs(expected)));
  if (diff > limit) {
    throw new Error(`${label} mismatch: actual=${actual}, expected=${expected}, diff=${diff}, limit=${limit}`);
  }
}

describe('Extended statistical coverage', () => {
  let boxHooks;
  let rocHooks;
  let survivalHooks;
  let boxState;

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
    require('../../js/vendor.js');
    require('../../js/shared/stats.js');
    require('../../js/shared/regression.js');
    require('../../js/components/box.js');
    require('../../js/components/roc.js');
    require('../../js/components/survival.js');

    boxHooks = window.Components?.box?.__testHooks;
    rocHooks = window.Components?.roc?.__testHooks;
    survivalHooks = window.Components?.survival?.__testHooks;
    boxState = window.Components?.box?.__getState?.();
    expect(boxHooks).toBeTruthy();
    expect(rocHooks).toBeTruthy();
    expect(survivalHooks).toBeTruthy();
    expect(boxState).toBeTruthy();
    boxState.statsAlpha = 0.05;
    boxState.statsCiLevel = 0.95;
    boxState.statsAlternative = 'two-sided';
    boxState.statsCorrection = 'holm';
    boxState.groupedStats = { analysis: 'multipleComparisons', comparisonScope: 'groupsWithinCondition', multiplicityFamily: 'within-scope' };
  });

  test('box post-hoc procedures cover Tukey, Games-Howell, Pooled t + Sidak versus control, Dunn, and Nemenyi branches', () => {
    const labels = ['Control', 'Treatment A', 'Treatment B'];
    const strongGroups = [
      [1, 2, 3, 4, 5],
      [10, 11, 12, 13, 14],
      [20, 21, 22, 23, 24]
    ];
    const unequalGroups = [
      [1, 1, 2, 2, 3],
      [10, 11, 12, 13, 30],
      [20, 30, 40, 50, 60]
    ];

    const tukey = boxHooks.tukeyComparisons(strongGroups, labels, { alpha: 0.05 });
    expect(tukey.ok).toBe(true);
    expect(tukey.pairs).toHaveLength(3);
    expect(tukey.pairs.every(pair => isFiniteNumber(pair.pAdj) && pair.pAdj < 0.05)).toBe(true);

    const gamesHowell = boxHooks.gamesHowellComparisons(unequalGroups, labels, { alpha: 0.05 });
    expect(gamesHowell.ok).toBe(true);
    expect(gamesHowell.pairs).toHaveLength(3);
    expect(gamesHowell.pairs.every(pair => isFiniteNumber(pair.pAdj) && pair.pAdj <= 1)).toBe(true);
    expect(gamesHowell.pairs.some(pair => pair.pAdj < 0.05)).toBe(true);

    const dunnett = boxHooks.controlSidakComparisons(strongGroups, labels, 0, { alpha: 0.05 });
    expect(dunnett.ok).toBe(true);
    expect(dunnett.pairs).toHaveLength(2);
    expect(dunnett.pairs.every(pair => pair.i === 0 && isFiniteNumber(pair.pAdj) && pair.pAdj < 0.05)).toBe(true);

    const dunnettT3 = boxHooks.controlSidakComparisons(unequalGroups, labels, 0, { unequalVariances: true, alpha: 0.05 });
    expect(dunnettT3.ok).toBe(true);
    expect(dunnettT3.pairs).toHaveLength(2);
    expect(dunnettT3.pairs.every(pair => pair.i === 0 && isFiniteNumber(pair.pAdj) && pair.pAdj <= 1)).toBe(true);

    const dunnExact = boxHooks.dunnComparisons([[1, 2], [5, 6], [9, 10]], labels, { resamplingMode: 'auto' });
    expect(dunnExact.ok).toBe(true);
    expect(dunnExact.pairs).toHaveLength(3);
    expect(dunnExact.pairs.every(pair => pair.method === 'exact-permutation')).toBe(true);

    const dunnMc1 = boxHooks.dunnComparisons([[1, 1, 2, 2], [5, 5, 6, 6], [9, 9, 10, 10]], labels, { resamplingMode: 'auto', iterations: 5000, seed: 77 });
    const dunnMc2 = boxHooks.dunnComparisons([[1, 1, 2, 2], [5, 5, 6, 6], [9, 9, 10, 10]], labels, { resamplingMode: 'auto', iterations: 5000, seed: 77 });
    expect(dunnMc1.ok).toBe(true);
    expect(dunnMc1.pairs.every(pair => pair.method === 'monte-carlo')).toBe(true);
    dunnMc1.pairs.forEach((pair, index) => {
      expectClose(pair.p, dunnMc2.pairs[index].p, `dunn monte-carlo deterministic[${index}]`, { abs: 0, rel: 0 });
    });

    const nemenyiExact = boxHooks.nemenyiComparisons([[1, 2, 3], [4, 5, 6], [7, 8, 9]], labels, { resamplingMode: 'auto' });
    expect(nemenyiExact.ok).toBe(true);
    expect(nemenyiExact.pairs).toHaveLength(3);
    expect(nemenyiExact.pairs.every(pair => pair.method === 'exact-permutation')).toBe(true);

    const nemenyiMonteCarloGroups = [[1, 1, 2, 2], [1, 2, 2, 3], [2, 2, 3, 3]];
    const nemenyiMc1 = boxHooks.nemenyiComparisons(nemenyiMonteCarloGroups, labels, { resamplingMode: 'auto', iterations: 4000, seed: 99 });
    const nemenyiMc2 = boxHooks.nemenyiComparisons(nemenyiMonteCarloGroups, labels, { resamplingMode: 'auto', iterations: 4000, seed: 99 });
    expect(nemenyiMc1.ok).toBe(true);
    expect(nemenyiMc1.pairs.every(pair => pair.method === 'monte-carlo')).toBe(true);
    nemenyiMc1.pairs.forEach((pair, index) => {
      expectClose(pair.p, nemenyiMc2.pairs[index].p, `nemenyi monte-carlo deterministic[${index}]`, { abs: 0, rel: 0 });
    });
  });

  test('box standard pair results preserve Kolmogorov-Smirnov D as the rendered statistic', () => {
    const control = [1, 2, 3, 4, 5];
    const treatment = [8, 9, 10, 11, 12];
    const ks = boxHooks.kolmogorovSmirnovTwoSample(control, treatment);
    expect(isFiniteNumber(ks.D)).toBe(true);

    const pair = boxHooks.buildStandardPairResult({
      a: 0,
      b: 1,
      ai: 0,
      bi: 1,
      rawAValues: control,
      rawBValues: treatment,
      testResult: ks,
      labelA: 'Control',
      labelB: 'Treatment',
      paramEffectMeta: { value: 'cohenD', label: "Cohen's d", shortLabel: "Cohen's d", format: 'decimal' },
      nonParamEffectMeta: { value: 'rankBiserial', label: 'Rank-biserial r', shortLabel: 'Rank-biserial r', format: 'decimal' }
    });

    expect(pair.statName).toBe('D');
    expectClose(pair.stat, ks.D, 'box KS pair statistic');
    expect(`${pair.statName} = ${pair.stat.toFixed(4)}`).toMatch(/^D = \d/);
  });

  test('box two-sample KS returns p = 1 for identical empirical samples', () => {
    const result = boxHooks.kolmogorovSmirnovTwoSample([1, 2, 3, 4], [1, 2, 3, 4]);
    expect(result.D).toBe(0);
    expect(result.p).toBe(1);
  });

  test('box grouped statistical engines cover row-wise and grouped-comparison scopes with multiplicity families', () => {
    const groupedData = {
      groupsCount: 3,
      conditionsCount: 2,
      groupLabels: ['G1', 'G2', 'G3'],
      conditionLabels: ['C1', 'C2'],
      cellData: [
        [[1, 2, 3], [2, 4, 4]],
        [[10, 11, 12], [11, 13, 13]],
        [[20, 21, 22], [21, 23, 23]]
      ],
      observedCellData: [
        [[1, 2, 3], [2, 4, 4]],
        [[10, 11, 12], [11, 13, 13]],
        [[20, 21, 22], [21, 23, 23]]
      ],
      allRows: [
        [[1, 2], [10, 11], [20, 21]],
        [[2, 4], [11, 13], [21, 23]],
        [[3, 4], [12, 13], [22, 23]]
      ]
    };

    const rowWise = boxHooks.analyzeRowWiseTTests(groupedData);
    expect(rowWise.ok).toBe(true);
    expect(rowWise.rows).toHaveLength(6);
    expect(rowWise.columns.some(column => column.key === 'padjust')).toBe(true);

    boxState.groupedStats = { analysis: 'multipleComparisons', comparisonScope: 'groupsWithinCondition', multiplicityFamily: 'within-scope' };
    const withinScope = boxHooks.analyzeGroupedMultipleComparisons(groupedData);
    expect(withinScope.ok).toBe(true);
    expect(withinScope.rows).toHaveLength(6);
    expect(withinScope.columns.some(column => column.key === 'adjustedP')).toBe(true);
    expect(withinScope.footnotes.join(' ')).toMatch(/within-scope/i);

    boxState.groupedStats = { analysis: 'multipleComparisons', comparisonScope: 'groupsWithinCondition', multiplicityFamily: 'global' };
    const globalFamily = boxHooks.analyzeGroupedMultipleComparisons(groupedData);
    expect(globalFamily.ok).toBe(true);
    expect(globalFamily.rows).toHaveLength(6);
    expect(globalFamily.footnotes.join(' ')).toMatch(/global/i);

    boxState.groupedStats = { analysis: 'multipleComparisons', comparisonScope: 'conditionsWithinGroup', multiplicityFamily: 'within-scope' };
    const pairedWithinGroup = boxHooks.analyzeGroupedMultipleComparisons(groupedData);
    expect(pairedWithinGroup.ok).toBe(true);
    expect(pairedWithinGroup.rows).toHaveLength(3);
    expect(pairedWithinGroup.rows.every(row => row.test === 'Paired t-test')).toBe(true);

    const countEstimate = boxHooks.estimateGroupedMultipleComparisonCount(groupedData, { comparisonScope: 'groupsWithinCondition' });
    expect(countEstimate).toBe(6);
  });

  test('ROC resampling helpers cover bootstrap and permutation curve-difference branches', () => {
    const identicalPairs = [
      { label: 1, score: 0.9 },
      { label: 1, score: 0.8 },
      { label: 0, score: 0.4 },
      { label: 0, score: 0.3 }
    ];
    const bootstrapSame = rocHooks.bootstrapCurveDiff(identicalPairs, identicalPairs, 'roc', 50);
    const permutationSame = rocHooks.permutationCurveDiff(identicalPairs, identicalPairs, 'roc', 50);
    expectClose(bootstrapSame.diff, 0, 'roc bootstrap identical diff', { abs: 0, rel: 0 });
    expectClose(permutationSame.diff, 0, 'roc permutation identical diff', { abs: 0, rel: 0 });
    expectClose(bootstrapSame.p, 1, 'roc bootstrap identical p', { abs: 0, rel: 0 });
    expectClose(permutationSame.p, 1, 'roc permutation identical p', { abs: 0, rel: 0 });
    expect(Array.isArray(bootstrapSame.ci)).toBe(true);
    expect(bootstrapSame.ci).toHaveLength(2);
    expectClose(bootstrapSame.ci[0], 0, 'roc bootstrap identical ci low', { abs: 0, rel: 0 });
    expectClose(bootstrapSame.ci[1], 0, 'roc bootstrap identical ci high', { abs: 0, rel: 0 });

    const pairsA = [
      { label: 1, score: 0.95 }, { label: 1, score: 0.88 }, { label: 1, score: 0.81 },
      { label: 0, score: 0.55 }, { label: 0, score: 0.43 }, { label: 0, score: 0.31 }
    ];
    const pairsB = pairsA.map((row, index) => ({
      label: row.label,
      score: row.label === 1 ? row.score - 0.2 - (index * 0.01) : row.score + 0.15 + (index * 0.01)
    }));
    const bootstrapDiff = rocHooks.bootstrapCurveDiff(pairsA, pairsB, 'roc', 80);
    const permutationDiff = rocHooks.permutationCurveDiff(pairsA, pairsB, 'roc', 80);
    expect(isFiniteNumber(bootstrapDiff.diff)).toBe(true);
    expect(isFiniteNumber(permutationDiff.diff)).toBe(true);
    expect(bootstrapDiff.diff).toBeGreaterThan(0);
    expect(permutationDiff.diff).toBeGreaterThan(0);
    expect(bootstrapDiff.p).toBeGreaterThan(0);
    expect(bootstrapDiff.p).toBeLessThanOrEqual(1);
    expect(permutationDiff.p).toBeGreaterThan(0);
    expect(permutationDiff.p).toBeLessThanOrEqual(1);
  });

  test('survival extended helpers cover pairwise comparisons, median ratios, and Cox-derived hazard ratios', () => {
    const series = [
      {
        name: 'Control',
        records: [
          { time: 2.0, event: true }, { time: 3.1, event: false }, { time: 4.2, event: true },
          { time: 5.6, event: true }, { time: 6.1, event: false }, { time: 7.3, event: true }
        ]
      },
      {
        name: 'Treatment A',
        records: [
          { time: 3.0, event: false }, { time: 4.0, event: true }, { time: 5.0, event: false },
          { time: 6.8, event: true }, { time: 7.5, event: false }, { time: 9.0, event: true }
        ]
      },
      {
        name: 'Treatment B',
        records: [
          { time: 4.2, event: false }, { time: 5.1, event: false }, { time: 6.7, event: true },
          { time: 7.8, event: false }, { time: 9.3, event: true }, { time: 10.5, event: false }
        ]
      }
    ].map(group => ({
      ...group,
      km: survivalHooks.computeKaplanMeier(group.records)
    }));

    const pairwise = survivalHooks.computePairwiseComparisons(series, 'holm');
    expect(pairwise.available).toBe(true);
    expect(pairwise.rows).toHaveLength(3);
    pairwise.rows.forEach(row => {
      expect(isFiniteNumber(row.chi2)).toBe(true);
      expect(isFiniteNumber(row.p)).toBe(true);
      expect(isFiniteNumber(row.adjustedP)).toBe(true);
      expect(row.adjustedP).toBeGreaterThanOrEqual(row.p - 1e-12);
    });

    const medianRatios = survivalHooks.computeMedianSurvivalRatios(series);
    expect(medianRatios.available).toBe(true);
    expect(medianRatios.rows).toHaveLength(3);
    const controlVsA = medianRatios.rows.find(row => row.groupA === 'Control' && row.groupB === 'Treatment A');
    expect(controlVsA).toBeTruthy();
    expectClose(controlVsA.ratio, series[1].km.median / series[0].km.median, 'survival median ratio Control/Treatment A', { abs: 1e-12, rel: 1e-9 });

    const summary = { series, covariateColumns: [] };
    const coxModel = survivalHooks.fitCoxModel(summary, { enabled: true });
    expect(coxModel.available).toBe(true);
    expect(coxModel.coefficients.length).toBe(2);
    expect(coxModel.diagnostics?.iterations).toBeGreaterThan(0);
    expect(coxModel.diagnostics?.likelihoodConverged).toBe(true);
    expect(coxModel.diagnostics?.likelihoodRatio).toMatchObject({ available: true });

    const hazardRatios = survivalHooks.computeHazardRatios(series, coxModel, { enabled: true });
    expect(hazardRatios.available).toBe(true);
    expect(hazardRatios.rows).toHaveLength(3);
    hazardRatios.rows.forEach(row => {
      expect(isFiniteNumber(row.hazardRatio)).toBe(true);
      expect(row.hazardRatio).toBeGreaterThan(0);
      expect(row.ciLow == null || isFiniteNumber(row.ciLow)).toBe(true);
      expect(row.ciHigh == null || isFiniteNumber(row.ciHigh)).toBe(true);
    });
  });

  test('Cox likelihood-ratio inference follows partial-likelihood convergence, not coefficient convergence alone', () => {
    const separatedSummary = {
      series: [
        {
          name: 'Events',
          records: Array.from({ length: 8 }, (_, index) => ({ time: index + 1, event: true }))
        },
        {
          name: 'No events',
          records: Array.from({ length: 8 }, (_, index) => ({ time: 10 + index, event: false }))
        }
      ],
      covariateColumns: []
    };

    const separated = survivalHooks.fitCoxModel(separatedSummary, { enabled: true });
    expect(separated.available).toBe(true);
    expect(separated.diagnostics.converged).toBe(false);
    expect(separated.diagnostics.likelihoodConverged).toBe(true);
    expect(separated.diagnostics.inferenceAvailable).toBe(false);
    expect(separated.diagnostics.likelihoodRatio.available).toBe(true);
    expect(isFiniteNumber(separated.diagnostics.likelihoodRatio.p)).toBe(true);

    const unfinished = survivalHooks.fitCoxModel(separatedSummary, { enabled: true, maxIterations: 1 });
    expect(unfinished.available).toBe(true);
    expect(unfinished.diagnostics.likelihoodConverged).toBe(false);
    expect(unfinished.diagnostics.likelihoodRatio).toMatchObject({
      available: false,
      reason: expect.stringContaining('did not stabilize')
    });
    expect(Number.isNaN(unfinished.diagnostics.likelihoodRatio.p)).toBe(true);
    expect(Number.isNaN(unfinished.diagnostics.aic)).toBe(true);
    expect(Number.isNaN(unfinished.diagnostics.bic)).toBe(true);
  });

  test('Cox refuses redundant group and covariate predictors', () => {
    const survivalState = window.Components.survival.__getState();
    survivalState.covariateSettings = { 4: { enabled: true, type: 'baseline' } };
    const recordsForGroup = groupValue => Array.from({ length: 12 }, (_, index) => ({
      time: index + 1,
      event: index < 10 && index % 2 === 0,
      extras: [groupValue]
    }));
    const model = survivalHooks.fitCoxModel({
      series: [
        { name: 'Control', records: recordsForGroup(0) },
        { name: 'Treatment', records: recordsForGroup(1) }
      ],
      covariateColumns: [{ index: 4, header: 'Treatment indicator' }]
    }, { enabled: true });

    expect(model).toMatchObject({
      available: false,
      message: expect.stringMatching(/redundant|not separately identifiable/i)
    });
  });

  test('Cox fitted likelihood is invariant to covariate units', () => {
    const survivalState = window.Components.survival.__getState();
    survivalState.covariateSettings = { 4: { enabled: true, type: 'baseline' } };
    const events = new Set([0, 1, 3, 4, 7, 9, 10, 13, 14, 17, 18, 20, 22, 25, 27]);
    const createSummary = scale => ({
      series: ['Control', 'Treatment'].map(name => ({
        name,
        records: Array.from({ length: 30 }, (_, index) => ({
          time: index + 1,
          event: events.has(index),
          extras: [scale * (((index * 17) % 31) - 15)]
        }))
      })),
      covariateColumns: [{ index: 4, header: 'Score' }]
    });

    const ordinary = survivalHooks.fitCoxModel(createSummary(1), { enabled: true, maxIterations: 100 });
    const rescaled = survivalHooks.fitCoxModel(createSummary(0.000001), { enabled: true, maxIterations: 100 });
    expect(ordinary.diagnostics?.likelihoodConverged).toBe(true);
    expect(rescaled.diagnostics?.likelihoodConverged).toBe(true);
    expectClose(rescaled.diagnostics.logLikelihood, ordinary.diagnostics.logLikelihood, 'Cox partial likelihood under covariate rescaling', { abs: 1e-7, rel: 1e-7 });
    expectClose(rescaled.coefficients[1].beta * 0.000001, ordinary.coefficients[1].beta, 'Cox coefficient under covariate rescaling', { abs: 1e-5, rel: 1e-5 });
  });
});
