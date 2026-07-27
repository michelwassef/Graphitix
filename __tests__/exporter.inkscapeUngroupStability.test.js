describe('SVG export remains visually stable when Inkscape ungroups the paste wrapper', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../js/shared/exporter.js');
  });

  test('materializes round-cap zero-dash lines as vector dots and resolves em-based dy offsets', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '100');
    svg.setAttribute('height', '50');
    svg.setAttribute('viewBox', '0 0 100 50');

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '10');
    line.setAttribute('y1', '20');
    line.setAttribute('x2', '30');
    line.setAttribute('y2', '20');
    line.setAttribute('stroke', '#123456');
    line.setAttribute('stroke-width', '2');
    line.setAttribute('stroke-dasharray', '0 4');
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('class', 'zero-reference-line');
    svg.appendChild(line);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', '10');
    label.setAttribute('y', '40');
    label.setAttribute('font-size', '8px');
    label.setAttribute('dy', '0.35em');
    label.textContent = 'Category';
    svg.appendChild(label);

    const xml = window.Shared.exporter.svgElementToXml(svg, 'inkscape-ungroup-test');
    const parsed = new DOMParser().parseFromString(xml, 'image/svg+xml');
    const root = parsed.documentElement;

    expect(root.querySelector(':scope > g#export-group')).not.toBeNull();
    expect(root.querySelector('line[stroke-dasharray]')).toBeNull();

    const dottedGroup = root.querySelector('g[data-export-dotted-line="true"]');
    expect(dottedGroup).not.toBeNull();
    expect(dottedGroup.getAttribute('data-export-object')).toBe('dotted-line');
    expect(dottedGroup.classList.contains('graphitix-dotted-line')).toBe(true);
    expect(dottedGroup.classList.contains('zero-reference-line')).toBe(true);
    expect(dottedGroup.parentElement).toBe(root.querySelector(':scope > g#export-group'));
    expect(dottedGroup.querySelectorAll(':scope > circle')).toHaveLength(6);
    expect(dottedGroup.querySelector('circle').getAttribute('r')).toBe('1');
    expect(dottedGroup.querySelector('circle').getAttribute('fill')).toBe('#123456');

    const exportedLabel = root.querySelector('text');
    expect(exportedLabel.getAttribute('dy')).toBe('2.8');
    expect(exportedLabel.getAttribute('dy')).not.toContain('em');
  });
});
