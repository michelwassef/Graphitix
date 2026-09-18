const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { waitForComponentOwnerReady, waitForOwnerProjection } = require('../helpers/contractWaits');

const PCA_COMPONENT = {
  type: 'pca',
  pageId: 'pcaPage',
  exampleButtonId: 'pcaLoadExample'
};

test('PCA example load survives cached component DOM rebind and schedules an owner-scoped draw', async ({ page }) => {
  test.setTimeout(180000);
  await installLocalCdnOverrides(page);
  const issues = registerIssueCollectors(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

  await openComponentFromWelcome(page, PCA_COMPONENT, { first: true });
  await waitForComponentOwnerReady(page, PCA_COMPONENT, {
    requireMountedRoot: true,
    timeout: 30000
  });

  await openComponentFromWelcome(page, PCA_COMPONENT, { loadExample: true });

  await waitForOwnerProjection(page, PCA_COMPONENT, '#pcaPlot #pcaSvg, #pcaPlot svg', {
    requireMountedRoot: true,
    requireIdle: true,
    visible: true,
    timeout: 120000
  });
  await page.waitForFunction(() => {
    const component = window.Components?.pca;
    const hot = component?.getHotInstance?.();
    const data = hot?.getData?.() || [];
    const hasExampleData = data.some(row => Array.isArray(row) && row.some(value => value !== '' && value != null));
    return hasExampleData;
  }, null, { timeout: 120000 });

  const active = await page.evaluate(() => {
    const workspaceState = window.Main?.session?.workspaceState;
    const activeTab = workspaceState?.tabs?.find(tab => tab?.id === workspaceState.activeTabId) || null;
    const hot = window.Components?.pca?.getHotInstance?.();
    return {
      tabId: activeTab?.id || null,
      type: activeTab?.type || null,
      ready: window.Components?.pca?.ready === true,
      rows: hot?.getData?.()?.length || 0,
      hasSvg: !!document.querySelector('#pcaPlot #pcaSvg, #pcaPlot svg')
    };
  });

  expect(active.type).toBe('pca');
  expect(active.ready).toBe(true);
  expect(active.rows).toBeGreaterThan(1);
  expect(active.hasSvg).toBe(true);

  expect(issues.critical).toEqual([]);
});
