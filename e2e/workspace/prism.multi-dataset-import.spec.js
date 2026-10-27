const path = require('path');
const fs = require('fs');
const zlib = require('node:zlib');
const { test, expect } = require('@playwright/test');
const JSZip = require('../../libs/jszip.min.js');
const prismBinary = require('../../js/shared/prismBinary.js');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

const expectedTabs = [
    { title: 'Grouped: Entering replicate data', type: 'box' },
    { title: 'XY: Entering replicate data', type: 'scatter' },
    { title: 'Data 6', type: 'scatter' },
    { title: 'Survival: Two groups', type: 'survival' },
    { title: 'Data - missing columns', type: 'line' },
    { title: 'Data 6 #2', type: 'scatter' }
  ];
const prismV1SingleFixtures = [
  { file: 'box-chart.prism', type: 'box' },
  { file: 'column.pzfx', type: 'box' },
  { file: 'example-file-line.prism', type: 'line' },
  { file: 'example-file-line-y-axis.prism', type: 'line' },
  { file: 'example-file-line-y-axis2.prism', type: 'line' },
  { file: 'example-file-prism10-axis-thickness-0.5.prism', type: 'box' },
  { file: 'example-file-prism10-test.prism', type: 'box' },
  { file: 'example-file-prism10.prism', type: 'box' },
  { file: 'example-file-scatter-axes-titles.prism', type: 'scatter' },
  { file: 'example-file-scatter.prism', type: 'scatter' },
  { file: 'individual-chart.prism', type: 'box' },
  { file: 'parts_of_whole.pzfx', type: 'pie' },
  { file: 'pie-chart.prism', type: 'pie' },
  { file: 'survival-graph.prism', type: 'survival' },
  { file: 'survival.pzfx', type: 'survival' },
  { file: 'test.prism', type: 'scatter' },
  { file: 'violin-chart.prism', type: 'box' },
  { file: 'violin-chart2.prism', type: 'box' },
  { file: 'x_y_no_rep.pzfx', type: 'scatter' }
];
const prismThicknessToCssPixels = points => points === 0
  ? 0
  : 0.7182 * points + 0.7194;

test('imports Prism marker styles for the matching condition and axis thickness', async ({ page }) => {
  test.setTimeout(90_000);
  const prismPath = path.join(
    __dirname,
    '..',
    '..',
    '__tests__',
    'fixtures',
    'prism-binary',
    'v10',
    'controlled',
    'individual-red-square.prism'
  );
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#welcomeGraphFileInput').setInputFiles(prismPath);

  await expect.poll(() => page.evaluate(() => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return tabs.filter(tab => !tab.isWelcome).map(tab => tab.type);
  }), { timeout: 80_000 }).toEqual(['box']);

  const tabId = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome)?.id || null
  ));
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click();
  await page.waitForFunction(() => {
    const state = window.Components?.box?.__getState?.();
    const svg = document.querySelector('#boxPlot svg');
    const plotWidth = Number(svg?.dataset?.boxPlotW);
    const plotHeight = Number(svg?.dataset?.boxPlotH);
    return document.querySelector('#boxGraphType')?.value === 'strip'
      && state?.pointStyles?.[2]?.shape === 'square'
      && state?.pointStyles?.[2]?.fill === '#ff0000'
      && state?.pointStyles?.[2]?.size === 3
      && Math.abs(plotWidth - 128) < 1
      && Math.abs(plotHeight - 192) < 1;
  }, null, { timeout: 30_000 });

  const imported = await page.evaluate(tabId => {
    const state = window.Components?.box?.__getState?.();
    const svg = document.querySelector('#boxPlot svg');
    const markers = [0, 1, 2].map(index => {
      const group = svg?.querySelector(`g[data-export-layer="box-points"][data-trace="${index}"]`);
      const marker = group?.querySelector('circle:not([data-point-proxy="1"]), rect:not([data-point-proxy="1"]), path:not([data-point-proxy="1"])');
      return marker ? {
        tag: marker.tagName.toLowerCase(),
        fill: marker.getAttribute('fill'),
        size: Number(marker.getAttribute('data-point-size'))
      } : null;
    });
    const axisLines = Array.from(svg?.querySelectorAll('[data-box-primary-axis]') || []);
    return {
      pointStyles: state?.pointStyles || {},
      axisStrokeWidth: state?.axisSettings?.strokeWidth,
      axisLineWidths: axisLines.map(line => Number(line.getAttribute('stroke-width'))),
      plotWidth: Number(svg?.dataset?.boxPlotW),
      plotHeight: Number(svg?.dataset?.boxPlotH),
      fonts: window.Shared?.fontControls?.exportScopeStyles?.('box', { tabId }) || {},
      markers
    };
  }, tabId);

  expect(imported.pointStyles[0]).toMatchObject({ shape: 'circle', fill: '#000000', size: 3, sizeMode: 'manual' });
  expect(imported.pointStyles[1]).toMatchObject({ shape: 'circle', fill: '#000000', size: 3, sizeMode: 'manual' });
  expect(imported.pointStyles[2]).toMatchObject({ shape: 'square', fill: '#ff0000', stroke: '#ff0000', size: 3, sizeMode: 'manual' });
  expect(imported.axisStrokeWidth).toBeCloseTo(prismThicknessToCssPixels(1), 3);
  expect(imported.axisLineWidths).toHaveLength(2);
  imported.axisLineWidths.forEach(width => expect(width).toBeCloseTo(prismThicknessToCssPixels(1), 3));
  expect(imported.fonts.graphTitle).toMatchObject({ fontSize: '14pt' });
  expect(imported.fonts.xTitle).toMatchObject({ fontSize: '12pt' });
  expect(imported.fonts.yTitle).toMatchObject({ fontSize: '12pt' });
  expect(imported.plotWidth).toBeCloseTo(128, 0);
  expect(imported.plotHeight).toBeCloseTo(192, 0);
  expect(imported.markers[0]).toMatchObject({ tag: 'circle', fill: '#000000' });
  expect(imported.markers[1]).toMatchObject({ tag: 'circle', fill: '#000000' });
  expect(imported.markers[2]).toMatchObject({ tag: 'rect', fill: '#ff0000' });
  expect(imported.markers.map(marker => marker.size)).toEqual([6, 6, 6]);
});

test('applies Prism tick intervals to Line without forcing automatic axis bounds', async ({ page }) => {
  test.setTimeout(90_000);
  const tabId = await importControlledFixture(page, 'line-graph-yaxis-range-probe.prism', 'line');
  await page.waitForFunction(id => {
    const session = window.Components?.line?.__testHooks?.getSession?.(id) || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && session?.state?.controls?.yMin === '220'
      && session?.state?.controls?.yMax === '380'
      && session?.state?.axisSettings?.y?.tickStart === 220
      && window.Components?.line?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });

  const imported = await page.evaluate(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item.id === id);
    const session = window.Components?.line?.__testHooks?.getSession?.(id) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || null;
    const renderedYTicks = Array.from(root?.querySelectorAll('#lineSvg [data-font-role="yTick"]') || [])
      .map(node => node.textContent?.trim() || '');
    return {
      controls: session?.state?.controls || {},
      axis: session?.state?.axisSettings || {},
      payload: tab?.payload?.config || {},
      renderedYTicks
    };
  }, tabId);
  expect(imported.controls).toMatchObject({ xMin: '', xMax: '', yMin: '220', yMax: '380' });
  expect(imported.axis.x.tickInterval).toBe(2);
  expect(imported.axis.y.tickInterval).toBe(40);
  expect(imported.axis.y.tickStart).toBe(220);
  expect(imported.payload).toMatchObject({ xMin: '', xMax: '', yMin: '220', yMax: '380' });
  expect(imported.payload.axis).toMatchObject({ tickIntervalX: 2, tickIntervalY: 40, tickStartY: 220 });
  expect(imported.renderedYTicks).toEqual(['220', '260', '300', '340', '380']);
});

test('renders Prism saved automatic axis bounds without converting them to manual limits', async ({ page }) => {
  test.setTimeout(90_000);
  const tabId = await importControlledFixture(page, 'line-graph.prism', 'line');
  await page.waitForFunction(id => {
    const session = window.Components?.line?.__testHooks?.getSession?.(id) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || null;
    const ticks = Array.from(root?.querySelectorAll('#lineSvg [data-font-role="yTick"]') || [])
      .map(node => node.textContent?.trim() || '');
    return window.Main?.session?.workspaceState?.activeTabId === id
      && session?.state?.axisSettings?.y?.autoRangeHint?.min === 200
      && session?.state?.axisSettings?.y?.autoRangeHint?.max === 400
      && ticks.length > 0
      && window.Components?.line?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });

  const imported = await page.evaluate(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item.id === id);
    const session = window.Components?.line?.__testHooks?.getSession?.(id) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || null;
    return {
      controls: session?.state?.controls || {},
      hint: session?.state?.axisSettings?.y?.autoRangeHint || null,
      payloadAxis: tab?.payload?.config?.axis || {},
      renderedYTicks: Array.from(root?.querySelectorAll('#lineSvg [data-font-role="yTick"]') || [])
        .map(node => node.textContent?.trim() || '')
    };
  }, tabId);

  expect(imported.controls).toMatchObject({ xMin: '', xMax: '', yMin: '', yMax: '' });
  expect(imported.hint).toEqual({ min: 200, max: 400, tickInterval: 50, tickStart: 200 });
  expect(imported.payloadAxis.autoRangeHintY).toEqual(imported.hint);
  expect(imported.renderedYTicks).toEqual(['200', '250', '300', '350', '400']);
});

