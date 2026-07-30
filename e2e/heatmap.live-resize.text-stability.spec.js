const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

test('Heatmap graph resize redraws text live without a second settled-size jump', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await page.waitForFunction(() => (
    document.querySelectorAll('#heatmapSvg text[data-font-role="graphTitle"]').length === 1
    && window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw?.status === 'complete'
  ));
  await page.evaluate(() => {
    const checkbox = document.querySelector('#heatmapGraphPanel .resizer-fontresize-checkbox');
    if(checkbox && !checkbox.checked){
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForTimeout(100);

  await page.evaluate(() => {
    const svg = document.getElementById('heatmapSvg');
    window.__heatmapResizeRenderCount = 0;
    window.__heatmapResizeObserver = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if(node.nodeType !== Node.ELEMENT_NODE){ return; }
          if(node.matches?.('text[data-font-role="graphTitle"]')){
            window.__heatmapResizeRenderCount += 1;
          }
          window.__heatmapResizeRenderCount += node.querySelectorAll?.('text[data-font-role="graphTitle"]').length || 0;
        });
      });
    });
    window.__heatmapResizeObserver.observe(svg, { childList: true, subtree: true });
  });
  const titleHeightBefore = await page.locator('#heatmapSvg text[data-font-role="graphTitle"]').evaluate(
    node => node.getBoundingClientRect().height
  );

  const handle = page.locator('#heatmapGraphPanel .svgbox .resizer-vertical').first();
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2, { steps: 12 });
  await page.waitForTimeout(50);

  expect(await page.evaluate(() => window.__heatmapResizeRenderCount)).toBeGreaterThan(0);
  const titleHeightDuring = await page.locator('#heatmapSvg text[data-font-role="graphTitle"]').evaluate(
    node => node.getBoundingClientRect().height
  );
  expect(Math.abs(titleHeightDuring - titleHeightBefore)).toBeGreaterThan(0.5);

  const renderCountBeforeRelease = await page.evaluate(() => window.__heatmapResizeRenderCount);
  await page.mouse.up();
  await page.waitForTimeout(250);

  const result = await page.evaluate(() => {
    window.__heatmapResizeObserver?.disconnect();
    return {
      renderCount: window.__heatmapResizeRenderCount,
      titleCount: document.querySelectorAll('#heatmapSvg text[data-font-role="graphTitle"]').length,
      titleHeight: document.querySelector('#heatmapSvg text[data-font-role="graphTitle"]')?.getBoundingClientRect?.().height || 0,
      draw: window.Components?.heatmap?.__testHooks?.getPerformance?.()?.performance?.draw || null
    };
  });
  expect(result.renderCount - renderCountBeforeRelease).toBeLessThanOrEqual(2);
  expect(result.titleCount).toBe(1);
  expect(Math.abs(result.titleHeight - titleHeightDuring)).toBeLessThanOrEqual(1.5);
  expect(result.draw?.viewOnly).toBe(true);
});
