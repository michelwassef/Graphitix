const { test, expect } = require('@playwright/test');
const {
  buildWorkspaceArchive,
  openWorkspaceArchiveBuffer,
  parseWorkspaceArchive,
  summarizeArchiveMetadata
} = require('../helpers/archiveDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const {
  openComponentFromWelcome,
  getActiveWorkspaceTabMeta,
  clickExpectedExampleButton,
  waitForDocumentOpenComplete
} = require('../helpers/workspaceDriver');
const { expectTargetsAtLeast24 } = require('../helpers/targetSizeAssertions');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

test('AG Grid context menus expose keyboard menu semantics and remain inside a short viewport', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'scatter', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });

  const header = page.locator('#scatterPage:not([hidden]) #scatterHot .ag-header-cell[col-id="c0"]').first();
  await expect(header).toBeVisible();
  await header.focus();
  await page.keyboard.press('Shift+F10');

  const menu = page.getByRole('menu', { name: 'Table actions' });
  const enabledItems = menu.locator('[role="menuitem"]:not(:disabled)');
  await expect(menu).toBeVisible();
  await expectTargetsAtLeast24(menu.getByRole('menuitem'), 'AG Grid context menu');
  const itemPadding = await enabledItems.first().evaluate(node => getComputedStyle(node).padding);
  expect(itemPadding).toBe('4px 8px');
  await expect(enabledItems.first()).toBeFocused();
  const bounds = await menu.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(321);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(401);

  const enabledCount = await enabledItems.count();
  expect(enabledCount).toBeGreaterThan(2);
  await page.keyboard.press('ArrowDown');
  await expect(enabledItems.nth(1)).toBeFocused();
  const keyboardFocus = await enabledItems.nth(1).evaluate(node => {
    const style = getComputedStyle(node);
    return { outline: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) || 0 };
  });
  expect(keyboardFocus.outline).toBe('solid');
  expect(keyboardFocus.width).toBeGreaterThan(0);
  await page.keyboard.press('End');
  await expect(enabledItems.nth(enabledCount - 1)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(enabledItems.nth(enabledCount - 2)).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(menu).toBeHidden();
  const focusReturn = await header.evaluate(node => ({
    withinHeader: node === document.activeElement || node.contains(document.activeElement),
    activeRole: document.activeElement?.getAttribute?.('role') || '',
    activeClass: String(document.activeElement?.className || '')
  }));
  expect(focusReturn.withinHeader, JSON.stringify(focusReturn)).toBe(true);

  const filterTrigger = page.locator('#scatterPage:not([hidden]) #scatterHot .ag-header-cell[col-id="c0"] button[aria-label="Open column filter"]').first();
  await filterTrigger.click();
  const filterPopup = page.locator('body > .ag-hot-filter-menu');
  await expect(filterPopup).toBeVisible();
  const filterCheckbox = filterPopup.locator('.ag-hot-filter-menu__check input[type="checkbox"]').first();
  await expect.poll(() => filterCheckbox.evaluate(input => getComputedStyle(input).accentColor)).toBe('rgb(11, 110, 105)');
  await expectTargetsAtLeast24(filterPopup.locator('.ag-hot-filter-menu__check:visible'), 'AG Grid filter-choice rows');
  await expectTargetsAtLeast24(filterPopup.locator('button:visible, select:visible, input:not([type="checkbox"]):visible'), 'AG Grid filter controls');
  const filterBounds = await filterPopup.boundingBox();
  expect(filterBounds).not.toBeNull();
  expect(filterBounds.x).toBeGreaterThanOrEqual(0);
  expect(filterBounds.y).toBeGreaterThanOrEqual(0);
  expect(filterBounds.x + filterBounds.width).toBeLessThanOrEqual(321);
  expect(filterBounds.y + filterBounds.height).toBeLessThanOrEqual(401);
  await filterPopup.getByRole('button', { name: 'Cancel' }).click();
  await expect(filterPopup).toHaveCount(0);
  await expect(filterTrigger).toHaveAttribute('aria-expanded', 'false');

  await filterTrigger.click();
  await expect(filterPopup).toBeVisible();
  const horizontalViewport = page.locator('#scatterHot .ag-body-horizontal-scroll-viewport').first();
  await expect.poll(()=>horizontalViewport.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await horizontalViewport.evaluate(node => {
    node.scrollLeft = node.scrollWidth;
  });
  await expect(filterPopup).toHaveCount(0);
});

