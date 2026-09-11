const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { openComponentFromWelcome } = require('./helpers/workspaceDriver');

async function snapshot(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#piePage:not([hidden])');
    const svg = root?.querySelector('#pieSvg');
    const box = root?.querySelector('#pieGraphPanel .svgbox');
    const legend = svg?.querySelector('[data-legend-viewport-content="true"]');
    const data = svg?.querySelector('[data-layer="pie-data"]');
    const label = svg?.querySelector('[data-layer="pie-labels"]');
    const rect = node => {
      const value = node?.getBoundingClientRect?.();
      return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null;
    };
    const bbox = node => {
      try {
        const value = node?.getBBox?.();
        return value ? { x: value.x, y: value.y, width: value.width, height: value.height } : null;
      } catch (_err) {
        return null;
      }
    };
    return {
      svg: {
        width: svg?.getAttribute('width'),
        height: svg?.getAttribute('height'),
        viewBox: svg?.getAttribute('viewBox'),
        rect: rect(svg)
      },
      box: rect(box),
      legend: {
        transform: legend?.getAttribute('transform'),
        bbox: bbox(legend),
        rect: rect(legend)
      },
      data: { bbox: bbox(data), rect: rect(data) },
      labels: { bbox: bbox(label), rect: rect(label) },
      publication: {
        svgCount: root?.querySelectorAll?.('#piePlot svg#pieSvg')?.length || 0,
        stagedCount: root?.querySelectorAll?.('#piePlot [data-graph-frame-publication="staged"]')?.length || 0,
        traceCount: svg?.querySelectorAll?.('[data-pie-trace="1"]')?.length || 0
      },
      envelope: {
        top: box?.style?.getPropertyValue('--graph-content-extra-top'),
        right: box?.style?.getPropertyValue('--graph-content-extra-right'),
        bottom: box?.style?.getPropertyValue('--graph-content-extra-bottom'),
        width: box?.style?.getPropertyValue('--graph-content-viewport-width'),
        height: box?.style?.getPropertyValue('--graph-content-viewport-height')
      }
    };
  });
}

async function waitForPieDraw(page, reason) {
  await page.evaluate(async drawReason => {
    const tab = window.Main.session.getActiveTab();
    await window.Components.pie.awaitReadyForSnapshot({
      tab,
      tabId: tab.id,
      reason: drawReason,
      settleFrames: 2
    });
  }, reason);
}

async function selectPieChartType(page, chartType) {
  await page.locator('#piePage:not([hidden]) #pieChartType').selectOption(chartType);
  await page.waitForFunction(expectedType =>
    document.querySelector('#piePage:not([hidden]) #pieSvg [data-pie-trace]')?.dataset.pieTraceMode === expectedType,
  chartType);
  await waitForPieDraw(page, `e2e-pie-${chartType}-legend-default`);
}

async function radialLegendAlignment(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#piePage:not([hidden])');
    const svg = root?.querySelector('#pieSvg');
    const legend = svg?.querySelector('[data-legend-viewport-content="true"]');
    const data = svg?.querySelector('[data-layer="pie-data"]');
    const centerY = node => {
      const rect = node?.getBoundingClientRect?.();
      return rect ? rect.y + rect.height / 2 : null;
    };
    return {
      legendCenterY: centerY(legend),
      chartCenterY: centerY(data),
      transform: legend?.getAttribute('transform') || null,
      storedLegend: window.Components.pie.getPayload()?.config?.labelPositions?.legend || null
    };
  });
}

