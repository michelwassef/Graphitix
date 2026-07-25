const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

const LARGE_VALUES_CSV = path.resolve(__dirname, '..', '__tests__', 'test-scatter-medium.csv');

async function readHeatmapLayout(page) {
  return page.evaluate(() => {
    const bounds = selector => {
      const rect = document.querySelector(selector)?.getBoundingClientRect?.();
      return rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null;
    };
    return {
      matrix: bounds('#heatmapSvg [data-heatmap-cell-hit-layer="1"]')
        || bounds('#heatmapSvg [data-export-layer="heatmap-cells"]'),
      rowDendrogram: bounds('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"]'),
      columnDendrogram: bounds('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="horizontal"]'),
      scale: bounds('#heatmapSvg [data-heatmap-color-scale-bar="1"]')
    };
  });
}

test('large Data-values heatmap stays responsive and completes exact clustering', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true, loadExample: true }
  );
  await page.waitForFunction(() => !!window.Components?.heatmap?.ready);
  await page.locator('#heatmapView').selectOption('values');
  await page.waitForFunction(() => (
    document.getElementById('heatmapSvg')?.dataset?.heatmapModelType === 'values'
      && !!document.querySelector('#heatmapSvg [data-export-layer="heatmap-cells"]')
      && !!document.querySelector('#heatmapSvg .heatmap-color-scale')
  ));
  const smallLayout = await readHeatmapLayout(page);
  await page.locator('#heatmapFile').evaluate(input => {
    input.dataset.importOptionsConfirmed = 'true';
  });

  await page.evaluate(() => {
    window.__heatmapOriginalNextFrame = window.Shared.jobs.nextFrame;
    window.__heatmapRenderCheckpointReached = false;
    window.Shared.jobs.nextFrame = () => {
      window.__heatmapRenderCheckpointReached = true;
      return new Promise(resolve => window.setTimeout(resolve, 750));
    };
  });
  await page.locator('#heatmapFile').setInputFiles(LARGE_VALUES_CSV);
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#heatmapGraphPanel .venn-loading-overlay:not([hidden])');
    const workerRecords = window.Components?.heatmap?.__testHooks?.getWorkerRecords?.() || [];
    return !!overlay
      && window.__heatmapRenderCheckpointReached === true
      && workerRecords.some(record => record.itemCount === 7358 && record.status === 'done');
  }, null, { timeout: 60_000 });
  await page.evaluate(() => {
    const probe = { last: performance.now(), maxGapMs: 0, ticks: 0 };
    window.__heatmapResponsivenessProbe = probe;
    window.__heatmapResponsivenessTimer = window.setInterval(() => {
      const current = performance.now();
      probe.maxGapMs = Math.max(probe.maxGapMs, current - probe.last);
      probe.last = current;
      probe.ticks += 1;
    }, 25);
  });
  const initialStop = page.locator('#heatmapGraphPanel [data-overlay-action="cancel"]');
  await initialStop.click();
  await page.waitForFunction(() => (
    document.querySelector('#heatmapGraphPanel .venn-loading-overlay')?.dataset?.jobStatus === 'cancelled'
  ));
  await page.evaluate(() => {
    if(window.__heatmapOriginalNextFrame){
      window.Shared.jobs.nextFrame = window.__heatmapOriginalNextFrame;
    }
    delete window.__heatmapOriginalNextFrame;
  });
  await page.locator('#heatmapGraphPanel [data-overlay-action="retry"]').click();
  const retryOverlay = page.locator('#heatmapGraphPanel .venn-loading-overlay');
  await expect(retryOverlay).toHaveAttribute('data-job-status', 'running');
  await expect(retryOverlay.locator('.venn-loading-overlay__spinner')).toBeVisible();
  await expect(retryOverlay).toContainText('Rendering heatmap...');
  await page.waitForFunction(() => {
    const svg = document.getElementById('heatmapSvg');
    const overlay = document.querySelector('#heatmapGraphPanel .venn-loading-overlay:not([hidden])');
    const workerRecords = window.Components?.heatmap?.__testHooks?.getWorkerRecords?.() || [];
    return svg?.dataset?.heatmapModelType === 'values'
      && !overlay
      && window.Components?.heatmap?.__getState?.()?.lastStats?.rowCount === 7358
      && workerRecords.some(record => record.itemCount === 7358 && record.status === 'done');
  }, null, { timeout: 90_000 });

  const metrics = await page.evaluate(() => {
    window.clearInterval(window.__heatmapResponsivenessTimer);
    const heatmap = window.Components.heatmap;
    const state = heatmap.__getState();
    const sourceSvg = document.getElementById('heatmapSvg');
    const previewSvg = heatmap.__testHooks?.buildPreviewSvgFromSource?.(sourceSvg) || null;
    const exportSvg = heatmap.__testHooks?.buildExportSvgFromSource?.(sourceSvg) || null;
    return {
      responsiveness: window.__heatmapResponsivenessProbe,
      performance: heatmap.__testHooks?.getPerformance?.()?.performance || null,
      workerRecords: heatmap.__testHooks?.getWorkerRecords?.() || [],
      rows: state.lastStats?.rowCount || 0,
      columns: state.lastStats?.columnCount || 0,
      rowLabels: document.querySelectorAll('#heatmapSvg text[data-font-role="rowLabel"]').length,
      columnLabels: document.querySelectorAll('#heatmapSvg text[data-font-role="columnLabel"]').length,
      sourceRowLabels: Number(document.getElementById('heatmapSvg')?.dataset?.heatmapRowLabelCount || 0),
      renderedRowLabels: Number(document.getElementById('heatmapSvg')?.dataset?.heatmapRenderedRowLabelCount || 0),
      renderedColumnLabels: Number(document.getElementById('heatmapSvg')?.dataset?.heatmapRenderedColumnLabelCount || 0),
      sceneMode: document.getElementById('heatmapSvg')?.dataset?.heatmapSceneMode || null,
      sceneWidth: Number(document.getElementById('heatmapSvg')?.dataset?.heatmapSceneWidth || 0),
      sceneHeight: Number(document.getElementById('heatmapSvg')?.dataset?.heatmapSceneHeight || 0),
      viewBox: (() => {
        const box = document.getElementById('heatmapSvg')?.viewBox?.baseVal;
        return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null;
      })(),
      cellRects: document.querySelectorAll('#heatmapSvg [data-layer="cells"] rect').length,
      cellCanvases: document.querySelectorAll('#heatmapSvg [data-layer="cells"] canvas').length,
      cellRenderMode: document.querySelector('#heatmapSvg [data-export-layer="heatmap-cells"]')?.getAttribute('data-render-mode') || null,
      canvasRevision: Number(document.getElementById('heatmapSvg')?.dataset?.heatmapCanvasRevision || 0),
      canvasBitmapWidth: document.querySelector('#heatmapSvg [data-layer="cells"] canvas')?.width || 0,
      canvasBitmapHeight: document.querySelector('#heatmapSvg [data-layer="cells"] canvas')?.height || 0,
      rowDendrograms: document.querySelectorAll('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"]').length,
      columnDendrograms: document.querySelectorAll('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="horizontal"]').length,
      rowDendrogramPaths: document.querySelectorAll('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"] path').length,
      columnDendrogramPaths: document.querySelectorAll('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="horizontal"] path').length,
      rowDendrogramBranches: Number(document.querySelector('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"]')?.getAttribute('data-dendrogram-branch-count') || 0),
      rowDendrogramSegments: Number(document.querySelector('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"]')?.getAttribute('data-dendrogram-segment-count') || 0),
      rowDendrogramRawSegments: Number(document.querySelector('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"]')?.getAttribute('data-dendrogram-raw-segment-count') || 0),
      rowDendrogramInversions: Number(document.querySelector('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"]')?.getAttribute('data-dendrogram-inversion-count') || 0),
      rowDendrogramPathLength: document.querySelector('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"] path')?.getAttribute('d')?.length || 0,
      denseLabelDeferredRegistrations: Array.from(document.querySelectorAll('#heatmapSvg [data-layer="row-labels"] > text, #heatmapSvg [data-layer="column-labels"] > text'))
        .filter(node => window.Shared?.fontControls?.isTextRegistrationDeferred?.(node)).length,
      denseLabelScopeAttrs: document.querySelectorAll('#heatmapSvg [data-layer="row-labels"] > text[data-font-scope], #heatmapSvg [data-layer="column-labels"] > text[data-font-scope]').length,
      denseLabelTabAttrs: document.querySelectorAll('#heatmapSvg [data-layer="row-labels"] > text[data-font-tab-id], #heatmapSvg [data-layer="column-labels"] > text[data-font-tab-id]').length,
      denseLabelSourceIndexAttrs: document.querySelectorAll('#heatmapSvg [data-layer="row-labels"] > text[data-heatmap-source-index], #heatmapSvg [data-layer="column-labels"] > text[data-heatmap-source-index]').length,
      denseLabelBaseTransformAttrs: document.querySelectorAll('#heatmapSvg [data-layer="row-labels"] > text[data-heatmap-base-transform], #heatmapSvg [data-layer="column-labels"] > text[data-heatmap-base-transform]').length,
      denseLabelFontSizeAttrs: document.querySelectorAll('#heatmapSvg [data-layer="row-labels"] > text[font-size], #heatmapSvg [data-layer="column-labels"] > text[font-size]').length,
      liveSvgMarkupLength: document.getElementById('heatmapSvg')?.outerHTML?.length || 0,
      columnDendrogramBranches: Number(document.querySelector('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="horizontal"]')?.getAttribute('data-dendrogram-branch-count') || 0),
      canvasInsideDendrogramOrScale: document.querySelectorAll('#heatmapSvg .heatmap-dendrogram canvas, #heatmapSvg .heatmap-color-scale canvas, #heatmapSvg .heatmap-dendrogram foreignObject, #heatmapSvg .heatmap-color-scale foreignObject').length,
      scaleVectorOverlay: document.querySelector('#heatmapSvg .heatmap-color-scale')?.getAttribute('data-heatmap-vector-overlay') || null,
      scaleStops: document.querySelectorAll('#heatmapSvg .heatmap-color-scale rect').length
        ? document.querySelectorAll('#heatmapSvg linearGradient stop').length
        : 0,
      scaleWidth: document.querySelector('#heatmapSvg .heatmap-color-scale rect')?.getBoundingClientRect?.().width || 0,
      previewProjection: previewSvg?.getAttribute?.('data-heatmap-preview-projection') || null,
      previewOwnerTabId: previewSvg?.getAttribute?.('data-workspace-tab-id') || null,
      activeTabId: window.Main?.session?.workspaceState?.activeTabId || null,
      rowLabelVisualHeight: document.querySelector('#heatmapSvg [data-layer="row-labels"] > text')?.getBoundingClientRect?.().height || 0,
      rowLabelTransform: document.querySelector('#heatmapSvg [data-layer="row-labels"] > text')?.getAttribute?.('transform') || '',
      rowLabelScaleY: (() => {
        const transform = document.querySelector('#heatmapSvg [data-layer="row-labels"] > text')?.getAttribute?.('transform') || '';
        const match = transform.match(/^matrix\([^,]+,[^,]+,[^,]+,([^,]+),/i);
        return match ? Number(match[1]) : NaN;
      })(),
      labelProjection: sourceSvg?.getAttribute?.('data-heatmap-label-projection') || null,
      previewRowLabels: previewSvg?.querySelectorAll?.('[data-layer="row-labels"] > text')?.length || 0,
      previewColumnLabels: previewSvg?.querySelectorAll?.('[data-layer="column-labels"] > text')?.length || 0,
      previewOverlayBitmaps: previewSvg?.querySelectorAll?.('[data-heatmap-preview-overlay-bitmap]')?.length || 0,
      previewInteractionLayers: previewSvg?.querySelectorAll?.('[data-dendrogram-control="1"], [data-heatmap-cell-hit-layer="1"]')?.length || 0,
      previewRemovedDendrogramBranches: Number(previewSvg?.getAttribute?.('data-heatmap-preview-removed-dendrogram-branches') || 0),
      previewDendrogramBranches: Number(previewSvg?.querySelector?.('.heatmap-dendrogram[data-dendrogram-orientation="vertical"] path')?.getAttribute?.('data-preview-branch-count') || 0),
      previewMarkupLength: previewSvg?.outerHTML?.length || 0,
      exportProjection: exportSvg?.getAttribute?.('data-heatmap-export-projection') || null,
      exportRowLabels: exportSvg?.querySelectorAll?.('[data-layer="row-labels"] > text')?.length || 0,
      exportColumnLabels: exportSvg?.querySelectorAll?.('[data-layer="column-labels"] > text')?.length || 0,
      exportRowLabelTransform: exportSvg?.querySelector?.('[data-layer="row-labels"] > text')?.getAttribute?.('transform') || '',
      exportColumnLabelTransform: exportSvg?.querySelector?.('[data-layer="column-labels"] > text')?.getAttribute?.('transform') || '',
      exportCanvasNodes: exportSvg?.querySelectorAll?.('canvas, foreignObject')?.length || 0,
      exportRasterImages: exportSvg?.querySelectorAll?.('[data-heatmap-raster-export="1"]')?.length || 0,
      exportVectorCellCount: Number(exportSvg?.querySelector?.('[data-export-layer="heatmap-cells"]')?.getAttribute?.('data-heatmap-vector-cell-count') || 0),
      exportVectorBuckets: exportSvg?.querySelectorAll?.('[data-heatmap-vector-cell-bucket="1"]')?.length || 0
    };
  });
  const largeLayout = await readHeatmapLayout(page);
  await testInfo.attach('heatmap-large-values-metrics.json', {
    body: JSON.stringify(metrics, null, 2),
    contentType: 'application/json'
  });
  expect(metrics.rows).toBe(7358);
  expect(metrics.columns).toBe(3);
  expect(metrics.workerRecords).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'done', itemCount: 7358 })
  ]));
  expect(metrics.workerRecords.find(record => record.itemCount === 7358)?.algorithm).toBe('average-correlation-vector');
  expect(metrics.sourceRowLabels).toBe(7358);
  expect(metrics.rowLabels).toBe(metrics.renderedRowLabels);
  expect(metrics.rowLabels).toBeGreaterThan(1);
  expect(metrics.rowLabels).toBeLessThan(metrics.sourceRowLabels);
  expect(metrics.rowLabels).toBeLessThanOrEqual(160);
  expect(metrics.columnLabels).toBe(metrics.renderedColumnLabels);
  expect(metrics.columnLabels).toBe(3);
  expect(metrics.sceneMode).toBe('normalized-canvas');
  expect(metrics.viewBox).toBeTruthy();
  expect(Math.abs(metrics.viewBox.x)).toBeLessThan(0.01);
  expect(Math.abs(metrics.viewBox.y)).toBeLessThan(0.01);
  expect(Math.abs(metrics.viewBox.width - metrics.sceneWidth)).toBeLessThan(0.01);
  expect(Math.abs(metrics.viewBox.height - metrics.sceneHeight)).toBeLessThan(0.01);
  expect(metrics.cellRenderMode).toBe('canvas');
  expect(metrics.cellCanvases).toBe(1);
  expect(metrics.cellRects).toBeLessThanOrEqual(1);
  expect(metrics.canvasRevision).toBeGreaterThan(0);
  expect(metrics.canvasBitmapWidth).toBeGreaterThan(1);
  expect(metrics.canvasBitmapHeight).toBeGreaterThan(1);
  expect(metrics.rowDendrograms).toBe(1);
  expect(metrics.columnDendrograms).toBe(1);
  expect(metrics.rowDendrogramPaths).toBe(1);
  expect(metrics.columnDendrogramPaths).toBe(1);
  expect(metrics.rowDendrogramBranches).toBe(7357);
  expect(metrics.rowDendrogramSegments).toBeGreaterThan(1);
  expect(metrics.rowDendrogramSegments).toBeLessThanOrEqual(metrics.rowDendrogramRawSegments);
  expect(metrics.rowDendrogramPathLength).toBeGreaterThan(100);
  expect(metrics.rowDendrogramPathLength).toBeLessThan(650000);
  expect(metrics.denseLabelDeferredRegistrations).toBe(metrics.rowLabels + metrics.columnLabels);
  expect(metrics.denseLabelScopeAttrs).toBe(0);
  expect(metrics.denseLabelTabAttrs).toBe(0);
  expect(metrics.denseLabelSourceIndexAttrs).toBe(metrics.rowLabels + metrics.columnLabels);
  expect(metrics.denseLabelBaseTransformAttrs).toBe(0);
  expect(metrics.denseLabelFontSizeAttrs).toBeLessThanOrEqual(metrics.columnLabels);
  expect(metrics.liveSvgMarkupLength).toBeLessThan(1800000);
  expect(metrics.columnDendrogramBranches).toBe(2);
  expect(metrics.canvasInsideDendrogramOrScale).toBe(0);
  expect(metrics.scaleVectorOverlay).toBe('1');
  expect(metrics.scaleStops).toBeGreaterThan(1);
  expect(metrics.scaleWidth).toBeGreaterThan(2);
  expect(metrics.scaleWidth).toBeLessThan(80);
  expect(metrics.labelProjection).toBe('pixel-sampled');
  expect(metrics.previewProjection).toBe('canvas-sampled');
  expect(metrics.previewOwnerTabId).toBe(metrics.activeTabId);
  expect(metrics.rowLabelVisualHeight).toBeLessThanOrEqual(2);
  expect(metrics.rowLabelTransform).toContain('matrix(');
  expect(metrics.rowLabelScaleY).toBeGreaterThan(0);
  expect(metrics.rowLabelScaleY).toBeLessThan(0.002);
  expect(metrics.previewRowLabels).toBeGreaterThan(1);
  expect(metrics.previewRowLabels).toBeLessThanOrEqual(24);
  expect(metrics.previewColumnLabels).toBeLessThanOrEqual(24);
  expect(metrics.previewOverlayBitmaps).toBe(0);
  expect(metrics.previewInteractionLayers).toBe(0);
  expect(metrics.previewRemovedDendrogramBranches).toBeGreaterThan(0);
  expect(metrics.previewDendrogramBranches).toBeGreaterThan(1);
  expect(metrics.previewDendrogramBranches).toBeLessThanOrEqual(320);
  expect(metrics.previewMarkupLength).toBeLessThan(220000);
  expect(metrics.exportProjection).toBe('vector-matrix');
  expect(metrics.exportRowLabels).toBe(metrics.sourceRowLabels);
  expect(metrics.exportColumnLabels).toBe(metrics.columns);
  expect(metrics.exportRowLabelTransform).toContain('matrix(');
  expect(metrics.exportColumnLabelTransform).toContain('matrix(');
  expect(metrics.exportColumnLabelTransform).toContain('rotate(-90');
  expect(metrics.exportCanvasNodes).toBe(0);
  expect(metrics.exportRasterImages).toBe(0);
  expect(metrics.exportVectorCellCount).toBe(metrics.rows * metrics.columns);
  expect(metrics.exportVectorBuckets).toBeGreaterThan(0);
  expect(smallLayout.rowDendrogram).toBeTruthy();
  expect(smallLayout.columnDendrogram).toBeTruthy();
  expect(smallLayout.scale).toBeTruthy();
  expect(largeLayout.matrix.width).toBeGreaterThan(40);
  expect(largeLayout.matrix.height).toBeGreaterThan(60);
  expect(largeLayout.rowDendrogram.width).toBeGreaterThan(20);
  expect(largeLayout.columnDendrogram.height).toBeGreaterThan(20);
  expect(largeLayout.rowDendrogram.left).toBeGreaterThanOrEqual(largeLayout.matrix.right - 2);
  expect(largeLayout.scale.left).toBeGreaterThan(largeLayout.rowDendrogram.right);
  expect(largeLayout.columnDendrogram.top).toBeGreaterThanOrEqual(largeLayout.matrix.bottom - 2);
  expect(largeLayout.columnDendrogram.left).toBeGreaterThanOrEqual(largeLayout.matrix.left);
  expect(largeLayout.columnDendrogram.right).toBeLessThanOrEqual(largeLayout.matrix.right);
  expect(Math.abs(largeLayout.scale.top - largeLayout.matrix.top)).toBeLessThan(3);
  expect(Math.abs(largeLayout.scale.bottom - largeLayout.matrix.bottom)).toBeLessThan(3);
  expect(metrics.responsiveness.ticks).toBeGreaterThan(2);
  expect(metrics.responsiveness.maxGapMs).toBeLessThan(1500);

  const resizeBefore = await page.evaluate(() => {
    const svg = document.getElementById('heatmapSvg');
    const canvas = svg?.querySelector('[data-export-layer="heatmap-cells"] canvas') || null;
    const rowLabel = svg?.querySelector('[data-layer="row-labels"] > text') || null;
    const scale = svg?.querySelector('.heatmap-color-scale') || null;
    const title = svg?.querySelector('text[data-font-role="graphTitle"]') || null;
    const matrix = svg?.querySelector('[data-heatmap-cell-hit-layer="1"]') || null;
    window.__heatmapHeavyResizeCanvas = canvas;
    window.__heatmapHeavyResizeRowLabel = rowLabel;
    window.__heatmapHeavyResizeScale = scale;
    const canvasRect = canvas?.getBoundingClientRect?.() || null;
    const matrixRect = matrix?.getBoundingClientRect?.() || null;
    const scaleRect = scale?.getBoundingClientRect?.() || null;
    const titleRect = title?.getBoundingClientRect?.() || null;
    return {
      revision: Number(svg?.dataset?.heatmapCanvasRevision || 0),
      titleWidth: titleRect?.width || 0,
      titleHeight: titleRect?.height || 0,
      width: canvasRect?.width || 0,
      height: canvasRect?.height || 0,
      matrixWidth: matrixRect?.width || 0,
      scaleLeft: scaleRect?.left || 0
    };
  });
  const handle = page.locator('#heatmapGraphPanel .svgbox .resizer-vertical').first();
  await expect(handle).toBeVisible();
  const handleBox = await handle.boundingBox();
  expect(handleBox).toBeTruthy();
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 90, startY, { steps: 12 });
  await page.waitForTimeout(80);
  const resizeDuring = await page.evaluate(() => {
    const svg = document.getElementById('heatmapSvg');
    const canvas = svg?.querySelector('[data-export-layer="heatmap-cells"] canvas') || null;
    const rowLabel = svg?.querySelector('[data-layer="row-labels"] > text') || null;
    const scale = svg?.querySelector('.heatmap-color-scale') || null;
    const title = svg?.querySelector('text[data-font-role="graphTitle"]') || null;
    const matrix = svg?.querySelector('[data-heatmap-cell-hit-layer="1"]') || null;
    const canvasRect = canvas?.getBoundingClientRect?.() || null;
    const matrixRect = matrix?.getBoundingClientRect?.() || null;
    const scaleRect = scale?.getBoundingClientRect?.() || null;
    const titleRect = title?.getBoundingClientRect?.() || null;
    return {
      sameCanvas: canvas === window.__heatmapHeavyResizeCanvas,
      titleWidth: titleRect?.width || 0,
      titleHeight: titleRect?.height || 0,
      sameRowLabel: rowLabel === window.__heatmapHeavyResizeRowLabel,
      sameScale: scale === window.__heatmapHeavyResizeScale,
      resizeActive: svg?.closest('.svgbox')?.dataset?.heatmapResizeActive === 'true',
      liveProjection: svg?.dataset?.heatmapLiveResizeProjection === 'true',
      reuseActive: svg?.dataset?.heatmapCanvasResizeReuse === 'true',
      layerReuse: svg?.querySelector('[data-export-layer="heatmap-cells"]')?.getAttribute('data-resize-reused') === 'true',
      revision: Number(svg?.dataset?.heatmapCanvasRevision || 0),
      width: canvasRect?.width || 0,
      height: canvasRect?.height || 0,
      matrixWidth: matrixRect?.width || 0,
      scaleLeft: scaleRect?.left || 0
    };
  });
  expect(resizeDuring.sameCanvas).toBe(true);
  expect(resizeDuring.sameRowLabel).toBe(true);
  expect(resizeDuring.sameScale).toBe(true);
  expect(resizeDuring.resizeActive).toBe(true);
  expect(resizeDuring.liveProjection).toBe(true);
  expect(resizeDuring.reuseActive).toBe(true);
  expect(resizeDuring.layerReuse).toBe(true);
  expect(resizeDuring.revision).toBe(resizeBefore.revision);
  expect(Math.abs(resizeDuring.width - resizeBefore.width)).toBeGreaterThan(5);
  expect(Math.abs(resizeDuring.matrixWidth - resizeBefore.matrixWidth)).toBeGreaterThan(5);
  expect(Math.abs(resizeDuring.scaleLeft - resizeBefore.scaleLeft)).toBeGreaterThan(5);
  expect(Math.abs(resizeDuring.titleWidth - resizeBefore.titleWidth)).toBeLessThan(1.5);
  expect(Math.abs(resizeDuring.titleHeight - resizeBefore.titleHeight)).toBeLessThan(1.5);

  await page.mouse.up();
  await page.waitForFunction(previousRevision => {
    const svg = document.getElementById('heatmapSvg');
    const canvas = svg?.querySelector('[data-export-layer="heatmap-cells"] canvas') || null;
    return Number(svg?.dataset?.heatmapCanvasRevision || 0) > previousRevision
      && svg?.dataset?.heatmapCanvasResizeReuse !== 'true'
      && canvas !== window.__heatmapHeavyResizeCanvas;
  }, resizeBefore.revision, { timeout: 30_000 });
  const resizeAfter = await page.evaluate(() => {
    const svg = document.getElementById('heatmapSvg');
    const canvas = svg?.querySelector('[data-export-layer="heatmap-cells"] canvas') || null;
    const rowLabel = svg?.querySelector('[data-layer="row-labels"] > text') || null;
    return {
      newCanvas: canvas !== window.__heatmapHeavyResizeCanvas,
      newRowLabelProjection: rowLabel !== window.__heatmapHeavyResizeRowLabel,
      resizeActive: svg?.closest('.svgbox')?.dataset?.heatmapResizeActive === 'true',
      liveProjection: svg?.dataset?.heatmapLiveResizeProjection === 'true',
      reuseActive: svg?.dataset?.heatmapCanvasResizeReuse === 'true',
      revision: Number(svg?.dataset?.heatmapCanvasRevision || 0),
      draw: window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw || null
    };
  });
  expect(resizeAfter.newCanvas).toBe(true);
  expect(resizeAfter.newRowLabelProjection).toBe(true);
  expect(resizeAfter.resizeActive).toBe(false);
  expect(resizeAfter.liveProjection).toBe(false);
  expect(resizeAfter.reuseActive).toBe(false);
  expect(resizeAfter.revision).toBeGreaterThan(resizeBefore.revision);
  expect(resizeAfter.draw?.viewOnly).toBe(true);
  expect(issues.critical).toEqual([]);
});