for (const component of COMPONENT_CATALOG) {
  test(`AG Grid context and filter popups stay closed after ${component.type} archive reopen`, async ({ page }) => {
    test.setTimeout(180_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    const owner = { type: component.type, pageId: component.pageId };
    const pageRoot = `#${component.pageId}:not([hidden])`;
    await openComponentFromWelcome(page, owner, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });

    const openContextMenu = async () => {
      const header = page.locator(`${pageRoot} .ag-header-cell[col-id="c0"]`).first();
      await expect(header).toBeVisible();
      await header.focus();
      await page.keyboard.press('Shift+F10');
      await expect(page.getByRole('menu', { name: 'Table actions' })).toBeVisible();
    };
    const restoreArchive = async () => {
      const archive = await buildWorkspaceArchive(page);
      const summary = summarizeArchiveMetadata(await parseWorkspaceArchive(page, archive.base64));
      expect(summary.tabs.find(tab => tab.type === component.type)?.hasRenderCache).toBe(true);
      await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: component.type });
      await waitForDocumentOpenComplete(page);
      await waitForComponentOwnerReady(page, component.type, {
        requireMountedRoot: true,
        requireIdle: true,
        timeout: 60_000
      });
    };

    await openContextMenu();
    await restoreArchive();
    await expect(page.getByRole('menu', { name: 'Table actions' })).toHaveCount(0);
    await expect(page.locator('body > .ag-hot-filter-menu')).toHaveCount(0);

    await openContextMenu();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: 'Table actions' })).toHaveCount(0);
    const filterTriggerSelector = `${pageRoot} .ag-header-cell[col-id="c0"] button[aria-label="Open column filter"]`;
    const filterTrigger = page.locator(filterTriggerSelector).first();
    await filterTrigger.click();
    const filterPopup = page.locator('body > .ag-hot-filter-menu');
    await expect(filterPopup).toBeVisible();
    await expect(filterTrigger).toHaveAttribute('aria-expanded', 'true');

    await restoreArchive();
    await expect(page.getByRole('menu', { name: 'Table actions' })).toHaveCount(0);
    await expect(filterPopup).toHaveCount(0);
    const restoredFilterTrigger = page.locator(filterTriggerSelector).first();
    await expect(restoredFilterTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(restoredFilterTrigger).not.toHaveAttribute('aria-controls');
    await restoredFilterTrigger.click();
    await expect(filterPopup).toBeVisible();
    await filterPopup.getByRole('button', { name: 'Cancel' }).click();
    await expect(filterPopup).toHaveCount(0);
  });
}

