const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, clickExampleButtonIfPresent } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { waitForAnimationFrame } = require('../helpers/contractWaits');

const CASES = [
  { type:'box', pageId:'boxPage', example:'boxLoadExample', compute:'#boxComputeStats', status:'#boxStatsStatus' },
  { type:'hist', pageId:'histPage', example:'histLoadExample', draw:true },
  { type:'pie', pageId:'piePage', example:'pieLoadExample', compute:'#pieComputeStats', status:'#pieStatsStatus' },
  { type:'pca', pageId:'pcaPage', example:'pcaLoadExample', draw:true },
  { type:'heatmap', pageId:'heatmapPage', example:'heatmapLoadExample', draw:true, plot:'#heatmapSvg' },
  { type:'surface', pageId:'surfacePage', example:'surfaceLoadExample', draw:true, plot:'#surfaceSvg' }
];

async function prepare(page, componentCase){
  await clickExampleButtonIfPresent(page, componentCase.example);
  if(componentCase.compute){
    await expect(page.locator(componentCase.compute)).toBeEnabled({ timeout:30_000 });
    await page.locator(componentCase.compute).click();
    await expect(page.locator(componentCase.status)).toContainText(/up to date/i, { timeout:60_000 });
  }else if(componentCase.draw){
    await page.evaluate(type => window.Components?.[type]?.draw?.(), componentCase.type);
  }
  const summary = page.locator('.workspace-page:not([hidden]) .stats-figure-summary-checkbox').last();
  await expect(summary).toBeVisible({ timeout:30_000 });
  await summary.check();
  await expect(summary).toBeChecked();
  await page.waitForFunction(({ type }) => {
    const panel = document.querySelector(`#${type}Page:not([hidden])`);
    return !!panel?.querySelector?.('svg g[data-stats-figure-summary="1"]');
  }, componentCase, { timeout:30_000 });
}

async function readGeometry(page, componentCase){
  return page.evaluate(({ type }) => {
    const panel = document.querySelector(`#${type}Page:not([hidden]) #${type}GraphPanel`);
    const box = panel?.querySelector?.('.svgbox');
    const svg = panel?.querySelector?.('svg');
    if(!box || !svg) return null;
    const boxRect = box.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();
    const summary = svg.querySelector('g[data-stats-figure-summary="1"]');
    let summaryVisualBottom = 0;
    try{
      const bbox = summary?.getBBox?.();
      const match = String(summary?.getAttribute('transform') || '').match(/translate\(\s*[-+]?\d*\.?\d+(?:e[-+]?\d+)?\s+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*\)/i);
      const originY = Number(match?.[1] || 0);
      if(bbox && Number.isFinite(originY) && Number.isFinite(bbox.y) && Number.isFinite(bbox.height)){
        summaryVisualBottom = originY + bbox.y + bbox.height;
      }
    }catch(_err){}
    return {
      boxWidth:boxRect.width,
      boxHeight:boxRect.height,
      svgWidth:svgRect.width,
      svgHeight:svgRect.height,
      viewBoxWidth:Number(String(svg.getAttribute('viewBox') || '').split(/\s+/)[2] || 0),
      viewBoxHeight:Number(String(svg.getAttribute('viewBox') || '').split(/\s+/)[3] || 0),
      summaryCount:svg.querySelectorAll('g[data-stats-figure-summary="1"]').length,
      summaryReserve:Number(svg.dataset.statsFigureSummaryReserveBottom || 0),
      summaryGroupReserve:Number(summary?.dataset?.statsSummaryReserveBottom || 0),
      summaryVisualBottom,
      reserveBottom:Number(svg.dataset.graphContentReserveBottom || 0),
      envelopeBottom:box.dataset.graphContentEnvelope === 'true'
        ? getComputedStyle(box).getPropertyValue('--graph-content-extra-bottom').trim()
        : '',
      legendReserveWidth:Number(svg.dataset.legendReserveWidth || 0),
      legendContentWidth:Number(svg.querySelector('[data-legend-viewport-content="true"]')?.dataset?.legendContentWidth || 0),
      graphBaseWidth:Number(svg.dataset.graphContentBaseWidth || 0),
      graphBaseHeight:Number(svg.dataset.graphContentBaseHeight || 0),
      summaryTransform:summary?.getAttribute('transform') || '',
      summaryRuleWidth:Number(summary?.querySelector('[data-stats-summary-role="bottom-rule"]')?.getAttribute('x2') || 0),
      summaryValueX:Number(summary?.querySelector('[data-stats-summary-role="value"]')?.getAttribute('x') || 0)
    };
  }, componentCase);
}

