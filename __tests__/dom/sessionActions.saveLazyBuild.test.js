const { createSessionActionsSaveTestContext } = require('../../test-support/sessionActionsSaveSuite');

describe('sessionActions — save policy decisions', () => {
  const { installSessionActions, createContext } = createSessionActionsSaveTestContext();

  test('reopened file obtains write permission before slow snapshot preparation consumes activation', async () => {
    const sessionActions = installSessionActions();
    require('../../js/shared/fileIO.js');
    const fileIO = window.Shared.fileIO;
    const originalActivation = Object.getOwnPropertyDescriptor(navigator, 'userActivation');
    const activation = { isActive: true };
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: activation });
    const writable = { write: jest.fn(), close: jest.fn() };
    let granted = false;
    const handle = {
      name: 'reopened.graph',
      queryPermission: jest.fn(async () => granted ? 'granted' : 'prompt'),
      requestPermission: jest.fn(async () => {
        granted = activation.isActive;
        return granted ? 'granted' : 'prompt';
      }),
      createWritable: jest.fn(async () => writable)
    };
    const saveAs = jest.spyOn(fileIO, 'saveGraphFileAs').mockResolvedValue({ status: 'cancelled' });
    const context = createContext({
      workspaces: {
        scatter: { awaitReadyForSnapshot: jest.fn(async () => {
          activation.isActive = false;
          return { ok: true };
        }) }
      }
    });
    Object.assign(context.workspaceState, {
      sessionFileHandle: handle, sessionFileScope: 'workspace', sessionFileName: handle.name
    });
    try {
      const result = await sessionActions.handleSessionSaveClick(context, { reason: 'toolbar-save' });
      expect(result.status).toBe('saved');
      expect(result.via).toBe('existingHandle');
      expect(handle.requestPermission).toHaveBeenCalledTimes(1);
      expect(writable.write).toHaveBeenCalledTimes(1);
      expect(writable.close).toHaveBeenCalledTimes(1);
      expect(saveAs).not.toHaveBeenCalled();
      expect(context.workspaceState.sessionFileHandle).toBe(handle);
    } finally {
      if (originalActivation) Object.defineProperty(navigator, 'userActivation', originalActivation);
      else delete navigator.userActivation;
    }
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
    expect(context.session.persistActiveTabState).not.toHaveBeenCalled();
  });

  test.each([false, true])('selects the destination before preparing a first save or Save As (%s)', async forcePicker => {
    const sessionActions = installSessionActions();
    const context = createContext();
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      expect(context.session.persistActiveTabState).not.toHaveBeenCalled();
      await options.getPayload();
      return { status: 'saved', fileName: 'chosen.graph' };
    });
    await expect(sessionActions.handleSessionSaveClick(context, { forcePicker })).resolves.toMatchObject({ status: 'saved' });
    expect(context.session.persistActiveTabState).toHaveBeenCalledTimes(1);
  });

  test.each(['picker', 'readiness', 'serialization', 'write'])('replacement during %s preserves the new document and its file target', async phase => {
    const sessionActions = installSessionActions();
    require('../../js/shared/fileIO.js');
    const context = createContext();
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'userActivation');
    const originalPicker = window.showSaveFilePicker;
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
    const replace = () => {
      context.workspaceState.tabs = [{ ...context.workspaceState.tabs[0], id: 'replacement' }];
    };
    const writable = {
      write: jest.fn(async () => { if (phase === 'write') replace(); }), close: jest.fn()
    };
    const handle = { createWritable: jest.fn(async () => writable) };
    window.showSaveFilePicker = jest.fn(async () => {
      if (phase === 'picker') replace();
      return handle;
    });
    context.workspaces = { scatter: { awaitReadyForSnapshot: jest.fn(async () => {
      if (phase === 'readiness') replace();
      return { ok: true };
    }) } };
    window.Shared.graphArchive.buildArchiveBlob.mockImplementation(async () => {
      if (phase === 'serialization') replace();
      return new Blob(['archive']);
    });
    try {
      const result = await sessionActions.handleSessionSaveClick(context);
      expect(result.status).toBe('cancelled');
      expect(context.session.persistActiveTabState).toHaveBeenCalledTimes(['picker', 'readiness'].includes(phase) ? 0 : 1);
      expect(handle.createWritable).toHaveBeenCalledTimes(phase === 'write' ? 1 : 0);
      expect(context.workspaceState.sessionFileHandle).toBeNull();
      expect(context.session.clearSessionDirty).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'userActivation', descriptor);
      else delete navigator.userActivation;
      window.showSaveFilePicker = originalPicker;
    }
  });

  test('permission wait cannot save a replacement document to the old file', async () => {
    const sessionActions = installSessionActions();
    const context = createContext();
    const handle = { createWritable: jest.fn() };
    Object.assign(context.workspaceState, { sessionFileHandle: handle, sessionFileScope: 'workspace' });
    window.Shared.fileIO.saveGraphFile = jest.fn(async options => {
      context.workspaceState.tabs = [{ ...context.workspaceState.tabs[0], id: 'replacement' }];
      await options.getPayload();
    });

    await expect(sessionActions.handleSessionSaveClick(context)).resolves.toEqual({
      status: 'cancelled', reason: 'file-target-changed'
    });
    expect(context.session.persistActiveTabState).not.toHaveBeenCalled();
    expect(window.Shared.graphArchive.buildArchiveBlob).not.toHaveBeenCalled();
  });

  test('edits during write permission remain dirty after saving the earlier revision', async () => {
    const sessionActions = installSessionActions();
    const context = createContext();
    const handle = { createWritable: jest.fn() };
    Object.assign(context.workspaceState, {
      sessionFileHandle: handle, sessionFileScope: 'workspace', sessionRevision: 1
    });
    window.Shared.fileIO.saveGraphFile = jest.fn(async options => {
      context.workspaceState.sessionRevision = 2;
      await options.getPayload();
      return { status: 'saved' };
    });

    const result = await sessionActions.handleSessionSaveClick(context);
    expect(result.savedRevision).toBe(1);
    expect(context.session.clearSessionDirty).toHaveBeenCalledWith('graph-save-success', 1);
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
    expect(context.session.clearSessionDirty).toHaveBeenCalledWith('graph-save-success', 0);
  });

  test('failed preparation after choosing a destination does not write or mark saved', async () => {
    const sessionActions = installSessionActions();
    require('../../js/shared/fileIO.js');
    const context = createContext();
    const originalPicker = window.showSaveFilePicker;
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'userActivation');
    Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: true } });
    const handle = { createWritable: jest.fn() };
    window.showSaveFilePicker = jest.fn(async () => handle);
    window.Shared.graphArchive.buildArchiveBlob.mockRejectedValue(new Error('Preparation failed'));
    try {
      await expect(sessionActions.handleSessionSaveClick(context)).resolves.toMatchObject({ status: 'error' });
      expect(handle.createWritable).not.toHaveBeenCalled();
      expect(context.workspaceState.sessionFileHandle).toBeNull();
      expect(context.session.clearSessionDirty).not.toHaveBeenCalled();
    } finally {
      if (descriptor) Object.defineProperty(navigator, 'userActivation', descriptor);
      else delete navigator.userActivation;
      window.showSaveFilePicker = originalPicker;
    }
  });

  test('keeps a newer user revision dirty when an older archive save completes', async () => {
    const sessionActions = installSessionActions();
    let resolveSave;
    let markSaveStarted;
    const saveGate = new Promise(resolve => { resolveSave = resolve; });
    const saveStarted = new Promise(resolve => { markSaveStarted = resolve; });
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      markSaveStarted();
      return saveGate;
    });
    const context = createContext();
    context.workspaceState.sessionRevision = 1;
    context.workspaceState.sessionUserDirty = true;
    context.session.clearSessionDirty.mockImplementation((_reason, expectedRevision) => {
      if (context.workspaceState.sessionRevision !== expectedRevision) return false;
      context.workspaceState.sessionDirty = false;
      context.workspaceState.sessionUserDirty = false;
      return true;
    });

    const savePromise = sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace',
      reason: 'autosave',
      snapshotKind: 'autosave'
    });
    await saveStarted;
    context.workspaceState.sessionRevision = 2;
    context.workspaceState.sessionDirty = true;
    context.workspaceState.sessionUserDirty = true;
    context.workspaceState.tabs[0].payload.data.push([3, 4, 'B']);
    resolveSave({ status: 'saved', via: 'handle', fileName: 'workspace.graph' });

    await savePromise;

    expect(context.session.clearSessionDirty).toHaveBeenCalledWith('graph-save-success', 1);
    expect(context.workspaceState.sessionUserDirty).toBe(true);
    expect(context.workspaceState.sessionDirty).toBe(true);
  });

  test('checkpoint keeps the revision from before asynchronous capture', async () => {
    const sessionActions = installSessionActions();
    const context = createContext();
    context.workspaceState.sessionRevision = 1;
    context.session.persistActiveTabState.mockImplementation(() => {
      context.workspaceState.sessionRevision = 2;
      return false;
    });

    const checkpoint = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      reason: 'revision-boundary'
    });

    expect(context.session.persistActiveTabState).toHaveBeenCalled();
    expect(checkpoint.sessionRevision).toBe(1);
  });

  test('autosave snapshot policy keeps render-cache capture disabled', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      return { status: 'saved', via: 'picker', fileName: 'workspace.graph' };
    });
    const context = createContext();

    await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace',
      reason: 'autosave',
      snapshotKind: 'autosave'
    });

    const lastPersistCall = context.session.persistActiveTabState.mock.calls.at(-1) || [];
    expect(lastPersistCall[1]).toEqual(expect.objectContaining({
      captureRenderCache: false
    }));
  });

  test('manual save snapshot policy captures render cache by default', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn(async options => {
      await options.getPayload();
      return { status: 'saved', via: 'picker', fileName: 'workspace.graph' };
    });
    const context = createContext();

    await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace',
      reason: 'toolbar-save'
    });

    const lastPersistCall = context.session.persistActiveTabState.mock.calls.at(-1) || [];
    expect(lastPersistCall[1]).toEqual(expect.objectContaining({
      captureRenderCache: true
    }));
  });

  test('recovery snapshot policy matches manual save cache richness', async () => {
    const sessionActions = installSessionActions();
    const context = createContext();

    const recovery = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      policyMode: 'recovery',
      snapshotKind: 'recovery',
      reason: 'recovery-interval'
    });

    expect(recovery.policy).toEqual(expect.objectContaining({
      captureRenderCache: true,
      includeRenderCache: true,
      preserveRenderCacheTabScope: 'all',
      policyId: 'recovery-rich'
    }));
    expect(context.session.persistActiveTabState).toHaveBeenCalledWith(
      context.workspaceState.tabs[0],
      expect.objectContaining({
        captureRenderCache: true,
        captureRenderCacheIfNeeded: true,
        reason: 'recovery-interval'
      })
    );
  });

  test.each([
    ['manual-save', 'archive-save'],
    ['recovery', 'recovery']
  ])('awaits pending PNG previews before %s checkpoint capture', async (policyMode, snapshotKind) => {
    const sessionActions = installSessionActions();
    const context = createContext();
    const tab = context.workspaceState.tabs[0];
    const previews = {
      awaitPendingCaptures: jest.fn(async tabIds => {
        expect(tabIds).toEqual([tab.id]);
        tab.previewMarkup = '<img src="data:image/png;base64,cHJldmlldw==" data-tab-preview-format="png">';
        tab.previewSignature = 'preview-payload';
        tab.previewMeta = { format: 'png', rasterized: true };
      })
    };
    context.previews = previews;
    context.session.getActiveTab.mockReturnValue(tab);

    const checkpoint = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      policyMode,
      snapshotKind,
      reason: `${snapshotKind}-preview`
    });

    expect(previews.awaitPendingCaptures).toHaveBeenCalled();
    expect(checkpoint.snapshot.tabs[0]).toEqual(expect.objectContaining({
      previewMarkup: expect.stringContaining('data-tab-preview-format="png"'),
      previewSignature: 'preview-payload',
      previewMeta: expect.objectContaining({ format: 'png', rasterized: true })
    }));
  });

});

