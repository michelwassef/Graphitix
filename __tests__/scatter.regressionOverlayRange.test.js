const { initializeWorkspaceHarness } = require('./setup/workspaceHarness');

describe('Scatter regression overlay range', () => {
  beforeEach(() => {
    jest.resetModules();
    initializeWorkspaceHarness();
    require('../js/components/scatter.js');
  });

  test('automatic overlay bounds include a nonlinear fitted curve even without CI/PI', () => {
    const hooks = window.Components.scatter.__testHooks;
    const stats = {
      regression: {
        curveSamples: [
          { x: 7, y: 48 },
          { x: 18, y: 118 },
          { x: 28, y: 240 }
        ]
      }
    };

    expect(hooks.collectRegressionOverlayYBounds(stats, {
      includeTrend: true,
      includeConfidence: false,
      includePrediction: false,
      minX: 0,
      maxX: 30
    })).toEqual(expect.objectContaining({
      minY: 48,
      maxY: 240,
      modelCount: 1,
      trendSampleCount: 3,
      intervalSampleCount: 0
    }));
  });

  test('overlay bounds combine trend and enabled uncertainty limits only inside the visible X domain', () => {
    const hooks = window.Components.scatter.__testHooks;
    const stats = {
      regression: {
        curveSamples: [
          { x: 5, y: 40 },
          { x: 15, y: 100 },
          { x: 25, y: 220 }
        ],
        intervals: {
          samples: [
            { x: 5, y: 40, ciLow: 35, ciHigh: 45, piLow: 30, piHigh: 50 },
            { x: 15, y: 100, ciLow: 90, ciHigh: 110, piLow: 80, piHigh: 120 },
            { x: 25, y: 220, ciLow: 200, ciHigh: 245, piLow: 180, piHigh: 270 }
          ]
        }
      }
    };

    const bounds = hooks.collectRegressionOverlayYBounds(stats, {
      includeTrend: true,
      includeConfidence: true,
      includePrediction: false,
      minX: 10,
      maxX: 20
    });

    expect(bounds).toEqual(expect.objectContaining({
      minY: 90,
      maxY: 110,
      modelCount: 1,
      trendSampleCount: 1,
      intervalSampleCount: 2
    }));
  });

  test('trend projection never turns out-of-range samples into a flat axis-edge plateau', () => {
    const hooks = window.Components.scatter.__testHooks;
    const path = hooks.buildRegressionTrendPath([
      { x: 7, y: 50 },
      { x: 20, y: 180 },
      { x: 25, y: 220 },
      { x: 28, y: 240 }
    ], {
      xMin: 0,
      xMax: 30,
      yMin: 0,
      yMax: 200,
      projectX: value => value,
      // Deliberately clamping projector: out-of-range samples must be rejected before this runs.
      projectY: value => Math.min(200, Math.max(0, value))
    });

    expect(path).toEqual({
      d: 'M7,50 L20,180',
      commandCount: 2,
      segmentCount: 1
    });
    expect(path.d).not.toContain(',200');
  });

  test('trend projection starts a new segment after an out-of-range excursion instead of bridging across it', () => {
    const hooks = window.Components.scatter.__testHooks;
    const path = hooks.buildRegressionTrendPath([
      { x: 1, y: 100 },
      { x: 2, y: 220 },
      { x: 3, y: 150 },
      { x: 4, y: 160 }
    ], {
      xMin: 0,
      xMax: 5,
      yMin: 0,
      yMax: 200,
      projectX: value => value,
      projectY: value => value
    });

    expect(path).toEqual({
      d: 'M3,150 L4,160',
      commandCount: 2,
      segmentCount: 1
    });
  });
});
