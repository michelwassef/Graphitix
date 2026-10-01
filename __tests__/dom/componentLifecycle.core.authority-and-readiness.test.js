'use strict';
const { loadFreshLifecycle } = require('../../test-support/componentLifecycleTestSetup');
let lc;
const loadFresh = () => { lc = loadFreshLifecycle(); };

describe('componentLifecycle — draw option sanitization', () => {
  beforeEach(loadFresh);

  test('preserves serializable cross-realm records while removing live objects', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const source = new iframe.contentWindow.Object();
    source.mode = 'lists';
    source.nested = new iframe.contentWindow.Object();
    source.nested.ok = true;
    source.target = document.createElement('div');

    expect(lc.sanitizeDrawOptions(source, { tabId: 'tab-a', reason: 'unit-cross-realm' })).toEqual({
      mode: 'lists',
      nested: { ok: true },
      tabId: 'tab-a',
      reason: 'unit-cross-realm',
      renderImpact: 'analysis'
    });

    iframe.remove();
  });
});

describe('componentLifecycle — workspace active-owner authority', () => {
  beforeEach(() => {
    loadFresh();
    delete window.Main;
  });

  test('canonical workspace state wins over a stale component activation registry', () => {
    window.Shared.workspaceTabs = {
      getActiveSessionInfo: () => ({ tabId: 'tab-old' })
    };
    window.Main = {
      session: {
        workspaceState: {
          activeTabId: 'tab-current',
          tabs: [
            { id: 'tab-old', type: 'roc' },
            { id: 'tab-current', type: 'roc' }
          ]
        }
      }
    };

    expect(lc.resolveWorkspaceActiveTabId('roc')).toBe('tab-current');
  });

  test('a stale component registry cannot make an inactive component authoritative', () => {
    window.Shared.workspaceTabs = {
      getActiveSessionInfo: () => ({ tabId: 'roc-old' })
    };
    window.Main = {
      session: {
        workspaceState: {
          activeTabId: 'line-current',
          tabs: [
            { id: 'roc-old', type: 'roc' },
            { id: 'line-current', type: 'line' }
          ]
        }
      }
    };

    expect(lc.resolveWorkspaceActiveTabId('roc')).toBe('');
  });
});

