describe('shared seeded resampling contract', () => {
  beforeEach(() => {
    jest.resetModules();
    global.Shared = {};
    global.Components = {};
    window.Shared = global.Shared;
    window.Components = global.Components;
    const jStatModule = require('jstat');
    const jStat = jStatModule?.jStat || jStatModule;
    global.jStat = jStat;
    window.jStat = jStat;
    require('../js/shared/resampling.js');
  });

  test('scoped generators are stable and isolated by scope', () => {
    const api = window.Shared.resampling;
    const first = api.createScopedRandom(42, 'roc', 'series-a');
    const second = api.createScopedRandom(42, 'roc', 'series-a');
    const sibling = api.createScopedRandom(42, 'roc', 'series-b');

    const firstValues = Array.from({ length: 8 }, () => first());
    const secondValues = Array.from({ length: 8 }, () => second());
    const siblingValues = Array.from({ length: 8 }, () => sibling());

    expect(secondValues).toEqual(firstValues);
    expect(siblingValues).not.toEqual(firstValues);
  });

  test('ROC bootstrap and permutation helpers are reproducible for one seed', () => {
    require('../js/vendor.js');
    require('../js/shared/stats.js');
    require('../js/shared/regression.js');
    require('../js/components/roc.js');

    const hooks = window.Components.roc.__testHooks;
    const pairsA = [
      { label: 1, score: 0.95 }, { label: 1, score: 0.83 }, { label: 1, score: 0.72 },
      { label: 0, score: 0.61 }, { label: 0, score: 0.44 }, { label: 0, score: 0.22 }
    ];
    const pairsB = pairsA.map((row, index) => ({
      label: row.label,
      score: row.label === 1 ? row.score - 0.12 - (index * 0.01) : row.score + 0.09 + (index * 0.01)
    }));

    const bootstrapA = hooks.bootstrapCurveDiff(pairsA, pairsB, 'roc', 500, 9876);
    const bootstrapB = hooks.bootstrapCurveDiff(pairsA, pairsB, 'roc', 500, 9876);
    const permutationA = hooks.permutationCurveDiff(pairsA, pairsB, 'roc', 500, 9876);
    const permutationB = hooks.permutationCurveDiff(pairsA, pairsB, 'roc', 500, 9876);

    expect(bootstrapB).toEqual(bootstrapA);
    expect(permutationB).toEqual(permutationA);
    expect(bootstrapA).toEqual(expect.objectContaining({ seed: 9876, iterations: 500 }));
    expect(permutationA).toEqual(expect.objectContaining({ seed: 9876, iterations: 500 }));
  });
});
