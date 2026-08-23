const { test, expect } = require('@playwright/test');

test('complete welcome page is present before application bootstrap', async ({ page }) => {
  await page.route('**/js/main.js', route => route.abort());
  await page.goto('/index.html');

  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await expect(page.locator('#welcomeScreen')).toHaveAttribute('data-welcome-presented', 'true');
  await expect(page.locator('#welcomeScreen')).not.toHaveAttribute('data-welcome-ready', 'true');
  await expect(page.locator('#graphSelectionGrid .graph-card')).toHaveCount(11);
  await expect(page.locator('#welcomePopularExamplesList .welcome-example-card')).toHaveCount(11);
  await expect(page.locator('#welcomePopularExamplesList svg[data-inline-ready="true"]')).toHaveCount(11);
});
