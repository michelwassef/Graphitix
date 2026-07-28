const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  openComponentFromWelcome,
  registerIssueCollectors
} = require('./helpers/workspaceHarness');

function buildHeavyHeatmapTsv(rowCount = 1000) {
  const rows = ['Gene\tS1\tS2\tS3\tS4'];
  for (let index = 0; index < rowCount; index += 1) {
    rows.push(`Gene_${index}\t${index + 1}\t${index + 2}\t${index + 3}\t${index + 4}`);
  }
  return rows.join('\n');
}

test('first heavy Heatmap paste supersedes a pending projection and survives tab switching', async ({ page }) => {
  test.setTimeout(150_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'heatmap', pageId: 'heatmapPage', exampleButtonId: 'heatmapLoadExample' },
    { first: true, loadExample: false }
  );
  await page.waitForFunction(() => !!window.Components?.heatmap?.ready && !!window.__LAST_HEATMAP_HOT__);
  await page.locator('#heatmapView').selectOption('values');

  const heatmapTabId = await page.evaluate(() => {
    const tab = window.Main?.session?.getActiveTab?.();
    const hot = window.__LAST_HEATMAP_HOT__;
    if (!tab?.id || !hot) {
      throw new Error('Heatmap owner or table is unavailable');
    }
    hot.selectCell?.(0, 0, 0, 0);
    window.__heatmapFirstPasteTransaction = window.Shared.hot.beginOwnerProjectionTransaction({
      hotInstance: hot,
      reason: 'table-import'
    });
    if (!window.__heatmapFirstPasteTransaction) {
      throw new Error('Unable to start owner projection transaction');
    }
    return tab.id;
  });

  const tsv = buildHeavyHeatmapTsv();
  await page.evaluate((text) => {
    const host = document.getElementById('heatmapHot');
    if (!host) {
      throw new Error('Heatmap AG Grid host is unavailable');
    }
    const transfer = new DataTransfer();
    transfer.setData('text/plain', text);
    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(pasteEvent, 'clipboardData', { value: transfer });
    host.dispatchEvent(pasteEvent);
  }, tsv);

  await page.waitForFunction((tabId) => {
    const workspaceState = window.Main?.session?.workspaceState;
    const tab = workspaceState?.tabs?.find(candidate => candidate?.id === tabId);
    const transaction = window.__heatmapFirstPasteTransaction;
    const lastRow = tab?.payload?.data?.[1000] || [];
    return workspaceState?.sessionUserDirty === true
      && lastRow[0] === 'Gene_999'
      && window.Shared.hot.isOwnerProjectionTransactionCurrent(transaction) === false
      && window.Shared.hot.getLastOwnerProjectionTransaction(tab)?.interruptedByUserMutation === true;
  }, heatmapTabId, { timeout: 30_000 });

  await page.waitForFunction(() => {
    const svg = document.getElementById('heatmapSvg');
    const overlay = document.querySelector('#heatmapGraphPanel .venn-loading-overlay:not([hidden])');
    return !overlay
      && svg?.dataset?.heatmapModelType === 'values'
      && window.Components?.heatmap?.__getState?.()?.lastStats?.rowCount === 1000;
  }, null, { timeout: 90_000 });

  await page.locator('#workspaceTabsList .workspace-tab').filter({ hasText: 'Welcome' }).click();
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${heatmapTabId}"]`).click();
  await page.waitForFunction(() => !!window.Components?.heatmap?.ready && !!window.__LAST_HEATMAP_HOT__);

  const restored = await page.evaluate((tabId) => {
    const tab = window.Main?.session?.workspaceState?.tabs?.find(candidate => candidate?.id === tabId);
    const hot = window.__LAST_HEATMAP_HOT__;
    return {
      payloadLastLabel: tab?.payload?.data?.[1000]?.[0] || null,
      tableLastLabel: hot?.getDataAtCell?.(1000, 0) || null,
      rowCount: window.Components?.heatmap?.__getState?.()?.lastStats?.rowCount || 0,
      graphType: document.getElementById('heatmapSvg')?.dataset?.heatmapModelType || null
    };
  }, heatmapTabId);

  expect(restored).toEqual({
    payloadLastLabel: 'Gene_999',
    tableLastLabel: 'Gene_999',
    rowCount: 1000,
    graphType: 'values'
  });
  expect(issues.critical).toEqual([]);
});
