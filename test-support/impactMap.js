'use strict';

const { COMPONENT_CATALOG } = require('./componentCatalog.js');

const CONTRACTS = Object.freeze([
  'OWN', 'PERSIST', 'CACHE', 'REC', 'ASYNC', 'DIRTY', 'STATS', 'LAYOUT', 'ARCHIVE'
]);

const IMPACT_RULES = Object.freeze([
  Object.freeze({
    id: 'bootstrap-runtime',
    label: 'production bootstrap and runtime wiring',
    patterns: Object.freeze([
      /^index\.html$/,
      /^js\/vendor\.js$/,
      /^libs\/.*\.js$/
    ]),
    contracts: Object.freeze(['OWN', 'ARCHIVE']),
    lanes: Object.freeze(['static', 'unit', 'dom', 'e2e-contracts:chromium']),
    manifestLayers: Object.freeze(['unit-node', 'dom-unit', 'browser-e2e']),
    allComponents: true
  }),
  Object.freeze({
    id: 'vendor-provenance',
    label: 'pinned vendor provenance',
    patterns: Object.freeze([
      /^package(?:-lock)?\.json$/,
      /^libs\/.*\.js$/
    ]),
    contracts: Object.freeze(['ARCHIVE']),
    lanes: Object.freeze(['static', 'vendor', 'e2e-contracts:chromium']),
    manifestLayers: Object.freeze(['unit-node', 'browser-e2e']),
    allComponents: true
  }),
  Object.freeze({
    id: 'ownership',
    label: 'ownership and lifecycle',
    patterns: Object.freeze([
      /^js\/shared\/(?:componentLifecycle|tabContext|workspaceTabs|jobs|workers|loadingOverlay)\.js$/,
      /^js\/main\/(?:session\.js|sessionActions\.js|documentState\.js|tabs\.js|tabs\/.*\.js|bootstrap\.js|components\.js|domControls\.js)$/,
      /^js\/main\.js$/,
      /^js\/workers\/.*\.js$/
    ]),
    contracts: Object.freeze(['OWN', 'ASYNC', 'DIRTY']),
    lanes: Object.freeze(['unit', 'dom', 'workers', 'integration', 'e2e-contracts:chromium']),
    manifestLayers: Object.freeze(['unit-node', 'dom-unit', 'worker', 'app-integration', 'browser-e2e']),
    allComponents: true
  }),
  Object.freeze({
    id: 'persistence-recovery',
    label: 'persistence, cache, recovery, and archive',
    patterns: Object.freeze([
      /^js\/shared\/(?:fileIO|graphArchive|graphArchiveSchema|dataViewPersistence|renderCache|snapshotPolicy)\.js$/,
      /^js\/main\/(?:previews|session|sessionActions|documentState)\.js$/,
      /^js\/workers\/.*archive.*\.js$/
    ]),
    contracts: Object.freeze(['PERSIST', 'CACHE', 'REC', 'ARCHIVE']),
    lanes: Object.freeze(['unit', 'workers', 'integration', 'e2e-contracts:chromium']),
    manifestLayers: Object.freeze(['unit-node', 'worker', 'app-integration', 'browser-e2e']),
    allComponents: true
  }),
  Object.freeze({
    id: 'layout-rendering',
    label: 'layout and rendering geometry',
    patterns: Object.freeze([
      /^js\/shared\/(?:componentLayout|resizer|graphSizing|chartStyle|plot3d|publicationStyles|gridControls)\.js$/,
      /^css\/style\.css$/
    ]),
    contracts: Object.freeze(['LAYOUT']),
    lanes: Object.freeze(['unit', 'dom', 'integration', 'e2e-contracts:chromium']),
    manifestLayers: Object.freeze(['unit-node', 'dom-unit', 'app-integration', 'browser-e2e']),
    allComponents: true
  }),
  Object.freeze({
    id: 'statistics',
    label: 'statistics and inference',
    patterns: Object.freeze([
      /^js\/shared\/(?:stats|statsFigureSummary|boxStatsModel|regression|stats-table|significanceControls)\.js$/,
      /^js\/shared\/stats(?:Inference)?\.js$/
    ]),
    contracts: Object.freeze(['STATS', 'DIRTY', 'PERSIST']),
    lanes: Object.freeze(['unit', 'integration', 'e2e-contracts:chromium']),
    manifestLayers: Object.freeze(['unit-node', 'app-integration', 'browser-e2e']),
    allComponents: true
  }),
  Object.freeze({
    id: 'table-import',
    label: 'table, import, and derived-data paths',
    patterns: Object.freeze([
      /^js\/shared\/(?:tableImport|dataPipeline|dataTransforms|formulaEngine|hot|agGridAdapter|dataViews)\.js$/,
      /^js\/main\/(?:file|import).*\.js$/i
    ]),
    contracts: Object.freeze(['OWN', 'PERSIST', 'ARCHIVE']),
    lanes: Object.freeze(['unit', 'dom', 'workers', 'integration', 'e2e-contracts:chromium']),
    manifestLayers: Object.freeze(['unit-node', 'dom-unit', 'worker', 'app-integration', 'browser-e2e']),
    allComponents: true
  })
]);

