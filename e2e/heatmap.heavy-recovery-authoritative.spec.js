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

async function clearRecoverySnapshot(page) {
  const dismissUnexpectedRecovery = async dialog => {
    await dialog.dismiss();
  };
  page.on('dialog', dismissUnexpectedRecovery);
  try {
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);
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

function buildHeavyHeatmapTsv(rows = 180, columns = 90) {
  const header = ['Row labels'];
  for (let column = 1; column <= columns; column += 1) {
    header.push(`Sample ${column}`);
  }
  const lines = [header.join('\t')];
  for (let row = 1; row <= rows; row += 1) {
    const values = [`Gene ${row}`];
    for (let column = 1; column <= columns; column += 1) {
      values.push(String(Number((Math.sin(row * 0.17) + Math.cos(column * 0.11) + ((row * column) % 13) / 13).toFixed(5))));
    }
    lines.push(values.join('\t'));
  }
  return lines.join('\n');
}

async function installHeavyHeatmap(page) {
  await page.waitForFunction(() => !!window.Components?.heatmap?.ready && !!window.__LAST_HEATMAP_HOT__);
  await page.locator('#heatmapView').selectOption('values');

  const tsv = buildHeavyHeatmapTsv();
  await page.evaluate(text => {
    const host = document.getElementById('heatmapHot');
    const hot = window.__LAST_HEATMAP_HOT__;
    if (!host || !hot) {
      throw new Error('Heatmap table projection is unavailable.');
    }
    hot.selectCell?.(0, 0, 0, 0);
    const transfer = new DataTransfer();
    transfer.setData('text/plain', text);
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: transfer });
    host.dispatchEvent(pasteEvent);
  }, tsv);

  await page.waitForFunction(() => {
    const tab = window.Main?.session?.getActiveTab?.();
    const stats = window.Components?.heatmap?.__getState?.()?.lastStats;
    return tab?.type === 'heatmap'
      && tab?.payload?.data?.[180]?.[0] === 'Gene 180'
      && stats?.rowCount === 180
      && stats?.columnCount === 90;
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
      reason: 'e2e-heavy-heatmap-recovery',
      idleForMs: 8_000,
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
  await clearRecoverySnapshot(page);
  await openComponentFromWelcome(page, { type: 'heatmap', pageId: 'heatmapPage' }, { first: true });

  await installHeavyHeatmap(page);
  await editHeatmapTitle(page, 'Recovered heavy heatmap');
  await waitForPublishedHeatmap(page);
  await seedRecoverySnapshot(page);
  await reloadAndAcceptRecovery(page);

  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 60_000 });
  await page.evaluate(async () => {
    const warmup = window.Main?.sessionActions?.awaitPostLoadWarmup;
    if (typeof warmup === 'function') {
      await warmup({ timeoutMs: 120_000, reason: 'e2e-heavy-heatmap-recovery-warmup' });
    }
  });
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
