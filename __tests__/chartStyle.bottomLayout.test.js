describe('chartStyle.computeBottomLayout reserve rotated space', () => {
  beforeAll(() => {
    jest.resetModules();
    require('../js/shared/chartStyle.js');
  });

  test('uses the compact shared default tick-label gap', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.resolveTickLabelGap(12)).toBe(2);
    expect(chartStyle.resolveTickLabelGap(16)).toBe(3);
    expect(chartStyle.createAxisMetrics(16).tickLabelGap).toBe(3);
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
    const wA = chartStyle.measureText('Treatment A', font);
    const wB = chartStyle.measureText('B', font);
    const targetRatio = 0.88; // between enter=0.92 and exit=0.82
    const pitch = ((wA + wB) / 2) / targetRatio;
    const plotWidth = pitch * labels.length;

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

  test('Cartesian plot rails reserve the full future rotation displacement before labels rotate', () => {
    const { chartStyle } = window.Shared;
    const labels = ['Longest numeric tick 1000', '500', '0'];
    const options = {
      labels,
      fontSize: 16,
      baseBottom: 80,
      preservePlotRail: true
    };
    const wide = chartStyle.computeBottomLayout({ ...options, plotWidth: 1200 });
    const narrow = chartStyle.computeBottomLayout({ ...options, plotWidth: 120 });

    expect(wide.shouldRotate).toBe(false);
    expect(narrow.shouldRotate).toBe(true);
    expect(wide.bottom).toBe(80);
    expect(narrow.bottom).toBe(80);
    expect(wide.requiredBottom).toBe(80 + wide.rotatedExtra);
    expect(narrow.requiredBottom).toBe(wide.requiredBottom);
    expect(wide.titleOffset).toBe(wide.nominalTitleOffset);
    expect(narrow.titleOffset).toBe(narrow.nominalTitleOffset + narrow.rotatedExtra);
  });

  test('explicit band width triggers rotation when categorical spacing is compressed', () => {
    const { chartStyle } = window.Shared;
    const fontSize = 12;
    const labels = ['A', 'Treatment A', 'Treatment B'];

    const fullSpacing = chartStyle.computeBottomLayout({
      labels,
      fontSize,
      plotWidth: 360
    });
    const compressedSpacing = chartStyle.computeBottomLayout({
      labels,
      fontSize,
      plotWidth: 360,
      bandWidth: 48
    });

    expect(fullSpacing.shouldRotate).toBe(false);
    expect(compressedSpacing.shouldRotate).toBe(true);
    expect(compressedSpacing.maxAdjacentOverlapRatio).toBeGreaterThan(fullSpacing.maxAdjacentOverlapRatio);
  });

  test('projected rotated tick-label reserve omits absent axis-title space', () => {
    const { chartStyle } = window.Shared;
    const labels = ['Control', 'Treatment A', 'Treatment B'];
    const fontSize = 16;
    const axisMetrics = {
      tickLength: 6,
      tickLabelGap: 6,
      axisTitleGap: 12,
      outerPadding: 10
    };

    const withTitleReserve = chartStyle.computeBottomLayout({
      labels,
      fontSize,
      plotWidth: 260,
      axisMetrics,
      reserveRotatedLabelSpace: true,
      bottomReserveMode: 'projected-tick-label',
      labelRotationAngleDeg: 45,
      labelReserveMarginPx: 4
    });
    const withoutTitleReserve = chartStyle.computeBottomLayout({
      labels,
      fontSize,
      plotWidth: 260,
      axisMetrics,
      reserveRotatedLabelSpace: true,
      bottomReserveMode: 'projected-tick-label',
      includeAxisTitleReserve: false,
      labelRotationAngleDeg: 45,
      labelReserveMarginPx: 4
    });

    expect(withoutTitleReserve.bottom).toBeLessThan(withTitleReserve.bottom);
    expect(withTitleReserve.bottom - withoutTitleReserve.bottom).toBe(axisMetrics.axisTitleGap + fontSize);
    expect(withoutTitleReserve.bottom).toBeLessThan(100);
  });

  test('reports the horizontal projection needed by a rotated edge label', () => {
    const { chartStyle } = window.Shared;
    const fontSize = 14;
    const layout = chartStyle.computeBottomLayout({
      labels: ['Very long first category', 'Second'],
      fontSize,
      plotWidth: 120,
      labelRotationAngleDeg: 45
    });
    const expected = Math.ceil(Math.SQRT1_2 * (layout.widths[0] + fontSize));

    expect(layout.shouldRotate).toBe(true);
    expect(layout.rotatedLabelHorizontalProjections[0]).toBe(expected);
  });

  test('resolves an internal leading inset when the first rotated label would cross the viewport', () => {
    const { chartStyle } = window.Shared;
    const layout = chartStyle.computeBottomLayout({
      labels: ['Observed contribution (%)', 'Equal-share expectation (%)'],
      fontSize: 16,
      plotWidth: 120,
      labelRotationAngleDeg: 45
    });
    const inset = chartStyle.resolveRotatedXAxisLeadingInset(layout, 40);

    expect(layout.shouldRotate).toBe(true);
    expect(inset).toBeGreaterThan(0);
    expect(chartStyle.resolveRotatedXAxisLeadingInset({ ...layout, shouldRotate: false }, 40)).toBe(0);
  });
});
