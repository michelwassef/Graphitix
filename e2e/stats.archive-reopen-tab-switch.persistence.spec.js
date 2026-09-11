const path = require('path');
const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { openComponentFromWelcome, waitForDocumentOpenComplete } = require('./helpers/workspaceDriver');
const { clickExampleButton } = require('./helpers/uiDriver');
const { buildWorkspaceArchive, openWorkspaceArchive, saveWorkspaceArchive } = require('./helpers/archiveDriver');
const { reloadAndAcceptRecovery, seedRecoveryArchive } = require('./helpers/recoveryDriver');
const { registerIssueCollectors } = require('./helpers/diagnostics');

const ARCHIVE_TMP_DIR = path.resolve(__dirname, '.tmp');

const STATS_COMPONENT_CASES = [
  {
    key: 'box',
    component: { type: 'box', pageId: 'boxPage' },
    exampleButtonId: 'boxLoadExample',
    pageVisibleSelector: '#boxPage:not([hidden])'
  },
  {
    key: 'scatter',
    component: { type: 'scatter', pageId: 'scatterPage' },
    exampleButtonId: 'scatterLoadExample',
    pageVisibleSelector: '#scatterPage:not([hidden])'
  },
  {
    key: 'line',
    component: { type: 'line', pageId: 'linePage' },
    exampleButtonId: 'lineLoadExample',
    pageVisibleSelector: '#linePage:not([hidden])'
  },
  {
    key: 'pie',
    component: { type: 'pie', pageId: 'piePage' },
    exampleButtonId: 'pieLoadExample',
    pageVisibleSelector: '#piePage:not([hidden])'
  },
  {
    key: 'hist',
    component: { type: 'hist', pageId: 'histPage' },
    exampleButtonId: 'histLoadExample',
    pageVisibleSelector: '#histPage:not([hidden])'
  },
  {
    key: 'roc',
    component: { type: 'roc', pageId: 'rocPage' },
    exampleButtonId: 'rocLoadExample',
    pageVisibleSelector: '#rocPage:not([hidden])'
  },
  {
    key: 'survival',
    component: { type: 'survival', pageId: 'survivalPage' },
    exampleButtonId: 'survivalLoadExample',
    pageVisibleSelector: '#survivalPage:not([hidden])'
  },
  {
    key: 'pca',
    component: { type: 'pca', pageId: 'pcaPage' },
    exampleButtonId: 'pcaLoadExample',
    pageVisibleSelector: '#pcaPage:not([hidden])'
  },
  {
    key: 'heatmap',
    component: { type: 'heatmap', pageId: 'heatmapPage' },
    exampleButtonId: 'heatmapLoadExample',
    pageVisibleSelector: '#heatmapPage:not([hidden])'
  },
  {
    key: 'surface',
    component: { type: 'surface', pageId: 'surfacePage' },
    exampleButtonId: 'surfaceLoadExample',
    pageVisibleSelector: '#surfacePage:not([hidden])'
  }
];

async function ensureExampleLoaded(page, componentCase) {
  await clickExampleButton(page, {
    ...componentCase.component,
    exampleButtonId: componentCase.exampleButtonId
  }, { timeout: 35_000, requireMountedRoot: false });
}

