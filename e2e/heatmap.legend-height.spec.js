const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function waitForHeatmap(page) {
  await page.waitForFunction(() => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    const draw = window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw;
    return svg?.getAttribute('data-heatmap-render-complete') === 'true' && draw?.status === 'complete';
  }, null, { timeout: 60_000 });
}

async function setLegendMode(page, mode) {
  const before = await page.evaluate(() => (
    window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw?.timestamp || 0
  ));
  const select = page.locator('.heatmap-palette-controls-panel [data-heatmap-legend-height-mode]').first();
  if (!(await select.isVisible().catch(() => false))) {
    await page.locator('#heatmapPage:not([hidden]) #heatmapSvg [data-heatmap-color-scale-bar="1"]').click({ force: true });
  }
  await expect(select).toBeVisible();
  if (await select.inputValue() === mode) {
    await expect(page.locator('#heatmapPage:not([hidden]) #heatmapSvg .heatmap-color-scale'))
      .toHaveAttribute('data-heatmap-legend-height-mode', mode);
    return;
  }
  await select.selectOption(mode);
  await page.waitForFunction(({ previous, expected }) => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    const draw = window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw;
    const legend = svg?.querySelector('.heatmap-color-scale');
    return Number(draw?.timestamp || 0) > Number(previous || 0)
      && draw?.status === 'complete'
      && legend?.dataset?.heatmapLegendHeightMode === expected;
  }, { previous: before, expected: mode }, { timeout: 60_000 });
}

async function captureGeometry(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    const title = svg?.querySelector('text[data-font-role="graphTitle"]');
    const cells = svg?.querySelector('[data-export-layer="heatmap-cells"]');
    const rowLabel = svg?.querySelector('text[data-font-role="rowLabel"]');
    const columnLabel = svg?.querySelector('text[data-font-role="columnLabel"]');
    const legend = svg?.querySelector('.heatmap-color-scale');
    const bar = legend?.querySelector('[data-heatmap-color-scale-bar="1"]');
    const tickLines = Array.from(legend?.querySelectorAll('[data-heatmap-color-scale-tick="1"]') || []);
    const ticks = Array.from(legend?.querySelectorAll('text[data-font-role="scaleTick"]') || []);
    const legendTitleLines = Array.from(
      legend?.querySelectorAll('[data-heatmap-correlation-legend-title-line]') || []
    );
    if (!svg || !title || !cells || !rowLabel || !columnLabel || !legend || !bar || !ticks.length || !tickLines.length || legendTitleLines.length !== 2) return null;
    const rect = node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, top: box.top, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const svgRect = rect(svg);
    const titleRect = rect(title);
    const cellsRect = rect(cells);
    const barRect = rect(bar);
    return {
      mode: legend.dataset.heatmapLegendHeightMode,
      viewBox: svg.getAttribute('viewBox'),
      svg: svgRect,
      title: titleRect,
      cells: cellsRect,
      bar: barRect,
      barTargetWidth: Number(legend.dataset.heatmapLegendDisplayWidth),
      barTargetHeight: Number(legend.dataset.heatmapLegendDisplayHeight),
      rowLabel: rect(rowLabel),
      columnLabel: rect(columnLabel),
      tickHeight: Math.max(...ticks.map(node => node.getBoundingClientRect().height)),
      tickLength: Math.max(...tickLines.map(node => node.getBoundingClientRect().width)),
      tickTargetLength: Number(legend.dataset.heatmapLegendDisplayTickLength),
      legendTitle: legendTitleLines.map(node => node.textContent).join(' '),
      legendTitleRoles: legendTitleLines.map(node => node.dataset.fontRole),
      legendTitleCollections: legendTitleLines.map(node => node.dataset.fontCollection),
      legendTitleBottom: Math.max(...legendTitleLines.map(node => node.getBoundingClientRect().bottom)),
      titleInside: titleRect.top >= svgRect.top - 1 && titleRect.bottom <= svgRect.bottom + 1,
      titleCenterDelta: Math.abs(
        (titleRect.left + titleRect.width / 2)
        - (cellsRect.left + cellsRect.width / 2)
      ),
      legendTopDelta: Math.abs(barRect.top - cellsRect.top)
    };
  });
}

function expectGraphGeometryUnchanged(before, after) {
  expect(after.viewBox).toBe(before.viewBox);
  expect(after.cells.left).toBeCloseTo(before.cells.left, 1);
  expect(after.cells.top).toBeCloseTo(before.cells.top, 1);
  expect(after.cells.width).toBeCloseTo(before.cells.width, 1);
  expect(after.cells.height).toBeCloseTo(before.cells.height, 1);
  expect(after.title.left).toBeCloseTo(before.title.left, 1);
  expect(after.title.top).toBeCloseTo(before.title.top, 1);
  expect(after.title.width).toBeCloseTo(before.title.width, 1);
  expect(after.title.height).toBeCloseTo(before.title.height, 1);
  expect(after.rowLabel.height).toBeCloseTo(before.rowLabel.height, 1);
  expect(after.columnLabel.width).toBeCloseTo(before.columnLabel.width, 1);
  expect(after.tickHeight).toBeCloseTo(before.tickHeight, 1);
  expect(after.bar.width).toBeCloseTo(before.bar.width, 1);
  expect(after.tickLength).toBeCloseTo(before.tickLength, 1);
  expect(after.legendTitle).toBe(before.legendTitle);
  expect(after.titleInside).toBe(true);
  expect(after.titleCenterDelta).toBeLessThanOrEqual(1);
}

