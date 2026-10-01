const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome, clickExpectedExampleButton } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

test.setTimeout(120_000);

async function captureUpSetTitleGeometry(page){
  return page.locator('#vennPage:not([hidden]) #stage').evaluate(svg => {
    const title = role => svg.querySelector(`text[data-font-role="${role}"]`);
    const lines = node => Array.from(node?.querySelectorAll('tspan[data-title-line="1"]') || []);
    const baseline = node => Number(node?.dataset?.titleLineHeight)
      || Number.parseFloat(getComputedStyle(node).fontSize)
      || Number.parseFloat(node?.getAttribute('font-size') || '')
      || 0;
    const primaryAxis = name => svg.querySelector(`[data-upset-axis="${name}"]`);
    const axisBounds = axis => axis ? {
      x1: Number(axis.getAttribute('x1')),
      y1: Number(axis.getAttribute('y1')),
      x2: Number(axis.getAttribute('x2')),
      y2: Number(axis.getAttribute('y2'))
    } : null;
    const rootScreenMatrix = svg.getScreenCTM();
    const traceBounds = Array.from(svg.querySelectorAll('[data-upset-trace-kind]'))
      .map(node => {
        try{
          const box = node.getBBox();
          const matrix = rootScreenMatrix.inverse().multiply(node.getScreenCTM());
          const corners = [
            [box.x, box.y], [box.x + box.width, box.y],
            [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]
          ].map(([x, y]) => {
            const point = svg.createSVGPoint();
            point.x = x;
            point.y = y;
            return point.matrixTransform(matrix);
          });
          return {
            x: Math.min(...corners.map(point => point.x)),
            y: Math.min(...corners.map(point => point.y)),
            right: Math.max(...corners.map(point => point.x)),
            bottom: Math.max(...corners.map(point => point.y))
          };
        }catch(_err){ return null; }
      })
      .filter(Boolean);
    const graphTitle = title('graphTitle');
    const xTitle = title('xTitle');
    const yTitle = title('yTitle');
    const viewBox = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const excludedSummaryNodes = Array.from(svg.querySelectorAll('g[data-stats-figure-summary="1"]'))
      .map(node => ({ node, parent: node.parentNode, nextSibling: node.nextSibling }))
      .filter(entry => entry.parent);
    let contentBounds;
    try{
      excludedSummaryNodes.forEach(entry => entry.parent.removeChild(entry.node));
      contentBounds = svg.getBBox();
    }finally{
      excludedSummaryNodes.forEach(entry => {
        if(entry.nextSibling?.parentNode === entry.parent) entry.parent.insertBefore(entry.node, entry.nextSibling);
        else if(entry.node.parentNode !== entry.parent) entry.parent.appendChild(entry.node);
      });
    }
    return {
      viewBox,
      svgWidth: Number(svg.getAttribute('width')),
      svgHeight: Number(svg.getAttribute('height')),
      baseWidth: Number(svg.dataset.graphContentBaseWidth),
      baseHeight: Number(svg.dataset.graphContentBaseHeight),
      contentBounds: {
        minX: contentBounds.x,
        minY: contentBounds.y,
        maxX: contentBounds.x + contentBounds.width,
        maxY: contentBounds.y + contentBounds.height
      },
      reserveRight: Number(svg.dataset.graphContentReserveRight),
      reserveBottom: Number(svg.dataset.graphContentReserveBottom),
      envelopeMaxY: Number(svg.dataset.graphContentEnvelopeMaxY),
      carriedSummaryReserve: svg.dataset.statsFigureSummaryCarried === '1'
        ? Math.max(0, Number(svg.dataset.statsFigureSummaryCarryReserveBottom) || 0)
        : 0,
      graphTitleText: graphTitle?.dataset?.titleBlockText || graphTitle?.textContent || '',
      graphLineHeight: baseline(graphTitle),
      graphLines: lines(graphTitle).map(node => Number(node.getAttribute('y'))),
      xTitleText: xTitle?.dataset?.titleBlockText || xTitle?.textContent || '',
      xLineHeight: baseline(xTitle),
      xLines: lines(xTitle).map(node => Number(node.getAttribute('y'))),
      yTitleText: yTitle?.dataset?.titleBlockText || yTitle?.textContent || '',
      yLineHeight: baseline(yTitle),
      yLines: lines(yTitle).map(node => Number(node.getAttribute('y'))),
      xAxis: axisBounds(primaryAxis('intersection-x')),
      yAxis: axisBounds(primaryAxis('intersection-y')),
      traceBounds: traceBounds.length ? {
        left: Math.min(...traceBounds.map(box => box.x)),
        top: Math.min(...traceBounds.map(box => box.y)),
        right: Math.max(...traceBounds.map(box => box.right)),
        bottom: Math.max(...traceBounds.map(box => box.bottom))
      } : null
    };
  });
}

