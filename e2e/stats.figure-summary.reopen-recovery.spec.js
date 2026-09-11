const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { openComponentFromWelcome, clickExampleButtonIfPresent } = require('./helpers/workspaceDriver');
const { registerIssueCollectors } = require('./helpers/diagnostics');

async function prepareBox(page){
  await openComponentFromWelcome(page, { type:'box', pageId:'boxPage' }, { first:true });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');
  await expect(page.locator('#boxComputeStats')).toBeEnabled({ timeout:30_000 });
  await page.locator('#boxComputeStats').click();
  await expect(page.locator('#boxStatsStatus')).toContainText(/up to date/i, { timeout:60_000 });
  await page.locator('.workspace-page:not([hidden]) .stats-figure-summary-checkbox').last().check();
  await expect(page.locator('#boxPlot svg g[data-stats-figure-summary="1"]')).toHaveCount(1, { timeout:20_000 });
}

async function exportSummaryGeometry(page){
  return page.evaluate(() => {
    const svg = document.querySelector('#boxPlot svg');
    const xml = window.Shared?.exporter?.svgElementToXml?.(svg, 'stats-figure-summary-browser-export') || '';
    const parsed = new DOMParser().parseFromString(xml, 'image/svg+xml');
    const summaryTitle = Array.from(parsed.querySelectorAll('text'))
      .find(node => /STATISTICS|STATISTICAL (?:ANALYSIS|SUMMARY)|ANALYSIS SUMMARY/i.test(node.textContent || '')) || null;
    return {
      count:summaryTitle ? 1 : 0,
      hasDominantBaseline:!!summaryTitle?.hasAttribute('dominant-baseline'),
      hasExplicitY:Number.isFinite(Number(summaryTitle?.getAttribute('y'))),
      hasParentDy:!!summaryTitle?.hasAttribute('dy'),
      hasSummaryDataAttributes:Array.from(parsed.querySelectorAll('[data-stats-summary-role]')).length > 0
    };
  });
}

async function captureArchivePayload(page, snapshotKind, componentType = 'box'){
  return page.evaluate(async ({ kind, componentType }) => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope:'workspace', snapshotKind:kind,
      policyMode:kind === 'recovery' ? 'recovery' : 'manual-save',
      reason:`e2e-stats-figure-summary-${kind}`,
      compression:'STORE', useWorker:false
    });
    const parsed = await window.Shared.graphArchive.parseFile(blob, { fileName:`${kind}.graph` });
    const component = parsed.session.tabs.find(tab => tab.type === componentType);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for(let index = 0; index < bytes.length; index += 0x8000){
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return { meta:component?.payload?.meta || null, session:parsed.session, base64:btoa(binary) };
  }, { kind:snapshotKind, componentType });
}

async function prepareVennSummary(page, first){
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
  return page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
}

async function readVennGeometry(page){
  return page.evaluate(() => {
    const stage = document.querySelector('#vennPage:not([hidden]) #stage');
    const summary = stage?.querySelector('g[data-stats-figure-summary="1"]');
    if(!stage || !summary) return null;
    const circles = [...stage.querySelectorAll('circle[data-venn-trace-id]')];
    const circleBottom = circles.reduce((bottom, node) => Math.max(bottom, node.getBoundingClientRect().bottom), 0);
    const summaryRect = summary.getBoundingClientRect();
    return {
      gap:summaryRect.top - circleBottom,
      circleBottom,
      summaryTop:summaryRect.top,
      summaryBottom:summaryRect.bottom,
      stageBottom:stage.getBoundingClientRect().bottom,
      reserve:Number(stage.dataset.statsFigureSummaryReserveBottom || 0),
      viewBox:String(stage.getAttribute('viewBox') || ''),
      baseViewBoxHeight:Number(stage.dataset.statsFigureSummaryBaseViewBoxHeight || 0),
      viewBoxHeight:Number(String(stage.getAttribute('viewBox') || '').trim().split(/[ ,]+/)[3] || 0)
    };
  });
}

async function prepareSpecializedSummary(page, type, config){
  await openComponentFromWelcome(page, { type, pageId:config.pageId }, { first:true });
  await clickExampleButtonIfPresent(page, config.example);
  await page.evaluate(componentType => window.Components?.[componentType]?.draw?.(), type);
  const pageSelector = `#${config.pageId}:not([hidden])`;
  const summaryControl = page.locator(`${pageSelector} .stats-figure-summary-checkbox`).last();
  await expect(summaryControl).toBeVisible({ timeout:45_000 });
  if(!(await summaryControl.isChecked())) await summaryControl.check();
  await expect(page.locator(`${pageSelector} ${config.plot} g[data-stats-figure-summary="1"]`))
    .toHaveCount(1, { timeout:45_000 });
  const tabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  await page.evaluate(async ({ type:componentType, tabId:ownerTabId }) => {
    await window.Components?.[componentType]?.awaitReadyForSnapshot?.({
      tabId:ownerTabId,
      timeoutMs:30_000,
      settleFrames:3
    });
  }, { type, tabId });
  return tabId;
}

