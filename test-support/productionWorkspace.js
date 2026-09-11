'use strict';

// Register a test tab through the same ownership records used by the
// production scheduler. This helper is intentionally strict: production-
// derived component tests must not silently fall back to a fake active tab.
function registerActiveProductionTab({ type, tabId, root, payload = null, title = null } = {}) {
  const componentType = String(type || '').trim();
  const id = String(tabId || '').trim();
  const mainSession = globalThis.window?.Main?.session || null;
  const workspaceTabs = globalThis.window?.Shared?.workspaceTabs || null;
  if (!componentType || !id || !mainSession?.workspaceState || !workspaceTabs) {
    throw new Error('Production workspace registration requires Main.session and Shared.workspaceTabs.');
  }
  if (!Array.isArray(mainSession.workspaceState.tabs)) {
    mainSession.workspaceState.tabs = [];
  }

  const tab = {
    id,
    type: componentType,
    title: title || `${componentType} test tab`,
    isWelcome: false,
    ...(payload ? { payload } : {})
  };
  mainSession.workspaceState.tabs = mainSession.workspaceState.tabs
    .filter(candidate => String(candidate?.id || '') !== id)
    .concat(tab);
  mainSession.workspaceState.activeTabId = id;

  if (typeof workspaceTabs.ensureActiveSession !== 'function') {
    throw new Error('Production workspace registration requires ensureActiveSession.');
  }
  const sessionRecord = workspaceTabs.ensureActiveSession(tab, componentType, {
    tabId: id,
    type: componentType,
    reason: 'test-production-workspace-register'
  });
  if (!sessionRecord) {
    throw new Error(`Unable to register the ${componentType} test session.`);
  }

  let mountedRoot = root || null;
  if (root && typeof workspaceTabs.ensureMountedRoot === 'function') {
    mountedRoot = workspaceTabs.ensureMountedRoot(tab, {
      type: componentType,
      element: root,
      perTabDomInstances: false
    }, {
      tabId: id,
      type: componentType,
      reason: 'test-production-workspace-mount'
    }) || root;
  }
  if (mountedRoot?.setAttribute) {
    mountedRoot.setAttribute('data-workspace-tab-id', id);
  }
  return Object.freeze({ tab, sessionRecord, root: mountedRoot });
}

module.exports = {
  registerActiveProductionTab
};
