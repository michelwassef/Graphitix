// Unit tests for js/shared/componentLifecycle.js
// Tests pure/stateless helpers directly and stateful APIs via fresh module loads.

const fs = require('fs');
const path = require('path');

let lc;

function loadFresh() {
  window.Shared?.componentLifecycle?.uninstallGraphEditIntentListener?.();
  jest.resetModules();
  delete window.Shared;
  require('../js/shared/componentLifecycle.js');
  lc = window.Shared.componentLifecycle;
}

describe('componentLifecycle — payloadHasRenderableContent', () => {
  beforeEach(loadFresh);

  test('null / non-object → false', () => {
    expect(lc.payloadHasRenderableContent(null)).toBe(false);
    expect(lc.payloadHasRenderableContent(undefined)).toBe(false);
    expect(lc.payloadHasRenderableContent('string')).toBe(false);
    expect(lc.payloadHasRenderableContent(42)).toBe(false);
  });

  test('count > 0 → true', () => {
    expect(lc.payloadHasRenderableContent({ count: 1 })).toBe(true);
    expect(lc.payloadHasRenderableContent({ count: 0 })).toBe(false);
  });

  test('markup containing SVG tag → true', () => {
    expect(lc.payloadHasRenderableContent({ markup: '<svg width="100"></svg>' })).toBe(true);
    expect(lc.payloadHasRenderableContent({ markup: '<canvas id="c"></canvas>' })).toBe(true);
    expect(lc.payloadHasRenderableContent({ markup: '<table><tr><td>x</td></tr></table>' })).toBe(true);
  });

  test('markup without known element tags → false', () => {
    expect(lc.payloadHasRenderableContent({ markup: 'hello world' })).toBe(false);
    expect(lc.payloadHasRenderableContent({ markup: '<span>x</span>' })).toBe(false);
  });

  test('html string with known element → true', () => {
    expect(lc.payloadHasRenderableContent({ html: '<div class="chart"></div>' })).toBe(true);
  });

  test('svg string → true', () => {
    expect(lc.payloadHasRenderableContent({ svg: '<svg><path d="M0 0"/></svg>' })).toBe(true);
  });

  test('fragment-payload with renderable node → true', () => {
    const payload = {
      __graphitixKind: 'fragment-payload',
      nodes: [{ markup: '<svg></svg>' }]
    };
    expect(lc.payloadHasRenderableContent(payload)).toBe(true);
  });

  test('fragment-payload with no renderable nodes → false', () => {
    const payload = {
      __graphitixKind: 'fragment-payload',
      nodes: [{ markup: 'just text' }, { markup: '' }]
    };
    expect(lc.payloadHasRenderableContent(payload)).toBe(false);
  });

  test('custom markupPattern option', () => {
    const options = { markupPattern: /CUSTOM_MARKER/i };
    expect(lc.payloadHasRenderableContent({ markup: 'has CUSTOM_MARKER here' }, options)).toBe(true);
    expect(lc.payloadHasRenderableContent({ markup: '<svg></svg>' }, options)).toBe(false);
  });
});

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
      reason: 'unit-cross-realm'
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

describe('componentLifecycle — snapshot publication readiness', () => {
  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    document.body.innerHTML = '';
    require('../js/shared/dom.js');
    require('../js/shared/componentLifecycle.js');
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
    window.setTimeout(() => publication.commit(), 10);
    await expect(pending).resolves.toEqual(expect.objectContaining({ ok: true, componentKey: 'roc', tabId: 'tab-a' }));
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

describe('componentLifecycle — isGraphFrameLayoutAuthorityWrite', () => {
  beforeEach(loadFresh);

  test('layoutAuthority: true → true', () => {
    expect(lc.isGraphFrameLayoutAuthorityWrite({ layoutAuthority: true })).toBe(true);
  });

  test('writeLayout: true → true', () => {
    expect(lc.isGraphFrameLayoutAuthorityWrite({ writeLayout: true })).toBe(true);
  });

  test('writeStyle: true → true', () => {
    expect(lc.isGraphFrameLayoutAuthorityWrite({ writeStyle: true })).toBe(true);
  });

  test('reason includes layout-apply → true', () => {
    expect(lc.isGraphFrameLayoutAuthorityWrite({ reason: 'layout-apply' })).toBe(true);
    expect(lc.isGraphFrameLayoutAuthorityWrite({ reason: 'apply-layout' })).toBe(true);
    expect(lc.isGraphFrameLayoutAuthorityWrite({ reason: 'manual-resize' })).toBe(true);
  });

  test('no recognized flags → false', () => {
    expect(lc.isGraphFrameLayoutAuthorityWrite({})).toBe(false);
    expect(lc.isGraphFrameLayoutAuthorityWrite({ reason: 'auto-draw' })).toBe(false);
  });
});

describe('componentLifecycle — validateRenderCache', () => {
  beforeEach(loadFresh);

  test('null cache → false', () => {
    expect(lc.validateRenderCache(null)).toBe(false);
    expect(lc.validateRenderCache(undefined)).toBe(false);
  });

  test('empty cache, default requireGraph → false (missing graph)', () => {
    expect(lc.validateRenderCache({}, {}, {})).toBe(false);
  });

  test('requireGraph: false, no sections required → true', () => {
    expect(lc.validateRenderCache({}, {}, { requireGraph: false })).toBe(true);
  });

  test('cache.plot with svg markup satisfies requireGraph', () => {
    const cache = { plot: { markup: '<svg><path d="M0 0"/></svg>' } };
    expect(lc.validateRenderCache(cache, {}, { requireGraph: true })).toBe(true);
  });

  test('renderCache tabId mismatch → false', () => {
    const meta = { tabId: 'tab1', renderCache: { tabId: 'tab2' } };
    expect(lc.validateRenderCache({}, meta, { requireGraph: false })).toBe(false);
  });

  test('renderCache type mismatch → false', () => {
    const meta = { renderCache: { type: 'scatter' } };
    const spec = { componentKey: 'box', requireGraph: false };
    expect(lc.validateRenderCache({}, meta, spec)).toBe(false);
  });

  test('matching tabId and type → true', () => {
    const meta = { tabId: 'tab1', renderCache: { tabId: 'tab1', type: 'box' } };
    const spec = { componentKey: 'box', requireGraph: false };
    expect(lc.validateRenderCache({}, meta, spec)).toBe(true);
  });

  test('missing required section → false', () => {
    const cache = { requireGraph: false };
    const spec = { requireGraph: false, requiredSections: ['statsPanel'] };
    expect(lc.validateRenderCache(cache, {}, spec)).toBe(false);
  });

  test('required section present with count → true', () => {
    const cache = { statsPanel: { count: 1 } };
    const spec = { requireGraph: false, requiredSections: ['statsPanel'] };
    expect(lc.validateRenderCache(cache, {}, spec)).toBe(true);
  });
});

describe('componentLifecycle — restore transaction stack', () => {
  beforeEach(loadFresh);

  test('isRestoreTransactionActive before begin → false', () => {
    expect(lc.isRestoreTransactionActive('box', { tabId: 'tab-a' })).toBe(false);
  });

  test('active during beginRestoreTransaction, false after end', () => {
    const end = lc.beginRestoreTransaction('box', { tabId: 'tab-a' });
    expect(lc.isRestoreTransactionActive('box', { tabId: 'tab-a' })).toBe(true);
    end();
    expect(lc.isRestoreTransactionActive('box', { tabId: 'tab-a' })).toBe(false);
  });

  test('end() is idempotent — second call returns false', () => {
    const end = lc.beginRestoreTransaction('scatter', { tabId: 'tab-a' });
    expect(end()).toBe(true);
    expect(end()).toBe(false);
    expect(lc.isRestoreTransactionActive('scatter', { tabId: 'tab-a' })).toBe(false);
  });

  test('withRestoreTransaction executes fn synchronously', () => {
    let called = false;
    lc.withRestoreTransaction('box', { tabId: 'tab-a' }, () => { called = true; });
    expect(called).toBe(true);
  });

  test('withRestoreTransaction ends transaction after sync fn', () => {
    let activeInside = false;
    lc.withRestoreTransaction('box', { tabId: 'tab-a' }, () => {
      activeInside = lc.isRestoreTransactionActive('box', { tabId: 'tab-a' });
    });
    expect(activeInside).toBe(true);
    expect(lc.isRestoreTransactionActive('box', { tabId: 'tab-a' })).toBe(false);
  });

  test('withRestoreTransaction rethrows error and still ends', () => {
    expect(() => {
      lc.withRestoreTransaction('box', { tabId: 'tab-a' }, () => { throw new Error('boom'); });
    }).toThrow('boom');
    expect(lc.isRestoreTransactionActive('box', { tabId: 'tab-a' })).toBe(false);
  });

  test('nested transactions: both active, end independently', () => {
    const end1 = lc.beginRestoreTransaction('scatter', { tabId: 'tab-a' });
    const end2 = lc.beginRestoreTransaction('box', { tabId: 'tab-b' });
    expect(lc.isRestoreTransactionActive('scatter', { tabId: 'tab-a' })).toBe(true);
    expect(lc.isRestoreTransactionActive('box', { tabId: 'tab-b' })).toBe(true);
    end2();
    expect(lc.isRestoreTransactionActive('box', { tabId: 'tab-b' })).toBe(false);
    expect(lc.isRestoreTransactionActive('scatter', { tabId: 'tab-a' })).toBe(true);
    end1();
    expect(lc.isRestoreTransactionActive('scatter', { tabId: 'tab-a' })).toBe(false);
  });

  test('getRestoreTransaction returns token with correct componentKey', () => {
    const end = lc.beginRestoreTransaction('pie', { tabId: 'tab-a', reason: 'test-restore' });
    const token = lc.getRestoreTransaction('pie', { tabId: 'tab-a' });
    expect(token).not.toBeNull();
    expect(token.componentKey).toBe('pie');
    expect(token.reason).toBe('test-restore');
    end();
  });
});

describe('componentLifecycle — derivedCache', () => {
  let cache;
  beforeEach(() => {
    loadFresh();
    cache = lc.derivedCache.create('box');
  });

  test('get on empty cache → null', () => {
    expect(cache.get('sig1')).toBeNull();
  });

  test('set then get → same value', () => {
    const v = { x: 1 };
    cache.set('sig1', v);
    expect(cache.get('sig1')).toBe(v);
  });

  test('empty-string signature is not stored', () => {
    cache.set('', { x: 1 });
    expect(cache.get('')).toBeNull();
  });

  test('getOrBuild — miss calls builder, stores result', () => {
    let built = 0;
    const result = cache.getOrBuild('s1', () => { built++; return { y: 2 }; });
    expect(built).toBe(1);
    expect(result).toEqual({ y: 2 });
    cache.getOrBuild('s1', () => { built++; return { y: 3 }; });
    expect(built).toBe(1);
  });

  test('getOrBuild — null result is not cached (builder called again)', () => {
    let built = 0;
    cache.getOrBuild('s2', () => { built++; return null; });
    cache.getOrBuild('s2', () => { built++; return null; });
    expect(built).toBe(2);
  });

  test('clear returns count of cleared entries and empties cache', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.clear()).toBe(2);
    expect(cache.get('a')).toBeNull();
  });

  test('snapshot reflects size and componentKey', () => {
    cache.set('x', 1);
    const snap = cache.snapshot();
    expect(snap.size).toBe(1);
    expect(snap.componentKey).toBe('box');
  });

  test('separate cache instances are independent', () => {
    const other = lc.derivedCache.create('scatter');
    cache.set('shared-sig', 'box-value');
    expect(other.get('shared-sig')).toBeNull();
  });
});

