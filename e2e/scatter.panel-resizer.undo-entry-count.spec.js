const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides, registerIssueCollectors } = require('./helpers/workspaceHarness');

async function dragPanelResizerOnce(page) {
  const handle = page.locator('#scatterPage:not([hidden]) .panel-resizer').first();
  await expect(handle).toHaveCount(1);
  const box = await handle.boundingBox();
  if (!box) throw new Error('Missing scatter panel resizer');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 120, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(700);
}

test('scatter panel drag records exactly one undo entry per drag', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);

  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible();
  await page.locator('#graphSelectionGrid [data-graph-type="scatter"]').first().click({ force: true });
  await page.waitForSelector('#scatterPage:not([hidden])', { timeout: 20_000 });
  await page.locator('#scatterLoadExample').click({ force: true });
  await page.waitForTimeout(600);

  const activeTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(activeTabId).toBeTruthy();
  await page.evaluate((tabId) => {
    window.Shared?.undoManager?.clearTab?.(tabId, { reason: 'e2e-scatter-panel-drag-clear' });
  }, activeTabId);

  await dragPanelResizerOnce(page);

  const history = await page.evaluate((tabId) => window.Shared?.undoManager?.getTabHistoryInfo?.(tabId) || null, activeTabId);
  expect(history?.stackLength).toBe(1);
  expect(Array.isArray(history?.labels) ? history.labels[0] : '').toBe('panel-layout:scatter');

  expect(issues.critical).toEqual([]);
});

