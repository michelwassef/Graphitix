const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function readExportLayout(page, component) {
  return page.evaluate(type => {
    const root = document.querySelector(`#${type}Page:not([hidden])`);
    const stack = root?.querySelector(`.${type}-plot-stack`);
    const svgBox = stack?.querySelector('.svgbox');
    const controls = root?.querySelector(`#${type}ExportControls`);
    const configPanel = root?.querySelector('.config-panel');
    const svg = svgBox?.querySelector('svg:not(.resizer-options-icon)');
    const xTitle = svg?.querySelector('[data-font-role="xTitle"], [data-axis-title="x"]');
    const rect = node => {
      const value = node?.getBoundingClientRect?.();
      return value ? {
        left: value.left,
        right: value.right,
        top: value.top,
        bottom: value.bottom,
        width: value.width,
        height: value.height
      } : null;
    };
    const boxRect = rect(svgBox);
    const svgRect = rect(svg);
    const controlsRect = rect(controls);
    const controlsStyle = controls ? getComputedStyle(controls) : null;
    const controlsSeamStyle = controls ? getComputedStyle(controls, '::before') : null;
    const configPanelStyle = configPanel ? getComputedStyle(configPanel) : null;
    const titleRect = rect(xTitle);
    const boxStyle = svgBox ? getComputedStyle(svgBox) : null;
    const envelopeStyle = svgBox ? getComputedStyle(svgBox, '::after') : null;
    const envelopeSurfaceStyle = svgBox ? getComputedStyle(svgBox, '::before') : null;
    const envelopeBottom = boxRect
      ? boxRect.bottom + (Number.parseFloat(boxStyle?.marginBottom) || 0)
      : 0;
    const stackRect = rect(stack);
    const select = controls?.querySelector('select');
    const selectRect = rect(select);
    return {
      svgBox: boxRect,
      svg: svgRect,
      title: titleRect,
      controls: controlsRect,
      select: selectRect,
      envelopeBottom,
      stack: stackRect,
      stackScrollWidth: stack?.scrollWidth || 0,
      stackClientWidth: stack?.clientWidth || 0,
      controlsScrollWidth: controls?.scrollWidth || 0,
      controlsClientWidth: controls?.clientWidth || 0,
      controlsMarginTop: Number.parseFloat(controlsStyle?.marginTop) || 0,
      controlsZIndex: Number.parseInt(controlsStyle?.zIndex, 10) || 0,
      controlsSeamCoverLeft: Number.parseFloat(controlsSeamStyle?.left) || 0,
      controlsSeamCoverRight: Number.parseFloat(controlsSeamStyle?.right) || 0,
      controlsSeamCoverHeight: Number.parseFloat(controlsSeamStyle?.height) || 0,
      controlsSeamCoverBackground: controlsSeamStyle?.backgroundColor || '',
      controlsBorderTopWidth: Number.parseFloat(controlsStyle?.borderTopWidth) || 0,
      controlsBottomLeftRadius: Number.parseFloat(controlsStyle?.borderBottomLeftRadius) || 0,
      controlsBottomRightRadius: Number.parseFloat(controlsStyle?.borderBottomRightRadius) || 0,
      controlsBackgroundColor: controlsStyle?.backgroundColor || '',
      graphBackgroundColor: boxStyle?.backgroundColor || '',
      graphBottomLeftRadius: Number.parseFloat(boxStyle?.borderBottomLeftRadius) || 0,
      graphBorders: boxStyle ? [
        boxStyle.borderTopWidth,
        boxStyle.borderRightWidth,
        boxStyle.borderBottomWidth,
        boxStyle.borderLeftWidth
      ].map(value => Number.parseFloat(value) || 0) : [],
      envelopeStrokeWidth: Number.parseFloat(envelopeStyle?.outlineWidth) || 0,
      hasContentEnvelope: svgBox?.dataset?.graphContentEnvelope === 'true',
      envelopeBorderLayer: envelopeStyle?.zIndex || '',
      envelopeSurfaceLayer: envelopeSurfaceStyle?.zIndex || '',
      envelopeBorderBackground: envelopeStyle?.backgroundColor || '',
      configPanelBorderWidth: Number.parseFloat(configPanelStyle?.borderLeftWidth) || 0,
      isDirectSibling: !!(svgBox && controls && svgBox.nextElementSibling === controls),
      insideSvgBox: !!(svgBox && controls && svgBox.contains(controls)),
      envelopeGap: controlsRect ? controlsRect.top - envelopeBottom : null,
      zoom: Number(svgBox?.dataset?.resizerZoomLevel || 1)
    };
  }, component);
}

