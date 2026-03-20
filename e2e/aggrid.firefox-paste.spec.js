const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides, openComponentFromWelcome } = require('./helpers/workspaceHarness');

test('scatter AG Grid pastes clipboard text with Ctrl+V', async ({ page, context }) => {
  await installLocalCdnOverrides(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:4173' }).catch(() => {});

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await page.waitForSelector('#scatterHot .ag-root', { timeout: 20000 });

  await page.evaluate(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    hot?.setDataAtCell?.(0, 0, '');
    hot?.setDataAtCell?.(0, 1, '');
    hot?.selectCell?.(0, 0, 0, 0);
  });

  const targetCell = page.locator('#scatterHot [role=\"gridcell\"]').nth(2);
  await expect(targetCell, 'Expected a visible scatter data cell').toBeVisible();
  await targetCell.click({ force: true });
  const clipboardWrite = await page.evaluate(async () => {
    try {
      await navigator.clipboard.writeText('11\t22');
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err?.message || String(err), name: err?.name || null };
    }
  });

  await page.keyboard.press('Control+V');
  await page.waitForTimeout(800);

  const state = await page.evaluate(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    return {
      cell00: hot?.getDataAtCell?.(0, 0),
      cell01: hot?.getDataAtCell?.(0, 1),
      selected: hot?.getSelectedLast?.()
    };
  });
  expect(clipboardWrite.ok).toBe(true);
  expect(state.cell00).toBe('11');
  expect(state.cell01).toBe('22');
  expect(state.selected).toBeTruthy();
});
