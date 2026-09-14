const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { activateTab, activateToolbarSection } = require('../helpers/uiDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

async function activeTabId(page) {
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

async function getTabConfig(page, tabId) {
  return page.evaluate(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return tab?.payload?.config || null;
  }, tabId);
}

test('Match Styles copies a selected style group to a same-type target tab', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });
  const sourceTabId = await activeTabId(page);
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: false, loadExample: true });
  const targetTabId = await activeTabId(page);
  expect(targetTabId).not.toBe(sourceTabId);

  await activateTab(page, sourceTabId, 'scatter', { requireMountedRoot: true });
  await activateToolbarSection(page, 'scatter', 'Format');
  await page.locator('#scatterPage:not([hidden]) [data-plot-point="1"]').last().click();
  const scope = page.locator('.scatter-point-controls select').first();
  await scope.selectOption('global');
  await expect(scope).toHaveValue('global');
  await page.getByRole('button', { name: 'Fill/Shape' }).click();
  const picker = page.locator('.shared-color-picker');
  await expect(picker).toBeVisible();
  const hex = picker.locator('.shared-color-picker__hex-input');
  await hex.fill('#e74c3c');
  await hex.press('Enter');
  await page.keyboard.press('Escape');
  await page.waitForFunction(({ id, expected }) => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return String(tab?.payload?.config?.fill || '').toLowerCase() === expected;
  }, { id: sourceTabId, expected: '#e74c3c' });

  await activateToolbarSection(page, 'scatter', 'General');
  await page.getByRole('button', { name: 'Match styles across open graphs' }).click();
  const prompt = page.locator('#styleSyncPrompt');
  await expect(prompt).toBeVisible();
  await expect(page.locator('#styleSyncSource')).toHaveValue(sourceTabId);
  const target = page.locator(`#styleSyncTargets input[value="${targetTabId}"]`);
  await expect(target).toBeVisible();
  await target.check();
  await page.locator('#styleSyncPrompt [data-style-sync-apply]').click();

  await expect(prompt).toBeHidden();
  await expect(page.locator('#styleSyncStatus')).toContainText('Updated 1 tab');
  await page.waitForFunction(({ id, expected }) => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return String(tab?.payload?.config?.fill || '').toLowerCase() === expected;
  }, { id: targetTabId, expected: '#e74c3c' });
  expect(String((await getTabConfig(page, targetTabId))?.fill || '').toLowerCase()).toBe('#e74c3c');
  expect(issues.critical).toEqual([]);
});
