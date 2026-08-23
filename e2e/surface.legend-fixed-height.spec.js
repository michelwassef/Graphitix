const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

async function readLegend(page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    const legend = svg?.querySelector('g.surface-legend');
    const bar = legend?.querySelector('[data-surface-color-scale-bar="1"]');
    const ticks = Array.from(legend?.querySelectorAll('[data-surface-color-scale-tick="1"]') || []);
    const labels = Array.from(legend?.querySelectorAll('text[data-font-role="scaleTick"]') || []);
    const barRect = bar?.getBoundingClientRect?.();
    const barStyle = bar ? getComputedStyle(bar) : null;
    const session = window.Components?.surface?.__testHooks?.getSession?.();
    return {
      transform: legend?.getAttribute('transform') || null,
      mode: legend?.dataset?.surfaceLegendHeightMode || null,
      bar: barRect ? { width: barRect.width, height: barRect.height } : null,
      border: bar ? {
        stroke: bar.getAttribute('stroke'),
        width: bar.getAttribute('stroke-width'),
        vectorEffect: bar.getAttribute('vector-effect'),
        renderedStroke: barStyle?.stroke || null,
        renderedWidth: barStyle?.strokeWidth || null
      } : null,
      tickCount: ticks.length,
      labels: labels.map(node => node.textContent),
      labelsOnRight: labels.every(node => Number(node.getAttribute('x')) > Number(bar?.getAttribute('width'))),
      position: session?.state?.labelPositions?.legend || null
    };
  });
}

test('Surface uses a draggable Heatmap-style fixed-height color legend', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'surfaceLoadExample');
  await page.waitForFunction(() => {
    const workspace = window.Main?.session?.workspaceState;
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    return svg?.querySelectorAll('g.surface-faces polygon').length > 0
      && svg?.querySelectorAll('g.surface-legend text[data-font-role="scaleTick"]').length === 5
      && window.Components?.surface?.isIdleForSnapshot?.({ tabId: workspace?.activeTabId }) === true;
  });

  const before = await readLegend(page);
  expect(before.mode).toBe('fixed');
  expect(before.bar.width).toBeCloseTo(15, 0);
  expect(before.bar.height).toBeCloseTo(80, 0);
  expect(before.border).toEqual({
    stroke: '#333',
    width: '1',
    vectorEffect: 'non-scaling-stroke',
    renderedStroke: 'rgb(51, 51, 51)',
    renderedWidth: '1px'
  });
  expect(before.tickCount).toBe(5);
  expect(before.labels).toHaveLength(5);
  expect(before.labelsOnRight).toBe(true);

  const bar = page.locator('#surfacePage:not([hidden]) #surfaceSvg [data-surface-color-scale-bar="1"]');
  const box = await bar.boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 45, box.y + 30, { steps: 8 });
  await page.mouse.up();

  await expect.poll(async () => (await readLegend(page)).position).not.toBeNull();
  const dragged = await readLegend(page);
  expect(dragged.transform).not.toBe(before.transform);

  await page.evaluate(() => {
    window.Components.surface.draw({ force: true, reason: 'e2e-surface-fixed-legend-redraw' });
  });
  await expect.poll(async () => (await readLegend(page)).transform).toBe(dragged.transform);
  const redrawn = await readLegend(page);
  expect(redrawn.bar.width).toBeCloseTo(15, 0);
  expect(redrawn.bar.height).toBeCloseTo(80, 0);
  expect(redrawn.tickCount).toBe(5);
  const limitBox = await bar.boundingBox();
  await page.mouse.move(limitBox.x + limitBox.width / 2, limitBox.y + limitBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(limitBox.x - 1000, limitBox.y, { steps: 5 });
  await page.mouse.up();
  const leftLimit = await page.evaluate(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    const legend = svg?.querySelector('g.surface-legend');
    const compact = rect => rect ? ({ left: rect.left, right: rect.right, width: rect.width }) : null;
    return { svg: compact(svg?.getBoundingClientRect()), legend: compact(legend?.getBoundingClientRect()) };
  });
  expect(Math.abs(leftLimit.legend.left - leftLimit.svg.left)).toBeLessThanOrEqual(1.5);

  const rightStart = await bar.boundingBox();
  await page.mouse.move(rightStart.x + rightStart.width / 2, rightStart.y + rightStart.height / 2);
  await page.mouse.down();
  await page.mouse.move(1200, rightStart.y, { steps: 5 });
  await page.mouse.up();
  const rightLimit = await page.evaluate(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    const legend = svg?.querySelector('g.surface-legend');
    return {
      svgRight: svg?.getBoundingClientRect?.().right || 0,
      legendRight: legend?.getBoundingClientRect?.().right || 0
    };
  });
  expect(Math.abs(rightLimit.svgRight - rightLimit.legendRight)).toBeLessThanOrEqual(1.5);
  expect(issues.critical).toEqual([]);
});

test('a left-positioned Surface legend stays inside after container resize', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html');
  await openComponentFromWelcome(page, { type: 'surface', pageId: 'surfacePage' }, { first: true });
  await clickExampleButtonIfPresent(page, 'surfaceLoadExample');
  await page.waitForFunction(() => {
    const workspace = window.Main?.session?.workspaceState;
    return document.querySelectorAll('#surfacePage:not([hidden]) #surfaceSvg g.surface-faces polygon').length > 0
      && window.Components?.surface?.isIdleForSnapshot?.({ tabId: workspace?.activeTabId }) === true;
  });

  const bar = page.locator('#surfacePage:not([hidden]) #surfaceSvg [data-surface-color-scale-bar="1"]');
  const barBox = await bar.boundingBox();
  await page.mouse.move(barBox.x + barBox.width / 2, barBox.y + barBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(0, barBox.y, { steps: 8 });
  await page.mouse.up();

  const beforeWidth = await page.locator('#surfacePage:not([hidden]) #surfaceSvg').evaluate(svg => svg.getBoundingClientRect().width);
  const handle = page.locator('#surfacePage:not([hidden]) #surfaceGraphPanel .svgbox .resizer-vertical');
  const handleBox = await handle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x - 70, handleBox.y + handleBox.height / 2, { steps: 10 });
  await page.mouse.up();

  await page.waitForFunction(previousWidth => {
    const workspace = window.Main?.session?.workspaceState;
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    return svg?.getBoundingClientRect?.().width < previousWidth - 30
      && window.Components?.surface?.isIdleForSnapshot?.({ tabId: workspace?.activeTabId }) === true;
  }, beforeWidth);
  const after = await page.evaluate(() => {
    const svg = document.querySelector('#surfacePage:not([hidden]) #surfaceSvg');
    const legend = svg?.querySelector('g.surface-legend');
    const svgRect = svg?.getBoundingClientRect?.();
    const legendRect = legend?.getBoundingClientRect?.();
    const session = window.Components?.surface?.__testHooks?.getSession?.();
    return {
      svg: svgRect ? { left: svgRect.left, right: svgRect.right } : null,
      legend: legendRect ? { left: legendRect.left, right: legendRect.right } : null,
      position: session?.state?.labelPositions?.legend || null
    };
  });
  expect(after.legend.left).toBeGreaterThanOrEqual(after.svg.left - 1.5);
  expect(after.legend.right).toBeLessThanOrEqual(after.svg.right + 1.5);
  expect(after.position).toBeTruthy();
  expect(issues.critical).toEqual([]);
});
