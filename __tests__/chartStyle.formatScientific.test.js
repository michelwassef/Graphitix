describe('chartStyle.formatScientific', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../js/vendor.js');
    require('../js/shared/chartStyle.js');
  });

  test('formats zero as "0"', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.formatScientific(0)).toBe('0');
  });

  test('formats small integers normally', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.formatScientific(1)).toBe('1');
    expect(chartStyle.formatScientific(10)).toBe('10');
    expect(chartStyle.formatScientific(100)).toBe('100');
    expect(chartStyle.formatScientific(999)).toBe('999');
  });

  test('formats values under 10000 normally', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.formatScientific(1000)).toBe('1000');
    expect(chartStyle.formatScientific(5000)).toBe('5000');
    expect(chartStyle.formatScientific(9999)).toBe('9999');
  });

  test('formats large numbers (>=10000) using scientific notation', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.formatScientific(10000)).toBe('10⁴');
    expect(chartStyle.formatScientific(100000)).toBe('10⁵');
    expect(chartStyle.formatScientific(1000000)).toBe('10⁶');
  });

  test('formats non-power-of-10 large numbers with mantissa', () => {
    const { chartStyle } = window.Shared;
    const result = chartStyle.formatScientific(50000);
    expect(result).toBe('5×10⁴');
    
    const result2 = chartStyle.formatScientific(25000);
    expect(result2).toBe('2.5×10⁴');
  });

  test('formats small numbers (<=0.001) using scientific notation', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.formatScientific(0.001)).toBe('10⁻³');
    expect(chartStyle.formatScientific(0.0001)).toBe('10⁻⁴');
    expect(chartStyle.formatScientific(0.00001)).toBe('10⁻⁵');
  });

  test('formats non-power-of-10 small numbers with mantissa', () => {
    const { chartStyle } = window.Shared;
    // 0.0005 is at or below 0.001 threshold
    const result = chartStyle.formatScientific(0.0005);
    expect(result).toBe('5×10⁻⁴');
    
    const result2 = chartStyle.formatScientific(0.00025);
    expect(result2).toBe('2.5×10⁻⁴');
  });

  test('formats negative large numbers correctly', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.formatScientific(-10000)).toBe('-10⁴');
    expect(chartStyle.formatScientific(-50000)).toBe('-5×10⁴');
  });

  test('formats negative small numbers correctly', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.formatScientific(-0.001)).toBe('-10⁻³');
    expect(chartStyle.formatScientific(-0.0005)).toBe('-5×10⁻⁴');
  });

  test('formats decimals between thresholds normally', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.formatScientific(0.5)).toBe('0.5');
    expect(chartStyle.formatScientific(0.25)).toBe('0.25');
    expect(chartStyle.formatScientific(0.01)).toBe('0.01');
    // Values between 0.001 and 10000 are formatted with max 2 decimal places by default
    expect(chartStyle.formatScientific(0.1)).toBe('0.1');
    expect(chartStyle.formatScientific(0.12)).toBe('0.12');
  });

  test('handles non-finite values', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.formatScientific(Infinity)).toBe('Infinity');
    expect(chartStyle.formatScientific(-Infinity)).toBe('-Infinity');
    expect(chartStyle.formatScientific(NaN)).toBe('NaN');
  });

  test('respects custom maxDecimals option', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.formatScientific(1.23456, { maxDecimals: 1 })).toBe('1.2');
    expect(chartStyle.formatScientific(1.23456, { maxDecimals: 3 })).toBe('1.235');
  });

  test('respects custom thresholdHigh option', () => {
    const { chartStyle } = window.Shared;
    // With default threshold (10000), 5000 is formatted normally
    expect(chartStyle.formatScientific(5000)).toBe('5000');
    // With lower threshold (1000), 5000 uses scientific notation
    expect(chartStyle.formatScientific(5000, { thresholdHigh: 1000 })).toBe('5×10³');
  });

  test('respects custom thresholdLow option', () => {
    const { chartStyle } = window.Shared;
    // With default threshold (0.001), 0.01 is formatted normally
    expect(chartStyle.formatScientific(0.01)).toBe('0.01');
    // With higher threshold (0.1), 0.01 uses scientific notation
    expect(chartStyle.formatScientific(0.01, { thresholdLow: 0.1 })).toBe('10⁻²');
  });

  test('createTickFormatter returns a working formatter function', () => {
    const { chartStyle } = window.Shared;
    const formatter = chartStyle.createTickFormatter({ maxDecimals: 2 });
    expect(typeof formatter).toBe('function');
    expect(formatter(10000)).toBe('10⁴');
    expect(formatter(5.5)).toBe('5.5');
    expect(formatter(0)).toBe('0');
  });
});
