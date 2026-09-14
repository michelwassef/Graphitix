'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createInstrumenter } = require('istanbul-lib-instrument');

const ROOT_DIR = path.resolve(__dirname, '..');
const JEST_CLI = path.join(ROOT_DIR, 'node_modules', 'jest', 'bin', 'jest.js');
const JEST_CONFIG = require('../jest.config.js');
const JEST_PROJECTS = Object.freeze(JEST_CONFIG.projects.map(project => project.displayName));
// Full integration remains a separate release gate. Its broad index.html
// fixtures can exhaust the Node heap under coverage instrumentation, while
// the source-coverage projects provide the stable, repeatable denominator.
const COVERAGE_PROJECTS = Object.freeze([
  'architecture', 'statistical-oracle', 'unit-node', 'dom-unit', 'workers'
]);
const SHARDED_PROJECTS = Object.freeze(['architecture', 'statistical-oracle']);
if (COVERAGE_PROJECTS.some(project => !JEST_PROJECTS.includes(project))) {
  throw new Error('Coverage project list must reference configured Jest projects.');
}
const FINAL_COVERAGE_DIR = path.join(ROOT_DIR, 'coverage');
const ZERO_THRESHOLD = { global: { statements: 0, branches: 0, functions: 0, lines: 0 } };

function listSourceFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }
  return files;
}

function addMissingSourceBaselineCoverage(coverageMap) {
  const instrumenter = createInstrumenter();
  const observedFiles = new Set(coverageMap.files());
  const sourceFiles = [
    ...listSourceFiles(path.join(ROOT_DIR, 'js')),
    ...listSourceFiles(path.join(ROOT_DIR, 'src'))
  ];
  for (const file of sourceFiles) {
    if (observedFiles.has(file)) {
      continue;
    }
    const source = fs.readFileSync(file, 'utf8');
    instrumenter.instrumentSync(source, file);
    coverageMap.addFileCoverage(instrumenter.lastFileCoverage());
  }
}

function writeProjectConfig(project, configPath) {
  const projectConfig = JEST_CONFIG.projects.find(item => item.displayName === project);
  if (!projectConfig) {
    throw new Error(`Unknown Jest project: ${project}`);
  }
  fs.writeFileSync(configPath, `${JSON.stringify({
    ...projectConfig,
    rootDir: ROOT_DIR,
    collectCoverageFrom: [],
    coverageProvider: 'v8',
    coverageThreshold: ZERO_THRESHOLD
  }, null, 2)}\n`, 'utf8');
}

function runProjectCommand(project, configPath, coverageDirectory, testFile = null) {
  const args = [
    JEST_CLI,
    '--config', configPath,
    '--maxWorkers', '1',
    '--coverage',
    '--coverageReporters=json',
    '--coverageThreshold', JSON.stringify(ZERO_THRESHOLD),
    '--coverageDirectory', coverageDirectory
  ];
  if (testFile) {
    args.push('--runTestsByPath', testFile);
  }
  console.log(`\n[jest-coverage:${project}] ${process.execPath} ${args.join(' ')}`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    windowsHide: true,
    env: process.env
  });
  if (result.error) {
    console.error(`[jest-coverage:${project}] ${result.error.message}`);
    return 1;
  }
  return result.status == null ? 1 : result.status;
}

function listProjectTestFiles(project, configPath) {
  const result = spawnSync(process.execPath, [
    JEST_CLI,
    '--config', configPath,
    '--listTests',
    '--json'
  ], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    windowsHide: true,
    env: process.env
  });
  if (result.error || result.status !== 0) {
    throw new Error(`Could not discover coverage files for ${project}: ${result.error?.message || result.stderr || `exit ${result.status}`}`);
  }
  const lines = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  try {
    const files = JSON.parse(lines[lines.length - 1] || '[]');
    if (!Array.isArray(files)) {
      throw new Error('discovery output was not an array');
    }
    return files;
  } catch (error) {
    throw new Error(`Could not parse coverage files for ${project}: ${error.message}`);
  }
}

function readProjectCoverage(project, coverageDirectory) {
  const file = path.join(coverageDirectory, 'coverage-final.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Coverage output missing for ${project}: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeAggregateReports(coverageMap, outputDirectory, metadata = {}) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(outputDirectory, 'coverage-final.json'),
    `${JSON.stringify(coverageMap.toJSON(), null, 2)}\n`,
    'utf8'
  );
  const summary = coverageMap.getCoverageSummary().toJSON();
  const report = {
    schemaVersion: 1,
    metadata,
    total: summary,
    ...Object.fromEntries(coverageMap.files().map(file => [file, coverageMap.fileCoverageFor(file).toSummary().toJSON()]))
  };
  fs.writeFileSync(
    path.join(outputDirectory, 'coverage-summary.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8'
  );
  return summary;
}

function runProject(project, temporaryRoot, aggregate) {
  const projectDirectory = path.join(temporaryRoot, project);
  const configPath = path.join(temporaryRoot, `${project}.jest.config.json`);
  fs.mkdirSync(projectDirectory, { recursive: true });
  writeProjectConfig(project, configPath);
  if (SHARDED_PROJECTS.includes(project)) {
    const files = listProjectTestFiles(project, configPath);
    console.log(`[jest-coverage:${project}] ${files.length} fresh processes`);
    for (const [index, testFile] of files.entries()) {
      const shardDirectory = path.join(projectDirectory, String(index));
      fs.mkdirSync(shardDirectory, { recursive: true });
      const status = runProjectCommand(project, configPath, shardDirectory, testFile);
      if (status !== 0) {
        return status;
      }
      aggregate.merge(readProjectCoverage(`${project} ${testFile}`, shardDirectory));
    }
    return 0;
  }
  const status = runProjectCommand(project, configPath, projectDirectory);
  if (status !== 0) {
    return status;
  }
  aggregate.merge(readProjectCoverage(project, projectDirectory));
  return 0;
}

function run() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-coverage-'));
  try {
    const aggregate = createCoverageMap({});
    console.log(`Coverage source projects: ${COVERAGE_PROJECTS.join(', ')}; integration is a separate release gate.`);
    for (const project of COVERAGE_PROJECTS) {
      const status = runProject(project, temporaryRoot, aggregate);
      if (status !== 0) {
        return status;
      }
    }
    addMissingSourceBaselineCoverage(aggregate);

    const stagedOutput = path.join(temporaryRoot, 'merged');
    const summary = writeAggregateReports(aggregate, stagedOutput, {
      provider: 'v8',
      projects: COVERAGE_PROJECTS,
      excludedProjects: JEST_PROJECTS.filter(project => !COVERAGE_PROJECTS.includes(project)),
      sourceDenominator: 'js/**/*.js and src/**/*.js'
    });
    fs.rmSync(FINAL_COVERAGE_DIR, { recursive: true, force: true });
    fs.renameSync(stagedOutput, FINAL_COVERAGE_DIR);
    console.log(
      `\nCoverage aggregate: statements=${summary.statements.pct}%, branches=${summary.branches.pct}%, functions=${summary.functions.pct}%, lines=${summary.lines.pct}%`
    );
    return 0;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    process.exitCode = run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  JEST_PROJECTS,
  COVERAGE_PROJECTS,
  SHARDED_PROJECTS,
  readProjectCoverage,
  writeAggregateReports,
  runProject,
  run
};
