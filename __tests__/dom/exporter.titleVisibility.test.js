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
});
