const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

const CASES = [
  { type: 'scatter', pageId: 'scatterPage', panelId: 'scatterGraphPanel' },
  { type: 'box', pageId: 'boxPage', panelId: 'boxGraphPanel' },
  { type: 'line', pageId: 'linePage', panelId: 'lineGraphPanel' },
  { type: 'pca', pageId: 'pcaPage', panelId: 'pcaGraphPanel' },
  { type: 'hist', pageId: 'histPage', panelId: 'histGraphPanel' },
  { type: 'heatmap', pageId: 'heatmapPage', panelId: 'heatmapGraphPanel' },
  { type: 'roc', pageId: 'rocPage', panelId: 'rocGraphPanel' },
  { type: 'surface', pageId: 'surfacePage', panelId: 'surfaceGraphPanel' }
];

test('fresh empty graph tabs do not show graph loading overlays', async ({ page }) => {
  test.setTimeout(180000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  for(let index = 0; index < CASES.length; index += 1){
    const component = CASES[index];
    await openComponentFromWelcome(page, component, { first: index === 0 });
    await page.waitForTimeout(400);
    const state = await page.evaluate(panelId => {
      const panel = document.getElementById(panelId);
      const overlays = Array.from(panel?.querySelectorAll?.('.venn-loading-overlay') || []);
      return overlays.map(overlay => {
        const style = window.getComputedStyle(overlay);
        return {
          hidden: !!overlay.hidden,
          ariaHidden: overlay.getAttribute('aria-hidden'),
          visibleClass: overlay.classList.contains('is-visible'),
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          text: overlay.textContent.trim()
        };
      });
    }, component.panelId);
    const visible = state.filter(entry => (
      !entry.hidden
      && entry.ariaHidden !== 'true'
      && entry.visibleClass
      && entry.display !== 'none'
      && entry.visibility !== 'hidden'
      && Number(entry.opacity || 0) > 0
    ));
    expect(visible, `${component.type} should not show a graph loading overlay on an empty tab`).toEqual([]);
  }
});
