describe('Box live style refresh', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  beforeEach(() => {
    document.body.innerHTML = `
      <input id="boxColorIndividual" type="radio" checked>
      <input id="boxColorUnified" type="radio">
      <div id="boxPlot">
        <svg id="boxSvg">
          <rect data-box-shape="body" data-trace="4" data-color-index="1"></rect>
          <g data-export-layer="box-points" data-trace="4" data-style-trace="4" data-color-index="1">
            <circle></circle>
          </g>
          <line data-summary-line="1" data-trace="4" data-color-index="1"></line>
          <g data-box-legend="1"><rect data-legend-swatch="1" data-legend-index="1"></rect></g>
          <path class="box-significance-annotation"></path>
        </svg>
      </div>
    `;
  });

  test('recolors non-Strip marks in place without replacing the SVG', () => {
    const svg = document.getElementById('boxSvg');
    const applied = hooks.tryApplyBoxPaletteLive({
      plot: document.getElementById('boxPlot'),
      graphType: 'box',
      pointMode: 'overlay',
      colorScheme: 'scientific',
      colors: ['#0072b2', '#d55e00'],
      borderColors: ['#003f63', '#7f3600'],
      summaryStyles: { 4: { color: '#123456' } }
    });

    expect(applied).toBe(true);
    expect(document.getElementById('boxSvg')).toBe(svg);
    expect(svg.querySelector('[data-box-shape="body"]').getAttribute('fill')).toBe('#d55e00');
    expect(svg.querySelector('[data-box-shape="body"]').getAttribute('stroke')).toBe('#7f3600');
    expect(svg.querySelector('[data-export-layer="box-points"] circle').getAttribute('fill')).toBe('#FFFFFF');
    expect(svg.querySelector('[data-export-layer="box-points"] circle').getAttribute('stroke')).toBe('#7f3600');
    expect(svg.querySelector('[data-summary-line="1"]').getAttribute('stroke')).toBe('#123456');
    expect(svg.querySelector('[data-legend-swatch="1"]').getAttribute('fill')).toBe('#d55e00');
  });

  test('trace border overrides do not become symbol border defaults', () => {
    const applied = hooks.tryApplyBoxPaletteLive({
      plot: document.getElementById('boxPlot'),
      graphType: 'bar',
      pointMode: 'overlay',
      colorScheme: 'custom',
      colors: ['#808080', '#808080'],
      borderColors: ['#000000', '#000000'],
      shapeStyles: { 4: { stroke: '#ff0000', borderColor: '#ff0000' } }
    });

    expect(applied).toBe(true);
    expect(document.querySelector('[data-box-shape="body"]').getAttribute('stroke')).toBe('#ff0000');
    expect(document.querySelector('[data-export-layer="box-points"] circle').getAttribute('stroke')).toBe('#000000');
  });
});
