const { compareCoverage } = require('../../scripts/check-coverage-trend.cjs');

describe('coverage trend gate', () => {
  const baseline = { metrics: { statements: 65, branches: 50, functions: 68, lines: 66 } };

  test('accepts coverage at or above every baseline floor', () => {
    const summary = {
      total: {
        statements: { pct: 65 },
        branches: { pct: 51 },
        functions: { pct: 70 },
        lines: { pct: 66 }
      }
    };
    expect(compareCoverage(summary, baseline)).toEqual([]);
  });

  test('reports every metric that regresses', () => {
    const summary = {
      total: {
        statements: { pct: 64 },
        branches: { pct: 49 },
        functions: { pct: 67 },
        lines: { pct: 65 }
      }
    };
    expect(compareCoverage(summary, baseline)).toHaveLength(4);
  });

  test('enforces critical-module floors when they are declared', () => {
    const criticalBaseline = {
      metrics: baseline.metrics,
      critical: {
        'js/shared/componentLifecycle.js': {
          statements: 70, branches: 50, functions: 70, lines: 70
        }
      }
    };
    const summary = {
      total: {
        statements: { pct: 65 }, branches: { pct: 50 },
        functions: { pct: 68 }, lines: { pct: 66 }
      },
      'C:\\repo\\js\\shared\\componentLifecycle.js': {
        statements: { pct: 69 }, branches: { pct: 51 },
        functions: { pct: 70 }, lines: { pct: 71 }
      }
    };
    expect(compareCoverage(summary, criticalBaseline)).toContain(
      'js/shared/componentLifecycle.js statements: 69% is below baseline 70%'
    );
  });
});
