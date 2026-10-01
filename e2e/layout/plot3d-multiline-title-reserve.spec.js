const { test, expect } = require('@playwright/test');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { openComponentFromWelcome, clickExpectedExampleButton } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

async function read3dTitleGeometry(page){
  return page.evaluate(() => {
    const svg = document.querySelector('#scatterPage:not([hidden]) #scatterPlot #scatterSvg');
    const title = svg?.querySelector('text[data-font-role="graphTitle"]') || null;
    const lines = Array.from(title?.querySelectorAll('tspan[data-title-line="1"]') || []);
    const points = svg?.querySelector('g[data-layer="points"]') || null;
    const pointBox = points?.getBBox?.() || null;
    const viewBox = String(svg?.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const svgBox = svg?.closest('.svgbox') || null;
    const frame = svgBox?.getBoundingClientRect?.() || null;
    const frameStyle = svgBox ? getComputedStyle(svgBox) : null;
    const frameFlowHeight = frame
      ? frame.height + (Number.parseFloat(frameStyle?.marginTop || '0') || 0) + (Number.parseFloat(frameStyle?.marginBottom || '0') || 0)
      : 0;
    const frameFlowWidth = frame
      ? frame.width + (Number.parseFloat(frameStyle?.marginLeft || '0') || 0) + (Number.parseFloat(frameStyle?.marginRight || '0') || 0)
      : 0;
    const axes = ['xTitle', 'yTitle', 'zTitle'].map(role => {
      const node = svg?.querySelector(`text[data-font-role="${role}"]`) || null;
      const axisLines = Array.from(node?.querySelectorAll('tspan[data-title-line="1"]') || []);
      return {
        text: node?.dataset?.titleBlockText || node?.textContent || '',
        lineHeight: Number(node?.dataset?.titleLineHeight) || Number.parseFloat(node?.getAttribute('font-size') || '') || 0,
        baselines: axisLines.length ? axisLines.map(line => Number(line.getAttribute('y'))) : (node ? [Number(node.getAttribute('y'))] : [])
      };
    });
    return {
      titleText: title?.dataset?.titleBlockText || title?.textContent || '',
      titleLineHeight: Number(title?.dataset?.titleLineHeight) || Number.parseFloat(title?.getAttribute('font-size') || '') || 0,
      titleBaselines: lines.length
        ? lines.map(line => Number(line.getAttribute('y')))
        : (title ? [Number(title.getAttribute('y'))] : []),
      pointBox: pointBox ? { x: pointBox.x, y: pointBox.y, width: pointBox.width, height: pointBox.height } : null,
      viewBox,
      frameHeight: Number(frame?.height) || 0,
      frameFlowHeight,
      frameFlowWidth,
      baseHeight: Number(svg?.dataset?.plot3dBaseHeight) || 0,
      canonicalHeight: Number(svg?.dataset?.plot3dCanonicalHeight) || 0,
      canonicalWidth: Number(svg?.dataset?.plot3dCanonicalWidth) || 0,
      titleReserveBottom: Number(svg?.dataset?.plot3dTitleReserveBottom) || 0,
      titleReserveRight: Number(svg?.dataset?.plot3dTitleReserveRight) || 0,
      axes
    };
  });
}

async function commit3dTitle(page, value){
  const title = page.locator('#scatterPage:not([hidden]) #scatterSvg text[data-font-role="graphTitle"]').first();
  await title.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  await editor.fill(value);
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
}

async function append3dAxisTitleLine(page, role, suffix){
  const title = page.locator(`#scatterPage:not([hidden]) #scatterSvg text[data-font-role="${role}"]`).first();
  await expect(title).toBeVisible();
  await title.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  const original = await title.getAttribute('data-title-block-text') || await title.textContent();
  await editor.fill(original);
  await editor.press('End');
  await editor.press('Enter');
  await editor.type(suffix);
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
}

async function buildLine3d(page){
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });
  await waitForComponentOwnerReady(page, 'line', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  await page.locator('#linePage:not([hidden]) #lineTableFormat').selectOption('3d');
  await page.locator('#linePage:not([hidden]) #lineViewMode').selectOption('3d');
  await waitForComponentOwnerReady(page, 'line', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  await clickExpectedExampleButton(page, 'lineLoadExample');
  await page.waitForFunction(() => {
    const svg = document.querySelector('#linePage:not([hidden]) #linePlot #lineSvg');
    return !!svg && svg.dataset?.viewMode === '3d';
  }, null, { timeout: 40_000 });
  await waitForComponentOwnerReady(page, 'line', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
}

async function buildPca3d(page){
  await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample' }, { first: true });
  await clickExpectedExampleButton(page, 'pcaLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg'), null, { timeout: 40_000 });
  await page.locator('#pcaPage:not([hidden]) #pcaViewMode').selectOption('3d');
  await page.waitForFunction(() => document.querySelector('#pcaPage:not([hidden]) #pcaPlot #pcaSvg')?.dataset?.viewMode === '3d', null, { timeout: 40_000 });
  await waitForComponentOwnerReady(page, 'pca', { requireMountedRoot: true, requireIdle: true, timeout: 40_000 });
}

async function buildSurface3d(page){
  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
  await clickExpectedExampleButton(page, 'surfaceLoadExample');
  await page.waitForFunction(() => !!document.querySelector('#surfacePage:not([hidden]) #surfaceSvg g.surface-faces polygon'), null, { timeout: 40_000 });
  await waitForComponentOwnerReady(page, 'surface', { requireMountedRoot: true, requireIdle: true, timeout: 40_000 });
}

async function read3dFixtureGeometry(page, fixture){
  return page.evaluate(({ rootSelector, svgSelector, geometrySelector }) => {
    const root = document.querySelector(rootSelector);
    const svg = root?.querySelector(svgSelector) || null;
    const title = svg?.querySelector('text[data-font-role="graphTitle"]') || null;
    const frame = svg?.closest('.svgbox') || null;
    const frameRect = frame?.getBoundingClientRect?.() || null;
    const frameStyle = frame ? getComputedStyle(frame) : null;
    const boxes = Array.from(svg?.querySelectorAll(geometrySelector) || []).map(node => {
      try { return node.getBBox(); } catch (_err) { return null; }
    }).filter(Boolean);
    const geometry = boxes.length ? {
      x: Math.min(...boxes.map(box => box.x)),
      y: Math.min(...boxes.map(box => box.y)),
      width: Math.max(...boxes.map(box => box.x + box.width)) - Math.min(...boxes.map(box => box.x)),
      height: Math.max(...boxes.map(box => box.y + box.height)) - Math.min(...boxes.map(box => box.y))
    } : null;
    const axis = key => {
      const node = svg?.querySelector(`[data-axis-label][data-axis-key="${key}"]`) || null;
      const lines = Array.from(node?.querySelectorAll('tspan[data-title-line="1"]') || []);
      return {
        text: node?.dataset?.titleBlockText || node?.textContent || '',
        lineHeight: Number(node?.dataset?.titleLineHeight) || Number.parseFloat(node?.getAttribute('font-size') || '') || 0,
        baselines: lines.length ? lines.map(line => Number(line.getAttribute('y'))) : (node ? [Number(node.getAttribute('y'))] : [])
      };
    };
    const viewBox = String(svg?.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    return {
      titleText: title?.dataset?.titleBlockText || title?.textContent || '',
      titleLineHeight: Number(title?.dataset?.titleLineHeight) || Number.parseFloat(title?.getAttribute('font-size') || '') || 0,
      titleBaseline: Number(title?.querySelector('tspan[data-title-line="1"]')?.getAttribute('y') || title?.getAttribute('y')) || 0,
      geometry,
      axes: { x: axis('x'), y: axis('y'), z: axis('z') },
      viewBox,
      canonicalWidth: Number(svg?.dataset?.plot3dCanonicalWidth) || 0,
      canonicalHeight: Number(svg?.dataset?.plot3dCanonicalHeight) || 0,
      titleReserveRight: Number(svg?.dataset?.plot3dTitleReserveRight) || 0,
      titleReserveBottom: Number(svg?.dataset?.plot3dTitleReserveBottom) || 0,
      frameFlowWidth: frameRect ? frameRect.width + (parseFloat(frameStyle?.marginLeft || '0') || 0) + (parseFloat(frameStyle?.marginRight || '0') || 0) : 0,
      frameFlowHeight: frameRect ? frameRect.height + (parseFloat(frameStyle?.marginTop || '0') || 0) + (parseFloat(frameStyle?.marginBottom || '0') || 0) : 0
    };
  }, {
    rootSelector: fixture.rootSelector,
    svgSelector: fixture.svgSelector,
    geometrySelector: fixture.geometrySelector
  });
}

async function append3dLineToText(page, selector, value){
  const title = page.locator(selector).first();
  await expect(title).toBeVisible();
  await title.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  const current = await title.getAttribute('data-title-block-text') || await title.textContent();
  await editor.fill(current);
  await editor.press('End');
  await editor.press('Enter');
  await editor.type(value);
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
}

test('Scatter 3D graph-title lines add one exact outer reserve and keep the projected data frame fixed', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await clickExpectedExampleButton(page, 'scatterLoadExample');
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.();
    return (hot?.getData?.() || []).length > 2;
  }, null, { timeout: 20_000 });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  await page.locator('#scatterPage:not([hidden]) #scatterViewMode').selectOption('3d');
  await clickExpectedExampleButton(page, 'scatterLoadExample');
  await page.waitForFunction(() => {
    const svg = document.querySelector('#scatterPage:not([hidden]) #scatterPlot #scatterSvg');
    const hot = window.Components?.scatter?.__getActiveHot?.();
    const data = hot?.getData?.() || [];
    return svg?.dataset?.viewMode === '3d'
      && data.length > 2
      && data.some((row, index) => index > 0 && Array.isArray(row) && row[3] !== '' && row[3] != null);
  }, null, { timeout: 30_000 });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });

  let before = await read3dTitleGeometry(page);
  if(!before.titleText.trim()){
    await commit3dTitle(page, '3D graph');
    before = await read3dTitleGeometry(page);
  }
  expect(before.pointBox).toBeTruthy();
  expect(before.titleReserveBottom).toBe(0);

  const title = page.locator('#scatterPage:not([hidden]) #scatterSvg text[data-font-role="graphTitle"]').first();
  await title.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  await editor.fill(before.titleText);
  await editor.press('End');
  await editor.press('Enter');
  await editor.type('Added 3D title line');
  await page.mouse.click(3, 3);
  await expect(editor).toBeHidden();
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });

  const after = await read3dTitleGeometry(page);
  expect(after.titleText).toBe(`${before.titleText}\nAdded 3D title line`);
  expect(after.titleBaselines).toHaveLength(2);
  expect(after.titleBaselines[1] - after.titleBaselines[0]).toBeCloseTo(after.titleLineHeight, 2);
  expect(after.canonicalHeight - before.canonicalHeight).toBeCloseTo(after.titleLineHeight, 2);
  expect(after.viewBox[3] - before.viewBox[3]).toBeCloseTo(after.titleLineHeight, 2);
  expect(after.titleReserveBottom).toBeCloseTo(after.titleLineHeight, 2);
  expect(after.frameFlowHeight - before.frameFlowHeight).toBeCloseTo(after.titleLineHeight, 2);
  expect(after.pointBox.y - before.pointBox.y).toBeCloseTo(after.titleLineHeight, 2);
  expect(after.pointBox.x).toBeCloseTo(before.pointBox.x, 2);
  expect(after.pointBox.width).toBeCloseTo(before.pointBox.width, 2);
  expect(after.pointBox.height).toBeCloseTo(before.pointBox.height, 2);
  expect(after.titleBaselines[0]).toBeCloseTo(before.titleBaselines[0], 2);

  await page.evaluate(() => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    window.Components?.scatter?.draw?.({ tabId, reason: 'multiline-title-reserve-redraw', renderImpact: 'layout', force: true });
  });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  const redrawn = await read3dTitleGeometry(page);
  expect(redrawn.titleReserveBottom).toBeCloseTo(after.titleReserveBottom, 2);
  expect(redrawn.canonicalHeight).toBeCloseTo(after.canonicalHeight, 2);
  expect(redrawn.pointBox.y).toBeCloseTo(after.pointBox.y, 2);
  expect(redrawn.pointBox.height).toBeCloseTo(after.pointBox.height, 2);

  const beforeY = await read3dTitleGeometry(page);
  const yLineHeight = beforeY.axes[1].lineHeight;
  await append3dAxisTitleLine(page, 'yTitle', 'Y axis line');
  const afterY = await read3dTitleGeometry(page);
  expect(afterY.axes[1].text).toBe(`${beforeY.axes[1].text}\nY axis line`);
  expect(afterY.axes[1].baselines[1] - afterY.axes[1].baselines[0]).toBeCloseTo(yLineHeight, 2);
  expect(afterY.titleReserveRight - beforeY.titleReserveRight).toBeCloseTo(yLineHeight, 2);
  expect(afterY.canonicalWidth - beforeY.canonicalWidth).toBeCloseTo(yLineHeight, 2);
  expect(afterY.viewBox[2] - beforeY.viewBox[2]).toBeCloseTo(yLineHeight, 2);
  expect(afterY.frameFlowWidth - beforeY.frameFlowWidth).toBeCloseTo(yLineHeight, 2);
  expect(afterY.pointBox.x - beforeY.pointBox.x).toBeCloseTo(yLineHeight, 2);
  expect(afterY.pointBox.y).toBeCloseTo(beforeY.pointBox.y, 2);
  expect(afterY.pointBox.width).toBeCloseTo(beforeY.pointBox.width, 2);
  expect(afterY.pointBox.height).toBeCloseTo(beforeY.pointBox.height, 2);

  const beforeX = await read3dTitleGeometry(page);
  const xLineHeight = beforeX.axes[0].lineHeight;
  await append3dAxisTitleLine(page, 'xTitle', 'X axis line');
  const afterX = await read3dTitleGeometry(page);
  expect(afterX.axes[0].text).toBe(`${beforeX.axes[0].text}\nX axis line`);
  expect(afterX.axes[0].baselines[1] - afterX.axes[0].baselines[0]).toBeCloseTo(xLineHeight, 2);
  expect(afterX.titleReserveBottom - beforeX.titleReserveBottom).toBeCloseTo(xLineHeight, 2);
  expect(afterX.canonicalHeight - beforeX.canonicalHeight).toBeCloseTo(xLineHeight, 2);
  expect(afterX.viewBox[3] - beforeX.viewBox[3]).toBeCloseTo(xLineHeight, 2);
  expect(afterX.frameFlowHeight - beforeX.frameFlowHeight).toBeCloseTo(xLineHeight, 2);
  expect(afterX.pointBox.y).toBeCloseTo(beforeX.pointBox.y, 2);
  expect(afterX.pointBox.x).toBeCloseTo(beforeX.pointBox.x, 2);
  expect(afterX.pointBox.width).toBeCloseTo(beforeX.pointBox.width, 2);
  expect(afterX.pointBox.height).toBeCloseTo(beforeX.pointBox.height, 2);

  await page.evaluate(() => {
    const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
    window.Components?.scatter?.draw?.({ tabId, reason: 'multiline-axis-title-reserve-redraw', renderImpact: 'layout', force: true });
  });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
  const axesRedrawn = await read3dTitleGeometry(page);
  expect(axesRedrawn.titleReserveRight).toBeCloseTo(afterX.titleReserveRight, 2);
  expect(axesRedrawn.titleReserveBottom).toBeCloseTo(afterX.titleReserveBottom, 2);
  expect(axesRedrawn.pointBox.x).toBeCloseTo(afterX.pointBox.x, 2);
  expect(axesRedrawn.pointBox.y).toBeCloseTo(afterX.pointBox.y, 2);
});

