const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { test, expect } = require('@playwright/test');
const {
  openComponentFromWelcome
} = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');

async function loadScatterExample(page) {
  await expect(page.locator('#scatterLoadExample')).toBeVisible({ timeout: 20_000 });
  await page.locator('#scatterLoadExample').click();
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__getActiveHot?.();
    const data = hot?.getData?.() || [];
    return Array.isArray(data) && data.length > 2;
  }, null, { timeout: 20_000 });
}

// Trend line / stats-on-plot / summary-table checkboxes must be disabled until statistics are calculated,
// matching line.js. After calculation they must become enabled.
test('scatter trend line and stats-on-plot are disabled until statistics are calculated', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await loadScatterExample(page);
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });

  const showLine = page.locator('#scatterPage:not([hidden]) #scatterShowLine');
  const showPlotStats = page.locator('#scatterPage:not([hidden]) #scatterShowPlotStats');
  const summaryTable = page.locator('#scatterPage:not([hidden]) #scatterShowFigureSummary');

  // Before calculating statistics: both must be disabled (greyed out, unclickable).
  await expect(showLine, 'Show trend line must be disabled before stats are calculated').toBeDisabled();
  await expect(showPlotStats, 'Show stats on plot must be disabled before stats are calculated').toBeDisabled();
  await expect(summaryTable, 'Summary table must be disabled before stats are calculated').toBeDisabled();
  const disabledStyles = await page.evaluate(() => {
    return ['scatterShowPlotStats', 'scatterShowFigureSummary'].map(id => {
      const input = document.getElementById(id);
      const label = input?.closest('label');
      const style = label ? getComputedStyle(label) : null;
      return {
        opacity: style?.opacity || '',
        filter: style?.filter || '',
        cursor: style?.cursor || '',
        pointerEvents: style?.pointerEvents || ''
      };
    });
  });
  expect(disabledStyles[1], 'Summary table must use the same disabled presentation as Stats on plot')
    .toEqual(disabledStyles[0]);
  const controlLayout = await page.evaluate(() => {
    const group = document.getElementById('scatterGraphRegressionOptionsGrid');
    const heading = group?.querySelector('.stats-figure-controls__heading');
    const plotLabel = document.getElementById('scatterShowPlotStats')?.closest('label');
    const summaryLabel = document.getElementById('scatterShowFigureSummary')?.closest('label');
    const headingStyle = heading ? getComputedStyle(heading) : null;
    const optionStyle = plotLabel ? getComputedStyle(plotLabel) : null;
    const plotBox = document.getElementById('scatterShowPlotStats')?.getBoundingClientRect();
    const summaryBox = document.getElementById('scatterShowFigureSummary')?.getBoundingClientRect();
    return {
      headingTop: heading?.getBoundingClientRect().top || 0,
      plotTop: plotLabel?.getBoundingClientRect().top || 0,
      summaryTop: summaryLabel?.getBoundingClientRect().top || 0,
      headingFont: headingStyle ? [headingStyle.fontFamily, headingStyle.fontSize, headingStyle.fontWeight, headingStyle.letterSpacing] : [],
      optionFont: optionStyle ? [optionStyle.fontFamily, optionStyle.fontSize, optionStyle.fontWeight, optionStyle.letterSpacing] : [],
      plotBox: plotBox ? [plotBox.width, plotBox.height] : [],
      summaryBox: summaryBox ? [summaryBox.width, summaryBox.height] : []
    };
  });
  expect(Math.abs(controlLayout.headingTop - controlLayout.plotTop)).toBeLessThanOrEqual(2);
  expect(Math.abs(controlLayout.plotTop - controlLayout.summaryTop)).toBeLessThanOrEqual(2);
  expect(controlLayout.headingFont).toEqual(controlLayout.optionFont);
  expect(controlLayout.summaryBox).toEqual(controlLayout.plotBox);

  // Calculate statistics.
  await expect(page.locator('#scatterComputeStats')).toBeEnabled({ timeout: 20_000 });
  await page.locator('#scatterComputeStats').click();
  await expect(page.locator('#scatterStatsStatus')).toContainText('Statistics up to date.', { timeout: 35_000 });
  await waitForComponentOwnerReady(page, 'scatter', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });

  // After calculating statistics: both must be enabled.
  await expect(showLine, 'Show trend line must be enabled after stats are calculated').toBeEnabled();
  await expect(showPlotStats, 'Show stats on plot must be enabled after stats are calculated').toBeEnabled();
  await expect(summaryTable, 'Summary table must be enabled after stats are calculated').toBeEnabled();

  expect(issues.critical).toEqual([]);
});
