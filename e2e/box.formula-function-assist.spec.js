const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('box formula function suggestions and signature tooltip behave like excel assist', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

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

  const targetRow = await page.evaluate(() => {
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
    hot.gridApi?.startEditingCell?.({ rowIndex: visualRow, colKey: 'c4' });
    return visualRow;
  });

  const editorInput = page.locator('#hot input.ag-text-field-input').first();
  await expect(editorInput).toBeVisible();
  await editorInput.fill('=su');

  const suggestions = page.locator('.hot-formula-fn-suggest');
  await expect(suggestions).toBeVisible();
  await expect(suggestions.locator('.hot-formula-fn-item-name').first()).toHaveText(/SUM/i);

  await page.keyboard.press('Enter');
  await expect(editorInput).toHaveValue('=SUM(');

  const tooltip = page.locator('.hot-formula-fn-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('SUM');
  await expect(tooltip).toContainText('number1');

  await page.keyboard.type('A1,B1)');
  await page.keyboard.press('Enter');

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
    }, targetRow);
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toBe('7');

  expect(issues.critical).toEqual([]);
});
