const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');

async function activeSurfaceTabId(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState || {};
    const active = (state.tabs || []).find(tab => tab && tab.id === state.activeTabId) || null;
    return active?.type === 'surface' ? String(active.id || '') : '';
  });
}

async function activateTab(page, tabId) {
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabId}"]`).first();
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click({ force: true });
  await page.waitForFunction(
    id => window.Main?.session?.workspaceState?.activeTabId === id,
    tabId,
    { timeout: 20_000 }
  );
  await page.waitForSelector('#surfacePage:not([hidden])', { timeout: 20_000 });
}

async function openSurfaceTab(page, { first = false } = {}) {
  const before = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || ''))
  );
  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first });
  await page.waitForFunction(() => !!window.Components?.surface?.ready, null, { timeout: 35_000 });
  const after = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || ''))
  );
  return after.find(id => id && !before.includes(id)) || await activeSurfaceTabId(page);
}

function buildGridSurfaceData(size, offset = 0) {
  const rows = [['X', 'Y', 'Z']];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const z = Math.sin((x + offset) / 3) + Math.cos((y - offset) / 4);
      rows.push([x, y, Number(z.toFixed(4))]);
    }
  }
  return rows;
}

function buildLargeSurfaceData(count) {
  const rows = [['X', 'Y', 'Z']];
  for (let i = 0; i < count; i += 1) {
    const x = i % 101;
    const y = Math.floor(i / 101);
    rows.push([x, y, Number((Math.sin(i / 17) + Math.cos(i / 29)).toFixed(4))]);
  }
  return rows;
}

async function persistConfiguredSurfaceOwner(page, reason, expectedTitle) {
  await page.evaluate(async ({ persistReason, expectedTitle: expected }) => {
    const state = window.Main?.session?.workspaceState || {};
    const tab = (state.tabs || []).find(item => item && item.id === state.activeTabId) || null;
    if (!tab || tab.type !== 'surface') {
      throw new Error('active tab is not surface');
    }
    const result = window.Main?.session?.persistActiveTabState?.(tab, {
      reason: persistReason,
      origin: 'user',
      forcePreviewCapture: false,
      snapshotIntent: {
        lifecycleSnapshot: true,
        captureLivePayload: true,
        allowSkipLivePayloadCapture: false,
        reasonSkippable: false,
        snapshotCapture: true
      }
    });
    if (result && typeof result.then === 'function') {
      await result;
    }
    if (tab.payload?.config?.labels?.title !== expected) {
      throw new Error(`surface synthetic setup was not committed to canonical owner ${tab.id}`);
    }
  }, { persistReason: reason, expectedTitle });
}

async function waitForSurfaceRender(page, pattern = /Surface Plot|Vertices|Faces|Points|Grid/i) {
  await page.waitForFunction(source => {
    const root = document.querySelector('#surfacePage:not([hidden])');
    const svg = root?.querySelector?.('#surfaceSvg') || null;
    const statsText = root?.querySelector?.('#surfaceStatsSummary')?.textContent || '';
    const svgText = svg?.textContent || '';
    const hasMarks = !!svg?.querySelector?.('g.surface-faces polygon, g.surface-points circle');
    return hasMarks && new RegExp(source, 'i').test(`${svgText}\n${statsText}`);
  }, pattern.source || String(pattern), { timeout: 60_000 });
}

