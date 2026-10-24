const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

const COMPONENTS = [
  { type: 'venn', pageId: 'vennPage', exampleButtonId: 'sample', plotId: 'stage', pointSelector: '[data-venn-trace-id]', toolbarSelector: '.venn-upset-trace-controls' },
  { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample', plotId: 'boxPlot', pointSelector: '[data-box-shape="body"]:not([data-summary-line="1"])', toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="box"]' },
  { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample', plotId: 'scatterPlot', pointSelector: '[data-scatter-point-interaction]', toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="scatter"]' },
  { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample', plotId: 'pcaPlot', pointSelector: '[data-pca-point-interaction]', toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="pca"]' },
  { type: 'line', pageId: 'linePage', exampleButtonId: 'lineLoadExample', plotId: 'linePlot', pointSelector: 'path[data-line-style-role="line"][data-series]:not([data-plot-point="1"]):not([data-line-overlay])', toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="line"]' },
  { type: 'hist', pageId: 'histPage', exampleButtonId: 'histLoadExample', plotId: 'histPlot', pointSelector: '[data-hist-bar="1"]', toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="hist"]' },
  { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample', plotId: 'piePlot', pointSelector: '[data-pie-trace="1"]', toolbarSelector: '.font-toolbar-host[data-font-toolbar-scope="pie"]' }
];

async function waitForOwner(page, component) {
  await waitForComponentOwnerReady(page, component.type, {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
}

async function ensureBoxPlotMode(page, component) {
  if (component.type !== 'box') return;
  await page.locator('#boxGraphType').selectOption('box');
  await waitForOwner(page, component);
}

async function openActualColorPicker(page, component) {
  const workspace = page.locator(`#${component.pageId}:not([hidden])`);
  const plot = workspace.locator(`#${component.plotId}`);
  const firstMark = plot.locator(component.pointSelector).first();
  await expect(firstMark).toBeVisible();
  await plot.focus();
  await page.keyboard.press('ArrowRight');
  const focusedMark = plot.locator(`:is(${component.pointSelector}):focus`);
  await expect(focusedMark).toHaveCount(1);
  const markIndex = await plot.evaluate((root, selector) => (
    Array.from(root.querySelectorAll(selector)).indexOf(document.activeElement)
  ), component.pointSelector);
  const markStyle = await readMarkStyle(focusedMark);
  await page.keyboard.press('Enter');

  const toolbar = page.locator(component.toolbarSelector).last();
  await expect(toolbar).toBeVisible();
  const fill = toolbar.locator('.shared-fill-style-chip').first();
  await expect(fill).toBeVisible();
  await fill.click();
  const picker = page.getByRole('dialog', { name: 'Color picker' });
  await expect(picker).toBeVisible();
  return { picker, fill, markIndex, markStyle, plot };
}

async function readMarkStyle(mark) {
  return mark.evaluate(node => {
    const style = getComputedStyle(node);
    return { fill: style.fill, stroke: style.stroke };
  });
}

for (const component of COMPONENTS) {
  test(`${component.type} shared color picker closes on owner change and rejects a stale eyedropper result`, async ({ page }) => {
    test.setTimeout(180_000);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForOwner(page, component);
    await ensureBoxPlotMode(page, component);
    const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

    await openComponentFromWelcome(page, component, { loadExample: true });
    await waitForOwner(page, component);
    await ensureBoxPlotMode(page, component);
    const secondTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(secondTabId).toBeTruthy();
    expect(secondTabId).not.toBe(firstTabId);

    await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-symbol-picker-owner-open' }), firstTabId);
    await waitForOwner(page, component);
    await page.evaluate(() => {
      window.__eyeDropperStarted = false;
      window.__eyeDropperResolved = false;
      window.__resolveEyeDropper = color => {
        window.__eyeDropperResolved = true;
        window.__resolveEyeDropperValue({ sRGBHex: color });
      };
      window.EyeDropper = class {
        open() {
          window.__eyeDropperStarted = true;
          return new Promise(resolve => { window.__resolveEyeDropperValue = resolve; });
        }
      };
    });

    const { picker, markIndex: firstMarkIndex, markStyle: firstMarkStyle } = await openActualColorPicker(page, component);
    await picker.locator('.shared-color-picker__eyedropper').click();
    await page.waitForFunction(() => window.__eyeDropperStarted === true);

    await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-symbol-picker-owner-close' }), secondTabId);
    await waitForOwner(page, component);
    await expect(picker).toBeHidden();

    const { picker: replacementPicker, markIndex: replacementMarkIndex, markStyle: replacementMarkStyle } = await openActualColorPicker(page, component);
    const hex = replacementPicker.getByRole('textbox', { name: 'Enter a hex color' });
    const replacementColor = await hex.inputValue();
    await page.evaluate(() => window.__resolveEyeDropper('#FF0000'));
    await page.waitForFunction(() => window.__eyeDropperResolved === true);
    await expect(hex).toHaveValue(replacementColor);
    const replacementMark = page.locator(`#${component.pageId}:not([hidden]) #${component.plotId}`)
      .locator(component.pointSelector).nth(replacementMarkIndex);
    await expect.poll(() => readMarkStyle(replacementMark)).toEqual(replacementMarkStyle);

    await page.evaluate(tabId => window.Main.tabs.activateTab(tabId, { reason: 'e2e-symbol-picker-owner-verify' }), firstTabId);
    await waitForOwner(page, component);
    const restoredFirstMark = page.locator(`#${component.pageId}:not([hidden]) #${component.plotId}`)
      .locator(component.pointSelector).nth(firstMarkIndex);
    await expect.poll(() => readMarkStyle(restoredFirstMark)).toEqual(firstMarkStyle);
  });
}
