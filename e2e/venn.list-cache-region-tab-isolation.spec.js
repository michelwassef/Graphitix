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

async function openVennTab(page, { first = false } = {}) {
  const before = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' }, { first });
  await page.waitForFunction(() => !!document.querySelector('#vennPage:not([hidden]) #stage'), null, { timeout: 45_000 });
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
    await page.evaluate(id => window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-venn-list-activate' }), tabId);
    await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  }
  await page.waitForSelector('#vennPage:not([hidden]) #stage', { timeout: 30_000 });
  await page.waitForTimeout(200);
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
    setValue('#labelA', cfg.labels[0]);
    setValue('#labelB', cfg.labels[1]);
    setValue('#labelC', cfg.labels[2]);
    setValue('#listA', cfg.A.join('\n'));
    setValue('#listB', cfg.B.join('\n'));
    setValue('#listC', cfg.C.join('\n'));
    const plotType = root.querySelector('#vennPlotType');
    if (plotType && plotType.value !== 'venn') {
      plotType.value = 'venn';
      plotType.dispatchEvent(new Event('change', { bubbles: true }));
    }
    window.Components?.venn?.draw?.({ reason: 'e2e-venn-list-configure', force: true, userInitiated: true });
  }, config);
  await page.waitForTimeout(800);
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

  await activateTabById(page, firstId);
  await configureVennTab(page, firstConfig);
  const firstBeforeSwitch = await readVennSnapshot(page);

  await activateTabById(page, secondId);
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
  expect(secondAfterReturn.significanceText).not.toContain('Alpha');
  expect(firstAfterReturn.analysis.significanceTotal).toBe(120);
  expect(secondAfterReturn.analysis.significanceTotal).toBe(240);
  expect(firstAfterReturn.analysis.hasParsedLists).toBe(true);
  expect(secondAfterReturn.analysis.hasParsedLists).toBe(true);
  expect(issues.critical).toEqual([]);
});
