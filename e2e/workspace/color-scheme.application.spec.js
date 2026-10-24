const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { clickExampleButton } = require('../helpers/uiDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

for (const component of COMPONENT_CATALOG) {
  test(`${component.type} default palette changes without a custom-color prompt`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true });
    await clickExampleButton(page, component, { requireMountedRoot: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true, requirePublished: true, requireIdle: true
    });
    const root = page.locator(`#${component.pageId}:not([hidden])`);
    const picker = root.locator('.color-scheme-picker');
    const targetScheme = component.type === 'surface' ? 'surface-plasma' : 'colorblind-8';
    await picker.locator('[data-color-scheme-toggle="1"]').click();
    await picker.locator(`[data-scheme-id="${targetScheme}"]`).click();
    await expect(picker.locator('[data-color-scheme-choice="1"]')).toBeHidden();
    await waitForComponentOwnerReady(page, component.type, { requirePublished: true, requireIdle: true });
    await expect(root.locator('select[data-color-scheme-select="1"]')).toHaveValue(targetScheme);
    expect(await page.evaluate(type => {
      const payload = window.Components[type].getPayload();
      return (type === 'venn' ? payload.style : payload.config).colorScheme;
    }, component.type)).toBe(targetScheme);
  });
}
