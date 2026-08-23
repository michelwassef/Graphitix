describe('shared export projection physical-size contract', () => {
  beforeEach(() => {
    jest.resetModules();
    window.Shared = {};
    require('../js/shared/exportProjection.js');
  });

  function makeSvg({ viewBox = '0 0 100 100', preserveAspectRatio = null } = {}) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', viewBox);
    if (preserveAspectRatio !== null) {
      svg.setAttribute('preserveAspectRatio', preserveAspectRatio);
    }
    return svg;
  }

  test('the owner frame is authoritative over root SVG dimensions', () => {
    const svg = makeSvg({ viewBox: '0 0 1000 200' });
    svg.setAttribute('width', '1200');
    svg.setAttribute('height', '240');

    const projection = window.Shared.exportProjection.resolve(svg, {
      ownerFrame: { width: 480, height: 320, authority: 'test-owner' }
    });

    expect(projection.ownerFrame.authority).toBe('test-owner');
    expect(projection.physicalBase).toEqual({ width: 480, height: 320 });
    expect(projection.physical).toEqual({ width: 480, height: 320 });
    expect(projection.logicalViewBox).toEqual({ minX: 0, minY: 0, width: 1000, height: 200 });
  });

  test('CSS pixels and points use one exact 96-DPI conversion boundary', () => {
    const projection = window.Shared.exportProjection;
    expect(projection.CSS_DPI).toBe(96);
    expect(projection.pointsToCssPx(1)).toBeCloseTo(4 / 3, 12);
    expect(projection.cssPxToPoints(4 / 3)).toBeCloseTo(1, 12);

    const svg = makeSvg();
    const resolved = projection.resolve(svg, {
      ownerFrame: { width: 400, height: 200 }
    });
    expect(resolved.pdf.widthPt).toBeCloseTo(300, 12);
    expect(resolved.pdf.heightPt).toBeCloseTo(150, 12);
  });

  test('locked and unlocked SVG projections preserve their own logical geometry', () => {
    const unlocked = makeSvg({ viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
    const unlockedProjection = window.Shared.exportProjection.resolve(unlocked, {
      ownerFrame: { width: 400, height: 200 }
    });
    expect(unlockedProjection.logicalToPhysical).toEqual({ x: 4, y: 2, uniform: false });

    const locked = makeSvg({ viewBox: '0 0 100 100', preserveAspectRatio: 'xMidYMid meet' });
    const lockedProjection = window.Shared.exportProjection.resolve(locked, {
      ownerFrame: { width: 400, height: 200 }
    });
    expect(lockedProjection.logicalToPhysical).toEqual({ x: 2, y: 2, uniform: true });
  });

  test('content extension enlarges the physical canvas without shrinking the base graph', () => {
    const svg = makeSvg({ viewBox: '0 0 125 100', preserveAspectRatio: 'none' });
    svg.dataset.legendBaseWidth = '100';
    svg.dataset.legendBaseHeight = '100';
    svg.dataset.graphContentReserveRight = '25';
    svg.dataset.graphContentReserveBottom = '0';

    const projection = window.Shared.exportProjection.resolve(svg, {
      ownerFrame: { width: 400, height: 300 }
    });

    expect(projection.physicalBase).toEqual({ width: 400, height: 300 });
    expect(projection.declaredExtension.right).toBeCloseTo(100, 12);
    expect(projection.physical.width).toBeCloseTo(500, 12);
    expect(projection.physical.height).toBeCloseTo(300, 12);
    expect(projection.logicalToPhysical.x).toBeCloseTo(4, 12);
  });

  test('a larger export viewBox extends the canvas at the existing plot scale', () => {
    const svg = makeSvg({ viewBox: '0 0 100 50', preserveAspectRatio: 'none' });
    const projection = window.Shared.exportProjection.resolve(svg, {
      ownerFrame: { width: 400, height: 200 }
    });
    const extended = window.Shared.exportProjection.resolveForViewBox(projection, {
      minX: -10,
      minY: 0,
      width: 130,
      height: 50
    });

    expect(extended.physicalBase).toEqual({ width: 400, height: 200 });
    expect(extended.physical.width).toBeCloseTo(520, 12);
    expect(extended.physical.height).toBeCloseTo(200, 12);
  });

  test('raster scale changes resolution and pixel count, not physical size', () => {
    const svg = makeSvg({ viewBox: '0 0 100 50' });
    const projection = window.Shared.exportProjection.resolve(svg, {
      ownerFrame: { width: 400, height: 200 }
    });
    const raster = window.Shared.exportProjection.resolveRaster(projection, 2);

    expect(raster.widthPx).toBe(800);
    expect(raster.heightPx).toBe(400);
    expect(raster.physicalWidthPx).toBe(400);
    expect(raster.physicalHeightPx).toBe(200);
    expect(raster.dpiX).toBe(192);
    expect(raster.dpiY).toBe(192);
  });

  test('correlation-style and data-values-style heatmap viewBoxes share physical size when their owner frames match', () => {
    const correlation = makeSvg({ viewBox: '0 0 500 500', preserveAspectRatio: 'xMidYMid meet' });
    const dataValues = makeSvg({ viewBox: '0 0 1200 360', preserveAspectRatio: 'none' });
    const ownerFrame = { width: 640, height: 420 };

    const correlationProjection = window.Shared.exportProjection.resolve(correlation, { ownerFrame });
    const dataValuesProjection = window.Shared.exportProjection.resolve(dataValues, { ownerFrame });

    expect(correlationProjection.physicalBase).toEqual(ownerFrame);
    expect(dataValuesProjection.physicalBase).toEqual(ownerFrame);
    expect(correlationProjection.logicalViewBox).not.toEqual(dataValuesProjection.logicalViewBox);
  });

  test('absolute SVG dimensions are converted to CSS pixels when no rendered owner exists', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '72pt');
    svg.setAttribute('height', '1in');

    const frame = window.Shared.exportProjection.resolveOwnerFrame(svg);
    expect(frame.width).toBeCloseTo(96, 12);
    expect(frame.height).toBeCloseTo(96, 12);
  });
});
