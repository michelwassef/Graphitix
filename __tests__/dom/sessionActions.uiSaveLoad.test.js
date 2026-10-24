const { createSessionActionsSaveTestContext } = require('../../test-support/sessionActionsSaveSuite');

describe('sessionActions — UI save and load actions', () => {
  const { installSessionActions, createContext } = createSessionActionsSaveTestContext();

  test('first Save uses Save As when the document has no file target', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFile = jest.fn().mockResolvedValue({
      status: 'saved',
      via: 'existingHandle',
      fileName: 'workspace.graph'
    });
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      return { status: 'saved', via: 'picker', fileName: 'workspace.graph' };
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

  test('download fallback keeps a new document on the new-file Save path', async () => {
    const sessionActions = installSessionActions();
    const context = createContext({
      workspaceState: {
        ...createContext().workspaceState,
        sessionFileHandle: null,
        sessionFileName: '',
        sessionFilePath: '',
        sessionFileScope: null,
        sessionFileTabId: null,
        sessionFileTargetKind: 'new'
      }
    });
    window.Shared.fileIO.saveGraphFile = jest.fn();
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      return { status: 'downloaded', via: 'download', fileName: 'workspace.graph' };
    });

    const firstSave = await sessionActions.handleSessionSaveClick(context, { reason: 'toolbar-save' });
    const secondSave = await sessionActions.handleSessionSaveClick(context, { reason: 'toolbar-save' });

    expect(firstSave.status).toBe('downloaded');
    expect(secondSave.status).toBe('downloaded');
    expect(window.Shared.fileIO.saveGraphFile).not.toHaveBeenCalled();
    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalledTimes(2);
    expect(context.workspaceState.sessionFileTargetKind).toBe('new');
    expect(context.workspaceState.sessionFileHandle).toBeNull();
  });

  test('downloaded explicit Save As retires the prior target before later Save', async () => {
    const sessionActions = installSessionActions();
    const originalHandle = { name: 'original.graph' };
    const context = createContext({
      workspaceState: {
        ...createContext().workspaceState,
        sessionFileHandle: originalHandle,
        sessionFileName: 'original.graph',
        sessionFileScope: 'workspace',
        sessionFileTargetKind: 'existing'
      }
    });
    window.Shared.fileIO.saveGraphFile = jest.fn();
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      return { status: 'downloaded', via: 'download', fileName: 'copy.graph' };
    });

    const saveAsResult = await sessionActions.handleSessionSaveClick(context, {
      reason: 'toolbar-save-as',
      forcePicker: true
    });
    const saveResult = await sessionActions.handleSessionSaveClick(context, { reason: 'toolbar-save' });

    expect(saveAsResult.status).toBe('downloaded');
    expect(saveResult.status).toBe('downloaded');
    expect(window.Shared.fileIO.saveGraphFile).not.toHaveBeenCalled();
    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalledTimes(2);
    expect(context.workspaceState.sessionFileHandle).toBeNull();
    expect(context.workspaceState.sessionFileTargetKind).toBe('new');
  });

  test('toolbar Save preserves the existing tab-scoped file target', async () => {
    const sessionActions = installSessionActions();
    const existingHandle = { name: 'existing.graph' };
    window.Shared.fileIO.saveGraphFile = jest.fn(async options => {
      await options.getPayload();
      return {
        status: 'saved',
        via: 'existingHandle',
        fileName: 'existing.graph'
      };
    });
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      return { status: 'saved', via: 'picker', fileName: 'renamed.graph' };
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
    expect(window.Shared.fileIO.saveGraphFileAs).not.toHaveBeenCalled();
    expect(saveResult.status).toBe('saved');

    const saveAsResult = await sessionActions.handleSessionSaveClick(baseContext, {
      reason: 'toolbar-save-as',
      forcePicker: true
    });
    expect(window.Shared.fileIO.saveGraphFileAs).toHaveBeenCalledTimes(1);
    expect(saveAsResult.status).toBe('saved');
  });

  test('an opened file without a browser handle cannot silently switch Save to Save As', async () => {
    const sessionActions = installSessionActions();
    const context = createContext({
      workspaceState: {
        ...createContext().workspaceState,
        sessionFileTargetKind: 'existing',
        sessionFileName: 'opened.graph',
        sessionFileScope: 'workspace',
        sessionFileHandle: null
      }
    });
    window.Shared.fileIO.saveGraphFile = jest.fn();
    window.Shared.fileIO.saveGraphFileAs = jest.fn();

    const result = await sessionActions.handleSessionSaveClick(context, { reason: 'toolbar-save' });

    expect(result).toMatchObject({ status: 'error', reason: 'existing-file-handle-unavailable' });
    expect(window.Shared.fileIO.saveGraphFile).not.toHaveBeenCalled();
    expect(window.Shared.fileIO.saveGraphFileAs).not.toHaveBeenCalled();
    expect(window.Shared.graphArchive.buildArchiveBlob).not.toHaveBeenCalled();
  });

  test('saving a different tab cannot reuse the tab-scoped file handle', async () => {
    const sessionActions = installSessionActions();
    const context = createContext();
    const ownerA = { ...context.workspaceState.tabs[0], id: 'tab-a', title: 'Owner A' };
    const ownerB = { ...context.workspaceState.tabs[0], id: 'tab-b', title: 'Owner B' };
    context.workspaceState.tabs = [ownerA, ownerB];
    context.workspaceState.sessionFileHandle = { name: 'owner-a.graph' };
    context.workspaceState.sessionFileScope = 'tab';
    context.workspaceState.sessionFileTabId = ownerA.id;
    context.session.getActiveTab.mockReturnValue(ownerA);
    window.Shared.fileIO.saveGraphFile = jest.fn().mockResolvedValue({ status: 'saved', fileName: 'owner-a.graph' });
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      return { status: 'saved', fileName: 'owner-b.graph' };
    });

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'tab',
      targetTabId: ownerB.id,
      reason: 'tab-owner-save'
    });

    expect(window.Shared.fileIO.saveGraphFile).not.toHaveBeenCalled();
    expect(window.Shared.fileIO.saveGraphFileAs).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'error', reason: 'existing-file-target-mismatch' });
    expect(context.workspaceState.sessionFileTabId).toBe(ownerA.id);
    expect(window.Shared.graphArchive.buildArchiveBlob).not.toHaveBeenCalled();
    expect(context.session.persistActiveTabState).not.toHaveBeenCalled();
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

