const { test, expect } = require('@playwright/test');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer, parseWorkspaceArchive } = require('../helpers/archiveDriver');

const cases = ['box', 'scatter', 'line', 'hist', 'roc', 'survival', 'pca', 'pie', 'venn']
  .map(type => ({ type, mode: type === 'venn' ? 'upset' : type === 'pie' ? 'stacked' : 'default' }));

async function inspect(page, type) {
  return page.evaluate(type => {
    const tab = window.Main.session.getActiveTab();
    const root = window.Shared.workspaceTabs.getMountedRoot(tab.id, type);
    const box = root.querySelector('.svgbox');
    const svg = box.querySelector('svg:not(.resizer-options-icon)');
    const axis = svg.querySelector('[data-axis-line="1"][data-axis-key="x"]')
      || svg.querySelector('[data-axis-control="1"][data-axis-key="x"]');
    // Inspect SVG geometry independently of the toolbar measurement helper.
    const matrix = svg.getCTM().inverse().multiply(axis.getCTM());
    const dx = Number(axis.getAttribute('x2')) - Number(axis.getAttribute('x1'));
    const dy = Number(axis.getAttribute('y2')) - Number(axis.getAttribute('y1'));
    const length = Math.hypot(matrix.a * dx + matrix.c * dy, matrix.b * dx + matrix.d * dy);
    const projection = window.Shared.exportProjection.resolve(svg, { componentName: type });
    return {
      tabId: tab.id, length,
      zoom: box.__sharedResizableBoxApi.getZoomLevel(),
      frame: [Number(box.dataset.resizerBaseWidth), Number(box.dataset.resizerBaseHeight)],
      exportSize: [projection.physical.width, projection.physical.height]
    };
  }, type);
}

async function axisInput(page, component) {
  await page.locator(`#${component.pageId} [data-axis-control="1"][data-axis-key="x"]`).first().dispatchEvent('click');
  const input = page.locator('.axis-controls-panel__input--length');
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();
  return input;
}

async function zoomTo(page, component, zoom) {
  const input = page.locator(`#${component.pageId}`).getByRole('spinbutton', { name: 'Zoom level percent', exact: true });
  await input.fill(String(zoom * 100));
  await input.press('Enter');
  await expect.poll(async () => (await inspect(page, component.type)).zoom).toBe(zoom);
  await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requirePublished: true, requireIdle: true });
}

async function settledGeometry(page, type) {
  let previous;
  let consecutive = 0;
  let state;
  await expect.poll(async () => {
    state = await inspect(page, type);
    const key = JSON.stringify([state.frame, state.length, state.exportSize]);
    consecutive = key === previous ? consecutive + 1 : 0;
    previous = key;
    return consecutive >= 3;
  }, { intervals: [250], timeout: 15_000 }).toBe(true);
  return state;
}

