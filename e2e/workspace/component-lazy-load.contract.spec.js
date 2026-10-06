const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

test('every workspace component loads through its declared browser bundle and registers itself', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 30_000 });

  const result = await page.evaluate(async () => {
    const loader = window.Main?.components;
    const types = Object.keys(loader?.registry || {}).sort();
    if (!loader || !types.length || typeof loader.loadComponentBundle !== 'function') {
      throw new Error('The production component loader or workspace registry is unavailable.');
    }
    const hasScatterLowessModel = typeof window.Shared?.scatterLowessModel?.fitScatterLowessRegression === 'function';

    const loaded = [];
    let hasBoxIndexedStylesModel = false;
    for (const type of types) {
      const component = await loader.loadComponentBundle(type, { forceReload: true });
      if (type === 'box') {
        hasBoxIndexedStylesModel = typeof window.Components?.__models?.boxIndexedStyles?.splice === 'function';
      }
      loaded.push({
        type,
        returnedComponent: !!component,
        registeredAtExpectedType: component === window.Components?.[type],
        hasRequiredRestoreHook: typeof component?.rehydrateGraphInteractions === 'function'
      });
    }
    return { types, loaded, hasScatterLowessModel, hasBoxIndexedStylesModel };
  });

  expect(result.types.length).toBeGreaterThan(0);
  expect(result.hasScatterLowessModel).toBe(true);
  expect(result.hasBoxIndexedStylesModel).toBe(true);
  expect(result.loaded).toHaveLength(result.types.length);
  for (const item of result.loaded) {
    expect(item.returnedComponent, `${item.type} bundle should load`).toBe(true);
    expect(item.registeredAtExpectedType, `${item.type} bundle should register under its declared key`).toBe(true);
    expect(item.hasRequiredRestoreHook, `${item.type} should expose its required restore hook`).toBe(true);
  }
});
