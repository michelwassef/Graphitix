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

async function activeRocTabId(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
    return active && active.type === 'roc' ? String(active.id || '') : '';
  });
}

async function activateTab(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ force: true });
  await page.waitForFunction(
    id => window.Main?.session?.workspaceState?.activeTabId === id,
    tabId,
    { timeout: 20_000 }
  );
  await page.waitForSelector('#rocPage:not([hidden])', { timeout: 20_000 });
}

async function openRocExampleTab(page, { first = false } = {}) {
  const before = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || ''))
  );
  await openComponentFromWelcome(page, { type: 'roc', pageId: 'rocPage' }, { first });
  await page.waitForFunction(() => !!window.Components?.roc?.ready, null, { timeout: 35_000 });
  await clickExampleButtonIfPresent(page, 'rocLoadExample');
  await page.waitForFunction(() => {
    const payload = window.Components?.roc?.getPayload?.();
    return Array.isArray(payload?.data) && payload.data.length > 3 && (payload.data[0] || []).length >= 3;
  }, null, { timeout: 35_000 });
  const after = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || ''))
  );
  return after.find(id => id && !before.includes(id)) || await activeRocTabId(page);
}

async function waitForRocComparison(page, expected) {
  await page.waitForFunction(({ graphType, diffMethod, metric }) => {
    const root = document.querySelector('#rocPage:not([hidden])');
    const payload = window.Components?.roc?.getPayload?.() || {};
    const selects = Array.from(root?.querySelectorAll?.('#rocStatsControls select') || []);
    const compareText = root?.querySelector?.('#rocStatsControls span')?.textContent || '';
    const advisorText = root?.querySelector?.('#rocStatsAdvisor')?.textContent || '';
    return root?.querySelector?.('#rocGraphType')?.value === graphType
      && payload?.config?.graphType === graphType
      && payload?.stats?.diffMethod === diffMethod
      && selects[0]?.value === diffMethod
      && new RegExp(metric, 'i').test(compareText)
      && /p\s*=/.test(compareText)
      && /Use |Recommendation/i.test(advisorText);
  }, expected, { timeout: 60_000 });
}

async function configureRocComparison(page, variant) {
  await page.locator('#rocPage:not([hidden]) #rocGraphType').selectOption(variant.graphType);
  await page.waitForTimeout(200);
  await page.locator('#rocPage:not([hidden]) #rocStatsAdvisor .stats-advisor__toggle').click();
  await page.locator(`#rocPage:not([hidden]) #rocStatsAdvisor input[name="roc-advisor-methodChoice"][value="${variant.diffMethod}"]`).check();
  await page.getByRole('button', { name: 'Apply recommendation' }).click();
  await waitForRocComparison(page, variant);
}

async function snapshotRoc(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
    const root = document.querySelector('#rocPage:not([hidden])');
    const payload = window.Components?.roc?.getPayload?.() || null;
    const selects = Array.from(root?.querySelectorAll?.('#rocStatsControls select') || []);
    const checked = root?.querySelector?.('#rocStatsAdvisor input[name="roc-advisor-methodChoice"]:checked') || null;
    return {
      tabId: active?.id || null,
      graphType: root?.querySelector?.('#rocGraphType')?.value || null,
      payloadGraphType: payload?.config?.graphType || null,
      diffMethod: selects[0]?.value || null,
      compareSelection: selects[1]?.value || null,
      payloadDiffMethod: payload?.stats?.diffMethod || null,
      payloadCompareSelection: payload?.stats?.compareSelection || null,
      payloadCompareText: payload?.stats?.compareResult?.displayText || '',
      checkedAdvisorMethod: checked?.value || null,
      advisorText: root?.querySelector?.('#rocStatsAdvisor')?.textContent || '',
      compareText: root?.querySelector?.('#rocStatsControls span')?.textContent || '',
      reportGraphType: payload?.stats?.reportModel?.analysisSpec?.graphType || null,
      reportDiffMethod: payload?.stats?.reportModel?.analysisSpec?.diffMethod || null,
      reportCompareSelection: payload?.stats?.reportModel?.analysisSpec?.compareSelection || null
    };
  });
}

