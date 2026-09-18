'use strict';

const path = require('path');
const {
  EXPECTED_COMPONENT_TYPES,
  collectStaticInventory,
  findDuplicateJestProjectPaths
} = require('../../scripts/test-inventory.cjs');
const { getScenarioIdsForFile } = require('../../test-support/scenarioCatalog.js');

describe('test inventory static contract', () => {
  test('has no undiscovered Jest-style specs and uses the canonical catalog', () => {
    const inventory = collectStaticInventory(path.resolve(__dirname, '../..'));

    expect(inventory.files.orphanJestSpecs).toBe(0);
    expect(inventory.catalog.types).toEqual(EXPECTED_COMPONENT_TYPES);
    expect(inventory.catalog.frozen).toBe(true);
    expect(inventory.patterns.componentMatrixArrays.count).toBe(0);
    expect(inventory.catalog.workerSourceTypes).toEqual(inventory.catalog.workerCatalogTypes);
    expect(inventory.catalog.impactMapComponentTypes).toEqual(EXPECTED_COMPONENT_TYPES);
    expect(inventory.organization.oversizedLegacyRoot).toEqual([]);
    expect(inventory.organization.oversized.length).toBeGreaterThan(0);
    expect(inventory.patterns.directComponentBootstraps.every(record => record.review)).toBe(true);
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

  test('reports the high-risk test patterns needed for migration tracking', () => {
    const inventory = collectStaticInventory(path.resolve(__dirname, '../..'));

    expect(inventory.patterns.e2eWaitForTimeout.count).toBe(0);
    expect(inventory.patterns.e2eSetTimeout.count).toBeGreaterThan(0);
    expect(inventory.patterns.e2ePageEvaluate.count).toBeGreaterThan(0);
    expect(inventory.patterns.e2eArtifactWrites.count).toBeGreaterThan(0);
    expect(inventory.patterns.jestProductionRequires.count).toBeGreaterThan(0);
    expect(inventory.patterns.jestSourceReads.count).toBeGreaterThan(0);
    expect(inventory.patterns.jestFileReads.count).toBe(
      inventory.patterns.jestSourceReads.count
      + inventory.patterns.jestFixtureReads.count
      + inventory.patterns.jestGeneratedArtifactReads.count
    );
    expect(inventory.patterns.jestFixtureReads.count).toBeGreaterThan(0);
    expect(inventory.patterns.jestGeneratedArtifactReads.count).toBeGreaterThan(0);
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
});
