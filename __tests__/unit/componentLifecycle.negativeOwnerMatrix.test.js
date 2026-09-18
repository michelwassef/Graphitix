'use strict';

require('../../js/shared/componentLifecycle.js');

const COMPONENT_TYPES = [
  'venn', 'box', 'scatter', 'pca', 'line', 'heatmap',
  'surface', 'roc', 'survival', 'hist', 'pie'
];

function createRoot(tabId) {
  return {
    isConnected: true,
    dataset: { workspaceTabId: tabId }
  };
}

function installOwnerFixture(type) {
  const rootA = createRoot('tab-a');
  const rootB = createRoot('tab-b');
  global.Main.session = {
    workspaceState: {
      activeTabId: 'tab-a',
      tabs: [
        { id: 'tab-a', type },
        { id: 'tab-b', type }
      ]
    }
  };
  global.Shared.workspaceTabs = {
    getMountedRoot: (tabId, componentType) => componentType === type
      ? (tabId === 'tab-a' ? rootA : rootB)
      : null
  };
  const component = { __boundTabId: 'tab-a' };
  return { component, rootA, rootB };
}

describe('component lifecycle negative owner matrix', () => {
  afterEach(() => {
    global.Main.session = {};
    global.Shared.workspaceTabs = {};
  });

  test.each(COMPONENT_TYPES)('%s rejects a requested owner that differs from the active owner', type => {
    const { component, rootA } = installOwnerFixture(type);
    const lifecycle = global.Shared.componentLifecycle;
    const context = lifecycle.resolveOwnerCaptureContext(type, { tabId: 'tab-b' }, {
      component,
      session: { tabId: 'tab-a' },
      root: rootA
    });

    expect(context.workspaceActiveTabId).toBe('tab-a');
    expect(context.requestedTabId).toBe('tab-b');
    expect(context.canCaptureLive).toBe(false);
    expect(lifecycle.canOwnerUseLiveProjection(type, {
      tabId: 'tab-b',
      session: { tabId: 'tab-b' }
    }, { component, root: rootA })).toBe(false);
  });

  test.each(COMPONENT_TYPES)('%s rejects a mounted root owned by another session', type => {
    const { component, rootB } = installOwnerFixture(type);
    const lifecycle = global.Shared.componentLifecycle;
    const context = lifecycle.resolveOwnerCaptureContext(type, { tabId: 'tab-a' }, {
      component,
      session: { tabId: 'tab-a' },
      root: rootB
    });

    expect(context.requestedTabId).toBe('tab-a');
    expect(context.rootTabId).toBe('tab-b');
    expect(context.canCaptureLive).toBe(false);
    expect(lifecycle.canOwnerUseLiveProjection(type, {
      tabId: 'tab-a',
      session: { tabId: 'tab-a' }
    }, { component, root: rootB })).toBe(false);
  });

  test.each(COMPONENT_TYPES)('%s rejects stale async work after ABA reactivation', type => {
    const lifecycle = global.Shared.componentLifecycle;
    const scope = lifecycle.createAsyncScope(type);
    const first = scope.nextToken({ tabId: 'tab-a' });
    expect(scope.isCurrent(first)).toBe(true);

    scope.cancelAllForTab('tab-a', 'negative-owner-aba');
    const reactivated = scope.nextToken({ tabId: 'tab-a' });

    expect(reactivated.asyncGeneration).toBeGreaterThan(first.asyncGeneration);
    expect(scope.isCurrent(first)).toBe(false);
    expect(scope.isCurrent(reactivated)).toBe(true);
  });
});
