describe('chartStyle.axisTicks.buildScale', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../js/vendor.js');
    require('../js/shared/chartStyle.js');
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
});
