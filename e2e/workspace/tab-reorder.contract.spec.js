const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');
const { clearRecoverySnapshot, seedRecoveryArchive, reloadAndAcceptRecovery } = require('../helpers/recoveryDriver');

async function visibleTabIds(page) {
  return page.locator('#workspaceTabsList .workspace-tab[data-tab-id]').evaluateAll(nodes =>
    nodes.map(node => String(node.dataset.tabId || '').trim()).filter(Boolean)
  );
}

async function openBoxAndLineTabs(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  const boxTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: false });
  const lineTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  return { boxTabId, lineTabId, order: await visibleTabIds(page) };
}

test('Workspace tab drag reorders tabs and keeps the moved tab identity', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  const { boxTabId, lineTabId, order: before } = await openBoxAndLineTabs(page);
  const boxIndex = before.indexOf(boxTabId);
  const lineIndex = before.indexOf(lineTabId);
  expect(boxIndex).toBeGreaterThanOrEqual(0);
  expect(lineIndex).toBeGreaterThan(boxIndex);

  const source = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${boxTabId}"]`);
  const target = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${lineTabId}"]`);
  const targetBox = await target.boundingBox();
  await source.dragTo(target, {
    targetPosition: { x: Math.max(1, (targetBox?.width || 20) - 2), y: (targetBox?.height || 20) / 2 }
  });

  const expected = before.slice();
  expected.splice(boxIndex, 1);
  expected.splice(lineIndex, 0, boxTabId);
  await expect.poll(() => visibleTabIds(page)).toEqual(expected);
  expect((await visibleTabIds(page)).indexOf(boxTabId)).toBe(lineIndex);
  expect(issues.critical).toEqual([]);
});

test('Keyboard shortcuts reorder tabs without changing the active owner', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  const { boxTabId, lineTabId, order: before } = await openBoxAndLineTabs(page);
  const boxIndex = before.indexOf(boxTabId);
  const source = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${boxTabId}"]`);
  const line = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${lineTabId}"]`);
  const shortcuts = await source.getAttribute('aria-keyshortcuts');
  expect(shortcuts).toContain('Meta+Shift+ArrowRight');

  const afterRight = before.slice();
  afterRight.splice(boxIndex, 1);
  afterRight.splice(boxIndex + 1, 0, boxTabId);
  await source.focus();
  await source.press('Control+Shift+ArrowRight');
  await expect.poll(() => visibleTabIds(page)).toEqual(afterRight);
  expect(shortcuts).toContain('Control+Shift+ArrowRight');
  await expect(source).toBeFocused();
  await expect(line).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null)).toBe(lineTabId);

  const afterLeft = afterRight.slice();
  afterLeft.splice(afterLeft.indexOf(boxTabId), 1);
  afterLeft.splice(boxIndex, 0, boxTabId);
  await source.press('Control+Shift+ArrowLeft');
  await expect.poll(() => visibleTabIds(page)).toEqual(afterLeft);
  await expect(source).toBeFocused();
  expect(await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null)).toBe(lineTabId);

  await source.press('Meta+Shift+ArrowRight');
  await expect.poll(() => visibleTabIds(page)).toEqual(afterRight);
  await expect(source).toBeFocused();
  await source.press('Meta+Shift+ArrowLeft');
  await expect.poll(() => visibleTabIds(page)).toEqual(afterLeft);
  await expect(source).toBeFocused();
  expect(await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null)).toBe(lineTabId);
  expect(issues.critical).toEqual([]);
});

for (const mode of ['reopen', 'recovery']) {
  test(`Restored active tab keeps only its normal highlight after ${mode}`, async ({ page }, testInfo) => {
    test.setTimeout(90000);
    const { boxTabId } = await openBoxAndLineTabs(page);
    await page.evaluate(id => window.Main.tabs.activateTab(id), boxTabId);
    const archive = await buildWorkspaceArchive(page, { scope: 'workspace', useWorker: false });
    await clearRecoverySnapshot(page);
    await page.keyboard.press('Tab');
    if (mode === 'reopen') {
      await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { reload: false });
    } else {
      await seedRecoveryArchive(page, archive.base64, { tabCount: 2 });
      expect(await reloadAndAcceptRecovery(page)).toBe(true);
    }
    await page.waitForFunction(() => {
      const state = window.Main.session.workspaceState;
      return !state.documentOperation?.active && state.tabs.filter(tab => tab.loadedFromArchive).length === 2;
    });
    const tab = page.locator('#workspaceTabsList .workspace-tab.is-active');
    await expect(tab).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(tab).toHaveCSS('outline-style', 'none');
    const state = await tab.evaluate(element => ({
      focusVisible: element.matches(':focus-visible'),
      before: getComputedStyle(element, '::before').content,
      dragging: window.Main.session.workspaceState.draggingTabId,
      over: window.Main.session.workspaceState.dragOverTabId
    }));
    expect(state).toEqual({ focusVisible: true, before: 'none', dragging: null, over: null });
    await page.locator('#workspaceTabsList').screenshot({ path: testInfo.outputPath(`${mode}-focus.png`) });
    await tab.click();
    await expect(tab).toHaveCSS('outline-style', 'none');

    await page.emulateMedia({ forcedColors: 'active' });
    await page.keyboard.press('Escape');
    await tab.focus();
    // High contrast already gives every selected control this selection marker.
    await expect(tab).toHaveCSS('outline-style', 'solid');
    await expect(tab).toHaveCSS('outline-width', '2px');
    await expect(tab).toHaveCSS('outline-offset', '-2px');

    // Focus can move independently of selection when tabs are reordered.
    const inactive = page.locator('#workspaceTabsList .workspace-tab:not(.is-active)[data-tab-id]').first();
    await inactive.focus();
    await expect(inactive).toHaveCSS('outline-style', 'solid');
    await expect(inactive).toHaveCSS('outline-width', '2px');
    await expect(inactive).toHaveCSS('outline-offset', '-2px');
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await page.emulateMedia({ forcedColors: 'none' });
    await expect(inactive).toHaveCSS('outline-style', 'solid');
    await expect(inactive).toHaveCSS('outline-offset', '-2px');
  });
}
