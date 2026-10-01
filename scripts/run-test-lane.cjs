'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { assertReportSchema, validateCaseEvidence } = require('../test-support/testReportSchema.js');
const { buildTestEnvironment, resolveVendorMode } = require('../test-support/testReportEnvironment.js');
const { STATISTICAL_ORACLE_TESTS } = require('../test-support/jestLayerManifest.js');
const { buildJestCaseEvidence, mergeCaseEvidence } = require('../test-support/jestCaseEvidence.js');
const { buildPlaywrightCaseEvidence } = require('../test-support/playwrightCaseEvidence.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const JEST_CLI = path.join(ROOT_DIR, 'node_modules', 'jest', 'bin', 'jest.js');
const JEST_SHARD_RUNNER = path.join(ROOT_DIR, 'scripts', 'run-jest-shards.cjs');
const FULL_JEST_RUNNER = path.join(ROOT_DIR, 'scripts', 'run-full-jest.cjs');
const PLAYWRIGHT_CLI = path.join(ROOT_DIR, 'node_modules', '@playwright', 'test', 'cli.js');
const ARTIFACT_RETENTION_DAYS = 14;

function nodeCommand(args, label) {
  return { label, executable: process.execPath, args };
}

function npmCommand(args, label) {
  if (process.platform === 'win32') {
    return {
      label,
      executable: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', ...args]
    };
  }
  return {
    label,
    executable: 'npm',
    args
  };
}

function isPlaywrightCommand(command) {
  return Array.isArray(command?.args) && command.args.includes(PLAYWRIGHT_CLI);
}

function readServerProvenance(file) {
  if (!file || !fs.existsSync(file)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { status: 'unavailable', error: error.message };
  }
}

function withJsonSuffix(file, suffix) {
  return /\.json$/i.test(file) ? file.replace(/\.json$/i, suffix) : `${file}${suffix}`;
}

function getReportFileArgument(args = []) {
  const index = args.indexOf('--report-file');
  return index >= 0 ? String(args[index + 1] || '') : null;
}

function getCaseEvidenceFileArgument(args = []) {
  const index = args.indexOf('--case-evidence-file');
  return index >= 0 ? String(args[index + 1] || '') : null;
}

const LANE_SPECS = Object.freeze({
  static: Object.freeze([
    npmCommand(['run', 'lint'], 'lint'),
    npmCommand(['run', 'docs:component-contracts:check'], 'component-contracts'),
    npmCommand(['run', 'docs:testing-inventory:check'], 'testing-inventory-doc'),
    npmCommand(['run', 'test:bootstrap:check'], 'production-bootstrap'),
    npmCommand(['run', 'test:vendor:check'], 'vendor-provenance'),
    npmCommand(['run', 'test:runtime:check'], 'test-runtime'),
    npmCommand(['run', 'assets:welcome-examples:check'], 'welcome-assets'),
    nodeCommand([path.join(ROOT_DIR, 'scripts', 'test-inventory.cjs'), '--check'], 'test-inventory')
  ]),
  unit: Object.freeze([nodeCommand([JEST_CLI, '--selectProjects', 'unit-node'], 'jest-unit')]),
  dom: Object.freeze([nodeCommand([JEST_CLI, '--selectProjects', 'dom-unit'], 'jest-dom')]),
  architecture: Object.freeze([nodeCommand([JEST_CLI, '--selectProjects', 'architecture'], 'jest-architecture')]),
  integration: Object.freeze([nodeCommand([JEST_SHARD_RUNNER, '--project', 'integration', '--files-per-process', '1'], 'jest-integration-sharded')]),
  stats: Object.freeze([nodeCommand([
    JEST_CLI, '--selectProjects', 'statistical-oracle', '--runInBand', '--runTestsByPath', ...STATISTICAL_ORACLE_TESTS
  ], 'jest-statistical-smoke')]),
  workers: Object.freeze([nodeCommand([JEST_CLI, '--selectProjects', 'workers'], 'jest-workers')]),
  vendor: Object.freeze([nodeCommand([
    JEST_CLI, '--selectProjects', 'unit-node', '--runTestsByPath',
    path.join(ROOT_DIR, '__tests__', 'unit', 'vendorRuntime.smoke.test.js')
  ], 'jest-real-vendor')]),
  'e2e-smoke': Object.freeze([nodeCommand([
    PLAYWRIGHT_CLI, 'test', 'e2e/workspace/workspace.smoke.spec.js', '--project=chromium', '--workers=1'
  ], 'playwright-smoke')]),
  'e2e-contracts': Object.freeze([nodeCommand([
    PLAYWRIGHT_CLI, 'test', 'e2e/workspace/workspace.smoke.spec.js', 'e2e/aggrid/aggrid.paste.spec.js',
    'e2e/workspace/config-panel.fieldset-containment.spec.js',
    'e2e/workspace/style-sync.contract.spec.js', 'e2e/workspace/unsaved-decisions.contract.spec.js',
    'e2e/workspace/tab-reorder.contract.spec.js',
    'e2e/cross-component/cross-browser.feature-matrix.spec.js', 'e2e/stats/stats.same-component-isolation-restore.contract.spec.js',
    'e2e/stats/stats.reopen-presence.contract.spec.js', 'e2e/stats/stats.async-owner-completion.contract.spec.js',
    'e2e/diagnostics/vendor.runtime.smoke.spec.js', '--project=chromium'
  ], 'playwright-contracts-chromium')]),
  'e2e-contracts-firefox': Object.freeze([nodeCommand([
    PLAYWRIGHT_CLI, 'test', 'e2e/workspace/workspace.smoke.spec.js', 'e2e/aggrid/aggrid.paste.spec.js',
    'e2e/cross-component/cross-browser.feature-matrix.spec.js', 'e2e/stats/stats.same-component-isolation-restore.contract.spec.js',
    'e2e/stats/stats.reopen-presence.contract.spec.js', 'e2e/stats/stats.async-owner-completion.contract.spec.js',
    'e2e/diagnostics/vendor.runtime.smoke.spec.js', '--project=firefox'
  ], 'playwright-contracts-firefox')]),
  'e2e-matrix': Object.freeze([nodeCommand([
    PLAYWRIGHT_CLI, 'test', 'e2e/workspace/workspace.exercise.spec.js', '--project=chromium'
  ], 'playwright-feature-matrix')]),
  'e2e-owner-order': Object.freeze([nodeCommand([
    PLAYWRIGHT_CLI, 'test', 'e2e/ownership/component.owner-order.repeated.spec.js',
    '--project=chromium', '--workers=1', '--repeat-each=2'
  ], 'playwright-repeated-owner-order')]),
  'full-jest': Object.freeze([nodeCommand([
    FULL_JEST_RUNNER,
    '--report-file', path.join(ROOT_DIR, 'artifacts', 'test-reports', 'full-jest-bounded.json')
  ], 'jest-full-bounded')]),
  coverage: Object.freeze([nodeCommand([
    path.join(ROOT_DIR, 'scripts', 'run-coverage.cjs')
  ], 'jest-coverage-sharded'), nodeCommand([
    path.join(ROOT_DIR, 'scripts', 'check-coverage-trend.cjs')
  ], 'coverage-trend')]),
  'full-chromium': Object.freeze([nodeCommand([PLAYWRIGHT_CLI, 'test', '--project=chromium'], 'playwright-full-chromium')]),
  'full-firefox': Object.freeze([nodeCommand([PLAYWRIGHT_CLI, 'test', '--project=firefox'], 'playwright-full-firefox')]),
  full: Object.freeze([
    nodeCommand([
      FULL_JEST_RUNNER,
      '--report-file', path.join(ROOT_DIR, 'artifacts', 'test-reports', 'full-jest-bounded.json')
    ], 'jest-full-bounded'),
    nodeCommand([PLAYWRIGHT_CLI, 'test', '--project=chromium'], 'playwright-full-chromium')
  ])
});

const RETRY_APPENDIX = Object.freeze({
  unit: ['--onlyFailures', '--runInBand'],
  dom: ['--onlyFailures', '--runInBand'],
  architecture: ['--onlyFailures', '--runInBand'],
  integration: ['--onlyFailures', '--runInBand'],
  stats: ['--onlyFailures', '--runInBand'],
  workers: ['--onlyFailures', '--runInBand'],
  'e2e-smoke': ['--last-failed', '--workers=1'],
  'e2e-contracts': ['--last-failed', '--workers=1'],
  'e2e-contracts-firefox': ['--last-failed', '--workers=1'],
  'e2e-matrix': ['--last-failed', '--workers=1'],
  'e2e-owner-order': ['--last-failed', '--workers=1', '--repeat-each=2'],
  'full-jest': ['--onlyFailures', '--runInBand'],
  'full-chromium': ['--last-failed', '--workers=1'],
  'full-firefox': ['--last-failed', '--workers=1']
});

function getLaneSpec(lane) {
  const spec = LANE_SPECS[lane];
  if (!spec) {
    throw new Error(`Unknown test lane: ${lane}. Available lanes: ${Object.keys(LANE_SPECS).join(', ')}`);
  }
  return spec.map(command => ({ ...command, args: [...command.args] }));
}

function getDiagnosticSpec(lane) {
  const spec = getLaneSpec(lane);
  const appendix = RETRY_APPENDIX[lane];
  if (!appendix || spec.length !== 1) {
    return null;
  }
  const command = spec[0];
  const args = command.args.slice();
  if (command.executable === process.execPath && args[0] === JEST_CLI) {
    args.splice(1, args.length - 1, ...args.slice(1).filter(arg => ![
      '--selectProjects', 'unit-node', 'dom-unit', 'architecture', 'statistical-oracle',
      'integration', 'workers', '--runInBand'
    ].includes(arg)));
    const project = lane === 'unit' ? 'unit-node'
      : lane === 'dom' ? 'dom-unit'
        : lane === 'architecture' ? 'architecture'
          : lane === 'stats' ? 'statistical-oracle'
            : lane === 'integration' ? 'integration' : lane === 'workers' ? 'workers' : null;
    if (project) args.splice(1, 0, '--selectProjects', project);
    args.push(...appendix);
  } else {
    args.push(...appendix);
  }
  return { ...command, label: `${command.label}-diagnostic-retry`, args };
}

function execute(command, options = {}) {
  const quietOutput = options.json === true;
  const commandLine = `[${command.label}] ${command.executable} ${command.args.join(' ')}`;
  if (quietOutput) {
    console.error(`\n${commandLine}`);
  } else {
    console.log(`\n${commandLine}`);
  }
  const childEnvironment = {
    ...process.env,
    ...(options.requirePythonOracle === true ? { TEST_REQUIRE_PYTHON_ORACLE: '1' } : {})
  };
  if (options.serverProvenanceFile) {
    childEnvironment.PLAYWRIGHT_PROVENANCE_OUTPUT = options.serverProvenanceFile;
  }
  const directJest = command.executable === process.execPath && command.args[0] === JEST_CLI;
  const jestJsonDirectory = options.captureCaseEvidence === true && directJest
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-jest-lane-results-'))
    : null;
  const jestJsonFile = jestJsonDirectory ? path.join(jestJsonDirectory, 'results.json') : null;
  const playwrightJsonFile = options.captureCaseEvidence === true && isPlaywrightCommand(command)
    ? path.resolve(ROOT_DIR, process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'test-results/playwright-report.json')
    : null;
  const commandArgs = [...command.args];
  if (jestJsonFile) commandArgs.push('--json', '--outputFile', jestJsonFile);
  const nestedReportFile = options.captureCaseEvidence === true
    ? getReportFileArgument(commandArgs)
    : null;
  const explicitCaseEvidenceFile = options.captureCaseEvidence === true
    ? getCaseEvidenceFileArgument(commandArgs)
    : null;
  const result = spawnSync(command.executable, commandArgs, {
    cwd: ROOT_DIR,
    stdio: quietOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
    env: childEnvironment
  });
  if (quietOutput) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error) {
    console.error(`[${command.label}] ${result.error.message}`);
    if (jestJsonDirectory) fs.rmSync(jestJsonDirectory, { recursive: true, force: true });
    return { status: 1, error: result.error.message };
  }
  let status = result.status == null ? 1 : result.status;
  if (jestJsonFile) {
    try {
      const jestResult = JSON.parse(fs.readFileSync(jestJsonFile, 'utf8'));
      if (!Array.isArray(jestResult.testResults)) throw new Error('Jest JSON report has no testResults array.');
      options.caseEvidenceCollector?.push({ type: 'jest-results', report: jestResult });
    } catch (error) {
      status = 1;
      console.error(`[${command.label}] could not collect Jest case evidence: ${error.message}`);
    } finally {
      fs.rmSync(jestJsonDirectory, { recursive: true, force: true });
    }
  }
  if (playwrightJsonFile) {
    try {
      const playwrightResult = JSON.parse(fs.readFileSync(playwrightJsonFile, 'utf8'));
      if (!Array.isArray(playwrightResult.suites)) throw new Error('Playwright JSON report has no suites array.');
      options.caseEvidenceCollector?.push({ type: 'playwright-results', report: playwrightResult });
    } catch (error) {
      status = 1;
      console.error(`[${command.label}] could not collect Playwright case evidence: ${error.message}`);
    }
  }
  if (nestedReportFile) {
    const nestedCaseFile = withJsonSuffix(path.resolve(ROOT_DIR, nestedReportFile), '.cases.json');
    if (fs.existsSync(nestedCaseFile)) {
      try {
        const evidence = JSON.parse(fs.readFileSync(nestedCaseFile, 'utf8'));
        options.caseEvidenceCollector?.push({ type: 'jest-evidence', report: evidence });
      } catch (error) {
        status = 1;
        console.error(`[${command.label}] could not read nested Jest case evidence: ${error.message}`);
      }
    } else if (options.requireCaseEvidence === true) {
      status = 1;
      console.error(`[${command.label}] Jest case evidence is missing: ${nestedCaseFile}`);
    }
  }
  if (explicitCaseEvidenceFile) {
    const evidencePath = path.resolve(ROOT_DIR, explicitCaseEvidenceFile);
    if (fs.existsSync(evidencePath)) {
      try {
        options.caseEvidenceCollector?.push({
          type: 'jest-evidence',
          report: JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
        });
      } catch (error) {
        status = 1;
        console.error(`[${command.label}] could not read case evidence: ${error.message}`);
      }
    } else if (options.requireCaseEvidence === true) {
      status = 1;
      console.error(`[${command.label}] case evidence is missing: ${evidencePath}`);
    }
  }
  return { status };
}

