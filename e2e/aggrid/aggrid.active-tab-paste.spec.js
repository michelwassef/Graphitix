const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

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

test('copied-cell outline keeps its marching animation under reduced-motion settings', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const before = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await waitForActiveBoxGrid(page);
  const tabId = (await getWorkspaceTabIds(page)).find(id => !before.has(id));
  expect(tabId).toBeTruthy();

  const animation = await page.evaluate(ownerTabId => {
    const hot = window.Shared.hot.__tabTablePools.box.byTab[ownerTabId].instance;
    hot.__hotSetClipboardOutlineState({
      mode: 'copy',
      ranges: [{ from: { row: 0, col: 0 }, to: { row: 0, col: 0 } }],
      clipboardText: 'COPIED_CELL'
    }, 'reduced-motion-animation-test');
    const edge = hot.rootElement?.querySelector?.('.hot-clipboard-outline-edge[data-edge="top"]');
    const style = edge ? getComputedStyle(edge) : null;
    const activeAnimation = edge?.getAnimations?.()[0] || null;
    return {
      duration: style?.animationDuration || '',
      iterations: style?.animationIterationCount || '',
      playState: activeAnimation?.playState || ''
    };
  }, tabId);

  expect(animation.duration).toBe('0.45s');
  expect(animation.iterations).toBe('infinite');
  expect(animation.playState).toBe('running');
});

test('delayed table paste commits only to the table owner across a same-type switch', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const beforeFirst = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await waitForActiveBoxGrid(page);
  const firstTabId = (await getWorkspaceTabIds(page)).find(id => !beforeFirst.has(id));
  expect(firstTabId).toBeTruthy();
  await page.evaluate(tabId => {
    const hot = window.Shared.hot.__tabTablePools.box.byTab[tabId].instance;
    hot.selectCell(0, 0);
    hot.__hotSetClipboardOutlineState({
      mode: 'copy',
      ranges: [{ from: { row: 0, col: 0 }, to: { row: 0, col: 0 } }],
      clipboardText: 'A_OLD_COPY'
    }, 'test-a-old-copy');
    const tableImport = window.Shared.tableImport;
    window.__boxPasteClipboardRestore = tableImport.getClipboardPayloadFromEvent;
    window.__boxPasteDeferredResolve = null;
    tableImport.getClipboardPayloadFromEvent = () => new Promise(resolve => {
      window.__boxPasteDeferredResolve = () => resolve({ text: 'A_LATE_PASTE', delimiter: null, source: 'delayed-test' });
    });
  }, firstTabId);
  expect(await dispatchPasteFromActiveTab(page, 'A_LATE_PASTE')).toBe(true);
  await page.waitForFunction(() => typeof window.__boxPasteDeferredResolve === 'function');

  try {
    const beforeSecond = new Set(await getWorkspaceTabIds(page));
    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: false });
    await waitForActiveBoxGrid(page);
    const secondTabId = (await getWorkspaceTabIds(page)).find(id => !beforeSecond.has(id));
    expect(secondTabId).toBeTruthy();

    await page.evaluate(() => {
      window.Shared.tableImport.getClipboardPayloadFromEvent = window.__boxPasteClipboardRestore;
      delete window.__boxPasteClipboardRestore;
    });
    await page.evaluate(tabId => window.Shared.hot.__tabTablePools.box.byTab[tabId].instance.selectCell(0, 0), secondTabId);
    expect(await dispatchPasteFromActiveTab(page, 'B_INITIAL')).toBe(true);
    await expect.poll(() => readTabCell(page, secondTabId, 0, 0)).toBe('B_INITIAL');
    const secondClipboardBeforeLatePaste = await page.evaluate(tabId => {
      const hot = window.Shared.hot.__tabTablePools.box.byTab[tabId].instance;
      hot.__hotSetClipboardOutlineState({
        mode: 'copy',
        ranges: [{ from: { row: 0, col: 0 }, to: { row: 0, col: 0 } }],
        clipboardText: 'B_NEW_COPY'
      }, 'test-b-new-copy');
      const outline = hot.rootElement?.querySelector?.('.hot-clipboard-outline') || null;
      return {
        activeOwner: window.Shared.hot.__activeClipboardSelectionOwner === hot,
        display: outline?.style?.display || ''
      };
    }, secondTabId);
    expect(secondClipboardBeforeLatePaste).toEqual({ activeOwner: true, display: 'block' });

    await page.evaluate(() => {
      const resolve = window.__boxPasteDeferredResolve;
      window.__boxPasteDeferredResolve = null;
      resolve?.();
    });
    await page.waitForFunction(id =>
      window.Main?.session?.workspaceState?.tabs?.find(tab => tab?.id === id)?.payload?.data?.[0]?.[0] === 'A_LATE_PASTE',
    firstTabId, { timeout: 20_000 });
    expect(await readTabCell(page, secondTabId, 0, 0)).toBe('B_INITIAL');
    const secondClipboardAfterLatePaste = await page.evaluate(tabId => {
      const hot = window.Shared.hot.__tabTablePools.box.byTab[tabId].instance;
      const outline = hot.rootElement?.querySelector?.('.hot-clipboard-outline') || null;
      return {
        activeOwner: window.Shared.hot.__activeClipboardSelectionOwner === hot,
        display: outline?.style?.display || ''
      };
    }, secondTabId);
    expect(secondClipboardAfterLatePaste).toEqual({ activeOwner: true, display: 'block' });

    const secondButton = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).first();
    await secondButton.click({ force: true });
    await expect.poll(() => getActiveTabId(page)).toBe(firstTabId);
    await waitForActiveBoxGrid(page);
    expect(await readTabCell(page, firstTabId, 0, 0)).toBe('A_LATE_PASTE');
    const ownerPayloads = await page.evaluate(ids => Object.fromEntries(ids.map(id => {
      const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id);
      return [id, tab?.payload?.data?.[0]?.[0] || ''];
    })), [firstTabId, secondTabId]);
    expect(ownerPayloads[firstTabId]).toBe('A_LATE_PASTE');
    expect(ownerPayloads[secondTabId]).toBe('B_INITIAL');
    expect(issues.critical).toEqual([]);
  } finally {
    await page.evaluate(() => {
      if (window.__boxPasteClipboardRestore) {
        window.Shared.tableImport.getClipboardPayloadFromEvent = window.__boxPasteClipboardRestore;
      }
      window.__boxPasteDeferredResolve?.();
      delete window.__boxPasteClipboardRestore;
      delete window.__boxPasteDeferredResolve;
    }).catch(error => {
      if (!page.isClosed()) throw error;
    });
  }
});

