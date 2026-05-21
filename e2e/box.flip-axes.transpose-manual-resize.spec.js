const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readFlipTransposeMetrics() {
  const svg = document.querySelector('#boxPlot svg');
  const svgBox = document.querySelector('#boxGraphPanel .svgbox');
  const plot = document.getElementById('boxPlot');
  const state = window.Components?.box?.__getState?.() || null;
  if (!svg || !svgBox || !state) {
    return null;
  }

  const axisLayer = svg.querySelector('g[data-layer="box-axis"]') || svg;
  const lines = Array.from(axisLayer.querySelectorAll('line'))
    .map(line => {
      const x1 = Number(line.getAttribute('x1'));
      const y1 = Number(line.getAttribute('y1'));
      const x2 = Number(line.getAttribute('x2'));
      const y2 = Number(line.getAttribute('y2'));
      if (![x1, y1, x2, y2].every(Number.isFinite)) {
        return null;
      }
      const rect = line.getBoundingClientRect();
      return {
        x1,
        y1,
        x2,
        y2,
        dx: Math.abs(x2 - x1),
        dy: Math.abs(y2 - y1),
        rectWidth: Number.isFinite(rect?.width) ? Number(rect.width) : null,
        rectHeight: Number.isFinite(rect?.height) ? Number(rect.height) : null
      };
    })
    .filter(Boolean);

  const horizontal = lines.filter(line => line.dy <= 0.25 && line.dx > 1);
  const vertical = lines.filter(line => line.dx <= 0.25 && line.dy > 1);
  const xAxis = horizontal.slice().sort((a, b) => b.dx - a.dx)[0] || null;
  const yAxis = vertical.slice().sort((a, b) => b.dy - a.dy)[0] || null;
  const xAxisSpan = xAxis
    ? (Number.isFinite(xAxis.rectWidth) && xAxis.rectWidth > 0 ? xAxis.rectWidth : xAxis.dx)
    : null;
  const yAxisSpan = yAxis
    ? (Number.isFinite(yAxis.rectHeight) && yAxis.rectHeight > 0 ? yAxis.rectHeight : yAxis.dy)
    : null;

  const axisLabels = Array.isArray(state.lastAxisLabels)
    ? state.lastAxisLabels.map(label => String(label || '').trim()).filter(Boolean)
    : [];
  const categoryLabelNodes = Array.from(axisLayer.querySelectorAll('text')).filter(node => {
    const label = String(node?.textContent || '').trim();
    return !!label && axisLabels.includes(label);
  });
  const rotatedCategoryLabelCount = categoryLabelNodes.filter(node =>
    /rotate\(\s*-90/i.test(String(node.getAttribute('transform') || ''))
  ).length;
  const horizontalCategoryLabelCount = categoryLabelNodes.filter(node => {
    const transform = String(node.getAttribute('transform') || '');
    if (/rotate\(\s*-90/i.test(transform)) {
      return false;
    }
    const rect = node.getBoundingClientRect();
    const width = Number(rect?.width);
    const height = Number(rect?.height);
    return Number.isFinite(width) && Number.isFinite(height) && width >= height;
  }).length;

  const svgBoxRect = svgBox.getBoundingClientRect();
  const svgBoxStyle = window.getComputedStyle(svgBox);
  const padTop = Number.parseFloat(String(svgBoxStyle?.paddingTop || '0')) || 0;
  const padBottom = Number.parseFloat(String(svgBoxStyle?.paddingBottom || '0')) || 0;
  const borderTop = Number.parseFloat(String(svgBoxStyle?.borderTopWidth || '0')) || 0;
  const borderBottom = Number.parseFloat(String(svgBoxStyle?.borderBottomWidth || '0')) || 0;
  const ratio = Number(svgBoxRect?.height) > 0 ? Number(svgBoxRect.width) / Number(svgBoxRect.height) : null;
  const visibleNodes = Array.from(svg.querySelectorAll('text,path,line,rect,circle,ellipse,polyline,polygon,foreignObject'));
  let overflowMaxPx = 0;
  const overflowTolerancePx = 0.25;
  visibleNodes.forEach(node => {
    if (!node || node.getAttribute('data-significance-hit-overlay') === '1') {
      return;
    }
    const style = window.getComputedStyle(node);
    if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return;
    }
    const rect = node.getBoundingClientRect();
    const width = Number(rect?.width);
    const height = Number(rect?.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || (width < 0.5 && height < 0.5)) {
      return;
    }
    const leftOverflow = Math.max(0, svgBoxRect.left - rect.left);
    const rightOverflow = Math.max(0, rect.right - svgBoxRect.right);
    const topOverflow = Math.max(0, svgBoxRect.top - rect.top);
    const bottomOverflow = Math.max(0, rect.bottom - svgBoxRect.bottom);
    const localMax = Math.max(leftOverflow, rightOverflow, topOverflow, bottomOverflow);
    if (localMax > overflowTolerancePx) {
      overflowMaxPx = Math.max(overflowMaxPx, localMax);
    }
  });

  return {
    flipAxes: state.flipAxes === true,
    xTickRotateVertical: state.xTickRotateVertical === true,
    xAxisSpan,
    yAxisSpan,
    leftViewportExtensionPx: Number(state.leftViewportExtensionPx) || 0,
    rightViewportExtensionPx: Number(state.rightViewportExtensionPx) || 0,
    bottomViewportExtensionPx: Number(state.bottomViewportExtensionPx) || 0,
    significanceViewportExtensionPx: Number(state.significanceViewportExtensionPx) || 0,
    significancePathCount: svg.querySelectorAll('path.box-significance-annotation').length,
    flipAxisSpanTarget: state.flipAxisSpanTarget ? {
      xAxisSpanPx: Number(state.flipAxisSpanTarget.xAxisSpanPx) || null,
      yAxisSpanPx: Number(state.flipAxisSpanTarget.yAxisSpanPx) || null,
      sourceOrientation: state.flipAxisSpanTarget.sourceOrientation || null
    } : null,
    flipFrameRestoreSnapshot: state.flipFrameRestoreSnapshot ? {
      width: Number(state.flipFrameRestoreSnapshot.width) || null,
      height: Number(state.flipFrameRestoreSnapshot.height) || null,
      xAxisSpanPx: Number(state.flipFrameRestoreSnapshot.xAxisSpanPx) || null,
      yAxisSpanPx: Number(state.flipFrameRestoreSnapshot.yAxisSpanPx) || null,
      bottomViewportExtensionPx: Number(state.flipFrameRestoreSnapshot.bottomViewportExtensionPx) || 0,
      significanceViewportExtensionPx: Number(state.flipFrameRestoreSnapshot.significanceViewportExtensionPx) || 0,
      leftViewportExtensionPx: Number(state.flipFrameRestoreSnapshot.leftViewportExtensionPx) || 0,
      rightViewportExtensionPx: Number(state.flipFrameRestoreSnapshot.rightViewportExtensionPx) || 0
    } : null,
    flipHorizontalReserveCarryoverPx: Number(state.flipHorizontalReserveCarryoverPx) || 0,
    plotWidthPx: Number(state.graphGeometry?.plot?.widthPx) || null,
    plotHeightPx: Number(state.graphGeometry?.plot?.heightPx) || null,
    topReservePx: Number(state.graphGeometry?.reserves?.topPx) || null,
    bottomReservePx: Number(state.graphGeometry?.reserves?.bottomPx) || null,
    plotClientHeightPx: Number(plot?.clientHeight) || null,
    plotClientWidthPx: Number(plot?.clientWidth) || null,
    resizerZoomLevel: Number(svgBox?.dataset?.resizerZoomLevel || svgBox?.dataset?.resizerZoom) || 1,
    svgBoxPaddingY: padTop + padBottom + borderTop + borderBottom,
    svgBoxWidthPx: Number.isFinite(Number(svgBoxRect?.width)) ? Number(svgBoxRect.width) : null,
    svgBoxHeightPx: Number.isFinite(Number(svgBoxRect?.height)) ? Number(svgBoxRect.height) : null,
    svgBoxAspectRatio: Number.isFinite(ratio) ? ratio : null,
    categoryLabelCount: axisLabels.length,
    rotatedCategoryLabelCount,
    horizontalCategoryLabelCount,
    overflowMaxPx
  };
}

async function loadStripExample(page) {
  await expect(async () => {
    await page.locator('#boxLoadExample').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#statsControls input[type="checkbox"]:checked').length >= 3
        && !!window.Components?.box?.__getState?.()?.hot,
      null,
      { timeout: 12_000 }
    );
  }).toPass({ timeout: 40_000, intervals: [500, 1000, 2000] });
  await page.locator('#boxGraphType').selectOption('strip');
  await page.waitForTimeout(650);
}

