const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function getHeatmapDrawPerf(page) {
  return page.evaluate(() => {
    const hook = window.Components?.heatmap?.__testHooks?.getPerformance?.();
    return hook?.performance?.draw || null;
  });
}

async function waitForHeatmapDrawAdvance(page, previousTimestamp, timeout = 60_000) {
  await page.waitForFunction(prev => {
    const hook = window.Components?.heatmap?.__testHooks?.getPerformance?.();
    const draw = hook?.performance?.draw || null;
    return Number(draw?.timestamp || 0) > Number(prev || 0);
  }, previousTimestamp, { timeout });
  return getHeatmapDrawPerf(page);
}

test.describe('Heatmap title clearance', () => {
  test('preserves title-hidden geometry and label clearance across tab return', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      { first: true }
    );
    await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
    await page.waitForFunction(() => (
      document.querySelectorAll('#heatmapSvg text[data-font-role="columnLabel"]').length > 0
      && window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw?.status === 'complete'
    ));

    const captureGeometry = () => page.evaluate(() => {
      const svg = document.getElementById('heatmapSvg');
      const title = svg?.querySelector('text[data-font-role="graphTitle"]');
      const columns = Array.from(svg?.querySelectorAll('text[data-font-role="columnLabel"]') || []);
      const cells = svg?.querySelector('[data-export-layer="heatmap-cells"]');
      const rowLabel = svg?.querySelector('text[data-font-role="rowLabel"]');
      const cellValue = svg?.querySelector('text[data-font-role="cellValue"]');
      if(!svg || !title || !columns.length || !cells || !rowLabel || !cellValue){
        return null;
      }
      const svgRect = svg.getBoundingClientRect();
      const cellsRect = cells.getBoundingClientRect();
      const rowLabelRect = rowLabel.getBoundingClientRect();
      const columnLabelRect = columns[0].getBoundingClientRect();
      const cellValueRect = cellValue.getBoundingClientRect();
      return {
        viewBox: svg.getAttribute('viewBox'),
        titleVisibility: getComputedStyle(title).visibility,
        svgTop: svgRect.top,
        cellsTop: cellsRect.top,
        cellsWidth: cellsRect.width,
        cellsHeight: cellsRect.height,
        rowLabelHeight: rowLabelRect.height,
        columnLabelWidth: columnLabelRect.width,
        cellValueHeight: cellValueRect.height,
        minColumnTop: Math.min(...columns.map(node => node.getBoundingClientRect().top))
      };
    });

    const visible = await captureGeometry();
    expect(visible).toBeTruthy();
    const previousTimestamp = await page.evaluate(() => (
      window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw?.timestamp || 0
    ));

    await page.evaluate(() => {
      window.Shared.fontControls.setRoleVisibility('heatmap', 'graphTitle', false);
    });
    await waitForHeatmapDrawAdvance(page, previousTimestamp);

    const hidden = await captureGeometry();
    expect(hidden).toBeTruthy();
    expect(hidden.titleVisibility).toBe('hidden');
    expect(hidden.minColumnTop).toBeGreaterThanOrEqual(hidden.svgTop - 1);
    expect(hidden.viewBox).toBe(visible.viewBox);
    expect(hidden.cellsTop).toBeCloseTo(visible.cellsTop, 1);
    expect(hidden.cellsWidth).toBeCloseTo(visible.cellsWidth, 1);
    expect(hidden.cellsHeight).toBeCloseTo(visible.cellsHeight, 1);
    expect(hidden.rowLabelHeight).toBeCloseTo(visible.rowLabelHeight, 1);
    expect(hidden.columnLabelWidth).toBeCloseTo(visible.columnLabelWidth, 1);
    expect(hidden.cellValueHeight).toBeCloseTo(visible.cellValueHeight, 1);

    const heatmapTabId = await page.evaluate(() => (
      window.Main?.session?.workspaceState?.activeTabId || null
    ));
    expect(heatmapTabId).toBeTruthy();
    await page.locator('#workspaceTabsList .workspace-tab').filter({ hasText: 'Welcome' }).click();
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${heatmapTabId}"]`).click();
    await expect(page.locator('#heatmapPage')).toBeVisible();
    await page.evaluate(async tabId => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await window.Components?.heatmap?.awaitReadyForSnapshot?.({
        tabId,
        reason: 'heatmap-title-hidden-tab-return-test'
      });
    }, heatmapTabId);

    const restored = await captureGeometry();
    expect(restored).toBeTruthy();
    expect(restored.titleVisibility).toBe('hidden');
    expect(restored.minColumnTop).toBeGreaterThanOrEqual(restored.svgTop - 1);
    expect(restored.viewBox).toBe(hidden.viewBox);
    expect(restored.cellsTop).toBeCloseTo(hidden.cellsTop, 1);
    expect(restored.cellsWidth).toBeCloseTo(hidden.cellsWidth, 1);
    expect(restored.cellsHeight).toBeCloseTo(hidden.cellsHeight, 1);
    expect(restored.rowLabelHeight).toBeCloseTo(hidden.rowLabelHeight, 1);
    expect(restored.columnLabelWidth).toBeCloseTo(hidden.columnLabelWidth, 1);
    expect(restored.cellValueHeight).toBeCloseTo(hidden.cellValueHeight, 1);
  });

  test('keeps a visible gap between graph title and column labels after font/style changes', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      { first: true }
    );
    await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
    await page.waitForTimeout(1200);

    let previous = await getHeatmapDrawPerf(page);
    expect(previous).toBeTruthy();

    await page.evaluate(() => {
      const Shared = window.Shared || {};
      const Components = window.Components || {};
      const fontControls = Shared.fontControls || {};
      const exportStyles = typeof fontControls.exportScopeStyles === 'function'
        ? (fontControls.exportScopeStyles('heatmap') || {})
        : {};
      const nextStyles = { ...exportStyles };
      nextStyles.graphTitle = { ...(nextStyles.graphTitle || {}), fontSize: '28px', fontWeight: '700' };
      const svg = document.getElementById('heatmapSvg');
      const columnKeys = svg
        ? Array.from(svg.querySelectorAll('text[data-font-role="columnLabel"]'))
            .map(node => String(node?.dataset?.fontKey || '').trim())
            .filter(Boolean)
        : [];
      columnKeys.forEach(key => {
        nextStyles[key] = { ...(nextStyles[key] || {}), fontSize: '24px' };
      });
      if(typeof fontControls.importScopeStyles === 'function'){
        fontControls.importScopeStyles('heatmap', nextStyles, { prune: false });
      }
      if(typeof Components?.heatmap?.draw === 'function'){
        Components.heatmap.draw();
      }
    });

    previous = await waitForHeatmapDrawAdvance(page, previous?.timestamp || 0);
    expect(previous).toBeTruthy();

    const metrics = await page.evaluate(() => {
      const svg = document.getElementById('heatmapSvg');
      if(!svg){
        return { ok: false, reason: 'missing-svg' };
      }
      const title = svg.querySelector('text[data-font-role="graphTitle"]');
      const columns = Array.from(svg.querySelectorAll('text[data-font-role="columnLabel"]'));
      if(!title || !columns.length){
        return { ok: false, reason: 'missing-label-nodes', hasTitle: !!title, columnCount: columns.length };
      }
      const svgRect = svg.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const columnTops = columns.map(node => node.getBoundingClientRect().top).filter(Number.isFinite);
      const minColumnTop = columnTops.length ? Math.min(...columnTops) : Number.NaN;
      const gapPx = Number.isFinite(minColumnTop) ? (minColumnTop - titleRect.bottom) : Number.NaN;
      return {
        ok: true,
        gapPx,
        minColumnTop,
        titleBottom: titleRect.bottom,
        titleTop: titleRect.top,
        svgTop: svgRect.top,
        svgBottom: svgRect.bottom,
        titleVisible: titleRect.top >= (svgRect.top - 1) && titleRect.bottom <= (svgRect.bottom + 1),
        columnsTopVisible: Number.isFinite(minColumnTop) ? minColumnTop >= (svgRect.top - 1) : false
      };
    });

    expect(metrics.ok, JSON.stringify(metrics)).toBe(true);
    expect(metrics.titleVisible, JSON.stringify(metrics)).toBe(true);
    expect(metrics.columnsTopVisible, JSON.stringify(metrics)).toBe(true);
    expect(metrics.gapPx, JSON.stringify(metrics)).toBeGreaterThan(1);
  });

  test('keeps a visible gap between graph title and column labels after graph panel resize', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      { first: true }
    );
    await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
    await page.waitForTimeout(1200);

    const resizer = page.locator('#heatmapPage .panel-resizer:visible').first();
    await expect(resizer).toBeVisible();
    const box = await resizer.boundingBox();
    expect(box).toBeTruthy();
    if(box){
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(400);
    }

    const metrics = await page.evaluate(() => {
      const svg = document.getElementById('heatmapSvg');
      if(!svg){
        return { ok: false, reason: 'missing-svg' };
      }
      const title = svg.querySelector('text[data-font-role="graphTitle"]');
      const columns = Array.from(svg.querySelectorAll('text[data-font-role="columnLabel"]'));
      if(!title || !columns.length){
        return { ok: false, reason: 'missing-label-nodes', hasTitle: !!title, columnCount: columns.length };
      }
      const svgRect = svg.getBoundingClientRect();
      const titleRect = title.getBoundingClientRect();
      const columnTops = columns.map(node => node.getBoundingClientRect().top).filter(Number.isFinite);
      const minColumnTop = columnTops.length ? Math.min(...columnTops) : Number.NaN;
      const gapPx = Number.isFinite(minColumnTop) ? (minColumnTop - titleRect.bottom) : Number.NaN;
      return {
        ok: true,
        gapPx,
        minColumnTop,
        titleBottom: titleRect.bottom,
        titleTop: titleRect.top,
        svgTop: svgRect.top,
        svgBottom: svgRect.bottom,
        titleVisible: titleRect.top >= (svgRect.top - 1) && titleRect.bottom <= (svgRect.bottom + 1),
        columnsTopVisible: Number.isFinite(minColumnTop) ? minColumnTop >= (svgRect.top - 1) : false
      };
    });

    expect(metrics.ok, JSON.stringify(metrics)).toBe(true);
    expect(metrics.titleVisible, JSON.stringify(metrics)).toBe(true);
    expect(metrics.columnsTopVisible, JSON.stringify(metrics)).toBe(true);
    expect(metrics.gapPx, JSON.stringify(metrics)).toBeGreaterThan(1);
  });
});
