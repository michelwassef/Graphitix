/**
 * Contract: manual file reopen and crash recovery restore the same canonical
 * Heatmap exclusion state through the same checkpoint/restore transactions.
 *
 * This test deliberately covers cell, row, and column exclusions because those
 * mutations live in Shared.hot and previously changed only the mounted grid.
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');
const ARCHIVE_PATH = path.join(TMP_DIR, 'heatmap-exclusion-parity.graph');

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
  return page.evaluate(async () => {
    const context = window.Main.tabs.getSessionActionsContext();
    const actions = window.Main.sessionActions;
    const archive = window.Shared.graphArchive;
    const toBase64 = async blob => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const chunkSize = 0x8000;
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
      }
      return btoa(binary);
    };
    const manualBlob = await actions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'archive-save',
      policyMode: 'manual-save',
      captureRenderCacheBeforeSnapshot: false,
      compression: 'STORE',
      useWorker: false,
      reason: 'e2e-exclusion-manual-checkpoint'
    });
    const recoveryBlob = await actions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      captureRenderCacheBeforeSnapshot: false,
      compression: 'STORE',
      useWorker: false,
      reason: 'e2e-exclusion-recovery-checkpoint'
    });
    const [manualParsed, recoveryParsed] = await Promise.all([
      archive.parseFile(manualBlob, { fileName: 'manual.graph' }),
      archive.parseFile(recoveryBlob, { fileName: 'recovery.graph' })
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
      manualBase64: await toBase64(manualBlob),
      recoveryBase64: await toBase64(recoveryBlob),
      manualSession: canonicalSession(manualParsed.session),
      recoverySession: canonicalSession(recoveryParsed.session)
    };
  });
}

async function loadManualArchive(page, base64) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(ARCHIVE_PATH, Buffer.from(base64, 'base64'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1);
  await input.setInputFiles(ARCHIVE_PATH);
  await waitForHeatmapReady(page);
  await page.waitForTimeout(500);
}

async function seedRecoveryArchive(page, base64) {
  await page.evaluate(async encoded => {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    const blob = new Blob([bytes], { type: 'application/zip' });
    const record = {
      meta: {
        app: 'Graphitix',
        kind: 'recovery',
        version: 1,
        savedAt: new Date().toISOString(),
        updatedAt: Date.now(),
        reason: 'e2e-exclusion-recovery',
        dirty: true,
        hasData: true,
        tabCount: 1,
        fileName: 'workspace.graph',
        filePath: '',
        fileScope: 'workspace'
      },
      blob
    };
    await new Promise((resolve, reject) => {
      const request = window.indexedDB.open('graphitix-document-state', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('snapshots')) {
          request.result.createObjectStore('snapshots');
        }
      };
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
      request.onsuccess = () => {
        const transaction = request.result.transaction('snapshots', 'readwrite');
        transaction.objectStore('snapshots').put(record, 'active-recovery');
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('Recovery snapshot write failed.'));
      };
    });
  }, base64);
}

async function reloadAndAcceptRecovery(page) {
  let accepted = false;
  const handler = async dialog => {
    if (/recover/i.test(dialog.message())) {
      accepted = true;
      await dialog.accept();
      return;
    }
    await dialog.dismiss();
  };
  page.on('dialog', handler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForHeatmapReady(page);
    await page.waitForFunction(
      () => window.Main?.session?.workspaceState?.sessionUserDirty === true,
      null,
      { timeout: 20_000 }
    );
  } finally {
    page.off('dialog', handler);
  }
  expect(accepted, 'Crash recovery prompt should be accepted.').toBe(true);
}

test('Heatmap exclusions have exact file-reopen and crash-recovery parity', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await createSourceWorkspace(page);
  const source = await captureExclusionState(page);
  const archives = await captureManualAndRecoveryArchives(page);

  expect(archives.recoverySession.tabs).toStrictEqual(archives.manualSession.tabs);
  expect(archives.manualSession.tabs[0].payload.exclusions).toStrictEqual(source.payload);

  await loadManualArchive(page, archives.manualBase64);
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
