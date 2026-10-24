const { test, expect } = require('@playwright/test');
const { COMPONENT_MATRIX, openComponentFromWelcome } = require('../helpers/workspaceDriver');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const { registerIssueCollectors } = require('../helpers/diagnostics');

const SESSION_COMPONENTS = ['box', 'scatter', 'pca', 'line', 'surface', 'pie', 'roc', 'survival'];

test.describe.configure({ mode: 'serial' });

for (const type of SESSION_COMPONENTS) {
  const component = COMPONENT_MATRIX.find(item => item.type === type);
  test(`${type} releases closed owner sessions without changing its sibling`, async ({ page }) => {
    await installLocalCdnOverrides(page);
    const issues = registerIssueCollectors(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });

    await openComponentFromWelcome(page, component, { first: true, loadExample: true });
    const firstTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(firstTabId).toBeTruthy();
    await page.waitForFunction(({ type, id }) => {
      const getSession = window.Components?.[type]?.__testHooks?.getSession;
      return typeof getSession === 'function' && !!getSession(id);
    }, { type, id: firstTabId });
    await page.evaluate(({ type, id }) => {
      window.__sessionDisposalTestRefs = { [type]: { first: window.Components[type].__testHooks.getSession(id) } };
    }, { type, id: firstTabId });

    await openComponentFromWelcome(page, component, { loadExample: true });
    const siblingTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(siblingTabId).toBeTruthy();
    expect(siblingTabId).not.toBe(firstTabId);
    await page.waitForFunction(({ type, id }) => {
      const getSession = window.Components?.[type]?.__testHooks?.getSession;
      return typeof getSession === 'function' && !!getSession(id);
    }, { type, id: siblingTabId });
    await page.evaluate(({ type, id }) => {
      window.__sessionDisposalTestRefs[type].sibling = window.Components[type].__testHooks.getSession(id);
    }, { type, id: siblingTabId });

    await page.evaluate(id => window.Main.tabs.closeTab(id, {
      force: true,
      skipPrompt: true,
      reason: 'e2e-close-inactive-session'
    }), firstTabId);
    await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${firstTabId}"]`)).toHaveCount(0);
    await expect.poll(() => page.evaluate(({ type, id }) => window.Components[type].__testHooks.getSession(id), { type, id: firstTabId })).toBeNull();
    if (type === 'scatter') {
      await expect.poll(() => page.evaluate(id => window.Components.scatter.__testHooks.isTabMarkedDisposed(id), firstTabId)).toBe(false);
    }
    expect(await page.evaluate(({ type, id }) =>
      window.Components[type].__testHooks.getSession(id) === window.__sessionDisposalTestRefs[type].sibling
        && window.__sessionDisposalTestRefs[type].sibling !== window.__sessionDisposalTestRefs[type].first,
    { type, id: siblingTabId })).toBe(true);

    await page.evaluate(id => window.Main.tabs.closeTab(id, {
      force: true,
      skipPrompt: true,
      reason: 'e2e-close-active-session'
    }), siblingTabId);
    await expect(page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${siblingTabId}"]`)).toHaveCount(0);
    await expect.poll(() => page.evaluate(({ type, id }) => window.Components[type].__testHooks.getSession(id), { type, id: siblingTabId })).toBeNull();
    if (type === 'scatter') {
      await expect.poll(() => page.evaluate(id => window.Components.scatter.__testHooks.isTabMarkedDisposed(id), siblingTabId)).toBe(false);
    }

    await openComponentFromWelcome(page, component, { loadExample: true });
    const reopenedTabId = await page.evaluate(() => window.Main?.session?.workspaceState?.activeTabId || null);
    expect(reopenedTabId).toBeTruthy();
    expect(reopenedTabId).not.toBe(firstTabId);
    expect(reopenedTabId).not.toBe(siblingTabId);
    await page.waitForFunction(({ type, id }) => {
      const getSession = window.Components?.[type]?.__testHooks?.getSession;
      return typeof getSession === 'function' && !!getSession(id);
    }, { type, id: reopenedTabId });
    expect(await page.evaluate(({ type, id }) => {
      const reopened = window.Components[type].__testHooks.getSession(id);
      return reopened !== window.__sessionDisposalTestRefs[type].first
        && reopened !== window.__sessionDisposalTestRefs[type].sibling;
    }, { type, id: reopenedTabId })).toBe(true);
    expect(issues.critical).toEqual([]);
  });
}
