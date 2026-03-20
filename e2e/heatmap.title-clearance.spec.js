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
    expect(metrics.gapPx, JSON.stringify(metrics)).toBeGreaterThanOrEqual(4);
  });
});

