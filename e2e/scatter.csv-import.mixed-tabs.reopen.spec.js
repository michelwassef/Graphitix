const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const JSZip = require('jszip');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');
const CSV_PATH = path.resolve(__dirname, '../__tests__/test-scatter-medium.csv');

// Count data rows (lines minus header, minus trailing empty line)
const CSV_ROW_COUNT = fs.readFileSync(CSV_PATH, 'utf8')
  .split('\n')
  .filter(line => line.trim()).length - 1;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openNewTabType(page, type) {
  const idsBefore = await page.evaluate(() => Array.from(
    document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]')
  ).map(n => String(n.getAttribute('data-tab-id') || '').trim()).filter(Boolean));

  await page.evaluate(async (graphType) => {
    const tabs = window.Main?.tabs;
    if (tabs && typeof tabs.handleAddTabClick === 'function') {
      const p = tabs.handleAddTabClick();
      if (p && typeof p.then === 'function') await p;
    }
    if (tabs && typeof tabs.handleGraphSelection === 'function') {
      const p = tabs.handleGraphSelection(graphType, { reason: 'e2e-csv-mixed-new-tab' });
      if (p && typeof p.then === 'function') await p;
    }
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const btn = document.getElementById('duplicateEmpty');
    if (prompt && btn && !btn.disabled) {
      btn.click();
      await new Promise(r => setTimeout(r, 220));
    }
  }, type);

  const card = page.locator(`#graphSelectionGrid [data-graph-type="${type}"]`).first();
  if (await card.isVisible().catch(() => false)) {
    await card.click({ force: true });
  }
  await page.waitForSelector(`#${type}Page:not([hidden])`, { timeout: 30_000 });

  const idsAfter = await page.evaluate(() => Array.from(
    document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]')
  ).map(n => String(n.getAttribute('data-tab-id') || '').trim()).filter(Boolean));

  return idsAfter.find(id => !idsBefore.includes(id)) || null;
}

async function activateTab(page, tabId) {
  await page.evaluate(async (id) => {
    const fn = window.Main?.tabs?.activateTab;
    if (typeof fn !== 'function') return;
    const p = fn(id, { reason: 'e2e-csv-activate' });
    if (p && typeof p.then === 'function') await p;
  }, tabId);
  await page.waitForTimeout(350);
}

async function waitForScatterRender(page) {
  // Accepts canvas mode (≥12000 pts) and batched-circles/markers (< threshold).
  // Excludes 'canvas-pending' which means a canvas draw is still in flight.
  await page.waitForFunction(() => {
    const layer = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg [data-layer="points"]');
    if (!layer) return false;
    const mode = layer.getAttribute('data-render-mode');
    if (!mode || mode === 'canvas-pending') return false;
    if (mode === 'canvas' || mode === 'canvas-resize-reused') {
      return !!layer.querySelector('foreignObject[data-point-renderer] canvas');
    }
    // batched-circles / markers: the layer has child elements when drawn
    return layer.childElementCount > 0;
  }, null, { timeout: 120_000 });
}

// Keep alias for callers that specifically expect canvas mode
async function waitForScatterCanvas(page) {
  await page.waitForFunction(() => {
    const layer = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg [data-layer="points"]');
    if (!layer) return false;
    const mode = layer.getAttribute('data-render-mode');
    if (mode !== 'canvas' && mode !== 'canvas-resize-reused') return false;
    return !!layer.querySelector('foreignObject[data-point-renderer] canvas');
  }, null, { timeout: 120_000 });
}

