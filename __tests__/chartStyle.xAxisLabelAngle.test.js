describe('chartStyle x-axis label angle helpers', () => {
  beforeAll(() => {
    jest.resetModules();
    window.Shared = window.Shared || {};
    require('../js/shared/chartStyle.js');
  });

  test('normalizes optional manual x-axis label angles and clamps to +/-90°', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.normalizeOptionalXAxisLabelAngle(null)).toBeNull();
    expect(chartStyle.normalizeOptionalXAxisLabelAngle('')).toBeNull();
    expect(chartStyle.normalizeOptionalXAxisLabelAngle('foo')).toBeNull();
    expect(chartStyle.normalizeOptionalXAxisLabelAngle(-120)).toBe(-90);
    expect(chartStyle.normalizeOptionalXAxisLabelAngle(135)).toBe(90);
    expect(chartStyle.normalizeOptionalXAxisLabelAngle('-45')).toBe(-45);
    expect(chartStyle.normalizeOptionalXAxisLabelAngle(0)).toBe(0);
  });

  test('manual zero-degree mode disables automatic rotation and extra reserve', () => {
    const { chartStyle } = window.Shared;
    const labels = ['Very long treatment label', 'Another very long treatment label'];
    const autoLayout = chartStyle.computeBottomLayout({
      labels,
      plotWidth: 120,
      fontSize: 12,
      includeAxisTitleReserve: true,
      preservePlotRail: false
    });
    const manualLayout = chartStyle.computeBottomLayout({
      labels,
      plotWidth: 120,
      fontSize: 12,
      includeAxisTitleReserve: true,
      preservePlotRail: false,
      manualLabelRotationAngleDeg: 0
    });

    expect(autoLayout.shouldRotate).toBe(true);
    expect(manualLayout.hasManualLabelRotation).toBe(true);
    expect(manualLayout.shouldRotate).toBe(false);
    expect(manualLayout.labelRotationAngleDeg).toBe(0);
    expect(manualLayout.activeExtra).toBe(0);
    expect(manualLayout.reservedExtra).toBe(0);
    expect(manualLayout.requiredBottom).toBeLessThan(autoLayout.requiredBottom);
  });

  test('rotation optical padding scales smoothly with angle and font size', () => {
    const { chartStyle } = window.Shared;
    const atZero = chartStyle.resolveXAxisRotationOpticalPadding({ angleDeg: 0, fontSize: 12, tickLabelGap: 2 });
    const atFortyFive = chartStyle.resolveXAxisRotationOpticalPadding({ angleDeg: 45, fontSize: 12, tickLabelGap: 2 });
    const atNinety = chartStyle.resolveXAxisRotationOpticalPadding({ angleDeg: 90, fontSize: 12, tickLabelGap: 2 });

    expect(atZero).toBe(0);
    expect(atFortyFive).toBeCloseTo(4 * Math.SQRT1_2, 5);
    expect(atNinety).toBeCloseTo(4, 5);
  });

  test('manual vertical mode reserves projected tick-label height and keeps the title rail below it', () => {
    const { chartStyle } = window.Shared;
    const layout = chartStyle.computeBottomLayout({
      labels: ['Vehicle 0.5 mg', 'Vehicle 1.0 mg', 'Vehicle 2.0 mg'],
      plotWidth: 180,
      fontSize: 12,
      includeAxisTitleReserve: true,
      preservePlotRail: false,
      manualLabelRotationAngleDeg: -90
    });

    expect(layout.hasManualLabelRotation).toBe(true);
    expect(layout.shouldRotate).toBe(true);
    expect(layout.labelRotationAngleDeg).toBe(-90);
    expect(layout.rotationOpticalPaddingPx).toBeCloseTo(4, 5);
    expect(layout.activeExtra).toBeGreaterThan(layout.rotatedExtra);
    expect(layout.activeExtra - layout.rotatedExtra).toBeCloseTo(layout.rotationOpticalPaddingPx, 5);
    expect(layout.reservedExtra).toBe(layout.activeExtra);
    expect(layout.requiredBottom).toBeGreaterThan(layout.bottom - 0.0001);
    expect(layout.titleOffset).toBeGreaterThan(layout.labelOffset);
    expect(layout.rotatedLabelHorizontalProjections.every(value => value > 0)).toBe(true);
  });

  test('manual orientation disables auto-rotation heuristics but keeps the requested anchor', () => {
    const { chartStyle } = window.Shared;
    expect(chartStyle.resolveXAxisLabelOrientation(null, -90)).toMatchObject({
      angle: -90,
      anchor: 'end',
      force: true,
      disableAuto: true
    });
    expect(chartStyle.resolveXAxisLabelOrientation(null, 45)).toMatchObject({
      angle: 45,
      anchor: 'start',
      force: true,
      disableAuto: true
    });
    expect(chartStyle.resolveXAxisLabelOrientation({ shouldRotate: true }, 0)).toMatchObject({
      angle: 0,
      anchor: 'middle',
      force: false,
      disableAuto: true
    });
  });

  test('rotated endpoint insets follow the rotation direction', () => {
    const { chartStyle } = window.Shared;
    const leftInset = chartStyle.resolveRotatedXAxisEndpointInsets({
      shouldRotate: true,
      labelRotationAngleDeg: -90,
      rotatedLabelHorizontalProjections: [38, 38, 38],
      outerPadding: 8,
      bandWidth: 24
    }, { left: 10, right: 10 });
    const rightInset = chartStyle.resolveRotatedXAxisEndpointInsets({
      shouldRotate: true,
      labelRotationAngleDeg: 90,
      rotatedLabelHorizontalProjections: [38, 38, 38],
      outerPadding: 8,
      bandWidth: 24
    }, { left: 10, right: 10 });

    expect(leftInset.left).toBeGreaterThan(0);
    expect(leftInset.right).toBe(0);
    expect(rightInset.left).toBe(0);
    expect(rightInset.right).toBeGreaterThan(0);
  });
});
