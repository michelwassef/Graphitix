'use strict';

const { inspectOwnerReadiness,waitForIntegrationOwnerReady } = require('../../test-support/readiness.js');

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
    jest.useRealTimers();
    delete global.window;
    delete global.document;
  });

  test('integration wait observes owner completion rather than counting timer turns', async () => {
    jest.useFakeTimers();
    let idle=false;
    global.window.Components.box.__asyncScope.snapshot=()=>({generation:0,idle});
    let completed=false;
    const result=waitForIntegrationOwnerReady({type:'box'}).then(value=>{completed=true;return value;});
    await jest.advanceTimersByTimeAsync(5);
    expect(completed).toBe(false);
    idle=true;
    await jest.advanceTimersByTimeAsync(1);
    expect((await result).owner.activeTabId).toBe('tab-a');
  });

  test('integration wait includes the caller completion condition', async () => {
    jest.useFakeTimers();
    let calculated=false;
    let completed=false;
    const result=waitForIntegrationOwnerReady({type:'box',condition:()=>calculated}).then(value=>{completed=true;return value;});
    await jest.advanceTimersByTimeAsync(5);
    expect(completed).toBe(false);
    calculated=true;
    await jest.advanceTimersByTimeAsync(1);
    expect((await result).ready).toBe(true);
  });

  test('integration wait cannot silently follow another active owner', async () => {
    jest.useFakeTimers();
    global.window.Components.box.__asyncScope.snapshot=()=>({generation:0,idle:false});
    const result=waitForIntegrationOwnerReady({type:'box',timeout:10});
    const assertion=expect(result).rejects.toThrow(/active-owner-mismatch/);
    global.window.Main.session.workspaceState.activeTabId='tab-b';
    global.window.Main.session.workspaceState.tabs.push({id:'tab-b',type:'box'});
    await jest.advanceTimersByTimeAsync(11);
    await assertion;
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

  test('uses the production workspace publication validator for the owner root', () => {
    const root = {
      isConnected: true,
      getAttribute: () => 'tab-a',
      querySelector: () => ({})
    };
    global.window.Shared.workspaceTabs.getMountedRoot = () => root;
    const validator = jest.fn(meta => meta.root === root && meta.tabId === 'tab-a');
    global.window.Main.components = { get: () => ({ hasRenderedGraph: validator }) };

    expect(inspectOwnerReadiness({
      type: 'box',
      expectedTabId: 'tab-a',
      requireMountedRoot: true,
      requirePublished: true
    })).toEqual(expect.objectContaining({ ready: true, published: true }));
    expect(validator).toHaveBeenCalledWith({ tabId: 'tab-a', root });
  });

  test('does not infer graph publication when the workspace validator rejects it', () => {
    global.window.Shared.workspaceTabs.getMountedRoot = () => ({
      isConnected: true,
      getAttribute: () => 'tab-a',
      querySelector: () => ({})
    });
    global.window.Components.box.hasRenderedGraph = jest.fn(() => true);
    global.window.Main.components = { get: () => ({ hasRenderedGraph: () => false }) };

    expect(inspectOwnerReadiness({
      type: 'box',
      expectedTabId: 'tab-a',
      requireMountedRoot: true,
      requirePublished: true,
      diagnostic: true
    })).toEqual(expect.objectContaining({
      ready: false,
      phase: 'primary-graph-not-published'
    }));
  });
});
