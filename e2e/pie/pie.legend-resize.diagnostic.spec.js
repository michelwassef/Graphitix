const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForAnimationFrame } = require('../helpers/contractWaits');

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
  await waitForPieDraw(page, 'e2e-pie-legend-initial-readiness');

  const before = await snapshot(page);
  const legendTarget = page.locator('#piePage:not([hidden]) #pieSvg [data-legend-viewport-content="true"] text').first();
  const legendRect = await legendTarget.boundingBox();
  expect(legendRect).not.toBeNull();
  await page.mouse.move(legendRect.x + legendRect.width / 2, legendRect.y + legendRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(legendRect.x + legendRect.width / 2 + 7, legendRect.y + legendRect.height / 2, { steps: 8 });
  await page.mouse.up();
  await waitForAnimationFrame(page);
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

test('Pie and Donut keep their final live radial frame after releasing resize', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' }, { first: true, loadExample: true });

  for (const chartType of ['pie', 'donut']) {
    await selectPieChartType(page, chartType);
    const handle = page.locator('#piePage:not([hidden]) #pieGraphPanel .svgbox .resizer-vertical').first();
    const handleRect = await handle.boundingBox();
    expect(handleRect).not.toBeNull();

    await page.evaluate(() => {
      const plot = document.querySelector('#piePage:not([hidden]) #piePlot');
      window.__pieRadialResizeFrame = null;
      window.__pieRadialResizePublications = 0;
      window.__pieRadialResizeObserver?.disconnect();
      window.__pieRadialResizeObserver = new MutationObserver(records => {
        window.__pieRadialResizePublications += records.reduce((count, record) => count + record.addedNodes.length + record.removedNodes.length, 0);
      });
      window.__pieRadialResizeObserver.observe(plot, { childList: true });
    });
    await page.mouse.move(handleRect.x + handleRect.width / 2, handleRect.y + handleRect.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleRect.x + handleRect.width / 2 - 37, handleRect.y + handleRect.height / 2, { steps: 12 });
    await waitForAnimationFrame(page);
    await page.evaluate(() => {
      window.__pieRadialResizeFrame = document.querySelector('#piePage:not([hidden]) #piePlot #pieSvg');
      window.__pieRadialResizePublications = 0;
    });
    await page.mouse.up();
    await waitForPieDraw(page, `e2e-pie-${chartType}-resize-release-readiness`);

    const afterRelease = await page.evaluate(() => {
      const svg = document.querySelector('#piePage:not([hidden]) #piePlot #pieSvg');
      const traces = Array.from(svg?.querySelectorAll?.('[data-pie-trace="1"]') || []);
      const legend = svg?.querySelector?.('[data-legend-viewport-content="true"]') || null;
      const title = svg?.querySelector?.('[data-font-role="graphTitle"]') || null;
      window.__pieRadialResizeObserver?.disconnect();
      return {
        sameFrame: svg === window.__pieRadialResizeFrame,
        publications: window.__pieRadialResizePublications || 0,
        tracesBound: traces.length > 0 && traces.every(node => node.__graphitixPieTraceFormatBound === true),
        legendBound: !legend || typeof legend.__graphitixLegendDragBinding?.onCommit === 'function',
        legendMetricsReady: !legend || ['legendDragOriginX', 'legendDragOriginY', 'legendDragScaleX', 'legendDragScaleY']
          .every(key => Number.isFinite(Number(legend.dataset[key]))),
        titleBound: !title || !!title.__graphitixInlineEditBinding?.dblclick,
        titleDragBound: !title || title.__graphitixPieRadialTitleDragBinding?.svg === svg
      };
    });
    expect(afterRelease, JSON.stringify({ chartType, afterRelease })).toEqual({
      sameFrame: true,
      publications: 0,
      tracesBound: true,
      legendBound: true,
      legendMetricsReady: true,
      titleBound: true,
      titleDragBound: true
    });
  }
});

