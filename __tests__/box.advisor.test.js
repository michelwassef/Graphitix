const ensureBoxModule = () => {
  jest.resetModules();
  const jStatModule = require('jstat');
  const jStat = jStatModule?.jStat || jStatModule;
  global.jStat = jStat;
  if (typeof window !== 'undefined') {
    window.jStat = jStat;
  }
  require('../js/vendor.js');
  require('../js/components/box.js');
  return window.Components?.box;
};

describe('Box plot statistics advisor', () => {
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
    expect(recommendation.postHoc).toBe('gamesHowell');
    expect(recommendation.summary).toMatch(/Welch ANOVA/i);
    expect(recommendation.summary).toMatch(/Games–Howell/i);
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
      groupedGoal: 'perCondition'
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
    expect(recommendation.summary).toMatch(/rows as a random/i);
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
    const result = hooks.analyzeRowRandomMixedModel(groupedData);
    expect(result.ok).toBe(true);
    expect(result.caption).toBe('Mixed Model (Rows Random)');
    expect(result.rows.map(row => row.source)).toEqual([
      'Group',
      'Condition',
      'Group × Condition',
      'Row (random)',
      'Group × Row',
      'Condition × Row',
      'Group × Condition × Row'
    ]);
  });
});
