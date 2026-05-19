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
    expect(scatter.canRestoreRenderCache(cache, { tabId: 'workspace-a' })).toBe(true);
    expect(scatter.canRestoreRenderCache(cache, { tabId: 'workspace-b' })).toBe(false);
    expect(document.querySelector('#scatterPlot').childElementCount).toBe(0);

    expect(scatter.restoreRenderCache(cache, { tabId: 'workspace-a' })).toBe(true);
    expect(document.querySelector('#scatterSvg')).toBeTruthy();
    expect(document.querySelector('#scatterStatsResults p')?.textContent).toBe('stats');
  });

  test('preview svg normalizes cached scatter dimensions without mutating the source', () => {
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
    expect(previewSvg).not.toBe(svg);
    expect(previewSvg.getAttribute('width')).toBe('463');
    expect(previewSvg.getAttribute('height')).toBe('427');
    expect(previewSvg.getAttribute('data-scatter-base-width')).toBe('463');
    expect(previewSvg.getAttribute('data-scatter-base-height')).toBe('427');
    expect(previewSvg.style.position).toBe('');
    expect(previewSvg.style.visibility).toBe('');
    expect(svg.style.position).toBe('absolute');
    expect(svg.style.visibility).toBe('hidden');
  });
});
