// Asserts the headline post-reopen contract: every tab activation reuses its
// archiveRenderCache (or live renderCache) without ever invoking config.draw().
// Covers two distinct activation paths inside Main.domControls.showWorkspaceForTab:
//   (a) first-time activation after reopen — full apply path with canRestoreRender=true.
//   (b) re-activation of an already-loaded tab — canReuseWorkspaceForActivation path.
// Both paths must call config.restoreRenderCache and skip config.draw entirely.

describe('tab switch reuse-cache contract (post-reopen)', () => {
  let session;
  let domControls;

  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }
    delete window.Main;
    delete window.Shared;
    document.body.innerHTML = `
      <section id="workspacePages">
        <div id="boxPage" data-workspace-component="box"></div>
        <div id="scatterPage" data-workspace-component="scatter"></div>
        <div id="linePage" data-workspace-component="line"></div>
      </section>
    `;
    require('../js/shared/colorSchemes.js');
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    session = window.Main?.session;
    domControls = window.Main?.domControls;
    expect(session).toBeTruthy();
    expect(domControls).toBeTruthy();
    // Minimal stubs for the optional shared dependencies that showWorkspaceForTab probes
    // through optional chaining. Returning empty objects keeps every branch guarded.
    window.Shared = window.Shared || {};
    window.Shared.workspaceTabs = window.Shared.workspaceTabs || {};
    window.Shared.componentLayout = window.Shared.componentLayout || {};
    window.Shared.graphSizing = window.Shared.graphSizing || {};
    window.Shared.fileIO = window.Shared.fileIO || {};
  });

  afterEach(() => {
    delete window.Main;
    delete window.Shared;
    document.body.innerHTML = '';
  });

  function createGraphTab({ id, type, payloadSignature = `${id}-payload-sig`, layoutSignature = `${id}-layout-sig`, archiveRenderCache = { kind: `${type}-archive-cache` } }) {
    const tab = session.createTab({
      title: `${type}-tab`,
      type,
      payload: { type, data: [['col']], config: {} },
      payloadSignature,
      layoutState: { component: type },
      layoutSignature,
      archiveRenderCache,
      archiveRenderCacheSignature: payloadSignature,
      archiveRenderCacheLayoutSignature: layoutSignature
    });
    session.workspaceState.tabs.push(tab);
    return tab;
  }

  function makeWorkspaceConfig(type) {
    const draw = jest.fn();
    const restoreRenderCache = jest.fn(() => true);
    const canRestoreRenderCache = jest.fn(() => true);
    const ensure = jest.fn();
    const config = {
      type,
      element: document.getElementById(`${type}Page`),
      draw,
      ensure,
      restoreRenderCache,
      canRestoreRenderCache,
      // No loadFromPayload / loadFromFile so applyWorkspacePayload is a no-op for the test.
      applyLayoutState: jest.fn()
    };
    return { config, draw, restoreRenderCache, canRestoreRenderCache, ensure };
  }

  test('first-time activation after reopen: archiveRenderCache restored, draw NOT called', () => {
    const tab = createGraphTab({ id: 'tab-1', type: 'box' });
    const { config, draw, restoreRenderCache } = makeWorkspaceConfig('box');

    domControls.showWorkspaceForTab({
      tab,
      options: { reason: 'test-first-activation' },
      dom: {},
      workspaces: { box: config },
      session,
      workspaceState: session.workspaceState
    });

    expect(restoreRenderCache).toHaveBeenCalledTimes(1);
    expect(restoreRenderCache).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        tab,
        tabId: tab.id,
        type: 'box'
      })
    );
    expect(draw).not.toHaveBeenCalled();
    // After consume → restoreRenderCache → success, the archive cache is consumed and
    // the live renderCache is cleared (it has been "applied" to the DOM).
    expect(tab.archiveRenderCache).toBeNull();
    expect(tab.renderCache).toBeNull();
  });

  test('re-activation after first activation: takes the reuse path, draw NOT called', () => {
    const tab = createGraphTab({ id: 'tab-2', type: 'scatter' });
    const { config, draw, restoreRenderCache } = makeWorkspaceConfig('scatter');

    // First activation primes loadedWorkspaces and renderedWorkspaceByType, consumes the
    // archive cache, and applies it to the DOM. After this the live renderCache is also
    // cleared (it has been "spent" on the DOM).
    domControls.showWorkspaceForTab({
      tab,
      options: { reason: 'test-first' },
      dom: {},
      workspaces: { scatter: config },
      session,
      workspaceState: session.workspaceState
    });
    expect(restoreRenderCache).toHaveBeenCalledTimes(1);
    expect(draw).not.toHaveBeenCalled();
    // Re-activate: canReuseWorkspaceForActivation should fire and the path returns
    // without redrawing — the DOM already shows what we'd be re-drawing. With
    // canRestoreRender=false (cache already spent), neither restore nor draw runs.
    restoreRenderCache.mockClear();
    draw.mockClear();
    domControls.showWorkspaceForTab({
      tab,
      options: { reason: 'test-reactivate' },
      dom: {},
      workspaces: { scatter: config },
      session,
      workspaceState: session.workspaceState
    });
    expect(draw).not.toHaveBeenCalled();
    // The reuse path returns silently — restore is unnecessary because the DOM is
    // already authoritative. The contract is "no draw"; restore-call count is 0 here.
    expect(restoreRenderCache).not.toHaveBeenCalled();
  });

  test('every tab in a multi-tab reopen restores from cache without draw', () => {
    const boxTab = createGraphTab({ id: 'tab-1', type: 'box' });
    const scatterTab = createGraphTab({ id: 'tab-2', type: 'scatter' });
    const lineTab = createGraphTab({ id: 'tab-3', type: 'line' });
    const box = makeWorkspaceConfig('box');
    const scatter = makeWorkspaceConfig('scatter');
    const line = makeWorkspaceConfig('line');
    const workspaces = { box: box.config, scatter: scatter.config, line: line.config };

    [boxTab, scatterTab, lineTab].forEach(tab => {
      session.workspaceState.activeTabId = tab.id;
      domControls.showWorkspaceForTab({
        tab,
        options: { reason: 'multi-tab-reopen' },
        dom: {},
        workspaces,
        session,
        workspaceState: session.workspaceState
      });
    });

    expect(box.restoreRenderCache).toHaveBeenCalledTimes(1);
    expect(scatter.restoreRenderCache).toHaveBeenCalledTimes(1);
    expect(line.restoreRenderCache).toHaveBeenCalledTimes(1);
    expect(box.draw).not.toHaveBeenCalled();
    expect(scatter.draw).not.toHaveBeenCalled();
    expect(line.draw).not.toHaveBeenCalled();
  });

  test('component without canRestoreRenderCache validator still restores from cache (regression: only box+scatter used to)', () => {
    // Reproduces the production bug from the May 5 reopen log: 9 of 11 component
    // types (venn, line, heatmap, surface, pca, pie, hist, roc, survival) bypass
    // their archiveRenderCache and re-draw on every activation because they don't
    // export a canRestoreRenderCache validator. The basic check (cache present +
    // restore hook + signature match) is enough; the validator is opt-in.
    const tab = createGraphTab({ id: 'tab-no-validator', type: 'venn' });
    const validatorlessConfig = {
      type: 'venn',
      element: document.createElement('div'),
      draw: jest.fn(),
      ensure: jest.fn(),
      restoreRenderCache: jest.fn(() => true),
      // Deliberately NO canRestoreRenderCache — matches venn/line/heatmap/etc.
      applyLayoutState: jest.fn()
    };
    document.getElementById('workspacePages').appendChild(validatorlessConfig.element);
    validatorlessConfig.element.id = 'vennPage';
    validatorlessConfig.element.setAttribute('data-workspace-component', 'venn');

    domControls.showWorkspaceForTab({
      tab,
      options: { reason: 'no-validator-restore' },
      dom: {},
      workspaces: { venn: validatorlessConfig },
      session,
      workspaceState: session.workspaceState
    });

    expect(validatorlessConfig.restoreRenderCache).toHaveBeenCalledTimes(1);
    expect(validatorlessConfig.draw).not.toHaveBeenCalled();
  });

  test('all 11 component types restore from archiveRenderCache without drawing', () => {
    // The full registry coverage that the production bug needed. Every component
    // type the user exposes must hit the cache-restore path on reopen.
    const TYPES = ['box', 'scatter', 'venn', 'line', 'heatmap', 'surface', 'pca', 'pie', 'hist', 'roc', 'survival'];
    const stubs = {};
    const workspaces = {};
    TYPES.forEach(type => {
      const element = document.createElement('div');
      element.id = `${type}Page`;
      element.setAttribute('data-workspace-component', type);
      document.getElementById('workspacePages').appendChild(element);
      const draw = jest.fn();
      const restoreRenderCache = jest.fn(() => true);
      // Half of these components (venn, line, heatmap, surface, pca, pie, hist,
      // roc, survival) DO NOT export canRestoreRenderCache in production. Mirror
      // that here so the test fails the moment the missing-validator gate returns.
      const config = {
        type,
        element,
        draw,
        ensure: jest.fn(),
        restoreRenderCache,
        applyLayoutState: jest.fn()
      };
      if (type === 'box' || type === 'scatter') {
        config.canRestoreRenderCache = jest.fn(() => true);
      }
      stubs[type] = { draw, restoreRenderCache };
      workspaces[type] = config;
    });

    TYPES.forEach((type, idx) => {
      const tab = createGraphTab({ id: `tab-all-${idx}`, type });
      session.workspaceState.activeTabId = tab.id;
      domControls.showWorkspaceForTab({
        tab,
        options: { reason: 'all-types-reopen' },
        dom: {},
        workspaces,
        session,
        workspaceState: session.workspaceState
      });
    });

    TYPES.forEach(type => {
      expect(stubs[type].restoreRenderCache).toHaveBeenCalledTimes(1);
      expect(stubs[type].draw).not.toHaveBeenCalled();
    });
  });

  test('tab switch with mismatched payloadSignature falls back to draw (negative control)', () => {
    const tab = createGraphTab({
      id: 'tab-mismatch',
      type: 'box',
      payloadSignature: 'fresh-sig',
      archiveRenderCache: { kind: 'stale' }
    });
    // Mark the archive cache as belonging to a different signature so the validator
    // rejects it. With no valid cache to restore, restoreRenderCache must NOT be called
    // and draw MUST be the only output path.
    tab.archiveRenderCacheSignature = 'stale-sig';
    const { config, draw, restoreRenderCache } = makeWorkspaceConfig('box');

    domControls.showWorkspaceForTab({
      tab,
      options: { reason: 'mismatched-sig' },
      dom: {},
      workspaces: { box: config },
      session,
      workspaceState: session.workspaceState
    });

    expect(restoreRenderCache).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledTimes(1);
  });
});
