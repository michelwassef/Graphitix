const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, clickExpectedExampleButton } = require('../helpers/workspaceDriver');

async function waitForHeatmapCells(page) {
  await page.waitForFunction(() => {
    const cells = document.querySelectorAll('#heatmapPage:not([hidden]) #heatmapSvg [data-export-layer="heatmap-cells"] rect');
    return cells.length >= 9;
  }, null, { timeout: 60_000 });
}

async function activeHeatmapStatus(page) {
  return page.evaluate(() => {
    const cells = document.querySelectorAll('#heatmapPage:not([hidden]) #heatmapSvg [data-export-layer="heatmap-cells"] rect').length;
    const overlay = !!document.querySelector('#heatmapGraphPanel .venn-loading-overlay');
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    return { activeTabId, cells, overlay };
  });
}

async function captureHeatmapVisualSignature(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    const rowLabel = svg?.querySelector('text[data-font-role="rowLabel"]') || null;
    const columnLabel = svg?.querySelector('text[data-font-role="columnLabel"]') || null;
    const cellRect = svg?.querySelector('[data-export-layer="heatmap-cells"] rect') || null;
    const cellValue = svg?.querySelector('text[data-font-role="cellValue"]') || null;
    const fontPx = node => {
      if (!node || typeof getComputedStyle !== 'function') {
        return NaN;
      }
      const parsed = Number.parseFloat(String(getComputedStyle(node).fontSize || '').trim());
      return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : NaN;
    };
    const box = target => {
      if (!target || typeof target.getBoundingClientRect !== 'function') {
        return null;
      }
      const rect = target.getBoundingClientRect();
      return { width: Number(rect.width.toFixed(3)), height: Number(rect.height.toFixed(3)) };
    };
    const cellRectBounds = cellRect?.getBoundingClientRect?.() || null;
    const cellValueBounds = cellValue?.getBoundingClientRect?.() || null;
    const ratio = (
      cellRectBounds
      && cellValueBounds
      && Number.isFinite(cellRectBounds.height)
      && cellRectBounds.height > 0
      && Number.isFinite(cellValueBounds.height)
    )
      ? Number((cellValueBounds.height / cellRectBounds.height).toFixed(4))
      : NaN;
    return {
      rowFontPx: fontPx(rowLabel),
      columnFontPx: fontPx(columnLabel),
      cellFontPx: fontPx(cellValue),
      rowRect: box(rowLabel),
      columnRect: box(columnLabel),
      cellRect: box(cellRect),
      cellValueRect: box(cellValue),
      cellValueToCellHeightRatio: ratio
    };
  });
}

test('Heatmap puts inference methods in the copyable report, not graph controls', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const component = { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' };
  await openComponentFromWelcome(page, component, { first: true });
  await clickExpectedExampleButton(page, 'heatmapLoadExample');
  await waitForHeatmapCells(page);

  const graphControls = page.locator('#heatmapPage:not([hidden]) #heatmapGraphPanel');
  const methods = page.locator('#heatmapStatsContent pre[data-stats-report-block="methods"]');
  const inferenceHelp = page.locator('#heatmapInferenceHelp');
  await expect(inferenceHelp).toHaveText('See Methods in Reporting and reproducibility for correlation test details.');
  expect((await inferenceHelp.innerText()).length).toBeLessThan(100);
  await expect(graphControls).not.toContainText('Pearson tests H₀');
  await expect(methods).toContainText('Inference is off; no cell p-values or adjustments are shown.');

  await graphControls.locator('#heatmapShowSignificance').check();
  await expect(methods).toContainText('two-sided Student t approximation', { timeout: 30_000 });
  await expect(methods).toContainText('computable unique off-diagonal pairs');
  await expect(methods).toContainText('zero population correlation');
  await expect(methods).toContainText('available finite observations for each item pair');
});

function expectNear(actual, expected, tolerance, label) {
  expect(Number.isFinite(actual), `${label}: actual is not finite (${actual})`).toBe(true);
  expect(Number.isFinite(expected), `${label}: expected is not finite (${expected})`).toBe(true);
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);
}

function expectOptionalNear(actual, expected, tolerance, label) {
  const actualFinite = Number.isFinite(actual);
  const expectedFinite = Number.isFinite(expected);
  expect(actualFinite, `${label}: presence changed`).toBe(expectedFinite);
  if(actualFinite){
    expectNear(actual, expected, tolerance, label);
  }
}

