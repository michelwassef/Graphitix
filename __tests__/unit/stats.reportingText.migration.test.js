describe('Box reporting text corrections', () => {
  beforeEach(() => {
    jest.resetModules();
    global.Shared = {};
    const jStatModule = require('jstat');
    global.jStat = jStatModule?.jStat || jStatModule;
    require('../../js/shared/stats.js');
    require('../../js/shared/boxStatsModel.js');
  });

  test('new independent Box reports use the correct article', () => {
    const report = global.Shared.boxStatsModel.computeBoxStatsModel({
      mode: 'single',
      statsTest: 'parametric',
      statsMode: 'all',
      statsPaired: false,
      statsParametricVariant: 'classic',
      statsNonParametricVariant: 'mannWhitney',
      statsPostHoc: 'standard',
      statsCorrection: 'holm',
      statsAlpha: 0.05,
      statsCiLevel: 0.95,
      statsAlternative: 'two-sided',
      selection: [
        { index: 0, label: 'Control', values: [10, 12, 11, 13] },
        { index: 1, label: 'Treatment', values: [14, 15, 16, 15] }
      ]
    }).report;

    expect(report.analysisSpec.schemaVersion).toBe('box-stats-spec-v8');
    expect(report.methodsText).toContain('The analysis used an independent design.');
  });

  test('saved v3 Box reports using spec v8 fix grammar and missing sentence spaces', () => {
    const reporting = global.Shared.statsReporting;
    const normalized = reporting.normalizeSavedPanelModel({
      reportModel: {
        kind: 'stats-report',
        schemaVersion: 3,
        methodsText: 'One-way ANOVA was applied to 3 selected groups. The analysis used a independent design.Overall-test decisions used α = 0.05. Holm pairwise decisions used family-wise α = 0.05. Confidence intervals not intrinsically tied to the multiplicity procedure used 95%. The alternative hypothesis was two-sided. Holm correction applied across 3 tests.Rank-based tests used an automatic hierarchy: exact when tractable, otherwise Monte Carlo or asymptotic approximations as appropriate.No statistical outlier screening was applied before analysis.',
        analysisSpec: { schemaVersion: 'box-stats-spec-v8' }
      }
    }).reportModel;

    expect(normalized.schemaVersion).toBe(4);
    expect(normalized.methodsText).toContain('The analysis used an independent design. Overall-test');
    expect(normalized.methodsText).toContain('tests. Rank-based tests');
    expect(normalized.methodsText).toContain('appropriate. No statistical');
    expect(normalized.methodsText).not.toContain('a independent design');
  });
});
