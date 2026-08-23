const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('empty Scatter graph shows the shared input-table notice', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(
    page,
    { type: 'scatter', pageId: 'scatterPage' },
    { first: true }
  );

  const plot = page.locator('#scatterPage:not([hidden]) #scatterPlot');
  await expect(plot).toContainText('Add data to the input table to generate a plot.');
  await expect(plot.locator('i')).toHaveCount(1);
});
