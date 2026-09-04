// Regression tests for assignTabPayload — the function the recovery-interval autosave
// path calls every few seconds with the result of getPayload(). The defensive guard
// added after the May 5 reopen log incident protects against two specific corruptions:
//   1. A null payload arriving from a tab whose component is still binding (state.hot
//      not bound yet → getPayload() returns null) must not wipe the loaded-from-disk
//      payload. The user's "no data appears in AG grid" symptom for Distribution
//      Charts and XY Plots #2 was exactly this — recovery-interval mid-init writing
//      null over a 7357-row payload.
//   2. Explicit clears (graph-selection-reset, payload-clear) must still go through.

describe('session.assignTabPayload null-overwrite guard', () => {
  let session;

  // jsdom marks all dispatched events as isTrusted=false and disallows redefining the
  // property. The session listener honours a documented test backdoor flag named by
  // session.__USER_TRUSTED_FLAG__ — setting that to true simulates a user-trusted
  // event in tests. Real browsers never set this property.
  function makeTrustedEvent(type, _target) {
    const ev = new Event(type, { bubbles: true });
    const flag = window.Main?.session?.__USER_TRUSTED_FLAG__ || '__graphitixUserTrusted';
    ev[flag] = true;
    return ev;
  }

  beforeEach(() => {
    jest.resetModules();
    delete window.Main;
    delete window.Shared;
    require('../js/main/session.js');
    session = window.Main.session;
    expect(session).toBeTruthy();
  });

  afterEach(() => {
    delete window.Main;
    delete window.Shared;
  });

  function createTabWithPayload() {
    const tab = session.createTab({
      title: 'Distribution Charts',
      type: 'box',
      payload: { type: 'box', data: [['Lib1', 'Lib2'], [180, 109], [337, 204]], config: {} },
      payloadSignature: 'box-7357-row-sig'
    });
    session.workspaceState.tabs.push(tab);
    return tab;
  }

  test('refuses to overwrite a populated payload with null when reason is recovery-interval', () => {
    const tab = createTabWithPayload();
    const beforeData = tab.payload.data;
    const beforeSig = tab.payloadSignature;

    const changed = session.assignTabPayload(tab, null, { reason: 'recovery-interval' });

    expect(changed).toBe(false);
    expect(tab.payload?.data).toBe(beforeData);
    expect(tab.payloadSignature).toBe(beforeSig);
  });

  test('refuses to overwrite a populated payload with null when reason is archive-save', () => {
    const tab = createTabWithPayload();
    const before = tab.payload;
    session.assignTabPayload(tab, null, { reason: 'archive-save' });
    expect(tab.payload).toBe(before);
  });

  test('allows null overwrite when reason is graph-selection-reset (user picks a new graph type)', () => {
    const tab = createTabWithPayload();
    const changed = session.assignTabPayload(tab, null, { reason: 'graph-selection-reset' });
    expect(changed).toBe(true);
    expect(tab.payload).toBeNull();
  });

  test('allows null overwrite when meta.allowClear is true', () => {
    const tab = createTabWithPayload();
    session.assignTabPayload(tab, null, { reason: 'something-else', allowClear: true });
    expect(tab.payload).toBeNull();
  });

  test('allows null overwrite when there was no prior payload', () => {
    const tab = session.createTab({ title: 'Empty', type: 'box', payload: null });
    session.workspaceState.tabs.push(tab);
    const changed = session.assignTabPayload(tab, null, { reason: 'recovery-interval' });
    // No change because previous was null and new is null — but the call itself is
    // not refused. The guard only fires when there's something to protect.
    expect(changed).toBe(false);
    expect(tab.payload).toBeNull();
  });

  test('a real payload always replaces the prior payload', () => {
    const tab = createTabWithPayload();
    const next = { type: 'box', data: [['A'], [42]], config: { foo: 'bar' } };
    const changed = session.assignTabPayload(tab, next, { reason: 'recovery-interval' });
    expect(changed).toBe(true);
    expect(tab.payload.data).toEqual([['A'], [42]]);
  });

  test('every component clears a stale preview when its assigned payload is not renderable', () => {
    const componentTypes = ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'];
    window.Main.components = { registry: {} };
    window.Main.previews = { clearTabPreview: jest.fn(tab => {
      tab.previewMarkup = null;
      tab.previewSignature = null;
      tab.previewMeta = null;
      return true;
    }) };
    componentTypes.forEach(type => {
      window.Main.components.registry[type] = { hasRenderablePayload: jest.fn(() => false) };
      const tab = session.createTab({
        title: type,
        type,
        payload: { type, data: [['old'], [1]] },
        previewMarkup: '<svg></svg>',
        previewSignature: 'old',
        previewMeta: { format: 'svg' }
      });
      session.workspaceState.tabs.push(tab);
      session.assignTabPayload(tab, { type, data: [[''], ['']] }, { reason: 'user-cleared-data' });
      expect(tab.previewMarkup).toBeNull();
      expect(tab.previewSignature).toBeNull();
      expect(tab.previewMeta).toBeNull();
      expect(tab.previewSuppressedSignature).toBe(tab.payloadSignature);
    });
    expect(window.Main.previews.clearTabPreview).toHaveBeenCalledTimes(componentTypes.length);
  });

  test('archive save keeps a clean loaded tab authoritative without reading live component state', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    session.workspaceState.activeTabId = tab.id;
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({ type: 'box', data: [['corrupt-live']], config: {} }))
        }
      }
    };

    const changed = session.persistActiveTabState(tab, { reason: 'archive-save' });

    expect(changed).toBe(false);
    expect(window.Main.components.registry.box.getPayload).not.toHaveBeenCalled();
    expect(tab.payload.data).toEqual([['Lib1', 'Lib2'], [180, 109], [337, 204]]);
  });

  test('render-cache capture always restores live DOM when cache normalization fails', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    session.workspaceState.activeTabId = tab.id;
    const captured = {};
    Object.defineProperty(captured, '__graphitixRenderCache', {
      configurable: true,
      get() {
        throw new Error('synthetic cache normalization failure');
      }
    });
    const restoreRenderCache = jest.fn(() => true);
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          captureRenderCache: jest.fn(() => captured),
          restoreRenderCache
        }
      }
    };

    expect(() => session.persistActiveTabState(tab, {
      reason: 'archive-save-cache-safety',
      origin: 'lifecycle',
      captureRenderCache: true,
      snapshotIntent: {
        captureLivePayload: false,
        skipLivePayloadCapture: true,
        allowSkipLivePayloadCapture: true,
        lifecycleSnapshot: true,
        reasonSkippable: true
      }
    })).not.toThrow();

    expect(window.Main.components.registry.box.captureRenderCache).toHaveBeenCalledTimes(1);
    expect(restoreRenderCache).toHaveBeenCalledWith(
      expect.objectContaining({
        __graphitixRenderCache: expect.objectContaining({
          version: 2,
          component: 'box',
          type: 'box',
          tabId: tab.id,
          complete: true,
          rollbackOnly: true
        })
      }),
      expect.objectContaining({
        tabId: tab.id,
        restoreLiveAfterCapture: true,
        rollbackOnly: true,
        skipStateMutation: true
      })
    );
    expect(captured).toEqual({});
    expect(tab.renderCache).toBeNull();
  });


  test.each([
    ['wrong owner', { version: 2, component: 'box', type: 'box', tabId: 'workspace-other', complete: true }],
    ['wrong component', { version: 2, component: 'scatter', type: 'scatter', tabId: null, complete: true }],
    ['conflicting component aliases', { version: 2, component: 'box', type: 'scatter', tabId: null, complete: true }],
    ['missing owner', { version: 2, component: 'box', type: 'box', tabId: null, complete: true, omitOwner: true }],
    ['missing component', { version: 2, tabId: null, complete: true }],
    ['incomplete cache', { version: 2, component: 'box', type: 'box', tabId: null, complete: false }],
    ['missing metadata', null]
  ])('rejects %s before render-cache normalization and rolls detached DOM back only', (_label, metadataTemplate) => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = { version: 1, component: 'box', width: 468, height: 456 };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    session.workspaceState.activeTabId = tab.id;

    const existingArchive = {
      plot: { count: 1, owner: tab.id },
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        tabId: tab.id,
        complete: true
      }
    };
    tab.archiveRenderCache = existingArchive;
    tab.archiveRenderCacheSignature = tab.payloadSignature;
    tab.archiveRenderCacheLayoutSignature = tab.layoutSignature;

    const rawCache = { plot: { count: 1, owner: 'captured-dom' } };
    if (metadataTemplate) {
      const { omitOwner, ...metadata } = metadataTemplate;
      rawCache.__graphitixRenderCache = {
        ...metadata,
        ...(omitOwner ? {} : { tabId: metadataTemplate.tabId || tab.id })
      };
    }
    const rawSnapshot = JSON.parse(JSON.stringify(rawCache));
    const restoreRenderCache = jest.fn(() => true);
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          captureRenderCache: jest.fn(() => rawCache),
          restoreRenderCache
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'capture-provenance-regression',
      origin: 'lifecycle',
      captureRenderCache: true,
      snapshotIntent: {
        captureLivePayload: false,
        skipLivePayloadCapture: true,
        allowSkipLivePayloadCapture: true,
        lifecycleSnapshot: true,
        reasonSkippable: true
      }
    });

    expect(rawCache).toEqual(rawSnapshot);
    expect(tab.renderCache).toBeNull();
    expect(tab.archiveRenderCache).toBe(existingArchive);
    expect(tab.archiveRenderCacheSignature).toBe(tab.payloadSignature);
    expect(tab.archiveRenderCacheLayoutSignature).toBe(tab.layoutSignature);
    expect(restoreRenderCache).toHaveBeenCalledTimes(1);
    expect(restoreRenderCache.mock.calls[0][0]).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({
        version: 2,
        component: 'box',
        type: 'box',
        tabId: tab.id,
        complete: true,
        rollbackOnly: true
      })
    }));
    expect(restoreRenderCache.mock.calls[0][1]).toEqual(expect.objectContaining({
      tabId: tab.id,
      rollbackOnly: true,
      restoreLiveAfterCapture: true,
      skipStateMutation: true
    }));
  });

  test('stores a valid component-owned cache without rewriting its provenance', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = { version: 1, component: 'box', width: 468, height: 456 };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    session.workspaceState.activeTabId = tab.id;
    const rawCache = {
      plot: { count: 1, owner: tab.id },
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        tabId: tab.id,
        complete: true,
        componentOwnedMarker: 'preserve-me'
      }
    };
    const rawSnapshot = JSON.parse(JSON.stringify(rawCache));
    const restoreRenderCache = jest.fn(() => true);
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          captureRenderCache: jest.fn(() => rawCache),
          restoreRenderCache
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'valid-capture-provenance-regression',
      origin: 'lifecycle',
      captureRenderCache: true,
      snapshotIntent: {
        captureLivePayload: false,
        skipLivePayloadCapture: true,
        allowSkipLivePayloadCapture: true,
        lifecycleSnapshot: true,
        reasonSkippable: true
      }
    });

    expect(rawCache).toEqual(rawSnapshot);
    expect(tab.renderCache?.cache?.__graphitixRenderCache).toEqual(expect.objectContaining({
      version: 2,
      component: 'box',
      type: 'box',
      tabId: tab.id,
      complete: true,
      componentOwnedMarker: 'preserve-me'
    }));
    expect(tab.archiveRenderCache?.__graphitixRenderCache).toEqual(expect.objectContaining({
      version: 2,
      component: 'box',
      type: 'box',
      tabId: tab.id,
      complete: true,
      componentOwnedMarker: 'preserve-me'
    }));
    expect(restoreRenderCache.mock.calls[0][0].__graphitixRenderCache.rollbackOnly).not.toBe(true);
  });


  test('never captures the previously committed graph while a replacement frame is staged', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = false;
    tab.userModified = true;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = { version: 1, component: 'box', width: 468, height: 456 };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    tab.payloadVersion = 3;
    tab.layoutVersion = 2;
    tab.renderCommitVersion = 1;
    session.workspaceState.activeTabId = tab.id;

    window.Shared.framePublication = {
      hasStaged: jest.fn(() => true)
    };
    const captureRenderCache = jest.fn(() => ({
      plot: { count: 1, owner: tab.id },
      __graphitixRenderCache: {
        version: 2, component: 'box', type: 'box', tabId: tab.id, complete: true
      }
    }));
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          isIdleForSnapshot: jest.fn(() => true),
          hasRenderedGraph: jest.fn(() => true),
          captureRenderCache
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'replacement-frame-staged',
      origin: 'lifecycle',
      captureRenderCache: true
    });

    expect(window.Shared.framePublication.hasStaged).toHaveBeenCalled();
    expect(captureRenderCache).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
    expect(tab.renderCommitVersion).toBe(1);
  });


  test('manual-render pending state saves canonical payload without certifying a stale graph cache', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = false;
    tab.userModified = true;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = { version: 1, component: 'box', width: 468, height: 456 };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    tab.payloadVersion = 4;
    tab.layoutVersion = 2;
    tab.renderCommitVersion = 2;
    tab.renderCache = {
      cache: { plot: { count: 1 } },
      tabId: tab.id,
      type: 'box',
      payloadSignature: 'older-payload',
      layoutSignature: tab.layoutSignature
    };
    tab.archiveRenderCache = { plot: { count: 1 } };
    session.workspaceState.activeTabId = tab.id;

    const captureRenderCache = jest.fn(() => ({
      plot: { count: 1, owner: tab.id },
      __graphitixRenderCache: {
        version: 2, component: 'box', type: 'box', tabId: tab.id, complete: true
      }
    }));
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          isIdleForSnapshot: jest.fn(() => true),
          isRenderCacheCurrent: jest.fn(() => false),
          hasRenderedGraph: jest.fn(() => true),
          captureRenderCache
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'manual-render-pending',
      origin: 'lifecycle',
      captureRenderCache: true
    });

    expect(captureRenderCache).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
    expect(tab.archiveRenderCache).toBeNull();
    expect(tab.renderCommitVersion).toBe(2);
    expect(tab.payload).toBeTruthy();
  });

  test('captureRenderCacheIfNeeded reuses an exact archive-ready checkpoint', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = { version: 1, component: 'box', width: 468, height: 456 };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    tab.archiveRenderCache = {
      __graphitixRenderCache: { tabId: tab.id, component: tab.type, complete: true },
      plot: { owner: tab.id }
    };
    tab.archiveRenderCacheSignature = tab.payloadSignature;
    tab.archiveRenderCacheLayoutSignature = tab.layoutSignature;
    session.workspaceState.activeTabId = tab.id;
    const captureRenderCache = jest.fn();
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          captureRenderCache
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'recovery-interval',
      origin: 'lifecycle',
      captureRenderCache: true,
      captureRenderCacheIfNeeded: true,
      snapshotIntent: {
        captureLivePayload: false,
        skipLivePayloadCapture: true,
        allowSkipLivePayloadCapture: true,
        lifecycleSnapshot: true,
        reasonSkippable: true
      }
    });

    expect(captureRenderCache).not.toHaveBeenCalled();
    expect(tab.archiveRenderCache).toEqual(expect.objectContaining({
      plot: { owner: tab.id }
    }));
  });

  test('clean restored exact checkpoint preserves canonical layout during lifecycle deactivation', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    tab.payloadSignature = session.serializePayloadSignature(tab.payload);
    tab.layoutState = {
      version: 1,
      component: 'box',
      svgBox: {
        style: { width: '468px', height: '456px', maxHeight: 'none' },
        dataset: { workspaceTabId: tab.id, tabId: tab.id }
      }
    };
    tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
    tab.archiveRenderCache = {
      __graphitixRenderCache: { tabId: tab.id, component: tab.type, complete: true },
      plot: { owner: tab.id }
    };
    tab.archiveRenderCacheSignature = tab.payloadSignature;
    tab.archiveRenderCacheLayoutSignature = tab.layoutSignature;
    session.workspaceState.activeTabId = tab.id;
    const captureStateFor = jest.fn(() => ({
      version: 1,
      component: 'box',
      svgBox: { style: { width: '427px', height: '427px' }, dataset: {} }
    }));
    window.Shared.componentLayout = {
      captureStateFor,
      withTabLayoutOverrides: value => value
    };
    const captureRenderCache = jest.fn();
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => tab.payload),
          captureRenderCache
        }
      }
    };

    const beforeLayout = session.serializePayloadSignature(tab.layoutState);
    session.persistActiveTabState(tab, {
      reason: 'activate-switch',
      origin: 'lifecycle',
      captureRenderCache: true,
      captureRenderCacheIfNeeded: true,
      snapshotKind: 'lifecycle-checkpoint'
    });

    expect(captureStateFor).not.toHaveBeenCalled();
    expect(captureRenderCache).not.toHaveBeenCalled();
    expect(session.serializePayloadSignature(tab.layoutState)).toBe(beforeLayout);
    expect(tab.layoutSignature).toBe(beforeLayout);
    expect(tab.archiveRenderCacheLayoutSignature).toBe(beforeLayout);
  });

  test('authoritative live layout is not reverse-normalized from payload graph sizing', () => {
    const tab = createTabWithPayload();
    tab.userModified = true;
    tab.payloadDirty = true;
    session.workspaceState.activeTabId = tab.id;
    session.workspaceState.loadedWorkspaces[tab.id] = { tabId: tab.id, type: tab.type };
    const exactLayout = {
      version: 1,
      component: 'box',
      svgBox: {
        style: { width: '468px', height: '456px', maxWidth: 'none', maxHeight: 'none' },
        dataset: { workspaceTabId: tab.id, tabId: tab.id, resizerUnlimitedHeight: 'true' }
      }
    };
    window.Shared.componentLayout = {
      captureStateFor: jest.fn(() => exactLayout),
      withTabLayoutOverrides: value => value
    };
    const mergePayloadSizingIntoLayout = jest.fn(() => ({ corrupted: true }));
    window.Shared.graphSizing = {
      enrichPayloadWithLayout: jest.fn((_type, payload) => payload),
      mergePayloadSizingIntoLayout
    };
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({ type: 'box', data: [['live']], config: {} }))
        }
      }
    };

    session.persistActiveTabState(tab, {
      reason: 'archive-save',
      origin: 'user',
      snapshotIntent: { captureLivePayload: true }
    });

    expect(mergePayloadSizingIntoLayout).not.toHaveBeenCalled();
    expect(tab.layoutState).toEqual(exactLayout);
    expect(tab.layoutSignature).toBe(session.serializePayloadSignature(exactLayout));
  });

  test('dirty loaded tab flushes live payload once, then clears payloadDirty', () => {
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = true;
    tab.payloadDirty = true;
    session.workspaceState.activeTabId = tab.id;
    session.workspaceState.loadedWorkspaces[tab.id] = {
      tabId: tab.id,
      type: tab.type,
      payloadSignature: tab.payloadSignature,
      layoutSignature: tab.layoutSignature
    };
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({ type: 'box', data: [['A'], [42]], config: {} }))
        }
      }
    };

    const changed = session.persistActiveTabState(tab, { reason: 'archive-save' });

    expect(changed).toBe(true);
    expect(window.Main.components.registry.box.getPayload).toHaveBeenCalledTimes(1);
    expect(tab.payload.data).toEqual([['A'], [42]]);
    expect(tab.payloadDirty).toBe(false);
    expect(tab.userModified).toBe(true);
    const [metaArg] = window.Main.components.registry.box.getPayload.mock.calls[0] || [];
    expect(metaArg).toEqual(expect.objectContaining({
      tabId: tab.id,
      type: tab.type,
      reason: 'archive-save:authoritative-capture'
    }));
  });

  test('lifecycle dirty reasons do not create user-dirty session state', () => {
    const tab = createTabWithPayload();
    tab.userModified = false;
    tab.payloadDirty = false;

    session.markSessionDirty('activate-switch', { tabId: tab.id, origin: 'lifecycle' });

    expect(session.workspaceState.sessionDirty).toBe(true);
    expect(session.workspaceState.sessionUserDirty).toBe(false);
    expect(tab.userModified).toBe(false);
    expect(tab.payloadDirty).toBe(false);
  });

  test('lifecycle-like reason without explicit origin is treated as user dirty', () => {
    const tab = createTabWithPayload();
    tab.userModified = false;
    tab.payloadDirty = false;

    session.markSessionDirty('archive-save', { tabId: tab.id });

    expect(session.workspaceState.sessionDirty).toBe(true);
    expect(session.workspaceState.sessionUserDirty).toBe(true);
  });

  test('persistActiveTabState lifecycle origin can flush state without user-dirty', () => {
    const tab = createTabWithPayload();
    tab.userModified = false;
    tab.payloadDirty = true;
    session.workspaceState.activeTabId = tab.id;
    session.workspaceState.loadedWorkspaces[tab.id] = {
      tabId: tab.id,
      type: tab.type,
      payloadSignature: tab.payloadSignature,
      layoutSignature: tab.layoutSignature
    };
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({ type: 'box', data: [['lifecycle-flush']], config: {} }))
        }
      }
    };

    const changed = session.persistActiveTabState(tab, { reason: 'archive-save', origin: 'lifecycle' });

    expect(changed).toBe(true);
    expect(tab.payload.data).toEqual([['lifecycle-flush']]);
    expect(tab.userModified).toBe(false);
    expect(tab.payloadDirty).toBe(false);
    expect(session.workspaceState.sessionDirty).toBe(true);
    expect(session.workspaceState.sessionUserDirty).toBe(false);
  });

  test('user modifications set user-dirty session and payload flags', () => {
    const tab = createTabWithPayload();

    const marked = session.markTabUserModified(tab, 'table-cell-edit', { origin: 'user' });

    expect(marked).toBe(true);
    expect(tab.userModified).toBe(true);
    expect(tab.payloadDirty).toBe(true);
    expect(tab.payloadDirtyReason).toBe('table-cell-edit');
    expect(session.workspaceState.sessionDirty).toBe(true);
    expect(session.workspaceState.sessionUserDirty).toBe(true);
  });

  test('clearSessionDirty clears both session and per-tab user dirty state', () => {
    const tab = createTabWithPayload();
    session.markTabUserModified(tab, 'table-cell-edit', { origin: 'user' });

    session.clearSessionDirty('graph-save-success');

    expect(session.workspaceState.sessionDirty).toBe(false);
    expect(session.workspaceState.sessionUserDirty).toBe(false);
    expect(tab.userModified).toBe(false);
    expect(tab.payloadDirty).toBe(false);
  });

  test('clean tab on lifecycle activate-switch never reads live payload state', () => {
    // Reproduces the gap where switching tabs (origin: 'lifecycle') triggered a full
    // getPayload() read on the previous tab, even when that tab was clean and
    // loaded-from-disk. A racing component (state.hot still binding) could project
    // a different payload than what was on disk, invalidating the just-restored
    // render cache. Lifecycle-origin persist must be a no-op for clean tabs.
    const tab = createTabWithPayload();
    tab.loadedFromArchive = true;
    tab.userModified = false;
    tab.payloadDirty = false;
    session.workspaceState.activeTabId = tab.id;
    session.workspaceState.loadedWorkspaces[tab.id] = {
      tabId: tab.id,
      type: tab.type,
      payloadSignature: tab.payloadSignature,
      layoutSignature: tab.layoutSignature
    };
    const getPayload = jest.fn(() => ({ type: 'box', data: [['live-leak']], config: {} }));
    window.Main.components = {
      registry: { box: { getPayload } }
    };

    const changed = session.persistActiveTabState(tab, {
      reason: 'activate-switch',
      origin: 'lifecycle'
    });

    expect(changed).toBe(false);
    expect(getPayload).not.toHaveBeenCalled();
    expect(tab.payload.data).toEqual([['Lib1', 'Lib2'], [180, 109], [337, 204]]);
  });

  test('clean canonical payload is preserved when adding a tab', () => {
    const tab = createTabWithPayload();
    tab.userModified = false;
    tab.payloadDirty = false;
    session.workspaceState.activeTabId = tab.id;
    const getPayload = jest.fn(() => ({ type: 'box', data: [['stale-dom']], config: {} }));
    window.Main.components = {
      registry: { box: { getPayload } }
    };

    const changed = session.persistActiveTabState(tab, {
      reason: 'add-tab-before-new',
      origin: 'lifecycle',
      snapshotKind: 'lifecycle-checkpoint'
    });

    expect(changed).toBe(false);
    expect(getPayload).not.toHaveBeenCalled();
    expect(tab.payload.data).toEqual([['Lib1', 'Lib2'], [180, 109], [337, 204]]);
  });

  test('global user-input listener promotes trusted change events on workspace controls into markActiveTabUserModified', () => {
    // Architectural guarantee: a single document-level listener catches every
    // user-trusted input/change inside a workspace component DOM root and marks
    // the active tab dirty. This obviates per-component-per-control wiring.
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    // Build a workspace container with an input inside.
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    const input = document.createElement('input');
    input.id = 'someBoxControl';
    root.appendChild(input);
    document.body.appendChild(root);
    try {
      // Construct a trusted change event. JSDOM marks dispatched events as
      // isTrusted=false, so we override with a getter that returns true to
      // simulate a real user input.
      input.dispatchEvent(makeTrustedEvent('change', input));
      expect(tab.userModified).toBe(true);
      expect(tab.payloadDirty).toBe(true);
    } finally {
      document.body.removeChild(root);
    }
  });

  test('global user-input listener does not treat focusout as a content edit', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    const input = document.createElement('input');
    root.appendChild(input);
    document.body.appendChild(root);
    try {
      input.dispatchEvent(makeTrustedEvent('focusout', input));
      expect(tab.userModified).toBe(false);
      expect(tab.payloadDirty).toBe(false);
    } finally {
      document.body.removeChild(root);
    }
  });

  test('canonical capture runs after change, input, and click handlers', async () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const select = document.createElement('select');
    ['strip', 'box', 'violin'].forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      select.appendChild(option);
    });
    const input = document.createElement('input');
    const button = document.createElement('button');
    button.type = 'button';
    root.append(select, input, button);
    document.body.appendChild(root);
    let canonicalValue = 'strip';
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({
            type: 'box',
            data: [['A'], [1]],
            config: { graphType: canonicalValue }
          }))
        }
      }
    };
    window.Main.documentState = {
      persistCanonicalJournalNow: jest.fn(() => true)
    };
    select.value = 'strip';
    input.value = '2d';
    select.addEventListener('change', () => { canonicalValue = 'box'; });
    input.addEventListener('input', () => { canonicalValue = '3d'; });
    button.addEventListener('click', () => { canonicalValue = 'violin'; });
    try {
      select.dispatchEvent(makeTrustedEvent('change', select));
      await session.flushCanonicalUserMutationState();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(window.Main.documentState.persistCanonicalJournalNow).toHaveBeenCalledWith(
        expect.objectContaining({ tabId: tab.id, reason: 'control-change' })
      );
      expect(tab.payload.config.graphType).toBe('box');

      input.dispatchEvent(makeTrustedEvent('input', input));
      await session.flushCanonicalUserMutationState();
      expect(tab.payload.config.graphType).toBe('3d');

      button.dispatchEvent(makeTrustedEvent('click', button));
      await session.flushCanonicalUserMutationState();
      expect(tab.payload.config.graphType).toBe('violin');
    } finally {
      document.body.removeChild(root);
    }
  });

  test('select input cannot project the old value before its following change event', async () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const select = document.createElement('select');
    ['strip', 'box'].forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      select.appendChild(option);
    });
    root.appendChild(select);
    document.body.appendChild(root);
    let canonicalValue = 'strip';
    const getPayload = jest.fn(() => {
      // A real component projects its canonical session value while taking
      // a capture. This exposes a stale capture that runs between input and
      // change: it puts the select back on the old option.
      select.value = canonicalValue;
      return {
        type: 'box',
        data: [['A'], [1]],
        config: { graphType: canonicalValue }
      };
    });
    window.Main.components = {
      registry: {
        box: { getPayload }
      }
    };
    select.value = 'strip';
    select.addEventListener('change', () => {
      canonicalValue = select.value;
    });
    try {
      select.value = 'box';
      select.dispatchEvent(makeTrustedEvent('input', select));
      await Promise.resolve();
      expect(getPayload).not.toHaveBeenCalled();
      select.dispatchEvent(makeTrustedEvent('change', select));
      expect(select.value).toBe('box');
      expect(canonicalValue).toBe('box');
      await session.flushCanonicalUserMutationState();
      expect(getPayload).toHaveBeenCalled();
      expect(select.value).toBe('box');
      expect(tab.payload.config.graphType).toBe('box');
    } finally {
      document.body.removeChild(root);
    }
  });

  test('checkbox input cannot restore the old value before its following change event', async () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    root.appendChild(checkbox);
    document.body.appendChild(root);
    let canonicalChecked = true;
    const getPayload = jest.fn(() => {
      // Components project canonical state while capturing. If this runs after
      // input but before change, it changes a real unchecked checkbox back to
      // checked and the component never receives the requested value.
      checkbox.checked = canonicalChecked;
      return {
        type: 'box',
        data: [['A'], [1]],
        config: { showLegend: canonicalChecked }
      };
    });
    window.Main.components = { registry: { box: { getPayload } } };
    checkbox.addEventListener('change', () => {
      canonicalChecked = checkbox.checked;
    });
    try {
      checkbox.checked = false;
      checkbox.dispatchEvent(makeTrustedEvent('input', checkbox));
      await Promise.resolve();
      expect(getPayload).not.toHaveBeenCalled();
      expect(checkbox.checked).toBe(false);

      checkbox.dispatchEvent(makeTrustedEvent('change', checkbox));
      expect(canonicalChecked).toBe(false);
      await session.flushCanonicalUserMutationState();
      expect(getPayload).toHaveBeenCalled();
      expect(checkbox.checked).toBe(false);
      expect(tab.payload.config.showLegend).toBe(false);
    } finally {
      document.body.removeChild(root);
    }
  });

  test('canonical capture still runs when a control stops event propagation', async () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const select = document.createElement('select');
    ['strip', 'box'].forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      select.appendChild(option);
    });
    root.appendChild(select);
    document.body.appendChild(root);
    let canonicalValue = 'strip';
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({
            type: 'box',
            data: [['A'], [1]],
            config: { graphType: canonicalValue }
          }))
        }
      }
    };
    select.addEventListener('change', event => {
      canonicalValue = 'box';
      event.stopPropagation();
    });
    try {
      select.dispatchEvent(makeTrustedEvent('change', select));
      await session.flushCanonicalUserMutationState();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(tab.payload.config.graphType).toBe('box');
    } finally {
      document.body.removeChild(root);
    }
  });

  test('global user-input listener ignores untrusted (programmatic) events', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    const input = document.createElement('input');
    root.appendChild(input);
    document.body.appendChild(root);
    try {
      // Default-dispatched event has isTrusted=false in jsdom — exactly the case
      // we must NOT mark dirty (lifecycle/setup code synthetically dispatches these).
      input.dispatchEvent(new Event('change', { bubbles: true }));
      expect(tab.userModified).toBe(false);
      expect(tab.payloadDirty).toBe(false);
    } finally {
      document.body.removeChild(root);
    }
  });

  test('global user-input listener releases restore-time draw/layout suppressions for the owning component tab', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    window.Shared.componentLifecycle = window.Shared.componentLifecycle || {};
    window.Shared.componentLayout = window.Shared.componentLayout || {};
    window.Shared.componentLifecycle.clearPostRestoreDrawSuppression = jest.fn();
    window.Shared.componentLayout.releaseSuppressedSchedulesFor = jest.fn();
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'box');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'boxActionButton';
    root.appendChild(button);
    document.body.appendChild(root);
    try {
      button.dispatchEvent(makeTrustedEvent('click', button));
      expect(tab.userModified).toBe(true);
      expect(tab.payloadDirty).toBe(true);
      expect(window.Shared.componentLifecycle.clearPostRestoreDrawSuppression)
        .toHaveBeenCalledWith('box', expect.objectContaining({ tabId: tab.id }));
      expect(window.Shared.componentLayout.releaseSuppressedSchedulesFor)
        .toHaveBeenCalledWith('box', expect.objectContaining({ tabId: tab.id }));
    } finally {
      document.body.removeChild(root);
    }
  });

  test('global user-input listener ignores events outside workspace component roots', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    // Put the input OUTSIDE any [data-workspace-component] container.
    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      input.dispatchEvent(makeTrustedEvent('change', input));
      expect(tab.userModified).toBe(false);
      expect(tab.payloadDirty).toBe(false);
    } finally {
      document.body.removeChild(input);
    }
  });

  test('global user-input listener ignores autosave document control events inside workspace roots', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'line');
    const autosave = document.createElement('input');
    autosave.type = 'checkbox';
    autosave.setAttribute('data-document-autosave', '1');
    root.appendChild(autosave);
    document.body.appendChild(root);
    try {
      autosave.dispatchEvent(makeTrustedEvent('change', autosave));
      expect(tab.userModified).toBe(false);
      expect(tab.payloadDirty).toBe(false);
      expect(session.workspaceState.sessionUserDirty).toBe(false);
    } finally {
      document.body.removeChild(root);
    }
  });

  test('undo state-change records mark the active payload dirty for recovery', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    session.workspaceState.sessionUserDirty = false;
    require('../js/shared/undo.js');

    const recorded = window.Shared.undoManager.recordStateChange({
      label: 'box:shape-style:0',
      scope: 'boxGraphPanel',
      from: '#000000',
      to: '#ff0000',
      apply: () => true
    });

    expect(recorded).toBe(true);
    expect(tab.userModified).toBe(true);
    expect(tab.payloadDirty).toBe(true);
    expect(tab.payloadDirtyReason).toBe('box:shape-style:0');
    expect(session.workspaceState.sessionUserDirty).toBe(true);
  });

  test('shared color picker overlay marks the source workspace target dirty even with synthetic events', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    tab.userModified = false;
    tab.payloadDirty = false;
    session.workspaceState.sessionUserDirty = false;
    require('../js/shared/colorPicker.js');
    const root = document.createElement('div');
    root.setAttribute('data-workspace-component', 'heatmap');
    root.setAttribute('data-workspace-tab-id', tab.id);
    const input = document.createElement('input');
    input.type = 'color';
    input.value = '#000000';
    root.appendChild(input);
    document.body.appendChild(root);
    try {
      const overlay = window.Shared.openColorPicker({
        anchor: input,
        element: input
      });
      expect(overlay).toBeTruthy();
      overlay.targetEl.onOverlayInput('#ff0000', {});
      expect(tab.userModified).toBe(true);
      expect(tab.payloadDirty).toBe(true);
      expect(tab.payloadDirtyReason).toBe('color-picker-input');
      expect(session.workspaceState.sessionUserDirty).toBe(true);
    } finally {
      document.body.removeChild(root);
    }
  });

  // ─── serializePayloadSignature auto-compact regression ─────────────────────
  // structuredClone (used by clonePayload) strips named properties from arrays
  // (e.g. arr.__graphitixMatrixSignature). The fix auto-detects large array-of-arrays
  // inside compactMatrixSignatures without requiring a pre-tagged property.

  test('serializePayloadSignature compacts large untagged data matrices to a short signature', () => {
    const sig = session.serializePayloadSignature;
    expect(typeof sig).toBe('function');
    // Build a 600-row × 5-col matrix (no __graphitixMatrixSignature property).
    const matrix = Array.from({ length: 600 }, (_, r) => [r, r * 2, r * 3, r + 0.5, `label${r}`]);
    const payload = { type: 'scatter', data: matrix, config: {} };
    const serialized = sig(payload);
    // Must not be a raw JSON dump of 600 rows — keep it well under 1 KB.
    expect(typeof serialized).toBe('string');
    expect(serialized.length).toBeLessThan(500);
    // Must contain the compact matrix placeholder, not raw array values.
    const parsed = JSON.parse(serialized);
    expect(parsed.data.__graphitixMatrixSignature).toMatch(/^\d+x\d+:[0-9a-f]+$/);
    expect(parsed.data.rows).toBe(600);
  });

  test('serializePayloadSignature compact signatures differ for distinct datasets', () => {
    const sig = session.serializePayloadSignature;
    const makeMatrix = (offset) =>
      Array.from({ length: 600 }, (_, r) => [r + offset, (r + offset) * 2]);
    const p1 = JSON.parse(sig({ data: makeMatrix(0) }));
    const p2 = JSON.parse(sig({ data: makeMatrix(1000) }));
    expect(p1.data.__graphitixMatrixSignature).not.toBe(p2.data.__graphitixMatrixSignature);
  });

  test('serializePayloadSignature passes small arrays through without compaction', () => {
    const sig = session.serializePayloadSignature;
    const matrix = [['A', 'B'], [1, 2], [3, 4]]; // only 3 rows, well under threshold
    const serialized = sig({ data: matrix });
    const parsed = JSON.parse(serialized);
    // Small matrix should be serialized as-is, not compacted.
    expect(Array.isArray(parsed.data)).toBe(true);
    expect(parsed.data).toEqual(matrix);
  });

  test('assignTabPayload invalidates render cache when payload provenance changes', () => {
    const tab = createTabWithPayload();
    tab.renderCache = {
      cache: { plot: { count: 5, fragment: null } },
      payloadSignature: 'sig-A',
      captureSequence: 42
    };
    tab.renderCacheSignature = 'sig-A';
    tab.archiveRenderCache = {
      __graphitixRenderCache: { tabId: tab.id, component: tab.type },
      plot: { count: 5 }
    };
    tab.archiveRenderCacheSignature = 'sig-A';
    tab.archiveRenderCacheLayoutSignature = 'layout-A';
    tab.payloadSignature = 'sig-A';

    const changed = session.assignTabPayload(
      tab,
      { type: 'box', data: [['updated']], config: {} },
      { reason: 'stats-computed' }
    );

    expect(changed).toBe(true);
    expect(tab.renderCache).toBeNull();
    expect(tab.renderCacheSignature).toBeNull();
    expect(tab.renderCacheLayoutSignature).toBeNull();
    expect(tab.renderCacheTabId).toBeNull();
    expect(tab.archiveRenderCache).toBeNull();
    expect(tab.archiveRenderCacheSignature).toBeNull();
    expect(tab.archiveRenderCacheLayoutSignature).toBeNull();
  });

  test('render-equivalent payload updates keep Cartesian cache provenance aligned', () => {
    const tab = createTabWithPayload();
    tab.layoutSignature = 'layout-A';
    const cartesian = {
      complete: true,
      owner: { tabId: tab.id, component: tab.type, generation: 4 },
      payloadSignature: 'sig-A',
      layoutSignature: 'layout-A'
    };
    tab.renderCache = {
      cache: {
        __graphitixRenderCache: { tabId: tab.id, component: tab.type, cartesianLayout: cartesian }
      },
      payloadSignature: 'sig-A',
      layoutSignature: 'layout-A'
    };
    tab.archiveRenderCache = {
      __graphitixRenderCache: { tabId: tab.id, component: tab.type, cartesianLayout: cartesian },
      payloadSignature: 'sig-A',
      layoutSignature: 'layout-A'
    };
    tab.payloadSignature = 'sig-A';
    tab.archiveRenderCacheSignature = 'sig-A';
    tab.archiveRenderCacheLayoutSignature = 'layout-A';

    session.assignTabPayload(
      tab,
      { type: 'box', data: [['updated']], config: {} },
      { reason: 'stats-computed', renderEquivalent: true }
    );

    expect(tab.renderCache.cache.__graphitixRenderCache.cartesianLayout.payloadSignature)
      .toBe(tab.payloadSignature);
    expect(tab.archiveRenderCache.__graphitixRenderCache.cartesianLayout.payloadSignature)
      .toBe(tab.payloadSignature);
    expect(tab.renderCache.cache.__graphitixRenderCache.cartesianLayout.layoutSignature)
      .toBe('layout-A');
  });

  test('completed render caches keep an archive-ready checkpoint after warm runtime pruning', () => {
    const tabs = Array.from({ length: 4 }, (_, index) => {
      const tab = createTabWithPayload();
      tab.layoutState = {
        version: 1,
        component: 'box',
        tabIndex: index
      };
      tab.layoutSignature = session.serializePayloadSignature(tab.layoutState);
      return tab;
    });
    const captureRenderCache = jest.fn(meta => ({
      plot: { count: 1, owner: meta.tabId },
      __graphitixRenderCache: {
        version: 2,
        component: 'box',
        type: 'box',
        tabId: meta.tabId,
        complete: true
      }
    }));
    const restoreRenderCache = jest.fn(() => true);
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => null),
          captureRenderCache,
          restoreRenderCache
        }
      }
    };

    tabs.forEach(tab => {
      session.workspaceState.activeTabId = tab.id;
      session.persistActiveTabState(tab, {
        reason: 'activate-switch',
        origin: 'lifecycle',
        snapshotKind: 'lifecycle-checkpoint',
        captureRenderCache: true
      });
    });

    const oldest = tabs[0];
    expect(captureRenderCache).toHaveBeenCalledTimes(4);
    expect(restoreRenderCache).toHaveBeenCalledTimes(4);
    expect(oldest.renderCache).toBeNull();
    expect(oldest.archiveRenderCache).toEqual(expect.objectContaining({
      __graphitixRenderCache: expect.objectContaining({ tabId: oldest.id, component: 'box' }),
      plot: expect.objectContaining({ owner: oldest.id })
    }));
    expect(oldest.archiveRenderCacheSignature).toBe(oldest.payloadSignature);
    expect(oldest.archiveRenderCacheLayoutSignature).toBe(oldest.layoutSignature);

    const restored = session.peekArchiveRenderCache(oldest, { reason: 'warm-prune-regression' });
    expect(restored).toEqual(expect.objectContaining({
      tabId: oldest.id,
      payloadSignature: oldest.payloadSignature,
      layoutSignature: oldest.layoutSignature,
      archiveBacked: true
    }));
    expect(restored.cache.plot.owner).toBe(oldest.id);
  });

  test('persistUserModifiedTabState marks user dirty and flushes mounted payload state', () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    session.workspaceState.loadedWorkspaces[tab.id] = {
      tabId: tab.id,
      type: tab.type,
      payloadSignature: tab.payloadSignature,
      layoutSignature: tab.layoutSignature
    };
    window.Main.components = {
      registry: {
        box: {
          getPayload: jest.fn(() => ({ type: 'box', data: [['flushed']], config: {} }))
        }
      }
    };

    const changed = session.persistUserModifiedTabState(tab, { reason: 'stats-controls-change' });

    expect(changed).toBe(true);
    expect(window.Main.components.registry.box.getPayload).toHaveBeenCalledTimes(1);
    expect(tab.payload.data).toEqual([['flushed']]);
    expect(tab.userModified).toBe(true);
    expect(tab.payloadDirty).toBe(false);
    expect(session.workspaceState.sessionUserDirty).toBe(true);
  });
});
