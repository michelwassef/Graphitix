const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
  installLocalCdnOverrides,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

const FORCED_LOCK_CASES = [
  {
    type: 'line',
    pageId: 'linePage',
    modeSelector: '#lineViewMode',
    userMode: '2d',
    forcedMode: '3d'
  },
  {
    type: 'scatter',
    pageId: 'scatterPage',
    modeSelector: '#scatterViewMode',
    userMode: '2d',
    forcedMode: '3d'
  },
  {
    type: 'pie',
    pageId: 'piePage',
    modeSelector: '#pieChartType',
    userMode: 'stacked',
    forcedMode: 'pie'
  },
  {
    type: 'venn',
    pageId: 'vennPage',
    modeSelector: '#vennPlotType',
    userMode: 'upset',
    forcedMode: 'venn'
  }
];

async function waitForLockRatioCheckbox(page, pageId, tabId = null) {
  await page.waitForFunction(({ pageId, tabId }) => {
    const activeId = window.Main?.session?.workspaceState?.activeTabId || null;
    if (tabId && String(activeId || '') !== String(tabId || '')) {
      return false;
    }
    const visibleRoot = document.querySelector(`#${pageId}:not([hidden])`);
    const root = visibleRoot
      || (tabId ? window.Shared?.workspaceTabs?.getMountedRoot?.(tabId, null) : null);
    return !!root?.querySelector?.('.svgbox .resizer-aspect-checkbox');
  }, { pageId, tabId }, {
    timeout: 30_000,
  });
}

async function getLockRatioState(page, pageId) {
  return page.evaluate(({ pageId }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const checkbox = root?.querySelector?.('.svgbox .resizer-aspect-checkbox') || null;
    return {
      present: !!checkbox,
      checked: !!checkbox?.checked,
      disabled: !!checkbox?.disabled
    };
  }, { pageId });
}

async function getGraphTabIds(page, type) {
  return page.evaluate(graphType => (
    Array.isArray(window.Main?.session?.workspaceState?.tabs)
      ? window.Main.session.workspaceState.tabs
          .filter(tab => tab && !tab.isWelcome && tab.type === graphType)
          .map(tab => String(tab.id || '').trim())
      : []
  ).filter(Boolean), type);
}

async function openGraphTab(page, type, pageId, { first = false, reason = 'e2e-lock-ratio-open' } = {}) {
  const before = new Set(await getGraphTabIds(page, type));
  await page.evaluate(async ({ type, first, reason }) => {
    const tabs = window.Main?.tabs;
    if (!tabs || typeof tabs.handleGraphSelection !== 'function') {
      throw new Error('Main.tabs.handleGraphSelection unavailable');
    }
    if (!first && typeof tabs.handleAddTabClick === 'function') {
      const addResult = tabs.handleAddTabClick();
      if (addResult && typeof addResult.then === 'function') {
        await addResult;
      }
    }
    const result = tabs.handleGraphSelection(type, {
      forceBlankWorkspace: true,
      skipDuplicatePrompt: true,
      disableDuplicatePrompt: true,
      reason
    });
    if (result && typeof result.then === 'function') {
      await result;
    }
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const empty = document.getElementById('duplicateEmpty');
    if (prompt && empty && !empty.disabled) {
      empty.click();
    }
  }, { type, first, reason });
  await page.waitForSelector(`#${pageId}:not([hidden])`, { timeout: 30_000 });
  await waitForLockRatioCheckbox(page, pageId);
  const after = await getGraphTabIds(page, type);
  return after.find(id => !before.has(id)) || after[after.length - 1] || null;
}