async function configureDerivedSettingsTab(page) {
  await page.evaluate(data => {
    const payload = window.Components.surface.createEmptyPayload();
    window.Components.surface.loadFromPayload({
      ...payload,
      type: 'surface',
      data,
      config: {
        ...(payload.config || {}),
        axisMap: { x: 0, y: 1, z: 2 },
        settings: {
          interpolation: 'grid',
          colorRamp: 'plasma',
          fontSize: 14,
          axisStroke: 1.75,
          axisColor: '#663399',
          showGrid: true,
          showFrame: false,
          showPoints: false,
          showLegend: true
        },
        labels: { title: 'Surface A', x: 'Dose', y: 'Time', z: 'Signal' }
      }
    }, { source: 'e2e-surface-derived-settings' });

    const root = document.querySelector('#surfacePage:not([hidden])');
    const wrapper = root?.querySelector?.('#surfaceHotWrapper') || null;
    const manager = wrapper?.__dataViewsOwner || null;
    if (!manager || typeof manager.createDerivedView !== 'function') {
      throw new Error('surface DataViews manager not found');
    }
    const activeData = manager.getActiveView?.()?.data || data;
    const derivedData = activeData.map((row, index) => {
      if (index === 0) return row.slice();
      return [row[0], row[1], Number((Number(row[2]) + 2.25).toFixed(4))];
    });
    const view = manager.createDerivedView({
      title: 'Surface derived A',
      data: derivedData,
      transformSpec: { type: 'e2e-surface-derived-a' },
      activate: true,
      reason: 'e2e-surface-derived-settings'
    });
    if (!view || manager.getActiveView?.()?.title !== 'Surface derived A') {
      throw new Error('surface derived view did not become active');
    }
    window.Components.surface.draw({ reason: 'e2e-surface-derived-settings' });
  }, buildGridSurfaceData(13, 1));
  await waitForSurfaceRender(page, /Surface A|Vertices|Faces|Grid/i);
}

async function configureManualRenderTab(page) {
  await page.evaluate(data => {
    const payload = window.Components.surface.createEmptyPayload();
    window.Components.surface.loadFromPayload({
      ...payload,
      type: 'surface',
      data,
      dataViews: undefined,
      activeDataViewId: undefined,
      config: {
        ...(payload.config || {}),
        axisMap: { x: 0, y: 1, z: 2 },
        settings: {
          interpolation: 'scatter',
          colorRamp: 'magma',
          fontSize: 10,
          axisStroke: 0.75,
          axisColor: '#116655',
          showGrid: false,
          showFrame: true,
          showPoints: true,
          showLegend: false
        },
        labels: { title: 'Surface B Large', x: 'Longitude', y: 'Latitude', z: 'Height' }
      }
    }, { source: 'e2e-surface-manual-render', skipDraw: true });
    const root = document.querySelector('#surfacePage:not([hidden])');
    const state = window.Components.surface.__getState?.();
    state?.scheduleDraw?.({ reason: 'e2e-surface-manual-threshold' });
    const renderRow = root?.querySelector?.('#surfaceRenderRow') || null;
    const renderButton = root?.querySelector?.('#surfaceRenderButton') || null;
    if (!renderRow || !renderButton) {
      throw new Error('surface manual render controls not found');
    }
  }, buildLargeSurfaceData(5205));
  await page.waitForFunction(() => {
    const root = document.querySelector('#surfacePage:not([hidden])');
    const row = root?.querySelector?.('#surfaceRenderRow');
    const button = root?.querySelector?.('#surfaceRenderButton');
    const payload = window.Components.surface.getPayload?.();
    return payload?.data?.length > 5000 && row && row.hidden === false && button && button.disabled === false;
  }, null, { timeout: 60_000 });
}

async function renderManualSurface(page) {
  await page.locator('#surfacePage:not([hidden]) #surfaceRenderButton').click();
  await waitForSurfaceRender(page, /Surface B Large|Points|Reporting and reproducibility/i);
  await page.waitForFunction(() => {
    const root = document.querySelector('#surfacePage:not([hidden])');
    const overlay = root?.querySelector?.('#surfaceGraphPanel .venn-loading-overlay') || null;
    if (!overlay || overlay.hidden) return true;
    const style = window.getComputedStyle(overlay);
    return style.display === 'none' || style.visibility === 'hidden';
  }, null, { timeout: 10_000 });
}

