'use strict';

const { getComponentByType } = require('../../test-support/componentCatalog.js');
const { waitForOwnerReady } = require('../../test-support/readiness.js');

function resolveComponent(componentOrType) {
  if (typeof componentOrType === 'string') {
    return getComponentByType(componentOrType);
  }
  if (!componentOrType?.type || !componentOrType?.pageId || !componentOrType?.exampleButtonId) {
    throw new Error('UI driver requires a complete component catalog entry');
  }
  return componentOrType;
}

async function clickExampleButton(page, componentOrType, options = {}) {
  const component = resolveComponent(componentOrType);
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 20_000;
  const root = page.locator(`#${component.pageId}:not([hidden])`).first();
  await root.waitFor({ state: 'visible', timeout });
  const button = root.locator(`#${component.exampleButtonId}`).first();
  if (options.optional === true && await button.count() === 0) {
    return false;
  }
  await button.waitFor({ state: 'visible', timeout });
  if (!(await button.isEnabled())) {
    throw new Error(`${component.type}: example control is disabled`);
  }
  // This is intentionally a Playwright locator action. API setup and direct
  // DOM click fallbacks belong to a different driver and cannot certify UI.
  await button.click({ noWaitAfter: true, timeout });
  const evidence = await waitForOwnerReady(page, {
    type: component.type,
    pageId: component.pageId,
    expectedTabId: options.expectedTabId || null,
    timeout,
    requireMountedRoot: options.requireMountedRoot === true
  });
  return evidence;
}

async function activateTab(page, tabId, componentOrType, options = {}) {
  const component = resolveComponent(componentOrType);
  const id = String(tabId || '').trim();
  if (!id) {
    throw new Error(`${component.type}: UI tab activation requires an owner tab ID`);
  }
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 20_000;
  const tab = page.locator(`#workspaceTabsList .workspace-tab[data-tab-id="${id}"]`).first();
  await tab.waitFor({ state: 'visible', timeout });
  await tab.click({ timeout });
  await page.waitForFunction(ownerId => {
    return String(window.Main?.session?.workspaceState?.activeTabId || '') === String(ownerId);
  }, id, { timeout, polling: 'raf' });
  return waitForOwnerReady(page, {
    type: component.type,
    pageId: component.pageId,
    expectedTabId: id,
    timeout,
    requireMountedRoot: options.requireMountedRoot === true
  });
}

async function activateToolbarSection(page, componentOrType, sectionLabel, options = {}) {
  const component = resolveComponent(componentOrType);
  const label = String(sectionLabel || '').trim();
  if (!label) {
    throw new Error(`${component.type}: toolbar section label is required`);
  }
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 20_000;
  const root = page.locator(`#${component.pageId}:not([hidden])`).first();
  await root.waitFor({ state: 'visible', timeout });
  const toolbar = root.locator(`.workspace-page__topbar[data-toolbar="${component.type}"] .workspace-toolbar`).first();
  await toolbar.waitFor({ state: 'visible', timeout });
  const tab = toolbar.locator('.workspace-toolbar__tab[data-toolbar-section-target]')
    .filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*$`, 'i') })
    .first();
  await tab.waitFor({ state: 'visible', timeout });
  await tab.click({ timeout });
  await page.waitForFunction(({ type, pageId, expectedLabel }) => {
    const root = document.querySelector(`#${pageId}:not([hidden])`);
    const toolbar = root?.querySelector?.(`.workspace-page__topbar[data-toolbar="${type}"] .workspace-toolbar`);
    const active = toolbar?.querySelector?.('.workspace-toolbar__tab[data-toolbar-section-target][aria-selected="true"]');
    return String(active?.textContent || '').trim().toLowerCase() === String(expectedLabel || '').trim().toLowerCase();
  }, { type: component.type, pageId: component.pageId, expectedLabel: label }, { timeout, polling: 'raf' });
  return toolbar;
}

module.exports = {
  activateTab,
  activateToolbarSection,
  clickExampleButton,
  resolveComponent
};
