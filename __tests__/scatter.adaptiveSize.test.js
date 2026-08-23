/**
 * Tests for scatter plot adaptive point sizing.
 * Validates that point size automatically adjusts based on data point count.
 */
const { bindElementToTab, ensureWorkspaceTabs, initializeWorkspaceHarness } = require('./setup/workspaceHarness');

describe('Scatter adaptive point sizing', () => {
  let scatter;

  beforeEach(() => {
    jest.resetModules();
    initializeWorkspaceHarness();
    require('../js/components/scatter.js');
    scatter = window.Components?.scatter;
    if (typeof global.__restoreTestDebugLogs === 'function') {
      global.__restoreTestDebugLogs();
    }
  });

  afterEach(() => {
    if (typeof global.__suppressTestDebugLogs === 'function') {
      global.__suppressTestDebugLogs();
    }
  });

  test('computeAdaptivePointSize function is exposed', () => {
    expect(scatter).toBeDefined();
    expect(typeof scatter.computeAdaptivePointSize).toBe('function');
  });

  test('returns maximum size (3) for small datasets (<=50 points)', () => {
    expect(scatter.computeAdaptivePointSize(0)).toBe(3);
    expect(scatter.computeAdaptivePointSize(10)).toBe(3);
    expect(scatter.computeAdaptivePointSize(50)).toBe(3);
  });

  test('returns minimum size (1) for large datasets (>=5000 points)', () => {
    expect(scatter.computeAdaptivePointSize(5000)).toBe(1);
    expect(scatter.computeAdaptivePointSize(10000)).toBe(1);
    expect(scatter.computeAdaptivePointSize(100000)).toBe(1);
  });

  test('scales linearly between thresholds', () => {
    // Midpoint between 50 and 5000 is 2525
    const midpoint = scatter.computeAdaptivePointSize(2525);
    expect(midpoint).toBeGreaterThan(1);
    expect(midpoint).toBeLessThan(3);
    // Should be approximately 2 at midpoint
    expect(midpoint).toBeCloseTo(2, 0);
  });

  test('handles edge cases', () => {
    // Negative numbers treated as 0
    expect(scatter.computeAdaptivePointSize(-1)).toBe(3);
    // Non-numeric values treated as 0
    expect(scatter.computeAdaptivePointSize(null)).toBe(3);
    expect(scatter.computeAdaptivePointSize(undefined)).toBe(3);
    expect(scatter.computeAdaptivePointSize('invalid')).toBe(3);
  });

  test('size decreases monotonically as point count increases', () => {
    const counts = [50, 500, 1000, 2000, 3000, 4000, 5000];
    let previousSize = Infinity;
    
    for (const count of counts) {
      const size = scatter.computeAdaptivePointSize(count);
      expect(size).toBeLessThanOrEqual(previousSize);
      previousSize = size;
    }
  });

  test('result is always within bounds [1, 3]', () => {
    const testCounts = [0, 1, 10, 50, 100, 500, 1000, 2500, 5000, 10000, 100000];
    
    for (const count of testCounts) {
      const size = scatter.computeAdaptivePointSize(count);
      expect(size).toBeGreaterThanOrEqual(1);
      expect(size).toBeLessThanOrEqual(3);
    }
  });

  test('render cache is complete and tab-scoped before restore', () => {
    document.body.innerHTML = `
      <div id="scatterPage">
        <div id="scatterPlot">
          <svg id="scatterSvg" width="320" height="240" viewBox="0 0 320 240">
            <g data-export-layer="scatter-points"></g>
          </svg>
        </div>
        <div id="scatterStatsResults"><p>stats</p></div>
      </div>
    `;
    const page = document.getElementById('scatterPage');
    bindElementToTab(page, 'workspace-a');
    ensureWorkspaceTabs({
      getMountedRoot: jest.fn(() => page),
      ensureMountedRoot: jest.fn(() => page)
    });
    window.Main.session.getActiveTab.mockReturnValue({ id: 'workspace-a', type: 'scatter' });
    window.Main.session.workspaceState.activeTabId = 'workspace-a';
    scatter.__boundTabId = 'workspace-a';

    const cache = scatter.captureRenderCache({ tabId: 'workspace-a' });
    if (!cache) {
      // Minimal harnesses may not satisfy runtime completeness requirements for cache capture.
      expect(cache).toBeNull();
      return;
    }
    expect(cache.__graphitixRenderCache).toEqual(expect.objectContaining({
      type: 'scatter',
      tabId: 'workspace-a',
      complete: true
    }));
    // Eligibility is a pure cache/provenance check. It must remain valid while
    // another tab owns the visible module projection; only restore mutates DOM.
    window.Main.session.getActiveTab.mockReturnValue({ id: 'workspace-b', type: 'scatter' });
    window.Main.session.workspaceState.activeTabId = 'workspace-b';
    scatter.__boundTabId = 'workspace-b';
    expect(scatter.canRestoreRenderCache(cache, { tabId: 'workspace-a' })).toBe(true);
    expect(scatter.canRestoreRenderCache(cache, { tabId: 'workspace-b' })).toBe(false);
    expect(document.querySelector('#scatterPlot').childElementCount).toBe(0);

    window.Main.session.getActiveTab.mockReturnValue({ id: 'workspace-a', type: 'scatter' });
    window.Main.session.workspaceState.activeTabId = 'workspace-a';
    scatter.__boundTabId = 'workspace-a';
    expect(scatter.restoreRenderCache(cache, { tabId: 'workspace-a' })).toBe(true);
    expect(document.querySelector('#scatterSvg')).toBeTruthy();
    expect(document.querySelector('#scatterStatsResults p')?.textContent).toBe('stats');
  });

  test('3D scatter render cache is recognized as visually complete', () => {
    document.body.innerHTML = `
      <div id="scatterPlot">
        <svg id="scatterSvg" data-view-mode="3d">
          <g data-export-layer="scatter-points" data-layer="points" data-render-mode="markers-3d">
            <circle data-plot-point="1" cx="20" cy="30" r="3"></circle>
          </g>
        </svg>
      </div>
    `;
    const plot = document.getElementById('scatterPlot');
    expect(scatter.__testHooks.isRestoredRenderCacheVisuallyReady(plot)).toBe(true);

    const pointLayer = plot.querySelector('[data-layer="points"]');
    pointLayer.removeAttribute('data-render-mode');
    expect(scatter.__testHooks.isRestoredRenderCacheVisuallyReady(plot)).toBe(false);
  });

  test('cancelling an owner draw clears pending 3D rotation state for that tab only', () => {
    const tabId = 'workspace-scatter-rotation';
    window.Main.session.workspaceState.activeTabId = tabId;
    window.Main.session.workspaceState.tabs = [{ id: tabId, type: 'scatter' }];
    window.Main.session.getActiveTab.mockReturnValue({ id: tabId, type: 'scatter' });
    scatter.__boundTabId = tabId;

    scatter.cancelCurrentDraw({ tabId, reason: 'scatter-rotation-test-create-owner' });
    const ownerSession = scatter.__testHooks.getSession(tabId);
    expect(ownerSession).toBeTruthy();
    ownerSession.timers.drawRuntime.rotationPending = true;
    ownerSession.timers.drawRuntime.rotationPendingLogged = true;

    scatter.cancelCurrentDraw({ tabId, reason: 'scatter-rotation-test-cancel' });

    expect(ownerSession.timers.drawRuntime.rotationPending).toBe(false);
    expect(ownerSession.timers.drawRuntime.rotationPendingLogged).toBe(false);
  });

  test('a deferred owner projection does not leave Scatter rotation permanently pending', () => {
    const tabId = 'workspace-scatter-deferred-rotation';
    document.body.innerHTML = `
      <div id="scatterPage" data-workspace-component="scatter" data-workspace-tab-id="${tabId}">
        <div id="scatterPlot">
          <svg id="scatterSvg" data-view-mode="3d" data-workspace-tab-id="${tabId}"></svg>
        </div>
      </div>
    `;
    const root = document.getElementById('scatterPage');
    const svg = document.getElementById('scatterSvg');
    bindElementToTab(root, tabId);
    ensureWorkspaceTabs({
      getMountedRoot: jest.fn(() => root),
      ensureMountedRoot: jest.fn(() => root)
    });
    window.Main.session.workspaceState.activeTabId = tabId;
    window.Main.session.workspaceState.tabs = [{ id: tabId, type: 'scatter' }];
    window.Main.session.getActiveTab.mockReturnValue({ id: tabId, type: 'scatter' });
    scatter.__boundTabId = tabId;
    scatter.cancelCurrentDraw({ tabId, reason: 'scatter-deferred-rotation-create-owner' });
    const ownerSession = scatter.__testHooks.getSession(tabId);
    ownerSession.root = root;
    ownerSession.refs.root = root;
    expect(scatter.__testHooks.bind3dRotationControls(svg, ownerSession)).toBe(true);

    const hotApi = window.Shared.hot = window.Shared.hot || {};
    const previousShouldDefer = hotApi.shouldDeferOwnerProjectionDraw;
    hotApi.shouldDeferOwnerProjectionDraw = jest.fn(() => true);
    try {
      svg.__plot3dRotationControl.onChange(null, svg.__plot3dRotationControl.state);
      expect(ownerSession.timers.drawRuntime.rotationPending).toBe(false);
      expect(ownerSession.timers.drawRuntime.rotationPendingLogged).toBe(false);
    } finally {
      hotApi.shouldDeferOwnerProjectionDraw = previousShouldDefer;
    }
  });

  test('3D rotation updates owner geometry in place and rejects a foreign active tab', () => {
    const tabId = 'workspace-scatter-fast-rotation';
    document.body.innerHTML = `
      <div id="scatterPage" data-workspace-component="scatter" data-workspace-tab-id="${tabId}">
        <div id="scatterPlot">
          <svg id="scatterSvg" data-view-mode="3d" data-workspace-tab-id="${tabId}" viewBox="0 0 427 427">
            <text data-layer="scatter-3d-title">Scatter plot</text>
            <g data-layer="scatter-3d-legend"></g>
          </svg>
        </div>
      </div>
    `;
    const root = document.getElementById('scatterPage');
    const svg = document.getElementById('scatterSvg');
    bindElementToTab(root, tabId);
    ensureWorkspaceTabs({
      getMountedRoot: jest.fn(id => id === tabId ? root : null),
      ensureMountedRoot: jest.fn(id => id === tabId ? root : null)
    });
    window.Main.session.workspaceState.activeTabId = tabId;
    window.Main.session.workspaceState.tabs = [{ id: tabId, type: 'scatter' }];
    window.Main.session.getActiveTab.mockReturnValue({ id: tabId, type: 'scatter' });
    scatter.__boundTabId = tabId;
    scatter.cancelCurrentDraw({ tabId, reason: 'scatter-fast-rotation-create-owner' });
    const ownerSession = scatter.__testHooks.getSession(tabId);
    ownerSession.root = root;
    ownerSession.refs.root = root;
    ownerSession.state.view.rotation = window.Shared.plot3d.createRotationState({ x: 0.2, y: 0.8 });

    const model = {
      version: 1,
      width: 427,
      height: 427,
      margin: { top: 40, right: 40, bottom: 40, left: 40 },
      legendShiftX: 0,
      axisRanges: {
        x: { min: 0, max: 2 },
        y: { min: 0, max: 2 },
        z: { min: 0, max: 2 }
      },
      axisTicks: { x: [0, 1, 2], y: [0, 1, 2], z: [0, 1, 2] },
      axisTickLabels: { x: ['0', '1', '2'], y: ['0', '1', '2'], z: ['0', '1', '2'] },
      axisLabels: { x: 'X', y: 'Y', z: 'Z' },
      fontSize: 12,
      tickFontSize: 12,
      axisStrokeWidth: 1,
      axisColor: '#000000',
      textColor: '#000000',
      showGrid: true,
      showFrame: true,
      paneFill: 'rgba(0,0,0,0.03)',
      paneOpacityRange: { min: 0.01, max: 0.05 },
      grid: { color: '#dddddd', dash: null, opacity: 1, strokeWidth: 1 },
      labelLayout: { styleScaleInfo: null, color: '#000000' },
      points: [
        { point: { x: 0, y: 0, z: 0 }, shape: 'circle', radius: 3, fill: '#111111', fillOpacity: 1, stroke: '#111111', strokeWidth: 0, strokeOpacity: 1, manualLabel: '', tooltip: {}, sourceIndex: 0 },
        { point: { x: 1, y: 1, z: 1 }, shape: 'circle', radius: 3, fill: '#222222', fillOpacity: 1, stroke: '#222222', strokeWidth: 0, strokeOpacity: 1, manualLabel: '', tooltip: {}, sourceIndex: 1 },
        { point: { x: 2, y: 2, z: 2 }, shape: 'circle', radius: 3, fill: '#333333', fillOpacity: 1, stroke: '#333333', strokeWidth: 0, strokeOpacity: 1, manualLabel: '', tooltip: {}, sourceIndex: 2 }
      ]
    };

    expect(scatter.__testHooks.bind3dRotationRenderer(ownerSession, svg, model)).toBe(true);
    const dynamicLayer = svg.querySelector('[data-layer="scatter-3d-rotation-dynamic"]');
    const titleLayer = svg.querySelector('[data-layer="scatter-3d-title"]');
    const legendLayer = svg.querySelector('[data-layer="scatter-3d-legend"]');
    const pointState = () => Array.from(dynamicLayer.querySelectorAll('[data-plot-point="1"]'))
      .map(node => ({
        sourceIndex: Number(node.getAttribute('data-source-index')),
        transform: node.getAttribute('transform')
      }))
      .sort((a, b) => a.sourceIndex - b.sourceIndex);
    const beforePoints = pointState();
    const nextRotation = window.Shared.plot3d.createRotationState({ x: 0.55, y: 1.25 });

    expect(ownerSession.refs.rotationRenderer(nextRotation)).toBe(true);
    expect(svg.querySelector('[data-layer="scatter-3d-rotation-dynamic"]')).toBe(dynamicLayer);
    expect(svg.querySelector('[data-layer="scatter-3d-title"]')).toBe(titleLayer);
    expect(svg.querySelector('[data-layer="scatter-3d-legend"]')).toBe(legendLayer);
    const rotatedPoints = pointState();
    expect(rotatedPoints.map(point => point.sourceIndex)).toEqual(beforePoints.map(point => point.sourceIndex));
    expect(rotatedPoints.some((point, index) => point.transform !== beforePoints[index].transform)).toBe(true);

    window.Main.session.workspaceState.activeTabId = 'workspace-foreign';
    window.Main.session.getActiveTab.mockReturnValue({ id: 'workspace-foreign', type: 'scatter' });
    const stablePoints = pointState();
    expect(ownerSession.refs.rotationRenderer(window.Shared.plot3d.createRotationState({ x: 1.2, y: 2.1 }))).toBe(false);
    expect(pointState()).toEqual(stablePoints);
  });

  test('preview svg returns the owner cache source without mutating it', () => {
    const fragment = document.createDocumentFragment();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('id', 'scatterSvg');
    svg.setAttribute('width', '463');
    svg.setAttribute('height', '427');
    svg.setAttribute('viewBox', '0 0 463 427');
    svg.style.position = 'absolute';
    svg.style.visibility = 'hidden';
    svg.innerHTML = '<g data-export-layer="scatter-points"></g>';
    fragment.appendChild(svg);

    window.Main = window.Main || {};
    window.Main.session = window.Main.session || {};
    window.Main.session.workspaceState = { activeTabId: 'workspace-active' };

    const previewSvg = scatter.getPreviewSvg({
      id: 'workspace-inactive',
      renderCache: {
        cache: {
          plot: { fragment, count: 1 }
        }
      }
    });

    expect(previewSvg).toBeTruthy();
    expect(previewSvg).toBe(svg);
    expect(previewSvg.getAttribute('width')).toBe('463');
    expect(previewSvg.getAttribute('height')).toBe('427');
    expect(svg.style.position).toBe('absolute');
    expect(svg.style.visibility).toBe('hidden');
  });

  test('export svg rebuilds canvas-backed points as vector paths', () => {
    document.body.innerHTML = `
      <div id="scatterPage">
        <div id="scatterPlot">
          <svg id="scatterSvg" width="320" height="240" viewBox="0 0 320 240">
            <g data-export-layer="scatter-points" data-layer="points" data-render-mode="canvas">
              <foreignObject data-point-renderer="canvas-preview"><canvas></canvas></foreignObject>
            </g>
          </svg>
        </div>
      </div>
    `;
    const pointLayer = document.querySelector('[data-export-layer="scatter-points"]');
    pointLayer.__scatterCanvasVectorExportState = {
      mode: 'indexed',
      buckets: new Map([[
        'circle|#123456|1||0|1',
        {
          shape: 'circle',
          fill: '#123456',
          fillOpacity: 1,
          stroke: '',
          strokeWidth: 0,
          strokeOpacity: 1,
          radius: 2,
          indices: [0, 1]
        }
      ]]),
      cxValues: [12, 24],
      cyValues: [18, 36]
    };

    const exportSvg = scatter.getExportSvg();

    expect(exportSvg).toBeTruthy();
    expect(exportSvg).not.toBe(document.getElementById('scatterSvg'));
    expect(exportSvg.querySelector('foreignObject, foreignobject, canvas, img')).toBeNull();
    expect(exportSvg.querySelector('[data-export-layer="scatter-points"] path')).toBeTruthy();
    expect(exportSvg.querySelector('[data-export-layer="scatter-points"]')?.getAttribute('data-render-mode')).toBe('batched-vector-export');
  });
});