describe('componentLifecycle — lifecycle events', () => {
  beforeEach(loadFresh);

  test('emitLifecycleEvent adds to log', () => {
    const cursor = lc.getLifecycleEventCursor();
    lc.emitLifecycleEvent({ componentKey: 'box', action: 'draw' });
    const events = lc.getLifecycleEvents(cursor);
    expect(events).toHaveLength(1);
    expect(events[0].componentKey).toBe('box');
    expect(events[0].action).toBe('draw');
    expect(typeof events[0].at).toBe('number');
    expect(typeof events[0].index).toBe('number');
  });

  test('onLifecycleEvent — listener is called on emit', () => {
    const received = [];
    const unsub = lc.onLifecycleEvent(e => received.push(e));
    lc.emitLifecycleEvent({ componentKey: 'scatter', action: 'stats' });
    unsub();
    expect(received).toHaveLength(1);
    expect(received[0].componentKey).toBe('scatter');
  });

  test('unsubscribe prevents future listener calls', () => {
    const received = [];
    const unsub = lc.onLifecycleEvent(e => received.push(e));
    lc.emitLifecycleEvent({ action: 'before' });
    unsub();
    lc.emitLifecycleEvent({ action: 'after' });
    expect(received).toHaveLength(1);
    expect(received[0].action).toBe('before');
  });

  test('getLifecycleEvents(cursor) returns only new events', () => {
    const cursor = lc.getLifecycleEventCursor();
    lc.emitLifecycleEvent({ action: 'e1' });
    lc.emitLifecycleEvent({ action: 'e2' });
    const events = lc.getLifecycleEvents(cursor);
    expect(events).toHaveLength(2);
    expect(events.map(e => e.action)).toEqual(['e1', 'e2']);
  });

  test('non-function listener — onLifecycleEvent returns no-op unsubscribe', () => {
    const unsub = lc.onLifecycleEvent(null);
    expect(() => lc.emitLifecycleEvent({ action: 'x' })).not.toThrow();
    expect(() => unsub()).not.toThrow();
  });

  test('listener error does not propagate to emitter', () => {
    lc.onLifecycleEvent(() => { throw new Error('listener boom'); });
    expect(() => lc.emitLifecycleEvent({ action: 'x' })).not.toThrow();
  });

  test('event index increments monotonically', () => {
    const cursor = lc.getLifecycleEventCursor();
    lc.emitLifecycleEvent({ action: 'a' });
    lc.emitLifecycleEvent({ action: 'b' });
    const [ev1, ev2] = lc.getLifecycleEvents(cursor);
    expect(ev2.index).toBe(ev1.index + 1);
  });

  test('waitForLifecycleEvent resolves only for the requested owner and action', async () => {
    const cursor = lc.getLifecycleEventCursor();
    const pending = lc.waitForLifecycleEvent({
      componentKey: 'line',
      tabId: 'tab-a',
      action: 'draw-settled',
      afterCursor: cursor
    });
    lc.emitLifecycleEvent({ componentKey: 'line', tabId: 'tab-b', action: 'draw-settled' });
    lc.emitLifecycleEvent({ componentKey: 'line', tabId: 'tab-a', action: 'draw-executed' });
    const expected = lc.emitLifecycleEvent({
      componentKey: 'line',
      tabId: 'tab-a',
      action: 'draw-settled',
      reason: 'test-draw'
    });
    await expect(pending).resolves.toEqual(expected);
  });

  test('waitForLifecycleEvent sees a matching event emitted after its cursor', async () => {
    const cursor = lc.getLifecycleEventCursor();
    const expected = lc.emitLifecycleEvent({
      componentKey: 'roc',
      tabId: 'tab-a',
      action: 'draw-settled'
    });
    await expect(lc.waitForLifecycleEvent({
      componentKey: 'roc',
      tabId: 'tab-a',
      action: 'draw-settled',
      afterCursor: cursor
    })).resolves.toEqual(expected);
  });
});

describe('componentLifecycle — shouldSuppressDraw', () => {
  beforeEach(loadFresh);

  test('no transaction, no post-restore → false', () => {
    expect(lc.shouldSuppressDraw('box', {})).toBe(false);
  });

  test('active transaction with suppressDraw → true', () => {
    const end = lc.beginRestoreTransaction('box', { tabId: 'tab-a', suppressDraw: true });
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a' })).toBe(true);
    end();
  });

  test('after transaction ends → false', () => {
    const end = lc.beginRestoreTransaction('box', { tabId: 'tab-a', suppressDraw: true });
    end();
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a' })).toBe(false);
  });

  test('forceDraw overrides active transaction suppression', () => {
    const end = lc.beginRestoreTransaction('box', { tabId: 'tab-a', suppressDraw: true });
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a', forceDraw: true })).toBe(false);
    end();
  });

  test('userInitiated overrides active transaction suppression', () => {
    const end = lc.beginRestoreTransaction('box', { tabId: 'tab-a', suppressDraw: true });
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a', userInitiated: true })).toBe(false);
    end();
  });

  test('user- reason overrides suppression', () => {
    const end = lc.beginRestoreTransaction('box', { tabId: 'tab-a', suppressDraw: true });
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a', reason: 'user-click' })).toBe(false);
    end();
  });
});

describe('componentLifecycle — post-restore draw suppression', () => {
  beforeEach(loadFresh);

  // This count/timer guard is installed when a render-cache-restore transaction ends.
  // It is what made PCA require a second resize after reopen: user-driven resize
  // refreshes that did not carry userInitiated/forceDraw were silently consumed here.
  test('post-restore suppression drops passive draws until its count is exhausted', () => {
    lc.markPostRestoreDrawSuppression('box', 'tab-a', { count: 2, delayMs: 0, reason: 'restore' });
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a', reason: 'resize' })).toBe(true);
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a', reason: 'resize' })).toBe(true);
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a', reason: 'resize' })).toBe(false);
  });

  test('userInitiated bypasses post-restore suppression without consuming it', () => {
    lc.markPostRestoreDrawSuppression('box', 'tab-a', { count: 2, delayMs: 0, reason: 'restore' });
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a', reason: 'resize', userInitiated: true })).toBe(false);
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a', reason: 'resize', userInitiated: true })).toBe(false);
    // The bypass must not have drained the guard, so a genuinely passive draw is still suppressed.
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a', reason: 'resize' })).toBe(true);
  });

  test('forceDraw bypasses post-restore suppression', () => {
    lc.markPostRestoreDrawSuppression('box', 'tab-a', { count: 2, delayMs: 0, reason: 'restore' });
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-a', reason: 'resize', forceDraw: true })).toBe(false);
  });

  test('post-restore suppression is scoped to its own tab', () => {
    lc.markPostRestoreDrawSuppression('box', 'tab-a', { count: 4, delayMs: 0, reason: 'restore' });
    expect(lc.shouldSuppressDraw('box', { tabId: 'tab-b', reason: 'resize' })).toBe(false);
  });
});

