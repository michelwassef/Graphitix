describe('Box auto axis scaling helpers', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('auto visible-feature scaling is enabled only for hidden points on summary graph types', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.shouldAutoScaleBoxAxisToVisibleFeature).toBe('function');

    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('bar', 'none')).toBe(true);
    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('box', 'none')).toBe(true);
    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('notched', 'none')).toBe(true);
    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('violin', 'none')).toBe(true);

    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('strip', 'none')).toBe(false);
    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('bar', 'overlay')).toBe(false);
    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('box', 'side')).toBe(false);
    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('violin', 'outliers')).toBe(false);
  });

  test('visible upper bound ignores hidden outliers for box plots and uses visible summary height for bars', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveTraceVisibleUpperBoundForAutoAxis).toBe('function');

    const values = [0, 1, 2, 100];
    const summary = hooks.computeTraceSummary(values, { requireSorted: true });

    const visibleBoxMax = hooks.resolveTraceVisibleUpperBoundForAutoAxis({
      graphType: 'box',
      summary,
      valueList: values,
      whiskerRule: 'iqr15',
      whiskerCustomMultiplier: 1.5,
      whiskerNeedsSd: false,
      whiskerMeta: null,
      debugEnabled: false
    });
    expect(visibleBoxMax).toBe(2);

    const visibleBarMax = hooks.resolveTraceVisibleUpperBoundForAutoAxis({
      graphType: 'bar',
      summary,
      valueList: values,
      summaryMode: 'mean-sd'
    });
    const expectedBarMax = summary.mean + summary.sd;
    expect(visibleBarMax).toBeLessThan(summary.max);
    expect(visibleBarMax).toBeCloseTo(expectedBarMax, 10);

    const visibleViolinMax = hooks.resolveTraceVisibleUpperBoundForAutoAxis({
      graphType: 'violin',
      summary,
      valueList: values,
      pointMode: 'none',
      whiskerRule: 'iqr15',
      whiskerCustomMultiplier: 1.5,
      whiskerNeedsSd: false,
      whiskerMeta: null,
      debugEnabled: false
    });
    expect(visibleViolinMax).toBeGreaterThan(visibleBoxMax);
    expect(visibleViolinMax).toBeLessThan(summary.max);
  });
});
