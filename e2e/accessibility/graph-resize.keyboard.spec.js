const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog');

async function readGraphContentState(graph){
  return graph.evaluate(box => {
    const svg = Array.from(box.querySelectorAll('svg')).find(node => !node.ownerSVGElement
      && !node.closest('.resizer-control-tray, .resizer-bottom-tray')
      && node.dataset.graphFramePublication !== 'staged');
    const canvas = Array.from(box.querySelectorAll('canvas')).find(node => !node.closest('.resizer-control-tray, .resizer-bottom-tray'));
    const rendered = svg || canvas;
    const rect = rendered?.getBoundingClientRect?.();
    if(!rendered || !rect || rect.width <= 0 || rect.height <= 0){
      return { visible: false, hasMarks: false };
    }
    const hasMarks = svg
      ? !!svg.querySelector('path, line, rect, circle, ellipse, polygon, polyline, text')
      : canvas.width > 0 && canvas.height > 0;
    return {
      visible: getComputedStyle(rendered).visibility === 'visible'
        && getComputedStyle(rendered).display !== 'none'
        && Number(getComputedStyle(rendered).opacity) > 0,
      hasMarks
    };
  });
}

for (const component of COMPONENT_CATALOG) {
  test(`${component.type} graph width and height are keyboard adjustable`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requireIdle: true });

    const graph = page.locator(`#${component.pageId}:not([hidden]) .svgbox`).first();
    const graphFrame = graph.locator('xpath=..');
    const options = graphFrame.locator('.graph-controls-header .resizer-options-summary');
    await expect(options).toBeVisible();
    await options.click();
    await page.evaluate(() => window.Shared?.undoManager?.clear?.({ all: false, reason: 'e2e-keyboard-resize-reset' }));

    for (const dimension of ['width', 'height']) {
      const field = page.getByRole('spinbutton', {
        name: dimension === 'width' ? 'Graph width in pixels' : 'Graph height in pixels'
      });
      await expect(field).toBeVisible();

      const before = await graph.boundingBox();
      const currentValue = Number(await field.inputValue());
      expect(Number.isFinite(currentValue)).toBe(true);
      await field.focus();
      await field.press('Control+A');
      await field.pressSequentially(String(Math.round(currentValue + 40)));
      const during = await graph.boundingBox();
      expect(during?.[dimension], `${component.type} ${dimension} should change while the field is edited`)
        .toBeGreaterThan(before[dimension] + 25);
      expect(await readGraphContentState(graph)).toEqual({ visible: true, hasMarks: true });
      await field.press('Enter');

      await expect.poll(async () => (await graph.boundingBox())?.[dimension]).toBeGreaterThan(
        before[dimension] + 25
      );
      await waitForComponentOwnerReady(page, component, { requireMountedRoot: true, requireIdle: true });
      await expect(field).toBeFocused();
      expect(await readGraphContentState(graph)).toEqual({ visible: true, hasMarks: true });

      if (component.type === 'scatter' && dimension === 'width') {
        const ownerTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
        const savedWidth = await page.evaluate(() => {
          const workspace = window.Main?.session?.workspaceState || {};
          const tab = workspace.tabs?.find(candidate => candidate?.id === workspace.activeTabId);
          return tab?.layoutState?.svgBox?.style?.width || '';
        });
        expect(savedWidth).toMatch(/px$/);
        expect(await page.evaluate(id => window.Shared?.undoManager?.canUndo?.({ tabId: id }) === true, ownerTabId))
          .toBe(true);
        expect(await page.evaluate(id => window.Shared?.undoManager?.undo?.({ tabId: id }) === true, ownerTabId))
          .toBe(true);
        await expect.poll(async () => (await graph.boundingBox())?.width).toBeCloseTo(before.width, 0);
        expect(await page.evaluate(id => window.Shared?.undoManager?.redo?.({ tabId: id }) === true, ownerTabId))
          .toBe(true);
        await expect.poll(async () => (await graph.boundingBox())?.width).toBeCloseTo(during.width, 0);
      }
    }
  });
}
