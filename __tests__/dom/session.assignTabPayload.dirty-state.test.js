'use strict';

const { createPayloadTabForSession, registerSessionAssignTabPayloadFixture } = require('../../test-support/sessionAssignTabPayloadTestSetup');

describe('session.assignTabPayload: dirty state', () => {

  let session;

  registerSessionAssignTabPayloadFixture(value => { session = value; });

  const createTabWithPayload = () => createPayloadTabForSession(session);

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

  test('layout-only user modifications do not recapture payload from the live projection', async () => {
    const tab = createTabWithPayload();
    session.workspaceState.activeTabId = tab.id;
    window.Main.components = {
      registry: {
        box: { getPayload: jest.fn(() => ({ type: 'box', data: [['live-projection']] })) }
      }
    };
    const capture = jest.spyOn(session, 'captureCanonicalUserMutationState');

    session.markTabUserModified(tab, 'graph-resize', {
      origin: 'user',
      affectsPayload: false
    });
    await new Promise(resolve => setTimeout(resolve, 5));

    expect(capture).not.toHaveBeenCalled();
    expect(tab.payload.data).toEqual([['Lib1', 'Lib2'], [180, 109], [337, 204]]);
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

});