function expectExportRowBelowGraph(metrics, label) {
  expect(metrics.controls, `${label}: export row missing`).toBeTruthy();
  expect(metrics.svgBox, `${label}: svgbox missing`).toBeTruthy();
  expect(metrics.insideSvgBox, `${label}: export row remains inside svgbox`).toBe(false);
  expect(metrics.isDirectSibling, `${label}: export row is not the next stack sibling`).toBe(true);
  expect(metrics.envelopeGap, `${label}: row is detached from the graph frame`).toBeCloseTo(metrics.controlsMarginTop, 1);
  expect(metrics.controlsZIndex, `${label}: export row cannot cover the frame seam`).toBeGreaterThan(0);
  expect(metrics.controlsSeamCoverLeft, `${label}: seam cover leaves a left cap`).toBe(0);
  expect(metrics.controlsSeamCoverRight, `${label}: seam cover leaves a right cap`).toBe(0);
  expect(metrics.controlsSeamCoverHeight, `${label}: export row has no seam cover`).toBeGreaterThan(0);
  expect(metrics.controlsSeamCoverBackground, `${label}: seam cover is not opaque`).toBe('rgb(255, 255, 255)');
  expect(metrics.controls.top, `${label}: row leaves the frame seam visible`).toBeGreaterThanOrEqual(metrics.svgBox.bottom - metrics.graphBorders[2] - 1);
  if (metrics.title) {
    expect(metrics.controls.top, `${label}: row overlaps x-axis title`).toBeGreaterThanOrEqual(metrics.title.bottom - 1);
  }
  expect(metrics.controls.right, `${label}: row escapes stack`).toBeLessThanOrEqual(metrics.stack.right + 1);
  expect(metrics.controlsScrollWidth, `${label}: export row creates horizontal overflow`).toBeLessThanOrEqual(metrics.controlsClientWidth + 1);
  expect(metrics.controlsBorderTopWidth, `${label}: attached footer duplicates the graph seam`).toBe(0);
  expect(metrics.controlsBottomLeftRadius, `${label}: attached footer lacks a rounded left corner`).toBeGreaterThan(0);
  expect(metrics.controlsBottomRightRadius, `${label}: attached footer lacks a rounded right corner`).toBeGreaterThan(0);
  expect(metrics.controlsBackgroundColor, `${label}: attached footer does not blend with the drawing surface`).toBe('rgb(255, 255, 255)');
  expect(metrics.graphBottomLeftRadius, `${label}: graph corner does not join the attached footer cleanly`).toBe(0);
  expect(new Set(metrics.graphBorders).size, `${label}: graph frame borders differ in thickness`).toBe(1);
  expect(metrics.graphBorders[3], `${label}: graph frame does not match the configuration panel`).toBe(metrics.configPanelBorderWidth);
  if (metrics.hasContentEnvelope) {
    expect(Number(metrics.envelopeBorderLayer), `${label}: graph content can mask the envelope border`).toBeGreaterThanOrEqual(1);
    expect(Number(metrics.envelopeSurfaceLayer), `${label}: envelope surface is not behind graph content`).toBeLessThan(0);
    expect(metrics.envelopeBorderBackground, `${label}: foreground border layer masks graph content`).toBe('rgba(0, 0, 0, 0)');
    expect(metrics.envelopeStrokeWidth, `${label}: graph envelope does not match the configuration panel`).toBe(metrics.configPanelBorderWidth);
  }
}

test('every component mounts Download and Copy in the attached graph footer', async ({ page }) => {
  test.setTimeout(180_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const components = [
    'venn', 'box', 'scatter', 'pca', 'surface', 'line',
    'heatmap', 'roc', 'survival', 'hist', 'pie'
  ];
  for (let index = 0; index < components.length; index += 1) {
    const type = components[index];
    await openComponentFromWelcome(page, { type, pageId: `${type}Page` }, { first: index === 0 });
    await page.waitForFunction(component => {
      const root = document.querySelector(`#${component}Page:not([hidden])`);
      const svgBox = root?.querySelector('.graph-plot-stack > .svgbox');
      const controls = root?.querySelector(`#${component}ExportControls`);
      return !!svgBox
        && svgBox.nextElementSibling === controls
        && controls.querySelectorAll('.export-select-wrapper').length === 2
        && controls.querySelectorAll('select').length === 2;
    }, type);
  }
});

test('dark graph surfaces continue through the export footer junction', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });
  await page.evaluate(() => window.Shared.colorSchemes.applyToActiveTab('scatter', 'dark'));
  await page.waitForFunction(() => document.querySelector('#scatterPage:not([hidden]) .svgbox')?.dataset?.colorScheme === 'dark');
  await page.waitForTimeout(120);
  const metrics = await readExportLayout(page, 'scatter');
  expect(metrics.graphBackgroundColor, 'dark graph surface is not black').toBe('rgb(0, 0, 0)');
  expect(metrics.controlsBackgroundColor, 'export controls should remain white').toBe('rgb(255, 255, 255)');
  expect(metrics.controlsSeamCoverBackground, 'junction interrupts the dark graph surface').toBe(metrics.graphBackgroundColor);
});