test('Venn analysis option disclosures support keyboard use and close with their owner', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');
  const venn = { type: 'venn', pageId: 'vennPage' };
  await openComponentFromWelcome(page, venn, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'venn', { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });

  const firstTabId = (await getActiveWorkspaceTabMeta(page)).id;
  const firstRoot = page.locator('#vennPage:not([hidden])');
  for (const [triggerId, panelId] of [['goOptsBtn', 'goOptions'], ['stringOptsBtn', 'stringOptions']]) {
    const trigger = firstRoot.locator(`#${triggerId}`);
    const panel = firstRoot.locator(`#${panelId}`);
    await expect(trigger).toHaveAttribute('aria-controls', panelId);
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(panel).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Space');
    await expect(panel).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  }

  const goTrigger = firstRoot.locator('#goOptsBtn');
  await goTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(firstRoot.locator('#goOptions')).toBeVisible();
  const stringTrigger = firstRoot.locator('#stringOptsBtn');
  await stringTrigger.focus();
  await page.keyboard.press('Enter');
  await expect(firstRoot.locator('#stringOptions')).toBeVisible();

  await openComponentFromWelcome(page, venn, { loadExample: true });
  await waitForComponentOwnerReady(page, 'venn', { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
  await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-venn-options-owner-return' }), firstTabId);
  await waitForComponentOwnerReady(page, 'venn', { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
  const firstPanelStates = await firstRoot.evaluate(root => [
    ['goOptions', 'goOptsBtn'],
    ['stringOptions', 'stringOptsBtn']
  ].map(([panelId, triggerId]) => ({
    hidden: root.querySelector(`#${panelId}`)?.hidden,
    expanded: root.querySelector(`#${triggerId}`)?.getAttribute('aria-expanded')
  })));
  expect(firstPanelStates).toEqual([
    { hidden: true, expanded: 'false' },
    { hidden: true, expanded: 'false' }
  ]);
});

for(const component of COMPONENT_CATALOG){
test(`AG Grid context menus close when their ${component.type} workspace owner deactivates`, async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

  await openComponentFromWelcome(page, component);
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-ag-menu-owner-change-open' });
  }, firstTabId);
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });

  const header = page.locator(`#${component.pageId}:not([hidden]) .ag-header-cell[col-id="c0"]`).first();
  await expect(header).toBeVisible();
  await header.focus();
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu', { name: 'Table actions' });
  await expect(menu).toBeVisible();

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-ag-menu-owner-change-close' });
  }, secondTabId);
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  await expect(menu).toBeHidden();

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-ag-filter-owner-change-open' });
  }, firstTabId);
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  const filterButton = page.locator(`#${component.pageId}:not([hidden]) .ag-header-cell[col-id="c0"] button[aria-label="Open column filter"]`).first();
  await expect(filterButton).toBeVisible();
  await expect(filterButton).toHaveAttribute('aria-expanded', 'false');
  await expect(filterButton).not.toHaveAttribute('aria-controls');
  await filterButton.evaluate(button => { window.__agFilterPopupTrigger = button; });
  await filterButton.click();
  const filterPopup = page.locator('body > .ag-hot-filter-menu');
  await expect(filterPopup).toBeVisible();
  await expect(filterButton).toHaveAttribute('aria-expanded', 'true');
  const filterPopupId = await filterPopup.getAttribute('id');
  expect(filterPopupId).toBeTruthy();
  await expect(filterButton).toHaveAttribute('aria-controls', filterPopupId);

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-ag-filter-owner-change-close' });
  }, secondTabId);
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  await expect(filterPopup).toHaveCount(0);
  expect(await page.evaluate(() => window.__agFilterPopupTrigger?.getAttribute('aria-expanded'))).toBe('false');

  const replacementFilterTrigger = page.locator(`#${component.pageId}:not([hidden]) .ag-header-cell[col-id="c0"] button[aria-label="Open column filter"]`).first();
  await expect(replacementFilterTrigger).toBeVisible();
  await expect(replacementFilterTrigger).toHaveAttribute('aria-expanded', 'false');
  const replacementFilterPopup = page.locator('body > .ag-hot-filter-menu');
  await replacementFilterTrigger.click();
  await expect(replacementFilterPopup).toBeVisible();
  await expect(replacementFilterTrigger).toHaveAttribute('aria-expanded', 'true');
  await expect(replacementFilterTrigger).toHaveAttribute('aria-controls', await replacementFilterPopup.getAttribute('id'));
  await replacementFilterPopup.getByRole('button', { name: 'Cancel' }).click();
  await expect(replacementFilterPopup).toHaveCount(0);
  await expect(replacementFilterTrigger).toHaveAttribute('aria-expanded', 'false');
});
}

test('workspace tab context menu opens from the keyboard and restores its tab focus', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });

  const trigger = page.locator('#workspaceTabsList .workspace-tab[aria-selected="true"]');
  const menu = page.getByRole('menu', { name: 'Tab actions' });
  const items = menu.getByRole('menuitem');
  await trigger.focus();
  await trigger.press('Shift+F10');

  await expect(menu).toBeVisible();
  await expectTargetsAtLeast24(items, 'workspace tab menu');
  const menuBounds = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(menuBounds).not.toBeNull();
  expect(menuBounds.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds.y).toBeGreaterThanOrEqual(0);
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(viewport.height + 1);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.nth(3)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