async function waitForStatsReady(page, componentCase) {
  const key = componentCase.key;
  if (key === 'box') {
    await expect(page.locator('#boxComputeStats')).toBeEnabled({ timeout: 25_000 });
    await page.locator('#boxComputeStats').click();
    await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 40_000 });
    await expect(page.locator('#boxComputeStats')).toHaveText(/Recalculate statistics/i, { timeout: 20_000 });
    await expect(page.locator('#statsResults')).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
    return;
  }
  if (key === 'scatter') {
    await expect(page.locator('#scatterComputeStats')).toBeEnabled({ timeout: 25_000 });
    await page.locator('#scatterComputeStats').click();
    await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 40_000 });
    await expect(page.locator('#scatterComputeStats')).toHaveText(/Recalculate statistics/i, { timeout: 20_000 });
    await expect(page.locator('#scatterStatsResults')).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
    return;
  }
  if (key === 'line') {
    await page.waitForFunction(() => {
      const payload = window.Components?.line?.getPayload?.();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      return rows.length > 2 && rows.some((row, index) => index > 0 && Array.isArray(row) && row.some(cell => cell !== '' && cell != null));
    }, null, { timeout: 35_000 });
    await expect(page.locator('#lineComputeStats')).toBeEnabled({ timeout: 25_000 });
    await page.locator('#lineComputeStats').click();
    await expect(page.locator('#lineStatsStatus')).toContainText('Statistics up to date.', { timeout: 40_000 });
    await expect(page.locator('#lineComputeStats')).toHaveText(/Recalculate statistics/i, { timeout: 20_000 });
    await expect(page.locator('#lineStatsResults')).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
    return;
  }
  if (key === 'pie') {
    await page.waitForFunction(() => {
      const payload = window.Components?.pie?.getPayload?.();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      return rows.length > 1;
    }, null, { timeout: 35_000 });
    await expect(page.locator('#pieComputeStats')).toBeEnabled({ timeout: 25_000 });
    await page.locator('#pieComputeStats').click();
    await expect(page.locator('#pieStatsStatus')).toContainText('Statistics up to date.', { timeout: 40_000 });
    await expect(page.locator('#pieComputeStats')).toHaveText(/Recalculate statistics/i, { timeout: 20_000 });
    await expect(page.locator('#pieStatsResults')).not.toContainText('Statistics will appear after calculation.', { timeout: 20_000 });
    return;
  }
  if (key === 'survival') {
    await page.evaluate(() => {
      const hazardToggle = document.getElementById('survivalShowHazardRatios');
      const coxToggle = document.getElementById('survivalFitCox');
      if (hazardToggle) {
        hazardToggle.checked = true;
        hazardToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (coxToggle) {
        coxToggle.checked = true;
        coxToggle.dispatchEvent(new Event('change', { bubbles: true }));
      }
      window.Components?.survival?.draw?.();
    });
    await expect(page.locator('#survivalStatsLogRank')).toContainText(/Survival Curve Comparisons|Pairwise Log-rank/i, { timeout: 40_000 });
    await expect(page.locator('#survivalStatsCox')).toContainText(/Cox Model|Reporting and reproducibility/i, { timeout: 40_000 });
    return;
  }
  if (key === 'pca') {
    await expect(page.locator('#pcaStatsResults')).toContainText(/Reporting and reproducibility|PCA|component/i, { timeout: 40_000 });
    return;
  }
  if (key === 'heatmap') {
    await page.evaluate(() => {
      window.Components?.heatmap?.draw?.();
    });
    await expect(page.locator('#heatmapStatsContent')).toContainText(/Items analysed|Rows|Reporting and reproducibility|Pairs evaluated/i, { timeout: 40_000 });
    return;
  }
  if (key === 'surface') {
    await page.evaluate(() => {
      window.Components?.surface?.draw?.();
    });
    await expect(page.locator('#surfaceStatsSummary')).toContainText(/Reporting and reproducibility|Vertices|Faces|Grid/i, { timeout: 40_000 });
    return;
  }
  if (key === 'hist') {
    await page.evaluate(() => {
      window.Components?.hist?.draw?.();
    });
    await expect(page.locator('#histStatsResults')).toContainText(/Descriptive statistics|Distribution comparison|Reporting and reproducibility/i, { timeout: 40_000 });
    return;
  }
  if (key === 'roc') {
    await page.evaluate(() => {
      window.Components?.roc?.draw?.();
    });
    await expect(page.locator('#rocStatsResults')).toContainText(/ROC metrics|AUC|Precision.?Recall|Reporting and reproducibility/i, { timeout: 40_000 });
  }
}

async function waitForRestoredStats(page, componentCase) {
  await waitForStatsReady(page, componentCase);
}