async function waitForScatterIdle(page) {
  // Wait for scatter to finish drawing and stats computation
  await page.waitForFunction(() => {
    if (typeof window.Components?.scatter?.isIdleForSnapshot !== 'function') return true;
    return window.Components.scatter.isIdleForSnapshot();
  }, null, { timeout: 60_000 });
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    if (!tabsApi || typeof tabsApi.getSessionActionsContext !== 'function') {
      throw new Error('Main.tabs.getSessionActionsContext unavailable');
    }
    if (!sessionActions || typeof sessionActions.buildWorkspaceArchiveBlob !== 'function') {
      throw new Error('Main.sessionActions.buildWorkspaceArchiveBlob unavailable');
    }
    const context = tabsApi.getSessionActionsContext();
    const blob = await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-csv-mixed-archive'
    });
    if (!blob) throw new Error('buildWorkspaceArchiveBlob returned null');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return { fileName: `${stem}.graph`, base64: btoa(binary), byteLength: bytes.length };
  }, fileStem);

  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, archive.fileName);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return { archivePath, byteLength: archive.byteLength };
}

async function loadWorkspaceArchiveFromPath(page, archivePath) {
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await input.setInputFiles(archivePath);
  await page.waitForTimeout(2_000);
}

async function inspectArchiveForScatterTab(archivePath) {
  const buf = fs.readFileSync(archivePath);
  const zip = await JSZip.loadAsync(buf);
  const allFiles = Object.keys(zip.files);

  // Find scatter tab directory (has a render-cache.json under tabs/*/render-cache.json)
  const scatterRcPath = allFiles.find(name => {
    if (!name.endsWith('render-cache.json')) return false;
    // Read tab.json in same directory to find type
    return true; // we'll filter by type below
  });

  // Find all tab.json files and pick the scatter one
  const scatterTabEntry = await (async () => {
    for (const name of allFiles.filter(n => n.endsWith('/tab.json'))) {
      const content = await zip.file(name).async('string');
      try {
        const json = JSON.parse(content);
        if (json.type === 'scatter') {
          return { dir: name.replace(/tab\.json$/, ''), tabJson: json };
        }
      } catch (_) { /* skip */ }
    }
    return null;
  })();

  if (!scatterTabEntry) {
    return { found: false };
  }

  const { dir } = scatterTabEntry;
  const result = { found: true, dir };

  // Inspect render-cache.json
  const rcPath = `${dir}render-cache.json`;
  if (zip.files[rcPath]) {
    const rcContent = await zip.file(rcPath).async('string');
    const rc = JSON.parse(rcContent);
    result.payloadSignatureLength = typeof rc.payloadSignature === 'string'
      ? rc.payloadSignature.length
      : (rc.payloadSignature ? JSON.stringify(rc.payloadSignature).length : 0);
    result.payloadSignatureSnippet = typeof rc.payloadSignature === 'string'
      ? rc.payloadSignature.substring(0, 120)
      : JSON.stringify(rc.payloadSignature || '').substring(0, 120);

    // Check render cache SVG viewBox
    const plotNodes = rc.cache?.plot?.nodes || [];
    const svgNode = plotNodes.find(n => n && (n.tagName === 'svg' || (n.markup && n.markup.includes('<svg'))));
    if (svgNode) {
      const markup = svgNode.markup || '';
      const vbMatch = markup.match(/viewBox="([^"]+)"/);
      result.svgViewBox = vbMatch ? vbMatch[1] : null;
      result.hasBitmapImg = markup.includes('data-graphitix-render-cache-canvas-bitmap');
    } else {
      // Try walking the nodes for any that have markup
      const allMarkup = JSON.stringify(rc.cache || '');
      const vbMatch = allMarkup.match(/viewBox=\\"([^"\\]+)\\"/);
      result.svgViewBox = vbMatch ? vbMatch[1] : null;
      result.hasBitmapImg = allMarkup.includes('data-graphitix-render-cache-canvas-bitmap');
    }
  }

  // payload.json size
  const payPath = `${dir}payload.json`;
  if (zip.files[payPath]) {
    const payContent = await zip.file(payPath).async('string');
    result.payloadSize = payContent.length;
  }

  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('scatter CSV import + box tab: save and reopen preserves data, render cache, and compact signatures', async ({ page }) => {
  test.setTimeout(300_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  // ── Step 1: Open workspace, create scatter tab ──────────────────────────────
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  // ── Step 2: Import CSV ───────────────────────────────────────────────────────
  await page.setInputFiles('#scatterFile', CSV_PATH);

  // Wait for render to complete (canvas mode for ≥12000 pts, batched-circles/markers otherwise)
  await waitForScatterRender(page);
  // Wait for stats/trendline computation to complete (prevents race on save)
  await waitForScatterIdle(page);

  const beforeSave = await page.evaluate(() => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const data = typeof hot?.getData === 'function' ? hot.getData() : [];
    const layer = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg [data-layer="points"]');
    return {
      tabId,
      rowCount: Array.isArray(data) ? Math.max(0, data.length - 1) : 0,
      firstDataLabel: Array.isArray(data) && data[1] ? String(data[1][0] || '') : '',
      renderMode: layer?.getAttribute?.('data-render-mode') || null,
      canvasCount: layer?.querySelectorAll?.('foreignObject[data-point-renderer] canvas').length || 0
    };
  });

  expect(beforeSave.tabId).toBeTruthy();
  expect(beforeSave.rowCount).toBeGreaterThanOrEqual(CSV_ROW_COUNT - 2); // tolerance for trailing empty
  expect(beforeSave.renderMode).toBeTruthy(); // canvas, batched-circles, or markers
  // canvasCount is only relevant in canvas render mode
  if (beforeSave.renderMode && beforeSave.renderMode.startsWith('canvas')) {
    expect(beforeSave.canvasCount).toBeGreaterThan(0);
  }

  // ── Step 3: Create box tab ──────────────────────────────────────────────────
  const boxTabId = await openNewTabType(page, 'box');
  expect(boxTabId).toBeTruthy();
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');
  await page.waitForTimeout(800);
  await page.waitForFunction(() => !!document.querySelector('#boxPlot svg'), null, { timeout: 60_000 });

  // ── Step 4: Activate scatter tab again to let warmup / render cache settle ──
  await activateTab(page, beforeSave.tabId);
  await waitForScatterRender(page);
  await waitForScatterIdle(page);
  // Extra settle time for async stats callback to finish and render cache to be captured
  await page.waitForTimeout(2_000);

  // ── Step 5: Save (capture workspace archive) ────────────────────────────────
  const { archivePath, byteLength } = await captureWorkspaceArchive(page, 'scatter-csv-box-reopen');
  expect(byteLength).toBeGreaterThan(0);

  // ── Step 6: Inspect archive quality (Node.js side) ─────────────────────────
  const archiveInfo = await inspectArchiveForScatterTab(archivePath);
  expect(archiveInfo.found, 'scatter tab not found in archive').toBe(true);

  // payloadSignature in render-cache.json must be compact.
  // Without the compactMatrixSignatures fix, this would be the full serialized payload matrix
  // (1MB+ for a 7409×57 hot.getData() result). With the fix it's a short hash string (~3KB).
  expect(
    archiveInfo.payloadSignatureLength,
    `payloadSignature too large (${archiveInfo.payloadSignatureLength} chars): "${archiveInfo.payloadSignatureSnippet}" — compactMatrixSignatures may not be firing`
  ).toBeLessThan(10_000);

  // Render cache SVG must have a real viewBox (not the -16 -16 32 32 placeholder from a blank scatter)
  if (archiveInfo.svgViewBox !== null) {
    expect(
      archiveInfo.svgViewBox,
      'render cache SVG has placeholder viewBox — warmup did not capture from live render'
    ).not.toBe('-16 -16 32 32');
  }

  // Render cache must have archived bitmap images only in canvas render mode
  // (batched-circles mode archives SVG circle elements, not canvas bitmaps)
  if (beforeSave.renderMode && beforeSave.renderMode.startsWith('canvas')) {
    expect(
      archiveInfo.hasBitmapImg,
      'render cache has no archived canvas bitmap in canvas mode — canvas was not captured before archive'
    ).toBe(true);
  }

  // ── Step 7: Reload and reopen ───────────────────────────────────────────────
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await loadWorkspaceArchiveFromPath(page, archivePath);

  // 3 tabs: welcome + scatter + box
  await expect(
    page.locator('#workspaceTabsList .workspace-tab[data-tab-id]')
  ).toHaveCount(3, { timeout: 30_000 });

  // ── Step 8: Verify scatter tab after reopen ─────────────────────────────────
  const restoredScatterTabId = await page.evaluate(() => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return (tabs.find(t => t && t.type === 'scatter' && !t.isWelcome) || {}).id || null;
  });
  expect(restoredScatterTabId, 'scatter tab not found after reopen').toBeTruthy();

  await activateTab(page, restoredScatterTabId);
  await waitForScatterRender(page);

  const afterReopen = await page.evaluate((id) => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    const tab = tabs.find(t => t && t.id === id) || {};
    const hot = window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__ensureHotForActiveTab?.();
    const data = typeof hot?.getData === 'function' ? hot.getData() : [];
    const layer = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg [data-layer="points"]');
    return {
      rowCount: Array.isArray(data) ? Math.max(0, data.length - 1) : 0,
      firstDataLabel: Array.isArray(data) && data[1] ? String(data[1][0] || '') : '',
      renderMode: layer?.getAttribute?.('data-render-mode') || null,
      canvasCount: layer?.querySelectorAll?.('foreignObject[data-point-renderer] canvas').length || 0,
      payloadSignature: tab.payloadSignature || null,
      // canvas mode (≥12000 pts): preview uses data-preview-canvas-bitmap
      // batched-circles/markers (< threshold): preview uses data-preview-canvas-simplified
      previewHasCanvasBitmap: typeof tab.previewMarkup === 'string'
        ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"')
        : false,
      previewHasCanvasSimplified: typeof tab.previewMarkup === 'string'
        ? tab.previewMarkup.includes('data-preview-canvas-simplified')
        : false,
      previewIsPlaceholder: typeof tab.previewMarkup === 'string'
        ? tab.previewMarkup.includes('data-preview-placeholder')
        : false,
      previewMarkupLength: typeof tab.previewMarkup === 'string' ? tab.previewMarkup.length : 0
    };
  }, restoredScatterTabId);

  // Data integrity: same row count as before save
  expect(
    afterReopen.rowCount,
    `scatter row count mismatch after reopen: got ${afterReopen.rowCount}, expected ${beforeSave.rowCount}`
  ).toBe(beforeSave.rowCount);

  expect(afterReopen.rowCount).toBeGreaterThanOrEqual(CSV_ROW_COUNT - 2);

  // First label must match (proves the data payload was saved/restored, not just row count)
  if (beforeSave.firstDataLabel) {
    expect(afterReopen.firstDataLabel).toBe(beforeSave.firstDataLabel);
  }

  // Must render in some mode after restore (same mode as before save)
  expect(afterReopen.renderMode, 'scatter did not render after reopen').toBeTruthy();
  if (beforeSave.renderMode && beforeSave.renderMode.startsWith('canvas')) {
    expect(afterReopen.renderMode, 'scatter did not restore to canvas render mode').toMatch(/^canvas/);
    expect(afterReopen.canvasCount).toBeGreaterThan(0);
  }

  // Preview must not be a placeholder — this is the key indicator that the render cache
  // survived the save cycle and the preview was correctly captured from real render output.
  expect(
    afterReopen.previewIsPlaceholder,
    'scatter preview is still a placeholder after reopen'
  ).toBe(false);
  expect(
    afterReopen.previewMarkupLength,
    'scatter preview markup is empty after reopen'
  ).toBeGreaterThan(500);

  // Mode-specific preview content check:
  // Canvas mode (≥12000 pts): preview has data-preview-canvas-bitmap
  // Batched-circles/markers (< 12000 pts): preview has data-preview-canvas-simplified
  const previewHasRealContent = afterReopen.previewHasCanvasBitmap || afterReopen.previewHasCanvasSimplified;
  expect(
    previewHasRealContent,
    `scatter preview has neither canvas-bitmap nor canvas-simplified marker — preview was not built from real render output. previewMarkupLength=${afterReopen.previewMarkupLength}`
  ).toBe(true);

  // ── Step 9: Verify box tab still renders ───────────────────────────────────
  const restoredBoxTabId = await page.evaluate(() => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return (tabs.find(t => t && t.type === 'box' && !t.isWelcome) || {}).id || null;
  });
  expect(restoredBoxTabId, 'box tab not found after reopen').toBeTruthy();

  await activateTab(page, restoredBoxTabId);
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#boxPlot svg')).toBeVisible({ timeout: 40_000 });

  // No JS errors throughout
  expect(issues.critical).toEqual([]);
});

