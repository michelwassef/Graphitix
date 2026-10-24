const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { test, expect } = require('@playwright/test');
const {
  openComponentFromWelcome,
  clickExpectedExampleButton
} = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

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
  test('keeps multiline title spacing stable across redraws', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      { first: true }
    );
    await clickExpectedExampleButton(page, 'heatmapLoadExample');
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });

    const capture = () => page.locator('#heatmapPage:not([hidden]) #heatmapSvg').evaluate(svg => {
      const title = svg.querySelector('text[data-font-role="graphTitle"]');
      const matrix = svg.querySelector('[data-export-layer="heatmap-cells"]');
      const matrixBounds = matrix?.getBBox?.();
      const titleRect = title?.getBoundingClientRect?.();
      const columnLabels = Array.from(svg.querySelectorAll('text[data-font-role="columnLabel"]'));
      const minColumnTop = columnLabels.length
        ? Math.min(...columnLabels.map(node => node.getBoundingClientRect().top))
        : NaN;
      const summary = svg.querySelector('g[data-stats-figure-summary="1"]');
      const summaryParent = summary?.parentNode || null;
      const summaryNext = summary?.nextSibling || null;
      if(summaryParent) summaryParent.removeChild(summary);
      let contentBottom = 0;
      try{
        const bounds = svg.getBBox();
        contentBottom = Number(bounds.y) + Number(bounds.height);
      }finally{
        if(summaryParent){
          if(summaryNext?.parentNode === summaryParent) summaryParent.insertBefore(summary, summaryNext);
          else summaryParent.appendChild(summary);
        }
      }
      const viewBox = String(svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      const matrixRect = matrix?.getBoundingClientRect?.();
      return {
        text: title?.dataset?.titleBlockText ?? title?.textContent ?? '',
        titleY: Number(title?.getAttribute('y')),
        baselines: Array.from(title?.querySelectorAll('tspan[data-title-line="1"]') || [])
          .map(row => Number(row.getAttribute('y'))),
        lineHeight: Number(title?.dataset?.titleLineHeight) || Number.parseFloat(getComputedStyle(title).fontSize),
        matrixY: Number(matrixBounds?.y),
        matrixWidth: Number(matrixBounds?.width),
        matrixHeight: Number(matrixBounds?.height),
        matrixClientHeight: Number(matrixRect?.height),
        titleColumnGapPx: minColumnTop - Number(titleRect?.bottom),
        contentBottom,
        sceneHeight: Number(svg.dataset.heatmapSceneHeight),
        viewBox
      };
    });

    const before = await capture();
    const title = page.locator('#heatmapSvg text[data-font-role="graphTitle"]').first();
    await title.dblclick();
    const editor = page.locator('.inline-edit-input').last();
    await expect(editor).toBeVisible();
    await editor.fill(before.text);
    await editor.press('End');
    await editor.press('Enter');
    await editor.type('Reserve line one');
    await editor.press('Enter');
    await editor.type('Reserve line two');
    await expect(editor).toBeVisible();
    await page.mouse.click(3, 3);
    await expect(editor).toBeHidden();
    const editedTitle = `${before.text}\nReserve line one\nReserve line two`;
    await expect.poll(async () => (await capture()).text).toBe(editedTitle);
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });

    const after = await capture();
    expect(after.baselines).toHaveLength(3);
    expect(after.baselines[1] - after.baselines[0]).toBeCloseTo(after.lineHeight, 2);
    expect(after.baselines[2] - after.baselines[1]).toBeCloseTo(after.lineHeight, 2);
    expect(after.baselines[0], JSON.stringify({ before, after })).toBeCloseTo(before.baselines[0] || before.titleY, 2);
    expect(after.matrixY, JSON.stringify({ before, after })).toBeGreaterThan(before.matrixY);
    expect(after.titleColumnGapPx, JSON.stringify({ before, after })).toBeGreaterThan(1);
    expect(after.matrixWidth).toBeCloseTo(before.matrixWidth, 2);
    expect(after.matrixHeight).toBeCloseTo(before.matrixHeight, 2);
    expect(after.sceneHeight, JSON.stringify({ before, after })).toBeGreaterThan(before.sceneHeight);
    expect(after.viewBox[1] + after.viewBox[3]).toBeGreaterThanOrEqual(after.contentBottom - 0.5);
    expect(after.matrixClientHeight).toBeCloseTo(before.matrixClientHeight, 0);

    const drawTimestamp = await getHeatmapDrawPerf(page);
    await page.evaluate(() => window.Components?.heatmap?.draw?.());
    await waitForHeatmapDrawAdvance(page, drawTimestamp?.timestamp || 0);
    const redrawn = await capture();
    expect(redrawn.text).toBe(editedTitle);
    expect(redrawn.matrixY).toBeCloseTo(after.matrixY, 2);
    expect(redrawn.matrixWidth).toBeCloseTo(after.matrixWidth, 2);
    expect(redrawn.matrixHeight).toBeCloseTo(after.matrixHeight, 2);
    expect(redrawn.sceneHeight).toBeCloseTo(after.sceneHeight, 2);
    expect(redrawn.titleColumnGapPx, JSON.stringify({ after, redrawn })).toBeGreaterThan(1);
  });

  test('preserves title-hidden geometry and label clearance across tab return', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      { first: true }
    );
    await clickExpectedExampleButton(page, 'heatmapLoadExample');
    await page.waitForFunction(() => (
      document.querySelectorAll('#heatmapPage:not([hidden]) #heatmapSvg text[data-font-role="columnLabel"]').length > 0
      && window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw?.status === 'complete'
    ));

    const captureGeometry = () => page.evaluate(() => {
      const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
      const title = svg?.querySelector('text[data-font-role="graphTitle"]');
      const columns = Array.from(svg?.querySelectorAll('text[data-font-role="columnLabel"]') || []);
      const cells = svg?.querySelector('[data-export-layer="heatmap-cells"]');
      const rowLabel = svg?.querySelector('text[data-font-role="rowLabel"]');
      if(!svg || !title || !columns.length || !cells || !rowLabel){
        return null;
      }
      const svgRect = svg.getBoundingClientRect();
      const cellsRect = cells.getBoundingClientRect();
      const rowLabelRect = rowLabel.getBoundingClientRect();
      const columnLabelRect = columns[0].getBoundingClientRect();
      return {
        viewBox: svg.getAttribute('viewBox'),
        titleVisibility: getComputedStyle(title).visibility,
        svgTop: svgRect.top,
        cellsTop: cellsRect.top,
        cellsWidth: cellsRect.width,
        cellsHeight: cellsRect.height,
        rowLabelHeight: rowLabelRect.height,
        columnLabelWidth: columnLabelRect.width,
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
    // The viewBox may be recomputed from current label measurements on tab return.
    // User-visible matrix geometry and title/label clearance are the durable contract.
    expect(restored.cellsTop).toBeCloseTo(hidden.cellsTop, 1);
    expect(restored.cellsWidth).toBeCloseTo(hidden.cellsWidth, 1);
    expect(restored.cellsHeight).toBeCloseTo(hidden.cellsHeight, 1);
    expect(restored.rowLabelHeight).toBeCloseTo(hidden.rowLabelHeight, 1);
    expect(restored.columnLabelWidth).toBeCloseTo(hidden.columnLabelWidth, 1);
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
    await clickExpectedExampleButton(page, 'heatmapLoadExample');
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });

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
      const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
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
      const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
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
    await clickExpectedExampleButton(page, 'heatmapLoadExample');
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });

    const resizer = page.locator('#heatmapPage .panel-resizer:visible').first();
    await expect(resizer).toBeVisible();
    const box = await resizer.boundingBox();
    expect(box).toBeTruthy();
    if(box){
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    }

    const metrics = await page.evaluate(() => {
      const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
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

  test('keeps a multiline Data values title clear of column labels after graph resize', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      { first: true }
    );
    await clickExpectedExampleButton(page, 'heatmapLoadExample');
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    await page.selectOption('#heatmapView', 'values');
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });

    const title = page.locator('#heatmapPage:not([hidden]) #heatmapSvg text[data-font-role="graphTitle"]').first();
    await title.dblclick();
    const editor = page.locator('.inline-edit-input').last();
    await expect(editor).toBeVisible();
    await editor.fill('Heatmap');
    await editor.press('End');
    await editor.press('Enter');
    await editor.type('test');
    await editor.press('Enter');
    await editor.type('test');
    await page.mouse.click(3, 3);
    await expect(editor).toBeHidden();
    await expect.poll(() => title.getAttribute('data-title-block-text')).toBe('Heatmap\ntest\ntest');
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });

    const capture = () => page.evaluate(() => {
      const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
      const titleNode = svg?.querySelector('text[data-font-role="graphTitle"]');
      const columns = Array.from(svg?.querySelectorAll('text[data-font-role="columnLabel"]') || []);
      const matrix = svg?.querySelector('[data-export-layer="heatmap-cells"]');
      const titleRect = titleNode?.getBoundingClientRect();
      const svgRect = svg?.getBoundingClientRect();
      const frameRect = svg?.closest('.svgbox')?.getBoundingClientRect();
      const matrixRect = matrix?.getBoundingClientRect();
      const minColumnTop = columns.length
        ? Math.min(...columns.map(node => node.getBoundingClientRect().top))
        : NaN;
      return {
        gapPx: minColumnTop - titleRect.bottom,
        svgWidth: svgRect.width,
        svgHeight: svgRect.height,
        frameWidth: frameRect.width,
        frameHeight: frameRect.height,
        matrixTop: matrixRect.top,
        matrixWidth: matrixRect.width,
        matrixHeight: matrixRect.height,
        viewBox: svg.getAttribute('viewBox'),
        sceneHeight: Number(svg.dataset.heatmapSceneHeight),
        contentReserveBottom: Number(svg.dataset.graphContentReserveBottom || 0)
      };
    });

    const before = await capture();
    expect(before.gapPx, JSON.stringify(before)).toBeGreaterThan(1);
    const handle = page.locator('#heatmapGraphPanel .svgbox .resizer-vertical').first();
    const dragHandle = async (locator, deltaX, deltaY) => {
      const bounds = await locator.boundingBox();
      expect(bounds).toBeTruthy();
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        bounds.x + bounds.width / 2 + deltaX,
        bounds.y + bounds.height / 2 + deltaY,
        { steps: 12 }
      );
      await page.mouse.up();
    };
    await dragHandle(handle, 240, 0);
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });

    const resized = await capture();
    expect(resized.frameWidth).toBeGreaterThan(before.frameWidth + 200);
    expect(resized.svgWidth).toBeGreaterThan(before.svgWidth + 100);
    expect(resized.gapPx, JSON.stringify({ before, resized })).toBeGreaterThan(1);

    let drawTimestamp = await getHeatmapDrawPerf(page);
    await page.evaluate(() => window.Components?.heatmap?.draw?.());
    await waitForHeatmapDrawAdvance(page, drawTimestamp?.timestamp || 0);
    const redrawn = await capture();
    expect(redrawn.gapPx, JSON.stringify({ resized, redrawn })).toBeGreaterThan(1);
    expect(redrawn.matrixTop).toBeCloseTo(resized.matrixTop, 1);
    expect(redrawn.matrixWidth).toBeCloseTo(resized.matrixWidth, 1);
    expect(redrawn.matrixHeight).toBeCloseTo(resized.matrixHeight, 1);
    expect(Math.abs(redrawn.svgHeight - resized.svgHeight), JSON.stringify({ resized, redrawn })).toBeLessThan(2);
    expect(Math.abs(redrawn.sceneHeight - resized.sceneHeight), JSON.stringify({ resized, redrawn })).toBeLessThan(16);

    drawTimestamp = await getHeatmapDrawPerf(page);
    await page.evaluate(() => window.Components?.heatmap?.draw?.());
    await waitForHeatmapDrawAdvance(page, drawTimestamp?.timestamp || 0);
    const redrawnAgain = await capture();
    expect(redrawnAgain.gapPx, JSON.stringify({ redrawn, redrawnAgain })).toBeGreaterThan(1);
    expect(Math.abs(redrawnAgain.svgHeight - redrawn.svgHeight), JSON.stringify({ redrawn, redrawnAgain })).toBeLessThan(2);
    expect(Math.abs(redrawnAgain.sceneHeight - redrawn.sceneHeight), JSON.stringify({ redrawn, redrawnAgain })).toBeLessThan(16);

    await dragHandle(handle, -140, 0);
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    const narrowed = await capture();
    expect(narrowed.frameWidth).toBeLessThan(resized.frameWidth - 100);
    expect(narrowed.svgWidth).toBeLessThan(resized.svgWidth - 100);
    expect(narrowed.gapPx, JSON.stringify({ resized, narrowed })).toBeGreaterThan(1);

    drawTimestamp = await getHeatmapDrawPerf(page);
    await page.evaluate(() => window.Components?.heatmap?.draw?.());
    await waitForHeatmapDrawAdvance(page, drawTimestamp?.timestamp || 0);
    const redrawnNarrow = await capture();
    expect(redrawnNarrow.gapPx, JSON.stringify({ narrowed, redrawnNarrow })).toBeGreaterThan(1);
    expect(redrawnNarrow.matrixTop).toBeCloseTo(narrowed.matrixTop, 1);
    expect(redrawnNarrow.matrixWidth).toBeCloseTo(narrowed.matrixWidth, 1);
    expect(redrawnNarrow.matrixHeight).toBeCloseTo(narrowed.matrixHeight, 1);
    expect(Math.abs(redrawnNarrow.svgHeight - narrowed.svgHeight), JSON.stringify({ narrowed, redrawnNarrow })).toBeLessThan(2);
    expect(Math.abs(redrawnNarrow.sceneHeight - narrowed.sceneHeight), JSON.stringify({ narrowed, redrawnNarrow })).toBeLessThan(16);

    const heightHandle = page.locator('#heatmapGraphPanel .svgbox .resizer-horizontal').first();
    await dragHandle(heightHandle, 0, 80);
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    const taller = await capture();
    expect(taller.frameHeight).toBeGreaterThan(redrawnNarrow.frameHeight + 40);
    expect(taller.gapPx, JSON.stringify({ redrawnNarrow, taller })).toBeGreaterThan(1);

    await dragHandle(heightHandle, 0, -50);
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    const shorter = await capture();
    expect(shorter.frameHeight).toBeLessThan(taller.frameHeight - 20);
    expect(shorter.gapPx, JSON.stringify({ taller, shorter })).toBeGreaterThan(1);

    const heatmapTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(heatmapTabId).toBeTruthy();
    await page.locator('#workspaceTabsList .workspace-tab').filter({ hasText: 'Welcome' }).click();
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${heatmapTabId}"]`).click();
    await expect(page.locator('#heatmapPage')).toBeVisible();
    await page.evaluate(async tabId => {
      await window.Components?.heatmap?.awaitReadyForSnapshot?.({
        tabId,
        reason: 'heatmap-multiline-title-resize-return-test'
      });
    }, heatmapTabId);
    await waitForComponentOwnerReady(page, 'heatmap', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 });
    const returned = await capture();
    expect(returned.gapPx, JSON.stringify({ shorter, returned })).toBeGreaterThan(1);
    expect(returned.matrixWidth).toBeCloseTo(shorter.matrixWidth, 1);
    expect(returned.matrixHeight).toBeCloseTo(shorter.matrixHeight, 1);
  });
});
