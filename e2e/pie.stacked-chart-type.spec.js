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
    const graphFieldset = page.locator('#pieGraphPanel fieldset[data-graph-selection-fieldset="1"]');
    await expect(graphFieldset.locator('#pieShowPercents')).toHaveCount(1);
    await expect(graphFieldset.locator('#pieShowFrame')).toHaveCount(1);
    await expect(graphFieldset.locator('#pieShowStatsSummary')).toHaveCount(1);
    await expect(graphFieldset.locator('[data-pie-radial-options="1"]')).toHaveCount(1);
    await expect(page.locator('.resizer-options-menu #pieShowLegend')).toHaveCount(1);
    await expect(page.locator('#pieGraphPanel .config-panel > fieldset').filter({ hasText: 'Options' })).toHaveCount(0);
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
    const lockRatio = page.locator('#piePage:not([hidden]) .svgbox .resizer-aspect-checkbox');
    await expect(lockRatio).toBeEnabled();
    await expect(lockRatio).not.toBeChecked();

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

    await lockRatio.evaluate(checkbox => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(lockRatio).toBeChecked();

    await page.locator('#pieChartType').selectOption('pie');
    await waitForTraceMode('pie');
    await expect(lockRatio).toBeChecked();
    await expect(lockRatio).toBeDisabled();
    const forcedRadialPreference = await page.evaluate(() => ({
      payload: window.Components?.pie?.getPayload?.()?.config?.stackedAspectLocked ?? null,
      runtime: window.Components?.pie?.captureRuntimeState?.({
        tabId: window.Main?.session?.workspaceState?.activeTabId || null,
        reason: 'pie-stacked-lock-preference-test'
      })?.state?.lockRatioEnforcePrevious ?? null
    }));
    expect(forcedRadialPreference).toEqual({ payload: true, runtime: true });
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
    await expect(lockRatio).toBeEnabled();
    await expect(lockRatio).toBeChecked();
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
