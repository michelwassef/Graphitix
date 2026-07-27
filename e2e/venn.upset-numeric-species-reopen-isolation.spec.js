const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP = path.resolve(__dirname, '.tmp');

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
  await page.waitForFunction(() => !!window.Components?.venn?.ready, null, { timeout: 45_000 });
  const after = await getWorkspaceTabIds(page);
  const tabId = after.find(id => !before.has(id));
  expect(tabId).toBeTruthy();
  return tabId;
}

async function activateTabById(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ force: true });
  const clicked = await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 2_000 })
    .then(() => true)
    .catch(() => false);
  if (!clicked) {
    await page.evaluate(id => window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-venn-upset-numeric-activate' }), tabId);
    await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  }
  await page.waitForSelector('#vennPage:not([hidden]) #stage', { timeout: 30_000 });
  await page.waitForTimeout(250);
}

async function installSpeciesMock(page) {
  await page.route('https://mygene.info/v3/query**', async route => {
    const url = new URL(route.request().url());
    const q = String(url.searchParams.get('q') || '').toUpperCase();
    const taxid = q.includes('MOUSE') ? 10090 : 9606;
    await new Promise(resolve => setTimeout(resolve, q.includes('SLOW') ? 550 : 80));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hits: [{ symbol: q, taxid }] })
    });
  });
}

