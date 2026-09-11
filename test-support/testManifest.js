'use strict';

// The file manifest is generated from framework discovery. It is deliberately
// not a second list of test names: moving a file changes its generated ID and
// must be reviewed as a migration, while discovery remains authoritative.
const LAYERS = Object.freeze([
  'unit-node',
  'dom-unit',
  'architecture',
  'statistical-oracle',
  'app-integration',
  'worker',
  'browser-e2e'
]);

const DEFAULT_LANES = Object.freeze({
  'unit-node': 'unit',
  'dom-unit': 'dom',
  architecture: 'architecture',
  'statistical-oracle': 'stats',
  'app-integration': 'integration',
  worker: 'workers',
  'browser-e2e': 'full-chromium'
});

const REQUIRED_BROWSER_LANES = Object.freeze({
  // Chromium is the active browser gate for this migration pass. Firefox
  // remains configured for a later parity pass, but is never implied by a
  // discovered test's required lane.
  'browser-e2e': Object.freeze(['full-chromium'])
});

const CANONICAL_CONTRACTS = Object.freeze([
  'OWN',
  'PERSIST',
  'CACHE',
  'REC',
  'ASYNC',
  'DIRTY',
  'STATS',
  'LAYOUT',
  'ARCHIVE'
]);

const ORACLE_POLICIES = Object.freeze(['required', 'optional', 'not-applicable']);
// Current non-regression floor after the explicit layer/scenario migration
// slice. Lowering this number requires regenerating the inventory and review.
const LEGACY_UNMAPPED_BASELINE = 274;

const REQUIRED_PYTHON_ORACLE_FILES = new Set([
  '__tests__/stats.differential.python.test.js',
  '__tests__/stats.component.differential.test.js',
  '__tests__/stats.matrix.components.test.js'
]);

const {
  SCENARIO_CATALOG,
  getScenarioIdsForFile,
  getScenariosForIds
} = require('./scenarioCatalog.js');
const { getExplicitLayer } = require('./jestLayerManifest.js');
const KNOWN_SCENARIO_IDS = new Set(SCENARIO_CATALOG.map(scenario => scenario.id));

function normalizePath(file) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function classifyTestFile(file, framework = null) {
  const normalized = normalizePath(file);
  const resolvedFramework = framework || (normalized.startsWith('e2e/') ? 'playwright' : 'jest');
  let layer = null;
  if (resolvedFramework === 'playwright' || normalized.startsWith('e2e/')) {
    layer = 'browser-e2e';
  } else if (normalized.startsWith('__tests__/unit/') || getExplicitLayer(normalized) === 'unit-node') {
    layer = 'unit-node';
  } else if (normalized.startsWith('__tests__/dom/') || getExplicitLayer(normalized) === 'dom-unit') {
    layer = 'dom-unit';
  } else if (getExplicitLayer(normalized) === 'architecture') {
    layer = 'architecture';
  } else if (getExplicitLayer(normalized) === 'statistical-oracle') {
    layer = 'statistical-oracle';
  } else if (normalized.startsWith('__tests__/workers/')) {
    layer = 'worker';
  } else if (normalized.startsWith('__tests__/')) {
    layer = 'app-integration';
  }
  if (!layer || !LAYERS.includes(layer)) {
    throw new Error(`Cannot classify test file: ${normalized}`);
  }
  const scenarioIds = getScenarioIdsForFile(normalized);
  const scenarios = getScenariosForIds(scenarioIds);
  const componentScope = Array.from(new Set(scenarios.flatMap(scenario => scenario.components || [])));
  const contracts = Array.from(new Set(scenarios.map(scenario => scenario.contract).filter(Boolean)));
  return {
    id: `file:${normalized}`,
    file: normalized,
    framework: resolvedFramework,
    layer,
    defaultLane: DEFAULT_LANES[layer],
    requiredLanes: REQUIRED_BROWSER_LANES[layer] || Object.freeze([DEFAULT_LANES[layer]]),
    status: scenarioIds.length ? 'migrated' : 'legacy-unmapped',
    scenarioIds,
    componentScope,
    contracts,
    oracle: REQUIRED_PYTHON_ORACLE_FILES.has(normalized) ? 'required' : 'not-applicable',
    setup: normalized.startsWith('e2e/')
      ? 'ui-or-api-declared-in-suite'
      : (layer === 'app-integration' ? 'production-derived-or-declared-in-suite' : 'layer-owned'),
    provenance: 'framework-discovery'
  };
}

