const fs = require('fs');
const path = require('path');

describe('cross-component statistical corrections', () => {
  beforeAll(() => {
    jest.resetModules();
    window.Shared = {};
    window.Components = {};
    require('../../libs/jstat.min.js');
    require('../../js/shared/stats.js');
    require('../../js/shared/boxStatsModel.js');
    require('../../js/shared/regression.js');
  });

  test('multiplicity adjustment preserves invalid p-values as missing', () => {
    expect(window.Shared.stats.adjustPValues([0.01, NaN, 0.04, -1, undefined], { method: 'holm' }))
      .toEqual([0.02, null, 0.04, null, null]);
  });

  test('Tukey HSD matches finite-df studentized-range reference values', () => {
    const result = window.Shared.boxStatsModel.computeTukeyComparisons(
      [[1,2,3,4], [5,6,7,8], [2,2.5,3,3.5]], ['A','B','C'], { alpha: 0.05 }
    );
    expect(result.ok).toBe(true);
    expect(result.pairs[0].pAdj).toBeCloseTo(0.00176431, 4);
    expect(result.pairs[1].pAdj).toBeCloseTo(0.94668960, 4);
    expect(result.pairs[2].pAdj).toBeCloseTo(0.00271332, 4);
  });

  test('Games-Howell matches Welch studentized-range reference values', () => {
    const result = window.Shared.boxStatsModel.computeGamesHowellComparisons(
      [[1,2,3,4], [5,6,7,8], [2,2.5,3,3.5]], ['A','B','C'], { alpha: 0.05 }
    );
    expect(result.ok).toBe(true);
    expect(result.pairs[0].p).toBeCloseTo(0.01104973, 5);
    expect(result.pairs[1].p).toBeCloseTo(0.93691397, 5);
    expect(result.pairs[2].p).toBeCloseTo(0.01113867, 4);
  });

  test('Tukey and Games-Howell match unequal-size SciPy references and 99% intervals', () => {
    const groups=[[1,2,3],[4,6,7,9],[2,3,5,8,11]];
    const labels=['A','B','C'];
    const tukey=window.Shared.boxStatsModel.computeTukeyComparisons(groups,labels,{ ciLevel:0.99 });
    const gamesHowell=window.Shared.boxStatsModel.computeGamesHowellComparisons(groups,labels,{ ciLevel:0.99 });
    expect(tukey.ok).toBe(true);
    expect(tukey.df).toBe(9);
    expect(tukey.pairs[0].pAdj).toBeCloseTo(0.14140013,4);
    expect(tukey.pairs[0].ciLow).toBeCloseTo(-12.66381436,4);
    expect(tukey.pairs[0].ciHigh).toBeCloseTo(3.66381436,4);
    expect(gamesHowell.ok).toBe(true);
    expect(gamesHowell.pairs[0].df).toBeCloseTo(4.49222798,6);
    expect(gamesHowell.pairs[0].p).toBeCloseTo(0.03450072,4);
    expect(gamesHowell.pairs[0].ciLow).toBeCloseTo(-10.78255298,4);
    expect(gamesHowell.pairs[0].ciHigh).toBeCloseTo(1.78255298,4);
  });

  test('Games-Howell keeps zero group variance exact and rejects zero pairwise variance', () => {
    const oneConstant=window.Shared.boxStatsModel.computeGamesHowellComparisons(
      [[1,1,1],[1,2,3],[2,3,4]],['A','B','C'],{ ciLevel:0.95 }
    );
    expect(oneConstant.ok).toBe(true);
    expect(oneConstant.pairs[0].varI).toBe(0);
    expect(oneConstant.pairs[0].df).toBeCloseTo(2,10);
    expect(oneConstant.pairs[0].p).toBeCloseTo(0.37787384,4);

    const allConstant=window.Shared.boxStatsModel.computeGamesHowellComparisons(
      [[1,1,1],[2,2,2],[3,3,3]],['A','B','C'],{ ciLevel:0.95 }
    );
    expect(allConstant.ok).toBe(false);
    expect(allConstant.message).toMatch(/positive pairwise variance/i);
  });

  test('studentized-range distribution handles support boundaries and invalid parameters', () => {
    const model = window.Shared.boxStatsModel;
    expect(model.studentizedRangeCDF(0, 3, 6)).toBe(0);
    expect(model.studentizedRangeSF(0, 3, 6)).toBe(1);
    expect(model.studentizedRangeCDF(Number.POSITIVE_INFINITY, 3, 6)).toBe(1);
    expect(model.studentizedRangeSF(Number.POSITIVE_INFINITY, 3, 6)).toBe(0);
    const representableExtremeTail = model.studentizedRangeSF(1e50, 3, 6);
    expect(Number.isFinite(representableExtremeTail)).toBe(true);
    expect(representableExtremeTail).toBeGreaterThan(0);
    expect(model.studentizedRangeCDF(Number.NaN, 3, 6)).toBeNaN();
    expect(model.studentizedRangeSF(2, 1, 6)).toBeNaN();
    expect(model.studentizedRangeCDF(2, 3.5, 6)).toBeNaN();
    expect(model.studentizedRangeSF(2, 3, 0)).toBeNaN();
    expect(model.studentizedRangeCDF(2, 3, Number.NaN)).toBeNaN();
  });

  test('BRCA1 Tukey probabilities and simultaneous intervals match SciPy references', () => {
    const groups = [
      [1.22918958, 2.52757502, 2.29278175],
      [-0.97978524, -1.31618847, -0.63270399],
      [-3.78427131, -3.55639335, -3.70043972]
    ];
    const result = window.Shared.boxStatsModel.computeTukeyComparisons(groups, ['A', 'B', 'C'], { ciLevel: 0.95 });
    const expected = [
      { q: 11.506997985317202, p: 0.0004540625622713179, low: 1.86420289497591, high: 4.1212798050240895 },
      { q: 21.90434126199713, p: 1.135483993397468e-5, low: 4.568345121642576, high: 6.825422031690756 },
      { q: 10.397343276679928, p: 0.0007921269446995449, low: 1.575603771642577, high: 3.8326806816907566 }
    ];
    expect(result.ok).toBe(true);
    expect(result.df).toBe(6);
    result.pairs.forEach((pair, index) => {
      const reference = expected[index];
      expect(Math.abs(pair.q - reference.q)).toBeLessThan(1e-12);
      expect(Math.abs(pair.pAdj - reference.p)).toBeLessThan(reference.p * 0.005);
      expect(Math.abs(pair.ciLow - reference.low)).toBeLessThan(2e-7);
      expect(Math.abs(pair.ciHigh - reference.high)).toBeLessThan(2e-7);
    });
  });

  test('binary logistic regression rejects non-binary responses instead of clamping', () => {
    const result = window.Shared.regressionTools.fitRegression([{x:1,y:2},{x:2,y:0}], { mode: 'logistic' });
    expect(result.warnings.join(' ')).toMatch(/encoded exactly as 0 or 1/i);
  });

  test('logistic coefficient inference uses the final Fisher information and a stable z-statistic contract', () => {
    const points = [
      {x:-3,y:0},{x:-2,y:0},{x:-1,y:1},{x:0,y:0},{x:1,y:1},
      {x:2,y:0},{x:3,y:1},{x:4,y:1},{x:5,y:1},{x:6,y:1}
    ];
    const result = window.Shared.regressionTools.fitRegression(points, { mode: 'logistic', alpha: 0.05 });
    expect(result.available).toBe(true);
    expect(result.metrics.converged).toBe(true);
    expect(result.metrics.inferenceAvailable).toBe(true);
    expect(result.coefficientStats).toHaveLength(2);
    result.coefficientStats.forEach(stat => {
      expect(Number.isFinite(stat.standardError)).toBe(true);
      expect(Number.isFinite(stat.statistic)).toBe(true);
      expect(stat.statisticLabel).toBe('z');
      expect(stat.distribution).toBe('normal');
      expect(stat.pValue).toBeGreaterThanOrEqual(0);
      expect(stat.pValue).toBeLessThanOrEqual(1);
    });
    expect(result.summary.oddsRatioConfidenceInterval.low).toBeGreaterThan(0);
    expect(result.summary.oddsRatioConfidenceInterval.high).toBeGreaterThan(result.summary.oddsRatioConfidenceInterval.low);
  });

  test('logistic estimates and diagnostics match a Bernoulli-logit reference case', () => {
    const points = [
      {x:-3,y:0},{x:-2,y:0},{x:-1,y:1},{x:0,y:0},{x:1,y:1},
      {x:2,y:0},{x:3,y:1},{x:4,y:1},{x:5,y:1},{x:6,y:1}
    ];
    const result = window.Shared.regressionTools.fitRegression(points, { mode: 'logistic', alpha: 0.05 });

    expect(result.coefficients[0]).toBeCloseTo(-0.2776778881, 8);
    expect(result.coefficients[1]).toBeCloseTo(0.6622082687, 8);
    expect(result.metrics.logLikelihood).toBeCloseTo(-4.3101219480, 8);
    expect(result.metrics.deviance).toBeCloseTo(8.6202438960, 8);
    expect(result.coefficientStats[0].standardError).toBeCloseTo(0.8945692375, 5);
    expect(result.coefficientStats[1].standardError).toBeCloseTo(0.4000937190, 5);
    expect(result.coefficientStats[1].pValue).toBeCloseTo(0.0978975470, 5);
    expect(result.coefficientCovariance[0][0]).toBeCloseTo(0.8002541206, 5);
    expect(result.coefficientCovariance[1][1]).toBeCloseTo(0.1600749840, 5);
    expect(result.intervals.samples[0].ciLow).toBeCloseTo(0.0036709652, 8);
    expect(result.intervals.samples.at(-1).ciHigh).toBeCloseTo(0.9997203776, 8);
  });

  test('logistic inference remains translation-stable for large predictor offsets', () => {
    const xValues = [-3,-2,-1,0,1,2,3,4,5,6];
    const yValues = [0,0,1,0,1,0,1,1,1,1];
    const centered = xValues.map((x, index) => ({ x, y: yValues[index] }));
    const offset = 1e12;
    const shifted = xValues.map((x, index) => ({ x: offset + x, y: yValues[index] }));
    const compressed = xValues.map((x, index) => ({ x: x * 1e-9, y: yValues[index] }));
    const centeredFit = window.Shared.regressionTools.fitRegression(centered, { mode: 'logistic', alpha: 0.05 });
    const shiftedFit = window.Shared.regressionTools.fitRegression(shifted, { mode: 'logistic', alpha: 0.05 });
    const compressedFit = window.Shared.regressionTools.fitRegression(compressed, { mode: 'logistic', alpha: 0.05 });

    expect(shiftedFit.available).toBe(true);
    expect(shiftedFit.metrics.inferenceAvailable).toBe(true);
    expect(compressedFit.available).toBe(true);
    expect(compressedFit.metrics.inferenceAvailable).toBe(true);
    expect(shiftedFit.coefficients[1]).toBeCloseTo(centeredFit.coefficients[1], 10);
    expect(shiftedFit.coefficientCovariance[1][1]).toBeCloseTo(centeredFit.coefficientCovariance[1][1], 10);
    xValues.forEach((x, index) => {
      expect(shiftedFit.predict(shifted[index].x)).toBeCloseTo(centeredFit.predict(x), 12);
      expect(compressedFit.predict(compressed[index].x)).toBeCloseTo(centeredFit.predict(x), 12);
    });
    expect(shiftedFit.intervals.samples[0].y).toBeCloseTo(centeredFit.intervals.samples[0].y, 12);
    expect(shiftedFit.intervals.samples[0].ciLow).toBeCloseTo(centeredFit.intervals.samples[0].ciLow, 12);
    expect(shiftedFit.intervals.samples.at(-1).y).toBeCloseTo(centeredFit.intervals.samples.at(-1).y, 12);
    expect(shiftedFit.intervals.samples.at(-1).ciHigh).toBeCloseTo(centeredFit.intervals.samples.at(-1).ciHigh, 12);
  });

  test('Box statistical UI labels describe the implemented procedures truthfully', () => {
    const source = fs.readFileSync(path.join(__dirname, '../..', 'js/components/box.js'), 'utf8');
    const statsModel = fs.readFileSync(path.join(__dirname, '../..', 'js/shared/boxStatsModel.js'), 'utf8');
    expect(statsModel).toContain('Control comparisons (pooled t + Sidak)');
    expect(statsModel).toContain('Control comparisons (Welch + Sidak)');
    expect(source).toContain('optionResolution.effectiveLabel');
    expect(statsModel).toContain('Friedman pairwise comparisons calibrated by a Monte Carlo maximum-statistic within-row permutation test');
    expect(source.includes("['rout','MAD + BH flags (keep all)']")).toBe(true);
    expect(source.includes("'BH score cutoff:'")).toBe(true);
    expect(source.includes("'FDR q:'")).toBe(false);
    expect(source).toContain('Rows-random repeated-measures model');
    expect(source).toContain('Unreplicated three-factor ANOVA (ABC as error)');
  });

  test('Scatter coefficient tables preserve generic statistic and reference-distribution fields', () => {
    const source = fs.readFileSync(path.join(__dirname, '../..', 'js/components/scatter.js'), 'utf8');
    expect(source).toContain("statistic: formatMetricValue(stat?.statistic ?? stat?.zStatistic ?? stat?.tStatistic, 3)");
    expect(source).toContain("statisticType: stat?.statisticLabel || (stat?.distribution === 'normal' ? 'z' : 't')");
    expect(source).toContain("{ key:'statistic', label:'Test statistic' }");
    expect(source).toContain("{ key:'statisticType', label:'Reference' }");
  });

});
