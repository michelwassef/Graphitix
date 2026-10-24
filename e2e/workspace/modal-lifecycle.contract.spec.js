const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { clickExpectedExampleButton, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { expectTargetsAtLeast24 } = require('../helpers/targetSizeAssertions');

async function expectShortViewportModal(page, dialog) {
  await expectTargetsAtLeast24(dialog.locator('.workspace-modal__actions button'), 'workspace modal actions');
  const layout = await dialog.locator('.workspace-modal__panel').evaluate(panel => {
    const rect = node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      panel: rect(panel),
      actions: Array.from(panel.querySelectorAll('.workspace-modal__actions button')).map(button => ({
        ...rect(button),
        visible: getComputedStyle(button).display !== 'none'
          && getComputedStyle(button).visibility !== 'hidden'
          && button.getClientRects().length > 0
      }))
    };
  });
  expect(layout.panel.left).toBeGreaterThanOrEqual(0);
  expect(layout.panel.top).toBeGreaterThanOrEqual(0);
  expect(layout.panel.right).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.panel.bottom).toBeLessThanOrEqual(layout.viewport.height);
  expect(layout.actions.length).toBeGreaterThan(0);
  for (const action of layout.actions) {
    expect(action.visible).toBe(true);
    expect(action.left).toBeGreaterThanOrEqual(0);
    expect(action.top).toBeGreaterThanOrEqual(0);
    expect(action.right).toBeLessThanOrEqual(layout.viewport.width);
    expect(action.bottom).toBeLessThanOrEqual(layout.viewport.height);
  }
}

test('example gallery is one named modal and Escape restores its trigger', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#welcomeViewAllExamples').click();

  const dialog = page.getByRole('dialog', { name: 'Explore Graphitix examples' });
  await expect(dialog).toBeVisible();
  await expectTargetsAtLeast24(dialog.getByRole('button'), 'example gallery modal');
  await expect(dialog.locator('#welcomeAllExamplesList .welcome-example-card')).toHaveCount(11);
  await expect(page.locator('#welcomeScreen')).toHaveAttribute('inert', '');
  await expect(page.locator('#welcomeExamplesDialogClose')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#welcomeViewAllExamples')).toBeFocused();
});

test('example gallery stays inside a short phone viewport', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#welcomeViewAllExamples').click();

  const dialog = page.getByRole('dialog', { name: 'Explore Graphitix examples' });
  await expect(dialog).toBeVisible();
  await expectTargetsAtLeast24(dialog.getByRole('button'), 'short-viewport example gallery');
  const galleryControlHeights = await page.evaluate(() => ({
    graphAction: getComputedStyle(document.querySelector('#graphSelectionGrid .graph-card__action')).minHeight,
    close: getComputedStyle(document.querySelector('#welcomeExamplesDialogClose')).minHeight
  }));
  expect(galleryControlHeights).toEqual({ graphAction: '44px', close: '36px' });
  const layout = await page.evaluate(() => {
    const panelNode = document.querySelector('.welcome-dialog__panel');
    const close = document.querySelector('#welcomeExamplesDialogClose');
    const panelRect = panelNode.getBoundingClientRect();
    const closeRect = close.getBoundingClientRect();
    return {
      viewport: { width: innerWidth, height: innerHeight },
      panel: { left: panelRect.left, top: panelRect.top, right: panelRect.right, bottom: panelRect.bottom },
      close: { left: closeRect.left, top: closeRect.top, right: closeRect.right, bottom: closeRect.bottom },
      scrollable: panelNode.scrollHeight > panelNode.clientHeight
    };
  });
  expect(layout.panel.left).toBeGreaterThanOrEqual(0);
  expect(layout.panel.top).toBeGreaterThanOrEqual(0);
  expect(layout.panel.right).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.panel.bottom).toBeLessThanOrEqual(layout.viewport.height);
  expect(layout.close.left).toBeGreaterThanOrEqual(0);
  expect(layout.close.top).toBeGreaterThanOrEqual(0);
  expect(layout.close.right).toBeLessThanOrEqual(layout.viewport.width);
  expect(layout.close.bottom).toBeLessThanOrEqual(layout.viewport.height);
  expect(layout.scrollable).toBe(true);
});

