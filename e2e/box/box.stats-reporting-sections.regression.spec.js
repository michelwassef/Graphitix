const { test, expect } = require('@playwright/test');
const {
  openComponentFromWelcome,
  waitForDocumentOpenComplete
} = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { saveWorkspaceArchive } = require('../helpers/archiveDriver');

const active = selector => `#boxPage:not([hidden]) ${selector}`;

async function assertStatsSections(page) {
  const advanced = page.locator(active('#statsResults > .stats-results-advanced-panel'));
  const report = page.locator(active('#boxStatsReportHost > .stats-report-panel'));
  await expect(advanced).toBeVisible({ timeout: 20_000 });
  await expect(advanced.locator(':scope > summary')).toHaveText('Diagnostics and model details');
  await expect(advanced.locator('.stats-assumption-container')).toHaveCount(1);
  await expect(report).toBeVisible({ timeout: 20_000 });
  await expect(report).toContainText('Reporting and reproducibility');
  await expect(advanced.locator('.stats-report-panel')).toHaveCount(0);
  const order = await page.evaluate(() => {
    const root = document.querySelector('#boxPage:not([hidden])');
    const fieldset = root?.querySelector('#statsResults')?.closest('fieldset');
    return {
      reportHostLast: fieldset?.lastElementChild?.id === 'boxStatsReportHost',
      diagnosticsBeforeDescriptives: !!root?.querySelector('#statsResults')
        && !!root?.querySelector('#statsTable')
        && !!(root.querySelector('#statsResults').compareDocumentPosition(root.querySelector('#statsTable')) & Node.DOCUMENT_POSITION_FOLLOWING),
      reportModel: !!window.Components?.box?.__getState?.()?.statsLastReport,
      panelModel: !!window.Components?.box?.__getState?.()?.statsPanelModel
    };
  });
  expect(order.reportHostLast).toBe(true);
  expect(order.diagnosticsBeforeDescriptives).toBe(true);
  expect(order.reportModel).toBe(true);
}

test('Box diagnostic and reporting sections survive tab switching and archive reopen', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const issues = registerIssueCollectors(page);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await openComponentFromWelcome(
    page,
    { type: 'box', pageId: 'boxPage', exampleButtonId: 'boxLoadExample' },
    { first: true, loadExample: true }
  );
  const boxTabId = await page.evaluate(() => String(window.Main?.session?.workspaceState?.activeTabId || ''));
  await page.locator(active('#boxComputeStats')).click();
  await expect(page.locator(active('#boxStatsStatus'))).toContainText('Statistics up to date.', { timeout: 40_000 });
  await assertStatsSections(page);

  await openComponentFromWelcome(
    page,
    { type: 'scatter', pageId: 'scatterPage', exampleButtonId: 'scatterLoadExample' },
    { first: false, loadExample: true }
  );
  await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${boxTabId}"]`).click({ force: true });
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await assertStatsSections(page);

  const archivePath = (await saveWorkspaceArchive(
    page,
    testInfo.outputPath('box-stats-reporting-sections.graph'),
    {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-box-stats-reporting-sections'
    }
  )).filePath;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 40_000 });
  await assertStatsSections(page);
  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
