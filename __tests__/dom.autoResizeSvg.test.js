describe('Shared.autoResizeSvg aspect-lock viewport', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';
    window.Shared = {};
    require('../js/shared/dom.js');
  });

  function createSvg({ locked = true } = {}) {
    const box = document.createElement('div');
    box.className = 'svgbox';
    box.dataset.resizerAspectLocked = locked ? 'true' : 'false';
    box.getBoundingClientRect = () => ({
      width: 600,
      height: 300,
      top: 0,
      left: 0,
      right: 600,
      bottom: 300
    });

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.getBBox = () => ({
      x: 0,
      y: 0,
      width: 300,
      height: 300
    });
    svg.getBoundingClientRect = () => ({
      width: 600,
      height: 300,
      top: 0,
      left: 0,
      right: 600,
      bottom: 300
    });

    box.appendChild(svg);
    document.body.appendChild(box);
    return { box, svg };
  }

  function readViewBox(svg) {
    return String(svg.getAttribute('viewBox') || '')
      .trim()
      .split(/\s+/)
      .map(Number);
  }

  test('keeps the SVG filling the box when aspect is locked', () => {
    const { svg } = createSvg({ locked: true });

    window.Shared.autoResizeSvg(svg, { padding: 0, remeasure: false });

    const [minX, minY, width, height] = readViewBox(svg);
    expect(width / height).toBeCloseTo(1, 5);
    expect(minX).toBeCloseTo(0, 5);
    expect(minY).toBeCloseTo(0, 5);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
  });

  test('keeps the content-fitted viewBox when aspect is unlocked', () => {
    const { svg } = createSvg({ locked: false });

    window.Shared.autoResizeSvg(svg, { padding: 0, remeasure: false });

    const [minX, minY, width, height] = readViewBox(svg);
    expect(width / height).toBeCloseTo(1, 5);
    expect(minX).toBeCloseTo(0, 5);
    expect(minY).toBeCloseTo(0, 5);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
  });
});
