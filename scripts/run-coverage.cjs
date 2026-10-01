'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createCoverageMap } = require('istanbul-lib-coverage');
const { createInstrumenter } = require('istanbul-lib-instrument');
const { buildFileManifest } = require('../test-support/testManifest.js');
const { buildJestCaseEvidence, normalizeFile } = require('../test-support/jestCaseEvidence.js');
const { validateJestCaseEvidence } = require('../test-support/testReportSchema.js');
const { buildTestEnvironment } = require('../test-support/testReportEnvironment.js');
const { childEnvironment } = require('./run-jest-shards.cjs');

const ROOT_DIR = path.resolve(__dirname, '..');
const JEST_CLI = path.join(ROOT_DIR, 'node_modules', 'jest', 'bin', 'jest.js');
const JEST_CONFIG = require('../jest.config.js');
const JEST_PROJECTS = Object.freeze(JEST_CONFIG.projects.map(project => project.displayName));
const COVERAGE_PROJECTS = Object.freeze([
  'architecture', 'statistical-oracle', 'unit-node', 'dom-unit', 'integration', 'workers'
]);
const SHARDED_PROJECTS = Object.freeze(['architecture', 'statistical-oracle', 'integration']);
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

function isProductionSourceFile(file, rootDir = ROOT_DIR) {
  const absolutePath = path.resolve(rootDir, file);
  const relativePath = path.relative(rootDir, absolutePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) return false;
  const [topLevel] = relativePath.split(path.sep);
  return (topLevel === 'js' || topLevel === 'src') && path.extname(relativePath) === '.js';
}

