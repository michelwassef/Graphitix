const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

test.describe('Heatmap title drag', () => {
  test('title follows mouse movement without accelerated drift', async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(
      page,
      { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
      { first: true }
    );
    await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
    await page.waitForTimeout(1200);

    const before = await page.evaluate(() => {
      const title = document.querySelector('#heatmapSvg text[data-font-role="graphTitle"]');
      if(!title){
        return null;
      }
      const rect = title.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2
      };
    });
    expect(before).toBeTruthy();

    const dragDx = 90;
    const dragDy = 35;
    await page.evaluate(({ startX, startY, dx, dy }) => {
      const title = document.querySelector('#heatmapSvg text[data-font-role="graphTitle"]');
      if(!title){
        return;
      }
      const fire = (target, type, clientX, clientY) => {
        const evt = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          button: 0
        });
        target.dispatchEvent(evt);
      };
      fire(title, 'mousedown', startX, startY);
      fire(window, 'mousemove', startX + dx, startY + dy);
      fire(window, 'mouseup', startX + dx, startY + dy);
    }, { startX: before.cx, startY: before.cy, dx: dragDx, dy: dragDy });
    await page.waitForTimeout(250);

    const after = await page.evaluate(() => {
      const title = document.querySelector('#heatmapSvg text[data-font-role="graphTitle"]');
      if(!title){
        return null;
      }
      const rect = title.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2
      };
    });
    expect(after).toBeTruthy();

    const movedX = after.cx - before.cx;
    const movedY = after.cy - before.cy;
    const ratioX = Math.abs(movedX / dragDx);
    const ratioY = Math.abs(movedY / dragDy);

    expect(Math.abs(movedX)).toBeGreaterThan(20);
    expect(Math.abs(movedY)).toBeGreaterThan(8);
    expect(ratioX).toBeLessThan(1.35);
    expect(ratioY).toBeLessThan(1.35);
  });
});
