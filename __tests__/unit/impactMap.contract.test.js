'use strict';

const { buildImpactPlan } = require('../../test-support/impactMap.js');

describe('changed-path impact map', () => {
  const manifest = [
    { id: 'file:__tests__/componentLifecycle.core.test.js', file: '__tests__/componentLifecycle.core.test.js', layer: 'app-integration' },
    { id: 'file:__tests__/box.layoutReserves.regression.test.js', file: '__tests__/box.layoutReserves.regression.test.js', layer: 'app-integration' },
    { id: 'file:e2e/component.same-type-tab-switching.isolation.spec.js', file: 'e2e/component.same-type-tab-switching.isolation.spec.js', layer: 'browser-e2e' }
  ];

  test('expands shared lifecycle changes to all component contract groups', () => {
    const plan = buildImpactPlan(['js/shared/componentLifecycle.js'], manifest);

    expect(plan.hasMandatoryImpact).toBe(true);
    expect(plan.affectedComponents).toHaveLength(11);
    expect(plan.contracts).toEqual(expect.arrayContaining(['OWN', 'ASYNC', 'DIRTY']));
    expect(plan.mandatoryLanes).toEqual(expect.arrayContaining([
      'unit', 'dom', 'integration', 'e2e-contracts:chromium'
    ]));
    expect(plan.matchedRules[0].manifestEntryIds).toContain('file:__tests__/componentLifecycle.core.test.js');
  });

  test('keeps component changes scoped while adding shared contract lanes', () => {
    const plan = buildImpactPlan(['js/components/box.js'], manifest);

    expect(plan.affectedComponents).toEqual(['box']);
    expect(plan.matchedRules.map(rule => rule.id)).toEqual(['component:box:shared-contracts', 'component:box']);
    expect(plan.mandatoryLanes).toEqual(expect.arrayContaining(['unit', 'dom', 'integration', 'workers']));
    expect(plan.matchedRules.find(rule => rule.id === 'component:box').manifestEntryIds)
      .toContain('file:__tests__/box.layoutReserves.regression.test.js');
  });

  test('does not invent mandatory coverage for unrelated documentation', () => {
    const plan = buildImpactPlan(['docs/development/testing-suite-inventory.csv'], manifest);

    expect(plan.hasMandatoryImpact).toBe(false);
    expect(plan.mandatoryLanes).toEqual([]);
    expect(plan.affectedComponents).toEqual([]);
  });

  test('routes package and lockfile changes through vendor provenance checks', () => {
    const plan = buildImpactPlan(['package-lock.json'], manifest);

    expect(plan.matchedRules.map(rule => rule.id)).toEqual(['vendor-provenance']);
    expect(plan.mandatoryLanes).toEqual(expect.arrayContaining([
      'static', 'vendor', 'e2e-contracts:chromium'
    ]));
  });

  test('covers the main tab control-plane entry point', () => {
    const plan = buildImpactPlan(['js/main/tabs.js'], manifest);

    expect(plan.matchedRules.map(rule => rule.id)).toEqual(['ownership']);
    expect(plan.affectedComponents).toHaveLength(11);
  });
});
