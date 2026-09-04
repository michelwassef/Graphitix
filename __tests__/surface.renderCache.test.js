describe('Surface render cache redraw', () => {
  jest.setTimeout(240000);

  async function flush() {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  async function flushMany(count = 10) {
    for (let i = 0; i < count; i += 1) {
      await flush();
    }
  }

  async function waitForSurfaceGeometry(attempts = 120) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const svg = document.getElementById('surfaceSvg');
      if (svg?.querySelectorAll('g.surface-faces polygon').length > 0) {
        return svg;
      }
      await flush();
    }
    throw new Error('Surface geometry did not settle before the render-cache assertion.');
  }

  async function waitForSurfaceDraw(afterCursor, reason, timeoutMs = 8000) {
    const activeTabId = window.Main?.session?.workspaceState?.activeTabId || null;
    return window.Shared.componentLifecycle.waitForLifecycleEvent({
      componentKey: 'surface',
      tabId: activeTabId,
      actions: ['draw-settled'],
      afterCursor,
      timeoutMs,
      predicate: event => event.reason === reason
    });
  }

  function parseViewBox(svg) {
    return String(svg.getAttribute('viewBox') || '')
      .trim()
      .split(/\s+/)
      .map(value => Number(value));
  }

  async function handleGraphSelection(Main, type) {
    const maybe = Main.tabs.handleGraphSelection(type, { reason: 'test-selection' });
    if (maybe && typeof maybe.then === 'function') {
      await maybe;
    }
    const prompt = document.getElementById('duplicatePrompt');
    if (prompt && !prompt.hasAttribute('hidden')) {
      const emptyBtn = document.getElementById('duplicateEmpty');
      if (emptyBtn && typeof emptyBtn.click === 'function') {
        emptyBtn.click();
      }
    }
    await flushMany(4);
  }

  beforeEach(() => {
    jest.resetModules();
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
    if (typeof global.__resetGrid__ === 'function') {
      global.__resetGrid__();
    }

    require('../js/vendor.js');
    require('../js/shared/fileIO.js');
    require('../js/shared/debounce.js');
    require('../js/shared/componentLifecycle.js');
    require('../js/shared/exampleDatasets.js');
    require('../js/shared/dataTransforms.js');
    require('../js/shared/dataViews.js');
    require('../js/shared/tabContext.js');
    require('../js/shared/undo.js');
    require('../js/shared/resizer.js');
    require('../js/shared/dom.js');
    require('../js/shared/exporter.js');
    require('../js/shared/chartStyle.js');
    require('../js/shared/plot3d.js');
    require('../js/shared/graphSizing.js');
    require('../js/shared/regression.js');
    require('../js/shared/stats.js');
    require('../js/shared/stats-table.js');
    require('../js/shared/colorPicker.js');
    require('../js/shared/editHighlight.js');
    require('../js/shared/axisControls.js');
    require('../js/shared/additionalLineControls.js');
    require('../js/shared/significanceControls.js');
    require('../js/shared/fontControls.js');
    require('../js/shared/formControls.js');
    require('../js/shared/hot.js');
    require('../js/shared/componentLayout.js');
    require('../js/shared/tableImport.js');
    require('../js/shared/uniprot.js');
    require('../js/shared/goAnalysis.js');
    require('../js/shared/stringAnalysis.js');
    require('../js/main/components.js');
    if (window.Main?.components?.preloadAllBundlesSync) {
      window.Main.components.preloadAllBundlesSync();
    }
    require('../js/main/session.js');
    require('../js/main/domControls.js');
    require('../js/main/sessionActions.js');
    require('../js/main/styleSync.js');
    require('../js/main/tabDrag.js');
    require('../js/main/previews.js');
    require('../js/main/tabs/render.js');
    require('../js/main/tabs/unsavedPrompt.js');
    require('../js/main/tabs/duplicatePrompt.js');
    require('../js/main/tabs.js');
    require('../js/main.js');
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('surface redraw after render cache restore does not duplicate geometry', async () => {
    const Main = window.Main;
    await handleGraphSelection(Main, 'surface');

    const surface = window.Components?.surface;
    expect(surface).toBeTruthy();
    expect(surface.__getState().settings.axisStroke).toBe(1);
    expect(document.getElementById('surfaceAxisStroke')?.value).toBe('1');

    const exampleBtn = document.getElementById('surfaceLoadExample');
    expect(exampleBtn).toBeTruthy();
    expect(window.Shared?.exampleDatasets?.get?.('surface')?.data?.length).toBeGreaterThan(1);
    exampleBtn.click();
    let svg = await waitForSurfaceGeometry();
    expect(svg).toBeTruthy();
    svg.getBBox = jest.fn(() => ({ x: -42, y: -26, width: 720, height: 520 }));
    const redrawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    surface.draw({ reason: 'surface-render-cache-test-bbox' });
    await waitForSurfaceDraw(redrawCursor, 'surface-render-cache-test-bbox');
    svg = await waitForSurfaceGeometry();
    const settledOwnerSession = surface.__testHooks.getSession(Main.session.workspaceState.activeTabId);
    expect(settledOwnerSession?.timers?.drawInFlight).toBe(0);
    expect(surface.isIdleForSnapshot({ tabId: Main.session.workspaceState.activeTabId })).toBe(true);

    const originalFaceCount = svg.querySelectorAll('g.surface-faces polygon').length;
    const originalPointCount = svg.querySelectorAll('g.surface-points circle').length;
    expect(originalFaceCount).toBeGreaterThan(0);
    const frontFrameEdge = svg.querySelector('[data-frame-edge="front"]');
    expect(frontFrameEdge).toBeTruthy();
    expect(Number(frontFrameEdge.getAttribute('stroke-width'))).toBeCloseTo(1);

    const activeTabId = Main.session.workspaceState.activeTabId;
    const statsBeforeCache = document.getElementById('surfaceStatsSummary')?.textContent || '';
    expect(statsBeforeCache.length).toBeGreaterThan(0);
    const cache = surface.captureRenderCache({ tabId: activeTabId });
    expect(cache).toBeTruthy();
    // Durable stats are owner state; cached stats DOM is only an optimization.
    // Deliberately remove that cache section before restore.
    cache.stats = null;
    expect(cache.rotationModel).toEqual(expect.objectContaining({
      version: 1,
      points: expect.any(Array),
      faces: expect.any(Array),
      corners: expect.any(Array)
    }));
    expect(cache.rotationModel.points.length).toBeGreaterThan(0);
    expect(cache.rotationModel.corners).toHaveLength(8);
    expect(surface.__testHooks.normalizeRotationModel({
      ...cache.rotationModel,
      width: 0
    })).toBeNull();
    expect(surface.__testHooks.normalizeRotationModel({
      ...cache.rotationModel,
      points: [{ x: 0, y: 0, z: Number.NaN }]
    })).toBeNull();
    expect(surface.__testHooks.normalizeRotationModel({
      ...cache.rotationModel,
      margin: null
    })).toBeNull();
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(svg.getAttribute('width')).toBe('100%');
    expect(svg.getAttribute('height')).toBe('100%');
    let viewBox = parseViewBox(svg);
    expect(viewBox).toEqual([
      0,
      0,
      Number(svg.getAttribute('data-surface-base-width')),
      Number(svg.getAttribute('data-surface-base-height'))
    ]);
    expect(cache.svgRootState.attributes['data-surface-base-width']).toBeTruthy();
    expect(cache.svgRootState.attributes['data-surface-base-height']).toBeTruthy();
    const state = surface.__getState();
    state.svgBox.dataset.resizerAspectRatio = '1';
    state.svgBox.getBoundingClientRect = jest.fn(() => ({
      width: 1000,
      height: 500,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 500
    }));
    const cappedFrame = surface.__testHooks.resolve3dFrame({ width: 1000, height: 500 });
    expect(cappedFrame.width).toBe(500);
    expect(cappedFrame.height).toBe(500);

    state._facePool = [];
    state._pointPool = [];
    state._facePoolUsed = 0;
    state._pointPoolUsed = 0;

    const restored = surface.restoreRenderCache(cache, { tabId: activeTabId });
    expect(restored).toBe(true);
    expect(document.getElementById('surfaceStatsSummary')?.textContent || '').toContain(statsBeforeCache.slice(0, Math.min(24, statsBeforeCache.length)));
    expect(svg.dataset.rotationControlsAttached).toBe('true');
    expect(svg.__plot3dRotationControl).toBeTruthy();
    expect(svg.__plot3dRotationControl.state).toBe(state.rotation);
    expect(typeof svg.__plot3dRotationControl.onChange).toBe('function');
    const ownerSession = surface.__testHooks.getSession(activeTabId);
    expect(ownerSession).toBeTruthy();
    expect(ownerSession.tabId).toBe(activeTabId);
    expect(ownerSession.refs.svg).toBe(svg);
    expect(typeof ownerSession.refs.rotationRenderer).toBe('function');
    expect(ownerSession.cache.rotationModel).toEqual(cache.rotationModel);
    expect(ownerSession.refs.geometryPoolSvg).toBe(svg);
    expect(ownerSession.cache).not.toHaveProperty('facePool');
    expect(ownerSession.cache).not.toHaveProperty('pointPool');
    expect(ownerSession.cache).not.toHaveProperty('geometryPoolSvg');
    ownerSession.timers.rotationActive = true;
    ownerSession.timers.rotationPending = true;
    ownerSession.timers.rotationFrameId = 123;
    ownerSession.timers.rotationViewport = { x: 0, y: 0, width: 1, height: 1 };
    surface.cancelCurrentDraw({ tabId: activeTabId, reason: 'surface-rotation-test-cancel' });
    expect(ownerSession.timers.rotationActive).toBe(false);
    expect(ownerSession.timers.rotationPending).toBe(false);
    expect(ownerSession.timers.rotationFrameId).toBeNull();
    expect(ownerSession.timers.rotationViewport).toBeNull();
    expect(svg.querySelectorAll('g.surface-layer-geometry')).toHaveLength(1);
    expect(svg.querySelectorAll('g.surface-faces')).toHaveLength(1);
    expect(svg.querySelectorAll('g.surface-points')).toHaveLength(originalPointCount > 0 ? 1 : 0);
    expect(svg.querySelectorAll('g.surface-faces polygon').length).toBe(originalFaceCount);
    expect(svg.querySelectorAll('g.surface-points circle').length).toBe(originalPointCount);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(svg.getAttribute('width')).toBe('100%');
    expect(svg.getAttribute('height')).toBe('100%');
    viewBox = parseViewBox(svg);
    expect(viewBox).toEqual([
      0,
      0,
      Number(cache.svgRootState.attributes['data-surface-base-width']),
      Number(cache.svgRootState.attributes['data-surface-base-height'])
    ]);
    expect(svg.getAttribute('data-surface-base-width'))
      .toBe(cache.svgRootState.attributes['data-surface-base-width']);
    expect(svg.getAttribute('data-surface-base-height'))
      .toBe(cache.svgRootState.attributes['data-surface-base-height']);

    const faceGroup = svg.querySelector('g.surface-faces');
    const stalePolygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    stalePolygon.setAttribute('points', '0,0 10,0 0,10');
    faceGroup.appendChild(stalePolygon);
    surface.__testHooks.syncGeometryPoolsFromDom('test-stale-frame', ownerSession, svg);
    expect(ownerSession.refs.facePool).toHaveLength(originalFaceCount + 1);
    expect(ownerSession.refs.rotationRenderer(ownerSession.state.rotation)).toBe(true);
    expect(stalePolygon.style.display).toBe('none');
    expect(Array.from(svg.querySelectorAll('[data-axis-label="1"]'))).not.toHaveLength(0);
    expect(Array.from(svg.querySelectorAll('[data-axis-label="1"]')).every(node => (
      node.dataset.fontEditable === '1' && node.dataset.fontScope === 'surface'
    ))).toBe(true);
    expect(Array.from(svg.querySelectorAll('[data-axis-tick-label="1"]'))).not.toHaveLength(0);
    expect(Array.from(svg.querySelectorAll('[data-axis-tick-label="1"]')).every(node => (
      node.dataset.fontEditable === '1' && node.dataset.fontScope === 'surface'
    ))).toBe(true);
    stalePolygon.remove();
    surface.__testHooks.syncGeometryPoolsFromDom('test-stale-frame-cleanup', ownerSession, svg);

    const finalDrawCursor = window.Shared.componentLifecycle.getLifecycleEventCursor();
    surface.draw({ reason: 'surface-render-cache-final-redraw' });
    await waitForSurfaceDraw(finalDrawCursor, 'surface-render-cache-final-redraw');
    svg = await waitForSurfaceGeometry();

    expect(svg.querySelectorAll('g.surface-faces polygon').length).toBe(originalFaceCount);
    expect(svg.querySelectorAll('g.surface-points circle').length).toBe(originalPointCount);
  });
});
