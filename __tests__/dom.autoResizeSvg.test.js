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

  test('enforces a locked rendered-axis ratio in the canonical viewport pass', () => {
    const { box, svg } = createSvg({ locked: true });
    box.dataset.resizerLockedGeometryRatio = '1.5';
    const measuredTargets = [];
    window.Shared.axisControls = {
      measureRenderedAxes: target => {
        measuredTargets.push(target);
        const [, , viewWidth, viewHeight] = readViewBox(svg);
        return {
          x: 200 * 600 / viewWidth,
          y: 200 * 300 / viewHeight
        };
      }
    };

    window.Shared.autoResizeSvg(svg, { padding: 0, remeasure: false });

    const [minX, minY, width, height] = readViewBox(svg);
    expect(minX).toBeCloseTo(-50, 5);
    expect(minY).toBeCloseTo(0, 5);
    expect(width).toBeCloseTo(400, 5);
    expect(height).toBeCloseTo(300, 5);
    expect(Number(box.dataset.graphViewportStableWidth)).toBeCloseTo(400, 5);
    expect(measuredTargets.length).toBeGreaterThan(0);
    expect(measuredTargets.every(target => target === svg)).toBe(true);
    const finalAxes = window.Shared.axisControls.measureRenderedAxes(svg);
    expect(finalAxes.x / finalAxes.y).toBeCloseTo(1.5, 5);
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

  test('excludes non-layout nodes before measuring the fitted viewport', () => {
    const { svg } = createSvg({ locked: false });
    const excluded = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    excluded.setAttribute('data-ignore-fit', '1');
    svg.appendChild(excluded);
    svg.getBBox = () => ({
      x: 0,
      y: 0,
      width: excluded.style.display === 'none' ? 120 : 800,
      height: 100
    });

    window.Shared.autoResizeSvg(svg, {
      padding: 0,
      remeasure: false,
      excludeSelector: '[data-ignore-fit="1"]'
    });

    const [, , width, height] = readViewBox(svg);
    expect(width).toBeCloseTo(120, 5);
    expect(height).toBeCloseTo(100, 5);
    expect(excluded.style.display).toBe('');
  });

  test('can disable base aspect normalization while keeping the base viewport reserve', () => {
    const { svg } = createSvg({ locked: false });

    window.Shared.autoResizeSvg(svg, {
      padding: 0,
      remeasure: false,
      baseViewport: { width: 600, height: 300 },
      preserveBaseAspect: false
    });

    const [, , width, height] = readViewBox(svg);
    expect(width).toBeCloseTo(600, 5);
    expect(height).toBeCloseTo(300, 5);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
  });

  test('queued remeasurement keeps the lock context of its originating resize', () => {
    const callbacks = [];
    window.requestAnimationFrame = callback => {
      callbacks.push(callback);
      return callbacks.length;
    };
    const { box, svg } = createSvg({ locked: false });
    box.dataset.resizerLastAxis = 'y';
    box.dataset.resizerAxisViewportLockAxis = 'y';
    box.dataset.resizerAxisViewportLockUntil = String(Date.now() + 10_000);
    box.dataset.graphViewportStableMinX = '0';
    box.dataset.graphViewportStableMinY = '0';
    box.dataset.graphViewportStableWidth = '500';
    box.dataset.graphViewportStableHeight = '300';
    svg.getBBox = () => ({ x: 0, y: 0, width: 400, height: 250 });

    window.Shared.autoResizeSvg(svg, {
      padding: 0,
      baseViewport: { width: 600, height: 300 }
    });

    expect(readViewBox(svg)).toEqual([0, 0, 500, 300]);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');

    box.dataset.resizerAspectLocked = 'true';
    delete box.dataset.resizerAxisViewportLockAxis;
    delete box.dataset.resizerAxisViewportLockUntil;
    callbacks.shift()();

    expect(readViewBox(svg)).toEqual([0, 0, 500, 300]);
    expect(svg.getAttribute('preserveAspectRatio')).toBe('none');
  });
});
