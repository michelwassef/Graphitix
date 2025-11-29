describe('Box summary helpers', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('computeTraceSummary returns accurate quartiles', () => {
    expect(hooks).toBeDefined();
    const values = [5, 1, 9, 3, 7, 11, 2, 8];
    const summary = hooks.computeTraceSummary(values);
    expect(summary.count).toBe(values.length);
    expect(summary.mean).toBeCloseTo(values.reduce((sum, v) => sum + v, 0) / values.length, 10);
    expect(summary.median).toBeCloseTo(6, 10);
    expect(summary.q1).toBeCloseTo(2.75, 10);
    expect(summary.q3).toBeCloseTo(8.25, 10);
    expect(summary.iqr).toBeCloseTo(5.5, 10);
    expect(summary.sd).toBeGreaterThan(0);
  });

  test('benchmarkSummaries reports positive duration', () => {
    const result = hooks.benchmarkSummaries({ rows: 1500, cols: 12 });
    expect(result.rows).toBe(1500);
    expect(result.cols).toBe(12);
    expect(result.points).toBe(1500 * 12);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
