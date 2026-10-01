'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { assertReportSchema, validateJestCaseEvidence } = require('../test-support/testReportSchema.js');
const { buildTestEnvironment } = require('../test-support/testReportEnvironment.js');
const { buildFileManifest } = require('../test-support/testManifest.js');
const { buildJestCaseEvidence } = require('../test-support/jestCaseEvidence.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const JEST_CLI = path.join(ROOT_DIR, 'node_modules', 'jest', 'bin', 'jest.js');

function parseArgs(argv) {
  const options = {
    project: 'integration',
    filesPerProcess: 1,
    onlyFailures: false,
    reportFile: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--project') options.project = String(argv[++index] || '').trim();
    else if (arg === '--files-per-process') options.filesPerProcess = Number(argv[++index]);
    else if (arg === '--onlyFailures') options.onlyFailures = true;
    else if (arg === '--report-file') options.reportFile = String(argv[++index] || '').trim() || null;
    else if (arg === '--help') options.help = true;
  }
  if (!options.project) throw new Error('--project must not be empty');
  if (!Number.isInteger(options.filesPerProcess) || options.filesPerProcess < 1) {
    throw new Error('--files-per-process must be a positive integer');
  }
  return options;
}

function partition(files, size) {
  const groups = [];
  for (let index = 0; index < files.length; index += size) {
    groups.push(files.slice(index, index + size));
  }
  return groups;
}

function childEnvironment(project, baseEnvironment = process.env) {
  return {
    ...baseEnvironment,
    ...(project === 'integration' ? { TEST_ENFORCE_INTEGRATION_LEAKS: '1' } : {})
  };
}

function discoverTests(project, onlyFailures = false) {
  const args = [JEST_CLI, '--selectProjects', project, '--listTests'];
  if (onlyFailures) args.push('--onlyFailures');
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    windowsHide: true,
    env: childEnvironment(project)
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Jest test discovery failed for project ${project}.`);
  }
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && path.isAbsolute(line));
}

function runGroup(project, files, index, total, onlyFailures = false, resultFile = null) {
  const args = [JEST_CLI, '--selectProjects', project, '--runInBand', '--runTestsByPath', ...files];
  if (onlyFailures) args.push('--onlyFailures');
  if (resultFile) args.push('--json', '--outputFile', resultFile);
  console.log(`\n[jest ${project} group ${index}/${total}] ${files.map(file => path.relative(ROOT_DIR, file)).join(', ')}`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    windowsHide: true,
    env: childEnvironment(project)
  });
  if (result.error) {
    console.error(`[jest ${project} group ${index}/${total}] ${result.error.message}`);
    return { status: 1, jestResult: null, reportError: result.error.message };
  }
  let jestResult = null;
  let reportError = null;
  if (resultFile) {
    try {
      jestResult = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      if (!Array.isArray(jestResult.testResults)) throw new Error('Jest JSON report has no testResults array.');
    } catch (error) {
      reportError = error.message;
      console.error(`[jest ${project} group ${index}/${total}] could not read case results: ${reportError}`);
    }
  }
  const status = result.status == null || (resultFile && !jestResult) ? 1 : result.status;
  return { status, jestResult, reportError };
}

function writeReport(reportFile, report) {
  if (!reportFile) {
    return;
  }
  const reportPath = path.resolve(ROOT_DIR, reportFile);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function writeCaseEvidence(reportFile, { lane, project, environment, files, results }) {
  const manifestEntries = buildFileManifest({
    jestPaths: (files || []).map(file => path.isAbsolute(file) ? path.relative(ROOT_DIR, file) : file),
    e2ePaths: []
  });
  const evidence = buildJestCaseEvidence({
    lane: lane || project,
    environment,
    results: results || [],
    manifestEntries,
    rootDir: ROOT_DIR
  });
  const evidenceFailures = validateJestCaseEvidence(evidence);
  if (evidenceFailures.length > 0) throw new Error(`Jest case evidence failed validation: ${evidenceFailures.join('; ')}`);
  const caseEvidencePath = reportFile.replace(/\.json$/i, '.cases.json');
  writeReport(caseEvidencePath, evidence);
  return {
    file: path.relative(ROOT_DIR, path.resolve(ROOT_DIR, caseEvidencePath)).replace(/\\/g, '/'),
    summary: evidence.summary
  };
}

function runReport(options) {
  const files = discoverTests(options.project, options.onlyFailures);
  if (files.length === 0) {
    console.log(`No ${options.onlyFailures ? 'failed ' : ''}${options.project} tests discovered.`);
    const noTestStatus = options.onlyFailures ? 0 : 1;
    const report = {
      schemaVersion: 1,
      runner: 'jest-shards',
      project: options.project,
      filesPerProcess: options.filesPerProcess,
      onlyFailures: options.onlyFailures,
      environment: buildTestEnvironment('fake'),
      initialStatus: noTestStatus,
      durationMs: 0,
      groups: [],
      failedGroups: [],
      caseEvidence: null
    };
    if (options.reportFile) {
      report.caseEvidence = writeCaseEvidence(options.reportFile, {
        lane: options.lane,
        project: options.project,
        environment: buildTestEnvironment('fake'),
        files: [],
        results: []
      });
      assertReportSchema(report, `Jest ${options.project} shard report`);
      writeReport(options.reportFile, report);
    }
    return report;
  }
  const groups = partition(files, options.filesPerProcess);
  let status = 0;
  const failedGroups = [];
  const groupReports = [];
  const captureCaseResults = Boolean(options.reportFile || options.captureCaseResults);
  const caseResultsDirectory = captureCaseResults
    ? fs.mkdtempSync(path.join(os.tmpdir(), 'graphitix-jest-case-results-'))
    : null;
  const jestResults = [];
  const startedAt = Date.now();
  const writeProgress = state => writeReport(options.reportFile, {
    schemaVersion: 1,
    runner: 'jest-shards',
    project: options.project,
    filesPerProcess: options.filesPerProcess,
    onlyFailures: options.onlyFailures,
    environment: buildTestEnvironment('fake'),
    state,
    totalGroups: groups.length,
    completedGroups: groupReports.length,
    initialStatus: status,
    durationMs: Date.now() - startedAt,
    groups: groupReports,
    failedGroups
  });
  writeProgress('running');
  try {
    groups.forEach((group, index) => {
      const groupStartedAt = Date.now();
      const resultFile = caseResultsDirectory ? path.join(caseResultsDirectory, `group-${index + 1}.json`) : null;
      const outcome = runGroup(options.project, group, index + 1, groups.length, options.onlyFailures, resultFile);
      const groupStatus = outcome.status;
      if (outcome.jestResult) jestResults.push(outcome.jestResult);
      groupReports.push({
        files: group.map(file => path.relative(ROOT_DIR, file)),
        status: groupStatus,
        durationMs: Date.now() - groupStartedAt,
        ...(outcome.reportError ? { reportError: outcome.reportError } : {})
      });
      if (groupStatus !== 0) {
        status = groupStatus;
        failedGroups.push(group.map(file => path.relative(ROOT_DIR, file)));
      }
      writeProgress('running');
    });
  } finally {
    if (caseResultsDirectory) fs.rmSync(caseResultsDirectory, { recursive: true, force: true });
  }
  let caseEvidence = null;
  if (options.reportFile && captureCaseResults) {
    caseEvidence = writeCaseEvidence(options.reportFile, {
      lane: options.lane || options.project,
      project: options.project,
      environment: buildTestEnvironment('fake'),
      files,
      results: jestResults
    });
  }
  const failureSummary = failedGroups.length > 0
    ? `; failed groups: ${failedGroups.map(group => group.join(', ')).join(' | ')}`
    : '';
  console.log(`\nJest ${options.project}: ${groups.length} bounded process groups; status=${status}${failureSummary}`);
  const report = {
    schemaVersion: 1,
    runner: 'jest-shards',
    project: options.project,
    filesPerProcess: options.filesPerProcess,
    onlyFailures: options.onlyFailures,
    environment: buildTestEnvironment('fake'),
    state: 'complete',
    totalGroups: groups.length,
    completedGroups: groupReports.length,
    initialStatus: status,
    durationMs: Date.now() - startedAt,
    groups: groupReports,
    failedGroups,
    caseEvidence
  };
  if (options.captureCaseResults) report.caseResults = jestResults;
  assertReportSchema(report, `Jest ${options.project} shard report`);
  if (options.reportFile) {
    writeReport(options.reportFile, report);
    console.log(`Jest ${options.project} report: ${path.resolve(ROOT_DIR, options.reportFile)}`);
  }
  return report;
}

function run(options) {
  return runReport(options).initialStatus;
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/run-jest-shards.cjs --project integration --files-per-process 1');
      process.exitCode = 0;
    } else {
      process.exitCode = run(options);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

module.exports = { parseArgs, partition, childEnvironment, discoverTests, runGroup, runReport, run, writeReport, writeCaseEvidence };