for (const entry of cases) {
  test(`${entry.type} ${entry.mode}: axis length and edits stay canonical across zoom`, async ({ page }) => {
    test.setTimeout(120_000);
    const component = COMPONENT_CATALOG.find(item => item.type === entry.type);
    await installLocalCdnOverrides(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/index.html');
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    if (entry.mode === 'upset') await page.locator('#vennPlotType').selectOption('upset');
    if (entry.mode === 'stacked') await page.locator('#pieChartType').selectOption('stacked');
    await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requirePublished: true, requireIdle: true });
    await zoomTo(page, component, 1);
    // Mount the Format toolbar before taking the baseline: opening it changes
    // the available viewport and can settle the renderer's initial constraints.
    await axisInput(page, component);
    const before = await settledGeometry(page, entry.type);
    const automaticPcaCache = entry.type === 'pca'
      ? await page.evaluateHandle(() => window.Components.pca.captureRenderCache({ tabId: window.Main.session.getActiveTab().id }))
      : null;
    if (automaticPcaCache) {
      expect(await page.evaluate(cache => window.Components.pca.canRestoreRenderCache(cache, {
        tabId: window.Main.session.getActiveTab().id
      }), automaticPcaCache)).toBe(true);
    }
    for (const zoom of [0.5, 1.5, 1]) {
      await zoomTo(page, component, zoom);
      const input = await axisInput(page, component);
      await expect.poll(async () => Number(await input.inputValue())).toBeCloseTo(before.length, 0);
      const state = await inspect(page, entry.type);
      expect(state.frame).toEqual(before.frame);
      expect(state.length).toBeCloseTo(before.length, 2);
      expect(state.exportSize).toEqual(before.exportSize);
    }
    const target = Math.round(before.length * 1.15);
    await zoomTo(page, component, 0.5);
    let input = await axisInput(page, component);
    await input.fill(String(target));
    await input.press('Enter');
    await expect.poll(async () => (await inspect(page, entry.type)).length, { timeout: 20_000 }).toBeCloseTo(target, 0);
    // A first draw may hit the requested length while a newer input commit is
    // still refining. Check the settled result before changing the view.
    const edited = await settledGeometry(page, entry.type);
    expect(edited.length).toBeCloseTo(target, 0);
    if (automaticPcaCache) {
      // An automatic-layout cache must not replace the newly explicit layout.
      expect(await page.evaluate(cache => {
        const pca = window.Components.pca;
        const meta = { tabId: window.Main.session.getActiveTab().id };
        return [pca.canRestoreRenderCache(cache, meta), pca.restoreRenderCache(cache, meta)];
      }, automaticPcaCache)).toEqual([false, false]);
      await automaticPcaCache.dispose();
    }
    await zoomTo(page, component, 1.5);
    input = await axisInput(page, component);
    await expect.poll(async () => Number(await input.inputValue())).toBeCloseTo(target, 0);
    expect((await inspect(page, entry.type)).frame).toEqual(edited.frame);
    // The alternate physical unit must describe the same canonical axis.
    const unit = page.locator('.axis-controls-panel__input--unit');
    await unit.selectOption('mm');
    await expect.poll(async () => Number(await input.inputValue())).toBeCloseTo(target * 25.4 / 96, 0);
    await unit.selectOption('px');

    if (entry.type === 'pca') {
      const model = await page.evaluate(() => window.Components.pca.getPayload().config.explicitAxisLayout);
      expect(model?.version).toBe(1);
      const restored = await page.evaluate(() => {
        const component = window.Components.pca;
        const tabId = window.Main.session.getActiveTab().id;
        const cache = component.captureRenderCache({ tabId });
        const root = window.Shared.workspaceTabs.getMountedRoot(tabId, 'pca');
        root.querySelector('#pcaPlot').replaceChildren();
        return component.restoreRenderCache(cache, { tabId });
      });
      expect(restored).toBe(true);
      expect((await settledGeometry(page, entry.type)).length).toBeCloseTo(target, 0);
      // A full normal draw must obey the same contract as the resize draw.
      await page.evaluate(() => window.Components.pca.draw({ force: true, reason: 'e2e-explicit-axis-redraw' }));
      await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requirePublished: true, requireIdle: true });
      expect((await settledGeometry(page, entry.type)).length).toBeCloseTo(target, 0);
    }
    if (['box', 'pca'].includes(entry.type) && entry.mode === 'default') {
      for (const includeRenderCache of entry.type === 'pca' ? [true, false] : [true]) {
        const modelBefore = entry.type === 'pca'
          ? await page.evaluate(() => window.Components.pca.getPayload().config.explicitAxisLayout) : null;
        const archive = await buildWorkspaceArchive(page, { useWorker: false, includeRenderCacheInSnapshot: includeRenderCache, captureRenderCacheBeforeSnapshot: includeRenderCache });
        if (entry.type === 'pca') {
          const parsed = await parseWorkspaceArchive(page, archive.base64);
          const saved = parsed.session.tabs.find(tab => tab.type === 'pca');
          expect(Boolean(saved.archiveRenderCache)).toBe(includeRenderCache);
          expect(saved.payload.config.explicitAxisLayout).toEqual(modelBefore);
        }
        await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: entry.type });
        await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requirePublished: true, requireIdle: true });
        await expect.poll(async () => (await inspect(page, entry.type)).frame).toEqual(edited.frame);
        input = await axisInput(page, component);
        await expect.poll(async () => Number(await input.inputValue())).toBeCloseTo(target, 0);
        expect((await inspect(page, entry.type)).length).toBeCloseTo(target, 0);
        if (entry.type === 'pca') {
          expect(await page.evaluate(() => window.Components.pca.getPayload().config.explicitAxisLayout)).toEqual(modelBefore);
          await page.evaluate(() => window.Components.pca.draw({ force: true, reason: 'e2e-reopened-axis-redraw' }));
          await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requirePublished: true, requireIdle: true });
          expect((await settledGeometry(page, entry.type)).length).toBeCloseTo(target, 0);
        }
      }
    }
  });
}
