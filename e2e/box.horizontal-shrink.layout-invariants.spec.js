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
    const leftOverflow = Math.max(0, svgBoxRect.left - rect.left);
    const rightOverflow = Math.max(0, rect.right - svgBoxRect.right);
    const topOverflow = Math.max(0, svgBoxRect.top - rect.top);
    const bottomOverflow = Math.max(0, rect.bottom - svgBoxRect.bottom);
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
    yAxisSpan: yAxis ? yAxis.dy : null,
    xAxisSpan: xAxis ? xAxis.dx : null,
    plotHeightPx: Number(graphGeometry?.plot?.heightPx) || null,
    plotWidthPx: Number(graphGeometry?.plot?.widthPx) || null,
    significancePathCount: svg.querySelectorAll('path.box-significance-annotation').length,
    significanceViewportExtensionPx: Number(state.significanceViewportExtensionPx) || 0,
    bottomViewportExtensionPx: Number(state.bottomViewportExtensionPx) || 0,
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
    if (!box || !hot || typeof hot.setDataAtCell !== 'function') {
      throw new Error('Box hot table is unavailable');
    }
    labels.forEach((label, index) => {
      hot.setDataAtCell(0, index, label, 'e2e-long-labels');
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
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 40_000 });

  const toggle = page.locator('#boxShowSignificance');
  await expect(toggle).toBeVisible({ timeout: 20_000 });
  if (!(await toggle.isChecked())) {
    await toggle.check();
  }
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation').length > 0
      && Number(window.Components?.box?.__getState?.()?.significanceViewportExtensionPx || 0) > 0,
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

async function calibrateLabelsForRotationOnHalfShrink(page) {
  const labelCandidates = [
    ['Control', 'Treatment A', 'Treatment B'],
    ['Control baseline', 'Treatment alpha', 'Treatment beta'],
    ['Control baseline profile', 'Treatment alpha profile', 'Treatment beta profile'],
    ['Control baseline condition', 'Treatment alpha condition', 'Treatment beta condition'],
    ['Control baseline condition profile', 'Treatment alpha condition profile', 'Treatment beta condition profile']
  ];

  for (const labels of labelCandidates) {
    await setBoxLabelsFromList(page, labels);
    const baseline = await page.evaluate(readBoxLayoutInvariantMetrics);
    if (!baseline || baseline.rotated) {
      continue;
    }
    const shrinkWidth = Math.round((Number(baseline.svgBoxWidthPx) || 700) * 0.5);
    await resizeBoxWidthOnly(page, shrinkWidth);
    const shrunk = await page.evaluate(readBoxLayoutInvariantMetrics);
    const rotatesOnShrink = !!(shrunk && shrunk.rotated);
    await resizeBoxWidthOnly(page, Math.round(Number(baseline.svgBoxWidthPx) || 700));
    const restored = await page.evaluate(readBoxLayoutInvariantMetrics);
    if (rotatesOnShrink && restored && !restored.rotated) {
      return {
        labels,
        baseline: restored,
        shrinkWidth
      };
    }
  }
  throw new Error('Unable to find a label configuration that rotates exactly after half-width shrink');
}

function assertStableShrinkInvariants(before, after, withSignificance) {
  expect(before).not.toBeNull();
  expect(after).not.toBeNull();
  expect(before.rotated).toBe(false);
  expect(after.rotated).toBe(true);

  expect(before.overflowMaxPx).toBeLessThanOrEqual(2.5);
  expect(after.overflowMaxPx).toBeLessThanOrEqual(2.5);

  expect(after.svgBoxWidthPx).toBeLessThan(before.svgBoxWidthPx * 0.56);
  expect(after.xAxisSpan).toBeLessThan(before.xAxisSpan * 0.8);
  expect(Math.abs(after.yAxisSpan - before.yAxisSpan)).toBeLessThanOrEqual(3);
  expect(Math.abs(after.xAxisY - before.xAxisY)).toBeLessThanOrEqual(6);
  expect(Math.abs(after.yAxisX - before.yAxisX)).toBeLessThanOrEqual(6);
  expect(Math.abs(after.plotHeightPx - before.plotHeightPx)).toBeLessThanOrEqual(3);
  expect(after.bottomViewportExtensionPx).toBeGreaterThanOrEqual(before.bottomViewportExtensionPx);

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
  if (withSignificance) {
    await ensureStatsAndSignificance(page);
  }
  const calibrated = await calibrateLabelsForRotationOnHalfShrink(page);
  const before = calibrated.baseline;
  await resizeBoxWidthOnly(page, calibrated.shrinkWidth);
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
});
