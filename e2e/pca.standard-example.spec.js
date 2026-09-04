const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('Standard PCA example uses six Indomethacin subjects in 2D and 3D', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage' }, { first: true, loadExample: true });

  await expect(page.locator('#pcaTableFormat')).toHaveValue('standard');
  await expect.poll(() => page.evaluate(() => window.Components.pca.getPayload()?.stats?.eigenSummary?.length || 0)).toBeGreaterThanOrEqual(3);

  const snapshot = await page.evaluate(() => {
    const payload = window.Components.pca.getPayload();
    const meaningfulRows = payload.data.filter(row => Array.isArray(row) && row.some(value => value !== '' && value !== null && value !== undefined));
    const meaningfulColumnCount = meaningfulRows.reduce((maximum, row) => {
      let last = -1;
      row.forEach((value, index) => {
        if(value !== '' && value !== null && value !== undefined) last = index;
      });
      return Math.max(maximum, last + 1);
    }, 0);
    return {
      rows: meaningfulRows.length,
      columns: meaningfulColumnCount,
      labelFlags: meaningfulRows[0]?.slice(1, meaningfulColumnCount) || [],
      labels: meaningfulRows[1]?.slice(1, meaningfulColumnCount) || [],
      variance: payload.stats.eigenSummary.slice(0, 3).map(entry => entry.variancePercent),
      viewMode: payload.config.viewMode
    };
  });
  expect(snapshot.rows).toBe(13);
  expect(snapshot.columns).toBe(7);
  expect(snapshot.labelFlags).toEqual([false, false, false, false, false, false]);
  expect(snapshot.labels).toEqual(['Subject 1', 'Subject 4', 'Subject 5', 'Subject 2', 'Subject 3', 'Subject 6']);
  expect(snapshot.variance[0]).toBeCloseTo(73.43, 1);
  expect(snapshot.variance.slice(0, 3).reduce((sum, value) => sum + value, 0)).toBeGreaterThan(96);
  await expect(page.locator('#pcaPlot svg')).toHaveAttribute('data-view-mode', '2d');
  await expect(page.locator("#pcaSvg [data-layer='point-labels'] text")).toHaveCount(0);
  await expect(page.locator('#pcaSvg text', { hasText: /^Subject 1$/ })).toHaveCount(1);

  await page.locator('#pcaViewMode').selectOption('3d');
  await expect(page.locator('#pcaPlot svg')).toHaveAttribute('data-view-mode', '3d');
  await expect(page.locator("#pcaSvg [data-layer='point-labels'] text")).toHaveCount(0);
  await expect(page.locator('#pcaSvg text', { hasText: /^Subject 1$/ })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.Components.pca.getPayload()?.config?.viewMode)).toBe('3d');
});
