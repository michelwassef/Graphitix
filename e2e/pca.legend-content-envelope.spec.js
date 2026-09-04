const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

test('PCA legend remains inside the published SVG content envelope', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'pca', pageId: 'pcaPage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'pcaLoadExample');
  await page.waitForFunction(() => {
    const root = document.querySelector('#pcaPage:not([hidden])');
    return !!root?.querySelector('#pcaSvg [data-legend-viewport-content="true"]')
      && root.querySelector('#pcaGraphPanel .svgbox')?.dataset?.cartesianLayoutComplete === 'true';
  }, null, { timeout: 30_000 });

  const metrics = await page.evaluate(() => {
    const root = document.querySelector('#pcaPage:not([hidden])');
    const svgBox = root.querySelector('#pcaGraphPanel .svgbox');
    const svg = root.querySelector('#pcaSvg');
    const legend = svg.querySelector('[data-legend-viewport-content="true"]');
    const svgRect = svg.getBoundingClientRect();
    const legendRect = legend.getBoundingClientRect();
    const boxRect = svgBox.getBoundingClientRect();
    const plotRect = root.querySelector('#pcaPlot').getBoundingClientRect();
    const style = getComputedStyle(svgBox);
    const extraRight = Number.parseFloat(style.getPropertyValue('--graph-content-extra-right')) || 0;
    const extraLeft = Number.parseFloat(style.getPropertyValue('--graph-content-extra-left')) || 0;
    const trayRect = svgBox.querySelector('.resizer-control-tray').getBoundingClientRect();
    return {
      boxLeft: boxRect.left,
      boxRight: boxRect.right,
      boxWidth: boxRect.width,
      plotLeft: plotRect.left,
      plotRight: plotRect.right,
      svgLeft: svgRect.left,
      legendRight: legendRect.right,
      svgRight: svgRect.right,
      envelopeRight: boxRect.right + extraRight,
      envelopeLeft: boxRect.left - extraLeft,
      trayLeft: trayRect.left,
      paddingLeft: Number.parseFloat(style.paddingLeft) || 0,
      paddingRight: Number.parseFloat(style.paddingRight) || 0,
      baseWidth: Number(svg.dataset.graphContentBaseWidth) || 0,
      legendReserve: Number(svg.dataset.legendReserveWidth) || 0,
      contentReserve: Number(svg.dataset.graphContentReserveRight) || 0,
      planReserve: Number(svgBox.__cartesianLayoutPlan?.contentEnvelope?.extensionRight) || 0
    };
  });

  expect(metrics.legendRight, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.svgRight + 1);
  expect(metrics.legendRight, JSON.stringify(metrics)).toBeLessThanOrEqual(metrics.envelopeRight + 1);
  expect(Math.abs(metrics.contentReserve - metrics.planReserve), JSON.stringify(metrics)).toBeLessThanOrEqual(1);
  expect(metrics.envelopeRight - metrics.legendRight, JSON.stringify(metrics)).toBeLessThanOrEqual(24);
  expect(Math.abs((metrics.trayLeft - metrics.envelopeLeft) - 12), JSON.stringify(metrics)).toBeLessThanOrEqual(2);
});
