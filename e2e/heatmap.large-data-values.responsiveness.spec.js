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
  test.setTimeout(120_000);
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

  await page.locator('#heatmapFile').setInputFiles(LARGE_VALUES_CSV);
  await page.waitForFunction(() => {
    const overlay = document.querySelector('#heatmapGraphPanel .venn-loading-overlay:not([hidden])');
    const workerRecords = window.Components?.heatmap?.__testHooks?.getWorkerRecords?.() || [];
    return !!overlay
      && workerRecords.some(record => record.itemCount === 7358 && record.status === 'pending');
  }, null, { timeout: 30_000 });
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
    return {
      responsiveness: window.__heatmapResponsivenessProbe,
      performance: heatmap.__testHooks?.getPerformance?.()?.performance || null,
      workerRecords: heatmap.__testHooks?.getWorkerRecords?.() || [],
      rows: state.lastStats?.rowCount || 0,
      columns: state.lastStats?.columnCount || 0,
      rowLabels: document.querySelectorAll('#heatmapSvg text[data-font-role="rowLabel"]').length,
      sourceRowLabels: Number(document.getElementById('heatmapSvg')?.dataset?.heatmapRowLabelCount || 0),
      cellRects: document.querySelectorAll('#heatmapSvg [data-layer="cells"] rect').length,
      cellCanvases: document.querySelectorAll('#heatmapSvg [data-layer="cells"] canvas').length,
      rowDendrograms: document.querySelectorAll('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"]').length,
      columnDendrograms: document.querySelectorAll('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="horizontal"]').length,
      rowDendrogramPaths: document.querySelectorAll('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="vertical"] path').length,
      columnDendrogramPaths: document.querySelectorAll('#heatmapSvg .heatmap-dendrogram[data-dendrogram-orientation="horizontal"] path').length,
      scaleStops: document.querySelectorAll('#heatmapSvg .heatmap-color-scale rect').length
        ? document.querySelectorAll('#heatmapSvg linearGradient stop').length
        : 0,
      scaleWidth: document.querySelector('#heatmapSvg .heatmap-color-scale rect')?.getBoundingClientRect?.().width || 0
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
  expect(metrics.rowLabels).toBe(7358);
  expect(metrics.cellCanvases).toBe(0);
  expect(metrics.cellRects).toBe(7358 * 3);
  expect(metrics.rowDendrograms).toBe(1);
  expect(metrics.columnDendrograms).toBe(1);
  expect(metrics.rowDendrogramPaths).toBe(7357);
  expect(metrics.columnDendrogramPaths).toBe(2);
  expect(metrics.scaleStops).toBeGreaterThan(1);
  expect(metrics.scaleWidth).toBeGreaterThan(2);
  expect(metrics.scaleWidth).toBeLessThan(80);
  expect(smallLayout.rowDendrogram).toBeTruthy();
  expect(smallLayout.columnDendrogram).toBeTruthy();
  expect(smallLayout.scale).toBeTruthy();
  expect(largeLayout.rowDendrogram.left).toBeGreaterThanOrEqual(largeLayout.matrix.right - 2);
  expect(largeLayout.scale.left).toBeGreaterThan(largeLayout.rowDendrogram.right);
  expect(largeLayout.columnDendrogram.top).toBeGreaterThanOrEqual(largeLayout.matrix.bottom - 2);
  expect(largeLayout.columnDendrogram.left).toBeGreaterThanOrEqual(largeLayout.matrix.left);
  expect(largeLayout.columnDendrogram.right).toBeLessThanOrEqual(largeLayout.matrix.right);
  expect(Math.abs(largeLayout.scale.top - largeLayout.matrix.top)).toBeLessThan(3);
  expect(Math.abs(largeLayout.scale.bottom - largeLayout.matrix.bottom)).toBeLessThan(3);
  expect(metrics.responsiveness.ticks).toBeGreaterThan(2);
  expect(metrics.responsiveness.maxGapMs).toBeLessThan(1500);
  expect(issues.critical).toEqual([]);
});
