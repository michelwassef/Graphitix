'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseArgs,
  partition,
  childEnvironment,
  writeReport,
  writeCaseEvidence
} = require('../../scripts/run-jest-shards.cjs');
const { buildJestCaseEvidence } = require('../../test-support/jestCaseEvidence.js');
const { buildTestEnvironment } = require('../../test-support/testReportEnvironment.js');

describe('bounded Jest shard runner', () => {
  test('defaults to one file per process for bounded memory use', () => {
    expect(parseArgs([])).toEqual({
      project: 'integration',
      filesPerProcess: 1,
      onlyFailures: false,
      reportFile: null
    });
  });

  test('parses the explicit project and process-size contract', () => {
    expect(parseArgs([
      '--project', 'integration',
      '--files-per-process', '1',
      '--onlyFailures'
    ])).toEqual({
      project: 'integration',
      filesPerProcess: 1,
      onlyFailures: true,
      reportFile: null
    });
  });

  test('accepts an optional machine-readable report path', () => {
    expect(parseArgs(['--report-file', 'artifacts/jest.json'])).toEqual({
      project: 'integration',
      filesPerProcess: 1,
      onlyFailures: false,
      reportFile: 'artifacts/jest.json'
    });
  });

  test('rejects invalid process sizes', () => {
    expect(() => parseArgs(['--files-per-process', '0'])).toThrow();
    expect(() => parseArgs(['--files-per-process', '1.5'])).toThrow();
  });

  test('partitions every discovered file once without oversized groups', () => {
    const files = ['a', 'b', 'c', 'd', 'e'];
    const groups = partition(files, 2);

    expect(groups).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(groups.flat()).toEqual(files);
    expect(Math.max(...groups.map(group => group.length))).toBeLessThanOrEqual(2);
  });

  test('enables teardown enforcement in integration child processes', () => {
    expect(childEnvironment('integration', { NODE_ENV: 'test' })).toMatchObject({
      NODE_ENV: 'test',
      TEST_ENFORCE_INTEGRATION_LEAKS: '1'
    });
    expect(childEnvironment('unit-node', { NODE_ENV: 'test' })).toEqual({ NODE_ENV: 'test' });
  });

  test('writes a readable progress report to the requested path', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-jest-shards-'));
    const reportPath = path.join(directory, 'progress.json');
    const report = {
      state: 'running',
      totalGroups: 4,
      completedGroups: 2,
      failedGroups: []
    };

    try {
      writeReport(reportPath, report);
      expect(JSON.parse(fs.readFileSync(reportPath, 'utf8'))).toEqual(report);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('joins each Jest case outcome to its file-level requirement evidence', () => {
    const evidence = buildJestCaseEvidence({
      lane: 'integration',
      environment: { node: 'v24', platform: 'win32', vendorMode: 'fake' },
      rootDir: path.join('C:', 'repo'),
      results: [{ testResults: [{
        name: path.join('C:', 'repo', '__tests__', 'integration', 'owner.test.js'),
        status: 'passed',
        assertionResults: [
          { ancestorTitles: ['owner'], title: 'isolates tabs', fullName: 'owner isolates tabs', status: 'passed', duration: 4 },
          { ancestorTitles: ['owner'], title: 'restores payload', fullName: 'owner restores payload', status: 'pending' }
        ]
      }] }],
      manifestEntries: [{
        file: '__tests__/integration/owner.test.js',
        scenarioIds: ['OWN.same-type-switching'],
        requirements: [{ id: 'OWN.same-type-switching', label: 'Tab ownership', transition: 'tab-switch' }],
        componentScope: ['scatter'],
        capabilityScope: ['tab-isolation'],
        transitionScope: ['tab-switch'],
        layer: 'app-integration',
        defaultLane: 'integration',
        setupClassification: 'declared-in-suite'
      }]
    });

    expect(evidence.granularity).toEqual({
      outcome: 'individual-test-case',
      requirementMetadata: 'discovered-test-file'
    });
    expect(evidence.summary).toMatchObject({ testCases: 2, passed: 1, pending: 1, unmappedFiles: [] });
    expect(evidence.files[0]).toMatchObject({
      file: '__tests__/integration/owner.test.js',
      scenarioIds: ['OWN.same-type-switching'],
      componentScope: ['scatter'],
      transitionScope: ['tab-switch'],
      tests: [
        { name: 'owner isolates tabs', status: 'passed', durationMs: 4 },
        { name: 'owner restores payload', status: 'pending' }
      ]
    });
  });

  test('writes shard case evidence joined to discovered test metadata', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-jest-case-report-'));
    const reportPath = path.join(directory, 'shards.json');
    const testFile = path.resolve(__dirname, 'jestShardRunner.contract.test.js');
    try {
      const reference = writeCaseEvidence(reportPath, {
        project: 'unit-node',
        environment: buildTestEnvironment('fake'),
        files: [testFile],
        results: [{ testResults: [{
          name: testFile,
          status: 'passed',
          assertionResults: [{ fullName: 'shard case evidence persists', status: 'passed', duration: 1 }]
        }] }]
      });
      const evidence = JSON.parse(fs.readFileSync(path.join(directory, 'shards.cases.json'), 'utf8'));
      expect(reference.file).toContain('shards.cases.json');
      expect(reference.summary).toMatchObject({ testCases: 1, passed: 1, unmappedFiles: [] });
      expect(evidence.files[0].scenarioIds).toContain('GOVERNANCE.case-evidence');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});
