const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function openBoxWorkspace(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) .workspace-toolbar'));
}

async function showSharedSymbolFixture(page) {
  await page.evaluate(() => {
    const activePage = document.querySelector('#boxPage:not([hidden])');
    const anchor = activePage?.querySelector('#boxFontHost');
    if (!anchor || !window.Shared?.symbolToolbar?.show) {
      throw new Error('Box Format toolbar fixture is unavailable.');
    }
    window.Shared.symbolToolbar.show({
      document,
      anchor,
      scopeId: 'box',
      target: anchor,
      scope: {
        label: 'Scope',
        value: 'global',
        options: [{ value: 'global', label: 'Global' }]
      },
      fillShape: {
        label: 'Fill/Shape',
        showShapePicker: false,
        getColor() { return '#808080'; },
        getShape() { return 'circle'; },
        onColorInput() {},
        onColorChange() {},
        onShapeChange() {}
      },
      border: {
        label: 'Border',
        getColor() { return '#000000'; },
        onColorInput() {},
        onColorChange() {},
        getWidth() { return 1.5; },
        onWidthChange() {}
      },
      size: { enabled: false },
      transparency: { enabled: false }
    });
  });
}

test('thickness text-selection drag keeps its owning Format toolbar visible', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await openBoxWorkspace(page);
  await showSharedSymbolFixture(page);

  const activePage = page.locator('#boxPage:not([hidden])');
  const toolbar = activePage.locator('.workspace-toolbar');
  const host = activePage.locator('.font-toolbar-host[data-font-toolbar-scope="box"]');
  const borderChip = host.locator('.shared-border-style-chip');

  await expect(host).toHaveClass(/font-toolbar-host--visible/);
  await borderChip.click();

  const picker = page.locator('.shared-color-picker[data-visible="1"]');
  const thickness = picker.locator('input[aria-label="Border thickness"]');
  await expect(picker).toBeVisible();
  await expect(thickness).toBeVisible();

  const box = await thickness.boundingBox();
  expect(box).toBeTruthy();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + Math.max(2, box.width - 3), y);
  await page.mouse.down();
  await page.mouse.move(Math.max(1, box.x - 80), y, { steps: 6 });
  await page.mouse.up();

  await expect(picker).toBeVisible();
  await expect(host).toHaveClass(/font-toolbar-host--visible/);
  await expect.poll(async () => toolbar.getAttribute('data-toolbar-active-section')).toMatch(/-format$/);

  await page.evaluate(() => {
    const outside = document.createElement('button');
    outside.id = 'colorPickerOwnershipOutside';
    outside.type = 'button';
    outside.textContent = 'outside';
    outside.style.position = 'fixed';
    outside.style.right = '4px';
    outside.style.bottom = '4px';
    outside.style.zIndex = '99999';
    document.body.appendChild(outside);
  });
  await page.locator('#colorPickerOwnershipOutside').click();
  await expect(page.locator('.shared-color-picker')).toHaveAttribute('data-visible', '0');
  await expect(host).not.toHaveClass(/font-toolbar-host--visible/);

  expect(issues.critical).toEqual([]);
});
