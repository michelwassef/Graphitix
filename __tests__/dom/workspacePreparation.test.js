'use strict';

describe('owner-scoped background workspace preparation', () => {
  let api;
  let context;
  let a;
  let b;
  const flush = async () => { await jest.advanceTimersByTimeAsync(1000); };
  const tab = (id, type = 'scatter') => ({ id, type, loadedFromArchive: true,
    payload: { type, data: [['Sample', 'X', 'Y'], [id, 1, 2]], config: { title: id } },
    payloadSignature: id, layoutSignature: 'layout', payloadVersion: 0, layoutVersion: 0,
    renderCommitVersion: 0, archiveRenderCache: { owner: id } });

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    window.requestIdleCallback = callback => window.setTimeout(() => callback({ timeRemaining: () => 8 }), 1);
    window.cancelIdleCallback = id => window.clearTimeout(id);
    a = tab('a');
    b = tab('b');
    window.Shared = { componentLifecycle: { emitLifecycleEvent: jest.fn() } };
    window.Main = { components: { loadComponentBundle: jest.fn(async () => ({})), ensureComponent: jest.fn() } };
    context = { workspaceState: { tabs: [a, b], activeTabId: a.id, loadedWorkspaces: { a: { tabId: 'a' } } },
      session: { peekArchiveRenderCache: jest.fn(target => ({ tabId: target.id, cache: { owner: target.id } })) } };
    require('../../js/main/workspacePreparation.js');
    api = window.Main.workspacePreparation;
  });

  afterEach(() => {
    api.cancel();
    delete window.requestIdleCallback;
    delete window.cancelIdleCallback;
    jest.useRealTimers();
  });

  test('opens first, then prepares independent copies without activating or binding a tab', async () => {
    window.Main.workspacePresentation = { reset: jest.fn(), disposeTab: jest.fn() };
    api.start(context);
    expect(window.Main.components.loadComponentBundle).not.toHaveBeenCalled();
    await flush();
    expect(api.getState(a)).toBe('unprepared');
    expect(api.getState(b)).toBe('ready');
    expect(context.workspaceState.activeTabId).toBe('a');
    expect(context.workspaceState.loadedWorkspaces).toEqual({ a: { tabId: 'a' } });
    expect(window.Main.components.ensureComponent).not.toHaveBeenCalled();
    const prepared = api.take(b);
    expect(window.Main.workspacePresentation.disposeTab).not.toHaveBeenCalled();
    expect(prepared.payload).toEqual(b.payload);
    expect(prepared.payload.data).not.toBe(b.payload.data);
    prepared.payload.data[1][1] = 99;
    expect(b.payload.data[1][1]).toBe(1);
    expect(prepared.renderCache.tabId).toBe('b');
    expect(api.take(b)).toBeNull();
  });

  test.each(['payloadSignature', 'layoutSignature', 'payloadVersion', 'layoutVersion', 'renderCommitVersion', 'payload', 'archiveRenderCache'])(
    'rejects preparation after %s changes', async field => {
      api.start(context);
      await flush();
      b[field] = typeof b[field] === 'number' ? b[field] + 1 : (typeof b[field] === 'object' ? {} : 'changed');
      expect(api.take(b)).toBeNull();
    });

  test('a replacement document with the same tab id cannot consume prior work', async () => {
    let complete;
    window.Main.components.loadComponentBundle.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    api.start(context);
    await jest.advanceTimersByTimeAsync(2);
    const replacement = tab('b');
    context.workspaceState.tabs = [a, replacement];
    api.disposeTab(b);
    complete({});
    await Promise.resolve();
    expect(api.take(replacement)).toBeNull();
    expect(context.session.peekArchiveRenderCache).not.toHaveBeenCalled();
  });

  test('closing during preparation prevents its async completion from publishing', async () => {
    let complete;
    window.Main.components.loadComponentBundle.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    api.start(context);
    await jest.advanceTimersByTimeAsync(2);
    context.workspaceState.tabs = [a];
    api.disposeTab(b);
    complete({});
    await flush();
    expect(api.getState(b)).toBe('unprepared');
    expect(context.session.peekArchiveRenderCache).not.toHaveBeenCalled();
  });

  test('selecting an in-progress tab cancels its sliced copy without delaying activation', async () => {
    b.payload.data = Array.from({ length: 4000 }, (_, i) => [i, i + 1]);
    api.start(context);
    await jest.advanceTimersByTimeAsync(2);
    context.workspaceState.activeTabId = b.id;
    expect(api.take(b)).toBeNull();
    await flush();
    expect(context.session.peekArchiveRenderCache).not.toHaveBeenCalled();
    expect(api.getState(b)).toBe('unprepared');
  });

  test('retains at most four prepared tabs and releases capacity on consumption', async () => {
    const tabs = Array.from({ length: 7 }, (_, i) => tab(String(i)));
    context.workspaceState.tabs.push(...tabs);
    api.start(context);
    await flush();
    expect([b, ...tabs].filter(t => api.getState(t) === 'ready')).toHaveLength(4);
    context.workspaceState.activeTabId = b.id;
    api.take(b);
    context.workspaceState.loadedWorkspaces[b.id] = { tabId: b.id };
    await flush();
    expect(tabs.filter(t => api.getState(t) === 'ready')).toHaveLength(4);
  });

  test('new document cancellation drops prepared data and pending callbacks', async () => {
    api.start(context);
    await flush();
    api.cancel();
    expect(api.take(b)).toBeNull();
    await flush();
    expect(jest.getTimerCount()).toBe(0);
  });

  test('an oversized owner does not exhaust memory or prevent smaller owners from preparing', async () => {
    b.payload.config.largeText = 'x'.repeat(9 * 1024 * 1024);
    const small = tab('small');
    context.workspaceState.tabs.push(small);
    api.start(context);
    await flush();
    expect(api.getState(b)).toBe('budget');
    expect(api.take(b)).toBeNull();
    expect(api.getState(small)).toBe('ready');
    expect(context.session.peekArchiveRenderCache).not.toHaveBeenCalledWith(b, expect.anything());
  });

});
