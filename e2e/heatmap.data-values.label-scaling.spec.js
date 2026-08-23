const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test('Heatmap fits labels without shrinking independent title or color-scale styling', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );

  await page.evaluate(() => {
    const heatmap = window.Components?.heatmap;
    const hot = heatmap?.__getState?.()?.hot;
    const data = [['Row', 'Library 1', 'Library 2', 'Library 3']];
    for(let index = 0; index < 100; index += 1){
      data.push([`Gene ${index + 1}`, index + 1, index + 2, index + 3]);
    }
    hot.loadData(data);
    const view = document.getElementById('heatmapView');
    view.value = 'values';
    view.dispatchEvent(new Event('change', { bubbles: true }));
    heatmap.draw();
  });

  await page.waitForFunction(() => (
    document.querySelectorAll('#heatmapSvg text[data-font-role="rowLabel"]').length === 100
    && document.querySelectorAll('#heatmapSvg text[data-font-role="columnLabel"]').length === 3
    && document.querySelector('#heatmapSvg .heatmap-color-scale text')
  ));

  const metrics = await page.evaluate(() => {
    const svg = document.getElementById('heatmapSvg');
    const row = svg.querySelector('text[data-font-role="rowLabel"]');
    const column = svg.querySelector('text[data-font-role="columnLabel"]');
    const title = svg.querySelector('text[data-font-role="graphTitle"]');
    const scaleGroup = svg.querySelector('.heatmap-color-scale');
    const scaleTick = scaleGroup.querySelector('text');
    const scaleRect = scaleGroup.querySelector('rect');
    return {
      rowThickness: row.getBoundingClientRect().height,
      columnThickness: column.getBoundingClientRect().width,
      titleThickness: title.getBoundingClientRect().height,
      scaleTickThickness: scaleTick.getBoundingClientRect().height,
      scaleTickRole: scaleTick.dataset.fontRole,
      scaleTickCollection: scaleTick.dataset.fontCollection,
      scaleStroke: Number(scaleRect.getAttribute('stroke-width'))
    };
  });

  expect(metrics.rowThickness).toBeLessThan(metrics.columnThickness * 0.6);
  expect(metrics.titleThickness).toBeGreaterThan(metrics.rowThickness * 2);
  expect(metrics.scaleTickThickness).toBeGreaterThan(metrics.rowThickness * 2);
  expect(metrics.scaleTickRole).toBe('scaleTick');
  expect(metrics.scaleTickCollection).toBe('scale');
  expect(metrics.scaleStroke).toBe(1);

  await page.evaluate(() => {
    const heatmap = window.Components?.heatmap;
    const hot = heatmap?.__getState?.()?.hot;
    const headers = ['Sample'];
    for(let column = 0; column < 28; column += 1){
      headers.push(`Variable ${column + 1}`);
    }
    const data = [headers];
    for(let row = 0; row < 12; row += 1){
      const values = [`Sample ${row + 1}`];
      for(let column = 0; column < 28; column += 1){
        values.push((row + 1) * (column + 2) + ((row * column) % 5));
      }
      data.push(values);
    }
    hot.loadData(data);
    const view = document.getElementById('heatmapView');
    view.value = 'corr-columns';
    view.dispatchEvent(new Event('change', { bubbles: true }));
    heatmap.draw();
  });

  await page.waitForFunction(() => (
    document.getElementById('heatmapSvg')?.dataset?.heatmapModelType === 'correlation'
    && document.querySelectorAll('#heatmapSvg text[data-font-role="rowLabel"]').length === 28
  ));
  const correlationMetrics = await page.evaluate(() => {
    const svg = document.getElementById('heatmapSvg');
    const title = svg.querySelector('text[data-font-role="graphTitle"]');
    const scaleGroup = svg.querySelector('.heatmap-color-scale');
    return {
      titleThickness: title.getBoundingClientRect().height,
      scaleTickThickness: scaleGroup.querySelector('text').getBoundingClientRect().height,
      scaleStroke: Number(scaleGroup.querySelector('rect').getAttribute('stroke-width'))
    };
  });

  expect(Math.abs(correlationMetrics.titleThickness - metrics.titleThickness)).toBeLessThanOrEqual(2);
  expect(Math.abs(correlationMetrics.scaleTickThickness - metrics.scaleTickThickness)).toBeLessThanOrEqual(2);
  expect(correlationMetrics.scaleStroke).toBe(1);
});
