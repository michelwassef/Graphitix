const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');
const {
  seedRecoveryArchive,
  reloadAndAcceptRecovery: reloadAndAcceptRecoveryDriver
} = require('../helpers/recoveryDriver');

async function prepareGroupedBand(page, { transparency = 65 } = {}) {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });

  const grouped = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line')
      : null;
    const control = root?.querySelector('#lineTableFormat') || null;
    if (!control) {
      return false;
    }
    control.value = 'grouped';
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  });
  expect(grouped).toBe(true);
  await page.waitForFunction(() => window.Components?.line?.getPayload?.()?.config?.tableFormat === 'grouped', null, { timeout: 20_000 });
  await page.locator('#linePage:not([hidden]) #lineLoadExample').click();
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line')
      : null;
    return !!root?.querySelector('#linePlot svg path[data-line-style-role="line"]');
  }, null, { timeout: 45_000 });

  const clicked = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line')
      : null;
    const path = root?.querySelector('#linePlot svg path[data-line-style-role="line"]') || null;
    if (!path) {
      return false;
    }
    path.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    return true;
  });
  expect(clicked).toBe(true);

  const panel = page.locator('.font-toolbar-host[data-font-toolbar-scope="line"] .line-uncertainty-inline-panel:visible');
  await expect(panel).toBeVisible();
  await panel.locator('select[aria-label="Uncertainty display"]').selectOption('band');
  await panel.locator('input[aria-label="Uncertainty band transparency"]').evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, transparency);

  await waitForBandState(page, transparency);
}

async function waitForBandState(page, transparency) {
  await page.waitForFunction(expectedTransparency => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line')
      : null;
    const payload = window.Components?.line?.getPayload?.() || null;
    const svg = root?.querySelector('#linePlot svg') || null;
    return active?.type === 'line'
      && payload?.config?.tableFormat === 'grouped'
      && payload?.config?.uncertaintyDisplay === 'band'
      && payload?.config?.uncertaintyBandTransparency === String(expectedTransparency)
      && (svg?.querySelectorAll('[data-line-uncertainty-band="1"]').length || 0) > 0
      && (svg?.querySelectorAll('[data-line-error-bar="1"]').length || 0) === 0
      && window.Components?.line?.isIdleForSnapshot?.() === true;
  }, transparency, { timeout: 60_000 });
}

async function readBandState(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line')
      : null;
    const payload = window.Components?.line?.getPayload?.() || null;
    const svg = root?.querySelector('#linePlot svg') || null;
    const paths = Array.from(svg?.querySelectorAll('[data-line-uncertainty-band="1"]') || []);
    return {
      activeType: active?.type || null,
      activeTabId: active?.id || null,
      tableFormat: payload?.config?.tableFormat || null,
      uncertaintyDisplay: payload?.config?.uncertaintyDisplay || null,
      uncertaintyBandTransparency: payload?.config?.uncertaintyBandTransparency || null,
      bandCount: paths.length,
      errorBarCount: svg?.querySelectorAll('[data-line-error-bar="1"]').length || 0,
      bandPathData: paths.map(path => path.getAttribute('d') || ''),
      bandOpacity: paths.map(path => Number(path.getAttribute('fill-opacity')))
    };
  });
}

async function captureWorkspaceArchive(page, { snapshotKind = 'document-snapshot', policyMode = 'manual-save', reason } = {}) {
  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind,
    policyMode,
    compression: 'STORE',
    reason,
    useWorker: snapshotKind === 'recovery'
  });
  return { buffer: Buffer.from(archive.base64, 'base64'), size: archive.size };
}

async function reopenWorkspaceArchive(page, archiveBuffer) {
  await openWorkspaceArchiveBuffer(page, archiveBuffer, {
    fileName: 'line-uncertainty-band-reopen.graph',
    componentType: 'line',
    timeout: 60_000
  });
  const tabId = await page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    return (state?.tabs || []).find(tab => tab?.type === 'line' && !tab?.isWelcome)?.id || null;
  });
  expect(tabId).toBeTruthy();
  await page.evaluate(async id => {
    const result = window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-line-uncertainty-band-reopen-activate' });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, tabId);
  await waitForBandState(page, 65);
}

async function seedRecoverySnapshot(page) {
  const archive = await buildWorkspaceArchive(page, {
    scope: 'workspace',
    snapshotKind: 'recovery',
    policyMode: 'recovery',
    reason: 'e2e-line-uncertainty-band-recovery',
    useWorker: true
  });
  const meta = await seedRecoveryArchive(page, archive.base64, {
    reason: 'e2e-line-uncertainty-band-recovery',
    fileName: 'recovered.graph'
  });
  return { ...meta, size: archive.size };
}

async function reloadAndAcceptRecovery(page) {
  const accepted = await reloadAndAcceptRecoveryDriver(page, { timeout: 20_000 });
  expect(accepted).toBe(true);
  await waitForBandState(page, 65);
}

test('Line shaded uncertainty band survives manual .graph reopen', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await prepareGroupedBand(page, { transparency: 65 });

  const before = await readBandState(page);
  const archive = await captureWorkspaceArchive(page, {
    snapshotKind: 'document-snapshot',
    policyMode: 'manual-save',
    reason: 'e2e-line-uncertainty-band-reopen'
  });
  expect(archive.size).toBeGreaterThan(0);
  await reopenWorkspaceArchive(page, archive.buffer);
  const after = await readBandState(page);

  await testInfo.attach('line-uncertainty-band-reopen.json', {
    body: Buffer.from(JSON.stringify({ before, after }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(after).toMatchObject({
    activeType: 'line',
    tableFormat: 'grouped',
    uncertaintyDisplay: 'band',
    uncertaintyBandTransparency: '65',
    errorBarCount: 0
  });
  expect(after.bandCount).toBeGreaterThan(0);
  expect(after.bandPathData).toEqual(before.bandPathData);
  expect(after.bandOpacity).toEqual(before.bandOpacity);
  expect(issues.critical).toEqual([]);
});

test('Line shaded uncertainty band survives crash recovery', async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await prepareGroupedBand(page, { transparency: 65 });

  const before = await readBandState(page);
  const recovery = await seedRecoverySnapshot(page);
  expect(recovery.size).toBeGreaterThan(0);
  await reloadAndAcceptRecovery(page);
  const after = await readBandState(page);

  await testInfo.attach('line-uncertainty-band-recovery.json', {
    body: Buffer.from(JSON.stringify({ recovery, before, after }, null, 2), 'utf8'),
    contentType: 'application/json'
  });

  expect(after).toMatchObject({
    activeType: 'line',
    tableFormat: 'grouped',
    uncertaintyDisplay: 'band',
    uncertaintyBandTransparency: '65',
    errorBarCount: 0
  });
  expect(after.bandCount).toBeGreaterThan(0);
  expect(after.bandPathData).toEqual(before.bandPathData);
  expect(after.bandOpacity).toEqual(before.bandOpacity);
  expect(issues.critical).toEqual([]);
});
