const { test, expect } = require('@playwright/test');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer, parseWorkspaceArchive } = require('../helpers/archiveDriver');
const { clearRecoverySnapshot, reloadAndAcceptRecovery, seedRecoveryArchive } = require('../helpers/recoveryDriver');

const lineComponent = COMPONENT_MATRIX.find(component => component.type === 'line');

function graphTitle(page){
  return page.locator('#linePage:not([hidden]) .svgbox svg text[data-font-role="graphTitle"]').first();
}

async function openLine(page){
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, lineComponent, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'line', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
}

async function editTitleAndAlign(page, value, alignment = 'right'){
  const target = graphTitle(page);
  await expect(target).toBeVisible();
  await target.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  await editor.fill(value);
  const alignButton = page.getByRole('button', { name: `Align ${alignment}` });
  await expect(alignButton).toBeEnabled();
  await alignButton.click();
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await expect.poll(() => target.getAttribute('data-title-text-align')).toBe(alignment);
}

async function archiveWithStaleRenderSignature(page, archiveBase64){
  return page.evaluate(async encoded => {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for(let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const parsed = await window.Shared.graphArchive.parseArchiveBuffer(bytes.buffer, { fileName: 'stale-title-cache.graph' });
    const tabs = (parsed.session?.tabs || []).map(tab => ({
      id: tab.archiveRuntimeTabId || undefined,
      runtimeTabId: tab.archiveRuntimeTabId || undefined,
      title: tab.title,
      type: tab.type,
      payload: tab.payload,
      layout: tab.layout,
      previewMarkup: tab.previewMarkup,
      previewSignature: tab.previewSignature,
      previewMeta: tab.previewMeta,
      archiveRenderCache: tab.archiveRenderCache,
      archiveRenderCacheSignature: 'stale-title-feature-signature',
      archiveRenderCacheLayoutSignature: tab.archiveRenderCacheLayoutSignature,
      uiState: tab.uiState
    }));
    const blob = await window.Shared.graphArchive.buildArchiveBlob({
      tabs,
      activeIndex: parsed.session?.activeIndex || 0,
      scope: parsed.session?.scope || 'workspace',
      fileName: 'stale-title-cache.graph',
      useWorker: false
    });
    const archiveBytes = new Uint8Array(await blob.arrayBuffer());
    let output = '';
    const chunkSize = 0x8000;
    for(let offset = 0; offset < archiveBytes.length; offset += chunkSize){
      output += String.fromCharCode(...archiveBytes.subarray(offset, offset + chunkSize));
    }
    return btoa(output);
  }, archiveBase64);
}

test('multiline alignment survives a stale render-cache signature and restored title remains editable', async ({ page }) => {
  test.setTimeout(150_000);
  await openLine(page);
  const titleText = 'Cache fallback\nsecond line';
  await editTitleAndAlign(page, titleText);
  const archive = await buildWorkspaceArchive(page);
  const staleArchive = await archiveWithStaleRenderSignature(page, archive.base64);
  const parsed = await parseWorkspaceArchive(page, staleArchive, 'stale-title-cache.graph');
  const savedTab = parsed.session?.tabs?.find(tab => tab?.type === 'line');
  expect(savedTab?.archiveRenderCache).toBeTruthy();
  expect(savedTab?.archiveRenderCacheSignature).toBe('stale-title-feature-signature');

  await openWorkspaceArchiveBuffer(page, Buffer.from(staleArchive, 'base64'), {
    componentType: 'line',
    fileName: 'stale-title-cache.graph'
  });
  await waitForComponentOwnerReady(page, 'line', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  const restored = graphTitle(page);
  await expect.poll(() => restored.evaluate(node => ({
    text: node.dataset.titleBlockText || node.textContent || '',
    alignment: node.dataset.titleTextAlign || null,
    anchors: Array.from(node.querySelectorAll('tspan[data-title-line="1"]')).map(line => line.getAttribute('text-anchor'))
  }))).toEqual({ text: titleText, alignment: 'right', anchors: ['end', 'end'] });
  await expect(restored).toHaveAttribute('data-inline-editable', '1');
  await restored.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  await editor.press('End');
  await editor.type('!');
  await page.mouse.click(3, 3);
  await expect.poll(() => restored.evaluate(node => node.dataset.titleBlockText || node.textContent || ''))
    .toBe(`${titleText}!`);
});

test('duplicating an aligned multiline title keeps edits isolated by tab owner', async ({ page }) => {
  test.setTimeout(150_000);
  await openLine(page);
  const sourceText = 'Source title\nsource line';
  await editTitleAndAlign(page, sourceText);
  const sourceTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(sourceTabId).toBeTruthy();
  const sourceTab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${sourceTabId}"]`);
  await sourceTab.click({ button: 'right' });
  const contextMenu = page.locator('#tabContextMenu');
  await expect(contextMenu).toBeVisible();
  await page.locator('#tabContextDuplicateReuse').click();

  await waitForComponentOwnerReady(page, 'line', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  const duplicateTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(duplicateTabId).toBeTruthy();
  expect(duplicateTabId).not.toBe(sourceTabId);
  const duplicate = graphTitle(page);
  await expect.poll(() => duplicate.evaluate(node => ({
    text: node.dataset.titleBlockText || node.textContent || '',
    alignment: node.dataset.titleTextAlign || null
  }))).toEqual({ text: sourceText, alignment: 'right' });
  await expect(duplicate).toHaveAttribute('data-inline-editable', '1');

  await duplicate.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  await editor.fill('Duplicate title\nduplicate line');
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${sourceTabId}"]`).click();
  await waitForComponentOwnerReady(page, 'line', {
    expectedTabId: sourceTabId,
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  await expect.poll(() => graphTitle(page).evaluate(node => ({
    text: node.dataset.titleBlockText || node.textContent || '',
    alignment: node.dataset.titleTextAlign || null
  }))).toEqual({ text: sourceText, alignment: 'right' });
});

test('recovery restores multiline title text, alignment, and edit binding', async ({ page }) => {
  test.setTimeout(180_000);
  await openLine(page);
  const titleText = 'Recovered title\nsecond line';
  await editTitleAndAlign(page, titleText);
  const originalTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  const archive = await buildWorkspaceArchive(page);
  await clearRecoverySnapshot(page);
  await seedRecoveryArchive(page, archive.base64, {
    reason: 'e2e-multiline-title-recovery',
    dirty: true,
    hasData: true,
    tabCount: 1,
    fileName: 'multiline-title-recovery.graph'
  });

  const accepted = await reloadAndAcceptRecovery(page, { timeout: 20_000 });
  expect(accepted).toBe(true);
  await page.waitForFunction(expectedText => {
    const state = window.Main?.session?.workspaceState || null;
    const active = state?.tabs?.find(tab => String(tab?.id || '') === String(state?.activeTabId || ''));
    const title = document.querySelector('#linePage:not([hidden]) .svgbox svg text[data-font-role="graphTitle"]');
    return active?.type === 'line'
      && (title?.dataset?.titleBlockText || title?.textContent || '') === expectedText;
  }, titleText, { timeout: 60_000, polling: 'raf' });
  const restoredTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(restoredTabId).toBeTruthy();
  expect(restoredTabId).not.toBe(originalTabId);
  await waitForComponentOwnerReady(page, 'line', {
    expectedTabId: restoredTabId,
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  const restored = graphTitle(page);
  await expect.poll(() => restored.evaluate(node => ({
    text: node.dataset.titleBlockText || node.textContent || '',
    alignment: node.dataset.titleTextAlign || null,
    anchors: Array.from(node.querySelectorAll('tspan[data-title-line="1"]')).map(line => line.getAttribute('text-anchor'))
  }))).toEqual({ text: titleText, alignment: 'right', anchors: ['end', 'end'] });
  await expect(restored).toHaveAttribute('data-inline-editable', '1');
  await restored.dblclick();
  await expect(page.locator('.inline-edit-input').last()).toBeVisible();
});
