const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides, registerIssueCollectors, openComponentFromWelcome, clickExampleButtonIfPresent } = require('./helpers/workspaceHarness');

async function activeTabId(page){
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

async function activate(page, tabId){
  await page.locator(`.workspace-tab[data-tab-id="${tabId}"]`).click({ force:true });
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabId, { timeout:20_000 });
}

async function openBoxWithStats(page, first){
  await openComponentFromWelcome(page, { type:'box', pageId:'boxPage' }, { first });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');
  await expect(page.locator('#boxComputeStats')).toBeEnabled({ timeout:30_000 });
  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxStatsStatus')).toContainText(/up to date/i, { timeout:60_000 });
  return activeTabId(page);
}

async function openVennWithSummary(page, first){
  await openComponentFromWelcome(page, { type:'venn', pageId:'vennPage' }, { first });
  await clickExampleButtonIfPresent(page, 'sample');
  await page.waitForFunction(() => document.querySelector('#vennPage:not([hidden]) #stage [data-venn-trace-id]'));
  await page.locator('#significanceSection').evaluate(node => { node.open = true; });
  await page.locator('#totalGenes').fill('25000');
  await page.locator('#calcSignificance').click();
  await expect(page.locator('#significanceResults')).toContainText(/hypergeometric|overlap enrichment/i, { timeout:45_000 });
  const summary = page.locator('#vennPage:not([hidden]) .stats-figure-summary-checkbox').last();
  await expect(summary).toBeVisible({ timeout:30_000 });
  await summary.check();
  await expect(page.locator('#vennPage:not([hidden]) #stage g[data-stats-figure-summary="1"]')).toHaveCount(1, { timeout:30_000 });
  return activeTabId(page);
}

async function readVennSummaryGeometry(page){
  return page.evaluate(() => {
    const stage = document.querySelector('#vennPage:not([hidden]) #stage');
    const summary = stage?.querySelector('g[data-stats-figure-summary="1"]');
    if(!stage || !summary) return null;
    const circles = [...stage.querySelectorAll('circle[data-venn-trace-id]')];
    const circleBottom = circles.reduce((bottom, node) => Math.max(bottom, node.getBoundingClientRect().bottom), 0);
    const summaryRect = summary.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    return {
      circleBottom,
      summaryTop:summaryRect.top,
      summaryBottom:summaryRect.bottom,
      stageBottom:stageRect.bottom,
      summaryTransform:summary.getAttribute('transform') || '',
      viewBox:String(stage.getAttribute('viewBox') || ''),
      reserve:Number(stage.dataset.statsFigureSummaryReserveBottom || 0),
      graphContentBaseHeight:Number(stage.dataset.graphContentBaseHeight || 0),
      graphContentReserveBottom:Number(stage.dataset.graphContentReserveBottom || 0),
      summaryBaseHeight:Number(stage.dataset.statsFigureSummaryBaseHeight || 0),
      summaryBaseViewBoxHeight:Number(stage.dataset.statsFigureSummaryBaseViewBoxHeight || 0),
      circleRects:circles.map(node => {
        const rect = node.getBoundingClientRect();
        return { top:rect.top, bottom:rect.bottom, height:rect.height };
      })
    };
  });
}

async function resizeActiveVenn(page, delta){
  const handle = page.locator('#vennPage:not([hidden]) .svgbox .resizer-horizontal').first();
  await expect(handle).toBeVisible({ timeout:20_000 });
  const rect = await handle.boundingBox();
  if(!rect) throw new Error('Venn resize handle is unavailable');
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + delta, { steps:8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
}

test('summary toggle and SVG projection stay isolated between same-component tabs', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil:'domcontentloaded' });

  const first = await openBoxWithStats(page, true);
  const firstControl = page.locator('.workspace-page:not([hidden]) .stats-figure-summary-checkbox').last();
  await firstControl.check();
  await expect(page.locator('#boxPlot svg g[data-stats-figure-summary="1"]')).toHaveCount(1, { timeout:20_000 });

  const second = await openBoxWithStats(page, false);
  expect(second).not.toBe(first);
  const secondControl = page.locator('.workspace-page:not([hidden]) .stats-figure-summary-checkbox').last();
  await expect(secondControl).not.toBeChecked();
  await expect(page.locator('#boxPlot svg g[data-stats-figure-summary="1"]')).toHaveCount(0);

  await activate(page, first);
  await expect(page.locator('.workspace-page:not([hidden]) .stats-figure-summary-checkbox').last()).toBeChecked();
  await expect(page.locator('#boxPlot svg g[data-stats-figure-summary="1"]')).toHaveCount(1, { timeout:20_000 });
  expect(issues.critical).toEqual([]);
});

test('Venn summary stays below the graph when the other Venn tab is resized', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil:'domcontentloaded' });

  const summaryTab = await openVennWithSummary(page, true);
  const summaryBefore = await readVennSummaryGeometry(page);
  expect(summaryBefore?.reserve).toBeGreaterThan(0);
  expect(summaryBefore?.summaryTop).toBeGreaterThanOrEqual(summaryBefore?.circleBottom - 2);

  const otherTab = await openVennWithSummary(page, false);
  await page.locator('#vennPage:not([hidden]) .stats-figure-summary-checkbox').last().uncheck();
  await expect(page.locator('#vennPage:not([hidden]) #stage g[data-stats-figure-summary="1"]')).toHaveCount(0);
  await resizeActiveVenn(page, 55);

  await activate(page, summaryTab);
  await expect(page.locator('#vennPage:not([hidden]) .stats-figure-summary-checkbox').last()).toBeChecked();
  await expect(page.locator('#vennPage:not([hidden]) #stage g[data-stats-figure-summary="1"]')).toHaveCount(1, { timeout:30_000 });
  const summaryAfter = await readVennSummaryGeometry(page);
  expect(summaryAfter?.reserve).toBeGreaterThan(0);
  expect(summaryAfter?.summaryTop).toBeGreaterThanOrEqual(summaryAfter?.circleBottom - 2);
  expect(summaryAfter?.summaryBottom).toBeLessThanOrEqual(summaryAfter?.stageBottom + 2);
  expect(otherTab).not.toBe(summaryTab);
  expect(issues.critical).toEqual([]);
});
