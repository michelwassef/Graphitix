const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

function readInitialBottomReserveMetrics() {
  const svg = document.querySelector('#boxPlot svg');
  const state = window.Components?.box?.__getState?.() || null;
  if (!svg || !state) {
    return null;
  }
  const axisLayer = svg.querySelector('g[data-layer="box-axis"]') || svg;
  const lines = Array.from(axisLayer.querySelectorAll('line'))
    .map(line => ({
      x1: Number(line.getAttribute('x1')),
      y1: Number(line.getAttribute('y1')),
      x2: Number(line.getAttribute('x2')),
      y2: Number(line.getAttribute('y2'))
    }))
    .filter(line => [line.x1, line.y1, line.x2, line.y2].every(Number.isFinite));
  const horizontal = lines.filter(line => Math.abs(line.y1 - line.y2) <= 0.25 && Math.abs(line.x2 - line.x1) > 1);
  const xAxis = horizontal
    .slice()
    .sort((a, b) => Math.abs(b.x2 - b.x1) - Math.abs(a.x2 - a.x1) || b.y1 - a.y1)[0] || null;
  const viewBox = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const viewBoxHeight = viewBox.length === 4 ? viewBox[3] : NaN;
  const baseHeight = Number(svg.getAttribute('data-box-base-height'));
  const axisY = xAxis ? xAxis.y1 : NaN;
  return {
    preserveAspectRatio: svg.getAttribute('preserveAspectRatio') || null,
    graphType: String(document.getElementById('boxGraphType')?.value || ''),
    bottomExtensionPx: Number(state.bottomViewportExtensionPx) || 0,
    significanceExtensionPx: Number(state.significanceViewportExtensionPx) || 0,
    showSignificanceBars: !!state.showSignificanceBars,
    axisToViewBottomPx: Number.isFinite(viewBoxHeight) && Number.isFinite(axisY) ? (viewBoxHeight - axisY) : NaN,
    axisToBaseBottomPx: Number.isFinite(baseHeight) && Number.isFinite(axisY) ? (baseHeight - axisY) : NaN
  };
}

test('box initial strip draw preserves non-significance bottom reserve', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await expect(page.locator('#boxLoadExample')).toBeVisible({ timeout: 20_000 });

  await page.locator('#boxLoadExample').click();
  await page.locator('#boxGraphType').selectOption('strip');
  await page.waitForFunction(
    () => !!document.querySelector('#boxPlot svg')
      && !!window.Components?.box?.__getState?.()
      && Number(window.Components.box.__getState().bottomViewportExtensionPx) > 0,
    null,
    { timeout: 25_000 }
  );
  await page.waitForTimeout(900);

  const metrics = await page.evaluate(readInitialBottomReserveMetrics);
  expect(metrics).not.toBeNull();
  expect(metrics.graphType).toBe('strip');
  expect(metrics.showSignificanceBars).toBe(false);
  expect(metrics.significanceExtensionPx).toBe(0);
  expect(metrics.bottomExtensionPx).toBeGreaterThan(0);
  expect(metrics.preserveAspectRatio).toBe('xMidYMid meet');
  expect(metrics.axisToViewBottomPx).toBeGreaterThan(metrics.axisToBaseBottomPx + 6);

  expect(issues.critical).toEqual([]);
});
