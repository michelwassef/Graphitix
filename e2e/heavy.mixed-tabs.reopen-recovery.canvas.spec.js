const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

async function openNewTabType(page, type, reason = 'e2e-open-new-tab') {
  const idsBefore = await page.evaluate(() => Array.from(
    document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]')
  ).map(node => String(node.getAttribute('data-tab-id') || '').trim()).filter(Boolean));
  await page.evaluate(async ({ graphType, reasonText }) => {
    const tabs = window.Main?.tabs;
    if (tabs && typeof tabs.handleAddTabClick === 'function') {
      const maybe = tabs.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') {
        await maybe;
      }
    }
    if (tabs && typeof tabs.handleGraphSelection === 'function') {
      const maybe = tabs.handleGraphSelection(graphType, { reason: reasonText || 'e2e-open-new-tab' });
      if (maybe && typeof maybe.then === 'function') {
        await maybe;
      }
    }
    const prompt = document.querySelector('#duplicatePrompt:not([hidden])');
    const emptyButton = document.getElementById('duplicateEmpty');
    if (prompt && emptyButton && !emptyButton.disabled) {
      emptyButton.click();
      await new Promise(resolve => setTimeout(resolve, 220));
    }
  }, { graphType: type, reasonText: reason });
  const visibleCard = page.locator(`#graphSelectionGrid [data-graph-type="${type}"]`).first();
  if (await visibleCard.isVisible().catch(() => false)) {
    await visibleCard.click({ force: true });
  }
  await page.waitForSelector(`#${type}Page:not([hidden])`, { timeout: 30_000 });
  const idsAfter = await page.evaluate(() => Array.from(
    document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]')
  ).map(node => String(node.getAttribute('data-tab-id') || '').trim()).filter(Boolean));
  const createdTabId = idsAfter.find(id => !idsBefore.includes(id)) || null;
  return createdTabId;
}

async function activateTab(page, tabId) {
  await page.evaluate(async (id) => {
    const activate = window.Main?.tabs?.activateTab;
    if (typeof activate !== 'function') {
      return;
    }
    const maybe = activate(id, { reason: 'e2e-heavy-tab-activate' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
  }, tabId);
  await page.waitForTimeout(350);
}

async function loadHeavyScatterData(page, variant) {
  await page.evaluate((variantId) => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.()
      || window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__getState?.()?.hot;
    if (!hot || typeof hot.loadData !== 'function') {
      throw new Error('scatter hot table unavailable');
    }
    const rows = [['label', 'x', 'y']];
    const pointCount = 24_000;
    for (let idx = 1; idx <= pointCount; idx += 1) {
      const shift = variantId === 'B' ? 0.75 : 0;
      const x = ((idx / 125) + shift).toFixed(5);
      const y = (
        Math.sin((idx / (variantId === 'B' ? 17 : 23)) + shift) * 10
        + Math.cos((idx / (variantId === 'B' ? 61 : 89)) + shift) * 4
        + idx / (variantId === 'B' ? 860 : 990)
      ).toFixed(5);
      rows.push([`${variantId}${idx}`, x, y]);
    }
    const graphType = document.getElementById('scatterGraphType');
    if (graphType) {
      graphType.value = 'scatter';
      graphType.dispatchEvent(new Event('change', { bubbles: true }));
    }
    hot.loadData(rows);
    window.Components?.scatter?.draw?.({ reason: `e2e-heavy-scatter-${variantId}` });
  }, variant);
}

async function waitForScatterHot(page) {
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.()
      || window.Components?.scatter?.__getActiveHot?.()
      || window.Components?.scatter?.__getState?.()?.hot;
    return !!(hot && hot.gridApi && typeof hot.loadData === 'function');
  }, null, { timeout: 60_000 });
}

async function waitForScatterCanvas(page) {
  await page.waitForFunction(() => {
    const layer = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg [data-layer="points"]');
    if (!layer) {
      return false;
    }
    const mode = layer.getAttribute('data-render-mode');
    if (mode !== 'canvas' && mode !== 'canvas-resize-reused') {
      return false;
    }
    return !!layer.querySelector('foreignObject[data-point-renderer] canvas');
  }, null, { timeout: 120_000 });
}