test('renders saved automatic Prism axes in Scatter, Box and Survival', async ({ browser }) => {
  test.setTimeout(150_000);
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT || 4173}`;

  let page = await browser.newPage({ baseURL });
  const scatterTabId = await importControlledFixture(page, 'scatter-graph.prism', 'scatter');
  await page.waitForFunction(id => {
    const session = window.Components?.scatter?.__testHooks?.getSession?.(id) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter') || null;
    return session?.state?.axisSettings?.y?.autoRangeHint?.min === 200
      && root?.querySelector('#scatterPlot #scatterSvg [data-font-role="yTick"]')
      && window.Components?.scatter?.isIdleForSnapshot?.() === true;
  }, scatterTabId, { timeout: 30_000 });
  const scatter = await page.evaluate(id => {
    const session = window.Components?.scatter?.__testHooks?.getSession?.(id) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter') || null;
    return {
      axis: session?.state?.axisSettings || {},
      yTicks: Array.from(root?.querySelectorAll('#scatterPlot #scatterSvg [data-font-role="yTick"]') || [])
        .map(node => node.textContent?.trim() || '')
    };
  }, scatterTabId);
  expect(scatter.axis.y.autoRangeHint).toEqual({ min: 200, max: 400, tickInterval: 50, tickStart: 200 });
  expect(scatter.yTicks).toEqual(['200', '250', '300', '350', '400']);
  await page.close();

  page = await browser.newPage({ baseURL });
  const boxTabId = await importControlledFixture(page, 'individual-baseline-boxplot.prism', 'box');
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
    return window.Components?.box?.__getState?.()?.axisSettings?.y?.autoRangeHint?.max === 10
      && root?.querySelector('#boxPlot [data-font-role="yTick"]')
      && window.Components?.box?.isIdleForSnapshot?.() === true;
  }, boxTabId, { timeout: 30_000 });
  const box = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
    return {
      axis: window.Components?.box?.__getState?.()?.axisSettings || {},
      yTicks: Array.from(root?.querySelectorAll('#boxPlot [data-font-role="yTick"]') || [])
        .map(node => node.textContent?.trim() || ''),
      yMin: document.querySelector('#boxYMin')?.value || '',
      yMax: document.querySelector('#boxYMax')?.value || ''
    };
  }, boxTabId);
  expect(box.axis.y.autoRangeHint).toEqual({ min: 0, max: 10, tickInterval: 2, tickStart: 0 });
  expect(box.yTicks).toEqual(['0', '2', '4', '6', '8', '10']);
  expect({ yMin: box.yMin, yMax: box.yMax }).toEqual({ yMin: '', yMax: '' });
  await page.close();

  page = await browser.newPage({ baseURL });
  const survivalTabId = await importControlledFixture(page, 'survival-baseline-20261026.prism', 'survival');
  await page.waitForFunction(id => {
    const session = window.Components?.survival?.__testHooks?.getSession?.(id) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    return session?.state?.axisSettings?.y?.autoRangeHint?.max === 1.1
      && root?.querySelector('#survivalSvg [data-font-role="yTick"]')
      && window.Components?.survival?.isIdleForSnapshot?.() === true;
  }, survivalTabId, { timeout: 30_000 });
  const survival = await page.evaluate(id => {
    const session = window.Components?.survival?.__testHooks?.getSession?.(id) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    return {
      axis: session?.state?.axisSettings || {},
      xTicks: Array.from(root?.querySelectorAll('#survivalSvg [data-font-role="xTick"]') || [])
        .map(node => node.textContent?.trim() || ''),
      yTicks: Array.from(root?.querySelectorAll('#survivalSvg [data-font-role="yTick"]') || [])
        .map(node => node.textContent?.trim() || '')
    };
  }, survivalTabId);
  expect(survival.axis.x.autoRangeHint).toEqual({ min: 0, max: 400, tickInterval: 100, tickStart: 0 });
  expect(survival.axis.y.autoRangeHint).toEqual({ min: 0, max: 1.1, tickInterval: 0.5, tickStart: 0 });
  expect(survival.xTicks).toEqual(['0', '100', '200', '300', '400']);
  expect(survival.yTicks).toEqual(['0', '50', '100']);
  await page.close();
});

test('imports and renders Prism manual axis bounds and tick starts in Scatter, Box and Survival', async ({ browser }) => {
  test.setTimeout(120_000);
  const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_PORT || 4173}`;
  let page = await browser.newPage({ baseURL });
  const scatterFixture = await createPrismAxisRangeVariant('scatter-graph.prism', {
    x: { min: 0, max: 10, tickInterval: 2, tickStart: 0 },
    y: { min: 200, max: 400, tickInterval: 50, tickStart: 200 }
  });
  const scatterTabId = await importControlledFixture(page, 'scatter-graph.prism', 'scatter', scatterFixture);
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter') || null;
    return !!root?.querySelector('#scatterPlot #scatterSvg') && window.Components?.scatter?.isIdleForSnapshot?.() === true;
  }, scatterTabId, { timeout: 30_000 });
  const scatter = await page.evaluate(id => {
    const session = window.Components?.scatter?.__testHooks?.getSession?.(id) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter') || null;
    const ticks = axis => Array.from(root?.querySelectorAll(`#scatterPlot #scatterSvg [data-font-role="${axis}Tick"]`) || [])
      .map(node => node.textContent?.trim() || '');
    return {
      config: session?.state?.config || session?.config || {},
      axis: session?.state?.axisSettings || {},
      xTicks: ticks('x'),
      yTicks: ticks('y')
    };
  }, scatterTabId);
  expect(scatter.axis.x.tickStart).toBe(0);
  expect(scatter.axis.y.tickStart).toBe(200);
  expect(scatter.xTicks).toEqual(['0', '2', '4', '6', '8', '10']);
  expect(scatter.yTicks).toEqual(['200', '250', '300', '350', '400']);
  await page.close();

  page = await browser.newPage({ baseURL });
  const boxFixture = await createPrismAxisRangeVariant('individual-baseline-boxplot.prism', {
    y: { min: 2, max: 8, tickInterval: 2, tickStart: 2 }
  });
  const boxTabId = await importControlledFixture(page, 'individual-baseline-boxplot.prism', 'box', boxFixture);
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
    return !!root?.querySelector('#boxPlot svg') && window.Components?.box?.isIdleForSnapshot?.() === true;
  }, boxTabId, { timeout: 30_000 });
  const box = await page.evaluate(id => {
    const axis = window.Components?.box?.__getState?.()?.axisSettings || {};
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
    return {
      axis,
      controls: {
        yMin: document.querySelector('#boxYMin')?.value || '',
        yMax: document.querySelector('#boxYMax')?.value || ''
      },
      yTicks: Array.from(root?.querySelectorAll('#boxPlot [data-font-role="yTick"]') || [])
        .map(node => node.textContent?.trim() || '')
    };
  }, boxTabId);
  expect(box.axis.y.tickStart).toBe(2);
  expect(box.controls).toMatchObject({ yMin: '2', yMax: '8' });
  expect(box.yTicks).toEqual(['2', '4', '6', '8']);
  await page.close();

  page = await browser.newPage({ baseURL });
  const survivalFixture = await createPrismAxisRangeVariant('survival-baseline-20261026.prism', {
    x: { min: 10, max: 90, tickInterval: 20, tickStart: 10 },
    y: { min: 20, max: 80, tickInterval: 20, tickStart: 20 }
  });
  const survivalTabId = await importControlledFixture(page, 'survival-baseline-20261026.prism', 'survival', survivalFixture);
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    return !!root?.querySelector('#survivalSvg') && window.Components?.survival?.isIdleForSnapshot?.() === true;
  }, survivalTabId, { timeout: 30_000 });
  const survival = await page.evaluate(id => {
    const session = window.Components?.survival?.__testHooks?.getSession?.(id) || null;
    const payload = window.Components?.survival?.getPayload?.({ tabId: id }) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    const ticks = axis => Array.from(root?.querySelectorAll(`#survivalSvg [data-font-role="${axis}Tick"]`) || [])
      .map(node => node.textContent?.trim() || '');
    return {
      axis: session?.state?.axisSettings || {},
      payloadAxis: payload?.config?.axis || {},
      xTicks: ticks('x'),
      yTicks: ticks('y')
    };
  }, survivalTabId);
  expect(survival.axis.x).toMatchObject({ min: 10, max: 90, tickInterval: 20, tickStart: 10 });
  expect(survival.axis.y).toMatchObject({ min: 0.2, max: 0.8, tickInterval: 0.2, tickStart: 0.2 });
  expect(survival.payloadAxis).toMatchObject({ xMin: 10, xMax: 90, tickStartX: 10, yMin: 0.2, yMax: 0.8, tickStartY: 0.2, tickLabelMultiplierY: 100 });
  expect(survival.xTicks).toEqual(['10', '30', '50', '70', '90']);
  expect(survival.yTicks).toEqual(['20', '40', '60', '80']);
  await page.close();
});

test('renders downward triangles in Box individual-value plots', async ({ page }) => {
  test.setTimeout(90_000);
  const tabId = await importControlledFixture(page, 'individual-red-square.prism', 'box');
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
    return !!root?.querySelector('#boxPlot svg')
      && window.Components?.box?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });
  await page.evaluate(() => {
    window.Components.box.__testHooks.persistTracePointStyle(2, { shape: 'triangle-down' }, { recordUndo: false });
  });
  await page.waitForFunction(id => {
    return window.Components?.box?.__getState?.()?.pointStyles?.[2]?.shape === 'triangle-down';
  }, tabId, { timeout: 30_000 });

  const pathData = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
    return root?.querySelector('#boxPlot svg path[data-shape="triangle-down"]')?.getAttribute('d') || '';
  }, tabId);
  const vertices = [...pathData.matchAll(/[-\d.]+/g)].map(match => Number(match[0]));
  expect(vertices.length).toBeGreaterThanOrEqual(6);
  expect(vertices[1]).toBeLessThan(vertices[5]);
});

async function importControlledFixture(page, fixtureName, expectedType = 'box', fixtureBuffer = null, fixtureFolder = 'controlled'){
  const expectedTypes = Array.isArray(expectedType) ? expectedType : [expectedType];
  const fixturePath = path.join(
    __dirname,
    '..',
    '..',
    '__tests__',
    'fixtures',
    'prism-binary',
    'v10',
    fixtureFolder,
    fixtureName
  );
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#welcomeGraphFileInput').setInputFiles(fixtureBuffer
    ? { name: fixtureName, mimeType: 'application/octet-stream', buffer: fixtureBuffer }
    : fixturePath);
  await expect.poll(() => page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).filter(tab => !tab.isWelcome).map(tab => tab.type)
  )), { timeout: 80_000 }).toEqual(expectedTypes);
  const tabId = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome)?.id || null
  ));
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click();
  return tabId;
}

async function startDelayedPrismStyleImport(page, component, fixtureName, fixtureBuffer = null){
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator(`#graphSelectionGrid .graph-card[data-graph-type="${component}"] [data-welcome-action="new"]`).click();
  const firstTabId = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome)?.id || null
  ));
  await page.locator('#addWorkspaceTab').click();
  await page.locator(`#graphSelectionGrid .graph-card[data-graph-type="${component}"] [data-welcome-action="new"]`).click();
  const secondTabId = await page.evaluate(id => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome && tab.id !== id)?.id || null
  ), firstTabId);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.evaluate(() => {
    const tableImport = window.Shared?.tableImport;
    const originalOpenFile = tableImport?.openFile;
    const gate = { started: false, release: null };
    window.__prismDelayedImportGate = gate;
    const waitForRelease = new Promise(resolve => { gate.release = resolve; });
    tableImport.openFile = (...args) => {
      gate.started = true;
      return waitForRelease.then(() => originalOpenFile(...args)).finally(() => {
        tableImport.openFile = originalOpenFile;
      });
    };
  });
  const fixturePath = path.join(
    __dirname, '..', '..', '__tests__', 'fixtures', 'prism-binary', 'v10', 'controlled', fixtureName
  );
  await page.locator(`[data-workspace-tab-id="${firstTabId}"] #${component}File`).setInputFiles(fixtureBuffer
    ? { name: fixtureName, mimeType: 'application/octet-stream', buffer: fixtureBuffer }
    : fixturePath);
  await page.waitForFunction(() => window.__prismDelayedImportGate?.started === true);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${secondTabId}"]`).click();
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, secondTabId);
  await page.evaluate(() => window.__prismDelayedImportGate?.release?.());
  return { firstTabId, secondTabId };
}

async function createPrismAxisRangeVariant(fixtureName, ranges){
  const fixturePath = path.join(
    __dirname,
    '..',
    '..',
    '__tests__',
    'fixtures',
    'prism-binary',
    'v10',
    'controlled',
    fixtureName
  );
  const zip = await JSZip.loadAsync(fs.readFileSync(fixturePath));
  const documentModel = JSON.parse(await zip.file('document.json').async('string'));
  const graphIds = documentModel.sheets?.graphs || [];
  let changed = false;
  for(const graphId of graphIds){
    const graphPath = `graphs/${graphId}/data.bin`;
    const graph = Buffer.from(await zip.file(graphPath).async('uint8array'));
    const outer = prismBinary.parseOuter(graph);
    const summaries = outer?.records.filter(record => record.type === 0x0017 && record.size === 60) || [];
    const axisSegments = outer?.records.filter(record => record.type === 0x8025
      && (record.size === 122 || record.size === 134)) || [];
    if(summaries.length !== 3 || axisSegments.length !== 9){
      continue;
    }
    const view = new DataView(graph.buffer, graph.byteOffset, graph.byteLength);
    const segmentsByIndex = new Map(axisSegments.map(record => [view.getUint16(record.start, true), record]));
    const axisIndex = { x: 0, y: 1 };
    Object.entries(ranges || {}).forEach(([axis, range]) => {
      const index = axisIndex[axis];
      if(index == null){ return; }
      const segment = segmentsByIndex.get(index * 3);
      const summary = summaries[index];
      if(!segment || !summary){
        throw new Error(`Missing ${axis} axis records in ${fixtureName}`);
      }
      view.setUint16(summary.start + 40, 12, true);
      view.setFloat64(segment.start + 2, range.min, true);
      view.setFloat64(segment.start + 10, range.max, true);
      graph.copy(graph, summary.start + 16, segment.start + 2, segment.start + 18);
      view.setFloat64(segment.start + 54, range.tickInterval, true);
      view.setFloat64(segment.start + 62, range.tickStart, true);
    });
    zip.file(graphPath, graph);
    changed = true;
    break;
  }
  if(!changed){
    throw new Error(`Could not locate Prism axis records in ${fixtureName}`);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function importPrismV1Fixture(page, fixtureName, expectedType){
  const fixturePath = path.join(
    __dirname,
    '..',
    '..',
    '__tests__',
    'fixtures',
    'prism',
    'v1',
    fixtureName
  );
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#welcomeGraphFileInput').setInputFiles(fixturePath);
  await expect.poll(() => page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).filter(tab => !tab.isWelcome).map(tab => tab.type)
  )), { timeout: 80_000 }).toEqual([expectedType]);
  const tabId = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome)?.id || null
  ));
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click();
  return tabId;
}

