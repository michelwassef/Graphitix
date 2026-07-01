const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const PIE = { type: 'pie', pageId: 'piePage', exampleButtonId: 'pieLoadExample' };

test.describe('Pie chart type controls', () => {
  test('stacked bar redraws from graph type control', async ({ page }) => {
    test.setTimeout(90_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, PIE, { first: true });
    await clickExampleButtonIfPresent(page, PIE.exampleButtonId);
    await page.waitForSelector('#piePlot svg [data-pie-trace-mode="pie"], #piePlot svg [data-pie-trace-mode="donut"]', { timeout: 20_000 });

    await page.locator('#pieChartType').selectOption('stacked');
    await page.waitForFunction(() => {
      const plot = document.querySelector('#piePage:not([hidden]) #piePlot');
      const stackedBars = plot?.querySelectorAll?.('svg rect[data-pie-trace-mode="stacked"]') || [];
      const radialSlices = plot?.querySelectorAll?.('svg path[data-pie-trace-mode="pie"], svg path[data-pie-trace-mode="donut"]') || [];
      return stackedBars.length > 0 && radialSlices.length === 0;
    }, null, { timeout: 20_000 });

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
    expect(issues.critical).toEqual([]);
  });
});
