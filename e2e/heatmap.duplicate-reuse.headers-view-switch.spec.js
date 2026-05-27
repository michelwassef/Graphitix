const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function waitForHeatmapReady(page) {
  await page.waitForFunction(() => {
    const cells = document.querySelectorAll('#heatmapSvg [data-export-layer="heatmap-cells"] rect');
    return cells.length >= 9;
  }, null, { timeout: 60_000 });
}

async function duplicateHeatmapWithReuse(page) {
  await page.locator('#addWorkspaceTab').click();
  await page.locator('#graphSelectionGrid [data-graph-type="heatmap"]').first().click({ force: true });
  await expect(page.locator('#duplicatePrompt:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await page.locator('#duplicateReuse').click({ force: true });
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 20_000 });
}

async function activateTab(page, tabId) {
  await page.evaluate((id) => {
    document.querySelector(`#workspaceTabsList .workspace-tab[data-tab-id="${id}"]`)?.click();
  }, tabId);
  await page.waitForSelector('#heatmapPage:not([hidden])', { timeout: 20_000 });
}

async function readHeatmapState(page, sourceTabId = null) {
  return page.evaluate((sourceId) => {
    const workspace = window.Main?.session?.workspaceState || null;
    const activeTabId = workspace?.activeTabId || null;
    const sourceTab = sourceId
      ? workspace?.tabs?.find(tab => tab?.id === sourceId) || null
      : null;
    const heatmapState = window.Components?.heatmap?.__getState?.() || {};
    const hot = heatmapState.hot || null;
    return {
      activeTabId,
      drawToken: Number(heatmapState.drawToken || 0),
      modelType: heatmapState.lastRenderModel?.type || null,
      viewControlValue: document.querySelector('#heatmapView')?.value || null,
      payloadView: window.Components?.heatmap?.getPayload?.()?.config?.view || null,
      liveHeaderRow: Array.isArray(hot?.getData?.()?.[0]) ? hot.getData()[0].slice() : [],
      sourcePayloadHeaderRow: Array.isArray(sourceTab?.payload?.data?.[0]) ? sourceTab.payload.data[0].slice() : []
    };
  }, sourceTabId);
}

function trimTrailingEmptyCells(row) {
  if (!Array.isArray(row)) {
    return [];
  }
  let end = row.length;
  while (end > 0) {
    const value = row[end - 1];
    if (value != null && String(value).trim() !== '') {
      break;
    }
    end -= 1;
  }
  return row.slice(0, end);
}

test('heatmap duplicate reuse preserves headers and source tab view switch redraws to data values', async ({ page }) => {
  test.setTimeout(120_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true }
  );
  await clickExampleButtonIfPresent(page, 'heatmapLoadExample');
  await waitForHeatmapReady(page);

  const sourceTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
  expect(sourceTabId).toBeTruthy();
  const sourceBeforeDuplicate = await readHeatmapState(page, sourceTabId);
  expect(sourceBeforeDuplicate.liveHeaderRow.length).toBeGreaterThanOrEqual(8);

  await duplicateHeatmapWithReuse(page);
  await waitForHeatmapReady(page);

  const duplicateState = await readHeatmapState(page, sourceTabId);
  expect(trimTrailingEmptyCells(duplicateState.liveHeaderRow))
    .toEqual(trimTrailingEmptyCells(sourceBeforeDuplicate.liveHeaderRow));

  await activateTab(page, sourceTabId);
  const beforeSwitch = await readHeatmapState(page, sourceTabId);
  await page.selectOption('#heatmapView', 'values');
  await page.waitForFunction(() => {
    const state = window.Components?.heatmap?.__getState?.();
    return state?.lastRenderModel?.type === 'values';
  }, null, { timeout: 20_000 });
  const afterSwitch = await readHeatmapState(page, sourceTabId);

  expect(afterSwitch.activeTabId).toBe(sourceTabId);
  expect(afterSwitch.viewControlValue).toBe('values');
  expect(afterSwitch.payloadView).toBe('values');
  expect(afterSwitch.modelType).toBe('values');
  expect(afterSwitch.drawToken).toBeGreaterThan(beforeSwitch.drawToken);
  expect(issues.critical).toEqual([]);
});
