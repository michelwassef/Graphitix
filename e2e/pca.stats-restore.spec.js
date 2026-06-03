/**
 * Real-browser regression guard for PCA stats restoration.
 *
 * The PCA stats panel (scree plot, biplot, summary, eigen table, loadings) is derived
 * from lastPcaStats and must reappear after every restore path. The render cache used to
 * snapshot the stats-panel DOM and replay it on restore, which orphaned the component's
 * cached node references and silently dropped the scree plot and biplot (file reopen lost
 * both; recovery lost the biplot). The fix makes the render cache carry only the graph and
 * rebuilds the stats panel from data on restore.
 *
 * jsdom cannot host this assertion (no layout / getBoundingClientRect == 0), so the scree
 * SVG and biplot SVG presence must be checked in a real browser.
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

// Presence of each PCA stats sub-panel, read straight off the live DOM.
function pcaStatsPresenceInPage() {
  const screePlot = document.getElementById('pcaScreePlot');
  const biplotCard = document.getElementById('pcaBiplotCard');
  const biplotSvg = document.getElementById('pcaBiplotSvg');
  const eigenWrap = document.getElementById('pcaEigenTableWrapper');
  const summary = document.getElementById('pcaStatsSummary');
  return {
    screeSvgs: screePlot ? screePlot.querySelectorAll('svg').length : 0,
    biplotCardVisible: !!biplotCard && !biplotCard.hidden,
    biplotVectorLines: biplotSvg ? biplotSvg.querySelectorAll('line').length : 0,
    eigenRows: eigenWrap ? eigenWrap.querySelectorAll('tr').length : 0,
    summaryHasText: !!summary && (summary.textContent || '').trim().length > 0,
    plotSvg: !!document.querySelector('#pcaPlot svg')
  };
}

async function expectFullPcaStats(page, label) {
  await expect
    .poll(async () => (await page.evaluate(pcaStatsPresenceInPage)).screeSvgs, {
      timeout: 15_000,
      message: `${label}: scree plot SVG should be present`
    })
    .toBeGreaterThan(0);
  const state = await page.evaluate(pcaStatsPresenceInPage);
  expect(state.biplotCardVisible, `${label}: biplot card should be visible`).toBe(true);
  expect(state.biplotVectorLines, `${label}: biplot should draw loading vectors`).toBeGreaterThan(0);
  expect(state.eigenRows, `${label}: eigen table should have rows`).toBeGreaterThan(0);
  expect(state.summaryHasText, `${label}: summary panel should have text`).toBe(true);
  expect(state.plotSvg, `${label}: main plot SVG should be present`).toBe(true);
}

async function buildPca(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.pca?.ready, null, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, 'pcaLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#pcaPlot svg'), null, { timeout: 30_000 });
  await page.waitForTimeout(1200);
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE', reason: 'e2e-pca-stats-archive'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) { binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); }
    return { fileName: `${stem}.graph`, base64: btoa(binary) };
  }, fileStem);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, archive.fileName);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function awaitWarmup(page) {
  await page.evaluate(async () => {
    const sa = window.Main?.sessionActions;
    if (sa && typeof sa.awaitPostLoadWarmup === 'function') { await sa.awaitPostLoadWarmup({ timeoutMs: 60_000, reason: 'e2e-pca-stats' }); }
  });
}

async function seedRecoverySnapshot(page) {
  await page.evaluate(async () => {
    const openWebDb = () => new Promise((resolve, reject) => {
      const request = window.indexedDB.open('graphitix-document-state', 1);
      request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains('snapshots')) { db.createObjectStore('snapshots'); } };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const db = await openWebDb();
    const workspaceState = window.Main?.session?.workspaceState || {};
    const graphTabs = (workspaceState.tabs || []).filter(t => t && !t.isWelcome && t.type);
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace', snapshotKind: 'lifecycle-checkpoint', policyMode: 'recovery', reason: 'recovery-interval', idleForMs: 8_000, useWorker: true
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
        meta: { app: 'Graphitix', kind: 'recovery', version: 1, savedAt: new Date().toISOString(), updatedAt: Date.now(), reason: 'recovery-interval', dirty: true, hasData: true, tabCount: graphTabs.length, fileName: 'workspace.graph', fileScope: 'workspace' },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  });
}

test('PCA scree + biplot survive file reopen (archive load)', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await buildPca(page);
  await expectFullPcaStats(page, 'initial');
  const archivePath = await captureWorkspaceArchive(page, 'pca-stats-reopen');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await page.waitForTimeout(1000);
  await awaitWarmup(page);
  await page.waitForSelector('#pcaPage:not([hidden])', { timeout: 30_000 });

  await expectFullPcaStats(page, 'after file reopen');
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});

test('PCA scree + biplot survive crash recovery', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await buildPca(page);
  await expectFullPcaStats(page, 'initial');
  await seedRecoverySnapshot(page);

  const dialogHandler = async d => { await d.accept(); };
  page.on('dialog', dialogHandler);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  page.off('dialog', dialogHandler);
  await awaitWarmup(page);
  await page.evaluate(async () => {
    const state = window.Main?.session?.workspaceState;
    const tab = (state?.tabs || []).find(t => t && t.type === 'pca');
    if (tab) { const p = window.Main.tabs.activateTab(tab.id, { reason: 'e2e-activate-pca-recovery' }); if (p && p.then) await p; }
  });
  await page.waitForSelector('#pcaPage:not([hidden])', { timeout: 30_000 });

  await expectFullPcaStats(page, 'after crash recovery');
  expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
});
