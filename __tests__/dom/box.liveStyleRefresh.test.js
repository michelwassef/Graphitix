const { loadComponentTestBootstrap } = require('../../test-support/componentTestBootstrap');

describe('Box live style refresh', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    loadComponentTestBootstrap('box');
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

  test('keeps box and notched median overlays distinct from the colored body', () => {
    const svg = document.getElementById('boxSvg');
    const median = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    median.setAttribute('data-summary-line', '1');
    median.setAttribute('data-box-overlay-kind', 'box-median');
    median.setAttribute('data-trace', '4');
    median.setAttribute('data-color-index', '1');
    svg.appendChild(median);

    const applied = hooks.tryApplyBoxPaletteLive({
      plot: document.getElementById('boxPlot'),
      graphType: 'notched',
      colorScheme: 'scientific',
      colors: ['#0072b2', '#d55e00'],
      borderColors: ['#003f63', '#7f3600']
    });

    expect(applied).toBe(true);
    expect(median.getAttribute('stroke')).toBe('#7f3600');
    expect(median.getAttribute('stroke')).not.toBe('#d55e00');
  });

  test('preserves the fill-based live color for Strip summaries', () => {
    const applied = hooks.tryApplyBoxPaletteLive({
      plot: document.getElementById('boxPlot'),
      graphType: 'strip',
      colorScheme: 'scientific',
      colors: ['#0072b2', '#d55e00'],
      borderColors: ['#003f63', '#7f3600']
    });

    expect(applied).toBe(true);
    expect(document.querySelector('[data-summary-line="1"]').getAttribute('stroke')).toBe('#d55e00');
  });

  test('preserves the white Violin inset while recoloring its border', () => {
    const inset = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    inset.setAttribute('data-box-shape', 'body');
    inset.setAttribute('data-box-violin-summary', '1');
    inset.setAttribute('data-trace', '4');
    inset.setAttribute('data-color-index', '1');
    inset.setAttribute('fill', '#fff');
    document.getElementById('boxSvg').appendChild(inset);

    const applied = hooks.tryApplyBoxPaletteLive({
      plot: document.getElementById('boxPlot'),
      graphType: 'violin',
      colorScheme: 'soft',
      colors: ['#4e79a7', '#e15759'],
      borderColors: ['#375a80', '#a83d3f']
    });

    expect(applied).toBe(true);
    expect(inset.getAttribute('fill')).toBe('#fff');
    expect(inset.getAttribute('stroke')).toBe('#a83d3f');
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