test('Pie hides a figure summary after an aspect-locked resize without moving the radial graph', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' }, { first: true, loadExample: true });

  const compute = page.locator('#piePage:not([hidden]) #pieComputeStats');
  await expect(compute).toBeEnabled({ timeout: 30_000 });
  await compute.click();
  await expect(page.locator('#piePage:not([hidden]) #pieStatsStatus')).toContainText(/up to date/i, { timeout: 60_000 });
  const summary = page.locator('#piePage:not([hidden]) #pieShowFigureSummary');
  await expect(summary).toBeEnabled();
  await summary.check();
  await page.waitForSelector('#piePage:not([hidden]) #pieSvg g[data-stats-figure-summary="1"]');

  const handle = page.locator('#piePage:not([hidden]) #pieGraphPanel .svgbox .resizer-vertical').first();
  const handleRect = await handle.boundingBox();
  expect(handleRect).not.toBeNull();
  await page.mouse.move(handleRect.x + handleRect.width / 2, handleRect.y + handleRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleRect.x + handleRect.width / 2 + 45, handleRect.y + handleRect.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForSelector('#piePage:not([hidden]) #pieSvg g[data-stats-figure-summary="1"]');

  await page.evaluate(() => {
    const root = document.querySelector('#piePage:not([hidden])');
    const plot = root?.querySelector('#piePlot');
    const svgBox = root?.querySelector('#pieGraphPanel .svgbox') || null;
    const read = () => {
      const svg = root?.querySelector('#pieSvg') || null;
      const boxRect = svgBox?.getBoundingClientRect?.() || null;
      const plotRect = plot?.getBoundingClientRect?.() || null;
      const svgRect = svg?.getBoundingClientRect?.() || null;
      return {
        svg,
        viewBox: svg?.getAttribute('viewBox') || '',
        width: svg?.getAttribute('width') || '',
        height: svg?.getAttribute('height') || '',
        summaryCount: svg?.querySelectorAll('g[data-stats-figure-summary="1"]').length || 0,
        summaryReserve: svg?.dataset?.statsFigureSummaryReserveBottom || '',
        baseWidth: svg?.dataset?.graphContentBaseWidth || '',
        baseHeight: svg?.dataset?.graphContentBaseHeight || '',
        boxWidth: boxRect?.width || 0,
        boxHeight: boxRect?.height || 0,
        boxX: boxRect?.x || 0,
        boxY: boxRect?.y || 0,
        plotWidth: plotRect?.width || 0,
        plotHeight: plotRect?.height || 0,
        plotX: plotRect?.x || 0,
        plotY: plotRect?.y || 0,
        svgWidth: svgRect?.width || 0,
        svgHeight: svgRect?.height || 0,
        svgX: svgRect?.x || 0,
        svgY: svgRect?.y || 0,
        svgMarginLeft: svg?.style?.marginLeft || '',
        svgMarginTop: svg?.style?.marginTop || '',
        plotViewportHeight: plot?.style?.getPropertyValue('--graph-content-viewport-height') || '',
        envelopeWidth: svgBox?.style?.getPropertyValue('--graph-content-viewport-width') || '',
        envelopeHeight: svgBox?.style?.getPropertyValue('--graph-content-viewport-height') || '',
        envelopeBottom: svgBox?.style?.getPropertyValue('--graph-content-extra-bottom') || ''
      };
    };
    const monitor = {
      before: read(),
      read,
      frames: [],
      publications: 0,
      publicationNodes: [],
      observer: new MutationObserver(records => {
        monitor.publications += records.reduce((count, record) => count + record.addedNodes.length + record.removedNodes.length, 0);
        records.forEach(record => {
          [...record.removedNodes, ...record.addedNodes].forEach(node => {
            monitor.publicationNodes.push({ id: node.id || '', nodeName: node.nodeName || '' });
          });
        });
      })
    };
    monitor.observer.observe(plot, { childList: true });
    window.__pieSummaryHideMonitor = monitor;
  });
  await summary.uncheck();
  await page.evaluate(async () => {
    const monitor = window.__pieSummaryHideMonitor;
    for(let frame = 0; frame < 90; frame += 1){
      await new Promise(resolve => requestAnimationFrame(resolve));
      monitor.frames.push(monitor.read());
    }
    monitor.observer.disconnect();
  });
  const after = await page.evaluate(() => {
    const monitor = window.__pieSummaryHideMonitor;
    delete window.__pieSummaryHideMonitor;
    return {
      publications: monitor.publications,
      publicationNodes: monitor.publicationNodes,
      before: {
        ...monitor.before,
        svg: undefined
      },
      frames: monitor.frames.map(frame => ({
        ...frame,
        sameSvg: frame.svg === monitor.before.svg,
        svg: undefined
      }))
    };
  });
  expect(after.frames.every(frame => frame.summaryCount === 0), JSON.stringify(after)).toBe(true);
  expect(after.frames.every(frame => frame.sameSvg), JSON.stringify(after)).toBe(true);
  expect(after.publications, JSON.stringify(after)).toBe(0);
  const settled = after.frames[after.frames.length - 1];
  expect(after.frames.every(frame => (
    frame.viewBox === settled.viewBox
    && frame.width === settled.width
    && frame.height === settled.height
    && frame.summaryReserve === settled.summaryReserve
    && frame.baseWidth === settled.baseWidth
    && frame.baseHeight === settled.baseHeight
    && frame.boxWidth === settled.boxWidth
    && frame.boxHeight === settled.boxHeight
    && frame.boxX === settled.boxX
    && frame.boxY === settled.boxY
    && frame.plotWidth === settled.plotWidth
    && frame.plotHeight === settled.plotHeight
    && frame.plotX === settled.plotX
    && frame.plotY === settled.plotY
    && frame.svgWidth === settled.svgWidth
    && frame.svgHeight === settled.svgHeight
    && frame.svgX === settled.svgX
    && frame.svgY === settled.svgY
    && frame.svgMarginLeft === settled.svgMarginLeft
    && frame.svgMarginTop === settled.svgMarginTop
    && frame.plotViewportHeight === settled.plotViewportHeight
    && frame.envelopeWidth === settled.envelopeWidth
    && frame.envelopeHeight === settled.envelopeHeight
    && frame.envelopeBottom === settled.envelopeBottom
  )), JSON.stringify(after)).toBe(true);
  expect(settled.plotViewportHeight, JSON.stringify(after)).toBe('');
  expect(Math.abs(settled.svgHeight - Number(settled.height)), JSON.stringify(after)).toBeLessThanOrEqual(1);
});

