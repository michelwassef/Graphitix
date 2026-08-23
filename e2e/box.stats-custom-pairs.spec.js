const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function loadBoxExample(page) {
  await expect(page.locator('#boxLoadExample')).toBeVisible({ timeout: 20_000 });
  await page.locator('#boxLoadExample').click();
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.() || null;
    const context = state?.statsContext;
    return !!(context && Array.isArray(context.traces) && context.traces.length >= 3);
  }, null, { timeout: 20_000 });
  await expect(page.locator('#boxStatsScope')).toBeVisible({ timeout: 20_000 });
}

test('box custom pairs calculate on the first click after editing multiple pairs', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await loadBoxExample(page);

  await page.locator('#boxStatsScope').selectOption('custom');
  const pairInput = page
    .locator('#statsControls .box-stats-options__row')
    .filter({ hasText: 'Pairs:' })
    .locator('input[type="text"]');
  await expect(pairInput).toBeVisible();

  await pairInput.fill('1-2');
  const pairwiseProcedure = page.locator('#boxStatsPostHoc');
  await expect(pairwiseProcedure).toBeVisible();
  await expect(pairwiseProcedure).toBeDisabled();
  await expect(pairwiseProcedure.locator('option:checked')).toHaveText('None');
  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxComputeStats')).toHaveText('Recalculate statistics', { timeout: 30_000 });

  await pairInput.fill('1-2,3-4');
  await expect(pairwiseProcedure.locator('option:checked')).toHaveText('Manual pairs');
  await expect(page.locator('#boxStatsCorrection')).toBeVisible();
  await expect(page.locator('#statsCorrectionNote')).toContainText('2 tests');
  await expect(page.locator('#boxComputeStats')).toHaveText('Calculate statistics');

  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxComputeStats')).toHaveText('Recalculate statistics', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.() || null;
    return !!(
      state
      && state.statsPairsText === '1-2,3-4'
      && Array.isArray(state.statsCustomPairs)
      && state.statsCustomPairs.length === 2
      && Number(state.statsLastRunVersion) > 0
      && Number(state.statsLastRunVersion) === Number(state.statsContextVersion)
    );
  }, null, { timeout: 20_000 });

  expect(issues.critical).toEqual([]);
});

test('box custom pairs retain keyboard focus through recovery render-cache capture', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await loadBoxExample(page);

  await page.locator('#boxStatsScope').selectOption('custom');
  const pairInput = page
    .locator('#statsControls .box-stats-options__row')
    .filter({ hasText: 'Pairs:' })
    .locator('input[type="text"]');
  await expect(pairInput).toBeVisible();

  await pairInput.fill('1-2');
  await expect.poll(() => pairInput.evaluate(node => document.activeElement === node)).toBe(true);

  const snapshotResult = await page.evaluate(async () => {
    const writer = window.Main?.documentState?.writeRecoverySnapshot;
    if(typeof writer !== 'function'){
      return { status: 'error', reason: 'missing-writeRecoverySnapshot' };
    }
    return await writer('box-custom-pairs-focus-regression');
  });
  expect(snapshotResult?.status).toBe('saved');

  await expect.poll(() => pairInput.evaluate(node => document.activeElement === node)).toBe(true);
  await page.keyboard.type(',3-4');
  await expect(pairInput).toHaveValue('1-2,3-4');
  await expect(page.locator('#boxStatsPostHoc option:checked')).toHaveText('Manual pairs');
  await expect(page.locator('#boxStatsCorrection')).toBeVisible();
  await expect(page.locator('#statsCorrectionNote')).toContainText('2 tests');

  expect(issues.critical).toEqual([]);
});
