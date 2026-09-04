describe('chartStyle legend viewport', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../js/shared/chartStyle.js');
  });

  test('adds legend width outside the canonical plot viewport', () => {
    const { chartStyle } = window.Shared;
    const hidden = chartStyle.computeLegendViewport({
      baseWidth: 640,
      baseHeight: 400,
      legendWidth: 0
    });
    const visible = chartStyle.computeLegendViewport({
      baseWidth: 640,
      baseHeight: 400,
      legendWidth: 180
    });
    const hiddenMargin = chartStyle.computeBaseMargins({ fontSize: 12, legendWidth: hidden.legendWidth });
    const visibleMargin = chartStyle.computeBaseMargins({ fontSize: 12, legendWidth: visible.legendWidth });

    expect(hidden.width).toBe(640);
    expect(visible.width).toBe(820);
    expect(visible.baseWidth).toBe(hidden.baseWidth);
    expect(visible.height).toBe(hidden.height);
    expect(visible.width - visibleMargin.left - visibleMargin.right)
      .toBe(hidden.width - hiddenMargin.left - hiddenMargin.right);
  });

  test('stages the viewport and commits the visible envelope atomically', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBox.style.width = '640px';
    svgBox.appendChild(plot);
    plot.appendChild(svg);

    const projection = chartStyle.stageLegendViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 640,
      baseHeight: 400,
      legendWidth: 180
    });

    expect(svgBox.style.width).toBe('640px');
    expect(svgBox.style.getPropertyValue('--graph-content-extra-right')).toBe('');
    expect(svgBox.dataset.graphContentEnvelope).toBeUndefined();
    expect(projection.commit()).toBe(true);
    expect(svgBox.style.getPropertyValue('--graph-content-extra-right')).toBe('180px');
    expect(svgBox.dataset.graphContentEnvelope).toBe('true');
    expect(svg.getAttribute('width')).toBe('820');
    expect(svg.getAttribute('viewBox')).toBe('0 0 820 400');
    expect(svg.dataset.legendBaseWidth).toBe('640');
    expect(plot.dataset.graphContentViewport).toBe('true');
  });

  test('extends bottom content without changing the canonical graph viewport', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBox.appendChild(plot);
    plot.appendChild(svg);

    const projection = chartStyle.stageGraphContentViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 640,
      baseHeight: 400,
      rightWidth: 120,
      bottomHeight: 84
    });

    expect(projection.baseWidth).toBe(640);
    expect(projection.baseHeight).toBe(400);
    expect(projection.width).toBe(760);
    expect(projection.height).toBe(484);
    projection.commit();
    expect(svg.getAttribute('viewBox')).toBe('0 0 760 484');
    expect(svg.dataset.graphContentReserveBottom).toBe('84');
    expect(svgBox.style.getPropertyValue('--graph-content-extra-bottom')).toBe('84px');
    expect(plot.style.getPropertyValue('--graph-content-viewport-height')).toBe('484px');
  });

  test('content envelope can extend on every side without changing the canonical base frame', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBox.appendChild(plot);
    plot.appendChild(svg);

    const projection = chartStyle.stageGraphContentViewport({
      svgBox, plot, svg,
      baseWidth: 640,
      baseHeight: 400,
      leftWidth: 45,
      topHeight: 28,
      rightWidth: 90,
      bottomHeight: 72
    });
    expect(projection.commit()).toBe(true);

    expect(svg.dataset.graphContentBaseWidth).toBe('640');
    expect(svg.dataset.graphContentBaseHeight).toBe('400');
    expect(svg.dataset.graphContentReserveLeft).toBe('45');
    expect(svg.dataset.graphContentReserveTop).toBe('28');
    expect(svg.dataset.graphContentReserveRight).toBe('90');
    expect(svg.dataset.graphContentReserveBottom).toBe('72');
    expect(svg.getAttribute('viewBox')).toBe('-45 -28 775 500');
    expect(svgBox.style.getPropertyValue('--graph-content-extra-left')).toBe('45px');
    expect(svgBox.style.getPropertyValue('--graph-content-extra-top')).toBe('28px');
    expect(svgBox.style.getPropertyValue('--graph-content-extra-right')).toBe('90px');
    expect(svgBox.style.getPropertyValue('--graph-content-extra-bottom')).toBe('72px');
    expect(svg.style.getPropertyValue('--graph-content-origin-left')).toBe('45px');
    expect(svg.style.getPropertyValue('--graph-content-origin-top')).toBe('28px');
    expect(plot.style.getPropertyValue('--graph-content-viewport-width')).toBe('730px');
    expect(plot.style.getPropertyValue('--graph-content-viewport-height')).toBe('472px');
  });

  test('removes the transient envelope when the legend is hidden', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBox.appendChild(plot);
    plot.appendChild(svg);

    chartStyle.stageLegendViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 640,
      baseHeight: 400,
      legendWidth: 180
    }).commit();
    chartStyle.stageLegendViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 640,
      baseHeight: 400,
      legendWidth: 0
    }).commit();

    expect(svgBox.dataset.graphContentEnvelope).toBeUndefined();
    expect(svgBox.style.getPropertyValue('--graph-content-extra-right')).toBe('');
    expect(plot.dataset.graphContentViewport).toBeUndefined();
    expect(plot.style.getPropertyValue('--graph-content-viewport-width')).toBe('');
    expect(svg.getAttribute('viewBox')).toBe('0 0 640 400');
  });

  test('rehydrates a cached legend envelope without changing its saved SVG viewport', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    svgBox.className = 'svgbox';
    const plot = document.createElement('div');
    const layeredPlot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.legendBaseWidth = '640';
    svg.dataset.legendBaseHeight = '400';
    svg.dataset.legendReserveWidth = '180';
    svg.setAttribute('viewBox', '-10 -5 840 420');
    svgBox.appendChild(plot);
    plot.appendChild(layeredPlot);
    layeredPlot.appendChild(svg);

    expect(chartStyle.rehydrateLegendViewports(plot)).toBe(1);
    expect(svg.getAttribute('viewBox')).toBe('-10 -5 840 420');
    expect(plot.dataset.graphContentViewport).toBe('true');
    expect(plot.style.getPropertyValue('--graph-content-viewport-width')).toBe('820px');
    expect(layeredPlot.dataset.graphContentViewport).toBeUndefined();
    expect(svgBox.dataset.graphContentEnvelope).toBe('true');
    expect(svgBox.style.getPropertyValue('--graph-content-extra-right')).toBe('180px');
  });

  test('legend envelope uses the canonical origin rather than a dragged position', () => {
    const { chartStyle } = window.Shared;
    const render = actualX => {
      const svgBox = document.createElement('div');
      svgBox.className = 'svgbox';
      const plot = document.createElement('div');
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgBox.appendChild(plot);
      plot.appendChild(svg);
      const renderer = chartStyle.createLegendRenderer({
        entries: [{ label: 'A long legend label', fill: '#06c' }],
        fontSize: 12
      });
      const legend = renderer.draw(svg, { x: actualX, y: 20, canonicalX: 650, canonicalY: 20 });
      legend.getBBox = () => ({ x: 0, y: 0, width: 150, height: 24 });
      chartStyle.stageLegendViewport({
        svgBox, plot, svg, baseWidth: 640, baseHeight: 400, legendWidth: 180
      }).commit();
      return {
        reserve: svg.dataset.legendReserveWidth,
        viewBox: svg.getAttribute('viewBox'),
        envelope: svgBox.style.getPropertyValue('--graph-content-extra-right')
      };
    };

    expect(render(200)).toEqual(render(650));
  });

  test('anchors new legend positions to the stable right reserve and keeps legacy positions readable', () => {
    const { chartStyle } = window.Shared;
    const frame = {
      defaultX: 652,
      defaultY: 40,
      reserveOriginX: 640,
      reserveOriginY: 32,
      reserveScaleX: 12,
      reserveScaleY: 300,
      legacyOriginX: 500,
      legacyOriginY: 32,
      legacyScaleX: 12,
      legacyScaleY: 300
    };

    expect(chartStyle.resolveLegendPosition(null, frame)).toMatchObject({
      x: 652,
      y: 40,
      originX: 640,
      positionAnchor: 'right-reserve'
    });
    const moved = chartStyle.resolveLegendPosition({
      x: 680,
      y: 92,
      relX: 3.333,
      relY: 0.2,
      anchor: 'right-reserve'
    }, { ...frame, reserveOriginX: 700 });
    expect(moved.x).toBeCloseTo(739.996, 3);
    expect(moved.y).toBe(92);
    expect(chartStyle.resolveLegendPosition({ relX: 2, relY: 0.2 }, frame)).toMatchObject({
      x: 524,
      y: 92
    });
  });

  test('identifies legacy legend caches without canonical viewport metadata', () => {
    const { chartStyle } = window.Shared;
    const root = document.createElement('div');
    const legend = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    legend.dataset.legendViewportContent = 'true';
    root.appendChild(legend);
    expect(chartStyle.hasCurrentLegendViewportContract(root)).toBe(false);
    legend.dataset.legendCanonicalOriginX = '650';
    expect(chartStyle.hasCurrentLegendViewportContract(root)).toBe(true);
  });

  test('wraps long legends into columns within the available graph height', () => {
    const { chartStyle } = window.Shared;
    const entries = Array.from({ length: 30 }, (_, index) => ({
      key: `sample-${index + 1}`,
      label: `WDBC-M-${String(index + 1).padStart(3, '0')}`,
      fill: '#0055cc'
    }));
    const layout = chartStyle.computeLegendLayout({
      entries,
      fontSize: 12,
      viewportHeight: 400
    });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const group = layout.renderer.draw(svg, { x: 0, y: 0 });

    expect(layout.renderer.columnCount).toBeGreaterThan(1);
    expect(layout.renderer.height).toBeLessThanOrEqual(layout.renderer.maxHeight);
    expect(Number(group.dataset.legendColumnCount)).toBe(layout.renderer.columnCount);
    const textX = Array.from(group.querySelectorAll('text')).map(node => Number(node.getAttribute('x')));
    expect(new Set(textX).size).toBe(layout.renderer.columnCount);
    const columnSizes = Array.from(new Set(textX)).map(x => textX.filter(value => value === x).length);
    expect(Math.max(...columnSizes) - Math.min(...columnSizes)).toBeLessThanOrEqual(1);
  });
  test('uses one canonical horizontal gutter for axes and legends at every font size', () => {
    const { chartStyle } = window.Shared;
    const edge = chartStyle.GRAPH_HORIZONTAL_EDGE_PADDING_PX;

    expect(edge).toBe(8);
    expect(chartStyle.resolveGraphHorizontalEdgePadding()).toBe(edge);
    expect(chartStyle.resolveGraphHorizontalEdgePadding(22)).toBe(22);

    [10, 16, 24].forEach(fontSize => {
      const axisMetrics = chartStyle.createAxisMetrics(fontSize);
      const maxYLabelWidth = 37;
      const tickReserve = maxYLabelWidth + axisMetrics.tickLength + axisMetrics.tickLabelGap;

      [false, true].forEach(hasYTitle => {
        const hidden = chartStyle.computeBaseMargins({
          fontSize,
          legendWidth: 0,
          maxYLabelWidth,
          hasYTitle,
          axisMetrics
        });
        const visible = chartStyle.computeBaseMargins({
          fontSize,
          legendWidth: 180,
          maxYLabelWidth,
          hasYTitle,
          axisMetrics
        });
        const renderedLeftEdge = hasYTitle
          ? hidden.left - tickReserve - axisMetrics.axisTitleGap - fontSize
          : hidden.left - tickReserve;

        expect(renderedLeftEdge).toBeCloseTo(edge, 8);
        expect(hidden.right).toBeCloseTo(edge, 8);
        expect(visible.right - 180).toBeCloseTo(edge, 8);
        expect(visible.left).toBeCloseTo(hidden.left, 8);
      });
    });
  });

  test('tightens a staged legend reserve to the rendered legend edge at commit', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBox.appendChild(plot);
    plot.appendChild(svg);

    const projection = chartStyle.stageLegendViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 640,
      baseHeight: 400,
      legendWidth: 180
    });
    const legend = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    legend.setAttribute('data-legend-viewport-content', 'true');
    legend.setAttribute('transform', 'translate(650,40)');
    legend.getBBox = () => ({ x: 0, y: 0, width: 100, height: 40 });
    svg.appendChild(legend);

    expect(projection.commit()).toBe(true);
    expect(svg.dataset.legendReserveWidth).toBe('118');
    expect(svg.dataset.graphContentReserveRight).toBe('118');
    expect(svg.getAttribute('viewBox')).toBe('0 0 758 400');
    expect(svgBox.style.getPropertyValue('--graph-content-extra-right')).toBe('118px');
  });

  test('preserves non-legend right reserves while tightening the rendered legend tail', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBox.appendChild(plot);
    plot.appendChild(svg);

    const projection = chartStyle.stageGraphContentViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 640,
      baseHeight: 400,
      rightWidth: 240,
      legendWidth: 180
    });
    const legend = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    legend.setAttribute('data-legend-viewport-content', 'true');
    legend.setAttribute('transform', 'translate(710,40)');
    legend.getBBox = () => ({ x: 0, y: 0, width: 100, height: 40 });
    svg.appendChild(legend);

    projection.commit();
    expect(svg.dataset.legendReserveWidth).toBe('118');
    expect(svg.dataset.graphContentReserveRight).toBe('178');
    expect(svg.getAttribute('viewBox')).toBe('0 0 818 400');
    expect(svgBox.style.getPropertyValue('--graph-content-extra-right')).toBe('178px');
  });

  test('preserves canonical plot height and varies width for equal-aspect plots', () => {
    const { chartStyle } = window.Shared;
    const margin = { top: 40, right: 8, bottom: 70, left: 80 };
    const fitted = chartStyle.fitPlotAspectPreservingHeight(640, 400, margin, 1);

    expect(fitted.margin.left).toBe(80);
    expect(fitted.margin.right).toBe(270);
    expect(fitted.plotW).toBe(290);
    expect(fitted.plotH).toBe(290);
    expect(fitted.rightExtension).toBe(0);
    expect(fitted.renderWidth).toBe(640);
  });

  test('extends only width when the requested aspect is wider than the frame', () => {
    const { chartStyle } = window.Shared;
    const margin = { top: 40, right: 8, bottom: 70, left: 80 };
    const fitted = chartStyle.fitPlotAspectPreservingHeight(640, 400, margin, 3);

    expect(fitted.margin).toEqual(margin);
    expect(fitted.plotW).toBe(870);
    expect(fitted.plotH).toBe(290);
    expect(fitted.rightExtension).toBe(318);
    expect(fitted.renderWidth).toBe(958);
  });

  test('shared legend renderer publishes deterministic local content bounds', () => {
    const { chartStyle } = window.Shared;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const renderer = chartStyle.createLegendRenderer({
      entries: [
        { label: 'Series A', fill: '#0066cc' },
        { label: 'Series B', fill: '#cc3300' }
      ],
      fontSize: 12
    });
    const legend = renderer.draw(svg, { x: 650, y: 40 });

    expect(legend.dataset.legendViewportContent).toBe('true');
    expect(legend.dataset.legendContentX).toBe('0');
    expect(legend.dataset.legendContentY).toBe('0');
    expect(Number(legend.dataset.legendContentWidth)).toBe(renderer.width);
    expect(Number(legend.dataset.legendContentHeight)).toBe(renderer.height);
    expect(Number(legend.dataset.legendContentFontSize)).toBe(renderer.fontSize);
  });

});