async function createPrismSeriesColorVariant(fixtureName, seriesIndex, color){
  const fixturePath = path.join(
    __dirname,
    '..',
    '..',
    '__tests__',
    'fixtures',
    'prism-binary',
    'v10',
    'controlled',
    fixtureName
  );
  const zip = await JSZip.loadAsync(fs.readFileSync(fixturePath));
  const documentModel = JSON.parse(await zip.file('document.json').async('string'));
  const graphPath = `graphs/${documentModel.sheets.graphs[0]}/data.bin`;
  const graph = Buffer.from(await zip.file(graphPath).async('uint8array'));
  const outer = prismBinary.parseOuter(graph);
  const frame = outer && prismBinary.extractZvalFrame(outer);
  const zval = outer?.records.find(record => record.type === 0x0852);
  if(!frame || !zval){
    throw new Error(`Missing Prism graph property tree in ${fixtureName}`);
  }
  const rawProperties = Buffer.from(require('../../libs/pako.min.js').inflate(frame.payload));
  const key = Buffer.from('PCFF_Plot::connectlinecolor');
  const valueOffsets = [];
  let keyOffset = -1;
  while((keyOffset = rawProperties.indexOf(key, keyOffset + 1)) >= 0){
    const typeOffset = keyOffset + key.length + 8;
    const sizeOffset = keyOffset + key.length + 12;
    const valueOffset = keyOffset + key.length + 16;
    if(rawProperties.readUInt32LE(typeOffset) !== 1 || rawProperties.readUInt32LE(sizeOffset) !== 4){
      throw new Error(`Unexpected Prism line-color value in ${fixtureName}`);
    }
    valueOffsets.push(valueOffset);
  }
  if(valueOffsets.length <= seriesIndex){
    throw new Error(`Could not find Prism series ${seriesIndex} line color in ${fixtureName}`);
  }
  const rgba = /^#[0-9a-f]{6}$/i.test(color)
    ? color.slice(1).match(/.{2}/g).map(value => parseInt(value, 16)).concat(255)
    : null;
  if(!rgba){
    throw new Error(`Invalid fixture color: ${color}`);
  }
  rawProperties.set(rgba, valueOffsets[seriesIndex]);
  const compressed = zlib.deflateSync(rawProperties, { level: 9 });
  const zvalPayload = Buffer.alloc(16 + compressed.length);
  zvalPayload.write('Zval', 0, 'ascii');
  zvalPayload.writeUInt32LE(compressed.length, 4);
  zvalPayload.writeUInt32LE(rawProperties.length, 8);
  compressed.copy(zvalPayload, 12);
  zvalPayload.write('Zend', 12 + compressed.length, 'ascii');
  const recordHeader = Buffer.alloc(6);
  recordHeader.writeUInt16LE(zval.type, 0);
  recordHeader.writeUInt32LE(zvalPayload.length, 2);
  const changedGraph = Buffer.concat([
    graph.subarray(0, zval.offset),
    recordHeader,
    zvalPayload,
    graph.subarray(zval.offset + 6 + zval.size)
  ]);
  const delta = zvalPayload.length - zval.size;
  outer.records.filter(record => (record.type & 0xC000) === 0x8000
    && record.offset < zval.offset
    && record.offset + 6 + record.size >= zval.offset + 6 + zval.size)
    .forEach(record => changedGraph.writeUInt32LE(record.size + delta, record.offset + 2));
  zip.file(graphPath, changedGraph);
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function createConnectedLineFixture(fixtureName){
  const fixturePath = path.join(
    __dirname,
    '..',
    '..',
    '__tests__',
    'fixtures',
    'prism-binary',
    'v10',
    'controlled',
    fixtureName
  );
  const zip = await JSZip.loadAsync(fs.readFileSync(fixturePath));
  const documentModel = JSON.parse(await zip.file('document.json').async('string'));
  let changed = false;
  for(const graphId of documentModel.sheets?.graphs || []){
    const graphPath = `graphs/${graphId}/data.bin`;
    const graphBuffer = Buffer.from(await zip.file(graphPath).async('uint8array'));
    const outer = prismBinary.parseOuter(graphBuffer);
    const records = outer?.records.filter(record => record.type === 0x8028) || [];
    records.forEach(record => {
      graphBuffer[record.start + 64] = 1;
    });
    if(records.length){
      zip.file(graphPath, graphBuffer);
      changed = true;
    }
  }
  if(!changed){
    throw new Error(`No Prism XY connection records found in ${fixtureName}`);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

for(const scenario of [
  { file: 'individual-baseline-bar.prism', graphType: 'bar', pointMode: 'none' },
  { file: 'individual-baseline-bar-plus-individual-value-overlay.prism', graphType: 'bar', pointMode: 'overlay' },
  { file: 'individual-baseline-boxplot.prism', graphType: 'box', pointMode: 'none' }
]){
  test(`imports Prism ${scenario.graphType} graph type from ${scenario.file}`, async ({ page }) => {
    test.setTimeout(90_000);
    const tabId = await importControlledFixture(page, scenario.file);
    await page.waitForFunction(({ id, graphType, pointMode }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      return window.Main?.session?.workspaceState?.activeTabId === id
        && root?.querySelector('#boxGraphType')?.value === graphType
        && (!pointMode || root?.querySelector('#boxPointMode')?.value === pointMode)
        && !!root?.querySelector('#boxPlot svg')
        && window.Components?.box?.isIdleForSnapshot?.() === true;
    }, { id: tabId, graphType: scenario.graphType, pointMode: scenario.pointMode }, { timeout: 30_000 });
  });
}

for(const scenario of [
  { file: 'individual-baseline-frame-only-20261026.prism', showFrame: true, showGrid: false },
  { file: 'individual-baseline-grid-only-20261026.prism', showFrame: false, showGrid: true }
]){
  test(`imports Prism frame and horizontal grid from ${scenario.file}`, async ({ page }) => {
    test.setTimeout(90_000);
    const tabId = await importControlledFixture(page, scenario.file);
    await page.waitForFunction(({ id, showFrame, showGrid }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      const svg = root?.querySelector('#boxPlot svg') || null;
      const session = window.Components?.box?.__testHooks?.getSession?.(id) || null;
      return window.Main?.session?.workspaceState?.activeTabId === id
        && !!svg
        && root?.querySelector('#boxShowFrame')?.checked === showFrame
        && root?.querySelector('#boxShowGrid')?.checked === showGrid
        && session?.state?.controls?.showFrame === showFrame
        && session?.state?.controls?.showGrid === showGrid
        && window.Components?.box?.isIdleForSnapshot?.() === true;
    }, { id: tabId, showFrame: scenario.showFrame, showGrid: scenario.showGrid }, { timeout: 30_000 });

    const rendered = await page.evaluate(id => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      const svg = root?.querySelector('#boxPlot svg') || null;
      const frame = svg?.querySelector('[data-box-frame="1"]') || null;
      const frameLines = Array.from(frame?.querySelectorAll('[data-box-frame-side]') || []);
      const gridLayer = svg?.querySelector('[data-layer="box-grid"]') || null;
      return {
        frameLinesVisible: frameLines.filter(line => getComputedStyle(line).display !== 'none').length,
        gridLinesVisible: gridLayer && getComputedStyle(gridLayer).display !== 'none'
          ? gridLayer.childElementCount : 0
      };
    }, tabId);
    if(scenario.showFrame){
      expect(rendered.frameLinesVisible).toBeGreaterThan(0);
    }
    expect(rendered.gridLinesVisible > 0).toBe(scenario.showGrid);
  });
}

for(const scenario of [
  { file: 'individual-baseline-boxplot-treated-border-red.prism', graphType: 'box', treatedFill: '#808080', treatedBorder: '#ff0000', points: [2, 2, 2] },
  { file: 'individual-baseline-boxplot-treated-border-red.pzfx', folder: 'matched-pzfx', graphType: 'box', treatedFill: '#808080', treatedBorder: '#ff0000', points: [2, 2, 2] },
  { file: 'individual-baseline-boxplot-Treated-red-filled.prism', graphType: 'box', treatedFill: '#ff0000', treatedBorder: '#000000', points: [2, 2, 2] },
  { file: 'individual-baseline-boxplot-1px-border.prism', graphType: 'box', treatedFill: '#808080', treatedBorder: '#000000', points: [2, 2, 1] },
  { file: 'individual-baseline-bar-no-border.prism', graphType: 'bar', treatedFill: '#808080', treatedBorder: '#000000', points: [0, 0, 0] }
]){
  test(`applies Prism ${scenario.graphType} fill and border styles from ${scenario.file}`, async ({ page }) => {
    test.setTimeout(90_000);
    const tabId = await importControlledFixture(page, scenario.file, 'box', null, scenario.folder || 'controlled');
    await page.waitForFunction(({ id, graphType }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      return window.Main?.session?.workspaceState?.activeTabId === id
        && root?.querySelector('#boxGraphType')?.value === graphType
        && !!root?.querySelector('#boxPlot svg [data-box-shape="body"]:not([data-summary-line="1"])[data-trace="2"]')
        && window.Components?.box?.isIdleForSnapshot?.() === true;
    }, { id: tabId, graphType: scenario.graphType }, { timeout: 30_000 });
    const imported = await page.evaluate(id => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      const session = window.Components?.box?.__testHooks?.getSession?.(id) || null;
      const svg = root?.querySelector('#boxPlot svg') || null;
      const body = svg?.querySelector('[data-box-shape="body"]:not([data-summary-line="1"])[data-trace="2"]') || null;
      const median = svg?.querySelector('[data-box-overlay-kind="box-median"][data-trace="2"]') || null;
      const whiskers = svg?.querySelector('[data-box-overlay-kind="box-whiskers"][data-trace="2"]') || null;
      return {
        style: session?.state?.styles?.traceShapeStyles?.[2] || null,
        styles: [0, 1, 2].map(index => session?.state?.styles?.traceShapeStyles?.[index] || null),
        summaryStyle: session?.state?.styles?.summaryStyles?.[2] || null,
        fillColor: session?.state?.visual?.fillColors?.[2] || null,
        borderColor: session?.state?.visual?.borderColors?.[2] || null,
        rendered: body ? {
          fill: body.getAttribute('fill'),
          stroke: body.getAttribute('stroke'),
          width: Number(body.getAttribute('data-inner-stroke-width') ?? body.getAttribute('stroke-width'))
        } : null,
        overlayWidths: {
          median: median ? Number(median.getAttribute('stroke-width')) : null,
          whiskers: whiskers ? Number(whiskers.getAttribute('stroke-width')) : null
        },
        overlayColors: {
          median: median?.getAttribute('stroke') || null,
          whiskers: whiskers?.getAttribute('stroke') || null
        }
      };
    }, tabId);
    const expectedWidths = scenario.points.map(prismThicknessToCssPixels);
    expect(imported.style).toMatchObject({
      fill: scenario.treatedFill, borderColor: scenario.treatedBorder, thickness: expectedWidths[2]
    });
    expect(imported.styles).toMatchObject([
      { fill: 'rgba(0, 0, 0, 0.502)', borderColor: '#000000', thickness: expectedWidths[0] },
      { fill: '#a0a0a4', borderColor: '#000000', thickness: expectedWidths[1] },
      { fill: scenario.treatedFill, borderColor: scenario.treatedBorder, thickness: expectedWidths[2] }
    ]);
    expect(imported.fillColor).toBe(scenario.treatedFill);
    expect(imported.borderColor).toBe(scenario.treatedBorder);
    expect(imported.rendered).toMatchObject({
      fill: scenario.treatedFill,
      stroke: expectedWidths[2] > 0 ? scenario.treatedBorder : 'none',
      width: expectedWidths[2]
    });
    if(scenario.graphType === 'box'){
      expect(imported.summaryStyle).toMatchObject({ color: scenario.treatedBorder, thickness: expectedWidths[2] });
      expect(imported.overlayWidths).toEqual({
        median: expectedWidths[2],
        whiskers: expectedWidths[2]
      });
      expect(imported.overlayColors).toEqual({
        median: scenario.treatedBorder,
        whiskers: scenario.treatedBorder
      });
    }
  });
}

test('applies Prism bar error-bar color and thickness to the matching dataset', async ({ page }) => {
  test.setTimeout(90_000);
  const file = 'individual-baseline-bar-treated-errorbar-5pt-red-20261027.prism';
  const tabId = await importControlledFixture(page, file);
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
    const session = window.Components?.box?.__testHooks?.getSession?.(id) || null;
    return session?.state?.controls?.graphType === 'bar'
      && !!root?.querySelector('#boxPlot svg [data-box-overlay-kind="bar-error"][data-style-trace="2"]')
      && window.Components?.box?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });

  const imported = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
    const session = window.Components?.box?.__testHooks?.getSession?.(id) || null;
    const overlay = root?.querySelector('#boxPlot svg [data-box-overlay-kind="bar-error"][data-style-trace="2"]') || null;
    return {
      summaryStyles: session?.state?.styles?.summaryStyles || {},
      overlay: overlay ? {
        color: overlay.getAttribute('stroke'),
        width: Number(overlay.getAttribute('stroke-width'))
      } : null
    };
  }, tabId);
  const treatedWidth = prismThicknessToCssPixels(5);
  expect(imported.summaryStyles[0]).toMatchObject({ color: '#000000', thickness: prismThicknessToCssPixels(0.5) });
  expect(imported.summaryStyles[1]).toMatchObject({ color: '#000000', thickness: prismThicknessToCssPixels(0.5) });
  expect(imported.summaryStyles[2]).toMatchObject({ color: '#ff0000', thickness: treatedWidth });
  expect(imported.overlay).toEqual({ color: '#ff0000', width: treatedWidth });
});

