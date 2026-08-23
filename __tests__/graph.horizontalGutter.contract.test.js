const fs = require('fs');
const path = require('path');

const read = relativePath => fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('shared horizontal graph gutter contract', () => {
  test('axis-driven components derive horizontal reserves from computeBaseMargins', () => {
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
      expect(read(`js/components/${component}.js`)).toContain('chartStyle.computeBaseMargins');
    });

    ['box', 'scatter', 'line', 'hist', 'pca', 'roc', 'survival', 'pie'].forEach(component => {
      expect(read(`js/components/${component}.js`)).toContain('xTickLabels');
    });
  });

  test('custom geometry components consume the same canonical horizontal edge padding', () => {
    const heatmap = read('js/components/heatmap.js');
    const pie = read('js/components/pie.js');
    const venn = read('js/components/venn.js');
    const surface = read('js/components/surface.js');

    expect(heatmap).toContain('chartStyle.resolveGraphHorizontalEdgePadding');
    expect(heatmap).toContain('let marginRight = horizontalEdgePadding;');
    expect(heatmap).not.toContain('let marginRight = 120;');

    expect(pie).toContain('chartStyle.resolveGraphHorizontalEdgePadding');
    expect(pie).toContain('radialLegendLayout.legendWidthForMargin + horizontalEdgePadding');
    expect(pie).toContain('const leftLimit=contentLeft + horizontalEdgePadding;');
    expect(pie).toContain('const rightLimit=contentRight - horizontalEdgePadding;');

    expect(venn).toContain('outerPaddingPx: chartStyle.resolveGraphHorizontalEdgePadding');
    expect(venn).toContain('const outerPadding = VENN_DIAGRAM_LAYOUT.outerPaddingPx;');
    expect(venn).not.toMatch(/Math\.max\(VENN_DIAGRAM_LAYOUT\.outerPaddingPx,\s*fontSize(?:Px)?\s*\*\s*0\.9\)/);

    expect(surface).toContain('Shared.graphViewport?.ensure');
    expect(surface).toContain('Shared.ensureGraphViewport');
    expect(surface).not.toMatch(/ensureSurfaceGraphViewport\([\s\S]*?paddingX\s*:/);

    const hist = read('js/components/hist.js');
    expect(hist).toContain('right: horizontalEdgePadding');
    expect(hist).toContain('x: horizontalEdgePadding + (fs * 0.5)');
  });

  test('shared viewport fitting keeps horizontal padding independent from vertical overflow padding', () => {
    const chartStyle = read('js/shared/chartStyle.js');
    const dom = read('js/shared/dom.js');

    expect(chartStyle).toContain('const GRAPH_HORIZONTAL_EDGE_PADDING_PX = 8;');
    expect(chartStyle).toContain('const right = xEndpointMargins.right + legendWidth;');
    expect(chartStyle).toContain('computeXAxisEndpointLabelMargins');
    expect(dom).toContain('paddingX: Number.isFinite(horizontalEdgePadding)');
    expect(dom).toContain('horizontalEdgePadding >= 0 ? horizontalEdgePadding : 8,');
    expect(dom).toContain('bbox.x - effectivePaddingX');
    expect(dom).toContain('bbox.y - effectivePaddingY');
  });

  test('aspect-constrained 2D components preserve canonical height and vary width', () => {
    const chartStyle = read('js/shared/chartStyle.js');
    expect(chartStyle).toContain('fitPlotAspectPreservingHeight');
    expect(chartStyle).toContain('const targetH = innerH;');

    ['pca', 'line', 'scatter'].forEach(component => {
      const source = read(`js/components/${component}.js`);
      expect(source).toContain('chartStyle.fitPlotAspectPreservingHeight');
      expect(source).toContain('aspectRightExtension');
    });

    const pca = read('js/components/pca.js');
    expect(pca).not.toContain('legendOuterPadding');
    expect(pca).not.toContain('minimumRenderWidth');
    expect(pca).not.toContain('minimumWidth: W');
  });

  test('standard 2D renderers keep their computed canvas authoritative like Box', () => {
    const dom = read('js/shared/dom.js');
    expect(dom).toContain('fitContent = true');
    expect(dom).toContain('if(fitContent === false)');
    expect(dom).toContain('autoResizeSvg authoritative canvas applied');

    ['scatter', 'pca', 'line', 'roc', 'survival', 'hist', 'pie'].forEach(component => {
      const source = read(`js/components/${component}.js`);
      expect(source).toContain('fitContent: false');
    });

    const box = read('js/components/box.js');
    expect(box).toContain('applyBoxCanvasViewport');

    const pie = read('js/components/pie.js');
    expect(pie).not.toContain('ensurePieViewport');
    expect((pie.match(/fitContent: false/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  test('fixed-canvas 3D renderers are not fitted a second time from content bounds', () => {
    ['scatter', 'pca', 'line'].forEach(component => {
      const source = read(`js/components/${component}.js`);
      expect(source).toMatch(new RegExp(
        `debugLabel: '${component}-3d-graph',[\\s\\S]{0,220}fitContent: false`
      ));
    });
  });

  test('shared legend envelopes are finalized from rendered legend geometry', () => {
    const chartStyle = read('js/shared/chartStyle.js');
    expect(chartStyle).toContain('legend viewport refined from rendered content');
    expect(chartStyle).toContain('rightEdge + horizontalEdgePadding - viewport.baseWidth');
    expect(chartStyle).toContain("svg.querySelector?.('[data-legend-viewport-content=\"true\"]')");
  });

});