async function configureUpSetListTab(page) {
  await page.evaluate(() => {
    const root = document.querySelector('#vennPage:not([hidden])');
    if (!root) throw new Error('Active Venn root not found');
    const setValue = (selector, value, events = ['input', 'change']) => {
      const node = root.querySelector(selector);
      if (!node) throw new Error(`Missing ${selector}`);
      node.value = value;
      events.forEach(type => node.dispatchEvent(new Event(type, { bubbles: true })));
    };
    const setChecked = (selector, checked) => {
      const node = root.querySelector(selector);
      if (!node) throw new Error(`Missing ${selector}`);
      node.checked = checked;
      node.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue('#labelA', 'Up Alpha');
    setValue('#labelB', 'Up Beta');
    setValue('#labelC', 'Up Gamma');
    setValue('#listA', ['HUMAN_SLOW_A1', 'UP_AB_SHARED', 'UP_ABC_SHARED'].join('\n'));
    setValue('#listB', ['UP_B_ONLY', 'UP_AB_SHARED', 'UP_ABC_SHARED'].join('\n'));
    setValue('#listC', ['UP_C_ONLY', 'UP_ABC_SHARED'].join('\n'));
    setValue('#vennPlotType', 'upset', ['change']);
    setValue('#upsetSort', 'degree-desc', ['change']);
    setValue('#upsetMax', '5', ['input', 'change']);
    setChecked('#upsetShowEmpty', true);
    setChecked('#upsetShowCounts', false);
    setChecked('#upsetShowSetCounts', true);
    setChecked('#upsetShowGrid', false);
    setValue('#upsetDotSize', '9', ['input', 'change']);
    setChecked('#upsetUseSetColors', true);
    setValue('#upsetBarColor', '#aa3355');
    setValue('#upsetSetBarColor', '#3355aa');
    setValue('#upsetDotColor', '#118855');
    setValue('#upsetInactiveDotColor', '#cccccc');
    setValue('#upsetGridColor', '#444444');
    window.Components.venn.draw({ reason: 'e2e-upset-configure', force: true, userInitiated: true });
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('#vennPage:not([hidden])');
    const regionValues = Array.from(root?.querySelectorAll?.('#regionSelect option') || []).map(option => option.value);
    return root?.querySelector?.('#stage [data-upset-trace-kind]') && regionValues.some(value => value.includes('A') && value.includes('B'));
  }, null, { timeout: 20_000 });
  await page.evaluate(() => {
    const root = document.querySelector('#vennPage:not([hidden])');
    const region = root.querySelector('#regionSelect');
    const target = Array.from(region.options).map(option => option.value).find(value => value.includes('A') && value.includes('B')) || region.options[0]?.value || '';
    region.value = target;
    region.dispatchEvent(new Event('change', { bubbles: true }));
    const species = root.querySelector('#speciesSelect');
    species.value = '';
    species.dispatchEvent(new Event('change', { bubbles: true }));
    window.Components.venn.recognizeSpeciesFromInput({ reason: 'e2e-upset-species' }).catch(() => {});
  });
  await page.waitForFunction(() => document.querySelector('#vennPage:not([hidden]) #speciesSelect')?.value === 'hsapiens', null, { timeout: 20_000 });
  await page.waitForTimeout(300);
}

async function configureNumericVennTab(page) {
  await page.evaluate(() => {
    const root = document.querySelector('#vennPage:not([hidden])');
    if (!root) throw new Error('Active Venn root not found');
    const setValue = (selector, value, events = ['input', 'change']) => {
      const node = root.querySelector(selector);
      if (!node) throw new Error(`Missing ${selector}`);
      node.value = value;
      events.forEach(type => node.dispatchEvent(new Event(type, { bubbles: true })));
    };
    setValue('#labelA', 'Numeric Alpha');
    setValue('#labelB', 'Numeric Beta');
    setValue('#labelC', 'Numeric Gamma');
    setValue('#listA', '');
    setValue('#listB', '');
    setValue('#listC', '');
    setValue('#vennPlotType', 'venn', ['change']);
    setValue('#nA', '80');
    setValue('#nB', '60');
    setValue('#nC', '40');
    setValue('#nAB', '24');
    setValue('#nAC', '12');
    setValue('#nBC', '16');
    setValue('#nABC', '6');
    const species = root.querySelector('#speciesSelect');
    species.value = 'mmusculus';
    species.dispatchEvent(new Event('change', { bubbles: true }));
    const total = root.querySelector('#totalGenes');
    total.value = '300';
    total.dispatchEvent(new Event('input', { bubbles: true }));
    window.Components.venn.drawFromNumeric();
    const region = root.querySelector('#regionSelect');
    region.value = 'ABC';
    region.dispatchEvent(new Event('change', { bubbles: true }));
    root.querySelector('#calcSignificance')?.click();
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('#vennPage:not([hidden])');
    return /hypergeometric|p-value|Overlap/i.test(root?.querySelector?.('#significanceResults')?.textContent || '');
  }, null, { timeout: 20_000 });
}

async function snapshotVenn(page) {
  return page.evaluate(() => {
    const workspace = window.Main?.session?.workspaceState || {};
    const activeTabId = workspace.activeTabId || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(activeTabId, 'venn') || document.querySelector('#vennPage:not([hidden])');
    const allGenes = typeof window.Components?.venn?.getAllGenes === 'function'
      ? window.Components.venn.getAllGenes()
      : [];
    const state = window.Components?.venn?.__getState?.() || null;
    const payload = window.Components?.venn?.getPayload?.({ skipDomRebind: true }) || null;
    const text = selector => root?.querySelector?.(selector)?.textContent?.replace(/\s+/g, ' ').trim() || '';
    const value = selector => root?.querySelector?.(selector)?.value || '';
    const checked = selector => !!root?.querySelector?.(selector)?.checked;
    return {
      tabId: activeTabId,
      rootTabId: root?.dataset?.workspaceTabId || null,
      plotType: value('#vennPlotType'),
      labels: [value('#labelA'), value('#labelB'), value('#labelC')],
      species: value('#speciesSelect'),
      speciesIndicator: root?.querySelector?.('#speciesSelect')?.style?.backgroundColor || '',
      region: value('#regionSelect'),
      regionOptions: Array.from(root?.querySelectorAll?.('#regionSelect option') || []).map(option => ({ value: option.value, label: option.textContent })),
      regionText: text('#regionList'),
      significanceText: text('#significanceResults'),
      countsText: {
        A: text('#countA'),
        B: text('#countB'),
        C: text('#countC'),
        AB: text('#countAB'),
        AC: text('#countAC'),
        BC: text('#countBC'),
        ABC: text('#countABC')
      },
      numericValues: {
        nA: value('#nA'),
        nB: value('#nB'),
        nC: value('#nC'),
        nAB: value('#nAB'),
        nAC: value('#nAC'),
        nBC: value('#nBC'),
        nABC: value('#nABC')
      },
      upset: {
        sort: value('#upsetSort'),
        max: value('#upsetMax'),
        showEmpty: checked('#upsetShowEmpty'),
        showCounts: checked('#upsetShowCounts'),
        showSetCounts: checked('#upsetShowSetCounts'),
        showGrid: checked('#upsetShowGrid'),
        dotSize: value('#upsetDotSize'),
        dotSizeLabel: text('#upsetDotSizeVal'),
        useSetColors: checked('#upsetUseSetColors'),
        barColor: value('#upsetBarColor'),
        setBarColor: value('#upsetSetBarColor'),
        dotColor: value('#upsetDotColor'),
        inactiveDotColor: value('#upsetInactiveDotColor'),
        gridColor: value('#upsetGridColor')
      },
      svg: {
        hasUpSet: !!root?.querySelector?.('#stage [data-upset-trace-kind]'),
        text: text('#stage')
      },
      analysis: {
        lastDrawMode: state?.analysis?.lastDrawMode || null,
        hasParsedLists: !!state?.analysis?.lastParsedLists,
        allGenes,
        hasUpSetRegionMap: !!state?.analysis?.lastUpSetRegionMap,
        lastUpSetIntersections: Array.isArray(state?.analysis?.lastUpSetIntersections) ? state.analysis.lastUpSetIntersections.map(entry => entry.code) : [],
        lastCounts: state?.analysis?.lastCounts ? { ...state.analysis.lastCounts } : null,
        speciesCacheSize: state?.analysis?.speciesDetection?.cache?.size || 0,
        significanceTotal: state?.analysis?.lastSignificance?.total || null
      },
      payload: {
        plotType: payload?.style?.plotType || null,
        regionSelectValue: payload?.analysis?.regionSelectValue || '',
        totalGenes: payload?.analysis?.totalGenes || '',
        species: root?.querySelector?.('#speciesSelect')?.value || '',
        upset: payload?.style?.upset || null,
        counts: payload?.data ? {
          nA: String(payload.data.nA),
          nB: String(payload.data.nB),
          nC: String(payload.data.nC),
          nAB: String(payload.data.nAB),
          nAC: String(payload.data.nAC),
          nBC: String(payload.data.nBC),
          nABC: String(payload.data.nABC)
        } : null
      }
    };
  });
}

async function captureArchive(page, stem) {
  const encoded = await page.evaluate(async () => {
    const ctx = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(ctx, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-venn-upset-numeric-species'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  });
  fs.mkdirSync(TMP, { recursive: true });
  const archivePath = path.join(TMP, `${stem}.graph`);
  fs.writeFileSync(archivePath, Buffer.from(encoded, 'base64'));
  return archivePath;
}

async function reopenArchive(page, archivePath) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await installSpeciesMock(page);
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForTimeout(1000);
  await page.waitForSelector('#vennPage:not([hidden]) #stage', { timeout: 30_000 });
  await page.waitForTimeout(1000);
}

test('venn UpSet, numeric counts, species state, selected region, and archive reopen stay tab-isolated', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await installSpeciesMock(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const upsetId = await openVennTab(page, { first: true });
  const numericId = await openVennTab(page);
  expect(numericId).not.toBe(upsetId);

  await activateTabById(page, upsetId);
  await configureUpSetListTab(page);
  const upsetBefore = await snapshotVenn(page);

  await activateTabById(page, numericId);
  await configureNumericVennTab(page);
  const numericBefore = await snapshotVenn(page);

  await activateTabById(page, upsetId);
  const upsetAfterSwitch = await snapshotVenn(page);
  await activateTabById(page, numericId);
  const numericAfterSwitch = await snapshotVenn(page);

  const archivePath = await captureArchive(page, 'venn-upset-numeric-species-isolation');
  await reopenArchive(page, archivePath);

  await activateTabById(page, upsetId);
  const upsetAfterReopen = await snapshotVenn(page);
  await activateTabById(page, numericId);
  const numericAfterReopen = await snapshotVenn(page);

  await testInfo.attach('venn-upset-numeric-species-reopen-isolation.json', {
    body: Buffer.from(JSON.stringify({
      upsetId,
      numericId,
      upsetBefore,
      numericBefore,
      upsetAfterSwitch,
      numericAfterSwitch,
      upsetAfterReopen,
      numericAfterReopen
    }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  for (const snap of [upsetAfterSwitch, upsetAfterReopen]) {
    expect(snap.tabId).toBe(upsetId);
    expect(snap.rootTabId).toBe(upsetId);
    expect(snap.plotType).toBe('upset');
    expect(snap.payload.plotType).toBe('upset');
    expect(snap.labels).toEqual(['Up Alpha', 'Up Beta', 'Up Gamma']);
    expect(snap.species).toBe('hsapiens');
    expect(snap.speciesIndicator).toContain('181');
    expect(snap.upset.sort).toBe('degree-desc');
    expect(snap.upset.max).toBe('5');
    expect(snap.upset.showEmpty).toBe(true);
    expect(snap.upset.showCounts).toBe(false);
    expect(snap.upset.showSetCounts).toBe(true);
    expect(snap.upset.showGrid).toBe(false);
    expect(snap.upset.dotSize).toBe('9');
    expect(snap.upset.dotSizeLabel).toBe('9');
    expect(snap.upset.useSetColors).toBe(true);
    expect(snap.upset.barColor).toBe('#aa3355');
    expect(snap.upset.setBarColor).toBe('#3355aa');
    expect(snap.upset.dotColor).toBe('#118855');
    expect(snap.upset.inactiveDotColor).toBe('#cccccc');
    expect(snap.upset.gridColor).toBe('#444444');
    expect(snap.svg.hasUpSet).toBe(true);
    expect(snap.analysis.lastDrawMode).toBe('lists');
    expect(snap.analysis.hasParsedLists).toBe(true);
    expect(snap.analysis.allGenes).toContain('UP_AB_SHARED');
    expect(snap.analysis.allGenes).not.toContain('Numeric Alpha');
    expect(snap.analysis.hasUpSetRegionMap).toBe(true);
    expect(snap.regionOptions.length).toBeGreaterThan(0);
    expect(snap.regionText).toMatch(/UP_(?:AB|ABC)_SHARED/);
    expect(snap.regionText).not.toContain('Numeric Alpha');
    expect(snap.payload.upset.sort).toBe('degree-desc');
    expect(snap.payload.upset.showCounts).toBe(false);
  }

  for (const snap of [numericAfterSwitch, numericAfterReopen]) {
    expect(snap.tabId).toBe(numericId);
    expect(snap.rootTabId).toBe(numericId);
    expect(snap.plotType).toBe('venn');
    expect(snap.payload.plotType).toBe('venn');
    expect(snap.labels).toEqual(['Numeric Alpha', 'Numeric Beta', 'Numeric Gamma']);
    expect(snap.species).toBe('mmusculus');
    expect(snap.speciesIndicator).toBe('');
    expect(snap.region).toBe('ABC');
    expect(snap.analysis.lastDrawMode).toBe('numeric');
    expect(snap.analysis.hasUpSetRegionMap).toBe(false);
    expect(snap.analysis.lastCounts).toMatchObject({ nA: 80, nB: 60, nC: 40, ABC: 6 });
    expect(snap.countsText.A).toBe('80');
    expect(snap.countsText.B).toBe('60');
    expect(snap.countsText.C).toBe('40');
    expect(snap.countsText.ABC).toBe('6');
    expect(snap.numericValues).toEqual({
      nA: '80',
      nB: '60',
      nC: '40',
      nAB: '24',
      nAC: '12',
      nBC: '16',
      nABC: '6'
    });
    expect(snap.significanceText).toContain('Numeric Alpha');
    expect(snap.significanceText).not.toContain('Up Alpha');
    expect(snap.analysis.significanceTotal).toBe(300);
    expect(snap.payload.counts).toEqual(snap.numericValues);
  }

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