async function activateTab(page, tabId, pageId) {
  await page.evaluate(async ({ tabId }) => {
    const result = window.Main?.tabs?.activateTab?.(tabId, { reason: 'e2e-lock-ratio-activate' });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, { tabId });
  await page.waitForFunction(({ tabId }) => {
    return String(window.Main?.session?.workspaceState?.activeTabId || '') === String(tabId || '');
  }, { tabId }, { timeout: 20_000 });
  await page.waitForSelector(`#${pageId}:not([hidden])`, { timeout: 20_000 });
  await waitForLockRatioCheckbox(page, pageId, tabId);
}

async function persistActiveTab(page, reason = 'e2e-lock-ratio-persist') {
  await page.evaluate(async reason => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId) || null;
    const result = window.Main?.session?.persistActiveTabState?.(tab, {
      reason,
      origin: 'lifecycle',
      captureLivePayload: true,
      allowSkipLivePayloadCapture: false
    });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, reason);
}

async function selectMode(page, pageId, selector, value) {
  await page.locator(`#${pageId}:not([hidden]) ${selector}`).selectOption(value);
  await page.waitForTimeout(450);
}

async function setLockRatio(page, pageId, checked) {
  await page.evaluate(({ pageId, checked }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const checkbox = root?.querySelector?.('.svgbox .resizer-aspect-checkbox') || null;
    if (!checkbox) {
      throw new Error('Lock ratio checkbox not found');
    }
    if (checkbox.disabled) {
      throw new Error('Lock ratio checkbox is disabled in user-toggleable mode');
    }
    if (checkbox.checked !== checked) {
      checkbox.checked = checked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { pageId, checked });
  await page.waitForTimeout(250);
}

async function readActiveLockSnapshot(page, pageId, modeSelector) {
  return page.evaluate(({ pageId, modeSelector }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const checkbox = root?.querySelector?.('.svgbox .resizer-aspect-checkbox') || null;
    const svgBox = root?.querySelector?.('.svgbox') || null;
    const mode = root?.querySelector?.(modeSelector) || null;
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const activeTab = window.Main?.session?.workspaceState?.tabs?.find(tab => tab?.id === activeTabId) || null;
    const vennState = pageId === 'vennPage' ? window.Components?.venn?.__getState?.() : null;
    const vennSession = pageId === 'vennPage'
      ? window.Components?.venn?.__testHooks?.getSession?.(activeTabId)
      : null;
    return {
      mode: mode?.value || null,
      checked: !!checkbox?.checked,
      disabled: !!checkbox?.disabled,
      aspectLocked: svgBox?.dataset?.resizerAspectLocked || null,
      resizerAspectLocked: svgBox?.__sharedResizableBoxApi?.getState?.().aspectLocked ?? null,
      sessionAspectLocked: activeTab?.sharedState?.layout?.resizer?.aspectLocked ?? null,
      layoutAspectLocked: activeTab?.layoutState?.svgBox?.dataset?.resizerAspectLocked ?? null,
      lockRatioPrevious: vennState?.ui?.lockRatioPrevious ?? null,
      sessionLockRatioPrevious: vennSession?.state?.lockRatioPrevious ?? null
    };
  }, { pageId, modeSelector });
}

async function captureArchive(page, name) {
  const archive = await page.evaluate(async () => {
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    const context = tabsApi?.getSessionActionsContext?.();
    const blob = await sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-lock-ratio-archive'
    });
    if (!blob) {
      throw new Error('No workspace archive blob');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return btoa(binary);
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, `${name}.graph`);
  fs.writeFileSync(archivePath, Buffer.from(archive, 'base64'));
  return archivePath;
}

async function loadArchive(page, archivePath, type) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await page.waitForFunction(() => document.getElementById('workspaceSessionInput')?.value === '', null, {
    timeout: 60_000
  });
  await page.waitForFunction(graphType => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return Array.isArray(tabs) && tabs.filter(tab => tab && !tab.isWelcome && tab.type === graphType).length >= 2;
  }, type, { timeout: 45_000 });
  await page.evaluate(async graphType => {
    const state = window.Main?.session?.workspaceState;
    const tabId = String(state?.activeTabId || '');
    const component = window.Components?.[graphType];
    const ready = component?.awaitReadyForSnapshot?.({
      tabId,
      componentKey: graphType,
      reason: 'e2e-lock-ratio-load-ready'
    });
    if(ready && typeof ready.then === 'function'){
      await ready;
    }
  }, type);
  await page.waitForFunction(graphType => {
    const state = window.Main?.session?.workspaceState;
    const activeId = String(state?.activeTabId || '');
    const active = state?.tabs?.find(tab => String(tab?.id || '') === activeId) || null;
    if(!active || active.type !== graphType || active.activationError){
      return false;
    }
    return window.Shared?.componentLifecycle?.isRestoreTransactionActive?.(graphType, {
      tabId: activeId,
      reason: 'e2e-lock-ratio-load-ready'
    }) !== true;
  }, type, { timeout: 45_000 });
}

