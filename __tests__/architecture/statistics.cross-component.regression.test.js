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
    expect(source).toContain('pooled t + Sidak control comparisons');
    expect(source).toContain('Welch + Sidak control comparisons');
    expect(source).toContain('Friedman pairwise max-statistic permutation');
    expect(source).toContain("['rout','MAD + BH']");
    expect(source).toContain("'FDR q:'");
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
