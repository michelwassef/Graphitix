const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('new Scatter tables explain identifiers and point-label selection', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await expect.poll(() => page.evaluate(() => (
    window.Components?.scatter?.__getActiveHot?.()?.getData?.()?.[0]?.[0]
  ))).toBe('Labels');

  const selectionCell = page.locator(
    '#scatterHot .ag-floating-top .ag-cell',
    { hasText: /^Show$/ }
  ).first();
  await expect(selectionCell).toBeVisible();
  const selectionColumn = await selectionCell.evaluate(cell => {
    const colId = cell.getAttribute('col-id');
    const header = document.querySelector(`#scatterHot .ag-header-cell[col-id="${colId}"]`);
    const bodyCell = Array.from(
      document.querySelectorAll(`#scatterHot .ag-center-cols-container .ag-cell[col-id="${colId}"]`)
    ).find(candidate => {
      const rect = candidate.getBoundingClientRect();
      const checkboxRect = candidate.querySelector('.ag-checkbox-input-wrapper')?.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && checkboxRect?.width > 0;
    });
    const checkbox = bodyCell?.querySelector('.ag-checkbox-input-wrapper');
    const range = document.createRange();
    range.selectNodeContents(cell);
    const bodyRect = bodyCell?.getBoundingClientRect();
    const checkboxRect = checkbox?.getBoundingClientRect();
    return {
      cellWidth: cell.clientWidth,
      contentWidth: cell.scrollWidth,
      textWidth: range.getBoundingClientRect().width,
      headerText: String(header?.textContent || '').trim(),
      hasBodyCheckbox: !!checkbox,
      checkboxCenterDelta: bodyRect && checkboxRect
        ? Math.abs(
            (bodyRect.left + bodyRect.width / 2) -
            (checkboxRect.left + checkboxRect.width / 2)
          )
        : null
    };
  });
  expect(selectionColumn.contentWidth).toBeLessThanOrEqual(selectionColumn.cellWidth);
  expect(selectionColumn.cellWidth - selectionColumn.textWidth).toBeLessThanOrEqual(10);
  expect(selectionColumn.headerText).toBe('');
  expect(selectionColumn.hasBodyCheckbox).toBe(true);
  expect(selectionColumn.checkboxCenterDelta).toBeLessThanOrEqual(1);
});
