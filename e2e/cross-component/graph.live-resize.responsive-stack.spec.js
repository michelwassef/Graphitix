const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome, clickExpectedExampleButton } = require('../helpers/workspaceDriver');
const { waitForAnimationFrame, waitForComponentOwnerReady } = require('../helpers/contractWaits');

async function readSnapshot(page, type) {
  return page.evaluate(componentType => {
    const root = document.querySelector(`#${componentType}Page:not([hidden])`);
    const wrap = root?.querySelector('.wrap');
    const svgBox = root?.querySelector('.svgbox');
    const svg = componentType === 'surface' ? root?.querySelector('#surfaceSvg') : root?.querySelector('#stage');
    const marks = componentType === 'surface'
      ? svg?.querySelectorAll('g.surface-faces polygon').length || 0
      : svg?.querySelectorAll('[data-upset-matrix-cell], [data-upset-trace-kind]').length || 0;
    const panelRect = svgBox?.getBoundingClientRect();
    const svgRect = svg?.getBoundingClientRect();
    const svgStyle = svg ? getComputedStyle(svg) : null;
    return {
      flexDirection: wrap ? getComputedStyle(wrap).flexDirection : '',
      panelWidth: panelRect?.width || 0,
      visible: !!svgStyle && svgStyle.display !== 'none' && svgStyle.visibility !== 'hidden'
        && Number(svgStyle.opacity) > 0 && (svgRect?.width || 0) > 32 && (svgRect?.height || 0) > 32,
      marks
    };
  }, type);
}

async function resizeStackedGraph(page, type, graphPanelId) {
  const handle = page.locator(`#${graphPanelId} .svgbox .resizer-vertical`).first();
  await expect(handle).toBeVisible();
  await handle.scrollIntoViewIfNeeded();
  const hitPoint = await handle.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const bottom = Math.min(rect.bottom - 12, window.innerHeight - 8);
    for (let y = bottom; y >= Math.max(rect.top + 12, 0); y -= 4) {
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === element || element.contains(hit))) return { x, y };
    }
    return null;
  });
  expect(hitPoint).toBeTruthy();
  const x = hitPoint.x;
  const y = hitPoint.y;
  const before = await readSnapshot(page, type);
  expect(before.flexDirection).toBe('column');
  expect(before.visible).toBe(true);
  expect(before.marks).toBeGreaterThan(0);

  expect(await page.evaluate(({ x: pointX, y: pointY, selector }) => {
    const handleElement = document.querySelector(selector);
    const hit = document.elementFromPoint(pointX, pointY);
    return !!handleElement && !!hit && (hit === handleElement || handleElement.contains(hit));
  }, { x, y, selector: `#${graphPanelId} .svgbox .resizer-vertical` })).toBe(true);

  await page.mouse.move(x, y);
  await page.mouse.down();
  const frames = [];
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(x - step * 8, y);
    await waitForAnimationFrame(page);
    frames.push(await readSnapshot(page, type));
  }
  await page.mouse.up();
  await waitForComponentOwnerReady(page, type, {
    requireMountedRoot: true,
    requireIdle: true
  });
  const after = await readSnapshot(page, type);

  expect(frames.every(frame => frame.visible && frame.marks > 0)).toBe(true);
  expect(frames.at(-1).panelWidth).toBeLessThan(before.panelWidth - 30);
  expect(after.visible).toBe(true);
  expect(after.marks).toBeGreaterThan(0);
}

test('Surface graph stays visible through live resize in its stacked panel layout', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 640, height: 450 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
  await clickExpectedExampleButton(page, 'surfaceLoadExample');
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    return svg?.querySelectorAll('g.surface-faces polygon').length > 0
      && window.Components?.surface?.isIdleForSnapshot?.({ tabId: state?.activeTabId }) === true;
  });
  await resizeStackedGraph(page, 'surface', 'surfaceGraphPanel');
});

test('UpSet graph stays visible through live resize in its stacked panel layout', async ({ page }) => {
  await installLocalCdnOverrides(page);
  await page.setViewportSize({ width: 640, height: 450 });
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'venn', pageId: 'vennPage' }, { first: true });
  await clickExpectedExampleButton(page, 'sample');
  await page.locator('#vennPage:not([hidden]) #vennPlotType').selectOption('upset');
  await page.waitForFunction(() => (
    document.querySelectorAll('#vennPage:not([hidden]) #stage [data-upset-matrix-cell]').length > 0
  ));
  await waitForComponentOwnerReady(page, 'venn', {
    requireMountedRoot: true,
    requireIdle: true
  });
  await resizeStackedGraph(page, 'venn', 'vennGraphPanel');
});
