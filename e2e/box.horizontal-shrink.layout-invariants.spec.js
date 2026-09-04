const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readBoxLayoutInvariantMetrics() {
  const svg = document.querySelector('#boxPlot svg');
  const svgBox = document.querySelector('#boxGraphPanel .svgbox');
  const state = window.Components?.box?.__getState?.() || null;
  if (!svg || !svgBox || !state) {
    return null;
  }

  const axisLayer = svg.querySelector('g[data-layer="box-axis"]') || svg;
  const primaryAxisLines = Array.from(axisLayer.querySelectorAll('line[data-box-primary-axis]'));
  const lines = (primaryAxisLines.length ? primaryAxisLines : Array.from(axisLayer.querySelectorAll('line')))
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
        rectLeft: Number.isFinite(rect?.left) ? Number(rect.left) : null,
        rectRight: Number.isFinite(rect?.right) ? Number(rect.right) : null,
        rectTop: Number.isFinite(rect?.top) ? Number(rect.top) : null,
        rectBottom: Number.isFinite(rect?.bottom) ? Number(rect.bottom) : null
      };
    })
    .filter(Boolean);

  const horizontal = lines.filter(line => line.dy <= 0.25 && line.dx > 1);
  const vertical = lines.filter(line => line.dx <= 0.25 && line.dy > 1);

  const xAxis = horizontal
    .slice()
    .sort((a, b) => {
      const ay = Number.isFinite(a.rectBottom) ? a.rectBottom : a.y1;
      const by = Number.isFinite(b.rectBottom) ? b.rectBottom : b.y1;
      return by - ay || b.dx - a.dx;
    })[0] || null;

  const yAxis = vertical
    .slice()
    .sort((a, b) => b.dy - a.dy || a.x1 - b.x1)[0] || null;

  const axisCenter = (start, end) => {
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return null;
    }
    return (start + end) / 2;
  };

  const svgBoxRect = svgBox.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  const visibleNodes = Array.from(svg.querySelectorAll('text,path,line,rect,circle,ellipse,polyline,polygon,foreignObject'));
  let overflowMaxPx = 0;
  let overflowNodeCount = 0;
  const toleranceGate = 0.2;

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
    // Derived reserves extend the complete SVG envelope outside the canonical
    // resizable frame. Clipping must therefore be checked against that envelope.
    const leftOverflow = Math.max(0, svgRect.left - rect.left);
    const rightOverflow = Math.max(0, rect.right - svgRect.right);
    const topOverflow = Math.max(0, svgRect.top - rect.top);
    const bottomOverflow = Math.max(0, rect.bottom - svgRect.bottom);
    const localMax = Math.max(leftOverflow, rightOverflow, topOverflow, bottomOverflow);
    if (localMax > toleranceGate) {
      overflowNodeCount += 1;
      overflowMaxPx = Math.max(overflowMaxPx, localMax);
    }
  });

  const graphGeometry = state.graphGeometry || {};
  return {
    rotated: state.xTickRotateVertical === true,
    xAxisY: xAxis ? axisCenter(xAxis.rectTop, xAxis.rectBottom) : null,
    yAxisX: yAxis ? axisCenter(yAxis.rectLeft, yAxis.rectRight) : null,
    yAxisSvgX: yAxis ? yAxis.x1 : null,
    yAxisSpan: yAxis ? yAxis.dy : null,
    xAxisSpan: xAxis ? xAxis.dx : null,
    plotHeightPx: Number(graphGeometry?.plot?.heightPx) || null,
    plotWidthPx: Number(graphGeometry?.plot?.widthPx) || null,
    xLabelLeadingInsetPx: Number(graphGeometry?.xTicks?.leadingInsetPx) || 0,
    significancePathCount: svg.querySelectorAll('path.box-significance-annotation').length,
    significanceViewportExtensionPx: Number(graphGeometry?.reserves?.significancePx) || 0,
    bottomViewportExtensionPx: Number(graphGeometry?.reserves?.xLabelPx) || 0,
    leftViewportExtensionPx: Number(graphGeometry?.reserves?.leftPx) || 0,
    appliedVerticalFrameReservePx: (Number(svgBox.__cartesianLayoutPlan?.contentEnvelope?.extensionTop) || 0)
      + (Number(svgBox.__cartesianLayoutPlan?.contentEnvelope?.extensionBottom) || 0),
    svgBoxWidthPx: Number(svgBoxRect.width) || null,
    svgBoxHeightPx: Number(svgBoxRect.height) || null,
    overflowNodeCount,
    overflowMaxPx
  };
}

async function loadStripExample(page) {
  await expect(async () => {
    await page.locator('#boxLoadExample').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#statsControls input[type="checkbox"]:checked').length >= 3
        && !document.querySelector('#boxComputeStats')?.disabled,
      null,
      { timeout: 12_000 }
    );
  }).toPass({ timeout: 40_000, intervals: [500, 1000, 2000] });
  await page.waitForFunction(
    () => !!document.querySelector('#boxPlot svg')
      && !!window.Components?.box?.__getState?.()?.hot,
    null,
    { timeout: 25_000 }
  );
  await page.locator('#boxGraphType').selectOption('strip');
  await page.waitForTimeout(600);
}