describe('componentLifecycle — graph edit cache invalidation', () => {
  let tab;
  let activeTab;
  let draw;

  beforeEach(() => {
    window.Shared?.componentLifecycle?.uninstallGraphEditIntentListener?.();
    jest.resetModules();
    delete window.Shared;
    delete window.Components;
    delete window.Main;
    document.body.innerHTML = '';
    document.elementFromPoint = jest.fn(() => null);
    tab = {
      id: 'tab-a',
      type: 'box',
      renderCache: { cache: { plot: { count: 1 } } },
      renderCacheSignature: 'payload-sig',
      archiveRenderCache: { plot: { count: 1 } },
      archiveRenderCacheSignature: 'archive-sig'
    };
    activeTab = tab;
    draw = jest.fn();
    window.Components = { box: { draw, isIdleForSnapshot: () => true } };
    window.Main = {
      session: {
        workspaceState: { tabs: [tab], activeTabId: 'tab-a' },
        getActiveTab: () => activeTab,
        clearTabRenderCache(target) {
          target.renderCache = null;
          target.renderCacheSignature = null;
          target.renderCacheLayoutSignature = null;
          target.renderCacheTabId = null;
          return true;
        },
        clearTabArchiveRenderCache(target) {
          target.archiveRenderCache = null;
          target.archiveRenderCacheSignature = null;
          target.archiveRenderCacheLayoutSignature = null;
          return true;
        }      },
      components: {
        get: () => ({ draw })
      }
    };
    require('../js/shared/componentLifecycle.js');
    lc = window.Shared.componentLifecycle;
  });

  afterEach(() => {
    window.Shared?.componentLifecycle?.uninstallGraphEditIntentListener?.();
  });

  test('every graph component declares the render-cache interaction contract', () => {
    const components = ['box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie', 'venn'];
    components.forEach(componentKey => {
      const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', `${componentKey}.js`), 'utf8');
      expect(source).toContain(`${componentKey}.rehydrateGraphInteractions = function rehydrateGraphInteractions`);
    });
  });

  test('every component that declares serialized axis or inline-edit interactions rehydrates them explicitly', () => {
    const axisComponents = ['box', 'scatter', 'pca', 'line', 'roc', 'survival', 'hist', 'pie', 'venn'];
    const inlineComponents = ['box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie', 'venn'];

    axisComponents.forEach(componentKey => {
      const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', `${componentKey}.js`), 'utf8');
      expect(source).toContain('rehydrateAxisElements');
    });
    inlineComponents.forEach(componentKey => {
      const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', `${componentKey}.js`), 'utf8');
      expect(source).toMatch(/rehydrate[A-Za-z0-9]*InlineTextInteractions/);
    });
  });

  test('render-cache restore rejects semantic interaction markers that remain unbound', () => {
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg">
          <line id="axis" data-axis-control="1" data-axis-key="x" x1="0" y1="10" x2="100" y2="10"></line>
          <text id="title" data-inline-editable="1">Title</text>
        </svg></div>
      </div>
    `;
    const root = document.querySelector('[data-workspace-tab-id="tab-a"]');
    window.Shared.chartStyle = { bindSvgInteractions: jest.fn(() => true) };
    window.Shared.workspaceTabs = { getMountedRoot: jest.fn(() => root) };
    window.Shared.axisControls = { isAxisElementBound: jest.fn(() => false) };
    window.Components.box.rehydrateGraphInteractions = jest.fn(() => true);

    expect(lc.rehydrateRenderCacheInteractions('box', { tab, tabId: tab.id })).toBe(false);

    const axis = document.getElementById('axis');
    const title = document.getElementById('title');
    axis.__graphitixAxisControlBinding = { handler: () => {} };
    title.__graphitixInlineEditBinding = { dblclick: () => {} };
    window.Shared.axisControls.isAxisElementBound = jest.fn(node => node === axis);

    expect(lc.rehydrateRenderCacheInteractions('box', { tab, tabId: tab.id })).toBe(true);
  });
  test('render-cache restore rebinds shared SVG and component interactions for the exact owner', () => {
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg"><text data-font-editable="1">Y axis</text></svg></div>
      </div>
    `;
    const root = document.querySelector('[data-workspace-tab-id="tab-a"]');
    const bindSvgInteractions = jest.fn(() => true);
    const rehydrateGraphInteractions = jest.fn(() => true);
    window.Shared.chartStyle = { bindSvgInteractions };
    window.Shared.workspaceTabs = { getMountedRoot: jest.fn(() => root) };
    window.Components.box.rehydrateGraphInteractions = rehydrateGraphInteractions;

    const ready = lc.rehydrateRenderCacheInteractions('box', {
      tab,
      tabId: tab.id,
      reason: 'unit-render-cache-restore'
    });

    expect(ready).toBe(true);
    expect(bindSvgInteractions).toHaveBeenCalledWith(
      document.getElementById('boxSvg'),
      expect.objectContaining({ scopeId: 'box', tabId: 'tab-a' })
    );
    expect(rehydrateGraphInteractions).toHaveBeenCalledWith(expect.objectContaining({
      componentKey: 'box',
      tabId: 'tab-a',
      root
    }));
  });

  test('render-cache restore is rejected when editable SVG interactions cannot bind', () => {
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg"><text data-font-editable="1">Title</text></svg></div>
      </div>
    `;
    const root = document.querySelector('[data-workspace-tab-id="tab-a"]');
    window.Shared.chartStyle = { bindSvgInteractions: jest.fn(() => false) };
    window.Shared.workspaceTabs = { getMountedRoot: jest.fn(() => root) };

    expect(lc.rehydrateRenderCacheInteractions('box', { tab, tabId: tab.id })).toBe(false);
  });

  test('render-cache restore is rejected when the component rehydration hook is missing', () => {
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg"></svg></div>
      </div>
    `;
    const root = document.querySelector('[data-workspace-tab-id="tab-a"]');
    window.Shared.chartStyle = { bindSvgInteractions: jest.fn(() => true) };
    window.Shared.workspaceTabs = { getMountedRoot: jest.fn(() => root) };

    expect(lc.rehydrateRenderCacheInteractions('box', { tab, tabId: tab.id })).toBe(false);
  });

  test('fresh module evaluation replaces the previous document capture listeners', () => {
    const firstDraw = draw;
    const firstLifecycle = lc;

    jest.resetModules();
    delete window.Shared;
    draw = jest.fn();
    window.Components = { box: { draw, isIdleForSnapshot: () => true } };
    window.Main.components.get = () => ({ draw });
    require('../js/shared/componentLifecycle.js');
    lc = window.Shared.componentLifecycle;

    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg"><circle id="point" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
    `;
    const event = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10
    });
    event.__graphitixUserTrusted = true;

    document.getElementById('point').dispatchEvent(event);

    expect(firstLifecycle).not.toBe(lc);
    expect(firstDraw).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
  });

  test('beginGraphEdit clears render caches without redrawing a rehydrated graph', () => {
    const result = lc.beginGraphEdit('box', {
      tabId: 'tab-a',
      reason: 'unit-graph-edit'
    });

    expect(result.ok).toBe(true);
    expect(result.hadGraphCache).toBe(true);
    expect(result.redrawRequested).toBe(false);
    expect(tab.renderCache).toBeNull();
    expect(tab.archiveRenderCache).toBeNull();
    expect(draw).not.toHaveBeenCalled();
  });

  test('beginGraphEdit does not redraw when no restored cache was present', () => {
    tab.renderCache = null;
    tab.renderCacheSignature = null;
    tab.archiveRenderCache = null;
    tab.archiveRenderCacheSignature = null;

    const result = lc.beginGraphEdit('box', {
      tabId: 'tab-a',
      reason: 'unit-graph-edit-clean'
    });

    expect(result.ok).toBe(true);
    expect(result.hadGraphCache).toBe(false);
    expect(result.redrawRequested).toBe(false);
    expect(draw).not.toHaveBeenCalled();
  });

  test('beginGraphEdit does not redraw a live graph merely because it has been cached', () => {
    const result = lc.beginGraphEdit('box', {
      tabId: 'tab-a',
      reason: 'unit-live-cached-graph-edit'
    });

    expect(result.hadGraphCache).toBe(true);
    expect(result.redrawRequested).toBe(false);
    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
    expect(tab.archiveRenderCache).toBeNull();
  });

  test('replacement cache wrappers also invalidate without redraw', () => {
    tab.renderCache = { cache: { plot: { count: 2 } } };

    const result = lc.beginGraphEdit('box', {
      tabId: 'tab-a',
      reason: 'unit-restored-cache-recaptured'
    });

    expect(result.hadGraphCache).toBe(true);
    expect(result.redrawRequested).toBe(false);
    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
  });

  test('draw history does not change the no-redraw edit contract', () => {
    lc.emitLifecycleEvent({
      componentKey: 'box',
      tabId: 'tab-a',
      action: 'draw-executed',
      reason: 'unit-live-redraw'
    });

    const result = lc.beginGraphEdit('box', {
      tabId: 'tab-a',
      reason: 'unit-after-live-redraw'
    });

    expect(result.hadGraphCache).toBe(true);
    expect(result.redrawRequested).toBe(false);
    expect(draw).not.toHaveBeenCalled();
  });

  test('graph clicks never start an asynchronous redraw replay', async () => {
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg"><circle id="stalePoint" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
    `;
    document.elementFromPoint = jest.fn(() => document.getElementById('stalePoint'));
    const event = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10
    });
    event.__graphitixUserTrusted = true;

    document.getElementById('stalePoint').dispatchEvent(event);
    lc.uninstallGraphEditIntentListener();
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.elementFromPoint).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
  });

  test('trusted first graph click reaches rehydrated handlers without redraw', () => {
    const rehydratedHandler = jest.fn();
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg"><circle id="stalePoint" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
    `;
    const target = document.getElementById('stalePoint');
    target.addEventListener('click', rehydratedHandler);
    const event = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10
    });
    event.__graphitixUserTrusted = true;

    target.dispatchEvent(event);

    expect(rehydratedHandler).toHaveBeenCalledTimes(1);
    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
    expect(tab.archiveRenderCache).toBeNull();
  });

  test('trusted graph click invalidates only the owning restored tab', () => {
    const otherTab = {
      id: 'tab-b',
      type: 'box',
      renderCache: { cache: { plot: { count: 1 } } },
      renderCacheSignature: 'tab-b-sig',
      archiveRenderCache: { plot: { count: 1 } },
      archiveRenderCacheSignature: 'tab-b-archive'
    };
    window.Main.session.workspaceState.tabs.push(otherTab);
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-b">
        <div class="svgbox"><svg id="boxSvgB"><circle id="pointB" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
    `;
    const target = document.getElementById('pointB');
    const event = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10
    });
    event.__graphitixUserTrusted = true;

    target.dispatchEvent(event);

    expect(tab.renderCache).not.toBeNull();
    expect(tab.archiveRenderCache).not.toBeNull();
    expect(otherTab.renderCache).toBeNull();
    expect(otherTab.archiveRenderCache).toBeNull();
    expect(draw).not.toHaveBeenCalled();
  });

  test('restored graph clicks do not use hit-testing or replay', async () => {
    document.body.innerHTML = `
      <div id="ownerA" data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg"><circle id="stalePoint" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
    `;
    const owner = document.getElementById('ownerA');
    let freshTarget = null;
    const freshHandler = jest.fn();
    draw.mockImplementation(() => {
      owner.innerHTML = '<div class="svgbox"><svg id="boxSvg"><circle id="freshPoint" cx="1" cy="1" r="1"></circle></svg></div>';
      freshTarget = document.getElementById('freshPoint');
      freshTarget.addEventListener('click', freshHandler);
      return Promise.resolve(true);
    });
    lc.waitForAnimationFrames = jest.fn(() => Promise.resolve(true));
    document.elementFromPoint = jest.fn(() => freshTarget);
    const event = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10
    });
    event.__graphitixUserTrusted = true;

    document.getElementById('stalePoint').dispatchEvent(event);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.elementFromPoint).not.toHaveBeenCalled();
    expect(freshHandler).not.toHaveBeenCalled();
    expect(draw).not.toHaveBeenCalled();
  });

  test('owner changes cannot dispatch an edit into another tab', async () => {
    const otherTab = { id: 'tab-b', type: 'box' };
    window.Main.session.workspaceState.tabs.push(otherTab);
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvgA"><circle id="stalePointA" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
      <div data-workspace-component="box" data-workspace-tab-id="tab-b">
        <div class="svgbox"><svg id="boxSvgB"><circle id="activePointB" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
    `;
    const activePointB = document.getElementById('activePointB');
    const foreignHandler = jest.fn();
    activePointB.addEventListener('click', foreignHandler);
    draw.mockImplementation(() => Promise.resolve(true));
    lc.waitForAnimationFrames = jest.fn(() => Promise.resolve(true));
    document.elementFromPoint = jest.fn(() => activePointB);
    const event = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10
    });
    event.__graphitixUserTrusted = true;

    document.getElementById('stalePointA').dispatchEvent(event);
    activeTab = otherTab;
    window.Main.session.workspaceState.activeTabId = otherTab.id;
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.elementFromPoint).not.toHaveBeenCalled();
    expect(foreignHandler).not.toHaveBeenCalled();
  });

  test('foreign hit-test targets are never consulted after a graph click', async () => {
    const otherTab = { id: 'tab-b', type: 'box' };
    window.Main.session.workspaceState.tabs.push(otherTab);
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvgA"><circle id="stalePointA" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
      <div data-workspace-component="box" data-workspace-tab-id="tab-b">
        <div class="svgbox"><svg id="boxSvgB"><circle id="foreignPointB" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
    `;
    const foreignHandler = jest.fn();
    const foreignTarget = document.getElementById('foreignPointB');
    foreignTarget.addEventListener('click', foreignHandler);
    draw.mockImplementation(() => Promise.resolve(true));
    lc.waitForAnimationFrames = jest.fn(() => Promise.resolve(true));
    document.elementFromPoint = jest.fn(() => foreignTarget);
    const event = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10
    });
    event.__graphitixUserTrusted = true;

    document.getElementById('stalePointA').dispatchEvent(event);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.elementFromPoint).not.toHaveBeenCalled();
    expect(foreignHandler).not.toHaveBeenCalled();
  });

  test('workspace activeTabId remains authoritative when a compatibility getter is stale', async () => {
    const otherTab = { id: 'tab-b', type: 'box' };
    window.Main.session.workspaceState.tabs.push(otherTab);
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvgA"><circle id="stalePointA" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
      <div data-workspace-component="box" data-workspace-tab-id="tab-b">
        <div class="svgbox"><svg id="boxSvgB"><circle id="activePointB" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
    `;
    const foreignHandler = jest.fn();
    document.getElementById('activePointB').addEventListener('click', foreignHandler);
    draw.mockImplementation(() => Promise.resolve(true));
    lc.waitForAnimationFrames = jest.fn(() => Promise.resolve(true));
    document.elementFromPoint = jest.fn(() => document.getElementById('activePointB'));
    const event = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10
    });
    event.__graphitixUserTrusted = true;

    document.getElementById('stalePointA').dispatchEvent(event);
    // Simulate a stale compatibility getter while the canonical workspace
    // state has already activated another tab.
    window.Main.session.workspaceState.activeTabId = otherTab.id;
    activeTab = tab;
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(document.elementFromPoint).not.toHaveBeenCalled();
    expect(foreignHandler).not.toHaveBeenCalled();
  });

  test('trusted resize-handle click does not begin a restored graph edit', () => {
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox">
          <svg id="boxSvg"></svg>
          <div class="resizer resizer-vertical" id="resizeHandle"></div>
        </div>
      </div>
    `;
    const event = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10
    });
    event.__graphitixUserTrusted = true;

    document.getElementById('resizeHandle').dispatchEvent(event);

    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).not.toBeNull();
    expect(tab.archiveRenderCache).not.toBeNull();
  });

  test('trusted graph drag movement begins graph edit for a restored graph', () => {
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg"><text id="dragLabel" x="1" y="1">Title</text></svg></div>
      </div>
    `;
    const target = document.getElementById('dragLabel');
    const down = new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 10,
      clientY: 10
    });
    down.__graphitixUserTrusted = true;
    const move = new window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 22,
      clientY: 10
    });
    move.__graphitixUserTrusted = true;

    target.dispatchEvent(down);
    document.dispatchEvent(move);

    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
    expect(tab.archiveRenderCache).toBeNull();
  });

  test('managed 3D rotation drag stays outside the generic restored-graph edit path', () => {
    window.Shared.plot3d = {
      isManagedRotationGestureTarget: jest.fn(() => true),
      consumeManagedRotationClick: jest.fn(() => false)
    };
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg"><circle id="rotationPoint" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
    `;
    const target = document.getElementById('rotationPoint');
    const down = new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 10,
      clientY: 10
    });
    down.__graphitixUserTrusted = true;
    const move = new window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 30,
      clientY: 10
    });
    move.__graphitixUserTrusted = true;

    target.dispatchEvent(down);
    document.dispatchEvent(move);

    expect(window.Shared.plot3d.isManagedRotationGestureTarget).toHaveBeenCalledWith(target);
    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).not.toBeNull();
    expect(tab.archiveRenderCache).not.toBeNull();
  });

  test('managed legend drag stays outside the generic restored-graph edit path', () => {
    window.Shared.isManagedLegendDragTarget = jest.fn(() => true);
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg"><g id="legend"><rect id="legendScale"></rect></g></svg></div>
      </div>
    `;
    const target = document.getElementById('legendScale');
    const down = new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 10,
      clientY: 10
    });
    down.__graphitixUserTrusted = true;
    const move = new window.MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 30,
      clientY: 10
    });
    move.__graphitixUserTrusted = true;

    target.dispatchEvent(down);
    document.dispatchEvent(move);
    const click = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 30,
      clientY: 10
    });
    click.__graphitixUserTrusted = true;
    target.dispatchEvent(click);

    expect(window.Shared.isManagedLegendDragTarget).toHaveBeenCalledWith(target);
    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).not.toBeNull();
    expect(tab.archiveRenderCache).not.toBeNull();
  });

  test('only the synthetic click following a moved managed rotation is consumed', () => {
    const consumeManagedRotationClick = jest.fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    window.Shared.plot3d = {
      isManagedRotationGestureTarget: jest.fn(() => true),
      consumeManagedRotationClick
    };
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox"><svg id="boxSvg"><circle id="rotationPoint" cx="1" cy="1" r="1"></circle></svg></div>
      </div>
    `;
    const target = document.getElementById('rotationPoint');
    const dispatchTrustedClick = () => {
      const event = new window.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10
      });
      event.__graphitixUserTrusted = true;
      target.dispatchEvent(event);
    };

    dispatchTrustedClick();

    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).not.toBeNull();
    expect(tab.archiveRenderCache).not.toBeNull();

    dispatchTrustedClick();

    expect(consumeManagedRotationClick).toHaveBeenCalledTimes(2);
    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
    expect(tab.archiveRenderCache).toBeNull();
  });

  test('trusted toolbar input also begins graph edit for restored graphs', () => {
    document.body.innerHTML = `
      <div class="font-toolbar-host" data-font-toolbar-scope="box">
        <div class="workspace-toolbar__panel--symbol">
          <input id="fillInput" type="color" value="#112233" data-undo-ignore="1" />
        </div>
      </div>
    `;
    const input = document.getElementById('fillInput');
    const event = new window.Event('input', { bubbles: true, cancelable: true });
    event.__graphitixUserTrusted = true;

    input.dispatchEvent(event);

    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
    expect(tab.archiveRenderCache).toBeNull();
  });

  test('trusted toolbar mousedown also begins graph edit for restored graphs', () => {
    document.body.innerHTML = `
      <div class="font-toolbar-host" data-font-toolbar-scope="box">
        <div class="axis-controls-panel">
          <button id="axisDragChip" type="button" data-undo-ignore="1">Axis</button>
        </div>
      </div>
    `;
    const button = document.getElementById('axisDragChip');
    const event = new window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: 10,
      clientY: 10
    });
    event.__graphitixUserTrusted = true;

    button.dispatchEvent(event);

    expect(draw).not.toHaveBeenCalled();
    expect(tab.renderCache).toBeNull();
    expect(tab.archiveRenderCache).toBeNull();
  });
});


