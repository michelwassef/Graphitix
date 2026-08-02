const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function captureScatterTable(page) {
  return page.evaluate(() => {
    const activeTab = window.Main?.session?.getActiveTab?.() || window.Main?.tabs?.getActiveTab?.();
    const matrix = activeTab?.payload?.data || [];
    const nonEmptyRows = matrix.filter(row => Array.isArray(row)
      && row.some(value => value != null && String(value).trim()));
    return {
      header: (nonEmptyRows[0] || []).slice(0, 5),
      rowCount: nonEmptyRows.length,
      firstDataRow: (nonEmptyRows[1] || []).slice(0, 5),
      signature: JSON.stringify(matrix)
    };
  });
}

test('Scatter 3D example load does not rewrite its table schema', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });
  await page.locator('#scatterViewMode').selectOption('3d');
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');

  await expect.poll(async () => (await captureScatterTable(page)).header, { timeout: 15_000 }).toEqual([
    'Sample', 'PSD95_N', 'SYP_N', 'CaNA_N', ''
  ]);
  const settled = await captureScatterTable(page);
  await page.waitForTimeout(1000);
  const later = await captureScatterTable(page);

  expect(later.signature).toBe(settled.signature);
  expect(later.rowCount).toBe(settled.rowCount);
  expect(later.firstDataRow[0]).toBe('c-CS-m | 309_1');
});
