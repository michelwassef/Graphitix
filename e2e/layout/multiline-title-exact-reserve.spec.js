const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

test.setTimeout(120_000);

async function captureLineGeometry(page){
  return page.locator('#linePage:not([hidden]) #lineSvg').evaluate(svg => {
    const rootScreenInverse = svg.getScreenCTM()?.inverse?.() || null;
    const toRootPoint = (node, x, y) => {
      const point = svg.createSVGPoint();
      point.x = x;
      point.y = y;
      const screenPoint = point.matrixTransform(node.getScreenCTM());
      return rootScreenInverse ? screenPoint.matrixTransform(rootScreenInverse) : screenPoint;
    };
    const parse = node => {
      const first = toRootPoint(node, Number(node.getAttribute('x1')), Number(node.getAttribute('y1')));
      const second = toRootPoint(node, Number(node.getAttribute('x2')), Number(node.getAttribute('y2')));
      return { x1: first.x, y1: first.y, x2: second.x, y2: second.y };
    };
    const axisLines = Array.from(svg.querySelectorAll('line')).map(parse);
    const horizontal = axisLines
      .filter(line => Math.abs(line.y1 - line.y2) < 0.01 && Math.abs(line.x2 - line.x1) > 100)
      .sort((a, b) => b.y1 - a.y1)[0];
    const vertical = axisLines
      .filter(line => Math.abs(line.x1 - line.x2) < 0.01 && Math.abs(line.y2 - line.y1) > 100)
      .sort((a, b) => b.y2 - b.y1)[0];
    const graphTitle = svg.querySelector('text[data-font-role="graphTitle"]');
    const yTitle = svg.querySelector('text[data-font-role="yTitle"]');
    const xTitle = svg.querySelector('text[data-font-role="xTitle"]');
    const transformedBounds = element => {
      if(!element) return null;
      const lineNodes = Array.from(element.querySelectorAll('tspan[data-title-line="1"]'));
      const corners = (lineNodes.length ? lineNodes : [element]).flatMap(line => {
        const box = line.getBBox();
        return [
          [box.x, box.y], [box.x + box.width, box.y],
          [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]
          ].map(([x, y]) => toRootPoint(line, x, y));
      });
      return {
        left: Math.min(...corners.map(point => point.x)),
        right: Math.max(...corners.map(point => point.x)),
        top: Math.min(...corners.map(point => point.y)),
        bottom: Math.max(...corners.map(point => point.y))
      };
    };
    const graphTitleBounds = transformedBounds(graphTitle);
    const yTitleBounds = transformedBounds(yTitle);
    const xTitleBounds = transformedBounds(xTitle);
    const contentBounds = svg.getBBox();
    const viewBox = String(svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    return {
      viewBox,
      contentMaxX: Number(contentBounds.x + contentBounds.width),
      contentMaxY: Number(contentBounds.y + contentBounds.height),
      graphContentBaseWidth: Number(svg.dataset.graphContentBaseWidth),
      graphContentBaseHeight: Number(svg.dataset.graphContentBaseHeight),
      graphContentReserveRight: Number(svg.dataset.graphContentReserveRight),
      graphContentReserveBottom: Number(svg.dataset.graphContentReserveBottom),
      graphContentEnvelopeMaxY: Number(svg.dataset.graphContentEnvelopeMaxY),
      svgHeight: Number(svg.getAttribute('height')),
      graphTitleY: Number(graphTitle?.getAttribute('y')),
      graphTitleTop: graphTitleBounds?.top ?? null,
      graphTitleBottom: graphTitleBounds?.bottom ?? null,
      graphTitleText: graphTitle?.dataset?.titleBlockText || null,
      graphLineHeight: Number(graphTitle?.dataset?.titleLineHeight)
        || Number.parseFloat(getComputedStyle(graphTitle).fontSize),
      graphLineYs: Array.from(graphTitle?.querySelectorAll('tspan[data-title-line="1"]') || [])
        .map(line => Number(line.getAttribute('y'))),
      yTitleText: yTitle?.dataset?.titleBlockText ?? yTitle?.textContent ?? null,
      yLineHeight: Number(yTitle?.dataset?.titleLineHeight)
        || Number.parseFloat(getComputedStyle(yTitle).fontSize),
      yLineYs: Array.from(yTitle?.querySelectorAll('tspan[data-title-line="1"]') || [])
        .map(line => Number(line.getAttribute('y'))),
      yTitleRight: yTitleBounds?.right ?? null,
      yTitleLeft: yTitleBounds?.left ?? null,
      xTitleText: xTitle?.dataset?.titleBlockText ?? xTitle?.textContent ?? null,
      xTitleTop: xTitleBounds?.top ?? null,
      xLineHeight: Number(xTitle?.dataset?.titleLineHeight)
        || Number.parseFloat(getComputedStyle(xTitle).fontSize),
      xLineYs: Array.from(xTitle?.querySelectorAll('tspan[data-title-line="1"]') || [])
        .map(line => Number(line.getAttribute('y'))),
      plotTop: vertical ? Math.min(vertical.y1, vertical.y2) : null,
      plotLeft: vertical?.x1 ?? null,
      plotRight: horizontal ? Math.max(horizontal.x1, horizontal.x2) : null,
      plotBottom: horizontal?.y1 ?? null,
      plotWidth: horizontal ? Math.abs(horizontal.x2 - horizontal.x1) : null,
      plotHeight: vertical ? Math.abs(vertical.y2 - vertical.y1) : null
    };
  });
}

async function captureBoxGeometry(page){
  return page.locator('#boxPage:not([hidden]) #boxSvg').evaluate(svg => {
    const transformLine = line => {
      const matrix = line.getCTM();
      const point = (x, y) => {
        const value = svg.createSVGPoint();
        value.x = Number(x);
        value.y = Number(y);
        return value.matrixTransform(matrix);
      };
      return [
        point(line.getAttribute('x1'), line.getAttribute('y1')),
        point(line.getAttribute('x2'), line.getAttribute('y2'))
      ];
    };
    const axes = Array.from(svg.querySelectorAll('line[data-box-primary-axis]')).map(line => ({
      role: line.getAttribute('data-box-primary-axis'),
      points: transformLine(line)
    }));
    const horizontal = axes.filter(axis => axis.role === 'x').flatMap(axis => axis.points)
      .sort((a, b) => b.y - a.y)[0];
    const vertical = axes.filter(axis => axis.role === 'y').flatMap(axis => axis.points)
      .sort((a, b) => a.x - b.x)[0];
    const graphTitle = svg.querySelector('text[data-font-role="graphTitle"]');
    const yTitle = svg.querySelector('text[data-font-role="yTitle"]');
    const transformedBounds = element => {
      if(!element) return null;
      const lineNodes = Array.from(element.querySelectorAll('tspan[data-title-line="1"]'));
      const corners = (lineNodes.length ? lineNodes : [element]).flatMap(line => {
        const box = line.getBBox();
        const matrix = line.getCTM();
        return [
          [box.x, box.y], [box.x + box.width, box.y],
          [box.x, box.y + box.height], [box.x + box.width, box.y + box.height]
        ].map(([x, y]) => {
          const point = svg.createSVGPoint();
          point.x = x;
          point.y = y;
          return point.matrixTransform(matrix);
        });
      });
      return {
        left: Math.min(...corners.map(point => point.x)),
        right: Math.max(...corners.map(point => point.x)),
        top: Math.min(...corners.map(point => point.y)),
        bottom: Math.max(...corners.map(point => point.y))
      };
    };
    const graphTitleBounds = transformedBounds(graphTitle);
    const yTitleBounds = transformedBounds(yTitle);
    const textBounds = Array.from(svg.querySelectorAll('text')).map(transformedBounds).filter(Boolean);
    return {
      viewBox: String(svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number),
      svgHeight: Number(svg.getAttribute('height')),
      contentBottom: Math.max(...textBounds.map(bounds => bounds.bottom)),
      graphTitleY: Number(graphTitle?.getAttribute('y')),
      graphTitleTop: graphTitleBounds?.top ?? null,
      graphTitleBottom: graphTitleBounds?.bottom ?? null,
      graphLineHeight: Number(graphTitle?.dataset?.titleLineHeight)
        || Number.parseFloat(getComputedStyle(graphTitle).fontSize),
      graphLineYs: Array.from(graphTitle?.querySelectorAll('tspan[data-title-line="1"]') || [])
        .map(line => Number(line.getAttribute('y'))),
      yLineHeight: Number(yTitle?.dataset?.titleLineHeight)
        || Number.parseFloat(getComputedStyle(yTitle).fontSize),
      yLineYs: Array.from(yTitle?.querySelectorAll('tspan[data-title-line="1"]') || [])
        .map(line => Number(line.getAttribute('y'))),
      yTitleRight: yTitleBounds?.right ?? null,
      yTitleLeft: yTitleBounds?.left ?? null,
      yTitleTop: yTitleBounds?.top ?? null,
      yTitleBottom: yTitleBounds?.bottom ?? null,
      plotLeft: vertical?.x ?? null,
      plotTop: vertical ? Math.min(...axes.filter(axis => axis.role === 'y')
        .flatMap(axis => axis.points.map(point => point.y))) : null,
      plotBottom: horizontal?.y ?? null,
      plotWidth: horizontal && axes.find(axis => axis.role === 'x')
        ? Math.abs(axes.find(axis => axis.role === 'x').points[1].x - axes.find(axis => axis.role === 'x').points[0].x)
        : null,
      plotHeight: vertical && axes.find(axis => axis.role === 'y')
        ? Math.abs(axes.find(axis => axis.role === 'y').points[1].y - axes.find(axis => axis.role === 'y').points[0].y)
        : null
    };
  });
}

async function editTitleWithEnter(page, selector, extraLines, whileEditing = null){
  const title = page.locator(selector).first();
  await expect(title).toBeAttached();
  const titleFontSize = await title.evaluate(node => Number.parseFloat(getComputedStyle(node).fontSize));
  const initial = await title.evaluate(node => node.dataset.titleBlockText || node.textContent || '');
  await title.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  const editorLineHeight = await editor.evaluate(node => Number.parseFloat(getComputedStyle(node).lineHeight));
  expect(editorLineHeight).toBeCloseTo(titleFontSize, 2);
  await editor.fill(initial);
  for(let index = 0; index < extraLines; index += 1){
    await editor.press('Enter');
    await editor.type(`Added line ${index + 1}`);
  }
  await expect(editor).toBeVisible();
  if(typeof whileEditing === 'function') await whileEditing({ editor, title });
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  return `${initial}${Array.from({ length: extraLines }, (_, index) => `\nAdded line ${index + 1}`).join('')}`;
}

test('Line 2D adds exactly one line-height to graph and rotated Y-title reserves', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, {
    type: 'line',
    pageId: 'linePage',
    exampleButtonId: 'lineLoadExample'
  }, { first: true, loadExample: true });

  const svg = page.locator('#linePage:not([hidden]) #lineSvg');
  await expect(svg).toBeVisible();
  const beforeTitle = await captureLineGeometry(page);
  expect(beforeTitle.plotLeft).not.toBeNull();
  expect(beforeTitle.plotBottom).not.toBeNull();

  const graphText = await editTitleWithEnter(page, '#lineSvg text[data-font-role="graphTitle"]', 1, async ({ editor }) => {
    const alignmentControls = page.locator('.font-controls-panel__controls');
    const colorField = alignmentControls.locator('.font-controls-panel__field--color');
    const alignmentField = alignmentControls.locator('.font-controls-panel__field--alignment');
    await expect(alignmentField).toBeVisible();
    expect(await colorField.evaluate(node => node.nextElementSibling === node.parentElement.querySelector('.font-controls-panel__field--alignment'))).toBe(true);
    const alignRight = page.getByRole('button', { name: 'Align right' });
    await expect(alignRight).toBeEnabled();
    await alignRight.click();
    await expect(editor).toBeVisible();
  });
  await expect.poll(async () => (await captureLineGeometry(page)).graphTitleText).toBe(graphText);
  const afterTitle = await captureLineGeometry(page);
  const graphLineHeight = afterTitle.graphLineHeight;
  expect(afterTitle.graphLineYs).toHaveLength(2);
  expect(afterTitle.graphLineYs[1] - afterTitle.graphLineYs[0]).toBeCloseTo(graphLineHeight, 2);
  expect(graphLineHeight).toBeCloseTo(Number.parseFloat(await svg.locator('text[data-font-role="graphTitle"]').first().evaluate(node => getComputedStyle(node).fontSize)), 2);
  expect(afterTitle.graphTitleBottom - afterTitle.graphTitleTop
    - (beforeTitle.graphTitleBottom - beforeTitle.graphTitleTop)).toBeCloseTo(graphLineHeight, 1);
  const previousGraphViewportBottom = beforeTitle.viewBox[1] + beforeTitle.viewBox[3];
  const expectedGraphBottomExtension = Math.max(0, afterTitle.contentMaxY - previousGraphViewportBottom);
  expect(afterTitle.graphContentReserveBottom - beforeTitle.graphContentReserveBottom)
    .toBeCloseTo(expectedGraphBottomExtension, 2);
  expect(afterTitle.svgHeight - beforeTitle.svgHeight).toBeCloseTo(expectedGraphBottomExtension, 2);
  expect(afterTitle.viewBox[1] + afterTitle.viewBox[3]
    - beforeTitle.viewBox[1] - beforeTitle.viewBox[3]).toBeCloseTo(expectedGraphBottomExtension, 2);
  expect(afterTitle.contentMaxY).toBeLessThanOrEqual(afterTitle.viewBox[1] + afterTitle.viewBox[3] + 0.5);
  expect(afterTitle.graphTitleY).toBeCloseTo(beforeTitle.graphTitleY, 2);
  expect(afterTitle.plotBottom - beforeTitle.plotBottom).toBeCloseTo(graphLineHeight, 2);
  expect(beforeTitle.plotTop - beforeTitle.graphTitleBottom)
    .toBeCloseTo(afterTitle.plotTop - afterTitle.graphTitleBottom, 1);
  expect(afterTitle.plotWidth).toBeCloseTo(beforeTitle.plotWidth, 2);
  expect(afterTitle.plotHeight).toBeCloseTo(beforeTitle.plotHeight, 2);
  const graphTitle = svg.locator('text[data-font-role="graphTitle"]').first();
  await expect.poll(() => graphTitle.evaluate(node => node.dataset.titleTextAlign)).toBe('right');
  expect(await graphTitle.locator('tspan[data-title-line="1"]').evaluateAll(rows => rows.map(row => row.getAttribute('text-anchor'))))
    .toEqual(['end', 'end']);
  const persistedAlignment = await page.evaluate(async () => {
    const state = window.Main?.session?.workspaceState;
    const tabId = state?.activeTabId || null;
    const payload = await Promise.resolve(window.Components?.line?.getPayload?.({ tabId }));
    return payload?.config?.fontStyles?.graphTitle?.textAlign || null;
  });
  expect(persistedAlignment).toBe('right');

  const beforeYTitle = afterTitle;
  const yText = await editTitleWithEnter(page, '#lineSvg text[data-font-role="yTitle"]', 2);
  await expect.poll(async () => (await captureLineGeometry(page)).yTitleText).toBe(yText);
  const afterYTitle = await captureLineGeometry(page);
  const yReserve = 2 * afterYTitle.yLineHeight;
  expect(afterYTitle.yLineYs).toHaveLength(3);
  expect(afterYTitle.yLineYs[1] - afterYTitle.yLineYs[0]).toBeCloseTo(afterYTitle.yLineHeight, 2);
  expect(afterYTitle.yLineYs[2] - afterYTitle.yLineYs[1]).toBeCloseTo(afterYTitle.yLineHeight, 2);
  const beforeRightEdge = beforeYTitle.viewBox[0] + beforeYTitle.viewBox[2];
  const afterRightEdge = afterYTitle.viewBox[0] + afterYTitle.viewBox[2];
  const beforeRightSlack = beforeRightEdge - beforeYTitle.plotRight;
  const afterRightSlack = afterRightEdge - afterYTitle.plotRight;
  expect(afterYTitle.viewBox[2]).toBeCloseTo(beforeYTitle.viewBox[2], 2);
  expect(afterRightSlack).toBeCloseTo(beforeRightSlack - yReserve, 2);
  expect(afterRightSlack).toBeGreaterThan(0);
  expect(afterYTitle.plotLeft - beforeYTitle.plotLeft).toBeCloseTo(yReserve, 2);
  expect(afterYTitle.yTitleRight - beforeYTitle.yTitleRight).toBeCloseTo(yReserve, 2);
  expect(beforeYTitle.plotLeft - beforeYTitle.yTitleRight)
    .toBeCloseTo(afterYTitle.plotLeft - afterYTitle.yTitleRight, 1);
  expect(afterYTitle.plotBottom).toBeCloseTo(beforeYTitle.plotBottom, 2);
  expect(afterYTitle.plotWidth).toBeCloseTo(beforeYTitle.plotWidth, 2);
  expect(afterYTitle.plotHeight).toBeCloseTo(beforeYTitle.plotHeight, 2);

  const beforeXTitle = afterYTitle;
  const xText = await editTitleWithEnter(page, '#lineSvg text[data-font-role="xTitle"]', 2);
  await expect.poll(async () => (await captureLineGeometry(page)).xTitleText).toBe(xText);
  const afterXTitle = await captureLineGeometry(page);
  const previousXViewportBottom = beforeXTitle.viewBox[1] + beforeXTitle.viewBox[3];
  const expectedXTitleExtension = Math.max(0, afterXTitle.contentMaxY - previousXViewportBottom);
  expect(afterXTitle.xLineYs).toHaveLength(3);
  expect(afterXTitle.xLineYs[1] - afterXTitle.xLineYs[0]).toBeCloseTo(afterXTitle.xLineHeight, 2);
  expect(afterXTitle.xLineYs[2] - afterXTitle.xLineYs[1]).toBeCloseTo(afterXTitle.xLineHeight, 2);
  expect(afterXTitle.graphContentReserveBottom - beforeXTitle.graphContentReserveBottom)
    .toBeCloseTo(expectedXTitleExtension, 2);
  expect(afterXTitle.viewBox[1] + afterXTitle.viewBox[3]
    - beforeXTitle.viewBox[1] - beforeXTitle.viewBox[3]).toBeCloseTo(expectedXTitleExtension, 2);
  expect(afterXTitle.contentMaxY).toBeLessThanOrEqual(
    afterXTitle.viewBox[1] + afterXTitle.viewBox[3] + 0.5
  );
  expect(afterXTitle.plotLeft).toBeCloseTo(beforeXTitle.plotLeft, 2);
  expect(afterXTitle.plotBottom).toBeCloseTo(beforeXTitle.plotBottom, 2);
  expect(afterXTitle.xTitleTop).toBeGreaterThan(afterXTitle.plotBottom);
  expect(afterXTitle.plotWidth).toBeCloseTo(beforeXTitle.plotWidth, 2);
  expect(afterXTitle.plotHeight).toBeCloseTo(beforeXTitle.plotHeight, 2);

});