for(const scenario of [
  { file: 'individual-baseline-boxplot-log2-yaxis-20261027.prism', base: 2, notation: 'decimal', hint: { min: 2, max: 16, tickInterval: 1, tickStart: 2 }, ticks: ['2', '4', '8', '16'] },
  { file: 'individual-baseline-boxplot-log2-yaxis-scientific-20261027.prism', base: 2, notation: 'scientific', hint: { min: 2, max: 16, tickInterval: 1, tickStart: 2 }, ticks: ['2×10⁰', '4×10⁰', '8×10⁰', '1.6×10¹'] },
  { file: 'individual-baseline-boxplot-log10-yaxis-20261027.prism', base: 10, notation: 'decimal', hint: { min: 1, max: 10, tickInterval: 1, tickStart: 1 }, ticks: ['1', '10'] }
]){
  test(`imports Prism log base ${scenario.base} with ${scenario.notation} tick labels`, async ({ page }) => {
    test.setTimeout(90_000);
    const tabId = await importControlledFixture(page, scenario.file);
    await page.waitForFunction(id => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      const session = window.Components?.box?.__testHooks?.getSession?.(id) || null;
      const ticks = root?.querySelectorAll('#boxPlot svg [data-box-axis-tick="y"]') || [];
      return session?.state?.controls?.logScale === true
        && !!session?.state?.controls?.logBase
        && ticks.length > 0
        && window.Components?.box?.isIdleForSnapshot?.() === true;
    }, tabId, { timeout: 30_000 });

    const imported = await page.evaluate(id => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      const session = window.Components?.box?.__testHooks?.getSession?.(id) || null;
      const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item.id === id) || null;
      return {
        controls: session?.state?.controls || {},
        hint: session?.state?.layout?.axisSettings?.y?.autoRangeHint || null,
        notation: session?.state?.layout?.axisSettings?.y?.notation || null,
        payload: tab?.payload?.config || {},
        ticks: Array.from(root?.querySelectorAll('#boxPlot svg [data-box-axis-tick="y"]') || [])
          .map(node => node.textContent?.trim() || '')
      };
    }, tabId);
    expect(imported.controls).toMatchObject({ logScale: true, logBase: scenario.base, yMin: '', yMax: '' });
    expect(imported.hint).toEqual(scenario.hint);
    expect(imported.notation).toBe(scenario.notation);
    expect(imported.payload.axis?.notation?.y).toBe(scenario.notation);
    expect(imported.payload).toMatchObject({ logScale: true, logBase: scenario.base });
    expect(imported.ticks).toEqual(scenario.ticks);
  });
}

for(const scenario of [
  { file: 'scatter-graph.prism', type: 'scatter' },
  { file: 'line-graph.prism', type: 'line' }
]){
  test(`routes the same XY table to ${scenario.type} from its graph connections`, async ({ page }) => {
    test.setTimeout(90_000);
    const tabId = await importControlledFixture(page, scenario.file, scenario.type);
    await page.waitForFunction(({ id, type }) => {
      const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item.id === id);
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || null;
      const plot = type === 'line' ? '#linePlot #lineSvg' : '#scatterPlot #scatterSvg';
      const component = window.Components?.[type];
      return tab?.type === type
        && !!root?.querySelector(plot)
        && component?.isIdleForSnapshot?.() === true;
    }, { id: tabId, type: scenario.type }, { timeout: 30_000 });
  });
}

for(const scenario of [
  { file: 'scatter-graph.prism', type: 'scatter' },
  { file: 'line-graph.prism', type: 'line' }
]){
  test(`applies decoded Prism axes and per-dataset styles to ${scenario.type}`, async ({ page }) => {
    test.setTimeout(90_000);
    const tabId = await importControlledFixture(page, scenario.file, scenario.type);
    await page.waitForFunction(({ id, type }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || null;
      return window.Main?.session?.workspaceState?.activeTabId === id
        && !!root?.querySelector(`#${type}Plot svg`)
        && window.Components?.[type]?.isIdleForSnapshot?.() === true;
    }, { id: tabId, type: scenario.type }, { timeout: 30_000 });

    const imported = await page.evaluate(({ id, type }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || null;
      const session = window.Components?.[type]?.__testHooks?.getSession?.(id) || null;
      const svgBox = root?.querySelector(`#${type}Plot`)?.closest('.svgbox') || null;
      const fonts = window.Shared?.fontControls?.exportScopeStyles?.(type, { tabId: id }) || {};
      return {
        axes: session?.state?.axisSettings || null,
        axisLengths: {
          x: Number(svgBox?.dataset?.cartesianAxisLengthX),
          y: Number(svgBox?.dataset?.cartesianAxisLengthY)
        },
        fonts,
        labels: session?.state?.labels || null,
        grouped: session?.state?.grouped || null,
        styles: session?.state?.styles || null
      };
    }, { id: tabId, type: scenario.type });

    expect(imported.axes.strokeWidth).toBeCloseTo(prismThicknessToCssPixels(1), 3);
    expect(imported.axes.x.majorTickLength).toBe(8);
    expect(imported.axes.y.majorTickLength).toBe(8);
    expect(imported.axisLengths.x).toBeCloseTo(288, 0);
    expect(imported.axisLengths.y).toBeCloseTo(192, 0);
    expect(imported.fonts.xTick).toMatchObject({ fontSize: '11pt', fontWeight: '700' });
    expect(imported.fonts.yTick).toMatchObject({ fontSize: '11pt', fontWeight: '700' });

    if(scenario.type === 'scatter'){
      expect(imported.fonts.graphTitle).toMatchObject({ fontSize: '14pt' });
      expect(imported.fonts.xTitle).toMatchObject({ fontSize: '12pt' });
      expect(imported.fonts.yTitle).toMatchObject({ fontSize: '12pt' });
      expect(imported.styles.labelStyles['Median reaction time']).toMatchObject({
        shape: 'square', size: 4, fill: '#000000'
      });
    }else{
      expect(imported.grouped.labels).toEqual(['Mean reaction time', 'Median reaction time', '25th percentile']);
      expect(imported.grouped.shapes).toEqual(['circle', 'square', 'triangle']);
      expect(imported.styles.series['Median reaction time']).toMatchObject({ dotSize: 4, markerFill: '#000000' });
    }
  });
}

test('keeps Prism downward triangles distinct from upward triangles in Scatter', async ({ page }) => {
  test.setTimeout(90_000);
  const tabId = await importControlledFixture(page, 'treated-triangle-down.prism', 'scatter');
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter') || null;
    const session = window.Components?.scatter?.__testHooks?.getSession?.(id) || null;
    return session?.state?.styles?.labelStyles?.Treated?.shape === 'triangle-down'
      && !!root?.querySelector('#scatterPlot svg g[data-export-layer="scatter-points"] path[data-plot-point="1"]')
      && window.Components?.scatter?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });

  const imported = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter') || null;
    const session = window.Components?.scatter?.__testHooks?.getSession?.(id) || null;
    const paths = Array.from(root?.querySelectorAll('#scatterPlot svg g[data-export-layer="scatter-points"] path[data-plot-point="1"]') || []);
    return {
      treatedShape: session?.state?.styles?.labelStyles?.Treated?.shape,
      points: paths.map(path => path.getAttribute('d'))
    };
  }, tabId);

  expect(imported.treatedShape).toBe('triangle-down');
  expect(imported.points.some(d => /^M\s*[-\d.]+\s+[-\d.]+\s+L\s*[-\d.]+\s+[-\d.]+\s+L\s*[-\d.]+\s+[-\d.]+\s+Z$/.test(d || ''))).toBe(true);
  const downwardPath = imported.points.find(d => /^M\s*[-\d.]+\s+([-\d.]+)\s+L\s*[-\d.]+\s+([-\d.]+)\s+L\s*[-\d.]+\s+\2\s+Z$/.test(d || ''));
  expect(downwardPath).toBeTruthy();
  const vertices = [...downwardPath.matchAll(/[-\d.]+/g)].map(match => Number(match[0]));
  expect(vertices[1]).toBeGreaterThan(vertices[3]);
});

test('imports Prism symbol size and color for the matching Scatter condition', async ({ page }) => {
  test.setTimeout(90_000);
  const tabId = await importControlledFixture(page, 'treated-red.prism', 'scatter');
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter') || null;
    const session = window.Components?.scatter?.__testHooks?.getSession?.(id) || null;
    return session?.state?.styles?.labelStyles?.Treated?.size === 9
      && session?.state?.styles?.labelStyles?.Treated?.fill === '#ff0000'
      && !!root?.querySelector('#scatterPlot svg g[data-export-layer="scatter-points"] rect[data-plot-point="1"]')
      && window.Components?.scatter?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });

  const imported = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter') || null;
    const session = window.Components?.scatter?.__testHooks?.getSession?.(id) || null;
    const redMarkers = Array.from(root?.querySelectorAll('#scatterPlot svg g[data-export-layer="scatter-points"] rect[data-plot-point="1"]') || [])
      .filter(marker => marker.getAttribute('fill') === '#ff0000');
    return {
      treated: session?.state?.styles?.labelStyles?.Treated || null,
      redMarkers: redMarkers.length,
      markerSizes: redMarkers.map(marker => Number(marker.getAttribute('width')))
    };
  }, tabId);

  expect(imported.treated).toMatchObject({ shape: 'square', size: 9, fill: '#ff0000' });
  expect(imported.redMarkers).toBeGreaterThan(0);
  imported.markerSizes.forEach(size => expect(size).toBeCloseTo(18, 0));
});

test('imports changed Prism marker and axis styles into connected Line graphs', async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = await createConnectedLineFixture('treated-red.prism');
  const tabId = await importControlledFixture(page, 'treated-red-line.prism', 'line', fixture);
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || null;
    const session = window.Components?.line?.__testHooks?.getSession?.(id) || null;
    return session?.state?.grouped?.labels?.includes('Treated')
      && !!root?.querySelector('#linePlot #lineSvg')
      && window.Components?.line?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });

  const imported = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || null;
    const session = window.Components?.line?.__testHooks?.getSession?.(id) || null;
    const svg = root?.querySelector('#linePlot svg') || null;
    return {
      axis: session?.state?.axisSettings || null,
      grouped: session?.state?.grouped || null,
      styles: session?.state?.styles || null,
      fonts: window.Shared?.fontControls?.exportScopeStyles?.('line', { tabId: id }) || {},
      redMarkers: Array.from(svg?.querySelectorAll('g[data-series="Treated"][data-line-style-role="markers"] rect') || [])
        .filter(marker => marker.getAttribute('fill') === '#ff0000')
        .map(marker => Number(marker.getAttribute('width')))
    };
  }, tabId);

  expect(imported.axis.strokeWidth).toBeCloseTo(prismThicknessToCssPixels(1), 3);
  expect(imported.axis.x.majorTickLength).toBe(8);
  expect(imported.axis.y.majorTickLength).toBe(8);
  expect(imported.grouped.shapes[1]).toBe('square');
  expect(imported.styles.series.Treated).toMatchObject({ dotSize: 9, markerFill: '#ff0000' });
  expect(imported.fonts.graphTitle).toMatchObject({ fontSize: '14pt' });
  expect(imported.fonts.xTitle).toMatchObject({ fontSize: '12pt' });
  expect(imported.fonts.yTitle).toMatchObject({ fontSize: '12pt' });
  expect(imported.redMarkers.length).toBeGreaterThan(0);
  imported.redMarkers.forEach(size => expect(size).toBeCloseTo(18, 0));
});

test('keeps each matched PZFX Line marker on its indexed dataset', async ({ page }) => {
  test.setTimeout(90_000);
  const tabId = await importControlledFixture(
    page,
    'line-graph-mean-reaction-time-line-red.pzfx',
    'line',
    null,
    'matched-pzfx'
  );
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || null;
    const session = window.Components?.line?.__testHooks?.getSession?.(id) || null;
    return session?.state?.grouped?.shapes?.[2] === 'triangle'
      && root?.querySelectorAll('#linePlot svg g[data-series="25th percentile"][data-line-style-role="markers"] path').length > 0
      && window.Components?.line?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });

  const imported = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || null;
    const session = window.Components?.line?.__testHooks?.getSession?.(id) || null;
    const markers = Array.from(root?.querySelectorAll(
      '#linePlot svg g[data-series="25th percentile"][data-line-style-role="markers"] path'
    ) || []);
    return {
      shapes: session?.state?.grouped?.shapes,
      markerPaths: markers.map(marker => marker.getAttribute('d'))
    };
  }, tabId);

  expect(imported.shapes).toEqual(['circle', 'square', 'triangle']);
  expect(imported.markerPaths.length).toBeGreaterThan(0);
  imported.markerPaths.forEach(pathData => {
    const numbers = [...String(pathData || '').matchAll(/[-\d.]+/g)].map(match => Number(match[0]));
    expect(numbers.length).toBeGreaterThanOrEqual(6);
    expect(numbers[1]).toBeLessThan(numbers[3]);
    expect(numbers[1]).toBeLessThan(numbers[5]);
  });
});

