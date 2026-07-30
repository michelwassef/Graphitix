const fs = require('fs');
const path = require('path');

describe('cross-component statistical corrections', () => {
  beforeAll(() => {
    jest.resetModules();
    window.Shared = {};
    window.Components = {};
    require('../libs/jstat.min.js');
    require('../js/shared/stats.js');
    require('../js/shared/boxStatsModel.js');
    require('../js/shared/regression.js');
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

  test('Box statistical UI labels describe the implemented procedures truthfully', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/components/box.js'), 'utf8');
    expect(source).toContain('pooled t + Sidak control comparisons');
    expect(source).toContain('Welch + Sidak control comparisons');
    expect(source).toContain('Friedman pairwise max-statistic permutation');
    expect(source).toContain("['rout','MAD + BH']");
    expect(source).toContain("'FDR q:'");
    expect(source).toContain('Rows-random repeated-measures model');
    expect(source).toContain('Unreplicated three-factor ANOVA (ABC as error)');
  });

  test('Scatter coefficient tables preserve generic statistic and reference-distribution fields', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js/components/scatter.js'), 'utf8');
    expect(source).toContain("statistic: formatMetricValue(stat?.statistic ?? stat?.zStatistic ?? stat?.tStatistic, 3)");
    expect(source).toContain("statisticType: stat?.statisticLabel || (stat?.distribution === 'normal' ? 'z' : 't')");
    expect(source).toContain("{ key:'statistic', label:'Test statistic' }");
    expect(source).toContain("{ key:'statisticType', label:'Reference' }");
  });

});
