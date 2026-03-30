const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('scatter formulas display resolved value and reopen as raw formula with highlights', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await page.waitForFunction(() => {
    const scatter = window.Components?.scatter;
    const hot = scatter?.__ensureHotForActiveTab?.();
    return !!(hot && hot.gridApi && typeof hot.setDataAtCell === 'function');
  });

  const targetRow = await page.evaluate(() => {
    const scatter = window.Components.scatter;
    const hot = scatter.__ensureHotForActiveTab();
    let visualRow = 1;
    if(typeof hot.toPhysicalRow === 'function'){
      for(let candidate = 0; candidate < 40; candidate += 1){
        if(hot.toPhysicalRow(candidate) === 1){
          visualRow = candidate;
          break;
        }
      }
    }
    hot.setDataAtCell([
      [visualRow, 1, '5'],
      [visualRow, 2, '7'],
      [visualRow, 3, '']
    ], 'e2e-seed-scatter-formula');
    hot.gridApi?.startEditingCell?.({ rowIndex: visualRow, colKey: 'c3' });
    return visualRow;
  });

  const editorInput = page.locator('.ag-cell-inline-editing input.ag-text-field-input, .ag-cell-inline-editing input, .ag-popup-editor input.ag-text-field-input, .ag-popup-editor input').first();
  await expect(editorInput).toBeVisible();
  await editorInput.fill('=B1+C1');

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const scatter = window.Components?.scatter;
      const hot = scatter?.__ensureHotForActiveTab?.();
      const root = hot?.rootElement;
      if(!root){
        return false;
      }
      const bOutline = root.querySelector('.hot-formula-ref-outline[data-row="1"][data-col="1"]');
      const cOutline = root.querySelector('.hot-formula-ref-outline[data-row="1"][data-col="2"]');
      return !!bOutline && !!cOutline;
    });
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBe(true);

  await editorInput.press('Enter');

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      const scatter = window.Components?.scatter;
      const hot = scatter?.__ensureHotForActiveTab?.();
      const api = hot?.gridApi;
      if(!hot || !api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function'){
        return null;
      }
      const node = api.getDisplayedRowAtIndex(rowIndex);
      if(!node){
        return null;
      }
      const displayed = api.getValue('c3', node);
      const raw = hot.getDataAtCell(rowIndex, 3);
      return {
        displayed: displayed == null ? '' : String(displayed).trim(),
        raw: raw == null ? '' : String(raw).trim()
      };
    }, targetRow);
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toEqual({ displayed: '12', raw: '=B1+C1' });

  await page.evaluate((rowIndex) => {
    const scatter = window.Components.scatter;
    const hot = scatter.__ensureHotForActiveTab();
    hot.gridApi?.startEditingCell?.({ rowIndex, colKey: 'c3' });
  }, targetRow);

  await expect(editorInput).toBeVisible();
  await expect(editorInput).toHaveValue('=B1+C1');

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const scatter = window.Components?.scatter;
      const hot = scatter?.__ensureHotForActiveTab?.();
      const root = hot?.rootElement;
      if(!root){
        return false;
      }
      const bOutline = root.querySelector('.hot-formula-ref-outline[data-row="1"][data-col="1"]');
      const cOutline = root.querySelector('.hot-formula-ref-outline[data-row="1"][data-col="2"]');
      return !!bOutline && !!cOutline;
    });
  }, {
    timeout: 10_000,
    intervals: [200, 400, 800]
  }).toBe(true);

  await editorInput.press('Escape');

  await expect.poll(async () => {
    return await page.evaluate((rowIndex) => {
      const scatter = window.Components?.scatter;
      const hot = scatter?.__ensureHotForActiveTab?.();
      const api = hot?.gridApi;
      if(!api || typeof api.getDisplayedRowAtIndex !== 'function' || typeof api.getValue !== 'function'){
        return '';
      }
      const node = api.getDisplayedRowAtIndex(rowIndex);
      if(!node){
        return '';
      }
      const value = api.getValue('c3', node);
      return value == null ? '' : String(value).trim();
    }, targetRow);
  }).toBe('12');

  expect(issues.critical).toEqual([]);
});
