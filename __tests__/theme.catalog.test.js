describe('Shared.themeCatalog', () => {
  let catalog;

  const DARK_SCHEME = {
    id: 'dark',
    label: 'Dark',
    tokens: { background: '#1a1a2e', textColor: '#f2f2f2' }
  };
  const LIGHT_SCHEME = {
    id: 'scientific',
    label: 'Scientific',
    tokens: { background: '#ffffff', textColor: '#000000' }
  };
  const COLORBLIND_SCHEME = {
    id: 'colorblind',
    label: 'Colorblind',
    tokens: {}
  };

  beforeEach(() => {
    jest.resetModules();
    delete window.Shared;
    require('../js/shared/theme/themeCatalog.js');
    catalog = window.Shared.themeCatalog;
  });

  test('exposes the expected API', () => {
    expect(typeof catalog.registerScheme).toBe('function');
    expect(typeof catalog.registerAll).toBe('function');
    expect(typeof catalog.getScheme).toBe('function');
    expect(typeof catalog.list).toBe('function');
    expect(typeof catalog.setTypeDefault).toBe('function');
    expect(typeof catalog.getTypeDefault).toBe('function');
    expect(typeof catalog.setTypeOptions).toBe('function');
    expect(typeof catalog.getTypeOptions).toBe('function');
    expect(typeof catalog.snapshot).toBe('function');
  });

  describe('registerScheme', () => {
    test('returns true and stores a frozen scheme', () => {
      expect(catalog.registerScheme('dark', DARK_SCHEME)).toBe(true);
      const retrieved = catalog.getScheme('dark');
      expect(retrieved).not.toBeNull();
      expect(Object.isFrozen(retrieved)).toBe(true);
    });

    test('normalises id to lowercase', () => {
      catalog.registerScheme('SCIENTIFIC', LIGHT_SCHEME);
      expect(catalog.getScheme('scientific')).not.toBeNull();
      expect(catalog.getScheme('SCIENTIFIC')).not.toBeNull();
    });

    test('trims whitespace from id', () => {
      catalog.registerScheme('  dark  ', DARK_SCHEME);
      expect(catalog.getScheme('dark')).not.toBeNull();
    });

    test('uses scheme.id when first arg is falsy', () => {
      catalog.registerScheme(null, DARK_SCHEME);
      expect(catalog.getScheme('dark')).not.toBeNull();
    });

    test('returns false for missing id and scheme.id', () => {
      expect(catalog.registerScheme('', {})).toBe(false);
    });

    test('returns false when scheme is not an object', () => {
      expect(catalog.registerScheme('x', null)).toBe(false);
      expect(catalog.registerScheme('x', 'string')).toBe(false);
    });

    test('overwrites an existing scheme', () => {
      catalog.registerScheme('dark', { id: 'dark', label: 'Old' });
      catalog.registerScheme('dark', { id: 'dark', label: 'New' });
      expect(catalog.getScheme('dark').label).toBe('New');
    });

    test('forces id on the stored object to the normalised key', () => {
      catalog.registerScheme('DARK', DARK_SCHEME);
      expect(catalog.getScheme('dark').id).toBe('dark');
    });
  });

  describe('registerAll', () => {
    test('registers multiple schemes at once', () => {
      const result = catalog.registerAll({
        dark: DARK_SCHEME,
        scientific: LIGHT_SCHEME,
        colorblind: COLORBLIND_SCHEME
      });
      expect(result.length).toBe(3);
      expect(catalog.getScheme('dark')).not.toBeNull();
      expect(catalog.getScheme('scientific')).not.toBeNull();
      expect(catalog.getScheme('colorblind')).not.toBeNull();
    });

    test('returns current list (sorted) after registration', () => {
      catalog.registerAll({ z: { id: 'z' }, a: { id: 'a' } });
      const list = catalog.list();
      expect(list[0].id).toBe('a');
      expect(list[1].id).toBe('z');
    });

    test('handles non-object input gracefully', () => {
      expect(() => catalog.registerAll(null)).not.toThrow();
      expect(() => catalog.registerAll(42)).not.toThrow();
    });
  });

  describe('getScheme', () => {
    beforeEach(() => {
      catalog.registerScheme('dark', DARK_SCHEME);
      catalog.registerScheme('scientific', LIGHT_SCHEME);
    });

    test('returns scheme by id', () => {
      const s = catalog.getScheme('dark');
      expect(s.id).toBe('dark');
    });

    test('returns null for unknown id', () => {
      expect(catalog.getScheme('unknown')).toBeNull();
    });

    test('uses fallbackId when primary id is unknown', () => {
      const s = catalog.getScheme('nonexistent', 'scientific');
      expect(s.id).toBe('scientific');
    });

    test('returns null when both id and fallback are unknown', () => {
      expect(catalog.getScheme('x', 'y')).toBeNull();
    });

    test('is case-insensitive', () => {
      expect(catalog.getScheme('DARK')).not.toBeNull();
      expect(catalog.getScheme('Scientific')).not.toBeNull();
    });
  });

  describe('list', () => {
    test('returns empty array when nothing registered', () => {
      expect(catalog.list()).toEqual([]);
    });

    test('returns all registered schemes sorted by id', () => {
      catalog.registerScheme('z', { id: 'z' });
      catalog.registerScheme('a', { id: 'a' });
      catalog.registerScheme('m', { id: 'm' });
      const list = catalog.list();
      expect(list.map(s => s.id)).toEqual(['a', 'm', 'z']);
    });

    test('returned array is a fresh copy each call', () => {
      catalog.registerScheme('dark', DARK_SCHEME);
      const list1 = catalog.list();
      const list2 = catalog.list();
      expect(list1).not.toBe(list2);
    });
  });

  describe('setTypeDefault / getTypeDefault', () => {
    test('stores and retrieves a type default', () => {
      catalog.setTypeDefault('scatter', 'dark');
      expect(catalog.getTypeDefault('scatter')).toBe('dark');
    });

    test('is case-insensitive for type and schemeId', () => {
      catalog.setTypeDefault('SCATTER', 'DARK');
      expect(catalog.getTypeDefault('scatter')).toBe('dark');
    });

    test('returns "scientific" when no default set and no fallback', () => {
      expect(catalog.getTypeDefault('line')).toBe('scientific');
    });

    test('returns custom fallback when no default set', () => {
      expect(catalog.getTypeDefault('line', 'dark')).toBe('dark');
    });

    test('setTypeDefault returns false for empty type or schemeId', () => {
      expect(catalog.setTypeDefault('', 'dark')).toBe(false);
      expect(catalog.setTypeDefault('scatter', '')).toBe(false);
    });

    test('setTypeDefault returns true on success', () => {
      expect(catalog.setTypeDefault('box', 'colorblind')).toBe(true);
    });
  });

  describe('setTypeOptions / getTypeOptions', () => {
    test('stores and retrieves options for a type', () => {
      catalog.setTypeOptions('scatter', ['dark', 'scientific', 'colorblind']);
      expect(catalog.getTypeOptions('scatter')).toEqual(['dark', 'scientific', 'colorblind']);
    });

    test('normalises option ids to lowercase', () => {
      catalog.setTypeOptions('box', ['DARK', 'Scientific']);
      expect(catalog.getTypeOptions('box')).toEqual(['dark', 'scientific']);
    });

    test('filters empty strings from option list', () => {
      catalog.setTypeOptions('pie', ['dark', '', 'scientific']);
      expect(catalog.getTypeOptions('pie')).toEqual(['dark', 'scientific']);
    });

    test('returns [] when no options set', () => {
      expect(catalog.getTypeOptions('venn')).toEqual([]);
    });

    test('returns a copy — mutating result does not affect stored options', () => {
      catalog.setTypeOptions('line', ['dark', 'scientific']);
      const options = catalog.getTypeOptions('line');
      options.push('extra');
      expect(catalog.getTypeOptions('line')).toHaveLength(2);
    });

    test('setTypeOptions returns false for non-array optionIds', () => {
      expect(catalog.setTypeOptions('scatter', null)).toBe(false);
      expect(catalog.setTypeOptions('scatter', 'dark')).toBe(false);
    });

    test('setTypeOptions returns false for empty type', () => {
      expect(catalog.setTypeOptions('', ['dark'])).toBe(false);
    });
  });

  describe('snapshot', () => {
    test('returns a deep clone of current state', () => {
      catalog.registerScheme('dark', DARK_SCHEME);
      catalog.setTypeDefault('scatter', 'dark');
      catalog.setTypeOptions('scatter', ['dark', 'scientific']);

      const snap = catalog.snapshot();
      expect(snap.schemes.dark).toBeDefined();
      expect(snap.typeDefaults.scatter).toBe('dark');
      expect(snap.typeOptions.scatter).toEqual(['dark', 'scientific']);
    });

    test('snapshot is isolated from future mutations', () => {
      catalog.registerScheme('dark', DARK_SCHEME);
      const snap = catalog.snapshot();
      catalog.registerScheme('scientific', LIGHT_SCHEME);
      expect(snap.schemes.scientific).toBeUndefined();
    });
  });
});
