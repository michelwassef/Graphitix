const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const HISTOGRAM = COMPONENT_MATRIX.find(component => component.type === 'hist');
const PANEL_DATA = [
  ['S100B — Good outcome', 'S100B — Poor outcome', 'NDKA — Good outcome', 'NDKA — Poor outcome'],
  [0.13, 0.13, 3.01, 17.4],
  [0.14, 0.10, 8.54, 12.75],
  [0.10, 0.16, 8.09, 13.2],
  [0.04, 0.12, 10.42, 15.96],
  [0.47, 0.44, 6.00, 5.18],
  [0.18, 0.71, 15.54, 8.90],
  [0.10, 0.49, 6.01, 11.60],
  [0.10, 0.07, 17.86, 32.37],
  [0.04, 0.33, 13.41, 54.82],
  [0.19, 2.07, 12.80, 419.19]
];

async function loadPanelHistogram(page, seriesLayout, plotMode = 'histogram') {
  await page.evaluate(async ({ data, layout, mode }) => {
    const component = window.Components?.hist;
    const tab = window.Main?.tabs?.getActiveTab?.();
    const payload = component?.createEmptyPayload?.();
    if (!component || !tab || !payload) {
      throw new Error('Histogram workspace is not ready');
    }
    payload.data = data;
    payload.config = {
      ...(payload.config || {}),
      plotMode: mode,
      seriesLayout: layout,
      frequency: {
        ...(payload.config?.frequency || {}),
        binningMode: 'count',
        count: 12
      }
    };
    window.Main?.session?.updateTabPayload?.(tab, () => payload, {
      reason: 'e2e-hist-panel-layout-fixture',
      origin: 'user'
    });
    component.loadFromPayload(payload, {
      source: 'e2e-hist-panel-layout',
      tab,
      tabId: tab.id,
      skipDraw: true
    });
    await component.draw({ reason: 'e2e-hist-panel-layout', tabId: tab.id });
  }, { data: PANEL_DATA, layout: seriesLayout, mode: plotMode });
}

async function waitForPanelGrid(page, rows, cols) {
  await page.waitForFunction(({ expectedRows, expectedCols }) => {
    const svg = document.querySelector('#histPage:not([hidden]) #histSvg');
    return svg?.getAttribute('data-hist-series-display') === 'panels'
      && Number(svg.getAttribute('data-hist-panel-rows')) === expectedRows
      && Number(svg.getAttribute('data-hist-panel-cols')) === expectedCols
      && svg.querySelectorAll('[data-hist-panel-index]').length === 4;
  }, { expectedRows: rows, expectedCols: cols }, { timeout: 30_000 });
}

