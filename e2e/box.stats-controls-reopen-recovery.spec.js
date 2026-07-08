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
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' }, { first: true });
  await page.waitForFunction(() => !!window.Components?.box?.ready, null, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');
  await waitForBoxStatsControlsReady(page);
  await expect(page.locator('#boxComputeStats')).toHaveText(/Calculate statistics/i, { timeout: 20_000 });
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics ready to calculate.', { timeout: 20_000 });
}

async function captureWorkspaceArchive(page, name) {
  const archive = await page.evaluate(async () => {
    const ctx = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(ctx, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-box-stats-controls-archive'
    });
    if (!blob) {
      throw new Error('buildWorkspaceArchiveBlob returned no blob');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, name);
  fs.writeFileSync(archivePath, Buffer.from(archive, 'base64'));
  return archivePath;
}

async function awaitPostLoadWarmup(page) {
  await page.evaluate(async () => {
    const sessionActions = window.Main?.sessionActions;
    if (sessionActions?.awaitPostLoadWarmup) {
      await sessionActions.awaitPostLoadWarmup({ timeoutMs: 60_000, reason: 'e2e-box-stats-controls' });
    }
  });
}

async function loadWorkspaceArchive(page, archivePath) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#workspaceSessionInput')).toHaveCount(1, { timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 40_000 });
  await awaitPostLoadWarmup(page);
}

async function seedRecoverySnapshot(page) {
  return page.evaluate(async () => {
    const openWebDb = () => new Promise((resolve, reject) => {
      const request = window.indexedDB.open('graphitix-document-state', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
    const ctx = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(ctx, {
      scope: 'workspace',
      snapshotKind: 'lifecycle-checkpoint',
      policyMode: 'recovery',
      idleForMs: 8000,
      useWorker: true,
      reason: 'recovery-interval'
    });
    if (!blob) {
      throw new Error('Recovery snapshot blob was empty');
    }
    const workspaceState = window.Main?.session?.workspaceState || {};
    const tabs = Array.isArray(workspaceState.tabs) ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome) : [];
    const db = await openWebDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
        meta: {
          app: 'Graphitix',
          kind: 'recovery',
          version: 1,
          savedAt: new Date().toISOString(),
          updatedAt: Date.now(),
          reason: 'recovery-interval',
          dirty: true,
          hasData: true,
          tabCount: tabs.length,
          fileName: workspaceState.sessionFileName || 'recovered.graph',
          filePath: workspaceState.sessionFilePath || '',
          fileScope: workspaceState.sessionFileScope || 'workspace'
        },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB snapshot write failed'));
    });
    return { bytes: blob.size, tabCount: tabs.length };
  });
}

async function reloadAndAcceptRecovery(page) {
  const handler = async dialog => { await dialog.accept(); };
  page.on('dialog', handler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 40_000 });
    await awaitPostLoadWarmup(page);
  } finally {
    page.off('dialog', handler);
  }
}

test('box pre-compute statistics controls survive archive reopen', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await openBoxWithExampleButDoNotCompute(page);
  const before = await page.evaluate(boxStatsControlsSnapshotInPage);
  const archivePath = await captureWorkspaceArchive(page, 'box-stats-controls-precompute.graph');

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
