const { test, expect } = require('@playwright/test');
const { installLocalCdnOverrides } = require('../helpers/vendorOverrides');
const {
  COMPONENT_MATRIX,
  openComponentFromWelcome
} = require('../helpers/workspaceDriver');
const {
  activateTab,
  activateToolbarSection
} = require('../helpers/uiDriver');
const { registerIssueCollectors } = require('../helpers/diagnostics');

const DATA_TOOLBAR_COMPONENTS = new Set(['box', 'heatmap', 'hist', 'line', 'pca', 'scatter', 'surface']);
const COMPONENTS = COMPONENT_MATRIX.filter(component => DATA_TOOLBAR_COMPONENTS.has(component.type));

async function getWorkspaceTabIds(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#workspaceTabsList .workspace-tab[data-tab-id]'))
      .map(tab => String(tab.getAttribute('data-tab-id') || '').trim())
      .filter(id => id && id !== 'welcome')
  );
}

async function activateTabById(page, tabId, component) {
  await activateTab(page, tabId, component, { timeout: 20_000 });
}

async function waitForActiveToolbar(page, component) {
  await page.waitForFunction(({ type, pageId }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    if (!active || active.type !== type) {
      return false;
    }
    const root = window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type)
      || document.querySelector(`#${pageId}:not([hidden])`)
      || null;
    return !!root?.querySelector?.(`.workspace-page__topbar[data-toolbar="${type}"] .workspace-toolbar`);
  }, { type: component.type, pageId: component.pageId }, { timeout: 20_000 });
}

async function openComponentTab(page, component, { first = false } = {}) {
  const before = new Set(await getWorkspaceTabIds(page));
  await openComponentFromWelcome(page, component, { first, loadExample: true });
  await waitForActiveToolbar(page, component);
  const after = await getWorkspaceTabIds(page);
  const tabId = after.find(id => !before.has(id));
  expect(tabId).toBeTruthy();
  return tabId;
}

async function configureDataToolbar(page, component, options) {
  const toolbar = await activateToolbarSection(page, component, 'Data');
  const mode = toolbar.locator('[data-transform-multi-toggle="1"]').first();
  if (await mode.count() > 0 && (await mode.isChecked()) !== !!options.multiMode) {
    await mode.click();
  }
  const selected = toolbar.locator('[data-transform-option][data-transform-selected="1"]');
  const selectedButtons = await selected.all();
  for (const button of selectedButtons) {
    await button.click();
  }
  if (options.multiMode) {
    for (const transform of options.selectedTransforms || []) {
      const button = toolbar.locator(`[data-transform-option="${transform}"]`).first();
      await button.waitFor({ state: 'visible' });
      await button.click();
    }
  }
  await page.evaluate(({ type, expression }) => {
    if (!window.Shared?.workspaceToolbar?.setCustomTransformExpression?.(type, expression)) {
      throw new Error(`Custom transform expression update failed for ${type}`);
    }
  }, { type: component.type, expression: options.expression });
}

