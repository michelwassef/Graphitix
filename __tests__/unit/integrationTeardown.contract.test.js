'use strict';

const {
  collectIntegrationLeaks,
  disposeIntegrationTabs,
  formatIntegrationLeakReport
} = require('../../test-support/integrationTeardown');

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
});
