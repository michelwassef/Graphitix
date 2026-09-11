'use strict';

describe('PCA preprocessing and metric helpers', () => {
  let hooks;

  beforeEach(() => {
    jest.resetModules();
    global.Shared = window.Shared = {};
    global.Components = window.Components = {};
    global.Main = window.Main = {};
    require('../../js/shared/chartStyle.js');
    require('../../js/components/pca.js');
    hooks = global.Components.pca.__testHooks;
  });

  test('matches DESeq2 median-ratio size factors for proportional count profiles', () => {
    const result = hooks.calculateMedianRatioSizeFactors([
      [10, 20, 40],
      [20, 40, 80],
      [5, 10, 20]
    ]);
    expect(result.eligibleFeatureCount).toBe(3);
    expect(result.sizeFactors[0]).toBeCloseTo(1, 12);
    expect(result.sizeFactors[1]).toBeCloseTo(2, 12);
    expect(result.sizeFactors[2]).toBeCloseTo(0.5, 12);
  });

  test('matches DESeq2 ratio normalization by excluding genes containing any zero', () => {
    const result = hooks.calculateMedianRatioSizeFactors([
      [10, 0, 40],
      [20, 5, 80],
      [5, 10, 20]
    ]);
    expect(result.eligibleFeatureCount).toBe(2);
    expect(result.sizeFactors[0]).toBeCloseTo(1, 12);
    expect(result.sizeFactors[1]).toBeCloseTo(2, 12);
    expect(result.sizeFactors[2]).toBeCloseTo(0.5, 12);
  });

  test('normalizes, log-transforms, and deterministically retains the most variable genes', () => {
    const result = hooks.preprocessRnaSeqCounts([
      [10, 10, 10, 10],
      [10, 20, 10, 40],
      [10, 40, 10, 160]
    ], ['stable-a', 'variable-b', 'stable-c', 'variable-d'], { topFeatureLimit: 2 });
    expect(result.metadata.selectedFeatureCount).toBe(2);
    expect(result.featureLabels).toEqual(['variable-d', 'variable-b']);
    expect(result.matrix).toHaveLength(3);
    expect(result.matrix.every(row => row.length === 2)).toBe(true);
  });

  test('rejects non-integer and negative raw counts', () => {
    expect(() => hooks.preprocessRnaSeqCounts([[1, 2], [1.5, 3]], ['a', 'b']))
      .toThrow(/non-negative integer raw counts/i);
    expect(() => hooks.preprocessRnaSeqCounts([[1, 2], [-1, 3]], ['a', 'b']))
      .toThrow(/non-negative integer raw counts/i);
  });

  test('PCA axis-length presentation pads ranges without rescaling the coordinate metric', () => {
    const equal2d = hooks.resolve2dMetricScales(
      { min: -4, max: 2, ticks: [-4, -2, 0, 2], step: 2 },
      { min: -4, max: 4, ticks: [-4, -2, 0, 2, 4], step: 2 },
      true
    );
    expect(equal2d.x.max - equal2d.x.min).toBeCloseTo(8, 12);
    expect(equal2d.y.max - equal2d.y.min).toBeCloseTo(8, 12);
    expect(equal2d.x.ticks).toEqual([-4, -2, 0, 2]);
    expect(equal2d.y.ticks).toEqual([-4, -2, 0, 2, 4]);

    const natural2d = hooks.resolve2dMetricScales(
      { min: -4, max: 2, ticks: [-4, -2, 0, 2], step: 2 },
      { min: -4, max: 4, ticks: [-4, -2, 0, 2, 4], step: 2 },
      false
    );
    expect(natural2d.x).toMatchObject({ min: -4, max: 2 });
    expect(natural2d.y).toMatchObject({ min: -4, max: 4 });

    const source3d = {
      x: { min: -3, max: 5 },
      y: { min: -2, max: 2 },
      z: { min: -1, max: 2 }
    };
    const equal3d = hooks.resolve3dMetricRanges(source3d, true);
    const equalSpans = ['x', 'y', 'z'].map(axis => equal3d[axis].max - equal3d[axis].min);
    expect(Math.max(...equalSpans) - Math.min(...equalSpans)).toBeLessThan(1e-12);

    const natural3d = hooks.resolve3dMetricRanges(source3d, false);
    expect(natural3d).toEqual(source3d);
  });

  test('PCA metric layout exposes the final plotted dimensions used for tick-density decisions', () => {
    const margin = { top: 40, right: 40, bottom: 60, left: 80 };
    const layout = hooks.resolve2dMetricLayout(427, 300, margin,
      { min: -1, max: 1, ticks: [-1, 0, 1], step: 1 },
      { min: -0.5, max: 0.5, ticks: [-0.5, 0, 0.5], step: 0.5 },
      false
    );

    expect(layout.spanX).toBeCloseTo(2, 12);
    expect(layout.spanY).toBeCloseTo(1, 12);
    expect(layout.plotH).toBeCloseTo(200, 12);
    expect(layout.plotW).toBeCloseTo(400, 12);
    expect(layout.plotW / layout.plotH).toBeCloseTo(2, 12);
    expect(layout.plotW).toBeGreaterThan(427 - margin.left - margin.right);
    expect(layout.rightExtension).toBeGreaterThan(0);
  });

  test('PCA axis-length transaction solves the final metric frame in one pass', () => {
    const plan = hooks.compute2dAxisLengthResizePlan({
      axis: 'x',
      requestedLength: 230,
      currentX: 278.3343684043447,
      currentY: 139.16718420217234,
      boxHeight: 318,
      svgHeight: 229,
      baseHeight: 229,
      plotHeight: 139.16718420217234,
      marginTop: 40,
      marginBottom: 49.83281579782766,
      frameAspect: 1
    });

    expect(plan).toBeTruthy();
    expect(plan.metricAspect).toBeCloseTo(2, 12);
    expect(plan.targetPhysicalY).toBeCloseTo(115, 12);
    expect(plan.targetInternalPlotHeight).toBeCloseTo(115, 12);
    expect(plan.targetBaseHeight).toBeCloseTo(204.83281579782766, 12);
    expect(plan.width).toBeCloseTo(plan.height, 12);
    expect(plan.height).toBeCloseTo(293.83281579782766, 12);

    const lockedPlotHeight = plan.targetBaseHeight - 40 - 49.83281579782766;
    expect(lockedPlotHeight).toBeCloseTo(115, 12);
    expect(lockedPlotHeight * plan.metricAspect).toBeCloseTo(230, 12);
  });

  test('PCA biplot uses the selected component pair and preserves metric geometry', () => {
    const snapshot = hooks.buildBiplotSnapshot(
      [{ x: 1, y: 2, label: 'S1' }],
      [
        ...Array.from({ length: 9 }, (_, index) => ({
          label: `PC1-PC2-${index + 1}`,
          values: [10 - index * 0.2, 9 - index * 0.2, 0.01, -0.01]
        })),
        { label: 'PC3-PC4-target', values: [0.01, 0.02, 0.9, -0.8] }
      ],
      { x: 'PC3', y: 'PC4' },
      { x: 2, y: 3 }
    );
    expect(snapshot.selectedAxes).toEqual({ x: 2, y: 3 });
    expect(snapshot.vectors).toHaveLength(8);
    const selectedAxisTarget = snapshot.vectors.find(vector => vector.label === 'PC3-PC4-target');
    expect(selectedAxisTarget).toBeTruthy();
    expect(Math.sign(selectedAxisTarget.x)).toBe(1);
    expect(Math.sign(selectedAxisTarget.y)).toBe(-1);
    expect(snapshot.vectorScaleNote).toMatch(/uniformly rescaled/i);

    const svg = hooks.createMiniScatterSvg({
      points: snapshot.points,
      scalePoints: snapshot.points,
      vectors: snapshot.vectors,
      xLabel: snapshot.xLabel,
      yLabel: snapshot.yLabel
    });
    const lines = Array.from(svg.querySelectorAll('line'));
    const xAxis = lines[0];
    const yAxis = lines[1];
    const xLength = Math.abs(Number(xAxis.getAttribute('x2')) - Number(xAxis.getAttribute('x1')));
    const yLength = Math.abs(Number(yAxis.getAttribute('y2')) - Number(yAxis.getAttribute('y1')));
    expect(xLength).toBeCloseTo(yLength, 8);
  });
});
