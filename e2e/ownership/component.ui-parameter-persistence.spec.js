const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const {
  COMPONENT_MATRIX,
  getActiveWorkspaceTabMeta,
  openComponentFromWelcome
} = require('../helpers/workspaceDriver');
const { clickExampleButton } = require('../helpers/uiDriver');
const { buildWorkspaceArchive, openWorkspaceArchiveBuffer } = require('../helpers/archiveDriver');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const {
  applyUiMutation,
  readActivePayload,
  readActiveDurableValue,
  waitForDurableValue
} = require('../helpers/uiMutationDriver');

test.describe.configure({ mode: 'serial' });

for (const component of COMPONENT_MATRIX) {
  test(`${component.type} UI mutations survive archive reopen`, async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible({ timeout: 20_000 });
    await openComponentFromWelcome(page, component, { first: true });
    await clickExampleButton(page, component, { requireMountedRoot: true });

    const activeBefore = await getActiveWorkspaceTabMeta(page);
    expect(activeBefore?.id, `${component.type}: no active component tab`).toBeTruthy();
    const baseline = await readActivePayload(page);
    expect(baseline?.type).toBe(component.type);

    const results = [];
    for (const mutation of component.mutationPlan.uiMutations) {
      const baselineValue = await readActiveDurableValue(page, mutation);
      const applied = await applyUiMutation(page, component, mutation, {
        expectedTabId: activeBefore.id,
        requirePublished: false
      });
      expect(applied.readiness?.ready, `${component.type}/${mutation.id} readiness`).toBe(true);
      expect(applied.readiness?.owner?.activeTabId).toBe(activeBefore.id);
      expect(applied.readiness?.owner?.asyncGeneration).toEqual(expect.any(Number));
      await waitForDurableValue(page, mutation, applied.expected);
      const canonical = await readActiveDurableValue(page, mutation);
      expect(canonical).toEqual(applied.expected);
      expect(canonical).not.toEqual(baselineValue);
      results.push({
        id: mutation.id,
        authority: mutation.authority || 'payload',
        path: mutation.path,
        before: applied.before,
        after: applied.after,
        canonical,
        readiness: applied.readiness
      });
    }

    const archive = await buildWorkspaceArchive(page);
    await openWorkspaceArchiveBuffer(page, Buffer.from(archive.base64, 'base64'), {
      componentType: component.type,
      fileName: `${component.type}-ui-mutations.graph`
    });
    const activeAfter = await getActiveWorkspaceTabMeta(page);
    const restoreReadiness = await waitForComponentOwnerReady(page, component, {
      expectedTabId: activeAfter?.id,
      requireMountedRoot: true,
      requirePublished: false,
      requireIdle: true,
      timeout: 60_000
    });

    for (const result of results) {
      const mutation = {
        authority: result.authority,
        path: result.path
      };
      await waitForDurableValue(page, mutation, result.canonical, { timeout: 60_000 });
      expect(await readActiveDurableValue(page, mutation), `${component.type}/${result.id} after reopen`).toEqual(result.canonical);
    }
    expect(restoreReadiness?.ready, `${component.type} restore readiness`).toBe(true);
    expect(restoreReadiness?.owner?.activeTabId).toBe(activeAfter?.id);
    await testInfo.attach(`${component.type}-ui-mutations.json`, {
      body: Buffer.from(JSON.stringify({ component: component.type, restoreReadiness, results }, null, 2), 'utf8'),
      contentType: 'application/json'
    });
  });
}
