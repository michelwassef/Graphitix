'use strict';
const { loadFreshLifecycle } = require('../../test-support/componentLifecycleTestSetup');
let lc;
const loadFresh = () => { lc = loadFreshLifecycle(); };
const path = require('node:path');
const { findNodes, memberPath, readScriptAst } = require('../../test-support/sourceAst');

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
    require('../../js/shared/componentLifecycle.js');
    lc = window.Shared.componentLifecycle;
  });

  afterEach(() => {
    window.Shared?.componentLifecycle?.uninstallGraphEditIntentListener?.();
  });

  test('every graph component declares the render-cache interaction contract', () => {
    const components = ['box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie', 'venn'];
    components.forEach(componentKey => {
      const ast = readScriptAst(path.join(__dirname, '..', '..', 'js', 'components', `${componentKey}.js`));
      const declarations = findNodes(ast, node => node.type === 'AssignmentExpression'
        && memberPath(node.left) === `${componentKey}.rehydrateGraphInteractions`
        && node.right?.type === 'FunctionExpression'
        && node.right.id?.name === 'rehydrateGraphInteractions');
      expect(declarations).toHaveLength(1);
    });
  });

  test('every component that declares serialized axis or inline-edit interactions rehydrates them explicitly', () => {
    const axisComponents = ['box', 'scatter', 'pca', 'line', 'roc', 'survival', 'hist', 'pie', 'venn'];
    const inlineComponents = ['box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie', 'venn'];

    axisComponents.forEach(componentKey => {
      const ast = readScriptAst(path.join(__dirname, '..', '..', 'js', 'components', `${componentKey}.js`));
      expect(findNodes(ast, node => node.type === 'CallExpression'
        && memberPath(node.callee)?.endsWith('.rehydrateAxisElements'))).not.toHaveLength(0);
    });
    inlineComponents.forEach(componentKey => {
      const ast = readScriptAst(path.join(__dirname, '..', '..', 'js', 'components', `${componentKey}.js`));
      expect(findNodes(ast, node => node.type === 'CallExpression'
        && /^rehydrate[A-Za-z0-9]*InlineTextInteractions$/.test(memberPath(node.callee) || ''))).not.toHaveLength(0);
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
    require('../../js/shared/componentLifecycle.js');
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

  test('trusted axis-control click stays outside the generic restored-graph edit path', () => {
    document.body.innerHTML = `
      <div data-workspace-component="box" data-workspace-tab-id="tab-a">
        <div class="svgbox">
          <svg id="pieSvg"><line id="axis" data-axis-control="1" x1="0" y1="10" x2="100" y2="10"></line></svg>
        </div>
      </div>
    `;
    const target = document.getElementById('axis');
    const handler = jest.fn();
    target.addEventListener('click', handler);
    const event = new window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10
    });
    event.__graphitixUserTrusted = true;

    target.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
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
