'use strict';

const {
  CANONICAL_CONTRACTS,
  buildFileManifest,
  classifyTestFile,
  summarizeManifest,
  validateManifest
} = require('../../test-support/testManifest.js');
const {
  NODE_UNIT_TESTS,
  DOM_UNIT_TESTS,
  ARCHITECTURE_TESTS,
  STATISTICAL_ORACLE_TESTS,
  getExplicitLayer
} = require('../../test-support/jestLayerManifest.js');
const {
  CRITICAL_SCENARIO_IDS,
  SCENARIO_CATALOG,
  getScenarioIdsForFile,
  getScenariosForIds
} = require('../../test-support/scenarioCatalog.js');

describe('generated test manifest', () => {
  test('classifies each configured test layer with one default lane', () => {
    const entries = buildFileManifest({
      jestPaths: [
        '__tests__/unit/example.test.js',
        '__tests__/dom/example.test.js',
        '__tests__/workers/example.test.js',
        '__tests__/session.example.test.js'
      ],
      e2ePaths: ['e2e/workspace/workspace.smoke.spec.js']
    });

    expect(entries.map(entry => entry.layer)).toEqual([
      'dom-unit', 'app-integration', 'unit-node', 'worker', 'browser-e2e'
    ]);
    expect(entries.every(entry => entry.defaultLane && entry.requiredLanes.length > 0)).toBe(true);
    expect(entries.every(entry => (
      Array.isArray(entry.requirements)
      && Array.isArray(entry.capabilityScope)
      && Array.isArray(entry.transitionScope)
      && Array.isArray(entry.browser)
      && entry.expectedWorkerMode
      && entry.fixtureProvenance
      && Object.prototype.hasOwnProperty.call(entry, 'bootstrapReview')
      && entry.ownerExpectations
      && entry.readiness
      && entry.mutation
      && entry.suiteGroup
      && Array.isArray(entry.requiredArtifacts)
      && Array.isArray(entry.predecessorScenarioIds)
    ))).toBe(true);
    expect(validateManifest(entries)).toEqual([]);
  });

  test('keeps browser parity and contract inventory visible', () => {
    const entries = [classifyTestFile('e2e/workspace/workspace.smoke.spec.js', 'playwright')];
    const summary = summarizeManifest(entries);

    expect(summary.byLayer['browser-e2e']).toBe(1);
    expect(entries[0].requiredLanes).toEqual(['full-chromium']);
    expect(entries[0].oracle).toBe('not-applicable');
    expect(summary.contracts).toEqual(CANONICAL_CONTRACTS);
  });

  test('reports direct component evidence separately from wildcard coverage', () => {
    const summary = summarizeManifest([
      classifyTestFile('__tests__/integration/heatmap.tabContext.test.js'),
      classifyTestFile('e2e/ownership/component.persistence-matrix.spec.js', 'playwright')
    ]);

    expect(Object.keys(summary.componentMatrix)).toHaveLength(11);
    expect(summary.componentMatrix.heatmap.directScenarioIds).toEqual([
      'CACHE.heatmap-render-cache-restore',
      'MODE.component-persistence-matrix-direct',
      'OWN.heatmap-tab-context',
      'PERSIST.heatmap-notes-direct'
    ]);
    expect(summary.componentMatrix.heatmap.explicitRequirementIds).toEqual([
      'CACHE.heatmap-render-cache-restore',
      'MODE.component-persistence-matrix-direct',
      'OWN.heatmap-tab-context',
      'PERSIST.heatmap-notes-direct'
    ]);
    expect(summary.componentMatrix.box.directScenarioIds).toEqual([
      'MODE.component-persistence-matrix-direct'
    ]);
    expect(summary.componentMatrix.box.wildcardScenarioIds).toEqual([
      'PERSIST.explicit-component-mutations'
    ]);
    expect(summary.componentMatrix.box.unexplainedFeatureGaps).not.toContain('graphModes');
    expect(summary.componentMatrix.box.unexplainedFeatureGaps).toContain('statistics');
    expect(summary.componentMatrix.box.unexplainedFeatureGaps).not.toContain('canvas');
  });

  test('critical control-plane scenarios declare explicit evidence categories', () => {
    const scenarios = getScenariosForIds(CRITICAL_SCENARIO_IDS);
    expect(scenarios).toHaveLength(CRITICAL_SCENARIO_IDS.length);
    expect(scenarios.every(scenario => (
      scenario.requirement
      && scenario.capability
      && scenario.evidence
    ))).toBe(true);

    const entry = classifyTestFile('e2e/workspace/style-sync.contract.spec.js', 'playwright');
    expect(entry.requirements).toEqual([expect.objectContaining({
      id: 'PERSIST.style-sync-across-tabs',
      capability: 'persistence',
      evidence: 'source-and-target-payload-contract',
      transition: 'persist-transition',
      metadataSource: 'explicit'
    })]);
    expect(entry.requirementEvidence).toEqual({
      explicit: 1,
      inferred: 0,
      critical: ['PERSIST.style-sync-across-tabs']
    });
  });

  test('reviewed governance and lifecycle batches carry explicit evidence metadata', () => {
    const reviewedIds = [
      'GOVERNANCE.component-catalog',
      'GOVERNANCE.discovery-inventory',
      'GOVERNANCE.layer-manifest',
      'GOVERNANCE.integration-teardown',
      'OWN.readiness-observability',
      'OWN.component-dom-binding',
      'REC.archive-restore-transaction',
      'PERSIST.grid-clipboard',
      'PERSIST.dataview-lite-archive',
      'STATS.figure-summary-layout',
      'LAYOUT.legend-viewport-invariant',
      'CACHE.tab-switch-reuse',
      'OWN.ag-grid-edit-overflow',
      'LAYOUT.ag-grid-selection-scrollbar',
      'PERSIST.ag-grid-column-reorder-undo',
      'IMPORT.prism-multi-dataset',
      'OWN.box-formula-fill',
      'LAYOUT.box-horizontal-shrink',
      'BOOTSTRAP.production-derived-loader',
      'VENDOR.browser-runtime',
      'CACHE.surface-render-cache'
    ];
    const scenarios = getScenariosForIds(reviewedIds);

    expect(scenarios).toHaveLength(reviewedIds.length);
    expect(scenarios.every(scenario => (
      scenario.requirement
      && scenario.capability
      && scenario.evidence
    ))).toBe(true);
  });

  test('every catalog scenario declares explicit requirement evidence', () => {
    expect(SCENARIO_CATALOG.length).toBeGreaterThan(0);
    expect(SCENARIO_CATALOG.every(scenario => (
      scenario.requirement
      && scenario.capability
      && scenario.evidence
    ))).toBe(true);
  });

  test('marks Python differential suites as requiring the numerical oracle', () => {
    const entry = classifyTestFile('__tests__/statistical-oracle/stats.component.differential.test.js');
    expect(entry.layer).toBe('statistical-oracle');
    expect(entry.defaultLane).toBe('stats');
    expect(entry.oracle).toBe('required');
    expect(validateManifest([entry])).toEqual([]);
  });

  test('only explicit migrated files receive scenario IDs', () => {
    const migrated = classifyTestFile('e2e/workspace/workspace.smoke.spec.js', 'playwright');
    const legacy = classifyTestFile('e2e/unknown-legacy.spec.js', 'playwright');

    expect(migrated.status).toBe('migrated');
    expect(migrated.scenarioIds).toEqual(['BOOTSTRAP.browser-smoke']);
    expect(legacy.status).toBe('legacy-unmapped');
    expect(legacy.scenarioIds).toEqual([]);
    expect(legacy.skipPolicy).toEqual(expect.objectContaining({
      issueRef: expect.any(String),
      expiresOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)
    }));
  });

  test('rejects entries without readiness metadata', () => {
    const entry = classifyTestFile('e2e/workspace/workspace.smoke.spec.js', 'playwright');
    delete entry.readiness;
    expect(validateManifest([entry])).toContain(
      'manifest entry has incomplete readiness metadata: file:e2e/workspace/workspace.smoke.spec.js'
    );
  });

  test('rejects invented scenario IDs', () => {
    const entry = classifyTestFile('__tests__/unit/example.test.js');
    entry.scenarioIds = ['OWN.invented'];
    expect(validateManifest([entry])).toEqual([
      'manifest entry has unknown scenario IDs: OWN.invented'
    ]);
  });

  test('sorts discovery output so generated inventory is reproducible', () => {
    const entries = buildFileManifest({
      jestPaths: ['__tests__/z.test.js', '__tests__/a.test.js'],
      e2ePaths: ['e2e/z.spec.js', 'e2e/a.spec.js']
    });

    expect(entries.map(entry => entry.file)).toEqual([
      '__tests__/a.test.js', '__tests__/z.test.js', 'e2e/a.spec.js', 'e2e/z.spec.js'
    ]);
  });

  test('requires every explicit Jest layer migration to have a scenario owner', () => {
    const layers = [
      ['unit-node', NODE_UNIT_TESTS],
      ['dom-unit', DOM_UNIT_TESTS],
      ['architecture', ARCHITECTURE_TESTS],
      ['statistical-oracle', STATISTICAL_ORACLE_TESTS]
    ];
    const files = layers.flatMap(([, paths]) => paths);

    expect(new Set(files).size).toBe(files.length);
    for (const [layer, paths] of layers) {
      for (const file of paths) {
        expect(getExplicitLayer(file)).toBe(layer);
        expect(getScenarioIdsForFile(file).length).toBeGreaterThan(0);
      }
    }
  });

  test('publishes reviewed specialized bootstrap reasons in the manifest', () => {
    const entry = classifyTestFile('__tests__/integration/regression.persistence.test.js');
    expect(entry.bootstrapReview).toEqual({
      status: 'reviewed-specialized-bootstrap',
      reason: expect.stringContaining('production bootstrap')
    });
    expect(validateManifest([entry])).toEqual([]);
  });
});
