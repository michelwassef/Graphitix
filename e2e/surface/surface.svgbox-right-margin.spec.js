const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, clickExpectedExampleButton } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

test('Surface reserves its complete color scale once inside the visible frame', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
  await clickExpectedExampleButton(page, 'surfaceLoadExample');
  await page.waitForFunction(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    return !!svg?.querySelector('g.surface-legend')
      && window.Components?.surface?.ready === true;
  });
  await waitForComponentOwnerReady(page, 'surface', { requireIdle: true });
  const initialViewBox = await page.locator('#surfacePage:not([hidden]) #surfaceSvg').getAttribute('viewBox');

  for (const zoom of [1, 0.5, 0.95]) {
    await page.locator('#surfacePage:not([hidden]) .svgbox').evaluate((box, zoom) => {
      box.__sharedResizableBoxApi.setZoomLevel(zoom);
    }, zoom);
    await waitForComponentOwnerReady(page, 'surface', { requireIdle: true });
    const containment = await page.evaluate(() => {
      const root = document.querySelector('#surfacePage:not([hidden])');
      const box = root.querySelector('.svgbox');
      const frame = box.closest('.graph-frame').getBoundingClientRect();
      const legend = root.querySelector('g.surface-legend').getBoundingClientRect();
      const handle = box.querySelector('.resizer-corner').getBoundingClientRect();
      const viewport = box.querySelector('.resizer-zoom-viewport').getBoundingClientRect();
      return { frameRight: frame.right, legendRight: legend.right, handleRight: handle.right, viewportRight: viewport.right,
        viewportOverflow: getComputedStyle(box.querySelector('.resizer-zoom-viewport')).overflowX };
    });
    await test.info().attach('surface-boundary', { body: JSON.stringify(containment), contentType: 'application/json' });
    expect(containment.viewportOverflow, 'the graph viewport clips the published color scale').toBe('visible');
    expect(containment.legendRight, 'color-scale labels extend beyond the visible frame').toBeLessThanOrEqual(containment.frameRight + 1);
    expect(containment.handleRight, 'resize handle extends beyond the visible frame').toBeLessThanOrEqual(containment.frameRight + 1);

    const layout = await page.evaluate(() => {
      const root = document.querySelector('#surfacePage:not([hidden])');
      const box = root?.querySelector('.svgbox');
      const svg = root?.querySelector('#surfaceSvg');
      const style = box ? getComputedStyle(box) : null;
      return {
        marginRight: style?.marginRight || null,
        envelope: box?.dataset.graphContentEnvelope || null,
        reserveRight: Number.parseFloat(box?.style.getPropertyValue('--graph-content-extra-right')),
        publishedScale: Number(svg?.dataset.graphContentRenderedScaleX),
        zoom: Number(box?.dataset.resizerZoomLevel),
        legendReserve: Number(svg?.dataset.plot3dLegendReserveWidth)
      };
    });

    expect(layout.legendReserve).toBeGreaterThan(0);
    expect(layout.envelope).toBe('true');
    // Display zoom projects reserves to whole CSS pixels through the resizer.
    expect(Math.round(layout.reserveRight)).toBe(Math.round(layout.legendReserve * layout.publishedScale * layout.zoom));
    expect(Number.parseFloat(layout.marginRight)).toBeCloseTo(layout.reserveRight, 2);
    expect(await page.locator('#surfacePage:not([hidden]) #surfaceSvg').getAttribute('viewBox')).toBe(initialViewBox);
  }
  await page.screenshot({ path: 'artifacts/surface-containment-review/surface-fixed.png' });
});