async function dragBoxWidthHandle(page, deltaX) {
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-vertical');
  await expect(handle).toBeVisible({ timeout: 20_000 });
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Unable to resolve vertical resizer handle');
  }
  const startX = box.x + Math.max(2, Math.min(box.width - 2, box.width / 2));
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 16 });
  await page.mouse.up();
}

async function dragBoxHeightHandle(page, deltaY) {
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-horizontal');
  await expect(handle).toBeVisible({ timeout: 20_000 });
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Unable to resolve horizontal resizer handle');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + deltaY, { steps: 16 });
  await page.mouse.up();
}

async function shrinkBoxWidthByHalf(page) {
  const start = await page.evaluate(() => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      return null;
    }
    const rect = svgBox.getBoundingClientRect();
    return {
      width: Number(rect?.width) || null,
      height: Number(rect?.height) || null
    };
  });
  if (!start || !Number.isFinite(start.width) || !Number.isFinite(start.height)) {
    throw new Error('Unable to read initial box frame size');
  }
  const lockToggle = page.locator('#boxGraphPanel .resizer-aspect-checkbox');
  if (await lockToggle.isVisible().catch(() => false)) {
    if (await lockToggle.isChecked()) {
      await lockToggle.uncheck();
      await page.waitForTimeout(250);
    }
  }
  await dragBoxWidthHandle(page, -Math.round(start.width * 0.5));
  await page.waitForFunction((startWidth) => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) return false;
    const rect = svgBox.getBoundingClientRect();
    const liveWidth = Number(rect?.width);
    return Number.isFinite(liveWidth) && liveWidth <= startWidth * 0.65;
  }, start.width, { timeout: 20_000 });
  await page.waitForTimeout(1_000);
}

