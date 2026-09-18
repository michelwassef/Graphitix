'use strict';

const REPORT_SCHEMA_VERSION = 1;

function isStatus(value) {
  return value === 0 || value === 1;
}

function validateReportSchema(report) {
  const failures = [];
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return ['report must be an object'];
  }
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
    if (!report.environment || !report.environment.node || !report.environment.platform) {
      failures.push('lane report has incomplete environment metadata');
    }
    if (!report.manifestEvidence || !report.artifactPolicy || !report.artifacts) {
      failures.push('lane report has incomplete evidence or artifact metadata');
    }
  }

  if (report.runner === 'jest-shards') {
    if (!report.project || !Array.isArray(report.groups) || !Array.isArray(report.failedGroups)) {
      failures.push('Jest shard report has incomplete group metadata');
    }
  }
  if (report.runner === 'jest-full-bounded') {
    if (!Array.isArray(report.projects) || !report.summary || !Array.isArray(report.groups)) {
      failures.push('bounded Jest report has incomplete project metadata');
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
  validateReportSchema,
  assertReportSchema
};
