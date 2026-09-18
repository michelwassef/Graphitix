const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const {
  COMPONENT_MATRIX,
  installOwnerPayloadDriver,
  openComponentFromWelcome
} = require('../helpers/workspaceDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');
const { clickExampleButton } = require('../helpers/uiDriver');

test.describe.configure({ mode: 'parallel' });

function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function openComponentTab(page, component, first) {
  await openComponentFromWelcome(page, component, { first });
  await clickExampleButton(page, component, { requireMountedRoot: true });
}

for (const component of COMPONENT_MATRIX) {
  test(`${component.type} declared mutations remain isolated through archive reopen`, async ({ page }, testInfo) => {
    test.setTimeout(10 * 60_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();
    await installOwnerPayloadDriver(page);

    const beforeFirst = new Set(await getWorkspaceTabIds(page));
    await openComponentTab(page, component, true);
    const afterFirst = await getWorkspaceTabIds(page);
    const tabAId = afterFirst.find(id => !beforeFirst.has(id));
    expect(tabAId).toBeTruthy();

    const beforeSecond = new Set(afterFirst);
    await openComponentTab(page, component, false);
    const afterSecond = await getWorkspaceTabIds(page);
    const tabBId = afterSecond.find(id => !beforeSecond.has(id));
    expect(tabBId).toBeTruthy();
    expect(tabBId).not.toBe(tabAId);

    const parameterIsolation = await page.evaluate(async ({ type, tabAId, tabBId, parameterPaths, mutationPlan }) => {
      return window.GraphitixOwnerPayloadDriver.runSameTypeIsolation({
        type,
        tabAId,
        tabBId,
        parameterPaths,
        mutationPlan,
        reopen: true
      });
    }, {
      type: component.type,
      tabAId,
      tabBId,
      parameterPaths: String(process.env.PARAMETER_PATHS || '').split(',').map(value => value.trim()).filter(Boolean),
      mutationPlan: component.mutationPlan
    });
    await testInfo.attach(`${component.type}-same-type-parameter-isolation.json`, {
      body: Buffer.from(JSON.stringify(parameterIsolation, null, 2), 'utf8'),
      contentType: 'application/json'
    });
    expect(parameterIsolation.mutationPlanId, `${component.type}: explicit mutation plan was not used`).toBe(`${component.type}:explicit-v1`);
    expect(parameterIsolation.parameterCount, `${component.type}: no declared mutations were discovered`).toBe(component.mutationPlan.mutations.length);
    expect(parameterIsolation.uncovered, `${component.type}: declared mutation lacks a valid value`).toEqual([]);
    expect(parameterIsolation.exercisedCount, `${component.type}: not every declared mutation was exercised independently`).toBe(parameterIsolation.parameterCount);
    expect(parameterIsolation.archiveCount, `${component.type}: parameter batches must share one archive/reopen`).toBe(1);
    expect(parameterIsolation.failures, `${component.type}: same-type parameter isolation defects`).toEqual([]);
    expect(issues.critical).toEqual([]);
  });
}