async function snapshotSurface(page) {
  return page.evaluate(() => {
    const root = document.querySelector('#surfacePage:not([hidden])');
    const payload = window.Components.surface.getPayload?.() || null;
    const config = payload?.config || {};
    const settings = config.settings || {};
    const wrapper = root?.querySelector?.('#surfaceHotWrapper') || null;
    const manager = wrapper?.__dataViewsOwner || null;
    const activeView = manager?.getActiveView?.() || null;
    const serialized = manager?.serialize?.({ includeData: true }) || payload?.dataViews || null;
    const views = serialized?.views || [];
    const overlay = root?.querySelector?.('#surfaceGraphPanel .venn-loading-overlay') || null;
    const overlayStyle = overlay ? window.getComputedStyle(overlay) : null;
    const visibleOverlay = !!overlay && !overlay.hidden && overlayStyle?.display !== 'none' && overlayStyle?.visibility !== 'hidden';
    const read = id => {
      const el = root?.querySelector?.(`#${id}`) || null;
      if (!el) return undefined;
      return el.type === 'checkbox' ? !!el.checked : String(el.value || '');
    };
    return {
      tabId: window.Main?.session?.workspaceState?.activeTabId || null,
      title: config.labels?.title || '',
      dataRows: Array.isArray(payload?.data) ? payload.data.length : 0,
      settings,
      controls: {
        interpolation: read('surfaceInterpolation'),
        fontSize: read('surfaceFontSize'),
        axisStroke: read('surfaceAxisStroke'),
        axisColor: read('surfaceAxisColor'),
        showGrid: read('surfaceShowGrid'),
        showFrame: read('surfaceShowFrame'),
        showPoints: read('surfaceShowPoints')
      },
      activeViewTitle: activeView?.title || '',
      serializedActiveTitle: views.find(view => view.id === serialized?.activeViewId)?.title || '',
      viewTitles: views.map(view => view.title),
      renderRowHidden: !!root?.querySelector?.('#surfaceRenderRow')?.hidden,
      renderButtonDisabled: !!root?.querySelector?.('#surfaceRenderButton')?.disabled,
      visibleOverlay,
      statsText: root?.querySelector?.('#surfaceStatsSummary')?.textContent || '',
      svgText: root?.querySelector?.('#surfaceSvg')?.textContent || '',
      faceCount: root?.querySelectorAll?.('#surfaceSvg g.surface-faces polygon')?.length || 0,
      pointCount: root?.querySelectorAll?.('#surfaceSvg g.surface-points circle')?.length || 0
    };
  });
}

