const { test, expect } = require('@playwright/test');
const { openWorkspaceArchive, saveWorkspaceArchive } = require('../helpers/archiveDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { openComponentFromWelcome, waitForDocumentOpenComplete } = require('../helpers/workspaceDriver');

async function getVennTabIds(page) {
  return page.evaluate(() => (window.Main?.session?.workspaceState?.tabs || [])
    .filter(tab => tab && !tab.isWelcome && tab.type === 'venn')
    .map(tab => String(tab.id || ''))
    .filter(Boolean));
}

async function openVennTab(page, first = false) {
  const previousIds = new Set(await getVennTabIds(page));
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' }, { first });
  await page.waitForFunction(() => !!window.Components?.venn?.ready, null, { timeout: 45_000 });
  const tabId = (await getVennTabIds(page)).find(id => !previousIds.has(id));
  expect(tabId).toBeTruthy();
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'venn');
    const activeId = window.Main?.session?.workspaceState?.activeTabId || '';
    const session = window.Components?.venn?.__testHooks?.getSession?.(id) || null;
    return activeId === id && !!root?.querySelector?.('#vennNumericMode') && !!session;
  }, tabId, { timeout: 45_000 });
  await page.evaluate(async id => window.Components?.venn?.awaitReadyForSnapshot?.({ tabId: id, componentKey: 'venn', reason: 'e2e-venn-numeric-mode-open-ready' }), tabId);
  return tabId;
}

async function activateVennTab(page, tabId) {
  await page.evaluate(async id => {
    await window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-venn-numeric-mode-activate' });
  }, tabId);
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout: 20_000 });
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'venn');
    const session = window.Components?.venn?.__testHooks?.getSession?.(id) || null;
    return !!root?.querySelector?.('#vennNumericMode') && !!session;
  }, tabId, { timeout: 45_000 });
  await page.evaluate(async id => window.Components?.venn?.awaitReadyForSnapshot?.({ tabId: id, componentKey: 'venn', reason: 'e2e-venn-numeric-mode-ready' }), tabId);
}

async function inspectNumericMode(page, tabId) {
  return page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'venn');
    if (!root) return null;
    const rect = selector => {
      const element = root.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, centerY: box.y + box.height / 2 };
    };
    const details = root.querySelector('#vennNumericMode');
    const payload = window.Components?.venn?.getPayload?.({ skipDomRebind: true }) || null;
    return {
      open: !!details?.open,
      summary: rect('#vennNumericMode > summary'),
      table: rect('#vennTablePanel'),
      setName: rect('#labelA'),
      setCount: rect('#nA'),
      intersectionName: rect('#vennNumericLabelAB'),
      intersectionCount: rect('#nAB'),
      setNameValue: root.querySelector('#labelA')?.value || '',
      intersectionLabel: root.querySelector('#vennNumericLabelAB')?.textContent || '',
      numericText: root.querySelector('#vennNumericMode')?.textContent || '',
      payloadName: payload?.data?.labelA || '',
      tableHeader: payload?.data?.table?.[0]?.[0] || '',
      uiStateOpen: (window.Main?.session?.workspaceState?.tabs || []).find(tab => String(tab?.id || '') === String(id))?.uiState?.component?.numericModeOpen === true
    };
  }, tabId);
}

async function toggleNumericMode(page, tabId) {
  const previousOpen = (await inspectNumericMode(page, tabId))?.open === true;
  const nextOpen = !previousOpen;
  await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'venn');
    root?.querySelector('#vennNumericMode > summary')?.click();
  }, tabId);
  await page.waitForFunction(({ id, open }) => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'venn');
    return root?.querySelector('#vennNumericMode')?.open === open;
  }, { id: tabId, open: nextOpen }, { timeout: 10_000 });
  await page.waitForFunction(({ id, open }) => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => String(item?.id || '') === String(id));
    return tab?.uiState?.component?.numericModeOpen === open;
  }, { id: tabId, open: nextOpen }, { timeout: 10_000 });
}

