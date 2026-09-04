const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function waitForPublishedHeatmap(page) {
  await page.waitForFunction(() => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    if (!svg || svg.getAttribute('data-heatmap-render-complete') !== 'true') {
      return false;
    }
    const layer = svg.querySelector('[data-export-layer="heatmap-cells"]');
    if (!layer) {
      return false;
    }
    const rectCount = layer.querySelectorAll('rect').length;
    const canvas = layer.querySelector('canvas');
    return rectCount > 0 || !!(canvas && canvas.width > 0 && canvas.height > 0);
  }, null, { timeout: 90_000 });
}

async function installHeavyHeatmap(page) {
  const installResult = await page.evaluate(async () => {
    const component = window.Components?.heatmap;
    const state = window.Main?.session?.workspaceState;
    const tabId = state?.activeTabId;
    const tab = state?.tabs?.find(candidate => candidate?.id === tabId) || null;
    if (!component || !tabId || !tab) {
      throw new Error('Active Heatmap owner is unavailable.');
    }

    const rows = 180;
    const cols = 90;
    const matrix = Array.from({ length: rows + 1 }, (_, rowIndex) => (
      Array.from({ length: cols + 1 }, (_, colIndex) => {
        if (rowIndex === 0 && colIndex === 0) return 'Row labels';
        if (rowIndex === 0) return `Sample ${colIndex}`;
        if (colIndex === 0) return `Gene ${rowIndex}`;
        return Number((Math.sin(rowIndex * 0.17) + Math.cos(colIndex * 0.11) + ((rowIndex * colIndex) % 13) / 13).toFixed(5));
      })
    ));

    const basePayload = component.getPayload?.({ tabId })
      || component.createEmptyPayload?.({ tabId })
      || { type: 'heatmap', config: {} };
    const payload = {
      ...basePayload,
      type: 'heatmap',
      data: matrix,
      config: { ...(basePayload.config || {}) }
    };

    window.Main?.session?.commitTabPayload?.(tabId, payload, {
      reason: 'e2e-heavy-recovery-data',
      affectsPayload: true
    });
    component.loadFromPayload(payload, {
      tabId,
      source: 'e2e-heavy-recovery-install',
      skipDraw: false
    });
    const drawResult = component.draw?.({
      tabId,
      force: true,
      reason: 'e2e-heavy-recovery-install-draw'
    });
    if (drawResult && typeof drawResult.then === 'function') {
      await drawResult;
    }

    window.Main?.session?.markTabUserModified?.(tabId, {
      reason: 'e2e-heavy-recovery-data',
      affectsPayload: true
    });
    await window.Main?.session?.persistActiveTabState?.({
      reason: 'e2e-heavy-recovery-data-persist',
      forcePayloadCapture: true
    });
    return { ok: true };
  });
  expect(installResult?.ok).not.toBe(false);
  await waitForPublishedHeatmap(page);
}

async function editHeatmapTitle(page, value) {
  const title = page.locator('#heatmapPage:not([hidden]) #heatmapSvg text[data-font-role="graphTitle"]').first();
  await expect(title).toBeVisible({ timeout: 30_000 });
  await title.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  await editor.fill(value);
  await editor.press('Enter');
  await expect(page.locator('#heatmapPage:not([hidden]) #heatmapSvg text[data-font-role="graphTitle"]').first()).toHaveText(value);
}

async function seedRecoverySnapshot(page) {
  await page.evaluate(async () => {
    const openDb = () => new Promise((resolve, reject) => {
      const request = indexedDB.open('graphitix-document-state', 2);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('snapshots')) {
          request.result.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });

    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      reason: 'e2e-heavy-heatmap-recovery',
      useWorker: true
    });
    const tabs = window.Main.session.workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type);
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
        meta: {
          app: 'Graphitix',
          kind: 'recovery',
          version: 1,
          savedAt: new Date().toISOString(),
          updatedAt: Date.now(),
          reason: 'e2e-heavy-heatmap-recovery',
          dirty: true,
          hasData: true,
          tabCount: tabs.length,
          fileName: 'workspace.graph',
          fileScope: 'workspace'
        },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB recovery write failed.'));
    });
  });
}

async function reloadAndAcceptRecovery(page) {
  let accepted = false;
  const handler = async dialog => {
    accepted = true;
    await dialog.accept();
  };
  page.on('dialog', handler);
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
  } finally {
    page.off('dialog', handler);
  }
  expect(accepted, 'Recovery prompt should be accepted.').toBe(true);
}

test('heavy Heatmap publishes one complete graph after crash recovery', async ({ page }) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'heatmap', pageId: 'heatmapPage' }, { first: true });

  await installHeavyHeatmap(page);
  await editHeatmapTitle(page, 'Recovered heavy heatmap');
  await waitForPublishedHeatmap(page);
  await seedRecoverySnapshot(page);
  await reloadAndAcceptRecovery(page);

  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 60_000 });
  await waitForPublishedHeatmap(page);

  const restored = await page.evaluate(() => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    const layer = svg?.querySelector('[data-export-layer="heatmap-cells"]');
    return {
      complete: svg?.getAttribute('data-heatmap-render-complete') || null,
      title: svg?.querySelector('text[data-font-role="graphTitle"]')?.textContent || '',
      rectCount: layer?.querySelectorAll('rect').length || 0,
      canvasCount: layer?.querySelectorAll('canvas').length || 0,
      activationError: window.Main?.session?.workspaceState?.tabs?.find(tab => tab?.type === 'heatmap')?.activationError || null
    };
  });

  expect(restored.complete).toBe('true');
  expect(restored.title).toBe('Recovered heavy heatmap');
  expect(restored.rectCount + restored.canvasCount).toBeGreaterThan(0);
  expect(restored.activationError).toBeNull();
  expect(issues.critical).toEqual([]);
});
