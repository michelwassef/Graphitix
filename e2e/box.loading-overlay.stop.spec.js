const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  confirmDataImportPrompt
} = require('./helpers/workspaceHarness');

const LARGE_BOX_CSV = path.resolve(__dirname, '..', '__tests__', 'test-box-large.csv');

test('large Box draws remain stoppable and retry restores progress', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
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
  await page.evaluate(() => {
    window.__boxStopProbe.last = performance.now();
    window.__boxStopProbe.maxGapMs = 0;
    window.__boxStopProbe.ticks = 0;
  });
  const stopStartedAt = Date.now();
  await overlay.locator('[data-overlay-action="cancel"]').click({ timeout: 5_000 });
  await expect(overlay).toHaveAttribute('data-job-status', 'cancelled');
  await expect(overlay).toContainText('Drawing stopped');
  expect(Date.now() - stopStartedAt).toBeLessThan(1000);

  await overlay.locator('[data-overlay-action="retry"]').click();
  await expect(overlay).toHaveAttribute('data-job-status', 'running');
  await expect(overlay.locator('.venn-loading-overlay__spinner')).toBeVisible();
  await expect(overlay).toContainText('Rendering box plot...');
  await overlay.locator('[data-overlay-action="cancel"]').click({ timeout: 5_000 });
  await expect(overlay).toHaveAttribute('data-job-status', 'cancelled');
  await expect(overlay).toContainText('Drawing stopped');
  const probe = await page.evaluate(() => {
    window.clearInterval(window.__boxStopTimer);
    return window.__boxStopProbe;
  });
  expect(probe.ticks).toBeGreaterThan(2);
});
