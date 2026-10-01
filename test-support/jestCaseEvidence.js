'use strict';

const path = require('path');

const CASE_OUTCOME_STATUSES = Object.freeze(['passed', 'failed', 'pending', 'skipped', 'todo', 'disabled', 'flaky']);
const CASE_STATUSES = Object.freeze([...CASE_OUTCOME_STATUSES, 'unknown']);

function normalizeFile(file, rootDir) {
  const raw = String(file || '');
  const windowsAbsolute = path.win32.isAbsolute(raw);
  const relative = path.isAbsolute(raw) || windowsAbsolute
    ? (windowsAbsolute ? path.win32.relative(rootDir, raw) : path.relative(rootDir, raw))
    : raw;
  return relative.replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizeStatus(status) {
  return CASE_OUTCOME_STATUSES.includes(status) ? status : 'unknown';
}

function getManifestEvidence(entry) {
  return {
    scenarioIds: entry?.scenarioIds || [],
    requirements: entry?.requirements || [],
    requirementEvidence: entry?.requirementEvidence || null,
    componentScope: entry?.componentScope || [],
    capabilityScope: entry?.capabilityScope || [],
    transitionScope: entry?.transitionScope || [],
    layer: entry?.layer || null,
    defaultLane: entry?.defaultLane || null,
    setupClassification: entry?.setupClassification || 'unknown'
  };
}

function buildJestCaseEvidence({ lane, environment, results, manifestEntries, rootDir }) {
  const manifestByFile = new Map((manifestEntries || []).map(entry => [
    normalizeFile(entry.file, rootDir),
    entry
  ]));
  const rawFiles = (results || []).flatMap(result => result?.testResults || []);
  const files = rawFiles.map(result => {
    const file = normalizeFile(result.name, rootDir);
    const manifest = manifestByFile.get(file) || null;
    const manifestEvidence = getManifestEvidence(manifest);
    const tests = (result.assertionResults || []).map(assertion => ({
      name: assertion.fullName || [...(assertion.ancestorTitles || []), assertion.title].filter(Boolean).join(' '),
      status: normalizeStatus(assertion.status),
      durationMs: Number.isFinite(Number(assertion.duration)) ? Number(assertion.duration) : null,
      ...manifestEvidence,
      environment
    }));
    return {
      framework: 'jest',
      file,
      status: result.status || 'unknown',
      durationMs: Number.isFinite(Number(result.endTime) - Number(result.startTime))
        ? Math.max(0, Number(result.endTime) - Number(result.startTime))
        : null,
      ...manifestEvidence,
      tests
    };
  });
  return mergeCaseEvidence({ lane, environment, evidence: [{ framework: 'jest', files }] });
}

function mergeCaseEvidence({ lane, environment, evidence, expectedFrameworks }) {
  const parts = evidence || [];
  const files = parts.flatMap(part => part.files || []);
  const frameworks = Array.from(new Set(parts.flatMap(part => part.frameworks || [part.framework]).filter(Boolean))).sort();
  const expected = expectedFrameworks || frameworks;
  const counts = Object.fromEntries(CASE_STATUSES.map(status => [status, 0]));
  files.forEach(file => file.tests.forEach(test => { counts[normalizeStatus(test.status)] += 1; }));
  const unmappedFiles = files.filter(file => file.scenarioIds.length === 0).map(file => file.file);
  return {
    schemaVersion: 1,
    framework: frameworks.length > 1 ? 'mixed' : (frameworks[0] || 'unknown'),
    frameworks,
    expectedFrameworks: expected,
    missingFrameworks: expected.filter(framework => !frameworks.includes(framework)),
    lane,
    environment,
    granularity: {
      outcome: 'individual-test-case',
      requirementMetadata: 'discovered-test-file'
    },
    summary: {
      files: files.length,
      testCases: files.reduce((total, file) => total + file.tests.length, 0),
      ...counts,
      unmappedFiles
    },
    files
  };
}

module.exports = {
  CASE_STATUSES,
  CASE_OUTCOME_STATUSES,
  normalizeFile,
  normalizeStatus,
  buildJestCaseEvidence,
  mergeCaseEvidence
};
