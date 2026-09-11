'use strict';

const { getComponentByType } = require('../../test-support/componentCatalog.js');

function resolveType(componentOrType) {
  return typeof componentOrType === 'string'
    ? getComponentByType(componentOrType).type
    : String(componentOrType?.type || '').trim();
}

/**
 * Read-only contract evidence for tests that intentionally use the app API.
 * It never mutates the page and never substitutes for a UI action.
 */
async function readOwnerEvidence(page, componentOrType, tabId) {
  const type = resolveType(componentOrType);
  const ownerTabId = String(tabId || '').trim();
  if (!type || !ownerTabId) {
    throw new Error('API driver requires a component type and owner tab ID');
  }
  return page.evaluate(({ componentType, ownerId }) => {
    const workspaceState = window.Main?.session?.workspaceState || null;
    const tab = Array.isArray(workspaceState?.tabs)
      ? workspaceState.tabs.find(entry => String(entry?.id || '') === ownerId) || null
      : null;
    const active = tab && String(workspaceState?.activeTabId || '') === ownerId;
    const component = window.Components?.[componentType] || null;
    const mountedRoot = window.Shared?.workspaceTabs?.getMountedRoot?.(ownerId, componentType) || null;
    const root = mountedRoot || document.querySelector(`#${componentType}Page:not([hidden])`) || null;
    const session = component?.__testHooks?.getSession?.(ownerId)
      || component?.__testHooks?.getSessionForTab?.(ownerId)
      || null;
    return {
      owner: {
        requestedTabId: ownerId,
        activeTabId: workspaceState?.activeTabId || null,
        active,
        tabType: tab?.type || null,
        componentType
      },
      componentReady: component?.ready === true,
      mountedRoot: !!mountedRoot,
      rootOwnerTabId: root?.getAttribute?.('data-workspace-tab-id') || null,
      sessionPresent: !!session,
      dirty: tab?.userModified === true || tab?.dirty === true,
      payloadPresent: !!tab?.payload
    };
  }, { componentType: type, ownerId: ownerTabId });
}

module.exports = {
  readOwnerEvidence,
  resolveType
};
