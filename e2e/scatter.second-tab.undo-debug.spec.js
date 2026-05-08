const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/workspaceHarness');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
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
    const maybeSel = tabs?.handleGraphSelection?.('scatter', { reason: 'e2e-scatter-second-tab-undo-debug' });
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

async function activateTabById(page, tabId) {
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first().click({ force: true });
  await page.waitForTimeout(350);
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
  await page.waitForTimeout(700);
}

async function readState(page, tag) {
  const state = await page.evaluate((tag) => {
    const root = document.querySelector('#scatterPage:not([hidden])');
    const svgBox = root?.querySelector?.('.svgbox');
    const rect = svgBox?.getBoundingClientRect?.();
    const manager = window.Shared?.undoManager;
    const activeTab = window.Main?.session?.workspaceState?.activeTabId || null;
    return {
      tag,
      activeTab,
      size: rect ? { width: Math.round(rect.width), height: Math.round(rect.height) } : null,
      canUndoDefault: !!manager?.canUndo?.(),
      canRedoDefault: !!manager?.canRedo?.(),
      allHistory: manager?.getAllHistoryInfo?.() || [],
      currentHistory: activeTab ? manager?.getTabHistoryInfo?.(activeTab) : null
    };
  }, tag);
  console.log(JSON.stringify(state, null, 2));
  return state;
}

test('debug scatter second-tab undo path', async ({ page }) => {
  test.setTimeout(180_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const beforeFirst = new Set(await getWorkspaceTabIds(page));
  await openScatterTab(page, { first: true });
  await page.locator('#scatterLoadExample').click();
  const afterFirst = await getWorkspaceTabIds(page);
  const firstId = afterFirst.find(id => !beforeFirst.has(id));
  expect(firstId).toBeTruthy();

  await activateTabById(page, firstId);
  await page.evaluate((tabId) => window.Shared?.undoManager?.clearTab?.(tabId, { reason: 'e2e-scatter-debug-clear-first' }), firstId);
  await dragScatterResize(page);
  await readState(page, 'after-first-resize');
  await page.locator('body').click({ position: { x: 5, y: 5 }, force: true });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  await readState(page, 'after-first-undo');

  const beforeSecond = new Set(afterFirst);
  await openScatterTab(page, { first: false });
  await page.locator('#scatterLoadExample').click();
  const afterSecond = await getWorkspaceTabIds(page);
  const secondId = afterSecond.find(id => !beforeSecond.has(id));
  expect(secondId).toBeTruthy();

  await activateTabById(page, secondId);
  await page.evaluate((tabId) => window.Shared?.undoManager?.clearTab?.(tabId, { reason: 'e2e-scatter-debug-clear-second' }), secondId);
  await dragScatterResize(page);
  await readState(page, 'after-second-resize');
  await page.locator('body').click({ position: { x: 5, y: 5 }, force: true });
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(500);
  await readState(page, 'after-second-undo');
});

