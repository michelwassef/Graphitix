const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function captureLine3dTable(page) {
  return page.evaluate(() => {
    const line = window.Components?.line;
    const hot = line?.getHot?.();
    const matrix = hot?.getData?.() || [];
    const lastMeaningfulColumn = matrix.reduce((last, row) => {
      if(!Array.isArray(row)) return last;
      for(let col = row.length - 1; col >= 0; col -= 1){
        if(row[col] != null && String(row[col]).trim()){
          return Math.max(last, col);
        }
      }
      return last;
    }, -1);
    return {
      seriesCount: line?.__testHooks?.inferLine3dSeriesCount?.(matrix),
      meaningfulColumns: lastMeaningfulColumn + 1,
      datasetHeaders: (matrix[0] || []).slice(0, 18),
      axisHeaders: (matrix[1] || []).slice(0, 18),
      firstDataRows: matrix.slice(2, 5).map(row => (row || []).slice(0, 18)),
      signature: JSON.stringify(matrix)
    };
  });
}

test('Line 3D example load keeps its canonical table stable', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });

  await page.locator('#lineTableFormat').selectOption('3d');
  await page.locator('#lineViewMode').selectOption('3d');
  await clickExampleButtonIfPresent(page, 'lineLoadExample');
  await expect(page.locator('#linePlot svg[data-view-mode="3d"]')).toBeVisible();

  await expect.poll(async () => {
    const snapshot = await captureLine3dTable(page);
    return [snapshot.seriesCount, snapshot.meaningfulColumns, snapshot.firstDataRows[0]?.[0]];
  }, { timeout: 15_000 }).toEqual([6, 18, 0.25]);

  const settled = await captureLine3dTable(page);
  await page.waitForTimeout(1000);
  const later = await captureLine3dTable(page);

  expect(later.signature).toBe(settled.signature);
  expect(later.datasetHeaders.filter((_, index) => index % 3 === 0)).toEqual([
    'Subject 1', 'Subject 2', 'Subject 3', 'Subject 4', 'Subject 5', 'Subject 6'
  ]);
  expect(later.axisHeaders.slice(0, 3)).toEqual([
    'Time (h)', 'Concentration (µg/mL)', 'Subject index'
  ]);
  expect(later.firstDataRows.every(row => typeof row[0] === 'number')).toBe(true);
});