for (const component of COMPONENT_CATALOG) {
  test(`font listboxes fit a short viewport and Escape closes each without ending ${component.type} text editing`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 320, height: 400 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true });
    await clickExpectedExampleButton(page, component.exampleButtonId);

    const title = page.locator(`#${component.pageId}:not([hidden]) .svgbox svg text[data-font-role="graphTitle"]`).first();
    await expect(title).toBeVisible();
    await title.dblclick();
    const editor = page.locator('.inline-edit-input').last();
    const fontPanel = page.locator('.font-controls-panel[data-open="1"]');
    await expect(editor).toBeVisible();
    const trigger = fontPanel.locator('.font-controls-panel__combo-toggle[aria-label="Show available fonts"]');
    const menu = page.getByRole('listbox', { name: 'Common fonts' });
    await expect(trigger).toBeVisible();
    const localControlRadii = await fontPanel.evaluate(panel => [
      getComputedStyle(panel.querySelector('.font-controls-panel__combo-toggle')).borderRadius,
      getComputedStyle(panel.querySelector('.font-controls-panel__input--size')).borderRadius
    ]);
    expect(localControlRadii).toEqual(['0px', '0px']);
    const triggerReceivesPointer = await trigger.evaluate(node => {
      const rect = node.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return target === node || node.contains(target);
    });
    expect(triggerReceivesPointer).toBe(true);
    await trigger.click();
    const pointerComboStyle = await fontPanel.locator('.font-controls-panel__field--font .font-controls-panel__combo').evaluate(node => {
      const expected = document.createElement('div');
      expected.style.borderColor = 'var(--gt-border-strong)';
      document.body.appendChild(expected);
      const result = {
        modality: window.Shared.focusModality.getCurrentModality(),
        borderColor: getComputedStyle(node).borderColor,
        expectedBorderColor: getComputedStyle(expected).borderColor
      };
      expected.remove();
      return result;
    });
    expect(pointerComboStyle.modality).toBe('pointer');
    expect(pointerComboStyle.borderColor).toBe(pointerComboStyle.expectedBorderColor);

    const viewport = page.viewportSize();
    await expect(menu).toBeVisible();
    await expectTargetsAtLeast24(menu.getByRole('option'), `${component.type} font listbox`);
    const menuBounds = await menu.boundingBox();
    expect(menuBounds).not.toBeNull();
    expect(await menu.locator('.font-controls-panel__combo-option').first().evaluate(node => getComputedStyle(node).borderRadius)).toBe('0px');
    expect(menuBounds.x).toBeGreaterThanOrEqual(0);
    expect(menuBounds.y).toBeGreaterThanOrEqual(0);
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(viewport.height + 1);
    const menuLayout = await menu.evaluate(popup => {
      const combo = popup.closest('.font-controls-panel__combo');
      const optionLineCounts = Array.from(popup.querySelectorAll('.font-controls-panel__combo-option')).map(option => {
        const range = document.createRange();
        range.selectNodeContents(option);
        return range.getClientRects().length;
      });
      return {
        menuWidth: popup.getBoundingClientRect().width,
        comboWidth: combo.getBoundingClientRect().width,
        optionLineCounts
      };
    });
    expect(menuLayout.menuWidth).toBeGreaterThan(menuLayout.comboWidth + 32);
    expect(
      menuLayout.optionLineCounts,
      `Font popup ${menuLayout.menuWidth}px; selection box ${menuLayout.comboWidth}px`
    ).toEqual(Array.from({ length: menuLayout.optionLineCounts.length }, () => 1));
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(editor).toBeVisible();
    await expect(fontPanel).toBeVisible();

    const fontInput = page.getByRole('combobox', { name: 'Font family' });
    const fontOptions = menu.getByRole('option');
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(menu).toBeVisible();
    await expect(fontInput).toBeFocused();
    await expect(fontInput).toHaveAttribute('aria-autocomplete', 'list');
    await expect(fontInput).toHaveAttribute('aria-controls', await menu.getAttribute('id'));
    await expect(fontInput).toHaveAttribute('aria-expanded', 'true');
    await expect(fontInput).toHaveAttribute('aria-activedescendant', await fontOptions.nth(0).getAttribute('id'));
    await fontInput.fill('');
    expect(await fontOptions.count()).toBeGreaterThan(2);
    await page.keyboard.press('Home');
    await expect(fontInput).toHaveAttribute('aria-activedescendant', await fontOptions.nth(0).getAttribute('id'));
    await page.keyboard.press('ArrowDown');
    await expect(fontInput).toHaveAttribute('aria-activedescendant', await fontOptions.nth(1).getAttribute('id'));
    await expect(fontOptions.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('End');
    await expect(fontInput).toHaveAttribute('aria-activedescendant', await fontOptions.last().getAttribute('id'));
    await page.keyboard.press('Home');
    await expect(fontInput).toHaveAttribute('aria-activedescendant', await fontOptions.nth(0).getAttribute('id'));
    await page.keyboard.press('ArrowDown');
    const selectedFont = await fontOptions.nth(1).getAttribute('data-value');
    await page.keyboard.press('Enter');
    await expect(menu).toBeHidden();
    await expect(fontInput).toHaveValue(selectedFont);
    await expect(fontInput).toBeFocused();
    await expect(editor).toBeVisible();
    await fontInput.press('ArrowDown');
    await fontInput.press('Escape');
    await expect(menu).toBeHidden();
    await expect(fontInput).toHaveAttribute('aria-expanded', 'false');
    await expect(fontInput).not.toHaveAttribute('aria-activedescendant');
    await expect(fontInput).toBeFocused();
    await fontInput.press('ArrowDown');
    await fontInput.press('Tab');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(editor).toBeVisible();

    const sizeTrigger = fontPanel.locator('.font-controls-panel__combo-toggle[aria-label="Show preset font sizes"]');
    const sizeMenu = page.getByRole('listbox', { name: 'Common font sizes' });
    await sizeTrigger.click();
    await expect(sizeMenu).toBeVisible();
    await expectTargetsAtLeast24(sizeMenu.getByRole('option'), `${component.type} font-size listbox`);
    const sizeMenuBounds = await sizeMenu.boundingBox();
    expect(sizeMenuBounds).not.toBeNull();
    expect(sizeMenuBounds.x).toBeGreaterThanOrEqual(0);
    expect(sizeMenuBounds.y).toBeGreaterThanOrEqual(0);
    expect(sizeMenuBounds.x + sizeMenuBounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(sizeMenuBounds.y + sizeMenuBounds.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.keyboard.press('Escape');
    await expect(sizeMenu).toBeHidden();
    await expect(sizeTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(editor).toBeVisible();
    await expect(fontPanel).toBeVisible();

    const sizeInput = page.getByRole('combobox', { name: 'Font size' });
    const sizeOptions = sizeMenu.getByRole('option');
    await sizeTrigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(sizeMenu).toBeVisible();
    await expect(sizeInput).toBeFocused();
    await expect(sizeInput).toHaveAttribute('aria-autocomplete', 'list');
    await expect(sizeInput).toHaveAttribute('aria-controls', await sizeMenu.getAttribute('id'));
    await expect(sizeInput).toHaveAttribute('aria-expanded', 'true');
    await expect(sizeInput).toHaveAttribute('aria-activedescendant', await sizeOptions.nth(0).getAttribute('id'));
    await page.keyboard.press('End');
    await expect(sizeInput).toHaveAttribute('aria-activedescendant', await sizeOptions.last().getAttribute('id'));
    await page.keyboard.press('Home');
    await expect(sizeInput).toHaveAttribute('aria-activedescendant', await sizeOptions.nth(0).getAttribute('id'));
    await page.keyboard.press('ArrowDown');
    const selectedSize = await sizeOptions.nth(1).getAttribute('data-value');
    await expect(sizeOptions.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');
    await expect(sizeMenu).toBeHidden();
    await expect(sizeInput).toHaveValue(selectedSize);
    await expect(sizeInput).toBeFocused();
    await expect(editor).toBeVisible();
    await sizeInput.press('ArrowDown');
    await sizeInput.press('Escape');
    await expect(sizeMenu).toBeHidden();
    await expect(sizeInput).toHaveAttribute('aria-expanded', 'false');
    await expect(sizeInput).not.toHaveAttribute('aria-activedescendant');
    await expect(sizeInput).toBeFocused();
    await sizeInput.press('ArrowDown');
    await sizeInput.press('Tab');
    await expect(sizeMenu).toBeHidden();
    await expect(sizeTrigger).toBeFocused();
    await expect(editor).toBeVisible();
  });
}

test('Font combobox focus keeps its visible outline without an extra shadow', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1024, height: 768 });
  const component = COMPONENT_CATALOG.find(item => item.type === 'scatter');
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, component, { first: true });
  await clickExpectedExampleButton(page, component.exampleButtonId);
  await waitForComponentOwnerReady(page, 'scatter', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });

  const title = page.locator('#scatterPage:not([hidden]) .svgbox svg text[data-font-role="graphTitle"]').first();
  await expect(title).toBeVisible();
  await title.dblclick();
  const fontPanel = page.locator('.font-controls-panel[data-open="1"]');
  await expect(fontPanel).toBeVisible();
  const fontInput = page.getByRole('combobox', { name: 'Font family' });
  const fontToggle = fontPanel.locator('.font-controls-panel__combo-toggle[aria-label="Show available fonts"]');
  await fontInput.click();
  await expect(fontInput).toBeFocused();
  expect(await fontInput.evaluate(node => getComputedStyle(node).boxShadow)).toBe('none');

  await page.keyboard.press('Tab');
  await expect(fontToggle).toBeFocused();
  const keyboardFocusStyle = await fontToggle.evaluate(node => {
    const style = getComputedStyle(node);
    return {
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth) || 0
    };
  });
  expect(keyboardFocusStyle.boxShadow).toBe('none');
  expect(keyboardFocusStyle.outlineStyle).toBe('solid');
  expect(keyboardFocusStyle.outlineWidth).toBeGreaterThan(0);

  await fontToggle.click();
  const fontMenu = page.getByRole('listbox', { name: 'Common fonts' });
  await expect(fontMenu).toBeVisible();
  expect(await fontMenu.getByRole('option').first().evaluate(node => getComputedStyle(node).boxShadow)).toBe('none');
  const fontMenuLayout = await fontMenu.evaluate(popup => {
    const combo = popup.closest('.font-controls-panel__combo');
    const optionLineCounts = Array.from(popup.querySelectorAll('.font-controls-panel__combo-option')).map(option => {
      const range = document.createRange();
      range.selectNodeContents(option);
      return range.getClientRects().length;
    });
    return {
      menuWidth: popup.getBoundingClientRect().width,
      comboWidth: combo.getBoundingClientRect().width,
      optionLineCounts
    };
  });
  expect(fontMenuLayout.menuWidth).toBeGreaterThan(fontMenuLayout.comboWidth + 32);
  expect(fontMenuLayout.optionLineCounts).toEqual(Array.from({ length: fontMenuLayout.optionLineCounts.length }, () => 1));
});