async function readSpecializedGeometry(page, config){
  return page.evaluate(({ pageId, plot }) => {
    const pageRoot = document.querySelector(`#${pageId}:not([hidden])`);
    const svg = pageRoot?.querySelector?.(plot) || null;
    const summary = svg?.querySelector?.('g[data-stats-figure-summary="1"]') || null;
    if(!svg || !summary) return null;
    const svgRect = svg.getBoundingClientRect();
    const summaryRect = summary.getBoundingClientRect();
    const graphBottom = Array.from(svg.querySelectorAll('*'))
      .filter(node => node !== summary
        && !node.closest?.('g[data-stats-figure-summary="1"]')
        && !node.closest?.('defs,clipPath,mask,pattern'))
      .reduce((bottom, node) => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 ? Math.max(bottom, rect.bottom) : bottom;
      }, 0);
    return {
      gap:summaryRect.top - graphBottom,
      summaryInsideSvg:summaryRect.bottom <= svgRect.bottom + 2,
      svgRect:{top:svgRect.top, bottom:svgRect.bottom, height:svgRect.height},
      summaryRect:{top:summaryRect.top, bottom:summaryRect.bottom, height:summaryRect.height},
      graphBottom,
      reserve:Number(svg.dataset.statsFigureSummaryReserveBottom || 0),
      baseHeight:Number(svg.dataset.graphContentBaseHeight || 0),
      summaryBaseHeight:Number(svg.dataset.statsFigureSummaryBaseHeight || 0),
      viewBox:String(svg.getAttribute('viewBox') || '')
    };
  }, config);
}

async function captureSpecializedRecoveryArchive(page, type){
  return page.evaluate(async componentType => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope:'workspace',
      snapshotKind:'recovery',
      policyMode:'recovery',
      reason:`e2e-stats-figure-summary-${componentType}-recovery`,
      compression:'STORE',
      useWorker:false
    });
    const parsed = await window.Shared.graphArchive.parseFile(blob, { fileName:'recovery.graph' });
    const tab = parsed.session.tabs.find(entry => entry.type === componentType) || null;
    const cache = tab?.archiveRenderCache || null;
    const rootState = cache?.svgRootState || null;
    const dataAttributes = rootState?.dataAttributes || {};
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for(let index = 0; index < bytes.length; index += 0x8000){
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000));
    }
    return {
      base64:btoa(binary),
      hasCache:!!cache,
      hasCanonicalViewport:!!(
        dataAttributes['data-graph-content-base-height']
        || dataAttributes['data-stats-figure-summary-base-height']
      )
    };
  }, type);
}

test('figure-summary toggle is serialized and projected after file reopen and recovery archive creation', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil:'domcontentloaded' });
  await prepareBox(page);
  const exported = await exportSummaryGeometry(page);
  expect(exported.count).toBeGreaterThan(0);
  expect(exported.hasDominantBaseline).toBe(false);
  expect(exported.hasExplicitY).toBe(true);
  expect(exported.hasParentDy).toBe(false);
  expect(exported.hasSummaryDataAttributes).toBe(false);

  const manual = await captureArchivePayload(page, 'document-snapshot');
  const recovery = await captureArchivePayload(page, 'recovery');
  expect(manual.meta?.statsReporting?.figureSummaryEnabled).toBe(true);
  expect(recovery.meta?.statsReporting?.figureSummaryEnabled).toBe(true);

  const archivePath = testInfo.outputPath('stats-figure-summary-reopen.graph');
  fs.writeFileSync(archivePath, Buffer.from(manual.base64, 'base64'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout:20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout:45_000 });
  await expect(page.locator('.workspace-page:not([hidden]) .stats-figure-summary-checkbox').last()).toBeChecked({ timeout:30_000 });
  await expect(page.locator('#boxPlot svg g[data-stats-figure-summary="1"]')).toHaveCount(1, { timeout:30_000 });
  expect(issues.critical).toEqual([]);
});

