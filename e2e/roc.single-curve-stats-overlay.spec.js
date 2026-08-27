const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

function referenceRows() {
  return [
    ...Array.from({ length: 17 }, (_, index) => [1, 20 - index]),
    [0, 3],
    [1, 2],
    [1, 1],
    [1, -1.739706],
    [0, -2],
    [1, -3],
    ...Array.from({ length: 9 }, (_, index) => [0, -4 - index])
  ];
}

async function loadRocDataAndDraw(page, data, reason) {
  await page.evaluate(async ({ matrix, drawReason }) => {
    const workspace = window.Main?.session?.workspaceState || {};
    const tabId = workspace.activeTabId || null;
    const session = window.Components?.roc?.__testHooks?.getSession?.(tabId) || null;
    const hot = session?.managers?.hot || null;
    if (!tabId || !hot || typeof hot.loadData !== 'function') {
      throw new Error('Active ROC table is unavailable');
    }
    hot.loadData(matrix);
    const result = window.Components?.roc?.draw?.({ tabId, reason: drawReason, force: true });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, { matrix: data, drawReason: reason });
}

test('single ROC curve uses stats overlay and multiple curves keep comparison overlay', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'roc', pageId: 'rocPage' }, { first: true });

  const rows = referenceRows();
  await loadRocDataAndDraw(page, [['Label', 'Assay A'], ...rows], 'e2e-roc-single-stats-overlay');

  const root = page.locator('#rocPage:not([hidden])');
  await expect(root.locator('#rocShowComparisonOnPlotLabel')).toHaveText('Show stats on plot');
  await root.locator('#rocShowComparisonOnPlot').check();
  await expect(root.locator('#rocSvg .roc-plot-stats')).toContainText('AUC = 0.978; p < 0.0001', { timeout: 30_000 });

  const twoCurveData = [
    ['Label', 'Assay A', 'Assay B'],
    ...rows.map(([label, score], index) => [label, score, score + ((index % 3) - 1) * 0.2])
  ];
  await loadRocDataAndDraw(page, twoCurveData, 'e2e-roc-comparison-overlay');

  await expect(root.locator('#rocShowComparisonOnPlotLabel')).toHaveText('Show comparison on plot');
  await expect(root.locator('#rocSvg .roc-plot-stats')).toContainText(/ΔAUC|95% CI|p\s*[<=>≤≥]/, { timeout: 30_000 });

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
