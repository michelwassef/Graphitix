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
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.legendBaseWidth = '640';
    svg.dataset.legendBaseHeight = '400';
    svg.dataset.legendReserveWidth = '180';
    svg.setAttribute('viewBox', '-10 -5 840 420');
    svgBox.appendChild(plot);
    plot.appendChild(svg);

    expect(chartStyle.rehydrateLegendViewports(plot)).toBe(1);
    expect(svg.getAttribute('viewBox')).toBe('-10 -5 840 420');
    expect(plot.dataset.graphContentViewport).toBe('true');
    expect(plot.style.getPropertyValue('--graph-content-viewport-width')).toBe('820px');
    expect(svgBox.dataset.graphContentEnvelope).toBe('true');
    expect(svgBox.style.getPropertyValue('--graph-content-extra-right')).toBe('180px');
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
});
