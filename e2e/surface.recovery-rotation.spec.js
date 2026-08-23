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
    const workspace = window.Main?.session?.workspaceState || null;
    return !!svg
      && svg.querySelectorAll('g.surface-faces polygon').length > 0
      && window.Components?.surface?.isIdleForSnapshot?.({ tabId: workspace?.activeTabId }) === true;
  }, null, { timeout: 30_000 });
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
}


async function waitForSurfaceRotationSettled(page) {
  await page.waitForFunction(() => {
    const workspace = window.Main?.session?.workspaceState || null;
    const active = workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId) || null;
    const session = active?.type === 'surface'
      ? window.Components?.surface?.__testHooks?.getSession?.(active.id)
      : null;
    return !!session
      && session.timers?.rotationActive !== true
      && session.timers?.rotationPending === false
      && session.timers?.rotationFrameId == null;
  }, null, { timeout: 30_000 });
}

async function waitForSurfaceRenderCache(page) {
  await page.waitForFunction(() => {
    const workspace = window.Main?.session?.workspaceState || null;
    const active = workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId) || null;
    return active?.type === 'surface' && !!(active.renderCache || active.archiveRenderCache);
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
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      reason: 'recovery-interval',
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

async function readSurfaceLegendState(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    const legend = svg?.querySelector?.('g.surface-legend') || null;
    const session = window.Components?.surface?.__testHooks?.getSession?.(
      window.Main?.session?.workspaceState?.activeTabId || null
    );
    return {
      transform: legend?.getAttribute?.('transform') || null,
      position: session?.state?.labelPositions?.legend || null
    };
  });
}

async function dragSurfaceLegend(page) {
  const legend = page.locator('#surfacePage:not([hidden]) #surfaceSvg g.surface-legend').first();
  const box = await legend.boundingBox();
  expect(box).toBeTruthy();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 30, startY + 20, { steps: 8 });
  await page.mouse.up();
}

async function activateWorkspaceTab(page, tabId, type, pageId) {
  await page.evaluate(async id => {
    const result = window.Main?.tabs?.activateTab?.(id, { reason: 'e2e-surface-multi-3d-activate' });
    if (result && typeof result.then === 'function') {
      await result;
    }
  }, tabId);
  await page.waitForFunction(({ id, componentType, componentPageId }) => {
    const state = window.Main?.session?.workspaceState || null;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    return active?.id === id
      && active?.type === componentType
      && !!document.querySelector(`#${componentPageId}:not([hidden])`);
  }, { id: tabId, componentType: type, componentPageId: pageId }, { timeout: 30_000 });
}

async function openPca3dTab(page) {
  await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample' });
  await clickExampleButtonIfPresent(page, 'pcaLoadExample');
  await page.locator('#pcaPage:not([hidden]) #pcaViewMode').selectOption('3d');
  await clickExampleButtonIfPresent(page, 'pcaLoadExample');
  await page.waitForFunction(() => {
    const svg = document.querySelector('#pcaPage:not([hidden]) #pcaSvg');
    return !!svg && svg.dataset?.viewMode === '3d' && svg.dataset?.rotationControlsAttached === 'true';
  }, null, { timeout: 30_000 });
}

async function openScatter3dTab(page) {
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' });
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');
  await page.locator('#scatterPage:not([hidden]) #scatterViewMode').selectOption('3d');
  await clickExampleButtonIfPresent(page, 'scatterLoadExample');
  await page.waitForFunction(() => {
    const svg = document.querySelector('#scatterPage:not([hidden]) #scatterSvg');
    return !!svg && svg.dataset?.viewMode === '3d' && svg.dataset?.rotationControlsAttached === 'true';
  }, null, { timeout: 30_000 });
}

async function surfaceOwnerGeometry(page) {
  return page.evaluate(() => {
    const workspace = window.Main?.session?.workspaceState || null;
    const active = workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId) || null;
    const session = active?.type === 'surface'
      ? window.Components?.surface?.__testHooks?.getSession?.(active.id)
      : null;
    const root = active
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'surface')
      : null;
    const svg = root?.querySelector?.('#surfaceSvg') || null;
    const faceGroups = svg ? Array.from(svg.querySelectorAll('g.surface-faces')) : [];
    const visibleFaces = faceGroups.flatMap(group => Array.from(group.querySelectorAll('polygon'))).filter(node => {
      const style = window.getComputedStyle(node);
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
    });
    return {
      activeTabId: active?.id || null,
      activeType: active?.type || null,
      ownerTabId: session?.tabId || null,
      ownsSvg: !!svg && session?.refs?.svg === svg,
      hasRotationRenderer: typeof session?.refs?.rotationRenderer === 'function',
      hasRotationControl: !!svg?.__plot3dRotationControl,
      faceGroupCount: faceGroups.length,
      visibleFaceCount: visibleFaces.length,
      modelFaceCount: Array.isArray(session?.cache?.rotationModel?.faces)
        ? session.cache.rotationModel.faces.length
        : 0,
      poolFaceCount: Array.isArray(session?.refs?.facePool) ? session.refs.facePool.length : 0,
      rotation: session?.state?.rotation ? {
        x: Number(session.state.rotation.x) || 0,
        y: Number(session.state.rotation.y) || 0,
        z: Number(session.state.rotation.z) || 0
      } : null
    };
  });
}

