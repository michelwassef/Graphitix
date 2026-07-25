const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

const LARGE_VALUES_CSV = path.resolve(__dirname, '..', '__tests__', 'test-scatter-medium.csv');

async function activeTabId(page) {
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

async function switchToTab(page, tabId) {
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click();
  await page.waitForFunction(expected => (
    window.Main?.session?.workspaceState?.activeTabId === expected
      && document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg')?.dataset?.fontTabId === expected
  ), tabId);
}

async function captureActiveSignature(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    const matrix = svg?.querySelector('[data-heatmap-cell-hit-layer="1"]')?.getBoundingClientRect?.() || null;
    const title = svg?.querySelector('text[data-font-role="graphTitle"]')?.getBoundingClientRect?.() || null;
    const rowLabel = svg?.querySelector('[data-layer="row-labels"] > text') || null;
    return {
      activeTabId: window.Main?.session?.workspaceState?.activeTabId || null,
      ownerTabId: svg?.dataset?.fontTabId || null,
      sceneMode: svg?.dataset?.heatmapSceneMode || null,
      viewBox: svg?.getAttribute?.('viewBox') || null,
      rowCount: Number(svg?.dataset?.heatmapRenderedRowLabelCount || 0),
      sourceRowCount: Number(svg?.dataset?.heatmapRowLabelCount || 0),
      columnCount: Number(svg?.dataset?.heatmapRenderedColumnLabelCount || 0),
      canvasRevision: Number(svg?.dataset?.heatmapCanvasRevision || 0),
      matrix: matrix ? {
        width: Number(matrix.width.toFixed(3)),
        height: Number(matrix.height.toFixed(3)),
        left: Number(matrix.left.toFixed(3)),
        top: Number(matrix.top.toFixed(3))
      } : null,
      title: title ? {
        width: Number(title.width.toFixed(3)),
        height: Number(title.height.toFixed(3))
      } : null,
      firstRowLabel: rowLabel?.textContent || null,
      firstRowTransform: rowLabel?.getAttribute?.('transform') || null,
      hasScale: !!svg?.querySelector('.heatmap-color-scale'),
      hasRowDendrogram: !!svg?.querySelector('.heatmap-dendrogram[data-dendrogram-orientation="vertical"]'),
      hasColumnDendrogram: !!svg?.querySelector('.heatmap-dendrogram[data-dendrogram-orientation="horizontal"]')
    };
  });
}

test('heavy and ordinary Heatmap tabs retain exact owner DOM, fonts, geometry, and previews', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true, loadExample: true }
  );
  await page.locator('#heatmapView').selectOption('values');
  await page.locator('#heatmapFile').evaluate(input => { input.dataset.importOptionsConfirmed = 'true'; });
  await page.locator('#heatmapFile').setInputFiles(LARGE_VALUES_CSV);
  await page.waitForFunction(() => {
    const svg = document.getElementById('heatmapSvg');
    return svg?.dataset?.heatmapSceneMode === 'normalized-canvas'
      && Number(svg?.dataset?.heatmapRowLabelCount || 0) === 7358
      && Number(svg?.dataset?.heatmapRenderedRowLabelCount || 0) > 1
      && Number(svg?.dataset?.heatmapRenderedRowLabelCount || 0) <= 160
      && !!svg.querySelector('[data-export-layer="heatmap-cells"] canvas');
  }, null, { timeout: 90_000 });
  const heavyTabId = await activeTabId(page);
  const heavyBefore = await captureActiveSignature(page);
  await page.evaluate(() => {
    const svg = document.getElementById('heatmapSvg');
    window.__heavyHeatmapSvg = svg;
    window.__heavyHeatmapCanvas = svg?.querySelector('[data-export-layer="heatmap-cells"] canvas') || null;
  });

  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: false }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await page.waitForFunction(() => {
    const svg = document.getElementById('heatmapSvg');
    return !!svg?.querySelector('[data-export-layer="heatmap-cells"]')
      && Number(svg?.dataset?.heatmapRenderedRowLabelCount || 0) > 0;
  });
  const ordinaryTabId = await activeTabId(page);
  expect(ordinaryTabId).not.toBe(heavyTabId);
  const ordinaryBefore = await captureActiveSignature(page);
  await page.evaluate(() => { window.__ordinaryHeatmapSvg = document.getElementById('heatmapSvg'); });

  const inactiveHeavyPreview = await page.evaluate(tabId => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find?.(entry => entry.id === tabId) || null;
    const preview = window.Components?.heatmap?.getPreviewSvg?.(tab) || null;
    window.Main?.previews?.updateTabPreviewFromWorkspace?.(
      tab,
      window.Main?.components?.registry?.heatmap,
      { reason: 'heatmap-heavy-isolation-test', forceCapture: true }
    );
    return {
      owner: preview?.getAttribute?.('data-workspace-tab-id') || null,
      source: preview?.getAttribute?.('data-preview-source') || null,
      projection: preview?.getAttribute?.('data-heatmap-preview-projection') || null,
      hasCanvas: !!preview?.querySelector?.('canvas'),
      storedIsPlaceholder: /data-preview-placeholder|Preview simplified|Large dataset/.test(String(tab?.previewMarkup || '')),
      storedHasBitmap: String(tab?.previewMarkup || '').includes('data-preview-canvas-bitmap'),
      storedCanvasBitmapMeta: tab?.previewMeta?.canvasBitmap === true
    };
  }, heavyTabId);
  expect(inactiveHeavyPreview).toEqual(expect.objectContaining({
    owner: heavyTabId,
    source: 'true',
    projection: 'canvas-sampled',
    hasCanvas: true,
    storedIsPlaceholder: false,
    storedHasBitmap: true,
    storedCanvasBitmapMeta: true
  }));

  await switchToTab(page, heavyTabId);
  const heavyAfter = await captureActiveSignature(page);
  const heavyIdentity = await page.evaluate(() => {
    const svg = document.getElementById('heatmapSvg');
    return {
      sameSvg: svg === window.__heavyHeatmapSvg,
      sameCanvas: svg?.querySelector('[data-export-layer="heatmap-cells"] canvas') === window.__heavyHeatmapCanvas
    };
  });
  expect(heavyIdentity).toEqual({ sameSvg: true, sameCanvas: true });
  expect(heavyAfter).toEqual(heavyBefore);

  await switchToTab(page, ordinaryTabId);
  const ordinaryAfter = await captureActiveSignature(page);
  const ordinaryIdentity = await page.evaluate(() => document.getElementById('heatmapSvg') === window.__ordinaryHeatmapSvg);
  expect(ordinaryIdentity).toBe(true);
  expect(ordinaryAfter).toEqual(ordinaryBefore);
  // Same-component activation must not throw from workspace DOM rebinding or
  // fall back to a second component.init() pass.
  expect(issues.critical).toEqual([]);
});
