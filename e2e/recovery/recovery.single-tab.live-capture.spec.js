// Cross-component regression: a recovery snapshot must capture AUTHORITATIVE LIVE state
// (config.getPayload), never trust a possibly-stale-but-clean tab.payload.
//
// Root cause this guards against: bulk hot.loadData() (CSV/import) is a programmatic
// non-user load (Shared.hot afterLoadData) that populates the hot WITHOUT syncing
// tab.payload or marking the tab dirty. For a single never-deactivated tab the stored
// payload then stays as the empty-default template (clean) while the component holds real
// data. If the shared checkpoint transaction is allowed to "skip if clean", it leaves
// the empty payload, graphTabsHaveData() reports no data, the snapshot is skipped/cleared,
// and recovery never fires — until the user happens to switch tabs. The fix makes recovery
// use the same save-grade checkpoint builder and live-payload intent as manual save.
//
// This test reproduces the stale-but-clean payload directly (the same state bulk loadData
// produces) and asserts the recovery snapshot still captures the live data, for every
// table-backed component — box and line worked before the fix; scatter, hist and heatmap
// regressed.

const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const {
  COMPONENT_MATRIX,
  openComponentFromWelcome,
} = require('../helpers/workspaceDriver');
const { clickExampleButton } = require('../helpers/uiDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const {
  clearRecoverySnapshot,
  requestRecoveryCheckpoint
} = require('../helpers/recoveryDriver');

const PAGE_IDS = {
  box: 'boxPage', line: 'linePage', scatter: 'scatterPage', hist: 'histPage', heatmap: 'heatmapPage'
};

async function runScenario(page, type) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type, pageId: PAGE_IDS[type] }, { first: true });
  await page.waitForSelector(`#${PAGE_IDS[type]}:not([hidden])`, { timeout: 30_000 });
  await clickExampleButton(page, COMPONENT_MATRIX.find(component => component.type === type), {
    requireMountedRoot: true
  });
  await waitForComponentOwnerReady(page, type, {
    requireMountedRoot: true,
    requireIdle: true
  });

  const setup = await page.evaluate(componentType => {
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

    return {
      tabId: active.id,
      type: active.type,
      liveHasData,
      gateWithStalePayload
    };
  }, type);

  // Clear any auto-written snapshot before forcing the explicit recovery write.
  await clearRecoverySnapshot(page, { clearCanonicalJournal: false });
  await page.evaluate(({ tabId, type }) => {
    window.Main.session.markSessionDirty('test-force-dirty', { tabId, type, origin: 'user' });
  }, { tabId: setup.tabId, type: setup.type });
  const writeResult = await requestRecoveryCheckpoint(page, 'recovery-interval');
  const snapMeta = await page.evaluate(() => {
    return new Promise(resolve => {
      const req = window.indexedDB.open('graphitix-document-state', 2);
      req.onsuccess = () => { try { const tx = req.result.transaction('snapshots', 'readonly'); const g = tx.objectStore('snapshots').get('active-recovery'); g.onsuccess = () => resolve(g.result ? g.result.meta : null); g.onerror = () => resolve(null); } catch (e) { resolve(null); } };
      req.onerror = () => resolve(null);
    });
  });
  const recapturedRows = await page.evaluate(componentType => {
    const active = window.Main.session.getActiveTab();
    const payload = active?.payload || window.Main.components.registry[componentType]?.getPayload?.();
    return Array.isArray(payload?.data)
      ? payload.data.filter(row => Array.isArray(row) && row.some(cell => cell != null && String(cell).trim() !== '')).length
      : -1;
  }, type);
  return {
    ...setup,
    recapturedRows,
    writeStatus: writeResult && writeResult.status,
    snapshotHasData: snapMeta ? !!snapMeta.hasData : null
  };
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
    // The shared checkpoint transaction re-captures live data before evaluating archive eligibility.
    expect(r.writeStatus, `${type}: recovery snapshot should be saved`).toBe('saved');
    expect(r.snapshotHasData, `${type}: recovery snapshot must contain the live data`).toBe(true);
    expect(r.recapturedRows, `${type}: tab.payload should be re-hydrated with live data`).toBeGreaterThan(1);
  });
}
