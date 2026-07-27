const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const {
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  waitForDocumentOpenComplete
} = require('./helpers/workspaceHarness');

const TMP_DIR = path.resolve(__dirname, '.tmp');
const active = selector => `#boxPage:not([hidden]) ${selector}`;

async function captureWorkspaceArchive(page, name) {
  const base64 = await page.evaluate(async () => {
    const ctx = window.Main?.tabs?.getSessionActionsContext?.();
    const blob = await window.Main?.sessionActions?.buildWorkspaceArchiveBlob?.(ctx, {
      scope: 'workspace',
      snapshotKind: 'document-snapshot',
      compression: 'STORE',
      reason: 'e2e-box-stats-reporting-sections'
    });
    if (!blob) throw new Error('buildWorkspaceArchiveBlob returned no blob');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  });
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const filePath = path.join(TMP_DIR, name);
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  return filePath;
}

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

test('Box diagnostic and reporting sections survive tab switching and archive reopen', async ({ page }) => {
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

  const archivePath = await captureWorkspaceArchive(page, 'box-stats-reporting-sections.graph');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#workspaceSessionInput').setInputFiles(archivePath);
  await waitForDocumentOpenComplete(page);
  await expect(page.locator('#boxPage:not([hidden])')).toBeVisible({ timeout: 40_000 });
  await assertStatsSections(page);
  expect(issues.critical.filter(entry => entry.kind !== 'requestfailed')).toEqual([]);
});
