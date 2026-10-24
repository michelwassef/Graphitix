const path = require('path');
const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, confirmDataImportPrompt } = require('../helpers/workspaceDriver');

const LARGE_BOX_CSV = path.resolve(__dirname, '..', '..', '__tests__', 'fixtures', 'box', 'v1', 'test-box-large.csv');

test('large Box draws remain stoppable and retry completes under reduced motion', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.evaluate(() => {
    const probe = { last: performance.now(), maxGapMs: 0, ticks: 0 };
    window.__boxStopProbe = probe;
    window.__boxStopTimer = window.setInterval(() => {
      const current = performance.now();
      probe.maxGapMs = Math.max(probe.maxGapMs, current - probe.last);
      probe.last = current;
      probe.ticks += 1;
    }, 25);
  });
  await page.locator('#boxFile').setInputFiles(LARGE_BOX_CSV);
  await confirmDataImportPrompt(page);
  const overlay = page.locator('#boxGraphPanel .venn-loading-overlay');
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  const animation = await overlay.locator('.venn-loading-overlay__spinner').evaluate(node => {
    const style = getComputedStyle(node);
    return { duration: style.animationDuration, iterations: style.animationIterationCount };
  });
  expect(Number.parseFloat(animation.duration)).toBeLessThan(0.001);
  expect(animation.iterations).toBe('1');
  await page.evaluate(() => {
    window.__boxStopProbe.last = performance.now();
    window.__boxStopProbe.maxGapMs = 0;
    window.__boxStopProbe.ticks = 0;
  });
  await overlay.locator('[data-overlay-action="cancel"]').click({ timeout: 5_000 });
  await expect(overlay).toHaveAttribute('data-job-status', 'cancelled');
  await expect(overlay).toContainText('Drawing stopped');
  const stopProbe = await page.evaluate(() => ({ ...window.__boxStopProbe }));
  expect(stopProbe.maxGapMs).toBeLessThan(1000);

  await overlay.locator('[data-overlay-action="retry"]').click();
  await expect(overlay).toHaveAttribute('data-job-status', 'running');
  await expect(overlay.locator('.venn-loading-overlay__spinner')).toBeVisible();
  await expect(overlay).toContainText('Rendering box plot...');
  const retryJobId = await overlay.getAttribute('data-job-id');
  expect(retryJobId).toBeTruthy();
  await expect.poll(() => page.evaluate(id => window.Shared?.jobs?.get?.(id)?.status || null, retryJobId), {
    timeout: 90_000
  }).toBe('complete');
  await expect(overlay).toBeHidden({ timeout: 5_000 });
  const renderedPlot = await page.locator('#boxPlot svg').evaluateAll(svgs => svgs.some(svg => {
    const style = getComputedStyle(svg);
    const rect = svg.getBoundingClientRect();
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) > 0
      && rect.width > 100
      && rect.height > 100
      && svg.querySelectorAll('g[data-layer="box-axis"] line').length > 0;
  }));
  expect(renderedPlot).toBe(true);
  const probe = await page.evaluate(() => {
    window.clearInterval(window.__boxStopTimer);
    return window.__boxStopProbe;
  });
  expect(probe.ticks).toBeGreaterThan(2);
});
