const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('Pie biomedical example calculates its two-cohort comparison', async ({ page }) => {
  await installLocalCdnOverrides(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if(message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage' }, { first: true, loadExample: true });

  const scope = page.locator('#pieStatsControls .box-stats-options__row').filter({ hasText: 'Comparison scope:' }).locator('select');
  await expect(scope).toHaveValue('all');
  await page.locator('#pieComputeStats').click();

  const results = page.locator('#pieStatsResults');
  await expect(results).toContainText('Overall test summary');
  await expect(results).toContainText('40.1367');
  await expect(results).toContainText('Reporting and reproducibility');
  await expect(results.locator(':scope > .stats-significance-controls')).toBeVisible();
  await expect(results.locator('.stats-significance-controls__input')).toHaveValue('0.05');
  await expect(results.locator('.stats-pvalue-format-inline')).toBeVisible();
  await expect(results.locator('.stats-results-main .stats-significance-badge').first()).toContainText('****');

  const tabs = await page.evaluate(() => {
    const state = window.Main.session.workspaceState;
    return {
      pie: state.activeTabId,
      welcome: state.tabs.find(tab => tab.isWelcome)?.id || null
    };
  });
  if(tabs.welcome){
    await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'e2e-pie-stats-away' }), tabs.welcome);
    await page.evaluate(id => window.Main.tabs.activateTab(id, { reason: 'e2e-pie-stats-return' }), tabs.pie);
    await expect(results.locator(':scope > .stats-significance-controls')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('Pie one-column data calculates against equal proportions', async ({ page }) => {
  await installLocalCdnOverrides(page);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if(message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage' }, { first: true });
  await page.evaluate(() => {
    const pie = window.Components.pie;
    const payload = pie.createEmptyPayload();
    payload.data = [
      ['Response', 'Observed'],
      ['Complete', 10],
      ['Partial', 20],
      ['None', 30]
    ];
    pie.loadFromPayload(payload);
  });

  await expect(page.locator('#pieExpectedColumn')).toHaveValue('equal-proportions');
  await page.locator('#pieComputeStats').click();

  const results = page.locator('#pieStatsResults');
  await expect(results).toContainText('Goodness-of-fit test');
  await expect(results).toContainText('equal expected proportions');
  await expect(results).toContainText('10.0000');
  await expect(results).toContainText('Reporting and reproducibility');
  expect(errors).toEqual([]);
});
