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

async function restoreBoxPayloadIntoFreshWorkspace(page, payload, reason) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.box?.loadFromPayload, null, { timeout: 20_000 });
  await page.evaluate(({ saved, restoreReason }) => {
    window.Components.box.loadFromPayload(saved, { reason: restoreReason });
  }, { saved: payload, restoreReason: reason });
  await page.waitForFunction(
    () => document.querySelector('#boxPlot svg')
      && document.querySelector('#boxComputeStats')
      && document.querySelector('#boxShowSignificance'),
    null,
    { timeout: 20_000 }
  );
}

async function captureBoxStatsFidelity(page) {
  return page.evaluate(() => {
    const normalizeText = value => String(value || '').replace(/\s+/g, ' ').trim();
    const asFinite = value => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Number(numeric.toPrecision(8)) : null;
    };
    const payload = window.Components?.box?.getPayload?.() || {};
    const stats = payload?.config?.stats || {};
    const assumptionGroups = (Array.isArray(stats.assumptions?.groups) ? stats.assumptions.groups : [])
      .map(group => {
        const normality = group?.normality && typeof group.normality === 'object' ? group.normality : group;
        return {
          label: String(group?.label || ''),
          pValue: asFinite(normality?.pValue),
          passed: normality?.passed ?? group?.passed ?? null
        };
      });
    const domAssumptionGroups = Array.from(document.querySelectorAll('#statsResults .stats-assumption-table tbody tr'))
      .map(row => ({
        label: normalizeText(row.querySelector('.stats-assumption__group')?.textContent),
        pText: normalizeText(row.querySelector('.stats-assumption__pvalue')?.textContent),
        status: normalizeText(row.querySelector('.assumption-badge')?.textContent)
      }));
    const pValues = [];
    document.querySelectorAll('#statsResults [data-stats-pvalue-raw]').forEach(node => {
      const numeric = asFinite(node.dataset?.statsPvalueRaw);
      if(numeric != null){ pValues.push(numeric); }
    });
    document.querySelectorAll('#statsResults .stats-assumption__pvalue, #statsResults .assumption-variance-detail').forEach(node => {
      const match = normalizeText(node.textContent).match(/(?:p\s*=\s*)?([0-9]*\.?[0-9]+(?:e[-+]?\d+)?)/i);
      const numeric = match ? asFinite(match[1]) : null;
      if(numeric != null){ pValues.push(numeric); }
    });
    return {
      assumptionGroups,
      domAssumptionGroups,
      pValues: Array.from(new Set(pValues.map(value => String(value)))).sort(),
      resultsText: normalizeText(document.querySelector('#statsResults')?.textContent),
      hasPairwiseText: /Pairwise comparisons|Multiple comparisons/i.test(document.querySelector('#statsResults')?.textContent || ''),
      hasResultsModel: !!stats.resultsModel,
      hasReportModel: !!stats.reportModel,
      hasTableModel: Array.isArray(stats.tableModel?.rows) && stats.tableModel.rows.length > 0
    };
  });
}

function expectBoxStatsFidelityRestored(actual, expected, label) {
  expect(actual.assumptionGroups.length, `${label}: assumption group count`).toBe(expected.assumptionGroups.length);
  expected.assumptionGroups.forEach((group, index) => {
    expect(actual.assumptionGroups[index]?.label, `${label}: assumption label ${index}`).toBe(group.label);
    expect(actual.assumptionGroups[index]?.passed, `${label}: assumption status ${group.label}`).toBe(group.passed);
    expect(actual.assumptionGroups[index]?.pValue, `${label}: assumption p-value ${group.label}`).toBe(group.pValue);
  });
  expect(actual.domAssumptionGroups.map(group => group.pText), `${label}: rendered assumption p-values`)
    .toEqual(expected.domAssumptionGroups.map(group => group.pText));
  expect(actual.pValues, `${label}: stats p-value facts`).toEqual(expected.pValues);
  expect(actual.hasPairwiseText, `${label}: pairwise section`).toBe(true);
  expect(actual.hasResultsModel || actual.hasReportModel, `${label}: panel/report model`).toBe(true);
}

