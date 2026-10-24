const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

async function assertSharedGraphSizingPriorityStyles(page) {
  const styles = await page.evaluate(() => {
    const host = document.createElement('div');
    host.className = 'svgbox';
    host.dataset.graphContentEnvelope = 'true';
    host.style.cssText = 'position:fixed;left:-2000px;top:0;display:block;box-sizing:content-box;width:240px;height:120px;min-width:0;min-height:0;padding:0;border:0;--graph-content-rendered-width:347px;--graph-content-rendered-height:189px';

    const viewport = document.createElement('div');
    viewport.dataset.graphContentViewport = 'true';
    viewport.style.cssText = 'display:block;width:7px;height:9px;min-width:11px;min-height:13px;overflow:hidden';
    host.appendChild(viewport);

    const zoomViewport = document.createElement('div');
    zoomViewport.className = 'resizer-zoom-viewport';
    zoomViewport.style.overflow = 'hidden';
    host.appendChild(zoomViewport);
    const zoomContent = document.createElement('div');
    zoomContent.className = 'resizer-zoom-content';
    zoomContent.style.overflow = 'hidden';
    zoomViewport.appendChild(zoomContent);

    const liveTarget = document.createElement('div');
    liveTarget.dataset.resizerLivePreviewTarget = 'true';
    liveTarget.style.cssText = 'display:block;width:7px;height:9px;min-width:11px;min-height:13px';
    host.appendChild(liveTarget);
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:7px;height:9px;min-width:11px;min-height:13px';
    host.appendChild(canvas);
    document.getElementById('appShell').appendChild(host);

    const read = element => {
      const style = getComputedStyle(element);
      return {
        width: style.width,
        height: style.height,
        minWidth: style.minWidth,
        minHeight: style.minHeight,
        overflow: style.overflow
      };
    };
    const base = read(viewport);
    const zoomOverflow = [getComputedStyle(zoomViewport).overflow, getComputedStyle(zoomContent).overflow];
    host.dataset.resizerLivePreview = 'true';
    const livePreview = [read(viewport), read(liveTarget), read(canvas)];
    host.remove();
    return { base, zoomOverflow, livePreview };
  });

  expect(styles.base).toMatchObject({ minWidth: '347px', minHeight: '189px', overflow: 'visible' });
  expect(styles.zoomOverflow).toEqual(['visible', 'visible']);
  for (const target of styles.livePreview) {
    expect(target.minWidth).toBe('0px');
    expect(target.minHeight).toBe('0px');
    expect(target.width).toBe('240px');
    expect(target.height).toBe('120px');
  }
}

async function readExportLayout(page, component) {
  return page.evaluate(type => {
    const root = document.querySelector(`#${type}Page:not([hidden])`);
    const stack = root?.querySelector(`.${type}-plot-stack`);
    const graphFrame = stack?.querySelector(':scope > .graph-frame');
    const svgBox = graphFrame?.querySelector(':scope > .svgbox') || stack?.querySelector('.svgbox');
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
    const frameStyle = graphFrame ? getComputedStyle(graphFrame) : null;
    const envelopeStyle = graphFrame ? getComputedStyle(graphFrame, '::after') : null;
    const header = graphFrame?.querySelector(':scope > .graph-controls-header');
    const frameRect = rect(graphFrame);
    const envelopeBottom = frameRect
      ? frameRect.bottom + (Number.parseFloat(frameStyle?.marginBottom) || 0)
      : 0;
    const stackRect = rect(stack);
    const select = controls?.querySelector('button.export-select');
    const selectRect = rect(select);
    return {
      svgBox: boxRect,
      graphFrame: frameRect,
      header: rect(header),
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
      frameBackgroundColor: frameStyle?.backgroundColor || '',
      graphBottomLeftRadius: Number.parseFloat(boxStyle?.borderBottomLeftRadius) || 0,
      graphBorders: boxStyle ? [
        boxStyle.borderTopWidth,
        boxStyle.borderRightWidth,
        boxStyle.borderBottomWidth,
        boxStyle.borderLeftWidth
      ].map(value => Number.parseFloat(value) || 0) : [],
      envelopeStrokeWidth: Number.parseFloat(envelopeStyle?.borderLeftWidth) || 0,
      hasContentEnvelope: svgBox?.dataset?.graphContentEnvelope === 'true',
      envelopeBorderLayer: envelopeStyle?.zIndex || '',
      envelopeBorderBackground: envelopeStyle?.backgroundColor || '',
      configPanelBorderWidth: Number.parseFloat(configPanelStyle?.borderLeftWidth) || 0,
      isDirectSibling: !!(graphFrame && controls && graphFrame.nextElementSibling === controls),
      frameContainsGraph: !!(graphFrame && svgBox && graphFrame.contains(svgBox)),
      insideSvgBox: !!(svgBox && controls && svgBox.contains(controls)),
      envelopeGap: controlsRect ? controlsRect.top - envelopeBottom : null,
      zoom: Number(svgBox?.dataset?.resizerZoomLevel || 1)
    };
  }, component);
}

