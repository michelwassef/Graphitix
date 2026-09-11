'use strict';

describe('Line model and normalization helpers', () => {
  let hooks;

  beforeEach(() => {
    jest.resetModules();
    global.Shared = global.window.Shared = {};
    global.Components = global.window.Components = {};
    global.Main = global.window.Main = {};
    require('../../js/shared/chartStyle.js');
    require('../../js/components/line.js');
    hooks = global.Components.line.__testHooks;
  });

  test('first one-axis redraw after restore cannot freeze a provisional Line margin', () => {
    const svgBox = {
      dataset: {
        resizerAspectLocked: 'false',
        resizerLastAxis: 'x',
        resizerAxisViewportLockAxis: 'x',
        resizerAxisViewportLockUntil: String(Date.now() + 5000)
      }
    };

    const provisional = hooks.stabilizeResizeMargin(
      { top: 36, right: 24, bottom: 64, left: 56 },
      { svgBox, commitBaseline: false }
    );
    const measured = hooks.stabilizeResizeMargin(
      { top: 36, right: 24, bottom: 64, left: 92 },
      { svgBox }
    );
    const laterPass = hooks.stabilizeResizeMargin(
      { top: 36, right: 24, bottom: 64, left: 108 },
      { svgBox }
    );

    expect(provisional.left).toBe(56);
    expect(measured.left).toBe(92);
    expect(laterPass.left).toBe(92);
  });

  test('Line view state drops legacy transient resize locks during hydration', () => {
    const normalized = hooks.normalizeViewState({
      viewMode: '2d',
      resizeMarginLock: { top: 1, right: 2, bottom: 3, left: 4 },
      resizeViewportLock: {
        axis: 'x',
        until: Date.now() + 5000,
        stable: { graphViewportStableWidth: '427', graphViewportStableHeight: '427' }
      }
    });

    expect(normalized).not.toHaveProperty('resizeMarginLock');
    expect(normalized).not.toHaveProperty('resizeViewportLock');
  });

  test('3D conversion from grouped replicates keeps custom X headers stable', () => {
    const grouped = [
      ['Hours', 'Control Rep 1', 'Control Rep 2', 'Control Rep 3', 'Treated Rep 1', 'Treated Rep 2', 'Treated Rep 3'],
      [0, 45, 43, 47, 50, 48, 49],
      [24, 58, 60, 57, 68, 70, 69],
      [48, 72, 71, 74, 80, 82, 81]
    ];

    const converted = hooks.buildLine3dMatrixFrom2d(grouped, 3);
    expect(hooks.isLine3dDatasetHeaderMatrix(converted.data)).toBe(true);
    expect(hooks.inferLine3dSeriesCount(converted.data)).toBe(2);
    expect(converted.data[1].slice(0, 6)).toEqual(['Hours', 'Y', 'Z', 'Hours', 'Y', 'Z']);

    const once = hooks.applyLine3dHeaderRow(converted.data, hooks.inferLine3dSeriesCount(converted.data));
    const twice = hooks.applyLine3dHeaderRow(once, hooks.inferLine3dSeriesCount(once));

    expect(hooks.inferLine3dSeriesCount(once)).toBe(2);
    expect(hooks.inferLine3dSeriesCount(twice)).toBe(2);
    expect(once[0].length).toBe(6);
    expect(twice[0].length).toBe(6);
  });

  test('canonical 3D headers remain idempotent with descriptive axis titles', () => {
    const matrix = [
      ['Subject 1', '', '', 'Subject 2', '', ''],
      ['Time (h)', 'Concentration (µg/mL)', 'Subject index', 'Time (h)', 'Concentration (µg/mL)', 'Subject index'],
      [0.25, 1.5, 1, 0.25, 2.03, 2],
      [0.5, 0.94, 1, 0.5, 1.63, 2]
    ];

    expect(hooks.isLine3dDatasetHeaderMatrix(matrix)).toBe(true);
    expect(hooks.inferLine3dSeriesCount(matrix)).toBe(2);
    const once = hooks.applyLine3dHeaderRow(matrix, 2);
    const twice = hooks.applyLine3dHeaderRow(once, 2);

    expect(once.slice(0, 4)).toEqual(matrix);
    expect(twice).toEqual(once);
    expect(twice[0]).toHaveLength(6);

    const withBlankEditableTitle = matrix.map(row => row.slice());
    withBlankEditableTitle[1][1] = '';
    expect(hooks.isLine3dDatasetHeaderMatrix(withBlankEditableTitle)).toBe(true);
    const normalizedBlankTitle = hooks.applyLine3dHeaderRow(withBlankEditableTitle, 2);
    expect(normalizedBlankTitle[1][1]).toBe('Y');
    expect(hooks.applyLine3dHeaderRow(normalizedBlankTitle, 2)).toEqual(normalizedBlankTitle);
  });

  test('line 2D series data model preserves replicate statistics and log+1 transforms', () => {
    const matrix = [
      ['X', 'Control', 'Control', 'Treatment', 'Treatment'],
      [0, 2, 4, 10, 14],
      [1, 3, 5, 12, 16]
    ];
    const model = hooks.build2dSeriesDataModel(matrix, {
      replicates: 2,
      logX: true,
      logY: true,
      logPlusOneX: true,
      logPlusOneY: true
    });

    expect(model.ok).toBe(true);
    expect(model.labels).toEqual(['Control', 'Treatment']);
    expect(model.seriesWithData).toHaveLength(2);
    expect(model.seriesWithData[0].points[0]).toEqual(expect.objectContaining({
      x: 1,
      y: 4,
      replicateCount: 2,
      replicates: [3, 5]
    }));
    expect(model.seriesWithData[0].points[0].stdev).toBeCloseTo(Math.SQRT2, 10);
    expect(model.seriesWithData[0].points[0].lower).toBeCloseTo(4 - Math.SQRT2, 10);
    expect(model.seriesWithData[0].points[0].upper).toBeCloseTo(4 + Math.SQRT2, 10);
    expect(model.xMinRaw).toBe(1);
    expect(model.xMaxRaw).toBe(2);
  });

  test('grouped uncertainty band reuses the exact mean ± sample-SD bounds used by error bars', () => {
    const matrix = [
      ['Time', 'Group A', 'Group A', 'Group A'],
      [0, 1, 2, 3],
      [1, 2, 4, 6],
      [2, '', '', '']
    ];
    const model = hooks.build2dSeriesDataModel(matrix, { replicates: 3 });

    expect(model.ok).toBe(true);
    expect(model.seriesWithData).toHaveLength(1);
    const [firstPoint, secondPoint, gapPoint] = model.seriesWithData[0].points;
    expect(firstPoint).toEqual(expect.objectContaining({
      x: 0,
      y: 2,
      replicateCount: 3,
      replicates: [1, 2, 3],
      stdev: 1,
      lower: 1,
      upper: 3
    }));
    expect(secondPoint).toEqual(expect.objectContaining({
      x: 1,
      y: 4,
      replicateCount: 3,
      replicates: [2, 4, 6],
      stdev: 2,
      lower: 2,
      upper: 6
    }));
    expect(gapPoint).toBeNull();

    expect(hooks.buildProjectedUncertaintyBandPath([
      { x: 10, upperY: 30, lowerY: 50 },
      { x: 40, upperY: 20, lowerY: 60 }
    ])).toBe('M10,30 L40,20 L40,60 L10,50 Z');
    expect(hooks.buildProjectedUncertaintyBandPath([
      { x: 10, upperY: 30, lowerY: 50 }
    ])).toBeNull();
    expect(hooks.buildProjectedUncertaintyBandPath([
      { x: 10, upperY: 30, lowerY: 50 },
      { x: 40, upperY: Number.NaN, lowerY: 60 }
    ])).toBeNull();
    expect(hooks.sanitizeUncertaintyDisplay('band')).toBe('band');
    expect(hooks.sanitizeUncertaintyDisplay('anything-else')).toBe('bars');
  });

  test('line plot statistics summary is density-aware for multiple series', () => {
    const makeSeries = (name, slope, r2) => ({
      name,
      regression: {
        coefficientStats: [{ term: 'slope', estimate: slope, ciLow: slope - 0.1, ciHigh: slope + 0.1, p: 0.01 }],
        metrics: { r2, sampleSize: 20 },
        summary: { metrics: { r2, sampleSize: 20 } }
      }
    });
    const single = hooks.buildPlotStatsLines([makeSeries('Control', 1.2, 0.8)], { regressionMode: 'linear' });
    expect(single).toHaveLength(1);
    expect(single[0]).toMatch(/slope\s*=\s*1\.200/);
    expect(single[0]).toMatch(/95% CI/);
    const compact = hooks.buildPlotStatsLines([
      makeSeries('A', 1, 0.8), makeSeries('B', 2, 0.7), makeSeries('C', 3, 0.6)
    ], { regressionMode: 'linear' });
    expect(compact).toHaveLength(3);
    const crowded = hooks.buildPlotStatsLines(Array.from({ length: 5 }, (_, i) => makeSeries(`S${i}`, i + 1, 0.5)), { regressionMode: 'linear' });
    expect(crowded).toEqual([]);
  });
});
