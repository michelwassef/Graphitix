const { test, expect } = require('@playwright/test');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

const CARTESIAN_COMPONENTS = [
  { type: 'box', pageId: 'boxPage' },
  { type: 'scatter', pageId: 'scatterPage' },
  { type: 'pca', pageId: 'pcaPage' },
  { type: 'line', pageId: 'linePage' },
  { type: 'roc', pageId: 'rocPage' },
  { type: 'survival', pageId: 'survivalPage' },
  { type: 'hist', pageId: 'histPage' },
  { type: 'pie', pageId: 'piePage', stacked: true }
];

async function captureCartesianTitleGeometry(svg){
  return svg.evaluate(node => {
    const bounds = node.getBBox();
    const rootInverse = node.getScreenCTM()?.inverse?.() || null;
    const firstLineBaseline = role => {
      const title = node.querySelector(`text[data-font-role="${role}"]`);
      const line = title?.querySelector('tspan[data-title-line="1"]') || title;
      if(!line) return null;
      const baseline = Number(line.getAttribute('y') || title.getAttribute('y'));
      if(!Number.isFinite(baseline)) return null;
      const point = node.createSVGPoint();
      point.x = 0;
      point.y = baseline;
      const matrix = line.getScreenCTM();
      return rootInverse && matrix ? point.matrixTransform(matrix).matrixTransform(rootInverse).y : baseline;
    };
    return {
      plotX: Number(node.dataset.cartesianPlotX),
      plotY: Number(node.dataset.cartesianPlotY),
      plotWidth: Number(node.dataset.cartesianPlotWidth),
      plotHeight: Number(node.dataset.cartesianPlotHeight),
      titleBaselines: {
        graph: firstLineBaseline('graphTitle'),
        x: firstLineBaseline('xTitle'),
        y: firstLineBaseline('yTitle')
      },
      translationX: Number(node.dataset.cartesianPlotTranslationX),
      translationY: Number(node.dataset.cartesianPlotTranslationY),
      requiredLeft: Number(node.dataset.cartesianRequiredLeft),
      baselineLeft: Number(node.dataset.cartesianBaselineLeft),
      generation: Number(node.dataset.cartesianLayoutGeneration),
      layout: {
        userHeight: Number(node.dataset.cartesianUserHeight),
        baselineBottom: Number(node.dataset.cartesianBaselineBottom),
        requiredBottom: Number(node.dataset.cartesianRequiredBottom),
        plotBottom: Number(node.dataset.cartesianPlotY) + Number(node.dataset.cartesianPlotHeight),
        planBottomReserve: Number(node.__cartesianLayoutPlan?.contentEnvelope?.extensionBottom),
        planRightReserve: Number(node.__cartesianLayoutPlan?.contentEnvelope?.extensionRight),
        titleLineExtensions: node.__cartesianLayoutPlan?.titleLineExtensions || null
      },
      baseWidth: Number(node.dataset.graphContentBaseWidth),
      baseHeight: Number(node.dataset.graphContentBaseHeight),
      renderedScaleY: Number(node.dataset.graphContentRenderedScaleY),
      svgHeight: Number(node.getAttribute('height')),
      reserves: {
        left: Number(node.dataset.graphContentReserveLeft) || 0,
        right: Number(node.dataset.graphContentReserveRight) || 0,
        top: Number(node.dataset.graphContentReserveTop) || 0,
        bottom: Number(node.dataset.graphContentReserveBottom) || 0
      },
      summaryCarry: node.dataset.statsFigureSummaryCarried === '1'
        ? Number(node.dataset.statsFigureSummaryCarryReserveBottom) || 0
        : 0,
      summaryReserve: node.querySelector('g[data-stats-figure-summary="1"]')
        ? Number(node.dataset.statsFigureSummaryReserveBottom) || 0
        : 0,
      contentBounds: {
        minX: Number(bounds.x),
        minY: Number(bounds.y),
        maxX: Number(bounds.x + bounds.width),
        maxY: Number(bounds.y + bounds.height)
      },
      viewBox: String(node.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number)
    };
  });
}