describe('componentLifecycle — live projection authority', () => {
  beforeEach(() => {
    loadFresh();
    document.body.innerHTML = '';
  });

  function installWorkspace(activeTabId, roots){
    window.Main = {
      session: {
        workspaceState: {
          activeTabId,
          tabs: [
            { id: 'tab-a', type: 'box' },
            { id: 'tab-b', type: 'box' }
          ]
        }
      }
    };
    window.Shared.workspaceTabs = {
      getActiveSessionInfo: () => ({ tabId: window.Main.session.workspaceState.activeTabId }),
      getMountedRoot: tabId => roots[String(tabId || '')] || null
    };
  }

  test('workspace activation intent never authorizes an incoming owner before its projection/root is live', () => {
    const rootA = document.createElement('section');
    const rootB = document.createElement('section');
    rootA.dataset.workspaceTabId = 'tab-a';
    rootB.dataset.workspaceTabId = 'tab-b';
    document.body.appendChild(rootA);

    const sessionA = { tabId: 'tab-a' };
    const sessionB = { tabId: 'tab-b' };
    const component = { __componentKey: 'box', __boundTabId: 'tab-a' };
    const roots = { 'tab-a': rootA, 'tab-b': rootB };
    installWorkspace('tab-a', roots);

    expect(lc.canOwnerUseLiveProjection('box', sessionA, {
      component, projectedSession: sessionA, session: sessionA
    })).toBe(true);

    window.Main.session.workspaceState.activeTabId = 'tab-b';
    expect(lc.isOwnerActivationTarget('box', sessionB, { component })).toBe(true);
    expect(lc.canOwnerUseLiveProjection('box', sessionA, {
      component, projectedSession: sessionA, session: sessionA
    })).toBe(false);
    expect(lc.canOwnerUseLiveProjection('box', sessionB, {
      component, projectedSession: sessionB, session: sessionB
    })).toBe(false);

    rootA.remove();
    document.body.appendChild(rootB);
    component.__boundTabId = 'tab-b';
    expect(lc.canOwnerUseLiveProjection('box', sessionB, {
      component, projectedSession: sessionB, session: sessionB
    })).toBe(true);
  });

  test('component binding and projected session are independent live authorities', () => {
    const rootA = document.createElement('section');
    rootA.dataset.workspaceTabId = 'tab-a';
    document.body.appendChild(rootA);

    const sessionA = { tabId: 'tab-a' };
    const projectedSessionB = { tabId: 'tab-b' };
    const component = { __componentKey: 'box', __boundTabId: 'tab-a' };
    installWorkspace('tab-a', { 'tab-a': rootA });

    expect(lc.canOwnerUseLiveProjection('box', sessionA, {
      component,
      projectedSession: projectedSessionB,
      session: sessionA
    })).toBe(false);
  });

  test('A→B→A does not revive live authority until the mounted projection returns to A', () => {
    const rootA = document.createElement('section');
    const rootB = document.createElement('section');
    rootA.dataset.workspaceTabId = 'tab-a';
    rootB.dataset.workspaceTabId = 'tab-b';
    document.body.appendChild(rootB);

    const sessionA = { tabId: 'tab-a' };
    const sessionB = { tabId: 'tab-b' };
    const component = { __componentKey: 'box', __boundTabId: 'tab-b' };
    const roots = { 'tab-a': rootA, 'tab-b': rootB };
    installWorkspace('tab-b', roots);

    expect(lc.canOwnerUseLiveProjection('box', sessionB, {
      component, projectedSession: sessionB, session: sessionB
    })).toBe(true);

    window.Main.session.workspaceState.activeTabId = 'tab-a';
    expect(lc.isOwnerActivationTarget('box', sessionA, { component })).toBe(true);
    expect(lc.canOwnerUseLiveProjection('box', sessionA, {
      component, projectedSession: sessionA, session: sessionA
    })).toBe(false);
    expect(lc.canOwnerUseLiveProjection('box', sessionB, {
      component, projectedSession: sessionB, session: sessionB
    })).toBe(false);

    rootB.remove();
    document.body.appendChild(rootA);
    component.__boundTabId = 'tab-a';
    expect(lc.canOwnerUseLiveProjection('box', sessionA, {
      component, projectedSession: sessionA, session: sessionA
    })).toBe(true);
  });

  test('live authority requires the registered mounted root and never treats a generic object id as owner identity', () => {
    const rootA = document.createElement('section');
    const impostorRoot = document.createElement('section');
    rootA.dataset.workspaceTabId = 'tab-a';
    impostorRoot.dataset.workspaceTabId = 'tab-a';
    document.body.append(rootA, impostorRoot);

    const sessionA = { tabId: 'tab-a' };
    const component = { __componentKey: 'box', __boundTabId: 'tab-a' };
    installWorkspace('tab-a', { 'tab-a': rootA });

    expect(lc.isOwnerActivationTarget('box', { id: 'tab-a' }, { component })).toBe(false);
    expect(lc.canOwnerUseLiveProjection('box', sessionA, {
      component, projectedSession: sessionA, session: sessionA, root: impostorRoot
    })).toBe(false);
    expect(lc.canOwnerUseLiveProjection('box', sessionA, {
      component, projectedSession: sessionA, session: sessionA
    })).toBe(true);
  });
});

