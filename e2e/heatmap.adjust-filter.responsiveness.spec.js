const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

test('large Adjust data changes paint before tab-owned transformation work', async ({ page }) => {
  test.setTimeout(60_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true, loadExample: true }
  );
  await page.waitForFunction(() => !!window.Components?.heatmap?.ready);
  await page.locator('#heatmapView').selectOption('values');
  await page.waitForFunction(() => (
    document.getElementById('heatmapSvg')?.dataset?.heatmapModelType === 'values'
  ));

  await page.evaluate(() => {
    const heatmap = window.Components.heatmap;
    const hot = heatmap.__getState().hot;
    const rows = 8000;
    const columns = 12;
    const data = [
      ['Gene', ...Array.from({ length: columns }, (_, index) => `Sample ${index + 1}`)]
    ];
    for(let row = 0; row < rows; row += 1){
      data.push([
        `Gene ${row + 1}`,
        ...Array.from({ length: columns }, (_, column) => ((row + 1) * (column + 2)) % 997)
      ]);
    }
    const manager = hot.__heatmapDataViewsManager;
    manager.initialize(data, { rawTitle: 'Raw' });
    manager.activateView('raw', { reason: 'e2e-large-transform-fixture' });
    hot.loadData(data, { source: 'e2e-large-transform-fixture' });
  });
  await page.waitForFunction(() => (
    window.Components?.heatmap?.__getState?.()?.hot?.__heatmapDataViewsManager?.getView?.('raw')?.data?.length === 8001
  ));

  const response = await page.evaluate(async () => {
    const checkbox = document.getElementById('heatmapNormalizeGenes');
    const beforeTabs = document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab').length;
    const startedAt = performance.now();
    checkbox.click();
    const handlerMs = performance.now() - startedAt;
    const tabsBeforePaint = document.querySelectorAll('#heatmapHotWrapper .data-view-tabs__tab').length;
    await new Promise(resolve => requestAnimationFrame(resolve));
    return {
      checked: checkbox.checked,
      handlerMs,
      beforeTabs,
      tabsBeforePaint
    };
  });

  expect(response.checked).toBe(true);
  expect(response.handlerMs).toBeLessThan(100);
  expect(response.tabsBeforePaint).toBe(response.beforeTabs);
  await page.waitForFunction(() => {
    const heatmap = window.Components?.heatmap;
    const state = heatmap?.__getState?.();
    const manager = state?.hot?.__heatmapDataViewsManager;
    const materialized = (manager?.getViews?.() || [])
      .map(view => manager.getView?.(view.id))
      .find(view => view?.transformSpec?.type === 'heatmapMaterialized');
    const records = heatmap?.__testHooks?.getWorkerRecords?.() || [];
    return materialized?.data?.length === 8001
      && records.some(record => record.action === 'materializeDataTransform' && record.status === 'done');
  }, null, { timeout: 30_000 });
  const transformMs = await page.evaluate(() => {
    const record = (window.Components?.heatmap?.__testHooks?.getWorkerRecords?.() || [])
      .find(candidate => candidate.action === 'materializeDataTransform' && candidate.status === 'done');
    return Number(record?.completedAt) - Number(record?.startedAt);
  });
  expect(transformMs).toBeGreaterThanOrEqual(0);
  expect(transformMs).toBeLessThan(5000);

  const filterResponse = await page.evaluate(async () => {
    const checkbox = document.getElementById('heatmapFilterPresentEnable');
    const startedAt = performance.now();
    checkbox.click();
    const handlerMs = performance.now() - startedAt;
    await new Promise(resolve => requestAnimationFrame(resolve));
    return { checked: checkbox.checked, handlerMs };
  });
  expect(filterResponse.checked).toBe(true);
  expect(filterResponse.handlerMs).toBeLessThan(100);
  await page.waitForFunction(() => {
    const manager = window.Components?.heatmap?.__getState?.()?.hot?.__heatmapDataViewsManager;
    const active = manager?.getActiveView?.();
    return active?.transformSpec?.type === 'heatmapMaterialized'
      && active?.transformSpec?.dataTransformState?.filters?.presentEnabled === true;
  }, null, { timeout: 30_000 });
  expect(issues.critical).toEqual([]);
});
