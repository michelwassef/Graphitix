const fs = require('fs');
const vm = require('vm');
const path = require('path');

function loadScript(relativePath){
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8'), { filename: relativePath });
}

describe('cross-component statistical corrections', () => {
  beforeAll(() => {
    global.window = global;
    global.self = global;
    global.Shared = {};
    global.Components = {};
    loadScript('libs/jstat.min.js');
    loadScript('js/shared/stats.js');
    loadScript('js/shared/boxStatsModel.js');
    loadScript('js/shared/regression.js');
  });

  test('multiplicity adjustment preserves invalid p-values as missing', () => {
    expect(Shared.stats.adjustPValues([0.01, NaN, 0.04, -1, undefined], { method: 'holm' }))
      .toEqual([0.02, null, 0.04, null, null]);
  });

  test('Tukey HSD matches finite-df studentized-range reference values', () => {
    const result = Shared.boxStatsModel.computeTukeyComparisons(
      [[1,2,3,4], [5,6,7,8], [2,2.5,3,3.5]], ['A','B','C'], { alpha: 0.05 }
    );
    expect(result.ok).toBe(true);
    expect(result.pairs[0].pAdj).toBeCloseTo(0.00176431, 5);
    expect(result.pairs[1].pAdj).toBeCloseTo(0.94668960, 5);
    expect(result.pairs[2].pAdj).toBeCloseTo(0.00271332, 5);
  });

  test('Games-Howell matches Welch studentized-range reference values', () => {
    const result = Shared.boxStatsModel.computeGamesHowellComparisons(
      [[1,2,3,4], [5,6,7,8], [2,2.5,3,3.5]], ['A','B','C'], { alpha: 0.05 }
    );
    expect(result.ok).toBe(true);
    expect(result.pairs[0].p).toBeCloseTo(0.01104973, 5);
    expect(result.pairs[1].p).toBeCloseTo(0.93691397, 5);
    expect(result.pairs[2].p).toBeCloseTo(0.01113867, 4);
  });

  test('binary logistic regression rejects non-binary responses instead of clamping', () => {
    const result = Shared.regressionTools.fitRegression([{x:1,y:2},{x:2,y:0}], { mode: 'logistic' });
    expect(result.warnings.join(' ')).toMatch(/encoded exactly as 0 or 1/i);
  });
});
