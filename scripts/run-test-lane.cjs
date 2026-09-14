'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const JEST_CLI = path.join(ROOT_DIR, 'node_modules', 'jest', 'bin', 'jest.js');
const JEST_SHARD_RUNNER = path.join(ROOT_DIR, 'scripts', 'run-jest-shards.cjs');
const FULL_JEST_RUNNER = path.join(ROOT_DIR, 'scripts', 'run-full-jest.cjs');
const PLAYWRIGHT_CLI = path.join(ROOT_DIR, 'node_modules', '@playwright', 'test', 'cli.js');
const STATISTICAL_TESTS = [
  '__tests__/stats.differential.python.test.js',
  '__tests__/stats.component.differential.test.js',
  '__tests__/stats.matrix.components.test.js',
  '__tests__/stats.extended.coverage.test.js',
  '__tests__/stats.ui.presentation.branches.test.js',
  '__tests__/stats.ui.persistence.restore.test.js'
];

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
    JEST_CLI, '--selectProjects', 'statistical-oracle', '--runInBand', '--runTestsByPath', ...STATISTICAL_TESTS
  ], 'jest-statistical-smoke')]),
  workers: Object.freeze([nodeCommand([JEST_CLI, '--selectProjects', 'workers'], 'jest-workers')]),
  vendor: Object.freeze([nodeCommand([
    JEST_CLI, '--selectProjects', 'unit-node', '--runTestsByPath',
    path.join(ROOT_DIR, '__tests__', 'unit', 'vendorRuntime.smoke.test.js')
  ], 'jest-real-vendor')]),
  'e2e-smoke': Object.freeze([nodeCommand([
    PLAYWRIGHT_CLI, 'test', 'e2e/workspace.smoke.spec.js', '--project=chromium', '--workers=1'
  ], 'playwright-smoke')]),
  'e2e-contracts': Object.freeze([nodeCommand([
    PLAYWRIGHT_CLI, 'test', 'e2e/workspace.smoke.spec.js', 'e2e/aggrid.firefox-paste.spec.js',
    'e2e/config-panel.fieldset-containment.spec.js',
    'e2e/workspace/style-sync.contract.spec.js', 'e2e/workspace/unsaved-decisions.contract.spec.js',
    'e2e/workspace/tab-reorder.contract.spec.js',
    'e2e/cross-browser.feature-matrix.spec.js', 'e2e/stats.same-component-isolation-restore.contract.spec.js',
    'e2e/stats.reopen-presence.contract.spec.js', 'e2e/stats.async-owner-completion.contract.spec.js',
    'e2e/vendor.runtime.smoke.spec.js', '--project=chromium'
  ], 'playwright-contracts-chromium')]),
  'e2e-contracts-firefox': Object.freeze([nodeCommand([
    PLAYWRIGHT_CLI, 'test', 'e2e/workspace.smoke.spec.js', 'e2e/aggrid.firefox-paste.spec.js',
    'e2e/cross-browser.feature-matrix.spec.js', 'e2e/stats.same-component-isolation-restore.contract.spec.js',
    'e2e/stats.reopen-presence.contract.spec.js', 'e2e/stats.async-owner-completion.contract.spec.js',
    'e2e/vendor.runtime.smoke.spec.js', '--project=firefox'
  ], 'playwright-contracts-firefox')]),
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
  const result = spawnSync(command.executable, command.args, {
    cwd: ROOT_DIR,
    stdio: quietOutput ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      ...(options.requirePythonOracle === true ? { TEST_REQUIRE_PYTHON_ORACLE: '1' } : {})
    }
  });
  if (quietOutput) {
    if (result.stdout) process.stderr.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (result.error) {
    console.error(`[${command.label}] ${result.error.message}`);
    return { status: 1, error: result.error.message };
  }
  return { status: result.status == null ? 1 : result.status };
}

function runLane(lane, options = {}) {
  const initial = [];
  const startedAt = Date.now();
  for (const command of getLaneSpec(lane)) {
    const commandStartedAt = Date.now();
    const result = execute(command, {
      ...options,
      // The statistical lane is differential coverage, not a reduced smoke
      // path. Missing SciPy/statsmodels must therefore be a lane failure.
      requirePythonOracle: lane === 'stats' || lane === 'full-jest' || lane === 'full' || options.requirePythonOracle === true
    });
    initial.push({ ...command, ...result, durationMs: Date.now() - commandStartedAt });
    if (result.status !== 0) {
      break;
    }
  }

  const initialStatus = initial.some(result => result.status !== 0) ? 1 : 0;
  let diagnostic = [];
  if (initialStatus !== 0 && options.diagnosticRetry === true) {
    const retry = getDiagnosticSpec(lane);
    if (retry) {
      const retryStartedAt = Date.now();
      diagnostic = [{ ...retry, ...execute(retry, {
        ...options,
        requirePythonOracle: lane === 'stats' || lane === 'full-jest' || lane === 'full' || options.requirePythonOracle === true
      }), durationMs: Date.now() - retryStartedAt }];
    }
  }

  const report = {
    schemaVersion: 1,
    lane,
    initialStatus,
    diagnosticStatus: diagnostic.length > 0 ? diagnostic[0].status : null,
    durationMs: Date.now() - startedAt,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      ci: process.env.CI === 'true'
    },
    oracle: lane === 'stats'
      ? { policy: 'required', enforcement: 'TEST_REQUIRE_PYTHON_ORACLE=1' }
      : { policy: 'not-applicable' },
    artifacts: {
      playwright: ['playwright-report', 'test-results'],
      coverage: lane === 'coverage' ? ['coverage'] : []
    },
    initial,
    diagnostic
  };
  if (options.reportFile) {
    const reportPath = path.resolve(ROOT_DIR, options.reportFile);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    report.artifacts.laneReport = path.relative(ROOT_DIR, reportPath).replace(/\\/g, '/');
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
  getLaneSpec,
  getDiagnosticSpec,
  parseArgs,
  runLane
};
