const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

for (const mode of ['2d', '3d', 'density']) {
  test(`Scatter point toolbar shows the rendered color for unique example labels in ${mode}`, async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true });
    const scheme = page.locator('#scatterPage select[data-color-scheme-select="1"]');
    await scheme.selectOption('grayscale');
    await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true });
    await scheme.selectOption('normal');
    await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true });
    if (mode === '3d') {
      await page.locator('#scatterViewMode').selectOption('3d');
      await page.locator('#scatterLoadExample').click();
    }
    if (mode === 'density') await page.locator('#scatterColorMode').selectOption('density');
    await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true });
    const point = page.locator('#scatterPlot [data-scatter-point-interaction]').nth(mode === '3d' ? 7 : 147);
    await expect(point).toBeVisible();
    const fill = await point.getAttribute('fill');
    await point.dispatchEvent('click');
    const chip = page.locator('.scatter-point-controls .shared-fill-style-chip');
    await expect(chip).toBeVisible();
    await expect.poll(async () => (await chip.getAttribute('data-color')).toLowerCase()).toBe(fill.toLowerCase());
  });
}

test('Scatter point color follows scope changes and preserves individual color edits', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await page.evaluate(() => {
    const scatter = window.Components.scatter;
    scatter.__ensureHotForActiveTab().loadData([
      ['Sample', 'X', 'Y'], ['A', 1, 2], ['A', 2, 3], ['B', 3, 4], ['B', 4, 5]
    ]);
    scatter.draw();
  });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true });
  const points = page.locator('#scatterPlot [data-scatter-point-interaction]');
  const fillA = await points.nth(0).getAttribute('fill');
  const fillB = await points.nth(2).getAttribute('fill');
  expect(fillA).not.toBe(fillB);
  await points.nth(0).click({ force: true });
  const toolbar = page.locator('.scatter-point-controls');
  const chip = toolbar.locator('.shared-fill-style-chip');
  const scope = toolbar.locator('.additional-line-controls-panel__field--scope select');
  await scope.selectOption({ label: 'B' });
  await expect.poll(async () => (await chip.getAttribute('data-color')).toLowerCase()).toBe(fillB.toLowerCase());
  await chip.click();
  const hex = page.getByRole('textbox', { name: 'Enter a hex color' });
  await hex.fill('#123456');
  await hex.press('Enter');
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true });
  await expect(points.nth(2)).toHaveAttribute('fill', /#123456/i);
  await expect(points.nth(0)).toHaveAttribute('fill', fillA);
  await scope.selectOption({ label: 'A' });
  await expect.poll(async () => (await chip.getAttribute('data-color')).toLowerCase()).toBe(fillA.toLowerCase());
  await scope.selectOption({ label: 'B' });
  await expect(chip).toHaveAttribute('data-color', '#123456');
  await expect.poll(() => page.evaluate(() => window.Components.scatter.getPayload().config.labelStyles.B.fill)).toMatch(/#123456/i);
});
