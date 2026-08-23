const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function expectAnnotationInsideSvg(annotation){
  const bounds = await annotation.evaluate(node => {
    const svg = node.ownerSVGElement;
    const outer = svg.getBoundingClientRect();
    const inner = node.getBoundingClientRect();
    return {
      left: inner.left - outer.left,
      top: inner.top - outer.top,
      right: outer.right - inner.right,
      bottom: outer.bottom - inner.bottom
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(-1.5);
  expect(bounds.top).toBeGreaterThanOrEqual(-1.5);
  expect(bounds.right).toBeGreaterThanOrEqual(-1.5);
  expect(bounds.bottom).toBeGreaterThanOrEqual(-1.5);
}

async function dragAnnotation(page, annotation, deltaX, deltaY){
  await annotation.evaluate(async (node, delta) => {
    const rect = node.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const pointer = (type, x, y) => new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: 73,
      button: 0,
      clientX: x,
      clientY: y
    });
    node.dispatchEvent(pointer('pointerdown', startX, startY));
    window.dispatchEvent(pointer('pointermove', startX + delta.x, startY + delta.y));
    window.dispatchEvent(pointer('pointerup', startX + delta.x, startY + delta.y));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, { x: deltaX, y: deltaY });
}

async function setLineLegend(page, checked){
  await page.evaluate(value => {
    const control = document.getElementById('lineShowLegend');
    control.checked = value;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }, checked);
}

test('Line plot statistics stay multiline, clear of the example lines, and bounded through layout and font edits', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'lineLoadExample');

  await expect(page.locator('#lineComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#lineComputeStats').click();
  await expect(page.locator('#lineStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await page.locator('#lineShowPlotStats').check();

  let annotation = page.locator('#lineSvg [data-plot-stats-annotation="1"]');
  await expect(annotation).toBeVisible({ timeout: 20_000 });
  expect(await annotation.locator(':scope > tspan[data-stats-line-start="1"]').count()).toBeGreaterThan(1);
  await expectAnnotationInsideSvg(annotation);

  const pointsInsideStats = await annotation.evaluate(node => {
    const box = node.getBoundingClientRect();
    const paths = Array.from(node.ownerSVGElement.querySelectorAll('path[data-series]:not([data-line-overlay])'));
    let hits = 0;
    paths.forEach(path => {
      const length = path.getTotalLength?.() || 0;
      const matrix = path.getScreenCTM?.();
      if(!length || !matrix){ return; }
      for(let step = 0; step <= 80; step += 1){
        const point = path.getPointAtLength(length * step / 80).matrixTransform(matrix);
        if(point.x >= box.left - 2 && point.x <= box.right + 2
          && point.y >= box.top - 2 && point.y <= box.bottom + 2){
          hits += 1;
        }
      }
    });
    return hits;
  });
  expect(pointsInsideStats).toBe(0);

  await setLineLegend(page, false);
  annotation = page.locator('#lineSvg [data-plot-stats-annotation="1"]');
  await expect(annotation).toBeVisible({ timeout: 20_000 });
  await expectAnnotationInsideSvg(annotation);
  await setLineLegend(page, true);
  annotation = page.locator('#lineSvg [data-plot-stats-annotation="1"]');
  await expect(annotation).toBeVisible({ timeout: 20_000 });
  await expectAnnotationInsideSvg(annotation);

  await dragAnnotation(page, annotation, 5000, 5000);
  await expectAnnotationInsideSvg(annotation);
  await dragAnnotation(page, annotation, -5000, -5000);
  await expectAnnotationInsideSvg(annotation);

  await annotation.click({ force: true });
  const panel = page.locator('.font-controls-panel[data-open="1"]');
  await expect(panel).toBeVisible();
  const size = panel.locator('input[aria-label="Font size"]');
  await size.fill('18');
  await size.dispatchEvent('change');
  await panel.locator('button[aria-label="Toggle bold"]').click();

  annotation = page.locator('#lineSvg [data-plot-stats-annotation="1"]');
  await expect(annotation).toHaveAttribute('font-weight', /^(bold|700)$/);
  expect(await annotation.locator(':scope > tspan[data-stats-line-start="1"]').count()).toBeGreaterThan(1);
  await expectAnnotationInsideSvg(annotation);
  expect(issues.critical).toEqual([]);
});

test('Scatter plot statistics are right-aligned and cannot cross the SVG edge', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');

  await expect(page.locator('#scatterComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#scatterComputeStats').click();
  await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await page.locator('#scatterShowPlotStats').check();

  const annotation = page.locator('#scatterSvg [data-plot-stats-annotation="1"]');
  await expect(annotation).toBeVisible({ timeout: 20_000 });
  await expect(annotation).toHaveAttribute('text-anchor', 'end');
  await expectAnnotationInsideSvg(annotation);
  await dragAnnotation(page, annotation, 5000, -5000);
  await expectAnnotationInsideSvg(annotation);
  expect(issues.critical).toEqual([]);
});
