const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

test('Box parses comma decimals without materializing blank cells as zero', async ({ page }) => {
  test.setTimeout(60_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.evaluate(async () => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    if (!box || !hot) {
      throw new Error('Box table is unavailable');
    }
    hot.setDataAtCell([
      [1, 0, '1,5'],
      [2, 0, '3,5']
    ], 'e2e-comma-decimal-values');
    await box.draw({ force: true, reason: 'e2e-comma-decimal-values' });
  });

  await expect.poll(() => page.evaluate(() => {
    const traces = window.Components?.box?.__getState?.()?.cachedDrawInput?.traces || [];
    const firstColumn = traces.find(trace => trace.columnIndex === 0);
    return firstColumn?.rawY || null;
  })).toEqual([1.5, 3.5]);

  expect(issues.critical).toEqual([]);
});

test('Box grouped traces exclude spare blank AG Grid rows', async ({ page }) => {
  test.setTimeout(60_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  const boxPage = page.locator('#boxPage:not([hidden])');
  await boxPage.locator('#boxTableFormat').selectOption('grouped');
  await boxPage.locator('#boxLoadExample').click();

  await expect.poll(() => page.evaluate(() => {
    const traces = window.Components?.box?.__getState?.()?.cachedDrawInput?.traces || [];
    return traces.length === 6 ? traces.map(trace => trace.rawY?.length ?? null) : null;
  })).toEqual([10, 10, 10, 10, 10, 10]);

  expect(issues.critical).toEqual([]);
});
