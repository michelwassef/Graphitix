const { test, expect } = require('@playwright/test');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { clickExampleButton } = require('../helpers/uiDriver');

const CATEGORICAL_LEGEND_CASES = [
  { type: 'box', svg: '#boxSvg', toggle: '#boxShowLegend', grouped: true },
  { type: 'scatter', svg: '#scatterSvg', toggle: '#scatterShowLegend' },
  { type: 'pca', svg: '#pcaSvg', toggle: '#pcaShowLegend' },
  { type: 'line', svg: '#lineSvg', toggle: '#lineShowLegend' },
  { type: 'hist', svg: '#histSvg', toggle: '#histShowLegend' },
  { type: 'pie', svg: '#pieSvg', toggle: '#pieShowLegend' },
  { type: 'pie', svg: '#pieSvg', toggle: '#pieShowLegend', chartType: 'stacked' },
  { type: 'roc', svg: '#rocSvg', toggle: '#rocShowLegend' },
  { type: 'survival', svg: '#survivalSvg', toggle: '#survivalShowLegend' },
  { type: 'scatter', svg: '#scatterSvg', toggle: '#scatterShowLegend', viewMode: '#scatterViewMode', reloadExample: true },
  { type: 'pca', svg: '#pcaSvg', toggle: '#pcaShowLegend', viewMode: '#pcaViewMode' },
  { type: 'line', svg: '#lineSvg', toggle: '#lineShowLegend', viewMode: '#lineViewMode' }
];
const SCALE_LEGEND_CASES = [
  { type: 'heatmap', svg: '#heatmapSvg', scale: '#heatmapSvg g.heatmap-color-scale' },
  { type: 'surface', svg: '#surfaceSvg', scale: '#surfaceSvg g.surface-legend' }
];

async function waitForComponentReady(page, type) {
  await page.evaluate(async componentType => {
    const component = window.Components?.[componentType];
    const tab = window.Main?.session?.getActiveTab?.();
    if (component?.awaitReadyForSnapshot && tab) {
      await component.awaitReadyForSnapshot({ tab, tabId: tab.id, reason: 'legend-font-reserve', settleFrames: 2 });
    }
  }, type);
}

async function readLegendMetrics(page, componentCase) {
  return page.evaluate(({ type, svgSelector }) => {
    const svg = document.querySelector(`#${type}Page:not([hidden]) ${svgSelector}`);
    const legend = svg?.querySelector('[data-legend-viewport-content="true"]');
    const text = legend?.querySelector('text');
    const viewBoxText = String(svg?.getAttribute('viewBox') || '').trim();
    const viewBox = viewBoxText ? viewBoxText.split(/[\\s,]+/).map(Number) : [];
    const svgBox = svg?.closest('.svgbox');
    return {
      fontSize: Number.parseFloat(text?.getAttribute('font-size') || ''),
      legendWidth: Number(legend?.dataset?.legendContentWidth),
      renderedLegendWidth: Number(legend?.getBBox?.().width),
      reserve: Number(svg?.dataset?.graphContentReserveRight),
      rendererReserve: Number(svg?.dataset?.legendReserveWidth),
      viewportWidth: viewBox.length === 4 ? Number(viewBox[2]) : NaN,
      baseWidth: Number(svg?.dataset?.legendBaseWidth),
      outerReservePx: Number.parseFloat(svgBox?.style?.getPropertyValue('--graph-content-extra-right') || '0')
    };
  }, { type: componentCase.type, svgSelector: componentCase.svg });
}

async function setLegendFontSize(page, value) {
  const size = page.locator('.font-controls-panel[data-open="1"] input[aria-label="Font size"]');
  await size.fill(String(value));
  await size.dispatchEvent('change');
}

async function readScaleMetrics(page, componentCase) {
  return page.evaluate(({ type, svgSelector, scaleSelector }) => {
    const svg = document.querySelector(`#${type}Page:not([hidden]) ${svgSelector}`);
    const scale = svg?.querySelector(scaleSelector);
    const tick = scale?.querySelector('text[data-font-role="scaleTick"]');
    const svgBox = svg?.closest('.svgbox');
    let reserve = Number(svg?.dataset?.graphContentReserveRight);
    if (type === 'heatmap') {
      const cells = svg?.querySelector('[data-layer="cells"]');
      const matrixEnd = Number(cells?.getAttribute('data-heatmap-data-start-x'))
        + Number(cells?.getAttribute('data-heatmap-width'));
      const sceneWidth = Number(svg?.dataset?.heatmapSceneWidth);
      reserve = Number.isFinite(sceneWidth) && Number.isFinite(matrixEnd) ? sceneWidth - matrixEnd : NaN;
    }
    return {
      fontSize: Number.parseFloat(tick?.getAttribute('font-size') || ''),
      renderedScaleWidth: Number(scale?.getBBox?.().width),
      reserve,
      outerReservePx: Number.parseFloat(svgBox?.style?.getPropertyValue('--graph-content-extra-right') || '0')
    };
  }, { type: componentCase.type, svgSelector: componentCase.svg, scaleSelector: componentCase.scale });
}

