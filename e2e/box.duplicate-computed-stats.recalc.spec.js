const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function computeStats(page) {
  await expect(page.locator('#boxComputeStats')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#boxComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
}

async function duplicateBoxWithReuse(page) {
  await page.evaluate(async () => {
    const tabs = window.Main?.tabs;
    const maybeAdd = tabs?.handleAddTabClick?.();
    if (maybeAdd && typeof maybeAdd.then === 'function') await maybeAdd;
    const maybeSelect = tabs?.handleGraphSelection?.('box', { reason: 'e2e-box-duplicate-computed-stats-reuse' });
    if (maybeSelect && typeof maybeSelect.then === 'function') await maybeSelect;
  });
  await expect(page.locator('#duplicatePrompt:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await page.locator('#duplicateReuse').click({ force: true });
  await page.waitForSelector('#boxPage:not([hidden])', { timeout: 20_000 });
}

test('box duplicate tab with precomputed stats can recalculate without annotation crash', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await expect(page.locator('#boxLoadExample')).toBeVisible({ timeout: 20_000 });
  await page.locator('#boxLoadExample').click();
  await computeStats(page);

  await duplicateBoxWithReuse(page);

  await computeStats(page);

  expect(issues.critical).toEqual([]);
});
