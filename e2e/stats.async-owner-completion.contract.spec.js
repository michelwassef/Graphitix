const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function activeTabId(page) {
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

async function openSiblingTab(page, type, pageId, exampleButtonId) {
  await page.evaluate(async componentType => {
    const tabs = window.Main?.tabs;
    await Promise.resolve(tabs?.handleAddTabClick?.());
    await Promise.resolve(tabs?.handleGraphSelection?.(componentType, { reason: 'e2e-stats-async-owner-sibling' }));
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const empty = document.querySelector('#duplicateEmpty');
    if (prompt && empty && !empty.disabled) empty.click();
  }, type);
  await expect(page.locator(`#${pageId}:not([hidden])`)).toBeVisible({ timeout: 30_000 });
  await clickExampleButtonIfPresent(page, exampleButtonId);
  await page.waitForTimeout(700);
  return activeTabId(page);
}

async function activateTab(page, tabId, type) {
  await page.evaluate(async ({ id }) => {
    await Promise.resolve(window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-stats-async-owner-activate' }));
  }, { id: tabId });
  await page.waitForFunction(({ id, componentType }) => {
    const state = window.Main?.session?.workspaceState;
    if (state?.activeTabId !== id) return false;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, componentType) || null;
    return !!root?.isConnected;
  }, { id: tabId, componentType: type }, { timeout: 30_000 });
}

async function installDelayedStatsWorker(page, action, key) {
  await page.evaluate(({ workerAction, storageKey }) => {
    const workers = window.Shared?.Workers;
    if (!workers || typeof workers.runTask !== 'function') throw new Error('Shared.Workers.runTask unavailable');
    if (!window.__statsOwnerWorkerDelays) window.__statsOwnerWorkerDelays = {};
    const registry = window.__statsOwnerWorkerDelays;
    if (!registry.__originalRunTask) registry.__originalRunTask = workers.runTask.bind(workers);
    registry[storageKey] = { intercepted: false, released: false, release: null };
    workers.runTask = function delayedOwnerStatsWorker(task) {
      const record = registry[storageKey];
      if (task?.action === workerAction && record && !record.intercepted) {
        record.intercepted = true;
        return new Promise((resolve, reject) => {
          record.release = () => {
            if (record.released) return;
            record.released = true;
            registry.__originalRunTask(task).then(resolve, reject);
          };
        });
      }
      return registry.__originalRunTask(task);
    };
  }, { workerAction: action, storageKey: key });
}

async function waitForWorkerIntercept(page, key) {
  await page.waitForFunction(storageKey => window.__statsOwnerWorkerDelays?.[storageKey]?.intercepted === true, key, { timeout: 30_000 });
}

async function releaseWorker(page, key) {
  await page.evaluate(storageKey => {
    const release = window.__statsOwnerWorkerDelays?.[storageKey]?.release;
    if (typeof release !== 'function') throw new Error(`Delayed stats worker ${storageKey} has no release function`);
    release();
  }, key);
}

async function getTabStatsPayload(page, tabId) {
  return page.evaluate(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id) || null;
    return tab?.payload?.config?.stats || null;
  }, tabId);
}

test('Scatter worker completion patches its inactive owner and not the active sibling', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  const tabA = await activeTabId(page);

  await page.evaluate(() => {
    const scatter = window.Components?.scatter;
    const hot = scatter?.__ensureHotForActiveTab?.();
    if (!scatter || !hot || typeof hot.loadData !== 'function') throw new Error('Scatter table unavailable');
    const rows = [['Label', 'X title', 'Y title', 'Z title']];
    for (let index = 1; index <= 2_200; index += 1) {
      rows.push([`P${index}`, index, (index * 1.75) + (index % 11), '']);
    }
    hot.loadData(rows);
    scatter.draw?.({ reason: 'e2e-scatter-stats-worker-owner-data' });
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('#scatterPage:not([hidden])');
    return !!root?.querySelector('#scatterComputeStats:not([disabled])');
  }, null, { timeout: 45_000 });
  await installDelayedStatsWorker(page, 'scatter-stats', 'scatter-owner-A');
  await page.locator('#scatterComputeStats').click();
  await waitForWorkerIntercept(page, 'scatter-owner-A');

  const tabB = await openSiblingTab(page, 'scatter', 'scatterPage', 'scatterLoadExample');
  expect(tabB).not.toBe(tabA);
  await page.locator('#scatterRegressionMode').selectOption('exponential');
  await page.locator('#scatterComputeStats').click();
  await page.waitForFunction(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return !!tab?.payload?.config?.stats?.precomputedStats;
  }, tabB, { timeout: 45_000 });
  const bBefore = JSON.stringify(await getTabStatsPayload(page, tabB));

  await releaseWorker(page, 'scatter-owner-A');
  await page.waitForFunction(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    const stats = tab?.payload?.config?.stats;
    return !!stats?.precomputedStats && Number(stats?.lastRunVersion) > 0;
  }, tabA, { timeout: 60_000 });
  expect(JSON.stringify(await getTabStatsPayload(page, tabB))).toBe(bBefore);
  expect(await activeTabId(page)).toBe(tabB);

  await activateTab(page, tabA, 'scatter');
  await expect(page.locator('#scatterStatsResults')).toContainText(/correlation|regression|R²|p-value/i, { timeout: 45_000 });
  const ownerState = await page.evaluate(id => {
    const session = window.Components?.scatter?.__testHooks?.getSession?.(id) || null;
    return {
      tabId: session?.tabId || null,
      hasComputed: !!session?.state?.stats?.precomputedStats,
      ownerRef: session?.refs?.root?.contains?.(session?.refs?.statsResults) === true
    };
  }, tabA);
  expect(ownerState).toMatchObject({ tabId: tabA, hasComputed: true, ownerRef: true });
  expect(issues.critical).toEqual([]);
});

