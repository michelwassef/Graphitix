const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  installLocalCdnOverrides,
  installParameterIsolationHarness,
  openComponentFromWelcome,
  clickExampleButtonIfPresent,
  getWorkspaceTabIds
} = require('./helpers/workspaceHarness');

async function openComponent(page, componentCase) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await installParameterIsolationHarness(page);
  const before = new Set(await getWorkspaceTabIds(page, componentCase.type));
  await openComponentFromWelcome(page, componentCase, { first: true });
  await page.waitForSelector(`#${componentCase.pageId}:not([hidden])`, { timeout: 30_000 });
  await clickExampleButtonIfPresent(page, componentCase.exampleButtonId);
  const tabId = (await getWorkspaceTabIds(page, componentCase.type)).find(id => !before.has(id));
  if (!tabId) throw new Error(`${componentCase.type}: component tab was not created`);
  return tabId;
}

for (const componentCase of COMPONENT_MATRIX) {
  test(`${componentCase.type} parameters survive one batched archive reopen`, async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    await installLocalCdnOverrides(page);
    const tabId = await openComponent(page, componentCase);
    const parameterPaths = String(process.env.PARAMETER_PATHS || '').split(',').map(value => value.trim()).filter(Boolean);
    const result = await page.evaluate(async ({ type, ownerTabId, parameterPaths }) => {
      return window.GraphitixParameterIsolation.runPersistenceMatrix({ type, tabId: ownerTabId, parameterPaths });
    }, { type: componentCase.type, ownerTabId: tabId, parameterPaths });
    await testInfo.attach(`${componentCase.type}-parameter-persistence-matrix.json`, {
      body: Buffer.from(JSON.stringify(result, null, 2), 'utf8'),
      contentType: 'application/json'
    });
    expect(result.parameterCount, `${componentCase.type}: no user-visible parameter leaves were discovered`).toBeGreaterThan(0);
    expect(result.uncovered, `${componentCase.type}: user-state leaves lack an independent valid-value adapter`).toEqual([]);
    expect(result.exercisedCount, `${componentCase.type}: parameter matrix did not exercise every discovered user-state leaf`).toBe(result.parameterCount);
    expect(result.archiveCount, `${componentCase.type}: parameter batches must share one archive/reopen`).toBe(1);
    expect(result.failures, `${componentCase.type}: independent parameter persistence defects`).toEqual([]);
  });
}
