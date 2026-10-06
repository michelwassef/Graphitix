'use strict';

const { buildImpactPlan } = require('../../test-support/impactMap.js');

describe('changed-path impact map', () => {
  const manifest = [
    { id: 'file:__tests__/componentLifecycle.core.test.js', file: '__tests__/componentLifecycle.core.test.js', layer: 'app-integration' },
    { id: 'file:__tests__/integration/box.layoutReserves.regression.test.js', file: '__tests__/integration/box.layoutReserves.regression.test.js', layer: 'app-integration' },
    { id: 'file:e2e/ownership/component.same-type-tab-switching.isolation.spec.js', file: 'e2e/ownership/component.same-type-tab-switching.isolation.spec.js', layer: 'browser-e2e' },
    { id: 'file:__tests__/statistical-oracle/stats.matrix.scatter.test.js', file: '__tests__/statistical-oracle/stats.matrix.scatter.test.js', layer: 'statistical-oracle' },
    { id: 'file:__tests__/statistical-oracle/stats.matrix.box.test.js', file: '__tests__/statistical-oracle/stats.matrix.box.test.js', layer: 'statistical-oracle' },
    { id: 'file:__tests__/workers/scatter.worker.test.js', file: '__tests__/workers/scatter.worker.test.js', layer: 'worker' },
    { id: 'file:__tests__/workers/box.worker.test.js', file: '__tests__/workers/box.worker.test.js', layer: 'worker' },
    { id: 'file:__tests__/integration/regression.persistence.test.js', file: '__tests__/integration/regression.persistence.test.js', layer: 'app-integration' },
    { id: 'file:__tests__/unit/box.statsTestSelection.model.test.js', file: '__tests__/unit/box.statsTestSelection.model.test.js', layer: 'unit-node' },
    { id: 'file:__tests__/unit/scatterLowessModel.test.js', file: '__tests__/unit/scatterLowessModel.test.js', layer: 'unit-node' },
    { id: 'file:__tests__/unit/componentMutationCatalog.contract.test.js', file: '__tests__/unit/componentMutationCatalog.contract.test.js', layer: 'unit-node' },
    { id: 'file:__tests__/unit/ownerPayloadDriver.contract.test.js', file: '__tests__/unit/ownerPayloadDriver.contract.test.js', layer: 'unit-node' },
    { id: 'file:e2e/workspace/component-lazy-load.contract.spec.js', file: 'e2e/workspace/component-lazy-load.contract.spec.js', layer: 'browser-e2e' },
    { id: 'file:e2e/ownership/component.persistence-matrix.spec.js', file: 'e2e/ownership/component.persistence-matrix.spec.js', layer: 'browser-e2e' },
    { id: 'file:__tests__/dom/colorSchemes.core.test.js', file: '__tests__/dom/colorSchemes.core.test.js', layer: 'dom-unit' },
    { id: 'file:__tests__/unit/impactMap.contract.test.js', file: '__tests__/unit/impactMap.contract.test.js', layer: 'unit-node' },
    { id: 'file:__tests__/architecture/generateComponentContracts.check.test.js', file: '__tests__/architecture/generateComponentContracts.check.test.js', layer: 'architecture' }
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
      .toContain('file:__tests__/integration/box.layoutReserves.regression.test.js');
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

  test('routes numerical component and regression changes to oracle evidence', () => {
    const regressionPlan = buildImpactPlan(['js/shared/regression.js'], manifest);
    expect(regressionPlan.mandatoryLanes).toEqual(expect.arrayContaining(['stats', 'workers']));
    expect(regressionPlan.matchedRules.find(rule => rule.id === 'model:regression').manifestEntryIds).toEqual(expect.arrayContaining([
      'file:__tests__/statistical-oracle/stats.matrix.scatter.test.js',
      'file:__tests__/workers/scatter.worker.test.js',
      'file:__tests__/integration/regression.persistence.test.js'
    ]));
    expect(regressionPlan.affectedComponents).toEqual(['scatter', 'line']);

    const scatterPlan = buildImpactPlan(['js/components/scatter.js'], manifest);
    expect(scatterPlan.mandatoryLanes).toEqual(expect.arrayContaining(['stats', 'workers']));
    expect(scatterPlan.matchedRules.find(rule => rule.id === 'component:scatter').manifestEntryIds)
      .toContain('file:__tests__/statistical-oracle/stats.matrix.scatter.test.js');
    expect(scatterPlan.matchedRules.find(rule => rule.id === 'component:scatter').manifestEntryIds)
      .toContain('file:__tests__/workers/scatter.worker.test.js');
  });

  test('routes the Scatter density model through its component and worker obligations', () => {
    const plan = buildImpactPlan(['js/shared/scatterDensityModel.js'], manifest);
    const modelRule = plan.matchedRules.find(rule => rule.id === 'model:scatter-density');

    expect(plan.affectedComponents).toEqual(['scatter']);
    expect(plan.mandatoryLanes).toEqual(expect.arrayContaining(['unit', 'workers', 'integration', 'stats']));
    expect(modelRule.manifestEntryIds).toContain('file:__tests__/workers/scatter.worker.test.js');
    expect(modelRule.manifestEntryIds).toContain('file:__tests__/statistical-oracle/stats.matrix.scatter.test.js');
  });

  test('routes Scatter LOWESS model changes to direct, oracle, and browser-load checks without worker obligations', () => {
    const plan = buildImpactPlan(['js/shared/scatterLowessModel.js'], manifest);
    const modelRule = plan.matchedRules.find(rule => rule.id === 'model:scatter-lowess');

    expect(plan.affectedComponents).toEqual(['scatter']);
    expect(plan.mandatoryLanes).toEqual(expect.arrayContaining(['unit', 'stats', 'e2e-contracts:chromium']));
    expect(plan.mandatoryLanes).not.toContain('workers');
    expect(modelRule.manifestEntryIds).toEqual(expect.arrayContaining([
      'file:__tests__/unit/scatterLowessModel.test.js',
      'file:__tests__/statistical-oracle/stats.matrix.scatter.test.js',
      'file:e2e/workspace/component-lazy-load.contract.spec.js'
    ]));
  });

  test('routes the Box statistics model through its component, worker, and oracle tests', () => {
    const plan = buildImpactPlan(['js/shared/boxStatsModel.js'], manifest);
    const modelRule = plan.matchedRules.find(rule => rule.id === 'model:box-stats');

    expect(plan.affectedComponents).toEqual(['box']);
    expect(plan.mandatoryLanes).toEqual(expect.arrayContaining(['workers', 'stats']));
    expect(modelRule.manifestEntryIds).toContain('file:__tests__/workers/box.worker.test.js');
    expect(modelRule.manifestEntryIds).toContain('file:__tests__/statistical-oracle/stats.matrix.box.test.js');
  });

  test('routes shared mutation-witness changes through unit contracts and the all-component archive matrix', () => {
    const plan = buildImpactPlan([
      'test-support/componentMutationCatalog.js',
      'e2e/helpers/ownerPayloadDriver.js',
      'e2e/helpers/parameterAssertions.js',
      'js/shared/colorSchemes.js'
    ], manifest);
    const witnessRule = plan.matchedRules.find(rule => rule.id === 'component-persistence-witnesses');

    expect(witnessRule.files).toHaveLength(4);
    expect(plan.affectedComponents).toHaveLength(11);
    expect(plan.contracts).toEqual(expect.arrayContaining(['OWN', 'PERSIST', 'ARCHIVE']));
    expect(plan.mandatoryLanes).toEqual(expect.arrayContaining(['unit', 'dom', 'e2e-contracts:chromium']));
    expect(witnessRule.manifestEntryIds).toEqual(expect.arrayContaining([
      'file:__tests__/unit/componentMutationCatalog.contract.test.js',
      'file:__tests__/unit/ownerPayloadDriver.contract.test.js',
      'file:e2e/ownership/component.persistence-matrix.spec.js',
      'file:__tests__/dom/colorSchemes.core.test.js'
    ]));
  });

  test('self-checks changes to impact selection and the component contract generator', () => {
    const impactPlan = buildImpactPlan(['test-support/impactMap.js'], manifest);
    expect(impactPlan.mandatoryLanes).toEqual(expect.arrayContaining(['unit', 'static']));
    expect(impactPlan.matchedRules.find(rule => rule.id === 'test-impact-selection').manifestEntryIds)
      .toContain('file:__tests__/unit/impactMap.contract.test.js');

    const generatorPlan = buildImpactPlan(['scripts/generate-component-contracts.js'], manifest);
    expect(generatorPlan.mandatoryLanes).toEqual(expect.arrayContaining(['unit', 'static']));
    expect(generatorPlan.matchedRules.find(rule => rule.id === 'component-contract-generator').manifestEntryIds)
      .toContain('file:__tests__/architecture/generateComponentContracts.check.test.js');
  });

  test.each([
    ['js/shared/boxStatsModel.js', ['box'], ['stats', 'workers']],
    ['js/shared/boxPointSizing.js', ['box'], ['unit', 'integration']],
    ['js/shared/heatmapScaleModel.js', ['heatmap'], ['unit', 'integration']],
    ['js/shared/pcaTableModel.js', ['pca'], ['unit', 'integration']],
    ['js/shared/lineOverlayModel.js', ['line'], ['unit', 'integration']],
    ['js/shared/scatterLabelModel.js', ['scatter'], ['unit', 'integration']],
    ['js/shared/vennGeometryModel.js', ['venn'], ['unit', 'integration']],
    ['js/shared/hotFilterModel.js', ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], ['unit', 'integration']],
    ['js/shared/hotUiStateAdapter.js', ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'], ['unit', 'dom', 'integration', 'e2e-contracts:chromium']]
  ])('maps extracted model %s to its consumers and lanes', (file, components, lanes) => {
    const plan = buildImpactPlan([file], manifest);

    expect(plan.affectedComponents).toEqual(components);
    expect(plan.mandatoryLanes).toEqual(expect.arrayContaining(lanes));
  });

  test('has a command for the mandatory statistical-oracle lane', () => {
    const { buildMandatoryCommands } = require('../../scripts/suggest-tests.js');
    expect(buildMandatoryCommands({ mandatoryLanes: ['stats'] })).toEqual([
      { lane: 'stats', command: 'npm run test:stats' }
    ]);
  });
});