async function dragVertical(page, componentCase, delta){
  const handle = page.locator(`#${componentCase.pageId}:not([hidden]) .svgbox .resizer-horizontal`).first();
  await expect(handle).toBeVisible({ timeout:20_000 });
  await handle.scrollIntoViewIfNeeded();
  const rect = await handle.boundingBox();
  if(!rect) throw new Error(`Missing vertical resize handle for ${componentCase.type}`);
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const before = await readGeometry(page, componentCase);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + delta, { steps:8 });
  await waitForAnimationFrame(page);
  const during = await readGeometry(page, componentCase);
  await page.mouse.up();
  await expect.poll(async () => (await readGeometry(page, componentCase))?.summaryReserve || 0, {
    timeout: 5_000,
    intervals: [100, 250, 500]
  }).toBeGreaterThan(0);
  const after = await readGeometry(page, componentCase);
  return { before, during, after };
}

async function collectSummaryVisibility(page, componentCase){
  return page.evaluate(({ type }) => {
    const state = window.__statsFigureSummaryResizeMonitor;
    if(!state || state.type !== type) return null;
    state.observer?.disconnect?.();
    const samples = state.samples.slice();
    delete window.__statsFigureSummaryResizeMonitor;
    return {
      samples,
      missing: samples.filter(sample => sample.count === 0).length
    };
  }, componentCase);
}

async function monitorSummaryVisibility(page, componentCase){
  await page.evaluate(({ type, plot:plotSelector }) => {
    const panel = document.querySelector(`#${type}Page:not([hidden])`);
    const plot = panel?.querySelector?.(plotSelector || `#${type}Plot`);
    if(!plot) return;
    const read = () => ({
      t: performance.now(),
      count: plot.querySelectorAll('g[data-stats-figure-summary="1"]').length
    });
    const state = { type, samples: [read()], observer: null };
    state.observer = new MutationObserver(() => state.samples.push(read()));
    state.observer.observe(plot, { childList:true, subtree:true });
    window.__statsFigureSummaryResizeMonitor = state;
  }, componentCase);
}

