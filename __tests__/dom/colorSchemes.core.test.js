function loadModule() {
  jest.resetModules();
  delete window.Shared;
  require('../../js/shared/theme/themeCatalog.js');
  require('../../js/shared/colorSchemes.js');
  window.Shared.themeCatalog.registerAll(window.Shared.colorSchemes.getSchemes());
  return window.Shared.colorSchemes;
}

describe('colorSchemes — independent appearance and category identity', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  const cases = [
    ['venn', { style: {} }, payload => [payload.style.colorA, payload.style.colorB, payload.style.colorC]],
    ['box', { data: [['A', 'B'], [1, 2]], config: { colorMode: 'individual' } }, payload => payload.config.colors],
    ['scatter', { data: [['Label', 'X', 'Y'], ['A', 1, 2], ['B', 2, 3]] }, payload => payload.config.labelColors],
    ['pca', { data: [['Variable', 'A', 'B'], ['Var1', 1, 2]] }, payload => payload.config.labelColors],
    ['line', { data: [['X', 'A', 'B'], [0, 1, 2]] }, payload => payload.config.labelColors],
    ['hist', { data: [['A', 'B'], [1, 2]] }, payload => payload.config.seriesColors],
    ['pie', { data: [['Label', 'Value'], ['A', 1], ['B', 2]] }, payload => payload.config.colors],
    ['roc', { data: [['Label', 'A', 'B'], [0, 1, 2]] }, payload => payload.config.labelColors],
    ['survival', { data: [['Group', 'Time', 'Event'], ['A', 1, 1], ['B', 2, 0]] }, payload => payload.config.labelColors],
    ['heatmap', { config: { colors: { negative: '#123456', zero: '#abcdef', positive: '#fedcba' } } }, payload => payload.config.colors],
    ['surface', { config: { settings: { colorRamp: 'plasma' } } }, payload => payload.config.settings.colorRamp]
  ];

  test.each(cases)('%s preserves its palette/value scale through a serialized dark/light round trip', (type, input, colors) => {
    const scheme = type === 'surface' ? 'surface-plasma' : 'normal';
    const original = cs.applyToPayload(type, { type, ...input }, scheme);
    const before = JSON.stringify(original);
    const dark = cs.applyAppearanceToPayload(type, original, 'dark');
    const stored = JSON.parse(JSON.stringify(dark));
    expect(cs.getSchemeIdentity(type === 'venn' ? stored.style.colorScheme : stored.config.colorScheme))
      .toEqual({ paletteId: scheme, appearance: 'dark' });
    expect(cs.resolveThemeState(type, stored).isDark).toBe(true);
    if(['heatmap', 'surface'].includes(type)) expect(colors(stored)).toEqual(colors(original));
    const restored = cs.applyAppearanceToPayload(type, stored, 'light');
    expect(colors(restored)).toEqual(colors(original));
    expect(cs.resolveThemeState(type, restored).isDark).toBe(false);
    expect(JSON.stringify(original)).toBe(before);
  });

  test.each(['line', 'roc', 'survival', 'scatter', 'pca', 'pie'])('%s keeps existing category assignments after data reorder or filtering and another palette choice', type => {
    const entry = cases.find(item => item[0] === type);
    const original = cs.applyToPayload(type, { type, ...entry[1] }, 'normal');
    if(['line', 'roc', 'pca'].includes(type)){
      original.data = original.data.map(row => [row[0], ...row.slice(1).reverse()]);
    }else{
      original.data = [original.data[0], ...original.data.slice(1).reverse().slice(0, 1)];
    }
    const changed = cs.applyToPayload(type, original, 'soft');
    const sourceColors = entry[2](original);
    const nextColors = entry[2](changed);
    const normal = cs.getSchemes().normal.categorical;
    const soft = cs.getSchemes().soft.categorical;
    Object.keys(sourceColors).forEach(key => {
      expect(nextColors[key]).toBe(soft[normal.indexOf(sourceColors[key])]);
    });
  });

  test('appearance preserves custom fills, transparency, and a separately selected density scale', () => {
    const source = {
      type: 'scatter',
      config: { colorScheme: 'normal', densityPalette: 'magma', fill: '#123456',
        labelColors: { A: '#abcdef' }, labelStyles: { A: { fill: '#abcdef', opacity: 0.38, size: 4 } } }
    };
    const dark = cs.applyAppearanceToPayload('scatter', source, 'dark');
    expect(dark.config.fill).toBe('#123456');
    expect(dark.config.labelColors.A).toBe('#abcdef');
    expect(dark.config.labelStyles.A).toMatchObject({ fill: '#abcdef', opacity: 0.38, size: 4 });
    expect(dark.config.densityPalette).toBe('magma');
    expect(cs.applyToPayload('scatter', dark, 'soft').config.densityPalette).toBe('magma');
  });

  test('a moved Box dataset retains its palette position when appearance changes', () => {
    const source = cs.applyToPayload('box', { data: [['A', 'B'], [1, 2]], config: {} }, 'normal');
    source.data = [['B', 'A'], [2, 1]];
    source.config.colors.reverse();
    const dark = cs.applyAppearanceToPayload('box', source, 'dark');
    const palette = cs.getSchemes()['normal-dark'].categorical;
    expect(dark.config.colors).toEqual([palette[1], palette[0]]);
    expect(cs.applyAppearanceToPayload('box', dark, 'light').config.colors).toEqual(source.config.colors);
  });

  test('PCA appearance retains custom group and point fills without altering their other styles', () => {
    const source = cs.applyToPayload('pca', { data: [['Variable', 'A'], ['V1', 1]] }, 'normal');
    source.config.pointStyleScopes = {
      global: { fill: '#123456', size: 5 },
      groups: { 'group-A': { fill: '#abcdef', opacity: 0.4 } },
      points: { 'label:A': { fill: '#765432', borderWidth: 2 } }
    };
    const dark = cs.applyAppearanceToPayload('pca', source, 'dark');
    expect(dark.config.pointStyleScopes.global).toMatchObject(source.config.pointStyleScopes.global);
    expect(dark.config.pointStyleScopes.groups).toEqual(source.config.pointStyleScopes.groups);
    expect(dark.config.pointStyleScopes.points).toEqual(source.config.pointStyleScopes.points);
  });

  test('UpSet data paints survive appearance changes, including deliberate black', () => {
    const source = { type: 'venn', style: { colorScheme: 'scientific',
      upset: { barColor: '#000000', setBarColor: '#123456', dotColor: '#000000' } } };
    const dark = cs.applyAppearanceToPayload('venn', source, 'dark');
    expect(dark.style.upset.barColor).toBe('#000000');
    expect(dark.style.upset.dotColor).toBe('#000000');
    expect(dark.style.upset.setBarColor).toBe('#123456');
    expect(cs.applyAppearanceToPayload('venn', dark, 'light').style.upset).toMatchObject(source.style.upset);
  });

  test('paired dark and light appearances expose identical categorical palettes', () => {
    const schemes = cs.getSchemes();
    for(const paletteId of ['normal', 'soft', 'scientific', 'colorblind', 'grayscale',
      'dark', 'surface-viridis', 'surface-plasma', 'surface-magma', 'surface-turbo',
      'surface-bluered', 'surface-grayscale']){
      const darkId = paletteId === 'dark' ? 'dark' : `${paletteId}-dark`;
      const lightId = paletteId === 'dark' ? 'dark-light' : paletteId;
      expect(schemes[darkId].categorical).toEqual(schemes[lightId].categorical);
      expect(schemes[darkId].sequential).toEqual(schemes[lightId].sequential);
      expect(schemes[darkId].diverging).toEqual(schemes[lightId].diverging);
    }
    expect(cs.resolveCategoricalPaletteForType('box', { schemeId: 'grayscale-dark' }))
      .toEqual(cs.resolveCategoricalPaletteForType('box', { schemeId: 'grayscale' }));
  });

  test.each(cases)('%s never modifies non-presentation graph state on appearance change', (type, input) => {
    const schemeId = type === 'surface' ? 'surface-plasma' : 'normal';
    const initial = cs.applyToPayload(type, { type, ...input }, schemeId);
    const snapshot = JSON.parse(JSON.stringify(initial));
    const dark = cs.applyAppearanceToPayload(type, initial, 'dark');
    const restored = cs.applyAppearanceToPayload(type, dark, 'light');
    expect(restored).toEqual(snapshot);
    expect(initial).toEqual(snapshot);
  });

  test('dark appearance does not normalize explicit data colors or column-specific Box overrides', () => {
    const original = {
      type: 'box',
      data: [['A', 'B'], [4, 8]],
      config: {
        colorScheme: 'grayscale',
        fill: '#000000', border: '#fefefe',
        colors: ['#000000', '#abcdef'], borderColors: ['#222222', '#010203'],
        shapeStyles: { 0: { fill: '#fedcba', opacity: 0.4 } },
        pointStyles: { 1: { markerFill: '#caad00', borderColor: '#234567' } },
        summaryStyles: { 0: { color: '#010203' } },
        significanceStyle: { color: '#101010' }
      }
    };
    const dark = cs.applyAppearanceToPayload('box', original, 'dark');
    expect(dark.config).toMatchObject({
      ...original.config, colorScheme: 'grayscale-dark'
    });
    expect(cs.applyAppearanceToPayload('box', dark, 'light')).toEqual(original);
  });

});

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

  test('normal scheme uses the same darker blue across palette variants', () => {
    const normal = cs.getSchemes().normal;
    expect(normal.categorical[0]).toBe('#1f77b4');
    expect(normal.sequential[0]).toBe('#1f77b4');
    expect(normal.diverging.negative).toBe('#1f77b4');
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

  test.each(['venn', 'scatter', 'pca', 'line', 'heatmap', 'roc', 'survival', 'hist', 'pie'])('%s → normal (global default)', type => {
    expect(cs.getDefaultSchemeId(type)).toBe('normal');
  });

  test('unknown type → normal (global default)', () => {
    expect(cs.getDefaultSchemeId('unknown-xyz')).toBe('normal');
  });

  test('uses ThemeCatalog as the authoritative type-default resolver', () => {
    window.Shared.themeCatalog.setTypeDefault('heatmap', 'soft');
    expect(cs.getDefaultSchemeId('heatmap')).toBe('soft');

    window.Shared.themeCatalog.setTypeDefault('heatmap', 'missing-scheme');
    expect(cs.getDefaultSchemeId('heatmap')).toBe('normal');
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
    expect(cs.resolveThemeState('scatter', null).schemeId).toBe('normal');
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

describe('colorSchemes — resolveDisplayedSchemeIdForType()', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });
  afterEach(() => { delete window.Main; });

  test('distinguishes a named Heatmap palette from custom effective colors', () => {
    const namedPayload = cs.applyToPayload('heatmap', {
      type: 'heatmap',
      config: {
        colorScheme: 'soft',
        colors: { negative: '#0000ff', zero: '#ffffff', positive: '#ff0000' }
      }
    }, 'soft');
    window.Main = { session: { getActiveTab: () => ({ type: 'heatmap', payload: namedPayload }) } };
    expect(cs.resolveDisplayedSchemeIdForType('heatmap')).toBe('soft');

    const customPayload = {
      type: 'heatmap',
      config: {
        colorScheme: 'soft',
        colors: { negative: '#123456', zero: '#abcdef', positive: '#fedcba' }
      }
    };
    window.Main.session.getActiveTab = () => ({ type: 'heatmap', payload: customPayload });
    expect(cs.resolveDisplayedSchemeIdForType('heatmap')).toBe('custom');
  });

  test('ignores theme tokens that the Heatmap payload does not store', () => {
    const schemePayload = cs.applyToPayload('heatmap', {
      type: 'heatmap',
      config: {
        colorScheme: 'soft',
        colors: { negative: '#0000ff', zero: '#ffffff', positive: '#ff0000' },
        dendrogram: { color: '#222222' }
      }
    }, 'soft');
    const liveSnapshot = {
      type: 'heatmap',
      config: {
        colorScheme: 'soft',
        colors: { ...schemePayload.config.colors },
        dendrogram: { color: schemePayload.config.dendrogram.color }
      }
    };
    window.Main = { session: { getActiveTab: () => ({ type: 'heatmap', payload: liveSnapshot }) } };

    expect(cs.resolveDisplayedSchemeIdForType('heatmap')).toBe('soft');
  });

  test('uses the active Heatmap owner snapshot instead of a stale tab payload', () => {
    const livePayload = cs.applyToPayload('heatmap', {
      type: 'heatmap',
      config: { colorScheme: 'soft' }
    }, 'soft');
    const stalePayload = {
      type: 'heatmap',
      config: {
        colorScheme: 'soft',
        colors: { negative: '#123456', zero: '#abcdef', positive: '#fedcba' }
      }
    };
    const getColorSchemePayload = jest.fn(() => livePayload);
    const getPayload = jest.fn();
    window.Main = {
      session: { getActiveTab: () => ({ id: 'heatmap-live', type: 'heatmap', payload: stalePayload }) },
      components: { get: () => ({ getColorSchemePayload, getPayload }) }
    };

    expect(cs.resolveDisplayedSchemeIdForType('heatmap', { preferWorkspace: true })).toBe('soft');
    expect(getColorSchemePayload).toHaveBeenCalledWith(expect.objectContaining({
      tabId: 'heatmap-live',
      type: 'heatmap'
    }));
    expect(getPayload).not.toHaveBeenCalled();
  });

  test.each(['line', 'roc'])('%s keeps its named palette after dark appearance is applied', type => {
    const data = type === 'line'
      ? [['X', 'Series A', 'Series B'], [0, 1, 2]]
      : [['Label', 'Predictor A', 'Predictor B'], [0, 0.2, 0.4], [1, 0.8, 0.6]];
    const palettePayload = cs.applyToPayload(type, { type, data }, 'scientific');
    const darkPayload = cs.applyAppearanceToPayload(type, palettePayload, 'dark');
    window.Main = {
      session: { getActiveTab: () => ({ id: `${type}-owner`, type, payload: darkPayload }) }
    };

    expect(cs.resolveDisplayedSchemeIdForType(type)).toBe('scientific-dark');
  });
});

describe('colorSchemes — applyToSvg()', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  test('themes replacement 2D SVG text and observes later labels', async () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    expect(cs.applyToSvg('hist', svg, { schemeId: 'dark' })).toBe(true);

    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('fill', '#000000');
    svg.appendChild(text);
    await Promise.resolve();

    expect(svg.getAttribute('data-color-scheme')).toBe('dark');
    expect(svg.style.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(text.getAttribute('fill')).toBe('#f2f2f2');
  });

  test('leaves 3D SVG rendering to the component', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.dataset.viewMode = '3d';
    expect(cs.applyToSvg('line', svg, { schemeId: 'dark' })).toBe(true);
    expect(svg.style.backgroundColor).toBe('');
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

  test('pca label colors are scoped to sample labels and remain idempotent', () => {
    const payload = {
      type: 'pca',
      data: [
        ['Label point', true, false, false, true],
        ['Variable', 'Sample A', 'Sample B', 'Sample C', 'Sample D'],
        ['Var1', 1, 2, 3, 4],
        ['Var2', 4, 3, 2, 1]
      ],
      config: {
        labelColors: {
          'Sample A': '#111111',
          Variable: '#222222',
          Var1: '#333333',
          Var2: '#444444'
        },
        labelPointStyles: {
          'Sample A': { color: '#111111' },
          Var1: { color: '#333333' }
        }
      }
    };

    const once = cs.applyToPayload('pca', payload, 'grayscale');
    const twice = cs.applyToPayload('pca', once, 'grayscale');

    expect(Object.keys(once.config.labelColors).sort()).toEqual(['Sample A', 'Sample B', 'Sample C', 'Sample D']);
    expect(Object.keys(once.config.labelPointStyles).sort()).toEqual(['Sample A', 'Sample B', 'Sample C', 'Sample D']);
    expect(JSON.stringify(twice.config.labelColors)).toBe(JSON.stringify(once.config.labelColors));
    expect(JSON.stringify(twice.config.labelPointStyles)).toBe(JSON.stringify(once.config.labelPointStyles));
  });

  test('line palette maps current data series before stale label keys', () => {
    const result = cs.applyToPayload('line', {
      type: 'line',
      data: [
        ['X', 'Mean reaction time', 'Median reaction time', '25th percentile', '75th percentile'],
        [1, 1, 2, 3, 4]
      ],
      config: {
        labelColors: {
          'Series 1': '#0000ff',
          'Series 2': '#ff0000',
          'Series 3': '#00aa00',
          'Series 4': '#ff8c00',
          'Series 5': '#800080'
        }
      }
    }, 'normal');

    expect(result.config.labelColors).toMatchObject({
      'Mean reaction time': '#1f77b4',
      'Median reaction time': '#e41a1c',
      '25th percentile': '#4daf4a',
      '75th percentile': '#984ea3'
    });
  });

  test('ROC palette maps predictor headers before stale class labels', () => {
    const palette = cs.resolveCategoricalPaletteForType('roc', { schemeId: 'normal' });
    const result = cs.applyToPayload('roc', {
      type: 'roc',
      data: [
        ['Label', 'WFNS grade', 'S100B (μg/L)'],
        [0, 0.13, 3.01],
        [1, 0.44, 5.18]
      ],
      config: {
        labelColors: { '0': '#0000ff', '1': '#ff0000' }
      }
    }, 'normal');

    expect(result.config.labelColors['WFNS grade']).toBe(palette[0]);
    expect(result.config.labelColors['S100B (μg/L)']).toBe(palette[1]);
  });

  test('Survival palette maps current groups before stale label keys', () => {
    const palette = cs.resolveCategoricalPaletteForType('survival', { schemeId: 'normal' });
    const result = cs.applyToPayload('survival', {
      type: 'survival',
      data: [
        ['Group', 'Time', 'Event'],
        ['Treatment A', 1, 1],
        ['Treatment B', 2, 0]
      ],
      config: {
        labelColors: { 'Prior group': '#0000ff' }
      }
    }, 'normal');

    expect(result.config.labelColors['Treatment A']).toBe(palette[0]);
    expect(result.config.labelColors['Treatment B']).toBe(palette[1]);
  });
});

describe('colorSchemes — applyDefaultToPayload()', () => {
  let cs;
  beforeEach(() => { cs = loadModule(); });

  test('box default scheme is grayscale', () => {
    const result = cs.applyDefaultToPayload('box', { config: {} });
    expect(result.config.colorScheme).toBe('grayscale');
  });

  test('scatter default scheme is normal', () => {
    const result = cs.applyDefaultToPayload('scatter', { config: {} });
    expect(result.config.colorScheme).toBe('normal');
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
