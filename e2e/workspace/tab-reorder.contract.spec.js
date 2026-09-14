const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

async function visibleTabIds(page) {
  return page.locator('#workspaceTabsList .workspace-tab[data-tab-id]').evaluateAll(nodes =>
    nodes.map(node => String(node.dataset.tabId || '').trim()).filter(Boolean)
  );
}

test('Workspace tab drag reorders tabs and keeps the moved tab identity', async ({ page }) => {
  test.setTimeout(90_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(page, { type: 'box', pageId: 'boxPage' }, { first: true });
  const boxTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  await openComponentFromWelcome(page, { type: 'line', pageId: 'linePage' }, { first: false });
  const lineTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);

  const before = await visibleTabIds(page);
  const boxIndex = before.indexOf(boxTabId);
  const lineIndex = before.indexOf(lineTabId);
  expect(boxIndex).toBeGreaterThanOrEqual(0);
  expect(lineIndex).toBeGreaterThan(boxIndex);

  const source = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${boxTabId}"]`);
  const target = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${lineTabId}"]`);
  const targetBox = await target.boundingBox();
  await source.dragTo(target, {
    targetPosition: { x: Math.max(1, (targetBox?.width || 20) - 2), y: (targetBox?.height || 20) / 2 }
  });

  const expected = before.slice();
  expected.splice(boxIndex, 1);
  expected.splice(lineIndex, 0, boxTabId);
  await expect.poll(() => visibleTabIds(page)).toEqual(expected);
  expect((await visibleTabIds(page)).indexOf(boxTabId)).toBe(lineIndex);
  expect(issues.critical).toEqual([]);
});
