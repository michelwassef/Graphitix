'use strict';

const { VENDOR_MODES } = require('./testReportEnvironment.js');
const { CASE_STATUSES, CASE_OUTCOME_STATUSES } = require('./jestCaseEvidence.js');

const REPORT_SCHEMA_VERSION = 1;

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isStatus(value) {
  return value === 0 || value === 1;
}

function validateCaseEvidence(evidence) {
  const failures = [];
  if (!evidence || evidence.schemaVersion !== 1 || !['jest', 'playwright', 'mixed'].includes(evidence.framework)) {
    return ['Case evidence has an unsupported schema or framework'];
  }
  if (!evidence.lane || !evidence.environment || !VENDOR_MODES.includes(evidence.environment.vendorMode)) {
    failures.push('Case evidence has incomplete lane or environment metadata');
  }
  if (evidence.granularity?.outcome !== 'individual-test-case'
    || evidence.granularity?.requirementMetadata !== 'discovered-test-file') {
    failures.push('Case evidence has invalid mapping granularity');
  }
  if (!Array.isArray(evidence.frameworks) || !Array.isArray(evidence.expectedFrameworks)
    || !Array.isArray(evidence.missingFrameworks) || !Array.isArray(evidence.files)
    || !evidence.summary || !Array.isArray(evidence.summary.unmappedFiles)) {
    failures.push('Case evidence has incomplete framework, file, or summary data');
    return failures;
  }
  if (evidence.files.length === 0) failures.push('Case evidence contains no test files');
  if (evidence.missingFrameworks.some(framework => evidence.expectedFrameworks.includes(framework))) {
    failures.push('Case evidence is missing an expected test framework');
  }
  const actualMissingFrameworks = evidence.expectedFrameworks.filter(framework => !evidence.frameworks.includes(framework));
  if (actualMissingFrameworks.length !== evidence.missingFrameworks.length
    || actualMissingFrameworks.some((framework, index) => framework !== evidence.missingFrameworks[index])) {
    failures.push('Case evidence missing-framework list does not match collected results');
  }
  const observed = Object.fromEntries(CASE_STATUSES.map(status => [status, 0]));
  for (const file of evidence.files) {
    if (!file?.file || !Array.isArray(file.scenarioIds) || file.scenarioIds.length === 0
      || !Array.isArray(file.requirements) || file.requirements.length === 0
      || !Array.isArray(file.componentScope) || !Array.isArray(file.capabilityScope)
      || !Array.isArray(file.transitionScope) || !Array.isArray(file.tests)
      || !file.requirementEvidence || !Number.isFinite(Number(file.requirementEvidence.explicit))
      || !Number.isFinite(Number(file.requirementEvidence.inferred))
      || !Array.isArray(file.requirementEvidence.critical)
      || !file.layer || !file.defaultLane || !file.setupClassification) {
      failures.push(`Case evidence has an unmapped or incomplete test file: ${file?.file || '(missing)'}`);
      continue;
    }
    if (file.tests.length === 0) failures.push(`Case evidence file has no individual test outcomes: ${file.file}`);
    const requirementIds = file.requirements.map(requirement => requirement?.id || null);
    if (!sameJson(file.scenarioIds, requirementIds)
      || file.requirements.some(requirement => !requirement?.label || !requirement?.capability
        || !requirement?.evidence || !requirement?.transition)) {
      failures.push(`Case evidence requirement metadata does not match its scenario IDs: ${file.file}`);
    }
    if (!evidence.frameworks.includes(file.framework)) failures.push(`Case evidence has an unknown source framework in ${file.file}`);
    for (const test of file.tests) {
      if (!test?.name || !CASE_OUTCOME_STATUSES.includes(test.status)) {
        failures.push(`Case evidence has an invalid test outcome in ${file.file}`);
      } else {
        observed[test.status] += 1;
        for (const key of ['scenarioIds', 'requirements', 'requirementEvidence', 'componentScope', 'capabilityScope', 'transitionScope', 'layer', 'defaultLane', 'setupClassification']) {
          if (!sameJson(test[key], file[key])) {
            failures.push(`Case evidence test metadata differs from its discovered file for ${key}: ${file.file} :: ${test.name}`);
          }
        }
        if (!sameJson(test.environment, evidence.environment)) {
          failures.push(`Case evidence test environment differs from its lane: ${file.file} :: ${test.name}`);
        }
      }
    }
  }
  if (evidence.summary.unmappedFiles.length > 0) failures.push('Case evidence contains files without scenario mappings');
  for (const status of CASE_STATUSES) {
    if (Number(evidence.summary[status]) !== observed[status]) {
      failures.push(`Case evidence summary differs for ${status} outcomes`);
    }
  }
  if (Number(evidence.summary.testCases) !== Object.values(observed).reduce((sum, count) => sum + count, 0)) {
    failures.push('Case evidence total differs from individual outcomes');
  }
  if (Number(evidence.summary.files) !== evidence.files.length) failures.push('Case evidence file total differs from its file entries');
  return failures;
}

