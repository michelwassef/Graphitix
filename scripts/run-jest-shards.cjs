'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { assertReportSchema } = require('../test-support/testReportSchema.js');

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

function runGroup(project, files, index, total, onlyFailures = false) {
  const args = [JEST_CLI, '--selectProjects', project, '--runInBand', '--runTestsByPath', ...files];
  if (onlyFailures) args.push('--onlyFailures');
  console.log(`\n[jest ${project} group ${index}/${total}] ${files.map(file => path.relative(ROOT_DIR, file)).join(', ')}`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...process.env,
      ...(project === 'integration' ? { TEST_ENFORCE_INTEGRATION_LEAKS: '1' } : {})
    }
  });
  if (result.error) {
    console.error(`[jest ${project} group ${index}/${total}] ${result.error.message}`);
    return 1;
  }
  return result.status == null ? 1 : result.status;
}

function writeReport(reportFile, report) {
  if (!reportFile) {
    return;
  }
  const reportPath = path.resolve(ROOT_DIR, reportFile);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function runReport(options) {
  const files = discoverTests(options.project, options.onlyFailures);
  if (files.length === 0) {
    console.log(`No ${options.onlyFailures ? 'failed ' : ''}${options.project} tests discovered.`);
    return {
      schemaVersion: 1,
      runner: 'jest-shards',
      project: options.project,
      filesPerProcess: options.filesPerProcess,
      onlyFailures: options.onlyFailures,
      initialStatus: 0,
      durationMs: 0,
      groups: [],
      failedGroups: []
    };
  }
  const groups = partition(files, options.filesPerProcess);
  let status = 0;
  const failedGroups = [];
  const groupReports = [];
  const startedAt = Date.now();
  const writeProgress = state => writeReport(options.reportFile, {
    schemaVersion: 1,
    runner: 'jest-shards',
    project: options.project,
    filesPerProcess: options.filesPerProcess,
    onlyFailures: options.onlyFailures,
    state,
    totalGroups: groups.length,
    completedGroups: groupReports.length,
    initialStatus: status,
    durationMs: Date.now() - startedAt,
    groups: groupReports,
    failedGroups
  });
  writeProgress('running');
  groups.forEach((group, index) => {
    const groupStartedAt = Date.now();
    const groupStatus = runGroup(options.project, group, index + 1, groups.length, options.onlyFailures);
    groupReports.push({
      files: group.map(file => path.relative(ROOT_DIR, file)),
      status: groupStatus,
      durationMs: Date.now() - groupStartedAt
    });
    if (groupStatus !== 0) {
      status = groupStatus;
      failedGroups.push(group.map(file => path.relative(ROOT_DIR, file)));
    }
    writeProgress('running');
  });
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
    state: 'complete',
    totalGroups: groups.length,
    completedGroups: groupReports.length,
    initialStatus: status,
    durationMs: Date.now() - startedAt,
    groups: groupReports,
    failedGroups
  };
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

module.exports = { parseArgs, partition, childEnvironment, discoverTests, runGroup, runReport, run, writeReport };
