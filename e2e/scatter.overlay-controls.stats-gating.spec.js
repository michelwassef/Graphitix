const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function loadScatterExample(page) {
  await expect(page.locator('#scatterLoadExample')).toBeVisible({ timeout: 20_000 });
  await page.locator('#scatterLoadExample').click();
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.();
    const data = hot?.getData?.() || [];
    return Array.isArray(data) && data.length > 2;
  }, null, { timeout: 20_000 });
}

// Trend line / stats-on-plot checkboxes must be disabled until statistics are calculated,
// matching line.js. After calculation they must become enabled.
test('scatter trend line and stats-on-plot are disabled until statistics are calculated', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await loadScatterExample(page);
  await page.waitForTimeout(600);

  const showLine = page.locator('#scatterPage:not([hidden]) #scatterShowLine');
  const showPlotStats = page.locator('#scatterPage:not([hidden]) #scatterShowPlotStats');

  // Before calculating statistics: both must be disabled (greyed out, unclickable).
  await expect(showLine, 'Show trend line must be disabled before stats are calculated').toBeDisabled();
  await expect(showPlotStats, 'Show stats on plot must be disabled before stats are calculated').toBeDisabled();

  // Calculate statistics.
  await expect(page.locator('#scatterComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#scatterComputeStats').click();
  await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await page.waitForTimeout(400);

  // After calculating statistics: both must be enabled.
  await expect(showLine, 'Show trend line must be enabled after stats are calculated').toBeEnabled();
  await expect(showPlotStats, 'Show stats on plot must be enabled after stats are calculated').toBeEnabled();

  expect(issues.critical).toEqual([]);
});
