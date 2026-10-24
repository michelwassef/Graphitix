const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');

test('Scatter copies the focused cell when a point row is selected for labeling', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(page.url()).origin
  });

  await page.evaluate(async () => {
    const scatter = window.Components?.scatter;
    const hot = scatter?.__getActiveHot?.();
    if (!hot) throw new Error('Scatter table is unavailable');
    hot.loadData([
      ['Labels', 'X', 'Y'],
      ['Sample A', '12.45', '82.57'],
      ['Sample B', '20', '130']
    ]);
    await scatter.draw({ force: true, reason: 'e2e-labelled-cell-copy' });
  });

  const row = page.locator('#scatterHot .ag-center-cols-container .ag-row').filter({ hasText: 'Sample A' }).first();
  await expect(row).toBeVisible();
  await row.locator('.ag-checkbox-input-wrapper').click();
  await expect(row).toHaveClass(/ag-row-selected/);

  const cell = row.locator('.ag-cell[col-id="c1"]');
  await expect(cell).toHaveText('12.45');
  await cell.click();
  await page.keyboard.press('Control+C');

  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('12.45');
  await expect(row).toHaveClass(/ag-row-selected/);
});
