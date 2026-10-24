const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

test('all component Format tabs remain clickable on a 320px viewport', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 400 });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  for (let index = 0; index < COMPONENT_CATALOG.length; index += 1) {
    const component = COMPONENT_CATALOG[index];
    await openComponentFromWelcome(page, component, { first: index === 0 });
    const workspace = page.locator(`#${component.pageId}:not([hidden])`);
    const formatTab = workspace.getByRole('tab', { name: 'Format', exact: true });
    await expect(formatTab, `${component.type} Format tab`).toBeVisible();
    await formatTab.click();
    await expect(formatTab, `${component.type} Format tab state`).toHaveAttribute('aria-selected', 'true');

    const hitTarget = await formatTab.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return target === element || element.contains(target);
    });
    expect(hitTarget, `${component.type} Format tab receives pointer input`).toBe(true);
  }
});