async function snapshotPanelLayout(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#histPage:not([hidden])');
    const svg = root?.querySelector?.('#histSvg');
    const panels = Array.from(svg?.querySelectorAll?.('[data-hist-panel-index]') || []);
    const payload = window.Components?.hist?.getPayload?.() || null;
    return {
      svgCount: root?.querySelectorAll?.('#histSvg')?.length || 0,
      panelCount: panels.length,
      rows: Number(svg?.getAttribute?.('data-hist-panel-rows') || 0),
      cols: Number(svg?.getAttribute?.('data-hist-panel-cols') || 0),
      plotMode: svg?.getAttribute?.('data-hist-plot-mode') || '',
      commonBinCount: Number(svg?.getAttribute?.('data-hist-common-bin-count') || 0),
      densitySampleCount: Number(svg?.getAttribute?.('data-hist-density-sample-count') || 0),
      sharedY: svg?.getAttribute?.('data-hist-shared-y-scale') || '',
      histogramFillCount: svg?.querySelectorAll?.('[data-series-role="hist-fill"]')?.length || 0,
      densityAreaCount: svg?.querySelectorAll?.('[data-series-role="density-area"]')?.length || 0,
      densityLineCount: svg?.querySelectorAll?.('[data-series-role="density-line"].hist-density-line')?.length || 0,
      preserveAspectRatio: svg?.getAttribute?.('preserveAspectRatio') || '',
      xDomains: panels.map(panel => [
        Number(panel.getAttribute('data-hist-panel-x-min')),
        Number(panel.getAttribute('data-hist-panel-x-max'))
      ]),
      yDomains: panels.map(panel => [
        Number(panel.getAttribute('data-hist-panel-y-min')),
        Number(panel.getAttribute('data-hist-panel-y-max'))
      ]),
      plotRects: panels.map(panel => ({
        x: Number(panel.getAttribute('data-hist-panel-plot-x')),
        y: Number(panel.getAttribute('data-hist-panel-plot-y')),
        width: Number(panel.getAttribute('data-hist-panel-plot-width')),
        height: Number(panel.getAttribute('data-hist-panel-plot-height'))
      })),
      yTicks: panels.map(panel => Array.from(panel.querySelectorAll('[data-hist-major-tick-axis="y"]'))
        .map(node => Number(node.getAttribute('data-hist-major-tick-value')))
        .filter(Number.isFinite)),
      panelTitles: panels.map(panel => panel.getAttribute('data-hist-panel-series') || ''),
      legendEnvelope: root?.querySelector?.('#histGraphPanel .svgbox')?.dataset?.graphContentEnvelope || '',
      legendExtraRight: root?.querySelector?.('#histGraphPanel .svgbox')?.style?.getPropertyValue('--graph-content-extra-right') || '',
      payloadLayout: payload?.config?.seriesLayout || null,
      tabPayloadLayout: window.Main?.tabs?.getActiveTab?.()?.payload?.config?.seriesLayout || null,
      panelLayoutRowHidden: !!root?.querySelector?.('#histPanelLayoutRow')?.hidden,
      primaryRowContainsPanelArrangement: !!root?.querySelector?.('#histGraphPrimaryRow #histPanelArrangement'),
      panelRowContainsPanelArrangement: !!root?.querySelector?.('#histPanelLayoutRow #histPanelArrangement'),
      panelRowContainsSharedY: !!root?.querySelector?.('#histPanelLayoutRow #histSharedYScale'),
      displayValue: root?.querySelector?.('#histSeriesDisplay')?.value || '',
      displayDisabled: !!root?.querySelector?.('#histSeriesDisplay')?.disabled,
      arrangementValue: root?.querySelector?.('#histPanelArrangement')?.value || '',
      sharedYChecked: !!root?.querySelector?.('#histSharedYScale')?.checked,
      legendDisabled: !!root?.querySelector?.('#histShowLegend')?.disabled
    };
  });
}

