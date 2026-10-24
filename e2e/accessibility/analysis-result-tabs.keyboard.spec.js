const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');

async function expectManualTabNavigation(page, listSelector, wrapperSelector, { verifyPanels = true, expectedRadii = null } = {}){
  const tabs = page.locator(`${listSelector} [role="tab"]`);
  await expect(tabs).toHaveCount(2);
  const first = tabs.nth(0);
  const second = tabs.nth(1);
  if(expectedRadii){
    const radii = await first.evaluate(node => {
      const style = getComputedStyle(node);
      return [style.borderTopLeftRadius, style.borderTopRightRadius,
        style.borderBottomRightRadius, style.borderBottomLeftRadius];
    });
    expect(radii).toEqual(expectedRadii);
  }

  await first.focus();
  await page.keyboard.press('ArrowRight');
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute('tabindex', '0');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(second).toHaveAttribute('aria-selected', 'false');
  if(verifyPanels){
    await expect(page.locator(`${wrapperSelector} [role="tabpanel"]`).nth(0)).toBeVisible();
    await expect(page.locator(`${wrapperSelector} [role="tabpanel"]`).nth(1)).toBeHidden();
  }

  await page.keyboard.press('Enter');
  await expect(second).toBeFocused();
  await expect(second).toHaveAttribute('aria-selected', 'true');
  await expect(first).toHaveAttribute('aria-selected', 'false');
  if(verifyPanels){
    await expect(page.locator(`${wrapperSelector} [role="tabpanel"]`).nth(0)).toBeHidden();
    await expect(page.locator(`${wrapperSelector} [role="tabpanel"]`).nth(1)).toBeVisible();
  }

  await page.keyboard.press('Home');
  await expect(first).toBeFocused();
  await expect(first).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press(' ');
  await expect(first).toHaveAttribute('aria-selected', 'true');
  await expect(first).toBeFocused();
}

test('Venn GO and STRING result tabs support manual keyboard activation', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true });

  await page.evaluate(() => {
    const venn = window.Components?.venn;
    const tabId = window.Main?.session?.workspaceState?.activeTabId;
    const owner = venn?.__testHooks?.getSession?.(tabId);
    const state = venn?.__getState?.();
    if(!owner?.results || !state?.analysis){
      throw new Error('Active Venn result owner is unavailable');
    }
    Object.assign(owner.results, {
      goPerformed: true,
      lastGOResult: [],
      stringPerformed: true,
      lastStringSVG: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      activeResultsTab: 'go'
    });
    Object.assign(state.analysis, {
      goPerformed: true,
      lastGOResult: [],
      stringPerformed: true,
      lastStringSVG: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      activeResultsTab: 'go'
    });
    const tabList = document.querySelector('#vennPage:not([hidden]) #analysisResultsTabs');
    if(!tabList){
      throw new Error('Venn result tablist is unavailable');
    }
    tabList.hidden = false;
    const [goTab, stringTab] = tabList.querySelectorAll('[role="tab"]');
    goTab.setAttribute('aria-selected', 'true');
    goTab.tabIndex = 0;
    stringTab.setAttribute('aria-selected', 'false');
    stringTab.tabIndex = -1;
    document.querySelector('#analysisPanelGo').hidden = false;
    document.querySelector('#analysisPanelString').hidden = true;
  });

  await expectManualTabNavigation(page, '#analysisResultsTabs', '#vennPage', {
    verifyPanels: false,
    expectedRadii: ['5px', '5px', '0px', '0px']
  });
  await expect.poll(() => page.evaluate(() => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId;
    return window.Components?.venn?.__testHooks?.getSession?.(tabId)?.results?.activeResultsTab || '';
  })).toBe('go');
});