test('Box normal and flipped axes reserve exact title line-heights without shrinking the plot', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, {
    type: 'box',
    pageId: 'boxPage',
    exampleButtonId: 'boxLoadExample'
  }, { first: true, loadExample: true });

  const svg = page.locator('#boxPage:not([hidden]) #boxSvg');
  await expect(svg).toBeVisible();
  const before = await captureBoxGeometry(page);
  expect(before.plotLeft).not.toBeNull();
  expect(before.plotBottom).not.toBeNull();

  const graphExtraLines = Math.ceil((before.viewBox[1] + before.viewBox[3] - before.plotBottom) / before.graphLineHeight) + 1;
  const graphReserve = graphExtraLines * before.graphLineHeight;
  const graphText = await editTitleWithEnter(page, '#boxSvg text[data-font-role="graphTitle"]', graphExtraLines);
  await expect.poll(async () => (await svg.locator('text[data-font-role="graphTitle"]').first().evaluate(
    node => node.dataset.titleBlockText || node.textContent
  ))).toBe(graphText);
  const afterGraphTitle = await captureBoxGeometry(page);
  expect(afterGraphTitle.graphLineYs).toHaveLength(graphExtraLines + 1);
  afterGraphTitle.graphLineYs.slice(1).forEach((baseline, index) => {
    expect(baseline - afterGraphTitle.graphLineYs[index]).toBeCloseTo(afterGraphTitle.graphLineHeight, 2);
  });
  expect(afterGraphTitle.graphLineHeight).toBeCloseTo(Number.parseFloat(await svg.locator('text[data-font-role="graphTitle"]').first().evaluate(node => getComputedStyle(node).fontSize)), 2);
  expect(afterGraphTitle.graphTitleBottom - afterGraphTitle.graphTitleTop
    - (before.graphTitleBottom - before.graphTitleTop)).toBeCloseTo(graphReserve, 1);
  expect(afterGraphTitle.graphTitleY).toBeCloseTo(before.graphTitleY, 2);
  const bottomExtension = afterGraphTitle.viewBox[1] + afterGraphTitle.viewBox[3]
    - before.viewBox[1] - before.viewBox[3];
  const existingContentClearance = before.viewBox[1] + before.viewBox[3] - before.contentBottom;
  expect(bottomExtension).toBeCloseTo(Math.max(0, graphReserve - existingContentClearance), 1);
  expect(afterGraphTitle.svgHeight - before.svgHeight).toBeCloseTo(bottomExtension, 2);
  expect(afterGraphTitle.contentBottom).toBeLessThanOrEqual(afterGraphTitle.viewBox[1] + afterGraphTitle.viewBox[3] + 0.5);
  expect(afterGraphTitle.plotBottom - before.plotBottom).toBeCloseTo(graphReserve, 1);
  expect(before.plotTop - before.graphTitleBottom)
    .toBeCloseTo(afterGraphTitle.plotTop - afterGraphTitle.graphTitleBottom, 1);
  expect(afterGraphTitle.plotLeft).toBeCloseTo(before.plotLeft, 2);
  expect(afterGraphTitle.plotWidth).toBeCloseTo(before.plotWidth, 2);
  expect(afterGraphTitle.plotHeight).toBeCloseTo(before.plotHeight, 2);

  const axisText = await editTitleWithEnter(page, '#boxSvg text[data-box-axis-title="y"]', 2);
  await expect.poll(async () => (await svg.locator('text[data-box-axis-title="y"]').first().evaluate(
    node => node.dataset.titleBlockText || node.textContent
  ))).toBe(axisText);
  const afterYAxis = await captureBoxGeometry(page);
  const axisReserve = 2 * afterYAxis.yLineHeight;
  expect(afterYAxis.yLineYs).toHaveLength(3);
  expect(afterYAxis.yLineYs[1] - afterYAxis.yLineYs[0]).toBeCloseTo(afterYAxis.yLineHeight, 2);
  expect(afterYAxis.yLineYs[2] - afterYAxis.yLineYs[1]).toBeCloseTo(afterYAxis.yLineHeight, 2);
  expect(afterYAxis.plotLeft - afterGraphTitle.plotLeft).toBeCloseTo(axisReserve, 2);
  expect(afterYAxis.graphTitleY).toBeCloseTo(afterGraphTitle.graphTitleY, 2);
  expect(afterGraphTitle.plotLeft - afterGraphTitle.yTitleRight)
    .toBeCloseTo(afterYAxis.plotLeft - afterYAxis.yTitleRight, 1);
  expect(afterYAxis.plotBottom).toBeCloseTo(afterGraphTitle.plotBottom, 1);
  expect(afterYAxis.plotWidth).toBeCloseTo(afterGraphTitle.plotWidth, 1);
  expect(afterYAxis.plotHeight).toBeCloseTo(afterGraphTitle.plotHeight, 1);

  await page.locator('#boxPage:not([hidden]) #boxFlipAxes').check();
  await expect.poll(() => svg.locator('text[data-box-axis-title="x"]').count()).toBeGreaterThan(0);
  const beforeFlippedAxisEdit = await captureBoxGeometry(page);
  const flippedAxisText = await editTitleWithEnter(page, '#boxSvg text[data-font-role="yTitle"]', 2);
  await expect.poll(async () => (await svg.locator('text[data-font-role="yTitle"]').first().evaluate(
    node => node.dataset.titleBlockText || node.textContent
  ))).toBe(flippedAxisText);
  const afterFlippedAxisEdit = await captureBoxGeometry(page);
  const flippedReserve = 2 * afterFlippedAxisEdit.yLineHeight;
  expect(afterFlippedAxisEdit.yLineYs).toHaveLength(5);
  expect(afterFlippedAxisEdit.yLineYs[1] - afterFlippedAxisEdit.yLineYs[0]).toBeCloseTo(afterFlippedAxisEdit.yLineHeight, 2);
  expect(afterFlippedAxisEdit.yLineYs[2] - afterFlippedAxisEdit.yLineYs[1]).toBeCloseTo(afterFlippedAxisEdit.yLineHeight, 2);
  expect(afterFlippedAxisEdit.yLineYs[3] - afterFlippedAxisEdit.yLineYs[2]).toBeCloseTo(afterFlippedAxisEdit.yLineHeight, 2);
  expect(afterFlippedAxisEdit.yLineYs[4] - afterFlippedAxisEdit.yLineYs[3]).toBeCloseTo(afterFlippedAxisEdit.yLineHeight, 2);
  expect(afterFlippedAxisEdit.viewBox[1]).toBeCloseTo(beforeFlippedAxisEdit.viewBox[1], 2);
  expect(afterFlippedAxisEdit.viewBox[1] + afterFlippedAxisEdit.viewBox[3]
    - beforeFlippedAxisEdit.viewBox[1] - beforeFlippedAxisEdit.viewBox[3]).toBeCloseTo(flippedReserve, 2);
  expect(afterFlippedAxisEdit.svgHeight - beforeFlippedAxisEdit.svgHeight).toBeCloseTo(flippedReserve, 2);
  expect(afterFlippedAxisEdit.yTitleBottom - beforeFlippedAxisEdit.yTitleBottom).toBeCloseTo(flippedReserve, 1);
  expect(afterFlippedAxisEdit.plotLeft).toBeCloseTo(beforeFlippedAxisEdit.plotLeft, 2);
  expect(afterFlippedAxisEdit.plotBottom).toBeCloseTo(beforeFlippedAxisEdit.plotBottom, 2);
  expect(beforeFlippedAxisEdit.yTitleTop - beforeFlippedAxisEdit.plotBottom)
    .toBeCloseTo(afterFlippedAxisEdit.yTitleTop - afterFlippedAxisEdit.plotBottom, 1);
  expect(afterFlippedAxisEdit.plotWidth).toBeCloseTo(beforeFlippedAxisEdit.plotWidth, 2);
  expect(afterFlippedAxisEdit.plotHeight).toBeCloseTo(beforeFlippedAxisEdit.plotHeight, 2);
});
