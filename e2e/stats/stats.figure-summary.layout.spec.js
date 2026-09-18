const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { clickExampleButton } = require('../helpers/uiDriver');
const {
  observeStableValue,
  waitForComponentOwnerReady,
  waitForObservationWindow,
  waitForOwnerProjection
} = require('../helpers/contractWaits');

const CASES = [
  { type:'box', pageId:'boxPage', plot:'#boxPlot', example:'boxLoadExample', compute:'#boxComputeStats', status:'#boxStatsStatus', pairwise:'boxShowSignificance' },
  { type:'scatter', pageId:'scatterPage', plot:'#scatterPlot', example:'scatterLoadExample', compute:'#scatterComputeStats', status:'#scatterStatsStatus', onPlot:'scatterShowPlotStats' },
  { type:'line', pageId:'linePage', plot:'#linePlot', example:'lineLoadExample', compute:'#lineComputeStats', status:'#lineStatsStatus', onPlot:'lineShowPlotStats' },
  { type:'hist', pageId:'histPage', plot:'#histPlot', example:'histLoadExample', draw:true, onPlot:'histShowStatsSummary' },
  { type:'pca', pageId:'pcaPage', plot:'#pcaPlot', example:'pcaLoadExample', draw:true },
  { type:'pie', pageId:'piePage', plot:'#piePlot', example:'pieLoadExample', compute:'#pieComputeStats', status:'#pieStatsStatus', onPlot:'pieShowStatsSummary' },
  { type:'roc', pageId:'rocPage', plot:'#rocPlot', example:'rocLoadExample', draw:true, onPlot:'rocShowComparisonOnPlot' },
  { type:'survival', pageId:'survivalPage', plot:'#survivalPlot', example:'survivalLoadExample', draw:true, onPlot:'survivalShowPlotStats' },
  { type:'heatmap', pageId:'heatmapPage', plot:'#heatmapSvg', example:'heatmapLoadExample', draw:true, directSvg:true },
  { type:'surface', pageId:'surfacePage', plot:'#surfaceSvg', example:'surfaceLoadExample', draw:true, directSvg:true },
  { type:'venn', pageId:'vennPage', plot:'#vennGraphPanel', example:'sample', vennSignificance:true }
];

async function getActiveRoot(page, type) {
  return page.evaluate(componentType => {
    const ws = window.Main?.session?.workspaceState;
    const active = ws?.tabs?.find(tab => tab?.id === ws?.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, componentType) || null;
    return !!root;
  }, type);
}

async function loadExample(page, componentCase) {
  await clickExampleButton(page, {
    type: componentCase.type,
    pageId: componentCase.pageId,
    exampleButtonId: componentCase.example
  });
}

async function prepareStats(page, componentCase) {
  if(componentCase.compute){
    const button = page.locator(componentCase.compute);
    await expect(button).toBeEnabled({ timeout:30_000 });
    await button.click();
    await expect(page.locator(componentCase.status)).toContainText(/up to date/i, { timeout:60_000 });
    return;
  }
  if(componentCase.vennSignificance){
    await page.locator('#significanceSection').evaluate(node => { node.open = true; });
    await page.locator('#totalGenes').fill('25000');
    await page.locator('#calcSignificance').click();
    await expect(page.locator('#significanceResults')).toContainText(/hypergeometric|overlap enrichment/i, { timeout:45_000 });
    return;
  }
  if(componentCase.draw){
    await page.evaluate(type => window.Components?.[type]?.draw?.(), componentCase.type);
  }
}

async function enableSummary(page) {
  const control = page.locator('.workspace-page:not([hidden]) .stats-figure-summary-checkbox').last();
  await expect(control).toBeVisible({ timeout:45_000 });
  if(!(await control.isChecked())) await control.check();
}

