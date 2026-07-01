const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function openBoxTab(page, { first = false } = {}) {
  const before = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' }, { first, loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg'), null, { timeout: 45_000 });
  const after = await getWorkspaceTabIds(page);
  const tabId = after.find(id => !before.has(id));
  expect(tabId).toBeTruthy();
  return tabId;
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  const clicked = await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) {
    await page.evaluate(id => window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-box-opacity-activate' }), tabId);
    await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  }
  await page.waitForFunction(() => !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg'), null, { timeout: 45_000 });
  await page.waitForTimeout(120);
}

async function readBoxOpacitySnapshot(page) {
  return page.evaluate(() => {
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(activeTabId, 'box') || document.querySelector('#boxPage:not([hidden])');
    const plot = root?.querySelector?.('#boxPlot') || null;
    const nodes = Array.from(plot?.querySelectorAll?.('[data-box-shape],[data-export-layer="box-points"] circle:not([data-point-proxy="1"]),[data-export-layer="box-points"] path:not([data-point-proxy="1"]),[data-export-layer="box-points"] rect:not([data-point-proxy="1"]),[data-summary-line="1"]') || []);
    const values = nodes.slice(0, 30).map(node => ({
      tag: (node.tagName || '').toLowerCase(),
      fill: node.getAttribute('fill-opacity') || '',
      stroke: node.getAttribute('stroke-opacity') || ''
    }));
    const runtime = window.Components?.box?.__testHooks?.getBoxVisualRuntime?.() || null;
    return {
      activeTabId,
      rootTabId: root?.dataset?.workspaceTabId || null,
      nodeCount: nodes.length,
      values,
      pendingGlobalOpacity: runtime?.pendingGlobalOpacity ?? null,
      hasTargetOpacity: values.some(entry => entry.fill === '0.25' || entry.stroke === '0.25')
    };
  });
}

test('box delayed global opacity frame stays scoped to its originating tab', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const firstId = await openBoxTab(page, { first: true });
  const secondId = await openBoxTab(page, { first: false });
  expect(secondId).not.toBe(firstId);

  await activateTabById(page, secondId);
  const secondBefore = await readBoxOpacitySnapshot(page);

  await activateTabById(page, firstId);
  await page.evaluate(secondTabId => {
    const hook = window.Components?.box?.__testHooks?.scheduleBoxGlobalOpacityApply;
    if (typeof hook !== 'function') {
      throw new Error('Box opacity scheduler test hook unavailable');
    }
    hook(0.25);
    window.Main?.tabs?.activateTab?.(secondTabId, { reason: 'e2e-box-opacity-immediate-switch' });
  }, secondId);
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, secondId, { timeout: 20_000 });
  await page.waitForTimeout(300);
  const secondAfterPendingFrame = await readBoxOpacitySnapshot(page);

  await activateTabById(page, firstId);
  await page.waitForTimeout(300);
  const firstAfterReturn = await readBoxOpacitySnapshot(page);

  await testInfo.attach('box-opacity-style-tab-isolation.snapshots.json', {
    body: Buffer.from(JSON.stringify({
      firstId,
      secondId,
      secondBefore,
      secondAfterPendingFrame,
      firstAfterReturn
    }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(secondBefore.activeTabId).toBe(secondId);
  expect(secondAfterPendingFrame.activeTabId).toBe(secondId);
  expect(firstAfterReturn.activeTabId).toBe(firstId);
  expect(secondAfterPendingFrame.rootTabId).toBe(secondId);
  expect(firstAfterReturn.rootTabId).toBe(firstId);
  expect(secondBefore.nodeCount).toBeGreaterThan(0);
  expect(secondAfterPendingFrame.nodeCount).toBeGreaterThan(0);
  expect(firstAfterReturn.nodeCount).toBeGreaterThan(0);
  expect(secondBefore.hasTargetOpacity).toBe(false);
  expect(secondAfterPendingFrame.hasTargetOpacity).toBe(false);
  expect(firstAfterReturn.pendingGlobalOpacity).toBe(0.25);
  expect(issues.critical).toEqual([]);
});