test('Box statistical summary tabs support manual keyboard activation', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.locator('#boxLoadExample').click();
  await page.waitForFunction(() => !document.querySelector('#boxComputeStats')?.disabled, null, { timeout: 20_000 });
  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  const list = '#statsResults .stats-summary-tabs__tablist';
  await expect(page.locator(list)).toBeVisible({ timeout: 35_000 });
  await expectManualTabNavigation(page, list, '#statsResults .stats-summary-tabs', {
    expectedRadii: ['5px', '5px', '5px', '5px']
  });
});

test('Pie statistical summary tabs support manual keyboard activation', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage' }, { first: true, loadExample: true });
  await page.locator('#pieComputeStats').click();
  const list = '#pieStatsResults .stats-summary-tabs__tablist';
  await expect(page.locator(list)).toBeVisible({ timeout: 35_000 });
  await expectManualTabNavigation(page, list, '#pieStatsResults .stats-summary-tabs', {
    expectedRadii: ['5px', '5px', '5px', '5px']
  });
});

test('Box summary-tab selection stays with its owner across same-type tabs', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  await page.locator('#boxLoadExample').click();
  await page.waitForFunction(() => !document.querySelector('#boxComputeStats')?.disabled, null, { timeout: 20_000 });
  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#statsResults .stats-summary-tabs__tablist')).toBeVisible({ timeout: 35_000 });
  const tabA = await page.evaluate(() => String(window.Main?.session?.getActiveTab?.()?.id || ''));
  await page.getByRole('tab', { name: 'Multiple comparisons' }).click();
  await expect(page.getByRole('tab', { name: 'Multiple comparisons' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.evaluate(id => (
    window.Components?.box?.__testHooks?.getSession?.(id)?.state?.statsResultsTab || ''
  ), tabA)).toBe('comparisons');

  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: false, loadExample: true });
  await page.waitForFunction(() => !document.querySelector('#boxComputeStats')?.disabled, null, { timeout: 20_000 });
  await page.locator('#boxComputeStats').click();
  const tabB = await page.evaluate(() => String(window.Main?.session?.getActiveTab?.()?.id || ''));
  await expect(page.locator('#statsResults .stats-summary-tabs__tablist')).toBeVisible({ timeout: 35_000 });
  await expect(page.getByRole('tab', { name: 'Overall test summary' })).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(id => window.Main?.tabs?.activateTab?.(id, { reason: 'box-summary-tab-owner-revisit' }), tabA);
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabA, { timeout: 20_000 });
  await expect(page.getByRole('tab', { name: 'Multiple comparisons' })).toHaveAttribute('aria-selected', 'true');
  const ownerTabs = await page.evaluate(ids => ids.map(id => (
    window.Components?.box?.__testHooks?.getSession?.(id)?.state?.statsResultsTab || 'overall'
  )), [tabA, tabB]);
  expect(ownerTabs).toEqual(['comparisons', 'overall']);
});

test('Pie summary-tab selection stays with its owner across same-type tabs', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage' }, { first: true, loadExample: true });
  await page.locator('#pieComputeStats').click();
  await expect(page.locator('#pieStatsResults .stats-summary-tabs__tablist')).toBeVisible({ timeout: 35_000 });
  const tabA = await page.evaluate(() => String(window.Main?.session?.getActiveTab?.()?.id || ''));
  await page.getByRole('tab', { name: 'Multiple comparisons' }).click();
  await expect(page.getByRole('tab', { name: 'Multiple comparisons' })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.evaluate(id => (
    window.Components?.pie?.__testHooks?.getSession?.(id)?.state?.stats?.resultsTab || ''
  ), tabA)).toBe('comparisons');

  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage' }, { first: false, loadExample: true });
  await page.locator('#pieComputeStats').click();
  const tabB = await page.evaluate(() => String(window.Main?.session?.getActiveTab?.()?.id || ''));
  await expect(page.locator('#pieStatsResults .stats-summary-tabs__tablist')).toBeVisible({ timeout: 35_000 });
  await expect(page.getByRole('tab', { name: 'Overall test summary' })).toHaveAttribute('aria-selected', 'true');
  await page.evaluate(id => window.Main?.tabs?.activateTab?.(id, { reason: 'pie-summary-tab-owner-revisit' }), tabA);
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabA, { timeout: 20_000 });
  await expect(page.locator('#pieStatsResults .stats-summary-tabs__tablist')).toBeVisible({ timeout: 35_000 });
  await expect(page.getByRole('tab', { name: 'Multiple comparisons' })).toHaveAttribute('aria-selected', 'true');
  const ownerTabs = await page.evaluate(ids => ids.map(id => (
    window.Components?.pie?.__testHooks?.getSession?.(id)?.state?.stats?.resultsTab || ''
  )), [tabA, tabB]);
  expect(ownerTabs).toEqual(['comparisons', 'overall']);
});

