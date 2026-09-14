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
const ARCHIVE_CONTRACTS = new Set(['ARCHIVE', 'REC']);
const MUTATION_CONTRACTS = new Set(['PERSIST', 'CACHE', 'REC', 'DIRTY', 'STATS', 'LAYOUT', 'ARCHIVE']);
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
  CRITICAL_SCENARIO_IDS,
  getScenarioIdsForFile,
  getScenariosForIds
} = require('./scenarioCatalog.js');
const { COMPONENT_CATALOG } = require('./componentCatalog.js');
const { getExplicitLayer } = require('./jestLayerManifest.js');
const KNOWN_SCENARIO_IDS = new Set(SCENARIO_CATALOG.map(scenario => scenario.id));
const CRITICAL_SCENARIO_ID_SET = new Set(CRITICAL_SCENARIO_IDS);

function normalizePath(file) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function humanizeScenarioId(id) {
  const suffix = String(id || '').split('.').slice(1).join(' ');
  return suffix
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function buildManifestMetadata({ layer, framework, status, scenarioIds, scenarios, componentScope, contracts, setup }) {
  const isBrowser = framework === 'playwright';
  const isAppOwned = layer === 'app-integration' || isBrowser;
  const hasAsyncContract = contracts.includes('ASYNC');
  const hasMutationContract = contracts.some(contract => MUTATION_CONTRACTS.has(contract));
  const requirements = scenarioIds.map((id, index) => {
    const scenario = scenarios[index] || {};
    const isExplicit = Boolean(scenario.requirement && scenario.capability && scenario.evidence);
    return {
      id,
      label: scenario.requirement || humanizeScenarioId(id),
      capability: scenario.capability || scenario.contract || scenario.kind || 'unclassified',
      evidence: scenario.evidence || 'scenario-id-mapping',
      metadataSource: isExplicit ? 'explicit' : 'inferred'
    };
  });
  const explicitRequirements = requirements.filter(requirement => requirement.metadataSource === 'explicit');
  return {
    requirements,
    capabilityScope: Array.from(new Set(requirements.map(requirement => requirement.capability))),
    requirementEvidence: {
      explicit: explicitRequirements.length,
      inferred: requirements.length - explicitRequirements.length,
      critical: requirements
        .filter(requirement => CRITICAL_SCENARIO_ID_SET.has(requirement.id))
        .map(requirement => requirement.id)
    },
    browser: isBrowser ? ['chromium'] : [],
    expectedWorkerMode: layer === 'worker'
      ? 'worker-entrypoint'
      : (isBrowser ? 'playwright-worker' : 'main-thread-or-component-worker'),
    fixtureProvenance: {
      source: setup,
      mode: isBrowser ? 'e2e-driver-or-suite-fixture' : (layer === 'app-integration' ? 'production-bootstrap-or-suite-fixture' : 'layer-owned-fixture'),
      archiveSchemaVersion: contracts.some(contract => ARCHIVE_CONTRACTS.has(contract)) ? 1 : null
    },
    ownerExpectations: {
      authority: componentScope.length ? 'component-owner' : 'shared-or-governance',
      session: isAppOwned ? 'tab-scoped-session' : 'not-applicable',
      asyncToken: hasAsyncContract ? 'required' : 'not-applicable'
    },
    readiness: {
      predicate: isAppOwned ? 'owner-scoped-or-suite-declared' : 'not-applicable',
      timeoutMs: isBrowser ? 30000 : (layer === 'app-integration' ? 90000 : 0),
      reason: isAppOwned ? 'framework or suite readiness contract' : 'no application lifecycle'
    },
    mutation: {
      authority: hasMutationContract ? 'owner-session-or-explicit-fixture' : 'not-applicable',
      fingerprint: hasMutationContract ? 'required-by-contract' : 'not-applicable'
    },
    requiredArtifacts: isBrowser
      ? ['trace', 'screenshot', 'video', 'error-context']
      : ['jest-result'],
    skipPolicy: status === 'legacy-unmapped'
      ? {
          reason: 'scenario mapping deferred for reviewed legacy coverage',
          issueRef: 'testing-suite-refactor-roadmap',
          expiresOn: '2026-12-31'
        }
      : null,
    predecessorScenarioIds: []
  };
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
  const setup = normalized.startsWith('e2e/')
    ? 'ui-or-api-declared-in-suite'
    : (layer === 'app-integration' ? 'production-derived-or-declared-in-suite' : 'layer-owned');
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
    setup,
    provenance: 'framework-discovery',
    ...buildManifestMetadata({
      layer,
      framework: resolvedFramework,
      status: scenarioIds.length ? 'migrated' : 'legacy-unmapped',
      scenarioIds,
      scenarios,
      componentScope,
      contracts,
      setup
    })
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

// A feature is explained only by a direct scenario whose declared capability
// matches it. Wildcard scenarios remain visible in the row but never satisfy
// direct feature evidence.
const COMPONENT_FEATURE_ALIASES = Object.freeze({
  graphModes: Object.freeze(['component-modes']),
  renderCache: Object.freeze(['render-cache', 'cache']),
  statistics: Object.freeze(['statistics', 'stats']),
  notes: Object.freeze(['notes']),
  dataViews: Object.freeze(['data-views', 'dataviews', 'data-view']),
  canvas: Object.freeze(['canvas']),
  threeD: Object.freeze(['3d', 'three-d']),
  worker: Object.freeze(['worker', 'workers']),
  externalAsync: Object.freeze(['async-ownership', 'external-async', 'async'])
});

function requirementCoversFeature(requirement, feature){
  const capability = String(requirement?.capability || '').trim().toLowerCase();
  return (COMPONENT_FEATURE_ALIASES[feature] || []).some(alias => capability === alias);
}

function summarizeComponentMatrix(entries){
  const matrix = {};
  for (const component of COMPONENT_CATALOG) {
    const directScenarioIds = new Set();
    const wildcardScenarioIds = new Set();
    const explicitRequirementIds = new Set();
    const featureNames = [
      'graphModes',
      ...Object.entries(component.capabilities || {})
        .filter(([, enabled]) => enabled === true)
        .map(([feature]) => feature)
    ];
    const featureEvidence = Object.fromEntries(featureNames.map(feature => [feature, new Set()]));
    for (const entry of entries || []) {
      for (const requirement of entry.requirements || []) {
        const scenario = getScenariosForIds([requirement.id])[0];
        const scopes = scenario?.components || [];
        if (scopes.includes(component.type)) {
          directScenarioIds.add(requirement.id);
          if (requirement.metadataSource === 'explicit') explicitRequirementIds.add(requirement.id);
          for (const feature of Object.keys(featureEvidence)) {
            if (requirementCoversFeature(requirement, feature)) featureEvidence[feature].add(requirement.id);
          }
        } else if (scopes.includes('*')) {
          wildcardScenarioIds.add(requirement.id);
        }
      }
    }
    const directFeatureEvidence = Object.fromEntries(
      Object.entries(featureEvidence)
        .map(([feature, ids]) => [feature, Array.from(ids).sort()])
    );
    const unexplainedFeatureGaps = Object.entries(directFeatureEvidence)
      .filter(([, ids]) => ids.length === 0)
      .map(([feature]) => feature);
    matrix[component.type] = {
      capabilities: Object.freeze({
        graphModes: Object.freeze((component.graphModes || []).slice()),
        ...component.capabilities
      }),
      directScenarioIds: Array.from(directScenarioIds).sort(),
      wildcardScenarioIds: Array.from(wildcardScenarioIds).sort(),
      explicitRequirementIds: Array.from(explicitRequirementIds).sort(),
      directFeatureEvidence,
      unexplainedFeatureGaps
    };
  }
  return matrix;
}

function summarizeManifest(entries) {
  const byLayer = Object.fromEntries(LAYERS.map(layer => [layer, 0]));
  const byLane = {};
  let unmapped = 0;
  let explicitRequirements = 0;
  let inferredRequirements = 0;
  const criticalRequirements = new Set();
  for (const entry of entries) {
    byLayer[entry.layer] = (byLayer[entry.layer] || 0) + 1;
    byLane[entry.defaultLane] = (byLane[entry.defaultLane] || 0) + 1;
    if (entry.status !== 'migrated') unmapped += 1;
    for (const requirement of entry.requirements || []) {
      if (requirement.metadataSource === 'explicit') explicitRequirements += 1;
      else inferredRequirements += 1;
      if (CRITICAL_SCENARIO_ID_SET.has(requirement.id)) criticalRequirements.add(requirement.id);
    }
  }
  return {
    total: entries.length,
    byLayer,
    byLane,
    unmapped,
    contracts: CANONICAL_CONTRACTS,
    componentMatrix: summarizeComponentMatrix(entries),
    requirementEvidence: {
      explicitMappings: explicitRequirements,
      inferredMappings: inferredRequirements,
      criticalScenarioIds: CRITICAL_SCENARIO_IDS,
      mappedCriticalScenarioIds: Array.from(criticalRequirements).sort()
    }
  };
}

function validateManifest(entries, options = {}) {
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
    if (!Array.isArray(entry.requirements) || entry.requirements.some(requirement => (
      !requirement
      || !requirement.id
      || !requirement.label
      || !requirement.capability
      || !requirement.evidence
      || !['explicit', 'inferred'].includes(requirement.metadataSource)
    ))) {
      failures.push(`manifest entry has incomplete requirement metadata: ${entry.id || '(missing)'}`);
    }
    for (const requirement of entry.requirements || []) {
      if (CRITICAL_SCENARIO_ID_SET.has(requirement.id) && requirement.metadataSource !== 'explicit') {
        failures.push(`critical scenario has inferred requirement metadata: ${requirement.id}`);
      }
    }
    if (!Array.isArray(entry.capabilityScope) || !Array.isArray(entry.browser) || !entry.expectedWorkerMode) {
      failures.push(`manifest entry has incomplete environment metadata: ${entry.id || '(missing)'}`);
    }
    if (!entry.fixtureProvenance
      || !entry.fixtureProvenance.source
      || !entry.fixtureProvenance.mode
      || !Object.prototype.hasOwnProperty.call(entry.fixtureProvenance, 'archiveSchemaVersion')) {
      failures.push(`manifest entry has incomplete fixture provenance: ${entry.id || '(missing)'}`);
    }
    if (!entry.ownerExpectations
      || !entry.ownerExpectations.authority
      || !entry.ownerExpectations.session
      || !entry.ownerExpectations.asyncToken) {
      failures.push(`manifest entry has incomplete owner expectations: ${entry.id || '(missing)'}`);
    }
    if (!entry.readiness
      || !entry.readiness.predicate
      || !Number.isFinite(Number(entry.readiness.timeoutMs))
      || !entry.readiness.reason) {
      failures.push(`manifest entry has incomplete readiness metadata: ${entry.id || '(missing)'}`);
    }
    if (!entry.mutation
      || !entry.mutation.authority
      || !entry.mutation.fingerprint
      || !Array.isArray(entry.requiredArtifacts)
      || entry.requiredArtifacts.length === 0
      || !Array.isArray(entry.predecessorScenarioIds)) {
      failures.push(`manifest entry has incomplete execution metadata: ${entry.id || '(missing)'}`);
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
    if (entry.status === 'legacy-unmapped') {
      if (!entry.skipPolicy
        || !entry.skipPolicy.reason
        || !entry.skipPolicy.issueRef
        || !/^\d{4}-\d{2}-\d{2}$/.test(String(entry.skipPolicy.expiresOn || ''))) {
        failures.push(`legacy-unmapped entry has no reviewed skip policy: ${entry.id || '(missing)'}`);
      }
    } else if (entry.skipPolicy !== null) {
      failures.push(`migrated manifest entry has an unexpected skip policy: ${entry.id || '(missing)'}`);
    }
  }
  if (options.requireCriticalScenarioCoverage === true) {
    const mappedScenarioIds = new Set((entries || []).flatMap(entry => entry.scenarioIds || []));
    const missingCritical = CRITICAL_SCENARIO_IDS.filter(id => !mappedScenarioIds.has(id));
    if (missingCritical.length > 0) {
      failures.push(`critical scenarios are not linked to discovered tests: ${missingCritical.join(', ')}`);
    }
  }
  return failures;
}

module.exports = {
  LAYERS,
  DEFAULT_LANES,
  REQUIRED_BROWSER_LANES,
  CANONICAL_CONTRACTS,
  CRITICAL_SCENARIO_IDS,
  ORACLE_POLICIES,
  LEGACY_UNMAPPED_BASELINE,
  classifyTestFile,
  buildFileManifest,
  summarizeManifest,
  validateManifest
};
