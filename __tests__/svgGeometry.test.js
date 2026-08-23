describe('Shared.svgGeometry', () => {
  beforeEach(() => {
    window.Shared = {};
    jest.resetModules();
    require('../js/shared/svgGeometry.js');
  });

  test('builds independent SVG subpaths without changing segment coordinates or directions', () => {
    const segments = [
      { x1: 10, y1: 20, x2: 10, y2: 80 },
      { x1: 4, y1: 20, x2: 16, y2: 20 },
      { x1: 4, y1: 80, x2: 16, y2: 80 }
    ];

    expect(window.Shared.svgGeometry.buildCompoundLinePath(segments)).toBe(
      'M 10 20 L 10 80 M 4 20 L 16 20 M 4 80 L 16 80'
    );
  });

  test('builds vertical capped-line geometry with exact legacy direction and optional caps', () => {
    const segments = window.Shared.svgGeometry.buildOrthogonalCappedLineSegments({
      orientation: 'vertical',
      start: 80,
      end: 20,
      cross: 10,
      capSize: 12,
      capAtStart: true,
      capAtEnd: false
    });

    expect(segments).toEqual([
      { x1: 10, y1: 80, x2: 10, y2: 20 },
      { x1: 4, y1: 80, x2: 16, y2: 80 }
    ]);
    expect(window.Shared.svgGeometry.buildCompoundLinePath(segments)).toBe(
      'M 10 80 L 10 20 M 4 80 L 16 80'
    );
  });

  test('builds horizontal capped-line geometry with exact cap extent', () => {
    const segments = window.Shared.svgGeometry.buildOrthogonalCappedLineSegments({
      orientation: 'horizontal',
      start: 20,
      end: 80,
      cross: 10,
      capSize: 12
    });

    expect(segments).toEqual([
      { x1: 20, y1: 10, x2: 80, y2: 10 },
      { x1: 20, y1: 4, x2: 20, y2: 16 },
      { x1: 80, y1: 4, x2: 80, y2: 16 }
    ]);
  });

  test('builds one cross from the same two perpendicular source segments', () => {
    expect(window.Shared.svgGeometry.buildCrossSegments({ x: 50, y: 25, size: 10 })).toEqual([
      { x1: 45, y1: 25, x2: 55, y2: 25 },
      { x1: 50, y1: 20, x2: 50, y2: 30 }
    ]);
  });

  test('keeps zero coordinates and rejects only non-finite segments', () => {
    const segments = [
      { x1: 0, y1: 0, x2: 5, y2: 0 },
      { x1: Number.NaN, y1: 0, x2: 5, y2: 5 },
      { x1: 5, y1: 5, x2: Number.POSITIVE_INFINITY, y2: 5 },
      { x1: '7.5', y1: '8', x2: '9.5', y2: '10' }
    ];

    expect(window.Shared.svgGeometry.buildCompoundLinePath(segments)).toBe(
      'M 0 0 L 5 0 M 7.5 8 L 9.5 10'
    );
  });

  test('returns empty geometry when required inputs are non-finite', () => {
    expect(window.Shared.svgGeometry.buildOrthogonalCappedLineSegments({
      orientation: 'vertical', start: 0, end: 1, cross: Number.NaN, capSize: 4
    })).toEqual([]);
    expect(window.Shared.svgGeometry.buildCrossSegments({ x: 1, y: 2, size: Number.POSITIVE_INFINITY })).toEqual([]);
  });

  test('returns an empty path when no valid segment exists', () => {
    expect(window.Shared.svgGeometry.buildCompoundLinePath([])).toBe('');
    expect(window.Shared.svgGeometry.buildCompoundLinePath(null)).toBe('');
    expect(window.Shared.svgGeometry.buildCompoundLinePath([{ x1: 'x', y1: 0, x2: 1, y2: 1 }])).toBe('');
  });
});
