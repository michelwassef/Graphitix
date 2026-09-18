describe('chartStyle.formatAxisValue', () => {
  beforeEach(() => {
    jest.resetModules();
    require('../../js/vendor.js');
    require('../../js/shared/chartStyle.js');
  });

  test('keeps explicit Decimal log ticks decimal without zero rounding', () => {
    const { chartStyle } = window.Shared;

    expect(chartStyle.formatAxisValue(1e-6, {
      notation: 'decimal',
      maxDecimals: 2,
      logScale: true
    })).toBe('0.000001');
    expect(chartStyle.formatAxisValue(1e-7, {
      notation: 'decimal',
      maxDecimals: 2,
      logScale: true
    })).toBe('0.0000001');
    expect(chartStyle.formatAxisValue(1e-10, {
      notation: 'decimal',
      maxDecimals: 2,
      logScale: true
    })).toBe('0.0000000001');
    expect(chartStyle.formatAxisValue(1e-20, {
      notation: 'decimal',
      maxDecimals: 2,
      logScale: true
    })).toBe('0.00000000000000000001');
    expect(chartStyle.formatAxisValue(0, {
      notation: 'decimal',
      maxDecimals: 2,
      logScale: true
    })).toBe('0');
  });

  test('uses one power-of-ten notation for Automatic log ticks', () => {
    const { chartStyle } = window.Shared;

    expect(chartStyle.resolveAxisNotation({ notation: 'auto', logScale: true })).toBe('scientific');
    expect(chartStyle.resolveAxisNotation({ notation: 'decimal', logScale: true })).toBe('decimal');

    expect([
      1e-1,
      1e-2,
      1e-3,
      1e-7,
      1e-10
    ].map(value => chartStyle.formatAxisValue(value, {
      notation: 'auto',
      maxDecimals: 2,
      logScale: true
    }))).toEqual(['10⁻¹', '10⁻²', '10⁻³', '10⁻⁷', '10⁻¹⁰']);
  });

  test('keeps ordinary decimal rounding unchanged outside log axes', () => {
    const { chartStyle } = window.Shared;

    expect(chartStyle.formatAxisValue(1e-7, {
      notation: 'decimal',
      maxDecimals: 2
    })).toBe('0');
  });
});
