const {
  buildTrendReport,
  parseArgs,
  sumCommandResults
} = require('../../scripts/aggregate-test-trends.cjs');
const { validateReportSchema } = require('../../test-support/testReportSchema.js');

describe('test trend report', () => {
  test('uses one schema for lane and bounded Jest reports', () => {
    expect(validateReportSchema({
      schemaVersion: 1,
      lane: 'unit',
      initialStatus: 0,
      diagnosticStatus: null,
      durationMs: 1,
      environment: { node: 'v20.0.0', platform: 'win32' },
      manifestEvidence: {},
      artifactPolicy: {},
      artifacts: {},
      initial: [],
      diagnostic: []
    })).toEqual([]);
    expect(validateReportSchema({
      schemaVersion: 1,
      runner: 'jest-full-bounded',
      initialStatus: 0,
      durationMs: 1,
      projects: ['unit-node'],
      summary: {},
      groups: []
    })).toEqual([]);
    expect(validateReportSchema({ schemaVersion: 1, lane: 'unit' })).not.toEqual([]);
  });

  test('preserves initial gate status while reporting diagnostic retries', () => {
    expect(sumCommandResults({
      durationMs: 150,
      initial: [{ status: 1, durationMs: 100 }],
      diagnostic: [{ status: 0, durationMs: 50 }]
    })).toEqual({
      initialCommands: 1,
      diagnosticCommands: 1,
      retries: 1,
      failedInitialCommands: 1,
      failedDiagnosticCommands: 0,
      durationMs: 150
    });
  });

  test('combines lane, inventory, coverage, contract, and artifact metrics', () => {
    const report = buildTrendReport({
      reports: [{
        schemaVersion: 1,
        lane: 'unit',
        initialStatus: 0,
        durationMs: 42,
        diagnosticStatus: null,
        environment: { node: 'v20.0.0', platform: 'win32' },
        oracle: { policy: 'not-applicable' },
        manifestEvidence: { status: 'passed', schemaVersion: 1, checks: [], manifest: { total: 7 } },
        artifactPolicy: { schemaVersion: 1, retentionDays: 14 },
        artifacts: { laneReport: 'unit.json' },
        initial: [{ status: 0, durationMs: 42 }],
        diagnostic: []
      }],
      inventory: {
        static: {
          files: { jestTestFiles: 3 },
          patterns: { e2eWaitForTimeout: { count: 0 }, e2eSetTimeout: { count: 2 } }
        },
        discovery: { jest: { files: 3 }, playwright: { chromium: { files: 4, tests: 9 } } },
        manifest: { summary: { total: 7, requirementEvidence: { explicitMappings: 5, inferredMappings: 2 } } }
      },
      coverage: { total: { lines: { pct: 80 } } },
      artifactRoots: []
    });

    expect(report.trend).toEqual([expect.objectContaining({
      lane: 'unit',
      initialStatus: 0,
      retries: 0,
      suites: expect.objectContaining({ jest: 3, playwrightTests: 9, manifest: 7 }),
      waitDebt: { waitForTimeout: 0, setTimeout: 2 },
      coverage: { lines: { pct: 80 } },
      contractCoverage: { explicitMappings: 5, inferredMappings: 2 },
      reportContract: expect.objectContaining({
        schemaVersion: 1,
        manifestEvidence: expect.objectContaining({ status: 'passed', schemaVersion: 1 }),
        oracle: { policy: 'not-applicable' },
        artifactPolicy: { schemaVersion: 1, retentionDays: 14 },
        declaredArtifacts: { laneReport: 'unit.json' }
      })
    })]);
  });

  test('parses repeatable report and artifact options', () => {
    expect(parseArgs([
      '--report', 'a.json', '--report', 'b.json', '--inventory', 'i.json',
      '--coverage', 'c.json', '--artifact-root', 'test-results', '--output', 'trend.json'
    ])).toEqual({
      reports: ['a.json', 'b.json'],
      inventory: 'i.json',
      coverage: 'c.json',
      artifactRoots: ['test-results'],
      output: 'trend.json'
    });
  });
});