test('Pie legend drag followed by graph resize keeps one settled graph frame', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' }, { first: true, loadExample: true });
  await page.waitForSelector('#piePage:not([hidden]) #pieSvg [data-legend-viewport-content="true"]');
  await page.waitForTimeout(500);

  const before = await snapshot(page);
  const legendTarget = page.locator('#piePage:not([hidden]) #pieSvg [data-legend-viewport-content="true"] text').first();
  const legendRect = await legendTarget.boundingBox();
  expect(legendRect).not.toBeNull();
  await page.mouse.move(legendRect.x + legendRect.width / 2, legendRect.y + legendRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(legendRect.x + legendRect.width / 2 + 7, legendRect.y + legendRect.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const moved = await snapshot(page);

  const handle = page.locator('#piePage:not([hidden]) #pieGraphPanel .svgbox .resizer-vertical').first();
  const handleRect = await handle.boundingBox();
  expect(handleRect).not.toBeNull();
  await page.mouse.move(handleRect.x + handleRect.width / 2, handleRect.y + handleRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleRect.x + handleRect.width / 2 - 21, handleRect.y + handleRect.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.evaluate(async () => {
    const tab = window.Main.session.getActiveTab();
    await window.Components.pie.awaitReadyForSnapshot({
      tab,
      tabId: tab.id,
      reason: 'e2e-pie-legend-resize-readiness',
      settleFrames: 2
    });
  });
  const resized = await snapshot(page);
  expect(resized.publication, JSON.stringify({ before, moved, resized })).toEqual({
    svgCount: 1,
    stagedCount: 0,
    traceCount: expect.any(Number)
  });
  expect(resized.publication.traceCount).toBeGreaterThan(0);
  expect(resized.legend.rect.x).toBeGreaterThanOrEqual(resized.data.rect.x + resized.data.rect.width - 2);
});

test('Pie and Donut center their default legend beside the radial charts and retain a drag', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' }, { first: true, loadExample: true });
  await page.waitForSelector('#piePage:not([hidden]) #pieSvg [data-legend-viewport-content="true"]');

  let donutDefault = null;
  for (const chartType of ['pie', 'donut']) {
    await selectPieChartType(page, chartType);
    const alignment = await radialLegendAlignment(page);
    expect(alignment.storedLegend, JSON.stringify(alignment)).toBeNull();
    expect(alignment.legendCenterY, JSON.stringify(alignment)).not.toBeNull();
    expect(alignment.chartCenterY, JSON.stringify(alignment)).not.toBeNull();
    expect(Math.abs(alignment.legendCenterY - alignment.chartCenterY), JSON.stringify(alignment)).toBeLessThanOrEqual(8);
    if(chartType === 'donut'){
      donutDefault = alignment;
    }
  }

  const legendTarget = page.locator('#piePage:not([hidden]) #pieSvg [data-legend-viewport-content="true"] text').first();
  const legendRect = await legendTarget.boundingBox();
  expect(legendRect).not.toBeNull();
  await page.mouse.move(legendRect.x + legendRect.width / 2, legendRect.y + legendRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(legendRect.x + legendRect.width / 2, legendRect.y + legendRect.height / 2 - 26, { steps: 8 });
  await page.mouse.up();

  const moved = await radialLegendAlignment(page);
  expect(moved.storedLegend, JSON.stringify(moved)).not.toBeNull();
  expect(Math.abs(moved.legendCenterY - donutDefault.legendCenterY), JSON.stringify({ donutDefault, moved })).toBeGreaterThan(16);
  const tabId = await page.evaluate(() => window.Main.session.getActiveTab().id);
  await page.evaluate(async id => window.Components.pie.draw({ reason: 'e2e-pie-legend-drag-preserve', tabId: id }), tabId);
  await waitForPieDraw(page, 'e2e-pie-legend-drag-preserve-readiness');
  const redrawn = await radialLegendAlignment(page);
  expect(redrawn.transform, JSON.stringify({ moved, redrawn })).toBe(moved.transform);
});

test('Pie keeps a moved legend inside the viewport during and after an extreme height resize', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' }, { first: true, loadExample: true });
  await page.waitForSelector('#piePage:not([hidden]) #pieSvg [data-legend-viewport-content="true"]');

  await page.locator('#piePage:not([hidden]) #pieFontSize').evaluate(input => {
    input.value = '24';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(500);

  const legendTarget = page.locator('#piePage:not([hidden]) #pieSvg [data-legend-viewport-content="true"] text').first();
  const legendRect = await legendTarget.boundingBox();
  const svgRect = await page.locator('#piePage:not([hidden]) #pieSvg').boundingBox();
  expect(legendRect).not.toBeNull();
  expect(svgRect).not.toBeNull();
  const down = Math.max(12, svgRect.y + svgRect.height - (legendRect.y + legendRect.height) - 3);
  await page.mouse.move(legendRect.x + legendRect.width / 2, legendRect.y + legendRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(legendRect.x + legendRect.width / 2, legendRect.y + legendRect.height / 2 + down, { steps: 8 });
  await page.mouse.up();

  const handle = page.locator('#piePage:not([hidden]) #pieGraphPanel .svgbox .resizer-horizontal').first();
  const handleRect = await handle.boundingBox();
  expect(handleRect).not.toBeNull();
  await page.mouse.move(handleRect.x + handleRect.width / 2, handleRect.y + handleRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleRect.x + handleRect.width / 2, handleRect.y + handleRect.height / 2 - 300, { steps: 12 });
  // The preview frame must use the same viewport constraint as the frame
  // published when the handle is released.
  await page.waitForTimeout(250);
  const during = await snapshot(page);
  expect(during.publication.traceCount, JSON.stringify(during)).toBeGreaterThan(0);
  expect(during.legend.rect, JSON.stringify(during)).not.toBeNull();
  expect(during.svg.rect, JSON.stringify(during)).not.toBeNull();
  expect(during.legend.rect.y, JSON.stringify(during)).toBeGreaterThanOrEqual(during.svg.rect.y - 1);
  expect(during.legend.rect.y + during.legend.rect.height, JSON.stringify(during)).toBeLessThanOrEqual(during.svg.rect.y + during.svg.rect.height + 1);
  await page.mouse.up();
  await page.evaluate(async () => {
    const tab = window.Main.session.getActiveTab();
    await window.Components.pie.awaitReadyForSnapshot({ tab, tabId: tab.id, reason: 'e2e-pie-legend-boundary', settleFrames: 2 });
  });

  const resized = await snapshot(page);
  expect(resized.legend.rect, JSON.stringify(resized)).not.toBeNull();
  expect(resized.svg.rect, JSON.stringify(resized)).not.toBeNull();
  expect(resized.legend.rect.y).toBeGreaterThanOrEqual(resized.svg.rect.y - 1);
  expect(resized.legend.rect.y + resized.legend.rect.height).toBeLessThanOrEqual(resized.svg.rect.y + resized.svg.rect.height + 1);
  expect(Number.parseFloat(resized.envelope.bottom), JSON.stringify(resized)).toBeGreaterThan(0);
});
