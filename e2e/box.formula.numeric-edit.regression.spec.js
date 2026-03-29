const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('box plain numeric edit persists and remains visible with formula engine enabled', async ({ page }) => {
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

  const targetRow = await page.evaluate(() => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
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
    hot.gridApi?.startEditingCell?.({ rowIndex: visualRow, colKey: 'c0' });
    return visualRow;
  });

  const editorInput = page.locator('#hot input.ag-text-field-input').first();
  await expect(editorInput).toBeVisible();
  await editorInput.fill('7');
  await editorInput.press('Enter');

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      const api = hot?.gridApi;
      if (!api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function') {
        return null;
      }
      const node = api.getDisplayedRowAtIndex(rowIndex);
      if (!node) {
        return null;
      }
      const display = api.getValue('c0', node);
      const dataAtCell = hot.getDataAtCell?.(rowIndex, 0);
      const physicalRow = typeof hot.toPhysicalRow === 'function' ? hot.toPhysicalRow(rowIndex) : rowIndex;
      const model = state?.formulaModel || null;
      const modelRaw = model?.getRawAt?.(physicalRow, 0);
      const modelResolved = model?.getResolvedAt?.(physicalRow, 0);
      return {
        display: display == null ? '' : String(display),
        dataAtCell: dataAtCell == null ? '' : String(dataAtCell),
        modelRaw: modelRaw == null ? '' : String(modelRaw),
        modelResolved: modelResolved == null ? '' : String(modelResolved)
      };
    }, targetRow);
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toEqual({ display: '7', dataAtCell: '7', modelRaw: '7', modelResolved: '7' });

  expect(issues.critical).toEqual([]);
});