function resetGlobalNamespaces() {
  delete window.Main;
  delete window.Components;
  delete window.Shared;
}

function ensureMainSession(options = {}) {
  const Main = window.Main = window.Main || {};
  const workspaceState = options.workspaceState || { tabs: [], activeTabId: null };
  let activeTab = options.activeTab || null;
  const getActiveTab = jest.fn(() => activeTab);
  const session = {
    workspaceState,
    getActiveTab,
    tabHasTableData: () => true,
    ...(Main.session || {})
  };
  session.workspaceState = workspaceState;
  session.getActiveTab = getActiveTab;
  Main.session = session;
  const setActiveTab = (tabLikeOrId, type = null) => {
    if (tabLikeOrId && typeof tabLikeOrId === 'object') {
      activeTab = tabLikeOrId;
      session.workspaceState.activeTabId = tabLikeOrId.id || null;
      return activeTab;
    }
    const nextId = tabLikeOrId == null ? null : String(tabLikeOrId);
    activeTab = nextId ? { id: nextId, type } : null;
    session.workspaceState.activeTabId = nextId;
    return activeTab;
  };
  return { session, setActiveTab };
}

function ensureWorkspaceTabs(overrides = {}) {
  const Shared = window.Shared = window.Shared || {};
  const mountedRoots = new Map();
  const resolveKey = (tabLikeOrId, type) => {
    const tabLike = tabLikeOrId && typeof tabLikeOrId === 'object' ? tabLikeOrId : null;
    const tabId = tabLike ? tabLike.id : tabLikeOrId;
    const componentType = type || tabLike?.type || null;
    if (!tabId || !componentType) {
      return null;
    }
    return `${componentType}:${String(tabId)}`;
  };
  const getMountedRoot = jest.fn((tabLikeOrId, type) => {
    const key = resolveKey(tabLikeOrId, type);
    if (!key) {
      return null;
    }
    return mountedRoots.get(key) || null;
  });
  const setMountedRoot = (tabLikeOrId, type, root) => {
    const key = resolveKey(tabLikeOrId, type);
    if (!key) {
      return null;
    }
    if (root) {
      mountedRoots.set(key, root);
      return root;
    }
    mountedRoots.delete(key);
    return null;
  };
  const ensureMountedRoot = jest.fn((tabLikeOrId, type) => getMountedRoot(tabLikeOrId, type));
  const activateWorkspace = jest.fn(() => true);
  const defaults = {
    getMountedRoot,
    ensureMountedRoot,
    activateWorkspace,
    setMountedRoot
  };
  Shared.workspaceTabs = {
    ...(Shared.workspaceTabs || {}),
    ...defaults,
    ...(overrides || {})
  };
  return Shared.workspaceTabs;
}

function bindElementToTab(element, tabId) {
  if (!element || !tabId) {
    return;
  }
  const token = String(tabId);
  element.setAttribute('data-workspace-tab-id', token);
  const svgs = Array.from(element.querySelectorAll('svg'));
  svgs.forEach(svg => svg.setAttribute('data-workspace-tab-id', token));
}

function initializeWorkspaceHarness(options = {}) {
  const mode = options.mode === 'full-app' ? 'full-app' : 'tab-scoped';
  if (options.resetNamespaces === true) {
    resetGlobalNamespaces();
  }
  if (typeof options.html === 'string') {
    document.body.innerHTML = options.html;
  }
  if (mode === 'full-app') {
    window.__WORKSPACE_HARNESS__ = {
      mode,
      initializedAt: Date.now()
    };
    return {
      mode,
      session: null,
      setActiveTab: null,
      workspaceTabs: null
    };
  }
  const { session, setActiveTab } = ensureMainSession({
    workspaceState: options.workspaceState || { tabs: [], activeTabId: null },
    activeTab: options.activeTab || null
  });
  const workspaceTabs = ensureWorkspaceTabs(options.workspaceTabs || {});
  window.__WORKSPACE_HARNESS__ = {
    mode,
    initializedAt: Date.now()
  };
  return { mode, session, setActiveTab, workspaceTabs };
}

module.exports = {
  bindElementToTab,
  ensureMainSession,
  ensureWorkspaceTabs,
  initializeWorkspaceHarness,
  resetGlobalNamespaces
};
