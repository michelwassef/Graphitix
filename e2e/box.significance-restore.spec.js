const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function computeBoxStatsAndShowSignificance(page) {
  const computeButton = page.locator('#boxComputeStats');
  await expect(computeButton).toBeVisible({ timeout: 20_000 });
  await expect(computeButton).toBeEnabled({ timeout: 20_000 });
  await computeButton.click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  const toggle = page.locator('#boxShowSignificance');
  await expect(toggle).toBeVisible();
  if (!(await toggle.isChecked())) {
    await toggle.check();
  }
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation').length > 0,
    null,
    { timeout: 20_000 }
  );
}

async function loadBoxExample(page) {
  await expect(async () => {
    await page.locator('#boxLoadExample').click();
    await page.waitForFunction(
      () => document.querySelectorAll('#statsControls input[type="checkbox"]:checked').length >= 3
        && !document.querySelector('#boxComputeStats')?.disabled,
      null,
      { timeout: 10_000 }
    );
  }).toPass({ timeout: 35_000, intervals: [500, 1000, 2000] });
}

async function openBoxWorkspace(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.box?.getPayload, null, { timeout: 20_000 });
}

test('box significance bars render after saved payload is restored', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openBoxWorkspace(page);
  await loadBoxExample(page);
  await computeBoxStatsAndShowSignificance(page);

  const payload = await page.evaluate(() => window.Components.box.getPayload());
  expect(payload?.config?.showSignificanceBars).toBe(true);
  expect(payload?.config?.stats?.selectedColumns?.length).toBeGreaterThan(1);
  expect(payload?.config?.stats?.lastRunVersion).toBeGreaterThan(0);
  expect(payload?.config?.stats?.annotationModel?.pairs?.length).toBeGreaterThan(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.box?.loadFromPayload, null, { timeout: 20_000 });

  await page.evaluate(saved => {
    window.Components.box.loadFromPayload(saved, { reason: 'e2e-restore' });
  }, payload);
  await page.waitForFunction(
    () => document.querySelector('#boxPlot svg')
      && document.querySelector('#boxComputeStats')
      && document.querySelector('#boxShowSignificance'),
    null,
    { timeout: 20_000 }
  );
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation').length > 0,
    null,
    { timeout: 20_000 }
  );
  await page.evaluate(() => {
    window.Components.box.__getState().scheduleDraw({ viewOnly: true, reason: 'e2e-svg-replace-after-restore' });
  });
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation').length > 0,
    null,
    { timeout: 20_000 }
  );
  await page.waitForTimeout(750);
  await expect.poll(
    () => page.locator('#boxPlot path.box-significance-annotation').count(),
    { timeout: 20_000 }
  ).toBeGreaterThan(0);
  await page.evaluate(() => {
    const state = window.Components.box.__getState();
    state.statsContextSignature = 'e2e-stale-view-signature';
    if (state.statsLastAnnotationModel) {
      state.statsLastAnnotationModel.signature = 'e2e-stale-view-signature';
    }
    state.scheduleDraw({ viewOnly: true, reason: 'significance-viewport-extension' });
  });
  await page.waitForTimeout(1_500);
  await expect.poll(
    () => page.locator('#boxPlot path.box-significance-annotation').count(),
    { timeout: 20_000 }
  ).toBeGreaterThan(0);
  await expect(page.locator('#statsResults')).toContainText('Pairwise comparisons', { timeout: 20_000 });

  const toggle = page.locator('#boxShowSignificance');
  await expect(toggle).toBeVisible();
  await toggle.uncheck();
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot .box-significance-annotation').length === 0,
    null,
    { timeout: 20_000 }
  );
  await toggle.check();
  await page.waitForFunction(
    () => document.querySelectorAll('#boxPlot path.box-significance-annotation').length > 0,
    null,
    { timeout: 20_000 }
  );

  expect(issues.critical).toEqual([]);
});

test('box custom pairwise comparisons compute without stale analysis map errors', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openBoxWorkspace(page);
  await loadBoxExample(page);

  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#statsControls .box-stats-options__row'));
    const modeRow = rows.find(row => /Comparison scope:/i.test(row.textContent || ''));
    const modeSelect = modeRow?.querySelector('select');
    if (!modeSelect) throw new Error('Comparison scope select not found');
    modeSelect.value = 'custom';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('#statsControls .box-stats-options__row'))
      .some(row => /Pairs:/i.test(row.textContent || '') && row.querySelector('input')),
    null,
    { timeout: 20_000 }
  );
  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#statsControls .box-stats-options__row'));
    const pairRow = rows.find(row => /Pairs:/i.test(row.textContent || ''));
    const pairInput = pairRow?.querySelector('input');
    if (!pairInput) throw new Error('Pairs input not found');
    pairInput.value = '1-2,1-3';
    pairInput.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await expect(page.locator('#statsResults')).toContainText('Custom pairwise comparisons', { timeout: 20_000 });
  await expect(page.locator('#statsResults')).toContainText('Control vs Treatment A');

  expect(issues.critical).toEqual([]);
});
