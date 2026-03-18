const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function collectCount(page, label) {
  return page.evaluate(targetLabel => {
    const entries = Array.isArray(window.Shared?.Performance?._entries)
      ? window.Shared.Performance._entries
      : [];
    return entries.filter(entry => String(entry?.label || '') === targetLabel).length;
  }, label);
}

async function runUiAction(page, action) {
  await page.evaluate(action);
  await page.waitForTimeout(700);
}

async function getPcaDrawPerf(page) {
  return page.evaluate(() => {
    const hook = window.Components?.pca?.__testHooks?.getPerformance?.();
    return hook?.performance?.draw || null;
  });
}

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

test.describe('Redraw minimization audit', () => {
  test('box and scatter style changes avoid data collection, data edits trigger collection', async ({ page }) => {
    test.setTimeout(180_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' }, { first: true });
    await clickExampleButtonIfPresent(page, 'boxLoadExample');
    await page.waitForTimeout(1000);

    let before = await collectCount(page, 'box.data.collect');
    await runUiAction(page, () => {
      const input = document.getElementById('boxFill');
      if(input){
        input.value = '#2f9d84';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    let after = await collectCount(page, 'box.data.collect');
    expect(after, 'box fill input should not trigger data collect').toBe(before);

    before = after;
    await runUiAction(page, () => {
      const input = document.getElementById('boxBorderWidth');
      if(input){
        input.value = '2.8';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    after = await collectCount(page, 'box.data.collect');
    expect(after, 'box border width input should not trigger data collect').toBe(before);

    before = after;
    await runUiAction(page, () => {
      window.Shared?.colorSchemes?.applyToActiveTab?.('box', 'grayscale');
    });
    after = await collectCount(page, 'box.data.collect');
    expect(after, 'box color scheme change should not trigger data collect').toBe(before);

    before = after;
    await runUiAction(page, () => {
      const hot = window.Components?.box?.__getState?.()?.hot;
      if(!hot || typeof hot.getData !== 'function' || typeof hot.loadData !== 'function'){
        return;
      }
      const matrix = (hot.getData() || []).map(row => Array.isArray(row) ? row.slice() : []);
      const width = Number.isInteger(hot.countCols?.()) ? hot.countCols() : (matrix[0]?.length || 2);
      const nextRow = Array.from({ length: Math.max(2, width) }, (_, idx) => (idx === 0 ? '' : String(20 + idx)));
      matrix.push(nextRow);
      hot.loadData(matrix);
    });
    after = await collectCount(page, 'box.data.collect');
    expect(after, 'box table edit should trigger data collect').toBeGreaterThan(before);

    await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' }, { first: false });
    await clickExampleButtonIfPresent(page, 'scatterLoadExample');
    await page.waitForTimeout(1000);

    before = await collectCount(page, 'scatter.data.collect');
    await runUiAction(page, () => {
      const input = document.getElementById('scatterFill');
      if(input){
        input.value = '#1f78b4';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    after = await collectCount(page, 'scatter.data.collect');
    expect(after, 'scatter fill input should not trigger data collect').toBe(before);

    before = after;
    await runUiAction(page, () => {
      const input = document.getElementById('scatterBorderWidth');
      if(input){
        input.value = '1.7';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    after = await collectCount(page, 'scatter.data.collect');
    expect(after, 'scatter border width input should not trigger data collect').toBe(before);

    before = after;
    await runUiAction(page, () => {
      const grid = document.getElementById('scatterShowGrid');
      if(grid){
        grid.checked = !grid.checked;
        grid.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    after = await collectCount(page, 'scatter.data.collect');
    expect(after, 'scatter grid toggle should not trigger data collect').toBe(before);

    before = after;
    await runUiAction(page, () => {
      window.Shared?.colorSchemes?.applyToActiveTab?.('scatter', 'highcontrast');
    });
    after = await collectCount(page, 'scatter.data.collect');
    expect(after, 'scatter color scheme change should not trigger data collect').toBe(before);

    before = after;
    await runUiAction(page, () => {
      const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
      if(!hot || typeof hot.getData !== 'function' || typeof hot.loadData !== 'function'){
        return;
      }
      const matrix = (hot.getData() || []).map(row => Array.isArray(row) ? row.slice() : []);
      const width = Number.isInteger(hot.countCols?.()) ? hot.countCols() : (matrix[0]?.length || 4);
      const nextRow = Array.from({ length: Math.max(4, width) }, (_, idx) => {
        if(idx === 0){ return `sample-${Date.now()}`; }
        return String(5 + idx);
      });
      matrix.push(nextRow);
      hot.loadData(matrix);
    });
    after = await collectCount(page, 'scatter.data.collect');
    expect(after, 'scatter table edit should trigger data collect').toBeGreaterThan(before);
  });

  test('pca style changes stay view-only/cache-reused, data edits trigger non-cache draw', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage', exampleButtonId: 'pcaLoadExample' }, { first: true });
    await clickExampleButtonIfPresent(page, 'pcaLoadExample');
    await page.waitForTimeout(1200);

    let previous = await getPcaDrawPerf(page);
    expect(previous).toBeTruthy();

    await runUiAction(page, () => {
      const input = document.getElementById('pcaFill');
      if(input){
        input.value = '#1b9e77';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    let current = await getPcaDrawPerf(page);
    expect(current?.timestamp).toBeGreaterThan(previous?.timestamp || 0);
    expect(current?.viewOnly, 'pca fill input should use view-only draw').toBe(true);
    expect(current?.cacheReused, 'pca fill input should reuse cache').toBe(true);
    previous = current;

    await runUiAction(page, () => {
      const input = document.getElementById('pcaBorderWidth');
      if(input){
        input.value = '2.4';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    current = await getPcaDrawPerf(page);
    expect(current?.timestamp).toBeGreaterThan(previous?.timestamp || 0);
    expect(current?.viewOnly, 'pca border width input should use view-only draw').toBe(true);
    expect(current?.cacheReused, 'pca border width input should reuse cache').toBe(true);
    previous = current;

    await runUiAction(page, () => {
      window.Shared?.colorSchemes?.applyToActiveTab?.('pca', 'grayscale');
    });
    current = await getPcaDrawPerf(page);
    expect(current?.timestamp).toBeGreaterThan(previous?.timestamp || 0);
    expect(current?.viewOnly, 'pca color scheme should use view-only draw').toBe(true);
    expect(Number(current?.computeMs || 0), 'pca color scheme should avoid heavy compute').toBeLessThan(15);
    previous = current;

    await runUiAction(page, () => {
      const hot = window.Components?.pca?.getHotInstance?.();
      if(!hot || typeof hot.getData !== 'function' || typeof hot.loadData !== 'function'){
        return;
      }
      const matrix = (hot.getData() || []).map(row => Array.isArray(row) ? row.slice() : []);
      const width = Number.isInteger(hot.countCols?.()) ? hot.countCols() : (matrix[0]?.length || 3);
      const nextRow = Array.from({ length: Math.max(3, width) }, (_, idx) => (idx === 0 ? `sample-${Date.now()}` : String(9 + idx)));
      matrix.push(nextRow);
      hot.loadData(matrix);
    });
    current = await getPcaDrawPerf(page);
    expect(current?.timestamp).toBeGreaterThan(previous?.timestamp || 0);
    expect(Boolean(current?.cacheReused), 'pca data edit should not reuse cache').toBe(false);
  });

  test('heatmap keeps style updates view-only and uses full draw only for table edits', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' }, { first: true });
    await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
    await page.waitForTimeout(1200);

    await expect(page.locator('#heatmapRenderButton')).toHaveCount(0);
    await expect(page.locator('#heatmapAutoDrawNotice')).toHaveCount(0);

    let previous = await getHeatmapDrawPerf(page);
    expect(previous).toBeTruthy();

    await runUiAction(page, () => {
      const input = document.getElementById('heatmapShowValues');
      if(input){
        input.checked = !input.checked;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    let current = await waitForHeatmapDrawAdvance(page, previous?.timestamp || 0);
    expect(current?.viewOnly, 'heatmap show-values toggle should use view-only draw').toBe(true);
    previous = current;

    await runUiAction(page, () => {
      const hot = window.__LAST_HEATMAP_HOT__;
      if(!hot || typeof hot.getData !== 'function' || typeof hot.loadData !== 'function'){
        return;
      }
      const matrix = (hot.getData() || []).map(row => Array.isArray(row) ? row.slice() : []);
      const width = Number.isInteger(hot.countCols?.()) ? hot.countCols() : (matrix[0]?.length || 3);
      const nextRow = Array.from({ length: Math.max(3, width) }, (_, idx) => {
        if(idx === 0){ return `row-${Date.now()}`; }
        return String(1 + idx);
      });
      matrix.push(nextRow);
      hot.loadData(matrix);
    });
    current = await waitForHeatmapDrawAdvance(page, previous?.timestamp || 0);
    expect(current?.viewOnly, 'heatmap table edit must trigger full draw').toBe(false);
  });
});
