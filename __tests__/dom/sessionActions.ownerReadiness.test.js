const { createSessionActionsSaveTestContext } = require('../../test-support/sessionActionsSaveSuite');

describe('sessionActions — owner readiness and recovery snapshots', () => {
  const { installSessionActions, createContext } = createSessionActionsSaveTestContext();

  test('manual save and recovery independently capture the same canonical active owner state', async () => {
    const sessionActions = installSessionActions();
    const context = createContext();
    const activeTab = context.workspaceState.tabs[0];
    const livePayload = {
      type: 'scatter',
      data: [['Gene', 'X', 'Y'], ['A', 1, 2]],
      exclusions: { rows: [4], cols: [2], cells: [[1, 1]] },
      config: { title: 'Checkpoint parity' }
    };
    const liveLayout = { component: 'scatter', width: 777, height: 543 };
    const liveUiState = {
      toolbarActiveSection: 'data',
      component: { table: { firstDisplayedRow: 3 } }
    };
    activeTab.payload = { type: 'scatter', data: [] };
    activeTab.layoutState = null;
    activeTab.uiState = liveUiState;
    context.session.getActiveTab.mockReturnValue(activeTab);
    context.session.serializePayloadSignature = value => JSON.stringify(value);
    context.session.persistActiveTabState.mockImplementation((tab, options) => {
      expect(options.snapshotIntent).toEqual(expect.objectContaining({
        saveLike: true,
        captureLivePayload: true,
        allowSkipLivePayloadCapture: false
      }));
      tab.payload = JSON.parse(JSON.stringify(livePayload));
      tab.layoutState = JSON.parse(JSON.stringify(liveLayout));
      tab.payloadSignature = JSON.stringify(tab.payload);
      tab.layoutSignature = JSON.stringify(tab.layoutState);
    });

    const manual = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      snapshotKind: 'archive-save',
      policyMode: 'manual-save',
      captureRenderCacheBeforeSnapshot: false,
      includeRenderCacheInSnapshot: false,
      reason: 'toolbar-save'
    });
    const manualPersistOptions = context.session.persistActiveTabState.mock.calls.at(-1)[1];

    const recovery = await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      captureRenderCacheBeforeSnapshot: false,
      includeRenderCacheInSnapshot: false,
      reason: 'recovery-interval'
    });
    expect(recovery.snapshot).toStrictEqual(manual.snapshot);
    expect(recovery.snapshot.tabs[0]).toEqual(expect.objectContaining({
      payload: livePayload,
      layout: liveLayout,
      uiState: liveUiState,
      archiveRenderCache: null
    }));
    expect(context.session.persistActiveTabState).toHaveBeenCalledTimes(2);
    expect(manualPersistOptions.snapshotIntent.captureLivePayload).toBe(true);
    expect(recovery.policy.snapshotIntent).toEqual(expect.objectContaining({
      saveLike: true,
      captureLivePayload: true,
      allowSkipLivePayloadCapture: false
    }));
  });

  test('worker recovery still awaits component readiness before active-owner capture', async () => {
    const sessionActions = installSessionActions();
    const ready = jest.fn().mockResolvedValue({ ok: true });
    const context = createContext({
      workspaces: {
        scatter: { awaitReadyForSnapshot: ready }
      }
    });

    await sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      captureRenderCacheBeforeSnapshot: false,
      includeRenderCacheInSnapshot: false,
      useWorker: true,
      reason: 'recovery-interval'
    });

    expect(ready).toHaveBeenCalledTimes(1);
    expect(context.session.persistActiveTabState).toHaveBeenCalledTimes(1);
    expect(context.session.persistActiveTabState.mock.calls[0][1]).toEqual(expect.objectContaining({
      snapshotIntent: expect.objectContaining({
        saveLike: true,
        captureLivePayload: true,
        allowSkipLivePayloadCapture: false
      })
    }));
  });

  test('recovery aborts before live owner capture when rotation starts during readiness', async () => {
    const sessionActions = installSessionActions();
    let rotationActive = false;
    window.Shared.plot3d = {
      hasActiveRotationGesture: jest.fn(() => rotationActive)
    };
    const ready = jest.fn(async () => {
      rotationActive = true;
      return { ok: true };
    });
    const context = createContext({
      workspaces: {
        scatter: { awaitReadyForSnapshot: ready }
      }
    });

    await expect(sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      snapshotKind: 'recovery',
      policyMode: 'recovery',
      reason: 'recovery-interval'
    })).rejects.toMatchObject({
      code: 'GRAPHITIX_RECOVERY_INTERACTION_ACTIVE',
      stage: 'after-readiness'
    });
    expect(context.session.persistActiveTabState).not.toHaveBeenCalled();
  });

  test('does not capture canonical owner state when snapshot readiness is rejected', async () => {
    const sessionActions = installSessionActions();
    const ready = jest.fn().mockResolvedValue({ ok: false, reason: 'frame-publication-pending' });
    const context = createContext({
      workspaces: {
        scatter: { awaitReadyForSnapshot: ready }
      }
    });

    await expect(sessionActions.createDocumentCheckpoint(context, {
      scope: 'workspace',
      snapshotKind: 'archive-save',
      policyMode: 'manual-save',
      reason: 'toolbar-save'
    })).rejects.toMatchObject({
      code: 'GRAPHITIX_SNAPSHOT_NOT_READY',
      tabId: 'tab-1',
      component: 'scatter',
      reason: 'frame-publication-pending'
    });
    expect(context.session.persistActiveTabState).not.toHaveBeenCalled();
  });

  test('autosave defers cleanly when the active owner has not published a settled frame', async () => {
    const sessionActions = installSessionActions();
    window.Shared.fileIO.saveGraphFileAs = jest.fn();
    const context = createContext({
      workspaces: {
        scatter: { awaitReadyForSnapshot: jest.fn().mockResolvedValue({ ok: false, reason: 'component-not-idle' }) }
      }
    });

    const result = await sessionActions.saveWorkspaceArchiveWithScope(context, {
      scope: 'workspace',
      reason: 'autosave',
      snapshotKind: 'autosave'
    });

    expect(result).toEqual({ status: 'skipped', reason: 'snapshot-not-ready' });
    expect(context.session.persistActiveTabState).not.toHaveBeenCalled();
    expect(window.Shared.fileIO.saveGraphFileAs).not.toHaveBeenCalled();
  });
});
