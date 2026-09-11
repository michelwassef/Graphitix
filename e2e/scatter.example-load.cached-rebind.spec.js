const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('./helpers/vendorOverrides');
const { openComponentFromWelcome } = require('./helpers/workspaceDriver');
const { registerIssueCollectors } = require('./helpers/diagnostics');
const { waitForComponentOwnerReady, waitForOwnerProjection } = require('./helpers/contractWaits');

const SCATTER_COMPONENT = {
  type: 'scatter',
  pageId: 'scatterPage',
  exampleButtonId: 'scatterLoadExample'
};

test('scatter example load survives cached component DOM rebind and schedules a draw', async ({ page }) => {
  test.setTimeout(180000);
  await installLocalCdnOverrides(page);
  const issues = registerIssueCollectors(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(page, SCATTER_COMPONENT, { first: true });
  await waitForComponentOwnerReady(page, SCATTER_COMPONENT, {
    requireMountedRoot: true,
    timeout: 30000
  });

  await openComponentFromWelcome(page, SCATTER_COMPONENT, { loadExample: true });

  await waitForOwnerProjection(page, SCATTER_COMPONENT, '#scatterPlot svg', {
    requireMountedRoot: true,
    requirePublished: true,
    requireIdle: true,
    visible: true,
    timeout: 120000
  });
  await page.waitForFunction(() => {
    const component = window.Components?.scatter;
    const hot = component?.__getActiveHot?.() || component?.__ensureHotForActiveTab?.();
    const data = hot?.getData?.() || [];
    const hasExampleData = data.some(row => Array.isArray(row) && row.some(value => value !== '' && value != null));
    const state = component?.__testGetState?.() || null;
    return hasExampleData && state?.drawInProgress !== true;
  }, null, { timeout: 120000 });

  const active = await page.evaluate(() => {
    const workspaceState = window.Main?.session?.workspaceState;
    const activeTab = workspaceState?.tabs?.find(tab => tab?.id === workspaceState.activeTabId) || null;
    const hot = window.Components?.scatter?.__getActiveHot?.() || window.Components?.scatter?.__ensureHotForActiveTab?.();
    return {
      tabId: activeTab?.id || null,
      type: activeTab?.type || null,
      ready: window.Components?.scatter?.ready === true,
      rows: hot?.getData?.()?.length || 0,
      hasSvg: !!document.querySelector('#scatterPlot svg')
    };
  });

  expect(active.type).toBe('scatter');
  expect(active.ready).toBe(true);
  expect(active.rows).toBeGreaterThan(1);
  expect(active.hasSvg).toBe(true);

  expect(issues.critical).toEqual([]);
});