test('imports XY replicates as two grouped Line conditions', async ({ page }) => {
  test.setTimeout(90_000);
  const prismPath = path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'prism', 'v1', 'example-file-line-y-axis.prism');
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#welcomeGraphFileInput').setInputFiles(prismPath);
  await expect.poll(() => page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).filter(tab => !tab.isWelcome).map(tab => tab.type)
  )), { timeout: 80_000 }).toEqual(['line']);
  const tabId = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome)?.id || null
  ));
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).click();
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && !!root?.querySelector('#linePlot #lineSvg')
      && window.Components?.line?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });
  const groupedTable = await page.evaluate(id => {
    const session = window.Components?.line?.__testHooks?.getSession?.(id) || null;
    const hot = session?.managers?.hot || window.Components?.line?.getHot?.() || null;
    return {
      replicates: session?.state?.grouped?.replicates,
      labels: session?.state?.grouped?.labels || [],
      tableFormat: session?.state?.controls?.tableFormat,
      header: hot?.getData?.()?.[0]?.slice(0, 7) || [],
      firstDataRow: hot?.getData?.()?.[1]?.slice(0, 7) || []
    };
  }, tabId);
  expect(groupedTable).toMatchObject({
    replicates: 3,
    labels: ['Control', 'Treated'],
    tableFormat: 'grouped',
    header: ['Hours', 'Control', '', '', 'Treated', '', ''],
    firstDataRow: ['0', '45', '34', '', '34', '31', '29']
  });
});

test('routes both XY and column tables in the mixed Prism archive', async ({ page }) => {
  test.setTimeout(90_000);
  await importControlledFixture(page, 'treated-size-6.prism', ['scatter', 'box']);
  const tabs = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => !tab.isWelcome)
      .map(tab => ({ id: tab.id, type: tab.type }))
  ));
  expect(tabs.map(tab => tab.type)).toEqual(['scatter', 'box']);

  for(const tab of tabs){
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tab.id}"]`).click();
    await page.waitForFunction(({ id, type }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || null;
      const graph = type === 'scatter'
        ? root?.querySelector('#scatterPlot #scatterSvg')
        : root?.querySelector('#boxPlot svg');
      const component = type === 'scatter' ? window.Components?.scatter : window.Components?.box;
      return window.Main?.session?.workspaceState?.activeTabId === id
        && !!graph
        && component?.isIdleForSnapshot?.() === true;
    }, tab, { timeout: 30_000 });
  }
});

for(const file of [
  'axis-width-4cm.prism',
  'axis-height-6cm.prism',
  'axis-thickness-2pt.prism',
  'axis-thickness-3pt.prism'
]){
  test(`routes unconnected XY axis-style sample to Scatter: ${file}`, async ({ page }) => {
    test.setTimeout(90_000);
    const tabId = await importControlledFixture(page, file, 'scatter');
    await page.waitForFunction(id => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter') || null;
      return window.Main?.session?.workspaceState?.activeTabId === id
        && !!root?.querySelector('#scatterPlot #scatterSvg')
        && window.Components?.scatter?.isIdleForSnapshot?.() === true;
    }, tabId, { timeout: 30_000 });
  });
}

for(const scenario of [
  { file: 'individual-baseline.prism', x: 8, y: 8 },
  { file: 'individual-baseline-yaxis-ticklength-short.prism', x: 8, y: 6 }
]){
  test(`imports Prism tick lengths from ${scenario.file}`, async ({ page }) => {
    test.setTimeout(90_000);
    const tabId = await importControlledFixture(page, scenario.file);
    await page.waitForFunction(id => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      return window.Main?.session?.workspaceState?.activeTabId === id
        && !!root?.querySelector('#boxPlot svg line[data-box-major-tick-axis="x"]')
        && !!root?.querySelector('#boxPlot svg line[data-box-major-tick-axis="y"]')
        && window.Components?.box?.isIdleForSnapshot?.() === true;
    }, tabId, { timeout: 30_000 });
    const imported = await page.evaluate(id => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      const svg = root?.querySelector('#boxPlot svg') || null;
      const tickLength = axis => {
        const tick = svg?.querySelector(`line[data-box-major-tick-axis="${axis}"]`);
        return tick ? Math.hypot(
          Number(tick.getAttribute('x2')) - Number(tick.getAttribute('x1')),
          Number(tick.getAttribute('y2')) - Number(tick.getAttribute('y1'))
        ) : null;
      };
      const state = window.Components?.box?.__getState?.();
      return {
        x: state?.axisSettings?.x?.majorTickLength,
        y: state?.axisSettings?.y?.majorTickLength,
        renderedX: tickLength('x'),
        renderedY: tickLength('y')
      };
    }, tabId);
    expect(imported.x).toBe(scenario.x);
    expect(imported.y).toBe(scenario.y);
    expect(imported.renderedX).toBeCloseTo(scenario.x, 2);
    expect(imported.renderedY).toBeCloseTo(scenario.y, 2);
  });
}

for(const scenario of [
  { file: 'individual-baseline.prism', xSize: 11, xWeight: '700', ySize: 11, yWeight: '700' },
  { file: 'individual-baseline-xaxis-labels-nonbold.prism', xSize: 11, xWeight: '400', ySize: 11, yWeight: '700' },
  { file: 'individual-baseline-yaxis-labels-nonbold.prism', xSize: 11, xWeight: '700', ySize: 11, yWeight: '400' },
  { file: 'individual-baseline-xaxis-labels-fontsize-14.prism', xSize: 14, xWeight: '700', ySize: 11, yWeight: '700' },
  { file: 'individual-baseline-yaxis-labels-fontsize-14.prism', xSize: 11, xWeight: '700', ySize: 14, yWeight: '700' }
]){
  test(`imports Prism X/Y tick-label fonts from ${scenario.file}`, async ({ page }) => {
    test.setTimeout(90_000);
    const tabId = await importControlledFixture(page, scenario.file);
    await page.waitForFunction(id => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      const svg = root?.querySelector('#boxPlot svg') || null;
      return window.Main?.session?.workspaceState?.activeTabId === id
        && !!svg?.querySelector('[data-box-axis-tick="x"]')
        && !!svg?.querySelector('[data-box-axis-tick="y"]')
        && window.Components?.box?.isIdleForSnapshot?.() === true;
    }, tabId, { timeout: 30_000 });
    const imported = await page.evaluate(id => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      const svg = root?.querySelector('#boxPlot svg') || null;
      const style = axis => {
        const label = svg?.querySelector(`[data-box-axis-tick="${axis}"]`);
        const computed = label ? window.getComputedStyle(label) : null;
        return {
          sizePx: Number.parseFloat(computed?.fontSize || ''),
          weight: computed?.fontWeight || null
        };
      };
      return { x: style('x'), y: style('y') };
    }, tabId);
    expect(imported.x.sizePx).toBeCloseTo(scenario.xSize * (96 / 72), 2);
    expect(imported.x.weight).toBe(scenario.xWeight);
    expect(imported.y.sizePx).toBeCloseTo(scenario.ySize * (96 / 72), 2);
    expect(imported.y.weight).toBe(scenario.yWeight);
  });
}

for (const extension of ['prism', 'pzfx']) {
test(`imports and renders every mixed-type demo .${extension} table`, async ({ page }) => {
  test.setTimeout(90_000);
  const prismPath = path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'prism', 'v1', `demo_dataset.${extension}`);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  page.on('dialog', dialog => dialog.accept());

  await page.locator('#welcomeGraphFileInput').setInputFiles(prismPath);

  await expect.poll(() => page.evaluate(() => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return tabs.filter(tab => !tab.isWelcome).map(tab => ({ title: tab.title, type: tab.type }));
  }), { timeout: 80_000 }).toEqual(expectedTabs);

  const importedTabs = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => !tab.isWelcome)
      .map(tab => ({ id: tab.id, title: tab.title, type: tab.type }))
  ));
  for (const tab of importedTabs) {
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tab.id}"]`).click();
    const root = page.locator(`[data-workspace-tab-id="${tab.id}"]`);
    await expect(root.locator(`#${tab.type}Svg`)).toHaveCount(1);
    await expect(root.locator('.svgbox')).not.toContainText('Add data to the input table');
    if(tab.title === 'Grouped: Entering replicate data'){
      await expect(root.locator('#boxTableFormat')).toHaveValue('grouped');
      await expect(root.locator('#boxGroupedReplicates')).toHaveValue('5');
    }
  }
});
}

for(const scenario of prismV1SingleFixtures){
  test(`opens and renders Prism v1 fixture ${scenario.file}`, async ({ page }) => {
    test.setTimeout(90_000);
    const tabId = await importPrismV1Fixture(page, scenario.file, scenario.type);
    await page.waitForFunction(({ id, type }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || null;
      const graph = {
        box: root?.querySelector('#boxPlot svg'),
        line: root?.querySelector('#linePlot #lineSvg'),
        scatter: root?.querySelector('#scatterPlot #scatterSvg'),
        pie: root?.querySelector('#pieSvg'),
        survival: root?.querySelector('#survivalSvg')
      }[type];
      const component = window.Components?.[type];
      return window.Main?.session?.workspaceState?.activeTabId === id
        && !!graph
        && component?.isIdleForSnapshot?.() === true;
    }, { id: tabId, type: scenario.type }, { timeout: 30_000 });
    const graphHasData = await page.evaluate(({ id, type }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || null;
      if(type === 'box'){
        return (window.Components?.box?.__testHooks?.getSession?.(id)?.managers?.hot?.getData?.() || []).length > 2;
      }
      if(type === 'line'){
        return root?.querySelectorAll('#linePlot #lineSvg [data-line-style-role="line"]').length > 0;
      }
      if(type === 'scatter'){
        return root?.querySelectorAll('#scatterPlot #scatterSvg [data-scatter-point-interaction]').length > 0;
      }
      if(type === 'pie'){
        return root?.querySelectorAll('#pieSvg path[data-pie-trace="1"]').length > 0;
      }
      return root?.querySelectorAll('#survivalSvg path[data-group]').length > 0;
    }, { id: tabId, type: scenario.type });
    expect(graphHasData).toBe(true);
  });
}

for(const extension of ['prism', 'pzfx']){
test(`imports graph-specific labels, fonts, axis geometry and bar colors from every linked .${extension} table`, async ({ page }) => {
  test.setTimeout(150_000);
  const expectedTitles = ['STAG2_RNA_seq2', 'STAG1_RNA_seq2', 'STAG2', 'MED1', 'PAXIP1', 'NIPBL'];
  const prismPath = path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'prism-binary', 'v10', 'matched-pzfx', `testfile.${extension}`);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#welcomeGraphFileInput').setInputFiles(prismPath);

  await expect.poll(() => page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => !tab.isWelcome && tab.type === 'box')
      .map(tab => tab.title)
      .sort()
  )), { timeout: 120_000 }).toEqual(expectedTitles.slice().sort());

  const tabs = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).filter(tab => !tab.isWelcome).map(tab => ({ id: tab.id, title: tab.title }))
  ));
  for(const tab of tabs){
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tab.id}"]`).click();
    await page.waitForFunction(({ id, title }) => {
      if(window.Main?.session?.workspaceState?.activeTabId !== id){
        return false;
      }
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
      return root?.querySelector('#boxPlot svg [data-font-role="graphTitle"]')?.textContent?.trim() === title;
    }, { id: tab.id, title: tab.title }, { timeout: 30_000 });
  }
  const imported = await page.evaluate(tabs => tabs.map(({ id }) => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'box') || null;
    const session = window.Components?.box?.__testHooks?.getSession?.(id) || null;
    const svgBox = root?.querySelector('#boxPlot')?.closest('.svgbox') || null;
    const svg = root?.querySelector('#boxPlot svg') || null;
    return {
      title: svg?.querySelector('[data-font-role="graphTitle"]')?.textContent || '',
      yLabel: svg?.querySelector('[data-box-axis-title="y"]')?.textContent || '',
      width: Number(svgBox?.dataset?.cartesianAxisLengthX),
      height: Number(svgBox?.dataset?.cartesianAxisLengthY),
      axisWidth: Number(svg?.querySelector('[data-box-primary-axis]')?.getAttribute('stroke-width')),
      fonts: window.Shared?.fontControls?.exportScopeStyles?.('box', { tabId: id }) || {},
      fills: Object.values(session?.state?.styles?.traceShapeStyles || {}).map(style => style?.fill || null)
    };
  }), tabs);

  expect(imported.map(item => item.title).sort()).toEqual(expectedTitles.slice().sort());
  imported.forEach(item => {
    const firstGraph = item.title === 'STAG2_RNA_seq2';
    expect(item.yLabel).toBe('TPM counts');
    expect(item.axisWidth).toBeCloseTo(prismThicknessToCssPixels(firstGraph ? 2 : 1), 3);
    expect(item.fonts.graphTitle).toMatchObject({ fontSize: '14pt', fontWeight: '700' });
    expect(item.fonts.xTitle).toMatchObject({ fontSize: '12pt', fontWeight: '700' });
    expect(item.fonts.yTitle).toMatchObject({ fontSize: '12pt', fontWeight: '700' });
    expect(item.fonts.xTick).toMatchObject({ fontSize: '11pt', fontWeight: '700' });
    expect(item.fonts.yTick).toMatchObject({ fontSize: '11pt', fontWeight: '700' });
    expect(item.fills.some(fill => fill && fill !== '#808080')).toBe(true);
    expect(item.width).toBeCloseTo(firstGraph ? 370.56 : 288, 0);
    expect(item.height).toBeCloseTo(firstGraph ? 261.12 : 192, 0);
  });
  const secondGraph = imported.find(item => item.title === 'STAG1_RNA_seq2');
  expect(secondGraph.fills).toContain('#008000');
  expect(secondGraph.fills).toContain('#ad07e3');
});
}