describe('componentLifecycle — snapshot render-cache policy', () => {
  beforeEach(loadFresh);

  test('captureRenderCache false is absolute for sync and async snapshots', async () => {
    const captureRenderCache = jest.fn(() => ({ plot: { count: 1 } }));
    const workspace = {
      type: 'scatter',
      getPayload: jest.fn(() => ({ type: 'scatter', data: [[1, 2]] })),
      captureRuntimeState: jest.fn(() => ({ runtime: true })),
      captureUiState: jest.fn(() => ({ ui: true })),
      getLayoutState: jest.fn(() => ({ width: 640, height: 480 })),
      captureRenderCache,
      awaitReadyForSnapshot: jest.fn(() => Promise.resolve({ ok: true }))
    };
    const tab = { id: 'tab-a', type: 'scatter', payload: { type: 'scatter', data: [] } };

    const syncSnapshot = lc.snapshotWorkspaceSync(workspace, tab, {
      tabId: tab.id,
      captureRenderCache: false,
      reason: 'unit-lean-checkpoint-sync'
    });
    const asyncSnapshot = await lc.snapshotWorkspace(workspace, tab, {
      tabId: tab.id,
      captureRenderCache: false,
      reason: 'unit-lean-checkpoint-async'
    });

    expect(syncSnapshot.ok).toBe(true);
    expect(syncSnapshot.renderCache).toBeNull();
    expect(asyncSnapshot.ok).toBe(true);
    expect(asyncSnapshot.renderCache).toBeNull();
    expect(captureRenderCache).not.toHaveBeenCalled();
  });
});

describe('componentLifecycle — diffPayload / validatePayload / normalizePayloadEnvelope', () => {
  beforeEach(loadFresh);

  test('diffPayload: identical payloads → ok:true, no changedPaths', () => {
    const p = { config: { x: 1 }, data: [1, 2, 3] };
    const result = lc.diffPayload(p, p);
    expect(result.ok).toBe(true);
    expect(result.changedPaths).toHaveLength(0);
  });

  test('diffPayload: different config value → ok:false, changedPaths non-empty', () => {
    const before = { config: { x: 1 } };
    const after = { config: { x: 2 } };
    const result = lc.diffPayload(before, after);
    expect(result.ok).toBe(false);
    expect(result.changedPaths.length).toBeGreaterThan(0);
  });

  test('diffPayload: extra key in after → changedPaths includes it', () => {
    const before = { config: {} };
    const after = { config: {}, newKey: 'added' };
    const result = lc.diffPayload(before, after);
    expect(result.ok).toBe(false);
  });

  test('validatePayload: non-object → error payload-not-object', () => {
    const result = lc.validatePayload('not-an-object');
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('payload-not-object');
  });

  test('validatePayload: valid object → ok:true', () => {
    expect(lc.validatePayload({ config: {} }).ok).toBe(true);
  });

  test('validatePayload: type mismatch with descriptor componentKey → error', () => {
    const result = lc.validatePayload({ type: 'scatter' }, { componentKey: 'box' });
    expect(result.ok).toBe(false);
    expect(result.errors.some(e => e.includes('payload-type-mismatch'))).toBe(true);
  });

  test('validatePayload: custom validator returning false → error', () => {
    const descriptor = { validatePayload: () => false };
    const result = lc.validatePayload({ config: {} }, descriptor);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('custom-validator-failed');
  });

  test('normalizePayloadEnvelope: extracts config and data', () => {
    const payload = { config: { colors: ['red'] }, data: [1, 2] };
    const result = lc.normalizePayloadEnvelope(payload);
    expect(result.config).toEqual({ colors: ['red'] });
    expect(result.data).toEqual([1, 2]);
  });

  test('normalizePayloadEnvelope: null payload defaults gracefully', () => {
    const result = lc.normalizePayloadEnvelope(null);
    expect(result.version).toBe(3);
    expect(result.data).toBeNull();
    expect(result.config).toEqual({});
  });

  test('normalizePayloadEnvelope: clones objects (not same reference)', () => {
    const original = { config: { x: 1 }, data: [1] };
    const result = lc.normalizePayloadEnvelope(original);
    expect(result.config).not.toBe(original.config);
    expect(result.data).not.toBe(original.data);
  });
});

describe('componentLifecycle — createAsyncScope', () => {
  beforeEach(loadFresh);

  test('isCurrent true for fresh getMeta token', () => {
    const scope = lc.createAsyncScope('box');
    const meta = scope.getMeta({ tabId: 'tab1' });
    expect(scope.isCurrent(meta)).toBe(true);
  });

  test('nextToken increments generation; old token becomes stale', () => {
    const scope = lc.createAsyncScope('box');
    const old = scope.getMeta({ tabId: 'tab1' });
    scope.nextToken({ tabId: 'tab1' });
    expect(scope.isCurrent(old)).toBe(false);
  });

  test('nextToken result is current', () => {
    const scope = lc.createAsyncScope('box');
    const token = scope.nextToken({ tabId: 'tab1' });
    expect(scope.isCurrent(token)).toBe(true);
  });

  test('cancelAllForTab invalidates current meta for that tab', () => {
    const scope = lc.createAsyncScope('box');
    const meta = scope.getMeta({ tabId: 'tab1' });
    expect(scope.isCurrent(meta)).toBe(true);
    scope.cancelAllForTab('tab1');
    expect(scope.isCurrent(meta)).toBe(false);
  });

  test('cancelAllForTab for other tab does not affect this tab', () => {
    const scope = lc.createAsyncScope('box');
    const meta = scope.getMeta({ tabId: 'tab1' });
    scope.cancelAllForTab('tab2');
    expect(scope.isCurrent(meta)).toBe(true);
  });

  test('separate scopes have independent generations', () => {
    const s1 = lc.createAsyncScope('box');
    const s2 = lc.createAsyncScope('scatter');
    const m1 = s1.getMeta({ tabId: 'tab1' });
    s2.nextToken({ tabId: 'tab1' });
    expect(s1.isCurrent(m1)).toBe(true);
  });

  test('missing tab id is rejected instead of using a global scope', () => {
    const scope = lc.createAsyncScope('box');
    expect(() => scope.getMeta({})).toThrow(/requires an explicit tab id/);
    expect(() => scope.nextToken({})).toThrow(/requires an explicit tab id/);
    expect(() => scope.cancelAllForTab()).toThrow(/requires an explicit tab id/);
  });

  test('runPromise suppresses stale completion callbacks after tab cancellation', async () => {
    const scope = lc.createAsyncScope('box');
    const onResolve = jest.fn();
    const token = scope.nextToken({ tabId: 'tab1', reason: 'stats-worker' });
    const wrapped = scope.runPromise(token, Promise.resolve('done'), onResolve);

    scope.cancelAllForTab('tab1', 'deactivate-tab');

    await expect(wrapped).resolves.toBe('done');
    expect(onResolve).not.toHaveBeenCalled();
  });

  test('setTimeout suppresses stale callbacks after tab cancellation', () => {
    jest.useFakeTimers();
    try{
      const scope = lc.createAsyncScope('pca');
      const callback = jest.fn();

      scope.setTimeout({ tabId: 'tab1', reason: 'activation-retry' }, callback, 20);
      scope.cancelAllForTab('tab1', 'deactivate-tab');
      jest.runOnlyPendingTimers();

      expect(callback).not.toHaveBeenCalled();
    }finally{
      jest.useRealTimers();
    }
  });

  test('requestAnimationFrame suppresses callbacks invalidated by a newer token', () => {
    jest.useFakeTimers();
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    global.requestAnimationFrame = cb => setTimeout(cb, 0);
    global.cancelAnimationFrame = id => clearTimeout(id);
    try{
      const scope = lc.createAsyncScope('pca');
      const callback = jest.fn();

      scope.requestAnimationFrame({ tabId: 'tab1', reason: 'overlay-frame' }, callback);
      scope.nextToken({ tabId: 'tab1', reason: 'new-data-draw' });
      jest.runOnlyPendingTimers();

      expect(callback).not.toHaveBeenCalled();
    }finally{
      global.requestAnimationFrame = originalRequestAnimationFrame;
      global.cancelAnimationFrame = originalCancelAnimationFrame;
      jest.useRealTimers();
    }
  });

  test('tab-scoped frame debouncer keeps same-component tabs independent', () => {
    jest.useFakeTimers();
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    global.requestAnimationFrame = cb => setTimeout(cb, 0);
    global.cancelAnimationFrame = id => clearTimeout(id);
    try{
      const component = { __componentKey: 'box' };
      const callback = jest.fn();
      const debounced = lc.createTabScopedFrameDebouncer(component, 'box', meta => callback(meta.tabId), {
        reason: 'unit-tab-frame-debounce'
      });

      debounced({ tabId: 'tab-a', reason: 'unit-tab-a' });
      debounced({ tabId: 'tab-b', reason: 'unit-tab-b' });
      jest.runOnlyPendingTimers();

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith('tab-a');
      expect(callback).toHaveBeenCalledWith('tab-b');
    }finally{
      global.requestAnimationFrame = originalRequestAnimationFrame;
      global.cancelAnimationFrame = originalCancelAnimationFrame;
      jest.useRealTimers();
    }
  });

  test('tab-scoped frame debouncer reports terminal stale discards to the owner', () => {
    jest.useFakeTimers();
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    global.requestAnimationFrame = cb => setTimeout(cb, 0);
    global.cancelAnimationFrame = id => clearTimeout(id);
    try{
      const component = { __componentKey: 'roc' };
      const callback = jest.fn();
      const onStaleDiscard = jest.fn();
      const debounced = lc.createTabScopedFrameDebouncer(component, 'roc', callback, {
        reason: 'unit-roc-frame-discard',
        onStaleDiscard
      });

      debounced({ tabId: 'tab-a', drawGeneration: 7, reason: 'scheduled-roc' });
      component.__asyncScope.nextToken({ tabId: 'tab-a', reason: 'owner-generation-advanced' });
      jest.runOnlyPendingTimers();

      expect(callback).not.toHaveBeenCalled();
      expect(onStaleDiscard).toHaveBeenCalledTimes(1);
      expect(onStaleDiscard).toHaveBeenCalledWith(expect.objectContaining({
        componentKey: 'roc',
        tabId: 'tab-a',
        args: [expect.objectContaining({ drawGeneration: 7, reason: 'scheduled-roc' })]
      }));
    }finally{
      global.requestAnimationFrame = originalRequestAnimationFrame;
      global.cancelAnimationFrame = originalCancelAnimationFrame;
      jest.useRealTimers();
    }
  });

  test('tab-scoped frame debouncer can requeue current owner work after a stale generation', () => {
    jest.useFakeTimers();
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    global.requestAnimationFrame = cb => setTimeout(cb, 0);
    global.cancelAnimationFrame = id => clearTimeout(id);
    try{
      const component = { __componentKey: 'heatmap' };
      const callback = jest.fn();
      const shouldRetryStale = jest.fn(() => true);
      const debounced = lc.createTabScopedFrameDebouncer(component, 'heatmap', callback, {
        reason: 'unit-heatmap-frame-retry',
        retryOnStale: true,
        shouldRetryStale
      });

      debounced({ tabId: 'tab-a', reason: 'heavy-paste' });
      component.__asyncScope.nextToken({ tabId: 'tab-a', reason: 'payload-commit' });
      jest.runOnlyPendingTimers();
      jest.runOnlyPendingTimers();

      expect(shouldRetryStale).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        tabId: 'tab-a',
        reason: 'heavy-paste'
      }));
    }finally{
      global.requestAnimationFrame = originalRequestAnimationFrame;
      global.cancelAnimationFrame = originalCancelAnimationFrame;
      jest.useRealTimers();
    }
  });

  test('tab-scoped frame debouncer is cancelled with the owning async scope', () => {
    jest.useFakeTimers();
    const originalRequestAnimationFrame = global.requestAnimationFrame;
    const originalCancelAnimationFrame = global.cancelAnimationFrame;
    global.requestAnimationFrame = cb => setTimeout(cb, 0);
    global.cancelAnimationFrame = id => clearTimeout(id);
    try{
      const component = { __componentKey: 'box' };
      const callback = jest.fn();
      const debounced = lc.createTabScopedFrameDebouncer(component, 'box', callback, {
        reason: 'unit-tab-frame-debounce-cancel'
      });

      debounced({ tabId: 'tab-a', reason: 'unit-tab-a' });
      component.__asyncScope.cancelAllForTab('tab-a', 'unit-dispose');
      jest.runOnlyPendingTimers();

      expect(callback).not.toHaveBeenCalled();
    }finally{
      global.requestAnimationFrame = originalRequestAnimationFrame;
      global.cancelAnimationFrame = originalCancelAnimationFrame;
      jest.useRealTimers();
    }
  });
});

