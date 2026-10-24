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
const requestedMutationIds = String(process.env.UI_MUTATION_IDS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);

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

    const mutations = component.mutationPlan.uiMutations.filter(mutation => !requestedMutationIds.length
      || requestedMutationIds.includes(mutation.id));
    expect(mutations.length, `${component.type}: selected UI mutation plan is empty`).toBeGreaterThan(0);

    const results = [];
    for (const mutation of mutations) {
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
      if(component.type === 'heatmap' && result.id === 'heatmap.color-scheme'){
        const restoredScheme = await page.evaluate(() => {
          const workspace = window.Main?.session?.workspaceState || null;
          const tab = workspace?.tabs?.find(item => String(item?.id || '') === String(workspace?.activeTabId || '')) || null;
          const session = tab?.id ? window.Components?.heatmap?.__testHooks?.getSession?.(tab.id) : null;
          const root = document.querySelector('#heatmapPage:not([hidden])');
          return {
            tabId: tab?.id || null,
            sessionTabId: session?.tabId || null,
            payloadScheme: tab?.payload?.config?.colorScheme || null,
            controlScheme: root?.querySelector('#heatmapColorSchemeSelect')?.value || null,
            payloadDendrogramColor: tab?.payload?.config?.dendrogram?.color || null,
            sessionDendrogramColor: session?.state?.dendrogramSettings?.color || null,
            renderedDendrogramColor: root?.querySelector('#heatmapSvg .heatmap-dendrogram')?.getAttribute('stroke') || null,
            displayedScheme: window.Shared?.colorSchemes?.resolveDisplayedSchemeIdForType?.(
              'heatmap',
              { captureLive: true }
            ) || null
          };
        });
        expect(restoredScheme.sessionTabId).toBe(restoredScheme.tabId);
        expect(restoredScheme.payloadScheme).toBe(result.canonical);
        expect(restoredScheme.controlScheme).toBe(result.canonical);
        expect(restoredScheme.sessionDendrogramColor).toBe(restoredScheme.payloadDendrogramColor);
        expect(restoredScheme.renderedDendrogramColor).toBe(restoredScheme.payloadDendrogramColor);
        expect(restoredScheme.displayedScheme).toBe(result.canonical);
      }
    }
    expect(restoreReadiness?.ready, `${component.type} restore readiness`).toBe(true);
    expect(restoreReadiness?.owner?.activeTabId).toBe(activeAfter?.id);
    await testInfo.attach(`${component.type}-ui-mutations.json`, {
      body: Buffer.from(JSON.stringify({ component: component.type, restoreReadiness, results }, null, 2), 'utf8'),
      contentType: 'application/json'
    });
  });
}