for(const componentCase of CASES){
  test(`${componentCase.type} keeps the summary stable across repeated vertical resizes`, async ({ page }) => {
    test.setTimeout(120_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil:'domcontentloaded' });
    await openComponentFromWelcome(page, { type:componentCase.type, pageId:componentCase.pageId }, { first:true });
    await prepare(page, componentCase);
    await monitorSummaryVisibility(page, componentCase);
    const first = await dragVertical(page, componentCase, 45);
    const second = await dragVertical(page, componentCase, -30);
    const minimum = ['box', 'pca'].includes(componentCase.type)
      ? await dragVertical(page, componentCase, -500)
      : null;
    const visibility = await collectSummaryVisibility(page, componentCase);
    expect(first.during?.summaryCount).toBe(1);
    expect(first.after?.summaryCount).toBe(1);
    expect(second.during?.summaryCount).toBe(1);
    expect(second.after?.summaryCount).toBe(1);
    expect(first.after?.summaryReserve).toBeGreaterThan(0);
    expect(second.after?.summaryReserve).toBeGreaterThan(0);
    expect(first.during?.summaryGroupReserve).toBeGreaterThan(0);
    expect(second.during?.summaryGroupReserve).toBeGreaterThan(0);
    expect(first.after?.reserveBottom).toBeGreaterThanOrEqual(first.after?.summaryReserve);
    expect(second.after?.reserveBottom).toBeGreaterThanOrEqual(second.after?.summaryReserve);
    expect(first.after?.viewBoxHeight).toBeGreaterThan(0);
    expect(second.after?.viewBoxHeight).toBeGreaterThan(0);
    expect(first.after?.envelopeBottom).not.toBe('');
    expect(second.after?.envelopeBottom).not.toBe('');
    expect(first.during?.summaryVisualBottom).toBeGreaterThan(0);
    expect(second.during?.summaryVisualBottom).toBeGreaterThan(0);
    expect(first.after?.summaryVisualBottom).toBeGreaterThan(0);
    expect(second.after?.summaryVisualBottom).toBeGreaterThan(0);
    expect(first.during?.summaryVisualBottom).toBeLessThanOrEqual(first.during?.viewBoxHeight + 1);
    expect(second.during?.summaryVisualBottom).toBeLessThanOrEqual(second.during?.viewBoxHeight + 1);
    expect(first.after?.summaryVisualBottom).toBeLessThanOrEqual(first.after?.viewBoxHeight + 1);
    expect(second.after?.summaryVisualBottom).toBeLessThanOrEqual(second.after?.viewBoxHeight + 1);
    if(minimum){
      expect(minimum.during?.summaryCount).toBe(1);
      expect(minimum.after?.summaryCount).toBe(1);
      expect(minimum.during?.summaryGroupReserve).toBeGreaterThan(0);
      expect(minimum.after?.summaryReserve).toBeGreaterThan(0);
      expect(minimum.during?.summaryVisualBottom).toBeGreaterThan(0);
      expect(minimum.during?.summaryVisualBottom).toBeLessThanOrEqual(minimum.during?.viewBoxHeight + 1);
      expect(minimum.after?.summaryVisualBottom).toBeGreaterThan(0);
      expect(minimum.after?.summaryVisualBottom).toBeLessThanOrEqual(minimum.after?.viewBoxHeight + 1);
      expect(minimum.after?.boxHeight).toBeGreaterThan(100);
      if(componentCase.type === 'pca'){
        expect(minimum.after?.legendContentWidth).toBeLessThan(200);
        expect(minimum.after?.legendReserveWidth).toBeLessThan(220);
        expect(minimum.after?.svgWidth).toBeLessThan(minimum.after?.boxWidth + 500);
      }
    }
    expect(first.after?.boxHeight).toBeCloseTo(first.before?.boxHeight + 45, 0);
    expect(second.after?.boxHeight).toBeCloseTo(first.after?.boxHeight - 30, 0);
    if(componentCase.type === 'heatmap'){
      // Heatmap keeps a stable logical matrix viewport while its physical SVG
      // frame changes. Live table presence/reserve is the resize contract.
      expect(first.after?.graphBaseHeight).toBeGreaterThan(0);
      expect(second.after?.graphBaseHeight).toBeGreaterThan(0);
    }else{
      expect(first.after?.graphBaseHeight).toBeGreaterThan(first.before?.graphBaseHeight || 0);
      expect(second.after?.graphBaseHeight).toBeLessThan(first.after?.graphBaseHeight || Infinity);
      expect(first.after?.summaryTransform).not.toBe(first.before?.summaryTransform);
      expect(second.after?.summaryTransform).not.toBe(first.after?.summaryTransform);
    }
    expect(second.after?.boxHeight).toBeGreaterThan(100);
    expect(second.after?.boxHeight).toBeLessThan(600);
    expect(visibility?.missing).toBe(0);
    expect(issues.critical).toEqual([]);
  });
}
