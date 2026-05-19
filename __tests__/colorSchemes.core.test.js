function loadModule() {
  jest.resetModules();
  delete window.Shared;
  require('../js/shared/colorSchemes.js');
  return window.Shared.colorSchemes;
}

describe('colorSchemes — getSchemes()', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  test('returns an object with the built-in scheme ids', () => {
    const schemes = cs.getSchemes();
    expect(typeof schemes).toBe('object');
    ['scientific', 'soft', 'normal', 'grayscale', 'colorblind', 'dark'].forEach(id => {
      expect(schemes).toHaveProperty(id);
    });
  });

  test('each scheme has id, categorical array, and tokens object', () => {
    const schemes = cs.getSchemes();
    Object.values(schemes).forEach(scheme => {
      expect(typeof scheme.id).toBe('string');
      expect(Array.isArray(scheme.categorical)).toBe(true);
      expect(typeof scheme.tokens).toBe('object');
    });
  });

  test('returns a clone — mutations do not affect internals', () => {
    const a = cs.getSchemes();
    a.scientific = null;
    const b = cs.getSchemes();
    expect(b.scientific).not.toBeNull();
  });
});

describe('colorSchemes — getDefaultSchemeId()', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  test('box → grayscale', () => {
    expect(cs.getDefaultSchemeId('box')).toBe('grayscale');
  });

  test('surface → surface-viridis', () => {
    expect(cs.getDefaultSchemeId('surface')).toBe('surface-viridis');
  });

  test('scatter → scientific (global default)', () => {
    expect(cs.getDefaultSchemeId('scatter')).toBe('scientific');
  });

  test('unknown type → scientific (global default)', () => {
    expect(cs.getDefaultSchemeId('unknown-xyz')).toBe('scientific');
  });
});

describe('colorSchemes — resolveThemeState()', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  test('returns an object with required fields', () => {
    const state = cs.resolveThemeState('scatter', null);
    expect(typeof state.type).toBe('string');
    expect(typeof state.schemeId).toBe('string');
    expect(typeof state.isDark).toBe('boolean');
    expect(typeof state.textColor).toBe('string');
    expect(typeof state.background).toBe('string');
    expect(typeof state.axisColor).toBe('string');
    expect(typeof state.gridColor).toBe('string');
    expect(typeof state.borderColor).toBe('string');
  });

  test('dark scheme → isDark=true, background=#000000', () => {
    const payload = { type: 'scatter', config: { colorScheme: 'dark' } };
    const state = cs.resolveThemeState('scatter', payload);
    expect(state.isDark).toBe(true);
    expect(state.background).toBe('#000000');
  });

  test('grayscale scheme → isDark=false', () => {
    const payload = { type: 'box', config: { colorScheme: 'grayscale' } };
    const state = cs.resolveThemeState('box', payload);
    expect(state.isDark).toBe(false);
    expect(state.schemeId).toBe('grayscale');
  });

  test('null payload uses default scheme for the type', () => {
    const state = cs.resolveThemeState('box', null);
    expect(state.schemeId).toBe('grayscale');
  });

  test('venn reads colorScheme from style not config', () => {
    const payload = { style: { colorScheme: 'colorblind' } };
    const state = cs.resolveThemeState('venn', payload);
    expect(state.schemeId).toBe('colorblind');
  });

  test('unknown type still returns all fields', () => {
    const state = cs.resolveThemeState('', null);
    expect(typeof state.schemeId).toBe('string');
    expect(typeof state.isDark).toBe('boolean');
  });
});

