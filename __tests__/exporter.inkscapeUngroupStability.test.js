describe('SVG export remains visually stable when Inkscape ungroups the paste wrapper', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../js/shared/exportProjection.js');
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

    const exportGroup = root.querySelector('g#export-group');
    expect(exportGroup).not.toBeNull();
    expect(exportGroup.parentElement).toBe(root);
    expect(root.querySelector('line[stroke-dasharray]')).toBeNull();

    const dottedGroup = root.querySelector('g.graphitix-dotted-line');
    expect(dottedGroup).not.toBeNull();
    expect(dottedGroup.classList.contains('graphitix-dotted-line')).toBe(true);
    expect(dottedGroup.classList.contains('zero-reference-line')).toBe(true);
    expect(dottedGroup.parentElement).toBe(exportGroup);
    expect(dottedGroup.querySelectorAll(':scope > circle')).toHaveLength(6);
    expect(dottedGroup.querySelector('circle').getAttribute('r')).toBe('1');
    expect(dottedGroup.querySelector('circle').getAttribute('fill')).toBe('#123456');

    const exportedLabel = root.querySelector('text');
    expect(exportedLabel.getAttribute('dy')).toBe('2.8');
    expect(exportedLabel.getAttribute('dy')).not.toContain('em');
  });

  test('keeps the physical size and aspect ratio when Inkscape imports only the paste group', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 800 200');
    svg.setAttribute('preserveAspectRatio', 'none');

    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', '0');
    rect.setAttribute('y', '0');
    rect.setAttribute('width', '800');
    rect.setAttribute('height', '200');
    svg.appendChild(rect);

    const xml = window.Shared.exporter.svgElementToXml(svg, 'inkscape-physical-paste-test', {
      ownerFrame: { width: 400, height: 200 }
    });
    const parsed = new DOMParser().parseFromString(xml, 'image/svg+xml');
    const root = parsed.documentElement;
    const exportGroup = root.querySelector('g#export-group');

    expect(root.getAttribute('width')).toBe('400');
    expect(root.getAttribute('height')).toBe('200');
    expect(root.getAttribute('viewBox')).toBe('0 0 400 200');
    expect(exportGroup).not.toBeNull();
    expect(exportGroup.parentElement).toBe(root);
    expect(exportGroup.getAttribute('transform')).toBe('matrix(0.5 0 0 1 0 0)');

    const matrix = exportGroup.getAttribute('transform')
      .match(/matrix\(([^)]+)\)/)[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    const projectedWidth = Number(rect.getAttribute('width')) * matrix[0];
    const projectedHeight = Number(rect.getAttribute('height')) * matrix[3];
    expect(projectedWidth).toBe(400);
    expect(projectedHeight).toBe(200);
  });

  test('preserves meet alignment and an existing graph-group transform inside the paste wrapper', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '10 20 100 50');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    const plotGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    plotGroup.setAttribute('id', 'plot-group');
    plotGroup.setAttribute('transform', 'translate(2 3)');
    plotGroup.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'path'));
    svg.appendChild(plotGroup);

    const xml = window.Shared.exporter.svgElementToXml(svg, 'inkscape-meet-paste-test', {
      ownerFrame: { width: 400, height: 300 }
    });
    const root = new DOMParser().parseFromString(xml, 'image/svg+xml').documentElement;
    const exportGroup = root.querySelector('g#export-group');
    const exportedPlotGroup = root.querySelector('g#plot-group');

    expect(root.getAttribute('viewBox')).toBe('0 0 400 300');
    expect(exportGroup.parentElement).toBe(root);
    expect(exportGroup.getAttribute('transform')).toBe('matrix(4 0 0 4 -40 -30)');
    expect(exportedPlotGroup.parentElement).toBe(exportGroup);
    expect(exportedPlotGroup.getAttribute('transform')).toBe('translate(2 3)');
  });
});