describe('componentLifecycle — notes control ownership', () => {
  beforeEach(() => {
    loadFresh();
    document.body.innerHTML = '';
  });

  function createControl(root, value = '') {
    let currentValue = value;
    let currentOpen = false;
    return {
      root,
      setValue(next) { currentValue = String(next ?? ''); },
      setOpen(next) { currentOpen = !!next; },
      getValue() { return currentValue; },
      isOpen() { return currentOpen; }
    };
  }

  test('rejects a connected notes control owned by a sibling same-component tab', () => {
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    const rootA = document.createElement('details');
    const rootB = document.createElement('details');
    containerA.appendChild(rootA);
    containerB.appendChild(rootB);
    document.body.append(containerA, containerB);

    const oldControl = createControl(rootA, 'notes A');
    lc.markOwnedObject(oldControl, 'pca', 'tab-a');
    lc.markOwnedObject(rootA, 'pca', 'tab-a');
    const newControl = createControl(rootB, 'notes B');
    window.Shared.notes = {
      mountFoldable: jest.fn(() => newControl)
    };

    const notesState = { text: 'notes B', open: true, control: oldControl };
    const resolved = lc.ensureOwnedNotesControl({
      componentKey: 'pca',
      ownerTabId: 'tab-b',
      container: containerB,
      notesState,
      control: oldControl
    });

    expect(resolved).toBe(newControl);
    expect(window.Shared.notes.mountFoldable).toHaveBeenCalledTimes(1);
    expect(lc.resolveOwnedObjectTabId(oldControl, 'pca')).toBe('tab-a');
    expect(lc.resolveOwnedObjectTabId(newControl, 'pca')).toBe('tab-b');
    expect(notesState.control).toBe(newControl);
    expect(newControl.getValue()).toBe('notes B');
  });

  test('reuses a notes control only inside the current owner container', () => {
    const container = document.createElement('div');
    const root = document.createElement('details');
    container.appendChild(root);
    document.body.appendChild(container);
    const control = createControl(root, 'old');
    lc.markOwnedObject(control, 'scatter', 'tab-a');
    lc.markOwnedObject(root, 'scatter', 'tab-a');
    window.Shared.notes = {
      mountFoldable: jest.fn(() => { throw new Error('unexpected notes remount'); })
    };

    const notesState = { text: 'current', open: true, control };
    const resolved = lc.ensureOwnedNotesControl({
      componentKey: 'scatter',
      ownerTabId: 'tab-a',
      container,
      notesState,
      control
    });

    expect(resolved).toBe(control);
    expect(window.Shared.notes.mountFoldable).not.toHaveBeenCalled();
    expect(control.getValue()).toBe('current');
    expect(control.isOpen()).toBe(true);
  });
});

describe('componentLifecycle — explicit owner identity', () => {
  beforeEach(loadFresh);

  test('does not infer a tab from a generic object id', () => {
    expect(lc.resolveOwnedObjectTabId({ id: 'tab-a' }, 'box')).toBe('');
    expect(lc.resolveOwnedObjectTabId({ manager: { id: 'tab-a' } }, 'box')).toBe('');
  });
});

describe('componentLifecycle — snapshot publication readiness', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    document.body.innerHTML = '';
    require('../../js/shared/dom.js');
    require('../../js/shared/componentLifecycle.js');
    lc = window.Shared.componentLifecycle;
  });

  test('rejects a snapshot while an owner graph frame is staged', async () => {
    const root = document.createElement('div');
    const plot = document.createElement('div');
    const previous = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const replacement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    root.dataset.workspaceTabId = 'tab-a';
    plot.appendChild(previous);
    root.appendChild(plot);
    document.body.appendChild(root);

    const publication = window.Shared.framePublication.stage({
      container: plot,
      frame: replacement,
      component: 'roc',
      tabId: 'tab-a',
      canCommit: () => true
    });
    const target = {
      type: 'roc',
      isIdleForSnapshot: () => true
    };

    const immediate = lc.isPublicationSettled(target, {
      componentKey: 'roc',
      tabId: 'tab-a',
      root
    });
    expect(immediate).toEqual(expect.objectContaining({ ok: false, idle: true, staged: true }));

    const pending = lc.awaitReadyForSnapshot(target, {
      componentKey: 'roc',
      tabId: 'tab-a',
      root,
      timeoutMs: 120,
      settleFrames: 0
    });
    const frameWait = jest.spyOn(lc, 'waitForAnimationFrames');
    window.setTimeout(() => publication.commit(), 10);
    await expect(pending).resolves.toEqual(expect.objectContaining({ ok: true, componentKey: 'roc', tabId: 'tab-a' }));
    expect(frameWait).not.toHaveBeenCalled();
  });

  test('returns ok:false instead of silently succeeding when the component never becomes idle', async () => {
    const target = {
      type: 'scatter',
      isIdleForSnapshot: () => false
    };
    const result = await lc.awaitReadyForSnapshot(target, {
      componentKey: 'scatter',
      tabId: 'tab-b',
      timeoutMs: 100,
      settleFrames: 0
    });
    expect(result).toEqual(expect.objectContaining({
      ok: false,
      componentKey: 'scatter',
      tabId: 'tab-b',
      reason: 'component-not-idle'
    }));
  });
});

