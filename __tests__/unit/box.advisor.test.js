const { loadComponentTestBootstrap } = require('../../test-support/componentTestBootstrap');

const ensureBoxModule = () => {
  jest.resetModules();
  const jStatModule = require('jstat');
  const jStat = jStatModule?.jStat || jStatModule;
  global.jStat = jStat;
  if (typeof window !== 'undefined') {
    window.jStat = jStat;
  }
  loadComponentTestBootstrap('box');
  return window.Components?.box;
};

describe('Box plot statistics advisor', () => {
  test('paired advisor diagnostics share the engine target and subject-row alignment', () => {
    const box = ensureBoxModule();
    const traces = [
      { name: 'A', rawY: [1, 2, 3, 4], rowIndices: [1, 2, 3, 4] },
      { name: 'B', rawY: [12, 14, 16, 18], rowIndices: [2, 3, 4, 5] }
    ];
    const result = box.__testHooks.computeAdvisorDiagnostics(traces, [0, 1], { paired: 'paired', distribution: 'normal' });
    expect(result.normalityTarget).toBe('within-subject-contrasts');
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]).toMatchObject({ size: 3, label: expect.stringContaining('paired differences') });
    const ratio = box.__testHooks.computeAdvisorDiagnostics(traces, [0, 1], { paired: 'paired', distribution: 'lognormal' });
    expect(ratio.normalityTarget).toBe('within-subject-log-ratios');
    expect(ratio.groups[0].size).toBe(3);
  });

  test('log-scale advisor diagnostics do not discard nonpositive observations', () => {
    const box = ensureBoxModule();
    expect(box.__testHooks.computeAdvisorDiagnostics([
      { name: 'A', rawY: [0, 1, 2] }, { name: 'B', rawY: [1, 2, 3] }
    ], [0, 1], { distribution: 'lognormal', paired: 'unpaired' })).toBeNull();
  });

  test('paired lognormal advisor validates only complete aligned subjects', () => {
    const box=ensureBoxModule();
    const included=box.__testHooks.computeAdvisorDiagnostics([
      {name:'A',rawY:[0,1,2,3],rowIndices:[0,1,2,3]},
      {name:'B',rawY:[4,5,6],rowIndices:[1,2,3]}
    ],[0,1],{distribution:'lognormal',paired:'paired'});
    expect(included.groups).toHaveLength(1);
    expect(included.groups[0].size).toBe(3);
    const invalidIncluded=box.__testHooks.computeAdvisorDiagnostics([
      {name:'A',rawY:[0,1,2],rowIndices:[1,2,3]},
      {name:'B',rawY:[4,5,6],rowIndices:[1,2,3]}
    ],[0,1],{distribution:'lognormal',paired:'paired'});
    expect(invalidIncluded).toBeNull();
  });

  test('advisor diagnostic signatures include values, row identity and the proposed analysis', () => {
    const box = ensureBoxModule();
    const signature = box.__testHooks.buildAdvisorDiagnosticSignature;
    const traces = [{ name: 'A', rawY: [1, 2, 3], rowIndices: [1, 2, 3] }];
    const answers = { paired: 'unpaired', distribution: 'normal' };
    const original = signature(traces, [0], answers);
    traces[0].rawY[1] = 4;
    expect(signature(traces, [0], answers)).not.toBe(original);
    traces[0].rawY[1] = 2;
    traces[0].rowIndices[1] = 5;
    expect(signature(traces, [0], answers)).not.toBe(original);
    traces[0].rowIndices[1] = 2;
    expect(signature(traces, [0], { ...answers, paired: 'paired' })).not.toBe(original);
    expect(signature(traces, [0], { ...answers, distribution: 'lognormal' })).not.toBe(original);
    expect(signature(traces, [0], answers)).toBe(original);
  });

  test.each([
    [2, 'unpaired', 'normal', 'all', 'welchT'],
    [2, 'unpaired', 'nonnormal', 'all', 'mannWhitney'],
    [2, 'paired', 'nonnormal', 'all', 'wilcoxonSignedRank'],
    [3, 'unpaired', 'nonnormal', 'all', 'kruskalWallis'],
    [3, 'paired', 'nonnormal', 'all', 'friedman'],
    [3, 'paired', 'lognormal', 'all', 'lognormalRepeatedMeasuresAnova'],
    [3, 'unpaired', 'nonnormal', 'custom', 'mannWhitney'],
    [3, 'paired', 'lognormal', 'custom', 'ratioT']
  ])('the recommendation selects the promised engine test (%s %s %s %s)', (groupCount, paired, distribution, mode, id) => {
    const box = ensureBoxModule();
    const recommendation = box.getAdvisorRecommendation({
      groups: groupCount === 2 ? 'two' : 'threePlus', paired, distribution
    }, {
      groupCount, currentMode: mode, sampleSizes: Array(groupCount).fill(5),
      minimumValues: Array(groupCount).fill(1), pairedRowCount: 5
    });
    expect(recommendation.ready).toBe(true);
    expect(recommendation.canApply).not.toBe(false);
    const plan = window.Shared.boxStatsModel.resolveSingleAnalysisPlan({
      statsMode: mode, statsTest: recommendation.statsTest, statsPaired: recommendation.paired,
      statsParametricVariant: recommendation.parametricVariant,
      // A previous manual choice must never survive a different recommendation.
      statsNonParametricVariant: recommendation.nonParametricVariant || 'kolmogorovSmirnov'
    }, groupCount);
    expect(plan).toMatchObject({ ok: true, id });
  });

  test.each([
    ['perCondition', 0, 2], ['perCondition', 1, 2],
    ['interaction', 1, 2], ['interaction', 4, 1]
  ])('grouped %s requires estimable data (%s rows, %s conditions)', (goal, rowCount, conditionCount) => {
    const recommendation = ensureBoxModule().getAdvisorRecommendation({
      groupedGoal: goal, groupedRepeated: 'no', groupedRowFactor: 'no'
    }, { format: 'grouped', groupCount: 2, rowCount, conditionCount, ok: rowCount > 0 });
    expect(recommendation.ready).toBe(false);
  });

  test('per-condition Welch guidance requires independent groups', () => {
    const box = ensureBoxModule();
    const context = { format: 'grouped', groupCount: 2, rowCount: 4, conditionCount: 2, partialRowsSkipped: 0, ok: true };
    expect(box.getAdvisorRecommendation({ groupedGoal: 'perCondition' }, context).ready).toBe(false);
    expect(box.getAdvisorRecommendation({ groupedGoal: 'perCondition', groupedRepeated: 'yes' }, context).ready).toBe(false);
    expect(box.getAdvisorRecommendation({ groupedGoal: 'perCondition', groupedRepeated: 'withinGroups' }, context))
      .toMatchObject({ ready: true, analysis: 'rowTTests', recommendedCorrection: 'holm' });
    expect(box.getAdvisorRecommendation({ groupedGoal: 'interaction', groupedRepeated: 'withinGroups' }, context))
      .toMatchObject({ ready: true, analysis: 'nestedRepeatedTwoWay' });
    expect(box.getAdvisorRecommendation({ groupedGoal: 'interaction', groupedRepeated: 'withinGroups' }, {
      ...context, conditionCount: 3
    })).toMatchObject({ ready: false, message: expect.stringContaining('exactly two conditions') });
    expect(box.getAdvisorRecommendation({ groupedGoal: 'interaction', groupedRepeated: 'withinGroups' }, {
      ...context, partialRowsSkipped: 1
    })).toMatchObject({ ready: false, message: expect.stringContaining('complete data') });
  });

  test('requires matching subject rows for paired guidance',()=>{
    const box=ensureBoxModule();
    const answers={groups:'two',paired:'paired',distribution:'normal'};
    expect(box.getAdvisorRecommendation(answers,{groupCount:2,sampleSizes:[2,2],pairedRowCount:0})).toMatchObject({ready:false});
    expect(box.getAdvisorRecommendation(answers,{groupCount:2,sampleSizes:[2,2],pairedRowCount:2})).toMatchObject({ready:true,paired:true});
  });
  test.each([
    [{ groups:'two', paired:'unpaired', distribution:'normal' }, { groupCount:6 }, /does not match/],
    [{ groups:'threePlus', paired:'unpaired', distribution:'normal' }, { groupCount:2 }, /does not match/],
    [{ groups:'two', paired:'unpaired', distribution:'normal' }, { groupCount:2, sampleSizes:[1,5] }, /at least two/],
    [{ groups:'two', paired:'paired', distribution:'lognormal' }, { groupCount:2, sampleSizes:[5,5], minimumValues:[0,1] }, /strictly positive/]
  ])('blocks a recommendation that disagrees with current included data (%j)', (answers,context,message) => {
    const recommendation=ensureBoxModule().getAdvisorRecommendation(answers,context);
    expect(recommendation.ready).toBe(false);
    expect(recommendation.message).toMatch(message);
  });
  test('suggests Welch t-test for two normal independent groups', () => {
    const box = ensureBoxModule();
    expect(box).toBeTruthy();
    const recommendation = box.getAdvisorRecommendation({
      groups: 'two',
      paired: 'unpaired',
      distribution: 'normal'
    }, {
      groupCount: 2
    });
    expect(recommendation.ready).toBe(true);
    expect(recommendation.statsTest).toBe('parametric');
    expect(recommendation.summary).toMatch(/Welch t-test/i);
    expect(Array.isArray(recommendation.rationale)).toBe(true);
  });

  test('recommends Welch ANOVA when variances differ across groups', () => {
    const box = ensureBoxModule();
    const recommendation = box.getAdvisorRecommendation({
      groups: 'threePlus',
      paired: 'unpaired',
      distribution: 'normal',
      equalVariance: 'no'
    }, {
      groupCount: 4,
      sampleSizes: [5, 6, 5, 7]
    });
    expect(recommendation.ready).toBe(true);
    expect(recommendation.statsTest).toBe('parametric');
    expect(recommendation.parametricVariant).toBe('welch');
    expect(recommendation.postHoc).toBe('auto');
    expect(box.__testHooks.resolvePostHocProcedure(recommendation.postHoc, {
      test: recommendation.statsTest,
      variant: recommendation.parametricVariant,
      groupCount: 4,
      varianceConcern: true
    }).effectiveProcedure).toBe('gamesHowell');
    expect(recommendation.summary).toMatch(/Welch ANOVA/i);
    expect(recommendation.summary).toMatch(/automatic post-hoc/i);
    expect(recommendation.rationale.join(' ')).toMatch(/Games–Howell/i);
  });

  test('recommends ratio t test for paired lognormal two-group data', () => {
    const box = ensureBoxModule();
    const recommendation = box.getAdvisorRecommendation({
      groups: 'two',
      paired: 'paired',
      distribution: 'lognormal'
    }, {
      groupCount: 2
    });
    expect(recommendation.ready).toBe(true);
    expect(recommendation.statsTest).toBe('parametric');
    expect(recommendation.parametricVariant).toBe('ratioT');
    expect(recommendation.canApply).toBe(true);
    expect(recommendation.summary).toMatch(/Ratio t test/i);
  });

  test('applies the dedicated lognormal repeated-measures workflow with explicit estimand and covariance assumptions', () => {
    const box = ensureBoxModule();
    const recommendation = box.getAdvisorRecommendation({
      groups: 'threePlus', paired: 'paired', distribution: 'lognormal'
    }, {
      groupCount: 3, currentMode: 'all', sampleSizes: [6, 6, 6], minimumValues: [1, 1, 1], pairedRowCount: 6
    });
    expect(recommendation).toMatchObject({
      ready: true, canApply: true, statsTest: 'parametric', paired: true,
      parametricVariant: 'lognormalClassic', detail: { primaryLabel: 'Lognormal repeated-measures ANOVA' },
      recommendedCorrection: 'holm'
    });
    expect(recommendation.warnings.join(' ')).toMatch(/geometric means and ratios, not arithmetic mean differences/i);
    expect(recommendation.warnings.join(' ')).toMatch(/sphericity.*Greenhouse.Geisser.*Huynh.Feldt/i);
    expect(recommendation.warnings.join(' ')).toMatch(/does not fit a general covariance structure/i);
    const plan = window.Shared.boxStatsModel.resolveSingleAnalysisPlan({
      statsMode: 'all', statsTest: recommendation.statsTest, statsPaired: true,
      statsParametricVariant: recommendation.parametricVariant
    }, 3);
    expect(plan).toMatchObject({ ok: true, id: 'lognormalRepeatedMeasuresAnova', lognormal: true });
  });

  test('requires geometric SD guidance before recommending unpaired lognormal tests', () => {
    const box = ensureBoxModule();
    const recommendation = box.getAdvisorRecommendation({
      groups: 'two',
      paired: 'unpaired',
      distribution: 'lognormal'
    }, {
      groupCount: 2
    });
    expect(recommendation.ready).toBe(false);
    expect(recommendation.missing).toContain('equalVariance');
  });

  test('recommends Prism-style lognormal Welch ANOVA as an applyable workflow', () => {
    const box = ensureBoxModule();
    const recommendation = box.getAdvisorRecommendation({
      groups: 'threePlus',
      paired: 'unpaired',
      distribution: 'lognormal',
      equalVariance: 'no'
    }, {
      groupCount: 4,
      sampleSizes: [5, 5, 6, 7]
    });
    expect(recommendation.ready).toBe(true);
    expect(recommendation.summary).toMatch(/Lognormal Welch ANOVA/i);
    expect(recommendation.parametricVariant).toBe('lognormalWelch');
    expect(recommendation.canApply).toBe(true);
  });

  test('flags missing inputs until the user answers required questions', () => {
    const box = ensureBoxModule();
    const recommendation = box.getAdvisorRecommendation({
      paired: 'paired'
    }, {
      groupCount: 3
    });
    expect(recommendation.ready).toBe(false);
    expect(recommendation.missing).toContain('distribution');
  });

  test('grouped advisor recommends row-wise t-tests for per-condition goal', () => {
    const box = ensureBoxModule();
    const recommendation = box.getAdvisorRecommendation({
      groupedGoal: 'perCondition', groupedRepeated: 'no'
    }, {
      format: 'grouped',
      groupCount: 3,
      conditionCount: 4,
      rowCount: 5,
      ok: true
    });
    expect(recommendation.ready).toBe(true);
    expect(recommendation.analysis).toBe('rowTTests');
    expect(recommendation.summary).toMatch(/row-wise t-tests/i);
  });

  test('grouped advisor selects the row-random mixed model when rows are repeated and included', () => {
    const box = ensureBoxModule();
    const recommendation = box.getAdvisorRecommendation({
      groupedGoal: 'interaction',
      groupedRepeated: 'yes',
      groupedRowFactor: 'yes'
    }, {
      format: 'grouped',
      groupCount: 2,
      conditionCount: 3,
      rowCount: 4,
      ok: true
    });
    expect(recommendation.ready).toBe(true);
    expect(recommendation.analysis).toBe('rowRandomMixed');
    expect(recommendation.summary).toMatch(/fully crossed repeated-measures/i);
    expect(Array.isArray(recommendation.rationale)).toBe(true);
  });

  test('legacy grouped mixed analysis ids normalize to one row-random model', () => {
    const box = ensureBoxModule();
    const hooks = box.__testHooks;
    expect(hooks.normalizeGroupedAnalysisId('twoWayMixed')).toBe('rowRandomMixed');
    expect(hooks.normalizeGroupedAnalysisId('threeWayMixed')).toBe('rowRandomMixed');

    const groupedData = {
      ok: true,
      groupsCount: 2,
      conditionsCount: 2,
      rowsWithData: 4,
      partialRowsSkipped: 0,
      rows: [
        [[10, 12], [13, 15]],
        [[11, 13], [14, 16]],
        [[12, 14], [15, 17]],
        [[13, 15], [16, 18]]
      ],
      cellData: [
        [[10, 11, 12, 13], [12, 13, 14, 15]],
        [[13, 14, 15, 16], [15, 16, 17, 18]]
      ]
    };
    const statsModel=window.Shared.boxStatsModel;
    const compute=analysis=>statsModel.computeGroupedStatsModel({
      grouped:{analysis,data:groupedData}
    });
    const result=compute('rowRandomMixed');
    expect(result.ok).toBe(true);
    expect(result.repeatedMeasures).toMatchObject({
      design:'fully-crossed-within-subjects',
      subjectCount:4,
      primaryCorrection:'greenhouse-geisser'
    });
    expect(result.tables[0].caption).toBe('Two-way repeated-measures ANOVA (rows random)');
    expect(result.tables[0].rows.map(row => row.source)).toEqual([
      'Group',
      'Condition',
      'Group × Condition',
      'Row (random)',
      'Group × Row',
      'Condition × Row',
      'Group × Condition × Row'
    ]);
    expect(compute('twoWayMixed').repeatedMeasures).toEqual(result.repeatedMeasures);
    expect(compute('threeWayMixed').repeatedMeasures).toEqual(result.repeatedMeasures);
  });
});
