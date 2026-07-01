const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

async function activeRocTabId(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
    return active?.type === 'roc' ? String(active.id || '') : '';
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
  await openComponentFromWelcome(page, { type: 'roc', pageId: 'rocPage' }, { first, loadExample: true });
  await page.waitForFunction(() => !!window.Components?.roc?.ready, null, { timeout: 35_000 });
  await page.waitForFunction(() => {
    const payload = window.Components?.roc?.getPayload?.();
    return Array.isArray(payload?.data) && payload.data.length > 3;
  }, null, { timeout: 35_000 });
  const after = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || ''))
  );
  return after.find(id => id && !before.includes(id)) || await activeRocTabId(page);
}

async function waitForRocGraphType(page, graphType) {
  await page.waitForFunction(type => {
    const root = document.querySelector('#rocPage:not([hidden])');
    const payload = window.Components?.roc?.getPayload?.() || {};
    const text = [
      root?.querySelector?.('#rocSvg')?.textContent || '',
      root?.querySelector?.('#rocStatsResults')?.textContent || ''
    ].join('\n');
    if(root?.querySelector?.('#rocGraphType')?.value !== type || payload?.config?.graphType !== type){
      return false;
    }
    return type === 'pr'
      ? /Precision-Recall|Average Precision|AP\b/i.test(text)
      : /ROC curve|False Positive Rate|AUC\b/i.test(text);
  }, graphType, { timeout: 60_000 });
}