function expectViewportToMatchMeasuredOverflow(before, after, componentType, role){
  const expected = {
    left: Math.max(before.reserves.left, -after.contentBounds.minX, 0),
    right: Math.max(
      before.reserves.right,
      after.contentBounds.maxX - after.baseWidth,
      0
    ),
    top: Math.max(before.reserves.top, -after.contentBounds.minY, 0),
    bottom: Math.max(
      before.reserves.bottom,
      after.contentBounds.maxY - after.baseHeight + after.summaryCarry,
      after.summaryReserve,
      0
    )
  };
  for(const side of ['left', 'right', 'top', 'bottom']){
    expect(after.reserves[side], `${componentType} ${role} title ${side} reserve ${JSON.stringify({ before, after, expected })}`)
      // SVG viewport and measured text bounds can differ by a fraction of a
      // CSS pixel across redraws; keep the geometry error below half a pixel.
      .toBeCloseTo(expected[side], 0);
  }
}

async function addTitleLines(page, svg, role, componentType, addedLineCount = 3){
  const title = svg.locator(`text[data-font-role="${role}"]`).first();
  if(await title.count() === 0) return false;
  const before = await captureCartesianTitleGeometry(svg);
  const initial = await title.evaluate(node => node.dataset.titleBlockText || node.textContent || '');
  await title.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  await editor.fill(initial);
  await editor.press('End');
  const addedLines = [];
  for(let index = 0; index < addedLineCount; index += 1){
    const line = `Added ${role} line ${index + 1}`;
    addedLines.push(line);
    await editor.press('Enter');
    await editor.type(line);
  }
  await expect(editor).toBeVisible();
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await expect.poll(() => svg.locator(`text[data-font-role="${role}"]`).first().evaluate(
    node => node.dataset.titleBlockText || node.textContent || ''
  )).toBe([initial, ...addedLines].join('\n'));
  await waitForComponentOwnerReady(page, componentType, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 30_000
  });

  const after = await svg.evaluate((node, targetRole) => {
    const text = node.querySelector(`text[data-font-role="${targetRole}"]`);
    const lines = Array.from(text?.querySelectorAll('tspan[data-title-line="1"]') || []);
    return {
      lineHeight: Number(text?.dataset?.titleLineHeight) || Number.parseFloat(getComputedStyle(text).fontSize),
      baselines: lines.map(line => Number(line.getAttribute('y'))),
      plotX: Number(node.dataset.cartesianPlotX),
      plotY: Number(node.dataset.cartesianPlotY),
      plotWidth: Number(node.dataset.cartesianPlotWidth),
      plotHeight: Number(node.dataset.cartesianPlotHeight),
      translationX: Number(node.dataset.cartesianPlotTranslationX),
      requiredLeft: Number(node.dataset.cartesianRequiredLeft),
      baselineLeft: Number(node.dataset.cartesianBaselineLeft),
      layout: {
        userHeight: Number(node.dataset.cartesianUserHeight),
        baselineBottom: Number(node.dataset.cartesianBaselineBottom),
        requiredBottom: Number(node.dataset.cartesianRequiredBottom),
        plotBottom: Number(node.dataset.cartesianPlotY) + Number(node.dataset.cartesianPlotHeight),
        planBottomReserve: Number(node.__cartesianLayoutPlan?.contentEnvelope?.extensionBottom),
        planRightReserve: Number(node.__cartesianLayoutPlan?.contentEnvelope?.extensionRight),
        titleLineExtensions: node.__cartesianLayoutPlan?.titleLineExtensions || null
      },
      baseWidth: Number(node.dataset.graphContentBaseWidth),
      baseHeight: Number(node.dataset.graphContentBaseHeight),
      viewBox: String(node.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number),
      renderedScaleY: Number(node.dataset.graphContentRenderedScaleY),
      svgHeight: Number(node.getAttribute('height')),
      reserves: {
        left: Number(node.dataset.graphContentReserveLeft) || 0,
        right: Number(node.dataset.graphContentReserveRight) || 0,
        top: Number(node.dataset.graphContentReserveTop) || 0,
        bottom: Number(node.dataset.graphContentReserveBottom) || 0
      },
      summaryCarry: node.dataset.statsFigureSummaryCarried === '1'
        ? Number(node.dataset.statsFigureSummaryCarryReserveBottom) || 0
        : 0,
      summaryReserve: node.querySelector('g[data-stats-figure-summary="1"]')
        ? Number(node.dataset.statsFigureSummaryReserveBottom) || 0
        : 0,
      contentBounds: (() => {
        const bounds = node.getBBox();
        return {
          minX: Number(bounds.x),
          minY: Number(bounds.y),
          maxX: Number(bounds.x + bounds.width),
          maxY: Number(bounds.y + bounds.height)
        };
      })(),
      generation: Number(node.dataset.cartesianLayoutGeneration),
      generatedText: text?.dataset?.pcaAxisGeneratedLabel || null
    };
  }, role);
  const afterLayout = await captureCartesianTitleGeometry(svg);
  if(componentType === 'pca' && role !== 'graphTitle'){
    await expect.poll(() => title.evaluate(node => node.dataset.pcaAxisGeneratedLabel || ''))
      .toBe([initial, ...addedLines].join('\n'));
  }
  expect(after.baselines).toHaveLength(addedLineCount + 1);
  const renderedFontSize = await svg.locator(`text[data-font-role="${role}"]`).first().evaluate(
    node => Number.parseFloat(getComputedStyle(node).fontSize)
  );
  expect(after.lineHeight).toBeCloseTo(renderedFontSize, 2);
  for(let index = 1; index < after.baselines.length; index += 1){
    expect(after.baselines[index] - after.baselines[index - 1]).toBeCloseTo(after.lineHeight, 2);
  }
  expect(after.plotWidth).toBeCloseTo(before.plotWidth, 2);
  expect(after.plotHeight).toBeCloseTo(before.plotHeight, 2);
  expect(after.baseWidth).toBeCloseTo(before.baseWidth, 2);
  expect(after.baseHeight).toBeCloseTo(before.baseHeight, 2);
  expectViewportToMatchMeasuredOverflow(before, after, componentType, role);
  expect(after.viewBox[0], `${componentType} ${role} viewBox origin X`).toBeCloseTo(-after.reserves.left, 2);
  expect(after.viewBox[1], `${componentType} ${role} viewBox origin Y`).toBeCloseTo(-after.reserves.top, 2);
  expect(after.viewBox[2] - after.baseWidth, `${componentType} ${role} exact SVG width reserve`)
    .toBeCloseTo(after.reserves.left + after.reserves.right, 2);
  expect(after.viewBox[3] - after.baseHeight, `${componentType} ${role} exact SVG height reserve`)
    .toBeCloseTo(after.reserves.top + after.reserves.bottom, 2);
  if(role === 'yTitle'){
    expect(after.plotX - before.plotX, `${componentType} Y-title reserve: ${JSON.stringify({ before, after })}`)
      .toBeCloseTo(addedLineCount * after.lineHeight, 2);
    expect(after.plotY).toBeCloseTo(before.plotY, 2);
  }else if(role === 'graphTitle'){
    expect(after.plotY - before.plotY, `${componentType} graph-title reserve: ${JSON.stringify({ before, after })}`)
      .toBeCloseTo(addedLineCount * after.lineHeight, 2);
    expect(after.plotX).toBeCloseTo(before.plotX, 2);
    if(Number.isFinite(before.titleBaselines.x) && Number.isFinite(afterLayout.titleBaselines.x)){
      expect(afterLayout.titleBaselines.x - before.titleBaselines.x,
        `${componentType} graph title must move the X title with the plot: ${JSON.stringify({ before, afterLayout })}`)
        .toBeCloseTo(after.plotY - before.plotY, 2);
    }
  }else{
    expect(after.plotX).toBeCloseTo(before.plotX, 2);
    expect(after.plotY).toBeCloseTo(before.plotY, 2);
  }
  return true;
}

