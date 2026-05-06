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
