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

  const targetRow = await page.evaluate(() => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    if (!hot) {
      return -1;
    }
    let visualRow = 0;
    if (typeof hot.toPhysicalRow === 'function') {
      for (let candidate = 0; candidate < 40; candidate += 1) {
        if (hot.toPhysicalRow(candidate) === 1) {
          visualRow = candidate;
          break;
        }
      }
    }
    hot.setDataAtCell([[visualRow, 0, '']], 'e2e-seed-clear');
    return visualRow;
  });
  expect(targetRow).toBeGreaterThanOrEqual(0);

  const cell = page.locator(`#hot .ag-center-cols-container .ag-row[row-index="${targetRow}"] .ag-cell[col-id="c0"]`).first();
  await expect(cell).toBeVisible();
  await cell.dblclick();

  const editorInput = page.locator('#hot input.ag-text-field-input').first();
  await expect(editorInput).toBeVisible();
  await editorInput.fill('9');
  await editorInput.press('Enter');

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
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
      const value = api.getValue('c0', node);
      return value == null ? '' : String(value).trim();
    }, targetRow);
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toBe('9');

  expect(issues.critical).toEqual([]);
});
