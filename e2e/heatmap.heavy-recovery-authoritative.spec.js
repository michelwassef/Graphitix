const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const LARGE_VALUES_CSV = path.resolve(__dirname, '..', '__tests__', 'test-scatter-medium.csv');

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

async function clearRecoverySnapshot(page) {
  const dismissUnexpectedRecovery = async dialog => {
    await dialog.dismiss();
  };
  page.on('dialog', dismissUnexpectedRecovery);
  try {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  } finally {
    page.off('dialog', dismissUnexpectedRecovery);
  }

  await page.evaluate(async () => {
    await new Promise(resolve => {
      const request = indexedDB.open('graphitix-document-state', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('snapshots')) {
          request.result.createObjectStore('snapshots');
        }
      };
      request.onerror = () => resolve();
      request.onsuccess = () => {
        try {
          const db = request.result;
          const transaction = db.transaction('snapshots', 'readwrite');
          transaction.objectStore('snapshots').delete('active-recovery');
          transaction.oncomplete = () => {
            db.close();
            resolve();
          };
          transaction.onerror = () => {
            db.close();
            resolve();
          };
        } catch (_error) {
          resolve();
        }
      };
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function installHeavyHeatmap(page) {
  await page.waitForFunction(() => !!window.Components?.heatmap?.ready && !!window.__LAST_HEATMAP_HOT__);
  await page.locator('#heatmapView').selectOption('values');
  await page.locator('#heatmapFile').evaluate(input => {
    input.dataset.importOptionsConfirmed = 'true';
  });
  await page.locator('#heatmapFile').setInputFiles(LARGE_VALUES_CSV);

  await page.waitForFunction(() => {
    const tab = window.Main?.session?.getActiveTab?.();
    const stats = window.Components?.heatmap?.__getState?.()?.lastStats;
    return tab?.type === 'heatmap'
      && tab?.payload?.data?.[7358]?.[0] === '1'
      && stats?.rowCount === 7358
      && stats?.columnCount === 3;
  }, null, { timeout: 90_000 });
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
      const request = indexedDB.open('graphitix-document-state', 1);
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
      captureRenderCacheBeforeSnapshot: false,
      reason: 'e2e-heavy-heatmap-recovery-no-cache',
      idleForMs: 8_000,
      useWorker: true
    });
    const parsed = await window.Shared.graphArchive.parseFile(blob, { fileName: 'recovery.graph' });
    const recoveredHeatmap = parsed?.session?.tabs?.find(tab => tab?.type === 'heatmap');
    if (!recoveredHeatmap || recoveredHeatmap.archiveRenderCache) {
      throw new Error('Recovery fixture must contain authoritative Heatmap payload without a render cache.');
    }
    if (!recoveredHeatmap.payload?.renderModelCache?.model) {
      throw new Error('Recovery fixture must persist the completed Heatmap render model.');
    }
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
          reason: 'e2e-heavy-heatmap-recovery-no-cache',
          dirty: true,
          hasData: true,
          tabCount: tabs.length,
          fileName: 'workspace.graph',
          fileScope: 'workspace'
        },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('IndexedDB recovery write failed.'));
      };
    });
  });
}

async function reloadAndAcceptRecovery(page) {
  await page.addInitScript(() => {
    window.__heatmapRecoveryOverlaySeen = false;
    const observe = () => {
      const overlay = document.querySelector('#heatmapGraphPanel .venn-loading-overlay:not([hidden])');
      if (overlay) {
        window.__heatmapRecoveryOverlaySeen = true;
      }
    };
    new MutationObserver(observe).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'data-job-status']
    });
  });
  const handler = async dialog => {
    await dialog.accept();
  };
  page.on('dialog', handler);
  try {
    const recoveryPrompt = page.waitForEvent('dialog', {
      predicate: dialog => dialog.message().includes('Graphitix found recovered changes'),
      timeout: 30_000
    });
    await Promise.all([
      page.reload({ waitUntil: 'domcontentloaded' }),
      recoveryPrompt
    ]);
  } finally {
    page.off('dialog', handler);
  }
}

test('heavy Heatmap publishes one complete graph after crash recovery', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const issues = registerIssueCollectors(page);
  const readinessTimeouts = [];
  page.on('console', message => {
    const text = message.text();
    if (text.includes('workspace restore readiness timed out') || text.includes('workspace async step timed out')) {
      readinessTimeouts.push(text);
    }
  });
  await installLocalCdnOverrides(page);
  await clearRecoverySnapshot(page);
  await openComponentFromWelcome(page, { type: 'heatmap', pageId: 'heatmapPage' }, { first: true });

  await installHeavyHeatmap(page);
  const initialPerformance = await page.evaluate(() => ({
    draw: window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw || null,
    workers: window.Components?.heatmap?.__testHooks?.getWorkerRecords?.() || []
  }));
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
      overlaySeen: window.__heatmapRecoveryOverlaySeen === true,
      activationError: window.Main?.session?.workspaceState?.tabs?.find(tab => tab?.type === 'heatmap')?.activationError || null
    };
  });
  const recoveryPerformance = await page.evaluate(() => ({
    draw: window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw || null,
    workers: window.Components?.heatmap?.__testHooks?.getWorkerRecords?.() || [],
    lifecycleEvents: (window.Shared?.componentLifecycle?.getLifecycleEvents?.() || [])
      .filter(event => event?.componentKey === 'heatmap' && /draw|restore|schedule/i.test(String(event?.action || '')))
  }));
  await testInfo.attach('heatmap-recovery-performance.json', {
    body: JSON.stringify({ initialPerformance, recoveryPerformance }, null, 2),
    contentType: 'application/json'
  });

  expect(restored.complete).toBe('true');
  expect(restored.title).toBe('Recovered heavy heatmap');
  expect(restored.rectCount + restored.canvasCount).toBeGreaterThan(0);
  expect(restored.overlaySeen).toBe(true);
  expect(restored.activationError).toBeNull();
  expect(recoveryPerformance.draw?.renderModelCacheReused).toBe(true);
  expect(recoveryPerformance.workers).toEqual([]);
  expect(recoveryPerformance.draw?.totalMs).toBeLessThan(initialPerformance.draw?.totalMs);
  expect(recoveryPerformance.lifecycleEvents.filter(event => event.action === 'draw-executed')).toEqual([
    expect.objectContaining({ reason: 'workspace-draw-fallback' })
  ]);
  expect(readinessTimeouts).toEqual([]);
  expect(issues.critical).toEqual([]);
});