async function collectLayout(page, componentCase) {
  return page.evaluate(({ type, plot, directSvg }) => {
    const ws = window.Main?.session?.workspaceState;
    const active = ws?.tabs?.find(tab => tab?.id === ws?.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type) || document;
    const target = root?.querySelector?.(plot) || document.querySelector(plot);
    const svg = directSvg ? target : target?.querySelector?.('svg');
    const group = svg?.querySelector?.('g[data-stats-figure-summary="1"]') || null;
    if(!svg || !group) return null;
    const sr = svg.getBoundingClientRect();
    const gr = group.getBoundingClientRect();
    const text = group.textContent || '';
    const rowGeometry = [...group.querySelectorAll('text[data-stats-summary-role="label"]')].map(label => {
      const row = label.getAttribute('data-stats-summary-row');
      const value = group.querySelector(`text[data-stats-summary-role="value"][data-stats-summary-row="${row}"]`);
      return {
        labelX:Number(label.getAttribute('x') || 0),
        valueX:Number(value?.getAttribute('x') || 0),
        labelY:Number(label.getAttribute('y') || 0),
        valueY:Number(value?.getAttribute('y') || 0)
      };
    });
    return {
      text,
      svgHeight:sr.height,
      svgHeightAttr:Number(svg.getAttribute('height') || 0),
      groupTop:gr.top,
      groupBottom:gr.bottom,
      reserve:Number(svg.dataset.statsFigureSummaryReserveBottom || 0),
      baseHeight:Number(svg.dataset.graphContentBaseHeight || 0),
      overflowBottom:Math.max(0, gr.bottom - sr.bottom),
      hasEllipsis:text.includes('…') || /\.\.\.$/.test(text.trim()),
      rowGeometry
    };
  }, componentCase);
}

async function collectSvgViewport(page, componentCase) {
  return page.evaluate(({ type, plot, directSvg }) => {
    const ws = window.Main?.session?.workspaceState;
    const active = ws?.tabs?.find(tab => tab?.id === ws?.activeTabId) || null;
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id || null, type) || document;
    const target = root?.querySelector?.(plot) || document.querySelector(plot);
    const svg = directSvg ? target : target?.querySelector?.('svg');
    if(!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      heightAttr:Number(svg.getAttribute('height') || 0),
      svgHeight:rect.height,
      viewBox:String(svg.getAttribute('viewBox') || ''),
      summaryCount:svg.querySelectorAll('g[data-stats-figure-summary="1"]').length,
      reserve:Number(svg.dataset.statsFigureSummaryReserveBottom || 0)
    };
  }, componentCase);
}

