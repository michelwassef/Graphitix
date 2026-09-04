const fs = require('fs');
const path = require('path');
const { expectSource } = require('./helpers/sourceContract');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('shared horizontal graph gutter contract', () => {
  test('axis-driven components derive horizontal reserves from the shared Cartesian margin planner', () => {
    [
      'box',
      'scatter',
      'line',
      'hist',
      'pca',
      'roc',
      'survival',
      'pie'
    ].forEach(component => {
      expectSource(read(`js/components/${component}.js`), `${component}.js`).toContain('computeCartesianMarginRequirements');
    });

    ['box', 'scatter', 'line', 'hist', 'pca', 'roc', 'survival', 'pie'].forEach(component => {
      expectSource(read(`js/components/${component}.js`), `${component}.js`).toContain('xTickLabels');
    });
  });

  test('custom geometry components consume the same canonical horizontal edge padding', () => {
    const heatmap = read('js/components/heatmap.js');
    const pie = read('js/components/pie.js');
    const venn = read('js/components/venn.js');
    const surface = read('js/components/surface.js');

    expectSource(heatmap, 'heatmap.js').toContain('chartStyle.resolveGraphHorizontalEdgePadding');
    expectSource(heatmap, 'heatmap.js').toContain('const marginRight = horizontalEdgePadding;');
    expectSource(heatmap, 'heatmap.js').not.toContain('let marginRight = 120;');

    expectSource(pie, 'pie.js').toContain('chartStyle.resolveGraphHorizontalEdgePadding');
    expectSource(pie, 'pie.js').toContain('radialLegendLayout.legendWidthForMargin + horizontalEdgePadding');
    expectSource(pie, 'pie.js').toContain('const leftLimit=contentLeft + horizontalEdgePadding;');
    expectSource(pie, 'pie.js').toContain('const rightLimit=contentRight - horizontalEdgePadding;');

    expectSource(venn, 'venn.js').toContain('outerPaddingPx: chartStyle.resolveGraphHorizontalEdgePadding');
    expectSource(venn, 'venn.js').toContain('const outerPadding = VENN_DIAGRAM_LAYOUT.outerPaddingPx;');
    expectSource(venn, 'venn.js').not.toMatch(/Math\.max\(VENN_DIAGRAM_LAYOUT\.outerPaddingPx,\s*fontSize(?:Px)?\s*\*\s*0\.9\)/);

    expectSource(surface, 'surface.js').toContain('Shared.graphViewport?.ensure');
    expectSource(surface, 'surface.js').toContain('Shared.ensureGraphViewport');
    expectSource(surface, 'surface.js').not.toMatch(/ensureSurfaceGraphViewport\([\s\S]*?paddingX\s*:/);

    const hist = read('js/components/hist.js');
    expectSource(hist, 'hist.js').toContain('right: horizontalEdgePadding');
    expectSource(hist, 'hist.js').toContain('x: horizontalEdgePadding + (fs * 0.5)');
  });

  test('shared viewport fitting keeps horizontal padding independent from vertical overflow padding', () => {
    const chartStyle = read('js/shared/chartStyle.js');
    const dom = read('js/shared/dom.js');

    expectSource(chartStyle, 'chartStyle.js').toContain('const GRAPH_HORIZONTAL_EDGE_PADDING_PX = 8;');
    expectSource(chartStyle, 'chartStyle.js').toContain('const right = xEndpointMargins.right + legendWidth;');
    expectSource(chartStyle, 'chartStyle.js').toContain('computeXAxisEndpointLabelMargins');
    expectSource(dom, 'dom.js').toContain('paddingX: Number.isFinite(horizontalEdgePadding)');
    expectSource(dom, 'dom.js').toContain('horizontalEdgePadding >= 0 ? horizontalEdgePadding : 8,');
    expectSource(dom, 'dom.js').toContain('bbox.x - effectivePaddingX');
    expectSource(dom, 'dom.js').toContain('bbox.y - effectivePaddingY');
  });

  test('aspect-constrained 2D components use the shared Cartesian layout transaction', () => {
    const chartStyle = read('js/shared/chartStyle.js');
    expectSource(chartStyle, 'chartStyle.js').toContain('fitPlotAspectPreservingHeight');
    expectSource(chartStyle, 'chartStyle.js').toContain('const targetH = innerH;');

    ['pca', 'line', 'scatter'].forEach(component => {
      const source = read(`js/components/${component}.js`);
      expectSource(source, `${component}.js`).toContain('Shared.cartesianLayout');
      expectSource(source, `${component}.js`).toContain('planCartesianLayout');
      expectSource(source, `${component}.js`).toContain('contentEnvelope');
    });

    const pca = read('js/components/pca.js');
    expectSource(pca, 'pca.js').not.toContain('legendOuterPadding');
    expectSource(pca, 'pca.js').not.toContain('minimumRenderWidth');
    expectSource(pca, 'pca.js').not.toContain('minimumWidth: W');
  });

  test('standard 2D renderers keep their computed canvas authoritative like Box', () => {
    const dom = read('js/shared/dom.js');
    expectSource(dom, 'dom.js').toContain('fitContent = true');
    expectSource(dom, 'dom.js').toContain('if(fitContent === false)');
    expectSource(dom, 'dom.js').toContain('autoResizeSvg authoritative canvas applied');

    ['scatter', 'pca', 'line', 'roc', 'survival', 'hist', 'pie'].forEach(component => {
      const source = read(`js/components/${component}.js`);
      expectSource(source, `${component}.js`).toContain('fitContent: false');
    });

    const box = read('js/components/box.js');
    expectSource(box, 'box.js').toContain('applyBoxCanvasViewport');

    const pie = read('js/components/pie.js');
    expectSource(pie, 'pie.js').not.toContain('ensurePieViewport');
    expect((pie.match(/fitContent: false/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  test('fixed-canvas 3D renderers are not fitted a second time from content bounds', () => {
    ['scatter', 'pca', 'line'].forEach(component => {
      const source = read(`js/components/${component}.js`);
      expectSource(source, `${component}.js`).toMatch(new RegExp(
        `debugLabel: '${component}-3d-graph',[\\s\\S]{0,220}fitContent: false`
      ));
    });
  });

  test('shared legend envelopes are finalized from rendered legend geometry', () => {
    const chartStyle = read('js/shared/chartStyle.js');
    expectSource(chartStyle, 'chartStyle.js').toContain('legend viewport refined from rendered content');
    expectSource(chartStyle, 'chartStyle.js').toContain('rightEdge + horizontalEdgePadding - viewport.baseWidth');
    expectSource(chartStyle, 'chartStyle.js').toContain("svg.querySelector?.('[data-legend-viewport-content=\"true\"]')");
  });

});
