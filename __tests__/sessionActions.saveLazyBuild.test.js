describe('sessionActions save lazy archive build', () => {
  function installSessionActions() {
    jest.resetModules();
    window.Main = {};
    window.Shared = {
      fileIO: {},
      graphArchive: {
        parseFile: jest.fn(),
        ensureGraphFileName: jest.fn((name, fallback) => name || fallback || 'workspace.graph'),
        buildArchiveBlob: jest.fn().mockResolvedValue(new Blob(['zip'], { type: 'application/zip' }))
      }
    };
    require('../js/main/sessionActions.js');
    return window.Main.sessionActions;
  }

  function createContext(overrides = {}) {
    const session = {
      fastClonePayload: value => (value == null ? value : JSON.parse(JSON.stringify(value))),
      getActiveTab: jest.fn(() => ({ id: 'tab-1', title: 'XY Plots', type: 'scatter' })),
      persistActiveTabState: jest.fn(),
      buildSessionPayload: jest.fn(() => ({
        activeIndex: 0,
        tabs: [{
          title: 'XY Plots',
          type: 'scatter',
          payload: { type: 'scatter', data: [[1, 2, 'A']] },
          layout: null
        }]
      })),
      clearSessionDirty: jest.fn()
    };
    const workspaceState = {
      tabs: [{
        id: 'tab-1',
        title: 'XY Plots',
        type: 'scatter',
        isWelcome: false,
        payload: { type: 'scatter', data: [[1, 2, 'A']] },
        layoutState: null
      }],
      sessionDirty: true,
      sessionFileHandle: null,
      sessionFileScope: null,
      sessionFileName: ''
    };
    return {
      Shared: window.Shared,
      session,
      workspaceState,
      withSessionContext: value => value,
      sessionFileTypes: [],
      ...overrides
    };
  }

  afterEach(() => {
    delete window.Main;
    delete window.Shared;
  });

  test('does not build archive blob when picker save is cancelled', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn().mockResolvedValue({
      status: 'cancelled',
      via: 'picker'
    });
    const context = createContext();

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    });

    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalled();
    expect(window.Shared.graphArchive.buildArchiveBlob).not.toHaveBeenCalled();
    expect(result.status).toBe('cancelled');
    expect(context.session.clearSessionDirty).not.toHaveBeenCalled();
  });

  test('builds archive blob only when save flow requests payload', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      const payload = await options.getPayload();
      expect(payload).toBeInstanceOf(Blob);
      return {
        status: 'saved',
        via: 'picker',
        fileName: 'workspace.graph'
      };
    });
    const context = createContext();

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace'
    });

    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalled();
    expect(window.Shared.graphArchive.buildArchiveBlob).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('saved');
    expect(context.session.clearSessionDirty).toHaveBeenCalledWith('graph-save-success');
  });
});
