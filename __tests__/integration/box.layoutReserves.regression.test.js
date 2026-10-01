const { createBoxLayoutReserveTestContext } = require('../../test-support/boxLayoutReserveSuite');

describe('Box layout reserves — base geometry', () => {
  const {
    flushAsyncWork,
    activateWorkspace,
    getBoxNodeById,
    getCommittedBoxSvg,
    createBoxDimensionController,
    readBoxAxisMetrics,
    loadBoxExample,
    applyLongBoxLabels,
    setBoxWidthAndRedraw,
    ensureStatsAndSignificanceReady,
  } = createBoxLayoutReserveTestContext();

  test('violin extent controls axis tails, preserves point-mode geometry, and uses closed stroked caps', async () => {
    await activateWorkspace('box');
    await loadBoxExample();

    const graphType = getBoxNodeById('boxGraphType');
    const pointMode = getBoxNodeById('boxPointMode');
    const extentMode = getBoxNodeById('boxViolinExtent');
    const state = window.Components?.box?.__getState?.();
    expect(graphType).toBeTruthy();
    expect(pointMode).toBeTruthy();
    expect(extentMode).toBeTruthy();
    expect(state?.scheduleDraw).toBeInstanceOf(Function);
    expect(state?.hot?.loadData).toBeInstanceOf(Function);
    state.hot.loadData([
      ['Control', 'Extreme'],
      [4, 8],
      [5, 9],
      [6, 10],
      [7, 11],
      [8, 50],
      [9, 55],
      [10, 60]
    ], {
      source: 'test:box-violin-soft-tail',
      recordUndo: false
    });
    await flushAsyncWork(50);

    const setViolinMode = async (extent, mode) => {
      const previousDrawToken = Number(state.drawToken) || 0;
      graphType.value = 'violin';
      graphType.dispatchEvent(new Event('change', { bubbles: true }));
      extentMode.value = extent;
      extentMode.dispatchEvent(new Event('change', { bubbles: true }));
      pointMode.value = mode;
      pointMode.dispatchEvent(new Event('change', { bubbles: true }));
      await waitFor(() => (Number(state.drawToken) || 0) > previousDrawToken, {
        timeout: 15_000,
        interval: 40
      });
      await flushAsyncWork(50);
      const svg = getCommittedBoxSvg();
      const numericTicks = Array.from(svg?.querySelectorAll?.('[data-box-axis-tick="y"]') || [])
        .map(node => Number(String(node.textContent || '').replace(/[^0-9+-.eE]/g, '')))
        .filter(Number.isFinite);
      const violinPaths = Array.from(svg?.querySelectorAll?.('path[data-box-violin-extent]') || [])
        .map(node => ({
          d: node.getAttribute('d'),
          stroke: node.getAttribute('stroke'),
          extent: node.getAttribute('data-box-violin-extent')
        }));
      return { numericTicks, violinPaths };
    };

    const trimmedHidden = await setViolinMode('trimmed', 'none');
    const trimmedOverlay = await setViolinMode('trimmed', 'overlay');
    const extendedHidden = await setViolinMode('extended', 'none');
    const extendedOverlay = await setViolinMode('extended', 'overlay');

    expect(trimmedHidden.numericTicks.length).toBeGreaterThan(1);
    expect(Math.max(...trimmedHidden.numericTicks)).toBeGreaterThanOrEqual(60);
    expect(trimmedHidden.numericTicks).toEqual(trimmedOverlay.numericTicks);
    expect(trimmedHidden.violinPaths.length).toBeGreaterThan(0);
    expect(trimmedHidden.violinPaths).toEqual(trimmedOverlay.violinPaths);
    trimmedHidden.violinPaths.forEach(path => {
      expect(path.extent).toBe('trimmed');
      expect(path.stroke).toBeTruthy();
      expect(path.stroke).not.toBe('none');
      expect(path.d.trim().endsWith('Z')).toBe(true);
    });

    expect(Math.max(...extendedHidden.numericTicks)).toBeGreaterThan(Math.max(...trimmedHidden.numericTicks));
    expect(extendedHidden.numericTicks).toEqual(extendedOverlay.numericTicks);
    expect(extendedHidden.violinPaths).toEqual(extendedOverlay.violinPaths);
    expect(extendedHidden.violinPaths.every(path => path.extent === 'extended')).toBe(true);
    expect(extendedHidden.violinPaths.map(path => path.d)).not.toEqual(trimmedHidden.violinPaths.map(path => path.d));
  });

  test('x-label envelope preserves plot geometry while labels rotate on 50% width shrink (no significance)', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();

    const controller = createBoxDimensionController(1200, 520);
    await setBoxWidthAndRedraw(controller, 1200, 520);
    const before = readBoxAxisMetrics();
    expect(before).toBeTruthy();
    expect(before.rotated).toBe(false);
    expect(before.significanceViewportExtensionPx).toBe(0);
    expect(before.appliedVerticalFrameReservePx).toBe(before.bottomViewportExtensionPx);

    const { width: startWidth, height } = controller.get();
    await setBoxWidthAndRedraw(controller, Math.round(startWidth * 0.5), height);
    const after = readBoxAxisMetrics();
    expect(after).toBeTruthy();

    expect(after.rotated).toBe(true);
    expect(after.firstRotatedLabelLeftPx).not.toBeNull();
    expect(after.leftViewportExtensionPx).toBe(0);
    expect(after.significanceViewportExtensionPx).toBe(0);
    expect(after.bottomViewportExtensionPx).toBeGreaterThanOrEqual(before.bottomViewportExtensionPx);
    expect(after.appliedVerticalFrameReservePx).toBe(after.bottomViewportExtensionPx);
    expect(after.svgBoxWidthPx).toBeCloseTo(Math.round(startWidth * 0.5), 0);
    expect(after.viewBoxWidthPx).toBeCloseTo(
      after.svgBoxWidthPx + after.appliedHorizontalFrameReservePx,
      0
    );
    expect(Math.abs(after.yAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(after.axisToBaseBottomPx).not.toBeNull();
    expect(before.axisToBaseBottomPx).not.toBeNull();
    expect(after.yAxisX - before.yAxisX).toBeCloseTo(after.xLabelLeadingInsetPx, 0);
    expect(Math.abs(after.plotHeightPx - before.plotHeightPx)).toBeLessThanOrEqual(1.5);
    expect(after.xAxisSpan).toBeLessThan(before.xAxisSpan * 0.8);
  });

  test('payload persists only the canonical Box user frame while reserves stay derived', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();

    const controller = createBoxDimensionController(1200, 520);
    await setBoxWidthAndRedraw(controller, 1200, 520);
    await setBoxWidthAndRedraw(controller, 600, 520);

    const state = window.Components?.box?.__getState?.() || null;
    const payload = window.Components?.box?.getPayload?.() || null;
    const viewportGeometry = payload?.layout?.boxGeometry?.viewportGeometry || null;
    const graphGeometry = payload?.layout?.boxGeometry?.graphGeometry || null;
    const metrics = readBoxAxisMetrics();

    expect(state).toBeTruthy();
    expect(payload).toBeTruthy();
    expect(Number(state.graphGeometry?.reserves?.xLabelPx) || 0).toBeGreaterThan(0);
    expect(viewportGeometry).not.toHaveProperty('bottomViewportExtensionPx');
    expect(viewportGeometry).not.toHaveProperty('significanceViewportExtensionPx');
    expect(viewportGeometry).not.toHaveProperty('leftViewportExtensionPx');
    expect(viewportGeometry).not.toHaveProperty('rightViewportExtensionPx');
    expect(graphGeometry).not.toHaveProperty('reserves');
    expect(Number(viewportGeometry?.userFrameWidthPx) || 0).toBeGreaterThan(0);
    expect(Number(viewportGeometry?.userFrameHeightPx) || 0).toBeGreaterThan(0);
    expect(metrics.cartesianPlan).toBeTruthy();
    expect(metrics.cartesianPlan.userFrame.width).toBeCloseTo(Number(viewportGeometry.userFrameWidthPx), 0);
    expect(metrics.cartesianPlan.userFrame.height).toBeCloseTo(Number(viewportGeometry.userFrameHeightPx), 0);
    expect(metrics.bottomViewportExtensionPx).toBeGreaterThan(0);
  });

  test('deferred canonical capture keeps derived graph sizing out of the payload', async () => {
    await activateWorkspace('box');
    await loadBoxExample();

    const session = window.Main?.session;
    const tab = session?.getActiveTab?.();
    const component = window.Components?.box;
    expect(session).toBeTruthy();
    expect(tab?.type).toBe('box');
    expect(component?.getPayload).toBeInstanceOf(Function);

    const payloadWithoutGraphSizing = session.clonePayload(tab.payload || {});
    if (payloadWithoutGraphSizing.meta) {
      delete payloadWithoutGraphSizing.meta.graphSizing;
    }
    tab.payload = payloadWithoutGraphSizing;
    tab.payloadSignature = session.serializePayloadSignature(payloadWithoutGraphSizing);
    tab.payloadDirty = false;

    const changed = session.captureCanonicalUserMutationState(tab, {
      reason: 'test-deferred-canonical-graph-sizing'
    });

    expect(changed).toBe(true);
    expect(tab.payload?.meta?.graphSizing).toBeUndefined();
  });

  test('x-label and significance reserves stay integrated under 50% width shrink', async () => {
    await activateWorkspace('box');
    await loadBoxExample();
    await applyLongBoxLabels();
    await ensureStatsAndSignificanceReady();

    const controller = createBoxDimensionController(1200, 520);
    await setBoxWidthAndRedraw(controller, 1200, 520);
    const before = readBoxAxisMetrics();
    expect(before).toBeTruthy();
    expect(before.rotated).toBe(false);
    expect(before.significancePathCount).toBeGreaterThan(0);
    expect(before.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(before.appliedVerticalFrameReservePx).toBe(
      before.significanceViewportExtensionPx + before.bottomViewportExtensionPx
    );

    const { width: startWidth, height } = controller.get();
    await setBoxWidthAndRedraw(controller, Math.round(startWidth * 0.5), height);
    const after = readBoxAxisMetrics();
    expect(after).toBeTruthy();

    expect(after.rotated).toBe(true);
    expect(after.significancePathCount).toBeGreaterThan(0);
    expect(after.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(after.bottomViewportExtensionPx).toBeGreaterThanOrEqual(before.bottomViewportExtensionPx);
    expect(after.appliedVerticalFrameReservePx).toBe(
      after.significanceViewportExtensionPx + after.bottomViewportExtensionPx
    );
    expect(Math.abs(after.yAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(1.5);
    expect(after.axisToBaseBottomPx).not.toBeNull();
    expect(before.axisToBaseBottomPx).not.toBeNull();
    expect(after.leftViewportExtensionPx).toBe(0);
    expect(after.yAxisX - before.yAxisX).toBeCloseTo(after.xLabelLeadingInsetPx, 0);
    expect(Math.abs(after.plotHeightPx - before.plotHeightPx)).toBeLessThanOrEqual(1.5);
    expect(after.xAxisSpan).toBeLessThan(before.xAxisSpan * 0.8);
  });

});
