/**
 * Cross-component contract: a component's rendered stats panel must survive a real
 * .graph archive reopen (and, for the rebuild-from-state components, crash recovery).
 *
 * The render cache governs the reopen restore path. Components that snapshot their stats
 * DOM and replay it can silently drop content on the serialize -> deserialize boundary
 * (SVG is stripped, node refs orphan, listeners are lost). This spec measures the stats
 * region's rendered "richness" (svg count + table rows + vector primitives + text length)
 * before save and after reopen, and fails on any loss. PCA has its own deeper spec
 * (pca.stats-restore.spec.js); this contract owns the other stats components.
 *
 * jsdom cannot host this (no layout / getBoundingClientRect == 0), so it must run in a
 * real browser.
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

// compute: id of a "Compute statistics" button to click after loading data (null = auto-computes on draw).
// containers: the stats-panel container ids that together hold the component's rendered statistics.
const CASES = [
  { key: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample', compute: 'boxComputeStats', recovery: true, containers: ['statsResults'] },
  { key: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample', compute: 'scatterComputeStats', containers: ['scatterStatsResults'] },
  { key: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample', compute: 'lineComputeStats', containers: ['lineStatsResults'] },
  { key: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample', compute: 'pieComputeStats', containers: ['pieStatsResults'] },
  { key: 'hist', pageId: 'histPage', exampleButtonId: 'histLoadExample', compute: null, containers: ['histStatsResults'] },
  { key: 'roc', pageId: 'rocPage', exampleButtonId: 'rocLoadExample', compute: 'rocComputeStats', containers: ['rocStatsResults'] },
  { key: 'survival', pageId: 'survivalPage', exampleButtonId: 'survivalLoadExample', compute: null, containers: ['survivalStatsSummary', 'survivalStatsLogRank', 'survivalStatsHazardRatios', 'survivalStatsCox'] },
  { key: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample', compute: null, containers: ['heatmapStatsContent'] },
  { key: 'surface', pageId: 'surfacePage', exampleButtonId: 'surfaceLoadExample', compute: null, containers: ['surfaceStatsSummary'] }
];

function statsRichnessInPage(containerIds) {
  let svgs = 0, rows = 0, vectors = 0, textLen = 0, exportDropdowns = 0;
  for (const id of containerIds) {
    const el = document.getElementById(id);
    if (!el) { continue; }
    svgs += el.querySelectorAll('svg').length;
    rows += el.querySelectorAll('tr').length;
    vectors += el.querySelectorAll('path, rect, circle, line, polyline').length;
    textLen += (el.textContent || '').trim().length;
    exportDropdowns += el.querySelectorAll('.export-dropdown').length;
  }
  return { svgs, rows, vectors, textLen, exportDropdowns };
}

// Click the first stats-table export trigger and report whether its menu opens. Proves the
// restored Download/Copy controls are live (re-wired), not dead/mangled markup. Returns
// { controls: false } when the component has no stats-table export controls.
function exportControlLivenessInPage(containerIds) {
  let trigger = null;
  for (const id of containerIds) {
    const el = document.getElementById(id);
    const t = el && el.querySelector('.export-dropdown .export-trigger, .export-dropdown [aria-haspopup="menu"]');
    if (t) { trigger = t; break; }
  }
  if (!trigger) { return { controls: false }; }
  const menu = trigger.closest('.export-dropdown')?.querySelector('.export-menu');
  trigger.click();
  return { controls: true, opened: menu ? menu.hidden === false : false, items: menu ? menu.children.length : 0 };
}

async function buildAndCompute(page, c) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: c.key, pageId: c.pageId, exampleButtonId: c.exampleButtonId }, { first: true });
  await page.waitForFunction(t => !!window.Components?.[t]?.ready, c.key, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, c.exampleButtonId);
  await page.waitForFunction(t => !!document.querySelector(`#${t}Page svg, #${t}Page canvas`), c.key, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(800);
  if (c.compute) {
    await page.evaluate(id => { const b = document.getElementById(id); if (b && !b.disabled) b.click(); }, c.compute);
    await page.waitForTimeout(1200);
  }
  await expect
    .poll(async () => (await page.evaluate(statsRichnessInPage, c.containers)).textLen, { timeout: 30_000 })
    .toBeGreaterThan(0);
  await page.waitForTimeout(600);
}

async function captureArchive(page, stem) {
  const archive = await page.evaluate(async () => {
    const ctx = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(ctx, { scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE', reason: 'e2e-stats-contract' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) { bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); }
    return btoa(bin);
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const p = path.join(TMP_DIR, `${stem}.graph`);
  fs.writeFileSync(p, Buffer.from(archive, 'base64'));
  return p;
}

async function awaitWarmup(page) {
  await page.evaluate(async () => {
    const sa = window.Main?.sessionActions;
    if (sa?.awaitPostLoadWarmup) { await sa.awaitPostLoadWarmup({ timeoutMs: 60_000, reason: 'e2e-stats-contract' }); }
  });
}

async function activateComponentTab(page, key) {
  await page.evaluate(async (t) => {
    const state = window.Main?.session?.workspaceState;
    const tab = (state?.tabs || []).find(x => x && x.type === t);
    if (tab) { const p = window.Main.tabs.activateTab(tab.id, { reason: 'e2e-stats-contract-activate' }); if (p && p.then) await p; }
  }, key);
}

function expectNoStatsLoss(before, after, label) {
  expect(after.svgs, `${label}: stats SVG count dropped (${after.svgs} < ${before.svgs})`).toBeGreaterThanOrEqual(before.svgs);
  expect(after.rows, `${label}: stats table rows dropped (${after.rows} < ${before.rows})`).toBeGreaterThanOrEqual(before.rows);
  expect(after.vectors, `${label}: stats vector primitives dropped (${after.vectors} < ${before.vectors})`).toBeGreaterThanOrEqual(before.vectors);
  expect(after.textLen, `${label}: stats text shrank (${after.textLen} < ${Math.floor(before.textLen * 0.9)})`).toBeGreaterThanOrEqual(Math.floor(before.textLen * 0.9));
  expect(after.exportDropdowns, `${label}: stats export controls dropped (${after.exportDropdowns} < ${before.exportDropdowns})`).toBeGreaterThanOrEqual(before.exportDropdowns);
}

// Assert the restored stats-table Download/Copy controls are live (their menu opens), not
// dead/mangled markup. No-op for components without stats-table export controls.
async function expectExportControlsLive(page, containers, label) {
  const result = await page.evaluate(exportControlLivenessInPage, containers);
  if (!result.controls) { return; }
  expect(result.opened, `${label}: restored stats export control did not open its menu`).toBe(true);
  expect(result.items, `${label}: restored stats export menu has no items`).toBeGreaterThan(0);
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
    const ws = window.Main?.session?.workspaceState || {};
    const graphTabs = (ws.tabs || []).filter(t => t && !t.isWelcome && t.type);
    const ctx = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(ctx, { scope: 'workspace', snapshotKind: 'lifecycle-checkpoint', policyMode: 'recovery', reason: 'recovery-interval', idleForMs: 8_000, useWorker: true });
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

for (const c of CASES) {
  test(`${c.key} stats survive file reopen`, async ({ page }) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    await buildAndCompute(page, c);
    const before = await page.evaluate(statsRichnessInPage, c.containers);
    const archivePath = await captureArchive(page, `contract-${c.key}-reopen`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
    await page.waitForTimeout(1000);
    await awaitWarmup(page);
    await page.waitForSelector(`#${c.pageId}:not([hidden])`, { timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(1200);

    const after = await page.evaluate(statsRichnessInPage, c.containers);
    expectNoStatsLoss(before, after, `${c.key} reopen`);
    await expectExportControlsLive(page, c.containers, `${c.key} reopen`);
    expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
  });

  if (c.recovery) {
    test(`${c.key} stats survive crash recovery`, async ({ page }) => {
      test.setTimeout(180_000);
      const issues = registerIssueCollectors(page);
      await installLocalCdnOverrides(page);

      await buildAndCompute(page, c);
      const before = await page.evaluate(statsRichnessInPage, c.containers);
      await seedRecoverySnapshot(page);

      const handler = async d => { await d.accept(); };
      page.on('dialog', handler);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      page.off('dialog', handler);
      await awaitWarmup(page);
      await activateComponentTab(page, c.key);
      await page.waitForSelector(`#${c.pageId}:not([hidden])`, { timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(1200);

      const after = await page.evaluate(statsRichnessInPage, c.containers);
      expectNoStatsLoss(before, after, `${c.key} recovery`);
      await expectExportControlsLive(page, c.containers, `${c.key} recovery`);
      expect(issues.critical.filter(e => e.kind !== 'requestfailed')).toEqual([]);
    });
  }
}
