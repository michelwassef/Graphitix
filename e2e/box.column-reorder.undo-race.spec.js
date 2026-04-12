const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('box immediate undo after column drag restores the original header row', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  await page.locator('#boxLoadExample').click();
  await page.waitForTimeout(1200);

  const headerA = page.locator('#hot .ag-header-cell[col-id="c0"]').first();
  const headerB = page.locator('#hot .ag-header-cell[col-id="c1"]').first();
  await expect(headerA).toBeVisible();
  await expect(headerB).toBeVisible();

  await headerA.dragTo(headerB, { targetPosition: { x: 70, y: 10 } });
  await page.keyboard.press('Control+z');

  await expect.poll(async () => {
    return await page.evaluate(() => {
      const box = window.Components?.box;
      const state = box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      const data = hot?.getData?.() || [];
      return Array.isArray(data[0]) ? data[0].slice(0, 3) : [];
    });
  }, {
    timeout: 15_000,
    intervals: [200, 400, 800]
  }).toEqual(['Control', 'Treatment A', 'Treatment B']);

  expect(issues.critical).toEqual([]);
});
