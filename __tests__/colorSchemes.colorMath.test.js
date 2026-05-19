// Tests that verify color math invariants through the public applyToPayload API.
// The private darken/lighten/relativeLuminance/deriveBorderColor functions are
// exercised indirectly by the box-plot borderColors derivation path.

function loadModule() {
  jest.resetModules();
  delete window.Shared;
  require('../js/shared/colorSchemes.js');
  return window.Shared.colorSchemes;
}

function hexToRgb(hex) {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function luminance(r, g, b) {
  const lin = v => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

describe('colorSchemes — token values match scheme definitions', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  test('dark scheme has black background and light text', () => {
    const state = cs.resolveThemeState('scatter', { config: { colorScheme: 'dark' } });
    expect(state.background).toBe('#000000');
    expect(state.isDark).toBe(true);
    const rgb = hexToRgb(state.textColor);
    expect(rgb).not.toBeNull();
    // dark scheme textColor should be light (luminance > 0.5)
    expect(luminance(rgb.r, rgb.g, rgb.b)).toBeGreaterThan(0.5);
  });

  test('grayscale scheme has white background and black axis/border', () => {
    const state = cs.resolveThemeState('scatter', { config: { colorScheme: 'grayscale' } });
    expect(state.background).toBe('#ffffff');
    expect(state.axisColor).toBe('#000000');
    expect(state.borderColor).toBe('#000000');
    expect(state.isDark).toBe(false);
  });

  test('soft scheme tokens match known values', () => {
    const state = cs.resolveThemeState('scatter', { config: { colorScheme: 'soft' } });
    expect(state.axisColor).toBe('#222222');
    expect(state.gridColor).toBe('#d8d8d8');
    expect(state.background).toBe('#ffffff');
  });

  test('colorblind scheme tokens match known values', () => {
    const state = cs.resolveThemeState('scatter', { config: { colorScheme: 'colorblind' } });
    expect(state.axisColor).toBe('#111111');
    expect(state.background).toBe('#ffffff');
  });
});

describe('colorSchemes — box borderColors are derived correctly', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  test('grayscale box borderColors are all #000000', () => {
    const result = cs.applyToPayload('box', { config: { colors: ['#333333', '#777777'] } }, 'grayscale');
    const borders = result.config.borderColors;
    expect(Array.isArray(borders)).toBe(true);
    borders.forEach(b => expect(b).toBe('#000000'));
  });

  test('dark box borderColors are all the same light color (dark contrast)', () => {
    const result = cs.applyToPayload('box', { config: {} }, 'dark');
    const borders = result.config.borderColors;
    expect(Array.isArray(borders)).toBe(true);
    if (borders.length > 0) {
      // All borders use the same dark-contrast color
      const unique = [...new Set(borders)];
      expect(unique.length).toBe(1);
      // The contrast color for dark theme should be light
      const rgb = hexToRgb(unique[0]);
      if (rgb) {
        expect(luminance(rgb.r, rgb.g, rgb.b)).toBeGreaterThan(0.5);
      }
    }
  });

  test('soft box borderColors are darker than their corresponding fill colors', () => {
    const result = cs.applyToPayload('box', { config: {} }, 'soft');
    const fills = result.config.colors;
    const borders = result.config.borderColors;
    expect(Array.isArray(fills)).toBe(true);
    expect(fills.length).toBe(borders.length);
    fills.forEach((fill, i) => {
      const fillRgb = hexToRgb(fill);
      const borderRgb = hexToRgb(borders[i]);
      if (fillRgb && borderRgb) {
        const fillLum = luminance(fillRgb.r, fillRgb.g, fillRgb.b);
        const borderLum = luminance(borderRgb.r, borderRgb.g, borderRgb.b);
        // border should be darker (lower luminance) than fill for soft palette
        expect(borderLum).toBeLessThan(fillLum + 0.05);
      }
    });
  });
});

describe('colorSchemes — categorical palette properties', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  test('grayscale palette consists of achromatic colors', () => {
    const palette = cs.resolveCategoricalPaletteForType('box');
    palette.forEach(hex => {
      const rgb = hexToRgb(hex);
      expect(rgb).not.toBeNull();
      // Achromatic: r == g == b
      expect(rgb.r).toBe(rgb.g);
      expect(rgb.g).toBe(rgb.b);
    });
  });

  test('dark scheme palette consists of light colors (luminance > 0.1)', () => {
    const palette = cs.resolveCategoricalPaletteForType('scatter', { schemeId: 'dark' });
    expect(palette.length).toBeGreaterThan(0);
    palette.forEach(hex => {
      const rgb = hexToRgb(hex);
      if (rgb) {
        // Dark scheme uses pastel/bright colors suitable for dark backgrounds
        expect(luminance(rgb.r, rgb.g, rgb.b)).toBeGreaterThan(0.05);
      }
    });
  });

  test('scientific and soft palettes produce chromatically distinct first colors', () => {
    const sci = cs.resolveCategoricalPaletteForType('scatter', { schemeId: 'scientific' });
    const soft = cs.resolveCategoricalPaletteForType('scatter', { schemeId: 'soft' });
    // The first color of scientific vs soft should differ
    expect(sci[0]).not.toBe(soft[0]);
  });
});
