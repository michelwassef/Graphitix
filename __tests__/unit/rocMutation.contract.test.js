const { COMPONENT_MUTATION_CATALOG } = require('../../test-support/componentMutationCatalog.js');

describe('ROC mutation contract', () => {
  test('explicit persistence probes cannot mutate the categorical source column', () => {
    const mutations = COMPONENT_MUTATION_CATALOG.roc?.mutations || [];

    expect(mutations.length).toBeGreaterThan(0);
    expect(mutations.every(mutation => (
      String(mutation.path || '').startsWith('config.')
      || String(mutation.path || '').startsWith('meta.graphSizing.')
    ))).toBe(true);
    expect(mutations.some(mutation => mutation.path === 'config.graphType')).toBe(true);
    expect(mutations.some(mutation => mutation.path === 'config.colorScheme')).toBe(true);
  });
});