async function captureArchive(page, stem) {
  const archive = await page.evaluate(async () => {
    const context = window.Main.tabs.getSessionActionsContext();
    const blob = await window.Main.sessionActions.buildWorkspaceArchiveBlob(context, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-surface-settings-dataviews-manual-overlay'
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return { base64: btoa(binary) };
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const archivePath = path.join(TMP_DIR, `${stem}.graph`);
  fs.writeFileSync(archivePath, Buffer.from(archive.base64, 'base64'));
  return archivePath;
}

async function reopenArchive(page, archivePath) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await page.waitForFunction(
    () => (window.Main?.session?.workspaceState?.tabs || []).filter(tab => tab && tab.type === 'surface').length === 2,
    null,
    { timeout: 60_000 }
  );
}

function expectDerivedSnapshot(snapshot) {
  expect(snapshot.title).toBe('Surface A');
  expect(snapshot.dataRows).toBe(170);
  expect(snapshot.settings.interpolation).toBe('grid');
  expect(snapshot.settings.colorRamp).toBe('plasma');
  expect(snapshot.settings.showGrid).toBe(true);
  expect(snapshot.settings.showFrame).toBe(false);
  expect(snapshot.settings.showPoints).toBe(false);
  expect(snapshot.controls.interpolation).toBe('grid');
  expect(snapshot.controls.showGrid).toBe(true);
  expect(snapshot.controls.showFrame).toBe(false);
  expect(snapshot.controls.showPoints).toBe(false);
  expect(snapshot.activeViewTitle || snapshot.serializedActiveTitle).toBe('Surface derived A');
  expect(snapshot.viewTitles).toContain('Surface derived A');
  expect(snapshot.renderRowHidden).toBe(true);
  expect(snapshot.visibleOverlay).toBe(false);
  expect(snapshot.faceCount).toBeGreaterThan(0);
}

function expectManualSnapshot(snapshot) {
  expect(snapshot.title).toBe('Surface B Large');
  expect(snapshot.dataRows).toBeGreaterThan(5000);
  expect(snapshot.settings.interpolation).toBe('scatter');
  expect(snapshot.settings.colorRamp).toBe('magma');
  expect(snapshot.settings.showGrid).toBe(false);
  expect(snapshot.settings.showFrame).toBe(true);
  expect(snapshot.settings.showPoints).toBe(true);
  expect(snapshot.controls.interpolation).toBe('scatter');
  expect(snapshot.controls.showGrid).toBe(false);
  expect(snapshot.controls.showFrame).toBe(true);
  expect(snapshot.controls.showPoints).toBe(true);
  expect(snapshot.viewTitles.filter(title => title === 'Surface derived A')).toHaveLength(0);
  expect(snapshot.visibleOverlay).toBe(false);
  expect(snapshot.pointCount).toBeGreaterThan(1000);
}

function expectManualThresholdSnapshot(snapshot) {
  expect(snapshot.title).toBe('Surface B Large');
  expect(snapshot.dataRows).toBeGreaterThan(5000);
  expect(snapshot.renderRowHidden).toBe(false);
  expect(snapshot.renderButtonDisabled).toBe(false);
  expect(snapshot.visibleOverlay).toBe(false);
}

test('Surface settings, DataViews, manual-render, overlay, and scheduled work stay isolated across same-type tabs and reopen', async ({ page }) => {
  test.setTimeout(300_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });

  const derivedId = await openSurfaceTab(page, { first: true });
  await configureDerivedSettingsTab(page);
  expectDerivedSnapshot(await snapshotSurface(page));
  await persistConfiguredSurfaceOwner(page, 'e2e-surface-derived-settings-seed', 'Surface A');

  const manualId = await openSurfaceTab(page);
  expect(manualId).not.toBe(derivedId);
  await configureManualRenderTab(page);
  expectManualThresholdSnapshot(await snapshotSurface(page));
  await renderManualSurface(page);
  expectManualSnapshot(await snapshotSurface(page));
  await persistConfiguredSurfaceOwner(page, 'e2e-surface-manual-render-seed', 'Surface B Large');

  await page.evaluate(() => {
    const state = window.Components.surface.__getState?.();
    state?.scheduleDraw?.({ force: true, reason: 'e2e-surface-pending-manual-switch' });
  });
  await activateTab(page, derivedId);
  await waitForSurfaceRender(page, /Surface A|Vertices|Faces|Grid/i);
  expectDerivedSnapshot(await snapshotSurface(page));

  await activateTab(page, manualId);
  await waitForSurfaceRender(page, /Surface B Large|Points|Reporting and reproducibility/i);
  expectManualSnapshot(await snapshotSurface(page));

  const archivePath = await captureArchive(page, 'surface-settings-dataviews-manual-overlay');
  await reopenArchive(page, archivePath);

  const reopenedIds = await page.evaluate(() =>
    (window.Main?.session?.workspaceState?.tabs || [])
      .filter(tab => tab && tab.type === 'surface')
      .map(tab => String(tab.id || ''))
  );
  expect(reopenedIds).toHaveLength(2);

  const reopened = [];
  for (const tabId of reopenedIds) {
    await activateTab(page, tabId);
    const snapshot = await snapshotSurface(page);
    reopened.push(snapshot);
  }
  const reopenedDerived = reopened.find(snapshot => snapshot.title === 'Surface A');
  const reopenedManual = reopened.find(snapshot => snapshot.title === 'Surface B Large');
  expect(reopenedDerived).toBeTruthy();
  expect(reopenedManual).toBeTruthy();
  expectDerivedSnapshot(reopenedDerived);
  expectManualSnapshot(reopenedManual);

  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
