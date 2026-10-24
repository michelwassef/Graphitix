const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

const component = { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' };
const dendrogramSelector = '#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"]';

async function waitForCells(page) {
  await page.waitForFunction(() => (
    document.querySelectorAll('#heatmapPage:not([hidden]) #heatmapSvg [data-export-layer="heatmap-cells"] rect').length >= 9
  ), null, { timeout: 60_000 });
}

async function readDendrogramOwner(page, tabId) {
  return page.evaluate(ownerTabId => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find?.(entry => entry.id === ownerTabId) || null;
    const session = window.Components?.heatmap?.__testHooks?.getSession?.(ownerTabId) || null;
    const root = document.querySelector('#heatmapPage:not([hidden])');
    return {
      payload: tab?.payload?.config?.dendrogram || null,
      session: session?.state?.dendrogramSettings || null,
      renderedColor: root?.querySelector('#heatmapSvg .heatmap-dendrogram')?.getAttribute('stroke') || null,
      activeTabId: window.Main?.session?.workspaceState?.activeTabId || null
    };
  }, tabId);
}

test('Heatmap dendrogram settings stay with their tab across same-type switches', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await page.waitForSelector(dendrogramSelector, { timeout: 60_000 });
  const tabA = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(tabA).toBeTruthy();

  await page.locator(dendrogramSelector).click({ force: true });
  const panel = page.locator('.dendrogram-controls-panel');
  await expect(panel).toBeVisible();
  const mode = panel.locator('select.dendrogram-controls-panel__input--select');
  const thickness = panel.locator('input.dendrogram-controls-panel__input--small');
  const color = panel.locator('input.dendrogram-controls-panel__color-input');
  await mode.selectOption('fixed');
  await thickness.fill('3.5');
  await thickness.dispatchEvent('change');
  await color.fill('#2468ac');

  const expected = { mode: 'fixed', thicknessPt: 3.5, color: '#2468ac' };
  await page.waitForFunction(({ tabId, value }) => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find?.(entry => entry.id === tabId) || null;
    const session = window.Components?.heatmap?.__testHooks?.getSession?.(tabId) || null;
    const matches = source => source
      && source.mode === value.mode
      && Number(source.thicknessPt) === value.thicknessPt
      && String(source.color || '').toLowerCase() === value.color;
    return matches(session?.state?.dendrogramSettings) && matches(tab?.payload?.config?.dendrogram);
  }, { tabId: tabA, value: expected });

  await openComponentFromWelcome(page, component, { first: false, loadExample: true });
  await waitForCells(page);
  const tabB = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(tabB).toBeTruthy();
  expect(tabB).not.toBe(tabA);
  const ownerB = await readDendrogramOwner(page, tabB);
  expect(ownerB.session?.color?.toLowerCase()).not.toBe(expected.color);
  expect(ownerB.payload?.color?.toLowerCase()).not.toBe(expected.color);

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabA}"]`).click();
  const readyA = await waitForComponentOwnerReady(page, component, {
    expectedTabId: tabA,
    requireMountedRoot: true,
    requirePublished: true,
    timeout: 30_000
  });
  expect(readyA?.owner?.activeTabId).toBe(tabA);
  await page.locator(dendrogramSelector).click({ force: true });
  await expect(mode).toHaveValue(expected.mode);
  await expect(thickness).toHaveValue(String(expected.thicknessPt));
  await expect(color).toHaveValue(expected.color);
  const restoredA = await readDendrogramOwner(page, tabA);
  expect(restoredA.activeTabId).toBe(tabA);
  expect(restoredA.session).toEqual(expected);
  expect(restoredA.payload).toEqual(expected);
  expect(restoredA.renderedColor?.toLowerCase()).toBe(expected.color);
});