async function setBoxLabelsFromList(page, labels) {
  await page.evaluate(async (nextLabels) => {
    const labels = Array.isArray(nextLabels) ? nextLabels : [];
    const box = window.Components?.box;
    const hot = box?.__getState?.()?.hot;
    if (!box || !hot || typeof hot.loadData !== 'function') {
      throw new Error('Box hot table is unavailable');
    }
    hot.loadData([
      labels,
      [12, 15, 14],
      [14.3, 17, 15.3],
      [11, 14.6, 13],
      [13.3, 16, 16.3]
    ], {
      source: 'e2e-long-labels',
      recordUndo: false
    });
    if (typeof box.draw === 'function') {
      await box.draw();
    }
  }, labels);
  await page.waitForTimeout(700);
}

async function ensureStatsAndSignificance(page) {
  const computeButton = page.locator('#boxComputeStats');
  await expect(computeButton).toBeVisible({ timeout: 20_000 });
  await expect(computeButton).toBeEnabled({ timeout: 20_000 });
  await computeButton.click();
  await expect(page.locator('#boxStatsStatus')).toContainText(/Statistics (?:up to date|ready to calculate)\./, { timeout: 40_000 });
  if ((await page.locator('#boxStatsStatus').textContent())?.includes('ready to calculate')) {
    await expect(computeButton).toBeEnabled({ timeout: 20_000 });
    await computeButton.click();
  }
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 40_000 });

  const toggle = page.locator('#boxShowSignificance');
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  if (!(await toggle.isChecked())) {
    await toggle.check();
  }
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation').length > 0
      && Number(window.Components?.box?.__getState?.()?.graphGeometry?.reserves?.significancePx || 0) > 0,
    null,
    { timeout: 25_000 }
  );
  await page.waitForTimeout(700);
}

async function resizeBoxWidthOnly(page, targetWidthPx) {
  const payload = await page.evaluate((targetWidth) => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      throw new Error('Missing box svgBox');
    }
    const lockCheckbox = document.querySelector('#boxGraphPanel .resizer-aspect-checkbox');
    if (lockCheckbox) {
      lockCheckbox.checked = false;
      lockCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const rect = svgBox.getBoundingClientRect();
    const width = Math.max(200, Math.round(Number(targetWidth) || rect.width));
    const height = Math.max(160, Math.round(rect.height));
    if (window.Shared?.applyResizableBoxSize) {
      window.Shared.applyResizableBoxSize(svgBox, {
        width,
        height,
        preserveAspectLock: false,
        reason: 'e2e-box-horizontal-50pct'
      });
    } else {
      svgBox.style.width = `${width}px`;
      svgBox.style.height = `${height}px`;
    }
    const schedule = window.Components?.box?.__getState?.()?.scheduleDraw;
    if (typeof schedule === 'function') {
      schedule({ viewOnly: true, reason: 'e2e-box-horizontal-50pct' });
    }
    return {
      previousWidth: Number(rect.width) || null,
      targetWidth: width,
      fixedHeight: height
    };
  }, targetWidthPx);
  await page.waitForFunction((targetWidth) => {
    const svgBox = document.querySelector('#boxGraphPanel .svgbox');
    if (!svgBox) {
      return false;
    }
    const current = svgBox.getBoundingClientRect().width;
    return Number.isFinite(current) && Math.abs(current - Number(targetWidth)) <= 4;
  }, payload.targetWidth, { timeout: 20_000 });
  await page.waitForTimeout(900);
  return payload;
}

async function dragBoxWidthHandleBy(page, deltaX) {
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-vertical').first();
  await expect(handle).toBeVisible({ timeout: 15_000 });
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Missing Box width handle geometry');
  }
  const startX = box.x + Math.max(2, Math.min(box.width - 2, box.width / 2));
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + deltaX, startY, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(900);
}