for (const componentCase of CATEGORICAL_LEGEND_CASES) {
  const modeLabel = componentCase.viewMode ? ' 3D' : (componentCase.chartType ? ` ${componentCase.chartType}` : '');
  test(`${componentCase.type}${modeLabel} legend reserve follows font size changes and undo`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    const component = COMPONENT_MATRIX.find(entry => entry.type === componentCase.type);
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });

    if (componentCase.grouped) {
      await page.evaluate(() => {
        const format = document.querySelector('#boxTableFormat');
        format.value = 'grouped';
        format.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await clickExampleButton(page, component, { requireMountedRoot: true });
    }

    if (componentCase.viewMode) {
      await page.evaluate(async ({ type, selector }) => {
        const mode = document.querySelector(`#${type}Page:not([hidden]) ${selector}`);
        mode.value = '3d';
        mode.dispatchEvent(new Event('change', { bubbles: true }));
      }, { type: componentCase.type, selector: componentCase.viewMode });
      if (componentCase.reloadExample) {
        await clickExampleButton(page, component, { requireMountedRoot: true });
      } else {
        await page.evaluate(async type => {
          const tab = window.Main.session.getActiveTab();
          await window.Components[type].draw({ reason: 'e2e-legend-font-reserve-3d', tabId: tab.id });
        }, componentCase.type);
      }
      await page.waitForFunction(({ type, svgSelector }) => (
        document.querySelector(`#${type}Page:not([hidden]) ${svgSelector}`)?.dataset?.viewMode === '3d'
      ), { type: componentCase.type, svgSelector: componentCase.svg });
    }

    if (componentCase.chartType) {
      await page.locator(`#${componentCase.type}Page:not([hidden]) #pieChartType`).selectOption(componentCase.chartType);
      await waitForComponentReady(page, componentCase.type);
    }

    await page.evaluate(async ({ type, toggle }) => {
      const control = document.querySelector(`#${type}Page:not([hidden]) ${toggle}`);
      if (control && !control.checked) {
        control.checked = true;
        control.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const tab = window.Main.session.getActiveTab();
      await window.Components[type].draw({ reason: 'e2e-legend-font-reserve-setup', tabId: tab.id });
    }, componentCase);

    const text = page.locator(`#${componentCase.type}Page:not([hidden]) ${componentCase.svg} [data-legend-viewport-content="true"] text`).first();
    await expect(text).toBeVisible();
    await text.dispatchEvent('click');
    await expect(page.locator('.font-controls-panel[data-open="1"]')).toHaveAttribute('data-legend-controls', '1');

    const baseline = await readLegendMetrics(page, componentCase);
    await setLegendFontSize(page, 24);
    await waitForComponentReady(page, componentCase.type);
    await expect.poll(async () => (await readLegendMetrics(page, componentCase)).reserve, { timeout: 20_000 })
      .toBeGreaterThan(baseline.reserve);
    const large = await readLegendMetrics(page, componentCase);
    await setLegendFontSize(page, 6);
    await waitForComponentReady(page, componentCase.type);
    await expect.poll(async () => (await readLegendMetrics(page, componentCase)).reserve, { timeout: 20_000 })
      .toBeLessThan(large.reserve);
    const small = await readLegendMetrics(page, componentCase);
    expect(small.renderedLegendWidth, JSON.stringify({ large, small })).toBeLessThan(large.renderedLegendWidth);
    expect(large.reserve, JSON.stringify({ baseline, large, small })).toBeGreaterThan(baseline.reserve);
    expect(small.reserve, JSON.stringify({ baseline, large, small })).toBeLessThan(large.reserve);
    expect(large.outerReservePx, JSON.stringify({ baseline, large })).toBeGreaterThan(baseline.outerReservePx);
    expect(small.outerReservePx, JSON.stringify({ large, small })).toBeLessThan(large.outerReservePx);

    await page.evaluate(() => window.Shared.undoManager.undo());
    await waitForComponentReady(page, componentCase.type);
    await expect.poll(async () => (await readLegendMetrics(page, componentCase)).reserve, { timeout: 20_000 })
      .toBeGreaterThan(small.reserve);
    const restored = await readLegendMetrics(page, componentCase);
    expect(restored.fontSize).toBeCloseTo(large.fontSize, 1);
    expect(restored.reserve, JSON.stringify({ large, small, restored })).toBeCloseTo(large.reserve, 1);
    expect(restored.outerReservePx, JSON.stringify({ large, restored })).toBeCloseTo(large.outerReservePx, 1);
    await page.evaluate(() => window.Shared.undoManager.redo());
    await waitForComponentReady(page, componentCase.type);
    await expect.poll(async () => (await readLegendMetrics(page, componentCase)).reserve, { timeout: 20_000 })
      .toBeCloseTo(small.reserve, 1);
    const redone = await readLegendMetrics(page, componentCase);
    expect(redone.fontSize).toBeCloseTo(small.fontSize, 1);
    expect(redone.reserve, JSON.stringify({ small, redone })).toBeCloseTo(small.reserve, 1);
    expect(redone.outerReservePx, JSON.stringify({ small, redone })).toBeCloseTo(small.outerReservePx, 1);
  });
}