test('Venn numeric controls stay compact, editable, and isolated through reopen', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const defaultTabId = await openVennTab(page, true);
  const numericTabId = await openVennTab(page);
  expect(numericTabId).not.toBe(defaultTabId);

  await toggleNumericMode(page, numericTabId);
  await page.evaluate(({ id, value }) => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'venn');
    const input = root?.querySelector('#labelA');
    if (!input || input.getClientRects().length === 0) throw new Error('Venn set name is not visible');
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
  }, { id: numericTabId, value: 'Numeric Treatment' });

  const expanded = await inspectNumericMode(page, numericTabId);
  expect(expanded.open).toBe(true);
  expect(expanded.setNameValue).toBe('Numeric Treatment');
  expect(expanded.payloadName).toBe('Numeric Treatment');
  expect(expanded.tableHeader).toBe('Numeric Treatment');
  expect(expanded.intersectionLabel).toBe('Numeric Treatment ∩ Set 2');
  expect(expanded.numericText).not.toContain('|');
  expect(Math.abs(expanded.setName.centerY - expanded.setCount.centerY)).toBeLessThanOrEqual(2);
  expect(Math.abs(expanded.intersectionName.centerY - expanded.intersectionCount.centerY)).toBeLessThanOrEqual(2);

  const wideScreenshot = testInfo.outputPath('venn-numeric-mode-wide.png');
  await page.screenshot({ path: wideScreenshot, fullPage: true });
  await testInfo.attach('Venn numeric mode, wide', { path: wideScreenshot, contentType: 'image/png' });

  await toggleNumericMode(page, numericTabId);
  const folded = await inspectNumericMode(page, numericTabId);
  expect(folded.open).toBe(false);
  expect(folded.summary.height).toBeLessThanOrEqual(32);
  expect(folded.table.height).toBeGreaterThan(expanded.table.height + 40);
  const foldedScreenshot = testInfo.outputPath('venn-numeric-mode-folded.png');
  await page.screenshot({ path: foldedScreenshot, fullPage: true });
  await testInfo.attach('Venn numeric mode, folded', { path: foldedScreenshot, contentType: 'image/png' });

  await toggleNumericMode(page, numericTabId);
  expect((await inspectNumericMode(page, numericTabId)).uiStateOpen).toBe(true);
  await activateVennTab(page, defaultTabId);
  const defaultTab = await inspectNumericMode(page, defaultTabId);
  expect(defaultTab.open).toBe(false);
  expect(defaultTab.setNameValue).not.toBe('Numeric Treatment');

  await activateVennTab(page, numericTabId);
  expect((await inspectNumericMode(page, numericTabId)).open).toBe(true);
  const archivePath = testInfo.outputPath('venn-numeric-mode-isolation.graph');
  await saveWorkspaceArchive(page, archivePath, {
    scope: 'workspace',
    snapshotKind: 'document-snapshot',
    compression: 'STORE',
    reason: 'e2e-venn-numeric-mode-controls'
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await installLocalCdnOverrides(page);
  await openWorkspaceArchive(page, archivePath, { reload: false, componentType: 'venn', timeout: 60_000 });
  await waitForDocumentOpenComplete(page);

  const reopenedTabs = await page.evaluate(() => (window.Main?.session?.workspaceState?.tabs || [])
    .filter(tab => tab && !tab.isWelcome && tab.type === 'venn')
    .map(tab => ({ id: String(tab.id || ''), label: String(tab.payload?.data?.labelA || '') })));
  const reopenedDefault = reopenedTabs.find(tab => tab.label !== 'Numeric Treatment');
  const reopenedNumeric = reopenedTabs.find(tab => tab.label === 'Numeric Treatment');
  expect(reopenedDefault?.id).toBeTruthy();
  expect(reopenedNumeric?.id).toBeTruthy();

  await activateVennTab(page, reopenedDefault.id);
  expect((await inspectNumericMode(page, reopenedDefault.id)).open).toBe(false);
  await activateVennTab(page, reopenedNumeric.id);
  const reopened = await inspectNumericMode(page, reopenedNumeric.id);
  expect(reopened.open).toBe(true);
  expect(reopened.setNameValue).toBe('Numeric Treatment');
  expect(reopened.tableHeader).toBe('Numeric Treatment');

  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await inspectNumericMode(page, reopenedNumeric.id);
  expect(Math.abs(narrow.setName.centerY - narrow.setCount.centerY)).toBeLessThanOrEqual(2);
  expect(Math.abs(narrow.intersectionName.centerY - narrow.intersectionCount.centerY)).toBeLessThanOrEqual(2);
  const narrowScreenshot = testInfo.outputPath('venn-numeric-mode-narrow.png');
  await page.screenshot({ path: narrowScreenshot, fullPage: true });
  await testInfo.attach('Venn numeric mode, narrow', { path: narrowScreenshot, contentType: 'image/png' });

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