const validateJestCaseEvidence = validateCaseEvidence;

function validateReportSchema(report) {
  const failures = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return ['report must be an object'];
  }
  if (['jest', 'playwright', 'mixed'].includes(report.framework)) return validateCaseEvidence(report);
  if (report.schemaVersion !== REPORT_SCHEMA_VERSION) {
    failures.push(`unsupported report schema version: ${String(report.schemaVersion)}`);
  }
  if (!report.lane && !report.runner) failures.push('report has no lane or runner');
  if (!isStatus(report.initialStatus)) failures.push('report has invalid initialStatus');
  if (!Number.isFinite(Number(report.durationMs)) || Number(report.durationMs) < 0) {
    failures.push('report has invalid durationMs');
  }

  if (report.lane) {
    if (!Array.isArray(report.initial)) failures.push('lane report has no initial command list');
    if (!Array.isArray(report.diagnostic)) failures.push('lane report has no diagnostic command list');
    if (report.diagnosticStatus !== null && !isStatus(report.diagnosticStatus)) {
      failures.push('lane report has invalid diagnosticStatus');
    }
    if (!report.environment || !report.environment.node || !report.environment.platform || !VENDOR_MODES.includes(report.environment.vendorMode)) {
      failures.push('lane report has incomplete environment metadata');
    }
    if (!report.manifestEvidence || !report.artifactPolicy || !report.artifacts) {
      failures.push('lane report has incomplete evidence or artifact metadata');
    }
    for (const artifactName of report.artifactPolicy?.required || []) {
      const artifact = report.artifacts?.[artifactName];
      const present = Array.isArray(artifact) ? artifact.length > 0 : Boolean(artifact);
      if (!present) failures.push(`lane report is missing required artifact: ${artifactName}`);
    }
    if (report.artifactPolicy?.required?.includes('caseEvidence')
      && (!report.caseEvidence?.artifact || !report.caseEvidence?.summary || !report.caseEvidence?.granularity)) {
      failures.push('lane report has no linked per-case evidence');
    }
    if (!Array.isArray(report.manifestEvidence?.omittedScenarioIds)
      || !Array.isArray(report.manifestEvidence?.coveredScenarioIds)
      || !report.manifestEvidence?.skipDeclarations
      || !Array.isArray(report.manifestEvidence.skipDeclarations.entries)) {
      failures.push('lane report has incomplete reduced-lane scenario evidence');
    }
    if (Array.isArray(report.environment?.serverProvenance)) {
      report.environment.serverProvenance.forEach((entry, index) => {
        if (!entry || !entry.command || !entry.reportFile || !['verified', 'unavailable'].includes(entry.status)) {
          failures.push(`lane report has invalid server provenance entry: ${index}`);
        }
        if (entry.status === 'verified' && (!entry.baseUrl || !entry.indexHash || !entry.sourceRoot || !entry.serverCommand)) {
          failures.push(`lane report has incomplete verified server provenance entry: ${index}`);
        }
      });
    }
  }

  if (report.runner === 'jest-shards') {
    if (!report.project || !Array.isArray(report.groups) || !Array.isArray(report.failedGroups)) {
      failures.push('Jest shard report has incomplete group metadata');
    }
    if (!report.environment || !VENDOR_MODES.includes(report.environment.vendorMode)) {
      failures.push('Jest shard report has incomplete environment metadata');
    }
    if (report.caseEvidence !== null && report.caseEvidence !== undefined
      && (!report.caseEvidence.file || !report.caseEvidence.summary)) {
      failures.push('Jest shard report has incomplete case-evidence reference');
    }
  }
  if (report.runner === 'jest-full-bounded') {
    if (!Array.isArray(report.projects) || !report.summary || !Array.isArray(report.groups)) {
      failures.push('bounded Jest report has incomplete project metadata');
    }
    if (!report.environment || !VENDOR_MODES.includes(report.environment.vendorMode)) {
      failures.push('bounded Jest report has incomplete environment metadata');
    }
    if (report.caseEvidence !== null && report.caseEvidence !== undefined
      && (!report.caseEvidence.artifact || !report.caseEvidence.summary || !report.caseEvidence.granularity
        || (report.caseEvidence.validationFailures || []).length > 0)) {
      failures.push('bounded Jest report has invalid case-evidence metadata');
    }
  }
  return failures;
}

function assertReportSchema(report, label = 'test report') {
  const failures = validateReportSchema(report);
  if (failures.length > 0) {
    throw new Error(`${label} failed schema validation:\n${failures.join('\n')}`);
  }
  return report;
}

module.exports = {
  REPORT_SCHEMA_VERSION,
  validateCaseEvidence,
  validateJestCaseEvidence,
  validateReportSchema,
  assertReportSchema
};
