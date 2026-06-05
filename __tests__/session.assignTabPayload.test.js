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

  test('assignTabPayload preserves render cache and resyncs its payloadSignature when preserveRuntimeCacheOnPayloadChange is set', () => {
    // Scenario: warmup has just captured scatter render cache (payloadSignature='sig-A').
    // An async stats callback then calls assignTabPayload with a new payload ('sig-B').
    // With preserveRuntimeCacheOnPayloadChange: true, the cache must be kept and its
    // payloadSignature updated to 'sig-B' so the archive correctly matches cache to payload.
    const tab = createTabWithPayload();
    tab.renderCache = {
      cache: { plot: { count: 5, fragment: null } },
      payloadSignature: 'sig-A',
      captureSequence: 42
    };
    tab.renderCacheSignature = 'sig-A';
    tab.payloadSignature = 'sig-A';

    const newPayload = { type: 'box', data: [['updated']], config: {} };
    const changed = session.assignTabPayload(tab, newPayload, {
      reason: 'scatter-stats-computed',
      preserveRuntimeCacheOnPayloadChange: true
    });

    expect(changed).toBe(true);
    expect(tab.renderCache).not.toBeNull();
    expect(tab.renderCache.cache).toBeTruthy();
    // Signature must be resynced so archive restore can match cache to payload
    expect(tab.renderCache.payloadSignature).toBe(tab.payloadSignature);
    expect(tab.renderCacheSignature).toBe(tab.payloadSignature);
  });

  test('assignTabPayload still clears render cache when captureRenderCache is true (replacement path)', () => {
    // When a new render cache IS being captured, the old cache must be cleared first
    // so the code can replace it cleanly.
    const tab = createTabWithPayload();
    tab.renderCache = {
      cache: { plot: { count: 5, fragment: null } },
      payloadSignature: 'sig-A',
      captureSequence: 42
    };

    const newPayload = { type: 'box', data: [['updated-capture']], config: {} };
    // preserveRuntimeCacheOnPayloadChange: false means the caller WILL capture a new one
    const changed = session.assignTabPayload(tab, newPayload, {
      reason: 'archive-save',
      preserveRuntimeCacheOnPayloadChange: false
    });

    expect(changed).toBe(true);
    // Cache must be cleared so the subsequent capture replaces it
    expect(tab.renderCache).toBeNull();
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
