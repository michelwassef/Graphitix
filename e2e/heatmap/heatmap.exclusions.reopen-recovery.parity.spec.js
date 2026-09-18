/**
 * Contract: manual file reopen and crash recovery restore the same canonical
 * Heatmap exclusion state through the same checkpoint/restore transactions.
 *
 * This test deliberately covers cell, row, and column exclusions because those
 * mutations live in Shared.hot and previously changed only the mounted grid.
 */
const { test, expect } = require('@playwright/test');
const {
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const {
  buildWorkspaceArchive,
  openWorkspaceArchive,
  parseWorkspaceArchive,
  summarizeArchiveMetadata
} = require('../helpers/archiveDriver');
const {
  reloadAndAcceptRecovery: reloadAndAcceptRecoveryDriver,
  seedRecoveryArchive: seedRecoveryArchiveRecord
} = require('../helpers/recoveryDriver');

async function waitForHeatmapReady(page) {
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 30_000 });
  await page.waitForFunction(() => {
    const state = window.Components?.heatmap?.__getState?.();
    const hot = state?.hot || null;
    return !!(hot && typeof hot.exportExclusions === 'function' && hot.countRows() > 5 && hot.countCols() > 3);
  }, null, { timeout: 60_000 });
}

async function createSourceWorkspace(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await waitForHeatmapReady(page);

  await page.evaluate(() => {
    const hot = window.Components.heatmap.__getState().hot;
    const controller = hot?.__hotExclusionController;
    if (!controller) {
      throw new Error('Heatmap exclusion controller is unavailable.');
    }
    controller.markCells([{ row: 2, col: 1 }], true);
    controller.markRows([4], true);
    controller.markColumns([2], true);
  });

  await page.waitForFunction(() => {
    const tab = window.Main?.session?.getActiveTab?.();
    const exclusions = tab?.payload?.exclusions;
    return Array.isArray(exclusions?.rows)
      && exclusions.rows.includes(4)
      && Array.isArray(exclusions?.cols)
      && exclusions.cols.includes(2)
      && Array.isArray(exclusions?.cells)
      && exclusions.cells.some(pair => Number(pair?.[0]) === 2 && Number(pair?.[1]) === 1);
  }, null, { timeout: 20_000 });
}

async function captureExclusionState(page) {
  await waitForHeatmapReady(page);
  return page.evaluate(() => {
    const state = window.Components.heatmap.__getState();
    const hot = state.hot;
    const tab = window.Main.session.getActiveTab();
    const analysis = window.Shared.hot.getAnalysisData(hot);
    const normalize = value => JSON.parse(JSON.stringify(value || { rows: [], cols: [], cells: [] }));
    return {
      payload: normalize(tab?.payload?.exclusions),
      live: normalize(hot.exportExclusions()),
      analysisData: analysis.data,
      excludedClassCounts: {
        cell: document.querySelectorAll('#heatmapPage:not([hidden]) .ag-cell.hot-cell-excluded-cell').length,
        row: document.querySelectorAll('#heatmapPage:not([hidden]) .ag-cell.hot-cell-excluded-row').length,
        column: document.querySelectorAll('#heatmapPage:not([hidden]) .ag-cell.hot-cell-excluded-column').length
      },
      dirty: !!window.Main.session.workspaceState.sessionUserDirty
    };
  });
}

async function captureManualAndRecoveryArchives(page) {
  const manual = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind: 'archive-save',
    policyMode: 'manual-save',
    captureRenderCacheBeforeSnapshot: false,
    includeRenderCacheInSnapshot: false,
    compression: 'STORE',
    useWorker: false,
    reason: 'e2e-exclusion-manual-checkpoint'
  });
  const recovery = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind: 'recovery',
    policyMode: 'recovery',
    captureRenderCacheBeforeSnapshot: false,
    includeRenderCacheInSnapshot: false,
    compression: 'STORE',
    useWorker: false,
    reason: 'e2e-exclusion-recovery-checkpoint'
  });
  const [manualParsed, recoveryParsed] = await Promise.all([
    parseWorkspaceArchive(page, manual.base64, 'manual.graph'),
    parseWorkspaceArchive(page, recovery.base64, 'recovery.graph')
  ]);
  const canonicalSession = session => ({
    activeIndex: session?.activeIndex ?? -1,
    tabs: Array.isArray(session?.tabs)
      ? session.tabs.map(tab => ({
          title: tab?.title || '',
          type: tab?.type || null,
          payload: tab?.payload || null,
          layout: tab?.layout || null,
          uiState: tab?.uiState || null
      }))
      : []
  });
  return {
    manualBase64: manual.base64,
    recoveryBase64: recovery.base64,
    manualMetadata: summarizeArchiveMetadata(manualParsed),
    recoveryMetadata: summarizeArchiveMetadata(recoveryParsed),
    manualSession: canonicalSession(manualParsed.session),
    recoverySession: canonicalSession(recoveryParsed.session)
  };
}

async function loadManualArchive(page, base64, archivePath) {
  await openWorkspaceArchive(page, { base64 }, { filePath: archivePath });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await waitForHeatmapReady(page);
  await waitForComponentOwnerReady(page, 'heatmap', {
    requireMountedRoot: true,
    requirePublished: true,
    requireIdle: true,
    timeout: 30_000
  });
}

async function seedRecoveryArchive(page, base64) {
  await seedRecoveryArchiveRecord(page, base64, {
    reason: 'e2e-exclusion-recovery',
    tabCount: 1,
    fileName: 'workspace.graph'
  });
}

async function reloadAndAcceptRecovery(page) {
  const accepted = await reloadAndAcceptRecoveryDriver(page, {
    afterReload: async () => {
    await waitForHeatmapReady(page);
    await page.waitForFunction(
      () => window.Main?.session?.workspaceState?.sessionUserDirty === true,
      null,
      { timeout: 20_000 }
    );
    }
  });
  expect(accepted, 'Crash recovery prompt should be accepted.').toBe(true);
}

test('Heatmap exclusions have exact file-reopen and crash-recovery parity', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await createSourceWorkspace(page);
  const source = await captureExclusionState(page);
  const archives = await captureManualAndRecoveryArchives(page);

  await testInfo.attach('heatmap-exclusion-archive-metadata.json', {
    body: JSON.stringify({
      manual: archives.manualMetadata,
      recovery: archives.recoveryMetadata
    }, null, 2),
    contentType: 'application/json'
  });

  expect(archives.recoverySession.tabs).toStrictEqual(archives.manualSession.tabs);
  expect(archives.manualSession.tabs[0].payload.exclusions).toStrictEqual(source.payload);

  await loadManualArchive(page, archives.manualBase64, testInfo.outputPath('heatmap-exclusion-parity.graph'));
  const reopened = await captureExclusionState(page);

  await seedRecoveryArchive(page, archives.recoveryBase64);
  await reloadAndAcceptRecovery(page);
  const recovered = await captureExclusionState(page);

  expect(reopened.payload).toStrictEqual(source.payload);
  expect(reopened.live).toStrictEqual(source.live);
  expect(reopened.analysisData).toStrictEqual(source.analysisData);
  expect(reopened.excludedClassCounts).toStrictEqual(source.excludedClassCounts);

  expect(recovered.payload).toStrictEqual(reopened.payload);
  expect(recovered.live).toStrictEqual(reopened.live);
  expect(recovered.analysisData).toStrictEqual(reopened.analysisData);
  expect(recovered.excludedClassCounts).toStrictEqual(reopened.excludedClassCounts);

  expect(reopened.dirty).toBe(false);
  expect(recovered.dirty).toBe(true);
  expect(issues.critical).toEqual([]);
});
