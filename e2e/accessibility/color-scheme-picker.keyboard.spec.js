const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { expectTargetsAtLeast24 } = require('../helpers/targetSizeAssertions');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

async function openColorSchemePalette(page, component = { type: 'box', pageId: 'boxPage' }){
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  const trigger = page.locator(`#${component.pageId}:not([hidden]) .color-scheme-picker__button`).first();
  await expect(trigger).toBeVisible();
  const controls = await page.evaluate(pageId => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const fieldset = root?.querySelector('[data-color-scheme-fieldset="1"]');
    const row = fieldset?.querySelector('.color-scheme-picker__row');
    const palette = row?.querySelector('.color-scheme-picker__button')?.getBoundingClientRect();
    const appearance = row?.querySelector('[data-color-appearance-select="1"]')?.getBoundingClientRect();
      const caret = row?.querySelector('.color-scheme-picker__caret');
    const rowBounds = row?.getBoundingClientRect();
      const caretStyle = caret ? getComputedStyle(caret) : null;
    return {
      palette: palette ? { left: palette.left, right: palette.right, top: palette.top, bottom: palette.bottom, width: palette.width } : null,
      appearance: appearance ? { left: appearance.left, right: appearance.right, top: appearance.top, bottom: appearance.bottom } : null,
        caret: caretStyle ? { width: caretStyle.width, height: caretStyle.height, backgroundImage: caretStyle.backgroundImage } : null,
      row: rowBounds ? { left: rowBounds.left, right: rowBounds.right } : null,
      text: fieldset?.innerText || '',
      guidanceCount: fieldset?.querySelectorAll('[data-color-scheme-guidance="1"]').length ?? -1
    };
  }, component.pageId);
  expect(controls.palette).not.toBeNull();
  expect(controls.appearance).not.toBeNull();
  expect(controls.caret).toEqual({ width: '10px', height: '6px', backgroundImage: expect.stringContaining('data:image/svg+xml') });
  expect(controls.palette.width).toBeLessThanOrEqual(200);
  expect(controls.palette.left).toBeGreaterThanOrEqual(controls.row.left - 1);
  expect(controls.appearance.left).toBeGreaterThanOrEqual(controls.row.left - 1);
  expect(controls.appearance.right).toBeLessThanOrEqual(controls.row.right + 1);
  const overlaps = controls.palette.left < controls.appearance.right
    && controls.appearance.left < controls.palette.right
    && controls.palette.top < controls.appearance.bottom
    && controls.appearance.top < controls.palette.bottom;
  expect(overlaps).toBe(false);
  expect(controls.text).not.toContain('Appearance');
  expect(controls.guidanceCount).toBe(0);
  return trigger;
}

for (const component of COMPONENT_CATALOG) {
  test(`color-scheme listbox stays within a short viewport for ${component.type}`, async ({ page }) => {
    const trigger = await openColorSchemePalette(page, component);
    await trigger.click();

    const menu = trigger.locator('xpath=..').locator('.color-scheme-picker__menu');
    await expect(menu).toBeVisible();
    await expectTargetsAtLeast24(menu.getByRole('option'), `${component.type} color-scheme listbox`);
    const bounds = await menu.boundingBox();
    const viewport = page.viewportSize();
    expect(bounds).not.toBeNull();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
  });
}

for (const type of ['surface', 'pca']) {
  const component = COMPONENT_CATALOG.find(entry => entry.type === type);
  test(`color-scheme controls stay aligned in the ${type} panel`, async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });

    const geometry = await page.evaluate(pageId => {
      const root = document.querySelector(`#${pageId}:not([hidden])`);
      const fieldset = root?.querySelector('[data-color-scheme-fieldset="1"]');
      const row = fieldset?.querySelector('.color-scheme-picker__row');
      const button = row?.querySelector('.color-scheme-picker__button');
      const appearance = row?.querySelector('[data-color-appearance-select="1"]');
      const rect = node => {
        if(!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width };
      };
      return { fieldset: rect(fieldset), row: rect(row), button: rect(button), appearance: rect(appearance) };
    }, component.pageId);

    expect(geometry.fieldset).not.toBeNull();
    expect(geometry.button.width).toBeLessThanOrEqual(200);
    if(geometry.row.width >= 296) expect(geometry.button.width).toBe(200);
    expect(geometry.appearance.left).toBeGreaterThanOrEqual(geometry.button.right);
    expect(geometry.appearance.top).toBe(geometry.button.top);
    expect(geometry.appearance.right).toBeLessThanOrEqual(geometry.row.right + 1);
  });
}

