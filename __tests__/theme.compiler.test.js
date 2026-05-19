describe('Shared.themeCompiler', () => {
  let compiler;

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/theme/themeCompiler.js');
    compiler = window.Shared.themeCompiler;
  });

  test('namespace is exposed on Shared', () => {
    expect(compiler).toBeDefined();
    expect(typeof compiler.registerAdapter).toBe('function');
    expect(typeof compiler.hasAdapter).toBe('function');
    expect(typeof compiler.compilePayload).toBe('function');
    expect(typeof compiler.listAdapters).toBe('function');
  });

  describe('registerAdapter', () => {
    test('registers a valid adapter and returns true', () => {
      const result = compiler.registerAdapter('scatter', (payload) => ({ ...payload, themed: true }));
      expect(result).toBe(true);
      expect(compiler.hasAdapter('scatter')).toBe(true);
    });

    test('normalises type to lowercase', () => {
      compiler.registerAdapter('SCATTER', (p) => p);
      expect(compiler.hasAdapter('scatter')).toBe(true);
      expect(compiler.hasAdapter('SCATTER')).toBe(true);
    });

    test('trims whitespace from type', () => {
      compiler.registerAdapter('  box  ', (p) => p);
      expect(compiler.hasAdapter('box')).toBe(true);
    });

    test('returns false for empty type string', () => {
      expect(compiler.registerAdapter('', () => {})).toBe(false);
    });

    test('returns false when adapter is not a function', () => {
      expect(compiler.registerAdapter('scatter', null)).toBe(false);
      expect(compiler.registerAdapter('scatter', 42)).toBe(false);
      expect(compiler.registerAdapter('scatter', {})).toBe(false);
    });

    test('overwrites existing adapter for same type', () => {
      compiler.registerAdapter('box', () => 'first');
      compiler.registerAdapter('box', () => 'second');
      expect(compiler.compilePayload('box', {}, {})).toBe('second');
    });
  });

  describe('hasAdapter', () => {
    test('returns false when no adapter registered', () => {
      expect(compiler.hasAdapter('unknown-type')).toBe(false);
    });

    test('returns true after registration', () => {
      compiler.registerAdapter('line', (p) => p);
      expect(compiler.hasAdapter('line')).toBe(true);
    });

    test('is case insensitive', () => {
      compiler.registerAdapter('pca', (p) => p);
      expect(compiler.hasAdapter('PCA')).toBe(true);
      expect(compiler.hasAdapter('Pca')).toBe(true);
    });
  });

  describe('compilePayload', () => {
    test('returns null when no adapter registered for type', () => {
      expect(compiler.compilePayload('nonexistent', {}, {})).toBeNull();
    });

    test('calls adapter with payload, scheme, and context', () => {
      const adapter = jest.fn((payload, scheme, ctx) => ({ compiled: true, scheme: scheme.id, ctxKey: ctx.key }));
      compiler.registerAdapter('scatter', adapter);
      const result = compiler.compilePayload('scatter', { data: [] }, { id: 'dark' }, { key: 'val' });
      expect(adapter).toHaveBeenCalledWith({ data: [] }, { id: 'dark' }, { key: 'val' });
      expect(result).toEqual({ compiled: true, scheme: 'dark', ctxKey: 'val' });
    });

    test('passes empty object as context when context is omitted', () => {
      const adapter = jest.fn((payload, scheme, ctx) => ctx);
      compiler.registerAdapter('line', adapter);
      const result = compiler.compilePayload('line', {}, {});
      expect(result).toEqual({});
    });

    test('uses normalised type for lookup', () => {
      compiler.registerAdapter('heatmap', () => 'ok');
      expect(compiler.compilePayload('HEATMAP', {}, {})).toBe('ok');
    });

    test('adapter return value is passed through', () => {
      compiler.registerAdapter('surface', () => null);
      expect(compiler.compilePayload('surface', {}, {})).toBeNull();

      compiler.registerAdapter('surface', () => [1, 2, 3]);
      expect(compiler.compilePayload('surface', {}, {})).toEqual([1, 2, 3]);
    });
  });

  describe('listAdapters', () => {
    test('returns empty array when no adapters registered', () => {
      expect(compiler.listAdapters()).toEqual([]);
    });

    test('returns sorted list of registered adapter types', () => {
      compiler.registerAdapter('scatter', (p) => p);
      compiler.registerAdapter('box', (p) => p);
      compiler.registerAdapter('line', (p) => p);
      expect(compiler.listAdapters()).toEqual(['box', 'line', 'scatter']);
    });

    test('does not include duplicates when adapter overwritten', () => {
      compiler.registerAdapter('pie', (p) => p);
      compiler.registerAdapter('pie', (p) => ({ ...p, v2: true }));
      expect(compiler.listAdapters().filter(t => t === 'pie')).toHaveLength(1);
    });
  });

  describe('isolation', () => {
    test('fresh module load has no registered adapters', () => {
      jest.resetModules();
      delete window.Shared;
      require('../js/shared/theme/themeCompiler.js');
      const fresh = window.Shared.themeCompiler;
      expect(fresh.listAdapters()).toEqual([]);
    });
  });
});
