'use strict';

const COMPONENT_TYPES = Object.freeze([
  'venn', 'box', 'scatter', 'pca', 'line', 'heatmap',
  'surface', 'roc', 'survival', 'hist', 'pie'
]);

function workspaceTabs(target) {
  const tabs = target?.Main?.session?.workspaceState?.tabs;
  return Array.isArray(tabs) ? tabs.filter(tab => tab && !tab.isWelcome) : [];
}

function componentTargets(target, type) {
  const targets = [];
  const add = candidate => {
    if (candidate && typeof candidate === 'object' && !targets.includes(candidate)) {
      targets.push(candidate);
    }
  };
  add(target?.Components?.[type]);
  add(target?.Main?.components?.registry?.[type]);
  return targets;
}

function pendingFromSnapshot(snapshot) {
  const pending = snapshot?.pending || {};
  return {
    timers: Number(pending.timers) || 0,
    animationFrames: Number(pending.animationFrames) || 0,
    promises: Number(pending.promises) || 0
  };
}

function hasPendingWork(pending) {
  return pending.timers > 0 || pending.animationFrames > 0 || pending.promises > 0;
}

function collectIntegrationLeaks(target = globalThis, explicitTabs = null) {
  const pendingScopes = [];
  const tabs = Array.isArray(explicitTabs) ? explicitTabs : workspaceTabs(target);
  const types = new Set([
    ...COMPONENT_TYPES,
    ...Object.keys(target?.Components || {}),
    ...Object.keys(target?.Main?.components?.registry || {})
  ]);

  for (const tab of tabs) {
    for (const type of types) {
      for (const component of componentTargets(target, type)) {
        const snapshot = component.__asyncScope?.snapshot?.(tab.id);
        const pending = pendingFromSnapshot(snapshot);
        if (snapshot && hasPendingWork(pending)) {
          pendingScopes.push({
            componentKey: String(snapshot.componentKey || type),
            tabId: String(tab.id),
            generation: Number(snapshot.generation) || 0,
            pending
          });
        }
      }
    }
  }

  return {
    tabCount: tabs.length,
    pendingScopes
  };
}

function disposeIntegrationTabs(target = globalThis, reason = 'jest-integration-teardown') {
  const tabs = workspaceTabs(target);
  const ownerDisposer = target?.Main?.session?.disposeWorkspaceTabResources;
  const sharedDisposer = target?.Shared?.workspaceTabs?.disposeTab;
  const disposer = typeof ownerDisposer === 'function' ? ownerDisposer : sharedDisposer;
  const disposed = [];
  const failures = [];
  if (typeof disposer !== 'function') {
    return {
      disposed,
      failures: tabs.map(tab => ({
        tabId: String(tab.id),
        type: String(tab.type || ''),
        reason: 'tab-disposer-unavailable'
      })),
      unavailable: tabs.length > 0
    };
  }

  for (const tab of tabs) {
    try {
      const meta = {
        tabId: tab.id,
        type: tab.type || null,
        reason
      };
      if (disposer.call(typeof ownerDisposer === 'function' ? target.Main.session : target.Shared.workspaceTabs, tab, meta)) {
        disposed.push({ tabId: String(tab.id), type: String(tab.type || '') });
      } else {
        failures.push({
          tabId: String(tab.id),
          type: String(tab.type || ''),
          reason: 'tab-disposer-reported-not-disposed'
        });
      }
    } catch (error) {
      failures.push({
        tabId: String(tab.id),
        type: String(tab.type || ''),
        reason: 'tab-disposer-threw',
        error: error?.message || String(error)
      });
    }
  }
  return { disposed, failures, unavailable: false };
}

function inspectIntegrationTeardown(target = globalThis, eventTracker = null) {
  // Keep the pre-disposal owner set so cleanup is checked even after disposal
  // removes those tabs from the workspace registry.
  const tabs = workspaceTabs(target);
  const pendingBeforeDisposal = collectIntegrationLeaks(target, tabs);
  const disposal = disposeIntegrationTabs(target);
  const pendingAfterDisposal = collectIntegrationLeaks(target, tabs);
  return {
    ...pendingAfterDisposal,
    pendingBeforeDisposal: pendingBeforeDisposal.pendingScopes,
    disposalFailures: disposal.failures || [],
    disposalUnavailable: disposal.unavailable,
    globalListeners: eventTracker?.snapshot?.() || []
  };
}

function formatIntegrationLeakReport(report) {
  const pending = (report.pendingScopes || []).map(scope => {
    const pending = Object.entries(scope.pending)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(', ');
    return `${scope.componentKey}/${scope.tabId} generation=${scope.generation} (${pending})`;
  });
  const disposal = (report.disposalFailures || []).map(failure =>
    `${failure.type || 'component'}/${failure.tabId} disposal=${failure.reason}${failure.error ? `: ${failure.error}` : ''}`);
  const listeners = (report.globalListeners || []).map(listener =>
    `${listener.target}:${listener.type}${listener.capture ? '(capture)' : ''}`);
  return [...pending, ...disposal, ...listeners].join('; ');
}

module.exports = {
  COMPONENT_TYPES,
  collectIntegrationLeaks,
  disposeIntegrationTabs,
  inspectIntegrationTeardown,
  formatIntegrationLeakReport
};
