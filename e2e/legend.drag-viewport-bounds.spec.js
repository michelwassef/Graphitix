const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function dragLegend(page, deltaX, deltaY) {
  return page.evaluate(async ({ deltaX, deltaY }) => {
    const svg = document.querySelector('#linePage:not([hidden]) #lineSvg');
    const legend = svg?.querySelector('g[data-legend-viewport-content="true"]');
    if(!svg || !legend){
      return null;
    }
    const child = legend.querySelector('text, [data-legend-swatch]') || legend;
    const rect = child.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const pointer = (type, x, y) => new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      isPrimary: true,
      pointerId: 41,
      button: 0,
      clientX: x,
      clientY: y
    });
    child.dispatchEvent(pointer('pointerdown', startX, startY));
    window.dispatchEvent(pointer('pointermove', startX + deltaX, startY + deltaY));
    window.dispatchEvent(pointer('pointerup', startX + deltaX, startY + deltaY));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const svgRect = svg.getBoundingClientRect();
    const legendRect = legend.getBoundingClientRect();
    return {
      left: legendRect.left - svgRect.left,
      top: legendRect.top - svgRect.top,
      right: svgRect.right - legendRect.right,
      bottom: svgRect.bottom - legendRect.bottom
    };
  }, { deltaX, deltaY });
}

test('Line legend cannot be dragged beyond the SVG viewport', async ({ page }) => {
  test.setTimeout(60_000);
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'lineLoadExample');
  await expect(page.locator('#lineSvg g[data-legend-viewport-content="true"]')).toBeVisible();

  const bottomRight = await dragLegend(page, 5000, 5000);
  expect(bottomRight).not.toBeNull();
  expect(bottomRight.right).toBeGreaterThanOrEqual(-1.5);
  expect(bottomRight.bottom).toBeGreaterThanOrEqual(-1.5);

  const topLeft = await dragLegend(page, -5000, -5000);
  expect(topLeft).not.toBeNull();
  expect(topLeft.left).toBeGreaterThanOrEqual(-1.5);
  expect(topLeft.top).toBeGreaterThanOrEqual(-1.5);
});
