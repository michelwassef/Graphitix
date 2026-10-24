const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { expectTargetsAtLeast24 } = require('../helpers/targetSizeAssertions');

async function expectPopupWithinViewport(page, popup){
  const bounds = await popup.boundingBox();
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  expect(bounds).not.toBeNull();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
}

test('box formula function suggestions and signature tooltip behave like excel assist', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.waitForFunction(() => {
    const box = window.Components?.box;
    if(!box || typeof box.__getState !== 'function'){
      return false;
    }
    const state = box.__getState();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    return !!(hot && hot.gridApi && typeof hot.setDataAtCell === 'function');
  });

  const target = await page.evaluate(() => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    let visualRow = 0;
    if(typeof hot.toPhysicalRow === 'function'){
      for(let candidate = 0; candidate < 40; candidate += 1){
        if(hot.toPhysicalRow(candidate) === 1){
          visualRow = candidate;
          break;
        }
      }
    }
    hot.setDataAtCell([
      [visualRow, 0, '2'],
      [visualRow, 1, '5'],
      [visualRow, 4, '']
    ], 'e2e-function-assist-seed');
    const bodyRow = visualRow - (Number(hot.getSettings?.().fixedRowsTop) || 0);
    hot.gridApi?.startEditingCell?.({ rowIndex: bodyRow, colKey: 'c4' });
    return { visualRow, bodyRow };
  });

  const editorInput = page.locator('#hot input.ag-text-field-input').first();
  await expect(editorInput).toBeVisible();
  await editorInput.fill('=a');

  const suggestions = page.locator('.hot-formula-fn-suggest');
  await expect(suggestions).toBeVisible();
  await expectPopupWithinViewport(page, suggestions);
  await expect(editorInput).toHaveRole('combobox');
  await expect(editorInput).toHaveAccessibleName(/row \d+ cell editor/);
  await expect(editorInput).toHaveAttribute('aria-autocomplete', 'list');
  await expect(editorInput).toHaveAttribute('aria-haspopup', 'listbox');
  await expect(editorInput).toHaveAttribute('aria-expanded', 'true');
  const listboxId = await suggestions.getAttribute('id');
  expect(listboxId).toBeTruthy();
  await expect(editorInput).toHaveAttribute('aria-controls', listboxId);
  await expectTargetsAtLeast24(suggestions.getByRole('option'), 'Box formula function suggestions');
  await expect(suggestions.locator('.hot-formula-fn-item-name').first()).toHaveText(/AVERAGE/i);

  const options = suggestions.getByRole('option');
  expect(await options.count()).toBeGreaterThan(1);
  await expect(editorInput).toHaveAttribute('aria-activedescendant', `${listboxId}-option-0`);
  await expect(options.first()).toHaveAttribute('aria-selected', 'true');
  await expect(options.first()).toHaveAttribute('tabindex', '-1');
  await editorInput.press('ArrowDown');
  await expect(editorInput).toHaveAttribute('aria-activedescendant', `${listboxId}-option-1`);
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(options.first()).toHaveAttribute('aria-selected', 'false');
  await editorInput.press('ArrowUp');
  await expect(editorInput).toHaveAttribute('aria-activedescendant', `${listboxId}-option-0`);
  await editorInput.press('Escape');
  await expect(suggestions).toBeHidden();
  await expect(editorInput).toBeFocused();
  await expect(editorInput).toHaveValue('=a');
  await expect(editorInput).toHaveAttribute('aria-expanded', 'false');
  await expect(editorInput).not.toHaveAttribute('aria-activedescendant');

  await editorInput.fill('=su');
  await expect(suggestions).toBeVisible();

  await editorInput.press('Enter');
  await expect(editorInput).toHaveValue('=SUM(');
  await expect(editorInput).toHaveAttribute('aria-expanded', 'false');
  await expect(editorInput).not.toHaveAttribute('aria-activedescendant');

  const tooltip = page.locator('.hot-formula-fn-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute('role', 'tooltip');
  await expect(tooltip).toHaveAttribute('aria-hidden', 'false');
  const tooltipId = await tooltip.getAttribute('id');
  expect(tooltipId).toBeTruthy();
  expect((await editorInput.getAttribute('aria-describedby') || '').split(/\s+/)).toContain(tooltipId);
  await expectPopupWithinViewport(page, tooltip);
  await expect(tooltip).toContainText('SUM');
  await expect(tooltip).toContainText('number1');

  await editorInput.fill('=SUM');
  await expect(tooltip).toBeHidden();
  expect((await editorInput.getAttribute('aria-describedby') || '').split(/\s+/)).not.toContain(tooltipId);

  await editorInput.fill('=SUM(');
  await expect(tooltip).toBeVisible();

  await page.keyboard.type('A1,B1)');
  await page.keyboard.press('Enter');
  await expect(tooltip).toHaveCount(0);

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      const api = hot?.gridApi;
      if(!api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function'){
        return '';
      }
      const node = api.getDisplayedRowAtIndex(rowIndex);
      if(!node){
        return '';
      }
      const resolved = api.getValue('c4', node);
      return resolved == null ? '' : String(resolved).trim();
    }, target.bodyRow);
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toBe('7');

  expect(issues.critical).toEqual([]);
});

