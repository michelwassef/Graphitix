describe('exporter significance hit overlay cleanup', () => {
  let exporter;

  beforeAll(() => {
    require('../js/shared/exporter.js');
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
});
