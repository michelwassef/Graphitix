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

  test('handleSessionSaveClick uses Save As flow when there is no existing file handle', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFile = jest.fn().mockResolvedValue({
      status: 'saved',
      via: 'existingHandle',
      fileName: 'workspace.graph'
    });
    window.Shared.fileIO.saveGraphFileAs = jest.fn().mockResolvedValue({
      status: 'saved',
      via: 'picker',
      fileName: 'workspace.graph'
    });
    const context = createContext({
      workspaceState: {
        ...createContext().workspaceState,
        sessionFileHandle: null,
        sessionFileScope: null
      }
    });

    const result = await sessionActions.handleSessionSaveClick(context, {
      reason: 'toolbar-save'
    });

    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalledTimes(1);
    expect(window.Shared.fileIO.saveGraphFile).not.toHaveBeenCalled();
    expect(result.status).toBe('saved');
  });

  test('handleSessionSaveClick reuses existing handle on Save and forces picker on Save As', async () => {
    const sessionActions = installSessionActions();
    const existingHandle = { name: 'existing.graph' };
    window.Shared.fileIO.saveGraphFile = jest.fn().mockResolvedValue({
      status: 'saved',
      via: 'existingHandle',
      fileName: 'existing.graph'
    });
    window.Shared.fileIO.saveGraphFileAs = jest.fn().mockResolvedValue({
      status: 'saved',
      via: 'picker',
      fileName: 'renamed.graph'
    });
    const baseContext = createContext({
      workspaceState: {
        ...createContext().workspaceState,
        sessionFileHandle: existingHandle,
        sessionFileScope: 'tab',
        sessionFileName: 'existing.graph'
      }
    });

    const saveResult = await sessionActions.handleSessionSaveClick(baseContext, {
      reason: 'toolbar-save'
    });
    expect(window.Shared.fileIO.saveGraphFile).toHaveBeenCalledTimes(1);
    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalledTimes(0);
    expect(saveResult.status).toBe('saved');

    const saveAsResult = await sessionActions.handleSessionSaveClick(baseContext, {
      reason: 'toolbar-save-as',
      forcePicker: true
    });
    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalledTimes(1);
    expect(saveAsResult.status).toBe('saved');
  });

  test('loadWorkspaceFile appends tabs when loadMode is append and marks session dirty', async () => {
    const sessionActions = installSessionActions();
    const parsed = {
      source: 'graph-archive',
      session: {
        activeIndex: 0,
        tabs: [{
          title: 'Loaded Scatter',
          type: 'scatter',
          payload: { type: 'scatter', data: [[7, 9, 'L']] },
          layout: null
        }],
        scope: 'tab'
      }
    };
    window.Shared.graphArchive.parseFile.mockResolvedValue(parsed);
    const applySessionData = jest.fn();
    const markSessionDirty = jest.fn();
    const context = {
      Shared: window.Shared,
      session: {
        fastClonePayload: value => (value == null ? value : JSON.parse(JSON.stringify(value))),
        buildSessionPayload: jest.fn(() => ({
          activeIndex: 0,
          tabs: [{
            title: 'Existing XY',
            type: 'scatter',
            payload: { type: 'scatter', data: [[1, 2, 'E']] },
            layout: null
          }]
        })),
        applySessionData,
        markSessionDirty
      },
      workspaceState: {
        tabs: [],
        sessionFileHandle: { name: 'existing.graph' },
        sessionFileScope: 'workspace',
        sessionFileName: 'existing.graph'
      },
      withSessionContext: value => value
    };

    const result = await sessionActions.loadWorkspaceFile(context, { name: 'incoming.graph' }, {
      fileName: 'incoming.graph',
      fileHandle: { name: 'incoming.graph' },
      loadMode: 'append',
      reason: 'welcome-graph-load'
    });

    expect(window.Shared.graphArchive.parseFile).toHaveBeenCalledTimes(1);
    expect(applySessionData).toHaveBeenCalledTimes(1);
    const [payload, options] = applySessionData.mock.calls[0];
    expect(payload.tabs).toHaveLength(2);
    expect(payload.activeIndex).toBe(1);
    expect(options.fileHandle).toBeNull();
    expect(options.fileScope).toBe('workspace');
    expect(context.workspaceState.sessionFileHandle).toBeNull();
    expect(context.workspaceState.sessionFileScope).toBe('workspace');
    expect(context.workspaceState.sessionFileName).toBe('workspace.graph');
    expect(markSessionDirty).toHaveBeenCalledWith('graph-load-append', { existingTabCount: 1, addedTabCount: 1 });
    expect(result.loadMode).toBe('append');
    expect(result.tabCount).toBe(2);
  });
});
