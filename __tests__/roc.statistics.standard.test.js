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
    const rows = [
      ...Array.from({ length: 17 }, (_, index) => [1, 20 - index]),
      [0, 3],
      [1, 2],
      [1, 1],
      [1, -1.739706],
      [0, -2],
      [1, -3],
      ...Array.from({ length: 9 }, (_, index) => [0, -4 - index])
    ];
    return rows.map(([label, score], observationIndex) => ({ label, score, observationIndex }));
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


  test('single-curve on-plot control reports AUC and p value while multi-curve mode keeps comparison text', () => {
    const hooks = window.Components.roc.__testHooks;
    const inference = hooks.computeSingleAucInference(referencePairs(), 0.05, 'auto');
    const single = hooks.buildOnPlotPresentation({
      seriesCount: 1,
      graphType: 'roc',
      stats: [{ auc: inference.auc, pVal: inference.pValue }]
    });

    expect(single.label).toBe('Show stats on plot');
    expect(single.lines).toEqual(['AUC = 0.978; p < 0.0001']);

    const comparison = hooks.buildOnPlotPresentation({
      seriesCount: 2,
      graphType: 'roc',
      compareResultModel: { displayText: 'ΔAUC = 0.120; p = 0.031' }
    });
    expect(comparison.label).toBe('Show comparison on plot');
    expect(comparison.lines).toEqual(['ΔAUC = 0.120; p = 0.031']);
  });

  test('single precision-recall curve uses the same stats toggle with average precision', () => {
    const hooks = window.Components.roc.__testHooks;
    const presentation = hooks.buildOnPlotPresentation({
      seriesCount: 1,
      graphType: 'pr',
      stats: [{ avgPrecision: 0.91234 }]
    });
    expect(presentation.label).toBe('Show stats on plot');
    expect(presentation.lines).toEqual(['AP = 0.912']);
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


  test('legend metric labels use compact two-decimal ROC AUC while preserving PR formatting', () => {
    const hooks = window.Components.roc.__testHooks;
    const pairs = referencePairs();
    const rocLabel = hooks.buildLegendMetricLabel({ name: 'Assay A', pairs }, 'roc', 'auto');
    expect(rocLabel).toMatch(/^Assay A \(AUC=[0-9]+\.[0-9]{2}\)$/);
    expect(rocLabel).not.toMatch(/CI|\[|\]/);
    const prLabel = hooks.buildLegendMetricLabel({ name: 'Assay A', pairs }, 'pr', 'auto');
    expect(prLabel).toMatch(/^Assay A — AP [0-9.]+$/);
  });

  test('default ROC axes stay equal and horizontal resize remains continuous from that baseline', () => {
    const hooks = window.Components.roc.__testHooks;
    const svgBox = document.createElement('div');
    svgBox.dataset.resizerDefaultWidth = '427';
    svgBox.dataset.resizerDefaultHeight = '427';
    svgBox.dataset.resizerBaseWidth = '427';
    svgBox.dataset.resizerBaseHeight = '427';
    const baseMargin = { top: 38, right: 100, bottom: 66, left: 70 };

    const effectivePlotWidth = (naturalWidth, adjustedMargin) => (
      naturalWidth - (adjustedMargin.right - baseMargin.right)
    );

    // At canonical size the natural 313 px X span receives a fixed 79 px
    // right-side gutter, making it equal to the 234 px Y span.
    let adjusted = hooks.applyDefaultXAxisGutter(baseMargin, 313, 234, svgBox);
    expect(adjusted.right).toBe(179);
    expect(effectivePlotWidth(313, adjusted)).toBe(234);

    // Horizontal drag keeps that same gutter. A 1 px / 32 px box shrink must
    // therefore produce the same 1 px / 32 px X-axis shrink with no mode jump.
    svgBox.dataset.resizerBaseWidth = '426';
    adjusted = hooks.applyDefaultXAxisGutter(baseMargin, 312, 234, svgBox);
    expect(adjusted.right).toBe(179);
    expect(effectivePlotWidth(312, adjusted)).toBe(233);

    svgBox.dataset.resizerBaseWidth = '395';
    adjusted = hooks.applyDefaultXAxisGutter(baseMargin, 281, 234, svgBox);
    expect(adjusted.right).toBe(179);
    expect(effectivePlotWidth(281, adjusted)).toBe(202);

    // Vertical resizing is independent: compensate the current height delta
    // when deriving the canonical gutter, leaving the X geometry untouched.
    svgBox.dataset.resizerBaseHeight = '400';
    adjusted = hooks.applyDefaultXAxisGutter(baseMargin, 281, 207, svgBox);
    expect(adjusted.right).toBe(179);
    expect(effectivePlotWidth(281, adjusted)).toBe(202);

    // Legacy/unbound DOM keeps the ordinary margin contract.
    expect(hooks.applyDefaultXAxisGutter(baseMargin, 313, 234, null)).toEqual(baseMargin);
  });

});
