'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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
      && entry.setupClassification
      && Array.isArray(entry.setupEvidence)
      && entry.setupEvidence.length > 0
      && entry.ownerExpectations
      && entry.readiness
      && entry.mutation
      && entry.suiteGroup
      && Array.isArray(entry.requiredArtifacts)
      && Array.isArray(entry.predecessorScenarioIds)
    ))).toBe(true);
    expect(validateManifest(entries)).toEqual([
      'manifest entry has no reviewed scenario mapping: file:__tests__/dom/example.test.js',
      'manifest entry has no reviewed scenario mapping: file:__tests__/session.example.test.js',
      'manifest entry has no reviewed scenario mapping: file:__tests__/unit/example.test.js',
      'manifest entry has no reviewed scenario mapping: file:__tests__/workers/example.test.js'
    ]);
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
      'OWN.heatmap-inactive-payload-owner',
      'OWN.heatmap-live-color-scheme-snapshot',
      'OWN.heatmap-stale-pvalue-owner',
      'OWN.heatmap-tab-context',
      'OWN.heatmap-worker-session-isolation',
      'PERSIST.heatmap-notes-direct'
    ]);
    expect(summary.componentMatrix.heatmap.explicitRequirementIds).toEqual([
      'CACHE.heatmap-render-cache-restore',
      'MODE.component-persistence-matrix-direct',
      'OWN.heatmap-inactive-payload-owner',
      'OWN.heatmap-live-color-scheme-snapshot',
      'OWN.heatmap-stale-pvalue-owner',
      'OWN.heatmap-tab-context',
      'OWN.heatmap-worker-session-isolation',
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
    }), expect.objectContaining({
      id: 'A11Y.modal-lifecycle',
      capability: 'modal-accessibility',
      evidence: 'shared-modal-lifecycle-browser-contract',
      transition: 'a11y-transition',
      metadataSource: 'explicit'
    })]);
    expect(entry.requirementEvidence).toEqual({
      explicit: 2,
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
    const files = [
      '__tests__/statistical-oracle/stats.component.differential.matrix.test.js',
      '__tests__/statistical-oracle/stats.component.differential.edges.test.js'
    ];
    files.forEach(file => {
      const entry = classifyTestFile(file);
      expect(entry.layer).toBe('statistical-oracle');
      expect(entry.defaultLane).toBe('stats');
      expect(entry.oracle).toBe('required');
      expect(validateManifest([entry])).toEqual([]);
    });
  });

  test('keeps rendered statistics and restore suites out of the numerical-oracle lane', () => {
    const cases = [
      ['__tests__/integration/stats.ui.presentation.branches.test.js', ['STATS.ui-presentation-branches']],
      ['__tests__/integration/stats.ui.persistence.restore.test.js', [
        'STATS.ui-persistence-restore',
        'STATS.box-grouped-owner-reopen',
        'STATS.box-legacy-signature-boundaries',
        'STATS.box-paired-rank-effect',
        'STATS.box-friedman-mode'
      ]]
    ];

    for (const [file, scenarioIds] of cases) {
      const entry = classifyTestFile(file);
      expect(entry.layer).toBe('app-integration');
      expect(entry.defaultLane).toBe('integration');
      expect(entry.oracle).toBe('not-applicable');
      expect(entry.setupClassification).toBe('mixed');
      expect(entry.scenarioIds).toEqual(scenarioIds);
      expect(validateManifest([entry])).toEqual([]);
    }
  });

  test('only explicit migrated files receive scenario IDs', () => {
    const migrated = classifyTestFile('e2e/workspace/workspace.smoke.spec.js', 'playwright');
    const legacy = classifyTestFile('e2e/unknown-legacy.spec.js', 'playwright');

    expect(migrated.status).toBe('migrated');
    expect(migrated.scenarioIds).toEqual([
      'BOOTSTRAP.browser-smoke',
      'DOM.welcome-graph-actions',
      'A11Y.modal-lifecycle'
    ]);
    expect(legacy.status).toBe('legacy-unmapped');
    expect(legacy.scenarioIds).toEqual([]);
    expect(legacy.skipPolicy).toBeNull();
    expect(validateManifest([legacy])).toContain(
      'manifest entry has no reviewed scenario mapping: file:e2e/unknown-legacy.spec.js'
    );
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
    entry.status = 'migrated';
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

  test('records UI and API setup boundaries separately', () => {
    const ui = classifyTestFile('e2e/ownership/component.ui-parameter-persistence.spec.js', 'playwright');
    const api = classifyTestFile('e2e/ownership/component.persistence-matrix.spec.js', 'playwright');

    expect(ui.setupClassification).toBe('ui');
    expect(api.setupClassification).toBe('api');
    expect(validateManifest([ui, api])).toEqual([]);
  });

  test('grounds untagged browser setup classifications in suite behavior', () => {
    const entries = buildFileManifest({
      e2ePaths: [
        'e2e/layout/axis.tick-label-optical-clearance.spec.js',
        'e2e/workspace/welcome.first-frame.spec.js',
        'e2e/diagnostics/vendor.runtime.smoke.spec.js'
      ]
    });
    const byFile = new Map(entries.map(entry => [entry.file, entry]));

    expect(byFile.get('e2e/layout/axis.tick-label-optical-clearance.spec.js').setupClassification).toBe('api');
    expect(byFile.get('e2e/workspace/welcome.first-frame.spec.js').setupClassification).toBe('ui');
    expect(byFile.get('e2e/diagnostics/vendor.runtime.smoke.spec.js').setupClassification).toBe('declared-in-suite');
    expect(byFile.get('e2e/diagnostics/vendor.runtime.smoke.spec.js').setupEvidence[0]).toMatch(/^reviewed-in-suite:/);
    expect(validateManifest(entries, { requireReviewedSetupClassification: true })).toEqual([]);
  });

  test('tab-isolation ledger check rejects stale counts and source rows', () => {
    const root = path.resolve(__dirname, '../..');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-ledger-check-'));
    const tempLedgerPath = path.join(tempDir, 'ledger.json');
    try {
      const builderPath = path.join(root, 'scripts/build-tab-isolation-review-ledger.cjs');
      const buildResult = spawnSync(process.execPath, [
        builderPath,
        '--ledger',
        tempLedgerPath
      ], { cwd: root, encoding: 'utf8' });
      expect(buildResult.error).toBeUndefined();
      expect(buildResult.status).toBe(0);

      const corruptedLedger = JSON.parse(fs.readFileSync(tempLedgerPath, 'utf8'));
      corruptedLedger.dispositionCounts['pending source trace'] += 1;
      corruptedLedger.candidates[0].source.sourceHash = 'stale-source-signature';
      fs.writeFileSync(tempLedgerPath, JSON.stringify(corruptedLedger));

      const result = spawnSync(process.execPath, [
        builderPath,
        '--check',
        '--ledger',
        tempLedgerPath
      ], { cwd: root, encoding: 'utf8' });

      expect(result.error).toBeUndefined();
      expect(result.status).not.toBe(0);
      expect(result.stdout).toContain('changed source rows: 1');
      expect(result.stdout).toContain('disposition counts stale: true');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
