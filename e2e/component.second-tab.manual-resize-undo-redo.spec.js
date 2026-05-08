const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides, registerIssueCollectors } = require('./helpers/workspaceHarness');

const COMPONENTS = [
  { type: 'box', pageId: 'boxPage' },
  { type: 'scatter', pageId: 'scatterPage' },
  { type: 'line', pageId: 'linePage' }
];

async function openComponentTab(page, component, { first = false } = {}) {
  if (first) {
    const card = page.locator(`#graphSelectionGrid [data-graph-type="${component.type}"]`).first();
    await expect(card).toBeVisible();
    await card.click({ force: true });
    await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
    return;
  }
  await page.evaluate(async (type) => {
    const tabs = window.Main?.tabs;
    const maybeAdd = tabs?.handleAddTabClick?.();
    if (maybeAdd && typeof maybeAdd.then === 'function') await maybeAdd;
    const maybeSelect = tabs?.handleGraphSelection?.(type, { reason: 'e2e-second-tab-manual-resize-undo' });
    if (maybeSelect && typeof maybeSelect.then === 'function') await maybeSelect;
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const duplicateEmpty = document.querySelector('#duplicateEmpty');
    if (prompt && duplicateEmpty && !duplicateEmpty.disabled) {
      duplicateEmpty.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }, component.type);
  await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
}

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await tab.click({ force: true });
  await page.waitForTimeout(300);
}

async function dragResizeHandle(page, pageId) {
  const handle = page.locator(`#${pageId}:not([hidden]) .svgbox .resizer-horizontal`).first();
  await expect(handle).toHaveCount(1);
  const box = await handle.boundingBox();
  if (!box) throw new Error(`Missing resizer handle for ${pageId}`);
  const x = box.x + box.width / 2;
  const y = box.y + Math.max(2, Math.min(box.height - 2, box.height / 2));
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 90, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
}

async function readSvgBoxSize(page, pageId) {
  return page.evaluate((pid) => {
    const root = document.querySelector(`#${pid}:not([hidden])`);
    const svgBox = root?.querySelector?.('.svgbox');
    const rect = svgBox?.getBoundingClientRect?.();
    if (!rect) return null;
    return { width: Math.round(rect.width), height: Math.round(rect.height) };
  }, pageId);
}

test('manual graph resize undo/redo works on second same-type tab', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  for (let i = 0; i < COMPONENTS.length; i += 1) {
    const component = COMPONENTS[i];
    await test.step(component.type, async () => {
      const firstSet = new Set(await getWorkspaceTabIds(page));
      await openComponentTab(page, component, { first: i === 0 });
      const firstTabs = await getWorkspaceTabIds(page);
      const firstId = firstTabs.find(id => !firstSet.has(id));
      expect(firstId).toBeTruthy();

      const secondSet = new Set(firstTabs);
      await openComponentTab(page, component, { first: false });
      const secondTabs = await getWorkspaceTabIds(page);
      const secondId = secondTabs.find(id => !secondSet.has(id));
      expect(secondId).toBeTruthy();
      expect(secondId).not.toBe(firstId);

      await activateTabById(page, secondId);
      await page.evaluate((tabId) => {
        window.Shared?.undoManager?.clearTab?.(tabId, { reason: 'e2e-second-tab-resize-clear' });
      }, secondId);

      const before = await readSvgBoxSize(page, component.pageId);
      await dragResizeHandle(page, component.pageId);
      const after = await readSvgBoxSize(page, component.pageId);

      const undoStatus = await page.evaluate((tabId) => {
        const manager = window.Shared?.undoManager;
        const canUndo = !!manager?.canUndo?.({ tabId });
        const undoApplied = !!manager?.undo?.({ tabId });
        const canRedo = !!manager?.canRedo?.({ tabId });
        return { canUndo, undoApplied, canRedo };
      }, secondId);
      const undone = await readSvgBoxSize(page, component.pageId);
      const redoStatus = await page.evaluate((tabId) => {
        const manager = window.Shared?.undoManager;
        const redoApplied = !!manager?.redo?.({ tabId });
        return { redoApplied };
      }, secondId);
      const redone = await readSvgBoxSize(page, component.pageId);

      expect(undoStatus.canUndo, `${component.type}: second-tab resize should create undo entry`).toBeTruthy();
      expect(undoStatus.undoApplied, `${component.type}: second-tab resize undo should apply`).toBeTruthy();
      expect(undoStatus.canRedo, `${component.type}: second-tab resize undo should expose redo`).toBeTruthy();
      expect(redoStatus.redoApplied, `${component.type}: second-tab resize redo should apply`).toBeTruthy();
      expect(Math.abs(after.height - before.height), `${component.type}: resize should change height`).toBeGreaterThan(8);
      expect(Math.abs(undone.height - before.height), `${component.type}: undo should restore original height`).toBeLessThanOrEqual(4);
      expect(Math.abs(redone.height - after.height), `${component.type}: redo should restore resized height`).toBeLessThanOrEqual(4);
    });
  }

  expect(issues.critical).toEqual([]);
});
