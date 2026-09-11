'use strict';

const { registerActiveProductionTab } = require('../../test-support/productionWorkspace.js');

describe('production workspace test fixture', () => {
  afterEach(() => {
    delete global.Main;
    delete global.Shared;
  });

  test('registers the active tab and mounts it through production ownership records', () => {
    const root = { setAttribute: jest.fn() };
    const sessionRecord = { generation: 4 };
    const tab = { id: 'tab-a', type: 'scatter' };
    global.Main = {
      session: { workspaceState: { tabs: [], activeTabId: null } }
    };
    global.Shared = {
      workspaceTabs: {
        ensureActiveSession: jest.fn(() => sessionRecord),
        ensureMountedRoot: jest.fn(() => root)
      }
    };

    const registered = registerActiveProductionTab({
      type: tab.type,
      tabId: tab.id,
      root
    });

    expect(registered.tab).toEqual(expect.objectContaining(tab));
    expect(registered.sessionRecord).toBe(sessionRecord);
    expect(global.Main.session.workspaceState).toEqual(expect.objectContaining({
      activeTabId: tab.id,
      tabs: [expect.objectContaining(tab)]
    }));
    expect(global.Shared.workspaceTabs.ensureActiveSession).toHaveBeenCalledWith(
      expect.objectContaining(tab),
      tab.type,
      expect.objectContaining({ tabId: tab.id })
    );
    expect(global.Shared.workspaceTabs.ensureMountedRoot).toHaveBeenCalled();
    expect(root.setAttribute).toHaveBeenCalledWith('data-workspace-tab-id', tab.id);
  });

  test('fails instead of silently creating a fake owner boundary', () => {
    expect(() => registerActiveProductionTab({ type: 'line', tabId: 'tab-a' }))
      .toThrow('Main.session and Shared.workspaceTabs');
  });
});
