'use strict';

const { inspectOwnerReadiness } = require('../../test-support/readiness.js');

describe('owner readiness predicate', () => {
  beforeEach(() => {
    global.document = {
      querySelector: () => null,
      getElementById: () => ({
        isConnected: true,
        querySelector: () => ({})
      })
    };
    global.window = {
      Main: {
        session: {
          workspaceState: {
            activeTabId: 'tab-a',
            tabs: [{ id: 'tab-a', type: 'box' }]
          }
        }
      },
      Components: { box: { ready: true, __asyncScope: { snapshot: () => ({ generation: 0, idle: true }) } } },
      Shared: {
        workspaceTabs: { getMountedRoot: () => null },
        componentLifecycle: { isRestoreTransactionActive: () => false }
      }
    };
  });

  afterEach(() => {
    delete global.window;
    delete global.document;
  });

  test('rejects a mismatched requested owner', () => {
    expect(inspectOwnerReadiness({
      type: 'box',
      expectedTabId: 'tab-b',
      diagnostic: true
    })).toEqual(expect.objectContaining({
      ready: false,
      phase: 'active-owner-mismatch'
    }));
  });

  test('requires the mounted root when strict ownership is requested', () => {
    expect(inspectOwnerReadiness({
      type: 'box',
      expectedTabId: 'tab-a',
      requireMountedRoot: true,
      diagnostic: true
    })).toEqual(expect.objectContaining({
      ready: false,
      phase: 'mounted-root-unavailable'
    }));
  });

  test('returns owner evidence after the projection is initialized', () => {
    global.window.Shared.workspaceTabs.getMountedRoot = () => ({
      isConnected: true,
      querySelector: () => ({})
    });
    expect(inspectOwnerReadiness({
      type: 'box',
      expectedTabId: 'tab-a',
      requireMountedRoot: true
    })).toEqual(expect.objectContaining({
      ready: true,
      owner: expect.objectContaining({ activeTabId: 'tab-a', componentType: 'box' })
    }));
    expect(inspectOwnerReadiness({
      type: 'box',
      expectedTabId: 'tab-a',
      requireMountedRoot: true
    }).asyncGeneration).toBe(0);
  });

  test('rejects a ready component without owner generation evidence', () => {
    global.window.Components.box.__asyncScope = null;
    expect(inspectOwnerReadiness({
      type: 'box',
      expectedTabId: 'tab-a',
      diagnostic: true
    })).toEqual(expect.objectContaining({
      ready: false,
      phase: 'owner-generation-unavailable'
    }));
  });

  test('rejects a projected root owned by a different tab', () => {
    global.window.Shared.workspaceTabs.getMountedRoot = () => ({
      isConnected: true,
      getAttribute: () => 'tab-b',
      querySelector: () => ({})
    });
    expect(inspectOwnerReadiness({
      type: 'box',
      expectedTabId: 'tab-a',
      requireMountedRoot: true,
      diagnostic: true
    })).toEqual(expect.objectContaining({
      ready: false,
      phase: 'mounted-root-owner-mismatch'
    }));
  });

  test('rejects a session resolved for a different owner', () => {
    global.window.Components.box.__testHooks = {
      getSession: () => ({ tabId: 'tab-b' })
    };
    global.window.Shared.workspaceTabs.getMountedRoot = () => ({
      isConnected: true,
      getAttribute: () => 'tab-a',
      querySelector: () => ({})
    });
    expect(inspectOwnerReadiness({
      type: 'box',
      expectedTabId: 'tab-a',
      requireMountedRoot: true,
      diagnostic: true
    })).toEqual(expect.objectContaining({
      ready: false,
      phase: 'session-owner-mismatch'
    }));
  });
});
