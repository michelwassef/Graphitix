/**
 * Tests for scatter plot adaptive point sizing.
 * Validates that point size automatically adjusts based on data point count.
 */

describe('Scatter adaptive point sizing', () => {
  let scatter;

  beforeAll(() => {
    // Load the scatter component module
    require('../js/components/scatter.js');
    scatter = window.Components?.scatter;
  });

  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('computeAdaptivePointSize function is exposed', () => {
    expect(scatter).toBeDefined();
    expect(typeof scatter.computeAdaptivePointSize).toBe('function');
  });

  test('returns maximum size (3) for small datasets (<=50 points)', () => {
    expect(scatter.computeAdaptivePointSize(0)).toBe(3);
    expect(scatter.computeAdaptivePointSize(10)).toBe(3);
    expect(scatter.computeAdaptivePointSize(50)).toBe(3);
  });

  test('returns minimum size (1) for large datasets (>=5000 points)', () => {
    expect(scatter.computeAdaptivePointSize(5000)).toBe(1);
    expect(scatter.computeAdaptivePointSize(10000)).toBe(1);
    expect(scatter.computeAdaptivePointSize(100000)).toBe(1);
  });

  test('scales linearly between thresholds', () => {
    // Midpoint between 50 and 5000 is 2525
    const midpoint = scatter.computeAdaptivePointSize(2525);
    expect(midpoint).toBeGreaterThan(1);
    expect(midpoint).toBeLessThan(3);
    // Should be approximately 2 at midpoint
    expect(midpoint).toBeCloseTo(2, 0);
  });

  test('handles edge cases', () => {
    // Negative numbers treated as 0
    expect(scatter.computeAdaptivePointSize(-1)).toBe(3);
    // Non-numeric values treated as 0
    expect(scatter.computeAdaptivePointSize(null)).toBe(3);
    expect(scatter.computeAdaptivePointSize(undefined)).toBe(3);
    expect(scatter.computeAdaptivePointSize('invalid')).toBe(3);
  });

  test('size decreases monotonically as point count increases', () => {
    const counts = [50, 500, 1000, 2000, 3000, 4000, 5000];
    let previousSize = Infinity;
    
    for (const count of counts) {
      const size = scatter.computeAdaptivePointSize(count);
      expect(size).toBeLessThanOrEqual(previousSize);
      previousSize = size;
    }
  });

  test('result is always within bounds [1, 3]', () => {
    const testCounts = [0, 1, 10, 50, 100, 500, 1000, 2500, 5000, 10000, 100000];
    
    for (const count of testCounts) {
      const size = scatter.computeAdaptivePointSize(count);
      expect(size).toBeGreaterThanOrEqual(1);
      expect(size).toBeLessThanOrEqual(3);
    }
  });
});
