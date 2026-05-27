const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  registerIssueCollectors,
  openComponentFromWelcome,
  clickExampleButtonIfPresent
} = require('./helpers/workspaceHarness');

async function waitForActiveTabPayload(page) {
  await page.waitForFunction(() => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state?.activeTabId);
    return !!(active && active.payload && typeof active.payload === 'object');
  }, null, { timeout: 20_000 });
}

async function duplicateWithReuse(page, componentType, pageId) {
  await page.locator('#addWorkspaceTab').click();
  await page.locator(`#graphSelectionGrid [data-graph-type="${componentType}"]`).first().click({ force: true });
  await expect(page.locator('#duplicatePrompt:not([hidden])')).toBeVisible({ timeout: 20_000 });
  await page.locator('#duplicateReuse').click({ force: true });
  await page.waitForSelector(`#${pageId}:not([hidden])`, { timeout: 20_000 });
}

async function captureDuplicatePayloadComparison(page, sourceTabId) {
  return page.evaluate((sourceId) => {
    const state = window.Main?.session?.workspaceState;
    const duplicateTabId = state?.activeTabId || null;
    const sourceTab = state?.tabs?.find(tab => tab?.id === sourceId) || null;
    const duplicateTab = state?.tabs?.find(tab => tab?.id === duplicateTabId) || null;

    const safeJson = value => {
      try {
        return JSON.stringify(value);
      } catch (err) {
        return null;
      }
    };

    const sourceJson = safeJson(sourceTab?.payload || null);
    const duplicateJson = safeJson(duplicateTab?.payload || null);
    const sourcePayload = sourceJson ? JSON.parse(sourceJson) : null;
    const duplicatePayload = duplicateJson ? JSON.parse(duplicateJson) : null;

    const sourceData = sourcePayload?.data;
    const duplicateData = duplicatePayload?.data;
    const sourceHeaderRow = Array.isArray(sourceData?.[0]) ? sourceData[0] : null;
    const duplicateHeaderRow = Array.isArray(duplicateData?.[0]) ? duplicateData[0] : null;

    return {
      sourceTabId: sourceId,
      duplicateTabId,
      sourceType: sourceTab?.type || null,
      duplicateType: duplicateTab?.type || null,
      payloadJsonEqual: sourceJson === duplicateJson,
      sourcePayload,
      duplicatePayload,
      sourceHeaderRow,
      duplicateHeaderRow
    };
  }, sourceTabId);
}

for (const component of COMPONENT_MATRIX) {
  test(`duplicate reuse payload fidelity for ${component.type}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, component, { first: true });
    await clickExampleButtonIfPresent(page, component.exampleButtonId);

    const sourceTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(sourceTabId).toBeTruthy();

    await duplicateWithReuse(page, component.type, component.pageId);
    await waitForActiveTabPayload(page);
    await page.waitForFunction((sourceId) => {
      const state = window.Main?.session?.workspaceState;
      const source = state?.tabs?.find(tab => tab?.id === sourceId);
      return !!(source && source.payload && typeof source.payload === 'object');
    }, sourceTabId, { timeout: 20_000 });

    const comparison = await captureDuplicatePayloadComparison(page, sourceTabId);
    await testInfo.attach(`${component.type}.duplicate-reuse.payload-comparison.json`, {
      body: Buffer.from(JSON.stringify(comparison, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    expect(comparison.duplicateTabId).toBeTruthy();
    expect(comparison.duplicateTabId).not.toBe(sourceTabId);
    expect(comparison.sourceType).toBe(component.type);
    expect(comparison.duplicateType).toBe(component.type);
    expect(comparison.payloadJsonEqual).toBe(true);

    if (Array.isArray(comparison.sourceHeaderRow) || Array.isArray(comparison.duplicateHeaderRow)) {
      expect(comparison.duplicateHeaderRow).toEqual(comparison.sourceHeaderRow);
    }
    expect(issues.critical).toEqual([]);
  });
}
