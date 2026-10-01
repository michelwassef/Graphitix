'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const yaml = require('js-yaml');
const { createCoverageMap } = require('istanbul-lib-coverage');
const {
  getLaneSpec,
  getDiagnosticSpec,
  buildArtifactPolicy,
  expectedCaseEvidenceFrameworks,
  buildManifestEvidence,
  getCommandTestFiles,
  selectManifestEntries,
  writeManifestEvidenceArtifacts,
  isPlaywrightCommand,
  shouldContinueAfterCommandFailure,
  parseArgs
} = require('../../scripts/run-test-lane.cjs');
const { STATISTICAL_ORACLE_TESTS } = require('../../test-support/jestLayerManifest.js');
const { validateReportSchema } = require('../../test-support/testReportSchema.js');
const { buildTestEnvironment, resolveVendorMode } = require('../../test-support/testReportEnvironment.js');
const { buildJestCaseEvidence } = require('../../test-support/jestCaseEvidence.js');
const { buildPlaywrightCaseEvidence } = require('../../test-support/playwrightCaseEvidence.js');
const {
  JEST_PROJECTS,
  COVERAGE_PROJECTS,
  SHARDED_PROJECTS,
  mergeProductionSourceCoverage,
  writeAggregateReports,
  writeCaseEvidence: writeCoverageCaseEvidence,
  parseArgs: parseCoverageArgs
} = require('../../scripts/run-coverage.cjs');
const {
  DEFAULT_FILES_PER_PROCESS,
  JEST_PROJECTS: FULL_JEST_PROJECTS,
  PROJECT_FILE_LIMITS,
  parseArgs: parseFullJestArgs,
  getFilesPerProcess,
  buildReport: buildFullJestReport,
  buildFullJestCaseEvidence
} = require('../../scripts/run-full-jest.cjs');

