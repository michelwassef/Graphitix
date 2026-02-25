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
});