async function collectScatterTabState(page, tabId) {
  await activateTab(page, tabId);
  await waitForScatterCanvas(page);
  return page.evaluate((id) => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === id) || null;
    const layer = document.querySelector('#scatterPage:not([hidden]) #scatterPlot svg [data-layer="points"]');
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    const data = typeof hot?.getData === 'function' ? hot.getData() : [];
    const rowCount = Array.isArray(data) ? Math.max(0, data.length - 1) : 0;
    const firstLabel = rowCount > 0 ? String(data[1]?.[0] || '') : '';
    const previewApi = window.Main?.previews;
    const config = window.Main?.components?.registry?.scatter;
    if (previewApi && config && typeof previewApi.updateTabPreviewFromWorkspace === 'function') {
      previewApi.updateTabPreviewFromWorkspace(tab, config, {
        forceCapture: true,
        reason: 'e2e-heavy-mixed-preview-capture'
      });
    }
    return {
      tabId: id,
      payloadSignature: tab?.payloadSignature || null,
      previewSignature: tab?.previewSignature || null,
      previewHasCanvasBitmap: typeof tab?.previewMarkup === 'string'
        ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"')
        : false,
      previewIsPlaceholder: typeof tab?.previewMarkup === 'string'
        ? tab.previewMarkup.includes('data-preview-placeholder')
        : false,
      rowCount,
      firstLabel,
      renderMode: layer?.getAttribute?.('data-render-mode') || null,
      canvasCount: layer?.querySelectorAll?.('foreignObject[data-point-renderer] canvas').length || 0
    };
  }, tabId);
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    if (!tabsApi || typeof tabsApi.getSessionActionsContext !== 'function') {
      throw new Error('Main.tabs.getSessionActionsContext unavailable');
    }
    if (!sessionActions || typeof sessionActions.buildWorkspaceArchiveBlob !== 'function') {
      throw new Error('Main.sessionActions.buildWorkspaceArchiveBlob unavailable');
    }
    const context = tabsApi.getSessionActionsContext();
    const blob = await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-heavy-mixed-archive'
    });
    if (!blob) {
      throw new Error('buildWorkspaceArchiveBlob returned null');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return {
      fileName: `${stem}.graph`,
      base64: btoa(binary),
      byteLength: bytes.length
    };
  }, fileStem);

  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, archive.fileName);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return { archivePath, byteLength: archive.byteLength };
}

async function loadWorkspaceArchiveFromPath(page, archivePath) {
  const input = page.locator('#workspaceSessionInput');
  await expect(input).toHaveCount(1, { timeout: 20_000 });
  await input.setInputFiles(archivePath);
  await page.waitForTimeout(1_000);
}

async function awaitPostLoadWarmup(page, reason = 'e2e-await-post-load-warmup') {
  await page.evaluate(async (reasonText) => {
    const sessionActions = window.Main?.sessionActions;
    if (!sessionActions || typeof sessionActions.awaitPostLoadWarmup !== 'function') {
      return;
    }
    await sessionActions.awaitPostLoadWarmup({
      timeoutMs: 90_000,
      reason: reasonText || 'e2e-await-post-load-warmup'
    });
  }, reason);
}

async function seedRecoverySnapshot(page) {
  await page.evaluate(async () => {
    const openWebDb = () => new Promise((resolve, reject) => {
      const request = window.indexedDB.open('graphitix-document-state', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('snapshots')) {
          db.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });

    const putRecoverySnapshot = async (record) => {
      const db = await openWebDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('snapshots', 'readwrite');
        tx.objectStore('snapshots').put(record, 'active-recovery');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error('IndexedDB snapshot write failed.'));
      });
    };

    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    const workspaceState = window.Main?.session?.workspaceState || {};
    if (!tabsApi || typeof tabsApi.getSessionActionsContext !== 'function') {
      throw new Error('Main.tabs.getSessionActionsContext unavailable');
    }
    if (!sessionActions || typeof sessionActions.buildWorkspaceArchiveBlob !== 'function') {
      throw new Error('Main.sessionActions.buildWorkspaceArchiveBlob unavailable');
    }
    const graphTabs = Array.isArray(workspaceState.tabs)
      ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type)
      : [];
    const context = tabsApi.getSessionActionsContext();
    const blob = await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'lifecycle-checkpoint',
      policyMode: 'recovery',
      reason: 'recovery-interval',
      idleForMs: 8_000,
      useWorker: true
    });
    if (!blob) {
      throw new Error('Recovery snapshot blob was empty');
    }
    await putRecoverySnapshot({
      meta: {
        app: 'Graphitix',
        kind: 'recovery',
        version: 1,
        savedAt: new Date().toISOString(),
        updatedAt: Date.now(),
        reason: 'recovery-interval',
        dirty: true,
        hasData: true,
        tabCount: graphTabs.length,
        fileName: workspaceState.sessionFileName || 'workspace.graph',
        filePath: workspaceState.sessionFilePath || '',
        fileScope: workspaceState.sessionFileScope || 'workspace'
      },
      blob
    });
  });
}