for(const componentCase of CASES){
  test(`${componentCase.type} renders a complete owner-scoped analysis summary below the graph`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil:'domcontentloaded' });
    await openComponentFromWelcome(page, { type:componentCase.type, pageId:componentCase.pageId }, { first:true });
    expect(await getActiveRoot(page, componentCase.type)).toBe(true);
    const pageRoot = page.locator(`#${componentCase.pageId}:not([hidden])`);
    const statsControls = pageRoot.locator('.stats-figure-controls--grouped');
    await expect(statsControls, `${componentCase.type} must expose one Statistical results group in Graph`).toHaveCount(1);
    const resultRow = statsControls.locator('.stats-figure-controls__result-row');
    await expect(resultRow).toHaveCount(1);
    await expect(resultRow.locator('.stats-figure-controls__heading')).toHaveText('Statistical results:');
    const resultGeometry = await resultRow.evaluate(row => {
      const heading = row.querySelector('.stats-figure-controls__heading');
      const options = row.querySelector('.stats-figure-controls__options');
      const rowRect = row.getBoundingClientRect();
      const groupRect = row.parentElement?.getBoundingClientRect();
      const groupStyle = row.parentElement ? getComputedStyle(row.parentElement) : null;
      const groupContentLeft = (groupRect?.left || 0)
        + Number.parseFloat(groupStyle?.borderLeftWidth || 0)
        + Number.parseFloat(groupStyle?.paddingLeft || 0);
      const headingRect = heading?.getBoundingClientRect();
      const optionsRect = options?.getBoundingClientRect();
      const rowStyle = getComputedStyle(row);
      const optionsStyle = options ? getComputedStyle(options) : null;
      return {
        rowLeft: rowRect.left,
        groupContentLeft,
        headingLeft: headingRect?.left,
        headingCenter: (headingRect?.top || 0) + (headingRect?.height || 0) / 2,
        optionsLeft: optionsRect?.left,
        optionsCenter: (optionsRect?.top || 0) + (optionsRect?.height || 0) / 2,
        rowWrap: rowStyle.flexWrap,
        optionsWrap: optionsStyle?.flexWrap
      };
    });
    expect(resultGeometry.rowWrap).toBe('nowrap');
    expect(resultGeometry.optionsWrap).toBe('nowrap');
    if(['line', 'scatter', 'venn', 'surface'].includes(componentCase.type)){
      expect(Math.abs(resultGeometry.rowLeft - resultGeometry.groupContentLeft)).toBeLessThan(1.5);
    }
    expect(Math.abs(resultGeometry.headingCenter - resultGeometry.optionsCenter)).toBeLessThan(1.5);
    expect(Math.abs(resultGeometry.rowLeft - resultGeometry.headingLeft)).toBeLessThan(1.5);
    expect(resultGeometry.optionsLeft).toBeGreaterThan(resultGeometry.headingLeft);
    await expect(statsControls.locator('.stats-figure-summary-checkbox')).toHaveCount(1);
    if(componentCase.onPlot){
      await expect(statsControls.locator(`#${componentCase.onPlot}`)).toHaveCount(1);
      await expect(statsControls.locator('.stats-figure-controls__options').last().locator('label')).toHaveCount(2);
    }else{
      await expect(statsControls.locator('.stats-figure-controls__options').last().locator(':scope > label')).toHaveCount(1);
    }
    if(componentCase.pairwise){
      await expect(statsControls.locator(`#${componentCase.pairwise}`)).toHaveCount(1);
      await expect(statsControls.locator(`#${componentCase.pairwise}`).locator('xpath=..')).toContainText('Pairwise comparisons');
    }
    await loadExample(page, componentCase);
    await prepareStats(page, componentCase);
    await enableSummary(page);
    await page.waitForFunction(({ type, plot, directSvg }) => {
      const ws=window.Main?.session?.workspaceState;
      const active=ws?.tabs?.find(tab=>tab?.id===ws?.activeTabId)||null;
      const root=window.Shared?.workspaceTabs?.getMountedRoot?.(active?.id||null,type)||document;
      const target=root?.querySelector?.(plot)||document.querySelector(plot);
      const svg=directSvg?target:target?.querySelector?.('svg');
      return !!svg?.querySelector?.('g[data-stats-figure-summary="1"]');
    }, componentCase, { timeout:45_000 });

    const layout = await collectLayout(page, componentCase);
    await testInfo.attach(`${componentCase.type}.stats-figure-summary.json`, {
      body:Buffer.from(JSON.stringify(layout,null,2),'utf8'), contentType:'application/json'
    });
    expect(layout).toBeTruthy();
    expect(layout.text.length).toBeGreaterThan(20);
    expect(layout.reserve).toBeGreaterThan(0);
    expect(layout.overflowBottom).toBeLessThanOrEqual(2);
    expect(layout.hasEllipsis).toBe(false);
    expect(layout.rowGeometry.length).toBeGreaterThan(0);
    layout.rowGeometry.forEach(row => {
      expect(row.valueX).toBeGreaterThan(row.labelX);
      expect(row.valueY).toBeCloseTo(row.labelY, 3);
    });

    const repeated = await page.evaluate(({ type }) => {
      const ws = window.Main?.session?.workspaceState;
      const active = ws?.tabs?.find(tab => tab?.id === ws?.activeTabId) || null;
      return window.Shared?.statsFigureSummary?.renderForTab?.(active?.id || null, { componentType:type }) === true;
    }, componentCase);
    expect(repeated).toBe(true);
    const repeatedLayout = await collectLayout(page, componentCase);
    expect(repeatedLayout.svgHeightAttr).toBeCloseTo(layout.svgHeightAttr, 1);
    expect(repeatedLayout.reserve).toBeCloseTo(layout.reserve, 1);

    const summaryControl = page.locator('.workspace-page:not([hidden]) .stats-figure-summary-checkbox').last();
    await summaryControl.uncheck();
    await expect(page.locator(componentCase.directSvg ? `${componentCase.plot} g[data-stats-figure-summary="1"]` : `${componentCase.plot} svg g[data-stats-figure-summary="1"]`)).toHaveCount(0, { timeout:20_000 });
    const hidden = await collectSvgViewport(page, componentCase);
    expect(hidden).toBeTruthy();
    expect(hidden.summaryCount).toBe(0);
    expect(hidden.heightAttr).toBeLessThan(layout.svgHeightAttr);

    if(componentCase.type === 'box'){
      await summaryControl.check();
      await expect(page.locator('#boxPlot svg g[data-stats-figure-summary="1"]')).toHaveCount(1, { timeout:20_000 });
      const handle = page.locator('#boxGraphPanel .svgbox .resizer-horizontal').first();
      await expect(handle).toBeVisible({ timeout:20_000 });
      const box = await handle.boundingBox();
      expect(box).toBeTruthy();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const beforeResize = await collectSvgViewport(page, componentCase);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x, y + 70, { steps:4 });
      await page.waitForFunction(() => {
        const svg = document.querySelector('#boxPlot svg');
        return !!svg?.querySelector?.('g[data-stats-figure-summary="1"]')
          && Number(svg.dataset.statsFigureSummaryReserveBottom || 0) > 0;
      }, { timeout:20_000 });
      const duringResize = await collectSvgViewport(page, componentCase);
      expect(duringResize.summaryCount).toBe(1);
      expect(duringResize.reserve).toBeGreaterThan(0);
      expect(duringResize.heightAttr).toBeGreaterThanOrEqual(beforeResize.heightAttr - 1);
      expect(duringResize.svgHeight).toBeGreaterThanOrEqual(beforeResize.svgHeight - 1);
      await page.mouse.up();
      await expect(page.locator('#boxPlot svg g[data-stats-figure-summary="1"]')).toHaveCount(1, { timeout:20_000 });

      // Recomputing with a changed statistical family replaces the graph. The
      // checked summary must be projected after that owner draw settles too.
      await page.locator('#boxStatsFamily').selectOption('nonparametric');
      await expect(page.locator('#boxComputeStats')).toBeEnabled({ timeout:20_000 });
      await page.locator('#boxComputeStats').click();
      await expect(page.locator('#boxStatsStatus')).toContainText(/up to date/i, { timeout:60_000 });
      await expect(summaryControl).toBeChecked();
      await expect(page.locator('#boxPlot svg g[data-stats-figure-summary="1"]')).toHaveCount(1, { timeout:20_000 });
    }
    expect(issues.critical).toEqual([]);
  });
}

