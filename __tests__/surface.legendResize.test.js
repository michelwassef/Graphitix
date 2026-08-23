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

  test('legend uses the Heatmap fixed display-space geometry at every graph size', () => {
    const hooks = window.Components?.surface?.__testHooks;
    expect(hooks?.resolveLegendMetrics).toBeTruthy();
    expect(hooks?.resolvePlotMargins).toBeTruthy();

    const largeMargin = hooks.resolvePlotMargins({ width: 600, height: 600, fontSize: 16, showLegend: true });
    const smallMargin = hooks.resolvePlotMargins({ width: 300, height: 300, fontSize: 16, showLegend: true });
    const large = hooks.resolveLegendMetrics({
      width: 600,
      height: 600,
      margin: largeMargin,
      fontSize: 16,
      drawableFrame: { width: 600, height: 600 }
    });
    const small = hooks.resolveLegendMetrics({
      width: 300,
      height: 300,
      margin: smallMargin,
      fontSize: 16,
      drawableFrame: { width: 300, height: 300 }
    });

    [large, small].forEach(metrics => {
      expect(metrics.barHeight * metrics.displayScale).toBeCloseTo(80);
      expect(metrics.barWidth * metrics.displayScale).toBeCloseTo(15);
      expect(metrics.tickLength * metrics.displayScale).toBeCloseTo(4.2);
      expect(metrics.tickLabelGap * metrics.displayScale).toBeCloseTo(5);
    });
  });

  test('legend label font size follows the current scaled graph font size', () => {
    const hooks = window.Components?.surface?.__testHooks;
    const margin = hooks.resolvePlotMargins({ width: 300, height: 300, fontSize: 10, showLegend: true });
    const metrics = hooks.resolveLegendMetrics({ width: 300, height: 300, margin, fontSize: 10 });

    expect(metrics.legendFontSize).toBeCloseTo(7.5);
    expect(metrics.legendFontSize).toBeLessThan(9);
  });

  test('legend display geometry compensates for SVG projection scale', () => {
    const hooks = window.Components?.surface?.__testHooks;
    const margin = hooks.resolvePlotMargins({ width: 420, height: 420, fontSize: 12, showLegend: true });
    const metrics = hooks.resolveLegendMetrics({
      width: 420,
      height: 420,
      margin,
      fontSize: 12,
      drawableFrame: { width: 210, height: 210 }
    });

    expect(metrics.displayScale).toBe(0.5);
    expect(metrics.barWidth).toBe(30);
    expect(metrics.barHeight).toBe(160);
  });

  test('legend metrics can reserve space for graph-scope legend font overrides', () => {
    const hooks = window.Components?.surface?.__testHooks;
    const margin = hooks.resolvePlotMargins({ width: 420, height: 420, fontSize: 12, showLegend: true });
    const metrics = hooks.resolveLegendMetrics({ width: 420, height: 420, margin, fontSize: 12, legendFontSize: 20 });

    expect(metrics.legendFontSize).toBe(20);
    expect(metrics.tickLabelGap).toBe(5);
  });

  test('continuous legend labels retain scale semantics and their rendered size', () => {
    const hooks = window.Components?.surface?.__testHooks;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);

    hooks.renderLegend(svg, {
      width: 420,
      height: 420,
      margin: hooks.resolvePlotMargins({ width: 420, height: 420, fontSize: 12, showLegend: true }),
      fontSize: 12,
      min: 0,
      max: 1,
      colorRamp: 'viridis'
    });

    const legend = svg.querySelector('g.surface-legend');
    const bar = legend.querySelector('[data-surface-color-scale-bar="1"]');
    const ticks = Array.from(legend.querySelectorAll('[data-surface-color-scale-tick="1"]'));
    const labels = Array.from(legend.querySelectorAll('text'));
    expect(legend.dataset.surfaceLegendHeightMode).toBe('fixed');
    expect(legend.dataset.surfaceLegendDisplayHeight).toBe('80');
    expect(legend.dataset.surfaceLegendDisplayWidth).toBe('15');
    expect(bar.getAttribute('width')).toBe('15');
    expect(bar.getAttribute('height')).toBe('80');
    expect(bar.getAttribute('stroke')).toBe('#333');
    expect(bar.getAttribute('stroke-width')).toBe('1');
    expect(bar.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(ticks).toHaveLength(5);
    expect(labels).toHaveLength(5);
    expect(labels.map(label => label.textContent)).toEqual(['0', '0.25', '0.5', '0.75', '1']);
    expect(ticks.map(tick => Number(tick.getAttribute('y1')))).toEqual([80, 60, 40, 20, 0]);
    ticks.forEach(tick => {
      expect(tick.getAttribute('stroke')).toBe('#333');
      expect(tick.getAttribute('stroke-width')).toBe('1');
      expect(tick.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    });
    labels.forEach(label => {
      expect(label.dataset.fontRole).toBe('scaleTick');
      expect(label.dataset.fontCollection).toBe('scale');
      expect(label.dataset.fontEditable).toBe('1');
      expect(label.getAttribute('font-size')).toBe('9');
      expect(label.getAttribute('text-anchor')).toBe('start');
      expect(label.getAttribute('dominant-baseline')).toBe('middle');
    });
    expect(svg.querySelector('g.surface-legend [data-font-legend-frame="1"]')).toBeNull();
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