function assertStableShrinkInvariants(before, after, withSignificance) {
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(before.rotated).toBe(false);
  expect(after.rotated).toBe(true);

  expect(before.overflowMaxPx).toBeLessThanOrEqual(2.5);
  expect(after.overflowMaxPx).toBeLessThanOrEqual(2.5);

  expect(after.svgBoxWidthPx).toBeLessThan(before.svgBoxWidthPx * 0.7);
  expect(after.xAxisSpan).toBeLessThan(before.xAxisSpan * 0.8);
  expect(Math.abs(after.yAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(3);
  expect(after.leftViewportExtensionPx).toBe(0);
  expect(after.xLabelLeadingInsetPx).toBe(0);
  expect(after.yAxisSvgX - before.yAxisSvgX).toBeCloseTo(after.xLabelLeadingInsetPx, 0);
  expect(Math.abs(after.plotHeightPx - before.plotHeightPx)).toBeLessThanOrEqual(3);
  expect(Math.abs(after.bottomViewportExtensionPx - before.bottomViewportExtensionPx)).toBeLessThanOrEqual(2);
  expect(after.appliedVerticalFrameReservePx).toBeGreaterThanOrEqual(
    after.significanceViewportExtensionPx + after.bottomViewportExtensionPx
  );

  if (withSignificance) {
    expect(before.significancePathCount).toBeGreaterThan(0);
    expect(after.significancePathCount).toBeGreaterThan(0);
    expect(before.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(after.significanceViewportExtensionPx).toBeGreaterThan(0);
  } else {
    expect(before.significancePathCount).toBe(0);
    expect(after.significancePathCount).toBe(0);
    expect(before.significanceViewportExtensionPx).toBe(0);
    expect(after.significanceViewportExtensionPx).toBe(0);
  }
}

async function runHorizontalShrinkScenario(page, withSignificance) {
  await loadStripExample(page);
  await setBoxLabelsFromList(page, [
    'Control baseline condition profile',
    'Treatment alpha condition profile',
    'Treatment beta condition profile'
  ]);
  await resizeBoxWidthOnly(page, 1200);
  if (withSignificance) {
    await ensureStatsAndSignificance(page);
  }
  const before = await page.evaluate(readBoxLayoutInvariantMetrics);
  await resizeBoxWidthOnly(page, 600);
  const after = await page.evaluate(readBoxLayoutInvariantMetrics);
  assertStableShrinkInvariants(before, after, withSignificance);
}

test.describe('Box horizontal shrink layout invariants', () => {
  test.setTimeout(140_000);

  test('example dataset stays undistorted and in-bounds after 50% shrink without significance bars', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await runHorizontalShrinkScenario(page, false);
    expect(issues.critical).toEqual([]);
  });

  test('example dataset stays undistorted and in-bounds after 50% shrink with significance bars', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await runHorizontalShrinkScenario(page, true);
    expect(issues.critical).toEqual([]);
  });

  test('long labels stay in bounds when horizontal drag triggers rotation', async ({ page }, testInfo) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await loadStripExample(page);
    await setBoxLabelsFromList(page, [
      'Control baseline profile',
      'Treatment alpha profile',
      'Treatment beta profile'
    ]);
    await resizeBoxWidthOnly(page, 800);
    const before = await page.evaluate(readBoxLayoutInvariantMetrics);
    await dragBoxWidthHandleBy(page, -250);
    const after = await page.evaluate(readBoxLayoutInvariantMetrics);

    await testInfo.attach('box-default-label-rotation-axis.metrics.json', {
      body: Buffer.from(JSON.stringify({ before, after }, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(before.rotated).toBe(false);
    expect(after.rotated).toBe(true);
    expect(Math.abs(after.xAxisY - before.xAxisY)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(after.plotHeightPx - before.plotHeightPx)).toBeLessThanOrEqual(1.5);
    expect(after.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(issues.critical).toEqual([]);
  });

  test('lengthening labels grows and then releases the bottom content reserve without shrinking the plot', async ({ page }) => {
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
    await loadStripExample(page);

    await setBoxLabelsFromList(page, ['A', 'B', 'C']);
    const shortLabels = await page.evaluate(readBoxLayoutInvariantMetrics);

    await setBoxLabelsFromList(page, [
      'Control baseline condition profile',
      'Treatment alpha condition profile',
      'Treatment beta condition profile'
    ]);
    const longLabels = await page.evaluate(readBoxLayoutInvariantMetrics);

    expect(shortLabels).not.toBeNull();
    expect(longLabels).not.toBeNull();
    expect(longLabels.rotated).toBe(true);
    expect(longLabels.bottomViewportExtensionPx).toBeGreaterThan(shortLabels.bottomViewportExtensionPx + 20);
    expect(Math.abs(longLabels.svgBoxHeightPx - shortLabels.svgBoxHeightPx)).toBeLessThanOrEqual(2);
    expect(Math.abs(longLabels.svgBoxWidthPx - shortLabels.svgBoxWidthPx)).toBeLessThanOrEqual(2);
    expect(Math.abs(longLabels.yAxisSpan - shortLabels.yAxisSpan)).toBeLessThanOrEqual(2);
    expect(Math.abs(longLabels.plotHeightPx - shortLabels.plotHeightPx)).toBeLessThanOrEqual(2);
    expect(longLabels.appliedVerticalFrameReservePx).toBeGreaterThanOrEqual(longLabels.bottomViewportExtensionPx);
    expect(longLabels.overflowMaxPx).toBeLessThanOrEqual(2.5);

    await setBoxLabelsFromList(page, ['A', 'B', 'C']);
    const shortenedAgain = await page.evaluate(readBoxLayoutInvariantMetrics);
    expect(Math.abs(shortenedAgain.svgBoxHeightPx - shortLabels.svgBoxHeightPx)).toBeLessThanOrEqual(2);
    expect(Math.abs(shortenedAgain.yAxisSpan - shortLabels.yAxisSpan)).toBeLessThanOrEqual(2);
    expect(Math.abs(shortenedAgain.plotHeightPx - shortLabels.plotHeightPx)).toBeLessThanOrEqual(2);
    expect(shortenedAgain.appliedVerticalFrameReservePx).toBeGreaterThanOrEqual(shortenedAgain.bottomViewportExtensionPx);
    expect(issues.critical).toEqual([]);
  });
});