function normalizeManifestPath(file) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function getCommandTestFiles(commands = []) {
  const files = new Set();
  for (const command of commands) {
    for (const argument of command.args || []) {
      let relative = String(argument || '');
      if (path.isAbsolute(relative)) {
        relative = path.relative(ROOT_DIR, relative);
      }
      relative = normalizeManifestPath(relative);
      if ((relative.startsWith('__tests__/') || relative.startsWith('e2e/'))
        && /\.(?:test|spec)\.js$/i.test(relative)) {
        files.add(relative);
      }
    }
  }
  return files;
}

function selectManifestEntries(inventory, lane, commands = []) {
  const entries = inventory.manifest?.entries || [];
  if (!lane) return entries;
  if (lane === 'full' || lane === 'full-chromium' || lane === 'full-firefox') {
    return lane === 'full' ? entries : entries.filter(entry => entry.framework === 'playwright');
  }
  if (lane === 'full-jest') {
    return entries.filter(entry => entry.framework === 'jest');
  }
  if (lane === 'coverage') {
    return entries.filter(entry => ['unit', 'dom', 'architecture', 'stats', 'workers'].includes(entry.defaultLane));
  }
  const commandFiles = getCommandTestFiles(commands);
  if (commandFiles.size > 0) {
    return entries.filter(entry => commandFiles.has(normalizeManifestPath(entry.file)));
  }
  return entries.filter(entry => entry.defaultLane === lane);
}