describe('colorSchemes — resolveCategoricalPaletteForType()', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  test('empty type returns empty array', () => {
    expect(cs.resolveCategoricalPaletteForType('')).toEqual([]);
  });

  test('scatter → array of hex color strings', () => {
    const palette = cs.resolveCategoricalPaletteForType('scatter');
    expect(Array.isArray(palette)).toBe(true);
    expect(palette.length).toBeGreaterThan(0);
    palette.forEach(c => expect(c).toMatch(/^#[0-9a-fA-F]{6}$/));
  });

  test('box → grayscale palette by default', () => {
    const palette = cs.resolveCategoricalPaletteForType('box');
    expect(palette.length).toBeGreaterThan(0);
    palette.forEach(c => {
      const { r, g, b } = hexToRgb(c);
      expect(r).toBe(g);
      expect(g).toBe(b);
    });
  });

  test('schemeId option overrides the type default', () => {
    const scientific = cs.resolveCategoricalPaletteForType('box', { schemeId: 'scientific' });
    const grayscale  = cs.resolveCategoricalPaletteForType('box', { schemeId: 'grayscale' });
    expect(scientific).not.toEqual(grayscale);
  });

  test('returns a fresh copy — mutations do not affect subsequent calls', () => {
    const a = cs.resolveCategoricalPaletteForType('scatter');
    a[0] = '#123456';
    const b = cs.resolveCategoricalPaletteForType('scatter');
    expect(b[0]).not.toBe('#123456');
  });
});

describe('colorSchemes — applyToPayload()', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  test('returns a new object, not the same reference', () => {
    const payload = { type: 'scatter', config: {} };
    const result = cs.applyToPayload('scatter', payload, 'scientific');
    expect(result).not.toBe(payload);
  });

  test('does not mutate the original payload', () => {
    const payload = { type: 'scatter', config: { fill: '#aabbcc' } };
    const before = JSON.stringify(payload);
    cs.applyToPayload('scatter', payload, 'soft');
    expect(JSON.stringify(payload)).toBe(before);
  });

  test('sets config.colorScheme to the requested scheme id', () => {
    const result = cs.applyToPayload('scatter', { config: {} }, 'soft');
    expect(result.config.colorScheme).toBe('soft');
  });

  test('scatter scientific → config.fill is a hex color', () => {
    const result = cs.applyToPayload('scatter', { config: {} }, 'scientific');
    expect(result.config.fill).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  test('scientific and grayscale produce different fill colors for scatter', () => {
    const sci  = cs.applyToPayload('scatter', { config: {} }, 'scientific');
    const gray = cs.applyToPayload('scatter', { config: {} }, 'grayscale');
    expect(sci.config.fill).not.toBe(gray.config.fill);
  });

  test('missing type returns the input payload unchanged', () => {
    const payload = { config: { fill: '#ff0000' } };
    const result = cs.applyToPayload('', payload, 'scientific');
    expect(result.config.fill).toBe('#ff0000');
  });

  test('null payload does not throw and returns an object', () => {
    const result = cs.applyToPayload('scatter', null, 'scientific');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('object');
  });

  test('venn sets style.colorScheme', () => {
    const result = cs.applyToPayload('venn', { style: {} }, 'colorblind');
    expect(result.style.colorScheme).toBe('colorblind');
  });
});

describe('colorSchemes — applyDefaultToPayload()', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  test('box default scheme is grayscale', () => {
    const result = cs.applyDefaultToPayload('box', { config: {} });
    expect(result.config.colorScheme).toBe('grayscale');
  });

  test('scatter default scheme is scientific', () => {
    const result = cs.applyDefaultToPayload('scatter', { config: {} });
    expect(result.config.colorScheme).toBe('scientific');
  });

  test('does not mutate the original payload', () => {
    const payload = { config: {} };
    const before = JSON.stringify(payload);
    cs.applyDefaultToPayload('scatter', payload);
    expect(JSON.stringify(payload)).toBe(before);
  });

  test('missing type returns input unchanged', () => {
    const payload = { config: { colorScheme: 'dark' } };
    const result = cs.applyDefaultToPayload('', payload);
    expect(result.config.colorScheme).toBe('dark');
  });
});

function hexToRgb(hex) {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
