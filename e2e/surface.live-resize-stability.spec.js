const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

async function readSurfaceResizeFrame(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    const mesh = svg?.querySelector('g.surface-faces');
    const viewBox = svg?.viewBox?.baseVal;
    const svgRect = svg?.getBoundingClientRect?.();
    const meshRect = mesh?.getBoundingClientRect?.();
    const titleRect = svg?.querySelector('text[data-graph-title]')?.getBoundingClientRect?.();
    const faces = Array.from(svg?.querySelectorAll('g.surface-faces polygon') || []);
    return {
      viewBox: viewBox ? {
        x: viewBox.x,
        y: viewBox.y,
        width: viewBox.width,
        height: viewBox.height
      } : null,
      svgRect: svgRect ? { width: svgRect.width, height: svgRect.height } : null,
      meshRect: meshRect ? {
        x: meshRect.x,
        y: meshRect.y,
        width: meshRect.width,
        height: meshRect.height
      } : null,
      titleRect: titleRect ? {
        x: titleRect.x,
        y: titleRect.y,
        width: titleRect.width,
        height: titleRect.height
      } : null,
      meshRatio: meshRect?.height > 0 ? meshRect.width / meshRect.height : null,
      faceCount: faces.length,
      faceSignature: faces.slice(0, 12).map(node => node.getAttribute('points')),
      baseWidth: Number(svg?.getAttribute('data-surface-base-width')),
      baseHeight: Number(svg?.getAttribute('data-surface-base-height')),
      mutations: window.__surfaceResizeMutations || 0
    };
  });
}

test('surface live resize and release publish the same projected frame', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'surfaceLoadExample');
  await page.waitForFunction(() => {
    const workspace = window.Main?.session?.workspaceState;
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    return svg?.querySelectorAll('g.surface-faces polygon').length > 0
      && window.Components?.surface?.isIdleForSnapshot?.({ tabId: workspace?.activeTabId }) === true;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  await page.evaluate(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    window.__surfaceResizeMutations = 0;
    window.__surfaceResizeObserver = new MutationObserver(records => {
      window.__surfaceResizeMutations += records.length;
    });
    window.__surfaceResizeObserver.observe(svg, {
      attributes: true,
      childList: true,
      subtree: true
    });
  });

  const before = await readSurfaceResizeFrame(page);
  expect(before.viewBox).toBeTruthy();
  expect(before.svgRect).toBeTruthy();
  expect(before.meshRatio).toBeTruthy();
  expect(before.faceCount).toBeGreaterThan(0);

  const handle = page.locator('#surfacePage:not([hidden]) #surfaceGraphPanel .svgbox .resizer-vertical');
  const handleBox = await handle.boundingBox();
  expect(handleBox).toBeTruthy();
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();

  let during = before;
  for (let step = 1; step <= 10; step += 1) {
    await page.mouse.move(startX + step * 12, startY);
    await page.waitForTimeout(25);
    during = await readSurfaceResizeFrame(page);
    expect(during.viewBox).toEqual({
      x: 0,
      y: 0,
      width: during.baseWidth,
      height: during.baseHeight
    });
    expect(during.faceCount).toBe(before.faceCount);
    expect(during.faceSignature.every(Boolean)).toBe(true);
  }
  expect(during.svgRect.width).toBeGreaterThan(before.svgRect.width + 50);
  expect(during.mutations).toBeGreaterThan(0);

  await page.waitForFunction(() => {
    const workspace = window.Main?.session?.workspaceState;
    return window.Components?.surface?.isIdleForSnapshot?.({ tabId: workspace?.activeTabId }) === true;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const beforeRelease = await readSurfaceResizeFrame(page);
  await page.evaluate(() => { window.__surfaceResizeMutations = 0; });

  await page.mouse.up();
  await page.waitForFunction(() => {
    const workspace = window.Main?.session?.workspaceState;
    return window.Components?.surface?.isIdleForSnapshot?.({ tabId: workspace?.activeTabId }) === true
      && (window.__surfaceResizeMutations || 0) > 0;
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  const after = await readSurfaceResizeFrame(page);
  expect(after.viewBox).toEqual(beforeRelease.viewBox);
  expect(after.faceCount).toBe(beforeRelease.faceCount);
  expect(after.faceSignature).toEqual(beforeRelease.faceSignature);
  expect(after.meshRect.x).toBeCloseTo(beforeRelease.meshRect.x, 1);
  expect(after.meshRect.y).toBeCloseTo(beforeRelease.meshRect.y, 1);
  expect(after.meshRect.width).toBeCloseTo(beforeRelease.meshRect.width, 1);
  expect(after.meshRect.height).toBeCloseTo(beforeRelease.meshRect.height, 1);
  expect(after.titleRect.x).toBeCloseTo(beforeRelease.titleRect.x, 1);
  expect(after.titleRect.y).toBeCloseTo(beforeRelease.titleRect.y, 1);
  expect(issues.critical).toEqual([]);
});
