describe('SVG export preserves statistical figure-summary text geometry', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../../js/shared/exporter.js');
  });

  test('converts summary hanging baselines to explicit export y offsets', () => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '400');
    svg.setAttribute('height', '360');
    svg.setAttribute('viewBox', '0 0 400 360');

    const originalY = [];
    const fontSizes = [];
    ['title', 'section', 'label', 'value'].forEach((role, index) => {
      const text = document.createElementNS(svgNS, 'text');
      text.setAttribute('x', '10');
      const y = 20 + index * 20;
      const fontSize = role === 'title' ? 9.7 : 8.9;
      originalY.push(y);
      fontSizes.push(fontSize);
      text.setAttribute('y', String(y));
      text.setAttribute('font-size', String(fontSize));
      text.setAttribute('dominant-baseline', 'hanging');
      text.setAttribute('data-stats-summary-role', role);
      if (role === 'title') {
        text.textContent = 'Statistics';
      } else {
        const firstLine = document.createElementNS(svgNS, 'tspan');
        firstLine.setAttribute('x', '10');
        firstLine.setAttribute('dy', '0');
        firstLine.textContent = role;
        const secondLine = document.createElementNS(svgNS, 'tspan');
        secondLine.setAttribute('x', '10');
        secondLine.setAttribute('dy', '11.4');
        secondLine.textContent = role === 'value' ? 'p = 0.0004' : 'detail';
        text.append(firstLine, secondLine);
      }
      svg.appendChild(text);
    });

    const xml = window.Shared.exporter.svgElementToXml(svg, 'stats-figure-summary-export');
    const parsed = new DOMParser().parseFromString(xml, 'image/svg+xml');
    const texts = [...parsed.querySelectorAll('text')];

    expect(texts).toHaveLength(4);
    expect(texts.every(node => !node.hasAttribute('dominant-baseline'))).toBe(true);
    expect(texts.every(node => !node.hasAttribute('dy'))).toBe(true);
    texts.forEach((node, index) => {
      expect(Number(node.getAttribute('y'))).toBeCloseTo(originalY[index] + fontSizes[index] * 0.8, 2);
    });
    expect([...parsed.querySelectorAll('tspan')].map(node => node.getAttribute('dy')))
      .toEqual(['0', '11.4', '0', '11.4', '0', '11.4']);
    expect(texts.every(node => !node.hasAttribute('data-stats-summary-role'))).toBe(true);
  });
});
