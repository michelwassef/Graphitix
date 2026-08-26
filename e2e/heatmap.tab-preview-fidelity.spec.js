const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
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

test('Heatmap preview follows populated, empty, and repopulated graph state', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  const heatmapTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  await page.waitForFunction(() => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    return window.Components?.heatmap?.isIdleForSnapshot?.() === true
      && svg?.getAttribute('data-heatmap-render-state') !== 'empty'
      && !!svg?.querySelector('[data-export-layer="heatmap-cells"]');
  });

  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: false });
  const scatterTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  const heatmapTabButton = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${heatmapTabId}"]`);
  const tooltip = page.locator('.workspace-tab__preview-tooltip');

  await heatmapTabButton.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('svg, img[data-tab-preview-format="png"]')).toHaveCount(1);

  await heatmapTabButton.click();
  await page.waitForSelector('#heatmapPage:not([hidden])');
  await page.evaluate(() => {
    const hot = window.Components?.heatmap?.__getState?.()?.hot || null;
    const data = hot?.getData?.() || [];
    const changes = [];
    for(let row = 1; row < data.length; row += 1){
      for(let col = 1; col < (data[row]?.length || 0); col += 1){
        if(data[row][col] != null && String(data[row][col]).trim() !== ''){
          changes.push([row, col, '']);
        }
      }
    }
    hot?.setDataAtCell?.(changes, 'edit');
  });
  await page.waitForFunction(() => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    return window.Components?.heatmap?.isIdleForSnapshot?.() === true
      && svg?.getAttribute('data-heatmap-render-state') === 'empty';
  });

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${scatterTabId}"]`).click();
  await page.waitForFunction(tabId => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(item => item?.id === tabId);
    return !tab?.previewMarkup && !tab?.previewMeta && !tab?.previewSignature;
  }, heatmapTabId);
  await heatmapTabButton.hover();
  await expect(tooltip).not.toBeVisible();

  await heatmapTabButton.click();
  await page.getByRole('tab', { name: 'General', exact: true }).click();
  await page.locator('#heatmapPage:not([hidden]) #heatmapLoadExample').click();
  await page.waitForFunction(() => {
    const svg = document.querySelector('#heatmapPage:not([hidden]) #heatmapSvg');
    return window.Components?.heatmap?.isIdleForSnapshot?.() === true
      && svg?.getAttribute('data-heatmap-render-state') !== 'empty'
      && !!svg?.querySelector('[data-export-layer="heatmap-cells"]');
  });

  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${scatterTabId}"]`).click();
  await heatmapTabButton.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('svg, img[data-tab-preview-format="png"]')).toHaveCount(1);
  expect(issues.critical).toEqual([]);
});