function expectExportRowBelowGraph(metrics, label) {
  expect(metrics.controls, `${label}: export row missing`).toBeTruthy();
  expect(metrics.svgBox, `${label}: svgbox missing`).toBeTruthy();
  expect(metrics.graphFrame, `${label}: visual graph frame missing`).toBeTruthy();
  expect(metrics.frameContainsGraph, `${label}: visual frame does not contain graph`).toBe(true);
  expect(metrics.header, `${label}: graph controls header missing`).toBeTruthy();
  if (metrics.title) {
    expect(metrics.header.bottom, `${label}: graph header overlaps title`).toBeLessThanOrEqual(metrics.title.top + 1);
  }
  expect(metrics.insideSvgBox, `${label}: export row remains inside svgbox`).toBe(false);
  expect(metrics.isDirectSibling, `${label}: export row is not the next stack sibling`).toBe(true);
  expect(metrics.envelopeGap, `${label}: row is detached from the graph frame`).toBeCloseTo(metrics.controlsMarginTop, 1);
  expect(metrics.controlsZIndex, `${label}: export row cannot cover the frame seam`).toBeGreaterThan(0);
  expect(metrics.controlsSeamCoverLeft, `${label}: seam cover leaves a left cap`).toBe(0);
  expect(metrics.controlsSeamCoverRight, `${label}: seam cover leaves a right cap`).toBe(0);
  expect(metrics.controlsSeamCoverHeight, `${label}: export row has no seam cover`).toBeGreaterThan(0);
  expect(metrics.controlsSeamCoverBackground, `${label}: seam cover is not opaque`).toBe('rgb(255, 255, 255)');
  expect(metrics.controls.top, `${label}: row leaves the frame seam visible`).toBeGreaterThanOrEqual(metrics.graphFrame.bottom - 1);
  if (metrics.title) {
    expect(metrics.controls.top, `${label}: row overlaps x-axis title`).toBeGreaterThanOrEqual(metrics.title.bottom - 1);
  }
  expect(metrics.controls.right, `${label}: row escapes stack`).toBeLessThanOrEqual(metrics.stack.right + 1);
  expect(metrics.controlsScrollWidth, `${label}: export row creates horizontal overflow`).toBeLessThanOrEqual(metrics.controlsClientWidth + 1);
  expect(metrics.controlsBorderTopWidth, `${label}: attached footer duplicates the graph seam`).toBe(0);
  expect(metrics.controlsBottomLeftRadius, `${label}: attached footer lacks a rounded left corner`).toBeGreaterThan(0);
  expect(metrics.controlsBottomRightRadius, `${label}: attached footer lacks a rounded right corner`).toBeGreaterThan(0);
  expect(metrics.controlsBackgroundColor, `${label}: attached footer does not blend with the drawing surface`).toBe('rgb(255, 255, 255)');
  expect(metrics.frameBackgroundColor, `${label}: graph frame lost its drawing surface`).toBe('rgb(255, 255, 255)');
  expect(metrics.graphBottomLeftRadius, `${label}: graph corner does not join the attached footer cleanly`).toBe(0);
  expect(new Set(metrics.graphBorders).size, `${label}: graph frame borders differ in thickness`).toBe(1);
  expect(metrics.graphBorders[3], `${label}: graph frame does not match the configuration panel`).toBe(metrics.configPanelBorderWidth);
  if (metrics.hasContentEnvelope) {
    expect(Number(metrics.envelopeBorderLayer), `${label}: graph content can mask the envelope border`).toBeGreaterThanOrEqual(1);
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
      const graphFrame = root?.querySelector('.graph-plot-stack > .graph-frame');
      const svgBox = graphFrame?.querySelector(':scope > .svgbox');
      const controls = root?.querySelector(`#${component}ExportControls`);
      return !!svgBox
        && graphFrame?.nextElementSibling === controls
        && controls.querySelectorAll('.export-select-wrapper').length === 2
        && controls.querySelectorAll('button.export-select').length === 2;
    }, type);
    const controlsGeometry = await page.evaluate(component => {
      const root = document.querySelector(`#${component}Page:not([hidden])`);
      const frame = root?.querySelector('.graph-plot-stack > .graph-frame');
      const header = frame?.querySelector(':scope > .graph-controls-header');
      const svgBox = frame?.querySelector(':scope > .svgbox');
      const tray = header?.querySelector(':scope > .resizer-control-tray');
      const rect = node => {
        const value = node?.getBoundingClientRect?.();
        return value ? { top: value.top, bottom: value.bottom, height: value.height } : null;
      };
      return {
        frame: !!frame,
        header: rect(header),
        svgBox: rect(svgBox),
        tray: rect(tray),
        trayInsideSvgBox: !!(svgBox && tray && svgBox.contains(tray)),
        optionsCount: header.querySelectorAll('.resizer-options-control').length,
        zoomCount: header.querySelectorAll('.resizer-zoom-control').length,
        equalAxisCount: header.querySelectorAll('.resizer-axeslength-checkbox--equal-scale').length,
        headerPosition: header ? getComputedStyle(header).position : ''
      };
    }, type);
    expect(controlsGeometry.frame, `${type}: shared graph frame missing`).toBe(true);
    expect(controlsGeometry.trayInsideSvgBox, `${type}: graph controls remain inside svgbox`).toBe(false);
    expect(controlsGeometry.optionsCount, `${type}: duplicated graph options`).toBe(1);
    expect(controlsGeometry.zoomCount, `${type}: duplicated zoom controls`).toBe(1);
    if (type === 'pca') {
      expect(controlsGeometry.equalAxisCount, 'PCA duplicates its equal-axis control after drawing').toBe(1);
    }
    expect(controlsGeometry.headerPosition, `${type}: controls header is not a normal-flow block`).toBe('relative');
    expect(controlsGeometry.header.bottom, `${type}: header geometry missing`).toBeLessThanOrEqual(controlsGeometry.svgBox.top + 0.5);
    expect(controlsGeometry.tray.bottom, `${type}: controls tray geometry missing`).toBeLessThanOrEqual(controlsGeometry.header.bottom + 0.5);
    const compactWidths = await page.evaluate(component => {
      const root = document.querySelector(`#${component}Page:not([hidden])`);
      return Array.from(root.querySelectorAll(`#${component}ExportControls button.export-select`), select => {
        const style = getComputedStyle(select);
        return {
          className: select.className,
          inlineWidth: select.style.width,
          inlineMinWidth: select.style.minWidth,
          fontSize: Number.parseFloat(style.fontSize),
          width: Number.parseFloat(style.width),
          minWidth: Number.parseFloat(style.minWidth)
        };
      });
    }, type);
    expect(compactWidths, `${type}: compact export controls should use their CSS size contract`).toHaveLength(2);
    for (const [index, control] of compactWidths.entries()) {
      const expectedEm = index === 0 ? 7.2 : 6.4;
      expect(control.className).toContain(index === 0 ? 'export-select--compact-download' : 'export-select--compact-copy');
      expect(control.inlineWidth).toBe('');
      expect(control.inlineMinWidth).toBe('');
      expect(control.width, `${type}: ${JSON.stringify(control)}`).toBeCloseTo(control.fontSize * expectedEm, 0);
      expect(control.minWidth).toBeCloseTo(control.fontSize * expectedEm, 0);
    }
  }
});