describe('componentLifecycle — createRuntimeOwner', () => {
  let tabs;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    tabs = [
      { id: 'tab-a', type: 'box' },
      { id: 'tab-b', type: 'box' }
    ];
    window.Main = {
      session: {
        workspaceState: { tabs },
        getActiveTab: () => tabs[0]
      },
      components: { registry: {} }
    };
    require('../js/shared/componentLifecycle.js');
    require('../js/shared/workspaceTabs.js');
    lc = window.Shared.componentLifecycle;
  });

  test('capture stores an owned snapshot in workspace and session runtime', () => {
    const owner = lc.createRuntimeOwner('box');
    const stored = owner.capture({ stats: { ready: true } }, { tabId: 'tab-a', reason: 'unit-capture' });
    const runtime = window.Shared.workspaceTabs.getSessionRuntime('tab-a', 'box');

    expect(stored.__runtimeOwner).toMatchObject({ componentKey: 'box', tabId: 'tab-a' });
    expect(runtime.componentRuntimeSnapshot).toBeUndefined();
    expect(runtime.runtimeOwner).toBeUndefined();
    expect(runtime.lifecycle.snapshot).toEqual(stored);
    expect(window.Shared.workspaceTabs.getLifecycleRuntimeSnapshot('tab-a', 'box')).toEqual(stored);
    expect(window.Shared.workspaceTabs.getRuntimeSnapshot('tab-a', '__workspaceTabs__:box')).toEqual(stored);
  });

  test('legacy workspace runtime snapshots are migrated into lifecycle runtime on read', () => {
    const legacy = {
      componentKey: 'box',
      tabId: 'tab-a',
      __runtimeOwner: { componentKey: 'box', tabId: 'tab-a' }
    };
    tabs[0].sharedState = { runtime: { '__workspaceTabs__:box': legacy } };

    expect(window.Shared.workspaceTabs.getRuntimeSnapshot('tab-a', '__workspaceTabs__:box')).toEqual(legacy);
    expect(tabs[0].sharedState.runtime['__workspaceTabs__:box']).toBeUndefined();
    expect(window.Shared.workspaceTabs.getLifecycleRuntimeSnapshot('tab-a', 'box')).toEqual(legacy);
  });

  test('bind rejects snapshots owned by another tab', () => {
    const owner = lc.createRuntimeOwner('box');
    const stored = owner.capture({ stats: { ready: true } }, { tabId: 'tab-a', reason: 'unit-capture' });

    expect(() => owner.bind(stored, {
      tabId: 'tab-b',
      strictRuntimeOwner: true,
      reason: 'cross-tab-bind'
    })).toThrow(/rejected mismatched snapshot/);
  });

  test('missing tab identity is rejected in strict mode', () => {
    const owner = lc.createRuntimeOwner('box');
    expect(() => owner.capture({ stats: { ready: true } }, {
      strictRuntimeOwner: true,
      reason: 'missing-tab'
    })).toThrow(/missing tab id/);
  });

  test('component runtime snapshot helpers do not return unowned raw snapshots', () => {
    const snapshot = { stats: { ready: true } };

    expect(() => lc.rememberComponentRuntimeSnapshot('box', snapshot, {
      strictRuntimeOwner: true,
      reason: 'unit-remember-missing-tab'
    })).toThrow(/missing tab id/);
    expect(() => lc.resolveComponentRuntimeSnapshot('box', snapshot, {
      strictRuntimeOwner: true,
      reason: 'unit-resolve-missing-tab'
    })).toThrow(/requires explicit tab id/);
  });


  test('runtime snapshot helpers honor an explicit component key for unattached component objects', () => {
    const unattachedComponent = {};
    const snapshot = { stats: { ready: true } };
    const stored = lc.rememberComponentRuntimeSnapshot(unattachedComponent, snapshot, {
      componentKey: 'box',
      tabId: 'tab-a',
      reason: 'unit-unattached-component'
    });

    expect(stored.__runtimeOwner).toMatchObject({ componentKey: 'box', tabId: 'tab-a' });
    expect(lc.getComponentRuntimeSnapshot(unattachedComponent, {
      componentKey: 'box',
      tabId: 'tab-a'
    })).toEqual(stored);
  });

  test('dispose removes both normalized snapshots and owned runtime records', () => {
    const owner = lc.createRuntimeOwner('box');
    owner.capture({ stats: { ready: true } }, { tabId: 'tab-a', reason: 'unit-capture' });
    const runtime = window.Shared.workspaceTabs.getSessionRuntime('tab-a', 'box');
    window.Shared.workspaceTabs.setOwnedRuntimeRecord('tab-a', 'box', { hydrated: true });

    expect(owner.dispose('tab-a', { reason: 'unit-dispose' })).toBe(true);
    expect(runtime.componentRuntimeSnapshot).toBeUndefined();
    expect(runtime.runtimeOwner).toBeUndefined();
    expect(window.Shared.workspaceTabs.getOwnedRuntimeRecord('tab-a', 'box')).toBeNull();
    expect(window.Shared.workspaceTabs.getRuntimeSnapshot('tab-a', '__workspaceTabs__:box')).toBeNull();
  });

  test('owned runtime record lookup does not create a default record', () => {
    const runtime = window.Shared.workspaceTabs.getSessionRuntime('tab-a', 'box');

    expect(window.Shared.workspaceTabs.getOwnedRuntimeRecord('tab-a', 'box')).toBeNull();
    expect(runtime.lifecycle?.ownedRecord).toBeUndefined();
  });

  test('runtime owner owns record creation, normalization, and storage', () => {
    const owner = lc.createRuntimeOwner('box', {
      createDefaultRecord: tabId => ({ version: 1, componentKey: 'box', tabId, hydrated: false, controls: {} }),
      normalizeRecord: record => {
        record.controls = record.controls && typeof record.controls === 'object' ? record.controls : {};
        record.normalized = true;
        return record;
      }
    });
    const runtime = window.Shared.workspaceTabs.getSessionRuntime('tab-a', 'box');

    const record = owner.ensureRecord('tab-a', { reason: 'unit-ensure-record' }, { create: true });

    expect(record).toBeTruthy();
    expect(record).toMatchObject({ componentKey: 'box', tabId: 'tab-a', normalized: true });
    expect(record.__runtimeOwner).toMatchObject({ componentKey: 'box', tabId: 'tab-a' });
    expect(runtime.lifecycle.ownedRecord).toBe(record);
  });

  test('runtime owner rejects wrong-tab owned records', () => {
    const owner = lc.createRuntimeOwner('box', {
      createDefaultRecord: tabId => ({ version: 1, componentKey: 'box', tabId, hydrated: true })
    });
    const record = owner.ensureRecord('tab-a', { reason: 'unit-ensure-record' }, { create: true });

    expect(() => owner.setRecord('tab-b', record, {
      strictRuntimeOwner: true,
      reason: 'unit-wrong-tab-record'
    })).toThrow(/record rejected|owner mismatch/);
  });

  test('owned runtime APIs do not fall back to the active tab', () => {
    const owner = lc.createRuntimeOwner('box', {
      createDefaultRecord: tabId => ({ version: 1, componentKey: 'box', tabId, hydrated: true })
    });

    expect(() => owner.ensureRecord(null, {
      strictRuntimeOwner: true,
      reason: 'unit-missing-tab-record'
    }, { create: true })).toThrow(/missing tab id/);
    expect(() => window.Shared.workspaceTabs.getOwnedRuntimeRecord(null, 'box', {
      strictRuntimeOwner: true,
      reason: 'unit-missing-tab-direct-read'
    })).toThrow(/requires explicit tab/);
  });

  test('session and state-model runtime paths do not fall back to the active tab', () => {
    const stateModel = lc.createStateModel('box');

    expect(() => window.Shared.workspaceTabs.getSessionRecord(null, 'box', {
      strictRuntimeOwner: true,
      reason: 'unit-missing-session-record'
    })).toThrow(/requires explicit tab/);
    expect(() => stateModel.set(null, 'runtime', { leaked: true }, {
      strictRuntimeOwner: true,
      reason: 'unit-missing-state-model'
    })).toThrow(/explicit tab id/);
    expect(tabs[0].sharedState).toBeUndefined();
  });

  test('component frame and timeout schedulers require explicit tab identity', () => {
    const component = { __componentKey: 'box', __boundTabId: 'tab-a' };

    expect(() => lc.scheduleComponentFrame(component, 'box', {
      strictRuntimeOwner: true,
      reason: 'unit-frame-missing-tab'
    }, jest.fn())).toThrow(/explicit tab id/);
    expect(() => lc.scheduleComponentTimeout(component, 'box', {
      strictRuntimeOwner: true,
      reason: 'unit-timeout-missing-tab'
    }, jest.fn(), 0)).toThrow(/explicit tab id/);
  });

  test('workspace runtime capture/apply require explicit tab identity', () => {
    const config = {
      type: 'box',
      captureRuntimeState: () => ({ state: { ready: true } }),
      applyRuntimeState: jest.fn()
    };

    expect(() => window.Shared.workspaceTabs.captureRuntimeState(null, 'box', config, {
      strictRuntimeOwner: true,
      reason: 'unit-capture-missing-tab'
    })).toThrow(/requires explicit tab/);
    expect(() => window.Shared.workspaceTabs.applyRuntimeState(null, 'box', config, {
      strictRuntimeOwner: true,
      reason: 'unit-apply-missing-tab'
    })).toThrow(/requires explicit tab/);
    expect(tabs[0].sharedState).toBeUndefined();
  });

  test('tab-scoped schedulers require explicit tab identity by default', () => {
    const scheduler = window.Shared.workspaceTabs.createTabScopedScheduler({
      componentKey: 'box',
      scheduleRaw: jest.fn()
    });

    expect(() => scheduler({
      strictRuntimeOwner: true,
      reason: 'unit-tab-scheduler-missing-tab'
    })).toThrow(/requires explicit tab/);
  });

  test('tab-scoped schedulers may use a component-owned bound tab resolver, not the active tab', () => {
    const scheduleRaw = jest.fn();
    window.Shared.workspaceTabs.ensureActiveSession('tab-b', 'box', { reason: 'unit-tab-b-activate' });
    const scheduler = window.Shared.workspaceTabs.createTabScopedScheduler({
      componentKey: 'box',
      getTabId: () => 'tab-b',
      scheduleRaw
    });

    expect(scheduler({ reason: 'unit-bound-tab-schedule' })).toBe(true);
    expect(scheduleRaw).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 'tab-b',
      reason: 'unit-bound-tab-schedule'
    }));
  });

  test('runtime sanitization preserves indexed sparse metadata and repeated durable references', () => {
    const sharedColumn = { key: 'p', label: 'p value' };
    const metaRow = new Array(5);
    metaRow[4] = { pValueRaw: 0.0277, pValueOperator: '=' };
    const source = {
      firstColumn: sharedColumn,
      secondColumn: sharedColumn,
      cellMetaRows: [metaRow]
    };
    source.self = source;

    const sanitized = lc.sanitizeRuntimeSnapshot(source, {
      componentKey: 'roc',
      tabId: 'tab-a',
      reason: 'unit-indexed-runtime-sanitize'
    });

    expect(sanitized.firstColumn).toEqual(sharedColumn);
    expect(sanitized.secondColumn).toEqual(sharedColumn);
    expect(sanitized.firstColumn).not.toBe(sanitized.secondColumn);
    expect(sanitized.cellMetaRows[0]).toEqual([
      null,
      null,
      null,
      null,
      { pValueRaw: 0.0277, pValueOperator: '=' }
    ]);
    expect(sanitized).not.toHaveProperty('self');
  });

  test('internal state bridge preserves sparse indexed models and repeated aliases', () => {
    const shared = { key: 'comparison', label: 'Comparison' };
    const metaRow = new Array(5);
    metaRow[4] = { pValueRaw: 0.01 };
    const state = {
      first: shared,
      second: shared,
      cellMetaRows: [metaRow]
    };
    const component = { __componentKey: 'survival' };
    const bridge = lc.installInternalStateBridge(component, {
      componentKey: 'survival',
      targets: [{ key: 'state', get: () => state }]
    });

    const snapshot = bridge.capture({ tabId: 'tab-a', reason: 'unit-internal-structure-fidelity' });
    expect(snapshot.targets.state.first).toEqual(shared);
    expect(snapshot.targets.state.second).toEqual(shared);
    expect(snapshot.targets.state.cellMetaRows[0]).toEqual([
      null,
      null,
      null,
      null,
      { pValueRaw: 0.01 }
    ]);

    state.first = { key: 'changed' };
    state.second = { key: 'changed-again' };
    state.cellMetaRows = [[{ pValueRaw: 0.99 }]];
    expect(bridge.apply(snapshot, { tabId: 'tab-a', reason: 'unit-internal-structure-fidelity-apply' })).toBe(true);
    expect(state.first).toEqual(shared);
    expect(state.second).toEqual(shared);
    expect(state.cellMetaRows[0]).toEqual([
      null,
      null,
      null,
      null,
      { pValueRaw: 0.01 }
    ]);
  });

  test('runtime owner strips transient in-flight work from durable snapshots', () => {
    const owner = lc.createRuntimeOwner('box');
    const dirtySnapshot = {
      state: {
        axis: { x: 1, y: 2 },
        drawToken: 17,
        rotationPending: true,
        rotationPendingLogged: true,
        statsComputationPending: true,
        pendingDrawOptions: { reason: 'stale-redraw' },
        nested: {
          keep: 'durable',
          pendingWorker: { id: 1 },
          timeoutId: 42
        }
      },
      stats: { pValue: 0.01 },
      controller: { abort: jest.fn() },
      worker: { terminate: jest.fn() },
      pendingPromise: Promise.resolve('late')
    };

    const stored = owner.capture(dirtySnapshot, { tabId: 'tab-a', reason: 'unit-transient-snapshot' });

    expect(stored.state.axis).toEqual({ x: 1, y: 2 });
    expect(stored.state.nested).toEqual({ keep: 'durable' });
    expect(stored.stats).toEqual({ pValue: 0.01 });
    expect(stored.__runtimeOwner).toMatchObject({ componentKey: 'box', tabId: 'tab-a' });
    expect(JSON.stringify(stored)).not.toMatch(/drawToken|rotationPending|statsComputationPending|pendingDrawOptions|pendingWorker|timeoutId|controller|worker|pendingPromise/);
    expect(dirtySnapshot.state.drawToken).toBe(17);
  });

  test('workspace runtime capture stores only sanitized durable state', () => {
    const tab = tabs[0];
    const config = {
      type: 'box',
      captureRuntimeState: () => ({
        state: {
          selectedColumnIds: ['A', 'B'],
          drawInProgress: true,
          drawToken: 9,
          asyncState: { tabId: 'tab-a' }
        },
        cache: {
          summary: { rows: 2 },
          pendingRequests: ['worker-1']
        },
        pendingDrawOpts: { reason: 'hidden-tab' },
        signal: { aborted: false }
      })
    };

    const captured = window.Shared.workspaceTabs.captureRuntimeState(tab, 'box', config, {
      reason: 'unit-workspace-runtime-capture'
    });
    const stored = window.Shared.workspaceTabs.getLifecycleRuntimeSnapshot(tab, 'box');

    expect(captured).toMatchObject({
      state: { selectedColumnIds: ['A', 'B'] },
      cache: { summary: { rows: 2 } }
    });
    expect(stored).toEqual(captured);
    expect(JSON.stringify(stored)).not.toMatch(/drawInProgress|drawToken|asyncState|pendingRequests|pendingDrawOpts|signal/);
  });
});


