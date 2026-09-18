const { test, expect } = require('@playwright/test');
const {
  COMPONENT_MATRIX,
  getWorkspaceTabIds,
  openComponentFromWelcome
} = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { activateTab, clickExampleButton } = require('../helpers/uiDriver');
const {
  collectLifecycleEvidence,
  registerIssueCollectors
} = require('../helpers/diagnostics');

test.describe('@nightly-owner-order repeated owner-order isolation', () => {
  test.describe.configure({ mode: 'parallel' });

  function hashSeed(value) {
    return Array.from(String(value || '')).reduce((seed, character) => (
      (seed * 31 + character.charCodeAt(0)) >>> 0
    ), 17);
  }

  function seededPermutation(values, seed) {
    const result = values.slice();
    let state = seed >>> 0;
    for (let index = result.length - 1; index > 0; index -= 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      const swapIndex = state % (index + 1);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  async function readOwnerEvidence(page, component, expectedTabId, readiness) {
    return page.evaluate(({ type, pageId, expected, readiness }) => {
      const workspace = window.Main?.session?.workspaceState || null;
      const active = workspace?.tabs?.find(tab => String(tab?.id || '') === String(workspace?.activeTabId || '')) || null;
      const root = active?.id
        ? window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type)
        : null;
      const pageRoot = document.querySelector(`#${pageId}:not([hidden])`);
      const session = window.Components?.[type]?.__testHooks?.getSession?.(active?.id)
        || window.Components?.[type]?.__testHooks?.getSessionForTab?.(active?.id)
        || null;
      return {
        activeTabId: active?.id || null,
        activeType: active?.type || null,
        sessionTabId: session?.tabId || null,
        rootTabId: root?.dataset?.workspaceTabId || root?.dataset?.tabId || null,
        rootMounted: !!root,
        rootVisible: !!root && root === pageRoot || !!root && root?.isConnected === true,
        sessionRevision: Number(workspace?.sessionRevision) || 0,
        payloadSignature: active?.payloadSignature || null,
        layoutSignature: active?.layoutSignature || null,
        readiness: readiness ? {
          ready: readiness.ready === true,
          phase: readiness.phase || null,
          ownerTabId: readiness.owner?.activeTabId || null,
          asyncGeneration: Number(readiness.asyncGeneration ?? readiness.owner?.asyncGeneration) || 0,
          asyncIdle: readiness.asyncIdle === true,
          payloadSignature: readiness.payloadSignature || readiness.owner?.payloadSignature || null,
          layoutSignature: readiness.layoutSignature || readiness.owner?.layoutSignature || null
        } : null,
        expectedTabId: expected
      };
    }, {
      type: component.type,
      pageId: component.pageId,
      expected: expectedTabId,
      readiness
    });
  }

  for (const component of COMPONENT_MATRIX) {
    test(`preserves ownership across deterministic randomized order for ${component.type}`, async ({ page }, testInfo) => {
      test.setTimeout(10 * 60_000);
      const issues = registerIssueCollectors(page);
      await installLocalCdnOverrides(page);
      await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('#welcomeScreen')).toBeVisible();

      const tabIds = [];
      for (let index = 0; index < 3; index += 1) {
        const before = new Set(await getWorkspaceTabIds(page, component.type));
        await openComponentFromWelcome(page, component, { first: index === 0 });
        if (index === 0) {
          await clickExampleButton(page, component);
        }
        const after = await getWorkspaceTabIds(page, component.type);
        const newTabId = after.find(id => !before.has(id));
        expect(newTabId).toBeTruthy();
        tabIds.push(newTabId);
      }

      const seed = hashSeed(`${component.type}:${testInfo.repeatEachIndex || 0}`);
      const randomized = seededPermutation(tabIds, seed);
      const sequences = [
        randomized,
        randomized.slice().reverse(),
        [randomized[1], randomized[2], randomized[0], randomized[2], randomized[0], randomized[1]]
      ];
      const evidence = [];
      for (const sequence of sequences) {
        for (const tabId of sequence) {
          const readiness = await activateTab(page, tabId, component);
          const owner = await readOwnerEvidence(page, component, tabId, readiness);
          owner.lifecycle = await collectLifecycleEvidence(page, {
            componentType: component.type,
            tabId,
            limit: 20
          });
          evidence.push(owner);
          expect(owner.activeTabId).toBe(tabId);
          expect(owner.activeType).toBe(component.type);
          expect(owner.sessionTabId).toBe(tabId);
          expect(owner.rootTabId).toBe(tabId);
          expect(owner.rootMounted).toBeTruthy();
          expect(owner.rootVisible).toBeTruthy();
          expect(owner.readiness.ready).toBeTruthy();
          expect(owner.readiness.ownerTabId).toBe(tabId);
          expect(owner.readiness.asyncGeneration).toBeGreaterThan(0);
          expect(owner.readiness.asyncIdle).toBeTruthy();
        }
      }

      await testInfo.attach(`${component.type}-owner-order.json`, {
        body: Buffer.from(JSON.stringify({ seed, tabIds, evidence }, null, 2), 'utf8'),
        contentType: 'application/json'
      });
      expect(issues.critical).toEqual([]);
    });
  }
});
