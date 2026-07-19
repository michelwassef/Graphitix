const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('UpSet color controls use two compact columns', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' },
    { first: true }
  );
  await page.locator('#vennPage:not([hidden]) #vennPlotType').selectOption('upset');

  const positions = await page.evaluate(() => {
    const labelRect = id => document.querySelector(id).closest('.upset-color').getBoundingClientRect();
    const intersection = labelRect('#upsetBarColor');
    const setBars = labelRect('#upsetSetBarColor');
    const dots = labelRect('#upsetDotColor');
    const inactive = labelRect('#upsetInactiveDotColor');
    const grid = labelRect('#upsetGridColor');
    return {
      intersection,
      setBars,
      dots,
      inactive,
      grid
    };
  });

  expect(positions.inactive.left).toBeGreaterThan(positions.intersection.left + 40);
  expect(positions.grid.left).toBeGreaterThan(positions.setBars.left + 40);
  expect(Math.abs(positions.inactive.top - positions.intersection.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(positions.grid.top - positions.setBars.top)).toBeLessThanOrEqual(1);
  expect(positions.dots.left).toBeCloseTo(positions.intersection.left, 0);
});