for (const component of COMPONENT_CATALOG) {
  test(`font-family suggestions close when the ${component.type} tab owner changes`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });

    const title = page.locator(`#${component.pageId}:not([hidden]) .svgbox svg text[data-font-role="graphTitle"]`).first();
    await expect(title).toBeVisible();
    await title.dblclick();
    const editor = page.locator('.inline-edit-input').last();
    const fontPanel = page.locator('.font-controls-panel[data-open="1"]');
    await expect(editor).toBeVisible();
    await expect(fontPanel).toBeVisible();
    const fontInput = page.locator('.font-controls-panel input[aria-label="Font family"]');
    const menu = page.getByRole('listbox', { name: 'Common fonts' });
    await fontInput.press('ArrowDown');
    await expect(menu).toBeVisible();
    const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

    await openComponentFromWelcome(page, component, { loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(secondTabId).toBeTruthy();
    expect(secondTabId).not.toBe(firstTabId);
    await expect(menu).toBeHidden();

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-font-combo-owner-reopen' });
    }, firstTabId);
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    await expect(menu).toBeHidden();
  });
}

for (const component of COMPONENT_CATALOG) {
  test(`preset and editable font-size menus close when the ${component.type} tab owner changes`, async ({ page }) => {
    test.setTimeout(150_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });

    const titleSelector = `#${component.pageId}:not([hidden]) .svgbox svg text[data-font-role="graphTitle"]`;
    const title = page.locator(titleSelector).first();
    await expect(title).toBeVisible();
    await title.dblclick();
    const fontPanel = page.locator('.font-controls-panel[data-open="1"]');
    await expect(fontPanel).toBeVisible();

    const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    const presetTrigger = fontPanel.locator('.font-controls-panel__combo-toggle[aria-label="Show preset font sizes"]');
    const sizeMenu = page.getByRole('listbox', { name: 'Common font sizes' });
    await presetTrigger.click();
    await expect(sizeMenu).toBeVisible();

    await openComponentFromWelcome(page, component, { loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(secondTabId).toBeTruthy();
    expect(secondTabId).not.toBe(firstTabId);
    await expect(sizeMenu).toBeHidden();

    await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-font-size-preset-owner-return' }), firstTabId);
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    await expect(sizeMenu).toBeHidden();

    await page.locator(titleSelector).first().dblclick();
    await expect(fontPanel).toBeVisible();
    const sizeInput = fontPanel.locator('input[aria-label="Font size"]');
    await sizeInput.press('ArrowDown');
    await expect(sizeMenu).toBeVisible();

    await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-font-size-combo-owner-change' }), secondTabId);
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    await expect(sizeMenu).toBeHidden();

    await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-font-size-combo-owner-return' }), firstTabId);
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 60_000
    });
    await expect(sizeMenu).toBeHidden();
  });
}

