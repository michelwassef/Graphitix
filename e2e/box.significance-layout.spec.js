const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readVerticalBoxLayoutMetrics() {
  const svg = document.querySelector('#boxPlot svg');
  if (!svg) {
    return null;
  }
  const axisLayer = svg.querySelector('g[data-layer="box-axis"]') || svg;
  const toNumber = value => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const lines = Array.from(axisLayer.querySelectorAll('line'))
    .map(line => {
      const x1 = toNumber(line.getAttribute('x1'));
      const y1 = toNumber(line.getAttribute('y1'));
      const x2 = toNumber(line.getAttribute('x2'));
      const y2 = toNumber(line.getAttribute('y2'));
      const rect = line.getBoundingClientRect();
      if (x1 == null || y1 == null || x2 == null || y2 == null) {
        return null;
      }
      return {
        node: line,
        x1,
        y1,
        x2,
        y2,
        dx: Math.abs(x2 - x1),
        dy: Math.abs(y2 - y1),
        rectTop: Number.isFinite(rect?.top) ? rect.top : null,
        rectBottom: Number.isFinite(rect?.bottom) ? rect.bottom : null,
        rectHeight: Number.isFinite(rect?.height) ? rect.height : null
      };
    })
    .filter(Boolean);
  const vertical = lines.filter(line => line.dx <= 0.25 && line.dy > 1);
  const horizontal = lines.filter(line => line.dy <= 0.25 && line.dx > 1);
  const xAxis = horizontal
    .slice()
    .sort((a, b) => {
      const ay = Number.isFinite(a.rectBottom) ? a.rectBottom : a.y1;
      const by = Number.isFinite(b.rectBottom) ? b.rectBottom : b.y1;
      return by - ay || b.dx - a.dx;
    })[0] || null;
  const minVerticalX = vertical.length
    ? Math.min(...vertical.map(line => Math.min(line.x1, line.x2)))
    : null;
  const yAxisLeftCandidates = Number.isFinite(minVerticalX)
    ? vertical.filter(line => Math.min(Math.abs(line.x1 - minVerticalX), Math.abs(line.x2 - minVerticalX)) <= 1.5)
    : [];
  const yAxis = (yAxisLeftCandidates.length ? yAxisLeftCandidates : vertical)
    .slice()
    .sort((a, b) => b.dy - a.dy || a.x1 - b.x1)[0] || null;
  const lineCenterY = line => {
    const top = Number(line?.rectTop);
    const bottom = Number(line?.rectBottom);
    if (Number.isFinite(top) && Number.isFinite(bottom)) {
      return (top + bottom) / 2;
    }
    return null;
  };
  const lineSpanY = line => {
    const height = Number(line?.rectHeight);
    if (Number.isFinite(height) && height > 0) {
      return height;
    }
    return line ? Math.abs(line.y2 - line.y1) : null;
  };
  const dataBodies = Array.from(svg.querySelectorAll('[data-box-shape="body"]'));
  const dataBottomY = dataBodies.length
    ? dataBodies.reduce((maxY, node) => {
        const rect = node.getBoundingClientRect();
        const bottom = Number(rect?.bottom);
        return Number.isFinite(bottom) ? Math.max(maxY, bottom) : maxY;
      }, -Infinity)
    : null;
  const plotRoot = document.getElementById('boxPlot');
  const zoomViewport = document.querySelector('#boxGraphPanel .resizer-zoom-viewport');
  const bottomTray = document.querySelector('#boxGraphPanel .resizer-bottom-tray');
  const exportControls = document.getElementById('boxExportControls');
  const svgBox = document.querySelector('#boxGraphPanel .svgbox');
  const svgBoxRect = svgBox ? svgBox.getBoundingClientRect() : null;
  const aspectRatioMeta = svgBox && svgBox.dataset
    ? Number(svgBox.dataset.resizerAspectRatio)
    : NaN;
  const aspectLockMeta = svgBox && svgBox.dataset
    ? svgBox.dataset.resizerAspectLocked === 'true'
    : null;
  const svgRect = svg.getBoundingClientRect();
  const bottomTrayRect = bottomTray ? bottomTray.getBoundingClientRect() : null;
  const exportControlsRect = exportControls ? exportControls.getBoundingClientRect() : null;
  const controlTopCandidates = [
    Number(bottomTrayRect?.top),
    Number(exportControlsRect?.top)
  ].filter(value => Number.isFinite(value));
  const controlsTopPx = controlTopCandidates.length ? Math.min(...controlTopCandidates) : null;
  const controlsOverlapPx = Number.isFinite(controlsTopPx)
    ? Math.max(0, Number(svgRect.bottom) - controlsTopPx)
    : null;
  const plotOverflow = plotRoot ? window.getComputedStyle(plotRoot).overflow : null;
  const zoomViewportOverflow = zoomViewport ? window.getComputedStyle(zoomViewport).overflow : null;
  return {
    yAxisSpan: yAxis ? lineSpanY(yAxis) : null,
    xAxisY: xAxis ? lineCenterY(xAxis) : null,
    dataBottomY: Number.isFinite(dataBottomY) ? dataBottomY : null,
    significancePathCount: svg.querySelectorAll('path.box-significance-annotation[data-sig-orientation="vertical"]').length,
    svgBottomPx: Number.isFinite(Number(svgRect.bottom)) ? Number(svgRect.bottom) : null,
    controlsTopPx,
    controlsOverlapPx,
    plotOverflow,
    zoomViewportOverflow,
    svgBoxWidthPx: Number.isFinite(Number(svgBoxRect?.width)) ? Number(svgBoxRect.width) : null,
    svgBoxHeightPx: Number.isFinite(Number(svgBoxRect?.height)) ? Number(svgBoxRect.height) : null,
    aspectRatioMeta: Number.isFinite(aspectRatioMeta) ? aspectRatioMeta : null,
    aspectLockMeta
  };
}