test('delayed header-menu paste stays with its table owner across a same-type switch', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const beforeFirst = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await waitForActiveBoxGrid(page);
  const firstTabId = (await getWorkspaceTabIds(page)).find(id => !beforeFirst.has(id));
  expect(firstTabId).toBeTruthy();
  await page.evaluate(tabId => {
    const hot = window.Shared.hot.__tabTablePools.box.byTab[tabId].instance;
    hot.setDataAtCell(0, 0, 'A_INITIAL', 'edit');
  }, firstTabId);
  await expect.poll(() => readTabCell(page, firstTabId, 0, 0)).toBe('A_INITIAL');

  await page.evaluate(tabId => {
    window.__resolveHeaderMenuPaste = null;
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: () => new Promise(resolve => {
          window.__resolveHeaderMenuPaste = resolve;
        })
      }
    });
    const hot = window.Shared.hot.__tabTablePools.box.byTab[tabId].instance;
    const header = hot.rootElement?.querySelector?.('.ag-header-cell[col-id="c0"]');
    if (!header) throw new Error('Box owner table header was not mounted');
    header.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 20,
      clientY: 20
    }));
  }, firstTabId);
  await expect(page.locator('.ag-hot-menu')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Paste into column' }).click();
  await page.waitForFunction(() => typeof window.__resolveHeaderMenuPaste === 'function');

  const beforeSecond = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: false });
  await waitForActiveBoxGrid(page);
  const secondTabId = (await getWorkspaceTabIds(page)).find(id => !beforeSecond.has(id));
  expect(secondTabId).toBeTruthy();
  await page.evaluate(tabId => {
    const hot = window.Shared.hot.__tabTablePools.box.byTab[tabId].instance;
    hot.setDataAtCell(0, 0, 'B_INITIAL', 'edit');
  }, secondTabId);
  await expect.poll(() => readTabCell(page, secondTabId, 0, 0)).toBe('B_INITIAL');
  await expect(page.locator('#boxPage:not([hidden]) #hot')).toContainText('B_INITIAL');

  await page.evaluate(() => window.__resolveHeaderMenuPaste?.('A_LATE_HEADER'));
  await expect.poll(() => readTabCell(page, firstTabId, 0, 0)).toBe('A_LATE_HEADER');
  expect(await readTabCell(page, secondTabId, 0, 0)).toBe('B_INITIAL');
  await expect(page.locator('#boxPage:not([hidden]) #hot')).toContainText('B_INITIAL');
  const payloads = await page.evaluate(ids => Object.fromEntries(ids.map(id => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id);
    return [id, tab?.payload?.data?.[0]?.[0] || ''];
  })), [firstTabId, secondTabId]);
  expect(payloads[firstTabId]).toBe('A_LATE_HEADER');
  expect(payloads[secondTabId]).toBe('B_INITIAL');

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).first().click({ force: true });
  await expect.poll(() => getActiveTabId(page)).toBe(firstTabId);
  await waitForActiveBoxGrid(page);
  await expect(page.locator('#boxPage:not([hidden]) #hot')).toContainText('A_LATE_HEADER');
  expect(issues.critical).toEqual([]);
});
