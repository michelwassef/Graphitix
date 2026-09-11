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
const { getScenarioIdsForFile } = require('../../test-support/scenarioCatalog.js');

describe('generated test manifest', () => {
  test('classifies each configured test layer with one default lane', () => {
    const entries = buildFileManifest({
      jestPaths: [
        '__tests__/unit/example.test.js',
        '__tests__/dom/example.test.js',
        '__tests__/workers/example.test.js',
        '__tests__/session.example.test.js'
      ],
      e2ePaths: ['e2e/workspace.smoke.spec.js']
    });

    expect(entries.map(entry => entry.layer)).toEqual([
      'dom-unit', 'app-integration', 'unit-node', 'worker', 'browser-e2e'
    ]);
    expect(entries.every(entry => entry.defaultLane && entry.requiredLanes.length > 0)).toBe(true);
    expect(validateManifest(entries)).toEqual([]);
  });

  test('keeps browser parity and contract inventory visible', () => {
    const entries = [classifyTestFile('e2e/workspace.smoke.spec.js', 'playwright')];
    const summary = summarizeManifest(entries);

    expect(summary.byLayer['browser-e2e']).toBe(1);
    expect(entries[0].requiredLanes).toEqual(['full-chromium']);
    expect(entries[0].oracle).toBe('not-applicable');
    expect(summary.contracts).toEqual(CANONICAL_CONTRACTS);
  });

  test('marks Python differential suites as requiring the numerical oracle', () => {
    const entry = classifyTestFile('__tests__/stats.component.differential.test.js');
    expect(entry.layer).toBe('statistical-oracle');
    expect(entry.defaultLane).toBe('stats');
    expect(entry.oracle).toBe('required');
    expect(validateManifest([entry])).toEqual([]);
  });

  test('only explicit migrated files receive scenario IDs', () => {
    const migrated = classifyTestFile('e2e/workspace.smoke.spec.js', 'playwright');
    const legacy = classifyTestFile('e2e/unknown-legacy.spec.js', 'playwright');

    expect(migrated.status).toBe('migrated');
    expect(migrated.scenarioIds).toEqual(['BOOTSTRAP.browser-smoke']);
    expect(legacy.status).toBe('legacy-unmapped');
    expect(legacy.scenarioIds).toEqual([]);
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
});