test.setTimeout(120_000);

for(const component of CARTESIAN_COMPONENTS){
  test(`${component.type} applicable X/Y titles use exact shared Cartesian reserves`, async ({ page }) => {
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component.type, {
      requireMountedRoot: true,
      requireIdle: true,
      timeout: 30_000
    });
    if(component.stacked){
      await page.locator('#pieChartType').selectOption('stacked');
      await waitForComponentOwnerReady(page, component.type, {
        requireMountedRoot: true,
        requireIdle: true,
        timeout: 30_000
      });
    }
    const svg = page.locator(`#${component.pageId}:not([hidden]) .svgbox svg`).first();
    await expect(svg).toHaveAttribute('data-cartesian-layout-complete', 'true');
    expect(await addTitleLines(page, svg, 'graphTitle', component.type)).toBe(true);
    // Box and Pie do not expose editable Y-axis titles. Any internal Y-role
    // text in those renderers is not an axis-title editing surface.
    if(component.type !== 'box' && component.type !== 'pie'){
      expect(await addTitleLines(page, svg, 'yTitle', component.type)).toBe(true);
    }
    const hasXTitle = await addTitleLines(page, svg, 'xTitle', component.type);
    if(component.type === 'box' || component.type === 'pie'){
      expect(hasXTitle).toBe(false);
    }else{
      expect(hasXTitle).toBe(true);
    }
  });
}
