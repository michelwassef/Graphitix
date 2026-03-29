const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('box keeps selected-cell background color during inline edit', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
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

  const colors = await page.evaluate(() => {
    const box = window.Components.box;
    const state = box.__getState();
    const hot = state.ensureHotForActiveTab?.() || state.hot;
    let rowIndex = 0;
    if (typeof hot.toPhysicalRow === 'function') {
      for (let candidate = 0; candidate < 40; candidate += 1) {
        if (hot.toPhysicalRow(candidate) === 1) {
          rowIndex = candidate;
          break;
        }
      }
    }
    const colIndex = 1;
    hot.setDataAtCell([[rowIndex, colIndex, '42']], 'e2e-seed-inline-bg');
    hot.selectCell?.(rowIndex, colIndex);
    hot.gridApi?.refreshCells?.({ force: true, suppressFlash: true });

    const getCell = () => document.querySelector(`#hot .ag-center-cols-container .ag-row[row-index="${rowIndex}"] .ag-cell[col-id="c${colIndex}"]`);
    const selectedCell = getCell();
    const selectedColor = selectedCell ? getComputedStyle(selectedCell).backgroundColor : '';

    hot.gridApi?.startEditingCell?.({ rowIndex, colKey: `c${colIndex}` });
    const editingCell = getCell();
    const editingColor = editingCell ? getComputedStyle(editingCell).backgroundColor : '';

    return { selectedColor, editingColor };
  });

  expect(colors.selectedColor).toBeTruthy();
  expect(colors.editingColor).toBeTruthy();
  expect(colors.editingColor).toBe(colors.selectedColor);
});