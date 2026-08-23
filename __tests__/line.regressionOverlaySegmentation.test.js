const { initializeWorkspaceHarness } = require('./setup/workspaceHarness');

describe('Line regression overlay segmentation', () => {
  beforeEach(() => {
    jest.resetModules();
    initializeWorkspaceHarness();
    require('../js/components/line.js');
  });

  test('manual axis bounds reject hidden trend samples before the clamping projector runs', () => {
    const hooks = window.Components.line.__testHooks;
    const path = hooks.buildRegressionTrendPath([
      { x: 1, y: 100 },
      { x: 2, y: 150 },
      { x: 3, y: 220 },
      { x: 4, y: 240 }
    ], {
      xMin: 0,
      xMax: 5,
      yMin: 0,
      yMax: 200,
      projectX: value => value,
      // Line's production projector clamps, so hidden samples must be filtered first.
      projectY: value => Math.min(200, Math.max(0, value))
    });

    expect(path).toEqual({
      d: 'M1,100 L2,150',
      commandCount: 2,
      segmentCount: 1
    });
    expect(path.d).not.toContain(',200');
  });

  test('a nonlinear trend that leaves and re-enters the visible range restarts its SVG subpath', () => {
    const hooks = window.Components.line.__testHooks;
    const path = hooks.buildRegressionTrendPath([
      { x: 1, y: 100 },
      { x: 2, y: 120 },
      { x: 3, y: 220 },
      { x: 4, y: 230 },
      { x: 5, y: 140 },
      { x: 6, y: 160 }
    ], {
      xMin: 0,
      xMax: 7,
      yMin: 0,
      yMax: 200,
      projectX: value => value,
      projectY: value => value
    });

    expect(path).toEqual({
      d: 'M1,100 L2,120 M5,140 L6,160',
      commandCount: 4,
      segmentCount: 2
    });
  });

  test('broken-axis gaps also terminate and restart the trend path', () => {
    const hooks = window.Components.line.__testHooks;
    const path = hooks.buildRegressionTrendPath([
      { x: 1, y: 100 },
      { x: 2, y: 120 },
      { x: 3, y: 150 },
      { x: 4, y: 180 },
      { x: 5, y: 190 }
    ], {
      xMin: 0,
      xMax: 6,
      yMin: 0,
      yMax: 200,
      isYVisible: value => value < 130 || value > 170,
      projectX: value => value,
      projectY: value => value
    });

    expect(path).toEqual({
      d: 'M1,100 L2,120 M4,180 L5,190',
      commandCount: 4,
      segmentCount: 2
    });
  });
});