async function surfaceGeometry(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    const rotation = window.Components?.surface?.__getState?.()?.rotation || null;
    const surfaceTab = window.Main?.session?.workspaceState?.tabs?.find(tab => tab?.type === 'surface') || null;
    const viewBox = svg?.viewBox?.baseVal;
    const hitSurface = svg?.querySelector?.('[data-plot3d-rotation-hit-surface="1"]') || null;
    const legend = svg?.querySelector?.('g.surface-legend') || null;
    const hitSurfaceDisplay = hitSurface?.style?.display || '';
    const legendDisplay = legend?.style?.display || '';
    if(hitSurface?.style) hitSurface.style.display = 'none';
    if(legend?.style) legend.style.display = 'none';
    const bbox = svg?.getBBox?.();
    if(hitSurface?.style) hitSurface.style.display = hitSurfaceDisplay;
    if(legend?.style) legend.style.display = legendDisplay;
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
      hasAuthoritativeRenderRestoreProperty: Object.prototype.hasOwnProperty.call(surfaceTab || {}, ['authoritative', 'Render', 'Restore'].join('')),
      hasRuntimeRenderCache: !!surfaceTab?.renderCache,
      hasArchiveRenderCache: !!surfaceTab?.archiveRenderCache,
      hasAnyRenderCache: !!(surfaceTab?.renderCache || surfaceTab?.archiveRenderCache)
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

test('recovered surface scale drag and 3D rotation remain live and stable', async ({ page }) => {
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
  expect(before.hasAuthoritativeRenderRestoreProperty).toBe(false);
  expect(before.hasAnyRenderCache).toBe(true);
  expect(before.rotationControlsAttached).toBe('true');
  expect(before.hasRotationControl).toBe(true);
  expectBBoxInsideViewBox(before);

  const legendBefore = await readSurfaceLegendState(page);
  await dragSurfaceLegend(page);
  const legendAfter = await readSurfaceLegendState(page);
  expect(legendAfter.transform).not.toBe(legendBefore.transform);
  expect(legendAfter.position).toBeTruthy();

  await dragSurface(page);
  await waitForSurfaceRotationSettled(page);
  await waitForSurfaceRenderCache(page);

  const after = await surfaceGeometry(page);
  expect(after.rotationControlsAttached).toBe('true');
  expect(after.hasRotationControl).toBe(true);
  expect(after.hasAnyRenderCache).toBe(true);
  expect(after.rotation.y).not.toBeCloseTo(before.rotation.y, 4);
  expect(after.viewBox).toEqual(before.viewBox);
  expectBBoxInsideViewBox(after);
  expect(issues.all.some(entry => /graph-edit-drag/i.test(entry.text || ''))).toBe(false);
  expect(issues.critical).toEqual([]);
});


test('recovered Surface rotation remains owner-scoped with PCA and Scatter 3D siblings', async ({ page }) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await clearRecoverySnapshot(page);

  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'surfaceLoadExample');
  await waitForSurfaceDraw(page);
  const surfaceTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(surfaceTabId).toBeTruthy();

  await openPca3dTab(page);
  await openScatter3dTab(page);
  await activateWorkspaceTab(page, surfaceTabId, 'surface', 'surfacePage');
  await waitForSurfaceDraw(page);

  await seedRecoverySnapshot(page);
  await reloadAndAcceptRecovery(page);
  await page.waitForFunction(() => {
    const workspace = window.Main?.session?.workspaceState || null;
    const active = workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId) || null;
    const session = active?.type === 'surface'
      ? window.Components?.surface?.__testHooks?.getSession?.(active.id)
      : null;
    const root = active
      ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, 'surface')
      : null;
    const svg = root?.querySelector?.('#surfaceSvg') || null;
    return active?.type === 'surface'
      && session?.refs?.svg === svg
      && typeof session?.refs?.rotationRenderer === 'function'
      && Array.isArray(session?.cache?.rotationModel?.faces)
      && session.cache.rotationModel.faces.length > 0;
  }, null, { timeout: 60_000 });

  const before = await surfaceOwnerGeometry(page);
  expect(before.activeType).toBe('surface');
  expect(before.ownerTabId).toBe(before.activeTabId);
  expect(before.ownsSvg).toBe(true);
  expect(before.hasRotationRenderer).toBe(true);
  expect(before.hasRotationControl).toBe(true);
  expect(before.faceGroupCount).toBe(1);
  expect(before.modelFaceCount).toBeGreaterThan(0);
  expect(before.visibleFaceCount).toBe(before.modelFaceCount);
  expect(before.poolFaceCount).toBeGreaterThanOrEqual(before.modelFaceCount);

  await dragSurface(page);
  await page.waitForFunction(() => {
    const workspace = window.Main?.session?.workspaceState || null;
    const active = workspace?.tabs?.find(tab => tab?.id === workspace.activeTabId) || null;
    const session = active?.type === 'surface'
      ? window.Components?.surface?.__testHooks?.getSession?.(active.id)
      : null;
    return session?.timers?.rotationPending === false
      && session?.timers?.rotationFrameId == null;
  }, null, { timeout: 30_000 });

  const after = await surfaceOwnerGeometry(page);
  expect(after.ownerTabId).toBe(after.activeTabId);
  expect(after.ownsSvg).toBe(true);
  expect(after.hasRotationRenderer).toBe(true);
  expect(after.faceGroupCount).toBe(1);
  expect(after.visibleFaceCount).toBe(after.modelFaceCount);
  expect(after.rotation?.y).not.toBeCloseTo(before.rotation?.y, 4);
  expect(issues.all.some(entry => /workspace-post-restore-fallback-failed|graph-edit-drag/i.test(entry.text || ''))).toBe(false);
  expect(issues.critical).toEqual([]);
});
