'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseArgs,
  partition,
  childEnvironment,
  writeReport
} = require('../../scripts/run-jest-shards.cjs');

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
});
