const { createVennAdditionalTabTestContext } = require('../../test-support/vennAdditionalTabSuite');

describe('Venn additional tabs — cache and recovery', () => {
  const {
    flush,
    handleGraphSelection,
  } = createVennAdditionalTabTestContext();

  test('venn render cache restore removes stale empty-data notice', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');

    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();
    const state = venn.__getState();
    state.ui.inputs.labelA.value = 'Transcriptomic';
    state.ui.inputs.labelB.value = 'Proteomic';
    state.ui.inputs.labelC.value = 'Phospho';
    state.ui.inputs.A.value = 'BRCA1\nATM\nBAP1';
    state.ui.inputs.B.value = 'BRCA1\nBAP1\nRING1B';
    state.ui.inputs.C.value = 'BRCA1\nRING1B';
    state.ui.syncTableFromInputs?.({ refresh: true });
    state.analysis.lastDrawMode = 'lists';
    await venn.refreshDiagram();
    await venn.awaitReadyForSnapshot({
      tabId: Main.tabs.getActiveTab().id,
      reason: 'test-render-cache-capture'
    });
    await flush();

    const tab = Main.tabs.getActiveTab();
    const ownerSession = venn.__testHooks.getSession(tab.id);
    // Species recognition is optional enrichment and is deliberately not part
    // of graph snapshot readiness. It remains owner-scoped until the later
    // empty-input transition cancels it.
    expect(state.analysis.speciesDetection.pendingTimeoutId)
      .toBe(ownerSession.timers.pendingSpeciesDetection);
    expect(state.analysis.speciesDetection.active).toBeNull();
    expect(ownerSession.cache.asyncRequests).toEqual({
      go: null,
      string: null,
      species: null,
      stringOverlay: null
    });
    expect(venn.hasRenderedGraph({ tabId: tab.id, root: state.ui.root })).toBe(true);
    const cache = venn.captureRenderCache({ tabId: tab.id });
    expect(cache).toBeTruthy();
    expect(cache.__graphitixRenderCache).toEqual(expect.objectContaining({
      type: 'venn',
      tabId: tab.id,
      complete: true
    }));
    // Capture snapshots the graph without moving or mutating the mounted DOM.
    expect(venn.hasRenderedGraph({ tabId: tab.id, root: state.ui.root })).toBe(true);
    expect(venn.canRestoreRenderCache(cache, { tabId: tab.id })).toBe(true);
    expect(venn.canRestoreRenderCache(cache, { tabId: `${tab.id}-other` })).toBe(false);
    expect(cache.graphOnly).toBe(true);
    expect(cache.regionList).toBeUndefined();
    expect(cache.goResults).toBeUndefined();
    expect(cache.stringResults).toBeUndefined();
    expect(cache.stringNetwork).toBeUndefined();
    expect(cache.goChart).toBeUndefined();
    expect(state.ui.vennExportControls?.querySelectorAll('.export-select-wrapper').length).toBeGreaterThanOrEqual(2);
    expect(state.ui.svgBox?.querySelector('.resizer-options-control')).toBeTruthy();
    expect(state.ui.svgBox?.querySelector('.resizer-zoom-control')).toBeTruthy();

    state.ui.inputs.A.value = '';
    state.ui.inputs.B.value = '';
    state.ui.inputs.C.value = '';
    state.ui.syncTableFromInputs?.({ refresh: true });
    venn.refreshDiagram();
    await flush();
    expect(state.ui.emptyNotice?.hidden).toBe(false);
    state.ui.vennExportControls.innerHTML = '';
    state.ui.svgBox?.querySelector('.resizer-control-tray')?.remove();

    venn.loadFromPayload(tab.payload, {
      tabId: tab.id,
      skipDraw: true,
      restoreRenderCache: true,
      recordUndo: false
    });
    expect(venn.restoreRenderCache(cache, { tabId: tab.id })).toBe(true);
    expect(venn.hasRenderedGraph({ tabId: tab.id, root: state.ui.root })).toBe(true);

    expect(state.ui.emptyNotice?.hidden).toBe(true);
    expect(state.ui.stage?.querySelector('[data-venn-trace-id]')).toBeTruthy();
    expect(state.ui.vennExportControls?.querySelectorAll('.export-select-wrapper').length).toBeGreaterThanOrEqual(2);
    expect(state.ui.svgBox?.querySelector('.resizer-options-control')).toBeTruthy();
    expect(state.ui.svgBox?.querySelector('.resizer-zoom-control')).toBeTruthy();
  });

  test('venn recovery persist does not drift from restored payload schema', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'venn');

    const venn = window.Components?.venn;
    expect(venn).toBeTruthy();
    const tab = Main.tabs.getActiveTab();
    const state = venn.__getState();
    state.ui.inputs.labelA.value = 'Transcriptomic';
    state.ui.inputs.labelB.value = 'Proteomic';
    state.ui.inputs.labelC.value = 'Phospho';
    state.ui.inputs.A.value = 'BRCA1\nATM\nBAP1\nEZH2\nSUZ12\nRING1B';
    state.ui.inputs.B.value = 'BRCA1\nBAP1\nRING1B\nCBX2\nHDAC1\nPAXIP1\nHUWE1';
    state.ui.inputs.C.value = 'BRCA1\nPAXIP1\nCSNK2A1\nRING1B\nKAT7';
    state.ui.syncTableFromInputs?.({ refresh: true });
    state.analysis.lastDrawMode = 'lists';
    venn.refreshDiagram();
    await flush();

    Main.session.persistActiveTabState(tab, {
      reason: 'archive-save',
      forcePreviewCapture: false
    });
    const restoredPayload = Main.session.clonePayload(tab.payload);
    ['nA', 'nB', 'nC', 'nAB', 'nAC', 'nBC', 'nABC'].forEach(key => {
      delete restoredPayload.data[key];
    });
    if (restoredPayload.meta && typeof restoredPayload.meta === 'object') {
      delete restoredPayload.meta.graphSizing;
      if (!Object.keys(restoredPayload.meta).length) {
        delete restoredPayload.meta;
      }
    }
    const restoredLayout = Main.session.clonePayload(tab.layoutState);
    tab.payload = restoredPayload;
    tab.payloadSignature = Main.session.serializePayloadSignature(restoredPayload);
    tab.layoutState = restoredLayout;
    tab.layoutSignature = Main.session.serializePayloadSignature(restoredLayout);
    tab.userModified = false;
    tab.payloadDirty = false;
    Main.session.workspaceState.loadedWorkspaces[tab.id] = {
      tabId: tab.id,
      type: tab.type,
      payloadSignature: tab.payloadSignature,
      layoutSignature: tab.layoutSignature
    };

    venn.loadFromPayload(restoredPayload, {
      tabId: tab.id,
      skipDraw: true,
      recordUndo: false,
      source: 'recovery-test'
    });
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    try {
      Main.session.persistActiveTabState(tab, {
        reason: 'recovery-restored',
        origin: 'lifecycle',
        forcePreviewCapture: false,
        snapshotIntent: {
          lifecycleSnapshot: true,
          captureLivePayload: true,
          allowSkipLivePayloadCapture: false,
          reasonSkippable: false,
          snapshotCapture: true
        }
      });
    } finally {
      const driftCalls = debugSpy.mock.calls.filter(call => String(call[0] || '').includes('payload drift observed'));
      debugSpy.mockRestore();
      expect(driftCalls).toEqual([]);
      expect(tab.payload?.meta?.graphSizing).toBeUndefined();
    }
  });

});