test('applies derived Prism graph metadata to the matching tables in testnew.prism', async ({ page }) => {
  test.setTimeout(150_000);
  const expected = [
    { title: 'XY: Entering replicate data', type: 'line' },
    { title: 'Grouped: Entering replicate data', type: 'box' },
    { title: 'Data 6', type: 'scatter' },
    { title: 'Survival: Two groups', type: 'survival' }
  ];
  const prismPath = path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'prism-binary', 'v10', 'matched-pzfx', 'testnew.prism');
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#welcomeGraphFileInput').setInputFiles(prismPath);

  await expect.poll(() => page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => !tab.isWelcome)
      .map(({ title, type }) => ({ title, type }))
      .sort((a, b) => a.title.localeCompare(b.title))
  )), { timeout: 120_000 }).toEqual(expected.slice().sort((a, b) => a.title.localeCompare(b.title)));

  const tabs = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => !tab.isWelcome)
      .map(({ id, title, type }) => ({ id, title, type }))
  ));
  for(const tab of tabs){
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tab.id}"]`).click();
    await page.waitForFunction(({ id, type }) => window.Main?.session?.workspaceState?.activeTabId === id
      && window.Components?.[type]?.isIdleForSnapshot?.() === true, tab, { timeout: 30_000 });
  }
  const stateByTitle = await page.evaluate(tabs => Object.fromEntries(tabs.map(({ id, title, type }) => {
    const session = window.Components?.[type]?.__testHooks?.getSession?.(id) || null;
    const state = session?.state || {};
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, type) || null;
    const graphBox = root?.querySelector('.svgbox') || null;
    const axisSettings = type === 'box'
      ? (state.layout?.axisSettings || state.axisSettings || null)
      : (state.axisSettings || null);
    const svg = root?.querySelector('#linePlot #lineSvg') || null;
    const svgBox = svg?.closest('.svgbox') || null;
    const survivalSvg = root?.querySelector('#survivalSvg') || null;
    const survivalSvgBox = survivalSvg?.closest('.svgbox') || null;
    return [title, {
      lineLabels: state.labels || null,
      lineAxis: state.axisSettings || null,
      lineGeometry: {
        width: Number(svgBox?.dataset?.cartesianAxisLengthX),
        height: Number(svgBox?.dataset?.cartesianAxisLengthY)
      },
      plotGeometry: {
        width: Number(graphBox?.dataset?.cartesianAxisLengthX),
        height: Number(graphBox?.dataset?.cartesianAxisLengthY)
      },
      axisStrokeWidth: axisSettings?.strokeWidth,
      lineFonts: window.Shared?.fontControls?.exportScopeStyles?.('line', { tabId: id }) || {},
      groupedType: state.controls?.graphType || '',
      scatterShapes: state.styles?.labelShapes || {},
      survivalAxis: state.axisSettings || null,
      survivalGeometry: {
        width: Number(survivalSvgBox?.dataset?.cartesianAxisLengthX),
        height: Number(survivalSvgBox?.dataset?.cartesianAxisLengthY)
      },
      survivalColors: state.labelColors || {},
      survivalCurves: Array.from(root?.querySelectorAll('#survivalSvg path[data-survival-series-color-target="stroke"][data-group]') || [])
        .filter(path => !path.hasAttribute('data-survival-censor-mark'))
        .map(path => [path.getAttribute('data-group'), path.getAttribute('stroke')])
    }];
  })), tabs);

  expect(stateByTitle['XY: Entering replicate data'].lineLabels).toMatchObject({
    title: 'XY: Entering replicate data', x: 'Hours', y: 'YTitle'
  });
  expect(stateByTitle['XY: Entering replicate data'].lineAxis.strokeWidth)
    .toBeCloseTo(prismThicknessToCssPixels(1), 3);
  expect(stateByTitle['XY: Entering replicate data'].lineGeometry).toEqual({ width: 288, height: 192 });
  expect(stateByTitle['XY: Entering replicate data'].lineFonts).toMatchObject({
    xTick: { fontSize: '11pt', fontWeight: '700' },
    yTick: { fontSize: '11pt', fontWeight: '700' }
  });
  expect(stateByTitle['Grouped: Entering replicate data'].groupedType).toBe('strip');
  expect(stateByTitle['Data 6'].scatterShapes).toMatchObject({ Negative: 'circle', Positive: 'square' });
  expect(stateByTitle['Survival: Two groups'].survivalGeometry).toEqual({ width: 288, height: 192 });
  expect(stateByTitle['Survival: Two groups'].survivalAxis.strokeWidth)
    .toBeCloseTo(prismThicknessToCssPixels(1), 3);
  expect(stateByTitle['Survival: Two groups'].survivalAxis.x.autoRangeHint.max).toBe(200);
  expect(stateByTitle['Survival: Two groups'].survivalAxis.y.autoRangeHint.max).toBe(1.1);
  expect(stateByTitle['Survival: Two groups'].survivalColors)
    .toMatchObject({ Control: '#000000', Treated: '#a0a0a4' });
  expect(stateByTitle['Survival: Two groups'].survivalCurves)
    .toEqual([['Control', '#000000'], ['Treated', '#a0a0a4']]);
  for(const title of expected.map(item => item.title)){
    expect(stateByTitle[title].plotGeometry.width).toBeCloseTo(288, 0);
    expect(stateByTitle[title].plotGeometry.height).toBeCloseTo(192, 0);
    expect(stateByTitle[title].axisStrokeWidth).toBeCloseTo(prismThicknessToCssPixels(1), 3);
  }
});

test('preserves Prism Box styles when the import owner becomes inactive', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#graphSelectionGrid .graph-card[data-graph-type="box"] [data-welcome-action="new"]').click();
  const firstTabId = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome)?.id || null
  ));
  await page.locator('#addWorkspaceTab').click();
  await page.locator('#graphSelectionGrid .graph-card[data-graph-type="box"] [data-welcome-action="new"]').click();
  const secondTabId = await page.evaluate(ids => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome && tab.id !== ids.first)?.id || null
  ), { first: firstTabId });
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();

  await page.evaluate(() => {
    const tableImport = window.Shared?.tableImport;
    const originalOpenFile = tableImport?.openFile;
    if(typeof originalOpenFile !== 'function'){
      throw new Error('Prism table importer is unavailable');
    }
    window.__prismImportGate = { started: false, release: null };
    const gate = window.__prismImportGate;
    const waitForRelease = new Promise(resolve => { gate.release = resolve; });
    tableImport.openFile = (...args) => {
      gate.started = true;
      return waitForRelease.then(() => originalOpenFile(...args));
    };
  });
  const fixturePath = path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'prism-binary', 'v10', 'controlled', 'individual-red-square.prism');
  await page.locator(`[data-workspace-tab-id="${firstTabId}"] #boxFile`).setInputFiles(fixturePath);
  await page.waitForFunction(() => window.__prismImportGate?.started === true);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${secondTabId}"]`).click();
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, secondTabId);
  await page.evaluate(() => window.__prismImportGate?.release?.());
  await page.waitForFunction(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item.id === id) || null;
    return String(tab?.title || '').includes('individual-red-square');
  }, firstTabId, { timeout: 30_000 });

  const imported = await page.evaluate(id => {
    const session = window.Components?.box?.__testHooks?.getSession?.(id) || null;
    return {
      title: session?.state?.labels?.titleText,
      pointStyle: session?.state?.styles?.pointStyles?.[2],
      axisWidth: session?.state?.layout?.axisSettings?.strokeWidth,
      activeTabId: window.Main?.session?.workspaceState?.activeTabId
    };
  }, firstTabId);
  expect(imported.activeTabId).toBe(secondTabId);
  expect(imported.pointStyle).toMatchObject({ shape: 'square', fill: '#ff0000', size: 3 });
  expect(imported.axisWidth).toBeCloseTo(prismThicknessToCssPixels(1), 3);

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id,
  firstTabId, { timeout: 30_000 });
  const reactivated = await page.evaluate(id => {
    const box = window.Components?.box;
    const session = box?.__testHooks?.getSession?.(id) || null;
    const payload = box?.getPayload?.() || null;
    return {
      sessionStyle: session?.state?.styles?.pointStyles?.[2] || null,
      projectedStyle: box?.__getState?.()?.pointStyles?.[2] || null,
      payloadStyle: payload?.config?.pointStyles?.[2] || null,
      isIdle: box?.isIdleForSnapshot?.() === true
    };
  }, firstTabId);
  expect(reactivated.sessionStyle).toMatchObject({ shape: 'square', fill: '#ff0000', size: 3 });
  expect(reactivated.projectedStyle).toMatchObject({ shape: 'square', fill: '#ff0000', size: 3 });
  expect(reactivated.payloadStyle).toMatchObject({ shape: 'square', fill: '#ff0000', size: 3 });
});

test('preserves Prism Box graph subtype when its import owner becomes inactive', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#graphSelectionGrid .graph-card[data-graph-type="box"] [data-welcome-action="new"]').click();
  const firstTabId = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome)?.id || null
  ));
  await page.locator('#addWorkspaceTab').click();
  await page.locator('#graphSelectionGrid .graph-card[data-graph-type="box"] [data-welcome-action="new"]').click();
  const secondTabId = await page.evaluate(id => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome && tab.id !== id)?.id || null
  ), firstTabId);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.evaluate(() => {
    const tableImport = window.Shared?.tableImport;
    const originalOpenFile = tableImport?.openFile;
    window.__prismSubtypeImportGate = { started: false, release: null };
    const gate = window.__prismSubtypeImportGate;
    const waitForRelease = new Promise(resolve => { gate.release = resolve; });
    tableImport.openFile = (...args) => {
      gate.started = true;
      return waitForRelease.then(() => originalOpenFile(...args));
    };
  });
  const fixturePath = path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'prism-binary', 'v10', 'controlled', 'individual-baseline-bar.prism');
  await page.locator(`[data-workspace-tab-id="${firstTabId}"] #boxFile`).setInputFiles(fixturePath);
  await page.waitForFunction(() => window.__prismSubtypeImportGate?.started === true);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${secondTabId}"]`).click();
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, secondTabId);
  await page.evaluate(() => window.__prismSubtypeImportGate?.release?.());
  await page.waitForFunction(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item.id === id) || null;
    return tab?.payload?.config?.graphType === 'bar';
  }, firstTabId, { timeout: 30_000 });
  const imported = await page.evaluate(id => {
    const session = window.Components?.box?.__testHooks?.getSession?.(id) || null;
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item.id === id) || null;
    return {
      activeTabId: window.Main?.session?.workspaceState?.activeTabId,
      graphType: session?.state?.controls?.graphType,
      payloadGraphType: tab?.payload?.config?.graphType
    };
  }, firstTabId);
  expect(imported.activeTabId).toBe(secondTabId);
  expect(imported.graphType).toBe('bar');
  expect(imported.payloadGraphType).toBe('bar');

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id
    && document.querySelector('#boxGraphType')?.value === 'bar', firstTabId, { timeout: 30_000 });
});