async function addLines(page, selector, addedLines){
  const target = page.locator(selector).first();
  await expect(target).toBeVisible();
  const initial = await target.evaluate(node => node.dataset.titleBlockText || node.textContent || '');
  await target.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  await editor.fill(initial);
  await editor.press('End');
  for(const text of addedLines){
    await editor.press('Enter');
    await editor.type(text);
  }
  await expect(editor).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await expect.poll(() => target.evaluate(node => node.dataset.titleBlockText || node.textContent || ''))
    .toBe(`${initial}${addedLines.map(text => `\n${text}`).join('')}`);
  await waitForComponentOwnerReady(page, 'venn', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  return `${initial}${addedLines.map(text => `\n${text}`).join('')}`;
}

test('UpSet graph and axis multiline titles add exact reserve and shift the plot as needed', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, {
    type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample'
  }, { first: true });
  await clickExpectedExampleButton(page, 'sample');
  await page.locator('#vennPage:not([hidden]) #vennPlotType').selectOption('upset');
  const svg = page.locator('#vennPage:not([hidden]) #stage');
  await expect(svg.locator('[data-upset-trace-kind]').first()).toBeAttached();
  await expect(svg.locator('text[data-font-role="xTitle"]')).toBeAttached();
  await expect(svg.locator('text[data-font-role="yTitle"]')).toBeAttached();
  const before = await captureUpSetTitleGeometry(page);
  expect(before.traceBounds).not.toBeNull();

  await addLines(page, '#stage text[data-font-role="graphTitle"]', ['Added graph title line 1', 'Added graph title line 2']);
  const afterGraph = await captureUpSetTitleGeometry(page);
  expect(afterGraph.graphLines).toHaveLength(3);
  afterGraph.graphLines.slice(1).forEach((baseline, index) => {
    expect(baseline - afterGraph.graphLines[index]).toBeCloseTo(afterGraph.graphLineHeight, 2);
  });
  const graphReserve = 2 * afterGraph.graphLineHeight;
  expect(afterGraph.reserveBottom).toBeCloseTo(
    Math.max(0, afterGraph.contentBounds.maxY - afterGraph.baseHeight) + afterGraph.carriedSummaryReserve,
    2
  );
  expect(afterGraph.viewBox[3] - before.viewBox[3]).toBeCloseTo(afterGraph.reserveBottom - before.reserveBottom, 2);
  expect(afterGraph.traceBounds.top - before.traceBounds.top).toBeCloseTo(graphReserve, 2);
  expect(afterGraph.traceBounds.bottom - before.traceBounds.bottom).toBeCloseTo(graphReserve, 2);
  expect(afterGraph.traceBounds.right - before.traceBounds.right).toBeCloseTo(0, 2);
  expect(afterGraph.traceBounds.left - before.traceBounds.left).toBeCloseTo(0, 2);

  await addLines(page, '#stage text[data-font-role="yTitle"]', ['Added Y title line 1', 'Added Y title line 2']);
  const afterY = await captureUpSetTitleGeometry(page);
  const yReserve = 2 * afterY.yLineHeight;
  expect(afterY.yLines).toHaveLength(3);
  afterY.yLines.slice(1).forEach((baseline, index) => {
    expect(baseline - afterY.yLines[index]).toBeCloseTo(afterY.yLineHeight, 2);
  });
  expect(afterY.reserveRight).toBeCloseTo(Math.max(0, afterY.contentBounds.maxX - afterY.baseWidth), 2);
  expect(afterY.viewBox[2] - afterGraph.viewBox[2]).toBeCloseTo(afterY.reserveRight - afterGraph.reserveRight, 2);
  expect(afterY.traceBounds.left - afterGraph.traceBounds.left).toBeCloseTo(yReserve, 2);
  expect(afterY.traceBounds.right - afterGraph.traceBounds.right).toBeCloseTo(yReserve, 2);
  expect(afterY.traceBounds.top).toBeCloseTo(afterGraph.traceBounds.top, 2);
  expect(afterY.traceBounds.bottom).toBeCloseTo(afterGraph.traceBounds.bottom, 2);

  await addLines(page, '#stage text[data-font-role="xTitle"]', ['Added X title line 1', 'Added X title line 2']);
  const afterX = await captureUpSetTitleGeometry(page);
  expect(afterX.xLines).toHaveLength(3);
  afterX.xLines.slice(1).forEach((baseline, index) => {
    expect(baseline - afterX.xLines[index]).toBeCloseTo(afterX.xLineHeight, 2);
  });
  expect(afterX.reserveBottom, 'UpSet bottom reserve must match settled content overflow after consuming existing clearance').toBeCloseTo(
    Math.max(0, afterX.contentBounds.maxY - afterX.baseHeight) + afterX.carriedSummaryReserve,
    2
  );
  expect(afterX.viewBox[3] - afterY.viewBox[3]).toBeCloseTo(afterX.reserveBottom - afterY.reserveBottom, 2);
  expect(afterX.traceBounds.left).toBeCloseTo(afterY.traceBounds.left, 2);
  expect(afterX.traceBounds.top).toBeCloseTo(afterY.traceBounds.top, 2);
  expect(afterX.traceBounds.right).toBeCloseTo(afterY.traceBounds.right, 2);
  expect(afterX.traceBounds.bottom).toBeCloseTo(afterY.traceBounds.bottom, 2);

  await page.evaluate(async () => {
    await window.Components?.venn?.draw?.({ reason: 'e2e-upset-title-reserve-redraw', force: true });
  });
  await waitForComponentOwnerReady(page, 'venn', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  const afterRedraw = await captureUpSetTitleGeometry(page);
  expect(afterRedraw.viewBox).toEqual(afterX.viewBox);
  expect(afterRedraw.reserveRight).toBeCloseTo(afterX.reserveRight, 2);
  expect(afterRedraw.reserveBottom).toBeCloseTo(afterX.reserveBottom, 2);
  expect(afterRedraw.traceBounds.left).toBeCloseTo(afterX.traceBounds.left, 2);
  expect(afterRedraw.traceBounds.top).toBeCloseTo(afterX.traceBounds.top, 2);
  expect(afterRedraw.traceBounds.right).toBeCloseTo(afterX.traceBounds.right, 2);
  expect(afterRedraw.traceBounds.bottom).toBeCloseTo(afterX.traceBounds.bottom, 2);
});

