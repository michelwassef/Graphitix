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
    expect(lc.isRestoreTransactionActive('box')).toBe(false);
  });

  test('active during beginRestoreTransaction, false after end', () => {
    const end = lc.beginRestoreTransaction('box');
    expect(lc.isRestoreTransactionActive('box')).toBe(true);
    end();
    expect(lc.isRestoreTransactionActive('box')).toBe(false);
  });

  test('end() is idempotent — second call returns false', () => {
    const end = lc.beginRestoreTransaction('scatter');
    expect(end()).toBe(true);
    expect(end()).toBe(false);
    expect(lc.isRestoreTransactionActive('scatter')).toBe(false);
  });

  test('withRestoreTransaction executes fn synchronously', () => {
    let called = false;
    lc.withRestoreTransaction('box', {}, () => { called = true; });
    expect(called).toBe(true);
  });

  test('withRestoreTransaction ends transaction after sync fn', () => {
    let activeInside = false;
    lc.withRestoreTransaction('box', {}, () => {
      activeInside = lc.isRestoreTransactionActive('box');
    });
    expect(activeInside).toBe(true);
    expect(lc.isRestoreTransactionActive('box')).toBe(false);
  });

  test('withRestoreTransaction rethrows error and still ends', () => {
    expect(() => {
      lc.withRestoreTransaction('box', {}, () => { throw new Error('boom'); });
    }).toThrow('boom');
    expect(lc.isRestoreTransactionActive('box')).toBe(false);
  });

  test('nested transactions: both active, end independently', () => {
    const end1 = lc.beginRestoreTransaction('scatter');
    const end2 = lc.beginRestoreTransaction('box');
    expect(lc.isRestoreTransactionActive('scatter')).toBe(true);
    expect(lc.isRestoreTransactionActive('box')).toBe(true);
    end2();
    expect(lc.isRestoreTransactionActive('box')).toBe(false);
    expect(lc.isRestoreTransactionActive('scatter')).toBe(true);
    end1();
    expect(lc.isRestoreTransactionActive('scatter')).toBe(false);
  });

  test('getRestoreTransaction returns token with correct componentKey', () => {
    const end = lc.beginRestoreTransaction('pie', { reason: 'test-restore' });
    const token = lc.getRestoreTransaction('pie');
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
    const end = lc.beginRestoreTransaction('box', { suppressDraw: true });
    expect(lc.shouldSuppressDraw('box', {})).toBe(true);
    end();
  });

  test('after transaction ends → false', () => {
    const end = lc.beginRestoreTransaction('box', { suppressDraw: true });
    end();
    expect(lc.shouldSuppressDraw('box', {})).toBe(false);
  });

  test('forceDraw overrides active transaction suppression', () => {
    const end = lc.beginRestoreTransaction('box', { suppressDraw: true });
    expect(lc.shouldSuppressDraw('box', { forceDraw: true })).toBe(false);
    end();
  });

  test('userInitiated overrides active transaction suppression', () => {
    const end = lc.beginRestoreTransaction('box', { suppressDraw: true });
    expect(lc.shouldSuppressDraw('box', { userInitiated: true })).toBe(false);
    end();
  });

  test('user- reason overrides suppression', () => {
    const end = lc.beginRestoreTransaction('box', { suppressDraw: true });
    expect(lc.shouldSuppressDraw('box', { reason: 'user-click' })).toBe(false);
    end();
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
    const meta = scope.getMeta({});
    expect(scope.isCurrent(meta)).toBe(true);
  });

  test('nextToken increments generation; old token becomes stale', () => {
    const scope = lc.createAsyncScope('box');
    const old = scope.getMeta({});
    scope.nextToken({});
    expect(scope.isCurrent(old)).toBe(false);
  });

  test('nextToken result is current', () => {
    const scope = lc.createAsyncScope('box');
    const token = scope.nextToken({});
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
    const m1 = s1.getMeta({});
    s2.nextToken({});
    expect(s1.isCurrent(m1)).toBe(true);
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
