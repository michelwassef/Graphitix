'use strict';

const {
  collectIntegrationLeaks,
  disposeIntegrationTabs,
  inspectIntegrationTeardown,
  formatIntegrationLeakReport
} = require('../../test-support/integrationTeardown');
const { installProductionTestEventTracker } = require('../../test-support/productionTestLifecycle');

describe('integration teardown contract', () => {
  test('reports owner-scoped pending work with component and tab identity', () => {
    const target = {
      Main: {
        session: { workspaceState: { tabs: [{ id: 'tab-a', type: 'box' }] } },
        components: { registry: {} }
      },
      Components: {
        box: {
          __asyncScope: {
            snapshot: tabId => ({
              componentKey: 'box',
              tabId,
              generation: 3,
              pending: { timers: 1, animationFrames: 0, promises: 2 }
            })
          }
        }
      },
      Shared: { workspaceTabs: {} }
    };

    const report = collectIntegrationLeaks(target);
    expect(report.pendingScopes).toEqual([{
      componentKey: 'box',
      tabId: 'tab-a',
      generation: 3,
      pending: { timers: 1, animationFrames: 0, promises: 2 }
    }]);
    expect(formatIntegrationLeakReport(report)).toContain('box/tab-a');
  });

  test('disposes every non-welcome workspace tab through the owner API', () => {
    const calls = [];
    const target = {
      Main: {
        session: {
          workspaceState: {
            tabs: [
              { id: 'welcome', isWelcome: true, type: 'welcome' },
              { id: 'tab-a', type: 'box' },
              { id: 'tab-b', type: 'pca' }
            ]
          }
        }
      },
      Shared: {
        workspaceTabs: {
          disposeTab(tab, meta) {
            calls.push({ tabId: tab.id, meta });
            return true;
          }
        }
      }
    };

    expect(disposeIntegrationTabs(target)).toEqual({
      disposed: [
        { tabId: 'tab-a', type: 'box' },
        { tabId: 'tab-b', type: 'pca' }
      ],
      failures: [],
      unavailable: false
    });
    expect(calls.map(call => call.tabId)).toEqual(['tab-a', 'tab-b']);
    expect(calls[0].meta.reason).toBe('jest-integration-teardown');
  });

  test('prefers session disposal so owner bookkeeping is cleared with resources', () => {
    const calls = [];
    const target = {
      Main: {
        session: {
          workspaceState: { tabs: [{ id: 'tab-a', type: 'pca' }] },
          disposeWorkspaceTabResources(tab, meta) {
            calls.push({ tabId: tab.id, meta });
            return true;
          }
        }
      },
      Shared: { workspaceTabs: { disposeTab() { throw new Error('shared fallback used'); } } }
    };

    expect(disposeIntegrationTabs(target).disposed).toEqual([{ tabId: 'tab-a', type: 'pca' }]);
    expect(calls).toHaveLength(1);
    expect(calls[0].meta.reason).toBe('jest-integration-teardown');
  });

  test('reports unavailable, unsuccessful, and throwing owner disposers', () => {
    const tab = { id: 'tab-a', type: 'box' };
    const unavailable = disposeIntegrationTabs({
      Main: { session: { workspaceState: { tabs: [tab] } } }
    });
    expect(unavailable).toMatchObject({
      unavailable: true,
      failures: [{ tabId: 'tab-a', type: 'box', reason: 'tab-disposer-unavailable' }]
    });

    const unsuccessful = disposeIntegrationTabs({
      Main: {
        session: {
          workspaceState: { tabs: [tab] },
          disposeWorkspaceTabResources: () => false
        }
      }
    });
    expect(unsuccessful.failures).toEqual([{
      tabId: 'tab-a', type: 'box', reason: 'tab-disposer-reported-not-disposed'
    }]);

    const throwing = disposeIntegrationTabs({
      Main: {
        session: {
          workspaceState: { tabs: [tab] },
          disposeWorkspaceTabResources: () => { throw new Error('dispose failed'); }
        }
      }
    });
    expect(throwing.failures).toEqual([{
      tabId: 'tab-a', type: 'box', reason: 'tab-disposer-threw', error: 'dispose failed'
    }]);
  });

  test('verifies disposal clears pending work for removed owner tabs', () => {
    let pendingTimers = 1;
    const target = {
      Main: {
        session: {
          workspaceState: { tabs: [{ id: 'tab-a', type: 'box' }] },
          disposeWorkspaceTabResources(tab) {
            pendingTimers = 0;
            this.workspaceState.tabs = this.workspaceState.tabs.filter(entry => entry.id !== tab.id);
            return true;
          }
        },
        components: { registry: {} }
      },
      Components: {
        box: {
          __asyncScope: {
            snapshot: tabId => ({
              componentKey: 'box', tabId, generation: 4,
              pending: { timers: pendingTimers, animationFrames: 0, promises: 0 }
            })
          }
        }
      }
    };

    const report = inspectIntegrationTeardown(target, { snapshot: () => [] });

    expect(report.pendingBeforeDisposal).toHaveLength(1);
    expect(report.pendingBeforeDisposal[0]).toMatchObject({ tabId: 'tab-a', generation: 4 });
    expect(report.pendingScopes).toEqual([]);
    expect(target.Main.session.workspaceState.tabs).toEqual([]);
    expect(report.disposalFailures).toEqual([]);
  });

  test('reports global listeners and removes them only after inspection', () => {
    const makeTarget = () => ({ addEventListener() {}, removeEventListener: jest.fn() });
    const targetWindow = makeTarget();
    const targetDocument = makeTarget();
    const removeWindowListener = targetWindow.removeEventListener;
    const removeDocumentListener = targetDocument.removeEventListener;
    const tracker = installProductionTestEventTracker({ window: targetWindow, document: targetDocument });
    const listener = () => {};
    try {
      targetWindow.addEventListener('resize', listener);
      targetWindow.addEventListener('resize', listener);
      targetDocument.addEventListener('click', listener, true);
      expect(tracker.snapshot()).toEqual([
        { target: 'window', type: 'resize', capture: false },
        { target: 'document', type: 'click', capture: true }
      ]);
      expect(tracker.reset()).toEqual({ removed: 2, failures: [] });
      expect(tracker.snapshot()).toEqual([]);
      expect(removeWindowListener).toHaveBeenCalledTimes(1);
      expect(removeDocumentListener).toHaveBeenCalledTimes(1);
    } finally {
      tracker.restore();
    }
  });

  test('nested event trackers account for removals through the active wrapper', () => {
    const targetWindow = { addEventListener() {}, removeEventListener() {} };
    const targetDocument = { addEventListener() {}, removeEventListener() {} };
    const outer = installProductionTestEventTracker({ window: targetWindow, document: targetDocument });
    const inner = installProductionTestEventTracker({ window: targetWindow, document: targetDocument });
    const listener = () => {};
    try {
      targetDocument.addEventListener('keydown', listener);
      expect(outer.snapshot()).toHaveLength(1);
      expect(inner.snapshot()).toHaveLength(1);

      inner.reset();

      expect(outer.snapshot()).toEqual([]);
      expect(inner.snapshot()).toEqual([]);
    } finally {
      inner.restore();
      outer.restore();
    }
  });
});
