const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('Box grouped editable headers meet the first data row without a body-model gap', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  const boxPage = page.locator('#boxPage:not([hidden])');
  await boxPage.locator('#boxTableFormat').selectOption('grouped');
  await boxPage.locator('#boxLoadExample').click();

  const table = boxPage.locator('#hot');
  const lastPinnedRow = table.locator('.ag-floating-top-viewport .ag-row[row-index="t-1"]');
  const firstBodyRow = table.locator('.ag-center-cols-container .ag-row[row-index="0"]');
  await expect(lastPinnedRow).toBeVisible();
  await expect(firstBodyRow).toBeVisible();

  const seam = await page.evaluate(() => {
    const root = document.querySelector('#boxPage:not([hidden]) #hot');
    const pinned = root?.querySelector('.ag-floating-top-viewport .ag-row[row-index="t-1"]');
    const body = root?.querySelector('.ag-center-cols-container .ag-row[row-index="0"]');
    const pinnedRect = pinned?.getBoundingClientRect();
    const bodyRect = body?.getBoundingClientRect();
    return {
      gap: pinnedRect && bodyRect ? bodyRect.top - pinnedRect.bottom : null,
      ghostRows: root?.querySelectorAll('.hot-pinned-ghost-row').length ?? null
    };
  });

  expect(seam.ghostRows).toBe(0);
  expect(seam.gap).not.toBeNull();
  expect(Math.abs(seam.gap)).toBeLessThanOrEqual(0.25);

  const firstBodyCell = firstBodyRow.locator('.ag-cell[col-id="c0"]');
  await firstBodyCell.dblclick();
  const editor = firstBodyCell.locator('input');
  await expect(editor).toBeVisible();
  await editor.fill('19.75');
  await editor.press('Enter');

  await expect.poll(() => page.evaluate(() => {
    const workspace = window.Main?.session?.workspaceState;
    const tabId = workspace?.activeTabId;
    const hot = tabId ? window.Shared?.hot?.__tabTablePools?.box?.byTab?.[tabId]?.instance : null;
    return hot?.getDataAtCell?.(2, 0);
  })).toBe('19.75');
  expect(issues.critical).toEqual([]);
});