test('Histogram separate panels share one SVG, common bins, and comparison scales', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, HISTOGRAM, { first: true });

  await loadPanelHistogram(page, {
    display: 'panels',
    arrangement: 'grid',
    sharedY: true
  });
  await waitForPanelGrid(page, 2, 2);

  const grid = await snapshotPanelLayout(page);
  expect(grid.svgCount).toBe(1);
  expect(grid.panelCount).toBe(4);
  expect(grid.commonBinCount).toBeGreaterThan(0);
  expect(new Set(grid.xDomains.map(domain => JSON.stringify(domain))).size).toBe(1);
  expect(new Set(grid.yDomains.map(domain => JSON.stringify(domain))).size).toBe(1);
  expect(new Set(grid.plotRects.map(rect => rect.width.toFixed(6))).size).toBe(1);
  expect(new Set(grid.plotRects.map(rect => rect.height.toFixed(6))).size).toBe(1);
  expect(grid.plotRects.every(rect => Object.values(rect).every(Number.isFinite))).toBe(true);
  expect(grid.legendEnvelope).toBe('');
  expect(grid.legendExtraRight).toBe('');
  expect(grid.panelTitles).toEqual(PANEL_DATA[0]);
  expect(grid.payloadLayout).toEqual({ display: 'panels', arrangement: 'grid', sharedY: true });
  expect(grid.tabPayloadLayout).toEqual({ display: 'panels', arrangement: 'grid', sharedY: true });
  expect(grid.panelLayoutRowHidden).toBe(false);
  expect(grid.primaryRowContainsPanelArrangement).toBe(false);
  expect(grid.panelRowContainsPanelArrangement).toBe(true);
  expect(grid.panelRowContainsSharedY).toBe(true);
  expect(grid.displayValue).toBe('panels');
  expect(grid.arrangementValue).toBe('grid');
  expect(grid.sharedYChecked).toBe(true);
  expect(grid.legendDisabled).toBe(true);
  grid.yTicks.forEach(ticks => {
    const steps = ticks.slice(1).map((value, index) => Number((value - ticks[index]).toPrecision(12)));
    expect(new Set(steps).size).toBeLessThanOrEqual(1);
  });

  await page.locator('#histPage:not([hidden]) #histPanelArrangement').selectOption('horizontal');
  await waitForPanelGrid(page, 1, 4);
  const horizontal = await snapshotPanelLayout(page);
  expect(horizontal.svgCount).toBe(1);
  expect(horizontal.payloadLayout.arrangement).toBe('horizontal');
  expect(horizontal.tabPayloadLayout.arrangement).toBe('horizontal');

  await page.locator('#histPage:not([hidden]) #histPanelArrangement').selectOption('vertical');
  await waitForPanelGrid(page, 4, 1);
  const vertical = await snapshotPanelLayout(page);
  expect(vertical.svgCount).toBe(1);
  expect(vertical.payloadLayout.arrangement).toBe('vertical');
});

test('Histogram panel controls flush a complete payload for a new workspace', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, HISTOGRAM, { first: true });

  await page.locator('#histPage:not([hidden]) #histSeriesDisplay').selectOption('panels');
  await page.waitForFunction(() => {
    const payload = window.Main?.tabs?.getActiveTab?.()?.payload;
    return payload?.type === 'hist'
      && Array.isArray(payload.data)
      && payload.config?.seriesLayout?.display === 'panels';
  }, null, { timeout: 30_000 });

  const snapshot = await page.evaluate(() => {
    const payload = window.Main?.tabs?.getActiveTab?.()?.payload || null;
    return {
      type: payload?.type || null,
      hasData: Array.isArray(payload?.data),
      seriesLayout: payload?.config?.seriesLayout || null,
      payloadDirty: !!window.Main?.tabs?.getActiveTab?.()?.payloadDirty,
      userModified: !!window.Main?.tabs?.getActiveTab?.()?.userModified
    };
  });
  expect(snapshot).toMatchObject({
    type: 'hist',
    hasData: true,
    seriesLayout: { display: 'panels', arrangement: 'auto', sharedY: true },
    userModified: true
  });
});

test('A stale Histogram runtime snapshot cannot overwrite the canonical panel layout', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, HISTOGRAM, { first: true });

  await loadPanelHistogram(page, {
    display: 'panels',
    arrangement: 'grid',
    sharedY: false
  }, 'density');
  await waitForPanelGrid(page, 2, 2);
  const staleRuntime = await page.evaluate(() => {
    const tab = window.Main?.tabs?.getActiveTab?.();
    return window.Components?.hist?.captureRuntimeState?.({
      tab,
      tabId: tab?.id,
      reason: 'e2e-hist-stale-runtime-capture'
    }) || null;
  });
  expect(staleRuntime?.seriesLayout?.arrangement).toBe('grid');

  await page.locator('#histPage:not([hidden]) #histPanelArrangement').selectOption('vertical');
  await waitForPanelGrid(page, 4, 1);
  await page.evaluate(async runtime => {
    const tab = window.Main?.tabs?.getActiveTab?.();
    window.Components?.hist?.applyRuntimeState?.(runtime, {
      tab,
      tabId: tab?.id,
      reason: 'e2e-hist-stale-runtime-replay'
    });
    await window.Components?.hist?.draw?.({
      tabId: tab?.id,
      reason: 'e2e-hist-stale-runtime-redraw'
    });
  }, staleRuntime);
  await waitForPanelGrid(page, 4, 1);

  const restored = await snapshotPanelLayout(page);
  expect(restored.payloadLayout).toEqual({
    display: 'panels',
    arrangement: 'vertical',
    sharedY: false
  });
  expect(restored.tabPayloadLayout).toEqual(restored.payloadLayout);
  expect(restored.arrangementValue).toBe('vertical');
});

