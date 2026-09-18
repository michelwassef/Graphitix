const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const {
  COMPONENT_MATRIX,
  installOwnerPayloadDriver,
  openComponentFromWelcome,
  getWorkspaceTabIds
} = require('../helpers/workspaceDriver');
const { clickExampleButton } = require('../helpers/uiDriver');

test.describe.configure({ mode: 'parallel' });

async function openComponent(page, componentCase) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
  await installOwnerPayloadDriver(page);
  const before = new Set(await getWorkspaceTabIds(page, componentCase.type));
  await openComponentFromWelcome(page, componentCase, { first: true });
  await page.waitForSelector(`#${componentCase.pageId}:not([hidden])`, { timeout: 30_000 });
  await clickExampleButton(page, componentCase);
  const tabId = (await getWorkspaceTabIds(page, componentCase.type)).find(id => !before.has(id));
  if (!tabId) throw new Error(`${componentCase.type}: component tab was not created`);
  return tabId;
}

for (const componentCase of COMPONENT_MATRIX) {
  test(`${componentCase.type} declared mutations survive one batched archive reopen`, async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    await installLocalCdnOverrides(page);
    const tabId = await openComponent(page, componentCase);
    const parameterPaths = String(process.env.PARAMETER_PATHS || '').split(',').map(value => value.trim()).filter(Boolean);
    const result = await page.evaluate(async ({ type, ownerTabId, parameterPaths, mutationPlan }) => {
      return window.GraphitixOwnerPayloadDriver.runPersistenceMatrix({
        type,
        tabId: ownerTabId,
        parameterPaths,
        mutationPlan
      });
    }, { type: componentCase.type, ownerTabId: tabId, parameterPaths, mutationPlan: componentCase.mutationPlan });
    await testInfo.attach(`${componentCase.type}-parameter-persistence-matrix.json`, {
      body: Buffer.from(JSON.stringify(result, null, 2), 'utf8'),
      contentType: 'application/json'
    });
    expect(result.mutationPlanId, `${componentCase.type}: explicit mutation plan was not used`).toBe(`${componentCase.type}:explicit-v1`);
    expect(result.parameterCount, `${componentCase.type}: no declared persistence mutations were executed`).toBe(componentCase.mutationPlan.mutations.length);
    expect(result.uncovered, `${componentCase.type}: declared mutation lacks a valid value`).toEqual([]);
    expect(result.exercisedCount, `${componentCase.type}: not every declared mutation was exercised`).toBe(result.parameterCount);
    expect(result.archiveCount, `${componentCase.type}: parameter batches must share one archive/reopen`).toBe(1);
    expect(result.failures, `${componentCase.type}: independent parameter persistence defects`).toEqual([]);
  });
}
