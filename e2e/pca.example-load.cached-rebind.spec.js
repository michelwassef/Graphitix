const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome
} = require('./helpers/workspaceHarness');

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
  await page.waitForFunction(() => window.Components?.pca?.ready === true, null, { timeout: 30000 });

  await openComponentFromWelcome(page, PCA_COMPONENT, { loadExample: true });

  await page.waitForFunction(() => {
    const component = window.Components?.pca;
    const hot = component?.getHotInstance?.();
    const data = hot?.getData?.() || [];
    const hasExampleData = data.some(row => Array.isArray(row) && row.some(value => value !== '' && value != null));
    const svg = document.querySelector('#pcaPlot #pcaSvg, #pcaPlot svg');
    return component?.ready === true && hasExampleData && !!svg;
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

  await page.waitForTimeout(500);
  expect(issues.critical).toEqual([]);
});
