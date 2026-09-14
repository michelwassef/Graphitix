const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

async function activeTabId(page) {
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

test('Unsaved close prompt preserves Cancel and honors Discard', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true });
  const tabId = await activeTabId(page);

  await page.locator('#vennPage details').first().locator('summary').click();
  await page.locator('#nA').fill('12');
  await page.locator('#nB').fill('9');
  await page.locator('#nAB').fill('4');
  await page.locator('#useNumeric').click();
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"] .workspace-tab__close`).click();

  const prompt = page.locator('#unsavedPrompt');
  await expect(prompt).toBeVisible();
  await page.locator('#unsavedPromptCancel').click();
  await expect(prompt).toBeHidden();
  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`)).toBeVisible();
  expect(await activeTabId(page)).toBe(tabId);

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"] .workspace-tab__close`).click();
  await expect(prompt).toBeVisible();
  await page.locator('#unsavedPromptDiscard').click();
  await expect(prompt).toBeHidden();
  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`)).toHaveCount(0);
  expect(issues.critical).toEqual([]);
});
