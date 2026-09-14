'use strict';

const fs = require('fs');
const path = require('path');
const { buildInventory } = require('./test-inventory.cjs');

const ROOT_DIR = path.resolve(__dirname, '..');
const HEADER = [
  'id', 'path', 'framework', 'layer', 'default_lane', 'required_lanes',
  'status', 'scenario_ids', 'requirements', 'requirement_evidence', 'component_scope', 'capability_scope',
  'contracts', 'browser', 'expected_worker_mode', 'fixture_provenance',
  'owner_expectations', 'readiness', 'mutation', 'required_artifacts',
  'skip_policy', 'predecessor_scenario_ids', 'oracle', 'setup', 'provenance'
];

function escapeCsv(value) {
  const text = Array.isArray(value)
    ? (value.some(item => item && typeof item === 'object') ? JSON.stringify(value) : value.join('|'))
    : (value && typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function renderInventoryCsv(inventory) {
  const rows = [HEADER.join(',')];
  for (const entry of inventory.manifest.entries) {
    rows.push([
      entry.id,
      entry.file,
      entry.framework,
      entry.layer,
      entry.defaultLane,
      entry.requiredLanes,
      entry.status,
      entry.scenarioIds,
      entry.requirements,
      entry.requirementEvidence,
      entry.componentScope,
      entry.capabilityScope,
      entry.contracts,
      entry.browser,
      entry.expectedWorkerMode,
      entry.fixtureProvenance,
      entry.ownerExpectations,
      entry.readiness,
      entry.mutation,
      entry.requiredArtifacts,
      entry.skipPolicy,
      entry.predecessorScenarioIds,
      entry.oracle,
      entry.setup,
      entry.provenance
    ].map(escapeCsv).join(','));
  }
  return `${rows.join('\n')}\n`;
}

function generate({ check = false, rootDir = ROOT_DIR } = {}) {
  const inventory = buildInventory(rootDir);
  if (inventory.checks.length > 0) {
    throw new Error(`Cannot generate an invalid test inventory:\n${inventory.checks.join('\n')}`);
  }
  const outputPath = path.join(rootDir, 'docs', 'development', 'testing-suite-inventory.csv');
  const expected = renderInventoryCsv(inventory);
  const current = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;
  if (check) {
    if (current !== expected) throw new Error('testing-suite-inventory.csv is stale; run docs:testing-inventory');
    return { inventory, outputPath, changed: false };
  }
  fs.writeFileSync(outputPath, expected, 'utf8');
  return { inventory, outputPath, changed: current !== expected };
}

if (require.main === module) {
  try {
    const result = generate({ check: process.argv.includes('--check') });
    if (process.argv.includes('--check')) {
      console.log(`Verified ${result.inventory.manifest.entries.length} test manifest rows in ${path.relative(ROOT_DIR, result.outputPath)}`);
    } else {
      console.log(`${result.changed ? 'Generated' : 'Verified'} ${result.inventory.manifest.entries.length} test manifest rows in ${path.relative(ROOT_DIR, result.outputPath)}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  HEADER,
  escapeCsv,
  renderInventoryCsv,
  generate
};
