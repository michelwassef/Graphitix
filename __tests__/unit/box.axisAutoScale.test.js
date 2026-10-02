const { loadComponentTestBootstrap } = require('../../test-support/componentTestBootstrap');

describe('Box auto axis scaling helpers', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    loadComponentTestBootstrap('box');
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

  test('box auto-scale includes its upper quartile when all upper observations are outliers', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveTraceVisibleUpperBoundForAutoAxis).toBe('function');

    const values = [1, 4, 4, 500];
    const summary = hooks.computeTraceSummary(values, { requireSorted: true });
    const fences = hooks.computeWhiskerFences({
      q1: summary.q1,
      q3: summary.q3,
      iqr: summary.iqr,
      rule: 'iqr15'
    });
    const whiskers = hooks.resolveWhiskerExtents(values, {
      ...fences,
      q1: summary.q1,
      q3: summary.q3
    });

    expect(summary.q1).toBeCloseTo(3.25, 10);
    expect(summary.q3).toBeCloseTo(128, 10);
    expect(fences.upperFence).toBeCloseTo(315.125, 10);
    expect(whiskers.wMax).toBe(128);

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
    expect(visibleBoxMax).toBeCloseTo(summary.q3, 10);

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

  // Matplotlib cbook.boxplot_stats ends a whisker at its quartile when no
  // eligible observation extends beyond that edge of the box.
  test.each([
    [[1, 4, 4, 50], 1, 15.5, [50]],
    [[1, 4, 8, 50], 1, 18.5, [50]],
    [[1, 4, 4, 500], 1, 128, [500]],
    [[-50, -4, -4, -1], -15.5, -1, [-50]],
    [[1, 4, 200, 500], 1, 500, []],
    [[4, 4, 4, 50], 4, 15.5, [50]],
    [[4, 4, 4, 4, 50], 4, 4, [50]],
    [[4], 4, 4, []]
  ])('Tukey whiskers match Matplotlib for %j', (values, expectedMin, expectedMax, expectedOutliers) => {
    const summary = hooks.computeTraceSummary(values, { requireSorted: true });
    const fences = hooks.computeWhiskerFences({ ...summary, rule: 'iqr15' });
    const whiskers = hooks.resolveWhiskerExtents(summary.sortedValues, {
      ...fences, q1: summary.q1, q3: summary.q3
    });
    expect(whiskers.wMin).toBe(expectedMin);
    expect(whiskers.wMax).toBe(expectedMax);
    expect(whiskers.outliers).toEqual(expectedOutliers);
    expect(whiskers.wMin).toBeLessThanOrEqual(summary.q1);
    expect(whiskers.wMax).toBeGreaterThanOrEqual(summary.q3);
  });

  test('summary intervals expand the Strip auto domain and keep invalid log bounds out', () => {
    const values = [1, 4, 4, 500];
    const summary = hooks.computeTraceSummary(values, { requireSorted: false });
    const trace = { y: values, __distribution: summary };

    const linearDomain = hooks.resolveBoxSummaryOverlayDomain(
      [trace],
      'mean-sd',
      { min: summary.min, max: summary.max }
    );
    expect(linearDomain.min).toBeCloseTo(summary.mean - summary.sd, 10);
    expect(linearDomain.min).toBeLessThan(0);
    expect(linearDomain.max).toBe(summary.max);
    expect(trace.__summarySpec.hasInterval).toBe(true);

    const highTailValues = [1, 100];
    const highTailSummary = hooks.computeTraceSummary(highTailValues, { requireSorted: false });
    const highTailDomain = hooks.resolveBoxSummaryOverlayDomain(
      [{ y: highTailValues, __distribution: highTailSummary }],
      'mean-sd',
      { min: highTailSummary.min, max: highTailSummary.max }
    );
    expect(highTailDomain.max).toBeCloseTo(highTailSummary.mean + highTailSummary.sd, 10);
    expect(highTailDomain.max).toBeGreaterThan(highTailSummary.max);

    const logDomain = hooks.resolveBoxSummaryOverlayDomain(
      [{ y: values, __distribution: summary }],
      'mean-sd',
      { min: summary.min, max: summary.max },
      { logScale: true }
    );
    expect(logDomain.min).toBe(summary.min);
    expect(logDomain.max).toBe(summary.max);
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
