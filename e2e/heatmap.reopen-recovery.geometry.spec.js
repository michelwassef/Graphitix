/**
 * Real-browser geometry parity for the heatmap REOPEN / AUTOSAVE-RECOVERY restore paths.
 *
 * e2e/heatmap.correlation-tab-restore.spec.js already proves geometry parity for
 * tab-switch restore, but the reported "recovering an unsaved heatmap wrecks the graph"
 * bug happens on the recovery/file-reopen path (session reason: 'recovery-restore' /
 * archive load), which rebuilds a fresh per-tab DOM from a serialized snapshot. That path
 * had no rendered-geometry coverage. These specs measure real layout (getBoundingClientRect,
 * computed font size, cell/value ratios) before close and after reopen, and assert they match.
 *
 * jsdom cannot host this assertion at all: getBoundingClientRect returns 0 and no layout
 * runs, so the distortion is unobservable there. It must be a real-browser test.
 */
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

async function waitForHeatmapCells(page) {
  await page.waitForFunction(() => {
    const cells = document.querySelectorAll('#heatmapSvg [data-export-layer="heatmap-cells"] rect');
    return cells.length >= 9;
  }, null, { timeout: 60_000 });
}

// Identical capture to heatmap.correlation-tab-restore.spec.js so the two paths are
// compared with the same lens.
async function captureHeatmapGeometry(page) {
  return page.evaluate(() => {
    const svgBox = document.querySelector('#heatmapGraphPanel .svgbox');
    const svg = document.getElementById('heatmapSvg');
    const cellsGroup = svg?.querySelector('[data-export-layer="heatmap-cells"]');
    const firstRowLabel = svg?.querySelector('text[data-font-role="rowLabel"]') || null;
    const firstColumnLabel = svg?.querySelector('text[data-font-role="columnLabel"]') || null;
    const firstCellRect = svg?.querySelector('[data-export-layer="heatmap-cells"] rect') || null;
    const firstCellValue = svg?.querySelector('text[data-font-role="cellValue"]') || null;
    const asRect = target => {
      if (!target || typeof target.getBoundingClientRect !== 'function') {
        return null;
      }
      const rect = target.getBoundingClientRect();
      return {
        width: Number(rect.width.toFixed(3)),
        height: Number(rect.height.toFixed(3))
      };
    };
    const readComputedFontPx = node => {
      if (!node || typeof getComputedStyle !== 'function') {
        return NaN;
      }
      const raw = getComputedStyle(node).fontSize;
      const numeric = Number.parseFloat(String(raw || '').trim());
      return Number.isFinite(numeric) ? Number(numeric.toFixed(3)) : NaN;
    };
    const firstCellRectBounds = firstCellRect?.getBoundingClientRect?.() || null;
    const firstCellValueBounds = firstCellValue?.getBoundingClientRect?.() || null;
    const cellValueToCellHeightRatio = (
      firstCellRectBounds
      && firstCellValueBounds
      && Number.isFinite(firstCellRectBounds.height)
      && firstCellRectBounds.height > 0
      && Number.isFinite(firstCellValueBounds.height)
    )
      ? Number((firstCellValueBounds.height / firstCellRectBounds.height).toFixed(4))
      : NaN;
    const dataset = svgBox?.dataset || null;
    return {
      svgBox: asRect(svgBox),
      svg: asRect(svg),
      cells: asRect(cellsGroup),
      rowLabelRect: asRect(firstRowLabel),
      columnLabelRect: asRect(firstColumnLabel),
      cellRect: asRect(firstCellRect),
      cellValueRect: asRect(firstCellValue),
      rowLabelFontPx: readComputedFontPx(firstRowLabel),
      columnLabelFontPx: readComputedFontPx(firstColumnLabel),
      cellValueFontPx: readComputedFontPx(firstCellValue),
      cellValueToCellHeightRatio,
      viewBox: svg?.getAttribute('viewBox') || '',
      preserveAspectRatio: svg?.getAttribute('preserveAspectRatio') || '',
      graphAspectRatio: svgBox?.style?.getPropertyValue('--graph-aspect-ratio') || '',
      styleAspectRatio: svgBox?.style?.aspectRatio || '',
      datasetAspectRatio: dataset?.resizerAspectRatio || '',
      aspectLocked: dataset?.resizerAspectLocked || '',
      defaultWidth: dataset?.resizerDefaultWidth || '',
      defaultHeight: dataset?.resizerDefaultHeight || ''
    };
  });
}

