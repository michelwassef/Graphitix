const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const getWorkspaceTabIds = page => page.evaluate(() =>
  Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
    .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
    .filter(id => id && id !== 'welcome')
);

async function waitForActiveBoxGrid(page) {
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const activeTab = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const hot = activeTab?.id
      ? window.Shared?.hot?.__tabTablePools?.box?.byTab?.[activeTab.id]?.instance
      : null;
    return !!(activeTab?.type === 'box' && hot?.gridApi);
  });
}

async function getActiveTabId(page) {
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

async function dispatchPasteFromActiveTab(page, text) {
  return page.evaluate(value => {
    const state = window.Main?.session?.workspaceState;
    const tabId = state?.activeTabId || null;
    const tabButton = tabId
      ? document.querySelector(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`)
      : null;
    if(!tabButton){
      return false;
    }
    tabButton.focus();
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
      value: { getData: () => value }
    });
    tabButton.dispatchEvent(event);
    return event.defaultPrevented;
  }, text);
}

async function readTabCell(page, tabId, row, col) {
  return page.evaluate(({ ownerTabId, visualRow, visualCol }) => {
    const hot = window.Shared?.hot?.__tabTablePools?.box?.byTab?.[ownerTabId]?.instance || null;
    return hot?.getDataAtCell?.(visualRow, visualCol);
  }, { ownerTabId: tabId, visualRow: row, visualCol: col });
}

test('paste follows the highlighted AG Grid cell after new-tab creation and tab switching', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const beforeFirst = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await waitForActiveBoxGrid(page);
  const firstTabId = (await getWorkspaceTabIds(page)).find(id => !beforeFirst.has(id));
  expect(firstTabId).toBeTruthy();
  const firstInitialSelection = await page.evaluate(tabId =>
    window.Shared.hot.__tabTablePools.box.byTab[tabId].instance.getSelectedLast()
  , firstTabId);
  expect(firstInitialSelection).toEqual([0, 0, 0, 0]);

  expect(await dispatchPasteFromActiveTab(page, 'first')).toBe(true);
  await expect.poll(() => readTabCell(page, firstTabId, 0, 0)).toBe('first');
  await page.evaluate(tabId => {
    window.Shared.hot.__tabTablePools.box.byTab[tabId].instance.selectCell(1, 0);
  }, firstTabId);

  const beforeSecond = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: false });
  await waitForActiveBoxGrid(page);
  const secondTabId = (await getWorkspaceTabIds(page)).find(id => !beforeSecond.has(id));
  expect(secondTabId).toBeTruthy();
  const secondInitialSelection = await page.evaluate(tabId =>
    window.Shared.hot.__tabTablePools.box.byTab[tabId].instance.getSelectedLast()
  , secondTabId);
  expect(secondInitialSelection).toEqual([0, 0, 0, 0]);

  expect(await dispatchPasteFromActiveTab(page, 'second')).toBe(true);
  await expect.poll(() => readTabCell(page, secondTabId, 0, 0)).toBe('second');
  expect(await readTabCell(page, firstTabId, 0, 0)).toBe('first');

  const firstTabButton = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).first();
  await firstTabButton.click({ force: true });
  await expect.poll(() => getActiveTabId(page)).toBe(firstTabId);
  await waitForActiveBoxGrid(page);
  const restoredFirstSelection = await page.evaluate(tabId =>
    window.Shared.hot.__tabTablePools.box.byTab[tabId].instance.getSelectedLast()
  , firstTabId);
  expect(restoredFirstSelection).toHaveLength(4);
  const [restoredRow, restoredCol] = restoredFirstSelection;

  expect(await dispatchPasteFromActiveTab(page, 'first-again')).toBe(true);
  await expect.poll(() => readTabCell(page, firstTabId, restoredRow, restoredCol)).toBe('first-again');
  expect(await readTabCell(page, secondTabId, 0, 0)).toBe('second');
  expect(issues.critical).toEqual([]);
});
