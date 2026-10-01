'use strict';

const path = require('path');
const fs = require('fs');
const {
  EXPECTED_COMPONENT_TYPES,
  collectStaticInventory,
  findDuplicateJestProjectPaths,
  validateSuppressedFailurePolicy
} = require('../../scripts/test-inventory.cjs');
const { buildFileManifest, validateManifest } = require('../../test-support/testManifest.js');
const { getScenarioIdsForFile } = require('../../test-support/scenarioCatalog.js');
const { summarizeTestOrganization, validateTestOrganization } = require('../../test-support/testOrganization.js');

describe('test inventory static contract', () => {
  test('has no undiscovered Jest-style specs and uses the canonical catalog', () => {
    const inventory = collectStaticInventory(path.resolve(__dirname, '../..'));

    expect(inventory.files.orphanJestSpecs).toBe(0);
    expect(inventory.catalog.types).toEqual(EXPECTED_COMPONENT_TYPES);
    expect(inventory.catalog.frozen).toBe(true);
    expect(inventory.patterns.componentMatrixArrays.count).toBe(0);
    expect(inventory.catalog.workerSourceTypes).toEqual(inventory.catalog.workerCatalogTypes);
    expect(inventory.catalog.impactMapComponentTypes).toEqual(EXPECTED_COMPONENT_TYPES);
    expect(inventory.organization.legacyRootSuites).toEqual([]);
    expect(inventory.organization.oversizedLegacyRoot).toEqual([]);
    expect(inventory.organization.oversized.length).toBeGreaterThan(0);
    expect(inventory.patterns.directComponentBootstraps.every(record => record.review)).toBe(true);
  });

  test('rejects ungrouped suites even when they are below the oversized limit', () => {
    const organization = summarizeTestOrganization([
      { file: '__tests__/root.test.js', lines: 40 },
      { file: 'e2e/root.spec.js', lines: 55 }
    ]);

    expect(organization.legacyRootSuites.map(suite => suite.file)).toEqual([
      '__tests__/root.test.js', 'e2e/root.spec.js'
    ]);
    expect(validateTestOrganization(organization)).toEqual([
      'test suites must be grouped beneath a layer or capability directory: __tests__/root.test.js, e2e/root.spec.js'
    ]);
  });

  test('rejects Jest files discovered in more than one project', () => {
    expect(findDuplicateJestProjectPaths({
      unit: ['shared.test.js', 'unit.test.js'],
      architecture: ['shared.test.js'],
      dom: ['dom.test.js']
    })).toEqual([
      { file: 'shared.test.js', projects: ['unit', 'architecture'] }
    ]);
  });

  test('permits empty catches only in the bounded diagnostic probe', () => {
    expect(validateSuppressedFailurePolicy([
      { file: 'e2e/diagnostics/box-scatter.render-cache-lifecycle.diagnostic.spec.js', count: 2 }
    ])).toEqual([]);
    expect(validateSuppressedFailurePolicy([
      { file: 'e2e/scatter/scatter.tab-grid-leak.repro.spec.js', count: 1 }
    ])).toEqual([
      'E2E spec suppresses failures outside reviewed diagnostics: e2e/scatter/scatter.tab-grid-leak.repro.spec.js'
    ]);
    expect(validateSuppressedFailurePolicy([
      { file: 'e2e/diagnostics/box-scatter.render-cache-lifecycle.diagnostic.spec.js', count: 3 }
    ])).toEqual([
      'E2E diagnostic exceeds its reviewed empty-catch allowance: e2e/diagnostics/box-scatter.render-cache-lifecycle.diagnostic.spec.js'
    ]);
  });

  test('reports the high-risk test patterns needed for migration tracking', () => {
    const inventory = collectStaticInventory(path.resolve(__dirname, '../..'));

    expect(inventory.patterns.e2eWaitForTimeout.count).toBe(0);
    expect(inventory.patterns.e2eSetTimeout.count).toBeGreaterThan(0);
    expect(inventory.patterns.e2ePageEvaluate.count).toBeGreaterThan(0);
    expect(inventory.patterns.e2eArtifactWrites.count).toBeGreaterThan(0);
    expect(inventory.patterns.e2eFixedArtifactPaths.count).toBe(0);
    expect(inventory.patterns.looseTestFixtures.count).toBe(0);
    expect(inventory.patterns.unversionedTestFixtures.count).toBe(0);
    expect(inventory.patterns.legacyFixtureDirectories.count).toBe(0);
    expect(inventory.patterns.jestProductionRequires.count).toBeGreaterThan(0);
    expect(inventory.patterns.jestSourceReads.count).toBeGreaterThan(0);
    expect(inventory.patterns.jestFileReads.count).toBe(
      inventory.patterns.jestSourceReads.count
      + inventory.patterns.jestFixtureReads.count
      + inventory.patterns.jestGeneratedArtifactReads.count
    );
    expect(inventory.patterns.jestFixtureReads.count).toBeGreaterThan(0);
    expect(inventory.patterns.jestGeneratedArtifactReads.count).toBeGreaterThan(0);
    expect(inventory.patterns.lifecycleSourceTextReads).toEqual({ count: 0, files: [] });
    expect(inventory.patterns.e2eContractWaitForTimeout.count).toBe(0);
    expect(inventory.patterns.e2eContractSetTimeout.count).toBe(0);
    expect(inventory.patterns.e2eContractSuppressedFailures.count).toBe(0);
  });

  test('requires every conditional skip to state its reason and keeps E2E skips Chromium-scoped', () => {
    const inventory = collectStaticInventory(path.resolve(__dirname, '../..'));
    expect(inventory.patterns.fixmes.count).toBe(0);
    for (const fileRecord of inventory.patterns.skipDeclarations.files) {
      for (const match of fileRecord.matches) {
        expect(match.text).toMatch(/,\s*['"`][^'"`\r\n]+['"`]/);
        expect(match.skipPolicy).toEqual({
          issueId: expect.any(String),
          owner: expect.any(String),
          expiresOn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          removalGate: expect.any(String)
        });
        if (fileRecord.file.startsWith('e2e/')) {
          expect(match.text).toMatch(/browserName/);
          expect(match.text).toMatch(/chromium/i);
        }
      }
    }
  });

  test('requires explicit scenario ownership for every discovered file', () => {
    const inventory = collectStaticInventory(path.resolve(__dirname, '../..'));
    const discovered = [...inventory._files.jestTests, ...inventory._files.e2eSpecs].sort();
    const unmapped = discovered.filter(file => getScenarioIdsForFile(file).length === 0);
    expect(unmapped).toEqual([]);
  });

  test('correctness suites require the catalogued example action instead of optional clicks', () => {
    const rootDir = path.resolve(__dirname, '../..');
    const inventory = collectStaticInventory(rootDir);
    const legacyOptionalCallers = inventory._files.e2eSpecs.filter(file =>
      fs.readFileSync(path.join(rootDir, file), 'utf8').includes('clickExampleButtonIfPresent'));
    const driver = fs.readFileSync(path.join(rootDir, 'e2e/helpers/uiDriver.js'), 'utf8');
    const workspaceDriver = fs.readFileSync(path.join(rootDir, 'e2e/helpers/workspaceDriver.js'), 'utf8');

    expect(legacyOptionalCallers).toEqual([]);
    expect(driver).not.toContain('options.optional');
    expect(workspaceDriver).toContain('async function clickExpectedExampleButton');
    expect(workspaceDriver).not.toContain('optional: true');
  });

  test('every discovered browser suite has source-backed or reviewed setup classification', () => {
    const rootDir = path.resolve(__dirname, '../..');
    const staticInventory = collectStaticInventory(rootDir);
    const entries = buildFileManifest({ rootDir, e2ePaths: staticInventory._files.e2eSpecs });
    const reviewedInSuite = entries
      .filter(entry => entry.setupClassification === 'declared-in-suite')
      .map(entry => [entry.file, entry.setupEvidence]);

    expect(validateManifest(entries, { requireReviewedSetupClassification: true })).toEqual([]);
    expect(reviewedInSuite).toEqual([[
      'e2e/diagnostics/vendor.runtime.smoke.spec.js',
      expect.arrayContaining([expect.stringMatching(/^reviewed-in-suite:/)])
    ]]);
    expect(entries.some(entry => entry.setupClassification === 'ui')).toBe(true);
    expect(entries.some(entry => entry.setupClassification === 'api')).toBe(true);
    expect(entries.some(entry => entry.setupClassification === 'mixed')).toBe(true);
  });
});
