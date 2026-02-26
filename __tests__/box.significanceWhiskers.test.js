describe('Box significance whisker modes', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('fixed whiskers keep equal end ticks (vertical)', () => {
    expect(hooks).toBeDefined();
    const geom = hooks.buildSignificanceBracketGeometry({
      orientation: 'vertical',
      x1: 10,
      x2: 20,
      valueCoord: 50,
      bracketSize: 10,
      showWhiskers: true,
      whiskerMode: 'fixed',
      outerCoordA: 50,
      outerCoordB: 80
    });
    expect(geom.d).toBe('M10,50 L10,40 L20,40 L20,50');
  });

  test('adaptive whiskers extend the lower end (vertical)', () => {
    expect(hooks).toBeDefined();
    const geom = hooks.buildSignificanceBracketGeometry({
      orientation: 'vertical',
      x1: 10,
      x2: 20,
      valueCoord: 50,
      bracketSize: 10,
      showWhiskers: true,
      whiskerMode: 'adaptive',
      outerCoordA: 50,
      outerCoordB: 80
    });
    expect(geom.d).toBe('M10,50 L10,40 L20,40 L20,80');
    expect(geom.refOuter).toBe(50);
  });

  test('adaptive whiskers extend the earlier max when axes are flipped (horizontal)', () => {
    expect(hooks).toBeDefined();
    const geom = hooks.buildSignificanceBracketGeometry({
      orientation: 'horizontal',
      x1: 10,
      x2: 20,
      valueCoord: 100,
      bracketSize: 10,
      showWhiskers: true,
      whiskerMode: 'adaptive',
      outerCoordA: 100,
      outerCoordB: 70
    });
    expect(geom.d).toBe('M100,10 L110,10 L110,20 L70,20');
    expect(geom.refOuter).toBe(100);
  });

  test('p-value labels use threshold text in normal mode', () => {
    expect(hooks).toBeDefined();
    expect(hooks.formatSignificanceLabel(0.0001, 'p', { scientific: false, decimals: 2 })).toBe('<0.01');
    expect(hooks.formatSignificanceLabel(0.0123, 'p', { scientific: false, decimals: 2 })).toBe('0.01');
  });

  test('p-value labels use scientific notation when enabled', () => {
    expect(hooks).toBeDefined();
    expect(hooks.formatSignificanceLabel(0.0001, 'p', { scientific: true, decimals: 2 })).toBe('1.00e-4');
  });

  test('converging whiskers separate opposite sides while keeping same-side boundaries aligned', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.buildPairAnnotationLayout).toBe('function');
    const pairs = [
      { ai: 0, bi: 1, rangeMax: 10, id: '0-1' },
      { ai: 1, bi: 2, rangeMax: 11, id: '1-2' },
      { ai: 0, bi: 2, rangeMax: 12, id: '0-2' }
    ];
    const centers = [100, 200, 300];
    const withSeparation = hooks.buildPairAnnotationLayout(pairs, {
      orientation: 'vertical',
      categoryCenter: idx => centers[idx],
      valueToCoord: value => 1000 - value,
      baseOffset: 25,
      levelGap: 25,
      strokeWidth: 1,
      fontSize: 12,
      separateConvergingEndpoints: true,
      endpointSeparationStep: 6,
      endpointSeparationMax: 12
    });
    const withoutSeparation = hooks.buildPairAnnotationLayout(pairs, {
      orientation: 'vertical',
      categoryCenter: idx => centers[idx],
      valueToCoord: value => 1000 - value,
      baseOffset: 25,
      levelGap: 25,
      strokeWidth: 1,
      fontSize: 12,
      separateConvergingEndpoints: false,
      endpointSeparationStep: 6,
      endpointSeparationMax: 12
    });
    const getGeom = (layout, id) => {
      const pair = layout.sorted.find(item => item.id === id);
      return pair ? layout.geometryByPair.get(pair) : null;
    };
    const aLeft = getGeom(withSeparation, '0-1');
    const aTop = getGeom(withSeparation, '0-2');
    const bRight = getGeom(withSeparation, '1-2');
    expect(aLeft).toBeTruthy();
    expect(aTop).toBeTruthy();
    expect(bRight).toBeTruthy();
    // Same-side boundaries (dataset 0 and dataset 2) should align.
    expect(aLeft.x1).toBeCloseTo(aTop.x1, 6);
    expect(bRight.x2).toBeCloseTo(aTop.x2, 6);
    // Converging opposite-side boundaries at dataset 1 should remain separated.
    expect(bRight.x1 - aLeft.x2).toBeGreaterThan(0);
    const woLeft = getGeom(withoutSeparation, '0-1');
    const woTop = getGeom(withoutSeparation, '0-2');
    const woRight = getGeom(withoutSeparation, '1-2');
    expect(woLeft).toBeTruthy();
    expect(woTop).toBeTruthy();
    expect(woRight).toBeTruthy();
    // Vertical bar levels/stacking must remain unchanged by endpoint separation.
    expect(aLeft.annotationCoord).toBeCloseTo(woLeft.annotationCoord, 6);
    expect(aTop.annotationCoord).toBeCloseTo(woTop.annotationCoord, 6);
    expect(bRight.annotationCoord).toBeCloseTo(woRight.annotationCoord, 6);
  });
});
