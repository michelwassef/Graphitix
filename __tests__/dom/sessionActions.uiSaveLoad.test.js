const { createSessionActionsSaveTestContext } = require('../../test-support/sessionActionsSaveSuite');

describe('sessionActions — UI save and load actions', () => {
  const { installSessionActions, createContext } = createSessionActionsSaveTestContext();

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

  test('handleSessionSaveClick saves all tabs by default and does not reuse a tab-only handle', async () => {
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
    expect(window.Shared.fileIO.saveGraphFile).toHaveBeenCalledTimes(0);
    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalledTimes(1);
    expect(saveResult.status).toBe('saved');

    const saveAsResult = await sessionActions.handleSessionSaveClick(baseContext, {
      reason: 'toolbar-save-as',
      forcePicker: true
    });
    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalledTimes(2);
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
    expect(payload.tabs).toHaveLength(1);
    expect(payload.activeIndex).toBe(0);
    expect(options.fileHandle).toBeNull();
    expect(options.fileScope).toBe('workspace');
    expect(context.workspaceState.sessionFileHandle).toBeNull();
    expect(context.workspaceState.sessionFileScope).toBe('workspace');
    expect(context.workspaceState.sessionFileName).toBe('workspace.graph');
    expect(markSessionDirty).toHaveBeenCalledTimes(0);
    expect(result.loadMode).toBe('append');
    expect(result.tabCount).toBeGreaterThanOrEqual(1);
  });

});