for (const componentCase of SCALE_LEGEND_CASES) {
  test(`${componentCase.type} scale legend reserve follows font size changes and undo`, async ({ page }) => {
    test.setTimeout(90_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    const component = COMPONENT_MATRIX.find(entry => entry.type === componentCase.type);
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });

    const tick = page.locator(`#${componentCase.type}Page:not([hidden]) ${componentCase.scale} text[data-font-role="scaleTick"]`).first();
    await expect(tick).toBeVisible();
    await tick.dispatchEvent('click');
    const panel = page.locator('.font-controls-panel[data-open="1"]');
    await expect(panel.locator('.font-controls-panel__field--scope select')).toHaveValue('scale');

    const baseline = await readScaleMetrics(page, componentCase);
    await setLegendFontSize(page, 24);
    await waitForComponentReady(page, componentCase.type);
    await expect.poll(async () => (await readScaleMetrics(page, componentCase)).reserve, { timeout: 20_000 })
      .toBeGreaterThan(baseline.reserve);
    const large = await readScaleMetrics(page, componentCase);
    if (componentCase.type !== 'heatmap') {
      expect(large.outerReservePx, JSON.stringify({ baseline, large })).toBeGreaterThan(baseline.outerReservePx);
    }
    await setLegendFontSize(page, 6);
    await waitForComponentReady(page, componentCase.type);
    await expect.poll(async () => (await readScaleMetrics(page, componentCase)).reserve, { timeout: 20_000 })
      .toBeLessThan(large.reserve);
    const small = await readScaleMetrics(page, componentCase);
    expect(small.renderedScaleWidth, JSON.stringify({ large, small })).toBeLessThan(large.renderedScaleWidth);
    if (componentCase.type !== 'heatmap') {
      expect(small.outerReservePx, JSON.stringify({ large, small })).toBeLessThan(large.outerReservePx);
    }

    await page.evaluate(() => window.Shared.undoManager.undo());
    await waitForComponentReady(page, componentCase.type);
    await expect.poll(async () => (await readScaleMetrics(page, componentCase)).reserve, { timeout: 20_000 })
      .toBeGreaterThan(small.reserve);
    const restored = await readScaleMetrics(page, componentCase);
    expect(restored.fontSize).toBeCloseTo(large.fontSize, 1);
    expect(restored.reserve, JSON.stringify({ large, small, restored })).toBeCloseTo(large.reserve, 1);
    if (componentCase.type !== 'heatmap') {
      expect(restored.outerReservePx, JSON.stringify({ large, restored })).toBeCloseTo(large.outerReservePx, 1);
    }
    await page.evaluate(() => window.Shared.undoManager.redo());
    await waitForComponentReady(page, componentCase.type);
    await expect.poll(async () => (await readScaleMetrics(page, componentCase)).reserve, { timeout: 20_000 })
      .toBeCloseTo(small.reserve, 1);
    const redone = await readScaleMetrics(page, componentCase);
    expect(redone.fontSize).toBeCloseTo(small.fontSize, 1);
    expect(redone.reserve, JSON.stringify({ small, redone })).toBeCloseTo(small.reserve, 1);
    if (componentCase.type !== 'heatmap') {
      expect(redone.outerReservePx, JSON.stringify({ small, redone })).toBeCloseTo(small.outerReservePx, 1);
    }
  });
}
