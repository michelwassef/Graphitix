const { test, expect } = require('@playwright/test');
const { openComponentFromWelcome, clickExpectedExampleButton } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');

test('Heatmap title undo restores the original graph height', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true });
  await clickExpectedExampleButton(page, 'heatmapLoadExample');
  const ready = () => waitForComponentOwnerReady(page, 'heatmap', {
    requireMountedRoot: true, requireIdle: true, timeout: 60_000
  });
  await ready();
  await page.locator('#heatmapView').selectOption('corr-columns');
  await ready();
  const title = page.locator('#heatmapSvg text[data-font-role="graphTitle"]');
  const measure = () => title.evaluate(node => {
    const svg = node.ownerSVGElement;
    const plot = svg.parentElement;
    return {
      text: node.dataset.titleBlockText || node.textContent,
      sceneHeight: Number(svg.dataset.heatmapSceneHeight),
      svgHeight: svg.getBoundingClientRect().height,
      plotHeight: plot.getBoundingClientRect().height,
      reserveBottom: Number(svg.dataset.graphContentReserveBottom || 0),
      boxEnvelope: svg.closest('.svgbox').dataset.graphContentEnvelope || '',
      boxInlineBottom: svg.closest('.svgbox').style.getPropertyValue('--graph-content-extra-bottom'),
      boxMarginBottom: getComputedStyle(svg.closest('.svgbox')).marginBottom,
      svgSlot: svg.dataset.graphContentViewport || '',
      plotSlot: plot.dataset.graphContentViewport || ''
    };
  });
  const before = await measure();
  await title.dblclick();
  const editor = page.locator('.inline-edit-input').last();
  await expect(editor).toBeVisible();
  await editor.fill(`${before.text}\nsecond\nthird`);
  await page.mouse.click(3, 3);
  await ready();
  await expect.poll(() => measure().then(value => value.text)).toBe(`${before.text}\nsecond\nthird`);
  const expanded = await measure();
  expect(expanded.sceneHeight).toBeGreaterThan(before.sceneHeight);
  expect(Number.parseFloat(expanded.boxInlineBottom)).toBeGreaterThan(0);

  const tabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId);
  expect(await page.evaluate(id => window.Shared.undoManager.undo({ tabId: id }), tabId)).toBe(true);
  await ready();
  await expect.poll(() => measure().then(value => value.text)).toBe(before.text);
  const restored = await measure();
  expect(restored.boxInlineBottom, JSON.stringify({ before, expanded, restored })).toBe('');
  expect(restored.sceneHeight).toBeCloseTo(before.sceneHeight, 0);
  expect(restored.svgHeight).toBeCloseTo(before.svgHeight, 0);
  expect(restored.plotHeight).toBeCloseTo(before.plotHeight, 0);
  expect(restored.reserveBottom).toBe(0);
  expect(restored.boxMarginBottom).toBe(before.boxMarginBottom);
  expect(restored.svgSlot).toBe('');
  expect(restored.plotSlot).toBe('');

  expect(await page.evaluate(id => window.Shared.undoManager.redo({ tabId: id }), tabId)).toBe(true);
  await ready();
  await expect.poll(() => measure().then(value => value.text)).toBe(expanded.text);
  const redone = await measure();
  expect(redone.sceneHeight).toBeCloseTo(expanded.sceneHeight, 0);
  expect(redone.reserveBottom).toBeCloseTo(expanded.reserveBottom, 0);
  expect(redone.boxMarginBottom).toBe(expanded.boxMarginBottom);
});
