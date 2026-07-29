describe('Shared.gridControls live projection', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.Shared = {};
    jest.resetModules();
    require('../js/shared/gridControls.js');
  });

  test('updates rendered grid style and rebuilds its hit layer without replacing the SVG', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const line = document.createElementNS(svg.namespaceURI, 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', '100');
    line.setAttribute('stroke', '#dddddd');
    line.setAttribute('stroke-width', '1.5');
    line.setAttribute('data-grid-control', '1');
    svg.appendChild(line);
    document.body.appendChild(svg);

    window.Shared.gridControls.registerGraphElement(svg, {
      scopeId: 'hist',
      getStyle: () => ({ color: '#dddddd', thickness: 1, pattern: 'solid', transparency: 0 })
    });

    expect(window.Shared.gridControls.applyStyleToTarget(svg, {
      color: '#123456',
      thickness: 2,
      pattern: 'dashed',
      transparency: 25
    })).toBe(true);
    expect(line.getAttribute('stroke')).toBe('#123456');
    expect(line.getAttribute('stroke-width')).toBe('3');
    expect(line.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(line.getAttribute('stroke-opacity')).toBe('0.75');
    expect(svg.querySelector('[data-grid-hit-overlay="1"]')).toBeTruthy();
  });

  test('declines projection when the committed frame has no grid targets', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);
    expect(window.Shared.gridControls.applyStyleToTarget(svg, {
      color: '#123456',
      thickness: 2,
      pattern: 'solid',
      transparency: 0
    })).toBe(false);
  });
});
