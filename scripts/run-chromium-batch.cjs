'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PLAYWRIGHT_CLI = path.join(ROOT_DIR, 'node_modules', '@playwright', 'test', 'cli.js');
const RESULTS_DIR = path.join(ROOT_DIR, 'test-results');

function parseArgs(argv) {
  const options = { files: [], workers: 4 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--files') {
      options.files = argv.slice(index + 1).map(file => file.replace(/\\/g, '/'));
      break;
    }
    if (arg === '--workers') {
      options.workers = Number(argv[++index]);
    }
    if (arg === '--help') {
      options.help = true;
    }
  }
  return options;
}

function normalizeFile(file) {
  const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized.startsWith('e2e/') ? normalized : `e2e/${normalized}`;
}

function runPlaywright(files, workers, outputFile, label, grep = null) {
  const args = [
    PLAYWRIGHT_CLI,
    'test',
    ...files,
    '--project=chromium',
    `--workers=${workers}`,
    '--reporter=json'
  ];
  if (grep) args.push('--grep', grep);
  console.log(`\n[${label}] chromium workers=${workers}`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      PLAYWRIGHT_JSON_OUTPUT_NAME: outputFile
    }
  });
  return {
    status: result.error ? 1 : (result.status == null ? 1 : result.status),
    error: result.error?.message || null,
    outputFile
  };
}

function isFailureStatus(status) {
  return ['failed', 'timedOut', 'interrupted'].includes(status);
}

function collectFailures(report) {
  const failures = [];
  const visit = (suite, inheritedFile = null) => {
    if (!suite || typeof suite !== 'object') return;
    const suiteFile = suite.file || inheritedFile;
    for (const spec of suite.specs || []) {
      const chromiumTests = (spec.tests || []).filter(test =>
        !test.projectName || test.projectName === 'chromium'
      );
      const failed = spec.ok === false || chromiumTests.some(test =>
        isFailureStatus(test.status)
        || (test.results || []).some(result => isFailureStatus(result.status))
      );
      if (failed && suiteFile) {
        failures.push({
          file: normalizeFile(suiteFile),
          title: spec.title
        });
      }
    }
    for (const child of suite.suites || []) visit(child, suiteFile);
  };
  for (const suite of report?.suites || []) visit(suite);
  return failures.filter((failure, index, all) => all.findIndex(candidate =>
    candidate.file === failure.file && candidate.title === failure.title
  ) === index);
}

function readFailures(outputFile) {
  try {
    return collectFailures(JSON.parse(fs.readFileSync(outputFile, 'utf8')));
  } catch (error) {
    console.error(`Could not read Chromium JSON results: ${error.message}`);
    return [];
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createOutputPath(stem) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  return path.join(RESULTS_DIR, `${stem}-${process.pid}-${Date.now()}.json`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('Usage: node scripts/run-chromium-batch.cjs --workers 4 --files e2e/a.spec.js e2e/b.spec.js');
    return 0;
  }
  if (!Number.isInteger(options.workers) || options.workers < 1) {
    throw new Error('--workers must be a positive integer');
  }
  if (options.files.length === 0) {
    throw new Error('--files requires one or more Chromium spec paths');
  }
  const files = options.files.map(normalizeFile);
  const startedAt = Date.now();
  const parallelOutput = createOutputPath('chromium-batch-parallel');
  const parallel = runPlaywright(files, options.workers, parallelOutput, 'parallel');
  const failures = parallel.status === 0 ? [] : readFailures(parallelOutput);
  const serial = [];
  for (let index = 0; index < failures.length; index += 1) {
    const failure = failures[index];
    const outputFile = createOutputPath(`chromium-batch-serial-${index + 1}`);
    const result = runPlaywright(
      [failure.file],
      1,
      outputFile,
      `serial ${index + 1}/${failures.length}: ${failure.file} :: ${failure.title}`,
      escapeRegex(failure.title)
    );
    serial.push({ ...failure, ...result });
  }
  const summary = {
    schemaVersion: 1,
    browser: 'chromium',
    requestedWorkers: options.workers,
    files,
    initialStatus: parallel.status,
    failedCases: failures,
    serial,
    durationMs: Date.now() - startedAt,
    parallelOutput
  };
  const summaryFile = createOutputPath('chromium-batch-summary');
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  console.log(`\nChromium batch: initial=${parallel.status}; failed cases=${failures.length}; summary=${summaryFile}`);
  return parallel.status;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
