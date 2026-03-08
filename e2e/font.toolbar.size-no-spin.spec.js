const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

test('font toolbar size control has no native spin buttons', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'lineLoadExample');

  await page.waitForFunction(
    () => document.querySelectorAll('#linePlot svg text[data-font-editable="1"]').length > 0,
    { timeout: 20_000 }
  );

  const fontTarget = page.locator('#linePlot svg text[data-font-editable="1"]').first();
  await fontTarget.click({ force: true });

  const panel = page.locator('.font-controls-panel');
  await expect(panel).toBeVisible();

  const sizeInput = panel.locator('input.font-controls-panel__input--size').first();
  await expect(sizeInput).toBeVisible();
  await expect(sizeInput).toHaveAttribute('type', 'text');
  await expect(panel.locator('input.font-controls-panel__input--size[type="number"]')).toHaveCount(0);

  expect(issues.critical).toEqual([]);
});
