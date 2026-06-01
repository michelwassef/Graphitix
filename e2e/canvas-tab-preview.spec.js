const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function activateWelcomeTab(page) {
  await page.evaluate(() => {
    const welcomeTab = window.Main?.session?.workspaceState?.tabs?.find(tab => tab?.isWelcome);
    if (welcomeTab && typeof window.Main?.tabs?.activateTab === 'function') {
      window.Main.tabs.activateTab(welcomeTab.id, { reason: 'e2e-preview-hover' });
    }
  });
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId);
    return !!active?.isWelcome;
  }, null, { timeout: 20000 });
}

async function captureActiveTabPreview(page) {
  return page.evaluate(() => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId);
    const config = tab?.type ? window.Main?.components?.registry?.[tab.type] : null;
    if (!tab || !config || typeof window.Main?.previews?.updateTabPreviewFromWorkspace !== 'function') {
      return null;
    }
    window.Main.previews.updateTabPreviewFromWorkspace(tab, config, {
      forceCapture: true,
      reason: 'e2e-canvas-preview'
    });
    return {
      tabId: tab.id,
      type: tab.type,
      hasPreview: !!tab.previewMarkup,
      meta: tab.previewMeta || null,
      markup: tab.previewMarkup || ''
    };
  });
}

async function hoverStoredPreview(page, tabId) {
  const tabButton = page.locator(`button.workspace-tab[data-tab-id="${tabId}"]`);
  await tabButton.hover();
  await page.waitForFunction(targetId => {
    const tooltip = document.querySelector('.workspace-tab__preview-tooltip');
    return !!tooltip
      && tooltip.dataset.tabId === targetId
      && tooltip.style.display !== 'none'
      && tooltip.querySelector('[data-preview-canvas-bitmap="true"]');
  }, tabId, { timeout: 20000 });
  return page.evaluate(() => {
    const tooltip = document.querySelector('.workspace-tab__preview-tooltip');
    const svg = tooltip?.querySelector('svg') || null;
    const image = tooltip?.querySelector('[data-preview-canvas-bitmap="true"]') || null;
    return {
      text: tooltip?.textContent || '',
      width: Number(svg?.getAttribute('width') || tooltip?.offsetWidth || 0),
      height: Number(svg?.getAttribute('height') || tooltip?.offsetHeight || 0),
      canvasBitmapCount: Number(svg?.getAttribute('data-preview-canvas-bitmap') || 0),
      imageSrc: image?.getAttribute('src') || '',
      hasSyntheticGlyph: !!tooltip?.querySelector('[data-preview-canvas-simplified]'),
      hasPlaceholder: !!tooltip?.querySelector('[data-preview-placeholder]')
    };
  });
}

async function assertCanvasPreview(page, preview, type) {
  expect(preview, `${type} preview capture should return metadata`).toBeTruthy();
  expect(preview.type).toBe(type);
  expect(preview.hasPreview).toBe(true);
  expect(preview.meta?.canvasBitmap).toBe(true);
  expect(preview.meta?.canvasSimplified).toBe(false);
  expect(preview.markup).toContain('data-preview-canvas-bitmap="true"');
  expect(preview.markup).not.toContain('data-preview-canvas-simplified');
  expect(preview.markup).not.toContain('data-preview-placeholder');
  expect(preview.markup).not.toContain('Preparing preview');
  // Allow richer canvas previews while still guarding against runaway payload growth.
  expect(preview.markup.length).toBeLessThan(220000);

  await activateWelcomeTab(page);
  const tooltip = await hoverStoredPreview(page, preview.tabId);
  expect(tooltip.width).toBeGreaterThan(0);
  expect(tooltip.height).toBeGreaterThan(0);
  expect(tooltip.canvasBitmapCount).toBeGreaterThan(0);
  expect(tooltip.imageSrc).toMatch(/^data:image\/png;base64,/);
  expect(tooltip.imageSrc.length).toBeGreaterThan(100);
  expect(tooltip.hasSyntheticGlyph).toBe(false);
  expect(tooltip.hasPlaceholder).toBe(false);
  expect(tooltip.text).not.toContain('Preparing preview');
}

