const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

test.setTimeout(90_000);

test('Heatmap replacement title stays hidden during inline editing', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, {
    type: 'heatmap',
    pageId: 'heatmapPage'
  }, {
    first: true,
    loadExample: true
  });

  const svgBox = page.locator('#heatmapPage:not([hidden]) .svgbox').first();
  const title = svgBox.locator('text[data-font-role="graphTitle"]').first();
  await expect(title).toBeAttached({ timeout: 20_000 });
  await title.evaluate(node => {
    window.__heatmapInlineEditOriginalTitle = node;
  });
  await title.dblclick();

  const editor = page.locator('.inline-edit-input');
  await editor.fill('Heatmap revised');
  await expect.poll(() => svgBox.evaluate(node => {
    const current = node.querySelector('text[data-font-role="graphTitle"]');
    return !!current && current !== window.__heatmapInlineEditOriginalTitle;
  })).toBe(true);

  const titleVisibility = await svgBox.evaluate(node => (
    Array.from(node.querySelectorAll('text[data-font-key="graphTitle"]')).map(titleNode => ({
      visibility: getComputedStyle(titleNode).visibility,
      opacity: getComputedStyle(titleNode).opacity
    }))
  ));
  expect(titleVisibility.length).toBeGreaterThan(0);
  expect(titleVisibility.every(item => item.visibility === 'hidden' || item.opacity === '0')).toBe(true);

  await editor.press('Escape');
  await expect.poll(() => svgBox.locator('text[data-font-role="graphTitle"]').first().evaluate(
    node => getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).opacity !== '0'
  )).toBe(true);
});
