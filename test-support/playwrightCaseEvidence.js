'use strict';

const { CASE_STATUSES, normalizeFile, mergeCaseEvidence } = require('./jestCaseEvidence.js');

function normalizePlaywrightFile(file, rootDir) {
  const normalized = normalizeFile(file, rootDir);
  return normalized.startsWith('e2e/') ? normalized : `e2e/${normalized.replace(/^\/+/, '')}`;
}

function mapPlaywrightStatus(status, ok) {
  if (status === 'expected') return 'passed';
  if (status === 'unexpected') return 'failed';
  if (status === 'flaky') return 'flaky';
  if (status === 'skipped') return 'skipped';
  if (ok === true) return 'passed';
  if (ok === false) return 'failed';
  return 'unknown';
}

function buildPlaywrightCaseEvidence({ lane, environment, report, manifestEntries, rootDir }) {
  if (!Array.isArray(report?.suites)) throw new Error('Playwright JSON report has no suites array.');
  const casesByFile = new Map();
  function visit(suite, parentTitles = [], inheritedFile = '') {
    const currentFile = suite.file || inheritedFile;
    const title = String(suite.title || '').trim();
    const isFileTitle = /\.(?:spec|test)\.[cm]?[jt]sx?$/i.test(title.replace(/\\/g, '/'));
    const suiteTitles = title && !isFileTitle ? [...parentTitles, title] : parentTitles;
    for (const spec of suite.specs || []) {
      const file = normalizePlaywrightFile(spec.file || currentFile, rootDir);
      const fileCases = casesByFile.get(file) || [];
      for (const test of spec.tests || []) {
        const status = mapPlaywrightStatus(test.status, spec.ok);
        if (!CASE_STATUSES.includes(status)) continue;
        const results = test.results || [];
        fileCases.push({
          name: [...suiteTitles, spec.title].filter(Boolean).join(' '),
          status,
          durationMs: results.length
            ? results.reduce((total, result) => total + (Number.isFinite(Number(result.duration)) ? Number(result.duration) : 0), 0)
            : null,
          browser: test.projectName || (test.projectId ? String(test.projectId) : 'unknown')
        });
      }
      casesByFile.set(file, fileCases);
    }
    for (const child of suite.suites || []) visit(child, suiteTitles, currentFile);
  }
  report.suites.forEach(suite => visit(suite));

  const manifestLookup = new Map((manifestEntries || []).map(entry => [normalizePlaywrightFile(entry.file, rootDir), entry]));
  const files = Array.from(casesByFile.entries()).map(([file, tests]) => {
    const manifest = manifestLookup.get(file) || null;
    const manifestEvidence = {
      scenarioIds: manifest?.scenarioIds || [],
      requirements: manifest?.requirements || [],
      requirementEvidence: manifest?.requirementEvidence || null,
      componentScope: manifest?.componentScope || [],
      capabilityScope: manifest?.capabilityScope || [],
      transitionScope: manifest?.transitionScope || [],
      layer: manifest?.layer || null,
      defaultLane: manifest?.defaultLane || null,
      setupClassification: manifest?.setupClassification || 'unknown'
    };
    const status = tests.some(test => test.status === 'failed') ? 'failed'
      : tests.some(test => test.status === 'flaky') ? 'flaky'
        : tests.every(test => test.status === 'skipped') ? 'skipped' : 'passed';
    return {
      framework: 'playwright',
      file,
      status,
      durationMs: tests.reduce((total, test) => total + (test.durationMs || 0), 0),
      ...manifestEvidence,
      tests: tests.map(test => ({ ...test, ...manifestEvidence, environment }))
    };
  });
  return mergeCaseEvidence({ lane, environment, evidence: [{ framework: 'playwright', files }] });
}

module.exports = {
  normalizePlaywrightFile,
  mapPlaywrightStatus,
  buildPlaywrightCaseEvidence
};
