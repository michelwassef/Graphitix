describe('Box auto axis scaling helpers', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('auto visible-feature scaling is limited to summary-only graph types', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.shouldAutoScaleBoxAxisToVisibleFeature).toBe('function');

    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('bar', 'none')).toBe(true);
    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('box', 'none')).toBe(true);
    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('notched', 'none')).toBe(true);
    expect(hooks.shouldAutoScaleBoxAxisToVisibleFeature('violin', 'none')).toBe(false);

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

  });

  test('violin density geometry is independent from the point overlay mode', () => {
    expect(typeof hooks.computeViolinTraceRenderStateShared).toBe('function');
    const values = [0, 1, 2, 100];
    const summary = hooks.computeTraceSummary(values, { requireSorted: true });
    const makeState = pointMode => hooks.computeViolinTraceRenderStateShared({
      summary,
      valueList: values,
      pointMode,
      scaleMin: -10,
      scaleMax: 110,
      sampleCount: 80,
      localBand: 40,
      whiskerRule: 'iqr15',
      whiskerCustomMultiplier: 1.5,
      whiskerNeedsSd: false,
      whiskerMeta: null,
      debugEnabled: false
    });

    const hiddenPoints = makeState('none');
    const overlayPoints = makeState('overlay');
    expect(hiddenPoints.densitySource).toEqual(values);
    expect(hiddenPoints.densitySource).toEqual(overlayPoints.densitySource);
    expect(hiddenPoints.densityInfo.positions).toEqual(overlayPoints.densityInfo.positions);
  });

  test('violin extent defaults to KDE tails and supports explicit data-range truncation', () => {
    expect(hooks.sanitizeViolinExtentMode()).toBe('extended');
    expect(hooks.sanitizeViolinExtentMode('unknown')).toBe('extended');
    expect(hooks.sanitizeViolinExtentMode('extended')).toBe('extended');

    const values = [4, 5, 6, 60];
    const trimmed = hooks.resolveViolinDensityDomain(values, {
      manualBandwidth: 2,
      extentMode: 'trimmed'
    });
    const extended = hooks.resolveViolinDensityDomain(values, {
      manualBandwidth: 2,
      extentMode: 'extended'
    });

    expect(trimmed.domainMin).toBe(4);
    expect(trimmed.domainMax).toBe(60);
    expect(trimmed.pad).toBe(0);
    expect(extended.domainMin).toBeLessThan(4);
    expect(extended.domainMax).toBeGreaterThan(60);
    expect(extended.pad).toBeGreaterThan(0);
  });

  test.each(['vertical', 'horizontal'])('truncated violin %s caps share the body path stroke', orientation => {
    const parts = hooks.buildViolinPathPartsShared({
      orientation,
      densityInfo: {
        positions: [4, 60],
        densities: [0.25, 0.5]
      },
      peak: 0.5,
      halfSpan: 20,
      centerCoord: 100,
      valueToPixel: value => value
    });

    expect(parts[0].startsWith('M ')).toBe(true);
    expect(parts.at(-1)).toBe('Z');
    expect(parts).toHaveLength(5);
  });
});