test('Histogram panel-only controls occupy a dedicated second Graph row', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, HISTOGRAM, { first: true });

  await loadPanelHistogram(page, {
    display: 'overlay',
    arrangement: 'grid',
    sharedY: true
  });
  await page.waitForFunction(() => document.querySelector('#histPage:not([hidden]) #histSvg')?.getAttribute('data-hist-series-display') === 'overlay');
  let snapshot = await snapshotPanelLayout(page);
  expect(snapshot.panelLayoutRowHidden).toBe(true);
  expect(snapshot.primaryRowContainsPanelArrangement).toBe(false);
  expect(snapshot.panelRowContainsPanelArrangement).toBe(true);
  expect(snapshot.panelRowContainsSharedY).toBe(true);

  await page.locator('#histPage:not([hidden]) #histSeriesDisplay').selectOption('panels');
  await page.locator('#histPage:not([hidden]) #histPanelArrangement').selectOption('grid');
  await waitForPanelGrid(page, 2, 2);
  snapshot = await snapshotPanelLayout(page);
  expect(snapshot.panelLayoutRowHidden).toBe(false);
  expect(snapshot.tabPayloadLayout).toEqual({ display: 'panels', arrangement: 'grid', sharedY: true });
});

test('Separate panels release the overlay legend viewport before measuring the grid', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, HISTOGRAM, { first: true });

  await loadPanelHistogram(page, {
    display: 'overlay',
    arrangement: 'grid',
    sharedY: true
  });
  await page.waitForFunction(() => {
    const box = document.querySelector('#histPage:not([hidden]) #histGraphPanel .svgbox');
    return box?.dataset?.graphContentEnvelope === 'true'
      && parseFloat(box.style.getPropertyValue('--graph-content-extra-right')) > 0;
  });

  await page.locator('#histPage:not([hidden]) #histSeriesDisplay').selectOption('panels');
  await page.locator('#histPage:not([hidden]) #histPanelArrangement').selectOption('grid');
  await waitForPanelGrid(page, 2, 2);

  const panels = await snapshotPanelLayout(page);
  expect(panels.legendEnvelope).toBe('');
  expect(panels.legendExtraRight).toBe('');
  expect(new Set(panels.plotRects.map(rect => rect.width.toFixed(6))).size).toBe(1);
  expect(new Set(panels.plotRects.map(rect => rect.height.toFixed(6))).size).toBe(1);
});

