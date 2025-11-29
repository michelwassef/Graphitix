describe('chartStyle.axisTicks.applyLogTicks', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../js/vendor.js');
    require('../js/shared/chartStyle.js');
  });

  test('extends auto log range to cover integer decades', () => {
    const { chartStyle } = window.Shared;
    const axisTicks = chartStyle.axisTicks;
    const minLog = Math.log10(2);
    const maxLog = Math.log10(750);
    const scale = { min: minLog, max: maxLog, ticks: [], step: 0.5 };
    const applied = axisTicks.applyLogTicks(scale, {
      fallbackMin: minLog,
      fallbackMax: maxLog
    });
    expect(applied).toBe(true);
    expect(scale.min).toBe(0);
    expect(scale.max).toBe(3);
    expect(scale.ticks).toEqual([0, 1, 2, 3]);
    expect(scale.step).toBe(1);
  });

  test('respects manual bounds when overriding log ticks', () => {
    const { chartStyle } = window.Shared;
    const axisTicks = chartStyle.axisTicks;
    const scale = { min: 1.1, max: 2.9, ticks: [], step: 0.5 };
    const applied = axisTicks.applyLogTicks(scale, {
      manualMin: 1,
      manualMax: 3,
      fallbackMin: 1.1,
      fallbackMax: 2.9
    });
    expect(applied).toBe(true);
    expect(scale.min).toBe(1);
    expect(scale.max).toBe(3);
    expect(scale.ticks).toEqual([1, 2, 3]);
    expect(scale.step).toBe(1);
  });

  test('falls back gracefully when no integer powers fall within manual range', () => {
    const { chartStyle } = window.Shared;
    const axisTicks = chartStyle.axisTicks;
    const originalTicks = [0.3, 0.4, 0.5];
    const scale = { min: 0.3, max: 0.6, ticks: [...originalTicks], step: 0.2 };
    const applied = axisTicks.applyLogTicks(scale, {
      manualMin: 0.3,
      manualMax: 0.6,
      fallbackMin: 0.3,
      fallbackMax: 0.6
    });
    expect(applied).toBe(false);
    expect(scale.ticks).toEqual(originalTicks);
    expect(scale.min).toBe(0.3);
    expect(scale.max).toBe(0.6);
  });
});
