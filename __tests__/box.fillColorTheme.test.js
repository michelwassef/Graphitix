describe('Box theme-aware fill color resolution', () => {
  let hooks;

  beforeAll(() => {
    jest.resetModules();
    require('../js/components/box.js');
    hooks = window.Components?.box?.__testHooks;
  });

  test('exposes the color-resolution hooks', () => {
    expect(hooks).toBeDefined();
    expect(typeof hooks.resolveThemeAwareDefaultTraceColors).toBe('function');
    expect(typeof hooks.isBoxThemeNeutralColorToken).toBe('function');
    expect(typeof hooks.resolveIndividualPointThemeDefaults).toBe('function');
  });

  describe('grayscale scheme', () => {
    test('honors an explicit white fill instead of remapping to a gray default', () => {
      const { fillColor } = hooks.resolveThemeAwareDefaultTraceColors({
        schemeId: 'grayscale',
        colorIndex: 0,
        fillColor: '#FFFFFF'
      });
      expect(fillColor.toLowerCase()).toBe('#ffffff');
    });

    test('white is not treated as a theme-neutral token', () => {
      expect(hooks.isBoxThemeNeutralColorToken('#FFFFFF', { schemeId: 'grayscale' })).toBe(false);
      expect(hooks.isBoxThemeNeutralColorToken('white', { schemeId: 'grayscale' })).toBe(false);
    });

    test('still seeds a gray default when no fill is set', () => {
      const { fillColor } = hooks.resolveThemeAwareDefaultTraceColors({
        schemeId: 'grayscale',
        colorIndex: 0,
        fillColor: '',
        preferUnifiedDefault: true
      });
      expect(fillColor.toLowerCase()).toBe('#7a7a7a');
    });

    test('still remaps black (palette[0]) since it is indistinguishable from the seeded default', () => {
      expect(hooks.isBoxThemeNeutralColorToken('#000000', { schemeId: 'grayscale' })).toBe(true);
      const { fillColor } = hooks.resolveThemeAwareDefaultTraceColors({
        schemeId: 'grayscale',
        colorIndex: 1,
        fillColor: '#000000'
      });
      expect(fillColor.toLowerCase()).not.toBe('#000000');
    });

    test('box-shape white now matches individual-value-point behavior (homogeneity)', () => {
      const shapeFill = hooks.resolveThemeAwareDefaultTraceColors({
        schemeId: 'grayscale',
        colorIndex: 0,
        fillColor: '#FFFFFF'
      }).fillColor.toLowerCase();
      const pointFill = String(hooks.resolveIndividualPointThemeDefaults({
        schemeId: 'grayscale',
        colorIndex: 0,
        fillColor: '#FFFFFF'
      }).fill).toLowerCase();
      expect(shapeFill).toBe('#ffffff');
      expect(pointFill).toBe('#ffffff');
      expect(shapeFill).toBe(pointFill);
    });
  });

  describe('dark scheme (unchanged)', () => {
    test('white is still treated as neutral and remapped to the dark palette', () => {
      expect(hooks.isBoxThemeNeutralColorToken('#FFFFFF', { schemeId: 'dark' })).toBe(true);
      const { fillColor } = hooks.resolveThemeAwareDefaultTraceColors({
        schemeId: 'dark',
        colorIndex: 0,
        fillColor: '#FFFFFF'
      });
      expect(fillColor.toLowerCase()).not.toBe('#ffffff');
    });
  });
});