function expectNear(actual, expected, tolerance, label) {
  expect(Number.isFinite(actual), `${label}: actual is not finite (${actual})`).toBe(true);
  expect(Number.isFinite(expected), `${label}: expected is not finite (${expected})`).toBe(true);
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tolerance);
}

function expectHeatmapVisualInvariants(restored, initial) {
  expect(restored.aspectLocked).toBe('true');
  expect(restored.preserveAspectRatio).toBe('xMidYMid meet');
  expect(Math.abs(restored.svgBox.width - initial.svgBox.width)).toBeLessThan(2);
  expect(Math.abs(restored.svgBox.height - initial.svgBox.height)).toBeLessThan(2);
  expect(Math.abs(restored.svg.width - initial.svg.width)).toBeLessThan(2);
  expect(Math.abs(restored.svg.height - initial.svg.height)).toBeLessThan(2);
  expectNear(restored.rowLabelFontPx, initial.rowLabelFontPx, 0.7, 'row-label font size');
  expectNear(restored.columnLabelFontPx, initial.columnLabelFontPx, 0.7, 'column-label font size');
  expectNear(restored.cellValueFontPx, initial.cellValueFontPx, 0.7, 'cell-value font size');
  expectNear(restored.rowLabelRect.height, initial.rowLabelRect.height, 2, 'row-label rendered height');
  expectNear(restored.columnLabelRect.width, initial.columnLabelRect.width, 2, 'column-label rendered width');
  expectNear(restored.cellRect.height, initial.cellRect.height, 2, 'cell rect height');
  expectNear(restored.cellValueRect.height, initial.cellValueRect.height, 2, 'cell value rendered height');
  expectNear(
    restored.cellValueToCellHeightRatio,
    initial.cellValueToCellHeightRatio,
    0.08,
    'cell value / cell height ratio'
  );
}

async function dragSvgBoxHandle(page, handleSelector, dx, dy) {
  const handle = page.locator(`#heatmapPage:not([hidden]) .svgbox ${handleSelector}`).first();
  await expect(handle).toHaveCount(1);
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  if (!box) {
    throw new Error(`Missing handle bounding box for ${handleSelector}`);
  }
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY + dy, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function buildCorrelationHeatmap(page, { resize = false } = {}) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await waitForHeatmapCells(page);
  await page.waitForTimeout(900);
  if (resize) {
    // Enlarge the graph well beyond the default square so a failure to restore the
    // manual resizer dimensions becomes a visible size/geometry divergence on reopen.
    await dragSvgBoxHandle(page, '.resizer-horizontal', 0, 150);
    await waitForHeatmapCells(page);
    await page.waitForTimeout(500);
  }
  const initial = await captureHeatmapGeometry(page);
  expect(initial.aspectLocked).toBe('true');
  expect(initial.preserveAspectRatio).toBe('xMidYMid meet');
  return initial;
}