test('color-scheme listbox supports arrow navigation and Escape focus return', async ({ page }) => {
  const trigger = await openColorSchemePalette(page);
  await trigger.focus();
  await page.keyboard.press('ArrowDown');

  const menu = trigger.locator('xpath=..').locator('.color-scheme-picker__menu');
  await expect(menu).toBeVisible();
  await expectTargetsAtLeast24(menu.getByRole('option'), 'Box color-scheme listbox');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(trigger).toHaveAccessibleName('Palette: Grayscale');
  await expect(trigger).toHaveAttribute('aria-controls', await menu.getAttribute('id'));
  const selected = menu.locator('[role="option"][aria-selected="true"]:not(:disabled)').first();
  await expect(selected).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.locator('[role="option"]:not(:disabled)').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('color-scheme selector aligns previews and selection at desktop and narrow widths', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const trigger = await openColorSchemePalette(page);
  expect(await page.evaluate(() => window.Shared.colorSchemes.applyToActiveTab('box', 'normal', { colorMode: 'replace' }))).toBe(true);
  const appearance = page.locator('#boxPage:not([hidden]) [data-color-appearance-select="1"]');
  for(const width of [1280, 320]){
    await page.setViewportSize({ width, height: 900 });
    for(const mode of ['light', 'dark']){
      await appearance.selectOption(mode);
      await expect(appearance).toHaveValue(mode);
      if(width === 1280 && mode === 'light'){
        await appearance.scrollIntoViewIfNeeded();
        const rowImage = require('path').resolve('artifacts/color-scheme-selector', 'selector-row-1280-light.png');
        await page.locator('#boxPage:not([hidden]) .color-scheme-picker__row').screenshot({ path: rowImage });
        await testInfo.attach('selector-row-1280-light', { path: rowImage, contentType: 'image/png' });
      }
      await trigger.click();
      const menu = trigger.locator('xpath=..').locator('.color-scheme-picker__menu');
      await expect(menu).toBeVisible();
      const selected = menu.locator('[aria-selected="true"]');
      await expect(selected).toHaveCount(1);
      await expect(selected.locator('.color-scheme-picker__selection')).toBeVisible();
      const swatches = await menu.locator('.color-scheme-picker__swatches').evaluateAll(nodes => nodes.map(node => ({
        x: node.getBoundingClientRect().x,
        background: getComputedStyle(node).backgroundColor
      })));
      expect(Math.max(...swatches.map(item => item.x)) - Math.min(...swatches.map(item => item.x))).toBeLessThanOrEqual(1);
      expect(swatches.every(item => item.background === 'rgba(0, 0, 0, 0)')).toBe(true);
      const readColors = locator => locator.locator('.color-scheme-picker__swatch')
        .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundColor));
      expect(await readColors(trigger)).toEqual(await readColors(selected));
      const imagePath = require('path').resolve('artifacts/color-scheme-selector', `palette-${width}-${mode}.png`);
      await menu.screenshot({ path: imagePath });
      await testInfo.attach(`palette-${width}-${mode}`, { path: imagePath, contentType: 'image/png' });
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();
    }
  }
});

for (const component of COMPONENT_CATALOG) {
  test(`color-scheme listbox closes when its ${component.type} owner deactivates`, async ({ page }) => {
    test.setTimeout(120_000);
    await openColorSchemePalette(page, component);
    const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    await openComponentFromWelcome(page, component, { loadExample: true });
    const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(secondTabId).toBeTruthy();
    expect(secondTabId).not.toBe(firstTabId);

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-color-scheme-owner-reopen' });
    }, firstTabId);
    const toolbarSelector = `#${component.pageId}:not([hidden]) .workspace-toolbar`;
    await page.waitForFunction(selector => !!document.querySelector(selector), toolbarSelector);
    const firstTrigger = page.locator(`#${component.pageId}:not([hidden]) .color-scheme-picker__button`).first();
    await firstTrigger.click();
    const firstMenu = firstTrigger.locator('xpath=..').locator('.color-scheme-picker__menu');
    await expect(firstMenu).toBeVisible();

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-color-scheme-owner-deactivate' });
    }, secondTabId);
    await page.waitForFunction(selector => !!document.querySelector(selector), toolbarSelector);
    await expect(firstMenu).toHaveAttribute('hidden', '');
    await expect(firstTrigger).toHaveAttribute('aria-expanded', 'false');

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-color-scheme-owner-restore' });
    }, firstTabId);
    await page.waitForFunction(selector => !!document.querySelector(selector), toolbarSelector);
    await expect(firstMenu).toBeHidden();
  });
}

