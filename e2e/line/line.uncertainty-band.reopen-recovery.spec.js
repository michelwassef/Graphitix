const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

async function getActiveLineRootState(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === 'line'
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'line')
      : null;
    return {
      tabId: active?.id || null,
      activeType: active?.type || null,
      hasRoot: !!root
    };
  });
}

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
  const result = await page.evaluate(async options => {
    const context = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: options.snapshotKind,
      policyMode: options.policyMode,
      compression: 'STORE',
      reason: options.reason,
      useWorker: options.snapshotKind === 'recovery'
    });
    if (!blob) {
      throw new Error(`Line ${options.snapshotKind} archive was not created`);
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunkSize = 0x8000;
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return { base64: btoa(binary), size: blob.size };
  }, { snapshotKind, policyMode, reason });
  return { buffer: Buffer.from(result.base64, 'base64'), size: result.size };
}

async function reopenWorkspaceArchive(page, archiveBuffer) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles({
    name: 'line-uncertainty-band-reopen.graph',
    mimeType: 'application/octet-stream',
    buffer: archiveBuffer
  });
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    return (state?.tabs || []).some(tab => tab?.type === 'line' && !tab?.isWelcome);
  }, null, { timeout: 60_000 });
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
  return page.evaluate(async () => {
    const openRequest = window.indexedDB.open('graphitix-document-state', 2);
    const db = await new Promise((resolve, reject) => {
      openRequest.onupgradeneeded = () => {
        const opened = openRequest.result;
        if (!opened.objectStoreNames.contains('snapshots')) {
          opened.createObjectStore('snapshots');
        }
      };
      openRequest.onsuccess = () => resolve(openRequest.result);
      openRequest.onerror = () => reject(openRequest.error || new Error('IndexedDB open failed'));
    });
    const context = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      reason: 'e2e-line-uncertainty-band-recovery',
      useWorker: true
    });
    if (!blob) {
      db.close();
      throw new Error('Line recovery archive was not created');
    }
    const workspaceState = window.Main?.session?.workspaceState || {};
    const graphTabs = (workspaceState.tabs || []).filter(tab => tab && !tab.isWelcome && tab.type);
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
        meta: {
          app: 'Graphitix',
          kind: 'recovery',
          version: 1,
          savedAt: new Date().toISOString(),
          updatedAt: Date.now(),
          reason: 'e2e-line-uncertainty-band-recovery',
          dirty: true,
          hasData: true,
          tabCount: graphTabs.length,
          fileName: workspaceState.sessionFileName || 'recovered.graph',
          filePath: workspaceState.sessionFilePath || '',
          fileScope: workspaceState.sessionFileScope || 'workspace'
        },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB recovery write failed'));
    });
    db.close();
    return { size: blob.size, tabCount: graphTabs.length };
  });
}

async function reloadAndAcceptRecovery(page) {
  let accepted = false;
  const handler = async dialog => {
    if (/recover|restore/i.test(dialog.message())) {
      accepted = true;
    }
    await dialog.accept();
  };
  page.on('dialog', handler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => accepted, { timeout: 20_000 }).toBe(true);
    await waitForBandState(page, 65);
  } finally {
    page.off('dialog', handler);
  }
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