async function resizeBoxWidthByRatio(page, ratio) {
  const start = await page.evaluate(() => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      return null;
    }
    const rect = svgBox.getBoundingClientRect();
    return {
      width: Number(rect?.width) || null
    };
  });
  if (!start || !Number.isFinite(start.width) || start.width <= 0) {
    throw new Error('Unable to read current box frame width');
  }
  const deltaX = Math.round(start.width * Number(ratio));
  if (!Number.isFinite(deltaX) || deltaX === 0) {
    return start.width;
  }
  await dragBoxWidthHandle(page, deltaX);
  await page.waitForFunction(({ initialWidth, minDelta }) => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) return false;
    const rect = svgBox.getBoundingClientRect();
    const liveWidth = Number(rect?.width);
    return Number.isFinite(liveWidth) && Math.abs(liveWidth - initialWidth) >= minDelta;
  }, {
    initialWidth: start.width,
    minDelta: Math.max(16, Math.abs(deltaX) * 0.35)
  }, { timeout: 20_000 });
  await page.waitForTimeout(900);
  const end = await page.evaluate(() => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      return null;
    }
    return Number(svgBox.getBoundingClientRect()?.width) || null;
  });
  return end;
}

async function resizeBoxHeightByRatio(page, ratio) {
  const start = await page.evaluate(() => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      return null;
    }
    const rect = svgBox.getBoundingClientRect();
    return {
      height: Number(rect?.height) || null
    };
  });
  if (!start || !Number.isFinite(start.height) || start.height <= 0) {
    throw new Error('Unable to read current box frame height');
  }
  const deltaY = Math.round(start.height * Number(ratio));
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return start.height;
  }
  await dragBoxHeightHandle(page, deltaY);
  await page.waitForFunction(({ initialHeight, minDelta }) => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) return false;
    const rect = svgBox.getBoundingClientRect();
    const liveHeight = Number(rect?.height);
    return Number.isFinite(liveHeight) && Math.abs(liveHeight - initialHeight) >= minDelta;
  }, {
    initialHeight: start.height,
    minDelta: Math.max(16, Math.abs(deltaY) * 0.35)
  }, { timeout: 20_000 });
  await page.waitForTimeout(900);
  const end = await page.evaluate(() => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      return null;
    }
    return Number(svgBox.getBoundingClientRect()?.height) || null;
  });
  return end;
}

