const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

async function waitForSurfaceDraw(page) {
  await page.waitForFunction(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    return !!svg && svg.querySelectorAll('g.surface-faces polygon').length > 0;
  }, null, { timeout: 30_000 });
}

async function clearRecoverySnapshot(page) {
  await page.evaluate(async () => {
    const request = window.indexedDB.open('graphitix-document-state', 1);
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        const opened = request.result;
        if (!opened.objectStoreNames.contains('snapshots')) {
          opened.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });
    await new Promise(resolve => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').delete('active-recovery');
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    db.close();
  });
}

async function seedRecoverySnapshot(page) {
  await page.evaluate(async () => {
    const request = window.indexedDB.open('graphitix-document-state', 1);
    const db = await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        const opened = request.result;
        if (!opened.objectStoreNames.contains('snapshots')) {
          opened.createObjectStore('snapshots');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed.'));
    });
    const workspaceState = window.Main?.session?.workspaceState || {};
    const graphTabs = Array.isArray(workspaceState.tabs)
      ? workspaceState.tabs.filter(tab => tab && !tab.isWelcome && tab.type)
      : [];
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'lifecycle-checkpoint',
      policyMode: 'recovery',
      reason: 'recovery-interval',
      idleForMs: 8_000,
      useWorker: true
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').put({
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
          fileScope: workspaceState.sessionFileScope || 'workspace'
        },
        blob
      }, 'active-recovery');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB recovery write failed.'));
    });
    db.close();
  });
}

async function reloadAndAcceptRecovery(page) {
  page.on('dialog', async dialog => {
    await dialog.accept();
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#surfacePage:not([hidden])', { timeout: 30_000 });
  await waitForSurfaceDraw(page);
}

async function dragSurface(page) {
  const svg = page.locator('#surfacePage:not([hidden]) #surfaceSvg').first();
  const box = await svg.boundingBox();
  expect(box).toBeTruthy();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await svg.dispatchEvent('pointerdown', { pointerId: 1, clientX: startX, clientY: startY, bubbles: true });
  await svg.dispatchEvent('pointermove', { pointerId: 1, clientX: startX + 110, clientY: startY + 35, bubbles: true });
  await svg.dispatchEvent('pointerup', { pointerId: 1, clientX: startX + 110, clientY: startY + 35, bubbles: true });
}

async function surfaceGeometry(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    const rotation = window.Components?.surface?.__getState?.()?.rotation || null;
    const surfaceTab = window.Main?.session?.workspaceState?.tabs?.find(tab => tab?.type === 'surface') || null;
    const viewBox = svg?.viewBox?.baseVal;
    const bbox = svg?.getBBox?.();
    return {
      rotation: rotation ? {
        x: rotation.x,
        y: rotation.y,
        z: rotation.z
      } : null,
      viewBox: viewBox ? {
        x: viewBox.x,
        y: viewBox.y,
        width: viewBox.width,
        height: viewBox.height
      } : null,
      bbox: bbox ? {
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height
      } : null,
      rotationControlsAttached: svg?.dataset?.rotationControlsAttached || null,
      hasRotationControl: !!svg?.__plot3dRotationControl,
      authoritativeRenderRestore: !!surfaceTab?.authoritativeRenderRestore,
      hasArchiveRenderCache: !!surfaceTab?.archiveRenderCache
    };
  });
}

function expectBBoxInsideViewBox(geometry) {
  const { bbox, viewBox } = geometry;
  expect(bbox).toBeTruthy();
  expect(viewBox).toBeTruthy();
  const tolerance = 1.5;
  expect(bbox.x).toBeGreaterThanOrEqual(viewBox.x - tolerance);
  expect(bbox.y).toBeGreaterThanOrEqual(viewBox.y - tolerance);
  expect(bbox.x + bbox.width).toBeLessThanOrEqual(viewBox.x + viewBox.width + tolerance);
  expect(bbox.y + bbox.height).toBeLessThanOrEqual(viewBox.y + viewBox.height + tolerance);
}

test('recovered surface graph remains live and fitted after 3D rotation', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await clearRecoverySnapshot(page);
  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'surfaceLoadExample');
  await waitForSurfaceDraw(page);

  await seedRecoverySnapshot(page);
  await reloadAndAcceptRecovery(page);

  const before = await surfaceGeometry(page);
  expect(before.authoritativeRenderRestore).toBe(false);
  expect(before.hasArchiveRenderCache).toBe(false);
  expect(before.rotationControlsAttached).toBe('true');
  expect(before.hasRotationControl).toBe(true);
  expectBBoxInsideViewBox(before);

  await dragSurface(page);
  await waitForSurfaceDraw(page);

  const after = await surfaceGeometry(page);
  expect(after.rotationControlsAttached).toBe('true');
  expect(after.hasRotationControl).toBe(true);
  expect(after.rotation.y).not.toBeCloseTo(before.rotation.y, 4);
  expectBBoxInsideViewBox(after);
  expect(issues.critical).toEqual([]);
});