async function captureWorkspaceArchive(page, fileStem) {
  const archive = await page.evaluate(async (stem) => {
    const tabsApi = window.Main?.tabs;
    const sessionActions = window.Main?.sessionActions;
    const context = tabsApi.getSessionActionsContext();
    const blob = await sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-heatmap-reopen-archive'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunk = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return { fileName: `${stem}.graph`, base64: btoa(binary), byteLength: bytes.length };
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

async function awaitPostLoadWarmup(page, reason) {
  await page.evaluate(async (reasonText) => {
    const sessionActions = window.Main?.sessionActions;
    if (!sessionActions || typeof sessionActions.awaitPostLoadWarmup !== 'function') {
      return;
    }
    await sessionActions.awaitPostLoadWarmup({ timeoutMs: 90_000, reason: reasonText });
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

test('Heatmap correlation geometry survives file reopen (archive load)', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  const initial = await buildCorrelationHeatmap(page, { resize: true });
  const { byteLength, archivePath } = await captureWorkspaceArchive(page, 'heatmap-reopen-geometry');
  expect(byteLength).toBeGreaterThan(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await loadWorkspaceArchiveFromPath(page, archivePath);
  await awaitPostLoadWarmup(page, 'e2e-heatmap-reopen-archive-warmup');
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 30_000 });
  await waitForHeatmapCells(page);
  await page.waitForTimeout(900);

  const restored = await captureHeatmapGeometry(page);
  expectHeatmapVisualInvariants(restored, initial);
  expect(issues.critical).toEqual([]);
});

async function activateWelcomeOrNewTab(page) {
  // Reproduce the user's flow: leave the heatmap tab in the background by making a
  // non-graph (Welcome/selection) tab active before reload, so recovery restores the
  // heatmap while it is hidden.
  const switched = await page.evaluate(async () => {
    const tabsApi = window.Main?.tabs;
    const state = window.Main?.session?.workspaceState;
    const welcome = Array.isArray(state?.tabs)
      ? state.tabs.find(tab => tab && (tab.isWelcome || !tab.type))
      : null;
    if (welcome && typeof tabsApi?.activateTab === 'function') {
      const maybe = tabsApi.activateTab(welcome.id, { reason: 'e2e-switch-to-welcome' });
      if (maybe && typeof maybe.then === 'function') { await maybe; }
      return { via: 'existing-welcome', id: welcome.id };
    }
    // No standalone welcome tab: open a fresh selection tab and leave it active.
    if (typeof tabsApi?.handleAddTabClick === 'function') {
      const maybe = tabsApi.handleAddTabClick();
      if (maybe && typeof maybe.then === 'function') { await maybe; }
      return { via: 'add-tab', id: window.Main?.session?.workspaceState?.activeTabId || null };
    }
    return { via: 'none', id: null };
  });
  await page.waitForTimeout(400);
  return switched;
}

async function activateHeatmapTab(page) {
  await page.evaluate(async () => {
    const tabsApi = window.Main?.tabs;
    const state = window.Main?.session?.workspaceState;
    const heatmapTab = Array.isArray(state?.tabs)
      ? state.tabs.find(tab => tab && tab.type === 'heatmap')
      : null;
    if (heatmapTab && typeof tabsApi?.activateTab === 'function') {
      const maybe = tabsApi.activateTab(heatmapTab.id, { reason: 'e2e-activate-heatmap-after-recovery' });
      if (maybe && typeof maybe.then === 'function') { await maybe; }
    }
  });
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 30_000 });
}

test('Heatmap correlation geometry survives recovery while restored in the background (Welcome active)', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  const initial = await buildCorrelationHeatmap(page);
  await activateWelcomeOrNewTab(page);
  await seedRecoverySnapshot(page);
  await reloadAndAcceptRecovery(page);
  await awaitPostLoadWarmup(page, 'e2e-heatmap-bg-recovery-warmup');
  await activateHeatmapTab(page);
  await waitForHeatmapCells(page);
  await page.waitForTimeout(1200);

  const restored = await captureHeatmapGeometry(page);
  expectHeatmapVisualInvariants(restored, initial);
  expect(issues.critical).toEqual([]);
});

test('Heatmap correlation geometry survives crash-recovery restore', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  const initial = await buildCorrelationHeatmap(page, { resize: true });
  await seedRecoverySnapshot(page);
  await reloadAndAcceptRecovery(page);
  await awaitPostLoadWarmup(page, 'e2e-heatmap-recovery-warmup');
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 30_000 });
  await waitForHeatmapCells(page);
  await page.waitForTimeout(900);

  const restored = await captureHeatmapGeometry(page);
  expectHeatmapVisualInvariants(restored, initial);
  expect(issues.critical).toEqual([]);
});
