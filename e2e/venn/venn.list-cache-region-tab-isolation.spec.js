const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function openVennTab(page, { first = false } = {}) {
  const before = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' }, { first });
  await page.waitForFunction(() => !!document.querySelector('#vennPage:not([hidden]) #stage'), null, { timeout: 45_000 });
  const after = await getWorkspaceTabIds(page);
  const tabId = after.find(id => !before.has(id));
  expect(tabId).toBeTruthy();
  return tabId;
}

async function activateTabById(page, tabId, { requirePublished = true } = {}) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  const clicked = await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) {
    await page.evaluate(id => window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-venn-list-activate' }), tabId);
    await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  }
  await page.waitForSelector('#vennPage:not([hidden]) #stage', { timeout: 30_000 });
  await waitForComponentOwnerReady(page, 'venn', {
    expectedTabId: tabId,
    requireMountedRoot: true,
    requirePublished,
    requireIdle: true,
    timeout: 30_000
  });
}

async function configureVennTab(page, config) {
  await page.evaluate(cfg => {
    const root = document.querySelector('#vennPage:not([hidden])');
    if (!root) {
      throw new Error('Active Venn root not found');
    }
    const setValue = (selector, value, dispatch = false) => {
      const node = root.querySelector(selector);
      if (!node) {
        throw new Error(`Missing Venn control ${selector}`);
      }
      node.value = value;
      if (dispatch) {
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };
    setValue('#labelA', cfg.labels[0], true);
    setValue('#labelB', cfg.labels[1], true);
    setValue('#labelC', cfg.labels[2], true);
    setValue('#listA', cfg.A.join('\n'), true);
    setValue('#listB', cfg.B.join('\n'), true);
    setValue('#listC', cfg.C.join('\n'), true);
    window.Components?.venn?.__getState?.()?.ui?.syncTableFromInputs?.({
      refresh: true,
      skipPayloadSync: false
    });
    const plotType = root.querySelector('#vennPlotType');
    if (plotType && plotType.value !== 'venn') {
      plotType.value = 'venn';
      plotType.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.Components?.venn?.draw?.({ reason: 'e2e-venn-list-configure', force: true, userInitiated: true });
  }, config);
  await waitForComponentOwnerReady(page, 'venn', {
    requireMountedRoot: true,
    requirePublished: true,
    requireIdle: true,
    timeout: 30_000
  });
  await page.evaluate(cfg => {
    const root = document.querySelector('#vennPage:not([hidden])');
    const region = root?.querySelector?.('#regionSelect');
    if (!region) {
      throw new Error('Missing region select');
    }
    region.value = cfg.region;
    region.dispatchEvent(new Event('change', { bubbles: true }));
    const total = root.querySelector('#totalGenes');
    if (!total) {
      throw new Error('Missing total genes input');
    }
    total.value = String(cfg.totalGenes);
    total.dispatchEvent(new Event('input', { bubbles: true }));
    const species = root.querySelector('#speciesSelect');
    if (species) {
      species.value = cfg.species;
      species.dispatchEvent(new Event('change', { bubbles: true }));
    }
    root.querySelector('#calcSignificance')?.click();
  }, config);
  await page.waitForFunction(() => {
    const text = document.querySelector('#vennPage:not([hidden]) #significanceResults')?.textContent || '';
    return /hypergeometric|p-value|Overlap/i.test(text);
  }, null, { timeout: 20_000 });
  await expect(page.locator('#vennPage:not([hidden]) #calcSignificance')).toHaveText('Calculate statistics');
  await expect(page.locator('#vennPage:not([hidden]) #vennStatsStatus')).toContainText('Statistics calculated');
}

async function readVennSnapshot(page) {
  return page.evaluate(() => {
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(activeTabId, 'venn') || document.querySelector('#vennPage:not([hidden])');
    const state = window.Components?.venn?.__getState?.() || null;
    const text = selector => root?.querySelector?.(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const value = selector => root?.querySelector?.(selector)?.value || '';
    return {
      activeTabId,
      rootTabId: root?.dataset?.workspaceTabId || null,
      labels: [value('#labelA'), value('#labelB'), value('#labelC')],
      region: value('#regionSelect'),
      regionText: text('#regionList'),
      species: value('#speciesSelect'),
      significanceText: text('#significanceResults'),
      counts: {
        A: text('#countA'),
        B: text('#countB'),
        C: text('#countC'),
        AB: text('#countAB'),
        AC: text('#countAC'),
        BC: text('#countBC'),
        ABC: text('#countABC')
      },
      analysis: {
        lastRegionCode: state?.analysis?.lastRegionCode || null,
        lastRegionSignature: state?.analysis?.lastRegionSignature || null,
        lastCounts: state?.analysis?.lastCounts ? { ...state.analysis.lastCounts } : null,
        hasParsedLists: !!state?.analysis?.lastParsedLists,
        significanceTotal: state?.analysis?.lastSignificance?.total || null
      }
    };
  });
}

test('venn list edits, parsed caches, selected region, and significance stay tab-isolated', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const firstId = await openVennTab(page, { first: true });
  const secondId = await openVennTab(page, { first: false });
  expect(secondId).not.toBe(firstId);

  const firstConfig = {
    labels: ['Alpha', 'Beta', 'Gamma'],
    A: ['A_ONLY_1', 'AB_SHARED_1', 'ABC_SHARED_1'],
    B: ['B_ONLY_1', 'AB_SHARED_1', 'ABC_SHARED_1'],
    C: ['C_ONLY_1', 'ABC_SHARED_1'],
    region: 'AB',
    totalGenes: 120,
    species: 'hsapiens'
  };
  const secondConfig = {
    labels: ['Delta', 'Epsilon', 'Zeta'],
    A: ['A_ONLY_2', 'ABC_SHARED_2'],
    B: ['B_ONLY_2', 'BC_SHARED_2', 'ABC_SHARED_2'],
    C: ['C_ONLY_2', 'BC_SHARED_2', 'ABC_SHARED_2'],
    region: 'BC',
    totalGenes: 240,
    species: 'mmusculus'
  };

  // Both newly created tabs start empty; configuration below publishes each graph.
  await activateTabById(page, firstId, { requirePublished: false });
  await configureVennTab(page, firstConfig);
  const firstBeforeSwitch = await readVennSnapshot(page);

  // The newly created second tab is intentionally empty until its inputs are configured.
  await activateTabById(page, secondId, { requirePublished: false });
  await configureVennTab(page, secondConfig);
  const secondBeforeSwitch = await readVennSnapshot(page);

  await activateTabById(page, firstId);
  const firstAfterReturn = await readVennSnapshot(page);

  await activateTabById(page, secondId);
  const secondAfterReturn = await readVennSnapshot(page);

  await testInfo.attach('venn-list-cache-region-tab-isolation.snapshots.json', {
    body: Buffer.from(JSON.stringify({
      firstId,
      secondId,
      firstBeforeSwitch,
      secondBeforeSwitch,
      firstAfterReturn,
      secondAfterReturn
    }, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  expect(firstAfterReturn.activeTabId).toBe(firstId);
  expect(secondAfterReturn.activeTabId).toBe(secondId);
  expect(firstAfterReturn.rootTabId).toBe(firstId);
  expect(secondAfterReturn.rootTabId).toBe(secondId);

  expect(firstAfterReturn.labels).toEqual(firstConfig.labels);
  expect(secondAfterReturn.labels).toEqual(secondConfig.labels);
  expect(firstAfterReturn.region).toBe('AB');
  expect(secondAfterReturn.region).toBe('BC');
  expect(firstAfterReturn.regionText).toContain('AB_SHARED_1');
  expect(firstAfterReturn.regionText).not.toContain('BC_SHARED_2');
  expect(secondAfterReturn.regionText).toContain('BC_SHARED_2');
  expect(secondAfterReturn.regionText).not.toContain('AB_SHARED_1');
  expect(firstAfterReturn.species).toBe('hsapiens');
  expect(secondAfterReturn.species).toBe('mmusculus');
  expect(firstAfterReturn.significanceText).toContain('Alpha');
  expect(firstAfterReturn.significanceText).not.toContain('Delta');
  expect(secondAfterReturn.significanceText).toContain('Delta');
  expect(secondAfterReturn.significanceText).not.toContain('AB_SHARED_1');
  expect(firstAfterReturn.analysis.significanceTotal).toBe(120);
  expect(secondAfterReturn.analysis.significanceTotal).toBe(240);
  expect(firstAfterReturn.analysis.hasParsedLists).toBe(true);
  expect(secondAfterReturn.analysis.hasParsedLists).toBe(true);
  expect(issues.critical).toEqual([]);
});

test('delayed table paste remains owned by its originating Venn tab', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const firstId = await openVennTab(page, { first: true });
  await activateTabById(page, firstId, { requirePublished: false });
  await page.evaluate(() => {
    const hot = window.Shared?.hot?.__tabTablePools?.venn?.byTab?.[window.Main?.session?.workspaceState?.activeTabId]?.instance;
    if (!hot?.selectCell) throw new Error('Venn table instance unavailable');
    hot.selectCell(1, 0);
    const tableImport = window.Shared?.tableImport;
    if (!tableImport?.getClipboardPayloadFromEvent) throw new Error('Clipboard reader unavailable');
    window.__vennPasteClipboardRestore = tableImport.getClipboardPayloadFromEvent;
    window.__vennPasteDeferredResolve = null;
    tableImport.getClipboardPayloadFromEvent = () => new Promise(resolve => {
      window.__vennPasteDeferredResolve = () => resolve({ text: 'A_LATE_PASTE', delimiter: null, source: 'delayed-test' });
    });
    const host = document.querySelector('#vennPage:not([hidden]) #vennHot');
    const event = new Event('paste', { bubbles: true, cancelable: true });
    const transfer = new DataTransfer();
    transfer.setData('text/plain', 'A_LATE_PASTE');
    Object.defineProperty(event, 'clipboardData', { value: transfer });
    host.dispatchEvent(event);
    if (!event.defaultPrevented) throw new Error('Venn table did not claim the paste event');
  });
  await page.waitForFunction(() => typeof window.__vennPasteDeferredResolve === 'function');

  try {
  const secondId = await openVennTab(page);
  await activateTabById(page, secondId, { requirePublished: false });
  await configureVennTab(page, {
    labels: ['Delta', 'Epsilon', 'Zeta'],
    A: ['B_INITIAL'],
    B: [],
    C: [],
    region: 'A',
    totalGenes: 240,
    species: 'mmusculus'
  });

    await page.evaluate(() => {
      window.Shared.tableImport.getClipboardPayloadFromEvent = window.__vennPasteClipboardRestore;
      const resolve = window.__vennPasteDeferredResolve;
      window.__vennPasteDeferredResolve = null;
      resolve?.();
    });
    await page.waitForFunction(id => {
      const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id);
      return tab?.payload?.data?.table?.[1]?.[0] === 'A_LATE_PASTE';
    }, firstId, { timeout: 20_000 });

    const secondPayloadBeforeReturn = await page.evaluate(id =>
      window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id)?.payload?.data?.table?.[1]?.[0] || '',
    secondId);
    expect(secondPayloadBeforeReturn).toBe('B_INITIAL');

    await activateTabById(page, firstId);
    const firstAfterReturn = await page.evaluate(id => {
      const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === id);
      const hot = window.Shared?.hot?.__tabTablePools?.venn?.byTab?.[id]?.instance;
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'venn');
      return {
        payload: tab?.payload?.data?.table?.[1]?.[0] || '',
        table: hot?.getDataAtCell?.(1, 0) || '',
        input: root?.querySelector?.('#listA')?.value || ''
      };
    }, firstId);
    expect(firstAfterReturn.payload).toBe('A_LATE_PASTE');
    expect(firstAfterReturn.table).toBe('A_LATE_PASTE');
    expect(firstAfterReturn.input).toContain('A_LATE_PASTE');
    expect(issues.critical).toEqual([]);
  } finally {
    await page.evaluate(() => {
      if (window.__vennPasteClipboardRestore) {
        window.Shared.tableImport.getClipboardPayloadFromEvent = window.__vennPasteClipboardRestore;
      }
      window.__vennPasteDeferredResolve?.();
      delete window.__vennPasteClipboardRestore;
      delete window.__vennPasteDeferredResolve;
    }).catch(error => {
      if (!page.isClosed()) throw error;
    });
  }
});