test('data import modal contains focus and Escape closes its picker before the prompt', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#welcomeGraphFileInput').setInputFiles({
    name: 'modal-import.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Label,Value\nA,1\n')
  });

  const dialog = page.getByRole('dialog', { name: 'Import data file' });
  const panelLayout = await dialog.locator('.workspace-modal__panel').evaluate(panel => {
    const rect = panel.getBoundingClientRect();
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
  });
  const componentButton = page.locator('#welcomeDataImportComponentButton');
  const componentMenu = page.locator('#welcomeDataImportComponentMenu');
  await expect(dialog).toBeVisible();
  const nativeComponentSelect = await page.locator('#welcomeDataImportComponent').evaluate(node => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return {
      position: style.position,
      width: rect.width,
      height: rect.height,
      padding: style.padding,
      borderWidth: style.borderWidth,
      clipPath: style.clipPath,
      whiteSpace: style.whiteSpace
    };
  });
  expect(nativeComponentSelect).toEqual({
    position: 'absolute',
    width: 1,
    height: 1,
    padding: '0px',
    borderWidth: '0px',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap'
  });
  await expectTargetsAtLeast24(dialog.getByRole('button'), 'data import modal');
  expect(panelLayout.left).toBeGreaterThanOrEqual(0);
  expect(panelLayout.top).toBeGreaterThanOrEqual(0);
  expect(panelLayout.right).toBeLessThanOrEqual(panelLayout.width);
  expect(panelLayout.bottom).toBeLessThanOrEqual(panelLayout.height);
  await expect(page.locator('#workspaceMain')).toHaveAttribute('inert', '');
  await expect(componentButton).toBeFocused();

  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#welcomeDataImportCancel')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(componentButton).toBeFocused();

  await componentButton.click();
  await expect(componentMenu).toBeVisible();
  await expectTargetsAtLeast24(componentMenu.getByRole('option'), 'data import component menu');
  const importOptionHeight = await componentMenu.getByRole('option').first().evaluate(option => getComputedStyle(option).minHeight);
  expect(importOptionHeight).toBe('36px');
  await expect(componentMenu.getByRole('option').first()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(componentMenu).toBeHidden();
  await expect(componentButton).toBeFocused();
  await expect(dialog).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#welcomeFileDropZone')).toBeFocused();
  expect(await page.evaluate(() => (
    window.Main?.session?.workspaceState?.tabs?.some(tab => !tab.isWelcome) || false
  ))).toBe(false);
});

test('open-mode prompt uses shared focus containment and Escape cancellation', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  const before = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);

  await page.locator('#welcomeGraphFileInput').setInputFiles({
    name: 'modal-open.graph',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('cancel before parsing')
  });

  const dialog = page.getByRole('dialog', { name: 'How should this file be opened?' });
  await expect(dialog).toBeVisible();
  await expectShortViewportModal(page, dialog);
  await expect(page.locator('#workspaceMain')).toHaveAttribute('inert', '');
  await expect(page.locator('#welcomeOpenModeAdd')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${before}"]`)).toBeFocused();
  expect(await page.evaluate(() => window.Main.session.workspaceState.activeTabId)).toBe(before);
});

test('replace-unsaved prompt returns focus after a cancelled workspace replacement', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, {
    first: true,
    loadExample: true
  });
  const before = await page.evaluate(() => window.Main.session.workspaceState.activeTabId);

  await page.locator('#welcomeGraphFileInput').setInputFiles({
    name: 'modal-replace.graph',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('cancel before parsing')
  });
  const openMode = page.getByRole('dialog', { name: 'How should this file be opened?' });
  await expect(openMode).toBeVisible();
  await page.locator('#welcomeOpenModeReplace').click();

  const replacePrompt = page.getByRole('dialog', { name: 'Save before replacing?' });
  await expect(replacePrompt).toBeVisible();
  await expectShortViewportModal(page, replacePrompt);
  await expect(replacePrompt).toHaveAttribute('aria-describedby', 'welcomeReplaceUnsavedMessage');
  await expect(page.locator('#welcomeReplaceUnsavedSave')).toBeFocused();
  await expect(page.locator('#workspaceMain')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(replacePrompt).toBeHidden();
  await expect(page.locator('#workspaceMain')).not.toHaveAttribute('inert', '');
  expect(await page.evaluate(() => window.Main.session.workspaceState.activeTabId)).toBe(before);
});

test('duplicate prompt shares modal focus and Escape behavior', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 320, height: 400 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await clickExpectedExampleButton(page, 'scatterLoadExample');
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state?.activeTabId);
    return !!(active?.payload && typeof active.payload === 'object');
  });
  await page.evaluate(async () => {
    const tabs = window.Main.tabs;
    const added = tabs.handleAddTabClick();
    if (added && typeof added.then === 'function') await added;
    const selected = tabs.handleGraphSelection('scatter', { reason: 'e2e-modal-duplicate' });
    if (selected && typeof selected.then === 'function') await selected;
  });
  const duplicate = page.getByRole('dialog', { name: 'Reuse data from the previous tab?' });
  await expect(duplicate).toBeVisible();
  await expectShortViewportModal(page, duplicate);
  await expect(page.locator('#duplicateReuse')).toBeFocused();
  await expect(page.locator('#workspaceMain')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(duplicate).toBeHidden();
  await expect(page.locator('#workspaceMain')).not.toHaveAttribute('inert', '');
  expect(await page.evaluate(() => window.Shared.modalLifecycle.isOpen())).toBe(false);
});
