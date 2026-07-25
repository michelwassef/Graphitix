const fs = require('fs');
const path = require('path');

describe('ROC statistical standardization', () => {
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
    require('../js/vendor.js');
    require('../js/shared/resampling.js');
    require('../js/shared/stats.js');
    require('../js/shared/regression.js');
    require('../js/components/roc.js');
  });

  function referencePairs() {
    const csv = fs.readFileSync(path.join(__dirname, 'fixtures', 'roc.reference.dataset.csv'), 'utf8').trim().split(/\r?\n/);
    return csv.slice(1).map((line, observationIndex) => {
      const [label, score] = line.split(',').map(Number);
      return { label, score, observationIndex };
    });
  }

  test('matches the reference AUC, DeLong interval, exact Mann–Whitney p value, and Youden cutoff', () => {
    const hooks = window.Components.roc.__testHooks;
    const pairs = referencePairs();
    const inference = hooks.computeSingleAucInference(pairs, 0.05, 'auto');
    const threshold = hooks.selectYoudenThreshold(hooks.buildThresholdMetricsTable(pairs));

    expect(hooks.computeCurveMetric(pairs, 'roc')).toBeCloseTo(0.9783549783549783, 14);
    expect(inference.auc).toBeCloseTo(0.9783549783549783, 14);
    expect(inference.se).toBeCloseTo(0.0204428, 6);
    expect(inference.ciLow).toBeCloseTo(0.938287, 5);
    expect(inference.ciHigh).toBe(1);
    expect(inference.pValue).toBeCloseTo(2.945177535301828e-7, 14);
    expect(inference.pMethod).toBe('exact Mann–Whitney');
    expect(inference.mannWhitneyU).toBe(226);
    expect(threshold.threshold).toBeCloseTo(-1.739706, 6);
    expect(threshold.sensitivity).toBeCloseTo(20 / 21, 14);
    expect(threshold.specificity).toBeCloseTo(10 / 11, 14);
    expect(threshold.youden).toBeCloseTo((20 / 21) + (10 / 11) - 1, 14);
  });


  test('uses tie-corrected asymptotic Mann–Whitney inference when scores are tied', () => {
    const hooks = window.Components.roc.__testHooks;
    const pairs = [
      { label: 1, score: 0.8 },
      { label: 0, score: 0.8 },
      { label: 1, score: 0.6 },
      { label: 0, score: 0.4 }
    ];
    const result = hooks.computeSingleAucInference(pairs, 0.05, 'auto');
    expect(result.auc).toBeCloseTo(0.625, 14);
    expect(result.pMethod).toContain('asymptotic Mann–Whitney');
    expect(result.exactPValue).toBe(false);
    expect(result.pValue).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });

  test('reports an exact-test fallback when exact inference is requested with ties', () => {
    const hooks = window.Components.roc.__testHooks;
    const result = hooks.computeMannWhitneyInference([
      { label: 1, score: 1 },
      { label: 0, score: 1 },
      { label: 1, score: 0 },
      { label: 0, score: -1 }
    ], 'exact');
    expect(result.exact).toBe(false);
    expect(result.fallbackReason).toMatch(/tied scores/i);
  });

  test('groups tied scores so AUC is independent of row order', () => {
    const hooks = window.Components.roc.__testHooks;
    const first = [
      { label: 1, score: 0.8 },
      { label: 0, score: 0.8 },
      { label: 1, score: 0.6 },
      { label: 0, score: 0.4 }
    ];
    const reordered = [first[1], first[0], first[2], first[3]];
    expect(hooks.computeCurveMetric(first, 'roc')).toBeCloseTo(0.625, 14);
    expect(hooks.computeCurveMetric(reordered, 'roc')).toBeCloseTo(0.625, 14);
  });

  test('DeLong comparison aligns paired scores by observation index', () => {
    const hooks = window.Components.roc.__testHooks;
    const first = [
      { observationIndex: 0, label: 1, score: 0.9 },
      { observationIndex: 1, label: 1, score: 0.8 },
      { observationIndex: 2, label: 0, score: 0.3 },
      { observationIndex: 3, label: 0, score: 0.2 }
    ];
    const second = [first[2], first[0], first[3], first[1]].map(row => ({ ...row, score: row.score - 0.05 }));
    const result = hooks.delongCurveDiff(first, second);
    expect(result.pairedCount).toBe(4);
    expect(result.diff).toBeCloseTo(0, 14);
    expect(result.p).toBe(1);
  });
  test('persists the p-value display mode in the saved ROC statistics panel model', () => {
    const hooks = window.Components.roc.__testHooks;
    const source = {
      resultsModel: {
        schemaVersion: 1,
        kind: 'stats-panel',
        children: [{ type: 'stats-table', model: { pValueScientific: false, rows: [] } }],
        pValueScientific: false
      },
      reportModel: null
    };
    const scientific = hooks.setStatsPanelPValueScientific(source, true);
    expect(scientific.resultsModel.pValueScientific).toBe(true);
    expect(scientific.resultsModel.children[0].model.pValueScientific).toBe(true);
    expect(source.resultsModel.pValueScientific).toBe(false);
    expect(source.resultsModel.children[0].model.pValueScientific).toBe(false);

    const decimal = hooks.setStatsPanelPValueScientific(scientific, false);
    expect(decimal.resultsModel.pValueScientific).toBe(false);
  });

});