function buildManifestEvidence(inventory, lane = null, commands = []) {
  const staticData = inventory.static || {};
  const discovery = inventory.discovery || {};
  const summary = inventory.manifest?.summary || {};
  const entries = inventory.manifest?.entries || [];
  const allScenarioIds = new Set(entries.flatMap(entry => entry.scenarioIds || []));
  const selectedEntries = selectManifestEntries(inventory, lane, commands);
  const coveredScenarioIds = new Set(selectedEntries.flatMap(entry => entry.scenarioIds || []));
  const skipDeclarations = staticData.patterns?.skipDeclarations || { count: 0, files: [] };
  const skipDeclarationFiles = Array.isArray(skipDeclarations.files) ? skipDeclarations.files : [];
  return {
    status: inventory.checks?.length ? 'failed' : 'passed',
    checks: inventory.checks || [],
    schemaVersion: inventory.schemaVersion,
    lane,
    manifest: summary,
    coveredScenarioIds: Array.from(coveredScenarioIds).sort(),
    omittedScenarioIds: lane
      ? Array.from(allScenarioIds).filter(id => !coveredScenarioIds.has(id)).sort()
      : [],
    skipDeclarations: {
      count: skipDeclarations.count ?? 0,
      entries: skipDeclarationFiles.flatMap(file => file.matches.map(match => ({
        file: file.file,
        line: match.line,
        policy: match.skipPolicy
      })))
    },
    files: staticData.files || {},
    patterns: {
      fixedScratchPaths: staticData.patterns?.fixedScratchPaths?.count ?? null,
      sourceReads: staticData.patterns?.jestSourceReads?.count ?? null,
      fixtureReads: staticData.patterns?.jestFixtureReads?.count ?? null,
      generatedArtifactReads: staticData.patterns?.jestGeneratedArtifactReads?.count ?? null,
      oversizedSuites: staticData.organization?.oversized?.length ?? null
    },
    discovery: {
      jestFiles: discovery.jest?.files ?? null,
      playwrightChromium: discovery.playwright?.chromium || null,
      firefox: discovery.playwright?.firefox || { status: 'deferred' }
    }
  };
}

