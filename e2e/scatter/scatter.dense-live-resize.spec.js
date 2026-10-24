const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

test('dense Scatter keeps its plotted data visible during a continuous graph resize', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 640, height: 450 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true });

  await page.evaluate(() => {
    const scatter = window.Components?.scatter;
    const hot = scatter?.__ensureHotForActiveTab?.();
    if(!hot?.loadData || !scatter?.draw){
      throw new Error('Scatter table and draw APIs are unavailable');
    }
    const rows = [['Sample', 'X', 'Y']];
    for(let index = 0; index < 7001; index += 1){
      rows.push([`Sample ${index + 1}`, index + 1, Math.sin(index / 25)]);
    }
    hot.loadData(rows);
    scatter.draw({ reason: 'dense-scatter-live-resize-e2e', userInitiated: true });
  });
  await page.waitForFunction(() => {
    const layer = document.querySelector('#scatterPage:not([hidden]) #scatterPlot [data-layer="points"]');
    const state = window.Components?.scatter?.isIdleForSnapshot?.({ tabId: window.Main?.session?.workspaceState?.activeTabId });
    return !!layer && state === true && !['canvas-pending'].includes(layer.getAttribute('data-render-mode'));
  }, null, { timeout: 90_000 });
  const handle = page.locator('#scatterPage:not([hidden]) #scatterGraphPanel .svgbox .resizer-corner').first();
  await expect(handle).toBeVisible();
  await handle.scrollIntoViewIfNeeded();
  const bounds = await handle.boundingBox();
  expect(bounds).toBeTruthy();
  const startX = bounds.x + bounds.width / 2;
  const startY = bounds.y + bounds.height / 2;
  const dragDeltaX = -80;
  const dragDeltaY = -80;
  await page.evaluate(() => {
    window.__denseScatterResizeSamples = [];
    window.__denseScatterResizeSampling = true;
    const sample = () => {
      if(!window.__denseScatterResizeSampling){
        return;
      }
      const root = document.querySelector('#scatterPage:not([hidden]) #scatterPlot');
      const svg = root?.querySelector('svg');
      const svgBox = root?.closest('.svgbox');
      const layer = svg?.querySelector('[data-layer="points"]');
      const rect = svg?.getBoundingClientRect();
      const boxRect = svgBox?.getBoundingClientRect();
      const style = svg ? getComputedStyle(svg) : null;
      window.__denseScatterResizeSamples.push({
        frameTime: performance.now(),
        livePreview: svgBox?.dataset?.resizerLivePreview === 'true',
        svgPreviewTarget: svg?.dataset?.resizerLivePreviewTarget === 'true',
        visible: !!svg && !!rect && rect.width > 20 && rect.height > 20
          && style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
        renderMode: layer?.getAttribute('data-render-mode') || '',
        plottedMarks: layer?.querySelectorAll('circle, canvas, foreignObject, image').length || 0,
        svgWidth: rect?.width || 0,
        svgHeight: rect?.height || 0,
        svgBoxWidth: boxRect?.width || 0,
        svgBoxHeight: boxRect?.height || 0,
        svgCssWidth: style?.width || '',
        svgAttributeWidth: svg?.getAttribute('width') || '',
        viewBoxWidth: svg?.viewBox?.baseVal?.width || 0
      });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dragDeltaX, startY + dragDeltaY, { steps: 120 });
  const samples = await page.evaluate(() => {
    window.__denseScatterResizeSampling = false;
    return window.__denseScatterResizeSamples || [];
  });
  await page.mouse.up();
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 90_000 });
  await page.waitForFunction(() => {
    const svgBox = document.querySelector('#scatterPage:not([hidden]) #scatterPlot')?.closest('.svgbox');
    return !!svgBox && svgBox.dataset.resizerLivePreview !== 'true';
  });
  const settledGraph = await page.evaluate(() => {
    const plot = document.querySelector('#scatterPage:not([hidden]) #scatterPlot');
    const svgBox = plot?.closest('.svgbox');
    const svg = plot?.querySelector('svg');
    const layer = svg?.querySelector('[data-layer="points"]');
    const bounds = svg?.getBoundingClientRect();
    return {
      previewCleared: svgBox?.dataset?.resizerLivePreview !== 'true',
      visible: !!bounds && bounds.width > 20 && bounds.height > 20,
      svgHeight: svg?.getBoundingClientRect?.().height || 0,
      plottedMarks: layer?.querySelectorAll('circle, canvas, foreignObject, image').length || 0
    };
  });

  await testInfo.attach('dense-scatter-live-resize-frames.json', {
    body: Buffer.from(JSON.stringify(samples, null, 2), 'utf8'),
    contentType: 'application/json'
  });
  expect(samples.length).toBeGreaterThanOrEqual(6);
  const previewSamples = samples.filter(sample => sample.livePreview);
  expect(previewSamples.length / samples.length).toBeGreaterThan(0.5);
  expect(previewSamples.every(sample => sample.svgPreviewTarget)).toBe(true);
  expect(samples.every(sample => sample.visible && sample.plottedMarks > 0)).toBe(true);
  expect(settledGraph).toEqual({ previewCleared: true, visible: true, svgHeight: expect.any(Number), plottedMarks: expect.any(Number) });
  expect(settledGraph.plottedMarks).toBeGreaterThan(0);
  const frameGaps = samples.slice(1).map((sample, index) => sample.frameTime - samples[index].frameTime);
  const slowFrameRatio = frameGaps.filter(gap => gap > 50).length / Math.max(1, frameGaps.length);
  expect(slowFrameRatio).toBeLessThan(0.1);
  const widthDelta = samples.at(-1).svgWidth - samples[0].svgWidth;
  const heightDelta = samples.at(-1).svgHeight - samples[0].svgHeight;
  expect(Math.abs(widthDelta)).toBeGreaterThan(40);
  expect(Math.abs(heightDelta)).toBeGreaterThan(40);
  expect(widthDelta * dragDeltaX).toBeGreaterThan(0);
  expect(heightDelta * dragDeltaY).toBeGreaterThan(0);
  expect(new Set(samples.map(sample => Math.round(sample.svgWidth))).size).toBeGreaterThanOrEqual(4);
  expect(new Set(samples.map(sample => Math.round(sample.svgHeight))).size).toBeGreaterThanOrEqual(4);
});
