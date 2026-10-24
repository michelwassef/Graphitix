const { selectReplicateMode } = require('../helpers/uiDriver');
const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

async function expectControlVisibility(locator, visible){
  if(visible){
    await expect(locator).toBeVisible();
    await expect(locator).not.toHaveAttribute('hidden');
  }else{
    await expect(locator).toBeHidden();
    await expect(locator).toHaveAttribute('hidden', '');
  }
}

test('Box conditional graph controls follow graph type and table format', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });

  const graphType = page.locator('#boxGraphType');
  const summary = page.locator('#boxIndividualSummaryCtl');
  const pointMode = page.locator('#boxPointModeCtl');
  const whiskerRuleSelect = page.locator('#boxWhiskerRule');
  const whiskerCustom = page.locator('#boxWhiskerCustomLabel');
  const errorMode = page.locator('#boxErrorModeCtl');
  const whiskerRow = page.locator('#boxGraphWhiskerRow');
  const whiskerRule = page.locator('#boxWhiskerRuleCtl');
  const whiskerCaps = page.locator('#boxShowCapsCtl');
  const violinBandwidth = page.locator('#boxViolinBandwidthCtl');
  const violinExtent = page.locator('#boxViolinExtentCtl');
  const violinSamples = page.locator('#boxViolinSamplesCtl');
  const layoutMode = page.locator('#boxLayoutModeCtl');
  const significanceRow = page.locator('#boxGraphSignificanceRow');
  const significanceControls = page.locator('#boxSignificanceControls');

  await expect(summary).toBeVisible();
  await expect(summary).not.toHaveAttribute('hidden');
  await expect(summary).toHaveJSProperty('style.display', '');
  await expectControlVisibility(pointMode, false);
  await expect(pointMode).toHaveJSProperty('style.display', '');
  await expectControlVisibility(whiskerCustom, false);
  await expect(whiskerCustom).toHaveJSProperty('style.display', '');
  await expectControlVisibility(significanceControls, true);
  await expect(significanceControls).toHaveJSProperty('style.display', '');
  await expectControlVisibility(errorMode, false);
  await expectControlVisibility(whiskerRow, false);
  await expectControlVisibility(whiskerRule, false);
  await expectControlVisibility(whiskerCaps, false);
  await expectControlVisibility(violinBandwidth, false);
  await expectControlVisibility(violinExtent, false);
  await expectControlVisibility(violinSamples, false);
  await expectControlVisibility(layoutMode, false);
  await expect(significanceRow).toHaveAttribute('hidden', '');

  await graphType.selectOption('bar');
  await expect(summary).toBeVisible();
  await expectControlVisibility(pointMode, true);
  await expectControlVisibility(errorMode, true);
  await expectControlVisibility(whiskerRow, false);
  await expectControlVisibility(whiskerRule, false);
  await expectControlVisibility(whiskerCaps, false);
  await expect(significanceRow).toHaveAttribute('hidden', '');

  await graphType.selectOption('violin');
  await expect(summary).toBeHidden();
  await expectControlVisibility(pointMode, true);
  await expectControlVisibility(errorMode, false);
  await expectControlVisibility(whiskerRow, true);
  await expectControlVisibility(whiskerRule, true);
  await expectControlVisibility(whiskerCaps, false);
  await expectControlVisibility(violinBandwidth, true);
  await expectControlVisibility(violinExtent, true);
  await expectControlVisibility(violinSamples, true);
  await expect(significanceRow).not.toHaveAttribute('hidden');

  await graphType.selectOption('box');
  await expect(summary).toBeHidden();
  await expectControlVisibility(pointMode, true);
  await expectControlVisibility(whiskerRow, true);
  await expectControlVisibility(whiskerRule, true);
  await expectControlVisibility(whiskerCaps, true);
  await whiskerRuleSelect.selectOption('custom');
  await expectControlVisibility(whiskerCustom, true);
  await expect(whiskerCustom).toHaveJSProperty('style.display', '');
  await whiskerRuleSelect.selectOption('iqr15');
  await expectControlVisibility(whiskerCustom, false);
  await expect(significanceRow).not.toHaveAttribute('hidden');

  await selectReplicateMode(page, 'box', 'grouped');
  await expectControlVisibility(layoutMode, true);
  await expectControlVisibility(significanceControls, false);
  await expect(significanceControls).toHaveJSProperty('style.display', '');
  await selectReplicateMode(page, 'box', 'single');
  await expectControlVisibility(layoutMode, false);
  await expectControlVisibility(significanceControls, true);
});

test('Box conditional controls restore after archive reopen', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true, loadExample: true });

  await page.locator('#boxGraphType').selectOption('box');
  await page.locator('#boxWhiskerRule').selectOption('custom');
  await selectReplicateMode(page, 'box', 'grouped');
  await expectControlVisibility(page.locator('#boxWhiskerCustomLabel'), true);
  await expectControlVisibility(page.locator('#boxViolinBandwidthCtl'), false);
  await expectControlVisibility(page.locator('#boxLayoutModeCtl'), true);
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requirePublished: true,
    requireIdle: true,
    timeout: 30_000
  });

  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind: 'document-snapshot',
    compression: 'STORE',
    reason: 'e2e-box-conditional-controls-reopen'
  });
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
    fileName: 'box-conditional-controls.graph',
    componentType: 'box',
    timeout: 60_000
  });

  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requirePublished: true,
    requireIdle: true,
    timeout: 60_000
  });
  await expect(page.locator('#boxGraphType')).toHaveValue('box');
  await expect(page.locator('#boxTableFormat')).toHaveValue('grouped');
  await expectControlVisibility(page.locator('#boxWhiskerCustomLabel'), true);
  await expectControlVisibility(page.locator('#boxViolinBandwidthCtl'), false);
  await expectControlVisibility(page.locator('#boxLayoutModeCtl'), true);
  await expectControlVisibility(page.locator('#boxErrorModeCtl'), false);
  await expectControlVisibility(page.locator('#boxSignificanceControls'), false);

  await page.locator('#boxGraphType').selectOption('violin');
  await waitForComponentOwnerReady(page, 'box', {
    requireMountedRoot: true,
    requirePublished: true,
    requireIdle: true,
    timeout: 30_000
  });
  await expectControlVisibility(page.locator('#boxViolinBandwidthCtl'), true);
});
