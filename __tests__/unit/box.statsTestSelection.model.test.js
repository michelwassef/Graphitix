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
    require('../../js/shared/stats.js');
    require('../../js/shared/boxStatsModel.js');
    model = global.Shared.boxStatsModel;
  });

  test.each([
    [[-1, 2, 3], 2 / 3],
    [[0, -1, 2, 3, 0], 2 / 3],
    [[1, -1, 2, 2, 0], 0.7],
    [[0, 0], null],
    [[-3, -1, 0], -1],
    [[1, 2, 0], 1]
  ])('paired rank-biserial weights nonzero signed ranks for %j', (differences, expected) => {
    const actual = model.computeEffectSizeMetrics(differences, differences.map(() => 0), { paired: true });
    if(expected === null) expect(actual.nonParametric.rankBiserial).toBeUndefined();
    else expect(actual.nonParametric.rankBiserial).toBeCloseTo(expected, 12);
  });

  test('paired rank effect retains source-row alignment and decimal signed ranks', () => {
    const a = [0.5, null, 0.825, 0.375, 0.5], b = [0.525, 100, 0.775, 0.325, 0.55];
    expect(model.computeEffectSizeMetrics(a, b, { paired: true }).nonParametric.rankBiserial).toBeCloseTo(0.2, 12);
    expect(model.computeEffectSizeMetrics(b, a, { paired: true }).nonParametric.rankBiserial).toBeCloseTo(-0.2, 12);
  });

  test('Friedman honors explicit Monte Carlo and exact calibration with observed ties', () => {
    expect(model.computeFriedmanTest([[1, 2], [2, 3], [3, 1]], { resamplingMode: 'monte-carlo', iterations: 2000 }).footnote).toMatch(/Monte Carlo/);
    expect(model.computeFriedmanTest([[1, 1, 1, 1], [1, 2, 1, 2], [2, 2, 3, 3]], { resamplingMode: 'exact' }).footnote).toMatch(/exact permutation/);
    const tooLarge = Array.from({length:3}, (_, column) => Array.from({length:8}, (_, row) => column + row));
    const fallback=model.computeFriedmanTest(tooLarge,{resamplingMode:'exact',iterations:2000,seed:17});
    expect(fallback.calibrationMethod).toBe('monte-carlo');
    expect(fallback.footnote).toMatch(/exceeded.*200,000-state limit/);
    const result=compute({ statsTest:'nonparametric',statsPaired:true,statsNonParametricVariant:'friedman',statsResamplingMode:'exact',statsMonteCarloIterations:2000,selection:tooLarge.map((values,index)=>({index,label:`G${index}`,values})) });
    expect(result.report.analysisSpec.overallCalibrationMethod).toBe('monte-carlo');
    expect(result.report.methodsText).toContain(fallback.footnote);
    expect(result.report.methodsText).not.toContain('omnibus F-test');
  });

  test.each(['auto','exact','monte-carlo','asymptotic'])('Friedman all-tied rows remain nonsignificant under %s', resamplingMode => {
    const result=model.computeFriedmanTest([[1,2],[1,2],[1,2]],{resamplingMode,iterations:2000});
    expect(result.Q).toBe(0);
    expect(result.p).toBe(1);
  });

  test('control comparison reports identify Sidak calculations without named Dunnett claims', () => {
    const result = compute({ statsMode: 'reference', statsRef: 0, statsPostHoc: 'dunnett' });
    expect(result.ok).toBe(true);
    expect(result.report.methodsText).not.toMatch(/Dunnett/);
    expect(JSON.stringify(result.tables)).not.toMatch(/Dunnett/);
    expect(result.report.methodsText).toMatch(/Sidak|Šidák/);
  });

  test('Grubbs performs a single-outlier test and reports selection-sensitive inference', () => {
    const values = Array.from({ length: 18 }, (_, index) => index + 1).concat([80, 1000]);
    const screened = model.preprocessStatsGroups([values], ['A'], { statsOutlierMode: 'grubbs' });
    expect(screened.exclusions).toHaveLength(1);
    expect(screened.exclusions[0].value).toBe(1000);
    expect(screened.groups[0]).toContain(80);
    expect(screened.auditNotes.join(' ')).toMatch(/exploratory|data-dependent/i);
  });

  test('MAD heuristic flags observations without automatic exclusions or FDR claims', () => {
    const values = [10, 11, 12, 13, 14, 1000];
    const screened = model.preprocessStatsGroups([values], ['A'], { statsOutlierMode: 'rout' });
    expect(screened.groups[0]).toEqual(values);
    expect(screened.exclusions).toEqual([]);
    expect(screened.flags).toHaveLength(1);
    expect(screened.auditNotes.join(' ')).toMatch(/heuristic/);
    const zeroMad = model.preprocessStatsGroups([[1, 1, 1, 1, 100]], ['A'], { statsOutlierMode: 'rout' });
    expect(zeroMad.groups[0]).toEqual([1, 1, 1, 1, 100]);
    expect(zeroMad.flags).toEqual([]);
    expect(zeroMad.auditNotes.join(' ')).toMatch(/MAD is zero/);
  });

  test('Grubbs uses the selected sample family rather than repeated individual thresholds', () => {
    const values = Array.from({ length: 19 }, (_, index) => index + 1).concat(32);
    // SciPy: G=2.8388774352287425, critical(.05)=2.7082456458057584,
    // critical(.05/2)=2.8434057284610375. This exercises the decision boundary.
    expect(model.preprocessStatsGroups([values], ['A'], { statsOutlierMode: 'grubbs' }).exclusions).toHaveLength(1);
    expect(model.preprocessStatsGroups([values, values], ['A', 'B'], { statsOutlierMode: 'grubbs' }).exclusions).toEqual([]);
    expect(model.preprocessStatsGroups([[1, 1, 1]], ['A'], { statsOutlierMode: 'grubbs' }).exclusions).toEqual([]);
  });

  test('normality rejection never by itself recommends ranks or suppresses unequal-variance guidance', () => {
    const result = model.computeAssumptionDiagnostics([
      [1, 1, 1, 1, 1, 1, 1, 10, 100, 1000], [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    ], ['A', 'B']);
    expect(result.normalityFailures).toBeGreaterThan(0);
    expect(result.recommendNonParametric).toBe(false);
    expect(result.guidance.join(' ')).toMatch(/sample size|small samples/);
    expect(result.guidance.join(' ')).toMatch(/not.*normality|does not.*normality/);
  });

  test('paired diagnostics inspect contrasts and avoid an irrelevant equal-variance recommendation', () => {
    const groups = [[1, 2, 3, 4, 5, 6, 7, 8], [10, 20, 30, 40, 50, 60, 70, 80]];
    const diagnostic = model.computeAssumptionDiagnostics(groups, ['A', 'B'], { paired: true });
    expect(diagnostic.normalityTarget).toBe('within-subject-contrasts');
    expect(diagnostic.groups).toHaveLength(1);
    expect(diagnostic.groups[0].label).toContain('paired differences');
    expect(diagnostic.variance.passed).toBeNull();
    expect(diagnostic.recommendWelch).toBe(false);
  });

  test('Sidak corrections preserve tiny probabilities, and uncalibratable constant control contrasts are unavailable', () => {
    expect(global.Shared.stats).toBeTruthy();
    const values = model.applyPValueCorrection([1e-30, 0.5], 'sidak');
    expect(values[0]).toBeCloseTo(2e-30, 40);
    expect(values[1]).toBe(0.75);
    const constant = model.computeControlSidakComparisons([[1, 1], [1, 1], [2, 2]], ['A', 'B', 'C'], 0, { unequalVariances: true });
    expect(constant.ok).toBe(false);
  });

  test('decimal subtraction preserves mathematical signed-rank ties without merging distinct input values', () => {
    const result = model.wilcoxonSignedRank([0.5, 0.825, 0.375, 0.5], [0.525, 0.775, 0.325, 0.55], { resamplingMode: 'asymptotic' });
    expect(result.W).toBe(4);
    expect(result.p).toBeCloseTo(0.8501067391385259, 7);
    expect(model.subtractRankObservation(0.3, 0.1)).toBe(0.2);
    expect(model.subtractRankObservation(0.30000000000000004, 0.1)).not.toBe(0.2);
  });

  test('paired model intersects source rows before preprocessing, summaries, and calculation', () => {
    const selection = [
      { index: 7, label: 'A', values: [10, 20, 30, 40], rowIndices: [1, 2, 3, 4] },
      { index: 9, label: 'B', values: [9, 29, 37, 50], rowIndices: [1, 3, 4, 5] }
    ];
    const result = compute({ selection, statsPaired: true });
    const expected = model.tTestPaired([10, 30, 40], [9, 29, 37]);
    expect(result.ok).toBe(true);
    expect(result.groupSummaries.map(group => group.n)).toEqual([3, 3]);
    expect(result.pairs[0].stat).toBeCloseTo(expected.t, 12);
    expect(result.pairs[0].p).toBeCloseTo(expected.p, 12);
  });

  test('custom comparisons use the same screened values as summaries and ordinary comparisons', () => {
    const selection = [
      { index: 7, label: 'A', values: [10, 11, 12, 13, 14, 1000] },
      { index: 9, label: 'B', values: [15, 17, 19, 21, 23, 25] }
    ];
    for (const statsPaired of [false, true]) {
      const options = { selection, statsPaired, statsOutlierMode: 'grubbs' };
      const ordinary = compute(options);
      const custom = compute({ ...options, statsMode: 'custom', statsCustomPairs: [{ ai: 7, bi: 9 }] });
      expect(custom.outlierAudit.exclusions.length).toBeGreaterThan(0);
      expect(custom.groupSummaries).toEqual(ordinary.groupSummaries);
      expect(custom.pairs[0].stat).toBeCloseTo(ordinary.pairs[0].stat, 12);
      expect(custom.pairs[0].p).toBeCloseTo(ordinary.pairs[0].p, 12);
      expect(custom.pairs[0].diff).toBeCloseTo(ordinary.pairs[0].diff, 12);
    }
  });

  test('repeated-measures helpers drop incomplete rows jointly, including blank cells', () => {
    const incomplete = [[10, null, 30, 40, 50], [9, 20, '', 37, 46], [11, 21, 32, 42, 48]];
    const complete = [[10, 40, 50], [9, 37, 46], [11, 42, 48]];
    for (const method of ['computeRepeatedMeasuresAnova', 'computeFriedmanTest', 'computeNemenyiComparisons']) {
      const options = { resamplingMode: 'asymptotic' };
      const actual = method === 'computeNemenyiComparisons'
        ? model[method](incomplete, ['A', 'B', 'C'], options) : model[method](incomplete, options);
      const expected = method === 'computeNemenyiComparisons'
        ? model[method](complete, ['A', 'B', 'C'], options) : model[method](complete, options);
      expect(actual.ok).toBe(true);
      if (method === 'computeFriedmanTest') expect(actual.n).toBe(3);
      if (method === 'computeRepeatedMeasuresAnova') expect(actual.df2).toBe(4);
      if (method !== 'computeNemenyiComparisons') expect(actual.p).toBeCloseTo(expected.p, 12);
      else expect(actual.pairs).toEqual(expected.pairs);
    }
  });

  test('paired preprocessing handles row order, gaps, infinities, zeros, and no complete subjects', () => {
    const result = model.preprocessStatsGroups([[0, 30, Infinity, 10], [12, 2, 29]], ['A', 'B'], {
      statsPaired: true, rowIndicesByGroup: [[3, 8, 9, 1], [1, 3, 8]]
    });
    expect(result.groups).toEqual([[10, 0, 30], [12, 2, 29]]);
    const empty = compute({ statsPaired: true, selection: [
      { index: 0, values: [1, null] }, { index: 1, values: [null, 2] }
    ] });
    expect(empty.ok).toBe(false);
    expect(empty.pairs).toEqual([]);
    expect(model.tTestPaired([null, 10, '', 40, 50], [100, 9, 200, 37, 46]).n).toBe(3);
    const ratio = model.ratioTTest([null, 10, '', 40, 50], [100, 9, 200, 37, 46]);
    const completeRatio = model.ratioTTest([10, 40, 50], [9, 37, 46]);
    expect(ratio.p).toBeCloseTo(completeRatio.p, 12);
    const signed = model.wilcoxonSignedRank([null, 10, '', 40, 50], [100, 9, 200, 37, 46]);
    expect(signed.p).toBe(model.wilcoxonSignedRank([10, 40, 50], [9, 37, 46]).p);
  });

  test('grouped condition marginals preserve missing subject positions', () => {
    const allRows = [[[10, 9]], [[NaN, 20]], [[30, NaN]], [[40, 37]], [[50, 46]]];
    const result = model.computeBoxStatsModel({ mode: 'grouped', grouped: {
      analysis: 'multipleComparisons', comparisonScope: 'conditionMarginals',
      data: { ok: true, groupsCount: 1, conditionsCount: 2, allRows, rows: [], groupLabels: ['A'], conditionLabels: ['T1', 'T2'] }
    } });
    const expected = model.tTestPaired([10, 40, 50], [9, 37, 46]);
    expect(result.ok).toBe(true);
    expect(result.tables[0].rows[0].df).toBe(expected.df);
    expect(result.tables[0].rows[0].p).toBeCloseTo(expected.p, 12);
  });

  test('Friedman simulations preserve tied blocks, including a completely tied subject', () => {
    // Only the two nonconstant subjects contribute: matching their high-rank
    // column has exact probability 1/3 under independent within-row shuffles.
    const groups = [[1, 5, 1], [1, 5, 1], [2, 5, 2]];
    const result = model.computeFriedmanTest(groups, { resamplingMode: 'monte-carlo', iterations: 40000, seed: 781 });
    expect(result.Q).toBeCloseTo(4, 12);
    expect(Math.abs(result.p - 1 / 3)).toBeLessThan(0.01);
    const constant = model.computeFriedmanTest([[1, 5], [1, 5], [1, 5]], { resamplingMode: 'monte-carlo', iterations: 500 });
    expect(constant.Q).toBe(0);
    expect(constant.p).toBe(1);
    expect(model.computeFriedmanTest([[1], [2], [3]]).ok).toBe(false);
    expect(model.computeRepeatedMeasuresAnova([[null], [2], [3]]).ok).toBe(false);
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
    expect(result.report.methodsText).toMatch(/configured Holm correction was not applied/i);
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

  test('Box uses the shared tie-aware KS calibration', () => {
    const result = model.kolmogorovSmirnovTwoSample([1, 1], [2, 3]);
    expect(result).toMatchObject({
      available: true,
      D: 1,
      p: 1 / 3,
      method: 'exact permutation',
      hasTies: true
    });
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

  test.each([
    ['classic', 'oneWayAnova', 'tukey'],
    ['welch', 'welchAnova', 'gamesHowell'],
    ['lognormalClassic', 'lognormalAnova', 'tukey'],
    ['lognormalWelch', 'lognormalWelchAnova', 'gamesHowell']
  ])('automatic post-hoc follows the selected %s analysis', (variant, analysisId, effectivePostHoc) => {
    const result = compute({ statsParametricVariant: variant, statsPostHoc: 'auto', selection: positiveSelection });
    expect(result.ok).toBe(true);
    expect(result.analysis.id).toBe(analysisId);
    expect(result.requestedPostHoc).toBe('auto');
    expect(result.effectivePostHoc).toBe(effectivePostHoc);
    expect(result.postHocResolution).toEqual(expect.objectContaining({
      requestedProcedure: 'auto',
      effectiveProcedure: effectivePostHoc,
      automatic: true,
      supported: true
    }));
    expect(result.report.analysisSpec).toEqual(expect.objectContaining({
      requestedPostHoc: 'auto',
      effectivePostHoc,
      postHocAutomatic: true
    }));
  });

  test('automatic selection outside independent one-way ANOVA retains standard pairwise behavior', () => {
    const paired = compute({ statsPaired: true, statsPostHoc: 'auto' });
    const reference = compute({ statsMode: 'reference', statsRef: 0, statsPostHoc: 'auto' });
    expect(paired.ok).toBe(true);
    expect(paired.effectivePostHoc).toBe('standard');
    expect(reference.ok).toBe(true);
    expect(reference.effectivePostHoc).toBe('standard');
  });

  test('explicit standard keeps pair-specific Student tests after classic ANOVA', () => {
    const result = compute({ statsPostHoc: 'standard' });
    const expected = model.tTestEqualVariance(baseSelection[0].values, baseSelection[1].values, {
      alternative: 'two-sided',
      ciLevel: 0.95
    });
    expect(result.ok).toBe(true);
    expect(result.effectivePostHoc).toBe('standard');
    expect(result.pairs[0]).toEqual(expect.objectContaining({
      stat: expected.t,
      df: expected.df,
      rawP: expected.p,
      adjP: expect.any(Number)
    }));
  });

  test('ANOVA-pooled comparisons use common residual MSE, df, Holm adjustment, and nominal CIs', () => {
    const selection = [
      { index: 0, label: 'A', values: [1, 2, 3] },
      { index: 1, label: 'B', values: [4, 5, 6, 7] },
      { index: 2, label: 'C', values: [1, 3, 5, 7, 9] }
    ];
    const result = compute({
      statsPostHoc: 'anovaPooled',
      statsCorrection: 'holm',
      statsCiLevel: 0.95,
      selection
    });
    const mse = 47 / 9;
    const se = Math.sqrt(mse * (1 / 3 + 1 / 4));
    const t = (2 - 5.5) / se;
    expect(result.ok).toBe(true);
    expect(result.effectivePostHoc).toBe('anovaPooled');
    expect(result.correctionCount).toBe(3);
    expect(result.effectiveComparisonMethod).toBe('holm');
    expect(result.pairs[0].df).toBe(9);
    expect(result.pairs[0].stat).toBeCloseTo(t, 10);
    expect(result.pairs[0].rawP).toBeCloseTo(0.07589986112017294, 10);
    expect(result.pairs[0].adjP).toBeGreaterThanOrEqual(result.pairs[0].rawP);
    expect(result.pairs[0].ciLow).toBeLessThan(result.pairs[0].diff);
    expect(result.pairs[0].ciHigh).toBeGreaterThan(result.pairs[0].diff);
    expect(result.pairs[0].ciType).toBe('nominal');
    const pairTable = result.tables.find(table => table.caption === 'Pairwise comparisons');
    expect(pairTable.columns.find(column => column.key === 'ci')?.label).toBe('95% nominal CI');
    expect(result.report.methodsText).toMatch(/common residual mean square.*df = 9/i);
    expect(result.report.methodsText).toMatch(/adjusted across 3 comparisons using Holm/i);
    expect(result.report.methodsText).toMatch(/nominal.*not adjusted for multiplicity/i);
    expect(result.report.methodsText).toMatch(/No statistical outlier screening/i);
    expect(result.report.analysisSpec).toEqual(expect.objectContaining({
      effectivePostHoc: 'anovaPooled',
      varianceEstimator: 'anovaResidualMSE',
      degreesOfFreedom: 9,
      correction: 'holm',
      correctionFamilySize: 3,
      ciType: 'nominal',
      alternative: 'two-sided'
    }));
  });

  test('ANOVA-pooled inference uses the log scale and reports geometric-mean ratios', () => {
    const result = compute({
      statsParametricVariant: 'lognormalClassic',
      statsPostHoc: 'anovaPooled',
      selection: positiveSelection
    });
    expect(result.ok).toBe(true);
    expect(result.effectivePostHoc).toBe('anovaPooled');
    expect(result.pairs.every(pair => pair.differenceScale === 'ratio' && pair.diff > 0)).toBe(true);
    expect(result.pairs.every(pair => Number.isFinite(pair.stat) && Number.isFinite(pair.rawP))).toBe(true);
    expect(result.report.analysisSpec.reportingScale).toBe('geometric-mean-ratio');
  });

  test.each([
    ['lognormalClassic','tukey',0.00007889187058,0.3591916799,0.6931744715],
    ['lognormalWelch','gamesHowell',0.0003768256397,0.3514865924,0.7083698447]
  ])('%s automatic post-hoc matches log-scale SciPy references after ratio back-transformation', (variant,method,p,ciLow,ciHigh) => {
    const result=compute({
      statsParametricVariant:variant,
      statsPostHoc:'auto',
      statsCiLevel:0.95,
      selection:positiveSelection
    });
    expect(result.ok).toBe(true);
    expect(result.effectivePostHoc).toBe(method);
    expect(result.pairs[0].differenceScale).toBe('ratio');
    expect(result.pairs[0].diff).toBeCloseTo(0.4989814654,7);
    expect(result.pairs[0].adjP).toBeCloseTo(p,4);
    expect(result.pairs[0].rawP).toBeNull();
    expect(result.pairs[0].ciType).toBe('simultaneous');
    expect(result.pairs[0].ciLow).toBeCloseTo(ciLow,4);
    expect(result.pairs[0].ciHigh).toBeCloseTo(ciHigh,4);
  });

  test.each([
    ['grubbs', { statsOutlierAlpha: 0.04 }, /Single-outlier Grubbs screening used family α = 0\.04/i, 'outlierAlpha', 0.04],
    ['rout', { statsOutlierQ: 0.02 }, /score cutoff q = 0\.02/i, 'outlierQ', 0.02]
  ])('reports the configured %s outlier-screening threshold', (statsOutlierMode, options, expected, specKey, specValue) => {
    const result = compute({ statsOutlierMode, ...options });
    expect(result.ok).toBe(true);
    expect(result.report.methodsText).toMatch(expected);
    expect(result.report.analysisSpec[specKey]).toBe(specValue);
  });

  test('unsupported explicit procedures are reported without replacing the saved selection', () => {
    const resolution = model.resolvePostHocProcedure({
      analysisId: 'welchAnova',
      scope: 'all',
      design: 'independent',
      groupCount: 3,
      requestedProcedure: 'anovaPooled'
    });
    const result = compute({ statsParametricVariant: 'welch', statsPostHoc: 'anovaPooled' });
    expect(resolution).toEqual(expect.objectContaining({
      requestedProcedure: 'anovaPooled',
      effectiveProcedure: null,
      supported: false
    }));
    expect(resolution.reason).toMatch(/classic.*ANOVA/i);
    expect(result.ok).toBe(false);
    expect(result.postHocResolution.requestedProcedure).toBe('anovaPooled');
    expect(result.postHocResolution.effectiveProcedure).toBeNull();
  });

  test('an inactive multi-group procedure does not block a valid two-group analysis', () => {
    const result=compute({
      statsPostHoc:'tukey',
      selection:positiveSelection.slice(0,2)
    });
    expect(result.ok).toBe(true);
    expect(result.requestedPostHoc).toBe('tukey');
    expect(result.effectivePostHoc).toBe('standard');
    expect(result.report.analysisSpec).toEqual(expect.objectContaining({
      requestedPostHoc:'tukey',
      effectivePostHoc:'standard'
    }));
  });

  test.each([
    ['oneSample',{ statsMode:'oneSample',statsPostHoc:'tukey' }],
    ['custom',{ statsMode:'custom',statsPostHoc:'tukey',statsCustomPairs:[{ ai:0,bi:1 }] }]
  ])('inactive saved post-hoc settings do not block %s workflows', (scope,overrides) => {
    const result=compute(overrides);
    expect(result.ok).toBe(true);
    expect(result.requestedPostHoc).toBe('tukey');
    expect(result.effectivePostHoc).toBeNull();
    expect(result.report.analysisSpec).toEqual(expect.objectContaining({
      requestedPostHoc:'tukey',
      effectivePostHoc:null
    }));
  });

  test.each(['tukey', 'gamesHowell'])('%s CIs use statsCiLevel independently of alpha', postHoc => {
    const variant = postHoc === 'tukey' ? 'classic' : 'welch';
    const base = compute({ statsParametricVariant: variant, statsPostHoc: postHoc, statsAlpha: 0.05, statsCiLevel: 0.95 });
    const wider = compute({ statsParametricVariant: variant, statsPostHoc: postHoc, statsAlpha: 0.05, statsCiLevel: 0.99 });
    const label = wider.tables.find(table => table.caption === 'Pairwise comparisons').columns.find(column => column.key === 'ci')?.label;
    expect(base.ok && wider.ok).toBe(true);
    expect(wider.pairs.map(pair => pair.adjP)).toEqual(base.pairs.map(pair => pair.adjP));
    expect(label).toBe('99% simultaneous CI');
    expect(Math.abs(wider.pairs[0].ciHigh - wider.pairs[0].diff)).toBeGreaterThan(
      Math.abs(base.pairs[0].ciHigh - base.pairs[0].diff)
    );
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
