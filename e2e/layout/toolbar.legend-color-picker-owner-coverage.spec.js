const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

const COMPONENTS = [
  { type: 'roc', pageId: 'rocPage', exampleButtonId: 'rocLoadExample', plotId: 'rocPlot' },
  { type: 'survival', pageId: 'survivalPage', exampleButtonId: 'survivalLoadExample', plotId: 'survivalPlot' }
];

async function waitForOwner(page, component) {
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
}

async function getLegendSwatch(page, component) {
  const plot = page.locator(`#${component.pageId}:not([hidden]) #${component.plotId}`);
  const swatch = plot.locator('[data-legend-swatch="1"][data-legend-key]').first();
  await expect(swatch).toBeVisible();
  return { plot, swatch };
}

async function readLegendAppearance(plot, key) {
  return plot.evaluate((root, legendKey) => Array.from(root.querySelectorAll('[data-legend-key]'))
    .filter(node => node.dataset.legendKey === legendKey && node.tagName.toLowerCase() !== 'text')
    .map(node => ({
      fill: node.getAttribute('fill'),
      stroke: node.getAttribute('stroke'),
      computedFill: getComputedStyle(node).fill,
      computedStroke: getComputedStyle(node).stroke
    })), key);
}

for (const component of COMPONENTS) {
  test(`${component.type} legend color picker closes on owner change and rejects a stale eyedropper result`, async ({ page }) => {
    test.setTimeout(180_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForOwner(page, component);
    const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    const firstOwner = await getLegendSwatch(page, component);
    const legendKey = await firstOwner.swatch.getAttribute('data-legend-key');
    expect(legendKey).toBeTruthy();
    const firstAppearance = await readLegendAppearance(firstOwner.plot, legendKey);
    expect(firstAppearance.length).toBeGreaterThan(0);

    await openComponentFromWelcome(page, component, { loadExample: true });
    await waitForOwner(page, component);
    const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(secondTabId).toBeTruthy();
    expect(secondTabId).not.toBe(firstTabId);

    await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-legend-picker-owner-open' }), firstTabId);
    await waitForOwner(page, component);
    await page.evaluate(() => {
      window.__legendEyeDropperStarted = false;
      window.__legendEyeDropperResolved = false;
      window.__resolveLegendEyeDropper = color => {
        window.__legendEyeDropperResolved = true;
        window.__resolveLegendEyeDropperValue({ sRGBHex: color });
      };
      window.EyeDropper = class {
        open() {
          window.__legendEyeDropperStarted = true;
          return new Promise(resolve => { window.__resolveLegendEyeDropperValue = resolve; });
        }
      };
    });

    const picker = page.getByRole('dialog', { name: 'Color picker' });
    const firstTrigger = await getLegendSwatch(page, component);
    await firstTrigger.swatch.click();
    await expect(picker).toBeVisible();
    await picker.locator('.shared-color-picker__eyedropper').click();
    await page.waitForFunction(() => window.__legendEyeDropperStarted === true);

    await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-legend-picker-owner-close' }), secondTabId);
    await waitForOwner(page, component);
    await expect(picker).toBeHidden();

    const secondOwner = await getLegendSwatch(page, component);
    const secondKey = await secondOwner.swatch.getAttribute('data-legend-key');
    const secondAppearance = await readLegendAppearance(secondOwner.plot, secondKey);
    await secondOwner.swatch.click();
    await expect(picker).toBeVisible();
    const hex = picker.getByRole('textbox', { name: 'Enter a hex color' });
    const secondPickerColor = await hex.inputValue();
    await page.evaluate(() => window.__resolveLegendEyeDropper('#FF0000'));
    await page.waitForFunction(() => window.__legendEyeDropperResolved === true);
    await expect(hex).toHaveValue(secondPickerColor);
    await expect.poll(() => readLegendAppearance(secondOwner.plot, secondKey)).toEqual(secondAppearance);

    await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-legend-picker-owner-verify' }), firstTabId);
    await waitForOwner(page, component);
    const restoredFirstOwner = await getLegendSwatch(page, component);
    await expect.poll(() => readLegendAppearance(restoredFirstOwner.plot, legendKey)).toEqual(firstAppearance);
  });
}