async function configureLargeManualPrTab(page) {
  await page.evaluate(() => {
    const rows = [['Label', 'Model1', 'Model2', 'Model3']];
    for(let i = 0; i < 5205; i += 1){
      const label = i % 2;
      const rank = (i % 100) / 100;
      rows.push([
        label,
        label ? 0.52 + rank * 0.46 : 0.02 + rank * 0.42,
        label ? 0.42 + rank * 0.44 : 0.08 + rank * 0.36,
        label ? 0.35 + rank * 0.40 : 0.12 + rank * 0.30
      ]);
    }
    const current = window.Components.roc.getPayload?.() || { type: 'roc', config: {} };
    window.Components.roc.loadFromPayload({
      ...current,
      type: 'roc',
      data: rows,
      dataViews: undefined,
      activeDataViewId: undefined,
      config: {
        ...(current.config || {}),
        graphType: 'pr',
        showGrid: false,
        showFrame: true,
        showLegend: true
      }
    }, { source: 'e2e-roc-large-pr-load', skipDraw: false });
    const root = document.querySelector('#rocPage:not([hidden])');
    const graphType = root?.querySelector?.('#rocGraphType');
    if(graphType){
      graphType.value = 'pr';
      graphType.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('#rocPage:not([hidden])');
    const payload = window.Components?.roc?.getPayload?.();
    return payload?.config?.graphType === 'pr'
      && Array.isArray(payload?.data)
      && payload.data.length > 5000
      && root?.querySelector?.('#rocRenderRow')?.hidden === false;
  }, null, { timeout: 60_000 });
}

async function scheduleFirstTabThenSwitch(page, targetTabId) {
  await page.evaluate(async id => {
    const originalRaf = window.requestAnimationFrame;
    let delayed = true;
    window.requestAnimationFrame = callback => {
      if(delayed){
        delayed = false;
        window.requestAnimationFrame = originalRaf;
        return window.setTimeout(() => callback(window.performance.now()), 80);
      }
      return originalRaf(callback);
    };
    const root = document.querySelector('#rocPage:not([hidden])');
    const graphType = root?.querySelector?.('#rocGraphType');
    const grid = root?.querySelector?.('#rocShowGrid');
    const legend = root?.querySelector?.('#rocShowLegend');
    if(graphType){
      graphType.value = 'roc';
      graphType.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if(grid){
      grid.checked = true;
      grid.dispatchEvent(new Event('input', { bubbles: true }));
      grid.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if(legend){
      legend.checked = false;
      legend.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.Components.roc.scheduleDraw?.();
    const result = window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-roc-stale-scheduled-switch' });
    if(result && typeof result.then === 'function'){
      await result;
    }
  }, targetTabId);
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, targetTabId, { timeout: 20_000 });
  await page.waitForTimeout(220);
}

async function snapshotRoc(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#rocPage:not([hidden])');
    const payload = window.Components?.roc?.getPayload?.() || null;
    const runtime = window.Components?.roc?.captureRuntimeState?.({ reason: 'e2e-roc-snapshot' }) || null;
    const runtimeState = runtime?.state || runtime?.snapshot?.state || runtime?.payload?.state || null;
    return {
      tabId: window.Main?.session?.workspaceState?.activeTabId || null,
      graphType: root?.querySelector?.('#rocGraphType')?.value || null,
      payloadGraphType: payload?.config?.graphType || null,
      showGrid: !!root?.querySelector?.('#rocShowGrid')?.checked,
      payloadShowGrid: !!payload?.config?.showGrid,
      showLegend: !!root?.querySelector?.('#rocShowLegend')?.checked,
      payloadShowLegend: payload?.config?.showLegend !== false,
      dataRows: Array.isArray(payload?.data) ? payload.data.length : 0,
      renderRowHidden: !!root?.querySelector?.('#rocRenderRow')?.hidden,
      renderButtonDisabled: !!root?.querySelector?.('#rocRenderButton')?.disabled,
      noticeText: root?.querySelector?.('#rocAutoDrawNotice')?.textContent || '',
      runtimeAutoDrawEnabled: runtimeState?.autoDrawEnabled,
      svgText: root?.querySelector?.('#rocSvg')?.textContent || '',
      statsText: root?.querySelector?.('#rocStatsResults')?.textContent || ''
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
      reason: 'e2e-roc-scheduled-autodraw-isolation'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for(let i = 0; i < bytes.length; i += 0x8000){
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
    if(sa?.awaitPostLoadWarmup){
      await sa.awaitPostLoadWarmup({ timeoutMs: 60_000, reason: 'e2e-roc-scheduled-autodraw-isolation' });
    }
  });
}

function expectSmallRocSnapshot(snapshot, options = {}) {
  expect(snapshot.graphType).toBe('roc');
  expect(snapshot.payloadGraphType).toBe('roc');
  if(options.checkControls !== false){
    expect(snapshot.showGrid).toBe(true);
    expect(snapshot.payloadShowGrid).toBe(true);
    expect(snapshot.showLegend).toBe(false);
    expect(snapshot.payloadShowLegend).toBe(false);
  }
  expect(snapshot.dataRows).toBeLessThan(5000);
  expect(snapshot.svgText + snapshot.statsText).toMatch(/ROC curve|False Positive Rate|AUC\b/i);
}

function expectLargePrSnapshot(snapshot) {
  expect(snapshot.graphType).toBe('pr');
  expect(snapshot.payloadGraphType).toBe('pr');
  expect(snapshot.dataRows).toBeGreaterThan(5000);
  expect(snapshot.renderRowHidden).toBe(false);
  expect(snapshot.renderButtonDisabled).toBe(false);
  expect(snapshot.noticeText).toMatch(/Live updates are paused|Use Update Plot/i);
  if(snapshot.runtimeAutoDrawEnabled !== undefined){
    expect(snapshot.runtimeAutoDrawEnabled).toBe(false);
  }
  expect(snapshot.svgText + snapshot.statsText).toMatch(/Precision-Recall|Average Precision|AP\b/i);
}

test('ROC scheduled draw and auto-draw state stay isolated across same-type tabs and reopen', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Focused acceptance requested for Chromium.');
  test.setTimeout(300_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const smallId = await openRocExampleTab(page, { first: true });
  await waitForRocGraphType(page, 'roc');

  const largeId = await openRocExampleTab(page);
  expect(largeId).not.toBe(smallId);
  await configureLargeManualPrTab(page);
  const largeBefore = await snapshotRoc(page);
  expectLargePrSnapshot(largeBefore);

  await activateTab(page, smallId);
  await waitForRocGraphType(page, 'roc');
  await scheduleFirstTabThenSwitch(page, largeId);
  expectLargePrSnapshot(await snapshotRoc(page));

  await activateTab(page, smallId);
  await waitForRocGraphType(page, 'roc');
  expectSmallRocSnapshot(await snapshotRoc(page));

  await activateTab(page, largeId);
  expectLargePrSnapshot(await snapshotRoc(page));

  const archivePath = await captureArchive(page, 'roc-scheduled-autodraw-tabs');
  await reopenArchive(page, archivePath);
  const reopenedIds = await page.evaluate(() =>
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => tab && tab.type === 'roc')
      .map(tab => String(tab.id || ''))
  );
  expect(reopenedIds).toHaveLength(2);

  const reopened = [];
  for(const tabId of reopenedIds){
    await activateTab(page, tabId);
    reopened.push(await snapshotRoc(page));
  }
  const reopenedSmall = reopened.find(snapshot => snapshot.graphType === 'roc');
  const reopenedLarge = reopened.find(snapshot => snapshot.graphType === 'pr');
  expect(reopenedSmall).toBeTruthy();
  expect(reopenedLarge).toBeTruthy();
  expectSmallRocSnapshot(reopenedSmall, { checkControls: false });
  expectLargePrSnapshot(reopenedLarge);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