test('DataViews export menu supports keyboard navigation and Escape focus return', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.Shared?.dataViews?.createManager && !!window.Shared?.menuKeyboard);
  await page.evaluate(() => {
    const manager = window.Shared.dataViews.createManager({ componentKey: 'a11y-menu' });
    manager.initialize([
      ['Gene', 'Value'],
      ['A', 1],
      ['B', 2]
    ]);
    const wrapper = document.createElement('div');
    const tableContainer = document.createElement('div');
    wrapper.id = 'e2eDataViewMenuHost';
    wrapper.style.cssText = 'position:fixed;left:12px;top:20px;width:280px;height:320px';
    document.body.appendChild(wrapper);
    manager.mount({ wrapper, tableContainer });
  });

  const trigger = page.getByRole('button', { name: 'Save Raw' });
  const menu = page.locator('#e2eDataViewMenuHost [role="menu"]');
  const items = menu.getByRole('menuitem');
  await trigger.focus();
  await trigger.press('Enter');

  await expect(menu).toBeVisible();
  await expectTargetsAtLeast24(items, 'DataViews export menu');
  const menuBounds = await menu.boundingBox();
  const viewport = page.viewportSize();
  expect(menuBounds).not.toBeNull();
  expect(menuBounds.x).toBeGreaterThanOrEqual(0);
  expect(menuBounds.y).toBeGreaterThanOrEqual(0);
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(viewport.height + 1);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(items.nth(0)).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(items.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.nth(3)).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(trigger).toBeFocused();
});