test('Venn summary cache preserves graph-to-table spacing through recovery', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil:'domcontentloaded' });

  const summaryTab = await prepareVennSummary(page, true);
  const before = await readVennGeometry(page);
  expect(before?.gap).toBeLessThan(100);

  const otherTab = await prepareVennSummary(page, false);
  await page.locator('#vennPage:not([hidden]) .stats-figure-summary-checkbox').last().uncheck();
  await expect(page.locator('#vennPage:not([hidden]) #stage g[data-stats-figure-summary="1"]')).toHaveCount(0);
  await page.locator(`.workspace-tab[data-tab-id="${summaryTab}"]`).click({ force:true });
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, summaryTab, { timeout:20_000 });
  await expect(page.locator('#vennPage:not([hidden]) #stage [data-venn-trace-id]')).toHaveCount(3, { timeout:30_000 });
  await page.evaluate(async tabId => {
    await window.Components?.venn?.awaitReadyForSnapshot?.({ tabId, timeoutMs:30_000, settleFrames:3 });
  }, summaryTab);

  const recovery = await captureArchivePayload(page, 'recovery', 'venn');
  const archivePath = testInfo.outputPath('stats-figure-summary-venn-recovery.graph');
  fs.writeFileSync(archivePath, Buffer.from(recovery.base64, 'base64'));
  await page.reload({ waitUntil:'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout:20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await expect(page.locator('#vennPage:not([hidden])')).toBeVisible({ timeout:45_000 });

  const recoveredSummaryTab = await page.evaluate(() => {
    const tabs = window.Main?.session?.workspaceState?.tabs || [];
    // The first tab is the summary owner created above; the second Venn tab
    // deliberately has the feature disabled.
    return tabs.find(tab => tab.type === 'venn')?.id || null;
  });
  expect(recoveredSummaryTab).toBeTruthy();
  await page.locator(`.workspace-tab[data-tab-id="${recoveredSummaryTab}"]`).click({ force:true });
  await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, recoveredSummaryTab, { timeout:20_000 });
  await expect(page.locator('#vennPage:not([hidden]) .stats-figure-summary-checkbox').last()).toBeChecked({ timeout:30_000 });
  await expect(page.locator('#vennPage:not([hidden]) #stage g[data-stats-figure-summary="1"]')).toHaveCount(1, { timeout:30_000 });
  const after = await readVennGeometry(page);
  expect(after?.gap).toBeLessThan(100);
  expect(after?.summaryTop).toBeGreaterThanOrEqual(after?.circleBottom - 2);
  expect(after?.summaryBottom).toBeLessThanOrEqual(after?.stageBottom + 2);
  expect(otherTab).not.toBe(summaryTab);
  expect(issues.critical).toEqual([]);
});

for (const specialized of [
  { type:'heatmap', pageId:'heatmapPage', plot:'#heatmapSvg', example:'heatmapLoadExample' },
  { type:'surface', pageId:'surfacePage', plot:'#surfaceSvg', example:'surfaceLoadExample' }
]) {
  test(`${specialized.type} summary cache preserves graph-to-table spacing through recovery`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil:'domcontentloaded' });

    await prepareSpecializedSummary(page, specialized.type, specialized);
    const before = await readSpecializedGeometry(page, specialized);
    expect(before?.summaryInsideSvg).toBe(true);
    expect(before?.reserve).toBeGreaterThan(0);
    expect(before?.gap).toBeLessThan(160);

    const recovery = await captureSpecializedRecoveryArchive(page, specialized.type);
    expect(recovery.hasCache).toBe(true);
    expect(recovery.hasCanonicalViewport).toBe(true);
    const archivePath = testInfo.outputPath(`${specialized.type}-stats-figure-summary-recovery.graph`);
    fs.writeFileSync(archivePath, Buffer.from(recovery.base64, 'base64'));

    await page.reload({ waitUntil:'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout:20_000 });
    await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
    await expect(page.locator(`#${specialized.pageId}:not([hidden])`)).toBeVisible({ timeout:45_000 });
    await expect(page.locator(`#${specialized.pageId}:not([hidden]) .stats-figure-summary-checkbox`).last())
      .toBeChecked({ timeout:30_000 });
    await expect(page.locator(`#${specialized.pageId}:not([hidden]) ${specialized.plot} g[data-stats-figure-summary="1"]`))
      .toHaveCount(1, { timeout:45_000 });
    const after = await readSpecializedGeometry(page, specialized);
    expect(after?.summaryInsideSvg).toBe(true);
    expect(after?.reserve).toBeGreaterThan(0);
    expect(after?.gap).toBeLessThan(160);
    expect(after?.gap).toBeGreaterThanOrEqual(-2);
    expect(issues.critical).toEqual([]);
  });
}