test('Venn analysis-tab selection stays with its owner across same-type tabs', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true, loadExample: true });
  const tabA = await page.evaluate(() => String(window.Main?.session?.getActiveTab?.()?.id || ''));
  await page.waitForFunction(tabId => {
    const venn = window.Components?.venn;
    const state = venn?.__getState?.();
    const root = state?.ui?.root;
    const rootTabId = root?.getAttribute?.('data-workspace-tab-id') || root?.getAttribute?.('data-tab-id') || '';
    return !!tabId && venn?.ready === true && venn.__boundTabId === tabId
      && rootTabId === tabId && state?.ui?.analysisResultsTabs?.isConnected === true;
  }, tabA, { timeout: 20_000 });
  await page.evaluate(tabId => {
    const owner = window.Components?.venn?.__testHooks?.getSession?.(tabId);
    const state = window.Components?.venn?.__getState?.();
    if(!tabId || !owner?.results || !state?.analysis){
      throw new Error('Active Venn result owner is unavailable');
    }
    Object.assign(owner.results, {
      goPerformed: true,
      lastGOResult: [],
      stringPerformed: true,
      lastStringSVG: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      activeResultsTab: 'go'
    });
    Object.assign(state.analysis, {
      goPerformed: true,
      lastGOResult: [],
      stringPerformed: true,
      lastStringSVG: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      activeResultsTab: 'go'
    });
    const tabList = document.querySelector('#vennPage:not([hidden]) #analysisResultsTabs');
    tabList.hidden = false;
    const [goTab, stringTab] = tabList.querySelectorAll('[role="tab"]');
    goTab.setAttribute('aria-selected', 'true');
    goTab.tabIndex = 0;
    stringTab.setAttribute('aria-selected', 'false');
    stringTab.tabIndex = -1;
    document.querySelector('#analysisPanelGo').hidden = false;
    document.querySelector('#analysisPanelString').hidden = true;
  }, tabA);
  await expect(page.locator('#analysisResultsTabs')).toBeVisible();
  await page.locator('#analysisTabString').click();
  await expect(page.locator('#analysisTabString')).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => page.evaluate(id => (
    window.Components?.venn?.__testHooks?.getSession?.(id)?.results?.activeResultsTab || ''
  ), tabA)).toBe('string');

  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: false, loadExample: true });
  const tabB = await page.evaluate(() => String(window.Main?.session?.getActiveTab?.()?.id || ''));
  await expect(page.locator('#analysisResultsTabs')).toBeHidden();
  await page.evaluate(id => window.Main?.tabs?.activateTab?.(id, { reason: 'venn-analysis-tab-owner-revisit' }), tabA);
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabA, { timeout: 20_000 });
  await expect(page.locator('#analysisResultsTabs')).toBeVisible();
  await expect(page.locator('#analysisTabString')).toHaveAttribute('aria-selected', 'true');
  const ownerTabs = await page.evaluate(ids => ids.map(id => (
    window.Components?.venn?.__testHooks?.getSession?.(id)?.results?.activeResultsTab || 'go'
  )), [tabA, tabB]);
  expect(ownerTabs).toEqual(['string', 'go']);
});