test('DataViews export action returns focus to its save trigger', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.Shared?.dataViews?.createManager && !!window.Shared?.menuKeyboard);
  await page.evaluate(() => {
    const manager = window.Shared.dataViews.createManager({ componentKey: 'e2e-export-focus' });
    manager.initialize([
      ['Gene', 'Value'],
      ['A', 1]
    ]);
    const wrapper = document.createElement('div');
    const tableContainer = document.createElement('div');
    wrapper.id = 'e2eExportFocusHost';
    wrapper.style.cssText = 'position:fixed;left:20px;top:20px;width:440px;height:240px';
    document.body.appendChild(wrapper);
    manager.mount({ wrapper, tableContainer });
    window.__dataViewExportCalls = 0;
    window.Shared.fileIO = {
      saveGraphFileAs: async () => {
        window.__dataViewExportCalls += 1;
        return { status: 'saved', via: 'test' };
      }
    };
  });

  const trigger = page.getByRole('button', { name: 'Save Raw' });
  const menu = page.locator('#e2eExportFocusHost [role="menu"]');
  const csv = menu.getByRole('menuitem', { name: 'CSV' });
  await trigger.focus();
  await trigger.press('Enter');
  await expect(menu).toBeVisible();
  await expect(csv).toBeFocused();
  await expectTargetsAtLeast24(menu.getByRole('menuitem'), 'DataViews export action menu');
  await csv.press('Enter');

  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.__dataViewExportCalls)).toBe(1);
});

for(const component of COMPONENT_CATALOG.filter(item => item.capabilities.dataViews)){
  test(`${component.type} DataViews export menu closes when its same-type workspace owner deactivates`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

    await openComponentFromWelcome(page, component, { loadExample: true });
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(secondTabId).toBeTruthy();
    expect(secondTabId).not.toBe(firstTabId);

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-data-view-menu-owner-open' });
    }, firstTabId);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    const wrapper = page.locator(`#${component.pageId}:not([hidden]) .data-view-host`).first();
    const trigger = wrapper.getByRole('button', { name: 'Save Raw' });
    const menu = wrapper.locator('.data-view-tabs__export-menu');
    await trigger.focus();
    await trigger.press('Enter');
    await expect(menu).toBeVisible();

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-data-view-menu-owner-deactivate' });
    }, secondTabId);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    await expect(menu).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-data-view-menu-owner-restore' });
    }, firstTabId);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    await expect(menu).toBeHidden();
  });
}

test('DataViews keyboard switching retains focus and moves it to the active view after close', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.Shared?.dataViews?.createManager);
  await page.evaluate(() => {
    const manager = window.Shared.dataViews.createManager({ componentKey: 'a11y-view-switcher' });
    manager.initialize([
      ['Gene', 'Value'],
      ['A', 1],
      ['B', 2]
    ]);
    manager.createDerivedView({
      title: 'log2(x+1)',
      data: [
        ['Gene', 'Value'],
        ['A', 1],
        ['B', 1.58]
      ],
      activate: false
    });
    const wrapper = document.createElement('div');
    const tableContainer = document.createElement('div');
    wrapper.id = 'e2eDataViewSwitcherHost';
    document.body.appendChild(wrapper);
    manager.mount({ wrapper, tableContainer });
  });

  const group = page.getByRole('group', { name: 'Input data views' });
  const raw = group.getByRole('button', { name: 'Raw', exact: true });
  const derived = group.getByRole('button', { name: 'log2(x+1)', exact: true });
  await expect(raw).toHaveAttribute('aria-pressed', 'true');
  await expect(derived).toHaveAttribute('aria-pressed', 'false');

  await derived.focus();
  await page.keyboard.press('Enter');
  await expect(derived).toHaveAttribute('aria-pressed', 'true');
  await expect(raw).toHaveAttribute('aria-pressed', 'false');
  await expect(derived).toBeFocused();

  await group.getByRole('button', { name: 'Close log2(x+1)', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(raw).toHaveAttribute('aria-pressed', 'true');
  await expect(raw).toBeFocused();
});