async function assertZoomDoesNotScaleExportRow(page, component) {
  const before = await readExportLayout(page, component);
  const hiddenFrame = await page.evaluate(type => {
    const root = document.querySelector(`#${type}Page:not([hidden])`);
    const controls = root?.querySelector(`#${type}ExportControls`);
    const svgBox = root?.querySelector('.svgbox');
    if (!controls || !svgBox) return null;
    controls.style.display = 'none';
    const rect = svgBox.getBoundingClientRect();
    return { width: rect.width, height: rect.height, stackScrollWidth: svgBox.parentElement?.scrollWidth || 0 };
  }, component);
  expect(hiddenFrame).toBeTruthy();
  await page.evaluate(type => {
    const controls = document.querySelector(`#${type}Page:not([hidden]) #${type}ExportControls`);
    if (controls) controls.style.display = '';
  }, component);
  await page.waitForTimeout(80);
  const shownFrame = await readExportLayout(page, component);
  expect(shownFrame.svgBox.width).toBeCloseTo(hiddenFrame.width, 0);
  expect(shownFrame.svgBox.height).toBeCloseTo(hiddenFrame.height, 0);
  expect(shownFrame.stackScrollWidth).toBeLessThanOrEqual(hiddenFrame.stackScrollWidth + 1);

  await page.evaluate(type => {
    const svgBox = document.querySelector(`#${type}Page:not([hidden]) .svgbox`);
    svgBox?.__sharedResizableBoxApi?.setZoomLevel(1.5, { reason: 'e2e-export-row-zoom' });
  }, component);
  await page.waitForFunction(type => {
    const svgBox = document.querySelector(`#${type}Page:not([hidden]) .svgbox`);
    return Number(svgBox?.dataset?.resizerZoomLevel || 1) === 1.5;
  }, component);
  await page.waitForTimeout(120);
  const zoomed = await readExportLayout(page, component);
  expectExportRowBelowGraph(zoomed, `${component} zoomed`);
  expect(zoomed.select.width).toBeCloseTo(before.select.width, 0);
  expect(zoomed.select.height).toBeCloseTo(before.select.height, 0);
  expect(zoomed.controls.width).toBeCloseTo(before.controls.width, 0);
  expect(zoomed.controls.height).toBeCloseTo(before.controls.height, 0);
}

test('Line keeps a long axis envelope separate from primary export chrome', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true, loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#linePage:not([hidden]) #linePlot svg'));
  await page.evaluate(() => {
    const line = window.Components?.line;
    const payload = line?.getPayload?.();
    if (payload?.config) {
      payload.config.xLabel = 'A deliberately long experimental time-course axis title';
      line.loadFromPayload(payload, { reason: 'e2e-export-row-long-axis-title' });
    }
    const hot = line?.__getState?.()?.hot;
    hot?.setDataAtCell?.(9, 0, 987654321, 'e2e-export-row-long-axis-label');
  });
  await page.waitForFunction(() => document.querySelector('#linePage:not([hidden]) text[data-font-role="xTitle"]')?.textContent
    === 'A deliberately long experimental time-course axis title');
  await page.waitForTimeout(250);
  const metrics = await readExportLayout(page, 'line');
  expectExportRowBelowGraph(metrics, 'Line');
  await assertZoomDoesNotScaleExportRow(page, 'line');
});

test('Box keeps the envelope frame above the rendered graph', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true, loadExample: true });
  await page.waitForFunction(() => {
    const svgBox = document.querySelector('#boxPage:not([hidden]) .svgbox');
    return !!document.querySelector('#boxPage:not([hidden]) #boxPlot svg')
      && svgBox?.dataset?.graphContentEnvelope === 'true';
  });
  await page.waitForTimeout(250);
  const metrics = await readExportLayout(page, 'box');
  expectExportRowBelowGraph(metrics, 'Box');
});

test('Venn keeps primary export chrome outside its graph frame', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true, loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#vennPage:not([hidden]) #stage'));
  await page.waitForTimeout(250);
  const metrics = await readExportLayout(page, 'venn');
  expectExportRowBelowGraph(metrics, 'Venn');
  await assertZoomDoesNotScaleExportRow(page, 'venn');
});