test('Density plots expose the same separate-panel layouts as histograms', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, HISTOGRAM, { first: true });

  const layout = { display: 'panels', arrangement: 'grid', sharedY: false };
  await loadPanelHistogram(page, layout, 'density');
  await waitForPanelGrid(page, 2, 2);

  const density = await snapshotPanelLayout(page);
  expect(density.svgCount).toBe(1);
  expect(density.plotMode).toBe('density');
  expect(density.panelCount).toBe(4);
  expect(density.commonBinCount).toBe(0);
  expect(density.densitySampleCount).toBeGreaterThanOrEqual(64);
  expect(density.histogramFillCount).toBe(0);
  expect(density.densityAreaCount).toBe(4);
  expect(density.densityLineCount).toBe(4);
  expect(density.displayDisabled).toBe(false);
  expect(density.payloadLayout).toEqual(layout);
  expect(new Set(density.xDomains.map(domain => JSON.stringify(domain))).size).toBe(1);
  expect(new Set(density.yDomains.map(domain => JSON.stringify(domain))).size).toBeGreaterThan(1);
  expect(new Set(density.plotRects.map(rect => rect.width.toFixed(6))).size).toBe(1);
  expect(new Set(density.plotRects.map(rect => rect.height.toFixed(6))).size).toBe(1);
  expect(density.legendEnvelope).toBe('');
  expect(density.legendExtraRight).toBe('');

  await page.locator('#histPage:not([hidden]) #histSharedYScale').check();
  await page.waitForFunction(() => document.querySelector('#histPage:not([hidden]) #histSvg')?.getAttribute('data-hist-shared-y-scale') === 'true');
  const sharedDensity = await snapshotPanelLayout(page);
  expect(new Set(sharedDensity.yDomains.map(domain => JSON.stringify(domain))).size).toBe(1);
  await page.locator('#histPage:not([hidden]) #histSharedYScale').uncheck();
  await page.waitForFunction(() => document.querySelector('#histPage:not([hidden]) #histSvg')?.getAttribute('data-hist-shared-y-scale') === 'false');

  await page.locator('#histPage:not([hidden]) #histPanelArrangement').selectOption('horizontal');
  await waitForPanelGrid(page, 1, 4);
  const horizontalDensity = await snapshotPanelLayout(page);
  expect(horizontalDensity.plotMode).toBe('density');
  expect(horizontalDensity.densityAreaCount).toBe(4);
  expect(horizontalDensity.xDomains).toEqual(density.xDomains);
  expect(horizontalDensity.yDomains).toEqual(density.yDomains);

  await page.locator('#histPage:not([hidden]) #histPanelArrangement').selectOption('vertical');
  await waitForPanelGrid(page, 4, 1);
  const verticalDensity = await snapshotPanelLayout(page);
  expect(verticalDensity.plotMode).toBe('density');
  expect(verticalDensity.densityLineCount).toBe(4);
  expect(verticalDensity.xDomains).toEqual(density.xDomains);
  expect(verticalDensity.yDomains).toEqual(density.yDomains);

  await page.locator('#histPage:not([hidden]) #histPanelArrangement').selectOption('grid');
  await waitForPanelGrid(page, 2, 2);
  await page.locator('#histPage:not([hidden]) #histPlotMode').selectOption('histogram');
  await waitForPanelGrid(page, 2, 2);
  const histogram = await snapshotPanelLayout(page);
  expect(histogram.plotMode).toBe('histogram');
  expect(histogram.histogramFillCount).toBe(4);
  expect(histogram.densityAreaCount).toBe(0);
  expect(histogram.payloadLayout).toEqual(layout);

  await page.locator('#histPage:not([hidden]) #histPlotMode').selectOption('density');
  await waitForPanelGrid(page, 2, 2);
  const restored = await snapshotPanelLayout(page);
  expect(restored.plotMode).toBe('density');
  expect(restored.densityAreaCount).toBe(4);
  expect(restored.payloadLayout).toEqual(layout);
});

