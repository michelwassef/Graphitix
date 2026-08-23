const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides, openComponentFromWelcome } = require('./helpers/workspaceHarness');

async function waitForScatterIdle(page) {
  await page.waitForFunction(() => {
    const state = window.Components?.scatter?.__testGetState?.();
    return state && state.drawInProgress !== true && !state.pendingDrawOpts && !state.pendingDrawReasons;
  }, null, { timeout: 60_000 });
}

test('Scatter Global shape undo is atomic for hundreds of points', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });

  await page.evaluate(() => {
    const matrix = [['Sample', 'X', 'Y']];
    for(let index = 0; index < 600; index += 1){
      matrix.push([`P${index}`, index % 30, Math.floor(index / 30)]);
    }
    const scatter = window.Components.scatter;
    scatter.__ensureHotForActiveTab().loadData(matrix);
    scatter.draw({ reason: 'e2e-global-shape-undo' });
  });
  await waitForScatterIdle(page);

  await page.locator('#scatterPlot svg [data-plot-point="1"]').first().click({ force: true });
  const scope = page.locator('.scatter-point-controls select').first();
  await scope.selectOption('global');
  await page.locator('.scatter-point-controls .shared-shape-color-swatch').click();
  await page.locator('.shared-color-picker__shape-input[value="square"]').check({ force: true });
  await waitForScatterIdle(page);
  await expect.poll(() => page.evaluate(() => window.Components.scatter.getPayload().config.globalShape)).toBe('square');

  const undoDurationMs = await page.evaluate(() => {
    const started = performance.now();
    const undone = window.Shared.undoManager.undo();
    return { undone, duration: performance.now() - started };
  });
  expect(undoDurationMs.undone).toBe(true);
  expect(undoDurationMs.duration).toBeLessThan(1000);
  await waitForScatterIdle(page);
  await expect.poll(() => page.evaluate(() => window.Components.scatter.getPayload().config.globalShape)).toBeNull();

  const redoDurationMs = await page.evaluate(() => {
    const started = performance.now();
    const redone = window.Shared.undoManager.redo();
    return { redone, duration: performance.now() - started };
  });
  expect(redoDurationMs.redone).toBe(true);
  expect(redoDurationMs.duration).toBeLessThan(1000);
  await waitForScatterIdle(page);
  await expect.poll(() => page.evaluate(() => window.Components.scatter.getPayload().config.globalShape)).toBe('square');
});
