const { test, expect } = require('@playwright/test');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForAnimationFrame, waitForComponentOwnerReady } = require('../helpers/contractWaits');

async function beginObservation(page, pageId) {
  await page.evaluate(id => {
    const box = document.querySelector(`#${id}:not([hidden]) .svgbox`);
    const read = () => {
      const svg = Array.from(box.querySelectorAll('svg')).find(node => !node.ownerSVGElement
        && !node.closest('.resizer-control-tray, .resizer-bottom-tray')
        && node.dataset.graphFramePublication !== 'staged');
      const rect = box.getBoundingClientRect();
      let visibleMarks = 0;
      for (const node of svg?.querySelectorAll('path, line, rect, circle, ellipse, polygon, polyline, text') || []) {
        if (node.closest('defs, clipPath, mask')) continue;
        const style = getComputedStyle(node);
        const bounds = node.getBoundingClientRect();
        if (style.visibility === 'visible' && style.display !== 'none'
          && Number(style.opacity) > 0 && (bounds.width > 0 || bounds.height > 0)) {
          visibleMarks = 1;
          break;
        }
      }
      return { width: rect.width, height: rect.height, visibleMarks };
    };
    const observation = { read, frames: [], active: true };
    // Shared frame publication replaces direct children of this graph container.
    // Observe that boundary and sample in-place redraws once per animation frame.
    observation.observer = new MutationObserver(() => {
      observation.frames.push(read());
    });
    observation.observer.observe(box, { childList: true });
    const sample = () => {
      if (!observation.active) return;
      observation.frames.push(read());
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    window.__reducedMotionResizeObservation = observation;
  }, pageId);
}

for (const component of COMPONENT_CATALOG) {
  test(`${component.type} expands and shrinks visibly during reduced-motion graph resizing`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requireIdle: true });
    await page.waitForFunction(id => {
      const box = document.querySelector(`#${id}:not([hidden]) .svgbox`);
      return Array.from(box?.querySelectorAll('svg') || []).some(svg => !svg.ownerSVGElement
        && !svg.closest('.resizer-control-tray, .resizer-bottom-tray')
        && svg.dataset.graphFramePublication !== 'staged'
        && svg.querySelector('path, circle, polygon, line, rect'));
    }, component.pageId);

    for (const axis of ['width', 'height']) {
      for (const direction of [1, -1]) {
        const handle = page.locator(`#${component.pageId}:not([hidden]) .svgbox .resizer-${axis === 'width' ? 'vertical' : 'horizontal'}`).first();
        await handle.scrollIntoViewIfNeeded();
        const bounds = await handle.boundingBox();
        expect(bounds).toBeTruthy();
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height / 2;
        await beginObservation(page, component.pageId);
        const before = await page.evaluate(() => window.__reducedMotionResizeObservation.read());
        expect(before.visibleMarks).toBeGreaterThan(0);
        await page.mouse.move(x, y);
        await page.mouse.down();
        let during;
        let frames;
        try {
          for (let step = 1; step <= 8; step += 1) {
            await page.mouse.move(x + (axis === 'width' ? direction * step * 8 : 0),
              y + (axis === 'height' ? direction * step * 8 : 0));
            await waitForAnimationFrame(page);
          }
          ({ during, frames } = await page.evaluate(() => {
            const observation = window.__reducedMotionResizeObservation;
            observation.active = false;
            observation.observer.disconnect();
            return { during: observation.read(), frames: observation.frames };
          }));
        } finally {
          await page.mouse.up();
        }
        expect((during[axis] - before[axis]) * direction, `${axis} must change before release`).toBeGreaterThan(40);
        expect(frames.length).toBeGreaterThan(0);
        expect(frames.filter(frame => frame.visibleMarks === 0), 'every published live graph must show marks').toEqual([]);
        await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requireIdle: true });
        const after = await page.evaluate(() => window.__reducedMotionResizeObservation.read());
        expect(after.visibleMarks).toBeGreaterThan(0);
        expect(Math.abs(after[axis] - during[axis]), 'release must preserve the live size').toBeLessThan(2);
      }
    }
  });
}
