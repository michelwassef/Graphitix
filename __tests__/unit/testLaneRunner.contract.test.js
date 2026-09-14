'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCoverageMap } = require('istanbul-lib-coverage');
const {
  getLaneSpec,
  getDiagnosticSpec,
  parseArgs
} = require('../../scripts/run-test-lane.cjs');
const {
  JEST_PROJECTS,
  COVERAGE_PROJECTS,
  SHARDED_PROJECTS,
  writeAggregateReports
} = require('../../scripts/run-coverage.cjs');
const {
  DEFAULT_FILES_PER_PROCESS,
  JEST_PROJECTS: FULL_JEST_PROJECTS,
  PROJECT_FILE_LIMITS,
  parseArgs: parseFullJestArgs,
  getFilesPerProcess,
  buildReport: buildFullJestReport
} = require('../../scripts/run-full-jest.cjs');

describe('test lane runner', () => {
  test('defines explicit static and Chromium contract lanes', () => {
    expect(getLaneSpec('static').map(command => command.label)).toEqual([
      'lint', 'component-contracts', 'testing-inventory-doc', 'production-bootstrap', 'vendor-provenance', 'test-runtime', 'welcome-assets', 'test-inventory'
    ]);
    expect(getLaneSpec('e2e-contracts-firefox')[0].args).toContain('--project=firefox');
    expect(getLaneSpec('stats')[0].args).toEqual(expect.arrayContaining([
      '__tests__/stats.differential.python.test.js',
      '__tests__/stats.ui.persistence.restore.test.js'
    ]));
    expect(getLaneSpec('workers')[0].args).toContain('workers');
  });

  test('package Chromium shortcut selects only the Chromium lane', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    expect(packageJson.scripts['test:full:chromium']).toContain('--lane full-chromium');
    expect(packageJson.scripts['test:full:jest']).toContain('--lane full-jest');
    expect(getLaneSpec('full-jest')[0].args[0]).toMatch(/run-full-jest\.cjs$/);
    expect(getLaneSpec('full')[0].args[0]).toMatch(/run-full-jest\.cjs$/);
  });

  test('full Jest keeps every project in bounded fresh processes', () => {
    expect(FULL_JEST_PROJECTS).toEqual(JEST_PROJECTS);
    expect(DEFAULT_FILES_PER_PROCESS).toBeGreaterThan(0);
    expect(PROJECT_FILE_LIMITS.integration).toBe(1);
    expect(getFilesPerProcess('integration', DEFAULT_FILES_PER_PROCESS)).toBe(1);
    expect(parseFullJestArgs([])).toMatchObject({
      filesPerProcess: DEFAULT_FILES_PER_PROCESS,
      onlyFailures: false,
      reportFile: null
    });
    const report = buildFullJestReport({
      filesPerProcess: DEFAULT_FILES_PER_PROCESS,
      onlyFailures: false
    }, [{
      project: 'unit-node',
      initialStatus: 0,
      groups: [{ files: ['a.test.js'], status: 0, durationMs: 1 }]
    }], Date.now());
    expect(report.runner).toBe('jest-full-bounded');
    expect(report.summary).toMatchObject({ projects: 1, files: 1, groups: 1, failedGroups: 0 });
    expect(report.failedGroups).toEqual([]);
  });

  test('coverage declares its source projects and writes one aggregate', () => {
    expect(JEST_PROJECTS).toEqual([
      'architecture', 'statistical-oracle', 'unit-node', 'dom-unit', 'integration', 'workers'
    ]);
    expect(COVERAGE_PROJECTS).toEqual([
      'architecture', 'statistical-oracle', 'unit-node', 'dom-unit', 'workers'
    ]);
    expect(SHARDED_PROJECTS).toEqual([
      'architecture', 'statistical-oracle'
    ]);
    const coverageMap = createCoverageMap({
      'js/example.js': {
        path: 'js/example.js',
        statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } } },
        fnMap: {},
        branchMap: {},
        s: { 0: 1 },
        f: {},
        b: {}
      }
    });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-coverage-contract-'));
    try {
      const metadata = {
        provider: 'v8',
        projects: COVERAGE_PROJECTS,
        excludedProjects: ['integration']
      };
      const summary = writeAggregateReports(coverageMap, directory, metadata);
      expect(summary.statements.pct).toBe(100);
      const report = JSON.parse(fs.readFileSync(path.join(directory, 'coverage-summary.json'), 'utf8'));
      expect(report.total.statements.pct).toBe(100);
      expect(report.schemaVersion).toBe(1);
      expect(report.metadata).toEqual(metadata);
      expect(fs.existsSync(path.join(directory, 'coverage-final.json'))).toBe(true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('diagnostic retry remains a separate command with no green override', () => {
    const retry = getDiagnosticSpec('unit');
    expect(retry.label).toBe('jest-unit-diagnostic-retry');
    expect(retry.args).toEqual(expect.arrayContaining(['--onlyFailures', '--runInBand']));
    expect(getDiagnosticSpec('architecture').args).toEqual(expect.arrayContaining([
      '--selectProjects', 'architecture', '--onlyFailures', '--runInBand'
    ]));
    expect(getDiagnosticSpec('stats').args).toEqual(expect.arrayContaining([
      '--selectProjects', 'statistical-oracle', '--onlyFailures', '--runInBand'
    ]));
    expect(getDiagnosticSpec('integration').args).toEqual(expect.arrayContaining([
      '--project', 'integration', '--files-per-process', '1', '--onlyFailures', '--runInBand'
    ]));
    expect(getDiagnosticSpec('static')).toBeNull();
  });

  test('parses only explicit lane options', () => {
    expect(parseArgs(['--lane', 'unit', '--diagnostic-retry', '--json'])).toEqual({
      lane: 'unit',
      options: { diagnosticRetry: true, json: true, reportFile: null }
    });

    expect(parseArgs(['--lane', 'unit', '--report-file', 'artifacts/unit.json'])).toEqual({
      lane: 'unit',
      options: { diagnosticRetry: false, json: false, reportFile: 'artifacts/unit.json' }
    });
  });
});