async function snapshotDataToolbar(page, component) {
  return page.evaluate(({ type, pageId }) => {
    const state = window.Main?.session?.workspaceState;
    const active = state?.tabs?.find(tab => tab?.id === state.activeTabId) || null;
    const root = active?.type === type
      ? (window.Shared?.workspaceTabs?.getMountedRoot?.(active.id, type) || document.querySelector(`#${pageId}:not([hidden])`))
      : null;
    const toolbar = root?.querySelector?.(`.workspace-page__topbar[data-toolbar="${type}"] .workspace-toolbar`) || null;
    const activeToolbar = document.querySelector(`.workspace-page__topbar[data-toolbar="${type}"] .workspace-toolbar`);
    const activeTab = toolbar
      ? Array.from(toolbar.querySelectorAll('.workspace-toolbar__tab[data-toolbar-section-target]'))
        .find(tab => tab.classList.contains('workspace-toolbar__tab--active'))
      : null;
    const input = toolbar?.querySelector?.('[data-transform-custom-input="1"]') || null;
    const mode = toolbar?.querySelector?.('[data-transform-multi-toggle="1"]') || null;
    return {
      activeTabId: active?.id || null,
      activeType: active?.type || null,
      rootTabId: root?.dataset?.workspaceTabId || null,
      toolbarTabId: toolbar?.closest?.('[data-workspace-tab-id]')?.dataset?.workspaceTabId || null,
      toolbarIsDocumentFirstMatch: toolbar === activeToolbar,
      activeSection: toolbar?.dataset?.toolbarActiveSection || '',
      activeLabel: String(activeTab?.textContent || '').trim(),
      expression: input?.value || '',
      multiMode: !!mode?.checked,
      selectedTransforms: Array.from(toolbar?.querySelectorAll?.('[data-transform-option][data-transform-selected="1"]') || [])
        .map(button => button.dataset.transformOption || '')
        .filter(Boolean)
        .sort()
    };
  }, { type: component.type, pageId: component.pageId });
}

for (const component of COMPONENTS) {
  test(`rapid same-component Data toolbar activation stays tab-owned for ${component.type}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const issues = registerIssueCollectors(page);
    await installLocalCdnOverrides(page);
    await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#welcomeScreen')).toBeVisible();

    const firstId = await openComponentTab(page, component, { first: true });
    const secondId = await openComponentTab(page, component, { first: false });
    expect(secondId).not.toBe(firstId);

    await activateTabById(page, firstId, component);
    await configureDataToolbar(page, component, {
      expression: `x + ${component.type.length}`,
      multiMode: true,
      selectedTransforms: ['cpm']
    });

    await activateTabById(page, secondId, component);
    await configureDataToolbar(page, component, {
      expression: `x * ${component.type.length + 2}`,
      multiMode: false,
      selectedTransforms: []
    });

    const snapshots = [];
    for (let i = 0; i < 4; i += 1) {
      await activateTabById(page, firstId, component);
      await activateToolbarSection(page, component, 'Data');
      snapshots.push({ step: `first-${i}`, ...(await snapshotDataToolbar(page, component)) });
      await activateTabById(page, secondId, component);
      await activateToolbarSection(page, component, 'Data');
      snapshots.push({ step: `second-${i}`, ...(await snapshotDataToolbar(page, component)) });
    }

    await testInfo.attach(`${component.type}-data-toolbar-rapid-activation.snapshots.json`, {
      body: Buffer.from(JSON.stringify({ firstId, secondId, snapshots }, null, 2), 'utf8'),
      contentType: 'application/json'
    });

    const firstSnapshots = snapshots.filter(snapshot => snapshot.step.startsWith('first-'));
    const secondSnapshots = snapshots.filter(snapshot => snapshot.step.startsWith('second-'));
    for (const snapshot of firstSnapshots) {
      expect(snapshot.activeTabId).toBe(firstId);
      expect(snapshot.rootTabId).toBe(firstId);
      expect(snapshot.toolbarTabId).toBe(firstId);
      expect(snapshot.activeLabel).toBe('Data');
      expect(snapshot.expression).toBe(`x + ${component.type.length}`);
      expect(snapshot.multiMode).toBe(true);
      expect(snapshot.selectedTransforms).toEqual(['cpm']);
    }
    for (const snapshot of secondSnapshots) {
      expect(snapshot.activeTabId).toBe(secondId);
      expect(snapshot.rootTabId).toBe(secondId);
      expect(snapshot.toolbarTabId).toBe(secondId);
      expect(snapshot.activeLabel).toBe('Data');
      expect(snapshot.expression).toBe(`x * ${component.type.length + 2}`);
      expect(snapshot.multiMode).toBe(false);
      expect(snapshot.selectedTransforms).toEqual([]);
    }
    expect(issues.critical).toEqual([]);
  });
}
