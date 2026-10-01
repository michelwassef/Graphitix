'use strict';
const { loadFreshLifecycle } = require('../../test-support/componentLifecycleTestSetup');
let lc;
const loadFresh = () => { lc = loadFreshLifecycle(); };

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