test('Donut removes a figure summary from its resized radial frame', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' }, { first: true, loadExample: true });
  await selectPieChartType(page, 'donut');

  const compute = page.locator('#piePage:not([hidden]) #pieComputeStats');
  await expect(compute).toBeEnabled({ timeout: 30_000 });
  await compute.click();
  await expect(page.locator('#piePage:not([hidden]) #pieStatsStatus')).toContainText(/up to date/i, { timeout: 60_000 });
  const summary = page.locator('#piePage:not([hidden]) #pieShowFigureSummary');
  await summary.check();
  await page.waitForSelector('#piePage:not([hidden]) #pieSvg g[data-stats-figure-summary="1"]');

  const handle = page.locator('#piePage:not([hidden]) #pieGraphPanel .svgbox .resizer-vertical').first();
  const handleRect = await handle.boundingBox();
  expect(handleRect).not.toBeNull();
  await page.mouse.move(handleRect.x + handleRect.width / 2, handleRect.y + handleRect.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleRect.x + handleRect.width / 2 + 45, handleRect.y + handleRect.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForSelector('#piePage:not([hidden]) #pieSvg g[data-stats-figure-summary="1"]');

  await page.evaluate(() => {
    window.__donutSummarySvg = document.querySelector('#piePage:not([hidden]) #pieSvg');
  });
  await summary.uncheck();
  const after = await page.evaluate(async () => {
    const beforeSvg = window.__donutSummarySvg;
    const frames = [];
    for(let index = 0; index < 60; index += 1){
      await new Promise(resolve => requestAnimationFrame(resolve));
      const svg = document.querySelector('#piePage:not([hidden]) #pieSvg');
      const plot = document.querySelector('#piePage:not([hidden]) #piePlot');
      const rect = svg?.getBoundingClientRect?.() || null;
      frames.push({
        sameSvg: svg === beforeSvg,
        summaryCount: svg?.querySelectorAll('g[data-stats-figure-summary="1"]').length || 0,
        height: Number(svg?.getAttribute('height')) || 0,
        renderedHeight: rect?.height || 0,
        plotViewportHeight: plot?.style?.getPropertyValue('--graph-content-viewport-height') || ''
      });
    }
    delete window.__donutSummarySvg;
    return frames;
  });
  const settled = after[after.length - 1];
  expect(after.every(frame => frame.sameSvg && frame.summaryCount === 0), JSON.stringify(after)).toBe(true);
  expect(after.every(frame => JSON.stringify(frame) === JSON.stringify(settled)), JSON.stringify(after)).toBe(true);
  expect(settled.plotViewportHeight, JSON.stringify(after)).toBe('');
  expect(Math.abs(settled.renderedHeight - settled.height), JSON.stringify(after)).toBeLessThanOrEqual(1);
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
  await waitForPieDraw(page, 'e2e-pie-legend-font-readiness');

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
  await waitForAnimationFrame(page);
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
