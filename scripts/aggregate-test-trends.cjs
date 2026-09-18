'use strict';

const fs = require('fs');
const path = require('path');
const { assertReportSchema } = require('../test-support/testReportSchema.js');

const ROOT_DIR = path.resolve(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, file), 'utf8'));
}

function walkBytes(root) {
  const resolved = path.resolve(ROOT_DIR, root);
  if (!fs.existsSync(resolved)) return { files: 0, bytes: 0 };
  let files = 0;
  let bytes = 0;
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) {
        files += 1;
        bytes += fs.statSync(file).size;
      }
    }
  };
  visit(resolved);
  return { files, bytes };
}

function sumCommandResults(report) {
  const initial = Array.isArray(report?.initial) ? report.initial : [];
  const diagnostic = Array.isArray(report?.diagnostic) ? report.diagnostic : [];
  return {
    initialCommands: initial.length,
    diagnosticCommands: diagnostic.length,
    retries: diagnostic.length,
    failedInitialCommands: initial.filter(command => command?.status !== 0).length,
    failedDiagnosticCommands: diagnostic.filter(command => command?.status !== 0).length,
    durationMs: Number(report?.durationMs) || initial.concat(diagnostic)
      .reduce((total, command) => total + (Number(command?.durationMs) || 0), 0)
  };
}

function summarizeReportContract(report) {
  const manifestEvidence = report?.manifestEvidence || {};
  return {
    schemaVersion: Number(report?.schemaVersion) || null,
    manifestEvidence: {
      status: manifestEvidence.status || null,
      schemaVersion: Number(manifestEvidence.schemaVersion) || null,
      checkCount: Array.isArray(manifestEvidence.checks) ? manifestEvidence.checks.length : null,
      manifest: manifestEvidence.manifest || null
    },
    oracle: report?.oracle || null,
    artifactPolicy: report?.artifactPolicy || null,
    declaredArtifacts: report?.artifacts || null
  };
}

function summarizeReport(report, inventory, coverage, artifactRoots) {
  const commandSummary = sumCommandResults(report);
  const summary = inventory?.manifest?.summary || {};
  const staticData = inventory?.static || {};
  const discovery = inventory?.discovery || {};
  const artifacts = artifactRoots.reduce((total, root) => {
    const current = walkBytes(root);
    return { files: total.files + current.files, bytes: total.bytes + current.bytes };
  }, { files: 0, bytes: 0 });
  return {
    lane: report?.lane || report?.runner || 'unknown',
    initialStatus: report?.initialStatus ?? report?.status ?? null,
    diagnosticStatus: report?.diagnosticStatus ?? null,
    ...commandSummary,
    suites: {
      jest: Number(discovery.jest?.files) || null,
      playwrightFiles: Number(discovery.playwright?.chromium?.files) || null,
      playwrightTests: Number(discovery.playwright?.chromium?.tests) || null,
      manifest: Number(summary.total) || null
    },
    skips: Number(report?.skippedTests ?? report?.numPendingTests) || 0,
    waitDebt: {
      waitForTimeout: Number(staticData.patterns?.e2eWaitForTimeout?.count) || 0,
      setTimeout: Number(staticData.patterns?.e2eSetTimeout?.count) || 0
    },
    coverage: coverage?.total || coverage || null,
    contractCoverage: summary.requirementEvidence || null,
    reportContract: summarizeReportContract(report),
    artifacts
  };
}

function buildTrendReport({ reports = [], inventory = null, coverage = null, artifactRoots = [] } = {}) {
  const reportList = reports.map(report => assertReportSchema(
    typeof report === 'string' ? readJson(report) : report,
    'trend input report'
  ));
  const trend = reportList.map(report => summarizeReport(report, inventory, coverage, artifactRoots));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      inventory: inventory ? 'provided' : 'not-provided',
      coverage: coverage ? 'provided' : 'not-provided',
      artifactRoots: artifactRoots.slice()
    },
    trend
  };
}

function parseArgs(argv) {
  const options = { reports: [], inventory: null, coverage: null, artifactRoots: [], output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => String(argv[++index] || '').trim();
    if (arg === '--report') options.reports.push(next());
    else if (arg === '--inventory') options.inventory = next();
    else if (arg === '--coverage') options.coverage = next();
    else if (arg === '--artifact-root') options.artifactRoots.push(next());
    else if (arg === '--output') options.output = next();
  }
  return options;
}

if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const inventory = options.inventory ? readJson(options.inventory) : require('./test-inventory.cjs').buildInventory(ROOT_DIR);
  const coverage = options.coverage && fs.existsSync(path.resolve(ROOT_DIR, options.coverage))
    ? readJson(options.coverage)
    : null;
  const result = buildTrendReport({
    reports: options.reports,
    inventory,
    coverage,
    artifactRoots: options.artifactRoots
  });
  const output = `${JSON.stringify(result, null, 2)}\n`;
  if (options.output) {
    const target = path.resolve(ROOT_DIR, options.output);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, output);
  } else {
    process.stdout.write(output);
  }
}

module.exports = {
  buildTrendReport,
  parseArgs,
  summarizeReport,
  summarizeReportContract,
  sumCommandResults,
  walkBytes
};
