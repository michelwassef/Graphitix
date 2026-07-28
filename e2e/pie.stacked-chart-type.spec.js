const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const PIE = { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' };

test.describe('Pie chart type controls', () => {
  test('stacked bar redraws and preserves radial option layout', async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, PIE, { first: true });
    await clickExampleButtonIfPresent(page, PIE.exampleButtonId);
    const waitForTraceMode = mode => page.waitForFunction(expectedMode => {
      const traces = Array.from(document.querySelectorAll('#piePage:not([hidden]) #piePlot svg [data-pie-trace-mode]'));
      return traces.length > 0 && traces.every(trace => trace.getAttribute('data-pie-trace-mode') === expectedMode);
    }, mode, { timeout: 20_000 });
    await waitForTraceMode('pie');
    const radialOptions = page.locator('[data-pie-radial-options="1"]');
    const initialRadialLayout = await radialOptions.evaluate(node => Array.from(node.children).map(child => ({
      left: child.offsetLeft,
      top: child.offsetTop
    })));
    const configPanel = page.locator('#pieGraphPanel .config-panel');
    const readPanelLayout = async () => page.evaluate(() => {
      const panel = document.querySelector('#pieGraphPanel .config-panel');
      const palette = panel?.querySelector('.color-scheme-picker__button');
      const panelRect = panel?.getBoundingClientRect();
      const paletteRect = palette?.getBoundingClientRect();
      return {
        width: panelRect?.width || 0,
        paletteContained: !!panelRect && !!paletteRect && paletteRect.right <= panelRect.right
      };
    });
    const initialPanelLayout = await readPanelLayout();
    await expect(configPanel).toBeVisible();
    expect(initialPanelLayout.paletteContained).toBe(true);

    await page.locator('#pieChartType').selectOption('stacked');
    await waitForTraceMode('stacked');

    const snapshot = await page.evaluate(() => {
      const plot = document.querySelector('#piePage:not([hidden]) #piePlot');
      return {
        selectedType: document.querySelector('#pieChartType')?.value || null,
        stackedBars: plot?.querySelectorAll?.('svg rect[data-pie-trace-mode="stacked"]')?.length || 0,
        radialSlices: plot?.querySelectorAll?.('svg path[data-pie-trace-mode="pie"], svg path[data-pie-trace-mode="donut"]')?.length || 0
      };
    });

    expect(snapshot.selectedType).toBe('stacked');
    expect(snapshot.stackedBars).toBeGreaterThan(0);
    expect(snapshot.radialSlices).toBe(0);
    await expect(radialOptions).toBeHidden();
    const stackedPanelLayout = await readPanelLayout();
    expect(stackedPanelLayout.width).toBeCloseTo(initialPanelLayout.width, 0);
    expect(stackedPanelLayout.paletteContained).toBe(true);

    await page.locator('#pieChartType').selectOption('pie');
    await waitForTraceMode('pie');
    await expect(radialOptions).toBeVisible();
    const restoredRadialLayout = await radialOptions.evaluate(node => Array.from(node.children).map(child => ({
      left: child.offsetLeft,
      top: child.offsetTop
    })));
    expect(restoredRadialLayout).toEqual(initialRadialLayout);
    const restoredPanelLayout = await readPanelLayout();
    expect(restoredPanelLayout.width).toBeCloseTo(initialPanelLayout.width, 0);
    expect(restoredPanelLayout.paletteContained).toBe(true);

    await page.locator('#pieChartType').selectOption('stacked');
    await waitForTraceMode('stacked');
    await expect(radialOptions).toBeHidden();
    await page.locator('#pieChartType').selectOption('donut');
    await waitForTraceMode('donut');
    await expect(radialOptions).toBeVisible();
    const donutRadialLayout = await radialOptions.evaluate(node => Array.from(node.children).map(child => ({
      left: child.offsetLeft,
      top: child.offsetTop
    })));
    expect(donutRadialLayout).toEqual(initialRadialLayout);
    const donutPanelLayout = await readPanelLayout();
    expect(donutPanelLayout.width).toBeCloseTo(initialPanelLayout.width, 0);
    expect(donutPanelLayout.paletteContained).toBe(true);
    expect(issues.critical).toEqual([]);
  });
});