async function expectMultipleComparisonsTabLive(page, label) {
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('#statsResults .box-stats-summary-tabs__tab'));
    const button = buttons.find(node => /Multiple comparisons/i.test(node.textContent || ''));
    if (!button) throw new Error('Multiple comparisons tab button not found');
    button.click();
  });
  const snapshot = await page.evaluate(() => {
    const wrapper = document.querySelector('#statsResults .box-stats-summary-tabs');
    const button = Array.from(wrapper?.querySelectorAll?.('.box-stats-summary-tabs__tab') || [])
      .find(node => /Multiple comparisons/i.test(node.textContent || ''));
    const panel = wrapper?.querySelector?.('.box-stats-summary-tabs__panel[data-tab="comparisons"]') || null;
    return {
      activeTab: wrapper?.getAttribute('data-active-tab') || '',
      selected: button?.getAttribute('aria-selected') || '',
      hidden: panel ? panel.hidden : true,
      text: String(panel?.textContent || '').replace(/\s+/g, ' ').trim(),
      pValues: Array.from(panel?.querySelectorAll?.('[data-stats-pvalue-raw]') || [])
        .map(node => Number(node.dataset.statsPvalueRaw))
        .filter(Number.isFinite)
    };
  });
  expect(snapshot.activeTab, `${label}: active stats tab`).toBe('comparisons');
  expect(snapshot.selected, `${label}: selected tab state`).toBe('true');
  expect(snapshot.hidden, `${label}: comparisons panel hidden`).toBe(false);
  expect(snapshot.text, `${label}: comparisons panel content`).toMatch(/Pairwise comparisons|Multiple comparisons/i);
  expect(snapshot.pValues.length, `${label}: comparisons p-value metadata`).toBeGreaterThan(0);
}

test('box significance bars render after saved payload is restored', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openBoxWorkspace(page);
  await loadBoxExample(page);
  await computeBoxStatsAndShowSignificance(page);

  const originalStatsFidelity = await captureBoxStatsFidelity(page);
  expect(originalStatsFidelity.assumptionGroups.length).toBeGreaterThan(0);
  expect(originalStatsFidelity.assumptionGroups.every(group => group.pValue != null)).toBe(true);
  expect(originalStatsFidelity.pValues.length).toBeGreaterThan(0);

  const payload = await page.evaluate(() => window.Components.box.getPayload());
  expect(payload?.config?.showSignificanceBars).toBe(true);
  expect(payload?.config?.stats?.selectedColumns?.length).toBeGreaterThan(1);
  expect(payload?.config?.stats?.lastRunVersion).toBeGreaterThan(0);
  expect(payload?.config?.stats?.annotationModel?.pairs?.length).toBeGreaterThan(0);

  await restoreBoxPayloadIntoFreshWorkspace(page, payload, 'e2e-restore');
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
  const firstRestoreStatsFidelity = await captureBoxStatsFidelity(page);
  expectBoxStatsFidelityRestored(firstRestoreStatsFidelity, originalStatsFidelity, 'first restore');
  await expectMultipleComparisonsTabLive(page, 'first restore');

  const payloadAfterRestore = await page.evaluate(() => window.Components.box.getPayload());
  await restoreBoxPayloadIntoFreshWorkspace(page, payloadAfterRestore, 'e2e-second-restore');
  await expect(page.locator('#statsResults')).toContainText('Pairwise comparisons', { timeout: 20_000 });
  const secondRestoreStatsFidelity = await captureBoxStatsFidelity(page);
  expectBoxStatsFidelityRestored(secondRestoreStatsFidelity, originalStatsFidelity, 'second restore from restored payload');
  await expectMultipleComparisonsTabLive(page, 'second restore from restored payload');

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

  expect(issues.critical).toEqual([]);
});