test('Heatmap example load works in two heatmap tabs', async ({ page }) => {
  test.setTimeout(120_000);
  const lifecycleOwnershipWarnings = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('component lifecycle skipped without explicit tab id')) {
      lifecycleOwnershipWarnings.push(text);
    }
  });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExpectedExampleButton(page, 'heatmapLoadExample');
  await waitForHeatmapCells(page);
  const first = await activeHeatmapStatus(page);
  expect(first.overlay).toBe(false);
  expect(first.cells).toBeGreaterThanOrEqual(9);
  const firstSignature = await captureHeatmapVisualSignature(page);

  const firstTabId = first.activeTabId;
  expect(firstTabId).toBeTruthy();

  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: false }
  );
  await clickExpectedExampleButton(page, 'heatmapLoadExample');
  await waitForHeatmapCells(page);
  const second = await activeHeatmapStatus(page);
  expect(second.overlay).toBe(false);
  expect(second.cells).toBeGreaterThanOrEqual(9);

  await page.evaluate((tabId) => {
    document.querySelector(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`)?.click();
  }, firstTabId);
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 20_000 });
  await waitForHeatmapCells(page);
  const restoredFirst = await activeHeatmapStatus(page);
  expect(restoredFirst.overlay).toBe(false);
  expect(restoredFirst.cells).toBeGreaterThanOrEqual(9);
  const restoredFirstSignature = await captureHeatmapVisualSignature(page);
  expectNear(restoredFirstSignature.rowFontPx, firstSignature.rowFontPx, 0.7, 'row font size');
  expectNear(restoredFirstSignature.columnFontPx, firstSignature.columnFontPx, 0.7, 'column font size');
  expectOptionalNear(restoredFirstSignature.cellFontPx, firstSignature.cellFontPx, 0.7, 'cell value font size');
  expectNear(restoredFirstSignature.rowRect.height, firstSignature.rowRect.height, 2, 'row label height');
  expectNear(restoredFirstSignature.columnRect.width, firstSignature.columnRect.width, 2, 'column label width');
  expectNear(restoredFirstSignature.cellRect.height, firstSignature.cellRect.height, 2, 'cell height');
  expect(restoredFirstSignature.cellValueRect === null, 'cell-value presence changed').toBe(firstSignature.cellValueRect === null);
  if(restoredFirstSignature.cellValueRect){
    expectNear(restoredFirstSignature.cellValueRect.height, firstSignature.cellValueRect.height, 2, 'cell value height');
  }
  expectOptionalNear(
    restoredFirstSignature.cellValueToCellHeightRatio,
    firstSignature.cellValueToCellHeightRatio,
    0.08,
    'cell value/cell height ratio'
  );
  expect(lifecycleOwnershipWarnings).toEqual([]);
});

test('Heatmap palette controls close when their tab deactivates', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const component = { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' };
  const cellSelector = '#heatmapPage:not([hidden]) #heatmapSvg [data-export-layer="heatmap-cells"] rect';
  const host = page.locator('.font-toolbar-host[data-font-toolbar-scope="heatmap"]');
  await openComponentFromWelcome(page, component, { first: true });
  await clickExpectedExampleButton(page, 'heatmapLoadExample');
  await waitForHeatmapCells(page);
  const firstTabId = (await activeHeatmapStatus(page)).activeTabId;

  await page.locator(cellSelector).first().click({ force: true });
  await expect(host.locator('.heatmap-palette-controls-panel')).toBeVisible();
  const firstPositiveColor = host.locator('input[data-heatmap-palette-key="positive"]');
  await firstPositiveColor.fill('#12ab34', { force: true });
  await page.waitForFunction(tabId => (
    window.Components?.heatmap?.__testHooks?.getSession?.(tabId)?.state?.palette?.positive === '#12ab34'
  ), firstTabId);

  await openComponentFromWelcome(page, component, { first: false });
  const secondTabId = (await activeHeatmapStatus(page)).activeTabId;
  const newTabState = await page.evaluate(tabId => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find?.(entry => entry.id === tabId) || null;
    const session = window.Components?.heatmap?.__testHooks?.getSession?.(tabId) || null;
    return {
      payloadColors: tab?.payload?.config?.colors || null,
      sessionPalette: session?.state?.palette || null,
      runtimePalette: tab?.sharedState?.runtime?.heatmap?.palette || null,
      runtimeRecords: tab?.sharedState?.sessions || null
    };
  }, secondTabId);
  expect(newTabState.sessionPalette.positive, JSON.stringify(newTabState)).not.toBe('#12ab34');
  await clickExpectedExampleButton(page, 'heatmapLoadExample');
  await waitForHeatmapCells(page);
  expect(secondTabId).not.toBe(firstTabId);
  const paletteStillVisible = await page.evaluate(() => !!document.querySelector(
    '.font-toolbar-host[data-font-toolbar-scope="heatmap"].font-toolbar-host--visible'
  ));
  expect(paletteStillVisible).toBe(false);

  const colors = await page.evaluate(ids => ids.map(tabId => ({
    tabId,
    positive: window.Components?.heatmap?.__testHooks?.getSession?.(tabId)?.state?.palette?.positive || null
  })), [firstTabId, secondTabId]);
  expect(colors[0].positive).toBe('#12ab34');
  expect(colors[1].positive).not.toBe('#12ab34');
});

test('palette picker keeps the named scheme when its saved payload is stale', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  const component = { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' };
  await openComponentFromWelcome(page, component, { first: true });
  await clickExpectedExampleButton(page, 'heatmapLoadExample');
  await waitForHeatmapCells(page);

  await page.evaluate(() => {
    const tab = window.Main.session.getActiveTab();
    tab.payload.config.colors = { negative: '#123456', zero: '#abcdef', positive: '#fedcba' };
    window.Shared.colorSchemes.refreshActiveTabVisuals('e2e-stale-heatmap-palette', {
      preferWorkspace: true
    });
  });

  const trigger = page.locator('#heatmapPage:not([hidden]) .color-scheme-picker__button').first();
  await trigger.click();
  const menu = trigger.locator('xpath=..').locator('.color-scheme-picker__menu');
  await menu.getByRole('option', { name: 'Color (soft)' }).click();

  await expect(trigger).toHaveAccessibleName('Palette: Color (soft)');
  await trigger.click();
  const reopenedMenu = trigger.locator('xpath=..').locator('.color-scheme-picker__menu');
  await expect(reopenedMenu.getByRole('option', { name: 'Color (soft)' })).toHaveAttribute('aria-selected', 'true');
  await expect(reopenedMenu.getByRole('option', { name: 'Custom' })).toHaveAttribute('aria-selected', 'false');
});