describe('test lane runner', () => {
  test('defines explicit static and Chromium contract lanes', () => {
    expect(getLaneSpec('static').map(command => command.label)).toEqual([
      'lint', 'component-contracts', 'testing-inventory-doc', 'production-bootstrap', 'vendor-provenance', 'test-runtime', 'welcome-assets', 'test-inventory'
    ]);
    expect(getLaneSpec('e2e-contracts-firefox')[0].args).toContain('--project=firefox');
    expect(getLaneSpec('e2e-matrix')[0].args).toEqual(expect.arrayContaining([
      'e2e/workspace/workspace.exercise.spec.js', '--project=chromium'
    ]));
    const statsTestFiles = getLaneSpec('stats')[0].args.filter(argument => /\.test\.js$/i.test(argument));
    expect(statsTestFiles).toEqual(STATISTICAL_ORACLE_TESTS);
    expect(statsTestFiles).not.toContain('__tests__/integration/stats.ui.persistence.restore.test.js');
    expect(statsTestFiles).not.toContain('__tests__/integration/stats.ui.presentation.branches.test.js');
    expect(getLaneSpec('workers')[0].args).toContain('workers');
  });

  test('required oracle workflows install and validate the pinned Python runtime', () => {
    const workflows = [
      { file: '.github/workflows/test-pr-fast.yml', conditional: true },
      { file: '.github/workflows/unit-jest.yml', conditional: false },
      { file: '.github/workflows/jest-nightly-full.yml', conditional: false }
    ];

    workflows.forEach(({ file, conditional }) => {
      const workflow = yaml.safeLoad(fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8'));
      const steps = workflow.jobs.jest.steps;
      const setup = steps.find(step => step.uses === 'actions/setup-python@v7');
      const install = steps.find(step => step.name === 'Install statistical-oracle dependencies');
      const validate = steps.find(step => step.name === 'Validate statistical-oracle runtime');

      expect(setup?.with).toMatchObject({
        'python-version-file': '.python-version',
        'cache-dependency-path': 'requirements-stats.txt'
      });
      expect(setup.with.cache).toBe('pip');
      expect(install?.run).toBe('python -m pip install -r requirements-stats.txt');
      expect(validate?.run).toBe('npm run test:python:check');
      if (conditional) {
        expect(setup.if).toBe("matrix.lane == 'stats'");
        expect(install.if).toBe("matrix.lane == 'stats'");
        expect(validate.if).toBe("matrix.lane == 'stats'");
      }
    });

    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    expect(packageJson.scripts['test:python:check']).toBe('python scripts/check_stats_oracle_runtime.py');
    expect(packageJson.scripts['test:stats']).toContain('npm run test:python:check');
  });

  test('persists verified server provenance for browser lane commands', () => {
    const browserCommand = getLaneSpec('e2e-smoke')[0];
    const staticCommand = getLaneSpec('static')[0];
    expect(isPlaywrightCommand(browserCommand)).toBe(true);
    expect(isPlaywrightCommand(staticCommand)).toBe(false);

    const report = {
      schemaVersion: 1,
      lane: 'e2e-smoke',
      initialStatus: 0,
      diagnosticStatus: null,
      durationMs: 1,
      environment: {
        node: 'v24.0.0',
        platform: 'win32',
        vendorMode: 'committed-browser-assets',
        serverProvenance: [{
          command: 'playwright-smoke',
          reportFile: 'artifacts/test-reports/server-provenance.json',
          status: 'verified',
          baseUrl: 'http://127.0.0.1:4173',
          indexHash: 'abc',
          sourceRoot: 'C:/repo',
          serverCommand: 'node scripts/e2e-server.cjs --port 4173'
        }]
      },
      initial: [],
      diagnostic: [],
      manifestEvidence: {
        coveredScenarioIds: [],
        omittedScenarioIds: [],
        skipDeclarations: { count: 0, entries: [] }
      },
      artifactPolicy: {},
      artifacts: {}
    };
    expect(validateReportSchema(report)).toEqual([]);
    expect(validateReportSchema({
      ...report,
      environment: {
        ...report.environment,
        serverProvenance: [{
          command: 'playwright-smoke',
          reportFile: 'artifacts/test-reports/server-provenance.json',
          status: 'verified'
        }]
      }
    })).toContain('lane report has incomplete verified server provenance entry: 0');
  });

  test('declares vendor mode in every runner environment', () => {
    expect(resolveVendorMode('unit')).toBe('fake');
    expect(resolveVendorMode('vendor')).toBe('real-npm');
    expect(resolveVendorMode('e2e-smoke')).toBe('committed-browser-assets');
    expect(resolveVendorMode('full-jest')).toBe('fake');
    expect(resolveVendorMode('full')).toBe('mixed');
    expect(buildTestEnvironment('fake')).toEqual(expect.objectContaining({
      node: process.version,
      platform: process.platform,
      vendorMode: 'fake'
    }));
  });

  test('package Chromium shortcut selects only the Chromium lane', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    expect(packageJson.scripts['test:full:chromium']).toContain('--lane full-chromium');
    expect(packageJson.scripts['test:full:jest']).toContain('--lane full-jest');
    expect(getLaneSpec('full-jest')[0].args[0]).toMatch(/run-full-jest\.cjs$/);
    expect(getLaneSpec('full')[0].args[0]).toMatch(/run-full-jest\.cjs$/);
  });

  test('PowerShell full wrapper delegates status and reports to the canonical Node lane', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'));
    const wrapper = fs.readFileSync(path.resolve(__dirname, '../../scripts/run-full-tests.ps1'), 'utf8');
    expect(packageJson.scripts.test).toBe('jest');
    expect(packageJson.scripts['test:full']).toContain('scripts/run-full-tests.ps1');
    expect(wrapper).toContain('& node scripts/run-test-lane.cjs --lane full --json --report-file $laneReport');
    expect(wrapper).toContain('$runner = Get-Content $runnerJson -Raw | ConvertFrom-Json');
    expect(wrapper).toContain('exit $initialStatus');
    expect(wrapper).not.toContain('exit $diagnosticStatus');
    expect(wrapper).toContain('Lane report: $laneReport');
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
      groups: [{ files: ['a.test.js'], status: 0, durationMs: 1 }],
      caseResults: [{ testResults: [{ name: 'a.test.js' }] }]
    }], Date.now());
    expect(report.runner).toBe('jest-full-bounded');
    expect(report.environment.vendorMode).toBe('fake');
    expect(report.summary).toMatchObject({ projects: 1, files: 1, groups: 1, failedGroups: 0 });
    expect(report.failedGroups).toEqual([]);
    expect(report.projectsReport[0]).not.toHaveProperty('caseResults');
  });

  test('full-Jest report joins bounded shard cases to the canonical manifest', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const testFile = path.resolve(__dirname, 'testLaneRunner.contract.test.js');
    const evidence = buildFullJestCaseEvidence([{
      project: 'unit-node',
      groups: [{ files: [path.relative(rootDir, testFile).replace(/\\/g, '/')] }],
      caseResults: [{ testResults: [{
        name: testFile,
        status: 'passed',
        assertionResults: [{ fullName: 'case evidence joins to a requirement', status: 'passed', duration: 1 }]
      }] }]
    }]);

    expect(evidence.summary).toMatchObject({ testCases: 1, passed: 1, unmappedFiles: [] });
    expect(evidence.files[0].scenarioIds).toContain('GOVERNANCE.case-evidence');

    const unknownOutcome = buildFullJestCaseEvidence([{
      project: 'unit-node',
      groups: [{ files: [path.relative(rootDir, testFile).replace(/\\/g, '/')] }],
      caseResults: [{ testResults: [{
        name: testFile,
        status: 'passed',
        assertionResults: [{ fullName: 'unknown status is rejected', status: 'unrecognized' }]
      }] }]
    }]);
    expect(unknownOutcome.files[0].tests[0].status).toBe('unknown');
    expect(validateReportSchema(unknownOutcome).some(failure => failure.includes('invalid test outcome'))).toBe(true);
  });

  test('coverage declares its source projects and writes one aggregate', () => {
    expect(parseCoverageArgs(['--case-evidence-file', 'artifacts/test-reports/coverage.cases.json']))
      .toEqual({ caseEvidenceFile: 'artifacts/test-reports/coverage.cases.json' });
    expect(JEST_PROJECTS).toEqual([
      'architecture', 'statistical-oracle', 'unit-node', 'dom-unit', 'integration', 'workers'
    ]);
    expect(COVERAGE_PROJECTS).toEqual([
      'architecture', 'statistical-oracle', 'unit-node', 'dom-unit', 'integration', 'workers'
    ]);
    expect(COVERAGE_PROJECTS).toEqual(JEST_PROJECTS);
    expect(SHARDED_PROJECTS).toEqual([
      'architecture', 'statistical-oracle', 'integration'
    ]);
    const coverageBaseline = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, '../../test-support/coverage-baseline.json'),
      'utf8'
    ));
    expect(coverageBaseline.scope).toMatchObject({
      projects: COVERAGE_PROJECTS,
      excludedProjects: []
    });
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
        excludedProjects: []
      };
      const summary = writeAggregateReports(coverageMap, directory, metadata);
      expect(summary.statements.pct).toBe(100);
      const report = JSON.parse(fs.readFileSync(path.join(directory, 'coverage-summary.json'), 'utf8'));
      expect(report.total.statements.pct).toBe(100);
      expect(report.schemaVersion).toBe(1);
      expect(report.metadata).toEqual(metadata);
      expect(fs.existsSync(path.join(directory, 'coverage-final.json'))).toBe(true);
      const projectDirectory = path.join(directory, 'projects', 'unit-node');
      writeAggregateReports(coverageMap, projectDirectory, {
        provider: 'v8',
        project: 'unit-node',
        sourceDenominator: 'files observed by this Jest project'
      });
      const projectReport = JSON.parse(fs.readFileSync(path.join(projectDirectory, 'coverage-summary.json'), 'utf8'));
      expect(projectReport.metadata.project).toBe('unit-node');
      expect(fs.existsSync(path.join(projectDirectory, 'coverage-final.json'))).toBe(true);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('coverage runs its trend check after test failures without clearing failure status', () => {
    expect(getLaneSpec('coverage').map(command => command.label)).toEqual([
      'jest-coverage-sharded', 'coverage-trend'
    ]);
    expect(shouldContinueAfterCommandFailure('coverage')).toBe(true);
    expect(shouldContinueAfterCommandFailure('integration')).toBe(false);
  });

  test('coverage aggregates only production source files', () => {
    const rootDir = path.resolve(__dirname, '../../');
    const sourceFile = path.join(rootDir, 'js', 'coverage-fixture.js');
    const srcFile = path.join(rootDir, 'src', 'coverage-fixture.js');
    const supportFile = path.join(rootDir, 'test-support', 'coverage-fixture.js');
    const makeCoverage = file => ({
      path: file,
      statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } } },
      fnMap: {},
      branchMap: {},
      s: { 0: 1 },
      f: {},
      b: {}
    });
    const aggregate = createCoverageMap({});

    mergeProductionSourceCoverage(aggregate, {
      [sourceFile]: makeCoverage(sourceFile),
      [srcFile]: makeCoverage(srcFile),
      [supportFile]: makeCoverage(supportFile)
    }, rootDir);

    expect(aggregate.files().sort()).toEqual([sourceFile, srcFile].sort());
  });

  test('coverage report preserves per-test case evidence without another test run', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-coverage-case-evidence-'));
    const outputPath = path.join(directory, 'coverage.cases.json');
    const testFile = path.resolve(__dirname, 'testLaneRunner.contract.test.js');
    try {
      expect(writeCoverageCaseEvidence(outputPath, [{ testResults: [{
        name: testFile,
        status: 'passed',
        assertionResults: [{ fullName: 'coverage preserves case mapping', status: 'passed', duration: 1 }]
      }] }])).toEqual([]);
      const evidence = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      expect(evidence.lane).toBe('coverage');
      expect(evidence.summary).toMatchObject({ testCases: 1, passed: 1, unmappedFiles: [] });
      expect(evidence.files[0].scenarioIds).toContain('GOVERNANCE.case-evidence');
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

  test('lane reports carry compact manifest and discovery evidence', () => {
    const evidence = buildManifestEvidence({
      schemaVersion: 1,
      checks: [],
      static: {
        files: { jestTestFiles: 2 },
        patterns: {
          fixedScratchPaths: { count: 0 },
          jestSourceReads: { count: 4 }
        },
        organization: { oversized: [{ file: 'e2e/example.spec.js' }] }
      },
      discovery: {
        jest: { files: 2 },
        playwright: { chromium: { tests: 3, files: 1 }, firefox: { status: 'deferred' } }
      },
      manifest: { summary: { total: 3, requirementEvidence: { explicitMappings: 1 } } }
    });

    expect(evidence).toMatchObject({
      status: 'passed',
      schemaVersion: 1,
      manifest: { total: 3 },
      patterns: { fixedScratchPaths: 0, sourceReads: 4, oversizedSuites: 1 },
      discovery: { jestFiles: 2, playwrightChromium: { tests: 3, files: 1 } }
    });
  });

  test('lane reports identify scenarios omitted by reduced commands', () => {
    const inventory = {
      manifest: {
        entries: [
          { file: 'e2e/one.spec.js', framework: 'playwright', defaultLane: 'full-chromium', scenarioIds: ['OWN.one'] },
          { file: 'e2e/two.spec.js', framework: 'playwright', defaultLane: 'full-chromium', scenarioIds: ['OWN.two'] },
          { file: '__tests__/unit/one.test.js', framework: 'jest', defaultLane: 'unit', scenarioIds: ['UNIT.one'] }
        ],
        summary: { total: 3 }
      },
      static: {
        patterns: { skipDeclarations: { count: 0, files: [] } },
        files: {}
      },
      discovery: {}
    };
    const commands = [{ args: ['e2e/one.spec.js'] }];
    expect(Array.from(getCommandTestFiles(commands))).toEqual(['e2e/one.spec.js']);
    expect(selectManifestEntries(inventory, 'e2e-smoke', commands)).toHaveLength(1);
    expect(buildManifestEvidence(inventory, 'e2e-smoke', commands)).toMatchObject({
      coveredScenarioIds: ['OWN.one'],
      omittedScenarioIds: ['OWN.two', 'UNIT.one'],
      skipDeclarations: { count: 0, entries: [] }
    });
  });

  test('lane artifact policy requires the machine report and tolerates optional diagnostics', () => {
    expect(buildArtifactPolicy('unit', true)).toEqual(expect.objectContaining({
      schemaVersion: 1,
      retentionDays: 14,
      required: ['laneReport', 'manifest', 'skipLedger', 'caseEvidence'],
      optional: [],
      missingArtifactPolicy: { required: 'error', optional: 'ignore' }
    }));
    expect(buildArtifactPolicy('e2e-contracts', true).optional).toEqual(expect.arrayContaining([
      'playwright-report', 'test-results', 'artifacts/perf-summaries'
    ]));
    expect(buildArtifactPolicy('coverage', true).optional).toEqual(expect.arrayContaining([
      'artifacts/perf-summaries', 'coverage'
    ]));
    expect(buildArtifactPolicy('unit')).toMatchObject({ required: [] });
  });

  test('case-evidence requirements distinguish bounded Jest from browser lanes', () => {
    expect(expectedCaseEvidenceFrameworks('full-jest')).toEqual(['jest']);
    expect(expectedCaseEvidenceFrameworks('full-chromium')).toEqual(['playwright']);
    expect(expectedCaseEvidenceFrameworks('full')).toEqual(['jest', 'playwright']);
    expect(expectedCaseEvidenceFrameworks('static')).toEqual([]);
  });

  test('publishes full manifest and skip-ledger sidecars beside a lane report', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-lane-evidence-'));
    const reportPath = path.join(directory, 'unit.json');
    try {
      const artifacts = writeManifestEvidenceArtifacts(reportPath, 'unit', {
        manifest: { summary: { total: 1 }, entries: [{ id: 'file:unit.test.js' }] }
      }, {
        skipDeclarations: { entries: [{ file: 'e2e/example.spec.js', line: 1 }] }
      });
      expect(artifacts.manifest).toEqual([expect.stringContaining('.manifest.json')]);
      expect(artifacts.skipLedger).toEqual([expect.stringContaining('.skips.json')]);
      expect(JSON.parse(fs.readFileSync(path.join(directory, 'unit.manifest.json'), 'utf8')).entries).toHaveLength(1);
      expect(JSON.parse(fs.readFileSync(path.join(directory, 'unit.skips.json'), 'utf8')).entries).toHaveLength(1);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  test('validates individual-case evidence joins and requires it for Jest lanes', () => {
    const evidence = {
      schemaVersion: 1,
      framework: 'jest',
      frameworks: ['jest'],
      expectedFrameworks: ['jest'],
      missingFrameworks: [],
      lane: 'unit',
      environment: { node: 'v24.0.0', platform: 'linux', vendorMode: 'fake' },
      granularity: { outcome: 'individual-test-case', requirementMetadata: 'discovered-test-file' },
      summary: { files: 1, testCases: 1, passed: 1, failed: 0, pending: 0, skipped: 0, todo: 0, disabled: 0, flaky: 0, unknown: 0, unmappedFiles: [] },
      files: [{
        framework: 'jest',
        file: '__tests__/unit/example.test.js',
        status: 'passed',
        scenarioIds: ['GOVERNANCE.lane-runner'],
        requirements: [{
          id: 'GOVERNANCE.lane-runner',
          label: 'Lane status',
          capability: 'test-governance',
          evidence: 'runner-status-contract',
          transition: 'contract-transition',
          metadataSource: 'explicit'
        }],
        requirementEvidence: { explicit: 1, inferred: 0, critical: [] },
        componentScope: [],
        capabilityScope: ['test-governance'],
        transitionScope: ['contract-transition'],
        layer: 'unit-node',
        defaultLane: 'unit',
        setupClassification: 'declared-in-suite',
        tests: [{
          name: 'preserves requirement metadata',
          status: 'passed',
          durationMs: 1,
          scenarioIds: ['GOVERNANCE.lane-runner'],
          requirements: [{
            id: 'GOVERNANCE.lane-runner',
            label: 'Lane status',
            capability: 'test-governance',
            evidence: 'runner-status-contract',
            transition: 'contract-transition',
            metadataSource: 'explicit'
          }],
          requirementEvidence: { explicit: 1, inferred: 0, critical: [] },
          componentScope: [],
          capabilityScope: ['test-governance'],
          transitionScope: ['contract-transition'],
          layer: 'unit-node',
          defaultLane: 'unit',
          setupClassification: 'declared-in-suite',
          environment: { node: 'v24.0.0', platform: 'linux', vendorMode: 'fake' }
        }]
      }]
    };
    expect(validateReportSchema(evidence)).toEqual([]);
    expect(validateReportSchema({ ...evidence, summary: { ...evidence.summary, passed: 0 } }))
      .toContain('Case evidence summary differs for passed outcomes');
    const unknownOutcome = {
      ...evidence,
      summary: { ...evidence.summary, passed: 0, unknown: 1 },
      files: [{ ...evidence.files[0], tests: [{ ...evidence.files[0].tests[0], status: 'unknown' }] }]
    };
    expect(validateReportSchema(unknownOutcome))
      .toContain('Case evidence has an invalid test outcome in __tests__/unit/example.test.js');
    expect(validateReportSchema({
      ...evidence,
      summary: { ...evidence.summary, testCases: 0, passed: 0 },
      files: [{ ...evidence.files[0], tests: [] }]
    })).toContain('Case evidence file has no individual test outcomes: __tests__/unit/example.test.js');
    expect(validateReportSchema({
      ...evidence,
      frameworks: [],
      summary: { ...evidence.summary, files: 0, testCases: 0, passed: 0 },
      files: []
    })).toContain('Case evidence contains no test files');
    const [file] = evidence.files;
    expect(validateReportSchema({
      ...evidence,
      files: [{ ...file, tests: [{ ...file.tests[0], scenarioIds: [] }] }]
    }).some(failure => failure.includes('test metadata differs from its discovered file'))).toBe(true);
    expect(validateReportSchema({
      ...evidence,
      files: [{ ...file, tests: [{ ...file.tests[0], environment: { ...evidence.environment, vendorMode: 'real-npm' } }] }]
    }).some(failure => failure.includes('test environment differs from its lane'))).toBe(true);
    expect(buildArtifactPolicy('integration', true).required).toContain('caseEvidence');
    expect(buildArtifactPolicy('static', true).required).not.toContain('caseEvidence');
  });

  test('joins Chromium Playwright outcomes to the same requirement manifest', () => {
    const evidence = buildPlaywrightCaseEvidence({
      lane: 'e2e-contracts',
      environment: { node: 'v24.0.0', platform: 'linux', vendorMode: 'committed-browser-assets' },
      rootDir: 'C:/repo',
      report: {
        suites: [{
          title: 'ownership/example.spec.js',
          file: 'ownership/example.spec.js',
          specs: [{
            title: 'switching preserves the owner',
            file: 'ownership/example.spec.js',
            ok: true,
            tests: [{
              status: 'expected',
              projectName: 'chromium',
              results: [{ status: 'passed', duration: 12 }]
            }]
          }]
        }]
      },
      manifestEntries: [{
        file: 'e2e/ownership/example.spec.js',
        scenarioIds: ['OWN.same-type-switching'],
        requirements: [{
          id: 'OWN.same-type-switching',
          label: 'Tab ownership',
          capability: 'tab-isolation',
          evidence: 'same-type-switching-contract',
          transition: 'tab-switch',
          metadataSource: 'explicit'
        }],
        requirementEvidence: { explicit: 1, inferred: 0, critical: [] },
        componentScope: ['scatter'],
        capabilityScope: ['tab-isolation'],
        transitionScope: ['tab-switch'],
        layer: 'browser-e2e',
        defaultLane: 'e2e-contracts',
        setupClassification: 'ui'
      }]
    });

    expect(evidence.framework).toBe('playwright');
    expect(evidence.summary).toMatchObject({ testCases: 1, passed: 1, unmappedFiles: [] });
    expect(evidence.files[0]).toMatchObject({
      file: 'e2e/ownership/example.spec.js',
      scenarioIds: ['OWN.same-type-switching'],
      tests: [{
        name: 'switching preserves the owner',
        status: 'passed',
        browser: 'chromium',
        durationMs: 12,
        scenarioIds: ['OWN.same-type-switching'],
        componentScope: ['scatter'],
        transitionScope: ['tab-switch'],
        environment: { vendorMode: 'committed-browser-assets' }
      }]
    });
  });

  test('joins Jest case outcomes directly to discovered-file requirement and environment metadata', () => {
    const evidence = buildJestCaseEvidence({
      lane: 'unit',
      environment: { node: 'v24.0.0', platform: 'win32', vendorMode: 'fake' },
      rootDir: 'C:/repo',
      results: [{ testResults: [{
        name: 'C:/repo/__tests__/unit/example.test.js',
        status: 'passed',
        startTime: 10,
        endTime: 20,
        assertionResults: [{ fullName: 'case verifies a requirement', status: 'passed', duration: 5 }]
      }] }],
      manifestEntries: [{
        file: '__tests__/unit/example.test.js',
        scenarioIds: ['GOVERNANCE.case-evidence'],
        requirements: [{
          id: 'GOVERNANCE.case-evidence',
          label: 'Per-case evidence',
          capability: 'test-governance',
          evidence: 'per-case-manifest-evidence',
          transition: 'test-report',
          metadataSource: 'explicit'
        }],
        requirementEvidence: { explicit: 1, inferred: 0, critical: [] },
        componentScope: ['*'],
        capabilityScope: ['test-governance'],
        transitionScope: ['test-report'],
        layer: 'unit-node',
        defaultLane: 'unit',
        setupClassification: 'declared-in-suite'
      }]
    });

    expect(evidence.files[0].tests[0]).toMatchObject({
      name: 'case verifies a requirement',
      status: 'passed',
      scenarioIds: ['GOVERNANCE.case-evidence'],
      requirements: [{ id: 'GOVERNANCE.case-evidence', label: 'Per-case evidence' }],
      componentScope: ['*'],
      transitionScope: ['test-report'],
      environment: { node: 'v24.0.0', vendorMode: 'fake' }
    });
    expect(validateReportSchema(evidence)).toEqual([]);
  });

  test('nightly workflows publish trend reports beside their lane reports', () => {
    const workflows = [
      ['.github/workflows/e2e-nightly-feature-matrix.yml', 'e2e-trend.json'],
      ['.github/workflows/e2e-nightly-full.yml', 'full-chromium-trend.json'],
      ['.github/workflows/jest-nightly-full.yml', 'full-jest-nightly-trend.json'],
      ['.github/workflows/unit-jest.yml', 'coverage-trend.json']
    ];
    for (const [file, trendFile] of workflows) {
      const source = fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8');
      expect(source).toContain('aggregate-test-trends.cjs');
      expect(source).toContain(trendFile);
      expect(source).toContain('retention-days: 14');
    }
  });

  test('CI uploads the case-evidence sidecar for every reported test lane', () => {
    const expectations = [
      ['.github/workflows/test-pr-fast.yml', '${{ matrix.lane }}.cases.json'],
      ['.github/workflows/e2e-cross-browser-contracts.yml', 'e2e-contracts.cases.json'],
      ['.github/workflows/e2e-nightly-feature-matrix.yml', 'e2e-matrix.cases.json'],
      ['.github/workflows/e2e-nightly-feature-matrix.yml', 'e2e-owner-order.cases.json'],
      ['.github/workflows/e2e-nightly-full.yml', 'full-chromium.cases.json'],
      ['.github/workflows/jest-nightly-full.yml', 'full-jest-nightly.cases.json'],
      ['.github/workflows/unit-jest.yml', 'coverage.cases.json']
    ];
    for (const [file, artifact] of expectations) {
      expect(fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8')).toContain(artifact);
    }
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
