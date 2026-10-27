const fs = require('node:fs/promises');
const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

test.beforeEach(async ({ browserName }) => {
  test.skip(browserName !== 'chromium', '[skip-policy issue=ROADMAP-FIREFOX-PARITY owner=test-infrastructure expires=2026-12-31 gate=firefox-file-handles-enabled] Native File System Access drop uses Chromium CDP.');
});

async function openWelcome(page) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.Main?.components?.ensureComponent);
}

async function dropNativeGraph(page, testInfo) {
  const bytes = await page.evaluate(async () => {
    await window.Main.components.ensureComponent('scatter');
    const payload = window.Components.scatter.createEmptyPayload();
    payload.data = [['Label', 'X', 'Y', 'Z'], ['A', 1, 2, ''], ['B', 2, 3, ''], ['C', 3, 5, '']];
    const blob = await window.Shared.graphArchive.buildArchiveBlob({
      scope: 'workspace', activeIndex: 0, useWorker: false,
      tabs: [{ type: 'scatter', title: 'Dropped original', payload }]
    });
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  const filePath = testInfo.outputPath('dropped-original.graph');
  await fs.writeFile(filePath, Buffer.from(bytes));
  const dropZone = page.locator('#welcomeFileDropZone');
  const box = await dropZone.boundingBox();
  const cdp = await page.context().newCDPSession(page);
  for (const type of ['dragEnter', 'dragOver', 'drop']) {
    await cdp.send('Input.dispatchDragEvent', {
      type, x: box.x + box.width / 2, y: box.y + box.height / 2,
      data: { items: [], files: [filePath], dragOperationsMask: 1 }
    });
  }
  await cdp.detach();
  await expect(page.locator('#scatterPage:not([hidden]) .svgbox svg').first()).toBeVisible();
  await page.waitForFunction(() => !window.Main.session.workspaceState.documentOperation?.active);
}

test('native Welcome file drop retains the original handle for delayed toolbar Save', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await openWelcome(page);
  await dropNativeGraph(page, testInfo);
  expect(await page.evaluate(() => {
    const handle = window.Main.session.workspaceState.sessionFileHandle;
    return handle instanceof window.FileSystemFileHandle && handle.name === 'dropped-original.graph';
  })).toBe(true);

  // Keep the native drop/handle boundary real; simulate permission renewal and
  // capture writes so this contract never depends on an OS permission dialog.
  await page.evaluate(() => {
    const handle = window.Main.session.workspaceState.sessionFileHandle;
    const probe = window.__dropSave = { handle, requests: 0, writes: 0, pickers: 0 };
    handle.requestPermission = async options => {
      probe.requests++;
      probe.mode = options.mode;
      probe.activation = navigator.userActivation.isActive;
      return probe.activation ? 'granted' : 'prompt';
    };
    handle.createWritable = async () => ({
      write: async data => { probe.archive = data; probe.writes++; },
      close: async () => { console.debug('E2E dropped graph written'); }
    });
    window.showSaveFilePicker = async () => { probe.pickers++; throw new Error('Unexpected Save As'); };
    const tab = window.Main.session.getActiveTab();
    tab.title = 'Edited dropped file';
    window.Main.session.markSessionDirty('e2e-dropped-file-edit', { origin: 'user' });
  });
  await page.locator('#scatterPage:not([hidden])').getByRole('tab', { name: 'General', exact: true }).click();
  // Let the drop/open gesture expire. Save must renew access using its own click.
  await page.waitForTimeout(5500);
  const written = page.waitForEvent('console', {
    predicate: message => message.text() === 'E2E dropped graph written'
  });
  await page.locator('#scatterPage:not([hidden]) #saveScatter').click();
  await written;
  const result = await page.evaluate(async () => {
    const probe = window.__dropSave;
    const saved = await window.Shared.graphArchive.parseFile(probe.archive, { fileName: probe.handle.name });
    return {
      requests: probe.requests, mode: probe.mode, activation: probe.activation,
      writes: probe.writes, pickers: probe.pickers,
      sameHandle: window.Main.session.workspaceState.sessionFileHandle === probe.handle,
      title: saved.session.tabs[0].title
    };
  });
  expect(result).toEqual({
    requests: 1, mode: 'readwrite', activation: true, writes: 1, pickers: 0,
    sameHandle: true, title: 'Edited dropped file'
  });
});

for (const mode of ['unsupported', 'null', 'rejected']) {
  test(`Welcome still reads a dropped file when handle acquisition is ${mode}`, async ({ page }, testInfo) => {
    await openWelcome(page);
    await page.evaluate(handleMode => {
      DataTransferItem.prototype.getAsFileSystemHandle = handleMode === 'unsupported' ? undefined : () => {
        if (handleMode === 'null') return Promise.resolve(null);
        return Promise.reject(new DOMException('Handle unavailable', 'NotAllowedError'));
      };
    }, mode);
    await dropNativeGraph(page, testInfo);
    expect(await page.evaluate(() => window.Main.session.workspaceState.sessionFileHandle)).toBeNull();
    await page.evaluate(() => {
      window.__unexpectedDropPicker = 0;
      window.showSaveFilePicker = async () => { window.__unexpectedDropPicker++; };
      window.Main.session.markSessionDirty('e2e-dropped-file-edit', { origin: 'user' });
    });
    const dialogPromise = page.waitForEvent('dialog');
    const click = page.locator('#scatterPage:not([hidden]) #saveScatter').click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('Use Save As and select the original file');
    await dialog.dismiss();
    await click;
    expect(await page.evaluate(() => ({
      pickers: window.__unexpectedDropPicker,
      dirty: window.Main.session.workspaceState.sessionUserDirty,
      target: window.Main.session.workspaceState.sessionFileName
    }))).toEqual({ pickers: 0, dirty: true, target: 'dropped-original.graph' });
  });
}
