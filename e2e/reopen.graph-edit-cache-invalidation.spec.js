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
        tab?.renderCache
        || tab?.renderCacheSignature
        || tab?.archiveRenderCache
        || tab?.archiveRenderCacheSignature
      ),
      hasRuntimeCache: !!(tab?.renderCache || tab?.renderCacheSignature),
      hasArchiveCache: !!(tab?.archiveRenderCache || tab?.archiveRenderCacheSignature),
      hasAuthoritativeRenderRestoreProperty: Object.prototype.hasOwnProperty.call(tab || {}, ['authoritative', 'Render', 'Restore'].join(''))
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
  test('restored graph clicks use rebound handlers directly without replay', async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

    const result = await page.evaluate(async () => {
      const lifecycle = window.Shared?.componentLifecycle;
      if (!lifecycle) {
        throw new Error('componentLifecycle is unavailable');
      }
      const originalMain = window.Main;
      const originalComponents = window.Components;
      const host = document.createElement('div');
      host.id = 'graph-edit-rehydrate-contract-host';
      document.body.appendChild(host);
      try {
        lifecycle.uninstallGraphEditIntentListener();
        host.innerHTML = '<div data-workspace-component="box" data-workspace-tab-id="tab-a"><div class="svgbox"><svg><circle id="restored-a"></circle></svg></div></div>';
        const tab = { id: 'tab-a', type: 'box', renderCache: { plot: true }, archiveRenderCache: { plot: true } };
        let clicks = 0;
        let draws = 0;
        host.querySelector('#restored-a').addEventListener('click', () => { clicks += 1; });
        window.Main = {
          session: {
            workspaceState: { tabs: [tab], activeTabId: tab.id },
            getActiveTab: () => tab,
            clearTabRenderCache(owner) { owner.renderCache = null; return true; },
            clearTabArchiveRenderCache(owner) { owner.archiveRenderCache = null; return true; }
          },
          components: { get: () => null }
        };
        window.Components = { box: { ready: true, draw() { draws += 1; } } };
        lifecycle.installGraphEditIntentListener();
        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        event.__graphitixUserTrusted = true;
        host.querySelector('#restored-a').dispatchEvent(event);
        return { clicks, draws, renderCache: tab.renderCache, archiveRenderCache: tab.archiveRenderCache };
      } finally {
        lifecycle.uninstallGraphEditIntentListener();
        window.Main = originalMain;
        window.Components = originalComponents;
        host.remove();
        lifecycle.installGraphEditIntentListener();
      }
    });

    expect(result).toEqual({
      clicks: 1,
      draws: 0,
      renderCache: null,
      archiveRenderCache: null
    });
  });
  test('box font editing uses restored interactions without redrawing', async ({ page }) => {
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

    const beforeRedraws = await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested');
    await page.evaluate(() => {
      const plot = document.querySelector('#boxPage:not([hidden]) #boxPlot');
      if(!plot){
        throw new Error('Box plot missing before graph-edit continuity observation');
      }
      const state = {
        currentChildCount: plot.childNodes.length,
        initialChildCount: plot.childNodes.length,
        minimumChildCount: plot.childNodes.length
      };
      const applyRecords = records => {
        records.forEach(record => {
          if(record.target !== plot){
            return;
          }
          state.currentChildCount += record.addedNodes.length - record.removedNodes.length;
          state.minimumChildCount = Math.min(state.minimumChildCount, state.currentChildCount);
        });
      };
      const observer = new MutationObserver(applyRecords);
      observer.observe(plot, { childList: true });
      window.__boxGraphEditContinuity = { plot, state, observer, applyRecords };
    });

    await page.locator(textSelector).first().click({ force: true });

    await expect.poll(async () => {
      const state = await restoredCacheState(page, component.type);
      return state.hasRestoredGraph;
    }, { timeout: 12_000, intervals: [100, 200, 400, 800] }).toBe(false);
    expect(await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested')).toBe(beforeRedraws);
    const boxToolbarHost = page.locator('.font-toolbar-host[data-font-toolbar-scope="box"].font-toolbar-host--visible');
    await expect(boxToolbarHost).toBeVisible({ timeout: 12_000 });
    await expect(boxToolbarHost.locator('.font-controls-panel')).toBeVisible({ timeout: 12_000 });

    const continuity = await page.evaluate(() => {
      const tracker = window.__boxGraphEditContinuity;
      if(!tracker){
        return null;
      }
      tracker.applyRecords(tracker.observer.takeRecords());
      tracker.observer.disconnect();
      const result = {
        initialChildCount: tracker.state.initialChildCount,
        minimumChildCount: tracker.state.minimumChildCount,
        finalChildCount: tracker.plot.childNodes.length
      };
      delete window.__boxGraphEditContinuity;
      return result;
    });
    expect(continuity).not.toBeNull();
    expect(continuity.initialChildCount).toBeGreaterThan(0);
    expect(continuity.minimumChildCount).toBeGreaterThan(0);
    expect(continuity.finalChildCount).toBeGreaterThan(0);

    expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
  });

  test('heatmap palette editing repaints after archive restore', async ({ page }) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);

    const component = { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' };
    const cellSelector = '#heatmapPage:not([hidden]) #heatmapSvg [data-export-layer="heatmap-cells"] rect';
    const paletteTriggerSelector = `${cellSelector}:not([data-heatmap-cell-hit-layer])`;
    const paletteSelector = '.font-toolbar-host[data-font-toolbar-scope="heatmap"] .heatmap-palette-controls-panel';

    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await openComponentFromWelcome(page, component, { first: true });
    await loadExampleAndWait(page, component, cellSelector);

    const archivePath = await captureWorkspaceArchive(page, 'reopen-graph-edit-heatmap');
    const tabId = await reopenArchiveAndActivate(page, archivePath, component.type);
    await waitForSelectorInPage(page, cellSelector, 30_000);
    await awaitComponentIdle(page, component.type);

    const beforeRedraws = await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested');

    await waitForSelectorInPage(page, paletteTriggerSelector, 30_000);
    await page.locator(paletteTriggerSelector).first().click({ force: true });
    await expect(page.locator(paletteSelector)).toBeVisible({ timeout: 12_000 });
    expect(await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested')).toBe(beforeRedraws);
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

  for(const component of [
    { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample', targetSelector: '#scatterPage:not([hidden]) #scatterPlot svg text[data-font-editable="1"]' },
    { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample', targetSelector: '#pcaPage:not([hidden]) [data-plot-point="1"]' }
  ]){
    test(`${component.type} graph editing is rebound before the first restored click`, async ({ page }) => {
      test.setTimeout(180_000);
      const issues = registerIssueCollectors(page);
      await installLocalCdnOverrides(page);
      const targetSelector = component.targetSelector;

      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
      await openComponentFromWelcome(page, component, { first: true });
      await loadExampleAndWait(page, component, targetSelector);

      const archivePath = await captureWorkspaceArchive(page, `reopen-graph-edit-${component.type}`);
      const tabId = await reopenArchiveAndActivate(page, archivePath, component.type);
      await waitForSelectorInPage(page, targetSelector, 30_000);
      await awaitComponentIdle(page, component.type);
      const beforeRedraws = await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested');
      if(component.type === 'pca'){
        expect(await page.locator(targetSelector).first().getAttribute('data-pca-point-interaction')).toBeTruthy();
      }

      await page.locator(targetSelector).first().click({ force: true });
      const toolbarHost = page.locator('.font-toolbar-host--visible');
      await expect(toolbarHost).toBeVisible({ timeout: 12_000 });
      if(component.type === 'pca'){
        await expect(toolbarHost.locator('option').filter({ hasText: 'Point ·' }).first()).toHaveCount(1);
      }
      expect(await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested')).toBe(beforeRedraws);
      await expect.poll(async () => (await restoredCacheState(page, component.type)).hasRestoredGraph, {
        timeout: 12_000,
        intervals: [100, 200, 400, 800]
      }).toBe(false);

      expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
    });
  }
  const restoredAxisCases = [
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample' },
    { type: 'roc', pageId: 'rocPage', exampleButtonId: 'rocLoadExample' },
    { type: 'survival', pageId: 'survivalPage', exampleButtonId: 'survivalLoadExample' },
    { type: 'hist', pageId: 'histPage', exampleButtonId: 'histLoadExample' },
    { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample', chartType: 'stacked' }
  ];

  for(const component of restoredAxisCases){
    test(`${component.type}${component.chartType ? ` ${component.chartType}` : ''} axes open their toolbar on the first click after archive reopen`, async ({ page }) => {
      test.setTimeout(180_000);
      const issues = registerIssueCollectors(page);
      await installLocalCdnOverrides(page);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
      await openComponentFromWelcome(page, component, { first: true });

      const axisSelector = `#${component.pageId}:not([hidden]) svg [data-axis-control="1"]:not([data-axis-hit-target="1"])`;
      await loadExampleAndWait(page, component, `#${component.pageId}:not([hidden]) svg`);
      if(component.chartType){
        await page.locator(`#${component.pageId}:not([hidden]) #pieChartType`).selectOption(component.chartType);
      }
      await waitForSelectorInPage(page, axisSelector, 30_000);
      await awaitComponentIdle(page, component.type);

      const archivePath = await captureWorkspaceArchive(page, `reopen-axis-interaction-${component.type}${component.chartType ? `-${component.chartType}` : ''}`);
      const tabId = await reopenArchiveAndActivate(page, archivePath, component.type);
      await waitForSelectorInPage(page, axisSelector, 30_000);
      await awaitComponentIdle(page, component.type);

      const restoredAxis = page.locator(axisSelector).first();
      await expect(restoredAxis).toHaveAttribute('data-axis-control', '1');
      await expect(restoredAxis).toHaveAttribute('data-axis-key', /^(x|y)$/);
      const beforeRedraws = await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested');

      if(component.type === 'hist'){
        // Histogram axis lines have zero CSS hit area; dispatch on the bound SVG
        // element to verify the restored owner interaction itself.
        await restoredAxis.dispatchEvent('click');
      }else{
        await restoredAxis.click({ force: true });
      }
      const axisHost = page.locator(`.font-toolbar-host[data-font-toolbar-scope="${component.type}"].font-toolbar-host--axis`);
      await expect(axisHost).toBeVisible({ timeout: 12_000 });
      await expect(axisHost.locator('.axis-controls-panel')).toBeVisible({ timeout: 12_000 });
      expect(await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested')).toBe(beforeRedraws);
      expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
    });
  }

  const restoredInlineEditCases = [
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample', axisTitle: true },
    { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample', axisTitle: true },
    { type: 'roc', pageId: 'rocPage', exampleButtonId: 'rocLoadExample' },
    { type: 'survival', pageId: 'survivalPage', exampleButtonId: 'survivalLoadExample', axisTitle: true },
    { type: 'hist', pageId: 'histPage', exampleButtonId: 'histLoadExample', axisTitle: true },
    { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' },
    { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample' },
    { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample' }
  ];

  for(const component of restoredInlineEditCases){
    test(`${component.type} graph text enters inline editing immediately after archive reopen`, async ({ page }) => {
      test.setTimeout(180_000);
      const issues = registerIssueCollectors(page);
      await installLocalCdnOverrides(page);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
      await openComponentFromWelcome(page, component, { first: true });

      const titleSelector = `#${component.pageId}:not([hidden]) svg text[data-font-role="graphTitle"]`;
      await loadExampleAndWait(page, component, titleSelector);
      const archivePath = await captureWorkspaceArchive(page, `reopen-inline-edit-${component.type}`);
      const tabId = await reopenArchiveAndActivate(page, archivePath, component.type);
      await waitForSelectorInPage(page, titleSelector, 30_000);
      await awaitComponentIdle(page, component.type);

      const assertInlineEditorOpens = async selector => {
        const target = page.locator(selector).first();
        await expect(target).toHaveAttribute('data-inline-editable', '1');
        const beforeRedraws = await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested');
        await target.dblclick({ force: true });
        await expect(page.locator('.inline-edit-overlay')).toBeVisible({ timeout: 12_000 });
        expect(await graphEditEventCount(page, component.type, tabId, 'graph-edit-redraw-requested')).toBe(beforeRedraws);
        await page.keyboard.press('Escape');
        await expect(page.locator('.inline-edit-overlay')).toHaveCount(0, { timeout: 12_000 });
      };

      await assertInlineEditorOpens(titleSelector);
      if(component.axisTitle){
        const axisTitleSelector = `#${component.pageId}:not([hidden]) svg text[data-font-role="xTitle"], #${component.pageId}:not([hidden]) svg text[data-font-role="yTitle"]`;
        await waitForSelectorInPage(page, axisTitleSelector, 12_000);
        await assertInlineEditorOpens(axisTitleSelector);
      }
      expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
    });
  }

});