describe('component async scheduling contract', () => {
  test('components and main registry do not use the legacy global debounceFrame scheduler', () => {
    const fs = require('fs');
    const path = require('path');
    const roots = [
      path.join(__dirname, '..', 'js', 'components'),
      path.join(__dirname, '..', 'js', 'main')
    ];
    const files = [];
    function collect(dir){
      for(const entry of fs.readdirSync(dir, { withFileTypes: true })){
        const full = path.join(dir, entry.name);
        if(entry.isDirectory()){
          collect(full);
        }else if(entry.isFile() && entry.name.endsWith('.js')){
          files.push(full);
        }
      }
    }
    roots.forEach(collect);
    const offenders = files.filter(file => fs.readFileSync(file, 'utf8').includes('Shared.debounceFrame'));
    expect(offenders.map(file => path.relative(path.join(__dirname, '..'), file))).toEqual([]);
  });

  test('shared controls do not keep mutable unowned fallback state stores', () => {
    const fs = require('fs');
    const path = require('path');
    const checked = [
      path.join(__dirname, '..', 'js', 'shared', 'fontControls.js'),
      path.join(__dirname, '..', 'js', 'shared', 'workspaceToolbar.js')
    ];
    checked.forEach(file => {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/UNOWNED_STATE/);
    });
  });

  test('componentLayout tab-state control sync does not fall back to the active tab', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'shared', 'componentLayout.js'), 'utf8');
    const marker = 'componentLayout.syncTabStateToControlsFor = function syncTabStateToControlsFor';
    const start = source.indexOf(marker);
    const end = start >= 0 ? source.indexOf('  };', start) : -1;
    const block = start >= 0 && end >= 0 ? source.slice(start, end + 4) : '';
    expect(block).toContain('if(!tabId)');
    expect(block).not.toContain('resolveTab?.(null)');
  });


  test('component runtime capture helpers do not persist unowned raw snapshots', () => {
    const fs = require('fs');
    const path = require('path');
    const files = [
      path.join(__dirname, '..', 'js', 'components', 'box.js'),
      path.join(__dirname, '..', 'js', 'components', 'scatter.js'),
      path.join(__dirname, '..', 'js', 'components', 'pca.js'),
      path.join(__dirname, '..', 'js', 'components', 'line.js')
    ];
    files.forEach(file => {
      const source = fs.readFileSync(file, 'utf8');
      const rawRememberFallback = new RegExp('rememberComponentRuntimeSnapshot\\?\\.\\([^\\n]+\\)\\s*\\|\\|\\s*snapshot');
      expect(source).not.toMatch(rawRememberFallback);
      expect(source).toContain('!Shared.componentLifecycle ? snapshot : null');
    });
  });
});

describe('workspaceTabs shared-control state contract', () => {
  let tabs;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    tabs = [
      { id: 'tab-a', type: 'box' },
      { id: 'tab-b', type: 'box' }
    ];
    window.Main = {
      session: {
        workspaceState: { tabs },
        getActiveTab: () => tabs[0]
      },
      components: { registry: {} }
    };
    require('../js/shared/componentLifecycle.js');
    require('../js/shared/workspaceTabs.js');
  });

  test('shared-control state is tab-owned and isolated', () => {
    const stateA = window.Shared.workspaceTabs.ensureSharedControlState('tab-a', 'fontControls', {
      tabId: 'tab-a',
      strictTabOwnership: true,
      reason: 'unit-shared-control-a'
    });
    stateA.scopeModes = { box: 'graph' };

    const stateB = window.Shared.workspaceTabs.ensureSharedControlState('tab-b', 'fontControls', {
      tabId: 'tab-b',
      strictTabOwnership: true,
      reason: 'unit-shared-control-b'
    });

    expect(stateB.scopeModes).toBeUndefined();
    expect(window.Shared.workspaceTabs.getSharedControlState('tab-a', 'fontControls', {
      tabId: 'tab-a',
      strictTabOwnership: true,
      reason: 'unit-shared-control-read-a'
    }).scopeModes.box).toBe('graph');
  });

  test('shared-control APIs do not fall back to the active tab', () => {
    expect(() => window.Shared.workspaceTabs.ensureSharedControlState(null, 'fontControls', {
      strictTabOwnership: true,
      reason: 'unit-shared-control-missing-tab'
    })).toThrow(/requires explicit tab/);
    expect(tabs[0].sharedState).toBeUndefined();
  });

  test('disposeTab invokes registered shared-control disposers before sharedState is removed', () => {
    const disposer = jest.fn();
    window.Shared.workspaceTabs.registerSharedControlDisposer('fontControls', disposer);
    const tab = tabs[0];
    window.Shared.workspaceTabs.ensureSharedControlState(tab, 'fontControls', {
      tabId: 'tab-a',
      strictTabOwnership: true,
      reason: 'unit-shared-control-before-dispose'
    });

    window.Shared.workspaceTabs.disposeTab(tab, { type: 'box', reason: 'unit-shared-control-dispose' });

    expect(disposer).toHaveBeenCalledWith(tab, expect.objectContaining({
      tabId: 'tab-a',
      controlKey: 'fontControls',
      reason: 'unit-shared-control-dispose'
    }));
    expect(tab.sharedState).toBeUndefined();
  });
});

describe('workspaceTabs teardown contract', () => {
  let tabs;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    delete window.Components;
    tabs = [
      { id: 'tab-a', type: 'pca', sharedState: { runtime: {} } }
    ];
    window.Components = {
      box: {},
      pca: {}
    };
    window.Main = {
      session: {
        workspaceState: { tabs },
        getActiveTab: () => tabs[0]
      },
      components: {
        registry: {
          box: { disposeTab: jest.fn() },
          pca: { disposeTab: jest.fn() }
        }
      }
    };
    require('../js/shared/componentLifecycle.js');
    require('../js/shared/workspaceTabs.js');
    lc = window.Shared.componentLifecycle;
  });

  test('disposeTab uses explicit type override before graph replacement', () => {
    const tab = tabs[0];

    window.Shared.workspaceTabs.disposeTab(tab, {
      type: 'box',
      reason: 'graph-selection-reset'
    });

    expect(window.Main.components.registry.box.disposeTab).toHaveBeenCalledTimes(1);
    expect(window.Main.components.registry.pca.disposeTab).not.toHaveBeenCalled();
    expect(tab.sharedState).toBeUndefined();
  });

  test('disposeTab cancels component async scope for the disposed tab', () => {
    const tab = { id: 'tab-a', type: 'box', sharedState: { runtime: {} } };
    tabs[0] = tab;
    const scope = lc.createAsyncScope('box');
    window.Components.box.__asyncScope = scope;
    const token = scope.nextToken({ tabId: 'tab-a', reason: 'worker' });

    expect(scope.isCurrent(token)).toBe(true);

    window.Shared.workspaceTabs.disposeTab(tab, {
      type: 'box',
      reason: 'unit-dispose'
    });

    expect(scope.isCurrent(token)).toBe(false);
  });
});

