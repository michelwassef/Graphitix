const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, waitForDocumentOpenComplete } = require('../helpers/workspaceDriver');
const { clickExampleButton } = require('../helpers/uiDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { saveWorkspaceArchive } = require('../helpers/archiveDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

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

async function readLineAdvisorState(page, tabId) {
  return page.evaluate(id => {
    const session = window.Components?.line?.__testHooks?.getSessionForTab?.(id) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || session?.root || null;
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id) || null;
    const advisor = session?.state?.advisorState || {};
    return {
      tabId: session?.tabId || null,
      open: advisor.open === true,
      payloadOpen: tab?.payload?.config?.advisorState?.open === true,
      answers: { ...(advisor.answers || {}) },
      lastApplied: advisor.lastApplied ? { ...advisor.lastApplied } : null,
      payloadAnswer: tab?.payload?.config?.advisorState?.answers?.measurement || null,
      selectedMeasurement: root?.querySelector('input[name="line-advisor-measurement"]:checked')?.value || null,
      statType: root?.querySelector('#lineStatType')?.value || null
    };
  }, tabId);
}

async function setLineAdvisorMeasurement(page, tabId, value) {
  const advisor = page.locator('#linePage:not([hidden]) #lineStatsAdvisor');
  const toggle = advisor.locator('.stats-advisor__toggle');
  if (await advisor.locator('.stats-advisor').getAttribute('data-open') !== '1') {
    await toggle.click();
  }
  const before = await readLineAdvisorState(page, tabId);
  await advisor.locator(`input[name="line-advisor-measurement"][value="${value}"]`).check();
  await page.waitForFunction(({ id, expected }) => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id) || null;
    return tab?.payload?.config?.advisorState?.answers?.measurement === expected;
  }, { id: tabId, expected: value }, { timeout: 20_000 });
  return before;
}