test('graph-options disclosures close on owner change and restore closed from an archive', async ({ page }) => {
  test.setTimeout(150_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const component = { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' };
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });

  const firstOptions = page.locator('#scatterPage:not([hidden]) .resizer-options-control').first();
  await firstOptions.locator('summary').first().click();
  await expect(firstOptions).toHaveAttribute('open', '');
  const firstAxisOptions = firstOptions.locator('.resizer-axeslength-control').first();
  await expect(firstAxisOptions).toHaveAttribute('open', '');

  const archive = await buildWorkspaceArchive(page);
  const archiveSummary = summarizeArchiveMetadata(await parseWorkspaceArchive(page, archive.base64));
  expect(archiveSummary.tabs.find(tab => tab.type === 'scatter')?.hasRenderCache).toBe(true);
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: 'scatter' });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });

  const restoredOptions = page.locator('#scatterPage:not([hidden]) .resizer-options-control').first();
  const restoredAxisOptions = restoredOptions.locator('.resizer-axeslength-control').first();
  await expect(restoredOptions).not.toHaveAttribute('open', '');
  await expect(restoredAxisOptions).not.toHaveAttribute('open', '');

  const restoredFirstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  await openComponentFromWelcome(page, component, { loadExample: true });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
  const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(restoredFirstTabId);

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-resizer-menu-owner-open' });
  }, restoredFirstTabId);
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
  const ownerOptions = page.locator('#scatterPage:not([hidden]) .resizer-options-control').first();
  await ownerOptions.locator('summary').first().click();
  await expect(ownerOptions).toHaveAttribute('open', '');
  await expect(ownerOptions.locator('.resizer-axeslength-control').first()).toHaveAttribute('open', '');

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-resizer-menu-owner-deactivate' });
  }, secondTabId);
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
  await expect(ownerOptions).not.toHaveAttribute('open', '');
  await expect(ownerOptions.locator('.resizer-axeslength-control').first()).not.toHaveAttribute('open', '');

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-resizer-menu-owner-return' });
  }, restoredFirstTabId);
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
  await expect(ownerOptions).not.toHaveAttribute('open', '');
});

for (const component of COMPONENT_CATALOG) {
  test(`${component.type} graph-options disclosures close when their owner deactivates`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
    const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

    await openComponentFromWelcome(page, component, { loadExample: true });
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
    const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(secondTabId).toBeTruthy();
    expect(secondTabId).not.toBe(firstTabId);

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-resizer-menu-owner-open' });
    }, firstTabId);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
    const firstOptions = page.locator(`#${component.pageId}:not([hidden]) .resizer-options-control`).first();
    await firstOptions.locator('summary').first().click();
    await expect(firstOptions).toHaveAttribute('open', '');
    const firstAxisOptions = firstOptions.locator('.resizer-axeslength-control').first();
    const hasAxisLengthDisclosure = ['line', 'pca', 'scatter'].includes(component.type);
    if (hasAxisLengthDisclosure) {
      await expect(firstAxisOptions).toHaveCount(1);
      await expect(firstAxisOptions).toHaveAttribute('open', '');
    } else {
      await expect(firstOptions.locator('.resizer-axeslength-control')).toHaveCount(0);
    }

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-resizer-menu-owner-deactivate' });
    }, secondTabId);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
    await expect(firstOptions).not.toHaveAttribute('open', '');
    if (hasAxisLengthDisclosure) await expect(firstAxisOptions).not.toHaveAttribute('open', '');

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-resizer-menu-owner-return' });
    }, firstTabId);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
    await expect(firstOptions).not.toHaveAttribute('open', '');
    if (hasAxisLengthDisclosure) await expect(firstAxisOptions).not.toHaveAttribute('open', '');
  });
}

for (const component of COMPONENT_CATALOG) {
  test(`workspace toolbar menus close with their ${component.type} owner and stay closed on return`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true, timeout: 60_000 });
    const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    await openComponentFromWelcome(page, component);
    const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(secondTabId).toBeTruthy();
    expect(secondTabId).not.toBe(firstTabId);

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-workspace-toolbar-menu-owner-open' });
    }, firstTabId);
    await page.waitForFunction(tabId => window.Main?.session?.workspaceState?.activeTabId === tabId, firstTabId);
    await page.getByRole('tab', { name: 'General', exact: true }).click();
    const toolbar = page.locator(`#${component.pageId}:not([hidden]) .workspace-page__topbar[data-toolbar="${component.type}"] .workspace-toolbar`);
    const trigger = toolbar.locator('.workspace-toolbar__button--menu').first();
    const menu = trigger.locator('xpath=..').locator('.workspace-toolbar__menu-list');
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-workspace-toolbar-menu-owner-deactivate' });
    }, secondTabId);
    await page.waitForFunction(tabId => window.Main?.session?.workspaceState?.activeTabId === tabId, secondTabId);
    await page.evaluate(async tabId => {
      await window.Main.tabs.activateTab(tabId, { reason: 'e2e-workspace-toolbar-menu-owner-return' });
    }, firstTabId);
    await page.waitForFunction(tabId => window.Main?.session?.workspaceState?.activeTabId === tabId, firstTabId);
    await expect(menu).toBeHidden();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });
}
