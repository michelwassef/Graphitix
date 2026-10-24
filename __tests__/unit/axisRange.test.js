describe('shared axis range rules', () => {
  let axisRange;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../../js/shared/axisRange.js');
    axisRange = window.Shared.axisRange;
  });

  test('zero inclusion expands automatic limits only on linear axes', () => {
    expect(axisRange.includeZero({ min: 2, max: 8 }, { enabled: true }))
      .toEqual({ min: 0, max: 8 });
    expect(axisRange.includeZero({ min: 2, max: 8 }, {
      enabled: true, autoMin: false, autoMax: true
    })).toEqual({ min: 2, max: 8 });
    expect(axisRange.includeZero({ min: 2, max: 8 }, { enabled: true, log: true }))
      .toEqual({ min: 2, max: 8 });
  });

  test('custom origins stay visible while manual limits stay exact', () => {
    expect(axisRange.includeValue({ min: 2, max: 8 }, 1, { enabled: true }))
      .toEqual({ min: 1, max: 8 });
    expect(axisRange.includeValue({ min: 2, max: 8 }, 10, {
      enabled: true, autoMin: false, autoMax: true
    })).toEqual({ min: 2, max: 10 });
    expect(axisRange.includeValue({ min: 2, max: 8 }, 0, { enabled: true, log: true }))
      .toEqual({ min: 2, max: 8 });
  });

  test('axis crossings stay within the selected range', () => {
    expect(axisRange.resolveOrigin({ mode: 'lower', min: 2, max: 8 })).toBe(2);
    expect(axisRange.resolveOrigin({ mode: 'zero', min: -3, max: 8 })).toBe(0);
    expect(axisRange.resolveOrigin({ mode: 'zero', min: 2, max: 8 })).toBe(2);
    expect(axisRange.resolveOrigin({ mode: 'custom', min: 2, max: 8, custom: 10 })).toBe(8);
  });
});