async function applyLineAdvisor(page, tabId, expectedMethod) {
  await page.locator('#linePage:not([hidden]) #lineStatsAdvisor .stats-advisor__actions button:not(.stats-advisor__reset)').click();
  await page.waitForFunction(({ id, method }) => {
    const session = window.Components?.line?.__testHooks?.getSessionForTab?.(id) || null;
    return session?.state?.advisorState?.lastApplied?.statsMethod === method
      && window.Main?.session?.workspaceState?.activeTabId === id;
  }, { id: tabId, method: expectedMethod }, { timeout: 30_000 });
  await waitForComponentOwnerReady(page, 'line', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
}

test('grouped Line uncertainty and advisor state stay isolated across tab switches and reopen', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();

  const firstTabId = await openLineTab(page, { first: true });
  await configureViaToolbar(page, 'band', 65);
  const firstConfigured = await readLineUncertaintyState(page);
  const firstAdvisorDefault = await setLineAdvisorMeasurement(page, firstTabId, 'ordinal');
  await applyLineAdvisor(page, firstTabId, 'spearman');
  const firstAdvisorConfigured = await readLineAdvisorState(page, firstTabId);

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
  const secondAdvisorDefault = await setLineAdvisorMeasurement(page, secondTabId, 'continuousNormal');
  await applyLineAdvisor(page, secondTabId, 'pearson');
  const secondAdvisorConfigured = await readLineAdvisorState(page, secondTabId);
  await page.locator('#linePage:not([hidden]) #lineStatsAdvisor .stats-advisor__toggle').click();
  await page.waitForFunction(id => {
    const session = window.Components?.line?.__testHooks?.getSessionForTab?.(id) || null;
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id) || null;
    return session?.state?.advisorState?.open === false && tab?.payload?.config?.advisorState?.open === false;
  }, secondTabId, { timeout: 20_000 });
  const secondAdvisorClosed = await readLineAdvisorState(page, secondTabId);

  await activateLineTab(page, firstTabId);
  const firstAdvisorAfterReturn = await readLineAdvisorState(page, firstTabId);
  expect(firstAdvisorAfterReturn.answers.measurement).toBe('ordinal');
  expect(firstAdvisorAfterReturn.payloadAnswer).toBe('ordinal');
  expect(firstAdvisorAfterReturn.open).toBe(true);
  expect(firstAdvisorAfterReturn.payloadOpen).toBe(true);
  expect(firstAdvisorAfterReturn.selectedMeasurement).toBe('ordinal');
  expect(firstAdvisorAfterReturn.lastApplied.statsMethod).toBe('spearman');
  expect(firstAdvisorAfterReturn.statType).toBe('spearman');
  await openUncertaintyToolbar(page);
  await waitForUncertaintyState(page, 'band', 65);
  const firstAfterReturn = await readLineUncertaintyState(page);

  await activateLineTab(page, secondTabId);
  const secondAdvisorAfterReturn = await readLineAdvisorState(page, secondTabId);
  expect(secondAdvisorAfterReturn.answers.measurement).toBe('continuousNormal');
  expect(secondAdvisorAfterReturn.payloadAnswer).toBe('continuousNormal');
  expect(secondAdvisorAfterReturn.open).toBe(false);
  expect(secondAdvisorAfterReturn.payloadOpen).toBe(false);
  expect(secondAdvisorAfterReturn.lastApplied.statsMethod).toBe('pearson');
  expect(secondAdvisorAfterReturn.statType).toBe('pearson');
  await openUncertaintyToolbar(page);
  await waitForUncertaintyState(page, 'band', 35);
  const secondAfterReturn = await readLineUncertaintyState(page);

  await activateLineTab(page, firstTabId);
  // The inferred defaults never use "ordinal". Reset A, then verify that it
  // returns to its own inferred choice while B keeps its applied recommendation.
  await page.locator('#linePage:not([hidden]) #lineStatsAdvisor .stats-advisor__actions .stats-advisor__reset').click();
  await page.waitForFunction(id => {
    const session = window.Components?.line?.__testHooks?.getSessionForTab?.(id) || null;
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item?.id === id) || null;
    return tab?.payload?.config?.advisorState?.answers?.measurement
      === session?.state?.advisorState?.answers?.measurement;
  }, firstTabId, { timeout: 20_000 });
  const firstAfterReset = await readLineAdvisorState(page, firstTabId);
  expect(firstAfterReset.answers.measurement).not.toBe('ordinal');
  expect(firstAfterReset.selectedMeasurement).toBe(firstAfterReset.answers.measurement);
  const secondAfterSiblingReset = await readLineAdvisorState(page, secondTabId);
  expect(secondAfterSiblingReset.answers.measurement).toBe('continuousNormal');
  expect(secondAfterSiblingReset.lastApplied.statsMethod).toBe('pearson');
  expect(firstAfterReset.payloadAnswer).toBe(firstAfterReset.answers.measurement);
  await setLineAdvisorMeasurement(page, firstTabId, 'ordinal');
  await applyLineAdvisor(page, firstTabId, 'spearman');

  await activateLineTab(page, firstTabId);
  const archivePath = testInfo.outputPath('line-advisor-tab-isolation.graph');
  await saveWorkspaceArchive(page, archivePath, {
    scope: 'workspace',
    snapshotKind: 'document-snapshot',
    compression: 'STORE',
    reason: 'e2e-line-advisor-tab-isolation'
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForFunction(() => (
    (window.Main?.session?.workspaceState?.tabs || []).filter(tab => tab?.type === 'line').length === 2
  ), null, { timeout: 60_000 });
  const [reopenedA, reopenedB] = await getLineTabIds(page);
  await activateLineTab(page, reopenedA);
  const reopenedAdvisorA = await readLineAdvisorState(page, reopenedA);
  expect(reopenedAdvisorA.answers.measurement).toBe('ordinal');
  expect(reopenedAdvisorA.payloadAnswer).toBe('ordinal');
  expect(reopenedAdvisorA.open).toBe(true);
  expect(reopenedAdvisorA.payloadOpen).toBe(true);
  expect(reopenedAdvisorA.lastApplied.statsMethod).toBe('spearman');
  await activateLineTab(page, reopenedB);
  const reopenedAdvisorB = await readLineAdvisorState(page, reopenedB);
  expect(reopenedAdvisorB.answers.measurement).toBe('continuousNormal');
  expect(reopenedAdvisorB.payloadAnswer).toBe('continuousNormal');
  expect(reopenedAdvisorB.open).toBe(false);
  expect(reopenedAdvisorB.payloadOpen).toBe(false);
  expect(reopenedAdvisorB.lastApplied.statsMethod).toBe('pearson');

  await testInfo.attach('line-uncertainty-and-advisor-tab-isolation.json', {
    body: Buffer.from(JSON.stringify({
      firstTabId,
      secondTabId,
      firstConfigured,
      firstAdvisorDefault,
      firstAdvisorConfigured,
      firstAdvisorAfterReturn,
      secondDefault,
      secondConfigured,
      secondAdvisorDefault,
      secondAdvisorConfigured,
      secondAdvisorAfterReturn,
      secondAdvisorClosed,
      firstAfterReset,
      secondAfterSiblingReset,
      reopenedAdvisorA,
      reopenedAdvisorB,
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
