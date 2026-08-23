const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

test('Data-values PNG preview preserves the rendered panel proportions', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');

  await page.evaluate(() => {
    const view = document.getElementById('heatmapView');
    if(view && view.value !== 'values'){
      view.value = 'values';
      view.dispatchEvent(new Event('change', { bubbles: true }));
    }
    ['heatmapClusterGenes', 'heatmapClusterArrays', 'heatmapShowRowDendrogram', 'heatmapShowColumnDendrogram']
      .forEach(id => {
        const checkbox = document.getElementById(id);
        if(checkbox && !checkbox.checked){
          checkbox.checked = true;
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
  });
  await page.waitForFunction(() => {
    const svg = document.getElementById('heatmapSvg');
    return window.Components?.heatmap?.isIdleForSnapshot?.() === true
      && svg?.dataset?.heatmapModelType === 'values'
      && svg.querySelectorAll('.heatmap-dendrogram').length === 2;
  }, null, { timeout: 60_000 });

  const metrics = await page.evaluate(async () => {
    const state = window.Main?.session?.workspaceState;
    const tab = state?.tabs?.find(item => item?.id === state.activeTabId);
    const config = window.Main?.components?.registry?.heatmap;
    const projectedSvg = config.getPreviewSvg(tab);
    const projectedViewBox = String(projectedSvg?.getAttribute('viewBox') || '')
      .split(/[\s,]+/)
      .map(Number);
    window.Main.previews.updateTabPreviewFromWorkspace(tab, config, {
      forceCapture: true,
      reason: 'heatmap-preview-fidelity'
    });
    await window.Main.previews.awaitPendingCaptures?.([tab.id]);

    const liveSvg = document.getElementById('heatmapSvg');
    const liveRect = liveSvg.getBoundingClientRect();
    const template = document.createElement('template');
    template.innerHTML = tab.previewMarkup || '';
    const previewSvg = template.content.querySelector('svg');
    return {
      format: tab.previewMeta?.format || null,
      liveRatio: liveRect.width / liveRect.height,
      projectedRatio: projectedViewBox.length === 4
        ? projectedViewBox[2] / projectedViewBox[3]
        : null,
      storedRatio: Number(tab.previewMeta?.width) / Number(tab.previewMeta?.height),
      naturalRatio: Number(tab.previewMeta?.pixelWidth) / Number(tab.previewMeta?.pixelHeight),
      projection: projectedSvg?.getAttribute('data-heatmap-preview-projection') || null,
      hasPng: !!template.content.querySelector('img[data-tab-preview-format="png"]'),
      hasSvg: !!previewSvg
    };
  });

  expect(metrics.format).toBe('png');
  expect(metrics.hasPng).toBe(true);
  expect(metrics.hasSvg).toBe(false);
  expect(metrics.projection).toBe('rendered-panel');
  expect(metrics.projectedRatio).toBeCloseTo(metrics.liveRatio, 2);
  expect(metrics.storedRatio).toBeCloseTo(metrics.liveRatio, 2);
  expect(metrics.naturalRatio).toBeCloseTo(metrics.storedRatio, 5);
});
