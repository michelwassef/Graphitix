const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

test('Scatter treats comma decimal values like dot decimal values', async ({ page }) => {
  test.setTimeout(60_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    return !!(hot && hot.gridApi && typeof hot.setDataAtCell === 'function');
  });

  await page.evaluate(async () => {
    const scatter = window.Components?.scatter;
    const hot = scatter?.__ensureHotForActiveTab?.();
    if (!scatter || !hot) {
      throw new Error('Scatter table is unavailable');
    }
    hot.setDataAtCell([
      [1, 1, '1,5'],
      [1, 2, '3,5'],
      [2, 1, '2,5'],
      [2, 2, '4,5']
    ], 'e2e-comma-decimal-values');
    await scatter.draw({ force: true, reason: 'e2e-comma-decimal-values' });
  });

  await page.waitForFunction(() => {
    const points = Array.from(document.querySelectorAll('#scatterPlot [data-scatter-point-interaction]'));
    return points.some(point => {
      try {
        const data = JSON.parse(point.getAttribute('data-scatter-point-interaction'));
        return data.x === 1.5 && data.y === 3.5;
      } catch (_error) {
        return false;
      }
    });
  });

  expect(issues.critical).toEqual([]);
});
