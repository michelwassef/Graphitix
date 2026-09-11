'use strict';

const {
  COMPONENT_CATALOG,
  getComponentByType
} = require('../../test-support/componentCatalog.js');

describe('test component catalog', () => {
  test('declares the eleven registered workspace types exactly once', () => {
    const types = COMPONENT_CATALOG.map(component => component.type);
    expect(types).toEqual([
      'venn', 'box', 'scatter', 'pca', 'line', 'heatmap',
      'surface', 'roc', 'survival', 'hist', 'pie'
    ]);
    expect(new Set(types).size).toBe(types.length);
  });

  test('contains launch, geometry, mode, and capability metadata for every type', () => {
    for (const component of COMPONENT_CATALOG) {
      expect(component.pageId).toBe(`${component.type}Page`);
      expect(component.exampleButtonId).toMatch(new RegExp(`^${component.type}|^sample$`));
      expect(component.geometry).toEqual(expect.any(String));
      expect(component.graphModes.length).toBeGreaterThan(0);
      expect(component.capabilities).toEqual(expect.objectContaining({
        renderCache: expect.any(Boolean),
        statistics: expect.any(Boolean),
        notes: expect.any(Boolean),
        dataViews: expect.any(Boolean),
        canvas: expect.any(Boolean),
        threeD: expect.any(Boolean),
        worker: expect.any(Boolean),
        externalAsync: expect.any(Boolean)
      }));
      expect(getComponentByType(component.type)).toBe(component);
    }
  });

  test('is immutable so a test cannot mutate the shared matrix for later suites', () => {
    expect(Object.isFrozen(COMPONENT_CATALOG)).toBe(true);
    expect(Object.isFrozen(COMPONENT_CATALOG[0].capabilities)).toBe(true);
  });
});
