const {
  buildBoxCases,
  computeSignedRankExactP,
  expectClose,
  indexOracleResults,
  loadStatsHooks,
  runPythonOracle,
  testWithOracle
} = require('../../test-support/statsMatrixSuite');

describe('Box statistics oracle matrix', () => {
  let boxHooks;

  beforeEach(() => {
    boxHooks = loadStatsHooks(['box']).box;
  });

  testWithOracle('paired rank-biserial effect agrees with independent SciPy signed ranks across zeros, ties, decimals and missing pairs', () => {
    // Definition also matches R effectsize::rank_biserial(paired=TRUE).
    const data = [
      { a: [-1, 2, 3], b: [0, 0, 0] },
      { a: [0, 1, -1, 2, 2, 0], b: [0, 0, 0, 0, 0, 0] },
      { a: [0.5, null, 0.825, 0.375, 0.5], b: [0.525, 100, 0.775, 0.325, 0.55] },
      { a: [1, 2, 3], b: [1, 2, 3] },
      { a: [1, 2, 0], b: [0, 0, 0] },
      { a: [1, 2, 0], b: [3, 3, 0] }
    ];
    const references = indexOracleResults(runPythonOracle(data.map((payload, index) => ({ id: String(index), operation: 'box_paired_rank_biserial', payload }))));
    boxHooks.wilcoxonSignedRank([1], [0]);
    const model = window.Shared.boxStatsModel;
    data.forEach((payload, index) => {
      const expected = references.get(String(index)).result.rankBiserial;
      const actual = model.computeEffectSizeMetrics(payload.a, payload.b, { paired: true }).nonParametric.rankBiserial;
      expectClose(actual, expected, `paired rank effect ${index}`, { abs: 1e-12 });
      if(expected != null) expectClose(model.computeEffectSizeMetrics(payload.b, payload.a, { paired: true }).nonParametric.rankBiserial, -expected, `reversed rank effect ${index}`, { abs: 1e-12 });
    });
  });

  testWithOracle('control families match SciPy t distributions, orientation, unequal sizes and chosen confidence level', () => {
    const groups = [[10, 12, 15, 19], [20, 21, 25], [4, 8, 9, 11, 14, 18]];
    const cases = [false, true].map(unequalVariances => ({ id: String(unequalVariances), operation: 'box_control_sidak', payload: { groups, referenceIndex: 1, unequalVariances, ciLevel: 0.9 } }));
    const references = indexOracleResults(runPythonOracle(cases));
    for (const unequalVariances of [false, true]) {
      const actual = boxHooks.controlSidakComparisons(groups, ['A', 'Control', 'C'], 1, { unequalVariances, ciLevel: 0.9 });
      expect(actual.ok).toBe(true);
      const expected = references.get(String(unequalVariances)).result.pairs;
      actual.pairs.forEach((pair, index) => {
        for (const field of ['diff', 'se', 'df', 't', 'p', 'pAdj', 'ciLow', 'ciHigh']) expectClose(pair[field], expected[index][field], `${unequalVariances} control ${field}`);
        expect(pair.i).toBe(1);
        expect(pair.diff).toBeGreaterThan(0);
      });
    }
  });

  testWithOracle('nested repeated-measures ANOVA matches independent statsmodels split-plot contrasts', () => {
    const subjectOffsets = [
      [-2, -1, 0, 1, 2],
      [0, 2, -2, 1, -1],
      [1, -2, 2, -1, 0]
    ];
    const subjectDifferenceResiduals = [-2, -1, 0, 1, 2];
    const makeGroups = (groupEffects, conditionEffects) => groupEffects.map((groupEffect, groupIndex) =>
      subjectOffsets[groupIndex].map((subjectOffset, subjectIndex) => {
        const difference = conditionEffects[groupIndex] + subjectDifferenceResiduals[subjectIndex];
        const subjectMean = 100 + groupEffect + subjectOffset;
        return [subjectMean - difference / 2, subjectMean + difference / 2];
      })
    );
    const cases = [
      { id: 'nested-null', groups: makeGroups([0, 0, 0], [0, 0, 0]) },
      { id: 'nested-group', groups: makeGroups([-5, 0, 5], [0, 0, 0]) },
      { id: 'nested-condition', groups: makeGroups([0, 0, 0], [2, 2, 2]) },
      { id: 'nested-interaction', groups: makeGroups([0, 0, 0], [-4, 0, 4]) }
    ];
    const references = indexOracleResults(runPythonOracle(cases.map(({ id, groups }) => ({
      id,
      operation: 'box_nested_repeated_two_condition',
      payload: { groups }
    }))));
    const model = window.Shared.boxStatsModel;
    const run = groups => {
      const rows = Array.from({ length: groups[0].length }, (_, rowIndex) => groups.map(group => group[rowIndex]));
      return model.computeBoxStatsModel({
        mode: 'grouped',
        grouped: {
          analysis: 'nestedRepeatedTwoWay',
          data: {
            ok: true,
            groupsCount: groups.length,
            conditionsCount: 2,
            rowsWithData: rows.length,
            partialRowsSkipped: 0,
            groupLabels: groups.map((_, index) => `Group ${index + 1}`),
            conditionLabels: ['Before', 'After'],
            rows
          }
        },
        statsCorrection: 'holm',
        statsAlpha: 0.05,
        statsCiLevel: 0.95
      });
    };
    for (const { id, groups } of cases) {
      const actual = run(groups);
      const expected = references.get(id).result;
      expect(actual.ok).toBe(true);
      expect(actual.analysisId).toBe('nestedRepeatedTwoWay');
      expect(actual.report.analysisSpec).toMatchObject({
        analysisId: 'nestedRepeatedTwoWay',
        experimentalUnit: 'subject-within-independent-group',
        repeatedFactor: 'condition',
        assumptions: [
          'complete-balanced-data', 'two-conditions', 'independent-subjects', 'normal-errors',
          'homogeneous-group-error-variances'
        ]
      });
      const diagnostics = actual.tables[0].diagnostics;
      for (const field of [
        'groupsCount', 'subjectsPerGroup', 'dfGroup', 'dfSubject', 'dfCondition', 'dfInteraction', 'dfSubjectCondition',
        'ssGroup', 'ssSubjectsWithinGroup', 'ssCondition', 'ssInteraction', 'ssSubjectCondition',
        'fGroup', 'pGroup', 'fCondition', 'pCondition', 'fInteraction', 'pInteraction'
      ]) expectClose(diagnostics[field], expected[field], `${id}.${field}`, { abs: 1e-7, rel: 1e-7 });
    }
    const nullResult = run(cases[0].groups).tables[0].diagnostics;
    expect(nullResult.fGroup).toBeCloseTo(0, 12);
    expect(nullResult.fCondition).toBeCloseTo(0, 12);
    expect(nullResult.fInteraction).toBeCloseTo(0, 12);
    expect(run(cases[3].groups).tables[0].diagnostics.fInteraction).toBeGreaterThan(10);
  });

  test('nested repeated-measures model ignores row alignment between independent groups and blocks unsupported designs', () => {
    const rows = [
      [[10, 11], [20, 22], [31, 30]],
      [[12, 15], [21, 21], [29, 31]],
      [[14, 15], [24, 27], [34, 36]],
      [[16, 20], [25, 24], [33, 37]]
    ];
    const makePayload = (dataRows, overrides = {}) => ({
      mode: 'grouped',
      grouped: {
        analysis: 'nestedRepeatedTwoWay',
        data: { ok: true, groupsCount: 3, conditionsCount: 2, rowsWithData: dataRows.length, partialRowsSkipped: 0, rows: dataRows, ...overrides }
      }
    });
    const model = window.Shared.boxStatsModel;
    const original = model.computeBoxStatsModel(makePayload(rows));
    const permuted = rows.map(row => row.slice());
    [permuted[0][1], permuted[3][1]] = [permuted[3][1], permuted[0][1]];
    const reordered = model.computeBoxStatsModel(makePayload(permuted));
    expect(original.ok).toBe(true);
    expect(reordered.ok).toBe(true);
    for (const field of ['fGroup', 'pGroup', 'fCondition', 'pCondition', 'fInteraction', 'pInteraction']) {
      expectClose(reordered.tables[0].diagnostics[field], original.tables[0].diagnostics[field], `row-order invariance.${field}`, { abs: 1e-10, rel: 1e-10 });
    }
    expect(model.computeBoxStatsModel(makePayload(rows, { partialRowsSkipped: 1 })).ok).toBe(false);
    expect(model.computeBoxStatsModel(makePayload(rows, { conditionsCount: 3 })).message).toMatch(/exactly two repeated conditions/i);
  });

  testWithOracle('decimal signed ranks agree with independent Decimal arithmetic and SciPy or exhaustive sign flips', () => {
    const tied = { a: [0.5, 0.825, 0.375, 0.5], b: [0.525, 0.775, 0.325, 0.55] };
    const untied = { a: [0.5, 0.825, 0.375, 0.5], b: [0.51, 0.805, 0.345, 0.46] };
    const cases = [
      { id: 'asym', operation: 'box_decimal_signed_rank', payload: { ...tied, resamplingMode: 'asymptotic' } },
      { id: 'mc', operation: 'box_decimal_signed_rank', payload: { ...tied, resamplingMode: 'permutation-reference' } },
      { id: 'exact', operation: 'box_decimal_signed_rank', payload: { ...untied, resamplingMode: 'exact' } }
    ];
    const references = indexOracleResults(runPythonOracle(cases));
    for (const [id, data, resamplingMode] of [['asym', tied, 'asymptotic'], ['mc', tied, 'monte-carlo'], ['exact', untied, 'exact']]) {
      const actual = boxHooks.wilcoxonSignedRank(data.a, data.b, { resamplingMode, iterations: 30000, seed: 271 });
      const expected = references.get(id).result;
      expectClose(actual.W, expected.W, `${id} decimal W`, { abs: 1e-12 });
      expectClose(actual.p, expected.p, `${id} decimal p`, { abs: id === 'mc' ? 0.01 : 1e-7, rel: 0 });
    }
    expect(boxHooks.wilcoxonSignedRank([0.1, null, 0.2], [0.1, 0.3, 0.2]).p).toBe(1);
    expect(boxHooks.wilcoxonOneSample([0.3, 0.5, 0.1], 0.3, { resamplingMode: 'asymptotic' }).W).toBe(1.5);
    const small = runPythonOracle([{ id: 'small', operation: 'box_wilcoxon_signed_rank', payload: { a: [1e-9, 2e-9], b: [0, 0] } }])[0].result;
    expect(small.p).toBe(0.5);
    expect(boxHooks.wilcoxonSignedRank([1e-9, 2e-9], [0, 0]).p).toBe(small.p);
  });

  testWithOracle('raw-data rankers retain true decimal ties and distinguish adjacent representable observations', () => {
    const groups = [[0.3, 0.3, 0.5, 0.8], [0.30000000000000004, 0.4, 0.5, 0.7], [0.2, 0.3, 0.6, 0.9]];
    const expected = runPythonOracle([{ id: 'ranks', operation: 'box_raw_rank_reference', payload: { groups } }])[0].result;
    const mw = boxHooks.mannWhitney(groups[0], groups[1], { resamplingMode: 'asymptotic' });
    expectClose(mw.U1, expected.mannWhitney.U1, 'raw decimal MW U');
    expectClose(mw.p, expected.mannWhitney.p, 'raw decimal MW p');
    const kw = boxHooks.kruskalWallis(groups);
    expectClose(kw.H, expected.kruskal.H, 'raw decimal KW H');
    expectClose(kw.p, expected.kruskal.p, 'raw decimal KW p');
    const friedman = boxHooks.friedmanTest(groups, { resamplingMode: 'asymptotic' });
    expectClose(friedman.Q, expected.friedman.Q, 'raw decimal Friedman Q');
    expectClose(friedman.p, expected.friedman.p, 'raw decimal Friedman p');
    const dunn = boxHooks.dunnComparisons(groups, ['A', 'B', 'C'], { resamplingMode: 'asymptotic' });
    dunn.pairs.forEach((pair, index) => {
      expectClose(pair.z, expected.dunn[index].z, 'raw decimal Dunn z');
      expectClose(pair.p, expected.dunn[index].p, 'raw decimal Dunn p');
    });
  });

  testWithOracle('Friedman tied Monte Carlo agrees with exhaustive SciPy-ranked within-row permutations', () => {
    const groups = [[1, 1, 1, 1], [1, 2, 1, 2], [2, 2, 3, 3]];
    const references = indexOracleResults(runPythonOracle([
      { id: 'tied-exact', operation: 'box_friedman', payload: { groups, resamplingMode: 'permutation-reference' } },
      { id: 'tied-asym', operation: 'box_friedman', payload: { groups, resamplingMode: 'asymptotic' } }
    ]));
    const exact = references.get('tied-exact').result;
    const asym = references.get('tied-asym').result;
    const result = boxHooks.friedmanTest(groups, { resamplingMode: 'monte-carlo', iterations: 60000, seed: 781 });
    expectClose(result.Q, asym.Q, 'tied Friedman Q', { abs: 1e-12 });
    expectClose(result.p, exact.p, 'tied Friedman permutation p', { abs: 0.006, rel: 0 });
    expect(boxHooks.friedmanTest(groups, { resamplingMode: 'monte-carlo', iterations: 60000, seed: 781 })).toEqual(result);
    const exactResult = boxHooks.friedmanTest(groups, { resamplingMode: 'exact' });
    expect(exactResult.calibrationMethod).toBe('exact');
    expectClose(exactResult.p, exact.p, 'tied Friedman forced exact p', { abs: 1e-12 });
    expect(boxHooks.friedmanTest(groups, { resamplingMode: 'auto' })).toEqual(exactResult);
  });

  testWithOracle('Friedman requested Monte Carlo is honored even when exhaustive calibration is tractable', () => {
    const groups = [[1, 2], [2, 3], [3, 1]];
    const reference = runPythonOracle([{ id: 'forced-mc', operation: 'box_friedman', payload: { groups, resamplingMode: 'permutation-reference' } }])[0].result;
    const actual = boxHooks.friedmanTest(groups, { resamplingMode: 'monte-carlo', iterations: 30000, seed: 733 });
    expect(actual.calibrationMethod).toBe('monte-carlo');
    expect(actual.iterations).toBe(30000);
    expectClose(actual.p, reference.p, 'forced MC versus exhaustive p', { abs: 0.01, rel: 0 });
  });

  testWithOracle('Friedman oversized exact fallback agrees with independent NumPy rank permutations', () => {
    const groups=[[1,2,1,3,1,2,1,3],[2,3,3,2,2,1,3,2],[3,1,2,1,3,3,2,1]];
    const options={resamplingMode:'exact',iterations:30000,seed:917};
    const reference=runPythonOracle([{id:'fallback',operation:'box_friedman',payload:{groups,...options}}])[0].result;
    const actual=boxHooks.friedmanTest(groups,options);
    expect(reference.method).toBe('monte-carlo');
    expect(actual.calibrationMethod).toBe('monte-carlo');
    expect(actual.footnote).toMatch(/exceeded.*200,000-state limit/);
    expectClose(actual.Q,reference.Q,'fallback Q',{abs:1e-12});
    expectClose(actual.p,reference.p,'independent fallback p',{abs:0.01,rel:0});
  });

  testWithOracle('production models preserve subject rows and screened custom comparisons against independent references', () => {
    boxHooks.tTestPaired([1, 2], [2, 4]);
    const model = window.Shared.boxStatsModel;
    const complete = [[10, 40, 50], [9, 37, 46], [11, 42, 48]];
    const incomplete = [[10, null, 30, 40, 50], [9, 20, '', 37, 46], [11, 21, 32, 42, 48]];
    const selection = incomplete.map((values, index) => ({ index, label: `G${index}`, values }));
    const payload = { statsMode: 'all', statsPaired: true, statsTest: 'parametric', statsParametricVariant: 'classic', selection };
    const references = indexOracleResults(runPythonOracle([
      { id: 'paired', operation: 'box_ttest_paired', payload: { a: complete[0], b: complete[1] } },
      { id: 'rm', operation: 'box_repeated_measures_anova', payload: { groups: complete } },
      { id: 'friedman', operation: 'box_friedman', payload: { groups: complete, resamplingMode: 'asymptotic' } },
      { id: 'screened', operation: 'box_ttest_equal_variance', payload: { a: [10, 11, 12, 13, 14], b: [15, 17, 19, 21, 23, 25] } },
      { id: 'screened-paired', operation: 'box_ttest_paired', payload: { a: [10, 11, 12, 13, 14], b: [15, 17, 19, 21, 23] } }
    ]));
    const paired = model.computeBoxStatsModel({ ...payload, selection: selection.slice(0, 2) });
    const rm = model.computeBoxStatsModel(payload);
    const friedman = model.computeBoxStatsModel({ ...payload, statsTest: 'nonparametric', statsNonParametricVariant: 'friedman', statsResamplingMode: 'asymptotic' });
    expectClose(paired.pairs[0].stat, references.get('paired').result.t, 'missing paired t');
    expectClose(paired.pairs[0].p, references.get('paired').result.p, 'missing paired p');
    expectClose(rm.overall.F, references.get('rm').result.F, 'missing RM F');
    expectClose(rm.overall.p, references.get('rm').result.p, 'missing RM p');
    expectClose(friedman.overall.Q, references.get('friedman').result.Q, 'missing Friedman Q');
    expectClose(friedman.overall.p, references.get('friedman').result.p, 'missing Friedman p');
    for (const statsPaired of [false, true]) {
      const custom = model.computeBoxStatsModel({
        ...payload, statsPaired, statsMode: 'custom', statsOutlierMode: 'grubbs', statsCustomPairs: [{ ai: 7, bi: 9 }],
        selection: [{ index: 7, label: 'A', values: [10, 11, 12, 13, 14, 1000] }, { index: 9, label: 'B', values: [15, 17, 19, 21, 23, 25] }]
      });
      const reference = references.get(statsPaired ? 'screened-paired' : 'screened').result;
      expect(custom.outlierAudit.exclusions).toHaveLength(1);
      expectClose(custom.pairs[0].stat, reference.t, 'screened custom t');
      expectClose(custom.pairs[0].p, reference.p, 'screened custom p');
      expectClose(custom.pairs[0].ciLow, reference.ciLow, 'screened custom CI low');
      expectClose(custom.pairs[0].ciHigh, reference.ciHigh, 'screened custom CI high');
    }
  });

  testWithOracle('box matrix covers parametric, non-parametric, paired, unpaired, exact, and asymptotic branches against oracle', () => {
    const data = buildBoxCases();
    expect(boxHooks).toBeTruthy();

    const alternatives = ['two-sided', 'greater', 'less'];
    const cases = [];
    const js = {};

    alternatives.forEach(alternative => {
      const welchId = `box-welch-${alternative}`;
      const pooledId = `box-pooled-${alternative}`;
      const pairedId = `box-paired-${alternative}`;
      const oneSampleId = `box-one-sample-${alternative}`;
      cases.push({ id: welchId, operation: 'box_ttest_welch', payload: { a: data.exactA, b: data.exactB, alternative } });
      cases.push({ id: pooledId, operation: 'box_ttest_equal_variance', payload: { a: data.equalVarA, b: data.equalVarB, alternative } });
      cases.push({ id: pairedId, operation: 'box_ttest_paired', payload: { a: data.pairedA, b: data.pairedB, alternative } });
      cases.push({ id: oneSampleId, operation: 'box_ttest_one_sample', payload: { values: data.oneSample, nullValue: 10, alternative } });
      js[welchId] = boxHooks.tTest(data.exactA, data.exactB, { alternative });
      js[pooledId] = boxHooks.tTestEqualVariance(data.equalVarA, data.equalVarB, { alternative });
      js[pairedId] = boxHooks.tTestPaired(data.pairedA, data.pairedB, { alternative });
      js[oneSampleId] = boxHooks.tTestOneSample(data.oneSample, 10, { alternative });

      const mwExactId = `box-mw-exact-${alternative}`;
      const mwAsymId = `box-mw-asym-${alternative}`;
      const wsrExactId = `box-wsr-exact-${alternative}`;
      const wsrAsymId = `box-wsr-asym-${alternative}`;
      const w1ExactId = `box-w1-exact-${alternative}`;
      const w1AsymId = `box-w1-asym-${alternative}`;
      cases.push({ id: mwExactId, operation: 'box_mann_whitney', payload: { a: data.exactA, b: data.exactB, alternative, resamplingMode: 'auto' } });
      cases.push({ id: mwAsymId, operation: 'box_mann_whitney', payload: { a: data.exactA, b: data.exactB, alternative, resamplingMode: 'asymptotic' } });
      cases.push({ id: wsrExactId, operation: 'box_wilcoxon_signed_rank', payload: { a: data.pairedA, b: data.pairedB, alternative, resamplingMode: 'auto' } });
      cases.push({ id: wsrAsymId, operation: 'box_wilcoxon_signed_rank', payload: { a: data.pairedA, b: data.pairedB, alternative, resamplingMode: 'asymptotic' } });
      cases.push({ id: w1ExactId, operation: 'box_wilcoxon_one_sample', payload: { values: data.oneSample, nullValue: 10, alternative, resamplingMode: 'auto' } });
      cases.push({ id: w1AsymId, operation: 'box_wilcoxon_one_sample', payload: { values: data.oneSample, nullValue: 10, alternative, resamplingMode: 'asymptotic' } });
      js[mwExactId] = boxHooks.mannWhitney(data.exactA, data.exactB, { alternative, resamplingMode: 'auto' });
      js[mwAsymId] = boxHooks.mannWhitney(data.exactA, data.exactB, { alternative, resamplingMode: 'asymptotic' });
      js[wsrExactId] = boxHooks.wilcoxonSignedRank(data.pairedA, data.pairedB, { alternative, resamplingMode: 'auto' });
      js[wsrAsymId] = boxHooks.wilcoxonSignedRank(data.pairedA, data.pairedB, { alternative, resamplingMode: 'asymptotic' });
      js[w1ExactId] = boxHooks.wilcoxonOneSample(data.oneSample, 10, { alternative, resamplingMode: 'auto' });
      js[w1AsymId] = boxHooks.wilcoxonOneSample(data.oneSample, 10, { alternative, resamplingMode: 'asymptotic' });
    });

    cases.push({ id: 'box-anova', operation: 'box_anova', payload: { groups: data.anovaGroups } });
    cases.push({ id: 'box-welch-anova', operation: 'box_welch_anova', payload: { groups: data.welchGroups } });
    cases.push({ id: 'box-kruskal', operation: 'box_kruskal', payload: { groups: data.kruskalGroups } });
    cases.push({ id: 'box-friedman-exact', operation: 'box_friedman', payload: { groups: data.friedmanExact, resamplingMode: 'auto' } });
    cases.push({ id: 'box-friedman-asym', operation: 'box_friedman', payload: { groups: data.friedmanAsymptotic, resamplingMode: 'asymptotic' } });
    cases.push({ id: 'box-rm-anova', operation: 'box_repeated_measures_anova', payload: { groups: data.friedmanAsymptotic } });
    cases.push({ id: 'box-ks', operation: 'box_kolmogorov_smirnov', payload: { a: data.ksA, b: data.ksB } });
    js['box-anova'] = boxHooks.anova(data.anovaGroups);
    js['box-welch-anova'] = boxHooks.welchAnova(data.welchGroups);
    js['box-kruskal'] = boxHooks.kruskalWallis(data.kruskalGroups);
    js['box-friedman-exact'] = boxHooks.friedmanTest(data.friedmanExact, { resamplingMode: 'auto' });
    js['box-friedman-asym'] = boxHooks.friedmanTest(data.friedmanAsymptotic, { resamplingMode: 'asymptotic' });
    js['box-rm-anova'] = boxHooks.repeatedMeasuresAnova(data.friedmanAsymptotic);
    js['box-ks'] = boxHooks.kolmogorovSmirnovTwoSample(data.ksA, data.ksB);

    const oracle = indexOracleResults(runPythonOracle(cases));
    expect(oracle.size).toBe(cases.length);

    alternatives.forEach(alternative => {
      ['welch', 'pooled', 'paired', 'one-sample'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expectClose(js[id].t, ref.t, `${id}.t`, { abs: 1e-6, rel: 1e-5 });
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 1e-6, rel: 1e-5 });
      });
      ['mw-exact', 'mw-asym'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        expectClose(js[id].U1, ref.U1, `${id}.U1`, { abs: 1e-6, rel: 1e-5 });
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 2e-3, rel: 2e-3 });
      });
      ['wsr-exact', 'w1-exact'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const exactP = kind === 'wsr-exact'
          ? computeSignedRankExactP(data.pairedA.map((value, index) => value - data.pairedB[index]), alternative)
          : computeSignedRankExactP(data.oneSample.map(value => value - 10), alternative);
        expectClose(js[id].p, exactP, `${id}.p`, { abs: 1e-12, rel: 1e-9 });
      });
      ['wsr-asym', 'w1-asym'].forEach(kind => {
        const id = `box-${kind}-${alternative}`;
        const ref = oracle.get(id)?.result;
        expect(ref).toBeTruthy();
        if (alternative === 'two-sided') {
          expectClose(js[id].W, ref.W, `${id}.W`, { abs: 1e-6, rel: 1e-5 });
        }
        expectClose(js[id].p, ref.p, `${id}.p`, { abs: 1e-2, rel: 1e-2 });
      });
    });

    expectClose(js['box-anova'].F, oracle.get('box-anova')?.result.F, 'box-anova.F', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-anova'].p, oracle.get('box-anova')?.result.p, 'box-anova.p', { abs: 1e-6, rel: 1e-5 });
    expect(js['box-welch-anova'].ok).toBe(true);
    expectClose(js['box-welch-anova'].F, oracle.get('box-welch-anova')?.result.F, 'box-welch-anova.F', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-welch-anova'].p, oracle.get('box-welch-anova')?.result.p, 'box-welch-anova.p', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-welch-anova'].df1, oracle.get('box-welch-anova')?.result.df1, 'box-welch-anova.df1', { abs: 0, rel: 0 });
    expectClose(js['box-welch-anova'].df2, oracle.get('box-welch-anova')?.result.df2, 'box-welch-anova.df2', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-kruskal'].H, oracle.get('box-kruskal')?.result.H, 'box-kruskal.H', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-kruskal'].p, oracle.get('box-kruskal')?.result.p, 'box-kruskal.p', { abs: 1e-6, rel: 1e-5 });
    expect(js['box-friedman-exact'].ok).toBe(true);
    expectClose(js['box-friedman-exact'].Q, oracle.get('box-friedman-exact')?.result.Q, 'box-friedman-exact.Q', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-friedman-exact'].p, oracle.get('box-friedman-exact')?.result.p, 'box-friedman-exact.p', { abs: 1e-10, rel: 1e-8 });
    expect(js['box-friedman-asym'].ok).toBe(true);
    expectClose(js['box-friedman-asym'].Q, oracle.get('box-friedman-asym')?.result.Q, 'box-friedman-asym.Q', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-friedman-asym'].p, oracle.get('box-friedman-asym')?.result.p, 'box-friedman-asym.p', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-rm-anova'].F, oracle.get('box-rm-anova')?.result.F, 'box-rm-anova.F', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-rm-anova'].p, oracle.get('box-rm-anova')?.result.p, 'box-rm-anova.p', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-ks'].D, oracle.get('box-ks')?.result.D, 'box-ks.D', { abs: 1e-6, rel: 1e-5 });
    expectClose(js['box-ks'].p, oracle.get('box-ks')?.result.p, 'box-ks.p', { abs: 5e-4, rel: 1e-3 });
  });

  testWithOracle('studentized-range CDF, survival, and quantiles match SciPy over central, fractional-df, and tail cases', () => {
    const matrix = [
      { q: 3, k: 2, df: 6 },
      { q: 3, k: 2, df: Number.POSITIVE_INFINITY },
      { q: 0.5, k: 3, df: 6 },
      { q: 3, k: 3, df: 6 },
      { q: 21.90434126199713, k: 3, df: 6 },
      { q: 35, k: 3, df: 6 },
      { q: 35, k: 3, df: 9 },
      { q: 10, k: 10, df: 25 },
      { q: 5, k: 5, df: 2.5 },
      { q: 8, k: 20, df: 0.75 },
      { q: 6, k: 20, df: 100 },
      { q: 0.5, k: 30, df: 25 },
      { q: 1, k: 30, df: 25 },
      { q: 2, k: 30, df: 25 },
      { q: 10, k: 30, df: 12.5 },
      { q: 1.05, k: 50, df: 30 },
      { q: 1.3, k: 50, df: 30 },
      { q: 8, k: 50, df: 100 },
      { q: 12, k: 50, df: 6.75 },
      { q: 3.3, k: 3, df: Number.POSITIVE_INFINITY },
      { q: 10, k: 10, df: Number.POSITIVE_INFINITY }
    ];
    const quantiles = [
      { q: 0.05, k: 3, df: 6, alpha: 0.1 },
      { q: 0.05, k: 3, df: 6, alpha: 0.05 },
      { q: 0.01, k: 3, df: 6, alpha: 0.01 },
      { q: 5, k: 5, df: 2.5, alpha: 0.05 },
      { q: 5, k: 10, df: 25, alpha: 1e-10 },
      { q: 5, k: 20, df: 100, alpha: 0.05 },
      { q: 5, k: 30, df: 10.5, alpha: 0.05 },
      { q: 5, k: 50, df: 30, alpha: 0.01 },
      { q: 3.3, k: 3, df: Number.POSITIVE_INFINITY, alpha: 0.05 },
      { q: 3.3, k: 2, df: 6, alpha: 0.05 },
      { q: 3.3, k: 2, df: Number.POSITIVE_INFINITY, alpha: 0.05 }
    ];
    const cases = [...matrix, ...quantiles].map((payload, index) => ({
      id: `studentized-range-${index}`,
      operation: 'box_studentized_range',
      payload: {
        ...payload,
        df: payload.df === Number.POSITIVE_INFINITY ? 'Infinity' : payload.df
      }
    }));
    const oracle = indexOracleResults(runPythonOracle(cases));
    expect(oracle.size).toBe(cases.length);
    const distribution = window.Shared.boxStatsModel;

    matrix.forEach((item, index) => {
      const oracleEntry = oracle.get(`studentized-range-${index}`);
      expect(oracleEntry?.ok).toBe(true);
      const expected = oracleEntry?.result;
      expect(expected).toBeTruthy();
      const cdf = distribution.studentizedRangeCDF(item.q, item.k, item.df);
      const sf = distribution.studentizedRangeSF(item.q, item.k, item.df);
      const highGroupNearOne = item.k >= 20 && expected.sf > 0.99;
      const tolerance = expected.sf < 0.01
        ? Math.max(1e-15, Math.abs(expected.sf) * 0.005)
        : (highGroupNearOne ? 2e-7 : 1e-9);
      // High-k lower tails retain the prior 6.93e-7 maximum accuracy bound;
      // this matrix uses a stricter 2e-7 limit in that small-tail regime.
      expect(Math.abs(cdf - expected.cdf)).toBeLessThanOrEqual(highGroupNearOne ? 2e-7 : 1e-8);
      expect(Math.abs(sf - expected.sf)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(cdf + sf - 1)).toBeLessThanOrEqual(2e-9);
    });

    quantiles.forEach((item, index) => {
      const oracleEntry = oracle.get(`studentized-range-${matrix.length + index}`);
      expect(oracleEntry?.ok).toBe(true);
      const expected = oracleEntry?.result;
      expect(expected).toBeTruthy();
      const actual = distribution.resolveStudentizedRangeCritical(item.alpha, item.k, item.df);
      // Inverting a 1e-10 tail amplifies the SF's permitted relative error.
      const relativeTolerance = item.alpha <= 1e-8 ? 1e-5 : 2e-7;
      expect(Math.abs(actual - expected.isf)).toBeLessThanOrEqual(relativeTolerance * Math.max(1, expected.isf));
    });

    [
      [2, 6],
      [3, 6], [5, 2.5], [10, 25], [20, 100], [30, 25], [50, 30], [3, Number.POSITIVE_INFINITY]
    ].forEach(([k, df]) => {
      let previousCdf = 0;
      let previousSf = 1;
      [0.1, 0.5, 1, 1.05, 1.2, 1.3, 1.5, 2, 4, 8, 16, 32].forEach(q => {
        const cdf = distribution.studentizedRangeCDF(q, k, df);
        const sf = distribution.studentizedRangeSF(q, k, df);
        expect(cdf).toBeGreaterThanOrEqual(previousCdf);
        expect(sf).toBeLessThanOrEqual(previousSf);
        previousCdf = cdf;
        previousSf = sf;
      });
    });
  });

  testWithOracle('Games–Howell p-values and simultaneous intervals match SciPy', () => {
    const groups = [[1,2,3], [4,6,7,9], [2,3,5,8,11]];
    const labels = ['A','B','C'];
    const cases = [{
      id: 'games-howell-scipy',
      operation: 'box_games_howell',
      payload: { groups, labels, alpha: 0.01 }
    }];
    const oracle = indexOracleResults(runPythonOracle(cases));
    const expected = oracle.get('games-howell-scipy');
    expect(expected?.ok).toBe(true);
    const actual = window.Shared.boxStatsModel.computeGamesHowellComparisons(groups, labels, { ciLevel: 0.99 });
    expect(actual.ok).toBe(true);
    expect(actual.pairs).toHaveLength(expected.result.pairs.length);
    actual.pairs.forEach((pair, index) => {
      const reference = expected.result.pairs[index];
      expect(Math.abs(pair.q - reference.q)).toBeLessThan(1e-12);
      expect(Math.abs(pair.df - reference.df)).toBeLessThan(1e-10);
      expect(Math.abs(pair.p - reference.p)).toBeLessThan(Math.max(1e-15, reference.p * 0.005));
      expect(Math.abs(pair.ciLow - reference.ciLow)).toBeLessThan(2e-7);
      expect(Math.abs(pair.ciHigh - reference.ciHigh)).toBeLessThan(2e-7);
    });

    const frozenCurrentOutput = {
      0.95: [
        { i: 0, j: 1, p: 0.5568702906805794, df: 6.874508361838066, ciLow: -11.358840388502621, ciHigh: 4.458840388502621 },
        { i: 2, j: 3, p: 0.04512684196432912, df: 10.127660305806623, ciLow: -21.454471088540345, ciHigh: -0.2121955781263214 },
        { i: 3, j: 4, p: 0.9918695440577323, df: 12.228054174836975, ciLow: -12.743848285064823, ciHigh: 16.74384828506482 }
      ],
      0.99: [
        { i: 0, j: 1, p: 0.5568702906805794, df: 6.874508361838066, ciLow: -14.432436793443518, ciHigh: 7.532436793443517 },
        { i: 2, j: 3, p: 0.04512684196432912, df: 10.127660305806623, ciLow: -24.816550594074233, ciHigh: 3.149883927407565 },
        { i: 3, j: 4, p: 0.9918695440577323, df: 12.228054174836975, ciLow: -17.05778551371503, ciHigh: 21.05778551371503 }
      ]
    };
    const frozenGroups = [[1,2,4,8],[3,5,7,9,12],[-2,0,1,4,6,10],[6,7,9,13,18,21,24],[0,1,5,8,12,17,23,30]];
    const frozenLabels = ['A','B','C','D','E'];
    [0.95, 0.99].forEach(ciLevel => {
      const frozenResult = window.Shared.boxStatsModel.computeGamesHowellComparisons(frozenGroups, frozenLabels, { ciLevel });
      frozenCurrentOutput[ciLevel].forEach(reference => {
        const pair = frozenResult.pairs.find(item => item.i === reference.i && item.j === reference.j);
        expect(pair).toBeTruthy();
        expect(Math.abs(pair.p - reference.p)).toBeLessThan(2e-12);
        expect(Math.abs(pair.df - reference.df)).toBeLessThan(2e-12);
        expect(Math.abs(pair.ciLow - reference.ciLow)).toBeLessThan(2e-7);
        expect(Math.abs(pair.ciHigh - reference.ciHigh)).toBeLessThan(2e-7);
      });
    });

    const referenceIndex = 1;
    const allGamesHowell = window.Shared.boxStatsModel.computeGamesHowellComparisons(frozenGroups, frozenLabels, { ciLevel: 0.99 });
    const referenceGamesHowell = window.Shared.boxStatsModel.computeGamesHowellComparisons(frozenGroups, frozenLabels, { ciLevel: 0.99, referenceIndex });
    const expectedReferencePairs = allGamesHowell.pairs.filter(pair => pair.i === referenceIndex || pair.j === referenceIndex);
    expect(referenceGamesHowell.pairs.map(({ i, j }) => [i, j])).toEqual(expectedReferencePairs.map(({ i, j }) => [i, j]));
    expect(referenceGamesHowell.pairs).toHaveLength(frozenGroups.length - 1);
    expect(referenceGamesHowell.means).toEqual(allGamesHowell.means);
    expect(referenceGamesHowell.counts).toEqual(allGamesHowell.counts);
    referenceGamesHowell.pairs.forEach((pair, index) => {
      const fullPair = expectedReferencePairs[index];
      expect(Math.abs(pair.p - fullPair.p)).toBeLessThan(1e-12);
      expect(Math.abs(pair.df - fullPair.df)).toBeLessThan(1e-12);
      expect(Math.abs(pair.ciLow - fullPair.ciLow)).toBeLessThan(2e-7);
      expect(Math.abs(pair.ciHigh - fullPair.ciHigh)).toBeLessThan(2e-7);
    });

    const allTukey = window.Shared.boxStatsModel.computeTukeyComparisons(frozenGroups, frozenLabels, { ciLevel: 0.95 });
    const referenceTukey = window.Shared.boxStatsModel.computeTukeyComparisons(frozenGroups, frozenLabels, { ciLevel: 0.95, referenceIndex });
    const expectedTukeyPairs = allTukey.pairs.filter(pair => pair.i === referenceIndex || pair.j === referenceIndex);
    expect(referenceTukey.pairs.map(({ i, j }) => [i, j])).toEqual(expectedTukeyPairs.map(({ i, j }) => [i, j]));
    expect(referenceTukey.pairs).toHaveLength(frozenGroups.length - 1);
    referenceTukey.pairs.forEach((pair, index) => {
      const fullPair = expectedTukeyPairs[index];
      expect(Math.abs(pair.pAdj - fullPair.pAdj)).toBeLessThan(1e-12);
      expect(Math.abs(pair.df - fullPair.df)).toBeLessThan(1e-12);
      expect(Math.abs(pair.ciLow - fullPair.ciLow)).toBeLessThan(1e-12);
      expect(Math.abs(pair.ciHigh - fullPair.ciHigh)).toBeLessThan(1e-12);
    });
  });

  testWithOracle('Nemenyi keeps the studentized-range factor of sqrt(2)', () => {
    const groups = [
      [1,2,3,4,5,6,7,8,9,10,11,12],
      [2,1,4,3,6,5,8,7,10,9,12,11],
      [3,4,1,2,7,8,5,6,11,12,9,10]
    ];
    const actual = window.Shared.boxStatsModel.computeNemenyiComparisons(groups, ['A','B','C'], {
      resamplingMode: 'asymptotic'
    });
    expect(actual.ok).toBe(true);
    const cases = actual.pairs.map((pair, index) => ({
      id: `nemenyi-scipy-${index}`,
      operation: 'box_studentized_range',
      payload: { q: pair.q * Math.SQRT2, k: groups.length, df: 'Infinity' }
    }));
    const oracle = indexOracleResults(runPythonOracle(cases));
    actual.pairs.forEach((pair, index) => {
      const reference = oracle.get(`nemenyi-scipy-${index}`);
      expect(reference?.ok).toBe(true);
      expect(Math.abs(pair.p - reference.result.sf)).toBeLessThan(2e-9);
    });
  });

  test('box Monte Carlo wiring is deterministic with seed and responsive to iteration changes', () => {
    const mwA = [1, 1, 2, 2, 3, 3, 4, 4];
    const mwB = [2, 2, 3, 3, 4, 4, 5, 5];
    const wA = [10, 10, 11, 11, 12, 12];
    const wB = [9, 9, 10, 10, 11, 11];
    const friedmanMc = [
      [1, 2, 2, 3, 3, 4],
      [2, 2, 3, 3, 4, 4],
      [3, 3, 4, 4, 5, 5]
    ];

    const mw1 = boxHooks.mannWhitney(mwA, mwB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 99 });
    const mw2 = boxHooks.mannWhitney(mwA, mwB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 99 });
    const mw3 = boxHooks.mannWhitney(mwA, mwB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 1000, seed: 99 });
    expectClose(mw1.p, mw2.p, 'mw auto deterministic', { abs: 0, rel: 0 });
    expect(mw3.p).not.toBe(mw1.p);

    const wsr1 = boxHooks.wilcoxonSignedRank(wA, wB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 17 });
    const wsr2 = boxHooks.wilcoxonSignedRank(wA, wB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 500, seed: 17 });
    const wsr3 = boxHooks.wilcoxonSignedRank(wA, wB, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 1000, seed: 17 });
    expectClose(wsr1.p, wsr2.p, 'wsr auto deterministic', { abs: 0, rel: 0 });
    expect(wsr3.p).not.toBe(wsr1.p);

    const fried1 = boxHooks.friedmanTest(friedmanMc, { resamplingMode: 'monte-carlo', iterations: 600, seed: 123 });
    const fried2 = boxHooks.friedmanTest(friedmanMc, { resamplingMode: 'monte-carlo', iterations: 600, seed: 123 });
    const fried3 = boxHooks.friedmanTest(friedmanMc, { resamplingMode: 'monte-carlo', iterations: 1200, seed: 123 });
    expect(fried1.ok).toBe(true);
    expectClose(fried1.p, fried2.p, 'friedman auto deterministic', { abs: 0, rel: 0 });
    expect(fried3.p).not.toBe(fried1.p);
  });

  test('box tied Wilcoxon signed-rank Monte Carlo stays significant for strong paired shifts', () => {
    const a = [10, 11, 9, 10, 12, 11, 10, 9, 11, 10, 12, 11];
    const b = [20, 21, 19, 20, 22, 21, 20, 19, 21, 20, 22, 21];
    const auto = boxHooks.wilcoxonSignedRank(a, b, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 10000, seed: 1337 });
    const mc = boxHooks.wilcoxonSignedRank(a, b, { alternative: 'two-sided', resamplingMode: 'monte-carlo', iterations: 10000, seed: 1337 });
    const asym = boxHooks.wilcoxonSignedRank(a, b, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    expect(auto.method).toBe('monte-carlo');
    expect(mc.method).toBe('monte-carlo');
    expect(auto.p).toBeLessThan(0.01);
    expect(mc.p).toBeLessThan(0.01);
    expectClose(auto.p, mc.p, 'wilcoxon monte-carlo auto/manual parity', { abs: 0, rel: 0 });
    expectClose(mc.p, asym.p, 'wilcoxon monte-carlo vs asymptotic tie-heavy shift', { abs: 0.01, rel: 0.25 });
  });

  test('box tied one-sample Wilcoxon Monte Carlo stays significant for strong shifts from H0', () => {
    const values = [25, 25, 26, 26, 27, 27, 28, 28, 29, 29, 30, 30];
    const auto = boxHooks.wilcoxonOneSample(values, 20, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 10000, seed: 4242 });
    const mc = boxHooks.wilcoxonOneSample(values, 20, { alternative: 'two-sided', resamplingMode: 'monte-carlo', iterations: 10000, seed: 4242 });
    const asym = boxHooks.wilcoxonOneSample(values, 20, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    expect(auto.method).toBe('monte-carlo');
    expect(mc.method).toBe('monte-carlo');
    expect(auto.p).toBeLessThan(0.01);
    expect(mc.p).toBeLessThan(0.01);
    expectClose(auto.p, mc.p, 'one-sample wilcoxon monte-carlo auto/manual parity', { abs: 0, rel: 0 });
    expectClose(mc.p, asym.p, 'one-sample wilcoxon monte-carlo vs asymptotic tie-heavy shift', { abs: 0.01, rel: 0.25 });
  });

  test('box tied Mann-Whitney Monte Carlo stays significant for strong group shifts', () => {
    const a = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
    const b = [11, 11, 12, 12, 13, 13, 14, 14, 15, 15];
    const auto = boxHooks.mannWhitney(a, b, { alternative: 'two-sided', resamplingMode: 'auto', iterations: 10000, seed: 7171 });
    const mc = boxHooks.mannWhitney(a, b, { alternative: 'two-sided', resamplingMode: 'monte-carlo', iterations: 10000, seed: 7171 });
    const asym = boxHooks.mannWhitney(a, b, { alternative: 'two-sided', resamplingMode: 'asymptotic' });
    expect(auto.method).toBe('monte-carlo');
    expect(mc.method).toBe('monte-carlo');
    expect(auto.p).toBeLessThan(0.01);
    expect(mc.p).toBeLessThan(0.01);
    expectClose(auto.p, mc.p, 'mann-whitney monte-carlo auto/manual parity', { abs: 0, rel: 0 });
    expectClose(mc.p, asym.p, 'mann-whitney monte-carlo vs asymptotic tie-heavy shift', { abs: 0.01, rel: 0.25 });
  });
});