test('persists delayed Prism Scatter styles through owner-tab activation and payload capture', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#graphSelectionGrid .graph-card[data-graph-type="scatter"] [data-welcome-action="new"]').click();
  const firstTabId = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome)?.id || null
  ));
  await page.locator('#addWorkspaceTab').click();
  await page.locator('#graphSelectionGrid .graph-card[data-graph-type="scatter"] [data-welcome-action="new"]').click();
  const secondTabId = await page.evaluate(id => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome && tab.id !== id)?.id || null
  ), firstTabId);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.evaluate(() => {
    const tableImport = window.Shared?.tableImport;
    const originalOpenFile = tableImport?.openFile;
    window.__prismScatterImportGate = { started: false, release: null };
    const gate = window.__prismScatterImportGate;
    const waitForRelease = new Promise(resolve => { gate.release = resolve; });
    tableImport.openFile = (...args) => {
      gate.started = true;
      return waitForRelease.then(() => originalOpenFile(...args));
    };
  });
  const fixturePath = path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'prism-binary', 'v10', 'controlled', 'treated-red.prism');
  await page.locator(`[data-workspace-tab-id="${firstTabId}"] #scatterFile`).setInputFiles(fixturePath);
  await page.waitForFunction(() => window.__prismScatterImportGate?.started === true);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${secondTabId}"]`).click();
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, secondTabId);
  await page.evaluate(() => window.__prismScatterImportGate?.release?.());
  await page.waitForFunction(id => {
    const session = window.Components?.scatter?.__testHooks?.getSession?.(id) || null;
    return session?.state?.styles?.labelStyles?.Treated?.fill === '#ff0000';
  }, firstTabId, { timeout: 30_000 });
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter') || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && window.Components?.scatter?.isIdleForSnapshot?.() === true
      && !!root?.querySelector('#scatterPlot svg g[data-export-layer="scatter-points"] rect[data-plot-point="1"]');
  }, firstTabId, { timeout: 30_000 });
  const imported = await page.evaluate(id => {
    const scatter = window.Components?.scatter;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'scatter') || null;
    const session = scatter?.__testHooks?.getSession?.(id) || null;
    const payload = scatter?.getPayload?.() || null;
    return {
      projected: session?.state?.styles?.labelStyles?.Treated || null,
      payload: payload?.config?.labelStyles?.Treated || null,
      rendered: Array.from(root?.querySelectorAll('#scatterPlot svg g[data-export-layer="scatter-points"] rect[data-plot-point="1"]') || [])
        .map(marker => ({ fill: marker.getAttribute('fill'), width: Number(marker.getAttribute('width')) }))
    };
  }, firstTabId);
  expect(imported.projected).toMatchObject({ shape: 'square', size: 9, fill: '#ff0000' });
  expect(imported.payload).toMatchObject({ shape: 'square', size: 9, fill: '#ff0000' });
  expect(imported.rendered.some(marker => marker.fill === '#ff0000')).toBe(true);
  imported.rendered.filter(marker => marker.fill === '#ff0000').forEach(marker => expect(marker.width).toBeCloseTo(18, 0));
});

test('persists delayed Prism Line color through owner-tab activation and payload capture', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('#graphSelectionGrid .graph-card[data-graph-type="line"] [data-welcome-action="new"]').click();
  const firstTabId = await page.evaluate(() => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome)?.id || null
  ));
  await page.locator('#addWorkspaceTab').click();
  await page.locator('#graphSelectionGrid .graph-card[data-graph-type="line"] [data-welcome-action="new"]').click();
  const secondTabId = await page.evaluate(id => (
    (window.Main?.session?.workspaceState?.tabs || []).find(tab => !tab.isWelcome && tab.id !== id)?.id || null
  ), firstTabId);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.evaluate(() => {
    const tableImport = window.Shared?.tableImport;
    const originalOpenFile = tableImport?.openFile;
    window.__prismLineImportGate = { started: false, release: null };
    const gate = window.__prismLineImportGate;
    const waitForRelease = new Promise(resolve => { gate.release = resolve; });
    tableImport.openFile = (...args) => {
      gate.started = true;
      return waitForRelease.then(() => originalOpenFile(...args));
    };
  });
  const fixturePath = path.join(__dirname, '..', '..', '__tests__', 'fixtures', 'prism-binary', 'v10', 'controlled', 'line-graph-mean-reaction-time-line-red.prism');
  await page.locator(`[data-workspace-tab-id="${firstTabId}"] #lineFile`).setInputFiles(fixturePath);
  await page.waitForFunction(() => window.__prismLineImportGate?.started === true);
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${secondTabId}"]`).click();
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, secondTabId);
  await page.evaluate(() => window.__prismLineImportGate?.release?.());
  await page.waitForFunction(id => {
    const session = window.Components?.line?.__testHooks?.getSession?.(id) || null;
    return session?.state?.styles?.series?.['Median reaction time']?.lineStroke === '#ff0000';
  }, firstTabId, { timeout: 30_000 });
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && window.Components?.line?.isIdleForSnapshot?.() === true
      && !!root?.querySelector('#linePlot [data-line-style-role="line"][data-series="Median reaction time"]');
  }, firstTabId, { timeout: 30_000 });
  const imported = await page.evaluate(id => {
    const line = window.Components?.line;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || null;
    const session = line?.__testHooks?.getSession?.(id) || null;
    const payload = line?.getPayload?.() || null;
    return {
      projected: session?.state?.styles?.series?.['Median reaction time'] || null,
      payload: payload?.config?.seriesStyles?.['Median reaction time'] || null,
      rendered: Array.from(root?.querySelectorAll('#linePlot [data-line-style-role="line"][data-series="Median reaction time"]') || [])
        .map(node => node.getAttribute('stroke'))
    };
  }, firstTabId);
  expect(imported.projected).toMatchObject({ lineStroke: '#ff0000' });
  expect(imported.payload).toMatchObject({ lineStroke: '#ff0000' });
  expect(imported.rendered.length).toBeGreaterThan(0);
  imported.rendered.forEach(color => expect(color).toBe('#ff0000'));
});

test('persists delayed Prism Pie slice color through owner-tab activation and payload capture', async ({ page }) => {
  test.setTimeout(120_000);
  const { firstTabId, secondTabId } = await startDelayedPrismStyleImport(
    page, 'pie', 'pie-chart-import-slice-B-red.prism'
  );
  await page.waitForFunction(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item.id === id) || null;
    return tab?.payload?.config?.colors?.B === '#ff0000';
  }, firstTabId, { timeout: 30_000 });
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'pie') || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && window.Components?.pie?.isIdleForSnapshot?.() === true
      && root?.querySelector('#pieSvg [data-pie-trace="1"][data-pie-trace-label="B"]')?.getAttribute('fill') === '#ff0000';
  }, firstTabId, { timeout: 30_000 });
  const imported = await page.evaluate(id => {
    const session = window.Components?.pie?.__testHooks?.getSession?.(id) || null;
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item.id === id) || null;
    return { activeTabId: window.Main?.session?.workspaceState?.activeTabId,
      color: session?.state?.colors?.B, payloadColor: tab?.payload?.config?.colors?.B };
  }, firstTabId);
  expect(imported.activeTabId).toBe(firstTabId);
  expect(imported.color).toBe('#ff0000');
  expect(imported.payloadColor).toBe('#ff0000');
  expect(secondTabId).not.toBe(firstTabId);
});

