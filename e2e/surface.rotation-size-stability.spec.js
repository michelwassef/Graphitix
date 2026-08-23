const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

async function readSurfaceFrame(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    const viewBox = svg?.viewBox?.baseVal;
    const rect = svg?.getBoundingClientRect?.();
    const titleRect = svg?.querySelector?.('text[data-graph-title]')?.getBoundingClientRect?.();
    return {
      viewBox: viewBox ? {
        x: viewBox.x,
        y: viewBox.y,
        width: viewBox.width,
        height: viewBox.height
      } : null,
      rect: rect ? { width: rect.width, height: rect.height } : null,
      titleRect: titleRect ? { width: titleRect.width, height: titleRect.height } : null
    };
  });
}

async function resizeSurfaceGraphPanel(page, dx) {
  const handle = page.locator('#surfacePage:not([hidden]) .panel-resizer').first();
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + dx, startY, { steps: 14 });
  await page.mouse.up();
  await page.waitForTimeout(500);
}

async function leaveAndReturnToSurface(page, surfaceTabId) {
  await page.evaluate(async () => {
    const maybe = window.Main?.tabs?.handleAddTabClick?.();
    if (maybe && typeof maybe.then === 'function') await maybe;
  });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${surfaceTabId}"]`).first();
  await expect(tab).toBeVisible();
  await tab.click({ force: true });
  await page.waitForFunction((tabId) => (
    window.Main?.session?.workspaceState?.activeTabId === tabId
  ), surfaceTabId);
  await expect(page.locator('#surfacePage:not([hidden]) #surfaceSvg')).toBeVisible();
  await page.waitForTimeout(350);
}

test('surface rotation keeps the graph viewport and rendered frame stable', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'surfaceLoadExample');
  await page.waitForFunction(() => (
    document.querySelectorAll('#surfacePage:not([hidden]) #surfaceSvg g.surface-faces polygon').length > 0
  ));
  await page.waitForTimeout(100);

  const surfaceTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(surfaceTabId).toBeTruthy();
  await resizeSurfaceGraphPanel(page, -85);
  await leaveAndReturnToSurface(page, surfaceTabId);

  await page.evaluate(() => {
    const sessionApi = window.Main?.session;
    const surface = window.Components?.surface;
    window.__surfaceRotationDirtyReasons = [];
    window.__surfaceDrawReasons = [];
    if(surface && typeof surface.draw === 'function' && !surface.__rotationTestOriginalDraw){
      surface.__rotationTestOriginalDraw = surface.draw;
      surface.draw = function rotationTestDraw(meta = {}){
        window.__surfaceDrawReasons.push(String(meta?.reason || ''));
        return surface.__rotationTestOriginalDraw.apply(this, arguments);
      };
    }
    if(!sessionApi || typeof sessionApi.markTabUserModified !== 'function'){
      return;
    }
    const original = sessionApi.markTabUserModified.bind(sessionApi);
    sessionApi.markTabUserModified = (tabId, reason, meta) => {
      if(reason === 'surface-rotation-change'){
        window.__surfaceRotationDirtyReasons.push({ tabId, reason });
      }
      return original(tabId, reason, meta);
    };
  });

  const svg = page.locator('#surfacePage:not([hidden]) #surfaceSvg').first();
  const box = await svg.boundingBox();
  expect(box).toBeTruthy();
  const before = await readSurfaceFrame(page);
  expect(before.titleRect).toBeTruthy();
  const legendBefore = await page.locator('#surfacePage:not([hidden]) #surfaceSvg g.surface-legend').count();
  expect(legendBefore).toBe(1);
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;

  await svg.dispatchEvent('pointerdown', {
    pointerId: 17,
    clientX: startX,
    clientY: startY,
    bubbles: true
  });
  for (let step = 1; step <= 24; step += 1) {
    await svg.dispatchEvent('pointermove', {
      pointerId: 17,
      clientX: startX + step * 5,
      clientY: startY + step * 1.5,
      bubbles: true
    });
    await page.waitForTimeout(12);
    const during = await readSurfaceFrame(page);
    expect(during.viewBox).toEqual(before.viewBox);
    expect(during.rect.width).toBeCloseTo(before.rect.width, 1);
    expect(during.rect.height).toBeCloseTo(before.rect.height, 1);
    const dirtyCountDuringDrag = await page.evaluate(() => window.__surfaceRotationDirtyReasons?.length || 0);
    expect(dirtyCountDuringDrag).toBe(0);
    await expect(page.locator('#surfacePage:not([hidden]) #surfaceSvg g.surface-layer-legend > g.surface-legend')).toHaveCount(1);
  }
  await svg.dispatchEvent('pointerup', {
    pointerId: 17,
    clientX: startX + 120,
    clientY: startY + 36,
    bubbles: true
  });
  await page.waitForTimeout(100);

  const after = await readSurfaceFrame(page);
  expect(after.viewBox).toEqual(before.viewBox);
  expect(after.rect.width).toBeCloseTo(before.rect.width, 1);
  expect(after.rect.height).toBeCloseTo(before.rect.height, 1);
  expect(after.titleRect.width).toBeCloseTo(before.titleRect.width, 1);
  expect(after.titleRect.height).toBeCloseTo(before.titleRect.height, 1);
  await expect(page.locator('#surfacePage:not([hidden]) #surfaceSvg g.surface-layer-legend > g.surface-legend')).toHaveCount(1);
  const interactionResults = await page.evaluate(() => ({
    dirtyReasons: window.__surfaceRotationDirtyReasons || [],
    drawReasons: window.__surfaceDrawReasons || []
  }));
  expect(interactionResults.dirtyReasons).toHaveLength(1);
  expect(interactionResults.dirtyReasons[0].reason).toBe('surface-rotation-change');
  expect(interactionResults.drawReasons).not.toContain('rotation-settle');
  expect(interactionResults.drawReasons).not.toContain('graph-edit-drag-live-redraw');
  expect(interactionResults.drawReasons).not.toContain('graph-edit-click-live-redraw');
  expect(issues.critical).toEqual([]);
});