describe('session teardown contract', () => {
  let session;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    delete window.Components;
    delete window.Main;
    window.Components = { box: {} };
    window.Main = {
      components: {
        registry: {
          box: { disposeTab: jest.fn() }
        }
      }
    };
    require('../js/shared/componentLifecycle.js');
    require('../js/shared/workspaceTabs.js');
    require('../js/main/session.js');
    session = window.Main.session;
    lc = window.Shared.componentLifecycle;
  });

  test('applySessionData disposes existing tab runtime before replacing the tab list', async () => {
    const tab = session.createTab({
      title: 'Box',
      type: 'box',
      payload: { type: 'box', data: [] }
    });
    session.workspaceState.tabs.push(tab);
    session.workspaceState.activeTabId = tab.id;
    const owner = lc.createRuntimeOwner('box');
    owner.capture({ stats: { ready: true } }, { tabId: tab.id, reason: 'unit-capture' });
    window.Shared.workspaceTabs.setOwnedRuntimeRecord(tab, 'box', { hydrated: true });

    expect(tab.sharedState?.runtime?.lifecycle || tab.sharedState?.sessions?.box?.runtime?.lifecycle).toBeTruthy();

    await session.applySessionData({ tabs: [], activeIndex: -1 }, {
      reason: 'unit-session-reload'
    });

    expect(window.Main.components.registry.box.disposeTab).toHaveBeenCalled();
    expect(tab.sharedState).toBeUndefined();
    expect(session.workspaceState.tabs).toHaveLength(1);
    expect(session.workspaceState.tabs[0].isWelcome).toBe(true);
  });


  test('applySessionData rebases valid archive cache signatures after runtime tab-id rehoming', async () => {
    const sourcePayload = { type: 'box', data: [['A'], [1]] };
    const sourceLayout = {
      component: 'box',
      tabId: 'workspace-99',
      graphFrame: { tabId: 'workspace-99', width: 640, height: 480 }
    };
    const sourceCache = {
      __graphitixRenderCache: {
        complete: true,
        type: 'box',
        tabId: 'workspace-99'
      },
      plot: { markup: '<svg data-workspace-tab-id="workspace-99"></svg>' }
    };

    const result = await session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Box',
        type: 'box',
        archiveRuntimeTabId: 'workspace-99',
        payload: sourcePayload,
        layout: sourceLayout,
        archiveRenderCache: sourceCache,
        archiveRenderCacheSignature: session.serializePayloadSignature(sourcePayload),
        archiveRenderCacheLayoutSignature: session.serializePayloadSignature(sourceLayout)
      }]
    }, {
      reason: 'unit-cache-signature-rehome',
      activateTab: jest.fn(() => true)
    });

    const restored = session.workspaceState.tabs.find(tab => tab.id === result.targetTabId);
    expect(restored).toBeTruthy();
    expect(restored.id).not.toBe('workspace-99');
    expect(restored.layoutState.tabId).toBe(restored.id);
    expect(restored.archiveRenderCache.__graphitixRenderCache.tabId).toBe(restored.id);
    expect(restored.archiveRenderCacheSignature).toBe(restored.payloadSignature);
    expect(restored.archiveRenderCacheLayoutSignature).toBe(restored.layoutSignature);
    expect(restored.archiveRenderCacheLayoutSignature).not.toBe(session.serializePayloadSignature(sourceLayout));
  });

  test('applySessionData rejects stale archive cache signature provenance', async () => {
    const sourcePayload = { type: 'box', data: [['A'], [1]] };
    const sourceLayout = { component: 'box', tabId: 'workspace-77', width: 640, height: 480 };

    const result = await session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Box',
        type: 'box',
        archiveRuntimeTabId: 'workspace-77',
        payload: sourcePayload,
        layout: sourceLayout,
        archiveRenderCache: {
          __graphitixRenderCache: { tabId: 'workspace-77', type: 'box', complete: true },
          plot: { markup: '<svg></svg>' }
        },
        archiveRenderCacheSignature: 'stale-payload-signature',
        archiveRenderCacheLayoutSignature: 'stale-layout-signature'
      }]
    }, {
      reason: 'unit-cache-signature-reject',
      activateTab: jest.fn(() => true)
    });

    const restored = session.workspaceState.tabs.find(tab => tab.id === result.targetTabId);
    expect(restored.archiveRenderCache).toBeNull();
    expect(restored.archiveRenderCacheSignature).toBeNull();
    expect(restored.archiveRenderCacheLayoutSignature).toBeNull();
  });

  test('applySessionData rejects an archive cache whose embedded owner differs from the manifest owner', async () => {
    const sourcePayload = { type: 'box', data: [['A'], [1]] };
    const sourceLayout = { component: 'box', tabId: 'workspace-88', width: 640, height: 480 };

    const result = await session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Box',
        type: 'box',
        archiveRuntimeTabId: 'workspace-88',
        payload: sourcePayload,
        layout: sourceLayout,
        archiveRenderCache: {
          __graphitixRenderCache: { tabId: 'workspace-89', type: 'box', complete: true },
          plot: { markup: '<svg></svg>' }
        },
        archiveRenderCacheSignature: session.serializePayloadSignature(sourcePayload),
        archiveRenderCacheLayoutSignature: session.serializePayloadSignature(sourceLayout)
      }]
    }, {
      reason: 'unit-cache-owner-reject',
      activateTab: jest.fn(() => true)
    });

    const restored = session.workspaceState.tabs.find(tab => tab.id === result.targetTabId);
    expect(restored.archiveRenderCache).toBeNull();
    expect(restored.archiveRenderCacheSignature).toBeNull();
    expect(restored.archiveRenderCacheLayoutSignature).toBeNull();
    expect(session.peekArchiveRenderCache(restored, { reason: 'unit-cache-owner-reject-peek' })).toBeNull();
  });

  test('applySessionData rejects an archive cache whose embedded component differs from the tab type', async () => {
    const sourcePayload = { type: 'box', data: [['A'], [1]] };
    const sourceLayout = { component: 'box', tabId: 'workspace-90', width: 640, height: 480 };

    const result = await session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Box',
        type: 'box',
        archiveRuntimeTabId: 'workspace-90',
        payload: sourcePayload,
        layout: sourceLayout,
        archiveRenderCache: {
          __graphitixRenderCache: { tabId: 'workspace-90', type: 'scatter', complete: true },
          plot: { markup: '<svg></svg>' }
        },
        archiveRenderCacheSignature: session.serializePayloadSignature(sourcePayload),
        archiveRenderCacheLayoutSignature: session.serializePayloadSignature(sourceLayout)
      }]
    }, {
      reason: 'unit-cache-component-reject',
      activateTab: jest.fn(() => true)
    });

    const restored = session.workspaceState.tabs.find(tab => tab.id === result.targetTabId);
    expect(restored.archiveRenderCache).toBeNull();
    expect(restored.archiveRenderCacheSignature).toBeNull();
    expect(restored.archiveRenderCacheLayoutSignature).toBeNull();
  });

  test('applySessionData does not resolve until active workspace activation completes', async () => {
    let resolveActivation;
    const activation = new Promise(resolve => {
      resolveActivation = resolve;
    });
    const activateTab = jest.fn(() => activation);
    let settled = false;

    const restorePromise = session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Box',
        type: 'box',
        payload: { type: 'box', data: [['A'], [1]] },
        layout: null
      }]
    }, {
      reason: 'unit-awaited-restore',
      activateTab
    });
    restorePromise.finally(() => { settled = true; });

    await Promise.resolve();
    expect(activateTab).toHaveBeenCalledTimes(1);
    expect(activateTab).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      skipPersist: true,
      awaitReadyForRestore: true,
      reason: 'unit-awaited-restore'
    }));
    expect(settled).toBe(false);

    resolveActivation(true);
    const result = await restorePromise;
    expect(result.targetTabId).toBeTruthy();
    expect(settled).toBe(true);
  });

  test('applySessionData hydrates only the saved active tab', async () => {
    const activateTab = jest.fn(() => true);

    const result = await session.applySessionData({
      activeIndex: 1,
      tabs: [
        { title: 'Inactive Box', type: 'box', payload: { type: 'box', data: [['A'], [1]] } },
        { title: 'Active Box', type: 'box', payload: { type: 'box', data: [['B'], [2]] } },
        { title: 'Other Box', type: 'box', payload: { type: 'box', data: [['C'], [3]] } }
      ]
    }, {
      reason: 'unit-lazy-restore',
      activateTab
    });

    expect(activateTab).toHaveBeenCalledTimes(1);
    expect(activateTab).toHaveBeenCalledWith(result.targetTabId, expect.objectContaining({
      awaitReadyForRestore: true,
      allowDuringDocumentOperation: true
    }));
    const graphTabs = session.workspaceState.tabs.filter(tab => !tab.isWelcome);
    expect(result.targetTabId).toBe(graphTabs[1].id);
    expect(graphTabs[0].loadedFromArchive).toBe(true);
    expect(graphTabs[2].loadedFromArchive).toBe(true);
  });

  test('applySessionData preserves two distinct archived tabs per component while hydrating only the saved active tab', async () => {
    const componentTypes = ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'];
    const archivedTabs = componentTypes.flatMap((type, componentIndex) => [0, 1].map(variant => ({
      title: `${type}-${variant + 1}`,
      type,
      payload: {
        type,
        data: [[`${type}-label`, `${type}-value`], [`row-${variant + 1}`, componentIndex * 10 + variant]],
        stats: {
          enabled: true,
          test: variant === 0 ? 'parametric' : 'nonparametric',
          alpha: variant === 0 ? 0.05 : 0.01
        },
        config: { variant: `${type}-${variant + 1}` }
      },
      layout: { graph: { width: 420 + variant, height: 360 + componentIndex } }
    })));
    const activeIndex = archivedTabs.findIndex(tab => tab.type === 'box' && tab.payload.stats.test === 'nonparametric');
    const activateTab = jest.fn(() => true);

    const result = await session.applySessionData({ activeIndex, tabs: archivedTabs }, {
      reason: 'unit-dual-tab-per-component-recovery',
      activateTab
    });

    expect(activateTab).toHaveBeenCalledTimes(1);
    const graphTabs = session.workspaceState.tabs.filter(tab => !tab.isWelcome);
    expect(graphTabs).toHaveLength(archivedTabs.length);
    expect(result.targetTabId).toBe(graphTabs[activeIndex].id);
    graphTabs.forEach((tab, index) => {
      expect(tab.type).toBe(archivedTabs[index].type);
      expect(tab.payload).toEqual(archivedTabs[index].payload);
      expect(tab.layoutState).toEqual(archivedTabs[index].layout);
      expect(tab.loadedFromArchive).toBe(true);
      expect(tab.payloadDirty).toBe(false);
    });
    componentTypes.forEach(type => {
      const variants = graphTabs.filter(tab => tab.type === type);
      expect(variants).toHaveLength(2);
      expect(variants.map(tab => tab.payload.stats.test)).toEqual(['parametric', 'nonparametric']);
      expect(variants[0].payload.data).not.toEqual(variants[1].payload.data);
    });
  });

  test('applySessionData rolls back tabs and file metadata when restored activation fails', async () => {
    const previousTab = session.createTab({
      title: 'Current Box',
      type: 'box',
      payload: { type: 'box', data: [['Current'], [7]] }
    });
    session.workspaceState.tabs.push(previousTab);
    session.workspaceState.activeTabId = previousTab.id;
    session.workspaceState.sessionFileHandle = { name: 'current-handle' };
    session.workspaceState.sessionFileName = 'current.graph';
    session.workspaceState.sessionFilePath = 'C:/current.graph';
    session.workspaceState.sessionFileScope = 'workspace';
    window.Shared.workspaceTabs.setOwnedRuntimeRecord(previousTab, 'box', { hydrated: true });

    const activateTab = jest.fn((tabId, meta) => {
      if (meta.reason === 'unit-atomic-rollback') {
        return Promise.reject(new Error('restore activation failed'));
      }
      return true;
    });

    await expect(session.applySessionData({
      activeIndex: 0,
      tabs: [{
        title: 'Incoming Box',
        type: 'box',
        payload: { type: 'box', data: [['Incoming'], [9]] }
      }]
    }, {
      reason: 'unit-atomic-rollback',
      fileHandle: { name: 'incoming-handle' },
      fileName: 'incoming.graph',
      filePath: 'C:/incoming.graph',
      fileScope: 'workspace',
      activateTab,
      renderTabs: jest.fn()
    })).rejects.toThrow('restore activation failed');

    expect(session.workspaceState.tabs).toEqual([previousTab]);
    expect(session.workspaceState.activeTabId).toBe(previousTab.id);
    expect(session.workspaceState.sessionFileHandle).toEqual({ name: 'current-handle' });
    expect(session.workspaceState.sessionFileName).toBe('current.graph');
    expect(session.workspaceState.sessionFilePath).toBe('C:/current.graph');
    expect(previousTab.sharedState).toBeTruthy();
    expect(activateTab).toHaveBeenLastCalledWith(previousTab.id, expect.objectContaining({
      allowDuringDocumentOperation: true,
      reason: 'unit-atomic-rollback-rollback'
    }));
  });

});

describe('componentLifecycle — waitForAnimationFrames', () => {
  beforeEach(loadFresh);

  test('count=0 resolves immediately with true', async () => {
    expect(await lc.waitForAnimationFrames(0)).toBe(true);
  });

  test('count=1 resolves with true', async () => {
    expect(await lc.waitForAnimationFrames(1)).toBe(true);
  });

  test('count=3 resolves with true', async () => {
    expect(await lc.waitForAnimationFrames(3)).toBe(true);
  });

  test('non-numeric count defaults to 0 frames (resolves true)', async () => {
    expect(await lc.waitForAnimationFrames('abc')).toBe(true);
  });
});

