const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function openComponent(page, type, pageId) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type, pageId }, { first: true });
}

test('Box graph-type change shows the heavy redraw overlay', async ({ page }) => {
  test.setTimeout(60_000);
  await openComponent(page, 'box', 'boxPage');
  await page.evaluate(() => {
    const rows = [['Dataset A', 'Dataset B']];
    for(let index = 0; index < 1100; index += 1){
      rows.push([index + 1, (index % 113) + 1]);
    }
    window.Components.box.__getState().hot.loadData(rows, {
      source: 'e2e-structural-redraw',
      suppressSchedule: true
    });
  });

  await page.locator('#boxGraphType').selectOption('box');
  const overlay = page.locator('#boxGraphPanel .venn-loading-overlay');
  await expect(overlay).toBeVisible({ timeout: 1000 });
  await expect(overlay).toHaveAttribute('data-job-status', 'running');
});

test('Heatmap view-family change shows the heavy redraw overlay', async ({ page }) => {
  test.setTimeout(60_000);
  await openComponent(page, 'heatmap', 'heatmapPage');
  await page.evaluate(() => {
    const rows = [['Variable', ...Array.from({ length: 10 }, (_, index) => `C${index + 1}`)]];
    for(let row = 0; row < 600; row += 1){
      rows.push([`R${row + 1}`, ...Array.from({ length: 10 }, (_, column) => (row * 7 + column * 13) % 101)]);
    }
    window.Components.heatmap.__getState().hot.loadData(rows, {
      source: 'e2e-structural-redraw',
      suppressSchedule: true
    });
  });

  await page.locator('#heatmapView').selectOption('values');
  const overlay = page.locator('#heatmapGraphPanel .venn-loading-overlay');
  await expect(overlay).toBeVisible({ timeout: 1000 });
  await expect(overlay).toHaveAttribute('data-job-status', 'running');
});
