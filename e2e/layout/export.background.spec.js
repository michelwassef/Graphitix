const { test, expect } = require('@playwright/test');
const fs = require('fs/promises');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

test('export background menus preserve theme, transparency, keyboard access and tab/archive ownership', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'scatter');
  const firstId = await page.evaluate(() => window.Main.session.getActiveTab().id);
  const root = page.locator('#scatterPage:not([hidden])');
  const download = root.locator('#scatterExportControls [data-action-key="download"]');
  const copy = root.locator('#scatterExportControls [data-action-key="copy"]');
  const downloadButton = download.locator('button.export-select');
  const copyButton = copy.locator('button.export-select');
  await page.evaluate(() => {
    window.showSaveFilePicker = undefined;
    window.__exportClipboard = [];
    window.ClipboardItem = class {
      constructor(items) { this.items = items; }
      static supports() { return true; }
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      write: async items => { window.__exportClipboard.push(await Promise.all(Object.entries(items[0].items).map(async ([type, blob]) => [type, await blob]))); }
    } });
  });
  const modifiedBeforeMenu = await page.evaluate(() => window.Main.session.getActiveTab().lastUserModifiedAt);
  await downloadButton.focus();
  await page.keyboard.press('ArrowDown');
  await expect(download.getByRole('menuitem', { name: 'PNG', exact: true })).toBeFocused();
  await page.keyboard.press('End');
  await expect(download.getByRole('menuitemcheckbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(downloadButton).toBeFocused();
  expect(await page.evaluate(() => window.Main.session.getActiveTab().lastUserModifiedAt)).toBe(modifiedBeforeMenu);

  async function inspectImage(base64, format) {
    return page.evaluate(async ({ base64, format }) => {
      const bitmap = new Image();
      bitmap.src = `data:${format === 'png' ? 'image/png' : 'image/svg+xml'};base64,${base64}`;
      await bitmap.decode();
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      return [...ctx.getImageData(0, 0, 1, 1).data];
    }, { base64, format });
  }

  for (const appearance of ['light', 'dark']) {
    const appearanceSelect = root.locator('select[data-color-appearance-select="1"]');
    await appearanceSelect.selectOption(appearance);
    await waitForComponentOwnerReady(page, 'scatter');
    for (const transparent of [false, true]) {
      await downloadButton.click();
      const checkbox = download.getByRole('menuitemcheckbox');
      if ((await checkbox.getAttribute('aria-checked') === 'true') !== transparent) await checkbox.click();
      await expect(download.getByRole('menu')).toBeVisible();
      await expect(checkbox).toHaveAttribute('aria-checked', String(transparent));
      await page.screenshot({ path: testInfo.outputPath(`menu-${appearance}-${transparent}.png`) });
      await page.keyboard.press('Escape');
      for (const format of ['png', 'svg', 'svg-hybrid']) {
        await downloadButton.click();
        const received = page.waitForEvent('download');
        await download.locator(`[data-format="${format}"]`).click();
        const file = await received;
        const bytes = await fs.readFile(await file.path());
        await testInfo.attach(`${appearance}-${transparent}-${format}`, { body: bytes, contentType: format === 'png' ? 'image/png' : 'image/svg+xml' });
        const pixel = await inspectImage(bytes.toString('base64'), format);
        expect(pixel, `${appearance}/${transparent}/${format}`).toEqual(transparent ? [0, 0, 0, 0] : appearance === 'dark' ? [0, 0, 0, 255] : [255, 255, 255, 255]);
      }
      for (const format of ['png', 'svg', 'svg-hybrid']) {
        await copyButton.click();
        await expect(copy.getByRole('menuitemcheckbox')).toHaveAttribute('aria-checked', String(transparent));
        const previous = await page.evaluate(() => window.__exportClipboard.length);
        await copy.locator(`[data-format="${format}"]`).click();
        await page.waitForFunction(count => window.__exportClipboard.length > count, previous);
        const clipboardBase64 = await page.evaluate(async format => {
          const type = format === 'png' ? 'image/png' : 'image/svg+xml';
          const blob = window.__exportClipboard.at(-1).find(([entryType]) => entryType === type)[1];
          return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(blob); });
        }, format);
        expect(await inspectImage(clipboardBase64, format)).toEqual(transparent ? [0, 0, 0, 0] : appearance === 'dark' ? [0, 0, 0, 255] : [255, 255, 255, 255]);
      }
    }
  }
  await downloadButton.click();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { loadExample: true });
  await waitForComponentOwnerReady(page, 'scatter');
  await downloadButton.click();
  await expect(download.getByRole('menuitemcheckbox')).toHaveAttribute('aria-checked', 'false');
  const secondId = await page.evaluate(() => window.Main.session.getActiveTab().id);
  await page.keyboard.press('Escape');
  await page.evaluate(id => window.Main.tabs.activateTab(id), firstId);
  await waitForComponentOwnerReady(page, 'scatter');
  await downloadButton.click();
  await expect(download.getByRole('menuitemcheckbox')).toHaveAttribute('aria-checked', 'true');
  await page.evaluate(id => window.Main.tabs.activateTab(id), secondId);
  await expect(page.locator('.export-menu:popover-open')).toHaveCount(0);
  await page.evaluate(id => window.Main.tabs.activateTab(id), firstId);
  await waitForComponentOwnerReady(page, 'scatter');
  const reopened = await page.evaluate(async () => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace', snapshotKind: 'document-snapshot', compression: 'STORE', useWorker: false
    });
    await window.Main.sessionActions.loadWorkspaceFile(context, new File([blob], 'background.graph', { type: 'application/zip' }), { fileName: 'background.graph' });
    return window.Main.session.workspaceState.tabs.filter(tab => tab.type === 'scatter').map(tab => tab.uiState?.export?.transparentBackground === true);
  });
  expect(reopened).toEqual([true, false]);
  await waitForComponentOwnerReady(page, 'scatter');
  await downloadButton.click();
  await expect(download.getByRole('menuitemcheckbox')).toHaveAttribute('aria-checked', 'true');
});
