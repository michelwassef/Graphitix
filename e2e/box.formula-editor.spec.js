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
      [visualRow, 0, '12'],
      [visualRow, 1, ''],
      [visualRow, 2, '15'],
      [visualRow, 3, '']
    ], 'e2e-seed');
    hot.gridApi?.startEditingCell?.({ rowIndex: visualRow, colKey: 'c3' });
    return visualRow;
  });

  const editorInput = page.locator('#hot input.ag-text-field-input').first();
  await expect(editorInput).toBeVisible();
  await editorInput.fill('=A1+B1');

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      const row = document.querySelector(`#hot .ag-center-cols-container .ag-row[row-index="${rowIndex}"]`);
      if (!row) {
        return false;
      }
      const a = row.querySelector('.ag-cell[col-id="c0"]');
      const b = row.querySelector('.ag-cell[col-id="c1"]');
      return !!a && !!b && a.className.includes('hot-formula-ref-1') && b.className.includes('hot-formula-ref-2');
    }, targetRow);
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBe(true);

  const classSnapshot = await page.evaluate((rowIndex) => {
    const row = document.querySelector(`#hot .ag-center-cols-container .ag-row[row-index="${rowIndex}"]`);
    if (!row) {
      return null;
    }
    const a = row.querySelector('.ag-cell[col-id="c0"]');
    const b = row.querySelector('.ag-cell[col-id="c1"]');
    const c = row.querySelector('.ag-cell[col-id="c2"]');
    return {
      a: a ? a.className : '',
      b: b ? b.className : '',
      c: c ? c.className : ''
    };
  }, targetRow);

  expect(classSnapshot).toBeTruthy();
  expect(classSnapshot.a).toContain('hot-formula-ref-1');
  expect(classSnapshot.b).toContain('hot-formula-ref-2');
  expect(classSnapshot.c).not.toContain('hot-formula-ref-2');

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
      const value = api.getValue('c3', node);
      return value == null ? '' : String(value).trim();
    }, targetRow);
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toBe('12');

  const remainingHighlights = await page.evaluate(() => {
    return document.querySelectorAll('#hot .ag-cell.hot-formula-ref').length;
  });
  expect(remainingHighlights).toBe(0);

  expect(issues.critical).toEqual([]);
});