test('scatter render cache is not destroyed by async stats callback after warmup', async ({ page }) => {
  // Regression guard for the root-cause race: after warmTabRenderCaches captures scatter's
  // render cache, an async scatter-stats-computed callback must NOT clear that cache by calling
  // persistUserModifiedTabState → NON-SKIP drift path → clearTabRenderCache.
  // Fix: persistActiveTabState now uses preserveRuntimeCacheOnPayloadChange = !captureRenderCache && !!tab.renderCache
  test.setTimeout(300_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await page.setInputFiles('#scatterFile', CSV_PATH);
  await waitForScatterRender(page);

  const scatterTabId = await page.evaluate(() =>
    window.Main?.session?.workspaceState?.activeTabId || null
  );
  expect(scatterTabId).toBeTruthy();

  // Open box tab (box becomes active; scatter is now inactive)
  const boxTabId = await openNewTabType(page, 'box');
  expect(boxTabId).toBeTruthy();
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');
  await page.waitForTimeout(800);
  await page.waitForFunction(() => !!document.querySelector('#boxPlot svg'), null, { timeout: 60_000 });

  // Trigger warmup explicitly. warmTabRenderCaches will:
  //   1. Activate scatter, wait for isIdleForSnapshot() (statsComputationPending = false)
  //   2. Capture scatter's render cache via persistActiveTabState(captureRenderCache: true)
  //   3. Return to box (the final active tab)
  // After warmup, the async stats-result callback may still be pending in the event loop.
  // It fires after warmup releases the event loop and calls persistUserModifiedTabState.
  // Our fix must prevent that callback from clearing the render cache.
  await page.evaluate(async () => {
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    if (!tabsApi || typeof tabsApi.getSessionActionsContext !== 'function') {
      throw new Error('tabs.getSessionActionsContext unavailable');
    }
    if (!sessionActions || typeof sessionActions.warmTabRenderCaches !== 'function') {
      throw new Error('sessionActions.warmTabRenderCaches unavailable');
    }
    const context = tabsApi.getSessionActionsContext();
    await sessionActions.warmTabRenderCaches(context, { reason: 'e2e-explicit-warmup-race-test' });
  });

  // Allow time for the async stats-result callback to fire and be processed.
  // If the fix works, the render cache survives this window.
  await page.waitForTimeout(4_000);

  // Scatter render cache must still be present after stats callback
  const cacheState = await page.evaluate((id) => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    const tab = tabs.find(t => t && t.id === id) || null;
    return {
      hasRenderCache: !!(tab && tab.renderCache && tab.renderCache.cache),
      promotedFromArchive: !!(tab && tab.renderCache && tab.renderCache.promotedFromArchive),
      renderCacheType: tab?.renderCache?.__graphitixRenderCache?.type || tab?.renderCache?.type || null
    };
  }, scatterTabId);

  expect(
    cacheState.hasRenderCache,
    'scatter render cache was cleared after async stats callback — preserve-on-drift fix may have regressed'
  ).toBe(true);

  // The render cache should be a live capture (not archive-promoted)
  // since we just created this workspace from scratch
  expect(cacheState.promotedFromArchive).toBe(false);

  expect(issues.critical).toEqual([]);
});
