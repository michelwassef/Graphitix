const { test, expect } = require('@playwright/test');
const {
  openComponentFromWelcome,
  waitForDocumentOpenComplete
} = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const {
  saveWorkspaceArchive,
  buildWorkspaceArchive,
  openWorkspaceArchive
} = require('../helpers/archiveDriver');
const {
  seedRecoveryArchive,
  reloadAndAcceptRecovery: reloadAndAcceptRecoveryDriver
} = require('../helpers/recoveryDriver');

function boxStatsControlsSnapshotInPage() {
  const normalizeSnapshotText = value => String(value || '').replace(/\s+/g, ' ').trim();
  const pageRoot = document.querySelector('#boxPage:not([hidden])') || document.getElementById('boxPage') || document;
  const controls = pageRoot.querySelector('#statsControls') || document.getElementById('statsControls');
  const results = pageRoot.querySelector('#statsResults') || document.getElementById('statsResults');
  const status = pageRoot.querySelector('#boxStatsStatus') || document.getElementById('boxStatsStatus');
  const button = pageRoot.querySelector('#boxComputeStats') || document.getElementById('boxComputeStats');
  const optionRows = Array.from(controls?.querySelectorAll?.('.box-stats-options__row') || []);
  const optionValues = {};
  optionRows.forEach(row => {
    const label = normalizeSnapshotText(row.querySelector('label')?.textContent || row.firstElementChild?.textContent || '');
    const field = row.querySelector('select, input');
    if (!label || !field) {
      return;
    }
    optionValues[label.replace(/:$/, '')] = field.type === 'checkbox'
      ? String(!!field.checked)
      : String(field.value || '');
  });
  return {
    hasControlsRoot: !!controls,
    hasAdvisor: !!controls?.querySelector?.('.stats-advisor'),
    advisorText: normalizeSnapshotText(controls?.querySelector?.('.stats-advisor')?.textContent || ''),
    conditionLabels: Array.from(controls?.querySelectorAll?.('.stats-conditions-item label') || [])
      .map(label => normalizeSnapshotText(label.textContent)),
    checkedConditionLabels: Array.from(controls?.querySelectorAll?.('.stats-conditions-item input:checked') || [])
      .map(input => normalizeSnapshotText(input.closest('.stats-conditions-item')?.querySelector('label')?.textContent)),
    optionValues,
    optionRowCount: optionRows.length,
    buttonText: normalizeSnapshotText(button?.textContent || ''),
    statusText: normalizeSnapshotText(status?.textContent || ''),
    resultsText: normalizeSnapshotText(results?.textContent || '')
  };
}

async function waitForBoxStatsControlsReady(page) {
  await expect.poll(async () => {
    const snapshot = await page.evaluate(boxStatsControlsSnapshotInPage);
    return !!(snapshot.hasAdvisor
      && snapshot.conditionLabels.length >= 3
      && snapshot.optionRowCount >= 4
      && snapshot.optionValues['Analysis family']
      && snapshot.optionValues.Design
      && snapshot.optionValues['Comparison scope']
      && snapshot.optionValues['Choose test']);
  }, { timeout: 30_000 }).toBe(true);
}

function expectRestoredBoxStatsControls(after, before, label) {
  expect(after.hasControlsRoot, `${label}: stats controls root missing`).toBe(true);
  expect(after.hasAdvisor, `${label}: advisor missing`).toBe(true);
  expect(after.conditionLabels, `${label}: condition labels`).toEqual(before.conditionLabels);
  expect(after.checkedConditionLabels, `${label}: selected conditions`).toEqual(before.checkedConditionLabels);
  expect(after.optionValues['Analysis family'], `${label}: analysis family`).toBe(before.optionValues['Analysis family']);
  expect(after.optionValues.Design, `${label}: design`).toBe(before.optionValues.Design);
  expect(after.optionValues['Comparison scope'], `${label}: comparison scope`).toBe(before.optionValues['Comparison scope']);
  expect(after.optionValues['Choose test'], `${label}: chosen test`).toBe(before.optionValues['Choose test']);
  expect(after.optionRowCount, `${label}: option rows`).toBeGreaterThanOrEqual(before.optionRowCount);
  expect(after.buttonText, `${label}: compute button`).toMatch(/Calculate statistics/i);
  expect(after.statusText, `${label}: ready status`).toContain('Statistics ready to calculate.');
  expect(after.resultsText, `${label}: pre-compute placeholder`).toContain('Statistics will appear after calculation.');
}

async function openBoxWithExampleButDoNotCompute(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  await page.waitForFunction(() => !!window.Components?.box?.ready, null, { timeout: 30_000 });
  await waitForBoxStatsControlsReady(page);
  await expect(page.locator('#boxComputeStats')).toHaveText(/Calculate statistics/i, { timeout: 20_000 });
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics ready to calculate.', { timeout: 20_000 });
}

async function loadWorkspaceArchive(page, archivePath) {
  await openWorkspaceArchive(page, archivePath, {
    componentType: 'box',
    timeout: 40_000
  });
  await waitForDocumentOpenComplete(page);
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 40_000 });
}

async function seedRecoverySnapshot(page) {
  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind: 'recovery',
    policyMode: 'recovery',
    useWorker: true,
    reason: 'recovery-interval'
  });
  const meta = await seedRecoveryArchive(page, archive.base64, {
    reason: 'recovery-interval',
    fileName: 'recovered.graph'
  });
  return { bytes: archive.size, tabCount: meta.tabCount };
}

async function reloadAndAcceptRecovery(page) {
  const accepted = await reloadAndAcceptRecoveryDriver(page, { timeout: 40_000 });
  expect(accepted).toBe(true);
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 40_000 });
}

test('box pre-compute statistics controls survive archive reopen', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openBoxWithExampleButDoNotCompute(page);
  const before = await page.evaluate(boxStatsControlsSnapshotInPage);
  const archivePath = (await saveWorkspaceArchive(
    page,
    testInfo.outputPath('box-stats-controls-precompute.graph'),
    {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-box-stats-controls-archive'
    }
  )).filePath;

  await loadWorkspaceArchive(page, archivePath);
  await waitForBoxStatsControlsReady(page);
  const after = await page.evaluate(boxStatsControlsSnapshotInPage);

  expectRestoredBoxStatsControls(after, before, 'archive reopen');
  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});

test('box pre-compute statistics controls survive crash recovery', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openBoxWithExampleButDoNotCompute(page);
  const before = await page.evaluate(boxStatsControlsSnapshotInPage);
  const snapshot = await seedRecoverySnapshot(page);
  expect(snapshot.bytes).toBeGreaterThan(0);

  await reloadAndAcceptRecovery(page);
  await waitForBoxStatsControlsReady(page);
  const after = await page.evaluate(boxStatsControlsSnapshotInPage);

  expectRestoredBoxStatsControls(after, before, 'crash recovery');
  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
