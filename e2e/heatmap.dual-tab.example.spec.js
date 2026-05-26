const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function waitForHeatmapCells(page) {
  await page.waitForFunction(() => {
    const cells = document.querySelectorAll('#heatmapSvg [data-export-layer="heatmap-cells"] rect');
    return cells.length >= 9;
  }, null, { timeout: 60_000 });
}

async function activeHeatmapStatus(page) {
  return page.evaluate(() => {
    const cells = document.querySelectorAll('#heatmapSvg [data-export-layer="heatmap-cells"] rect').length;
    const overlay = !!document.querySelector('#heatmapGraphPanel .venn-loading-overlay');
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    return { activeTabId, cells, overlay };
  });
}

async function openSecondHeatmapTab(page, reuse = false) {
  await page.locator('#addWorkspaceTab').click();
  const resolveDuplicatePrompt = async () => {
    const prompt = page.locator('#duplicatePrompt:not([hidden])');
    if (!(await prompt.count())) {
      return false;
    }
    if (reuse) {
      await page.locator('#duplicateReuse').click({ force: true });
    } else {
      await page.locator('#duplicateEmpty').click({ force: true });
    }
    await page.waitForTimeout(200);
    return true;
  };
  if (!(await resolveDuplicatePrompt())) {
    await page.locator('#graphSelectionGrid [data-graph-type="heatmap"]').first().click({ force: true });
    await resolveDuplicatePrompt();
  }
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 20_000 });
}

test('Heatmap example load works in two heatmap tabs', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await waitForHeatmapCells(page);
  const first = await activeHeatmapStatus(page);
  expect(first.overlay).toBe(false);
  expect(first.cells).toBeGreaterThanOrEqual(9);

  const firstTabId = first.activeTabId;
  expect(firstTabId).toBeTruthy();

  await openSecondHeatmapTab(page, false);
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await waitForHeatmapCells(page);
  const second = await activeHeatmapStatus(page);
  expect(second.overlay).toBe(false);
  expect(second.cells).toBeGreaterThanOrEqual(9);

  await page.evaluate((tabId) => {
    document.querySelector(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`)?.click();
  }, firstTabId);
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 20_000 });
  await waitForHeatmapCells(page);
  const restoredFirst = await activeHeatmapStatus(page);
  expect(restoredFirst.overlay).toBe(false);
  expect(restoredFirst.cells).toBeGreaterThanOrEqual(9);
});
