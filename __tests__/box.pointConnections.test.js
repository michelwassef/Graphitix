describe('Box point connection helpers', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('connection eligibility matches graph/point mode combinations', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.isBoxPointConnectionModeEligible).toBe('function');

    expect(hooks.isBoxPointConnectionModeEligible('strip', 'none')).toBe(true);
    expect(hooks.isBoxPointConnectionModeEligible('box', 'overlay')).toBe(true);
    expect(hooks.isBoxPointConnectionModeEligible('box', 'side')).toBe(true);
    expect(hooks.isBoxPointConnectionModeEligible('box', 'none')).toBe(false);
    expect(hooks.isBoxPointConnectionModeEligible('violin', 'outliers')).toBe(false);
  });

  test('path builder links only consecutive traces and skips gaps', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.buildBoxConnectedPointPathFromTraceMaps).toBe('function');

    const traceMaps = [
      new Map([
        ['5', { x: 1, y: 1 }],
        ['12', { x: 2, y: 2 }]
      ]),
      new Map([
        ['5', { x: 3, y: 3 }],
        ['20', { x: 7, y: 7 }]
      ]),
      new Map([
        ['5', { x: 5, y: 5 }],
        ['12', { x: 6, y: 6 }],
        ['20', { x: 9, y: 9 }]
      ])
    ];

    const info = hooks.buildBoxConnectedPointPathFromTraceMaps(traceMaps);
    expect(info.rowCount).toBe(3);
    expect(info.segmentCount).toBe(2);
    expect(info.pointCount).toBe(5);
    expect(info.d).toBe('M 1 1 L 3 3 L 5 5 M 7 7 L 9 9');
  });
});
