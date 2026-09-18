describe('chartStyle legend viewport', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../../js/shared/chartStyle.js');
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

  test('extends the outer viewport when a canonical legend is taller than the graph frame', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const legend = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    legend.setAttribute('data-legend-viewport-content', 'true');
    legend.dataset.legendCanonicalOriginX = '652';
    legend.dataset.legendCanonicalOriginY = '260';
    legend.getBBox = jest.fn(() => ({ x: 0, y: 0, width: 160, height: 240 }));
    svgBox.appendChild(plot);
    plot.appendChild(svg);
    svg.appendChild(legend);

    const projection = chartStyle.stageLegendViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 640,
      baseHeight: 400,
      legendWidth: 180
    });

    expect(projection.commit()).toBe(true);
    expect(svg.getAttribute('viewBox')).toBe('0 0 820 500');
    expect(svgBox.style.getPropertyValue('--graph-content-extra-bottom')).toBe('100px');
    expect(plot.style.getPropertyValue('--graph-content-viewport-height')).toBe('500px');
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

  test('does not include the statistical summary in refined graph bounds', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const summary = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    summary.setAttribute('data-stats-figure-summary', '1');
    svg.appendChild(summary);
    svgBox.appendChild(plot);
    plot.appendChild(svg);
    svg.getBBox = jest.fn(() => summary.parentNode
      ? { x: 0, y: 0, width: 640, height: 400 }
      : { x: 0, y: 0, width: 640, height: 120 });

    const projection = chartStyle.stageGraphContentViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 640,
      baseHeight: 120,
      refineContentBounds: true
    });

    expect(projection.commit()).toBe(true);
    expect(svg.getBBox).toHaveBeenCalled();
    expect(svg.querySelector('g[data-stats-figure-summary="1"]')).toBe(summary);
    expect(svg.dataset.graphContentReserveBottom).toBe('0');
    expect(svg.getAttribute('viewBox')).toBe('0 0 640 120');
  });

  test('preserves a carried statistical summary envelope during frame staging', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const summary = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    summary.setAttribute('data-stats-figure-summary', '1');
    summary.dataset.statsSummaryReserveBottom = '80';
    svg.dataset.statsFigureSummaryCarried = '1';
    svg.dataset.statsFigureSummaryCarryReserveBottom = '80';
    svg.appendChild(summary);
    svgBox.appendChild(plot);
    plot.appendChild(svg);

    const projection = chartStyle.stageGraphContentViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 640,
      baseHeight: 120,
      bottomHeight: 20,
      refineContentBounds: false
    });

    expect(projection.commit()).toBe(true);
    expect(projection.measure().bottomHeight).toBe(20);
    expect(projection.getViewport().bottomHeight).toBe(20);
    expect(svg.dataset.graphContentReserveBottom).toBe('100');
    expect(svg.getAttribute('viewBox')).toBe('0 0 640 220');
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

  test('rehydrates a 3D envelope idempotently from its authoritative viewport', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    svgBox.className = 'svgbox';
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBox.appendChild(plot);
    plot.appendChild(svg);
    const safeViewport = {
      baseWidth: 820,
      baseHeight: 400,
      minX: -36,
      minY: -36,
      maxX: 856,
      maxY: 436,
      left: 36,
      top: 36,
      right: 36,
      bottom: 36,
      rotationLimits: { x: { min: -Math.PI, max: Math.PI } }
    };
    const projection = chartStyle.stagePlot3dViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 640,
      baseHeight: 400,
      canonicalWidth: 820,
      canonicalHeight: 400,
      legendWidth: 180,
      safeViewport
    });
    projection.commit();
    const initialViewBox = svg.getAttribute('viewBox');
    const initialEnvelope = [
      svgBox.style.getPropertyValue('--graph-content-extra-left'),
      svgBox.style.getPropertyValue('--graph-content-extra-top'),
      svgBox.style.getPropertyValue('--graph-content-extra-right'),
      svgBox.style.getPropertyValue('--graph-content-extra-bottom')
    ];
    svg.getBBox = jest.fn(() => ({ x: -500, y: -500, width: 5000, height: 5000 }));

    expect(chartStyle.rehydrateContentViewports(plot)).toBe(1);
    expect(svg.getAttribute('viewBox')).toBe(initialViewBox);
    expect([
      svgBox.style.getPropertyValue('--graph-content-extra-left'),
      svgBox.style.getPropertyValue('--graph-content-extra-top'),
      svgBox.style.getPropertyValue('--graph-content-extra-right'),
      svgBox.style.getPropertyValue('--graph-content-extra-bottom')
    ]).toEqual(initialEnvelope);
    expect(svg.getBBox).not.toHaveBeenCalled();
    expect(svg.dataset.plot3dViewport).toBe('true');
  });

  test('allows direct 3D SVGs to keep legend width inside the graph box', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    svgBox.className = 'svgbox';
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgBox.appendChild(plot);
    plot.appendChild(svg);

    const projection = chartStyle.stagePlot3dViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 456,
      baseHeight: 456,
      canonicalWidth: 476.552,
      canonicalHeight: 456,
      legendWidth: 20.552,
      applyOuterEnvelope: false,
      safeViewport: { minX: 0, minY: 0, maxX: 476.552, maxY: 456 }
    });
    projection.commit();

    expect(svg.getAttribute('viewBox')).toBe('0 0 476.552 456');
    expect(svg.dataset.plot3dOuterEnvelope).toBe('false');
    expect(svgBox.dataset.graphContentEnvelope).toBeUndefined();
    expect(svgBox.style.getPropertyValue('--graph-content-extra-right')).toBe('');

    expect(chartStyle.rehydratePlot3dViewports(svgBox)).toBe(1);
    expect(svgBox.dataset.graphContentEnvelope).toBeUndefined();
    expect(svgBox.style.getPropertyValue('--graph-content-extra-right')).toBe('');
  });

  test('rehydrates a cached 3D viewport without dropping its mounted figure-summary reserve', () => {
    const { chartStyle } = window.Shared;
    const svgBox = document.createElement('div');
    svgBox.className = 'svgbox';
    const plot = document.createElement('div');
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const summary = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    summary.dataset.statsFigureSummary = '1';
    summary.dataset.statsSummaryReserveBottom = '82';
    svgBox.appendChild(plot);
    plot.appendChild(svg);
    svg.appendChild(summary);

    chartStyle.stagePlot3dViewport({
      svgBox,
      plot,
      svg,
      baseWidth: 456,
      baseHeight: 456,
      canonicalWidth: 476.552,
      canonicalHeight: 456,
      legendWidth: 20.552,
      applyOuterEnvelope: false,
      safeViewport: { minX: 0, minY: 0, maxX: 476.552, maxY: 456 }
    }).commit();
    Object.assign(svg.dataset, {
      statsFigureSummaryBaseWidth:'456',
      statsFigureSummaryBaseHeight:'456',
      statsFigureSummaryBaseReserveRight:'20.552',
      statsFigureSummaryBaseReserveBottom:'0',
      statsFigureSummaryBaseReserveLeft:'0',
      statsFigureSummaryBaseReserveTop:'0',
      statsFigureSummaryBaseEnvelopeMinX:'0',
      statsFigureSummaryBaseEnvelopeMinY:'0',
      statsFigureSummaryBaseEnvelopeMaxX:'476.552',
      statsFigureSummaryBaseEnvelopeMaxY:'456',
      statsFigureSummaryReserveBottom:'82',
      statsFigureSummaryRenderedScaleX:'1',
      statsFigureSummaryRenderedScaleY:'1'
    });
    chartStyle.stageGraphContentViewport({
      svgBox,
      plot,
      svg,
      baseWidth:456,
      baseHeight:456,
      rightWidth:20.552,
      legendWidth:20.552,
      bottomHeight:82,
      contentBounds:{ minX:0, minY:0, maxX:476.552, maxY:538 },
      refineContentBounds:false,
      refineLegendReserve:false,
      includeCarriedStatsFigureSummary:false
    }).commit();
    const cachedViewBox = svg.getAttribute('viewBox');

    expect(chartStyle.rehydratePlot3dViewports(svgBox)).toBe(1);
    expect(svg.getAttribute('viewBox')).toBe(cachedViewBox);
    expect(svg.getAttribute('height')).toBe('538');
    expect(svg.dataset.graphContentReserveBottom).toBe('82');
    expect(svg.querySelector('g[data-stats-figure-summary="1"]')).toBe(summary);
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

  test('keeps a short-frame legend vertical instead of expanding sideways', () => {
    const { chartStyle } = window.Shared;
    const entries = Array.from({ length: 6 }, (_, index) => ({
      key: `subject-${index + 1}`,
      label: `Subject ${index + 1}`,
      fill: '#0055cc'
    }));
    const layout = chartStyle.computeLegendLayout({
      entries,
      fontSize: 16,
      viewportHeight: 110
    });

    expect(layout.renderer.columnCount).toBe(1);
    expect(layout.renderer.width).toBeLessThan(200);
    expect(layout.renderer.height).toBeGreaterThan(layout.renderer.maxHeight);
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
