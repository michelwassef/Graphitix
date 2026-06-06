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

  function setSvgBase(svg, width, height) {
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
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

  test('preserves the base aspect ratio so round symbols stay circular', () => {
    const { svg } = createSvg({ locked: false });

    // Content bbox is 300x300 (square) but it was rendered into a 600x300 frame.
    // The viewBox must keep the original frame reserve and render with "meet" so
    // circles stay circular after graph resize.
    window.Shared.autoResizeSvg(svg, {
      padding: 0,
      remeasure: false,
      baseViewport: { width: 600, height: 300 }
    });

    const [minX, minY, width, height] = readViewBox(svg);
    expect(width / height).toBeCloseTo(600 / 300, 5);
    expect(width).toBeCloseTo(600, 5);
    expect(height).toBeCloseTo(300, 5);
    expect(minX).toBeCloseTo(0, 5);
    expect(minY).toBeCloseTo(0, 5);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  test('does not collapse an empty legend-side reserve after the legend is moved inward', () => {
    const { svg } = createSvg({ locked: false });
    setSvgBase(svg, 640, 400);
    svg.getBBox = () => ({
      x: 0,
      y: 0,
      width: 500,
      height: 400
    });

    window.Shared.autoResizeSvg(svg, {
      padding: 0,
      remeasure: false,
      baseViewport: { width: 640, height: 400 }
    });

    const [minX, minY, width, height] = readViewBox(svg);
    expect(minX).toBeCloseTo(0, 5);
    expect(minY).toBeCloseTo(0, 5);
    expect(width).toBeCloseTo(640, 5);
    expect(height).toBeCloseTo(400, 5);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  });

  test('does not infer a base reserve for fixed-legend graphs', () => {
    const { svg } = createSvg({ locked: false });
    setSvgBase(svg, 640, 400);
    svg.getBBox = () => ({
      x: 0,
      y: 0,
      width: 500,
      height: 400
    });

    window.Shared.autoResizeSvg(svg, { padding: 0, remeasure: false });

    const [, , width, height] = readViewBox(svg);
    expect(width).toBeCloseTo(500, 5);
    expect(height).toBeCloseTo(400, 5);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
  });
});