async function setFlipAxes(page, enabled) {
  const toggle = page.locator('#boxFlipAxes');
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  if (enabled) {
    await toggle.check();
  } else {
    await toggle.uncheck();
  }
  await page.waitForFunction((expected) => {
    const state = window.Components?.box?.__getState?.();
    return !!state && !!state.flipAxes === !!expected;
  }, enabled, { timeout: 20_000 });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    if (!state) return false;
    const now = Date.now();
    const marker = window.__boxFlipIdleMarker || null;
    if (!marker || marker.token !== state.drawToken) {
      window.__boxFlipIdleMarker = { token: state.drawToken, since: now };
      return false;
    }
    return now - marker.since >= 350;
  }, null, { timeout: 20_000 });
  await page.waitForTimeout(350);
}

async function computeStatsAndEnableSignificance(page, options = {}) {
  const expectedFlip = options.expectedFlip;
  const expectedFlipTri = expectedFlip === true ? 1 : (expectedFlip === false ? 0 : -1);
  const computeButton = page.locator('#boxComputeStats');
  const significanceToggle = page.locator('#boxShowSignificance');
  await expect(computeButton).toBeVisible({ timeout: 20_000 });
  await expect(significanceToggle).toBeVisible({ timeout: 20_000 });

  await computeButton.click();
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    const status = document.getElementById('boxStatsStatus');
    return !!state
      && !state.statsComputationPending
      && Number(state.statsLastRunVersion) > 0
      && /up to date/i.test(String(status?.textContent || ''));
  }, null, { timeout: 45_000 });

  await significanceToggle.check();
  await page.waitForFunction((expectedFlipState) => {
    const state = window.Components?.box?.__getState?.();
    if (!state || state.showSignificanceBars !== true) {
      return false;
    }
    if (expectedFlipState === 1 && state.flipAxes !== true) {
      return false;
    }
    if (expectedFlipState === 0 && state.flipAxes !== false) {
      return false;
    }
    const count = document.querySelectorAll('#boxPlot path.box-significance-annotation').length;
    const horizontalReserve = (Number(state.leftViewportExtensionPx) || 0) + (Number(state.rightViewportExtensionPx) || 0);
    if (expectedFlipState === 1) {
      return count > 0 && horizontalReserve > 0;
    }
    return count > 0;
  }, expectedFlipTri, { timeout: 30_000 });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    if (!state) return false;
    const now = Date.now();
    const marker = window.__boxSignificanceIdleMarker || null;
    if (!marker || marker.token !== state.drawToken) {
      window.__boxSignificanceIdleMarker = { token: state.drawToken, since: now };
      return false;
    }
    return now - marker.since >= 350;
  }, null, { timeout: 20_000 });
  await page.waitForTimeout(350);
}

