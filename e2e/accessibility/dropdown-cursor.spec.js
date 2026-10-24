const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');
const { activateToolbarSection } = require('../helpers/uiDriver');

async function expectCustomMenuPointers(page) {
  const failures = await page.locator([
    '[role="menuitem"]', '[role="menuitemcheckbox"]', '[role="menuitemradio"]',
    '[role="option"]', '.font-controls-panel__select-option',
    '.workspace-toolbar__menu-item', '.tab-context-menu__item', '.welcome-picker__option',
    '.graph-overlay-picker__option'
  ].join(',')).evaluateAll(items => items.flatMap(item => {
    if (item.matches('option')) return [];
    return [item, ...item.querySelectorAll('span, svg, path')].flatMap(node => {
      const cursor = getComputedStyle(node).cursor;
      return ['auto', 'text'].includes(cursor) ? [{
        item: item.className, text: item.textContent.slice(0, 60), cursor
      }] : [];
    });
  }));
  expect(failures).toEqual([]);
}

for (const type of ['box', 'line', 'scatter']) {
  test(`${type} shared toolbar and overlay dropdown labels retain action cursors`, async ({ page }) => {
    test.setTimeout(90_000);
    const component = COMPONENT_CATALOG.find(entry => entry.type === type);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    for (const section of ['General', 'Data', 'Format', 'Help']) {
      await activateToolbarSection(page, component, section);
      const triggers = await page.locator([
        'button[aria-haspopup="menu"]:visible:enabled',
        'button[aria-haspopup="listbox"]:visible:enabled',
        '.graph-overlay-picker__trigger:visible:enabled'
      ].join(',')).evaluateAll(nodes => nodes.map(node => ({ id: node.id, name: node.getAttribute('aria-label') || node.textContent.trim() })));
      for (const descriptor of triggers) {
        const trigger = descriptor.id
          ? page.locator(`[id="${descriptor.id}"]`).first()
          : page.getByRole('button', { name: descriptor.name, exact: true }).first();
        if (!await trigger.isVisible()) continue;
        await trigger.click();
        await expectCustomMenuPointers(page);
        await page.keyboard.press('Escape');
        }
    }
  });
}

for (const component of COMPONENT_CATALOG) {
  test(`${component.type} dropdown text uses a selection cursor and retains keyboard navigation`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true });

    const root = page.locator(`#${component.pageId}:not([hidden])`);
    await expectCustomMenuPointers(page);
    const failures = await root.locator('select, option, optgroup').evaluateAll(nodes => nodes.flatMap(node => {
      const style = getComputedStyle(node);
      const allowed = node.matches(':disabled') ? ['default', 'not-allowed'] : ['pointer'];
      return allowed.includes(style.cursor) && style.userSelect === 'none' ? [] : [{
        tag: node.tagName, id: node.id, text: node.textContent.slice(0, 60),
        cursor: style.cursor, userSelect: style.userSelect
      }];
    }));
    expect(failures).toEqual([]);

    // Exercise the actual popup, rather than only checking closed controls.
    const dropdown = root.locator('select:visible:enabled:not(.export-select):not([aria-hidden="true"])').filter({ has: page.locator('option:nth-child(2)') }).first();
    await expect(dropdown).toBeVisible();
    const initial = await dropdown.inputValue();
    const supportsPicker = await page.evaluate(() => CSS.supports('appearance', 'base-select'));
    if (supportsPicker) {
      await dropdown.click();
      const option = dropdown.locator('option:enabled').first();
      await option.hover();
      await expect(option).toHaveCSS('cursor', 'pointer');
      await expect(option).toHaveCSS('user-select', 'none');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Escape');
      await expect(dropdown).toHaveValue(initial);
    }
    // Editing fields inside menus must remain editable/selectable.
    const editableStyles = await root.locator('input[type="text"], textarea').evaluateAll(nodes =>
      nodes.map(node => getComputedStyle(node).userSelect));
    expect(editableStyles.every(value => value === 'text')).toBe(true);
  });
}
