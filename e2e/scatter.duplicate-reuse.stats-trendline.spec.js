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

async function computeScatterStatsWithTrendline(page) {
  // The trend line checkbox is disabled until statistics are calculated (matches line.js),
  // so compute stats first, then enable the trend line.
  await expect(page.locator('#scatterComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#scatterComputeStats').click();
  await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await expect(page.locator('#scatterShowLine')).toBeEnabled({ timeout: 20_000 });
  if (!(await page.locator('#scatterShowLine').isChecked())) {
    await page.locator('#scatterShowLine').check();
  }
}

async function getScatterDataRowCount(page) {
  return page.evaluate(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.();
    const data = hot?.getData?.() || [];
    if (!Array.isArray(data) || !data.length) return 0;
    const startRow = 1;
    let count = 0;
    for (let r = startRow; r < data.length; r += 1) {
      const row = Array.isArray(data[r]) ? data[r] : [];
      const hasValue = row.some(cell => {
        if (cell == null || cell === '') return false;
        const num = Number(cell);
        return Number.isFinite(num) || String(cell).trim().length > 0;
      });
      if (hasValue) count += 1;
    }
    return count;
  });
}

test('scatter duplicate reuse keeps data, trendline state, and stats-ready state', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await loadScatterExample(page);
  await computeScatterStatsWithTrendline(page);
  const sourceRows = await getScatterDataRowCount(page);
  expect(sourceRows).toBeGreaterThan(0);

  await page.locator('#addWorkspaceTab').click();
  await page.locator('#graphSelectionGrid [data-graph-type="scatter"]').first().click({ force: true });
  await expect(page.locator('#duplicatePrompt:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await page.locator('#duplicateReuse').click();
  await page.waitForSelector('#scatterPage:not([hidden])', { timeout: 20_000 });

  await expect(page.locator('#scatterShowLine')).toBeChecked({ timeout: 20_000 });
  const duplicatedRows = await getScatterDataRowCount(page);
  expect(duplicatedRows).toBeGreaterThan(0);
  await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 20_000 });

  expect(issues.critical).toEqual([]);
});