async function captureWorkspaceArchive(page, componentKey) {
  const archivePath = path.join(ARCHIVE_TMP_DIR, `${componentKey}-statistics.graph`);
  const archive = await saveWorkspaceArchive(page, archivePath, {
    scope: 'workspace',
    snapshotKind: 'document-snapshot',
    compression: 'STORE',
    reason: 'e2e-stats-archive-reopen',
    fileName: path.basename(archivePath)
  });
  return { archivePath, size: archive.size };
}

async function loadWorkspaceArchive(page, archivePath) {
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await openWorkspaceArchive(page, archivePath, { reload: false, timeout: 120_000 });
  await waitForDocumentOpenComplete(page, 120_000);
}

async function activateWorkspaceTabByExactTitle(page, titlePattern) {
  const tabButton = page.locator('.workspace-tab').filter({ hasText: titlePattern }).first();
  await expect(tabButton).toBeVisible({ timeout: 20_000 });
  await tabButton.click();
}

async function activateFirstGraphTab(page) {
  const target = page.locator('.workspace-tab').filter({ hasNotText: /^\s*Welcome\s*$/i }).first();
  await expect(target).toBeVisible({ timeout: 20_000 });
  await target.click();
}

async function openComponentAndPrepareStats(page, componentCase) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, componentCase.component, { first: true });
  await page.waitForFunction(
    componentType => !!window.Components?.[componentType]?.ready,
    componentCase.component.type,
    { timeout: 35_000 }
  );
  await ensureExampleLoaded(page, componentCase);
  await waitForStatsReady(page, componentCase);
}

async function seedRecoverySnapshotFromWorkspace(page) {
  const tabCount = await page.evaluate(() => {
    const tabs = window.Main?.session?.workspaceState?.tabs;
    return Array.isArray(tabs) ? tabs.filter(tab => tab && !tab.isWelcome && tab.type).length : 0;
  });
  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind: 'recovery',
    policyMode: 'recovery',
    reason: 'recovery-interval',
    useWorker: true
  });
  const meta = await seedRecoveryArchive(page, archive.base64, {
    reason: 'recovery-interval',
    tabCount,
    fileName: 'workspace.graph'
  });
  return { status: 'saved', bytes: archive.size, meta };
}

async function reloadAndAcceptRecoveryIfPrompted(page) {
  return reloadAndAcceptRecovery(page, { timeout: 40_000 });
}

for (const componentCase of STATS_COMPONENT_CASES) {
  test(`archive reopen keeps ${componentCase.key} statistics after tab switch`, async ({ page }) => {
    test.setTimeout(240_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await openComponentAndPrepareStats(page, componentCase);
    const { archivePath, size } = await captureWorkspaceArchive(page, componentCase.key);
    expect(size).toBeGreaterThan(0);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await loadWorkspaceArchive(page, archivePath);
    await expect(page.locator(componentCase.pageVisibleSelector)).toBeVisible({ timeout: 40_000 });

    await waitForRestoredStats(page, componentCase);

    await activateWorkspaceTabByExactTitle(page, /^Welcome$/i);
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await activateFirstGraphTab(page);
    await expect(page.locator(componentCase.pageVisibleSelector)).toBeVisible({ timeout: 20_000 });

    await waitForRestoredStats(page, componentCase);
    expect(issues.critical).toEqual([]);
  });

  test(`recovery restore keeps ${componentCase.key} statistics after tab switch`, async ({ page }) => {
    test.setTimeout(240_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await openComponentAndPrepareStats(page, componentCase);
    const snapshotResult = await seedRecoverySnapshotFromWorkspace(page);
    expect(snapshotResult?.status).toBe('saved');

    await reloadAndAcceptRecoveryIfPrompted(page);
    await expect(page.locator(componentCase.pageVisibleSelector)).toBeVisible({ timeout: 40_000 });
    await waitForRestoredStats(page, componentCase);

    await activateWorkspaceTabByExactTitle(page, /^Welcome$/i);
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await activateFirstGraphTab(page);
    await expect(page.locator(componentCase.pageVisibleSelector)).toBeVisible({ timeout: 20_000 });

    await waitForRestoredStats(page, componentCase);
    expect(issues.critical).toEqual([]);
  });
}