const COMPONENT_CONTRACTS = Object.freeze([...CONTRACTS]);

const COMPONENT_RULES = Object.freeze(COMPONENT_CATALOG.flatMap(component => {
  const pattern = new RegExp(`^js/components/${component.type}\\.js$`);
  const manifestTokens = Object.freeze([component.type, ...(component.aliases || [])]);
  const manifestLayers = Object.freeze(['unit-node', 'dom-unit', 'app-integration', 'browser-e2e']);
  return [
    Object.freeze({
      id: `component:${component.type}:shared-contracts`,
      label: `${component.type} shared contract rows`,
      component: component.type,
      patterns: Object.freeze([pattern]),
      contracts: COMPONENT_CONTRACTS,
      manifestTokens,
      manifestLayers,
      lanes: Object.freeze(['unit', 'dom', 'integration', 'e2e-contracts:chromium'])
    }),
    Object.freeze({
      id: `component:${component.type}`,
      label: `${component.type} component behavior`,
      component: component.type,
      patterns: Object.freeze([pattern]),
      contracts: Object.freeze([]),
      manifestTokens,
      manifestLayers,
      lanes: Object.freeze([
        'unit',
        'dom',
        'integration',
        ...(component.capabilities.worker ? ['workers'] : []),
        'e2e-contracts:chromium'
      ])
    })
  ];
}));

const ALL_RULES = Object.freeze([...IMPACT_RULES, ...COMPONENT_RULES]);

function normalizePath(file) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function matchesRule(rule, file) {
  const normalized = normalizePath(file);
  return rule.patterns.some(pattern => pattern.test(normalized));
}

function inferComponent(file) {
  const normalized = normalizePath(file);
  const match = normalized.match(/^js\/components\/([^/]+)\.js$/);
  if (!match) return null;
  return COMPONENT_CATALOG.some(component => component.type === match[1]) ? match[1] : null;
}

function unique(values) {
  return Array.from(new Set(values));
}

function selectManifestEntries(entries, rule) {
  return (entries || [])
    .filter(entry => {
      if (!entry) return false;
      if (rule.manifestLayers && !rule.manifestLayers.includes(entry.layer)) return false;
      if (rule.manifestTokens) {
        const file = normalizePath(entry.file).toLowerCase();
        return rule.manifestTokens.some(token => file.includes(String(token).toLowerCase()));
      }
      return Boolean(rule.manifestLayers);
    })
    .map(entry => entry.id || `file:${normalizePath(entry.file)}`);
}

function buildImpactPlan(changedFiles, manifestEntries = []) {
  const normalizedFiles = unique((changedFiles || []).map(normalizePath).filter(Boolean));
  const matchedRules = [];
  const affectedComponents = new Set();
  const mandatoryLanes = new Set();
  const contracts = new Set();

  for (const file of normalizedFiles) {
    const component = inferComponent(file);
    if (component) affectedComponents.add(component);
    for (const rule of ALL_RULES) {
      if (!matchesRule(rule, file)) continue;
      const existing = matchedRules.find(item => item.id === rule.id);
      if (existing) {
        existing.files.push(file);
        continue;
      }
      const record = {
        id: rule.id,
        label: rule.label,
        files: [file],
        contracts: [...rule.contracts],
        lanes: [...rule.lanes],
        components: rule.allComponents ? COMPONENT_CATALOG.map(item => item.type) : [rule.component],
        manifestEntryIds: selectManifestEntries(manifestEntries, rule)
      };
      matchedRules.push(record);
    }
  }

  for (const rule of matchedRules) {
    rule.lanes.forEach(lane => mandatoryLanes.add(lane));
    rule.contracts.forEach(contract => contracts.add(contract));
    rule.components.forEach(component => affectedComponents.add(component));
  }

  return {
    changedFiles: normalizedFiles,
    matchedRules,
    mandatoryLanes: unique(Array.from(mandatoryLanes)),
    contracts: CONTRACTS.filter(contract => contracts.has(contract)),
    affectedComponents: COMPONENT_CATALOG
      .map(component => component.type)
      .filter(component => affectedComponents.has(component)),
    hasMandatoryImpact: matchedRules.length > 0
  };
}

module.exports = {
  CONTRACTS,
  IMPACT_RULES,
  COMPONENT_RULES,
  normalizePath,
  inferComponent,
  buildImpactPlan
};
