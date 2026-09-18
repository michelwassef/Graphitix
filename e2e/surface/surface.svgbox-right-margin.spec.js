const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, clickExampleButtonIfPresent } = require('../helpers/workspaceDriver');

test('Surface color scale does not add a second right margin to the SVG box', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'surfaceLoadExample');
  await page.waitForFunction(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    return !!svg?.querySelector('g.surface-legend')
      && window.Components?.surface?.ready === true;
  });

  const layout = await page.evaluate(() => {
    const root = document.querySelector('#surfacePage:not([hidden])');
    const box = root?.querySelector('.svgbox');
    const svg = root?.querySelector('#surfaceSvg');
    const style = box ? getComputedStyle(box) : null;
    return {
      marginRight: style?.marginRight || null,
      envelope: box?.dataset.graphContentEnvelope || null,
      outerEnvelope: svg?.dataset.plot3dOuterEnvelope || null,
      legendReserve: Number(svg?.dataset.plot3dLegendReserveWidth)
    };
  });

  expect(layout.outerEnvelope).toBe('false');
  expect(layout.legendReserve).toBeGreaterThan(0);
  expect(layout.marginRight).toBe('0px');
  expect(layout.envelope).toBeNull();
});
