const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, clickExampleButtonIfPresent } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

async function waitForSeriesPath(page) {
  await page.waitForFunction(
    () => document.querySelectorAll('#linePlot path[data-line-style-role="line"]').length > 0,
    null,
    { timeout: 20_000 }
  );
}

async function clickSeriesPath(page) {
  const clicked = await page.evaluate(() => {
    const path = document.querySelector('#linePlot path[data-line-style-role="line"]');
    if (!path) {
      return false;
    }
    path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  });
  expect(clicked).toBe(true);
}

async function loadLineExampleForFormat(page, tableFormat) {
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });
  await page.locator('#lineTableFormat').selectOption(tableFormat);
  await clickExampleButtonIfPresent(page, 'lineLoadExample');
  await waitForSeriesPath(page);
}

test('single-replicate Line keeps the grouped uncertainty toolbar hidden', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await loadLineExampleForFormat(page, 'single');

  const toolbarPanel = page.locator(
    '.font-toolbar-host[data-font-toolbar-scope="line"] .line-uncertainty-inline-panel'
  );
  await clickSeriesPath(page);
  await expect(toolbarPanel).toBeHidden();
  expect(issues.critical).toEqual([]);
});

test('grouped Line uncertainty toolbar switches between identical-SD error bars and shaded bands', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  // Load the grouped example directly. Do not round-trip this populated grid
  // through single mode: changing replicate format is a real data transformation
  // (grouped -> single reduces the replicate columns), so switching it back cannot
  // be used as a harmless visibility probe for grouped uncertainty rendering.
  await loadLineExampleForFormat(page, 'grouped');

  const legacyBorderFieldset = page.locator('#lineGraphPanel fieldset').filter({
    has: page.locator('legend', { hasText: 'Border' })
  });
  await expect(legacyBorderFieldset).toHaveCount(0);

  const toolbarPanel = page.locator(
    '.font-toolbar-host[data-font-toolbar-scope="line"] .line-uncertainty-inline-panel'
  );

  await clickSeriesPath(page);
  await expect(toolbarPanel).toBeVisible();
  await expect(toolbarPanel.locator('.additional-line-controls-panel__title')).toHaveText('Uncertainty (±SD)');

  const modeSelect = toolbarPanel.locator('select[aria-label="Uncertainty display"]');
  const thicknessInput = toolbarPanel.locator('input[aria-label="Error bar thickness"]');
  const thicknessField = thicknessInput.locator('xpath=ancestor::*[contains(@class,"additional-line-controls-panel__field")][1]');
  const transparencyField = toolbarPanel.locator('.additional-line-controls-panel__field--transparency');
  const transparencyInput = transparencyField.locator('input[type="range"]');
  const transparencyValue = transparencyField.locator('.additional-line-controls-panel__range-value');
  const backingWidth = page.locator('#lineErrorBarWidth');
  const backingMode = page.locator('#lineUncertaintyDisplay');
  const backingTransparency = page.locator('#lineUncertaintyBandTransparency');

  await expect(modeSelect).toHaveValue('bars');
  await expect(backingMode).toHaveValue('bars');
  await expect(thicknessField).toBeVisible();
  await expect(transparencyField).toBeHidden();
  await expect(page.locator('#linePlot [data-line-error-bar="1"]')).not.toHaveCount(0);
  await expect(page.locator('#linePlot [data-line-uncertainty-band="1"]')).toHaveCount(0);

  const barsPresentationGeometry = await page.evaluate(() => ({
    seriesPaths: Array.from(document.querySelectorAll('#linePlot path[data-line-style-role="line"]')).map(path => path.getAttribute('d') || ''),
    xTicks: Array.from(document.querySelectorAll('#linePlot text[data-font-role="xTick"]')).map(node => node.textContent || ''),
    yTicks: Array.from(document.querySelectorAll('#linePlot text[data-font-role="yTick"]')).map(node => node.textContent || '')
  }));

  await page.evaluate(() => window.Shared?.undoManager?.clear?.({ all: false, reason: 'e2e-line-uncertainty-width' }));
  await thicknessInput.fill('4');
  await thicknessInput.dispatchEvent('change');
  await expect(backingWidth).toHaveValue('4');
  expect(await page.evaluate(() => window.Shared?.undoManager?.canUndo?.() === true)).toBe(true);
  expect(await page.evaluate(() => window.Shared?.undoManager?.undo?.() === true)).toBe(true);
  await expect(backingWidth).toHaveValue('2');
  await expect(thicknessInput).toHaveValue('2');
  expect(await page.evaluate(() => window.Shared?.undoManager?.redo?.() === true)).toBe(true);
  await expect(backingWidth).toHaveValue('4');
  await expect(thicknessInput).toHaveValue('4');

  await page.evaluate(() => window.Shared?.undoManager?.clear?.({ all: false, reason: 'e2e-line-uncertainty-mode' }));
  await modeSelect.selectOption('band');
  await expect(backingMode).toHaveValue('band');
  expect(await page.evaluate(() => window.Shared?.undoManager?.canUndo?.() === true)).toBe(true);
  expect(await page.evaluate(() => window.Shared?.undoManager?.undo?.() === true)).toBe(true);
  await expect(backingMode).toHaveValue('bars');
  await expect(modeSelect).toHaveValue('bars');
  await expect(page.locator('#linePlot [data-line-error-bar="1"]')).not.toHaveCount(0);
  expect(await page.evaluate(() => window.Shared?.undoManager?.redo?.() === true)).toBe(true);
  await expect(backingMode).toHaveValue('band');
  await expect(modeSelect).toHaveValue('band');
  await expect(thicknessField).toBeHidden();
  await expect(transparencyField).toBeVisible();
  await expect(transparencyInput).toHaveValue('80');
  await expect(transparencyValue).toHaveText('80%');
  await expect(page.locator('#linePlot [data-line-error-bar="1"]')).toHaveCount(0);
  await expect(page.locator('#linePlot [data-line-uncertainty-band="1"]')).not.toHaveCount(0);

  const bandLayerContract = await page.evaluate(() => {
    const svg = document.querySelector('#linePlot svg');
    const layer = svg?.querySelector('[data-layer="line-uncertainty-bands"]') || null;
    const bands = Array.from(svg?.querySelectorAll('path[data-line-uncertainty-band="1"]') || []);
    const dataLines = Array.from(svg?.querySelectorAll('path[data-line-style-role="line"]') || []);
    return {
      hasLayer: !!layer,
      bandCount: bands.length,
      bandsUseDedicatedIdentity: bands.every(path => (
        !path.hasAttribute('data-series')
        && String(path.dataset?.lineUncertaintySeries || '').trim() !== ''
      )),
      layerPrecedesEveryDataLine: !!layer && dataLines.length > 0 && dataLines.every(path => (
        (layer.compareDocumentPosition(path) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
      ))
    };
  });
  expect(bandLayerContract).toEqual({
    hasLayer: true,
    bandCount: expect.any(Number),
    bandsUseDedicatedIdentity: true,
    layerPrecedesEveryDataLine: true
  });
  expect(bandLayerContract.bandCount).toBeGreaterThan(0);

  const bandPresentationGeometry = await page.evaluate(() => ({
    seriesPaths: Array.from(document.querySelectorAll('#linePlot path[data-line-style-role="line"]')).map(path => path.getAttribute('d') || ''),
    xTicks: Array.from(document.querySelectorAll('#linePlot text[data-font-role="xTick"]')).map(node => node.textContent || ''),
    yTicks: Array.from(document.querySelectorAll('#linePlot text[data-font-role="yTick"]')).map(node => node.textContent || '')
  }));
  expect(bandPresentationGeometry).toEqual(barsPresentationGeometry);

  await page.evaluate(() => window.Shared?.undoManager?.clear?.({ all: false, reason: 'e2e-line-uncertainty-transparency' }));
  await transparencyInput.evaluate(input => {
    input.value = '65';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(backingTransparency).toHaveValue('65');
  await expect(transparencyValue).toHaveText('65%');
  expect(await page.evaluate(() => window.Shared?.undoManager?.canUndo?.() === true)).toBe(true);
  expect(await page.evaluate(() => window.Shared?.undoManager?.undo?.() === true)).toBe(true);
  await expect(backingTransparency).toHaveValue('80');
  await expect(transparencyInput).toHaveValue('80');
  await expect(transparencyValue).toHaveText('80%');
  expect(await page.evaluate(() => window.Shared?.undoManager?.redo?.() === true)).toBe(true);
  await expect(backingTransparency).toHaveValue('65');
  await expect(transparencyInput).toHaveValue('65');
  await expect(transparencyValue).toHaveText('65%');
  await page.waitForFunction(() => {
    const band = document.querySelector('#linePlot [data-line-uncertainty-band="1"]');
    const opacity = Number(band?.getAttribute('fill-opacity'));
    return Number.isFinite(opacity) && opacity > 0.34 && opacity < 0.36;
  }, null, { timeout: 20_000 });

  const payload = await page.evaluate(() => window.Components?.line?.getPayload?.() || null);
  expect(payload?.config?.uncertaintyDisplay).toBe('band');
  expect(payload?.config?.uncertaintyBandTransparency).toBe('65');
  expect(payload?.config?.errorBarWidth).toBe('4');

  await modeSelect.selectOption('bars');
  await expect(backingMode).toHaveValue('bars');
  await expect(page.locator('#linePlot [data-line-error-bar="1"]')).not.toHaveCount(0);
  await expect(page.locator('#linePlot [data-line-uncertainty-band="1"]')).toHaveCount(0);

  expect(issues.critical).toEqual([]);
});
