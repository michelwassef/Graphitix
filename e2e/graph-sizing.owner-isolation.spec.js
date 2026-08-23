const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const SCATTER = COMPONENT_MATRIX.find(component => component.type === 'scatter');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await page.waitForFunction(
    id => window.Main?.session?.workspaceState?.activeTabId === id,
    tabId,
    { timeout: 20_000 }
  );
}

async function readScatterOwnerSize(page, tabId) {
  return page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter')
      || window.Shared?.workspaceTabs?.getSessionRecord?.(id, 'scatter')?.dom?.root
      || null;
    const box = root?.querySelector?.('.svgbox') || null;
    return {
      graphWidthPx: box?.dataset?.graphWidthPx || '',
      graphHeightPx: box?.dataset?.graphHeightPx || '',
      styleWidth: box?.style?.width || '',
      styleHeight: box?.style?.height || ''
    };
  }, tabId);
}

async function scheduleOwnedSizing(page, { tabId, width, height, delay, context }) {
  return page.evaluate(({ tabId, width, height, delay, context }) => {
    const sizing = window.Shared?.graphSizing;
    const record = window.Shared?.workspaceTabs?.getSessionRecord?.(tabId, 'scatter') || null;
    const payload = sizing.setPayloadSizing(
      { type: 'scatter', meta: {} },
      { display: { widthPx: width, heightPx: height } },
      { type: 'scatter', context: `${context}-payload` }
    );
    return sizing.applyPayloadSizingForType('scatter', payload, {
      context,
      tabId,
      sessionGeneration: Number(record?.generation) || 0,
      retryDelaysMs: [delay],
      forceExact: true
    });
  }, { tabId, width, height, delay, context });
}

test('delayed graph sizing stays with its owner and superseded retries cannot revive', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const beforeFirst = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, SCATTER, { first: true });
  await clickExampleButtonIfPresent(page, SCATTER.exampleButtonId);
  const afterFirst = await getWorkspaceTabIds(page);
  const tabA = afterFirst.find(id => !beforeFirst.has(id));
  expect(tabA).toBeTruthy();

  const beforeSecond = new Set(afterFirst);
  await openComponentFromWelcome(page, SCATTER, { first: false });
  await clickExampleButtonIfPresent(page, SCATTER.exampleButtonId);
  const afterSecond = await getWorkspaceTabIds(page);
  const tabB = afterSecond.find(id => !beforeSecond.has(id));
  expect(tabB).toBeTruthy();
  expect(tabB).not.toBe(tabA);

  await activateTabById(page, tabA);
  const baselineB = await readScatterOwnerSize(page, tabB);

  expect(await scheduleOwnedSizing(page, {
    tabId: tabA,
    width: 713,
    height: 509,
    delay: 180,
    context: 'e2e-owned-sizing-a-to-b'
  })).toBe(true);

  await activateTabById(page, tabB);
  await page.waitForFunction(({ ownerId, targetWidth }) => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(ownerId, 'scatter')
      || window.Shared?.workspaceTabs?.getSessionRecord?.(ownerId, 'scatter')?.dom?.root
      || null;
    return root?.querySelector?.('.svgbox')?.dataset?.graphWidthPx === String(targetWidth);
  }, { ownerId: tabA, targetWidth: 713 }, { timeout: 5_000 });

  const afterAtoB = {
    A: await readScatterOwnerSize(page, tabA),
    B: await readScatterOwnerSize(page, tabB)
  };
  expect(afterAtoB.A.graphWidthPx).toBe('713');
  expect(afterAtoB.A.graphHeightPx).toBe('509');
  expect(afterAtoB.B).toEqual(baselineB);

  await activateTabById(page, tabA);
  const abaBaseline = await readScatterOwnerSize(page, tabA);
  const generationBeforeAba = await page.evaluate(id => (
    Number(window.Shared?.workspaceTabs?.getSessionRecord?.(id, 'scatter')?.generation) || 0
  ), tabA);
  const abaStartedAt = await page.evaluate(() => performance.now());
  expect(await scheduleOwnedSizing(page, {
    tabId: tabA,
    width: 689,
    height: 497,
    delay: 220,
    context: 'e2e-owned-sizing-stale-aba'
  })).toBe(true);

  await activateTabById(page, tabB);
  await activateTabById(page, tabA);
  const generationAfterAba = await page.evaluate(id => (
    Number(window.Shared?.workspaceTabs?.getSessionRecord?.(id, 'scatter')?.generation) || 0
  ), tabA);
  expect(generationAfterAba).toBeGreaterThan(generationBeforeAba);
  await page.waitForFunction(
    started => performance.now() - started >= 300,
    abaStartedAt,
    { polling: 16, timeout: 5_000 }
  );
  expect(await readScatterOwnerSize(page, tabA)).toEqual(abaBaseline);

  const startedAt = await page.evaluate(() => performance.now());
  expect(await scheduleOwnedSizing(page, {
    tabId: tabA,
    width: 601,
    height: 451,
    delay: 260,
    context: 'e2e-owned-sizing-old'
  })).toBe(true);
  expect(await scheduleOwnedSizing(page, {
    tabId: tabA,
    width: 733,
    height: 521,
    delay: 30,
    context: 'e2e-owned-sizing-new'
  })).toBe(true);

  await page.waitForFunction(({ ownerId, targetWidth }) => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(ownerId, 'scatter')
      || window.Shared?.workspaceTabs?.getSessionRecord?.(ownerId, 'scatter')?.dom?.root
      || null;
    return root?.querySelector?.('.svgbox')?.dataset?.graphWidthPx === String(targetWidth);
  }, { ownerId: tabA, targetWidth: 733 }, { timeout: 5_000 });

  await page.waitForFunction(
    started => performance.now() - started >= 340,
    startedAt,
    { polling: 16, timeout: 5_000 }
  );

  const finalA = await readScatterOwnerSize(page, tabA);
  expect(finalA.graphWidthPx).toBe('733');
  expect(finalA.graphHeightPx).toBe('521');
  expect(issues.critical).toEqual([]);
});
