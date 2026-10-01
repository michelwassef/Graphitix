describe('SVG export title visibility', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../../js/shared/exporter.js');
  });

  function createText(svg, role, text, hidden = false) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    node.setAttribute('data-font-role', role);
    if (hidden) {
      node.dataset.fontHidden = 'true';
      node.style.visibility = 'hidden';
    }
    node.textContent = text;
    svg.appendChild(node);
    return node;
  }

  test('removes hidden graph and axis titles from the exported SVG while preserving the live SVG', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '240');
    svg.setAttribute('height', '160');
    svg.setAttribute('viewBox', '0 0 240 160');
    const graphTitle = createText(svg, 'graphTitle', 'Graph title', true);
    const xTitle = createText(svg, 'xTitle', 'X axis', true);
    createText(svg, 'yTitle', 'Y axis');
    createText(svg, 'legend', 'Legend');

    const xml = window.Shared.exporter.svgElementToXml(svg, 'title-visibility-export');
    const parsed = new DOMParser().parseFromString(xml, 'image/svg+xml');

    const exportedText = [...parsed.querySelectorAll('text')].map(node => node.textContent);
    expect(exportedText).not.toContain('Graph title');
    expect(exportedText).not.toContain('X axis');
    expect(exportedText).toContain('Y axis');
    expect(exportedText).toContain('Legend');
    expect(svg.contains(graphTitle)).toBe(true);
    expect(svg.contains(xTitle)).toBe(true);
    expect(graphTitle.style.visibility).toBe('hidden');
    expect(xTitle.style.visibility).toBe('hidden');
  });

  test('preserves explicit multiline title baselines and alignment in static SVG', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '240');
    svg.setAttribute('height', '160');
    svg.setAttribute('viewBox', '-8 -16 256 192');
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    title.setAttribute('data-font-role', 'graphTitle');
    title.setAttribute('data-title-block-text', 'A longer title\nshort');
    title.setAttribute('data-title-text-align', 'right');

    const firstLine = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    firstLine.setAttribute('data-title-line', '1');
    firstLine.setAttribute('x', '120');
    firstLine.setAttribute('y', '22');
    firstLine.setAttribute('text-anchor', 'end');
    firstLine.textContent = 'A longer title';
    const secondLine = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
    secondLine.setAttribute('data-title-line', '1');
    secondLine.setAttribute('x', '120');
    secondLine.setAttribute('y', '38');
    secondLine.setAttribute('text-anchor', 'end');
    secondLine.textContent = 'short';
    title.append(firstLine, secondLine);
    svg.appendChild(title);

    const xml = window.Shared.exporter.svgElementToXml(svg, 'multiline-title-export');
    const parsed = new DOMParser().parseFromString(xml, 'image/svg+xml');
    const exportedTitle = parsed.querySelector('text');
    const exportedLines = [...(exportedTitle?.querySelectorAll('tspan') || [])];

    expect(parsed.querySelector('svg').getAttribute('viewBox')).toBe('-8 -16 256 192');
    expect(exportedTitle.textContent).toBe('A longer titleshort');
    expect(exportedLines.map(node => node.getAttribute('y'))).toEqual(['22', '38']);
    expect(exportedLines.map(node => node.getAttribute('text-anchor'))).toEqual(['end', 'end']);
    expect(exportedLines.every(node => !node.hasAttribute('data-title-line'))).toBe(true);
    expect(title.querySelectorAll('tspan[data-title-line="1"]')).toHaveLength(2);
  });
});
