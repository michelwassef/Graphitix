const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/workspaceHarness');

async function readWelcomeIconMetrics(page, type) {
  return page.locator(`.graph-card[data-graph-type="${type}"] .graph-card__icon`).evaluate(tile => {
    const artwork = tile.querySelector('.welcome-graph-icon');
    const tileStyle = getComputedStyle(tile);
    const artworkStyle = artwork ? getComputedStyle(artwork) : null;
    const tileBounds = tile.getBoundingClientRect();
    const paintedBounds = Array.from(artwork?.children || [])
      .map(element => element.getBoundingClientRect())
      .reduce((bounds, rect) => ({
        left: Math.min(bounds.left, rect.left),
        top: Math.min(bounds.top, rect.top),
        right: Math.max(bounds.right, rect.right),
        bottom: Math.max(bounds.bottom, rect.bottom)
      }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    return {
      tileWidth: tileStyle.width,
      tileHeight: tileStyle.height,
      artworkWidth: artworkStyle?.width || null,
      artworkHeight: artworkStyle?.height || null,
      centerOffsetX: ((paintedBounds.left + paintedBounds.right) - (tileBounds.left + tileBounds.right)) / 2,
      centerOffsetY: ((paintedBounds.top + paintedBounds.bottom) - (tileBounds.top + tileBounds.bottom)) / 2
    };
  });
}

test('welcome icons render from the canonical GitHub-reference definitions', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await page.waitForFunction(() => document.querySelector('#welcomeScreen')?.dataset?.welcomeReady === 'true');

  for (const type of ['scatter', 'heatmap', 'roc']) {
    await expect(page.locator(`.graph-card[data-graph-type="${type}"] .welcome-graph-icon`)).toHaveCount(1);
  }

  const scatter = page.locator('.graph-card[data-graph-type="scatter"] .welcome-graph-icon');
  await expect(scatter.locator('.welcome-icon__guide')).toHaveAttribute('d', 'M14.5 32L37.5 15');
  await expect(scatter.locator('.welcome-icon__points circle')).toHaveCount(12);

  const heatmapCells = page.locator('.graph-card[data-graph-type="heatmap"] .welcome-icon__heatmap-grid rect');
  await expect(heatmapCells).toHaveCount(12);
  expect(await heatmapCells.evaluateAll(cells => cells.every(cell => (
    cell.getAttribute('width') === '6' && cell.getAttribute('height') === '6'
  )))).toBe(true);

  await expect(
    page.locator('.graph-card[data-graph-type="roc"] .welcome-icon__primary')
  ).toHaveAttribute('d', 'M10 38.5C11 17 18 11 38.5 11');

  for (const type of ['box', 'scatter', 'line', 'hist', 'heatmap', 'pca', 'pie', 'roc', 'survival', 'venn', 'surface']) {
    const metrics = await readWelcomeIconMetrics(page, type);
    expect(metrics).toMatchObject({
      tileWidth: '44px',
      tileHeight: '44px',
      artworkWidth: '39px',
      artworkHeight: '39px'
    });
    expect(Math.abs(metrics.centerOffsetX)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(metrics.centerOffsetY)).toBeLessThanOrEqual(0.5);
    if (type === 'pca') {
      expect(metrics.centerOffsetX).toBeGreaterThan(0.25);
    }
  }
});
