describe('exporter significance hit overlay cleanup', () => {
  let exporter;

  beforeAll(() => {
    require('../../js/shared/exporter.js');
    exporter = window.Shared?.exporter;
  });

  test('strips widened significance hit overlays from exported svg', () => {
    expect(exporter).toBeTruthy();
    expect(typeof exporter.svgElementToXml).toBe('function');

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '400');
    svg.setAttribute('height', '300');
    svg.setAttribute('viewBox', '0 0 400 300');

    const visiblePath = document.createElementNS(svgNS, 'path');
    visiblePath.setAttribute('id', 'sig-visible');
    visiblePath.setAttribute('d', 'M10,40 L10,20 L90,20 L90,40');
    visiblePath.setAttribute('stroke', '#000');
    visiblePath.setAttribute('fill', 'none');
    visiblePath.setAttribute('stroke-width', '1.5');
    visiblePath.setAttribute('data-significance-control', '1');
    svg.appendChild(visiblePath);

    const hitOverlay = document.createElementNS(svgNS, 'path');
    hitOverlay.setAttribute('id', 'sig-hit');
    hitOverlay.setAttribute('d', 'M10,40 L10,20 L90,20 L90,40');
    hitOverlay.setAttribute('stroke', 'transparent');
    hitOverlay.setAttribute('fill', 'none');
    hitOverlay.setAttribute('stroke-width', '12');
    hitOverlay.setAttribute('pointer-events', 'stroke');
    hitOverlay.setAttribute('data-significance-control', '1');
    hitOverlay.setAttribute('data-significance-hit-overlay', '1');
    hitOverlay.setAttribute('data-export-ignore', '1');
    svg.appendChild(hitOverlay);

    const legacyRect = document.createElementNS(svgNS, 'rect');
    legacyRect.setAttribute('id', 'sig-rect');
    legacyRect.setAttribute('x', '0');
    legacyRect.setAttribute('y', '0');
    legacyRect.setAttribute('width', '100');
    legacyRect.setAttribute('height', '50');
    legacyRect.setAttribute('fill', 'transparent');
    legacyRect.setAttribute('pointer-events', 'all');
    legacyRect.setAttribute('data-significance-control', '1');
    svg.appendChild(legacyRect);

    const xml = exporter.svgElementToXml(svg, 'significance-hit-overlay-test');
    expect(typeof xml).toBe('string');
    expect(xml.length).toBeGreaterThan(0);

    const parsed = new DOMParser().parseFromString(xml, 'image/svg+xml');
    expect(parsed.querySelector('#sig-visible')).not.toBeNull();
    expect(parsed.querySelector('#sig-hit')).toBeNull();
    expect(parsed.querySelector('#sig-rect')).toBeNull();
  });

  test('removes live chart-point keyboard semantics from static SVG output', () => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100');
    svg.setAttribute('height', '50');
    svg.setAttribute('viewBox', '0 0 100 50');
    const point = document.createElementNS(svgNS, 'circle');
    point.setAttribute('cx', '20');
    point.setAttribute('cy', '20');
    point.setAttribute('r', '4');
    point.setAttribute('tabindex', '-1');
    point.setAttribute('role', 'button');
    point.setAttribute('aria-label', 'Sample A, value 2');
    point.setAttribute('data-chart-point-keyboard', 'true');
    svg.appendChild(point);

    const xml = exporter.svgElementToXml(svg, 'chart-point-keyboard-static-export');
    const exported = new DOMParser().parseFromString(xml, 'image/svg+xml');
    const exportedPoint = exported.querySelector('circle');
    expect(exportedPoint).not.toBeNull();
    expect(exportedPoint.hasAttribute('tabindex')).toBe(false);
    expect(exportedPoint.hasAttribute('role')).toBe(false);
    expect(exportedPoint.hasAttribute('aria-label')).toBe(false);
    expect(exportedPoint.hasAttribute('data-chart-point-keyboard')).toBe(false);
  });

  test('removes keyboard-only plot navigation and transparent hit-layer semantics from static SVG output', () => {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '100');
    svg.setAttribute('height', '50');
    svg.setAttribute('viewBox', '0 0 100 50');
    svg.setAttribute('class', 'chart-point-navigation-root');
    svg.setAttribute('role', 'group');
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('aria-label', 'Scatter chart');
    svg.setAttribute('aria-description', 'Use arrow keys to navigate data points.');
    svg.setAttribute('aria-keyshortcuts', 'ArrowRight ArrowLeft');
    const navigationSurface = document.createElementNS(svgNS, 'rect');
    navigationSurface.setAttribute('class', 'chart-point-navigation-root');
    navigationSurface.setAttribute('data-heatmap-cell-hit-layer', '1');
    navigationSurface.setAttribute('role', 'button');
    navigationSurface.setAttribute('tabindex', '0');
    navigationSurface.setAttribute('aria-rowindex', '1');
    navigationSurface.setAttribute('aria-colindex', '1');
    navigationSurface.setAttribute('aria-label', 'Heatmap cell, row 1, column 1.');
    svg.appendChild(navigationSurface);
    const visibleMark = document.createElementNS(svgNS, 'circle');
    visibleMark.setAttribute('cx', '20');
    visibleMark.setAttribute('cy', '20');
    visibleMark.setAttribute('r', '4');
    svg.appendChild(visibleMark);

    const xml = exporter.svgElementToXml(svg, 'chart-navigation-static-export');
    const exported = new DOMParser().parseFromString(xml, 'image/svg+xml');
    const exportedRoot = exported.querySelector('svg.chart-point-navigation-root');
    const exportedSurface = exported.querySelector('rect.chart-point-navigation-root');
    expect(exportedRoot).not.toBeNull();
    expect(exportedRoot.getAttribute('role')).toBe('group');
    expect(exportedRoot.getAttribute('aria-label')).toBe('Scatter chart');
    expect(exportedRoot.hasAttribute('tabindex')).toBe(false);
    expect(exportedRoot.hasAttribute('aria-description')).toBe(false);
    expect(exportedRoot.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(exportedSurface).not.toBeNull();
    expect(Array.from(exportedSurface.attributes).some(attribute => attribute.name === 'role' || attribute.name === 'tabindex' || attribute.name.startsWith('aria-'))).toBe(false);
    expect(exported.querySelector('circle')).not.toBeNull();
    expect(svg.getAttribute('tabindex')).toBe('0');
    expect(navigationSurface.getAttribute('aria-rowindex')).toBe('1');
  });
});