describe('componentLifecycle — draw scheduling helpers', () => {
  beforeEach(loadFresh);

  test('createStructuralDrawOptions requests a full user redraw without mutating input', () => {
    const source = { tabId: 'tab-a', silentOverlay: true };
    const result = lc.createStructuralDrawOptions('graph-type-change', source);

    expect(result).toEqual(expect.objectContaining({
      tabId: 'tab-a',
      reason: 'graph-type-change',
      structural: true,
      forceOverlay: true,
      viewOnly: false,
      silentOverlay: false,
      userInitiated: true
    }));
    expect(source).toEqual({ tabId: 'tab-a', silentOverlay: true });
    expect(lc.createStructuralDrawOptions('view-mode-change', { viewOnly: true }).viewOnly).toBe(true);
  });

  test('mergeDrawOptions preserves resize finalize canvas recompute', () => {
    const merged = lc.mergeDrawOptions(
      { viewOnly: true, reason: 'resize', resizePhase: 'move' },
      { viewOnly: true, reason: 'resize', resizePhase: 'end', forceCanvasRecompute: true }
    );

    expect(merged.viewOnly).toBe(true);
    expect(merged.reason).toBe('resize');
    expect(merged.resizePhase).toBe('end');
    expect(merged.forceCanvasRecompute).toBe(true);
  });

  test('resolveDrawCooldownMs does not throttle live resize frames', () => {
    expect(lc.resolveDrawCooldownMs(
      { viewOnly: true, reason: 'resize', resizePhase: 'start' },
      { pointCount: 100000, pointThreshold: 1200, largeViewMs: 50, defaultMs: 80, resizeLiveMs: 0 }
    )).toBe(0);
    expect(lc.resolveDrawCooldownMs(
      { viewOnly: true, reason: 'resize', resizePhase: 'move' },
      { pointCount: 100000, pointThreshold: 1200, largeViewMs: 50, defaultMs: 80, resizeLiveMs: 0 }
    )).toBe(0);
    expect(lc.resolveDrawCooldownMs(
      { viewOnly: true, reason: 'resize', resizePhase: 'end' },
      { pointCount: 100000, pointThreshold: 1200, largeViewMs: 50, defaultMs: 80 }
    )).toBe(50);
  });

  test('scheduleDrawWithCooldown coalesces pending options through session runtime callbacks', () => {
    let runtime = { lastDrawAt: lc.nowMs(), pendingOptions: null, cooldownTimer: null };
    let scheduledCallback = null;
    const run = jest.fn();
    const updateRuntime = mutator => {
      mutator(runtime);
    };
    const scheduled = lc.scheduleDrawWithCooldown({
      options: { viewOnly: true, reason: 'resize', resizePhase: 'end' },
      runtime,
      cooldownMs: 50,
      updateRuntime,
      getRuntime: () => runtime,
      scheduleTimeout: (_label, callback) => {
        scheduledCallback = callback;
        return 'timer-1';
      },
      run
    });

    expect(scheduled).toBe(true);
    expect(runtime.cooldownTimer).toBe('timer-1');
    expect(runtime.pendingOptions.reason).toBe('resize');
    scheduledCallback();
    expect(runtime.cooldownTimer).toBeNull();
    expect(runtime.pendingOptions).toBeNull();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ resizePhase: 'end' }));
  });

  test('scheduleDrawWithCooldown runs immediately when timeout scheduling fails', () => {
    let runtime = { lastDrawAt: lc.nowMs(), pendingOptions: null, cooldownTimer: null };
    const run = jest.fn();
    const updateRuntime = mutator => {
      mutator(runtime);
    };
    const scheduled = lc.scheduleDrawWithCooldown({
      options: { viewOnly: true, reason: 'resize', resizePhase: 'end' },
      runtime,
      cooldownMs: 50,
      updateRuntime,
      getRuntime: () => runtime,
      scheduleTimeout: () => null,
      run
    });

    expect(scheduled).toBe(true);
    expect(runtime.cooldownTimer).toBeNull();
    expect(runtime.pendingOptions).toBeNull();
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ resizePhase: 'end' }));
  });

  test('scheduleDrawWithCooldown treats numeric zero as an existing timer handle', () => {
    let runtime = { lastDrawAt: lc.nowMs(), pendingOptions: null, cooldownTimer: 0 };
    const run = jest.fn();
    const scheduleTimeout = jest.fn();
    const updateRuntime = mutator => {
      mutator(runtime);
    };
    const scheduled = lc.scheduleDrawWithCooldown({
      options: { viewOnly: true, reason: 'resize', resizePhase: 'end' },
      runtime,
      cooldownMs: 50,
      updateRuntime,
      getRuntime: () => runtime,
      scheduleTimeout,
      run
    });

    expect(scheduled).toBe(true);
    expect(runtime.cooldownTimer).toBe(0);
    expect(scheduleTimeout).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  test('runDrawWithOverlayPaintGate treats numeric zero as a valid frame handle', () => {
    const run = jest.fn();
    const handled = lc.runDrawWithOverlayPaintGate({
      componentKey: 'test',
      reason: 'manual-render',
      overlayController: { isActive: () => true },
      delayForOverlay: true,
      scheduleFrame: () => 0,
      run
    });

    expect(handled).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  test('runDrawWithOverlayPaintGate uses owner-scoped frame when overlay is active', () => {
    const run = jest.fn();
    const frame = jest.fn(callback => {
      callback();
      return 'raf-1';
    });
    const handled = lc.runDrawWithOverlayPaintGate({
      componentKey: 'test',
      reason: 'manual-render',
      overlayController: { isActive: () => true },
      delayForOverlay: true,
      scheduleFrame: frame,
      run
    });

    expect(handled).toBe(true);
    expect(frame).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
  });

  test('runDrawWithOverlayPaintGate exposes stale owner-frame recovery', () => {
    const run = jest.fn();
    const onFrameStale = jest.fn();
    const scheduleSpy = jest.spyOn(lc, 'scheduleComponentFrame').mockImplementation(
      (_component, _componentKey, _meta, _callback, stale) => {
        stale();
        return 'raf-stale';
      }
    );
    const handled = lc.runDrawWithOverlayPaintGate({
      component: {},
      componentKey: 'heatmap',
      tabId: 'workspace-3',
      reason: 'paste',
      overlayController: { isActive: () => true },
      delayForOverlay: true,
      onFrameStale,
      run
    });

    expect(handled).toBe(true);
    expect(onFrameStale).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
    scheduleSpy.mockRestore();
  });

});


describe('component runtime ownership adapter cleanup', () => {
  test('scatter selection state is owned runtime, not module-level Maps', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', 'scatter.js'), 'utf8');

    expect(source).not.toMatch(/scatterRowSelectionsByTab\s*=\s*new\s+Map/);
    expect(source).not.toMatch(/scatterThresholdSelectionsByTab\s*=\s*new\s+Map/);
    expect(source).toContain('selection: createDefaultScatterOwnedSelectionState()');
    expect(source).toContain('function writeScatterOwnedSelectionState');
    expect(source).toContain('writeScatterSelectedRowsForTab');
    expect(source).toContain('writeScatterThresholdRowsForTab');
  });

  test('components do not bypass createRuntimeOwner for owned-runtime storage', () => {
    const fs = require('fs');
    const path = require('path');
    const componentFiles = ['box.js', 'scatter.js', 'pca.js', 'line.js'];
    componentFiles.forEach(file => {
      const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'components', file), 'utf8');
      expect(source).not.toMatch(/workspaceTabs\?\.(?:getOwnedRuntimeRecord|setOwnedRuntimeRecord|clearOwnedRuntimeRecord)/);
      expect(source).not.toMatch(/Shared\.workspaceTabs\?\.(?:getOwnedRuntimeRecord|setOwnedRuntimeRecord|clearOwnedRuntimeRecord)/);
      expect(source).toMatch(/createRuntimeOwner\?\.\(/);
    });
  });
});

describe('componentLifecycle — draw option sanitation', () => {
  beforeEach(loadFresh);

  test('removes live objects and preserves plain owner-scoped metadata', () => {
    const event = new Event('click');
    const node = document.createElement('div');
    const session = { tabId: 'tab-a' };
    const result = lc.sanitizeComponentDrawOptions('venn', {
      reason: 'analysis-update',
      force: true,
      nested: { value: 3, node },
      event,
      session,
      callback: () => {}
    }, {
      tabId: 'tab-a',
      sessionGeneration: 7
    });

    expect(result).toEqual({
      reason: 'analysis-update',
      force: true,
      nested: { value: 3 },
      tabId: 'tab-a',
      sessionGeneration: 7
    });
  });

  test('drops circular and non-plain values without losing valid flags', () => {
    const circular = { keep: true };
    circular.self = circular;
    const result = lc.sanitizeComponentDrawOptions('scatter', {
      reason: 'style-change',
      viewOnly: true,
      circular,
      controller: new AbortController()
    }, { tabId: 'tab-b' });

    expect(result).toEqual({
      reason: 'style-change',
      viewOnly: true,
      circular: { keep: true },
      tabId: 'tab-b'
    });
  });

  test('optional owner draw queues preserve absence instead of manufacturing phantom work', () => {
    expect(lc.sanitizeOptionalComponentDrawOptions('heatmap', null, { tabId: 'tab-a' })).toBeNull();
    expect(lc.sanitizeOptionalComponentDrawOptions('heatmap', {}, { tabId: 'tab-a' })).toBeNull();
    expect(lc.sanitizeOptionalComponentDrawOptions('heatmap', { viewOnly: true }, { tabId: 'tab-a' })).toEqual({
      viewOnly: true,
      tabId: 'tab-a',
      reason: 'heatmap-draw'
    });
  });
});

describe('componentLifecycle — passive activation initialization', () => {
  beforeEach(loadFresh);

  test('a passive rebind cannot mark an uninitialized component ready without full init', () => {
    const component = { ready: false };
    const ensureBindings = jest.fn(() => {
      component.ready = true;
      return true;
    });
    const init = jest.fn(() => {
      component.ready = true;
    });
    const activate = lc.bindTabActivation({
      component,
      componentKey: 'venn',
      resolveRoot: () => document.body,
      ensureBindings,
      init
    });

    expect(activate({ id: 'workspace-3' }, {
      prepareRuntimeTarget: true,
      passiveControls: true,
      reason: 'recovery-restore:prepare-runtime-target'
    })).toBe(true);

    expect(ensureBindings).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith(expect.objectContaining({
      root: document.body,
      tabId: 'workspace-3',
      reason: 'recovery-restore:prepare-runtime-target'
    }));
    expect(component.ready).toBe(true);
  });

  test('an already initialized component may use a passive rebind without reinitializing', () => {
    const component = { ready: true };
    const ensureBindings = jest.fn(() => true);
    const init = jest.fn();
    const activate = lc.bindTabActivation({
      component,
      componentKey: 'pca',
      resolveRoot: () => document.body,
      ensureBindings,
      init
    });

    expect(activate({ id: 'workspace-4' }, {
      prepareRuntimeTarget: true,
      passiveControls: true,
      reason: 'tab-switch:prepare-runtime-target'
    })).toBe(true);

    expect(ensureBindings).toHaveBeenCalledTimes(1);
    expect(init).not.toHaveBeenCalled();
  });
});

describe('componentLifecycle — primary graph publication detection', () => {
  beforeEach(loadFresh);

  function markRenderable(element, width = 320, height = 240) {
    element.getBoundingClientRect = jest.fn(() => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height
    }));
    return element;
  }

  test('scoped validation ignores auxiliary SVG content outside the primary graph surface', () => {
    const root = markRenderable(document.createElement('div'));
    const primary = markRenderable(document.createElement('div'));
    primary.id = 'primaryPlot';
    const primarySvg = markRenderable(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    primary.appendChild(primarySvg);

    const auxiliary = markRenderable(document.createElement('div'));
    const auxiliarySvg = markRenderable(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const auxiliaryPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    auxiliaryPath.setAttribute('d', 'M0 0 L20 20');
    auxiliarySvg.appendChild(auxiliaryPath);
    auxiliary.appendChild(auxiliarySvg);

    root.append(primary, auxiliary);
    document.body.appendChild(root);

    expect(lc.hasRenderableGraphContent(root)).toBe(true);
    expect(lc.hasRenderableGraphContent(root, {
      selectors: ['#primaryPlot'],
      allowText: false
    })).toBe(false);

    const primaryCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    primaryCircle.setAttribute('r', '5');
    primarySvg.appendChild(primaryCircle);

    expect(lc.hasRenderableGraphContent(root, {
      selectors: ['#primaryPlot'],
      allowText: false
    })).toBe(true);

    root.remove();
  });

  test('content selectors reject axes until a component data mark is published', () => {
    const root = markRenderable(document.createElement('div'));
    const plot = markRenderable(document.createElement('div'));
    plot.id = 'rocPlot';
    const svg = markRenderable(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const axis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    axis.setAttribute('x1', '0');
    axis.setAttribute('y1', '10');
    axis.setAttribute('x2', '100');
    axis.setAttribute('y2', '10');
    svg.appendChild(axis);
    plot.appendChild(svg);
    root.appendChild(plot);
    document.body.appendChild(root);

    const options = {
      selectors: ['#rocPlot'],
      contentSelectors: ['path[data-series]'],
      allowText: false
    };
    expect(lc.hasRenderableGraphContent(root, options)).toBe(false);

    const curve = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    curve.setAttribute('data-series', 'Example');
    curve.setAttribute('d', 'M0 10 L100 0');
    svg.appendChild(curve);
    expect(lc.hasRenderableGraphContent(root, options)).toBe(true);

    root.remove();
  });

  test('a selected SVG root is validated directly instead of only through descendants', () => {
    const root = markRenderable(document.createElement('div'));
    const surfaceSvg = markRenderable(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    surfaceSvg.id = 'surfaceSvg';
    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', '0,0 20,0 10,15');
    surfaceSvg.appendChild(polygon);
    root.appendChild(surfaceSvg);
    document.body.appendChild(root);

    expect(lc.hasRenderableGraphContent(root, {
      selectors: ['#surfaceSvg'],
      allowText: false
    })).toBe(true);

    root.remove();
  });

  test('text-only placeholders do not publish a primary graph when text is excluded', () => {
    const root = markRenderable(document.createElement('div'));
    const plot = markRenderable(document.createElement('div'));
    plot.id = 'plot';
    const svg = markRenderable(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.textContent = 'Preparing graph';
    svg.appendChild(text);
    plot.appendChild(svg);
    root.appendChild(plot);
    document.body.appendChild(root);

    expect(lc.hasRenderableGraphContent(root, { selectors: ['#plot'] })).toBe(true);
    expect(lc.hasRenderableGraphContent(root, {
      selectors: ['#plot'],
      allowText: false
    })).toBe(false);

    root.remove();
  });
});
