'use strict';

const {
  getLaneSpec,
  getDiagnosticSpec,
  parseArgs
} = require('../../scripts/run-test-lane.cjs');

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
