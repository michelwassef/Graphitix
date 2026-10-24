'use strict';

describe('workspace restoration presentation', () => {
  let api;
  let a;
  let b;
  let state;
  const tab = (id, type = 'scatter') => ({ id, type, title: id, loadedFromArchive: true,
    payload: { data: [['Sample', 'X', 'Y'], [id, 1, 2]] } });

  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();
    a = tab('a');
    b = tab('b');
    state = { tabs: [a, b], activeTabId: a.id, loadedWorkspaces: { a: { tabId: a.id } } };
    window.Main = { session: { workspaceState: state }, tabs: { renderTabs: jest.fn() } };
    document.body.innerHTML = '<div id="appShell"><main id="workspaceMain"><section id="workspacePages">'
      + '<section id="old" class="workspace-page"><input id="cell" value="saved"><svg><text>A graph</text></svg>'
      + '<div id="scroll"><span>Visible rows</span></div><button onclick="window.leaked=true">Edit</button></section>'
      + '<section id="next" class="workspace-page" hidden></section></section></main></div>';
    require('../../js/main/workspacePresentation.js');
    api = window.Main.workspacePresentation;
  });

  afterEach(() => { api.reset(); jest.restoreAllMocks(); jest.useRealTimers(); });
  const root = () => document.getElementById('next');
  const stage = () => api.stage(b, { previousTab: a, source: document.getElementById('old') });

  test('retains a visual-only view outside document queries, with live inputs and scroll positions', () => {
    document.getElementById('cell').value = 'current';
    document.getElementById('scroll').scrollTop = 37;
    stage();
    const preview = document.querySelector('.workspace-restore-preview');
    expect(preview.inert).toBe(true);
    expect(preview.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelectorAll('#cell')).toHaveLength(1);
    expect(preview.shadowRoot.getElementById('cell').value).toBe('current');
    expect(preview.shadowRoot.getElementById('scroll').scrollTop).toBe(37);
    expect(preview.shadowRoot.querySelector('button').hasAttribute('onclick')).toBe(false);
    document.getElementById('cell').value = 'later';
    expect(preview.shadowRoot.getElementById('cell').value).toBe('current');
    expect(api.getDisplayedTabId(state)).toBe(a.id);
    expect(document.querySelector('.workspace-restore-status').contains(root())).toBe(false);
  });

  test('copies canvas pixels rather than retaining a live render object', () => {
    const canvas = document.createElement('canvas');
    document.getElementById('old').append(canvas);
    const drawImage = jest.fn();
    const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
    stage();
    expect(drawImage).toHaveBeenCalledWith(canvas, 0, 0);
    getContext.mockRestore();
  });

  test('prepared small cached tabs stay silent from the outset, without a timer', async () => {
    stage();
    const finish = api.beginActivation(b, root(), { restoreRenderCache: true, prepared: true });
    expect(document.querySelector('[role="status"]').hidden).toBe(true);
    expect(root().inert).toBe(true);
    await jest.advanceTimersByTimeAsync(5000);
    expect(document.querySelector('[role="status"]').hidden).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
    finish(null, { completed: true });
    expect(root().inert).toBeFalsy();
    expect(document.querySelector('.workspace-restore-status')).toBeNull();
  });

  test.each([{ bundleRequired: true }, { restoreRenderCache: false }])('known expensive work shows feedback immediately: %o', plan => {
    stage();
    api.beginActivation(b, root(), plan);
    expect(document.querySelector('[role="status"]').textContent).toBe('Restoring b…');
    expect(document.querySelector('[role="status"]').hidden).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });

  test('slow work lets the immediate message paint; fast work begins synchronously', async () => {
    const callbacks = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => callbacks.push(callback));
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    stage();
    api.beginActivation(b, root(), { restoreRenderCache: true, prepared: true });
    const work = jest.fn(() => 'complete');
    expect(api.run(b, work)).toBe('complete');
    expect(callbacks).toHaveLength(0);
    work.mockClear();
    api.beginActivation(b, root());
    const pending = api.run(b, work);
    expect(work).not.toHaveBeenCalled();
    callbacks.shift()();
    expect(work).not.toHaveBeenCalled();
    callbacks.shift()();
    expect(await pending).toBe('complete');
    expect(work).toHaveBeenCalledTimes(1);
  });

  test('switching before the paint opportunity cancels setup, and backgrounding cannot strand it', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    jest.spyOn(window, 'requestAnimationFrame').mockReturnValue(7);
    const cancel = jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    stage();
    api.beginActivation(b, root());
    const work = jest.fn();
    const pending = api.run(b, work);
    api.disposeTab(b);
    expect(await pending).toBe(false);
    expect(work).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledWith(7);
    stage();
    api.beginActivation(b, root());
    const background = api.run(b, work);
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await background;
    expect(work).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  test('restarting an activation keeps the retained view and invalidates its old completion', () => {
    stage();
    const first = api.beginActivation(b, root());
    const preview = document.querySelector('.workspace-restore-preview');
    first(null, { retainPresentation: true });
    const second = api.beginActivation(b, root());
    first();
    expect(document.querySelector('.workspace-restore-preview')).toBe(preview);
    expect(root().inert).toBe(true);
    second();
    expect(document.querySelector('.workspace-restore-status')).toBeNull();
  });

  test('cached grid workload contributes to the prediction', () => {
    b.payload.data = Array.from({ length: 20000 }, () => [1, 2, 3]);
    expect(api.predict(b, { restoreRenderCache: true, prepared: true }).showMessage).toBe(true);
  });

  test.each([2, 12, 51])('cached 100-row tables predict synchronous restore cost at %i columns', columns => {
    b.payload.data = Array.from({ length: 100 }, () => Array(columns).fill(1));
    const prediction = api.predict(b, { restoreRenderCache: true, prepared: true });
    expect(prediction.estimateMs).toBeGreaterThanOrEqual(120);
    expect(prediction.showMessage).toBe(true);
  });

  test('cached table reconstruction starts only after the restore message can paint', async () => {
    const frames = [];
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      frames.push(callback);
      return frames.length;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    b.payload.data = Array.from({ length: 100 }, () => Array(2).fill(1));
    stage();
    api.beginActivation(b, root(), { restoreRenderCache: true, prepared: true });
    const activate = jest.fn(() => 'restored');

    const pending = api.run(b, activate);

    expect(activate).not.toHaveBeenCalled();
    expect(document.querySelector('[role="status"]').hidden).toBe(false);
    frames.shift()();
    expect(activate).not.toHaveBeenCalled();
    frames.shift()();
    await expect(pending).resolves.toBe('restored');
    expect(activate).toHaveBeenCalledTimes(1);
  });

  test('a fast prior activation cannot suppress the row-based cold-restore estimate', async () => {
    const plan = { restoreRenderCache: true, prepared: true };
    stage();
    const finish = api.beginActivation(b, root(), plan);
    await jest.advanceTimersByTimeAsync(50);
    finish(null, { completed: true });

    b.payload.data = Array.from({ length: 100 }, () => [1, 2]);
    expect(api.predict(b, plan).showMessage).toBe(true);
  });

  test('warm tabs keep their direct activation path without a surface or message', () => {
    stage();
    api.beginActivation(b, root());
    api.stage(a);
    expect(document.querySelector('.workspace-restore-status')).toBeNull();
    const work = jest.fn(() => true);
    expect(api.run(a, work)).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
  });

  test('Venn tables, selected derived views and measured cache size contribute to the workload', () => {
    const matrix = Array.from({ length: 20000 }, () => [1, 2, 3]);
    b.payload.data = { table: matrix };
    expect(api.predict(b, { restoreRenderCache: true }).showMessage).toBe(true);
    b.payload.data = [[1]];
    b.payload.dataViews = { activeViewId: 'derived', views: [{ id: 'derived', data: matrix }] };
    expect(api.predict(b, { restoreRenderCache: true }).showMessage).toBe(true);
    delete b.payload.dataViews;
    expect(api.predict(b, { restoreRenderCache: true, prepared: true, preparedBytes: 16 * 1024 * 1024 }).showMessage).toBe(true);
  });

  test('learns only completed workload timings, and resets them for a new document', async () => {
    const plan = { restoreRenderCache: true, prepared: true };
    stage();
    const finish = api.beginActivation(b, root(), plan);
    await jest.advanceTimersByTimeAsync(400);
    finish(null, { completed: true });
    expect(api.predict(b, plan).showMessage).toBe(true);
    expect(api.predict(tab('different-owner'), plan).showMessage).toBe(true);
    api.reset();
    expect(api.predict(b, plan).showMessage).toBe(false);
    stage();
    const cancelled = api.beginActivation(b, root(), plan);
    await jest.advanceTimersByTimeAsync(1000);
    cancelled();
    expect(api.predict(b, plan).showMessage).toBe(false);
  });

  test('rapid switches retain the last committed screen, and stale completion cannot publish', () => {
    document.getElementById('scroll').scrollTop = 37;
    stage();
    const finishB = api.beginActivation(b, root());
    const preview = document.querySelector('.workspace-restore-preview');
    const c = tab('c');
    document.getElementById('scroll').scrollTop = 0;
    state.tabs.push(c);
    state.activeTabId = b.id;
    api.stage(c, { previousTab: b, source: root() });
    const finishC = api.beginActivation(c, root());
    finishB(null, { completed: true });
    expect(document.querySelector('.workspace-restore-preview')).toBe(preview);
    expect(preview.shadowRoot.getElementById('scroll').scrollTop).toBe(37);
    expect(api.getDisplayedTabId(state)).toBe(a.id);
    expect(root().inert).toBe(true);
    state.activeTabId = c.id;
    finishC(null, { completed: true });
    expect(api.getDisplayedTabId(state)).toBe(c.id);
    expect(root().inert).toBeFalsy();
  });

  test('a newer activation of the same tab also rejects the old completion', () => {
    stage();
    const first = api.beginActivation(b, root());
    const second = api.beginActivation(b, root());
    first();
    expect(root().inert).toBe(true);
    expect(document.querySelector('.workspace-restore-status')).not.toBeNull();
    second();
    expect(root().inert).toBeFalsy();
  });

  test('errors appear immediately without removing the retained view', () => {
    stage();
    const finish = api.beginActivation(b, root(), { restoreRenderCache: true });
    finish('Could not restore this workspace.');
    expect(document.querySelector('[role="alert"]').textContent).toBe('Could not restore this workspace.');
    expect(document.querySelector('.workspace-restore-preview')).not.toBeNull();
    expect(root().inert).toBe(true);
  });

  test('owner disposal and document replacement release only the current presentation', () => {
    stage();
    root().inert = true;
    root().setAttribute('aria-busy', 'false');
    api.beginActivation(b, root());
    api.disposeTab(a);
    expect(document.querySelector('.workspace-restore-status')).not.toBeNull();
    api.disposeTab(b);
    expect(document.querySelector('.workspace-restore-status')).toBeNull();
    expect(root().inert).toBe(true);
    expect(root().getAttribute('aria-busy')).toBe('false');
  });
});
