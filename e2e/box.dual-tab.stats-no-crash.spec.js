const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function openBoxTab(page, { first = false } = {}) {
  if (first) {
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  } else {
    await page.evaluate(async () => {
      const tabs = window.Main?.tabs;
      if (tabs && typeof tabs.handleAddTabClick === 'function') {
        const maybe = tabs.handleAddTabClick();
        if (maybe && typeof maybe.then === 'function') await maybe;
      }
      if (tabs && typeof tabs.handleGraphSelection === 'function') {
        const maybe = tabs.handleGraphSelection('box', { reason: 'e2e-box-dual-tab-stats' });
        if (maybe && typeof maybe.then === 'function') await maybe;
      }
      const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
      const duplicateEmpty = document.querySelector('#duplicateEmpty');
      if (prompt && duplicateEmpty && !duplicateEmpty.disabled) {
        duplicateEmpty.click();
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    });
    const visibleCard = page.locator('#graphSelectionGrid [data-graph-type="box"]').first();
    if (await visibleCard.isVisible().catch(() => false)) {
      await visibleCard.click({ force: true });
    }
    await page.waitForSelector('#boxPage:not([hidden])', { timeout: 20_000 });
  }
  await page.waitForFunction(() => !!window.Components?.box?.getPayload, null, { timeout: 20_000 });
  await expect(page.locator('#boxLoadExample')).toBeVisible({ timeout: 20_000 });
  await page.locator('#boxLoadExample').click();
  await expect(page.locator('#boxComputeStats')).toBeEnabled({ timeout: 20_000 });
}

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ force: true });
  await page.waitForTimeout(350);
}

async function computeStats(page) {
  await expect(page.locator('#boxComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
}

test('box stats compute does not crash when run across two box tabs', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const beforeFirst = new Set(await getWorkspaceTabIds(page));
  await openBoxTab(page, { first: true });
  const firstId = (await getWorkspaceTabIds(page)).find(id => !beforeFirst.has(id));
  expect(firstId).toBeTruthy();
  await computeStats(page);

  const beforeSecond = new Set(await getWorkspaceTabIds(page));
  await openBoxTab(page, { first: false });
  const secondId = (await getWorkspaceTabIds(page)).find(id => !beforeSecond.has(id));
  expect(secondId).toBeTruthy();
  expect(secondId).not.toBe(firstId);
  await computeStats(page);

  await activateTabById(page, firstId);
  await computeStats(page);

  await activateTabById(page, secondId);
  await computeStats(page);

  expect(issues.critical).toEqual([]);
});
