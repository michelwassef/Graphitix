const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

async function waitForHeatmapCells(page) {
  await page.waitForFunction(() => {
    const cells = document.querySelectorAll('#heatmapSvg [data-export-layer="heatmap-cells"] rect');
    return cells.length >= 9;
  }, null, { timeout: 60_000 });
}

async function loadHeatmapFixture(page) {
  await page.waitForFunction(() => {
    const state = window.Components?.heatmap?.__getState?.() || null;
    return !!(state?.hot && typeof state.hot.loadData === 'function');
  }, null, { timeout: 45_000 });
  await page.evaluate(() => {
    const hot = window.Components?.heatmap?.__getState?.()?.hot || null;
    if(!hot || typeof hot.loadData !== 'function'){
      throw new Error('heatmap hot instance unavailable');
    }
    hot.loadData([
      ['Gene', 'Sample_A', 'Sample_B', 'Sample_C'],
      ['GeneA', 2.1, 2.4, 6.8],
      ['GeneB', 5.5, 5.8, 2.2],
      ['GeneC', 1.2, 1.0, 7.9],
      ['GeneD', 3.8, 3.5, 1.6],
      ['GeneE', 4.5, 4.2, 3.1]
    ], { source: 'e2e-heatmap-view-switch-fixture' });
  });
}

async function drawTimestamp(page) {
  return page.evaluate(() => {
    const state = window.Components?.heatmap?.__getState?.() || null;
    return Number(state?.performance?.draw?.timestamp || 0);
  });
}

async function waitForDrawAdvance(page, previousTimestamp, timeout = 60_000) {
  await page.waitForFunction(prev => {
    const state = window.Components?.heatmap?.__getState?.() || null;
    const draw = state?.performance?.draw || null;
    return Number(draw?.timestamp || 0) > Number(prev || 0);
  }, previousTimestamp, { timeout });
}

async function getHeatmapStateSnapshot(page) {
  return page.evaluate(() => {
    const state = window.Components?.heatmap?.__getState?.() || null;
    const checkbox = document.querySelector('#heatmapGraphPanel .resizer-aspect-checkbox');
    const svgBox = document.querySelector('#heatmapGraphPanel .svgbox');
    return {
      view: document.getElementById('heatmapView')?.value || null,
      modelType: state?.lastRenderModel?.type || null,
      checkboxChecked: !!checkbox?.checked,
      checkboxDisabled: !!checkbox?.disabled,
      lockDataset: svgBox?.dataset?.resizerAspectLocked || null,
      preserveAspectRatio: document.getElementById('heatmapSvg')?.getAttribute('preserveAspectRatio') || null
    };
  });
}

test.describe('Heatmap view switch and lock ratio behavior', () => {
  for (const correlationView of ['corr-columns', 'corr-rows']) {
    test(`switching from ${correlationView} to data values updates immediately and lock ratio stays user-toggleable`, async ({ page }) => {
      test.setTimeout(120_000);
      await installLocalCdnOverrides(page);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

      await openComponentFromWelcome(
        page,
        { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
        { first: true }
      );
      await loadHeatmapFixture(page);
      await waitForHeatmapCells(page);

      await page.selectOption('#heatmapView', correlationView);
      await page.waitForTimeout(300);

      let snapshot = await getHeatmapStateSnapshot(page);
      expect(snapshot.view).toBe(correlationView);
      expect(snapshot.modelType).toBe('correlation');
      expect(snapshot.checkboxChecked).toBe(true);
      expect(snapshot.checkboxDisabled).toBe(true);

      let previousTs = await drawTimestamp(page);
      await page.selectOption('#heatmapView', 'values');
      await waitForDrawAdvance(page, previousTs);

      snapshot = await getHeatmapStateSnapshot(page);
      expect(snapshot.view).toBe('values');
      expect(snapshot.modelType).toBe('values');
      expect(snapshot.checkboxDisabled).toBe(false);
      expect(snapshot.checkboxChecked).toBe(false);
      expect(snapshot.lockDataset).toBe('false');
      expect(snapshot.preserveAspectRatio).toBe('none');

      await page.locator('#heatmapGraphPanel .resizer-options-summary').click();
      const lockRatioInMenu = page.locator('#heatmapGraphPanel .resizer-options-menu .resizer-aspect-checkbox');
      await expect(lockRatioInMenu).toBeVisible();
      await expect(lockRatioInMenu).toBeEnabled();

      previousTs = await drawTimestamp(page);
      await lockRatioInMenu.click();
      await waitForDrawAdvance(page, previousTs);

      snapshot = await getHeatmapStateSnapshot(page);
      expect(snapshot.view).toBe('values');
      expect(snapshot.modelType).toBe('values');
      expect(snapshot.checkboxDisabled).toBe(false);
      expect(snapshot.checkboxChecked).toBe(true);
      expect(snapshot.lockDataset).toBe('true');
      expect(snapshot.preserveAspectRatio).toBe('xMidYMid meet');

      previousTs = await drawTimestamp(page);
      await lockRatioInMenu.click();
      await waitForDrawAdvance(page, previousTs);

      snapshot = await getHeatmapStateSnapshot(page);
      expect(snapshot.view).toBe('values');
      expect(snapshot.modelType).toBe('values');
      expect(snapshot.checkboxDisabled).toBe(false);
      expect(snapshot.checkboxChecked).toBe(false);
      expect(snapshot.lockDataset).toBe('false');
      expect(snapshot.preserveAspectRatio).toBe('none');
    });
  }
});
