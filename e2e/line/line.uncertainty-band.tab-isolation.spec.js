const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { clickExampleButton } = require('../helpers/uiDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

const COMPONENT = { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample' };
const TOOLBAR_PANEL = '.font-toolbar-host[data-font-toolbar-scope="line"] .line-uncertainty-inline-panel:visible';

async function getLineTabIds(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    return (state?.tabs || [])
      .filter(tab => tab && !tab.isWelcome && tab.type === 'line')
      .map(tab => String(tab.id || '').trim())
      .filter(Boolean);
  });
}

async function waitForLineGraph(page) {
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line')
      : null;
    return !!root?.querySelector('#linePlot svg path[data-line-style-role="line"]');
  }, null, { timeout: 45_000 });
}

async function openLineTab(page, { first = false } = {}) {
  const before = new Set(await getLineTabIds(page));
  await openComponentFromWelcome(page, COMPONENT, { first });
  const grouped = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line')
      : null;
    const control = root?.querySelector('#lineTableFormat') || null;
    if (!control) {
      return false;
    }
    control.value = 'grouped';
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  expect(grouped).toBe(true);
  await clickExampleButton(page, COMPONENT, { requireMountedRoot: true });
  await waitForLineGraph(page);
  const after = await getLineTabIds(page);
  const tabId = after.find(id => !before.has(id));
  expect(tabId).toBeTruthy();
  return tabId;
}

async function activateLineTab(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  await waitForLineGraph(page);
}

async function openUncertaintyToolbar(page) {
  const clicked = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    if (!active || active.type !== 'line') {
      return false;
    }
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line') || null;
    const path = root?.querySelector('#linePlot svg path[data-line-style-role="line"]') || null;
    if (!path) {
      return false;
    }
    path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  });
  expect(clicked).toBe(true);
  await expect(page.locator(TOOLBAR_PANEL)).toBeVisible();
}

async function configureViaToolbar(page, mode, transparency = 80) {
  await openUncertaintyToolbar(page);
  const panel = page.locator(TOOLBAR_PANEL);
  await panel.locator('select[aria-label="Uncertainty display"]').selectOption(mode);
  if (mode === 'band') {
    await panel.locator('input[aria-label="Uncertainty band transparency"]').evaluate((input, value) => {
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, transparency);
  }
  await waitForUncertaintyState(page, mode, transparency);
}

async function waitForUncertaintyState(page, mode, transparency) {
  await page.waitForFunction(({ expectedMode, expectedTransparency }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line')
      : null;
    const payload = window.Components?.line?.getPayload?.() || null;
    const svg = root?.querySelector('#linePlot svg') || null;
    if (!svg
      || payload?.config?.uncertaintyDisplay !== expectedMode
      || payload?.config?.uncertaintyBandTransparency !== String(expectedTransparency)) {
      return false;
    }
    const bands = svg.querySelectorAll('[data-line-uncertainty-band="1"]').length;
    const bars = svg.querySelectorAll('[data-line-error-bar="1"]').length;
    return expectedMode === 'band' ? bands > 0 && bars === 0 : bars > 0 && bands === 0;
  }, { expectedMode: mode, expectedTransparency: transparency }, { timeout: 30_000 });
}

async function readLineUncertaintyState(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line')
      : null;
    const payload = window.Components?.line?.getPayload?.() || null;
    const svg = root?.querySelector('#linePlot svg') || null;
    const panel = root?.querySelector('.line-uncertainty-inline-panel') || null;
    return {
      tabId: active?.id || null,
      tableFormat: payload?.config?.tableFormat || null,
      uncertaintyDisplay: payload?.config?.uncertaintyDisplay || null,
      uncertaintyBandTransparency: payload?.config?.uncertaintyBandTransparency || null,
      renderedBands: svg?.querySelectorAll('[data-line-uncertainty-band="1"]').length || 0,
      renderedBars: svg?.querySelectorAll('[data-line-error-bar="1"]').length || 0,
      toolbarOwnerTabId: panel?.dataset?.ownerTabId || null
    };
  });
}

test('grouped Line uncertainty toolbar and presentation stay isolated between same-component tabs', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const firstTabId = await openLineTab(page, { first: true });
  await configureViaToolbar(page, 'band', 65);
  const firstConfigured = await readLineUncertaintyState(page);

  const secondTabId = await openLineTab(page, { first: false });
  expect(secondTabId).not.toBe(firstTabId);
  await openUncertaintyToolbar(page);
  const secondPanel = page.locator(TOOLBAR_PANEL);
  await expect(secondPanel.locator('select[aria-label="Uncertainty display"]')).toHaveValue('bars');
  const secondDefault = await readLineUncertaintyState(page);

  // Mutate the second tab through the same toolbar. Distinct transparency values
  // make a stale tab-1 closure or projection immediately observable.
  await configureViaToolbar(page, 'band', 35);
  const secondConfigured = await readLineUncertaintyState(page);

  await activateLineTab(page, firstTabId);
  await openUncertaintyToolbar(page);
  await waitForUncertaintyState(page, 'band', 65);
  const firstAfterReturn = await readLineUncertaintyState(page);

  await activateLineTab(page, secondTabId);
  await openUncertaintyToolbar(page);
  await waitForUncertaintyState(page, 'band', 35);
  const secondAfterReturn = await readLineUncertaintyState(page);

  await testInfo.attach('line-uncertainty-band-tab-isolation.json', {
    body: Buffer.from(JSON.stringify({
      firstTabId,
      secondTabId,
      firstConfigured,
      secondDefault,
      secondConfigured,
      firstAfterReturn,
      secondAfterReturn
    }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(firstConfigured).toMatchObject({
    tabId: firstTabId,
    tableFormat: 'grouped',
    uncertaintyDisplay: 'band',
    uncertaintyBandTransparency: '65',
    toolbarOwnerTabId: firstTabId
  });
  expect(firstConfigured.renderedBands).toBeGreaterThan(0);
  expect(firstConfigured.renderedBars).toBe(0);

  expect(secondDefault).toMatchObject({
    tabId: secondTabId,
    tableFormat: 'grouped',
    uncertaintyDisplay: 'bars',
    uncertaintyBandTransparency: '80',
    toolbarOwnerTabId: secondTabId
  });
  expect(secondDefault.renderedBars).toBeGreaterThan(0);
  expect(secondDefault.renderedBands).toBe(0);

  expect(secondConfigured).toMatchObject({
    tabId: secondTabId,
    uncertaintyDisplay: 'band',
    uncertaintyBandTransparency: '35'
  });
  expect(firstAfterReturn).toMatchObject({
    tabId: firstTabId,
    uncertaintyDisplay: 'band',
    uncertaintyBandTransparency: '65',
    toolbarOwnerTabId: firstTabId
  });
  expect(secondAfterReturn).toMatchObject({
    tabId: secondTabId,
    uncertaintyDisplay: 'band',
    uncertaintyBandTransparency: '35',
    toolbarOwnerTabId: secondTabId
  });
  expect(issues.critical).toEqual([]);
});
