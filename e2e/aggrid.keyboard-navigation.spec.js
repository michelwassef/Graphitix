const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('AG Grid arrow keys move the highlighted cell instead of scrolling a visible neighbor', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    return !!(
      hot?.gridApi
      && root?.querySelector?.('.ag-center-cols-viewport')
      && root.querySelector('.ag-center-cols-container .ag-row[row-index] .ag-cell[col-id^="c"]')
    );
  });

  const target = await page.evaluate(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const viewport = root?.querySelector?.('.ag-center-cols-viewport');
    if(!hot || !root || !viewport){
      return null;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const visibleRows = Array.from(root.querySelectorAll('.ag-center-cols-container .ag-row[row-index]'))
      .map(row => Number(row.getAttribute('row-index')))
      .filter(Number.isInteger)
      .sort((a, b) => a - b);
    const row = visibleRows.find(value => visibleRows.includes(value - 1) && visibleRows.includes(value + 1))
      ?? visibleRows.find(value => visibleRows.includes(value + 1))
      ?? null;
    if(!Number.isInteger(row)){
      return null;
    }

    const rowNode = root.querySelector(`.ag-center-cols-container .ag-row[row-index="${row}"]`);
    const visibleCols = Array.from(rowNode?.querySelectorAll?.('.ag-cell[col-id^="c"]') || [])
      .map(cell => {
        const colId = cell.getAttribute('col-id');
        const col = Number(String(colId || '').slice(1));
        const rect = cell.getBoundingClientRect();
        const fullyVisible = rect.left >= viewportRect.left - 0.5 && rect.right <= viewportRect.right + 0.5;
        return { col, fullyVisible };
      })
      .filter(entry => Number.isInteger(entry.col) && entry.fullyVisible)
      .sort((a, b) => a.col - b.col);
    const visibleSet = new Set(visibleCols.map(entry => entry.col));
    const col = visibleCols
      .map(entry => entry.col)
      .find(value => visibleSet.has(value - 1) && visibleSet.has(value + 1))
      ?? visibleCols.map(entry => entry.col).find(value => visibleSet.has(value + 1))
      ?? null;
    if(!Number.isInteger(col)){
      return null;
    }

    return { row, col };
  });

  expect(target).toBeTruthy();
  const cell = page.locator(
    `#scatterPage:not([hidden]) .ag-center-cols-container .ag-row[row-index="${target.row}"] .ag-cell[col-id="c${target.col}"]`
  ).first();
  await expect(cell).toBeVisible();
  await cell.click();

  const readState = () => page.evaluate(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const root = hot?.rootElement || document.querySelector('#scatterPage:not([hidden]) #scatterHot');
    const horizontal = root?.querySelector?.('.ag-body-horizontal-scroll-viewport');
    return {
      selection: hot?.getSelectedLast?.() || null,
      scrollLeft: Number(horizontal?.scrollLeft) || 0
    };
  });

  await expect.poll(async () => (await readState()).selection).toEqual([
    target.row,
    target.col,
    target.row,
    target.col
  ]);

  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await readState()).selection).toEqual([
    target.row + 1,
    target.col,
    target.row + 1,
    target.col
  ]);

  await page.keyboard.press('ArrowUp');
  await expect.poll(async () => (await readState()).selection).toEqual([
    target.row,
    target.col,
    target.row,
    target.col
  ]);

  const horizontalBefore = (await readState()).scrollLeft;
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await readState()).selection).toEqual([
    target.row,
    target.col + 1,
    target.row,
    target.col + 1
  ]);
  expect((await readState()).scrollLeft).toBe(horizontalBefore);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await readState()).selection).toEqual([
    target.row,
    target.col,
    target.row,
    target.col
  ]);
  expect((await readState()).scrollLeft).toBe(horizontalBefore);

  expect(issues.critical).toEqual([]);
});