const threeDComponentFixtures = [
  {
    type: 'line',
    rootSelector: '#linePage:not([hidden])',
    svgSelector: '#linePlot #lineSvg',
    geometrySelector: 'g[data-layer="line-3d-series"]',
    build: buildLine3d
  },
  {
    type: 'pca',
    rootSelector: '#pcaPage:not([hidden])',
    svgSelector: '#pcaPlot #pcaSvg',
    geometrySelector: '[data-plot-point="1"]',
    build: buildPca3d
  },
  {
    type: 'surface',
    rootSelector: '#surfacePage:not([hidden])',
    svgSelector: '#surfaceSvg',
    geometrySelector: 'g.surface-faces',
    build: buildSurface3d
  }
];

for(const fixture of threeDComponentFixtures){
  test(`${fixture.type} 3D title and axis lines reserve exactly one line-height`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await fixture.build(page);

    const beforeGraph = await read3dFixtureGeometry(page, fixture);
    expect(beforeGraph.geometry, `${fixture.type} projected geometry should exist`).toBeTruthy();
    expect(beforeGraph.titleText.trim()).not.toBe('');
    expect(beforeGraph.titleReserveBottom).toBe(0);
    await append3dLineToText(page, `${fixture.rootSelector} ${fixture.svgSelector} text[data-font-role="graphTitle"]`, `${fixture.type} continued`);
    await waitForComponentOwnerReady(page, fixture.type, { requireMountedRoot: true, requireIdle: true, timeout: 40_000 });

    const afterGraph = await read3dFixtureGeometry(page, fixture);
    expect(afterGraph.titleText).toBe(`${beforeGraph.titleText}\n${fixture.type} continued`);
    expect(afterGraph.titleBaseline).toBeCloseTo(beforeGraph.titleBaseline, 2);
    expect(afterGraph.titleReserveBottom - beforeGraph.titleReserveBottom).toBeCloseTo(afterGraph.titleLineHeight, 2);
    expect(afterGraph.canonicalHeight - beforeGraph.canonicalHeight).toBeCloseTo(afterGraph.titleLineHeight, 2);
    expect(afterGraph.viewBox[3] - beforeGraph.viewBox[3]).toBeCloseTo(afterGraph.titleLineHeight, 2);
    expect(afterGraph.frameFlowHeight - beforeGraph.frameFlowHeight).toBeCloseTo(afterGraph.titleLineHeight, 2);
    expect(afterGraph.geometry.y - beforeGraph.geometry.y).toBeCloseTo(afterGraph.titleLineHeight, 2);
    expect(afterGraph.geometry.x).toBeCloseTo(beforeGraph.geometry.x, 2);
    expect(afterGraph.geometry.width).toBeCloseTo(beforeGraph.geometry.width, 2);
    expect(afterGraph.geometry.height).toBeCloseTo(beforeGraph.geometry.height, 2);

    const beforeY = await read3dFixtureGeometry(page, fixture);
    const yLineHeight = beforeY.axes.y.lineHeight;
    await append3dLineToText(page, `${fixture.rootSelector} ${fixture.svgSelector} [data-axis-label][data-axis-key="y"]`, 'Y axis continued');
    await waitForComponentOwnerReady(page, fixture.type, { requireMountedRoot: true, requireIdle: true, timeout: 40_000 });
    const afterY = await read3dFixtureGeometry(page, fixture);
    expect(afterY.axes.y.text).toBe(`${beforeY.axes.y.text}\nY axis continued`);
    expect(afterY.axes.y.baselines[1] - afterY.axes.y.baselines[0]).toBeCloseTo(yLineHeight, 2);
    expect(afterY.titleReserveRight - beforeY.titleReserveRight).toBeCloseTo(yLineHeight, 2);
    expect(afterY.canonicalWidth - beforeY.canonicalWidth).toBeCloseTo(yLineHeight, 2);
    expect(afterY.viewBox[2] - beforeY.viewBox[2]).toBeCloseTo(yLineHeight, 2);
    expect(afterY.frameFlowWidth - beforeY.frameFlowWidth).toBeCloseTo(yLineHeight, 2);
    expect(afterY.geometry.x - beforeY.geometry.x).toBeCloseTo(yLineHeight, 2);
    expect(afterY.geometry.y).toBeCloseTo(beforeY.geometry.y, 2);
    expect(afterY.geometry.width).toBeCloseTo(beforeY.geometry.width, 2);
    expect(afterY.geometry.height).toBeCloseTo(beforeY.geometry.height, 2);

    const beforeX = await read3dFixtureGeometry(page, fixture);
    const xLineHeight = beforeX.axes.x.lineHeight;
    await append3dLineToText(page, `${fixture.rootSelector} ${fixture.svgSelector} [data-axis-label][data-axis-key="x"]`, 'X axis continued');
    await waitForComponentOwnerReady(page, fixture.type, { requireMountedRoot: true, requireIdle: true, timeout: 40_000 });
    const afterX = await read3dFixtureGeometry(page, fixture);
    expect(afterX.axes.x.text).toBe(`${beforeX.axes.x.text}\nX axis continued`);
    expect(afterX.axes.x.baselines[1] - afterX.axes.x.baselines[0]).toBeCloseTo(xLineHeight, 2);
    expect(afterX.titleReserveBottom - beforeX.titleReserveBottom).toBeCloseTo(xLineHeight, 2);
    expect(afterX.canonicalHeight - beforeX.canonicalHeight).toBeCloseTo(xLineHeight, 2);
    expect(afterX.viewBox[3] - beforeX.viewBox[3]).toBeCloseTo(xLineHeight, 2);
    expect(afterX.frameFlowHeight - beforeX.frameFlowHeight).toBeCloseTo(xLineHeight, 2);
    expect(afterX.geometry.x).toBeCloseTo(beforeX.geometry.x, 2);
    expect(afterX.geometry.y).toBeCloseTo(beforeX.geometry.y, 2);
    expect(afterX.geometry.width).toBeCloseTo(beforeX.geometry.width, 2);
    expect(afterX.geometry.height).toBeCloseTo(beforeX.geometry.height, 2);

    const beforeZ = await read3dFixtureGeometry(page, fixture);
    const zLineHeight = beforeZ.axes.z.lineHeight;
    await append3dLineToText(page, `${fixture.rootSelector} ${fixture.svgSelector} [data-axis-label][data-axis-key="z"]`, 'Z axis continued');
    await waitForComponentOwnerReady(page, fixture.type, { requireMountedRoot: true, requireIdle: true, timeout: 40_000 });
    const afterZ = await read3dFixtureGeometry(page, fixture);
    expect(afterZ.axes.z.text).toBe(`${beforeZ.axes.z.text}\nZ axis continued`);
    expect(afterZ.axes.z.baselines[1] - afterZ.axes.z.baselines[0]).toBeCloseTo(zLineHeight, 2);
    expect(afterZ.titleReserveBottom - beforeZ.titleReserveBottom).toBeCloseTo(zLineHeight, 2);
    expect(afterZ.canonicalHeight - beforeZ.canonicalHeight).toBeCloseTo(zLineHeight, 2);
    expect(afterZ.viewBox[3] - beforeZ.viewBox[3]).toBeCloseTo(zLineHeight, 2);
    expect(afterZ.frameFlowHeight - beforeZ.frameFlowHeight).toBeCloseTo(zLineHeight, 2);
    expect(afterZ.geometry.x).toBeCloseTo(beforeZ.geometry.x, 2);
    expect(afterZ.geometry.y).toBeCloseTo(beforeZ.geometry.y, 2);
    expect(afterZ.geometry.width).toBeCloseTo(beforeZ.geometry.width, 2);
    expect(afterZ.geometry.height).toBeCloseTo(beforeZ.geometry.height, 2);

    await page.evaluate(component => {
      const tabId = window.Main?.session?.workspaceState?.activeTabId || null;
      window.Components?.[component]?.draw?.({ tabId, reason: 'multiline-title-reserve-redraw', renderImpact: 'layout', force: true });
    }, fixture.type);
    await waitForComponentOwnerReady(page, fixture.type, { requireMountedRoot: true, requireIdle: true, timeout: 40_000 });
    const redrawn = await read3dFixtureGeometry(page, fixture);
    expect(redrawn.titleReserveRight).toBeCloseTo(afterZ.titleReserveRight, 2);
    expect(redrawn.titleReserveBottom).toBeCloseTo(afterZ.titleReserveBottom, 2);
    expect(redrawn.geometry.x).toBeCloseTo(afterZ.geometry.x, 2);
    expect(redrawn.geometry.y).toBeCloseTo(afterZ.geometry.y, 2);
    expect(redrawn.geometry.width).toBeCloseTo(afterZ.geometry.width, 2);
    expect(redrawn.geometry.height).toBeCloseTo(afterZ.geometry.height, 2);
  });
}
