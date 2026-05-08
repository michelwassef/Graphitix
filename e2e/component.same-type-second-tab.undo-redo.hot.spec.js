const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

const HOT_COMPONENTS = [
  { type: 'box', pageId: 'boxPage' },
  { type: 'scatter', pageId: 'scatterPage' },
  { type: 'line', pageId: 'linePage' },
  { type: 'pca', pageId: 'pcaPage' },
  { type: 'heatmap', pageId: 'heatmapPage' },
  { type: 'surface', pageId: 'surfacePage' },
  { type: 'roc', pageId: 'rocPage' },
  { type: 'survival', pageId: 'survivalPage' },
  { type: 'hist', pageId: 'histPage' },
  { type: 'pie', pageId: 'piePage' }
];

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

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
    if (tabs && typeof tabs.handleAddTabClick === 'function') {
      const maybe = tabs.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    if (tabs && typeof tabs.handleGraphSelection === 'function') {
      const maybe = tabs.handleGraphSelection(type, { reason: 'e2e-hot-second-tab-undo-redo' });
      if (maybe && typeof maybe.then === 'function') await maybe;
    }
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const duplicateEmpty = document.querySelector('#duplicateEmpty');
    if (prompt && duplicateEmpty && !duplicateEmpty.disabled) {
      duplicateEmpty.click();
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }, component.type);
  await page.waitForSelector(`#${component.pageId}:not([hidden])`, { timeout: 20_000 });
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await page.waitForTimeout(300);
}

test('AG-grid undo/redo is tab-scoped and works on second same-type tabs', async ({ page }) => {
  test.setTimeout(8 * 60 * 1000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  for (let i = 0; i < HOT_COMPONENTS.length; i += 1) {
    const component = HOT_COMPONENTS[i];
    await test.step(`${component.type} second-tab hot undo/redo`, async () => {
      const beforeFirst = new Set(await getWorkspaceTabIds(page));
      await openComponentTab(page, component, { first: i === 0 });
      const afterFirst = await getWorkspaceTabIds(page);
      const firstTabId = afterFirst.find(id => !beforeFirst.has(id));
      expect(firstTabId).toBeTruthy();

      const beforeSecond = new Set(afterFirst);
      await openComponentTab(page, component, { first: false });
      const afterSecond = await getWorkspaceTabIds(page);
      const secondTabId = afterSecond.find(id => !beforeSecond.has(id));
      expect(secondTabId).toBeTruthy();
      expect(secondTabId).not.toBe(firstTabId);

      await activateTabById(page, secondTabId);
      const result = await page.evaluate(({ type, firstTabId, secondTabId }) => {
        const manager = window.Shared?.undoManager;
        manager?.clearTab?.(firstTabId, { reason: 'e2e-second-tab-undo-redo-reset-first' });
        manager?.clearTab?.(secondTabId, { reason: 'e2e-second-tab-undo-redo-reset-second' });
        const pool = window.Shared?.hot?.__tabTablePools?.[type] || null;
        const poolEntry = pool?.byTab?.[secondTabId] || null;
        const pooledHot = poolEntry?.instance || null;
        const componentApi = window.Components?.[type];
        const state = componentApi?.__getState?.();
        const stateHot = state?.ensureHotForActiveTab?.() || state?.hot;
        const hot = pooledHot || stateHot;
        if (!hot || typeof hot.getDataAtCell !== 'function' || typeof hot.setDataAtCell !== 'function') {
          return { ok: false, reason: 'hot-unavailable' };
        }
        const prev = String(hot.getDataAtCell(1, 0) ?? '');
        const next = `undo-${Date.now() % 100000}`;
        hot.setDataAtCell([[1, 0, next]], 'e2e-second-tab-undo-redo');
        const afterEdit = String(hot.getDataAtCell(1, 0) ?? '');
        const canUndoSecond = !!manager?.canUndo?.({ tabId: secondTabId });
        const canUndoFirst = !!manager?.canUndo?.({ tabId: firstTabId });
        const undoApplied = !!manager?.undo?.({ tabId: secondTabId });
        const afterUndo = String(hot.getDataAtCell(1, 0) ?? '');
        const redoApplied = !!manager?.redo?.({ tabId: secondTabId });
        const afterRedo = String(hot.getDataAtCell(1, 0) ?? '');
        return {
          ok: true,
          prev,
          next,
          afterEdit,
          canUndoSecond,
          canUndoFirst,
          undoApplied,
          afterUndo,
          redoApplied,
          afterRedo
        };
      }, { type: component.type, firstTabId, secondTabId });

      expect(result.ok, `${component.type}: hot API unavailable`).toBeTruthy();
      expect(result.afterEdit, `${component.type}: value should be edited on tab 2`).toBe(result.next);
      expect(result.canUndoSecond, `${component.type}: tab 2 should have undo history`).toBeTruthy();
      expect(result.undoApplied, `${component.type}: undo on tab 2 should apply`).toBeTruthy();
      expect(result.afterUndo, `${component.type}: undo should restore previous value`).toBe(result.prev);
      expect(result.redoApplied, `${component.type}: redo on tab 2 should apply`).toBeTruthy();
      expect(result.afterRedo, `${component.type}: redo should restore edited value`).toBe(result.next);
      expect(result.canUndoFirst, `${component.type}: tab 1 should not receive tab 2 undo entry`).toBeFalsy();
    });
  }

  expect(issues.critical).toEqual([]);
});
