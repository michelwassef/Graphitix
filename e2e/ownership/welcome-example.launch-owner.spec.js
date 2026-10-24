const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');

test('a welcome example launch cannot redirect to a same-type tab switched to during activation', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#welcomeScreen[data-welcome-ready="true"]');

  const owners = await page.evaluate(async () => {
    const session = window.Main.session;
    const welcome = session.getActiveTab();
    await window.Main.tabs.handleGraphSelection('hist', {
      reason: 'welcome-example-owner-sibling',
      forceBlankWorkspace: true,
      skipDuplicatePrompt: true
    });
    const sibling = session.getActiveTab();
    await window.Main.tabs.activateTab(welcome.id, {
      skipPersist: true,
      reason: 'welcome-example-owner-return'
    });

    const originalShowWorkspaceForTab = window.Main.domControls.showWorkspaceForTab;
    let delayedTabId = null;
    let releaseActivation = null;
    let delayed = false;
    window.Main.domControls.showWorkspaceForTab = params => {
      if (!delayed && params?.tab?.id !== sibling.id) {
        delayed = true;
        delayedTabId = params.tab.id;
        return new Promise((resolve, reject) => {
          releaseActivation = () => Promise.resolve(originalShowWorkspaceForTab(params)).then(resolve, reject);
        });
      }
      return originalShowWorkspaceForTab(params);
    };

    const launchPromise = window.Main.tabs.launchWelcomeGraph('hist', {
      loadExample: true,
      reason: 'welcome-example-owner-delayed-launch'
    });
    const target = session.getActiveTab();
    window.__welcomeExampleLaunch = {
      promise: launchPromise,
      get releaseActivation() { return releaseActivation; },
      get delayedTabId() { return delayedTabId; },
      restore: () => { window.Main.domControls.showWorkspaceForTab = originalShowWorkspaceForTab; }
    };
    return {
      welcomeId: welcome.id,
      targetId: target.id,
      siblingId: sibling.id,
      delayedTabId,
      targetPayloadBefore: JSON.stringify(target.payload || null),
      siblingPayloadBefore: JSON.stringify(sibling.payload || null),
    };
  });

  expect(owners.delayedTabId).toBe(owners.targetId);
  await page.evaluate(async siblingId => {
    await window.Main.tabs.activateTab(siblingId, {
      skipPersist: true,
      reason: 'welcome-example-owner-switch-during-activation'
    });
  }, owners.siblingId);

  await page.evaluate(async () => {
    const launch = window.__welcomeExampleLaunch;
    launch.releaseActivation();
    await launch.promise;
    launch.restore();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  const state = await page.evaluate(owners => {
    const session = window.Main.session;
    const target = session.workspaceState.tabs.find(tab => tab.id === owners.targetId);
    const sibling = session.workspaceState.tabs.find(tab => tab.id === owners.siblingId);
    const siblingRoot = window.Shared.workspaceTabs.getMountedRoot(sibling.id, 'hist');
    const example = window.Shared.exampleDatasets.get('hist')?.data || null;
    const targetPayloadAfter = JSON.stringify(target?.payload || null);
    return {
      activeId: session.workspaceState.activeTabId,
      targetData: target?.payload?.data || null,
      targetPayloadUnchanged: targetPayloadAfter === owners.targetPayloadBefore,
      siblingMatchesExample: JSON.stringify(sibling?.payload?.data || null) === JSON.stringify(example),
      siblingPayloadUnchanged: JSON.stringify(sibling?.payload || null) === owners.siblingPayloadBefore,
      visibleTableOwnerId: window.Shared.hot.resolveTableTabId({
        type: 'hist',
        wrapper: document.querySelector('#histHotWrapper'),
        container: document.querySelector('#histHot'),
        reason: 'welcome-example-owner-regression'
      }),
      siblingRootConnected: !!siblingRoot?.isConnected
    };
  }, owners);

  expect(state.activeId).toBe(owners.siblingId);
  expect(state.siblingMatchesExample).toBe(false);
  expect(state.siblingPayloadUnchanged).toBe(true);
  expect(state.targetPayloadUnchanged).toBe(true);
  expect(state.targetData).toBeNull();
  expect(state.visibleTableOwnerId).toBe(owners.siblingId);
  expect(state.siblingRootConnected).toBe(true);
});

test('an async workspace ensure cannot rebind its tab after a sibling becomes active', async ({ page }) => {
  test.setTimeout(90_000);
  await installLocalCdnOverrides(page);
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#welcomeScreen[data-welcome-ready="true"]');

  const owners = await page.evaluate(async () => {
    const session = window.Main.session;
    await window.Main.components.loadComponentBundle('hist', { reason: 'delayed-ensure-owner-test' });
    const workspace = window.Main.components.registry.hist;
    const originalEnsure = workspace.ensure;
    const sibling = session.createTab({
      title: 'Existing histogram',
      type: 'hist',
      payload: workspace.createEmptyPayload()
    });
    session.workspaceState.tabs.push(sibling);
    window.Main.tabs.renderTabs();

    let releaseEnsure = null;
    let ensureCallCount = 0;
    workspace.ensure = options => {
      const result = originalEnsure(options);
      ensureCallCount += 1;
      if (ensureCallCount === 1) {
        return new Promise((resolve, reject) => {
          releaseEnsure = () => Promise.resolve(result).then(resolve, reject);
        });
      }
      return result;
    };

    const launchPromise = window.Main.tabs.launchWelcomeGraph('hist', {
      loadExample: true,
      reason: 'welcome-example-async-ensure-owner'
    });
    const target = session.getActiveTab();
    window.__welcomeEnsureGate = {
      promise: launchPromise,
      get release() { return releaseEnsure; },
      get calls() { return ensureCallCount; },
      restore: () => { workspace.ensure = originalEnsure; }
    };
    return {
      targetId: target.id,
      siblingId: sibling.id,
      ensureCallsBeforeSwitch: ensureCallCount,
      targetPayloadBefore: JSON.stringify(target.payload || null)
    };
  });

  expect(owners.ensureCallsBeforeSwitch).toBe(1);
  const siblingBaseline = await page.evaluate(async siblingId => {
    await window.Main.tabs.activateTab(siblingId, {
      skipPersist: true,
      reason: 'switch-away-during-async-ensure'
    });
    const sibling = window.Main.session.workspaceState.tabs.find(tab => tab.id === siblingId);
    return JSON.stringify(sibling?.payload || null);
  }, owners.siblingId);
  await expect.poll(async () => page.evaluate(() => window.__welcomeEnsureGate.calls)).toBeGreaterThanOrEqual(2);

  await page.evaluate(async () => {
    const gate = window.__welcomeEnsureGate;
    gate.release();
    await gate.promise;
    gate.restore();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });

  const state = await page.evaluate(({ targetId, siblingId, targetPayloadBefore, siblingBaseline }) => {
    const session = window.Main.session;
    const target = session.workspaceState.tabs.find(tab => tab.id === targetId);
    const sibling = session.workspaceState.tabs.find(tab => tab.id === siblingId);
    const siblingRoot = window.Shared.workspaceTabs.getMountedRoot(siblingId, 'hist');
    return {
      activeId: session.workspaceState.activeTabId,
      targetPayloadUnchanged: JSON.stringify(target?.payload || null) === targetPayloadBefore,
      siblingPayloadUnchanged: JSON.stringify(sibling?.payload || null) === siblingBaseline,
      visibleTableOwnerId: window.Shared.hot.resolveTableTabId({
        type: 'hist',
        wrapper: document.querySelector('#histHotWrapper'),
        container: document.querySelector('#histHot'),
        reason: 'welcome-example-async-ensure-owner-regression'
      }),
      siblingRootConnected: !!siblingRoot?.isConnected
    };
  }, { ...owners, siblingBaseline });

  expect(state.activeId).toBe(owners.siblingId);
  expect(state.targetPayloadUnchanged).toBe(true);
  expect(state.siblingPayloadUnchanged).toBe(true);
  expect(state.visibleTableOwnerId).toBe(owners.siblingId);
  expect(state.siblingRootConnected).toBe(true);
});