test('persists delayed Prism Survival series color through owner-tab activation and payload capture', async ({ page }) => {
  test.setTimeout(120_000);
  const fixtureName = 'survival-yaxis-tick-normal-20261026.prism';
  const redFixture = await createPrismSeriesColorVariant(fixtureName, 1, '#ff0000');
  const { firstTabId, secondTabId } = await startDelayedPrismStyleImport(
    page, 'survival', fixtureName, redFixture
  );
  await page.waitForFunction(id => {
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item.id === id) || null;
    return tab?.payload?.config?.labelColors?.['Treatment A'] === '#ff0000';
  }, firstTabId, { timeout: 30_000 });
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`).click();
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && window.Components?.survival?.isIdleForSnapshot?.() === true
      && Array.from(root?.querySelectorAll('#survivalSvg path[data-survival-series-color-target="stroke"][data-group="Treatment A"]') || [])
        .some(path => path.getAttribute('stroke') === '#ff0000');
  }, firstTabId, { timeout: 30_000 });
  const imported = await page.evaluate(id => {
    const session = window.Components?.survival?.__testHooks?.getSession?.(id) || null;
    const tab = (window.Main?.session?.workspaceState?.tabs || []).find(item => item.id === id) || null;
    return { activeTabId: window.Main?.session?.workspaceState?.activeTabId,
      color: session?.state?.labelColors?.['Treatment A'],
      payloadColor: tab?.payload?.config?.labelColors?.['Treatment A'] };
  }, firstTabId);
  expect(imported.activeTabId).toBe(firstTabId);
  expect(imported.color).toBe('#ff0000');
  expect(imported.payloadColor).toBe('#ff0000');
  expect(secondTabId).not.toBe(firstTabId);
});

for(const scenario of [
  { file: 'line-graph.prism', dataset: 'Median reaction time', points: 0.5, color: '#000000' },
  { file: 'line-graph-mean-reaction-time-line-1pt-thickness.prism', dataset: 'Median reaction time', points: 1, color: '#000000' },
  { file: 'line-graph-mean-reaction-time-line-4pt-thickness.prism', dataset: 'Median reaction time', points: 4, color: '#000000' },
  { file: 'line-graph-mean-reaction-time-line-red.prism', dataset: 'Median reaction time', points: 0.5, color: '#ff0000' }
]){
  test(`applies Prism line width and color from ${scenario.file}`, async ({ page }) => {
    test.setTimeout(90_000);
    const tabId = await importControlledFixture(page, scenario.file, 'line');
    await page.waitForFunction(id => window.Components?.line?.isIdleForSnapshot?.() === true
      && window.Main?.session?.workspaceState?.activeTabId === id,
    tabId, { timeout: 30_000 });
    const style = await page.evaluate(({ id, key }) => {
      const session = window.Components?.line?.__testHooks?.getSession?.(id) || null;
      return session?.state?.styles?.series?.[key] || null;
    }, { id: tabId, key: scenario.dataset });
    const rendered = await page.evaluate(({ id, key }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'line') || null;
      return Array.from(root?.querySelectorAll('[data-line-style-role="line"]') || [])
        .filter(node => node.getAttribute('data-series') === key)
        .map(node => ({
          color: node.getAttribute('stroke'),
          width: Number(node.getAttribute('stroke-width'))
        }));
    }, { id: tabId, key: scenario.dataset });
    expect(rendered.length).toBeGreaterThan(0);
    rendered.forEach(line => expect(line.color).toBe(scenario.color));
    expect(style?.lineStroke).toBe(scenario.color);
    const expectedWidth = prismThicknessToCssPixels(scenario.points);
    expect(style?.lineStrokeWidth).toBeCloseTo(expectedWidth, 3);
    rendered.forEach(line => expect(line.width).toBeCloseTo(expectedWidth, 3));
  });
}

test('applies Prism per-slice color to its matching Pie category', async ({ page }) => {
  test.setTimeout(90_000);
  const tabId = await importControlledFixture(page, 'pie-chart-import-slice-B-red.prism', 'pie');
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'pie') || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && !!root?.querySelector('#pieSvg [data-pie-trace="1"][data-pie-trace-label="B"]')
      && window.Components?.pie?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });
  const imported = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'pie') || null;
    const session = window.Components?.pie?.__testHooks?.getSession?.(id) || null;
    const slices = Array.from(root?.querySelectorAll('#pieSvg [data-pie-trace="1"][data-pie-trace-mode="pie"]') || []);
    return { colors: session?.state?.colors || {}, fills: slices.map(slice => [slice.getAttribute('data-pie-trace-label'), slice.getAttribute('fill')]) };
  }, tabId);
  expect(imported.colors.B).toBe('#ff0000');
  expect(imported.fills.find(([label]) => label === 'B')?.[1]).toBe('#ff0000');
});

test('imports and renders the Prism parts-of-a-whole PZFX graph as a Pie', async ({ page }) => {
  test.setTimeout(90_000);
  const fixture = fs.readFileSync(path.join(
    __dirname,
    '..',
    '..',
    '__tests__',
    'fixtures',
    'prism',
    'v1',
    'parts_of_whole.pzfx'
  ));
  const tabId = await importControlledFixture(page, 'parts_of_whole.pzfx', 'pie', fixture);
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'pie') || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && root?.querySelectorAll('#pieSvg path[data-pie-trace="1"][data-pie-trace-mode="pie"]').length === 4
      && window.Components?.pie?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });
  const imported = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'pie') || null;
    const session = window.Components?.pie?.__testHooks?.getSession?.(id) || null;
    const labels = Array.from(root?.querySelectorAll('#pieSvg path[data-pie-trace="1"][data-pie-trace-mode="pie"]') || [])
      .map(path => path.getAttribute('data-pie-trace-label'));
    return {
      values: (session?.managers?.hot?.getData?.() || []).slice(1)
        .filter(row => String(row?.[0] ?? '').trim())
        .map(row => [row[0], row[1]]),
      labels
    };
  }, tabId);
  expect(imported.values).toEqual([
    ['Round and yellow', '315'],
    ['Round and green', '108'],
    ['Angular and yellow', '101'],
    ['Angular and green', '32']
  ]);
  expect(imported.labels).toEqual(imported.values.map(row => row[0]));
});

test('applies Prism Pie outer border independently from slice borders', async ({ page }) => {
  test.setTimeout(120_000);
  const threePointTab = await importControlledFixture(page, 'pie-outer-border-3pt.prism', 'pie');
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'pie') || null;
    const session = window.Components?.pie?.__testHooks?.getSession?.(id) || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && !!root?.querySelector('#pieSvg [data-pie-outer-border="true"]')
      && session?.state?.controls?.outerBorderEnabled === true
      && window.Components?.pie?.isIdleForSnapshot?.() === true;
  }, threePointTab, { timeout: 30_000 });
  const enabled = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'pie') || null;
    const session = window.Components?.pie?.__testHooks?.getSession?.(id) || null;
    const perimeter = root?.querySelector('#pieSvg [data-pie-outer-border="true"]') || null;
    const payload = window.Components?.pie?.getPayload?.({ tabId: id }) || null;
    return {
      enabled: session?.state?.controls?.outerBorderEnabled,
      color: session?.state?.controls?.outerBorderColor,
      width: Number(session?.state?.controls?.outerBorderWidth),
      persisted: {
        enabled: payload?.config?.outerBorderEnabled,
        color: payload?.config?.outerBorderColor,
        width: Number(payload?.config?.outerBorderWidth)
      },
      renderedColor: perimeter?.getAttribute('stroke'),
      renderedWidth: Number(perimeter?.getAttribute('stroke-width')),
      sliceCount: root?.querySelectorAll('#pieSvg [data-pie-trace="1"]').length || 0
    };
  }, threePointTab);
  expect(enabled.enabled).toBe(true);
  expect(enabled.color).toBe('#000000');
  expect(enabled.width).toBeCloseTo(0.7182 * 3 + 0.7194, 5);
  expect(enabled.persisted).toEqual({
    enabled: true,
    color: '#000000',
    width: 0.7182 * 3 + 0.7194
  });
  expect(enabled.renderedColor).toBe('#000000');
  expect(enabled.renderedWidth).toBeGreaterThan(0);
  expect(enabled.sliceCount).toBeGreaterThan(1);
});

test('preserves a disabled Prism Pie outer border', async ({ page }) => {
  test.setTimeout(90_000);
  const disabledTab = await importControlledFixture(page, 'pie-outer-border-off.prism', 'pie');
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'pie') || null;
    const session = window.Components?.pie?.__testHooks?.getSession?.(id) || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && !!root?.querySelector('#pieSvg')
      && session?.state?.controls?.outerBorderEnabled === false
      && window.Components?.pie?.isIdleForSnapshot?.() === true;
  }, disabledTab, { timeout: 30_000 });
  const disabled = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'pie') || null;
    const session = window.Components?.pie?.__testHooks?.getSession?.(id) || null;
    return {
      enabled: session?.state?.controls?.outerBorderEnabled,
      width: Number(session?.state?.controls?.outerBorderWidth),
      perimeterCount: root?.querySelectorAll('#pieSvg [data-pie-outer-border="true"]').length || 0
    };
  }, disabledTab);
  expect(disabled).toEqual({
    enabled: false,
    width: 0.7182 * 3 + 0.7194,
    perimeterCount: 0
  });
});

test('applies Prism Survival line width and color to the matching group', async ({ page }) => {
  test.setTimeout(90_000);
  const tabId = await importControlledFixture(page, 'survival-line-1pt-20261026.prism', 'survival');
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && !!root?.querySelector('#survivalSvg')
      && window.Components?.survival?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });

  const imported = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    const session = window.Components?.survival?.__testHooks?.getSession?.(id) || null;
    return {
      widths: session?.state?.labelStrokeWidth || {},
      colors: session?.state?.labelColors || {},
      curves: Array.from(root?.querySelectorAll('#survivalSvg path[data-survival-series-color-target="stroke"][data-group]') || [])
        .filter(path => !path.hasAttribute('data-survival-censor-mark'))
        .map(path => ({
          group: path.getAttribute('data-group'),
          color: path.getAttribute('stroke'),
          width: Number(path.getAttribute('stroke-width'))
        }))
    };
  }, tabId);
  expect(imported.curves.map(curve => curve.group)).toEqual(['Control', 'Treatment A', 'Treatment B']);
  expect(imported.curves.map(curve => curve.color)).toEqual(['#000000', '#000000', '#000000']);
  expect(imported.curves.map(curve => curve.width)).toEqual([
    expect.closeTo(prismThicknessToCssPixels(2), 3),
    expect.closeTo(prismThicknessToCssPixels(1), 3),
    expect.closeTo(prismThicknessToCssPixels(2), 3)
  ]);
  expect(imported.colors).toMatchObject({
    Control: '#000000',
    'Treatment A': '#000000',
    'Treatment B': '#000000'
  });
});

test('imports Survival colors and percent tick spacing from the Prism graph', async ({ page }) => {
  test.setTimeout(90_000);
  const tabId = await importControlledFixture(page, 'survival-three-groups-tick-normal.prism', 'survival');
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    const session = window.Components?.survival?.__testHooks?.getSession?.(id) || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && !!root?.querySelector('#survivalSvg path[data-survival-series-color-target="stroke"][data-group]')
      && session?.state?.labelColors?.['Treatment B'] === '#000000'
      && window.Components?.survival?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });
  const imported = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    const session = window.Components?.survival?.__testHooks?.getSession?.(id) || null;
    const curves = Array.from(root?.querySelectorAll('#survivalSvg path[data-survival-series-color-target="stroke"][data-group]') || [])
      .filter(path => !path.hasAttribute('data-survival-censor-mark'));
    const numericLabels = Array.from(root?.querySelectorAll('#survivalSvg text') || [])
      .map(node => node.textContent?.trim() || '')
      .filter(text => /^\d+(?:\.\d+)?$/.test(text));
    return {
      colors: session?.state?.labelColors || {},
      tickIntervals: {
        x: session?.state?.axisSettings?.x?.tickInterval,
        y: session?.state?.axisSettings?.y?.tickInterval
      },
      curves: curves.map(node => [node.getAttribute('data-group'), node.getAttribute('stroke')]),
      numericLabels
    };
  }, tabId);
  expect(imported.colors).toMatchObject({
    Control: '#000000',
    'Treatment A': '#000000',
    'Treatment B': '#000000'
  });
  expect(imported.tickIntervals).toEqual({ x: 100, y: 0.5 });
  expect(imported.curves).toEqual([
    ['Control', '#000000'],
    ['Treatment A', '#000000'],
    ['Treatment B', '#000000']
  ]);
  expect(imported.numericLabels).toContain('50');
  expect(imported.numericLabels).not.toContain('0.5');
});

test('keeps Prism Survival series colors isolated across same-type tabs', async ({ page }) => {
  test.setTimeout(120_000);
  const fixtureName = 'survival-yaxis-tick-normal-20261026.prism';
  const redFixture = await createPrismSeriesColorVariant(fixtureName, 1, '#ff0000');
  const redTabId = await importControlledFixture(page, fixtureName, 'survival', redFixture);
  const blackFixturePath = path.join(
    __dirname,
    '..',
    '..',
    '__tests__',
    'fixtures',
    'prism-binary',
    'v10',
    'controlled',
    fixtureName
  );

  await page.locator('#addWorkspaceTab').click();
  await expect(page.locator('#graphSelectionGrid')).toBeVisible();
  await page.locator('#graphSelectionGrid .graph-card[data-graph-type="survival"] [data-welcome-action="new"]').click();
  const blackTabId = await page.evaluate(() => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    return tabs.filter(tab => tab.type === 'survival').at(-1)?.id || null;
  });
  await expect.poll(() => page.evaluate(id => window.Main?.session?.workspaceState?.activeTabId === id, blackTabId))
    .toBe(true);
  await page.locator(`[data-workspace-tab-id="${blackTabId}"] #survivalFile`).setInputFiles(blackFixturePath);
  await page.waitForFunction(id => {
    const session = window.Components?.survival?.__testHooks?.getSession?.(id) || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && session?.state?.labelColors?.Control === '#000000'
      && session?.state?.labelColors?.['Treatment A'] === '#000000'
      && session?.state?.labelColors?.['Treatment B'] === '#000000'
      && window.Components?.survival?.isIdleForSnapshot?.() === true;
  }, blackTabId, { timeout: 30_000 });

  const readTabColors = async tabId => page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    const session = window.Components?.survival?.__testHooks?.getSession?.(id) || null;
    const curves = Array.from(root?.querySelectorAll('#survivalSvg path[data-survival-series-color-target="stroke"][data-group]') || [])
      .filter(path => !path.hasAttribute('data-survival-censor-mark'))
      .map(path => [path.getAttribute('data-group'), path.getAttribute('stroke')]);
    return { colors: session?.state?.labelColors || {}, curves };
  }, tabId);

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${redTabId}"]`).click();
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id
    && window.Components?.survival?.isIdleForSnapshot?.() === true, redTabId, { timeout: 30_000 });
  const redColors = await readTabColors(redTabId);
  expect(redColors.colors).toMatchObject({ Control: '#000000', 'Treatment A': '#ff0000', 'Treatment B': '#000000' });
  expect(redColors.curves).toEqual([
    ['Control', '#000000'], ['Treatment A', '#ff0000'], ['Treatment B', '#000000']
  ]);

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${blackTabId}"]`).click();
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id
    && window.Components?.survival?.isIdleForSnapshot?.() === true, blackTabId, { timeout: 30_000 });
  const blackColors = await readTabColors(blackTabId);
  expect(blackColors.colors).toMatchObject({ Control: '#000000', 'Treatment A': '#000000', 'Treatment B': '#000000' });
  expect(blackColors.curves).toEqual([
    ['Control', '#000000'], ['Treatment A', '#000000'], ['Treatment B', '#000000']
  ]);
});

test('applies Prism Survival labels, axis size, thickness, tick presets and font styles', async ({ page }) => {
  test.setTimeout(90_000);
  const tabId = await importControlledFixture(page, 'survival-yaxis-tick-normal-20261026.prism', 'survival');
  await page.waitForFunction(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    return window.Main?.session?.workspaceState?.activeTabId === id
      && !!root?.querySelector('#survivalSvg')
      && window.Components?.survival?.isIdleForSnapshot?.() === true;
  }, tabId, { timeout: 30_000 });
  const imported = await page.evaluate(id => {
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(id, 'survival') || null;
    const session = window.Components?.survival?.__testHooks?.getSession?.(id) || null;
    const svgBox = root?.querySelector('#survivalPlot')?.closest('.svgbox') || null;
    const svg = root?.querySelector('#survivalSvg') || null;
    const tickLength = axis => {
      const tick = Array.from(svg?.querySelectorAll('line[data-survival-axis-style-target="1"]') || [])
        .find(line => axis === 'y'
          ? Math.abs(Number(line.getAttribute('y2')) - Number(line.getAttribute('y1'))) < 0.01
          : Math.abs(Number(line.getAttribute('x2')) - Number(line.getAttribute('x1'))) < 0.01);
      return tick ? Math.hypot(Number(tick.getAttribute('x2')) - Number(tick.getAttribute('x1')),
        Number(tick.getAttribute('y2')) - Number(tick.getAttribute('y1'))) : null;
    };
    return {
      title: session?.state?.titleText,
      controls: session?.state?.controls,
      axis: session?.state?.axisSettings,
      width: Number(svgBox?.dataset?.cartesianAxisLengthX),
      height: Number(svgBox?.dataset?.cartesianAxisLengthY),
      labelColors: session?.state?.labelColors || {},
      curves: Array.from(root?.querySelectorAll('#survivalSvg path[data-survival-series-color-target="stroke"][data-group]') || [])
        .filter(path => !path.hasAttribute('data-survival-censor-mark'))
        .map(path => ({ group: path.getAttribute('data-group'), color: path.getAttribute('stroke'), width: Number(path.getAttribute('stroke-width')) })),
      fonts: window.Shared?.fontControls?.exportScopeStyles?.('survival', { tabId: id }) || {},
      xTick: tickLength('x'),
      yTick: tickLength('y')
    };
  }, tabId);
  expect(imported.title).toBe('Survival proportions: Survival of Three groups');
  expect(imported.controls.xLabel).toBe('Days');
  expect(imported.controls.yLabel).toBe('Probability of Survival');
  expect(imported.width).toBeCloseTo(288, 0);
  expect(imported.height).toBeCloseTo(192, 0);
  expect(imported.axis.strokeWidth).toBeCloseTo(prismThicknessToCssPixels(2), 3);
  expect(imported.axis.x.tickInterval).toBe(100);
  expect(imported.axis.y.tickInterval).toBe(0.5);
  expect(imported.xTick).toBeCloseTo(6, 1);
  expect(imported.axis.y.majorTickLength).toBe(8);
  expect(imported.curves.map(curve => curve.group)).toEqual(['Control', 'Treatment A', 'Treatment B']);
  expect(imported.curves.map(curve => curve.color)).toEqual(['#000000', '#000000', '#000000']);
  expect(imported.curves.map(curve => curve.width)).toEqual(Array(3).fill(expect.closeTo(prismThicknessToCssPixels(2), 3)));
  expect(imported.labelColors).toMatchObject({ Control: '#000000', 'Treatment A': '#000000', 'Treatment B': '#000000' });
  expect(imported.fonts).toMatchObject({
    graphTitle: { fontSize: '14pt', fontWeight: '700' },
    xTitle: { fontSize: '12pt', fontWeight: '700' },
    yTitle: { fontSize: '12pt', fontWeight: '700' },
    xTick: { fontSize: '11pt', fontWeight: '700' },
    yTick: { fontSize: '11pt', fontWeight: '700' }
  });
});