test('Histogram and density panels redraw without SVG aspect distortion after resize', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, HISTOGRAM, { first: true });

  for (const mode of ['histogram', 'density']) {
    await loadPanelHistogram(page, {
      display: 'panels',
      arrangement: 'grid',
      sharedY: true
    }, mode);
    await waitForPanelGrid(page, 2, 2);

    await page.evaluate(async requestedMode => {
      const root = document.querySelector('#histPage:not([hidden])');
      const svgBox = root?.querySelector?.('#histGraphPanel .svgbox');
      const resizeApi = svgBox?.__sharedResizableBoxApi;
      if (!resizeApi || typeof resizeApi.applySize !== 'function') {
        throw new Error('Histogram resizable graph API is unavailable');
      }
      const rect = svgBox.getBoundingClientRect();
      resizeApi.applySize({
        width: Math.max(520, Math.round(rect.width) + 173),
        height: Math.max(360, Math.round(rect.height) + 97),
        axis: 'both',
        authorityMode: 'authoritative',
        forceExact: true,
        preserveAspectLock: true,
        reason: `e2e-hist-${requestedMode}-panel-resize`
      });
      const tab = window.Main?.tabs?.getActiveTab?.();
      await window.Components?.hist?.draw?.({
        tabId: tab?.id,
        reason: `e2e-hist-${requestedMode}-panel-resize-redraw`,
        force: true,
        silentOverlay: true
      });
    }, mode);
    await waitForPanelGrid(page, 2, 2);

    const resized = await snapshotPanelLayout(page);
    expect(resized.plotMode).toBe(mode);
    expect(resized.panelCount).toBe(4);
    expect(resized.preserveAspectRatio).toBe('xMidYMid meet');
    expect(resized.xDomains.every(domain => domain.every(Number.isFinite))).toBe(true);
    expect(resized.yDomains.every(domain => domain.every(Number.isFinite))).toBe(true);
    expect(new Set(resized.plotRects.map(rect => rect.width.toFixed(6))).size).toBe(1);
    expect(new Set(resized.plotRects.map(rect => rect.height.toFixed(6))).size).toBe(1);
    expect(resized.legendEnvelope).toBe('');
    expect(resized.legendExtraRight).toBe('');
    if (mode === 'density') {
      expect(resized.densityAreaCount).toBe(4);
      expect(resized.densityLineCount).toBe(4);
    } else {
      expect(resized.histogramFillCount).toBe(4);
    }
  }
});

test('Density panel state remains owner-isolated across same-component tabs', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, HISTOGRAM, { first: true });

  await loadPanelHistogram(page, {
    display: 'panels',
    arrangement: 'grid',
    sharedY: false
  }, 'density');
  await waitForPanelGrid(page, 2, 2);
  const firstTabId = await page.evaluate(() => window.Main?.tabs?.getActiveTab?.()?.id || null);

  await openComponentFromWelcome(page, HISTOGRAM, { first: false });
  await loadPanelHistogram(page, {
    display: 'panels',
    arrangement: 'vertical',
    sharedY: true
  }, 'histogram');
  await waitForPanelGrid(page, 4, 1);
  const secondTabId = await page.evaluate(() => window.Main?.tabs?.getActiveTab?.()?.id || null);
  expect(secondTabId).not.toBe(firstTabId);

  await page.evaluate(tabId => window.Main?.tabs?.activateTab?.(tabId, {
    reason: 'e2e-hist-density-owner-return',
    skipDuplicatePrompt: true
  }), firstTabId);
  await waitForPanelGrid(page, 2, 2);
  const firstRestored = await snapshotPanelLayout(page);
  expect(firstRestored.plotMode).toBe('density');
  expect(firstRestored.payloadLayout).toEqual({
    display: 'panels',
    arrangement: 'grid',
    sharedY: false
  });
  expect(firstRestored.densityAreaCount).toBe(4);
  expect(firstRestored.histogramFillCount).toBe(0);

  await page.evaluate(tabId => window.Main?.tabs?.activateTab?.(tabId, {
    reason: 'e2e-hist-density-owner-second-return',
    skipDuplicatePrompt: true
  }), secondTabId);
  await waitForPanelGrid(page, 4, 1);
  const secondRestored = await snapshotPanelLayout(page);
  expect(secondRestored.plotMode).toBe('histogram');
  expect(secondRestored.payloadLayout).toEqual({
    display: 'panels',
    arrangement: 'vertical',
    sharedY: true
  });
  expect(secondRestored.histogramFillCount).toBe(4);
  expect(secondRestored.densityAreaCount).toBe(0);
});
