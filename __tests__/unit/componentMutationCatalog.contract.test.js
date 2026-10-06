'use strict';

const { COMPONENT_CATALOG } = require('../../test-support/componentCatalog.js');
const {
  COMPONENT_MUTATION_CATALOG,
  REQUIRED_MUTATION_KINDS
} = require('../../test-support/componentMutationCatalog.js');
const {
  applyLogicalParameterMutation,
  buildParameterVariantPayload
} = require('../../e2e/helpers/mutationAdapters.js');
const parameterAssertions = require('../../e2e/helpers/parameterAssertions.js');

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
      expect(plan.uiMutations).toHaveLength(3);
      expect(plan.uiMutations.map(mutation => mutation.kind)).toEqual(['parameter', 'style', 'layout']);
      expect(plan.uiMutations[2].authority).toBe('layout');
      expect(plan.uiMutations[2].path).toBe('display.widthPx');
      expect(new Set(plan.mutations.map(mutation => mutation.kind))).toEqual(
        new Set(REQUIRED_MUTATION_KINDS)
      );
      for (const mutation of plan.mutations) {
        expect(mutation.id).toMatch(new RegExp(`^${component.type}\\.`));
        expect(mutation.path).not.toMatch(/\*/);
        expect(mutation.fingerprint).toContain(mutation.path);
      }
      for (const mutation of plan.uiMutations) {
        expect(mutation.id).toMatch(new RegExp(`^${component.type}\\.`));
        expect(mutation.selector).toBeTruthy();
        expect(mutation.path).not.toMatch(/\*/);
        if (mutation.action === 'drag-horizontal') {
          expect(mutation.delta).toEqual(expect.any(Number));
          expect(mutation.minDelta).toEqual(expect.any(Number));
        }
      }
    }
  });

  test('builds immutable variants and preserves component-specific mutation contracts', () => {
    const baseline = {
      type: 'scatter',
      config: {
        showErrorBars: false,
        showGroupedReplicatePoints: true,
        rotation: { x: 0, y: 0, z: 0, quaternion: [1, 0, 0, 0] }
      },
      data: [[1, 2]]
    };
    const variant = buildParameterVariantPayload(baseline, [
      { path: ['config', 'showErrorBars'], before: false, after: true },
      { path: ['config', 'rotation', 'x'], before: 0, after: 20 }
    ], 'after');

    expect(variant).toEqual({
      type: 'scatter',
      config: {
        showErrorBars: true,
        showGroupedReplicatePoints: false,
        rotation: { x: 20, y: 0, z: 0 }
      },
      data: [[1, 2]]
    });
    expect(baseline.config.showErrorBars).toBe(false);
    expect(baseline.config.rotation.quaternion).toEqual([1, 0, 0, 0]);
  });

  test.each([
    ['box', ['config', 'fill'], '#123456', { colorScheme: 'custom' }],
    ['line', ['config', 'tableFormat'], 'grouped', { replicates: 2 }],
    ['heatmap', ['config', 'filters', 'sdThreshold'], 1.5, { filters: { sdEnabled: true } }],
    ['surface', ['config', 'settings', 'backgroundColor'], '#f2f5fa', {
      backgroundColor: '#f2f5fa',
      settings: { backgroundColor: '#f2f5fa' }
    }],
    ['roc', ['config', 'positiveClass'], 'treated', { negativeClass: 'control' }]
  ])('applies the %s adapter side effects', (type, path, value, expectedConfig) => {
    const baseline = {
      type,
      config: type === 'heatmap'
        ? { filters: { sdEnabled: false, sdThreshold: 0 } }
        : type === 'roc'
          ? { positiveClass: 'control', negativeClass: 'treated' }
          : {}
    };
    const parameter = {
      path,
      before: type === 'roc' ? 'control' : path[path.length - 1] === 'tableFormat' ? 'single' : undefined
    };

    applyLogicalParameterMutation(baseline, parameter, value);

    if(type === 'heatmap'){
      expect(baseline.config.filters).toEqual(expect.objectContaining(expectedConfig.filters));
    } else {
      expect(baseline.config).toEqual(expect.objectContaining(expectedConfig));
    }
  });

  test('keeps parameter authority and projection assertions in one pure module', () => {
    const parameter = {
      key: 'config.value',
      path: ['config', 'value'],
      before: 1,
      after: 2,
      kind: 'parameter',
      semanticFingerprint: ['config.value']
    };
    const results = parameterAssertions.createParameterResults([parameter]);
    const state = {
      tabId: 'tab-1',
      payload: { config: { value: 2 } },
      dom: { 'input.value': 2 },
      owner: { 'session.config.value': 2 }
    };

    parameterAssertions.recordParameterAssertion(
      results,
      parameter,
      state,
      2,
      { domKey: 'input.value', ownerKey: 'session.config.value' },
      'mutated',
      () => 1
    );

    expect(parameterAssertions.collectResultFailures(results)).toEqual([]);
    expect(results.get(parameter.key).snapshots).toHaveLength(1);
    expect(results.get(parameter.key).before).toBe(1);
  });

  test('checks Heatmap scheme projection against the resolver and round-trips its effective palette', () => {
    const mutation = COMPONENT_MUTATION_CATALOG.heatmap.mutations.find(item => item.id === 'heatmap.color-scheme');
    expect(COMPONENT_MUTATION_CATALOG.heatmap.baseline.requiredPayloadPaths).toEqual(expect.arrayContaining([
      'config.colors.negative',
      'config.colors.zero',
      'config.colors.positive'
    ]));
    expect(mutation.projectionContract.domExpectedOwnerKey)
      .toBe('ownerProjection.config.displayedColorSchemeId');

    const parameter = {
      key: 'config.colorScheme',
      path: ['config', 'colorScheme'],
      before: 'scientific',
      after: 'soft',
      projectionContract: mutation.projectionContract
    };
    const colors = { negative: '#4e79a7', zero: '#f7f7f7', positive: '#e15759' };
    const paletteValues = Object.entries(colors).map(([key, value]) => ({
      payloadPath: `config.colors.${key}`,
      ownerKey: `ownerProjection.config.palette.${key}`,
      payloadValue: value,
      ownerValue: value
    }));
    const state = {
      tabId: 'heatmap-tab',
      payload: { config: { colorScheme: 'soft', colors: { ...colors } } },
      dom: { '#heatmapColorSchemeSelect.value': 'custom' },
      owner: {
        'ownerProjection.config.colorScheme': 'soft',
        'ownerProjection.config.displayedColorSchemeId': 'custom',
        ...Object.fromEntries(paletteValues.map(item => [item.ownerKey, item.ownerValue]))
      }
    };
    const witness = {
      domKey: '#heatmapColorSchemeSelect.value',
      ownerKey: 'ownerProjection.config.colorScheme',
      domProjectionOwnerKey: 'ownerProjection.config.displayedColorSchemeId',
      paletteValues: { after: paletteValues }
    };

    expect(parameterAssertions.assertParameterState(state, parameter, 'soft', witness, 'reopen').failures).toEqual([]);

    const drifted = structuredClone(state);
    drifted.dom['#heatmapColorSchemeSelect.value'] = 'soft';
    drifted.payload.config.colors.negative = '#123456';
    drifted.owner['ownerProjection.config.palette.negative'] = '#123456';
    expect(parameterAssertions.assertParameterState(drifted, parameter, 'soft', witness, 'reopen').failures)
      .toEqual(expect.arrayContaining([
        'reopen: DOM scheme projection disagrees with the displayed-scheme resolver',
        'reopen: effective Heatmap palette did not survive persistence at config.colors.negative'
      ]));
  });
});
