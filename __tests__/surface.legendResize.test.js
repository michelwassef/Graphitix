describe('Surface legend resize metrics', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Shared = window.Shared || {};
    window.Components = window.Components || {};
    require('../js/shared/chartStyle.js');
    require('../js/shared/plot3d.js');
    require('../js/shared/fontControls.js');
    require('../js/components/surface.js');
  });

  test('legend geometry scales down with graph size while preserving readable proportions', () => {
    const hooks = window.Components?.surface?.__testHooks;
    expect(hooks?.resolveLegendMetrics).toBeTruthy();
    expect(hooks?.resolvePlotMargins).toBeTruthy();

    const largeMargin = hooks.resolvePlotMargins({ width: 600, height: 600, fontSize: 16, showLegend: true });
    const smallMargin = hooks.resolvePlotMargins({ width: 300, height: 300, fontSize: 16, showLegend: true });
    const large = hooks.resolveLegendMetrics({ width: 600, height: 600, margin: largeMargin, fontSize: 16 });
    const small = hooks.resolveLegendMetrics({ width: 300, height: 300, margin: smallMargin, fontSize: 16 });

    expect(small.barHeight).toBeLessThan(large.barHeight);
    expect(small.barWidth).toBeLessThan(large.barWidth);
    expect(small.legendRightPad).toBeLessThan(large.legendRightPad);
    expect(small.barHeight).toBeLessThanOrEqual(small.availableHeight * 0.7);
  });

  test('legend label font size follows the current scaled graph font size', () => {
    const hooks = window.Components?.surface?.__testHooks;
    const margin = hooks.resolvePlotMargins({ width: 300, height: 300, fontSize: 10, showLegend: true });
    const metrics = hooks.resolveLegendMetrics({ width: 300, height: 300, margin, fontSize: 10 });

    expect(metrics.legendFontSize).toBeCloseTo(7.5);
    expect(metrics.legendFontSize).toBeLessThan(9);
  });

  test('default-size legend bar keeps the original readable width', () => {
    const hooks = window.Components?.surface?.__testHooks;
    const margin = hooks.resolvePlotMargins({ width: 420, height: 420, fontSize: 12, showLegend: true });
    const metrics = hooks.resolveLegendMetrics({ width: 420, height: 420, margin, fontSize: 12 });

    expect(metrics.barWidth).toBeGreaterThan(12);
    expect(metrics.barWidth).toBeLessThan(16);
  });

  test('legend metrics can reserve space for graph-scope legend font overrides', () => {
    const hooks = window.Components?.surface?.__testHooks;
    const margin = hooks.resolvePlotMargins({ width: 420, height: 420, fontSize: 12, showLegend: true });
    const metrics = hooks.resolveLegendMetrics({ width: 420, height: 420, margin, fontSize: 12, legendFontSize: 20 });

    expect(metrics.legendFontSize).toBe(20);
    expect(metrics.labelOffset).toBeGreaterThan(12);
  });

  test('saved graph title font size survives the surface redraw base-size reset', () => {
    const hooks = window.Components?.surface?.__testHooks;
    const fontControls = window.Shared?.fontControls;
    expect(hooks?.applySavedFontStyle).toBeTruthy();
    expect(fontControls?.importScopeStyles).toBeTruthy();

    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.dataset.fontScope = 'surface';
    title.dataset.fontKey = 'graphTitle';
    title.dataset.fontEditable = '1';
    title.setAttribute('font-size', '12');

    fontControls.importScopeStyles('surface', {
      graphTitle: { fontSize: '24px', fontSizeResizeReference: 1 }
    }, { prune: false, broadcast: false });

    // Surface reuses its title node, so every redraw first reapplies the computed
    // graph base size. The saved per-title style must then be restored, matching
    // the behavior of 3D scatter where text nodes are freshly marked each draw.
    title.setAttribute('font-size', '10');
    hooks.applySavedFontStyle(title);

    expect(title.getAttribute('font-size')).toBe('24px');
  });

});
