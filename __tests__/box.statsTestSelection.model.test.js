describe('Box explicit statistical test selection', () => {
  let model;

  const baseSelection = [
    { index: 0, label: 'Control', values: [10, 12, 11, 13, 12, 14, 15, 13] },
    { index: 1, label: 'Treatment A', values: [14, 15, 16, 15, 17, 18, 16, 17] },
    { index: 2, label: 'Treatment B', values: [9, 11, 10, 12, 13, 11, 12, 14] }
  ];

  const positiveSelection = [
    { index: 0, label: 'Control', values: [1.1, 1.4, 1.2, 1.8, 2.1, 1.6, 2.4, 1.9] },
    { index: 1, label: 'Treatment A', values: [2.2, 2.8, 2.5, 3.4, 4.1, 3.3, 4.8, 3.9] },
    { index: 2, label: 'Treatment B', values: [4.2, 5.1, 4.7, 6.3, 7.4, 6.8, 8.2, 7.6] }
  ];

  function compute(overrides = {}) {
    return model.computeBoxStatsModel({
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
      statsResamplingMode: 'auto',
      statsMonteCarloIterations: 4000,
      statsSeed: 1234,
      statsEffectParametric: 'cohenD',
      statsEffectNonParametric: 'rankBiserial',
      selection: baseSelection,
      ...overrides
    });
  }

  beforeAll(() => {
    jest.resetModules();
    const jStatModule = require('jstat');
    global.Shared = {};
    global.jStat = jStatModule?.jStat || jStatModule;
    require('../js/shared/stats.js');
    require('../js/shared/boxStatsModel.js');
    model = global.Shared.boxStatsModel;
  });

  test('a single two-group hypothesis reports only the raw decision p-value even when Holm remains configured', () => {
    const configuredInference = {
      criterion: 'alpha',
      level: 0.05,
      method: 'holm',
      errorControl: 'fwer',
      valueKind: 'adjusted-p'
    };
    const result = compute({
      selection: positiveSelection.slice(0, 2),
      inferenceSnapshot: { comparisons: configuredInference }
    });

    expect(result.ok).toBe(true);
    expect(result.correctionCount).toBe(1);
    expect(result.effectiveComparisonMethod).toBe('none');
    const summary = result.tables.find(table => table.caption === 'Overall test summary');
    const pRows = summary.rows.filter(row => /p(?:-value| \()/i.test(String(row.metric)));
    expect(pRows.map(row => row.metric)).toEqual(['p-value']);
    expect(pRows[0].inferenceRole).toBe('comparison');
    expect(pRows[0].value.__statsInference).toEqual(expect.objectContaining({
      method: 'none',
      errorControl: 'unadjusted',
      valueKind: 'raw-p'
    }));
    expect(summary.footnotes.join(' ')).not.toMatch(/holm|correction applied across 1 test/i);
    expect(result.report.methodsText).not.toMatch(/holm|multiplicity-adjusted/i);
    expect(result.report.analysisSpec.correction).toBe('none');
    expect(result.report.analysisSpec.configuredCorrection).toBe('holm');
    expect(result.report.analysisSpec.inference.comparisons).toEqual(expect.objectContaining({
      method: 'none',
      errorControl: 'unadjusted',
      valueKind: 'raw-p'
    }));
  });

  test.each([
    ['classic', 'studentT'],
    ['welch', 'welchT'],
    ['lognormalClassic', 'lognormalT'],
    ['lognormalWelch', 'lognormalWelchT']
  ])('independent two-group variant %s executes %s', (variant, expectedId) => {
    const result = compute({
      statsParametricVariant: variant,
      selection: positiveSelection.slice(0, 2)
    });
    expect(result.ok).toBe(true);
    expect(result.analysis.id).toBe(expectedId);
    expect(result.report.analysisSpec.analysisId).toBe(expectedId);
  });

  test.each([
    ['classic', 'pairedT'],
    ['ratioT', 'ratioT']
  ])('paired two-group variant %s executes %s', (variant, expectedId) => {
    const result = compute({
      statsPaired: true,
      statsParametricVariant: variant,
      selection: positiveSelection.slice(0, 2)
    });
    expect(result.ok).toBe(true);
    expect(result.analysis.id).toBe(expectedId);
  });

  test.each([
    ['mannWhitney', 'mannWhitney'],
    ['kolmogorovSmirnov', 'kolmogorovSmirnov']
  ])('independent rank variant %s executes %s', (variant, expectedId) => {
    const result = compute({
      statsTest: 'nonparametric',
      statsNonParametricVariant: variant,
      selection: baseSelection.slice(0, 2)
    });
    expect(result.ok).toBe(true);
    expect(result.analysis.id).toBe(expectedId);
  });

  test('paired rank choice executes Wilcoxon signed-rank', () => {
    const result = compute({
      statsTest: 'nonparametric',
      statsPaired: true,
      statsNonParametricVariant: 'wilcoxonSignedRank',
      selection: baseSelection.slice(0, 2)
    });
    expect(result.ok).toBe(true);
    expect(result.analysis.id).toBe('wilcoxonSignedRank');
  });

  test.each([
    ['classic', 'oneWayAnova'],
    ['welch', 'welchAnova'],
    ['lognormalClassic', 'lognormalAnova'],
    ['lognormalWelch', 'lognormalWelchAnova']
  ])('independent multi-group variant %s executes %s', (variant, expectedId) => {
    const result = compute({
      statsParametricVariant: variant,
      selection: positiveSelection
    });
    expect(result.ok).toBe(true);
    expect(result.analysis.id).toBe(expectedId);
    expect(result.tables[0].rows.some(row => row.metric === 'Overall test' && row.value === result.analysis.label)).toBe(true);
  });

  test('paired multi-group choices execute repeated-measures ANOVA and Friedman', () => {
    const rm = compute({ statsPaired: true, statsParametricVariant: 'classic' });
    expect(rm.ok).toBe(true);
    expect(rm.analysis.id).toBe('repeatedMeasuresAnova');

    const friedman = compute({
      statsTest: 'nonparametric',
      statsPaired: true,
      statsNonParametricVariant: 'friedman'
    });
    expect(friedman.ok).toBe(true);
    expect(friedman.analysis.id).toBe('friedman');
  });

  test('independent multi-group rank choice executes Kruskal-Wallis', () => {
    const result = compute({
      statsTest: 'nonparametric',
      statsNonParametricVariant: 'kruskalWallis'
    });
    expect(result.ok).toBe(true);
    expect(result.analysis.id).toBe('kruskalWallis');
  });

  test('one-sample choices execute the requested family', () => {
    const oneSampleT = compute({
      statsMode: 'oneSample',
      statsOneSampleValue: 10,
      selection: baseSelection.slice(0, 1)
    });
    expect(oneSampleT.ok).toBe(true);
    expect(oneSampleT.analysis.id).toBe('oneSampleT');
    expect(oneSampleT.effectiveComparisonMethod).toBe('none');
    const oneSampleColumns = oneSampleT.tables.find(table => table.caption === 'One-sample t-tests').columns;
    expect(oneSampleColumns.some(column => column.key === 'padj')).toBe(false);
    expect(oneSampleColumns.find(column => column.key === 'p')?.inferenceRole).toBe('comparison');

    const oneSampleW = compute({
      statsTest: 'nonparametric',
      statsMode: 'oneSample',
      statsNonParametricVariant: 'wilcoxonSignedRank',
      statsOneSampleValue: 10,
      selection: baseSelection.slice(0, 1)
    });
    expect(oneSampleW.ok).toBe(true);
    expect(oneSampleW.analysis.id).toBe('oneSampleWilcoxon');
  });

  test('a single custom pair is reported as one unadjusted decision p-value', () => {
    const result = compute({
      statsMode: 'custom',
      statsCustomPairs: [{ ai: 0, bi: 1 }],
      selection: baseSelection.slice(0, 2)
    });

    expect(result.ok).toBe(true);
    expect(result.correctionCount).toBe(1);
    expect(result.effectiveComparisonMethod).toBe('none');
    const comparisons = result.tables.find(table => table.caption === 'Custom pairwise comparisons');
    expect(comparisons.columns.find(column => column.key === 'padj')?.label).toBe('p-value');
    expect(comparisons.footnotes.join(' ')).not.toMatch(/holm|correction applied across 1 test/i);
    expect(result.report.analysisSpec.correction).toBe('none');
    expect(result.report.analysisSpec.configuredCorrection).toBe('holm');
  });

  test('invalid explicit choices fail instead of falling back', () => {
    const result = compute({
      statsPaired: true,
      statsParametricVariant: 'welch',
      selection: baseSelection.slice(0, 2)
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/not valid|choose an available test/i);
  });

  test('assumption diagnostics remain advisory and cannot substitute the chosen test', () => {
    const result = compute({
      statsParametricVariant: 'classic',
      selection: [
        { index: 0, label: 'A', values: [1, 1, 1, 1.1, 1.2, 20] },
        { index: 1, label: 'B', values: [2, 4, 8, 16, 32, 64] },
        { index: 2, label: 'C', values: [3, 3.1, 3.2, 3.3, 3.4, 3.5] }
      ]
    });
    expect(result.ok).toBe(true);
    expect(result.analysis.id).toBe('oneWayAnova');
    expect(result.assumptionDiagnostics.selectionPolicy).toBe('explicit-user-choice');
    expect(result.assumptionDiagnostics.parametricOverrideActive).toBe(false);
  });

  test('directional alternatives and one-sided confidence intervals are retained', () => {
    const result = compute({
      statsParametricVariant: 'welch',
      statsAlternative: 'greater',
      statsCiLevel: 0.9,
      selection: baseSelection.slice(0, 2)
    });
    expect(result.ok).toBe(true);
    expect(result.analysis.id).toBe('welchT');
    expect(result.pairs[0].ciHigh).toBe(Infinity);
    expect(result.tables.flatMap(table => table.rows || []).some(row => String(row.ci || row.value || '').includes('∞'))).toBe(true);
    expect(result.tables).toEqual(expect.arrayContaining([
      expect.objectContaining({ caption: 'Overall test summary', section: 'summary' })
    ]));
  });

  test('lognormal inference and post-hoc results stay on the ratio scale', () => {
    const result = compute({
      statsParametricVariant: 'lognormalWelch',
      statsPostHoc: 'gamesHowell',
      selection: positiveSelection
    });
    expect(result.ok).toBe(true);
    expect(result.analysis.id).toBe('lognormalWelchAnova');
    expect(result.pairs.length).toBe(3);
    expect(result.pairs.every(pair => pair.differenceScale === 'ratio' && pair.diff > 0 && pair.ciLow > 0 && pair.ciHigh > 0)).toBe(true);
    const pairTable = result.tables.find(table => table.caption === 'Pairwise comparisons');
    expect(pairTable.columns.some(column => /Geometric mean ratio/.test(column.label))).toBe(true);
  });

  test('rank resampling is deterministic with a fixed seed', () => {
    const payload = {
      statsTest: 'nonparametric',
      statsNonParametricVariant: 'mannWhitney',
      statsResamplingMode: 'monte-carlo',
      statsMonteCarloIterations: 2500,
      statsSeed: 77,
      selection: baseSelection.slice(0, 2)
    };
    const first = compute(payload);
    const second = compute(payload);
    expect(first.pairs[0].p).toBe(second.pairs[0].p);
  });


  test('every grouped analysis choice executes its exact branch and reports it explicitly', () => {
    const rows = Array.from({ length: 6 }, (_, row) => [
      [10 + row, 13 + row],
      [16 + row, 22 + row]
    ]);
    const groupedData = {
      ok: true,
      groupsCount: 2,
      conditionsCount: 2,
      rowsWithData: rows.length,
      observedRowsWithData: rows.length,
      partialRowsSkipped: 0,
      groupLabels: ['Control', 'Treatment'],
      conditionLabels: ['T1', 'T2'],
      rows,
      cellData: [
        [rows.map(row => row[0][0]), rows.map(row => row[0][1])],
        [rows.map(row => row[1][0]), rows.map(row => row[1][1])]
      ]
    };
    for (const analysis of ['twoWayAnova', 'rowRandomMixed', 'threeWayAnova', 'rowTTests', 'multipleComparisons']) {
      const result = model.computeBoxStatsModel({
        mode: 'grouped',
        grouped: {
          analysis,
          comparisonScope: 'groupsWithinCondition',
          multiplicityFamily: 'within-scope',
          data: groupedData
        },
        statsCorrection: 'holm',
        statsAlpha: 0.05,
        statsCiLevel: 0.95
      });
      expect(result.ok).toBe(true);
      expect(result.analysisId).toBe(analysis);
      expect(result.report.analysisSpec.analysisId).toBe(analysis);
      expect(result.report.methodsText).toContain(result.report.analysisSpec.analysisLabel);
    }
  });

  test('reports are deterministic and contain no volatile timestamp', () => {
    const first = compute({ statsParametricVariant: 'welch' });
    const second = compute({ statsParametricVariant: 'welch' });
    expect(first.report).toEqual(second.report);
    expect(JSON.stringify(first.report)).not.toMatch(/generatedAt|20\d{2}-\d{2}-\d{2}T/);
  });
});
