const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function waitForScatterTable(page) {
  await page.waitForFunction(() => {
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    return !!(hot && typeof hot.loadData === 'function');
  }, null, { timeout: 60000 });
}

async function installOverlayProbe(page) {
  await page.evaluate(() => {
    window.__scatterOverlayProbe?.disconnect?.();
    window.__scatterOverlaySeen = false;
    const markVisible = () => {
      const overlay = document.querySelector('#scatterGraphPanel .venn-loading-overlay');
      if(!overlay || overlay.hidden){
        return;
      }
      const style = window.getComputedStyle(overlay);
      if(style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0){
        window.__scatterOverlaySeen = true;
      }
    };
    const host = document.querySelector('#scatterGraphPanel .svgbox') || document.querySelector('#scatterGraphPanel');
    const observer = new MutationObserver(markVisible);
    if(host){
      observer.observe(host, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['class', 'hidden', 'style']
      });
    }
    window.__scatterOverlayProbe = observer;
    markVisible();
  });
}

async function loadScatterRows(page, count) {
  await page.evaluate(pointCount => {
    const rows = [['label', 'x', 'y']];
    for(let idx = 1; idx <= pointCount; idx += 1){
      rows.push([`P${idx}`, String(idx), String((idx % 97) + 1)]);
    }
    const graphType = document.getElementById('scatterGraphType');
    if(graphType && graphType.value !== 'scatter'){
      graphType.value = 'scatter';
      graphType.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const hot = window.Components?.scatter?.__ensureHotForActiveTab?.();
    hot.loadData(rows);
    window.Components?.scatter?.draw?.({ force: true, reason: `e2e-overlay-threshold-${pointCount}` });
  }, count);
}

async function collectPerformanceCount(page, label) {
  return page.evaluate(targetLabel => {
    const entries = Array.isArray(window.Shared?.Performance?._entries)
      ? window.Shared.Performance._entries
      : [];
    return entries.filter(entry => String(entry?.label || '') === targetLabel).length;
  }, label);
}

test('scatter graph overlay is gated by the large point threshold', async ({ page }) => {
  test.setTimeout(120000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await waitForScatterTable(page);

  await installOverlayProbe(page);
  await loadScatterRows(page, 12);
  await page.waitForTimeout(350);
  await expect.poll(() => page.evaluate(() => window.__scatterOverlaySeen === true)).toBe(false);

  await installOverlayProbe(page);
  const drawCountBeforeLarge = await collectPerformanceCount(page, 'scatter.draw');
  await loadScatterRows(page, 7200);
  const firstFrameState = await page.evaluate(async baselineDrawCount => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const overlay = document.querySelector('#scatterGraphPanel .venn-loading-overlay');
    const entries = Array.isArray(window.Shared?.Performance?._entries)
      ? window.Shared.Performance._entries
      : [];
    const drawCount = entries.filter(entry => String(entry?.label || '') === 'scatter.draw').length;
    return {
      overlayVisible: !!overlay && !overlay.hidden && window.getComputedStyle(overlay).display !== 'none',
      drawStarted: drawCount > baselineDrawCount
    };
  }, drawCountBeforeLarge);
  expect(firstFrameState.overlayVisible).toBe(true);
  expect(firstFrameState.drawStarted).toBe(false);
  await page.waitForFunction(() => window.__scatterOverlaySeen === true, null, { timeout: 5000 });
});

test('scatter stopped heavy draw can be drawn again', async ({ page }) => {
  test.setTimeout(120000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  await waitForScatterTable(page);

  await loadScatterRows(page, 7200);
  const overlay = page.locator('#scatterGraphPanel .venn-loading-overlay');
  await expect(overlay).toBeVisible({ timeout: 5000 });
  await overlay.locator('[data-overlay-action="cancel"]').click();
  await expect(overlay).toContainText('Drawing stopped');

  await overlay.locator('[data-overlay-action="retry"]').click();
  await page.waitForFunction(() => {
    const layer = document.querySelector('#scatterPlot svg [data-layer="points"]');
    return !!layer
      && layer.getAttribute('data-render-mode') === 'canvas'
      && !!layer.querySelector('foreignObject[data-point-renderer="canvas-preview"] canvas');
  }, null, { timeout: 90000 });
  await expect(overlay).toBeHidden({ timeout: 5000 });
});
