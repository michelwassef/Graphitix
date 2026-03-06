const { test, expect } = require('@playwright/test');

test('workspace loads and opens a graph tab from welcome screen', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const card = page.locator('#graphSelectionGrid [data-graph-type="scatter"]');
  await expect(card).toBeVisible();
  await card.click();

  await expect(page.locator('#scatterPage')).toBeVisible();
  await expect(page.locator('#saveScatter')).toBeVisible();
});