describe('componentLifecycle — payload capture ownership', () => {
  beforeEach(() => {
    loadFresh();
    document.body.innerHTML = '';
  });

  test('allows live capture only when workspace, projection, session, and root share the requested owner', () => {
    const tab = { id: 'tab-a', type: 'scatter', payload: { type: 'scatter', data: [[1]] } };
    window.Main = { session: { workspaceState: { activeTabId: 'tab-a', tabs: [tab] } } };
    const root = document.createElement('div');
    root.dataset.workspaceTabId = 'tab-a';
    const result = lc.resolvePayloadCaptureContext('scatter', { tabId: 'tab-a' }, {
      component: { __boundTabId: 'tab-a' },
      projectedSession: { tabId: 'tab-a' },
      session: { tabId: 'tab-a' },
      root
    });

    expect(result.canCaptureLive).toBe(true);
    expect(result.requestedTab).toBe(tab);
  });

  test('rejects an inactive owner even when the stale projection still names it', () => {
    const inactive = { id: 'tab-a', type: 'pca', payload: { type: 'pca', data: [[1]] } };
    const active = { id: 'tab-b', type: 'pca', payload: { type: 'pca', data: [[2]] } };
    window.Main = { session: { workspaceState: { activeTabId: 'tab-b', tabs: [inactive, active] } } };
    const result = lc.resolvePayloadCaptureContext('pca', { tab: inactive }, {
      component: { __boundTabId: 'tab-a' },
      projectedSession: { tabId: 'tab-a' }
    });

    expect(result.canCaptureLive).toBe(false);
    expect(result.workspaceOwnerTabId).toBe('tab-b');
    expect(result.requestedTab).toBe(inactive);
  });

  test('rejects capture when component binding and projected session disagree', () => {
    const tab = { id: 'tab-a', type: 'box', payload: { type: 'box', data: [[1]] } };
    window.Main = { session: { workspaceState: { activeTabId: 'tab-a', tabs: [tab] } } };
    const root = document.createElement('div');
    root.dataset.workspaceTabId = 'tab-a';

    const result = lc.resolvePayloadCaptureContext('box', { tabId: 'tab-a' }, {
      component: { __boundTabId: 'tab-a' },
      projectedSession: { tabId: 'tab-b' },
      session: { tabId: 'tab-a' },
      root
    });

    expect(result.canCaptureLive).toBe(false);
    expect(result.componentBoundTabId).toBe('tab-a');
    expect(result.projectedSessionTabId).toBe('tab-b');
  });

  test('rejects live capture when a mounted root belongs to another tab', () => {
    const tab = { id: 'tab-a', type: 'roc', payload: { type: 'roc', data: [[1]] } };
    window.Main = { session: { workspaceState: { activeTabId: 'tab-a', tabs: [tab] } } };
    const root = document.createElement('div');
    root.dataset.workspaceTabId = 'tab-b';
    const result = lc.resolvePayloadCaptureContext('roc', { tabId: 'tab-a' }, {
      component: { __boundTabId: 'tab-a' },
      projectedSession: { tabId: 'tab-a' },
      root
    });

    expect(result.canCaptureLive).toBe(false);
    expect(result.rootTabId).toBe('tab-b');
  });
});
