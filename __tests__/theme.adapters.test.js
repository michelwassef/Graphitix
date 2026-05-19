describe('Shared.themeAdapters', () => {
  let adapters;
  let compiler;

  const darkScheme = {
    id: 'dark',
    tokens: {
      axisColor: '#cccccc',
      gridColor: '#444444',
      background: '#1a1a2e',
      textColor: '#f2f2f2'
    }
  };

  const lightScheme = {
    id: 'scientific',
    tokens: {
      axisColor: '#000000',
      gridColor: '#dddddd',
      background: '#ffffff',
      textColor: '#000000'
    }
  };

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/theme/themeCompiler.js');
    require('../js/shared/theme/themeAdapters.js');
    adapters = window.Shared.themeAdapters;
    compiler = window.Shared.themeCompiler;
  });

  test('exposes expected API', () => {
    expect(typeof adapters.installDefaultAdapters).toBe('function');
    expect(typeof adapters.createGenericAdapter).toBe('function');
    expect(typeof adapters.applyAxisTokens).toBe('function');
    expect(typeof adapters.cloneValue).toBe('function');
    expect(typeof adapters.ensureObject).toBe('function');
    expect(typeof adapters.ensureArray).toBe('function');
  });

  describe('ensureObject', () => {
    test('returns the value when it is a plain object', () => {
      const obj = { a: 1 };
      expect(adapters.ensureObject(obj)).toBe(obj);
    });
    test('returns {} for null / undefined / primitives', () => {
      expect(adapters.ensureObject(null)).toEqual({});
      expect(adapters.ensureObject(undefined)).toEqual({});
      expect(adapters.ensureObject(42)).toEqual({});
      expect(adapters.ensureObject('str')).toEqual({});
    });

    test('returns the array as-is (arrays are typeof object)', () => {
      const arr = [1, 2];
      expect(adapters.ensureObject(arr)).toBe(arr);
    });
  });

  describe('ensureArray', () => {
    test('returns the same array', () => {
      const arr = [1, 2, 3];
      expect(adapters.ensureArray(arr)).toBe(arr);
    });
    test('returns [] for non-arrays', () => {
      expect(adapters.ensureArray(null)).toEqual([]);
      expect(adapters.ensureArray({})).toEqual([]);
      expect(adapters.ensureArray('str')).toEqual([]);
    });
  });

  describe('cloneValue', () => {
    test('deep clones plain objects', () => {
      const original = { a: { b: 2 } };
      const cloned = adapters.cloneValue(original);
      expect(cloned).toEqual(original);
      expect(cloned).not.toBe(original);
      expect(cloned.a).not.toBe(original.a);
    });
    test('returns null/undefined as-is', () => {
      expect(adapters.cloneValue(null)).toBeNull();
      expect(adapters.cloneValue(undefined)).toBeUndefined();
    });
    test('clones arrays', () => {
      const arr = [1, { x: 2 }];
      const cloned = adapters.cloneValue(arr);
      expect(cloned).toEqual(arr);
      expect(cloned).not.toBe(arr);
    });
  });

  describe('applyAxisTokens', () => {
    test('applies axisColor to cfg.axis.color', () => {
      const cfg = {};
      const result = adapters.applyAxisTokens(cfg, darkScheme);
      expect(result.axis.color).toBe('#cccccc');
    });

    test('applies gridColor to cfg.gridStyle.color when gridStyle present', () => {
      const cfg = { gridStyle: { color: 'old' } };
      const result = adapters.applyAxisTokens(cfg, darkScheme);
      expect(result.gridStyle.color).toBe('#444444');
    });

    test('does not create gridStyle when absent', () => {
      const cfg = {};
      const result = adapters.applyAxisTokens(cfg, darkScheme);
      expect(result.gridStyle).toBeUndefined();
    });

    test('applies background token as backgroundColor', () => {
      const cfg = {};
      const result = adapters.applyAxisTokens(cfg, darkScheme);
      expect(result.backgroundColor).toBe('#1a1a2e');
    });

    test('applies textColor token', () => {
      const cfg = {};
      const result = adapters.applyAxisTokens(cfg, darkScheme);
      expect(result.textColor).toBe('#f2f2f2');
    });

    test('returns an object even for null cfg', () => {
      const result = adapters.applyAxisTokens(null, lightScheme);
      expect(result).toBeInstanceOf(Object);
      expect(result.axis.color).toBe('#000000');
    });

    test('does not mutate tokens that are absent', () => {
      const cfg = {};
      const schemeNoAxis = { id: 'x', tokens: {} };
      const result = adapters.applyAxisTokens(cfg, schemeNoAxis);
      expect(result.axis).toEqual({});
      expect(result.backgroundColor).toBeUndefined();
    });
  });

  describe('createGenericAdapter', () => {
    test('returns a function', () => {
      const adapter = adapters.createGenericAdapter('scatter');
      expect(typeof adapter).toBe('function');
    });

    test('produced adapter clones payload and stamps type', () => {
      const adapter = adapters.createGenericAdapter('scatter');
      const payload = { type: 'scatter', config: { foo: 'bar' } };
      const result = adapter(payload, lightScheme, {});
      expect(result).not.toBe(payload);
      expect(result.type).toBe('scatter');
      expect(result.config.foo).toBe('bar');
    });

    test('sets cfg.colorScheme from scheme id', () => {
      const adapter = adapters.createGenericAdapter('box');
      const result = adapter({ type: 'box', config: {} }, darkScheme, {});
      expect(result.config.colorScheme).toBe('dark');
    });

    test('applies axis tokens from scheme', () => {
      const adapter = adapters.createGenericAdapter('line');
      const result = adapter({ type: 'line', config: {} }, darkScheme, {});
      expect(result.config.axis.color).toBe('#cccccc');
    });

    test('uses legacyApply from context when provided', () => {
      const legacyApply = jest.fn(() => ({ legacy: true }));
      const adapter = adapters.createGenericAdapter('pca');
      const result = adapter({}, darkScheme, { legacyApply });
      expect(legacyApply).toHaveBeenCalledWith('pca', {}, darkScheme, {});
      expect(result).toEqual({ legacy: true });
    });

    test('handles null payload gracefully — produces minimum shape', () => {
      const adapter = adapters.createGenericAdapter('hist');
      const result = adapter(null, lightScheme, {});
      expect(result.type).toBe('hist');
      expect(result.config).toBeInstanceOf(Object);
    });
  });

  describe('installDefaultAdapters', () => {
    const EXPECTED_TYPES = ['scatter', 'line', 'pca', 'box', 'hist', 'pie', 'roc', 'survival', 'heatmap', 'surface', 'venn'];

    test('returns false when themeCompiler is missing', () => {
      delete window.Shared.themeCompiler;
      expect(adapters.installDefaultAdapters()).toBe(false);
    });

    test('returns true and registers all component types', () => {
      const result = adapters.installDefaultAdapters();
      expect(result).toBe(true);
      EXPECTED_TYPES.forEach(type => {
        expect(compiler.hasAdapter(type)).toBe(true);
      });
    });

    test('does not overwrite an already registered adapter', () => {
      const custom = jest.fn(() => ({ custom: true }));
      compiler.registerAdapter('scatter', custom);
      adapters.installDefaultAdapters();
      const result = compiler.compilePayload('scatter', {}, lightScheme, {});
      expect(custom).toHaveBeenCalled();
      expect(result).toEqual({ custom: true });
    });

    test('venn adapter stamped type is "venn"', () => {
      adapters.installDefaultAdapters();
      const result = compiler.compilePayload('venn', { style: {} }, lightScheme, {});
      expect(result.type).toBe('venn');
    });

    test('venn adapter sets colorScheme on style', () => {
      adapters.installDefaultAdapters();
      const result = compiler.compilePayload('venn', { type: 'venn', style: { colorScheme: 'old' } }, darkScheme, {});
      expect(result.style.colorScheme).toBe('dark');
    });

    test('venn adapter delegates to legacyApply when provided', () => {
      adapters.installDefaultAdapters();
      const legacyApply = jest.fn(() => ({ v: true }));
      const result = compiler.compilePayload('venn', {}, darkScheme, { legacyApply });
      expect(legacyApply).toHaveBeenCalledWith('venn', {}, darkScheme, {});
      expect(result).toEqual({ v: true });
    });
  });
});