test('surface summary registration does not render the same draw twice', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil:'domcontentloaded' });
  await openComponentFromWelcome(page, { type:'surface', pageId:'surfacePage' }, { first:true });
  await clickExampleButton(page, {
    type: 'surface',
    pageId: 'surfacePage',
    exampleButtonId: 'surfaceLoadExample'
  });
  await waitForOwnerProjection(page, 'surface', '#surfaceSvg', {
    requireMountedRoot: true,
    requireIdle: true,
    timeout: 60_000
  });
  await enableSummary(page);
  await page.waitForSelector('#surfaceSvg g[data-stats-figure-summary="1"]', { state:'attached', timeout:45_000 });

  // Let delayed cache/recovery projection work settle before counting the
  // explicitly requested draw.
  await waitForObservationWindow(page, 3_500, {
    label: 'Surface delayed summary projection window'
  });
  const reason = 'surface-summary-render-coalescing';
  await page.evaluate(drawReason => {
    const table = window.Shared?.statsTable;
    if(!table || typeof table.render !== 'function') throw new Error('stats table renderer unavailable');
    window.__surfaceSummaryRenderCount = 0;
    const originalRender = table.render;
    table.render = function(...args){
      window.__surfaceSummaryRenderCount += 1;
      return originalRender.apply(this, args);
    };
    const ws = window.Main?.session?.workspaceState;
    const tabId = ws?.activeTabId || null;
    window.__surfaceSummaryDrawSettled = new Promise(resolve => {
      const onLifecycle = event => {
        const detail = event?.detail || {};
        if(detail.componentKey !== 'surface' || detail.tabId !== tabId || detail.action !== 'draw-settled' || detail.reason !== drawReason) return;
        window.removeEventListener('graphitix:lifecycle-event', onLifecycle);
        resolve();
      };
      window.addEventListener('graphitix:lifecycle-event', onLifecycle);
      window.Components.surface.draw({ reason:drawReason });
    });
  }, reason);
  await page.evaluate(() => window.__surfaceSummaryDrawSettled);
  const renderCount = await page.evaluate(() => window.__surfaceSummaryRenderCount);
  expect(renderCount).toBe(1);
  await expect(page.locator('#surfaceSvg g[data-stats-figure-summary="1"]')).toHaveCount(1);
  await observeStableValue(page, async () => ({
    renderCount: await page.evaluate(() => window.__surfaceSummaryRenderCount),
    summaryCount: await page.locator('#surfaceSvg g[data-stats-figure-summary="1"]').count()
  }), {
    durationMs: 5_000,
    label: 'Surface summary duplicate-render contract'
  });
  await expect(page.locator('#surfaceSvg g[data-stats-figure-summary="1"]')).toHaveCount(1);
  expect(issues.critical).toEqual([]);
});
