const ensureBoxModule = () => {
  jest.resetModules();
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

  test('grouped advisor selects three-way mixed model when rows are repeated and included', () => {
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
    expect(recommendation.analysis).toBe('threeWayMixed');
    expect(Array.isArray(recommendation.rationale)).toBe(true);
  });
});
