const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

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
  await page.waitForFunction(() => window.Components?.scatter?.ready === true, null, { timeout: 30000 });

  await openComponentFromWelcome(page, SCATTER_COMPONENT, { loadExample: true });

  await page.waitForFunction(() => {
    const component = window.Components?.scatter;
    const hot = component?.__getActiveHot?.() || component?.__ensureHotForActiveTab?.();
    const data = hot?.getData?.() || [];
    const hasExampleData = data.some(row => Array.isArray(row) && row.some(value => value !== '' && value != null));
    const state = component?.__testGetState?.() || null;
    const plot = document.querySelector('#scatterPlot svg');
    return component?.ready === true
      && hasExampleData
      && !!plot
      && state?.drawInProgress !== true;
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

  await page.waitForTimeout(500);
  expect(issues.critical).toEqual([]);
});
