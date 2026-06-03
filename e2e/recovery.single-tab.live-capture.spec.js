// Cross-component regression: a recovery snapshot must capture AUTHORITATIVE LIVE state
// (config.getPayload), never trust a possibly-stale-but-clean tab.payload.
//
// Root cause this guards against: bulk hot.loadData() (CSV/import) is a programmatic
// non-user load (Shared.hot afterLoadData) that populates the hot WITHOUT syncing
// tab.payload or marking the tab dirty. For a single never-deactivated tab the stored
// payload then stays as the empty-default template (clean) while the component holds real
// data. If writeRecoverySnapshot's pre-gate flush is allowed to "skip if clean", it leaves
// the empty payload, graphTabsHaveData() reports no data, the snapshot is skipped/cleared,
// and recovery never fires — until the user happens to switch tabs (which flushes via
// getPayload). The fix forces a live payload capture in the recovery flush.
//
// This test reproduces the stale-but-clean payload directly (the same state bulk loadData
// produces) and asserts the recovery snapshot still captures the live data, for every
// table-backed component — box and line worked before the fix; scatter, hist and heatmap
// regressed.

const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const PAGE_IDS = {
  box: 'boxPage', line: 'linePage', scatter: 'scatterPage', hist: 'histPage', heatmap: 'heatmapPage'
};
const EXAMPLE_BUTTONS = {
  box: 'boxLoadExample', line: 'lineLoadExample', scatter: 'scatterLoadExample', hist: 'histLoadExample', heatmap: 'heatmapLoadExample'
};

async function runScenario(page, type) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type, pageId: PAGE_IDS[type] }, { first: true });
  await page.waitForSelector(`#${PAGE_IDS[type]}:not([hidden])`, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, EXAMPLE_BUTTONS[type]);
  await page.waitForTimeout(1500);

  return page.evaluate(async (componentType) => {
    const session = window.Main.session;
    const active = session.getActiveTab();
    const config = window.Main.components.registry[componentType];
    const meaningfulRows = (p) => (p && Array.isArray(p.data))
      ? p.data.filter(r => Array.isArray(r) && r.some(c => c != null && String(c).trim() !== '')).length
      : -1;

    let livePayload = null;
    try { livePayload = config.getPayload(); } catch (e) {}
    const liveHasData = meaningfulRows(livePayload) > 1; // more than just a header row

    // Reproduce the bulk-loadData state: real data lives in the component (getPayload returns
    // it) but tab.payload is the empty-default template AND marked clean.
    const headerRow = (livePayload && Array.isArray(livePayload.data) && Array.isArray(livePayload.data[0]))
      ? livePayload.data[0].map(() => '') : [''];
    active.payload = Object.assign({}, livePayload, { data: [headerRow, [], []] });
    active.payloadSignature = 'stale-sig';
    active.payloadDirty = false;
    active.userModified = true;

    const gateWithStalePayload = !!session.graphTabsHaveData();

    // Clear any auto-written snapshot and force a fresh dirty revision so the explicit write
    // exercises the real gate.
    await new Promise((resolve) => {
      const req = window.indexedDB.open('graphitix-document-state', 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots'); };
      req.onsuccess = () => { try { const tx = req.result.transaction('snapshots', 'readwrite'); tx.objectStore('snapshots').delete('active-recovery'); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); } catch (e) { resolve(); } };
      req.onerror = () => resolve();
    });
    session.markSessionDirty('test-force-dirty', { tabId: active.id, type: active.type, origin: 'user' });

    const writeResult = await window.Main.documentState.writeRecoverySnapshot('recovery-interval');

    const snapMeta = await new Promise((resolve) => {
      const req = window.indexedDB.open('graphitix-document-state', 1);
      req.onsuccess = () => { try { const tx = req.result.transaction('snapshots', 'readonly'); const g = tx.objectStore('snapshots').get('active-recovery'); g.onsuccess = () => resolve(g.result ? g.result.meta : null); g.onerror = () => resolve(null); } catch (e) { resolve(null); } };
      req.onerror = () => resolve(null);
    });

    return {
      liveHasData,
      gateWithStalePayload,
      recapturedRows: meaningfulRows(active.payload),
      writeStatus: writeResult && writeResult.status,
      snapshotHasData: snapMeta ? !!snapMeta.hasData : null
    };
  }, type);
}

for (const type of ['box', 'line', 'scatter', 'hist', 'heatmap']) {
  test(`recovery captures live data despite a stale-clean payload: ${type}`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    const r = await runScenario(page, type);
    // Sanity: the example data actually loaded into the live component.
    expect(r.liveHasData, `${type}: example data should load`).toBe(true);
    // Sanity: with the stale-clean payload, the data-presence gate alone reports no data
    // (this is the condition that breaks recovery without a forced live capture).
    expect(r.gateWithStalePayload, `${type}: stale payload should look empty to the gate`).toBe(false);
    // The fix: the recovery flush re-captures live data, so the snapshot is written with data.
    expect(r.writeStatus, `${type}: recovery snapshot should be saved`).toBe('saved');
    expect(r.snapshotHasData, `${type}: recovery snapshot must contain the live data`).toBe(true);
    expect(r.recapturedRows, `${type}: tab.payload should be re-hydrated with live data`).toBeGreaterThan(1);
  });
}
