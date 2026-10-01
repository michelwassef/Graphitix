const { createBoxLayoutReserveTestContext } = require('../../test-support/boxLayoutReserveSuite');

describe('Box layout reserves — flip and significance geometry', () => {
  const {
    flushAsyncWork,
    activateWorkspace,
    createBoxDimensionController,
    readBoxAxisMetrics,
    loadBoxExample,
    applyLongBoxLabels,
    setBoxWidthAndRedraw,
    doubleClickBoxResizeHandle,
    setBoxResetDefaults,
    setFlipAxesAndRedraw,
    openBoxAxisControls,
    ensureStatsAndSignificanceReady,
    setSignificanceAndRedraw,
  } = createBoxLayoutReserveTestContext();

  test('flip axes swaps drawable axis lengths while keeping labels fully rotated (no significance)', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();

    const controller = createBoxDimensionController(980, 560);
    await setBoxWidthAndRedraw(controller, 980, 560);
    const before = readBoxAxisMetrics();
    expect(before).toBeTruthy();
    expect(before.flipAxes).toBe(false);
    expect(before.significancePathCount).toBe(0);
    expect(before.significanceViewportExtensionPx).toBe(0);

    await setFlipAxesAndRedraw(true);
    const after = readBoxAxisMetrics();
    expect(after).toBeTruthy();
    expect(after.flipAxes).toBe(true);
    expect(after.rotated).toBe(false);
    expect(after.significancePathCount).toBe(0);
    expect(after.significanceViewportExtensionPx).toBe(0);
    expect(after.leftViewportExtensionPx + after.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(after.rotatedCategoryLabelCount).toBe(0);
    expect(Math.abs(after.xAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(after.yAxisSpan - before.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(after.plotWidthPx - after.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(after.plotHeightPx - after.yAxisSpan)).toBeLessThanOrEqual(1.5);
  });

  test('flip axes transposes visible axis lengths after categorical dataset spacing changes', async () => {
    await activateWorkspace('box');
    await loadBoxExample();

    const controller = createBoxDimensionController(980, 560);
    await setBoxWidthAndRedraw(controller, 980, 560);
    const state = window.Components?.box?.__getState?.();
    expect(state?.scheduleDraw).toBeInstanceOf(Function);
    state.axisSettings.x.datasetSpacing = 0.5;
    const previousDrawToken = Number(state.drawToken) || 0;
    state.scheduleDraw({ force: true, reason: 'box-layout-test-dataset-spacing' });
    await waitFor(() => (Number(window.Components?.box?.__getState?.()?.drawToken) || 0) > previousDrawToken, {
      timeout: 15_000,
      interval: 40
    });
    await flushAsyncWork(50);

    const before = readBoxAxisMetrics();
    expect(before).toBeTruthy();
    expect(before.flipAxes).toBe(false);
    expect(before.xAxisSpan).toBeLessThan(before.plotWidthPx * 0.75);

    await setFlipAxesAndRedraw(true);
    const after = readBoxAxisMetrics();
    expect(after).toBeTruthy();
    expect(after.flipAxes).toBe(true);
    expect(state.axisSettings.y.datasetSpacing).toBe(0.5);
    expect(Math.abs(after.xAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(after.yAxisSpan - before.xAxisSpan)).toBeLessThanOrEqual(1.5);

    await setFlipAxesAndRedraw(false);
    const restored = readBoxAxisMetrics();
    expect(restored).toBeTruthy();
    expect(restored.flipAxes).toBe(false);
    expect(state.axisSettings.x.datasetSpacing).toBe(0.5);
    expect(Math.abs(restored.xAxisSpan - before.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(restored.yAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(1.5);
  });

  test('manual value-axis tick interval follows repeated axis flips', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();

    const automaticInput = openBoxAxisControls('y');
    expect(Number(automaticInput.value)).toBeGreaterThan(0);
    expect(automaticInput.dataset.usesDefault).toBe('1');

    automaticInput.value = '2.5';
    automaticInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushAsyncWork(50);
    expect(window.Components.box.__getState().axisSettings.y.tickInterval).toBe(2.5);

    await setFlipAxesAndRedraw(true);
    let state = window.Components.box.__getState();
    expect(state.axisSettings.x.tickInterval).toBe(2.5);
    expect(openBoxAxisControls('x').value).toBe('2.5');
    const flippedPayload = window.Components.box.getPayload();
    expect(flippedPayload.config.axis.tickInterval.x).toBe(2.5);

    await Promise.resolve(window.Components.box.loadFromPayload(flippedPayload, {
      source: 'test-tick-interval-reopen',
      skipDraw: true
    }));
    await flushAsyncWork(30);
    state = window.Components.box.__getState();
    expect(state.flipAxes).toBe(true);
    expect(state.axisSettings.x.tickInterval).toBe(2.5);

    await setFlipAxesAndRedraw(false);
    state = window.Components.box.__getState();
    expect(state.axisSettings.y.tickInterval).toBe(2.5);
    expect(window.Components.box.getPayload().config.axis.tickInterval).toEqual({
      x: 2.5,
      y: 2.5
    });
  });

  test('flip axes keeps axis-length swap stable with significance brackets enabled', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();
    await ensureStatsAndSignificanceReady();

    const controller = createBoxDimensionController(980, 560);
    await setBoxWidthAndRedraw(controller, 980, 560);
    const before = readBoxAxisMetrics();
    expect(before).toBeTruthy();
    expect(before.flipAxes).toBe(false);
    expect(before.significancePathCount).toBeGreaterThan(0);
    expect(before.significanceViewportExtensionPx).toBeGreaterThan(0);

    await setFlipAxesAndRedraw(true);
    const after = readBoxAxisMetrics();
    expect(after).toBeTruthy();
    expect(after.flipAxes).toBe(true);
    expect(after.rotated).toBe(false);
    expect(after.significancePathCount).toBeGreaterThan(0);
    expect(after.significanceViewportExtensionPx).toBe(0);
    expect(after.leftViewportExtensionPx + after.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(after.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(after.rotatedCategoryLabelCount).toBe(0);
    expect(Math.abs(after.xAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(after.yAxisSpan - before.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(after.plotWidthPx - after.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(after.plotHeightPx - after.yAxisSpan)).toBeLessThanOrEqual(1.5);
  });

  test('repeated double-click reset preserves significance reserves in both orientations', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();

    const controller = createBoxDimensionController(980, 560);
    await setBoxWidthAndRedraw(controller, 980, 560);
    await ensureStatsAndSignificanceReady();

    const defaultWidth = Number(window.Shared?.chartStyle?.DEFAULT_WIDTH) || 427;
    const defaultHeight = Number(window.Shared?.chartStyle?.DEFAULT_HEIGHT) || defaultWidth;
    setBoxResetDefaults(defaultWidth, defaultHeight);

    await doubleClickBoxResizeHandle();
    const verticalFirst = readBoxAxisMetrics();
    expect(verticalFirst).toBeTruthy();
    expect(verticalFirst.flipAxes).toBe(false);
    expect(verticalFirst.significancePathCount).toBeGreaterThan(0);
    expect(verticalFirst.appliedVerticalFrameReservePx).toBeGreaterThan(0);
    expect(verticalFirst.appliedHorizontalFrameReservePx).toBeGreaterThan(0);
    expect(verticalFirst.svgBoxWidthPx).toBeCloseTo(defaultWidth, 0);
    expect(verticalFirst.svgBoxHeightPx).toBeCloseTo(defaultHeight, 0);
    expect(verticalFirst.plotHeightPx).toBeGreaterThan(80);

    await doubleClickBoxResizeHandle();
    const verticalSecond = readBoxAxisMetrics();
    expect(verticalSecond.svgBoxWidthPx).toBeCloseTo(verticalFirst.svgBoxWidthPx, 0);
    expect(verticalSecond.svgBoxHeightPx).toBeCloseTo(verticalFirst.svgBoxHeightPx, 0);
    expect(Math.abs(verticalSecond.xAxisSpan - verticalFirst.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(verticalSecond.yAxisSpan - verticalFirst.yAxisSpan)).toBeLessThanOrEqual(1.5);

    await setFlipAxesAndRedraw(true);
    setBoxResetDefaults(defaultWidth, defaultHeight);
    await doubleClickBoxResizeHandle();
    const horizontalFirst = readBoxAxisMetrics();
    expect(horizontalFirst).toBeTruthy();
    expect(horizontalFirst.flipAxes).toBe(true);
    expect(horizontalFirst.significancePathCount).toBeGreaterThan(0);
    expect(horizontalFirst.appliedVerticalFrameReservePx).toBe(0);
    expect(horizontalFirst.appliedHorizontalFrameReservePx).toBeGreaterThan(0);
    expect(horizontalFirst.svgBoxWidthPx).toBeGreaterThan(0);
    expect(horizontalFirst.svgBoxHeightPx).toBeGreaterThan(0);
    expect(horizontalFirst.plotWidthPx).toBeGreaterThan(80);

    await doubleClickBoxResizeHandle();
    const horizontalSecond = readBoxAxisMetrics();
    expect(horizontalSecond.svgBoxWidthPx).toBeCloseTo(horizontalFirst.svgBoxWidthPx, 0);
    expect(horizontalSecond.svgBoxHeightPx).toBeCloseTo(horizontalFirst.svgBoxHeightPx, 0);
    expect(Math.abs(horizontalSecond.xAxisSpan - horizontalFirst.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(horizontalSecond.yAxisSpan - horizontalFirst.yAxisSpan)).toBeLessThanOrEqual(1.5);
  });

  test('repeated flips preserve exact drawable-axis transposition after manual resizing', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();

    const controller = createBoxDimensionController(960, 560);
    await setBoxWidthAndRedraw(controller, 960, 560);
    const baseline = readBoxAxisMetrics();
    expect(baseline).toBeTruthy();
    expect(baseline.flipAxes).toBe(false);
    expect(baseline.flipTransitionPhase).toBe('steady');
    expect(baseline.flipTransitionOrientation).toBe('vertical');

    await setFlipAxesAndRedraw(true);
    const flippedA = readBoxAxisMetrics();
    expect(flippedA).toBeTruthy();
    expect(flippedA.flipAxes).toBe(true);
    expect(flippedA.flipTransitionPhase).toBe('steady');
    expect(flippedA.flipTransitionOrientation).toBe('horizontal');
    expect(Math.abs(flippedA.xAxisSpan - baseline.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(flippedA.yAxisSpan - baseline.xAxisSpan)).toBeLessThanOrEqual(1.5);

    await setFlipAxesAndRedraw(false);
    const restoredA = readBoxAxisMetrics();
    expect(restoredA).toBeTruthy();
    expect(restoredA.flipAxes).toBe(false);
    expect(restoredA.flipTransitionOrientation).toBe('vertical');
    expect(restoredA.svgBoxWidthPx).toBeGreaterThan(0);
    expect(restoredA.svgBoxHeightPx).toBeGreaterThan(0);
    expect(Math.abs(restoredA.xAxisSpan - flippedA.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(restoredA.yAxisSpan - flippedA.xAxisSpan)).toBeLessThanOrEqual(1.5);

    await setFlipAxesAndRedraw(true);
    const flippedB = readBoxAxisMetrics();
    expect(flippedB).toBeTruthy();
    expect(flippedB.flipAxes).toBe(true);
    expect(flippedB.flipTransitionOrientation).toBe('horizontal');
    expect(flippedB.svgBoxWidthPx).toBeGreaterThan(0);
    expect(flippedB.svgBoxHeightPx).toBeGreaterThan(0);
    expect(Math.abs(flippedB.xAxisSpan - restoredA.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(flippedB.yAxisSpan - restoredA.xAxisSpan)).toBeLessThanOrEqual(1.5);

    await setBoxWidthAndRedraw(controller, 760, 640);
    const flippedResized = readBoxAxisMetrics();
    expect(flippedResized).toBeTruthy();
    expect(flippedResized.flipAxes).toBe(true);
    expect(flippedResized.svgBoxWidthPx).toBeGreaterThan(0);
    expect(flippedResized.svgBoxHeightPx).toBeGreaterThan(0);

    await setFlipAxesAndRedraw(false);
    const unflippedPropagated = readBoxAxisMetrics();
    expect(unflippedPropagated).toBeTruthy();
    expect(unflippedPropagated.flipAxes).toBe(false);
    expect(unflippedPropagated.flipTransitionOrientation).toBe('vertical');
    expect(unflippedPropagated.svgBoxWidthPx).toBeGreaterThan(0);
    expect(unflippedPropagated.svgBoxHeightPx).toBeGreaterThan(0);
    expect(Math.abs(unflippedPropagated.xAxisSpan - flippedResized.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(unflippedPropagated.yAxisSpan - flippedResized.xAxisSpan)).toBeLessThanOrEqual(1.5);

    await setFlipAxesAndRedraw(true);
    const flippedRestoredAfterPropagation = readBoxAxisMetrics();
    expect(flippedRestoredAfterPropagation).toBeTruthy();
    expect(flippedRestoredAfterPropagation.flipAxes).toBe(true);
    expect(flippedRestoredAfterPropagation.flipTransitionOrientation).toBe('horizontal');
    expect(flippedRestoredAfterPropagation.svgBoxWidthPx).toBeGreaterThan(0);
    expect(flippedRestoredAfterPropagation.svgBoxHeightPx).toBeGreaterThan(0);
    expect(Math.abs(flippedRestoredAfterPropagation.xAxisSpan - unflippedPropagated.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(flippedRestoredAfterPropagation.yAxisSpan - unflippedPropagated.xAxisSpan)).toBeLessThanOrEqual(1.5);
  });

  test('non-flip significance off-on restores reserve without stretching axes', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();
    await ensureStatsAndSignificanceReady();

    const controller = createBoxDimensionController(980, 560);
    await setBoxWidthAndRedraw(controller, 980, 560);
    const withSignificance = readBoxAxisMetrics();
    expect(withSignificance).toBeTruthy();
    expect(withSignificance.flipAxes).toBe(false);
    expect(withSignificance.significancePathCount).toBeGreaterThan(0);
    expect(withSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);

    await setSignificanceAndRedraw(false);
    const withoutSignificance = readBoxAxisMetrics();
    expect(withoutSignificance).toBeTruthy();
    expect(withoutSignificance.flipAxes).toBe(false);
    expect(withoutSignificance.significancePathCount).toBe(0);
    expect(withoutSignificance.significanceViewportExtensionPx).toBe(0);
    expect(withoutSignificance.bottomViewportExtensionPx).toBeGreaterThan(0);
    expect(Math.abs(withoutSignificance.svgBoxHeightPx - withSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(2);
    expect(withoutSignificance.topReservePx).toBeCloseTo(withSignificance.topReservePx, 6);
    expect(Math.abs(withoutSignificance.bottomReservePx - withSignificance.bottomReservePx)).toBeLessThanOrEqual(4);
    expect(Math.abs(withoutSignificance.xAxisSpan - withSignificance.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(withoutSignificance.plotWidthPx - withSignificance.plotWidthPx)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(withoutSignificance.plotHeightPx - withSignificance.plotHeightPx)).toBeLessThanOrEqual(1.5);

    await setSignificanceAndRedraw(true);
    const restoredAfterReenable = readBoxAxisMetrics();
    expect(restoredAfterReenable).toBeTruthy();
    expect(restoredAfterReenable.flipAxes).toBe(false);
    expect(restoredAfterReenable.significancePathCount).toBeGreaterThan(0);
    expect(restoredAfterReenable.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(Math.abs(restoredAfterReenable.svgBoxHeightPx - withoutSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(2);
    expect(restoredAfterReenable.topReservePx).toBeCloseTo(withoutSignificance.topReservePx, 6);
    expect(Math.abs(restoredAfterReenable.svgBoxHeightPx - withSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(6);
    expect(Math.abs(restoredAfterReenable.topReservePx - withSignificance.topReservePx)).toBeLessThanOrEqual(4);
    expect(Math.abs(restoredAfterReenable.plotHeightPx - withSignificance.plotHeightPx)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(restoredAfterReenable.xAxisSpan - withSignificance.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(restoredAfterReenable.yAxisSpan).toBeGreaterThan(0);
  });

  test('significance toggle-off after flip-unflip removes reserve without stretching axes', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();
    await ensureStatsAndSignificanceReady();

    const controller = createBoxDimensionController(980, 560);
    await setBoxWidthAndRedraw(controller, 980, 560);
    const beforeFlip = readBoxAxisMetrics();
    expect(beforeFlip).toBeTruthy();
    expect(beforeFlip.flipAxes).toBe(false);
    expect(beforeFlip.significancePathCount).toBeGreaterThan(0);
    expect(beforeFlip.significanceViewportExtensionPx).toBeGreaterThan(0);

    await setFlipAxesAndRedraw(true);
    await setFlipAxesAndRedraw(false);
    const restoredWithSignificance = readBoxAxisMetrics();
    expect(restoredWithSignificance).toBeTruthy();
    expect(restoredWithSignificance.flipAxes).toBe(false);
    expect(restoredWithSignificance.significancePathCount).toBeGreaterThan(0);
    expect(restoredWithSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredWithSignificance.xAxisSpan).toBeGreaterThan(0);
    expect(restoredWithSignificance.yAxisSpan).toBeGreaterThan(0);

    await setSignificanceAndRedraw(false);
    const withoutSignificance = readBoxAxisMetrics();
    expect(withoutSignificance).toBeTruthy();
    expect(withoutSignificance.flipAxes).toBe(false);
    expect(withoutSignificance.significancePathCount).toBe(0);
    expect(withoutSignificance.significanceViewportExtensionPx).toBe(0);
    expect(withoutSignificance.bottomViewportExtensionPx).toBeGreaterThan(0);
    expect(Math.abs(withoutSignificance.bottomViewportExtensionPx - restoredWithSignificance.bottomViewportExtensionPx)).toBeLessThanOrEqual(2);
    expect(withoutSignificance.topReservePx).toBeCloseTo(restoredWithSignificance.topReservePx, 6);
    expect(Math.abs(withoutSignificance.bottomReservePx - restoredWithSignificance.bottomReservePx)).toBeLessThanOrEqual(4);
    expect(Math.abs(withoutSignificance.xAxisSpan - restoredWithSignificance.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(withoutSignificance.plotWidthPx - restoredWithSignificance.plotWidthPx)).toBeLessThanOrEqual(1.5);
    expect(withoutSignificance.yAxisSpan).toBeGreaterThan(0);
    expect(withoutSignificance.plotHeightPx).toBeGreaterThan(0);

    await setSignificanceAndRedraw(true);
    const reenabledSignificance = readBoxAxisMetrics();
    expect(reenabledSignificance).toBeTruthy();
    expect(reenabledSignificance.flipAxes).toBe(false);
    expect(reenabledSignificance.significancePathCount).toBeGreaterThan(0);
    expect(reenabledSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(Math.abs(reenabledSignificance.svgBoxHeightPx - withoutSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(2);
    expect(Math.abs(reenabledSignificance.svgBoxHeightPx - restoredWithSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(6);
    expect(reenabledSignificance.topReservePx).toBeCloseTo(withoutSignificance.topReservePx, 6);
    expect(Math.abs(reenabledSignificance.topReservePx - restoredWithSignificance.topReservePx)).toBeLessThanOrEqual(4);
    expect(Math.abs(reenabledSignificance.plotHeightPx - restoredWithSignificance.plotHeightPx)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(reenabledSignificance.xAxisSpan - restoredWithSignificance.xAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(reenabledSignificance.yAxisSpan).toBeGreaterThan(0);
  });

});