test.describe('Box flip axes with manual resize', () => {
  test.setTimeout(120_000);

  test('flipping transposes graph frame and keeps flipped category labels horizontal', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await loadStripExample(page);
    await shrinkBoxWidthByHalf(page);

    const before = await page.evaluate(readFlipTransposeMetrics);
    expect(before).not.toBeNull();
    expect(before.flipAxes).toBe(false);
    expect(before.svgBoxWidthPx).not.toBeNull();
    expect(before.svgBoxHeightPx).not.toBeNull();
    expect(before.xAxisSpan).not.toBeNull();
    expect(before.yAxisSpan).not.toBeNull();
    expect(before.overflowMaxPx).toBeLessThanOrEqual(2.5);

    await setFlipAxes(page, true);
    const after = await page.evaluate(readFlipTransposeMetrics);
    expect(after).not.toBeNull();
    expect(after.flipAxes).toBe(true);
    expect(after.xTickRotateVertical).toBe(false);
    expect(after.rotatedCategoryLabelCount).toBe(0);
    expect(after.horizontalCategoryLabelCount).toBeGreaterThanOrEqual(Math.max(1, after.categoryLabelCount - 1));
    expect(after.leftViewportExtensionPx + after.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(after.bottomViewportExtensionPx).toBe(0);
    expect(after.significanceViewportExtensionPx).toBe(0);
    expect(after.overflowMaxPx).toBeLessThanOrEqual(2.5);

    expect(after.svgBoxWidthPx).toBeGreaterThanOrEqual(before.svgBoxHeightPx);
    expect(after.svgBoxHeightPx).toBeGreaterThanOrEqual(before.svgBoxWidthPx - 2);
    expect(after.svgBoxHeightPx).toBeLessThanOrEqual(before.svgBoxWidthPx + 48);
    expect(after.plotWidthPx).not.toBeNull();
    expect(after.plotHeightPx).not.toBeNull();
    expect(before.plotWidthPx).not.toBeNull();
    expect(before.plotHeightPx).not.toBeNull();
    expect(Math.abs(after.plotWidthPx - before.plotHeightPx)).toBeLessThanOrEqual(30);
    expect(Math.abs(after.plotHeightPx - before.plotWidthPx)).toBeLessThanOrEqual(30);

    await setFlipAxes(page, false);
    const restoredBaseline = await page.evaluate(readFlipTransposeMetrics);
    expect(restoredBaseline).not.toBeNull();
    expect(restoredBaseline.flipAxes).toBe(false);
    expect(restoredBaseline.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(restoredBaseline.bottomViewportExtensionPx + restoredBaseline.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredBaseline.leftViewportExtensionPx + restoredBaseline.rightViewportExtensionPx).toBe(0);
    expect(restoredBaseline.plotWidthPx).not.toBeNull();
    expect(restoredBaseline.plotHeightPx).not.toBeNull();
    expect(Math.abs(restoredBaseline.plotWidthPx - before.plotWidthPx)).toBeLessThanOrEqual(14);
    expect(Math.abs(restoredBaseline.plotHeightPx - before.plotHeightPx)).toBeLessThanOrEqual(14);
    expect(restoredBaseline.xAxisSpan).not.toBeNull();
    expect(restoredBaseline.yAxisSpan).not.toBeNull();
    expect(Math.abs(restoredBaseline.xAxisSpan - before.xAxisSpan)).toBeLessThanOrEqual(14);
    expect(Math.abs(restoredBaseline.yAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(14);

    await setFlipAxes(page, true);
    const afterReflip = await page.evaluate(readFlipTransposeMetrics);
    expect(afterReflip).not.toBeNull();
    expect(afterReflip.flipAxes).toBe(true);
    expect(afterReflip.xTickRotateVertical).toBe(false);
    expect(afterReflip.rotatedCategoryLabelCount).toBe(0);
    expect(afterReflip.horizontalCategoryLabelCount).toBeGreaterThanOrEqual(Math.max(1, afterReflip.categoryLabelCount - 1));
    expect(afterReflip.leftViewportExtensionPx + afterReflip.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(afterReflip.bottomViewportExtensionPx).toBe(0);
    expect(afterReflip.significanceViewportExtensionPx).toBe(0);
    expect(afterReflip.overflowMaxPx).toBeLessThanOrEqual(2.5);

    const flippedWiderWidth = await resizeBoxWidthByRatio(page, 0.28);
    const flippedWider = await page.evaluate(readFlipTransposeMetrics);
    expect(flippedWider).not.toBeNull();
    expect(flippedWider.flipAxes).toBe(true);
    expect(flippedWider.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(flippedWider.svgBoxWidthPx).toBeGreaterThan(after.svgBoxWidthPx + 24);
    expect(flippedWider.xAxisSpan).toBeGreaterThan(after.xAxisSpan + 6);
    expect(flippedWiderWidth).not.toBeNull();

    const flippedTallerHeight = await resizeBoxHeightByRatio(page, 0.28);
    const flippedExpanded = await page.evaluate(readFlipTransposeMetrics);
    expect(flippedExpanded).not.toBeNull();
    expect(flippedExpanded.flipAxes).toBe(true);
    expect(flippedExpanded.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(flippedExpanded.svgBoxHeightPx).toBeGreaterThan(flippedWider.svgBoxHeightPx + 16);
    expect(flippedExpanded.yAxisSpan).toBeGreaterThan(flippedWider.yAxisSpan + 5);
    expect(flippedTallerHeight).not.toBeNull();

    await setFlipAxes(page, false);
    const restored = await page.evaluate(readFlipTransposeMetrics);
    expect(restored).not.toBeNull();
    expect(restored.flipAxes).toBe(false);
    expect(restored.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(restored.bottomViewportExtensionPx + restored.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restored.leftViewportExtensionPx + restored.rightViewportExtensionPx).toBe(0);
    expect(restored.svgBoxWidthPx).toBeGreaterThan(before.svgBoxWidthPx + 32);
    expect(restored.svgBoxHeightPx).toBeGreaterThan(before.svgBoxHeightPx + 64);
    expect(Math.abs(restored.svgBoxWidthPx - flippedExpanded.svgBoxHeightPx)).toBeLessThanOrEqual(14);
    expect(Math.abs(restored.svgBoxHeightPx - flippedExpanded.svgBoxWidthPx)).toBeLessThanOrEqual(14);
    expect(restored.plotWidthPx).not.toBeNull();
    expect(restored.plotHeightPx).not.toBeNull();
    expect(flippedExpanded.plotWidthPx).not.toBeNull();
    expect(flippedExpanded.plotHeightPx).not.toBeNull();
    expect(restored.plotWidthPx).toBeGreaterThan(restoredBaseline.plotWidthPx + 22);
    expect(restored.plotHeightPx).toBeGreaterThan(restoredBaseline.plotHeightPx + 96);
    expect(Math.abs(restored.plotHeightPx - flippedExpanded.plotWidthPx)).toBeLessThanOrEqual(40);

    expect(issues.critical).toEqual([]);
  });

  test('flipped significance adds horizontal reserve and grows svg container width without plot distortion', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await loadStripExample(page);
    await shrinkBoxWidthByHalf(page);

    const beforeSignificanceNonFlipped = await page.evaluate(readFlipTransposeMetrics);
    expect(beforeSignificanceNonFlipped).not.toBeNull();
    expect(beforeSignificanceNonFlipped.flipAxes).toBe(false);

    await setFlipAxes(page, true);
    const beforeSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(beforeSignificance).not.toBeNull();
    expect(beforeSignificance.flipAxes).toBe(true);
    expect(beforeSignificance.significancePathCount).toBe(0);
    expect(beforeSignificance.rightViewportExtensionPx).toBe(0);
    expect(beforeSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);

    await computeStatsAndEnableSignificance(page, { expectedFlip: true });
    const afterSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(afterSignificance).not.toBeNull();
    expect(afterSignificance.flipAxes).toBe(true);
    expect(afterSignificance.significancePathCount).toBeGreaterThan(0);
    expect(afterSignificance.significanceViewportExtensionPx).toBe(0);
    expect(afterSignificance.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(afterSignificance.leftViewportExtensionPx + afterSignificance.rightViewportExtensionPx)
      .toBeGreaterThan(beforeSignificance.leftViewportExtensionPx + beforeSignificance.rightViewportExtensionPx + 6);
    expect(afterSignificance.svgBoxWidthPx).toBeGreaterThan(beforeSignificance.svgBoxWidthPx + 8);
    expect(afterSignificance.plotWidthPx).not.toBeNull();
    expect(afterSignificance.plotHeightPx).not.toBeNull();
    expect(beforeSignificance.plotWidthPx).not.toBeNull();
    expect(beforeSignificance.plotHeightPx).not.toBeNull();
    expect(Math.abs(afterSignificance.plotWidthPx - beforeSignificance.plotWidthPx)).toBeLessThanOrEqual(12);
    expect(afterSignificance.yAxisSpan).toBeGreaterThan(0);
    expect(afterSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);

    await setFlipAxes(page, false);
    const restoredWithSignificance = await page.evaluate(readFlipTransposeMetrics);
    expect(restoredWithSignificance).not.toBeNull();
    expect(restoredWithSignificance.flipAxes).toBe(false);
    expect(restoredWithSignificance.significancePathCount).toBeGreaterThan(0);
    expect(restoredWithSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredWithSignificance.bottomViewportExtensionPx + restoredWithSignificance.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restoredWithSignificance.leftViewportExtensionPx + restoredWithSignificance.rightViewportExtensionPx).toBe(0);
    expect(Math.abs(restoredWithSignificance.svgBoxWidthPx - afterSignificance.svgBoxHeightPx)).toBeLessThanOrEqual(14);
    expect(Math.abs(restoredWithSignificance.svgBoxHeightPx - afterSignificance.svgBoxWidthPx)).toBeLessThanOrEqual(14);
    expect(Math.abs(restoredWithSignificance.plotWidthPx - beforeSignificanceNonFlipped.plotWidthPx)).toBeLessThanOrEqual(14);
    expect(restoredWithSignificance.plotHeightPx).toBeGreaterThanOrEqual(beforeSignificanceNonFlipped.plotHeightPx - 12);
    expect(restoredWithSignificance.overflowMaxPx).toBeLessThanOrEqual(2.5);

    expect(issues.critical).toEqual([]);
  });

  test('computing significance before flip preserves transposed graph proportions', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await loadStripExample(page);
    await computeStatsAndEnableSignificance(page, { expectedFlip: false });

    const beforeFlip = await page.evaluate(readFlipTransposeMetrics);
    expect(beforeFlip).not.toBeNull();
    expect(beforeFlip.flipAxes).toBe(false);
    expect(beforeFlip.significancePathCount).toBeGreaterThan(0);
    expect(beforeFlip.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(beforeFlip.rightViewportExtensionPx).toBe(0);
    expect(beforeFlip.leftViewportExtensionPx).toBe(0);
    expect(beforeFlip.plotWidthPx).not.toBeNull();
    expect(beforeFlip.plotHeightPx).not.toBeNull();

    await setFlipAxes(page, true);
    const afterFlip = await page.evaluate(readFlipTransposeMetrics);
    expect(afterFlip).not.toBeNull();
    expect(afterFlip.flipAxes).toBe(true);
    expect(afterFlip.significancePathCount).toBeGreaterThan(0);
    expect(afterFlip.significanceViewportExtensionPx).toBe(0);
    expect(afterFlip.rightViewportExtensionPx).toBeGreaterThan(0);
    expect(afterFlip.leftViewportExtensionPx).toBeGreaterThan(0);
    expect(afterFlip.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(afterFlip.svgBoxWidthPx).toBeGreaterThanOrEqual(beforeFlip.svgBoxHeightPx);
    expect(afterFlip.svgBoxWidthPx).toBeLessThanOrEqual(beforeFlip.svgBoxHeightPx + 80);
    expect(Math.abs(afterFlip.svgBoxHeightPx - beforeFlip.svgBoxWidthPx)).toBeLessThanOrEqual(16);
    expect(afterFlip.plotWidthPx).not.toBeNull();
    expect(afterFlip.plotHeightPx).not.toBeNull();
    expect(Math.abs(afterFlip.plotWidthPx - beforeFlip.yAxisSpan)).toBeLessThanOrEqual(20);
    expect(afterFlip.plotHeightPx).toBeGreaterThanOrEqual(beforeFlip.plotHeightPx - 14);
    expect(afterFlip.plotHeightPx).toBeLessThanOrEqual(beforeFlip.plotHeightPx + 24);

    expect(issues.critical).toEqual([]);
  });
});
