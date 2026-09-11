'use strict';

function inspectOwnerReadiness(options = {}) {
  const type = String(options.type || '').trim();
  const pageId = String(options.pageId || `${type}Page`).trim();
  const expectedTabId = options.expectedTabId == null ? '' : String(options.expectedTabId);
  const requireMountedRoot = options.requireMountedRoot === true;
  const requirePublished = options.requirePublished === true;
  const requireIdle = options.requireIdle === true;
  const diagnostic = options.diagnostic === true;
  const state = window.Main?.session?.workspaceState || null;
  const activeTabId = state?.activeTabId == null ? '' : String(state.activeTabId);
  const activeTab = Array.isArray(state?.tabs)
    ? state.tabs.find(tab => tab && String(tab.id || '') === activeTabId) || null
    : null;

  const failure = (reason, extra = {}) => {
    if (!diagnostic) {
      return false;
    }
    return {
      ready: false,
      phase: reason,
      owner: {
        requestedTabId: expectedTabId || null,
        activeTabId: activeTabId || null,
        activeType: activeTab?.type || null,
        requestedType: type || null
      },
      ...extra
    };
  };

  if (!type) return failure('missing-component-type');
  if (!state) return failure('workspace-state-unavailable');
  if (!activeTab) return failure('active-tab-unavailable', { tabCount: state.tabs?.length || 0 });
  if (expectedTabId && activeTabId !== expectedTabId) {
    return failure('active-owner-mismatch', { expectedTabId, activeTabId });
  }
  if (activeTab.type !== type) {
    return failure('active-component-mismatch', { activeType: activeTab.type || null });
  }

  const component = window.Components?.[type] || null;
  if (!component) return failure('component-unavailable');
  if (component.ready !== true) return failure('component-not-ready');
  const asyncScope = component.__asyncScope?.snapshot?.(activeTabId) || null;
  if (!asyncScope || !Number.isFinite(Number(asyncScope.generation))) {
    return failure('owner-generation-unavailable', { asyncScope: null });
  }
  if (requireIdle && asyncScope.idle !== true) {
    return failure('owner-not-idle', { asyncScope });
  }

  const lifecycle = window.Shared?.componentLifecycle || null;
  if (lifecycle?.isRestoreTransactionActive?.(type, { tabId: activeTabId })) {
    return failure('restore-transaction-active');
  }

  const workspaceTabs = window.Shared?.workspaceTabs || null;
  const mountedRoot = workspaceTabs?.getMountedRoot?.(activeTabId, type) || null;
  if (requireMountedRoot && !mountedRoot) {
    return failure('mounted-root-unavailable');
  }
  const pageRoot = document.querySelector(`#${pageId}:not([hidden])`)
    || document.getElementById(pageId);
  const root = mountedRoot || pageRoot || null;
  if (!root) return failure('component-root-unavailable');
  if (root.isConnected === false) return failure('component-root-disconnected');

  const workspaceSelector = [
    '.ag-root-wrapper',
    '.ag-root',
    '.workspace-toolbar',
    '.svgbox',
    '.config-panel',
    `[id="${type}LoadExample"]`
  ].join(',');
  if (!root.querySelector?.(workspaceSelector)) {
    return failure('component-projection-incomplete', {
      rootOwnerTabId: root.getAttribute?.('data-workspace-tab-id') || null,
      mountedRoot: !!mountedRoot
    });
  }

  const rootOwnerTabId = root.getAttribute?.('data-workspace-tab-id') || null;
  const mountedRootOwnerTabId = mountedRoot?.getAttribute?.('data-workspace-tab-id') || null;
  const session = component.__testHooks?.getSession?.(activeTabId)
    || component.__testHooks?.getSessionForTab?.(activeTabId)
    || null;
  if (mountedRootOwnerTabId && mountedRootOwnerTabId !== activeTabId) {
    return failure('mounted-root-owner-mismatch', { mountedRootOwnerTabId, activeTabId });
  }
  if (rootOwnerTabId && rootOwnerTabId !== activeTabId) {
    return failure('root-owner-mismatch', { rootOwnerTabId, activeTabId });
  }
  if (session?.tabId && String(session.tabId) !== activeTabId) {
    return failure('session-owner-mismatch', { sessionOwnerTabId: session.tabId, activeTabId });
  }
  const evidence = {
    requestedTabId: expectedTabId || activeTabId,
    activeTabId,
    componentType: type,
    sessionOwnerTabId: session?.tabId || null,
    rootOwnerTabId,
    mountedRootOwnerTabId,
    sessionRevision: Number(state.sessionRevision) || 0,
    payloadSignature: activeTab?.payloadSignature || null,
    layoutSignature: activeTab?.layoutSignature || null,
    asyncGeneration: Number(asyncScope.generation),
    asyncIdle: asyncScope.idle === true
  };

  let published = null;
  if (requirePublished) {
    published = component.hasRenderedGraph?.({ tabId: activeTabId }) === true;
    if (!published) return failure('primary-graph-not-published', { published: false });
  }

  return {
    ready: true,
    phase: requirePublished ? 'published' : 'initialized',
    owner: evidence,
      mountedRoot: !!mountedRoot,
      rootConnected: root.isConnected !== false,
      asyncGeneration: Number(asyncScope.generation),
      asyncIdle: asyncScope.idle === true,
      published,
      payloadSignature: activeTab?.payloadSignature || null,
      layoutSignature: activeTab?.layoutSignature || null
  };
}

async function waitForOwnerReady(page, options = {}) {
  const timeout = Number.isFinite(Number(options.timeout)) ? Number(options.timeout) : 20_000;
  const request = {
    type: options.type,
    pageId: options.pageId,
    expectedTabId: options.expectedTabId == null ? null : String(options.expectedTabId),
    requireMountedRoot: options.requireMountedRoot === true,
    requirePublished: options.requirePublished === true,
    requireIdle: options.requireIdle === true,
    diagnostic: false
  };
  try {
    const handle = await page.waitForFunction(inspectOwnerReadiness, request, {
      timeout,
      polling: 'raf'
    });
    return await handle.jsonValue();
  } catch (error) {
    let diagnostic = null;
    try {
      diagnostic = await page.evaluate(inspectOwnerReadiness, { ...request, diagnostic: true });
    } catch (diagnosticError) {
      diagnostic = { ready: false, phase: 'diagnostic-unavailable', message: diagnosticError.message };
    }
    const details = JSON.stringify(diagnostic);
    throw new Error(`Owner readiness timed out for ${request.type || '(unknown)'}: ${details}`, { cause: error });
  }
}

module.exports = {
  inspectOwnerReadiness,
  waitForOwnerReady
};