test('dark graph surfaces continue through the export footer junction', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true, loadExample: true });
  await page.evaluate(() => window.Shared.colorSchemes.applyToActiveTab('scatter', 'dark'));
  await page.waitForFunction(() => document.querySelector('#scatterPage:not([hidden]) .svgbox')?.dataset?.colorScheme === 'dark');
  await waitForComponentOwnerReady(page, { type: 'scatter', pageId: 'scatterPage' }, { requireIdle: true });
  const metrics = await readExportLayout(page, 'scatter');
  expect(metrics.graphBackgroundColor, 'dark graph surface is not black').toBe('rgb(0, 0, 0)');
  expect(metrics.controlsBackgroundColor, 'export controls should remain white').toBe('rgb(255, 255, 255)');
  expect(metrics.controlsSeamCoverBackground, 'junction interrupts the dark graph surface').toBe(metrics.graphBackgroundColor);
  const gripColor = await page.locator('#scatterPage:not([hidden]) .resizer-corner')
    .evaluate(handle => getComputedStyle(handle).color);
  expect(gripColor, 'resize grip disappears against the dark graph surface').toBe('rgb(214, 224, 224)');
  await page.screenshot({ path: 'artifacts/resize-boundary-review/scatter-dark-grip.png' });
  await page.evaluate(() => window.Shared.colorSchemes.applyToActiveTab('scatter', 'grayscale'));
  await waitForComponentOwnerReady(page, { type: 'scatter', pageId: 'scatterPage' }, { requireIdle: true });
  const lightMetrics = await readExportLayout(page, 'scatter');
  expect(lightMetrics.controlsSeamCoverBackground, 'dark seam remains after switching back to a light scheme')
    .toBe('rgb(255, 255, 255)');
  await expect(page.locator('#scatterPage:not([hidden]) .graph-frame')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
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
    return { width: rect.width, height: rect.height, stackScrollWidth: svgBox.closest('.graph-plot-stack')?.scrollWidth || 0 };
  }, component);
  expect(hiddenFrame).toBeTruthy();
  await page.evaluate(type => {
    const controls = document.querySelector(`#${type}Page:not([hidden]) #${type}ExportControls`);
    if (controls) controls.style.display = '';
  }, component);
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
  await waitForComponentOwnerReady(page, { type: component, pageId: `${component}Page` }, { requireIdle: true });
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
  await waitForComponentOwnerReady(page, { type: 'line', pageId: 'linePage' }, { requireIdle: true });
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
  await waitForComponentOwnerReady(page, { type: 'box', pageId: 'boxPage' }, { requireIdle: true });
  const metrics = await readExportLayout(page, 'box');
  expectExportRowBelowGraph(metrics, 'Box');

  const boundary = () => page.evaluate(() => {
    const box = document.querySelector('#boxPage:not([hidden]) .svgbox');
    const frame = box.closest('.graph-frame');
    const handle = box.querySelector('.resizer-corner');
    const h = handle.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const guide = getComputedStyle(box, '::after');
    const grip = getComputedStyle(handle, '::after');
    return {
      detached: frame.hasAttribute('data-graph-resize-detached'),
      geometry: {
        box: { left: b.left, right: b.right, bottom: b.bottom },
        frame: { left: frame.getBoundingClientRect().left, right: frame.getBoundingClientRect().right, bottom: frame.getBoundingClientRect().bottom },
        reserves: ['left', 'right', 'bottom'].map(side => box.style.getPropertyValue(`--graph-content-extra-${side}`))
      },
      active: frame.hasAttribute('data-graph-resize-active'),
      visible: guide.content !== 'none' && guide.content !== 'normal' && guide.display !== 'none' && guide.visibility === 'visible',
      guideRight: b.right - Number.parseFloat(guide.right),
      guideBottom: b.bottom - Number.parseFloat(guide.bottom),
      handleRight: h.right,
      handleBottom: h.bottom,
      hit: document.elementFromPoint(h.x + h.width / 2, h.y + h.height / 2) === handle,
      grip: grip.backgroundImage,
      target: [h.width, h.height],
      border: [Number.parseFloat(getComputedStyle(box).borderRightWidth), Number.parseFloat(getComputedStyle(box).borderBottomWidth)],
      svg: box.querySelector('svg[data-graph-content-viewport]')?.outerHTML
    };
  });
  await test.info().attach('initial-resize-boundary', { body: JSON.stringify(await boundary()), contentType: 'application/json' });
  const handle = page.locator('#boxPage:not([hidden]) .resizer-vertical');
  const edge = await handle.boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 - 210, edge.y + edge.height / 2, { steps: 12 });
  await page.mouse.up();
  await waitForComponentOwnerReady(page, { type: 'box', pageId: 'boxPage' }, { requireIdle: true });
  await expect.poll(async () => (await boundary()).detached).toBe(true);
  const frame = page.locator('#boxPage:not([hidden]) .graph-frame');
  const f = await frame.boundingBox();
  // The empty area beside the small graph must reveal the guide too.
  await page.mouse.move(f.x + f.width - 6, f.y + f.height / 2);
  const small = await boundary();
  expect(small.visible).toBe(true);
  expect(small.hit).toBe(true);
  expect(small.target).toEqual([24, 24]);
  expect(small.grip).toContain('repeating-linear-gradient');
  expect(small.guideRight - small.handleRight).toBeCloseTo(1, 0);
  expect(small.guideBottom - small.handleBottom).toBeCloseTo(1, 0);
  await page.screenshot({ path: 'artifacts/resize-boundary-review/box-guide-hover.png' });
  await page.locator('#boxPage:not([hidden]) .graph-controls-header').hover();
  expect((await boundary()).visible).toBe(false);
  expect((await boundary()).svg).toBe(small.svg);
  await page.screenshot({ path: 'artifacts/resize-boundary-review/box-grip-idle.png' });

  const corner = page.locator('#boxPage:not([hidden]) .resizer-corner');
  const c = await corner.boundingBox();
  await page.mouse.move(c.x + 12, c.y + 12);
  await page.mouse.down();
  await page.locator('#boxPage:not([hidden]) .graph-controls-header').hover();
  expect((await boundary()).active).toBe(true);
  expect((await boundary()).visible).toBe(true);
  await page.mouse.up();
  await expect.poll(async () => (await boundary()).active).toBe(false);

  await page.evaluate(() => document.querySelector('#boxPage:not([hidden]) .svgbox')
    .__sharedResizableBoxApi.setZoomLevel(0.5, { reason: 'resize-guide-review' }));
  await waitForComponentOwnerReady(page, { type: 'box', pageId: 'boxPage' }, { requireIdle: true });
  await frame.hover();
  const zoomed = await boundary();
  expect(zoomed.detached).toBe(true);
  expect(zoomed.guideRight - zoomed.handleRight).toBeCloseTo(zoomed.border[0], 1);
  expect(zoomed.guideBottom - zoomed.handleBottom).toBeCloseTo(zoomed.border[1], 1);
  expect(zoomed.target).toEqual([24, 24]);
});