async function reloadAndAcceptRecovery(page) {
  let acceptedDialog = false;
  const dialogHandler = async dialog => {
    acceptedDialog = true;
    await dialog.accept();
  };
  page.on('dialog', dialogHandler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_200);
  } finally {
    page.off('dialog', dialogHandler);
  }
  return acceptedDialog;
}

async function buildMixedHeavyWorkspace(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await waitForScatterHot(page);
  await loadHeavyScatterData(page, 'A');
  await waitForScatterCanvas(page);
  const scatterAId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(scatterAId).toBeTruthy();

  const boxTabId = await openNewTabType(page, 'box', 'e2e-heavy-mixed-open-box');
  expect(boxTabId).toBeTruthy();
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await clickExampleButtonIfPresent(page, 'boxLoadExample');
  await page.waitForTimeout(650);
  await page.waitForFunction(() => !!document.querySelector('#boxPlot svg'), null, { timeout: 60_000 });

  const scatterBId = await openNewTabType(page, 'scatter', 'e2e-heavy-mixed-open-scatter-b');
  expect(scatterBId).toBeTruthy();
  await waitForScatterHot(page);
  await loadHeavyScatterData(page, 'B');
  await waitForScatterCanvas(page);

  const baselineScatterA = await collectScatterTabState(page, scatterAId);
  const baselineScatterB = await collectScatterTabState(page, scatterBId);
  return {
    ids: { scatterAId, boxTabId, scatterBId },
    baseline: {
      scatterA: {
        rowCount: baselineScatterA.rowCount,
        firstLabel: baselineScatterA.firstLabel
      },
      scatterB: {
        rowCount: baselineScatterB.rowCount,
        firstLabel: baselineScatterB.firstLabel
      }
    }
  };
}

