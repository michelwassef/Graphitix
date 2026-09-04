const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('pasting into the Venn header row keeps the table at the top', async ({ page, context }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: new URL(page.url()).origin
  });
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true });
  await page.waitForFunction(() => {
    const id = window.Main?.session?.workspaceState?.activeTabId;
    return !!(id && window.Shared?.hot?.__tabTablePools?.venn?.byTab?.[id]?.instance?.gridApi);
  });

  const initialRows = await page.evaluate(() => {
    const id = window.Main.session.workspaceState.activeTabId;
    return window.Shared.hot.__tabTablePools.venn.byTab[id].instance.countRows();
  });
  const headerCell = page.locator('#vennHot .ag-floating-top .ag-cell[col-id="c0"]').first();
  await headerCell.click({ force: true });
  await page.evaluate(async text => navigator.clipboard.writeText(text), 'Paste 0\nPaste 1\nPaste 2\nPaste 3');
  await page.keyboard.press('Control+V');

  await page.waitForFunction(() => {
    const id = window.Main?.session?.workspaceState?.activeTabId;
    const hot = id ? window.Shared?.hot?.__tabTablePools?.venn?.byTab?.[id]?.instance : null;
    return hot?.getDataAtCell?.(3, 0) === 'Paste 3';
  });
  await page.waitForTimeout(400);

  const settled = await page.evaluate(() => {
    const id = window.Main.session.workspaceState.activeTabId;
    const hot = window.Shared.hot.__tabTablePools.venn.byTab[id].instance;
    const viewport = document.querySelector('#vennHot .ag-body-viewport');
    return {
      rows: hot.countRows(),
      scrollTop: viewport?.scrollTop ?? null,
      firstDisplayedRow: hot.gridApi.getFirstDisplayedRowIndex?.() ?? null
    };
  });
  expect(settled.rows).toBe(initialRows);
  expect(settled.scrollTop).toBe(0);
  expect(settled.firstDisplayedRow).toBe(0);
});