async function captureArchive(page, stem) {
  const archive = await page.evaluate(async () => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-roc-advisor-compare-tab-isolation'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return { base64: btoa(binary) };
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, `${stem}.graph`);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function reopenArchive(page, archivePath) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await page.waitForFunction(
    () => (window.Main?.session?.workspaceState?.tabs || []).filter(tab => tab && tab.type === 'roc').length === 2,
    null,
    { timeout: 60_000 }
  );
  await page.evaluate(async () => {
    const sa = window.Main?.sessionActions;
    if (sa?.awaitPostLoadWarmup) {
      await sa.awaitPostLoadWarmup({ timeoutMs: 60_000, reason: 'e2e-roc-advisor-compare-tab-isolation' });
    }
  });
}

function expectRocSnapshot(snapshot, expected) {
  expect(snapshot.graphType).toBe(expected.graphType);
  expect(snapshot.payloadGraphType).toBe(expected.graphType);
  expect(snapshot.diffMethod).toBe(expected.diffMethod);
  expect(snapshot.payloadDiffMethod).toBe(expected.diffMethod);
  expect(snapshot.checkedAdvisorMethod).toBe(expected.diffMethod);
  expect(snapshot.compareSelection).toBeTruthy();
  expect(snapshot.payloadCompareSelection).toBe(snapshot.compareSelection);
  expect(snapshot.compareText).toMatch(new RegExp(expected.metric, 'i'));
  expect(snapshot.compareText).toMatch(/p\s*=/);
  expect(snapshot.payloadCompareText).toBe(snapshot.compareText);
  if (expected.compareText) {
    expect(snapshot.compareText).toBe(expected.compareText);
  }
  expect(snapshot.advisorText).toMatch(expected.advisorPattern);
  expect(snapshot.reportGraphType).toBe(expected.graphType);
  expect(snapshot.reportDiffMethod).toBe(expected.diffMethod);
  expect(snapshot.reportCompareSelection).toBe(snapshot.compareSelection);
}

test('ROC advisor and exact comparison controls stay isolated across same-type tabs and reopen', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const rocVariant = {
    graphType: 'roc',
    diffMethod: 'bootstrap',
    metric: 'ΔAUC|AUC',
    advisorPattern: /Bootstrap resampling comparison/i
  };
  const prVariant = {
    graphType: 'pr',
    diffMethod: 'permutation',
    metric: 'ΔAP|AP',
    advisorPattern: /Permutation-based comparison/i
  };

  const firstId = await openRocExampleTab(page, { first: true });
  await configureRocComparison(page, rocVariant);
  const firstBefore = await snapshotRoc(page);

  const secondId = await openRocExampleTab(page);
  expect(secondId).not.toBe(firstId);
  await configureRocComparison(page, prVariant);
  const secondBefore = await snapshotRoc(page);

  await activateTab(page, firstId);
  await waitForRocComparison(page, rocVariant);
  expectRocSnapshot(await snapshotRoc(page), { ...rocVariant, compareText: firstBefore.compareText });

  await activateTab(page, secondId);
  await waitForRocComparison(page, prVariant);
  expectRocSnapshot(await snapshotRoc(page), { ...prVariant, compareText: secondBefore.compareText });

  const archivePath = await captureArchive(page, 'roc-advisor-compare-tabs');
  await reopenArchive(page, archivePath);

  const reopenedTabIds = await page.evaluate(() =>
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => tab && tab.type === 'roc')
      .map(tab => String(tab.id || ''))
  );
  expect(reopenedTabIds).toHaveLength(2);

  const reopened = [];
  for (const tabId of reopenedTabIds) {
    await activateTab(page, tabId);
    let snap = await snapshotRoc(page);
    await waitForRocComparison(page, snap.graphType === 'pr' ? prVariant : rocVariant);
    snap = await snapshotRoc(page);
    reopened.push(snap);
  }

  const reopenedRoc = reopened.find(snap => snap.graphType === 'roc');
  const reopenedPr = reopened.find(snap => snap.graphType === 'pr');
  expect(reopenedRoc).toBeTruthy();
  expect(reopenedPr).toBeTruthy();
  expectRocSnapshot(reopenedRoc, { ...rocVariant, compareText: firstBefore.compareText });
  expectRocSnapshot(reopenedPr, { ...prVariant, compareText: secondBefore.compareText });

  expect(firstBefore.compareText).not.toBe(secondBefore.compareText);
  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