async function verifyMixedTabsAfterRestore(page, workspace) {
  const ids = workspace?.ids || workspace || {};
  const baseline = workspace?.baseline || {};
  await expect(page.locator('#workspaceTabsList .workspace-tab[data-tab-id]')).toHaveCount(4, { timeout: 20_000 });
  const savedTabs = await page.evaluate(() => {
    const tabs = Array.isArray(window.Main?.session?.workspaceState?.tabs)
      ? window.Main.session.workspaceState.tabs
      : [];
    return tabs
      .filter(tab => tab && !tab.isWelcome && tab.type)
      .map(tab => ({
        id: tab.id,
        type: tab.type,
        payloadSignature: tab.payloadSignature || null,
        previewSignature: tab.previewSignature || null,
        previewHasBitmap: typeof tab.previewMarkup === 'string' ? tab.previewMarkup.includes('data-preview-canvas-bitmap="true"') : false
      }));
  });
  const scatterSaved = savedTabs.filter(tab => tab.type === 'scatter');
  const boxSaved = savedTabs.filter(tab => tab.type === 'box');
  expect(scatterSaved).toHaveLength(2);
  expect(boxSaved.length).toBeGreaterThan(0);
  expect(scatterSaved.every(tab => tab.previewHasBitmap)).toBe(true);
  expect(scatterSaved.map(tab => tab.payloadSignature).filter(Boolean).length).toBe(2);

  const scatterStates = [];
  for (const tab of scatterSaved) {
    scatterStates.push(await collectScatterTabState(page, tab.id));
  }
  const baselineAFirstLabel = String(baseline.scatterA?.firstLabel || '').trim();
  const baselineBFirstLabel = String(baseline.scatterB?.firstLabel || '').trim();
  const matchesLabel = (state, expected, prefix) => {
    if (!state) {
      return false;
    }
    const normalizedFirstLabel = String(state.firstLabel || '').trim();
    if (expected) {
      return normalizedFirstLabel === expected;
    }
    return new RegExp(`^${prefix}\\d+`).test(normalizedFirstLabel);
  };
  let scatterA = scatterStates.find(state => matchesLabel(state, baselineAFirstLabel, 'A')) || null;
  let scatterB = scatterStates.find(state => matchesLabel(state, baselineBFirstLabel, 'B')) || null;
  if (!scatterA || !scatterB || scatterA.tabId === scatterB.tabId) {
    scatterA = scatterA || scatterStates.find(state => state.tabId === ids.scatterAId) || scatterStates[0];
    scatterB = scatterStates.find(state => state.tabId !== scatterA.tabId) || scatterStates[1];
  }
  expect(scatterA).toBeTruthy();
  expect(scatterB).toBeTruthy();
  expect(scatterA.tabId).not.toBe(scatterB.tabId);
  expect(scatterA.payloadSignature).toBeTruthy();
  expect(scatterB.payloadSignature).toBeTruthy();
  expect(scatterA.payloadSignature).not.toBe(scatterB.payloadSignature);
  expect(scatterA.rowCount).toBeGreaterThan(20_000);
  expect(scatterB.rowCount).toBeGreaterThan(20_000);
  const restoredFirstLabels = [scatterA, scatterB].map(state => String(state.firstLabel || '').trim());
  if (baseline.scatterA?.firstLabel) {
    expect(restoredFirstLabels).toContain(baseline.scatterA.firstLabel);
  } else {
    expect(restoredFirstLabels.some(label => /^A\d+/.test(label))).toBe(true);
  }
  if (baseline.scatterB?.firstLabel) {
    expect(restoredFirstLabels).toContain(baseline.scatterB.firstLabel);
  } else {
    expect(restoredFirstLabels.some(label => /^B\d+/.test(label))).toBe(true);
  }
  expect(scatterA.renderMode).toMatch(/^canvas/);
  expect(scatterB.renderMode).toMatch(/^canvas/);
  expect(scatterA.canvasCount).toBeGreaterThan(0);
  expect(scatterB.canvasCount).toBeGreaterThan(0);
  expect(scatterA.previewHasCanvasBitmap).toBe(true);
  expect(scatterB.previewHasCanvasBitmap).toBe(true);
  expect(scatterA.previewIsPlaceholder).toBe(false);
  expect(scatterB.previewIsPlaceholder).toBe(false);

  await activateTab(page, boxSaved[0].id);
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#boxPlot svg')).toBeVisible({ timeout: 40_000 });
}

test('mixed heavy scatter tabs + normal tab survive archive reopen with tab isolation and previews', async ({ page }) => {
  test.setTimeout(300_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  const workspace = await buildMixedHeavyWorkspace(page);
  const { archivePath, byteLength } = await captureWorkspaceArchive(page, 'heavy-mixed-reopen');
  expect(byteLength).toBeGreaterThan(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await loadWorkspaceArchiveFromPath(page, archivePath);
  await awaitPostLoadWarmup(page, 'e2e-heavy-mixed-archive-await-warmup');
  await verifyMixedTabsAfterRestore(page, workspace);
  expect(issues.critical).toEqual([]);
});

test('mixed heavy scatter tabs + normal tab survive crash-recovery restore with tab isolation and previews', async ({ page }) => {
  test.setTimeout(300_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  const workspace = await buildMixedHeavyWorkspace(page);
  await seedRecoverySnapshot(page);
  await reloadAndAcceptRecovery(page);
  await awaitPostLoadWarmup(page, 'e2e-heavy-mixed-recovery-await-warmup');
  await verifyMixedTabsAfterRestore(page, workspace);
  expect(issues.critical).toEqual([]);
});
