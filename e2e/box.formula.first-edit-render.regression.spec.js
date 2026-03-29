const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('box first UI edit commit renders value immediately', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.waitForFunction(() => {
    const box = window.Components?.box;
    if (!box || typeof box.__getState !== 'function') {
      return false;
    }
    const state = box.__getState();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    return !!(hot && hot.gridApi && typeof hot.setDataAtCell === 'function');
  });

  const target = await page.evaluate(() => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    if (!hot) {
      return null;
    }
    const targetCol = 10;
    let visualRow = 0;
    if (typeof hot.toPhysicalRow === 'function') {
      for (let candidate = 0; candidate < 40; candidate += 1) {
        if (hot.toPhysicalRow(candidate) === 1) {
          visualRow = candidate;
          break;
        }
      }
    }
    hot.setDataAtCell([[visualRow, targetCol, '']], 'e2e-seed-clear');
    hot.gridApi?.ensureColumnVisible?.(`c${targetCol}`);
    return { row: visualRow, col: targetCol };
  });
  expect(target).toBeTruthy();
  expect(target.row).toBeGreaterThanOrEqual(0);
  expect(target.col).toBeGreaterThanOrEqual(0);

  const cell = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${target.row}"] .ag-cell[col-id="c${target.col}"]`).first();
  await expect(cell).toBeVisible();
  await cell.click();
  await page.keyboard.type('9');
  await page.keyboard.press('Enter');

  await expect.poll(async () => {
    return await page.evaluate(({ rowIndex, colIndex }) => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      const api = hot?.gridApi;
      if (!api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function') {
        return '';
      }
      const node = api.getDisplayedRowAtIndex(rowIndex);
      if (!node) {
        return '';
      }
      const value = api.getValue(`c${colIndex}`, node);
      return value == null ? '' : String(value).trim();
    }, { rowIndex: target.row, colIndex: target.col });
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toBe('9');

  expect(issues.critical).toEqual([]);
});
