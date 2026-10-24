const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');

test('Box one-sample Null value follows Comparison scope and edits its session', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );

  const scope = page.locator('#boxStatsScope');
  await expect(scope).toBeVisible();
  await scope.selectOption('oneSample');

  const nullValue = page.getByLabel('Null value');
  await expect(nullValue).toBeVisible();
  const rowOrder = await page.locator('#statsControls .box-stats-options__column--primary').evaluate(column => {
    const rows = Array.from(column.querySelectorAll('.box-stats-options__row'));
    const labelText = row => row.querySelector(':scope > label')?.textContent?.trim() || '';
    const scopeIndex = rows.findIndex(row => labelText(row) === 'Comparison scope');
    const nullIndex = rows.findIndex(row => labelText(row) === 'Null value');
    return { scopeIndex, nullIndex };
  });
  expect(rowOrder.nullIndex).toBe(rowOrder.scopeIndex + 1);

  await nullValue.fill('2.5');
  await expect.poll(() => page.evaluate(() => window.Components.box.__getState().statsOneSampleValue)).toBe(2.5);

  await scope.selectOption('all');
  await expect(nullValue).toHaveCount(0);
});