test('Fixed height legend preserves Heatmap geometry and typography for large and small data', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await waitForHeatmap(page);

  await setLegendMode(page, 'match-heatmap');
  const largeMatch = await captureGeometry(page);
  expect(largeMatch).toBeTruthy();
  expect(largeMatch.barTargetWidth).toBe(15);
  expect(Math.abs(largeMatch.bar.width - largeMatch.barTargetWidth)).toBeLessThanOrEqual(1);
  expect(largeMatch.tickTargetLength).toBe(4.2);
  expect(largeMatch.tickLength).toBeCloseTo(4.2, 0);
  expect(largeMatch.legendTitle).toBe('Pearson correlation');
  expect(largeMatch.legendTitleRoles).toEqual(['scaleTitle', 'scaleTitle']);
  expect(largeMatch.legendTitleCollections).toEqual(['scale', 'scale']);
  expect(largeMatch.bar.top - largeMatch.legendTitleBottom).toBeGreaterThanOrEqual(9);
  await setLegendMode(page, 'fixed');
  const largeFixed = await captureGeometry(page);
  expect(largeFixed).toBeTruthy();
  expectGraphGeometryUnchanged(largeMatch, largeFixed);
  expect(largeFixed.barTargetHeight).toBe(80);
  expect(Math.abs(largeFixed.bar.height - largeFixed.barTargetHeight)).toBeLessThanOrEqual(4);
  expect(largeFixed.barTargetWidth).toBe(15);
  expect(Math.abs(largeFixed.bar.width - largeFixed.barTargetWidth)).toBeLessThanOrEqual(1);
  expect(largeFixed.tickLength).toBeCloseTo(4.2, 0);
  expect(largeFixed.legendTopDelta).toBeLessThanOrEqual(1);

  await page.evaluate(() => {
    const heatmap = window.Components?.heatmap;
    const hot = heatmap?.__getState?.()?.hot;
    hot?.loadData?.([
      ['Feature', 'WDBC-M-001', 'WDBC-M-026', 'WDBC-M-012'],
      ['Mean Radius', 1.2, 0.8, 1.1],
      ['Mean Texture', 0.7, 1.4, 0.9],
      ['Mean Area', 1.8, 1.2, 1.6]
    ]);
  });
  await waitForHeatmap(page);

  await setLegendMode(page, 'match-heatmap');
  const smallMatch = await captureGeometry(page);
  expect(smallMatch).toBeTruthy();
  expect(smallMatch.barTargetWidth).toBe(15);
  expect(Math.abs(smallMatch.bar.width - smallMatch.barTargetWidth)).toBeLessThanOrEqual(1);
  expect(smallMatch.tickTargetLength).toBe(4.2);
  expect(smallMatch.tickLength).toBeCloseTo(4.2, 0);
  expect(smallMatch.legendTitle).toBe('Pearson correlation');
  expect(smallMatch.bar.top - smallMatch.legendTitleBottom).toBeGreaterThanOrEqual(9);
  await setLegendMode(page, 'fixed');
  const smallFixed = await captureGeometry(page);
  expect(smallFixed).toBeTruthy();
  expectGraphGeometryUnchanged(smallMatch, smallFixed);
  expect(smallFixed.barTargetHeight).toBe(80);
  expect(Math.abs(smallFixed.bar.height - smallFixed.barTargetHeight)).toBeLessThanOrEqual(4);
  expect(smallFixed.barTargetWidth).toBe(15);
  expect(Math.abs(smallFixed.bar.width - smallFixed.barTargetWidth)).toBeLessThanOrEqual(1);
  expect(smallFixed.tickLength).toBeCloseTo(4.2, 0);
  expect(smallFixed.legendTopDelta).toBeLessThanOrEqual(1);

  await page.locator('#heatmapMethod').selectOption('spearman');
  await page.waitForFunction(() => {
    const legend = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg .heatmap-color-scale');
    return legend?.dataset?.heatmapCorrelationMethod === 'spearman'
      && legend?.dataset?.heatmapCorrelationLegendTitle === 'Spearman correlation';
  }, null, { timeout: 60_000 });
  const spearman = await captureGeometry(page);
  expect(spearman.legendTitle).toBe('Spearman correlation');
  expect(spearman.bar.top - spearman.legendTitleBottom).toBeGreaterThanOrEqual(9);
});
