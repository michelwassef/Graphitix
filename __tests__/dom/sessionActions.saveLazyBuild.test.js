const { createSessionActionsSaveTestContext } = require('../../test-support/sessionActionsSaveSuite');

describe('sessionActions — save policy decisions', () => {
  const { installSessionActions, createContext } = createSessionActionsSaveTestContext();

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