function mergeProductionSourceCoverage(targetCoverage, coverageByFile, rootDir = ROOT_DIR) {
  const sourceCoverage = Object.fromEntries(
    Object.entries(coverageByFile || {}).filter(([file]) => isProductionSourceFile(file, rootDir))
  );
  if (Object.keys(sourceCoverage).length > 0) targetCoverage.merge(sourceCoverage);
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

function runProjectCommand(project, configPath, coverageDirectory, testFile = null, resultFile = null) {
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
  if (resultFile) args.push('--json', '--outputFile', resultFile);
  console.log(`\n[jest-coverage:${project}] ${process.execPath} ${args.join(' ')}`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    windowsHide: true,
    env: childEnvironment(project)
  });
  if (result.error) {
    console.error(`[jest-coverage:${project}] ${result.error.message}`);
    return { status: 1, jestResult: null };
  }
  let jestResult = null;
  let status = result.status == null ? 1 : result.status;
  if (resultFile) {
    try {
      jestResult = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      if (!Array.isArray(jestResult.testResults)) throw new Error('Jest JSON report has no testResults array.');
    } catch (error) {
      console.error(`[jest-coverage:${project}] could not read case results: ${error.message}`);
      status = 1;
    }
  }
  return { status, jestResult };
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

function runProject(project, temporaryRoot, aggregate, projectAggregate = createCoverageMap({}), caseResults = [], captureCaseResults = false) {
  const projectDirectory = path.join(temporaryRoot, project);
  const configPath = path.join(temporaryRoot, `${project}.jest.config.json`);
  fs.mkdirSync(projectDirectory, { recursive: true });
  writeProjectConfig(project, configPath);
  if (SHARDED_PROJECTS.includes(project)) {
    const files = listProjectTestFiles(project, configPath);
    console.log(`[jest-coverage:${project}] ${files.length} fresh processes`);
    let status = 0;
    for (const [index, testFile] of files.entries()) {
      const shardDirectory = path.join(projectDirectory, String(index));
      fs.mkdirSync(shardDirectory, { recursive: true });
      const resultFile = captureCaseResults ? path.join(shardDirectory, 'jest-results.json') : null;
      const execution = runProjectCommand(project, configPath, shardDirectory, testFile, resultFile);
      if (execution.jestResult) caseResults.push(execution.jestResult);
      if (execution.status !== 0) {
        status = execution.status || 1;
        console.error(`[jest-coverage:${project}] continuing to collect coverage after failed suite: ${testFile}`);
      }
      try {
        const coverage = readProjectCoverage(`${project} ${testFile}`, shardDirectory);
        mergeProductionSourceCoverage(aggregate, coverage);
        mergeProductionSourceCoverage(projectAggregate, coverage);
      } catch (error) {
        status = 1;
        console.error(`[jest-coverage:${project}] ${error.message}`);
      }
    }
    return status;
  }
  const resultFile = captureCaseResults ? path.join(projectDirectory, 'jest-results.json') : null;
  const execution = runProjectCommand(project, configPath, projectDirectory, null, resultFile);
  if (execution.jestResult) caseResults.push(execution.jestResult);
  let status = execution.status;
  try {
    const coverage = readProjectCoverage(project, projectDirectory);
    mergeProductionSourceCoverage(aggregate, coverage);
    mergeProductionSourceCoverage(projectAggregate, coverage);
  } catch (error) {
    status = status || 1;
    console.error(`[jest-coverage:${project}] ${error.message}`);
  }
  return status;
}

function parseArgs(argv) {
  const options = { caseEvidenceFile: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--case-evidence-file') options.caseEvidenceFile = String(argv[++index] || '').trim() || null;
    else if (argv[index] === '--help') options.help = true;
    else throw new Error(`Unknown option: ${argv[index]}`);
  }
  return options;
}

function writeCaseEvidence(caseEvidenceFile, caseResults) {
  if (!caseEvidenceFile) return [];
  const testFiles = caseResults.flatMap(result => (result.testResults || [])
    .map(testResult => normalizeFile(testResult.name, ROOT_DIR)));
  const manifestEntries = buildFileManifest({ jestPaths: Array.from(new Set(testFiles)), e2ePaths: [] });
  const caseEvidence = buildJestCaseEvidence({
    lane: 'coverage',
    environment: buildTestEnvironment('fake'),
    results: caseResults,
    manifestEntries,
    rootDir: ROOT_DIR
  });
  const evidenceFailures = validateJestCaseEvidence(caseEvidence);
  const caseEvidencePath = path.resolve(ROOT_DIR, caseEvidenceFile);
  fs.mkdirSync(path.dirname(caseEvidencePath), { recursive: true });
  fs.writeFileSync(caseEvidencePath, `${JSON.stringify(caseEvidence, null, 2)}\n`, 'utf8');
  return evidenceFailures;
}

function run(options = {}) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-coverage-'));
  try {
    const aggregate = createCoverageMap({});
    const caseResults = [];
    const projectAggregates = new Map(COVERAGE_PROJECTS.map(project => [project, createCoverageMap({})]));
    console.log(`Coverage source projects: ${COVERAGE_PROJECTS.join(', ')}; integration suites use fresh, leak-enforced processes.`);
    let status = 0;
    for (const project of COVERAGE_PROJECTS) {
      const projectStatus = runProject(
        project,
        temporaryRoot,
        aggregate,
        projectAggregates.get(project),
        caseResults,
        Boolean(options.caseEvidenceFile)
      );
      if (projectStatus !== 0) status = projectStatus || 1;
    }
    addMissingSourceBaselineCoverage(aggregate);

    const stagedOutput = path.join(temporaryRoot, 'merged');
    const summary = writeAggregateReports(aggregate, stagedOutput, {
      provider: 'v8',
      projects: COVERAGE_PROJECTS,
      excludedProjects: JEST_PROJECTS.filter(project => !COVERAGE_PROJECTS.includes(project)),
      sourceDenominator: 'js/**/*.js and src/**/*.js'
    });
    for (const project of COVERAGE_PROJECTS) {
      writeAggregateReports(projectAggregates.get(project), path.join(stagedOutput, 'projects', project), {
        provider: 'v8',
        project,
        sourceDenominator: 'production source files observed by this Jest project'
      });
    }
    if (options.caseEvidenceFile) {
      const evidenceFailures = writeCaseEvidence(options.caseEvidenceFile, caseResults);
      if (evidenceFailures.length > 0) {
        console.error(`Coverage case evidence failed validation: ${evidenceFailures.join('; ')}`);
        status = 1;
      }
    }
    fs.rmSync(FINAL_COVERAGE_DIR, { recursive: true, force: true });
    fs.renameSync(stagedOutput, FINAL_COVERAGE_DIR);
    console.log(
      `\nCoverage aggregate: statements=${summary.statements.pct}%, branches=${summary.branches.pct}%, functions=${summary.functions.pct}%, lines=${summary.lines.pct}%`
    );
    return status;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/run-coverage.cjs [--case-evidence-file path]');
      process.exitCode = 0;
    } else {
      process.exitCode = run(options);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  JEST_PROJECTS,
  COVERAGE_PROJECTS,
  SHARDED_PROJECTS,
  isProductionSourceFile,
  mergeProductionSourceCoverage,
  readProjectCoverage,
  writeAggregateReports,
  writeCaseEvidence,
  parseArgs,
  runProject,
  run
};
