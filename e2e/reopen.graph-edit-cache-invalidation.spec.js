const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

function graphSignatureInPage(type) {
  const state = window.Main?.session?.workspaceState || {};
  const activeTab = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
  const root = (activeTab && window.Shared?.workspaceTabs?.getMountedRoot?.(activeTab.id, type))
    || document.querySelector(`#${type}Page:not([hidden])`)
    || document.getElementById(`${type}Page`);
  if (!root) { return 'no-root'; }
  let text = '';
  const seen = new Set();
  root.querySelectorAll('.svgbox svg, svg, canvas').forEach(node => {
    if (seen.has(node)) { return; }
    seen.add(node);
    if (node.tagName && node.tagName.toLowerCase() === 'canvas') {
      try {
        text += node.toDataURL();
      } catch (err) {
        text += `canvas:${node.width}x${node.height}`;
      }
    } else {
      text += node.outerHTML || '';
    }
  });
  let h1 = 0;
  let h2 = 5381;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = (h1 * 31 + ch) | 0;
    h2 = (h2 * 131 + ch) | 0;
  }
  return `${text.length}:${h1}:${h2}`;
}

async function waitForSelectorInPage(page, selector, timeout = 30_000) {
  await page.waitForFunction((sel) => !!document.querySelector(sel), selector, { timeout });
}

async function awaitComponentIdle(page, type) {
  await page.evaluate(async (componentType) => {
    const component = window.Components?.[componentType];
    if (component && typeof component.awaitReadyForSnapshot === 'function') {
      await component.awaitReadyForSnapshot({
        reason: 'e2e-reopen-graph-edit-idle',
        timeoutMs: 12_000,
        settleFrames: 3
      });
      return;
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }, type);
}

async function loadExampleAndWait(page, component, graphSelector) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await clickExampleButtonIfPresent(page, component.exampleButtonId);
    try {
      await waitForSelectorInPage(page, graphSelector, 5_000);
      await awaitComponentIdle(page, component.type);
      return;
    } catch (err) {
      await page.waitForTimeout(500 + attempt * 150);
    }
  }
  await waitForSelectorInPage(page, graphSelector, 20_000);
  await awaitComponentIdle(page, component.type);
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    const context = tabsApi.getSessionActionsContext();
    const blob = await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-reopen-graph-edit-archive'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return { fileName: `${stem}.graph`, base64: btoa(binary) };
  }, fileStem);
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, archive.fileName);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function reopenArchiveAndActivate(page, archivePath, type) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await input.setInputFiles(archivePath);
  await page.waitForTimeout(1_500);
  const tabId = await page.evaluate((componentType) => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return (tabs.find(tab => tab && tab.type === componentType && !tab.isWelcome) || {}).id || null;
  }, type);
  expect(tabId, `${type} tab not found after archive reopen`).toBeTruthy();
  await page.evaluate(async (id) => {
    const activate = window.Main?.tabs?.activateTab;
    if (typeof activate === 'function') {
      const result = activate(id, { reason: 'e2e-reopen-graph-edit-activate' });
      if (result && typeof result.then === 'function') {
        await result;
      }
    }
  }, tabId);
  return tabId;
}

async function restoredCacheState(page, type) {
  return page.evaluate((componentType) => {
    const state = window.Main?.session?.workspaceState || {};
    const tab = (state.tabs || []).find(entry => entry && entry.id === state.activeTabId && entry.type === componentType)
      || (state.tabs || []).find(entry => entry && entry.type === componentType && !entry.isWelcome)
      || null;
    return {
      tabId: tab?.id || null,
      hasRestoredGraph: !!(
        tab?.authoritativeRenderRestore
        || tab?.renderCache
        || tab?.renderCacheSignature
        || tab?.archiveRenderCache
        || tab?.archiveRenderCacheSignature
      ),
      hasRuntimeCache: !!(tab?.renderCache || tab?.renderCacheSignature),
      hasArchiveCache: !!(tab?.archiveRenderCache || tab?.archiveRenderCacheSignature),
      authoritative: !!tab?.authoritativeRenderRestore
    };
  }, type);
}

async function graphEditEventCount(page, type, tabId, action) {
  return page.evaluate(({ componentType, id, eventAction }) => {
    const events = window.Shared?.componentLifecycle?.getLifecycleEvents?.() || [];
    return events.filter(event => (
      event
      && event.componentKey === componentType
      && (!id || String(event.tabId || '') === String(id))
      && event.action === eventAction
    )).length;
  }, { componentType: type, id: tabId, eventAction: action });
}

