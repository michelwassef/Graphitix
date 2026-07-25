describe('Box bar negative-value geometry', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('one-sided error bars extend away from zero', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveDisplayedBarErrorInterval).toBe('function');

    expect(hooks.resolveDisplayedBarErrorInterval(4, 3, 5, 'upper')).toEqual({
      startValue: 4,
      endValue: 5,
      showStartCap: false
    });
    expect(hooks.resolveDisplayedBarErrorInterval(-4, -5, -3, 'upper')).toEqual({
      startValue: -4,
      endValue: -5,
      showStartCap: false
    });
  });

  test('linear axes crossing zero render the shared dotted reference line for bars', () => {
    expect(typeof hooks.shouldRenderBoxZeroReferenceLine).toBe('function');
    expect(hooks.shouldRenderBoxZeroReferenceLine(false, { min: -15, max: 20 })).toBe(true);
    expect(hooks.shouldRenderBoxZeroReferenceLine(false, { min: 0, max: 20 })).toBe(false);
    expect(hooks.shouldRenderBoxZeroReferenceLine(false, { min: -15, max: 0 })).toBe(false);
    expect(hooks.shouldRenderBoxZeroReferenceLine(true, { min: -15, max: 20 })).toBe(false);
  });

  test('two-sided error bars retain the full ordered interval', () => {
    expect(hooks.resolveDisplayedBarErrorInterval(-4, -5, -3, 'both')).toEqual({
      startValue: -5,
      endValue: -3,
      showStartCap: true
    });
  });
});
