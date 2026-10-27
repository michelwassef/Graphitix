describe('chartStyle.axisTicks.buildScale', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../../js/vendor.js');
    require('../../js/shared/chartStyle.js');
  });

  test('uses small spans instead of inflating to unit range', () => {
    const { chartStyle } = window.Shared;
    const scale = chartStyle.axisTicks.buildScale({
      dataMin: 0.002,
      dataMax: 0.018,
      targetTickCount: 6
    });

    expect(scale.ticks.length).toBeGreaterThan(2);
    expect(scale.step).toBeLessThan(0.05);
    expect(scale.max - scale.min).toBeLessThan(0.1);
  });

  test('keeps imported manual bounds and anchors ticks at Prism tick start', () => {
    const { chartStyle } = window.Shared;
    const scale = chartStyle.axisTicks.buildScale({
      dataMin: 200,
      dataMax: 400,
      manualMin: 220,
      manualMax: 380,
      targetTickCount: 5,
      fixedStep: 40,
      tickStart: 220
    });

    expect(scale).toMatchObject({ min: 220, max: 380, step: 40 });
    expect(scale.ticks).toEqual([220, 260, 300, 340, 380]);
  });

  test('uses Prism cached automatic bounds without marking them as manual', () => {
    const { chartStyle } = window.Shared;
    const scale = chartStyle.axisTicks.buildScale({
      dataMin: 0,
      dataMax: 400,
      autoRangeDataMin: 235,
      autoRangeDataMax: 365,
      autoRangeHint: { min: 200, max: 400, tickInterval: 50, tickStart: 200 },
      fixedStep: 50,
      targetTickCount: 5
    });

    expect(scale).toMatchObject({ min: 200, max: 400, step: 50 });
    expect(scale.ticks).toEqual([200, 250, 300, 350, 400]);
  });

  test('keeps missing optional range ticks unset', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.axisTicks.normalizeAutoRangeHint({
      min: 0,
      max: 10,
      tickInterval: null,
      tickStart: null
    })).toEqual({ min: 0, max: 10, tickInterval: null, tickStart: null });
  });

  test('ignores a cached automatic range when data no longer fits or the user set manual bounds', () => {
    const { chartStyle } = window.Shared;
    const autoRangeHint = { min: 200, max: 400, tickInterval: 50, tickStart: 200 };
    const expanded = chartStyle.axisTicks.buildScale({
      dataMin: 0,
      dataMax: 450,
      autoRangeDataMin: 235,
      autoRangeDataMax: 450,
      autoRangeHint,
      fixedStep: 50,
      targetTickCount: 5
    });
    const manual = chartStyle.axisTicks.buildScale({
      dataMin: 200,
      dataMax: 400,
      manualMin: 220,
      manualMax: 380,
      autoRangeHint,
      fixedStep: 40,
      tickStart: 220,
      targetTickCount: 5
    });

    expect(expanded.min).toBeLessThanOrEqual(235);
    expect(expanded.max).toBeGreaterThanOrEqual(450);
    expect(manual).toMatchObject({ min: 220, max: 380, step: 40 });
  });
});
