describe('Shared statistical reporting notation', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    global.Shared = window.Shared;
    require('../js/shared/chartStyle.js');
    require('../js/shared/stats.js');
  });

  afterEach(() => {
    delete global.Shared;
    delete window.Shared;
  });

  test('scientific numbers use publication-style multiplication and superscript exponents', () => {
    const reporting = window.Shared.statsReporting;
    expect(reporting.formatScientificNumber(1.234567e-5, { significantDigits: 6 }))
      .toBe('1.23457 × 10⁻⁵');
    expect(reporting.formatScientificNumber(-2.5e6, { significantDigits: 3 }))
      .toBe('−2.5 × 10⁶');
  });

  test('p-value expressions keep a single comparator with conventional spacing', () => {
    const reporting = window.Shared.statsReporting;
    expect(reporting.formatPValueExpression(0.4, { scientific: false }))
      .toBe('p = 0.4');
    expect(reporting.formatPValueExpression(1e-8, { scientific: false }))
      .toBe('p < 0.0001');
    expect(reporting.formatPValueExpression(0, { scientific: true }))
      .toBe('p < 1 × 10⁻⁴');
    expect(reporting.formatPValueExpression(1.234567e-5, { scientific: true }))
      .toBe('p = 1.23457 × 10⁻⁵');
  });

  test('explicit p-value bounds are never replaced by the decimal display threshold', () => {
    const reporting = window.Shared.statsReporting;
    expect(reporting.formatPValueExpression(1e-6, { operator: '>', scientific: false }))
      .toBe('p > 0.000001');
    expect(reporting.formatPValueExpression(1.23e-6, { operator: '≤', scientific: false }))
      .toBe('p ≤ 0.00000123');
    expect(reporting.formatPValueExpression(1e-6, { operator: '>=', scientific: true }))
      .toBe('p ≥ 1 × 10⁻⁶');
  });

  test('structured report rendering repairs legacy p=< syntax and raw e notation', () => {
    const reporting = window.Shared.statsReporting;
    expect(reporting.renderTextParts([
      'r=1.00; R²=0.96; p = ',
      { type: 'pValue', value: 1e-8 },
      '; residual=1.23e-5.'
    ], { scientific: false })).toBe(
      'r = 1.00; R² = 0.96; p < 0.0001; residual = 1.23 × 10⁻⁵.'
    );
    expect(reporting.normalizeNotationText('p=<0.0001; q<=0.05; x=1.23e-5'))
      .toBe('p < 0.0001; q ≤ 0.05; x = 1.23 × 10⁻⁵');
  });
});
