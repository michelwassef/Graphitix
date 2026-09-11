'use strict';

const {
  parseArgs,
  partition
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
});
