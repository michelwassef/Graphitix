'use strict';

const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog.js');
const {
  COMPONENT_MUTATION_CATALOG,
  REQUIRED_MUTATION_KINDS
} = require('../../test-support/componentMutationCatalog.js');

describe('component mutation catalog', () => {
  test('has one explicit persistence plan for every component', () => {
    expect(Object.keys(COMPONENT_MUTATION_CATALOG).sort()).toEqual(
      COMPONENT_CATALOG.map(component => component.type).sort()
    );

    for (const component of COMPONENT_CATALOG) {
      const plan = component.mutationPlan;
      expect(plan.baseline.source).toBe('welcome-load-example');
      expect(plan.baseline.requiredPayloadPaths.length).toBeGreaterThanOrEqual(3);
      expect(plan.interactionRestore.selector).toBeTruthy();
      expect(plan.interactionRestore.targetSelector).toBeTruthy();
      expect(plan.interactionRestore.action).toBeTruthy();
      expect(new Set(plan.mutations.map(mutation => mutation.kind))).toEqual(
        new Set(REQUIRED_MUTATION_KINDS)
      );
      for (const mutation of plan.mutations) {
        expect(mutation.id).toMatch(new RegExp(`^${component.type}\\.`));
        expect(mutation.path).not.toMatch(/\*/);
        expect(mutation.fingerprint).toContain(mutation.path);
      }
    }
  });
});