function collectManifestEvidence(lane, commands = [], options = {}) {
  try {
    const { buildInventory } = require('./test-inventory.cjs');
    const inventory = buildInventory(ROOT_DIR);
    const evidence = buildManifestEvidence(inventory, lane, commands);
    return options.includeInventory ? { evidence, inventory } : evidence;
  } catch (error) {
    const evidence = {
      status: 'unavailable',
      checks: [`inventory unavailable: ${error.message}`],
      lane,
      coveredScenarioIds: [],
      omittedScenarioIds: [],
      skipDeclarations: { count: 0, entries: [] }
    };
    return options.includeInventory ? { evidence, inventory: null } : evidence;
  }
}

function writeManifestEvidenceArtifacts(reportPath, lane, inventory, evidence) {
  if (!inventory?.manifest?.entries || !reportPath) {
    return { manifest: [], skipLedger: [] };
  }
  const manifestPath = reportPath.replace(/\.json$/i, '.manifest.json');
  const skipLedgerPath = reportPath.replace(/\.json$/i, '.skips.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify({
    schemaVersion: 1,
    lane,
    generatedAt: new Date().toISOString(),
    summary: inventory.manifest.summary,
    entries: inventory.manifest.entries
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(skipLedgerPath, `${JSON.stringify({
    schemaVersion: 1,
    lane,
    generatedAt: new Date().toISOString(),
    entries: evidence?.skipDeclarations?.entries || []
  }, null, 2)}\n`, 'utf8');
  return {
    manifest: [path.relative(ROOT_DIR, manifestPath).replace(/\\/g, '/')],
    skipLedger: [path.relative(ROOT_DIR, skipLedgerPath).replace(/\\/g, '/')]
  };
}

function buildArtifactPolicy(lane, reportRequested = false) {
  const browserLane = lane.startsWith('e2e-') || lane.startsWith('full-') || lane === 'full';
  const hasCaseEvidence = lane !== 'static';
  return {
    schemaVersion: 1,
    retentionDays: ARTIFACT_RETENTION_DAYS,
    required: reportRequested
      ? ['laneReport', 'manifest', 'skipLedger', ...(hasCaseEvidence ? ['caseEvidence'] : [])]
      : [],
    optional: [
      ...(browserLane ? ['playwright-report', 'test-results'] : []),
      ...(browserLane || lane === 'coverage' || lane === 'full-jest' || lane === 'full'
        ? ['artifacts/perf-summaries'] : []),
      ...(lane === 'coverage' ? ['coverage'] : [])
    ],
    missingArtifactPolicy: {
      required: 'error',
      optional: 'ignore'
    }
  };
}

function expectedCaseEvidenceFrameworks(lane) {
  if (lane === 'full') return ['jest', 'playwright'];
  if (lane === 'full-jest' || lane === 'coverage'
    || ['unit', 'dom', 'architecture', 'integration', 'stats', 'workers', 'vendor'].includes(lane)) {
    return ['jest'];
  }
  if (lane.startsWith('e2e-') || lane === 'full-chromium' || lane === 'full-firefox') {
    return ['playwright'];
  }
  return [];
}

function shouldContinueAfterCommandFailure(lane) {
  return lane === 'coverage';
}

function runLane(lane, options = {}) {
  const initial = [];
  const caseEvidenceRecords = [];
  const serverProvenance = [];
  const serverProvenanceArtifacts = [];
  const startedAt = Date.now();
  for (const [commandIndex, command] of getLaneSpec(lane).entries()) {
    const commandStartedAt = Date.now();
    let commandToRun = command;
    if (options.reportFile && lane === 'integration' && command.args[0] === JEST_SHARD_RUNNER) {
      commandToRun = {
        ...command,
        args: [...command.args, '--report-file', withJsonSuffix(options.reportFile, '.shards.json')]
      };
    }
    if (options.reportFile && lane === 'coverage' && command.args[0] === path.join(ROOT_DIR, 'scripts', 'run-coverage.cjs')) {
      commandToRun = {
        ...command,
        args: [...command.args, '--case-evidence-file', withJsonSuffix(options.reportFile, '.cases.json')]
      };
    }
    const provenanceFile = isPlaywrightCommand(command)
      ? path.join(
        ROOT_DIR,
        'artifacts',
        'test-reports',
        `server-provenance-${lane}-${command.label}-${process.pid}-${Date.now()}-${commandIndex}.json`
      )
      : null;
    const result = execute(commandToRun, {
      ...options,
      captureCaseEvidence: Boolean(options.reportFile),
      requireCaseEvidence: Boolean(options.reportFile && lane === 'integration'),
      caseEvidenceCollector: caseEvidenceRecords,
      lane,
      serverProvenanceFile: provenanceFile,
      // The statistical lane is differential coverage, not a reduced smoke
      // path. Missing SciPy/statsmodels must therefore be a lane failure.
      requirePythonOracle: lane === 'stats' || lane === 'full-jest' || lane === 'full' || options.requirePythonOracle === true
    });
    initial.push({ ...command, ...result, durationMs: Date.now() - commandStartedAt });
    if (provenanceFile) {
      const relativeFile = path.relative(ROOT_DIR, provenanceFile).replace(/\\/g, '/');
      serverProvenanceArtifacts.push(relativeFile);
      const provenance = readServerProvenance(provenanceFile);
      serverProvenance.push(provenance
        ? { command: command.label, reportFile: relativeFile, ...provenance, status: 'verified' }
        : { command: command.label, reportFile: relativeFile, status: 'unavailable' });
    }
    if (result.status !== 0 && !shouldContinueAfterCommandFailure(lane)) {
      break;
    }
  }

  let initialStatus = initial.some(result => result.status !== 0) ? 1 : 0;
  let diagnostic = [];
  if (initialStatus !== 0 && options.diagnosticRetry === true) {
    const retry = getDiagnosticSpec(lane);
    if (retry) {
      const retryStartedAt = Date.now();
      diagnostic = [{ ...retry, ...execute(retry, {
        ...options,
        captureCaseEvidence: false,
        caseEvidenceCollector: null,
        requirePythonOracle: lane === 'stats' || lane === 'full-jest' || lane === 'full' || options.requirePythonOracle === true
      }), durationMs: Date.now() - retryStartedAt }];
    }
  }

  const manifestCollection = collectManifestEvidence(lane, getLaneSpec(lane), {
    includeInventory: Boolean(options.reportFile)
  });
  const manifestEvidence = manifestCollection.evidence || manifestCollection;
  let caseEvidence = null;
  if (options.reportFile && lane !== 'static' && manifestCollection.inventory?.manifest?.entries) {
    const expectedFrameworks = expectedCaseEvidenceFrameworks(lane);
    const evidenceParts = [];
    const jestResults = caseEvidenceRecords
      .filter(record => record.type === 'jest-results')
      .map(record => record.report);
    if (jestResults.length > 0) {
      evidenceParts.push(buildJestCaseEvidence({
        lane,
        environment: buildTestEnvironment(resolveVendorMode(lane)),
        results: jestResults,
        manifestEntries: manifestCollection.inventory.manifest.entries,
        rootDir: ROOT_DIR
      }));
    }
    for (const record of caseEvidenceRecords) {
      if (record.type === 'playwright-results') {
        evidenceParts.push(buildPlaywrightCaseEvidence({
          lane,
          environment: buildTestEnvironment(resolveVendorMode(lane)),
          report: record.report,
          manifestEntries: manifestCollection.inventory.manifest.entries,
          rootDir: ROOT_DIR
        }));
      } else if (record.type === 'jest-evidence') {
        evidenceParts.push(record.report);
      }
    }
    caseEvidence = mergeCaseEvidence({
      lane,
      environment: buildTestEnvironment(resolveVendorMode(lane)),
      evidence: evidenceParts.length > 0
        ? evidenceParts
        : [{ frameworks: expectedFrameworks, files: [] }],
      expectedFrameworks
    });
    const evidenceFailures = validateCaseEvidence(caseEvidence);
    if (evidenceFailures.length > 0 || caseEvidence.summary.files === 0 || caseEvidence.summary.testCases === 0
      || caseEvidence.summary.unknown > 0 || caseEvidence.missingFrameworks.length > 0) {
      initialStatus = 1;
      initial.push({
        label: 'test-case-evidence-manifest-join',
        status: 1,
        error: evidenceFailures.join('; ') || 'No case outcomes were captured for every required framework.'
      });
    }
  }
  let caseEvidenceArtifact = [];
  if (caseEvidence) {
    const casePath = withJsonSuffix(path.resolve(ROOT_DIR, options.reportFile), '.cases.json');
    fs.mkdirSync(path.dirname(casePath), { recursive: true });
    fs.writeFileSync(casePath, `${JSON.stringify(caseEvidence, null, 2)}\n`, 'utf8');
    caseEvidenceArtifact = [path.relative(ROOT_DIR, casePath).replace(/\\/g, '/')];
  } else if (options.reportFile && lane !== 'static') {
    initialStatus = 1;
    initial.push({ label: 'test-case-evidence', status: 1, error: 'Test case evidence was not produced.' });
  }
  const report = {
    schemaVersion: 1,
    lane,
    initialStatus,
    diagnosticStatus: diagnostic.length > 0 ? diagnostic[0].status : null,
    durationMs: Date.now() - startedAt,
    environment: {
      ...buildTestEnvironment(resolveVendorMode(lane)),
      serverProvenance
    },
    oracle: lane === 'stats'
      ? { policy: 'required', enforcement: 'TEST_REQUIRE_PYTHON_ORACLE=1' }
      : { policy: 'not-applicable' },
    manifestEvidence,
    artifactPolicy: buildArtifactPolicy(lane, Boolean(options.reportFile)),
    caseEvidence: caseEvidence
      ? { artifact: caseEvidenceArtifact[0], summary: caseEvidence.summary, granularity: caseEvidence.granularity }
      : null,
    artifacts: {
      playwright: ['playwright-report', 'test-results'],
      performance: ['artifacts/perf-summaries'],
      coverage: lane === 'coverage' ? ['coverage'] : [],
      serverProvenance: serverProvenanceArtifacts,
      manifest: [],
      skipLedger: [],
      caseEvidence: caseEvidenceArtifact
    },
    initial,
    diagnostic
  };
  if (options.reportFile) {
    const reportPath = path.resolve(ROOT_DIR, options.reportFile);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    const evidenceArtifacts = writeManifestEvidenceArtifacts(reportPath, lane, manifestCollection.inventory, manifestEvidence);
    report.artifacts.manifest = evidenceArtifacts.manifest;
    report.artifacts.skipLedger = evidenceArtifacts.skipLedger;
    report.artifacts.laneReport = path.relative(ROOT_DIR, reportPath).replace(/\\/g, '/');
  }
  assertReportSchema(report, `${lane} lane report`);
  if (options.reportFile) {
    const reportPath = path.resolve(ROOT_DIR, options.reportFile);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }
  // A diagnostic retry classifies instability; it cannot clear initialStatus.
  return report;
}

function parseArgs(argv) {
  const options = { diagnosticRetry: false, json: false, reportFile: null };
  let lane = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--lane') {
      lane = argv[++index];
    } else if (arg === '--diagnostic-retry') {
      options.diagnosticRetry = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--report-file') {
      options.reportFile = String(argv[++index] || '').trim() || null;
    }
  }
  if (!lane) {
    throw new Error('Usage: node scripts/run-test-lane.cjs --lane <lane> [--diagnostic-retry] [--json] [--report-file path]');
  }
  return { lane, options };
}

if (require.main === module) {
  try {
    const { lane, options } = parseArgs(process.argv.slice(2));
    const report = runLane(lane, options);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(`\nLane ${lane}: initial status ${report.initialStatus}; diagnostic status ${report.diagnosticStatus ?? 'not run'}`);
    }
    process.exitCode = report.initialStatus;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

module.exports = {
  LANE_SPECS,
  RETRY_APPENDIX,
  isPlaywrightCommand,
  getLaneSpec,
  getDiagnosticSpec,
  buildManifestEvidence,
  getCommandTestFiles,
  selectManifestEntries,
  buildArtifactPolicy,
  expectedCaseEvidenceFrameworks,
  collectManifestEvidence,
  writeManifestEvidenceArtifacts,
  shouldContinueAfterCommandFailure,
  parseArgs,
  runLane
};