test('every component exposes its resize boundary without changing graph exports', async ({ page }) => {
  test.setTimeout(180_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await assertSharedGraphSizingPriorityStyles(page);
  for(const [index, type] of ['box', 'scatter', 'pie', 'venn', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist'].entries()){
    await openComponentFromWelcome(page, { type, pageId: `${type}Page` }, { first: index === 0, loadExample: true });
    await waitForComponentOwnerReady(page, { type, pageId: `${type}Page` }, { requireIdle: true });
    const edge = await page.locator(`#${type}Page:not([hidden]) .resizer-vertical`).boundingBox();
    await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width / 2 - 210, edge.y + edge.height / 2, { steps: 12 });
    await page.mouse.up();
    await waitForComponentOwnerReady(page, { type, pageId: `${type}Page` }, { requireIdle: true });
    const read = () => page.evaluate(type => {
      const box = document.querySelector(`#${type}Page:not([hidden]) .svgbox`);
      const frame = box.closest('.graph-frame');
      const handle = box.querySelector('.resizer-corner');
      const rect = handle.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      const guide = getComputedStyle(box, '::after');
      const svg = box.querySelector('svg[data-graph-content-viewport]') || box.querySelector('svg:not(.resizer-options-icon)');
      const projection = window.Shared.exportProjection.resolve(svg, { componentName: type });
      return {
        detached: frame.hasAttribute('data-graph-resize-detached'),
        visible: guide.content !== 'none' && guide.content !== 'normal' && guide.display !== 'none' && guide.visibility === 'visible',
        grip: getComputedStyle(handle, '::after').backgroundImage,
        hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === handle,
        exportSize: [projection.physical.width, projection.physical.height],
        viewBox: svg.getAttribute('viewBox'),
        base: [box.dataset.resizerBaseWidth, box.dataset.resizerBaseHeight],
        handleContained: rect.left >= frameRect.left - 1 && rect.right <= frameRect.right + 1
          && rect.top >= frameRect.top - 1 && rect.bottom <= frameRect.bottom + 1,
        hasReserve: ['left', 'top', 'right', 'bottom'].some(side =>
          Number.parseFloat(box.style.getPropertyValue(`--graph-content-extra-${side}`)) > 0.001),
        hasEnvelope: box.dataset.graphContentEnvelope === 'true'
      };
    }, type);
    await page.locator(`#${type}Page:not([hidden]) .graph-controls-header`).hover();
    const idle = await read();
    expect(idle.visible, `${type}: guide stays hidden over controls`).toBe(false);
    expect(idle.grip, `${type}: corner grip missing`).toContain('repeating-linear-gradient');
    expect(idle.hit, `${type}: resize grip cannot receive pointer input`).toBe(true);
    expect(idle.handleContained, `${type}: resize grip escapes the visible graph frame`).toBe(true);
    if (idle.hasReserve) {
      expect(idle.hasEnvelope, `${type}: content reserve lacks its visible container envelope`).toBe(true);
    }
    const frame = await page.locator(`#${type}Page:not([hidden]) .graph-frame`).boundingBox();
    await page.mouse.move(frame.x + frame.width - 6, frame.y + frame.height / 2);
    const hover = await read();
    expect(hover.visible, `${type}: guide must match boundary separation`).toBe(hover.detached);
    expect(hover.exportSize, `${type}: resize guide changed export dimensions`).toEqual(idle.exportSize);
    expect(hover.viewBox).toBe(idle.viewBox);
    expect(hover.base).toEqual(idle.base);
    if(['venn', 'pie', 'scatter'].includes(type)){
      await page.screenshot({ path: `artifacts/resize-boundary-review/${type}-resize-guide.png` });
    }
  }
});

test('Venn keeps primary export chrome outside its graph frame', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true, loadExample: true });
  await page.waitForFunction(() => !!document.querySelector('#vennPage:not([hidden]) #stage'));
  await waitForComponentOwnerReady(page, { type: 'venn', pageId: 'vennPage' }, { requireIdle: true });
  const metrics = await readExportLayout(page, 'venn');
  expectExportRowBelowGraph(metrics, 'Venn');
  // Build an aligned case explicitly: the header may have a wider footprint
  // than the default graph, especially with different UI control sizes.
  const edge = await page.locator('#vennPage:not([hidden]) .resizer-vertical').boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + Math.max(0, metrics.graphFrame.width - metrics.svgBox.width) + 80, edge.y + edge.height / 2, { steps: 12 });
  await page.mouse.up();
  await waitForComponentOwnerReady(page, { type: 'venn', pageId: 'vennPage' }, { requireIdle: true });
  await page.locator('#vennPage:not([hidden]) .svgbox').hover();
  await expect.poll(() => page.evaluate(() => {
    const box = document.querySelector('#vennPage:not([hidden]) .svgbox');
    const guide = getComputedStyle(box, '::after');
    return { detached: box.closest('.graph-frame').hasAttribute('data-graph-resize-detached'), guideVisible: guide.content !== 'none' && guide.content !== 'normal' && guide.display !== 'none' && guide.visibility === 'visible' };
  })).toEqual({ detached: false, guideVisible: false });
  await assertZoomDoesNotScaleExportRow(page, 'venn');
});
