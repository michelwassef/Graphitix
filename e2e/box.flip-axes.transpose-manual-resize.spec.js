const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readFlipTransposeMetrics() {
  const svg = document.querySelector('#boxPlot svg');
  const svgBox = document.querySelector('#boxGraphPanel .svgbox');
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
  await page.waitForTimeout(1_000);
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

    expect(Math.abs(after.svgBoxWidthPx - before.svgBoxHeightPx)).toBeLessThanOrEqual(24);
    expect(after.svgBoxHeightPx).toBeGreaterThanOrEqual(before.svgBoxWidthPx - 2);
    expect(after.svgBoxHeightPx).toBeLessThanOrEqual(before.svgBoxWidthPx + 48);
    expect(Math.abs(after.xAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(60);
    expect(Math.abs(after.yAxisSpan - before.xAxisSpan)).toBeLessThanOrEqual(40);

    await setFlipAxes(page, false);
    const restored = await page.evaluate(readFlipTransposeMetrics);
    expect(restored).not.toBeNull();
    expect(restored.flipAxes).toBe(false);
    expect(restored.overflowMaxPx).toBeLessThanOrEqual(2.5);
    expect(restored.bottomViewportExtensionPx + restored.significanceViewportExtensionPx).toBeGreaterThan(0);
    expect(restored.leftViewportExtensionPx + restored.rightViewportExtensionPx).toBe(0);
    expect(Math.abs(restored.svgBoxWidthPx - before.svgBoxWidthPx)).toBeLessThanOrEqual(4);
    expect(Math.abs(restored.svgBoxHeightPx - before.svgBoxHeightPx)).toBeLessThanOrEqual(12);
    expect(Math.abs(restored.xAxisSpan - before.xAxisSpan)).toBeLessThanOrEqual(18);
    expect(Math.abs(restored.yAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(18);

    expect(issues.critical).toEqual([]);
  });
});
