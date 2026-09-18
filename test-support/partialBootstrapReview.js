'use strict';

const REVIEWED_PARTIAL_BOOTSTRAPS = Object.freeze({
  '__tests__/architecture/box.referenceStats.contract.test.js': 'injects jStat and replaces the worker module with a VM fixture',
  '__tests__/dom/pca.preprocessing.test.js': 'isolates preprocessing helpers with a minimal shared namespace',
  '__tests__/dom/hist.drawableFrame.test.js': 'supplies only the layout contract needed by the frame test',
  '__tests__/dom/hist.panel-layout.test.js': 'uses a deterministic chartStyle measurement double',
  '__tests__/dom/hist.schedulerOwnership.test.js': 'isolates the lifecycle scheduler contract',
  '__tests__/unit/line.regressionOverlaySegmentation.test.js': 'tests a pure projection helper with an intentionally empty shared namespace',
  '__tests__/integration/regression.persistence.test.js': 'continues a production bootstrap at the component boundary',
  '__tests__/dom/requested-defaults.contract.test.js': 'owns a focused workspace fixture and tests source contracts',
  '__tests__/unit/roc.classificationSetup.test.js': 'isolates the ROC normalization contract with the lifecycle dependency only',
  '__tests__/dom/roc.statistics.standard.test.js': 'loads the statistical primitives explicitly for numerical tests',
  '__tests__/unit/resampling.contract.test.js': 'loads the statistical primitives explicitly for seeded ROC resampling tests',
  '__tests__/unit/scatter.pointContextMenuSelection.test.js': 'tests a pure selection helper without a DOM bootstrap',
  '__tests__/unit/scatter.pointStyleOverrides.test.js': 'tests style resolution with intentionally minimal globals',
  '__tests__/unit/scatter.regressionOverlayRange.test.js': 'tests a pure regression-bound helper with intentionally minimal globals',
  '__tests__/statistical-oracle/stats.component.differential.test.js': 'loads only statistical primitives for Python-oracle comparison',
  '__tests__/statistical-oracle/stats.matrix.components.test.js': 'loads only statistical primitives for generated Python-oracle comparison',
  '__tests__/unit/stats.audit.remediation.components.test.js': 'uses a reviewed cross-component statistical fixture with explicit shared dependencies',
  '__tests__/statistical-oracle/stats.extended.coverage.test.js': 'uses a reviewed cross-component statistical fixture with explicit shared dependencies',
  '__tests__/unit/line.model.test.js': 'isolates Line model helpers with a chartStyle test double'
});

function collectDirectComponentBootstraps(records = []) {
  return records
    .filter(record => record && Array.isArray(record.requires) && record.requires.length > 0)
    .map(record => ({
      file: String(record.file || '').replace(/\\/g, '/'),
      requires: record.requires.slice(),
      review: REVIEWED_PARTIAL_BOOTSTRAPS[String(record.file || '').replace(/\\/g, '/')] || null
    }));
}

function validatePartialBootstrapReview(records = []) {
  const failures = [];
  const discovered = new Set();
  for (const record of records) {
    discovered.add(record.file);
    if (!record.review) {
      failures.push(`direct component bootstrap lacks a reviewed reason: ${record.file}`);
    }
  }
  for (const file of Object.keys(REVIEWED_PARTIAL_BOOTSTRAPS)) {
    if (!discovered.has(file)) {
      failures.push(`partial bootstrap review is stale: ${file}`);
    }
  }
  return failures;
}

module.exports = {
  REVIEWED_PARTIAL_BOOTSTRAPS,
  collectDirectComponentBootstraps,
  validatePartialBootstrapReview
};
