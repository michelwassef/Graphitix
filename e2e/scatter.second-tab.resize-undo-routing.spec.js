const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function activateTabById(page, tabId) {
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first().click({ force: true });
  await page.waitForTimeout(300);
}

async function openScatterTab(page, { first = false } = {}) {
  if (first) {
    const card = page.locator('#graphSelectionGrid [data-graph-type="scatter"]').first();
    await expect(card).toBeVisible();
    await card.click({ force: true });
    await page.waitForSelector('#scatterPage:not([hidden])', { timeout: 20_000 });
    return;
  }
  await page.evaluate(async () => {
    const tabs = window.Main?.tabs;
    const maybeAdd = tabs?.handleAddTabClick?.();
    if (maybeAdd && typeof maybeAdd.then === 'function') await maybeAdd;
    const maybeSel = tabs?.handleGraphSelection?.('scatter', { reason: 'e2e-scatter-second-tab-routing' });
    if (maybeSel && typeof maybeSel.then === 'function') await maybeSel;
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const duplicateEmpty = document.querySelector('#duplicateEmpty');
    if (prompt && duplicateEmpty && !duplicateEmpty.disabled) {
      duplicateEmpty.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  });
  await page.waitForSelector('#scatterPage:not([hidden])', { timeout: 20_000 });
}

async function dragScatterResize(page) {
  const handle = page.locator('#scatterPage:not([hidden]) .svgbox .resizer-horizontal').first();
  await expect(handle).toHaveCount(1);
  const box = await handle.boundingBox();
  if (!box) throw new Error('Missing scatter resize handle');
  const x = box.x + box.width / 2;
  const y = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
}

test('scatter second-tab resize undo routes to active tab even with stale dataset tab markers', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const beforeFirst = new Set(await getWorkspaceTabIds(page));
  await openScatterTab(page, { first: true });
  await page.locator('#scatterLoadExample').click({ force: true });
  await page.waitForTimeout(600);
  const afterFirst = await getWorkspaceTabIds(page);
  const firstId = afterFirst.find(id => !beforeFirst.has(id));
  expect(firstId).toBeTruthy();

  const beforeSecond = new Set(afterFirst);
  await openScatterTab(page, { first: false });
  await page.locator('#scatterLoadExample').click({ force: true });
  await page.waitForTimeout(600);
  const afterSecond = await getWorkspaceTabIds(page);
  const secondId = afterSecond.find(id => !beforeSecond.has(id));
  expect(secondId).toBeTruthy();
  expect(secondId).not.toBe(firstId);

  await activateTabById(page, secondId);
  await page.evaluate(({ firstId, secondId }) => {
    const manager = window.Shared?.undoManager;
    manager?.clearTab?.(firstId, { reason: 'e2e-scatter-routing-clear-first' });
    manager?.clearTab?.(secondId, { reason: 'e2e-scatter-routing-clear-second' });
  }, { firstId, secondId });

  const scopeBefore = await page.evaluate(({ firstId }) => {
    const root = document.querySelector('#scatterPage:not([hidden])');
    const svgBox = root?.querySelector?.('.svgbox');
    if (!svgBox?.dataset) {
      return null;
    }
    // Simulate stale tab markers from a previous tab binding while preserving
    // the live tab-scoped resizer scope token.
    svgBox.dataset.workspaceTabId = firstId;
    svgBox.dataset.tabId = firstId;
    return {
      workspaceTabId: svgBox.dataset.workspaceTabId || null,
      tabId: svgBox.dataset.tabId || null,
      resizerTextLockScope: svgBox.dataset.resizerTextLockScope || null
    };
  }, { firstId });

  expect(scopeBefore?.workspaceTabId).toBe(firstId);
  expect(String(scopeBefore?.resizerTextLockScope || '')).toContain(`::@tab:${secondId}`);

  await dragScatterResize(page);

  const history = await page.evaluate(({ firstId, secondId }) => {
    const manager = window.Shared?.undoManager;
    return {
      activeTabId: window.Main?.session?.workspaceState?.activeTabId || null,
      first: manager?.getTabHistoryInfo?.(firstId) || null,
      second: manager?.getTabHistoryInfo?.(secondId) || null
    };
  }, { firstId, secondId });

  expect(history.activeTabId).toBe(secondId);
  expect(history.second?.canUndo).toBeTruthy();
  expect(history.second?.stackLength).toBeGreaterThan(0);
  expect(history.first?.stackLength || 0).toBe(0);

  expect(issues.critical).toEqual([]);
});