test('Venn graph title lines shift circles and extend the SVG only by measured overflow', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, {
    type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample'
  }, { first: true });
  await clickExpectedExampleButton(page, 'sample');
  const svg = page.locator('#vennPage:not([hidden]) #stage');
  await expect(svg.locator('[data-venn-trace-id]').first()).toBeAttached();
  const capture = () => svg.evaluate(node => {
    const title = node.querySelector('text[data-font-role="graphTitle"]');
    const lines = Array.from(title?.querySelectorAll('tspan[data-title-line="1"]') || []);
    const viewBox = String(node.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const contentBounds = node.getBBox();
    return {
      height: viewBox[3],
      baseHeight: Number(node.dataset.graphContentBaseHeight || viewBox[3]),
      contentMaxY: contentBounds.y + contentBounds.height,
      reserveBottom: Number(node.dataset.graphContentReserveBottom || 0),
      carriedSummaryReserve: node.dataset.statsFigureSummaryCarried === '1'
        ? Math.max(0, Number(node.dataset.statsFigureSummaryCarryReserveBottom) || 0)
        : 0,
      lineHeight: Number(title?.dataset?.titleLineHeight)
        || Number.parseFloat(getComputedStyle(title).fontSize)
        || Number.parseFloat(title?.getAttribute('font-size') || '')
        || 0,
      baselines: lines.map(line => Number(line.getAttribute('y'))),
      circles: Array.from(node.querySelectorAll('[data-venn-trace-id]')).map(circle => ({
        id: circle.dataset.vennTraceId,
        cx: Number(circle.getAttribute('cx')),
        cy: Number(circle.getAttribute('cy')),
        radius: Number(circle.getAttribute('r'))
      }))
    };
  });
  const before = await capture();
  await addLines(page, '#stage text[data-font-role="graphTitle"]', ['Added Venn title line 1', 'Added Venn title line 2']);
  const after = await capture();
  const reserve = 2 * after.lineHeight;
  expect(after.baselines).toHaveLength(3);
  after.baselines.slice(1).forEach((baseline, index) => {
    expect(baseline - after.baselines[index]).toBeCloseTo(after.lineHeight, 2);
  });
  expect(after.reserveBottom).toBeCloseTo(
    Math.max(0, after.contentMaxY - after.baseHeight) + after.carriedSummaryReserve,
    2
  );
  const neededViewportGrowth = after.reserveBottom - before.reserveBottom;
  expect(after.height - before.height).toBeCloseTo(neededViewportGrowth, 2);
  expect(neededViewportGrowth).toBeLessThan(reserve);
  expect(after.circles).toHaveLength(before.circles.length);
  after.circles.forEach((circle, index) => {
    expect(circle.id).toBe(before.circles[index].id);
    expect(circle.cx).toBeCloseTo(before.circles[index].cx, 2);
    expect(circle.cy - before.circles[index].cy).toBeCloseTo(reserve, 2);
    expect(circle.radius).toBeCloseTo(before.circles[index].radius, 2);
  });
  await page.evaluate(async () => {
    await window.Components?.venn?.draw?.({ reason: 'e2e-venn-title-reserve-redraw', force: true });
  });
  await waitForComponentOwnerReady(page, 'venn', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  const afterRedraw = await capture();
  expect(afterRedraw.height).toBeCloseTo(after.height, 2);
  expect(afterRedraw.reserveBottom).toBeCloseTo(after.reserveBottom, 2);
  expect(afterRedraw.circles).toEqual(after.circles);
});
