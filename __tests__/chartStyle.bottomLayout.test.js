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

  test('rotation hysteresis avoids flip-flop near threshold', () => {
    const { chartStyle } = window.Shared;
    const fontSize = 12;
    const labels = ['Treatment A', 'B', 'C'];
    const font = chartStyle.makeFont(fontSize);
    const maxLabelWidth = chartStyle.measureText('Treatment A', font);
    const targetRatio = 0.88; // between enter=0.92 and exit=0.82
    const plotWidth = (maxLabelWidth * labels.length) / targetRatio;

    const fromRotated = chartStyle.computeBottomLayout({
      labels,
      fontSize,
      plotWidth,
      rotationHysteresis: {
        previousRotate: true,
        enterRatio: 0.92,
        exitRatio: 0.82
      }
    });
    const fromHorizontal = chartStyle.computeBottomLayout({
      labels,
      fontSize,
      plotWidth,
      rotationHysteresis: {
        previousRotate: false,
        enterRatio: 0.92,
        exitRatio: 0.82
      }
    });

    expect(fromRotated.shouldRotate).toBe(true);
    expect(fromHorizontal.shouldRotate).toBe(false);
  });
});
