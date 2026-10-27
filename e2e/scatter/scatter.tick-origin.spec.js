const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');

async function readAxes(page) {
  await waitForComponentOwnerReady(page, 'scatter', { requireIdle: true, requireMountedRoot: true });
  return page.evaluate(() => {
    const payload = window.Components.scatter.getPayload();
    const ticks = role => Array.from(document.querySelectorAll(`#scatterPlot svg text[data-font-role="${role}"]`))
      .map(node => Number(node.textContent)).sort((a, b) => a - b);
    return {
      x: ticks('xTick'), y: ticks('yTick'),
      originX: payload.config.axis.tickStartX, originY: payload.config.axis.tickStartY
    };
  });
}

test('Scatter preserves automatic and explicit tick origins through redraw and reopen', async ({ page }) => {
  test.setTimeout(120_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'scatter', pageId: 'scatterPage' }, { first: true });
  for (const origin of [null, '', undefined, 0, 0.5, null]) {
    await page.evaluate(async value => {
      const payload = window.Components.scatter.getPayload();
      payload.data = [['Label', 'X', 'Y'], ['', 1, 1], ['', 2, 2], ['', 3, 3]];
      Object.assign(payload.config, { xMin: '0.3', xMax: '3.3', yMin: '0.3', yMax: '3.3', equalScaleAxes: false, equalAxes: false });
      Object.assign(payload.config.axis, { tickIntervalX: 1, tickIntervalY: 1, tickStartX: value, tickStartY: value });
      const tab = window.Main.session.getActiveTab();
      window.Main.session.assignTabPayload(tab, payload, { reason: 'e2e-scatter-tick-origin-hydration' });
      await window.Components.scatter.loadFromPayload(payload, {
        tabId: window.Main.session.workspaceState.activeTabId, reason: 'e2e-scatter-tick-origin'
      });
    }, origin);
    const expectedOrigin = origin === 0 || origin === 0.5 ? origin : null;
    const ticks = expectedOrigin === null ? [0.3, 1.3, 2.3, 3.3]
      : expectedOrigin === 0 ? [1, 2, 3] : [0.5, 1.5, 2.5];
    await expect.poll(() => readAxes(page)).toEqual({ x: ticks, y: ticks, originX: expectedOrigin, originY: expectedOrigin });
  }
  const before = await readAxes(page);
  const archive = await buildWorkspaceArchive(page, { scope: 'workspace', reason: 'scatter-tick-origin-reopen' });
  await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), { componentType: 'scatter' });
  expect(await readAxes(page)).toEqual(before);
});
