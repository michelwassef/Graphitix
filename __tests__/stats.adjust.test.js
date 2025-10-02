describe('Shared.stats.adjustPValues', () => {
  let adjust;
  let getMeta;
  let listCorrections;

  beforeEach(() => {
    jest.resetModules();
    global.Shared = {};
    require('../js/shared/stats.js');
    adjust = global.Shared.stats.adjustPValues;
    getMeta = global.Shared.stats.getCorrectionMeta;
    listCorrections = global.Shared.stats.listCorrections;
    console.debug('Debug: stats.adjust test setup complete');
  });

  it('applies Bonferroni correction', () => {
    const result = adjust([0.01, 0.04, 0.02], { method: 'bonferroni' });
    expect(result[0]).toBeCloseTo(0.03, 5);
    expect(result[1]).toBeCloseTo(0.12, 5);
    expect(result[2]).toBeCloseTo(0.06, 5);
  });

  it('applies Holm correction', () => {
    const result = adjust([0.01, 0.04, 0.02], { method: 'holm' });
    expect(result[0]).toBeCloseTo(0.03, 5);
    expect(result[1]).toBeCloseTo(0.04, 5);
    expect(result[2]).toBeCloseTo(0.04, 5);
  });

  it('applies Šidák correction', () => {
    const result = adjust([0.01, 0.04, 0.02], { method: 'sidak' });
    expect(result[0]).toBeCloseTo(0.029701, 5);
    expect(result[1]).toBeCloseTo(0.115264, 5);
    expect(result[2]).toBeCloseTo(0.058808, 5);
  });

  it('applies Hochberg correction', () => {
    const result = adjust([0.01, 0.04, 0.02], { method: 'hochberg' });
    expect(result[0]).toBeCloseTo(0.03, 5);
    expect(result[1]).toBeCloseTo(0.04, 5);
    expect(result[2]).toBeCloseTo(0.04, 5);
  });

  it('applies Benjamini–Hochberg correction', () => {
    const result = adjust([0.01, 0.04, 0.02], { method: 'bh' });
    expect(result[0]).toBeCloseTo(0.03, 5);
    expect(result[1]).toBeCloseTo(0.04, 5);
    expect(result[2]).toBeCloseTo(0.03, 5);
  });

  it('applies Benjamini–Yekutieli correction', () => {
    const result = adjust([0.01, 0.04, 0.02], { method: 'by' });
    expect(result[0]).toBeCloseTo(0.054999, 5);
    expect(result[1]).toBeCloseTo(0.073333, 5);
    expect(result[2]).toBeCloseTo(0.054999, 5);
  });

  it('returns original values when no correction is requested', () => {
    const result = adjust([0.01, 0.04, 0.02], { method: 'none' });
    expect(result[0]).toBeCloseTo(0.01, 5);
    expect(result[1]).toBeCloseTo(0.04, 5);
    expect(result[2]).toBeCloseTo(0.02, 5);
  });

  it('exposes metadata and options for corrections', () => {
    const meta = getMeta('sidak');
    expect(meta.label).toContain('Šidák');
    expect(typeof meta.footnote).toBe('function');
    const footnote = meta.footnote(3);
    expect(footnote).toMatch(/Šidák/);
    const options = listCorrections();
    const methodSet = new Set(options.map(opt => opt.value));
    expect(methodSet.has('holm')).toBe(true);
    expect(methodSet.has('bh')).toBe(true);
  });
});