test.describe('Canvas-backed tab previews', () => {
  test('large box individual values preview uses the actual canvas bitmap', async ({ page }) => {
    test.setTimeout(180000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'box', pageId: 'boxPage' },
      { first: true }
    );

    await page.waitForFunction(() => {
      const state = window.Components?.box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      return !!(hot && hot.gridApi && typeof hot.loadData === 'function');
    }, null, { timeout: 60000 });

    await page.evaluate(() => {
      const rows = [['Libraryrep1', 'Libraryrep2']];
      for (let idx = 1; idx <= 3000; idx += 1) {
        const left = Math.round(280 + Math.sin(idx / 17) * 120 + (idx % 41) * 3);
        const right = Math.round(175 + Math.cos(idx / 19) * 75 + (idx % 37) * 2);
        rows.push([String(left), String(right)]);
      }
      const typeSelect = document.getElementById('boxGraphType');
      if (typeSelect) {
        typeSelect.value = 'strip';
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const state = window.Components?.box?.__getState?.();
      const hot = state?.ensureHotForActiveTab?.() || state?.hot;
      hot.loadData(rows);
      window.Components?.box?.draw?.();
    });

    await page.waitForFunction(() => {
      return !!document.querySelector('#boxPlot g[data-export-layer="box-points"] foreignObject[data-point-renderer] canvas');
    }, null, { timeout: 120000 });

    const renderState = await page.evaluate(() => {
      const layers = Array.from(document.querySelectorAll('#boxPlot g[data-export-layer="box-points"]'));
      return {
        layerCount: layers.length,
        canvasCount: document.querySelectorAll('#boxPlot g[data-export-layer="box-points"] foreignObject[data-point-renderer] canvas').length,
        vectorPointCount: document.querySelectorAll('#boxPlot g[data-export-layer="box-points"] circle, #boxPlot g[data-export-layer="box-points"] path[data-box-export-geometry="1"]').length
      };
    });
    expect(renderState.layerCount).toBeGreaterThan(0);
    expect(renderState.canvasCount).toBeGreaterThan(0);
    expect(renderState.vectorPointCount).toBeLessThan(20);

    const preview = await captureActiveTabPreview(page);
    await assertCanvasPreview(page, preview, 'box');
  });

  test('large scatter preview uses the actual canvas bitmap', async ({ page }) => {
    test.setTimeout(180000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'scatter', pageId: 'scatterPage' },
      { first: true }
    );

    await page.waitForFunction(() => {
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      return !!(hot && hot.gridApi && typeof hot.loadData === 'function');
    }, null, { timeout: 60000 });

    await page.evaluate(() => {
      const rows = [['label', 'x', 'y']];
      for (let idx = 1; idx <= 18000; idx += 1) {
        const x = (idx / 140).toFixed(4);
        const y = (Math.sin(idx / 31) * 12 + Math.cos(idx / 97) * 5 + idx / 900).toFixed(4);
        rows.push([`P${idx}`, x, y]);
      }
      const typeSelect = document.getElementById('scatterGraphType');
      if (typeSelect) {
        typeSelect.value = 'scatter';
        typeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      hot.loadData(rows);
      window.Components?.scatter?.draw?.();
    });

    await page.waitForFunction(() => {
      const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
      return !!layer
        && layer.getAttribute('data-render-mode') === 'canvas'
        && !!layer.querySelector('foreignObject[data-point-renderer="canvas-preview"] canvas');
    }, null, { timeout: 120000 });

    const renderState = await page.evaluate(() => {
      const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
      return {
        renderMode: layer?.getAttribute?.('data-render-mode') || null,
        canvasCount: layer?.querySelectorAll?.('foreignObject[data-point-renderer="canvas-preview"] canvas').length || 0,
        pointNodeCount: layer?.querySelectorAll?.('circle, path, rect').length || 0
      };
    });
    expect(renderState.renderMode).toBe('canvas');
    expect(renderState.canvasCount).toBeGreaterThan(0);
    expect(renderState.pointNodeCount).toBeLessThan(20);

    const preview = await captureActiveTabPreview(page);
    await assertCanvasPreview(page, preview, 'scatter');
  });
});
