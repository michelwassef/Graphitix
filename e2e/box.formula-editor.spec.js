const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('box formula references highlight correct cells and resolve on first enter', async ({ page }) => {
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
    return !!(hot && typeof hot.setDataAtCell === 'function');
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
    hot.setDataAtCell([
      [visualRow, 0, '1'],
      [visualRow, 1, ''],
      [visualRow, 2, '3'],
      [visualRow, 3, '4'],
      [visualRow, 4, '']
    ], 'e2e-seed');
    hot.gridApi?.startEditingCell?.({ rowIndex: visualRow, colKey: 'c4' });
    return visualRow;
  });

  const editorInput = page.locator('#hot input.ag-text-field-input').first();
  await expect(editorInput).toBeVisible();
  await page.keyboard.type('=A1+b1', { delay: 30 });

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      if (!document.querySelector(`#hot .ag-row[row-index="${rowIndex}"]`)) {
        return false;
      }
      const bOutline = document.querySelector('#hot .box-formula-ref-outline[data-row="1"][data-col="1"]');
      const cOutline = document.querySelector('#hot .box-formula-ref-outline[data-row="1"][data-col="2"]');
      return !!bOutline && !cOutline;
    }, targetRow);
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBe(true);

  const classSnapshot = await page.evaluate((rowIndex) => {
    const row = document.querySelector(`#hot .ag-row[row-index="${rowIndex}"]`);
    if (!row) {
      return null;
    }
    const hasOutline = (targetRowIndex, targetColIndex) => {
      return !!document.querySelector(`#hot .box-formula-ref-outline[data-row="${targetRowIndex}"][data-col="${targetColIndex}"]`);
    };
    return {
      aHasRef1: hasOutline(1, 0),
      bHasRef2: hasOutline(1, 1),
      cHasRef2: hasOutline(1, 2)
    };
  }, targetRow);

  expect(classSnapshot).toBeTruthy();
  expect(classSnapshot.aHasRef1).toBe(true);
  expect(classSnapshot.bHasRef2).toBe(true);
  expect(classSnapshot.cHasRef2).toBe(false);

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
      const value = api.getValue('c4', node);
      return value == null ? '' : String(value).trim();
    }, targetRow);
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toBe('1');

  const remainingHighlights = await page.evaluate(() => {
    return document.querySelectorAll('#hot .box-formula-ref-outline').length;
  });
  expect(remainingHighlights).toBe(0);

  expect(issues.critical).toEqual([]);
});