test('Box worker completion stores and materializes only its inactive owner result', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  const tabA = await activeTabId(page);

  await page.evaluate(() => {
    const box = window.Components?.box;
    const state = box?.__getState?.();
    const hot = state?.ensureHotForActiveTab?.() || state?.hot;
    if (!box || !hot || typeof hot.loadData !== 'function') throw new Error('Box table unavailable');
    const rows = [['Control', 'Treatment']];
    for (let index = 0; index < 5_200; index += 1) rows.push([index % 19, 50 + (index % 23)]);
    hot.loadData(rows, { source: 'e2e-box-stats-worker-owner-data', recordUndo: false });
  });
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.() || null;
    const traces = state?.cachedDrawInput?.traces || [];
    return traces.reduce((count, trace) => count + (trace?.rawY?.length || 0), 0) >= 10_000;
  }, null, { timeout: 45_000 });
  await page.waitForFunction(() => !!document.querySelector('#boxPlot svg'), null, { timeout: 45_000 });
  const conditions = page.locator('.stats-conditions-checkboxes input[type="checkbox"]');
  const conditionCount = await conditions.count();
  for (let index = 0; index < conditionCount; index += 1) {
    if (index < 2) await conditions.nth(index).check();
    else await conditions.nth(index).uncheck();
  }
  await installDelayedStatsWorker(page, 'box-stats', 'box-owner-A');
  await page.locator('#boxComputeStats').click();
  await waitForWorkerIntercept(page, 'box-owner-A');

  const tabB = await openSiblingTab(page, 'box', 'boxPage', 'boxLoadExample');
  expect(tabB).not.toBe(tabA);
  await page.waitForFunction(() => !document.querySelector('#boxComputeStats')?.disabled, null, { timeout: 30_000 });
  await page.locator('#boxComputeStats').click();
  await page.waitForFunction(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    const stats = tab?.payload?.config?.stats;
    return !!(stats?.resultsModel || stats?.reportModel);
  }, tabB, { timeout: 45_000 });
  const bBefore = JSON.stringify(await getTabStatsPayload(page, tabB));

  await releaseWorker(page, 'box-owner-A');
  await page.waitForFunction(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id);
    return !!tab?.payload?.config?.stats?.deferredModel;
  }, tabA, { timeout: 60_000 });
  expect(JSON.stringify(await getTabStatsPayload(page, tabB))).toBe(bBefore);
  expect(await activeTabId(page)).toBe(tabB);

  await activateTab(page, tabA, 'box');
  await expect(page.locator('#statsResults')).toContainText(/p-value|ANOVA|t-test|Mann|comparison/i, { timeout: 45_000 });
  const ownerState = await page.evaluate(id => {
    const session = window.Components?.box?.__testHooks?.getSession?.(id) || null;
    return {
      tabId: session?.tabId || null,
      deferredCleared: !session?.state?.results?.deferredModel,
      ownerRef: session?.refs?.root?.contains?.(session?.refs?.statsResults) === true
    };
  }, tabA);
  expect(ownerState.tabId).toBe(tabA);
  expect(ownerState.ownerRef).toBe(true);
  expect(issues.critical).toEqual([]);
});
