const fs = require('fs');
const path = require('path');
const {
  runReport: runProjectReport
} = require('./run-jest-shards.cjs');
const { assertReportSchema } = require('../test-support/testReportSchema.js');

const ROOT_DIR = path.resolve(__dirname, '..');
const JEST_PROJECTS = Object.freeze(require('../jest.config.js').projects.map(project => project.displayName));
const DEFAULT_FILES_PER_PROCESS = 4;
const PROJECT_FILE_LIMITS = Object.freeze({
  integration: 1,
  'statistical-oracle': 1
});

function parseArgs(argv) {
  const options = {
    filesPerProcess: DEFAULT_FILES_PER_PROCESS,
    onlyFailures: false,
    reportFile: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--files-per-process') options.filesPerProcess = Number(argv[++index]);
    else if (arg === '--onlyFailures') options.onlyFailures = true;
    else if (arg === '--report-file') options.reportFile = String(argv[++index] || '').trim() || null;
    else if (arg === '--runInBand') continue;
    else if (arg === '--help') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.filesPerProcess) || options.filesPerProcess < 1) {
    throw new Error('--files-per-process must be a positive integer');
  }
  return options;
}

function getFilesPerProcess(project, requested) {
  return PROJECT_FILE_LIMITS[project] || requested;
}

function buildReport(options, projectReports, startedAt) {
  const groups = projectReports.flatMap(projectReport => projectReport.groups.map(group => ({
    project: projectReport.project,
    ...group
  })));
  const failedGroups = groups.filter(group => group.status !== 0);
  return {
    schemaVersion: 1,
    runner: 'jest-full-bounded',
    projects: JEST_PROJECTS,
    filesPerProcess: options.filesPerProcess,
    projectFileLimits: PROJECT_FILE_LIMITS,
    onlyFailures: options.onlyFailures,
    initialStatus: projectReports.some(projectReport => projectReport.initialStatus !== 0) ? 1 : 0,
    durationMs: Date.now() - startedAt,
    summary: {
      projects: projectReports.length,
      files: groups.length ? groups.reduce((total, group) => total + group.files.length, 0) : 0,
      groups: groups.length,
      failedGroups: failedGroups.length
    },
    projectsReport: projectReports,
    groups,
    failedGroups
  };
}

function run(options) {
  const startedAt = Date.now();
  const projectReports = [];
  for (const project of JEST_PROJECTS) {
    const filesPerProcess = getFilesPerProcess(project, options.filesPerProcess);
    projectReports.push(runProjectReport({
      project,
      filesPerProcess,
      onlyFailures: options.onlyFailures,
      reportFile: null
    }));
  }
  const report = buildReport(options, projectReports, startedAt);
  assertReportSchema(report, 'bounded Jest report');
  if (options.reportFile) {
    const reportPath = path.resolve(ROOT_DIR, options.reportFile);
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`Jest full bounded report: ${reportPath}`);
  }
  console.log(`\nJest full bounded: ${report.summary.groups} process groups across ${report.summary.projects} projects; status=${report.initialStatus}`);
  return report;
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/run-full-jest.cjs [--files-per-process 4] [--onlyFailures] [--report-file path]');
      process.exitCode = 0;
    } else {
      process.exitCode = run(options).initialStatus;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}

module.exports = {
  DEFAULT_FILES_PER_PROCESS,
  JEST_PROJECTS,
  PROJECT_FILE_LIMITS,
  parseArgs,
  getFilesPerProcess,
  buildReport,
  run
};
