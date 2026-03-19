describe('chartStyle.computeBottomLayout reserve rotated space', () => {
  beforeAll(() => {
    jest.resetModules();
    require('../js/shared/chartStyle.js');
  });

  test('reserveRotatedLabelSpace keeps bottom stable across widths while preserving rotation trigger', () => {
    const { chartStyle } = window.Shared;
    const labels = ['Treatment A', 'Treatment B', 'Treatment C'];
    const fontSize = 12;
    const wide = chartStyle.computeBottomLayout({
      labels,
      fontSize,
      plotWidth: 600
    });
    const narrow = chartStyle.computeBottomLayout({
      labels,
      fontSize,
      plotWidth: 150
    });
    expect(wide.shouldRotate).toBe(false);
    expect(narrow.shouldRotate).toBe(true);
    expect(narrow.bottom).toBeGreaterThan(wide.bottom);

    const wideReserved = chartStyle.computeBottomLayout({
      labels,
      fontSize,
      plotWidth: 600,
      reserveRotatedLabelSpace: true
    });
    const narrowReserved = chartStyle.computeBottomLayout({
      labels,
      fontSize,
      plotWidth: 150,
      reserveRotatedLabelSpace: true
    });
    expect(wideReserved.shouldRotate).toBe(false);
    expect(narrowReserved.shouldRotate).toBe(true);
    expect(wideReserved.bottom).toBe(narrowReserved.bottom);
  });
});