function buildFileManifest({ jestPaths = [], e2ePaths = [] } = {}) {
  const entries = [
    ...jestPaths.map(file => classifyTestFile(file, 'jest')),
    ...e2ePaths.map(file => classifyTestFile(file, 'playwright'))
  ].sort((left, right) => left.file.localeCompare(right.file));
  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate generated test manifest ID: ${entry.id}`);
    }
    ids.add(entry.id);
  }
  return Object.freeze(entries);
}

function summarizeManifest(entries) {
  const byLayer = Object.fromEntries(LAYERS.map(layer => [layer, 0]));
  const byLane = {};
  let unmapped = 0;
  for (const entry of entries) {
    byLayer[entry.layer] = (byLayer[entry.layer] || 0) + 1;
    byLane[entry.defaultLane] = (byLane[entry.defaultLane] || 0) + 1;
    if (entry.status !== 'migrated') unmapped += 1;
  }
  return {
    total: entries.length,
    byLayer,
    byLane,
    unmapped,
    contracts: CANONICAL_CONTRACTS
  };
}

function validateManifest(entries) {
  const failures = [];
  const ids = new Set();
  for (const entry of entries || []) {
    if (!entry || typeof entry !== 'object') {
      failures.push('manifest contains a non-object entry');
      continue;
    }
    if (!entry.id || ids.has(entry.id)) {
      failures.push(`manifest ID missing or duplicated: ${entry.id || '(missing)'}`);
    }
    ids.add(entry.id);
    if (!entry.file || !entry.framework || !LAYERS.includes(entry.layer)) {
      failures.push(`manifest entry is incomplete: ${entry.id || '(missing)'}`);
    }
    if (!entry.defaultLane || !Array.isArray(entry.requiredLanes) || entry.requiredLanes.length === 0) {
      failures.push(`manifest entry has no lane contract: ${entry.id || '(missing)'}`);
    }
    if (!Array.isArray(entry.componentScope) || !Array.isArray(entry.contracts) || !entry.setup) {
      failures.push(`manifest entry has incomplete ownership metadata: ${entry.id || '(missing)'}`);
    }
    if (!ORACLE_POLICIES.includes(entry.oracle)) {
      failures.push(`manifest entry has invalid oracle policy: ${entry.id || '(missing)'}`);
    }
    if (!Array.isArray(entry.scenarioIds)) {
      failures.push(`manifest entry has invalid scenario IDs: ${entry.id || '(missing)'}`);
    } else {
      const unknown = entry.scenarioIds.filter(id => !KNOWN_SCENARIO_IDS.has(id));
      if (unknown.length) {
        failures.push(`manifest entry has unknown scenario IDs: ${unknown.join(', ')}`);
      }
      if (entry.status === 'migrated' && entry.scenarioIds.length === 0) {
        failures.push(`migrated manifest entry has no scenario IDs: ${entry.id || '(missing)'}`);
      }
    }
  }
  return failures;
}

module.exports = {
  LAYERS,
  DEFAULT_LANES,
  REQUIRED_BROWSER_LANES,
  CANONICAL_CONTRACTS,
  ORACLE_POLICIES,
  LEGACY_UNMAPPED_BASELINE,
  classifyTestFile,
  buildFileManifest,
  summarizeManifest,
  validateManifest
};
