'use strict';

const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog.js');
const {
  COMPONENT_DATA_PATHS,
  RENDER_CACHE_MUTATION_ADAPTERS,
  buildRenderCacheVariantPayload
} = require('../../test-support/renderCacheMutationAdapters.js');

function readAtPath(value, path) {
  return path.reduce((current, key) => current?.[key], value);
}

function makeMatrixPayload(type) {
  const data = Array.from({ length: 4 }, () => Array(4).fill(1));
  if (type === 'roc') {
    data[0] = ['Class', 'Score', 'Other'];
    data[1][0] = 'positive';
  }
  return { type, data };
}

describe('render-cache mutation adapters', () => {
  test('declares one adapter for every catalogued component', () => {
    expect(Object.keys(RENDER_CACHE_MUTATION_ADAPTERS).sort()).toEqual(
      COMPONENT_CATALOG.map(component => component.type).sort()
    );
  });

  test.each(COMPONENT_CATALOG.map(component => component.type))(
    '%s changes only its declared canonical variant data',
    type => {
      const base = type === 'venn'
        ? { type, data: { listA: 'BRCA1\nEGFR', listB: 'TP53' } }
        : makeMatrixPayload(type);
      const original = JSON.parse(JSON.stringify(base));
      const variantA = buildRenderCacheVariantPayload(base, type, 'A');
      const variantB = buildRenderCacheVariantPayload(base, type, 'B');

      expect(base).toEqual(original);
      expect(variantA.mutation.componentType).toBe(type);
      expect(variantB.mutation.componentType).toBe(type);
      expect(variantA.payload).not.toEqual(original);
      expect(variantB.payload).not.toEqual(original);
      expect(variantA.payload).not.toEqual(variantB.payload);

      if (type !== 'venn' && type !== 'roc') {
        const declaredPaths = COMPONENT_DATA_PATHS[type];
        expect(declaredPaths).toContainEqual(variantA.mutation.path);
        expect(variantA.mutation.path).toEqual(variantB.mutation.path);
      }
      if (type === 'venn') {
        expect(variantA.payload.data.listA).toContain('BRCA2');
        expect(variantB.payload.data.listA).toContain('TP53');
      }
    }
  );

  test('does not mutate ROC class labels while varying scores', () => {
    const base = {
      type: 'roc',
      data: [['Class', 'Score'], ['positive', 0.4], ['negative', 0.6]]
    };
    const result = buildRenderCacheVariantPayload(base, 'roc', 'B');
    expect(result.payload.data[1][0]).toBe('positive');
    expect(result.payload.data[2][0]).toBe('negative');
    expect(readAtPath(result.payload, result.mutation.path)).toBe(0.775);
  });

  test('rejects unknown components and unsupported variants', () => {
    expect(() => buildRenderCacheVariantPayload({}, 'unknown', 'A')).toThrow(/No render-cache mutation adapter/);
    expect(() => buildRenderCacheVariantPayload(makeMatrixPayload('box'), 'box', 'C')).toThrow(/Unsupported render-cache variant/);
  });
});