async function dragBoxVerticalHandle(page, deltaY) {
  const handle = page.locator('#boxGraphPanel .svgbox .resizer-horizontal');
  await expect(handle).toBeVisible();
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error('Unable to resolve horizontal resizer handle box');
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + deltaY, { steps: 12 });
  await page.mouse.up();
}

test('box significance bars keep plot height while shifting plot downward', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.locator('#boxLoadExample').click();
  await page.waitForTimeout(700);
  await page.locator('#boxGraphType').selectOption('box');
  await page.waitForTimeout(350);

  const computeButton = page.locator('#boxComputeStats');
  await expect(computeButton).toBeEnabled({ timeout: 20_000 });
  await computeButton.click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });

  const significanceToggle = page.locator('#boxShowSignificance');
  await expect(significanceToggle).toBeEnabled();
  const lockRatioToggle = page.locator('#boxGraphPanel .resizer-aspect-checkbox');
  await expect(lockRatioToggle).toBeVisible();
  if (!(await lockRatioToggle.isChecked())) {
    await lockRatioToggle.check();
    await page.waitForTimeout(250);
  }
  if (await significanceToggle.isChecked()) {
    await significanceToggle.uncheck();
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => document.querySelectorAll('#boxPlot .box-significance-annotation').length === 0);

  const before = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(before).not.toBeNull();
  expect(before.yAxisSpan).not.toBeNull();
  expect(before.xAxisY).not.toBeNull();
  expect(before.dataBottomY).not.toBeNull();
  expect(before.controlsOverlapPx).not.toBeNull();
  expect(before.aspectLockMeta).toBe(true);
  expect(before.svgBoxWidthPx).not.toBeNull();
  expect(before.svgBoxHeightPx).not.toBeNull();
  expect(before.aspectRatioMeta).not.toBeNull();
  expect(before.controlsOverlapPx).toBeLessThanOrEqual(1.5);

  await dragBoxVerticalHandle(page, 70);
  await page.waitForTimeout(350);
  const afterManualResize = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(afterManualResize).not.toBeNull();
  expect(afterManualResize.svgBoxHeightPx).not.toBeNull();
  expect(afterManualResize.svgBoxWidthPx).not.toBeNull();
  expect(afterManualResize.aspectRatioMeta).not.toBeNull();
  expect(afterManualResize.aspectLockMeta).toBe(true);
  expect(afterManualResize.svgBoxHeightPx).toBeGreaterThan(before.svgBoxHeightPx + 12);
  expect(afterManualResize.svgBoxWidthPx).toBeGreaterThan(before.svgBoxWidthPx + 12);
  expect(Math.abs(afterManualResize.aspectRatioMeta - before.aspectRatioMeta)).toBeLessThanOrEqual(0.03);

  await significanceToggle.check();
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation[data-sig-orientation="vertical"]').length > 0
  );
  await page.waitForTimeout(700);

  const after = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(after).not.toBeNull();
  expect(after.yAxisSpan).not.toBeNull();
  expect(after.xAxisY).not.toBeNull();
  expect(after.dataBottomY).not.toBeNull();
  expect(after.controlsOverlapPx).not.toBeNull();
  expect(after.significancePathCount).toBeGreaterThan(0);
  expect(after.aspectLockMeta).toBe(true);
  expect(after.svgBoxWidthPx).not.toBeNull();
  expect(after.svgBoxHeightPx).not.toBeNull();
  expect(after.yAxisSpan).toBeGreaterThanOrEqual(before.yAxisSpan * 0.8);
  expect(after.xAxisY).toBeGreaterThan(before.xAxisY + 2);
  expect(after.dataBottomY).toBeGreaterThan(before.dataBottomY + 2);
  expect(after.svgBoxHeightPx).toBeGreaterThan(afterManualResize.svgBoxHeightPx + 2);
  expect(after.controlsOverlapPx).toBeLessThanOrEqual(1.5);

  await dragBoxVerticalHandle(page, 60);
  await page.waitForTimeout(350);
  const afterSignificanceManualResize = await page.evaluate(readVerticalBoxLayoutMetrics);
  expect(afterSignificanceManualResize).not.toBeNull();
  expect(afterSignificanceManualResize.aspectLockMeta).toBe(true);
  expect(afterSignificanceManualResize.svgBoxHeightPx).toBeGreaterThan(after.svgBoxHeightPx + 8);
  expect(afterSignificanceManualResize.svgBoxWidthPx).toBeGreaterThan(after.svgBoxWidthPx + 6);
  expect(Math.abs(afterSignificanceManualResize.aspectRatioMeta - after.aspectRatioMeta)).toBeLessThanOrEqual(0.03);

  expect(issues.critical).toEqual([]);
});
