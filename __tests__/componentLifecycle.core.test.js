// Unit tests for js/shared/componentLifecycle.js
// Tests pure/stateless helpers directly and stateful APIs via fresh module loads.

let lc;

function loadFresh() {
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

  test('applySessionData disposes existing tab runtime before replacing the tab list', () => {
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

    session.applySessionData({ tabs: [], activeIndex: -1 }, {
      reason: 'unit-session-reload'
    });

    expect(window.Main.components.registry.box.disposeTab).toHaveBeenCalled();
    expect(tab.sharedState).toBeUndefined();
    expect(session.workspaceState.tabs).toHaveLength(1);
    expect(session.workspaceState.tabs[0].isWelcome).toBe(true);
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
