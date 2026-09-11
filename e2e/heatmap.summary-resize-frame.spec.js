const { test, expect } = require('@playwright/test');
const {
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('./helpers/contractWaits');

async function waitForHeatmap(page){
  await page.waitForFunction(() => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    return svg?.querySelectorAll?.('[data-export-layer="heatmap-cells"] rect').length >= 9
      && window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw?.status === 'complete';
  }, null, { timeout:60_000 });
}

async function readGraphGeometry(page){
  return page.evaluate(() => {
    const box = document.querySelector('#heatmapPage:not([hidden]) #heatmapGraphPanel .svgbox');
    const svg = box?.querySelector('#heatmapSvg');
    const cells = svg?.querySelector('[data-export-layer="heatmap-cells"]');
    const title = svg?.querySelector('text[data-font-role="graphTitle"]');
    const scale = svg?.querySelector('[data-heatmap-color-scale-bar="1"]');
    const firstCell = cells?.querySelector('rect');
    const rect = node => {
      const value = node?.getBoundingClientRect?.();
      return value ? {
        left:Number(value.left.toFixed(2)),
        top:Number(value.top.toFixed(2)),
        width:Number(value.width.toFixed(2)),
        height:Number(value.height.toFixed(2))
      } : null;
    };
    return {
      box:rect(box),
      svg:rect(svg),
      cells:rect(cells),
      title:rect(title),
      scale:rect(scale),
      firstCell:rect(firstCell),
      viewBox:svg?.getAttribute('viewBox') || '',
      graphBaseWidth:Number(svg?.dataset?.graphContentBaseWidth || 0),
      graphBaseHeight:Number(svg?.dataset?.graphContentBaseHeight || 0),
      renderedScaleX:Number(svg?.dataset?.statsFigureSummaryRenderedScaleX || 0),
      renderedScaleY:Number(svg?.dataset?.statsFigureSummaryRenderedScaleY || 0),
      summaryReserve:Number(svg?.dataset?.statsFigureSummaryReserveBottom || 0)
    };
  });
}

function readViewBoxSize(viewBox){
  const values = String(viewBox || '').trim().split(/[\s,]+/).map(Number);
  return values.length === 4 && values.every(Number.isFinite)
    ? { width:values[2], height:values[3] }
    : null;
}

async function resizeVertically(page, delta){
  const handle = page.locator('#heatmapPage:not([hidden]) .svgbox .resizer-horizontal').first();
  await expect(handle).toBeVisible({ timeout:20_000 });
  const rect = await handle.boundingBox();
  if(!rect) throw new Error('Missing Heatmap vertical resize handle');
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + delta, { steps:8 });
  await page.mouse.up();
  await waitForHeatmap(page);
  await waitForComponentOwnerReady(page, 'heatmap', {
    requireMountedRoot: true,
    requireIdle: true
  });
}

async function resetSize(page){
  const handle = page.locator('#heatmapPage:not([hidden]) .svgbox .resizer-horizontal').first();
  await handle.dblclick();
  await waitForHeatmap(page);
  await waitForComponentOwnerReady(page, 'heatmap', {
    requireMountedRoot: true,
    requireIdle: true
  });
}

function expectNear(actual, expected, tolerance, label){
  expect(Number.isFinite(actual), `${label}: actual ${actual}`).toBe(true);
  expect(Number.isFinite(expected), `${label}: expected ${expected}`).toBe(true);
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);
}

function expectCanonicalGraphGeometry(actual, expected, label){
  expectNear(actual.box.width, expected.box.width, 1, `${label} frame width`);
  expectNear(actual.box.height, expected.box.height, 1, `${label} frame height`);
  expectNear(actual.cells.width, expected.cells.width, 1, `${label} matrix width`);
  expectNear(actual.cells.height, expected.cells.height, 1, `${label} matrix height`);
  expectNear(actual.title.width, expected.title.width, 1, `${label} title width`);
  expectNear(actual.title.height, expected.title.height, 1, `${label} title height`);
  expectNear(actual.scale.width, expected.scale.width, 1, `${label} color-scale width`);
  expectNear(actual.scale.height, expected.scale.height, 1, `${label} color-scale height`);
}

test('Heatmap resize keeps the canonical graph frame independent of the summary table', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil:'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type:'heatmap', pageId:'heatmapPage', exampleButtonId:'heatmapLoadExample' },
    { first:true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await waitForHeatmap(page);

  await resizeVertically(page, 90);
  const withoutSummary = await readGraphGeometry(page);

  const checkbox = page.locator('#heatmapPage:not([hidden]) .stats-figure-summary-checkbox').last();
  await checkbox.check();
  await expect(page.locator('#heatmapSvg g[data-stats-figure-summary="1"]')).toHaveCount(1);
  const summaryAddedAfterResize = await readGraphGeometry(page);
  expectCanonicalGraphGeometry(summaryAddedAfterResize, withoutSummary, 'summary added after resize');
  await checkbox.uncheck();
  await expect(page.locator('#heatmapSvg g[data-stats-figure-summary="1"]')).toHaveCount(0);
  await resetSize(page);

  await checkbox.check();
  await expect(page.locator('#heatmapSvg g[data-stats-figure-summary="1"]')).toHaveCount(1);
  await resizeVertically(page, 90);
  const withSummary = await readGraphGeometry(page);
  const withoutSummaryViewBox = readViewBoxSize(withoutSummary.viewBox);

  expect(withSummary.summaryReserve).toBeGreaterThan(0);
  expectCanonicalGraphGeometry(withSummary, withoutSummary, 'summary present during resize');
  expect(withoutSummaryViewBox).toBeTruthy();
  expectNear(withSummary.graphBaseWidth, withoutSummaryViewBox.width, 1, 'summary canonical width');
  expectNear(withSummary.graphBaseHeight, withoutSummaryViewBox.height, 4, 'summary canonical height');
});