test('Box formula assist popups close when their same-type workspace owner deactivates', async ({ page }) => {
  test.setTimeout(180_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const component = { type: 'box', pageId: 'boxPage' };
  await openComponentFromWelcome(page, component, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

  await openComponentFromWelcome(page, component, { loadExample: true });
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(firstTabId).toBeTruthy();
  expect(secondTabId).toBeTruthy();
  expect(secondTabId).not.toBe(firstTabId);

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-box-formula-assist-owner-restore' });
  }, firstTabId);
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });

  const target = await page.evaluate(() => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    if(!hot?.gridApi || typeof hot.setDataAtCell !== 'function'){
      throw new Error('Active Box grid is unavailable for formula owner test');
    }
    let visualRow = 0;
    for(let candidate = 0; candidate < 40; candidate += 1){
      if(typeof hot.toPhysicalRow !== 'function' || hot.toPhysicalRow(candidate) === 1){
        visualRow = candidate;
        break;
      }
    }
    hot.setDataAtCell([[visualRow, 0, '2'], [visualRow, 1, '5'], [visualRow, 4, '']], 'e2e-formula-owner-seed');
    const bodyRow = visualRow - (Number(hot.getSettings?.().fixedRowsTop) || 0);
    hot.gridApi.startEditingCell({ rowIndex: bodyRow, colKey: 'c4' });
    return { bodyRow };
  });

  const editor = page.locator('#hot input.ag-text-field-input').first();
  await expect(editor).toBeVisible();
  await editor.fill('=a');
  const suggestions = page.locator('body > .hot-formula-fn-suggest');
  await expect(suggestions).toBeVisible();

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-box-formula-assist-owner-deactivate' });
  }, secondTabId);
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  await expect(suggestions).toBeHidden();

  await page.evaluate(bodyRow => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    hot?.gridApi?.startEditingCell?.({ rowIndex: bodyRow, colKey: 'c4' });
  }, target.bodyRow);
  await expect(editor).toBeVisible();
  await editor.fill('=SUM(');
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toHaveAttribute('role', 'tooltip');
  const tooltipId = await tooltip.getAttribute('id');
  expect((await editor.getAttribute('aria-describedby') || '').split(/\s+/)).toContain(tooltipId);

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-box-formula-tooltip-owner-deactivate' });
  }, secondTabId);
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  await expect(tooltip).toHaveCount(0);

  await page.evaluate(async tabId => {
    await window.Main.tabs.activateTab(tabId, { reason: 'e2e-box-formula-tooltip-owner-return' });
  }, firstTabId);
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  await expect(tooltip).toHaveCount(0);
});
