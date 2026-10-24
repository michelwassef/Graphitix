const { test, expect } = require('@playwright/test');
const { waitForComponentOwnerReady } = require('../helpers/contractWaits');
const { openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

const AXIS_CONTROLS = [
  '.resizer-axeslength-checkbox--equal-length',
  '.resizer-axeslength-checkbox--equal-scale',
  '.resizer-axeslength-checkbox--variance'
];

for (const component of [
  { type: 'line', pageId: 'linePage', statePath: 'viewState' },
  { type: 'scatter', pageId: 'scatterPage', statePath: 'view' }
]) {
  test(`${component.type} inactive axes-length controls cannot change the active same-type tab`, async ({ page }) => {
    test.setTimeout(120_000);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    const tabAId = await page.evaluate(() => window.Main?.session?.getActiveTab?.()?.id || null);
    expect(tabAId).toBeTruthy();
    const controlsReady = await page.evaluate(({ tabId, type, selectors }) => {
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(tabId, type) || null;
      const controls = selectors.map(selector => root?.querySelector(selector) || null);
      if (controls.some(control => !control)) return false;
      window.__staleAxesControls = controls;
      return true;
    }, { tabId: tabAId, type: component.type, selectors: AXIS_CONTROLS });
    expect(controlsReady).toBe(true);

    await openComponentFromWelcome(page, component, { first: false, loadExample: true });
    const tabBId = await page.evaluate(() => window.Main?.session?.getActiveTab?.()?.id || null);
    expect(tabBId).toBeTruthy();
    expect(tabBId).not.toBe(tabAId);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true });

    const before = await page.evaluate(({ type, tabId, statePath }) => {
      const hooks = window.Components?.[type]?.__testHooks || {};
      const session = hooks.getSessionForTab?.(tabId) || hooks.getSession?.(tabId) || null;
      return session?.state?.[statePath]
        ? {
            equalAxes: !!session.state[statePath].equalAxes,
            equalScaleAxes: !!session.state[statePath].equalScaleAxes,
            axesVarianceScaled: !!session.state[statePath].axesVarianceScaled
          }
        : null;
    }, { type: component.type, tabId: tabBId, statePath: component.statePath });
    expect(before).toEqual({ equalAxes: false, equalScaleAxes: false, axesVarianceScaled: false });

    const staleEvent = await page.evaluate(({ tabIdA }) => {
      const controls = window.__staleAxesControls || [];
      const resolvedOwners = controls.map(control => window.Shared?.componentLifecycle?.resolveTabIdFromTarget?.(control) || null);
      controls.forEach(control => {
        control.checked = true;
        control.dispatchEvent(new Event('change', { bubbles: true }));
      });
      return { resolvedOwners, expectedOwner: tabIdA };
    }, { tabIdA: tabAId });
    expect(staleEvent.resolvedOwners).toEqual([tabAId, tabAId, tabAId]);

    const after = await page.evaluate(({ type, tabId, statePath, selectors }) => {
      const hooks = window.Components?.[type]?.__testHooks || {};
      const session = hooks.getSessionForTab?.(tabId) || hooks.getSession?.(tabId) || null;
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(tabId, type) || null;
      return {
        state: session?.state?.[statePath]
          ? {
              equalAxes: !!session.state[statePath].equalAxes,
              equalScaleAxes: !!session.state[statePath].equalScaleAxes,
              axesVarianceScaled: !!session.state[statePath].axesVarianceScaled
            }
          : null,
        rendered: root ? selectors.map(selector => !!root.querySelector(selector)?.checked) : null
      };
    }, { type: component.type, tabId: tabBId, statePath: component.statePath, selectors: AXIS_CONTROLS });
    expect(after.state).toEqual(before);
    expect(after.rendered).toEqual([false, false, false]);

    await page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${tabAId}"]`).click({ force: true });
    await page.waitForFunction(id => window.Main?.session?.workspaceState?.activeTabId === id, tabAId);
    await waitForComponentOwnerReady(page, component.type, { requireMountedRoot: true, requireIdle: true });
    const returnedA = await page.evaluate(({ type, tabIdA, statePath, selectors }) => {
      const hooks = window.Components?.[type]?.__testHooks || {};
      const session = hooks.getSessionForTab?.(tabIdA) || hooks.getSession?.(tabIdA) || null;
      const root = window.Shared?.workspaceTabs?.getMountedRoot?.(tabIdA, type) || null;
      return {
        activeId: window.Main?.session?.getActiveTab?.()?.id || null,
        sessionTabId: session?.tabId || null,
        state: session?.state?.[statePath]
          ? {
              equalAxes: !!session.state[statePath].equalAxes,
              equalScaleAxes: !!session.state[statePath].equalScaleAxes,
              axesVarianceScaled: !!session.state[statePath].axesVarianceScaled
            }
          : null,
        rendered: selectors.map(selector => !!root?.querySelector(selector)?.checked)
      };
    }, { type: component.type, tabIdA: tabAId, statePath: component.statePath, selectors: AXIS_CONTROLS });
    expect(returnedA.state).toEqual({ equalAxes: false, equalScaleAxes: false, axesVarianceScaled: false });
    expect(returnedA.activeId).toBe(tabAId);
    expect(returnedA.sessionTabId).toBe(tabAId);
    expect(returnedA.rendered).toEqual([false, false, false]);

    await page.evaluate(() => { delete window.__staleAxesControls; });
  });
}
