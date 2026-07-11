describe('Scatter shared statistical primitives', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    window.Shared = { isDebugEnabled: () => false };
    require('../js/shared/stats.js');
    require('../js/shared/regression.js');
  });

  test('normal quantile and Fisher-z correlation interval match reference values', () => {
    const stats = window.Shared.stats;
    expect(stats.normalQuantile(0.975)).toBeCloseTo(1.9599639845, 5);
    const interval = stats.correlationConfidenceInterval(0.5, 30, 0.05);
    expect(interval).toEqual(expect.objectContaining({ method: 'fisher-z' }));
    expect(interval.low).toBeCloseTo(0.170431, 5);
    expect(interval.high).toBeCloseTo(0.728958, 5);
    expect(stats.correlationConfidenceInterval(0.5, 3, 0.05)).toBeNull();
  });

  test('information criteria preserve the former Scatter formulas', () => {
    const criteria = window.Shared.regressionTools.computeInformationCriteria(12.5, 30, 3);
    const expectedAic = (30 * Math.log(12.5 / 30)) + 6;
    const expectedAicc = expectedAic + ((2 * 3 * 4) / (30 - 3 - 1));
    const expectedBic = (30 * Math.log(12.5 / 30)) + (3 * Math.log(30));
    expect(criteria.aic).toBeCloseTo(expectedAic, 12);
    expect(criteria.aicc).toBeCloseTo(expectedAicc, 12);
    expect(criteria.bic).toBeCloseTo(expectedBic, 12);
  });

  test('runs-test primitive reports alternating residual signs correctly', () => {
    const result = window.Shared.regressionTools.computeRunsTestFromResiduals([1, -1, 2, -2, 3, -3]);
    expect(result.available).toBe(true);
    expect(result.runs).toBe(6);
    expect(result.nPositive).toBe(3);
    expect(result.nNegative).toBe(3);
    expect(result.pValue).toBeGreaterThan(0);
    expect(result.pValue).toBeLessThan(1);
  });
});