test.describe('Reopened graph edits invalidate restored render caches', () => {
  test('box font editing rehydrates the restored graph before toolbar activation', async ({ page }) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    const component = { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' };
    const textSelector = '#boxPage:not([hidden]) #boxPlot svg text[data-font-editable="1"]';

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await openComponentFromWelcome(page, component, { first: true });
    await loadExampleAndWait(page, component, textSelector);

    const archivePath = await captureWorkspaceArchive(page, 'reopen-graph-edit-box');
    const tabId = await reopenArchiveAndActivate(page, archivePath, component.type);
    await waitForSelectorInPage(page, textSelector, 30_000);
    await awaitComponentIdle(page, component.type);

    const beforeCache = await restoredCacheState(page, component.type);
    expect(beforeCache.hasRestoredGraph, 'box should reopen through a render cache before the edit').toBe(true);
    const beforeRedraws = await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested');

    await page.locator(textSelector).first().click({ force: true });

    await expect.poll(async () => {
      const state = await restoredCacheState(page, component.type);
      return state.hasRestoredGraph;
    }, { timeout: 12_000, intervals: [100, 200, 400, 800] }).toBe(false);
    await expect.poll(
      async () => (await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested')) > beforeRedraws,
      { timeout: 12_000, intervals: [100, 200, 400, 800] }
    ).toBe(true);
    await expect(page.locator('.font-toolbar-host[data-font-toolbar-scope="box"] .font-controls-panel[data-open="1"]')).toBeVisible({ timeout: 12_000 });

    expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
  });

  test('heatmap palette editing repaints after archive restore', async ({ page }) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    const component = { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' };
    const cellSelector = '#heatmapPage:not([hidden]) #heatmapSvg [data-export-layer="heatmap-cells"] rect';
    const paletteTriggerSelector = '#heatmapPage:not([hidden]) #heatmapSvg [data-heatmap-palette-trigger="legend"]';
    const paletteSelector = '.font-toolbar-host[data-font-toolbar-scope="heatmap"] .heatmap-palette-controls-panel';

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await openComponentFromWelcome(page, component, { first: true });
    await loadExampleAndWait(page, component, cellSelector);

    const archivePath = await captureWorkspaceArchive(page, 'reopen-graph-edit-heatmap');
    const tabId = await reopenArchiveAndActivate(page, archivePath, component.type);
    await waitForSelectorInPage(page, cellSelector, 30_000);
    await awaitComponentIdle(page, component.type);

    const beforeCache = await restoredCacheState(page, component.type);
    expect(beforeCache.hasRestoredGraph, 'heatmap should reopen through a render cache before the edit').toBe(true);
    const beforeRedraws = await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested');

    await waitForSelectorInPage(page, paletteTriggerSelector, 30_000);
    await page.locator(paletteTriggerSelector).first().click({ force: true });
    await expect(page.locator(paletteSelector)).toBeVisible({ timeout: 12_000 });
    await expect.poll(
      async () => (await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested')) > beforeRedraws,
      { timeout: 12_000, intervals: [100, 200, 400, 800] }
    ).toBe(true);
    await awaitComponentIdle(page, component.type);

    const beforeColorSignature = await page.evaluate(graphSignatureInPage, component.type);
    const colorInput = page.locator(`${paletteSelector} input[data-heatmap-palette-key="positive"]`).first();
    await expect(colorInput).toBeVisible({ timeout: 12_000 });
    const currentColor = String(await colorInput.inputValue()).toLowerCase();
    const nextColor = currentColor === '#00ff00' ? '#ff00ff' : '#00ff00';
    await colorInput.fill(nextColor, { force: true });

    await expect.poll(
      async () => (await page.evaluate(graphSignatureInPage, component.type)) !== beforeColorSignature,
      { timeout: 15_000, intervals: [150, 300, 500, 800, 1_200] }
    ).toBe(true);
    await expect.poll(async () => {
      const state = await restoredCacheState(page, component.type);
      return state.hasRestoredGraph;
    }, { timeout: 12_000, intervals: [100, 200, 400, 800] }).toBe(false);

    expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
  });
});
