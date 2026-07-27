const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const ARCHIVE_PATH = path.resolve(__dirname, '../__tests__/testfile2.graph');

async function activateNamedTab(page, title) {
  await page.locator('.workspace-tab', { hasText: title }).click();
  await page.waitForFunction(expectedTitle => (
    window.Main?.session?.getActiveTab?.()?.title === expectedTitle
    && window.Main?.session?.workspaceState?.loadedWorkspaces?.[
      window.Main.session.workspaceState.activeTabId
    ]?.tabId === window.Main.session.workspaceState.activeTabId
  ), title);
}

async function lifecycleEventCount(page) {
  return page.evaluate(() => window.Shared?.componentLifecycle?.getLifecycleEvents?.().length || 0);
}

async function waitForCacheRestoreToSettle(page, componentKey, fromIndex) {
  await page.waitForFunction(({ key, start }) => {
    const events = (window.Shared?.componentLifecycle?.getLifecycleEvents?.() || []).slice(start);
    return events.some(event => event.componentKey === key && event.action === 'saved-render-cache-restored')
      && events.some(event => event.componentKey === key && event.action === 'render-cache-restore-transaction-end');
  }, { key: componentKey, start: fromIndex });
  await page.evaluate(() => new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  return page.evaluate(({ key, start }) => (
    window.Shared?.componentLifecycle?.getLifecycleEvents?.() || []
  ).slice(start).filter(event => event.componentKey === key), {
    key: componentKey,
    start: fromIndex
  });
}

test('Box and ROC reuse saved render caches without post-restore redraw', async ({ page }) => {
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.Main?.tabs?.getSessionActionsContext);

  await page.locator('#workspaceSessionInput').setInputFiles(ARCHIVE_PATH);
  await waitForDocumentOpenComplete(page);
  await expect(page.locator('.workspace-tab.is-active')).toContainText('XY Plots');

  const rocEventStart = await lifecycleEventCount(page);
  await activateNamedTab(page, 'Classification Curves');
  const rocLifecycle = await waitForCacheRestoreToSettle(page, 'roc', rocEventStart);
  expect(rocLifecycle.some(event => event.action === 'saved-render-cache-restored')).toBe(true);
  expect(rocLifecycle.filter(event => event.action === 'draw-executed')).toEqual([]);

  const boxEventStart = await lifecycleEventCount(page);
  await activateNamedTab(page, 'Distribution Charts');
  const boxLifecycle = await waitForCacheRestoreToSettle(page, 'box', boxEventStart);
  expect(boxLifecycle.some(event => event.action === 'saved-render-cache-restored')).toBe(true);
  expect(boxLifecycle.filter(event => event.action === 'fallback-redraw-started')).toEqual([]);
  expect(issues.critical).toEqual([]);
});