test.describe('Lock ratio subtype enforcement', () => {
  test('line 3D mode enforces lock ratio', async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openGraphTab(page, 'line', 'linePage', { first: true });
    await waitForLockRatioCheckbox(page, 'linePage');
    await page.selectOption('#lineViewMode', '3d');
    await page.waitForTimeout(350);
    const state = await getLockRatioState(page, 'linePage');
    expect(state.present).toBe(true);
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);
  });

  test('scatter 3D mode enforces lock ratio', async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openGraphTab(page, 'scatter', 'scatterPage', { first: true });
    await waitForLockRatioCheckbox(page, 'scatterPage');
    await page.selectOption('#scatterViewMode', '3d');
    await page.waitForTimeout(350);
    const state = await getLockRatioState(page, 'scatterPage');
    expect(state.present).toBe(true);
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);
  });

  test('pca always enforces lock ratio', async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openGraphTab(page, 'pca', 'pcaPage', { first: true });
    await waitForLockRatioCheckbox(page, 'pcaPage');
    await page.waitForTimeout(300);
    let state = await getLockRatioState(page, 'pcaPage');
    expect(state.present).toBe(true);
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);

    await page.selectOption('#pcaViewMode', '3d');
    await page.waitForTimeout(300);
    state = await getLockRatioState(page, 'pcaPage');
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);

    await page.selectOption('#pcaViewMode', '2d');
    await page.waitForTimeout(300);
    state = await getLockRatioState(page, 'pcaPage');
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);
  });

  test('venn mode enforces lock ratio while upset mode remains user-toggleable', async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openGraphTab(page, 'venn', 'vennPage', { first: true });
    await waitForLockRatioCheckbox(page, 'vennPage');

    await page.selectOption('#vennPlotType', 'venn');
    await page.waitForTimeout(300);
    let state = await getLockRatioState(page, 'vennPage');
    expect(state.present).toBe(true);
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);

    await page.selectOption('#vennPlotType', 'upset');
    await page.waitForTimeout(300);
    state = await getLockRatioState(page, 'vennPage');
    expect(state.present).toBe(true);
    expect(state.checked).toBe(false);
    expect(state.disabled).toBe(false);

    await setLockRatio(page, 'vennPage', true);
    let snapshot = await readActiveLockSnapshot(page, 'vennPage', '#vennPlotType');
    expect(snapshot.checked).toBe(true);
    expect(snapshot.disabled).toBe(false);
    expect(snapshot.aspectLocked).toBe('true');

    await page.selectOption('#vennPlotType', 'venn');
    await page.waitForTimeout(300);
    await page.selectOption('#vennPlotType', 'upset');
    await page.waitForTimeout(300);
    snapshot = await readActiveLockSnapshot(page, 'vennPage', '#vennPlotType');
    expect(snapshot.checked).toBe(true);
    expect(snapshot.disabled).toBe(false);
    expect(snapshot.aspectLocked).toBe('true');

    await setLockRatio(page, 'vennPage', false);
    snapshot = await readActiveLockSnapshot(page, 'vennPage', '#vennPlotType');
    expect(snapshot.checked).toBe(false);
    expect(snapshot.aspectLocked).toBe('false');
  });

  test('surface enforces lock ratio', async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openGraphTab(page, 'surface', 'surfacePage', { first: true });
    await waitForLockRatioCheckbox(page, 'surfacePage');
    await page.waitForTimeout(350);
    const state = await getLockRatioState(page, 'surfacePage');
    expect(state.present).toBe(true);
    expect(state.checked).toBe(true);
    expect(state.disabled).toBe(true);
  });

  for (const componentCase of FORCED_LOCK_CASES) {
    test(`${componentCase.type} forced lock ratio stays isolated across same-component tabs and archive restore`, async ({ page }) => {
      test.setTimeout(180_000);
      const issues = registerIssueCollectors(page);
      await installLocalCdnOverrides(page);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

      const userTab = await openGraphTab(page, componentCase.type, componentCase.pageId, {
        first: true,
        reason: `e2e-lock-ratio-${componentCase.type}-user-tab`
      });
      expect(userTab).toBeTruthy();
      await selectMode(page, componentCase.pageId, componentCase.modeSelector, componentCase.userMode);
      const userLockValue = componentCase.type === 'venn';
      await setLockRatio(page, componentCase.pageId, userLockValue);
      await persistActiveTab(page, `e2e-lock-ratio-${componentCase.type}-persist-user`);
      const userBaseline = await readActiveLockSnapshot(page, componentCase.pageId, componentCase.modeSelector);
      expect(userBaseline).toMatchObject({
        mode: componentCase.userMode,
        checked: userLockValue,
        disabled: false
      });
      expect(userBaseline.aspectLocked).toBe(userLockValue ? 'true' : 'false');

      const forcedTab = await openGraphTab(page, componentCase.type, componentCase.pageId, {
        first: false,
        reason: `e2e-lock-ratio-${componentCase.type}-forced-tab`
      });
      expect(forcedTab).toBeTruthy();
      expect(forcedTab).not.toBe(userTab);
      await selectMode(page, componentCase.pageId, componentCase.modeSelector, componentCase.forcedMode);
      await persistActiveTab(page, `e2e-lock-ratio-${componentCase.type}-persist-forced`);
      const forcedBaseline = await readActiveLockSnapshot(page, componentCase.pageId, componentCase.modeSelector);
      expect(forcedBaseline).toMatchObject({
        mode: componentCase.forcedMode,
        checked: true,
        disabled: true
      });
      expect(forcedBaseline.aspectLocked).toBe('true');

      await activateTab(page, userTab, componentCase.pageId);
      const returnedUser = await readActiveLockSnapshot(page, componentCase.pageId, componentCase.modeSelector);
      expect(returnedUser).toMatchObject(userBaseline);

      await activateTab(page, forcedTab, componentCase.pageId);
      const returnedForced = await readActiveLockSnapshot(page, componentCase.pageId, componentCase.modeSelector);
      expect(returnedForced).toMatchObject(forcedBaseline);

      const archivePath = await captureArchive(page, `lock-ratio-${componentCase.type}`);
      await loadArchive(page, archivePath, componentCase.type);
      const reopenedIds = await getGraphTabIds(page, componentCase.type);
      expect(reopenedIds).toHaveLength(2);

      await activateTab(page, reopenedIds[0], componentCase.pageId);
      const reopenedFirst = await readActiveLockSnapshot(page, componentCase.pageId, componentCase.modeSelector);
      await activateTab(page, reopenedIds[1], componentCase.pageId);
      const reopenedSecond = await readActiveLockSnapshot(page, componentCase.pageId, componentCase.modeSelector);
      expect([reopenedFirst, reopenedSecond]).toEqual(expect.arrayContaining([
        expect.objectContaining(userBaseline),
        expect.objectContaining(forcedBaseline)
      ]));
      expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
    });
  }
});
