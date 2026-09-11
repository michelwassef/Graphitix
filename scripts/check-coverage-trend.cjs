'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const SUMMARY_PATH = path.join(ROOT_DIR, 'coverage', 'coverage-summary.json');
const BASELINE_PATH = path.join(ROOT_DIR, 'test-support', 'coverage-baseline.json');
const METRICS = ['statements', 'branches', 'functions', 'lines'];

function findFileSummary(summary, relativePath) {
  const normalized = String(relativePath).replace(/\\/g, '/').toLowerCase();
  const entry = Object.entries(summary || {}).find(([key]) => (
    key.replace(/\\/g, '/').toLowerCase().endsWith(`/${normalized}`)
  ));
  return entry ? entry[1] : null;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function compareCoverage(summary, baseline) {
  const failures = [];
  for (const metric of METRICS) {
    const actual = Number(summary?.total?.[metric]?.pct);
    const minimum = Number(baseline?.metrics?.[metric]);
    if (!Number.isFinite(actual) || !Number.isFinite(minimum)) {
      failures.push(`${metric}: missing numeric coverage result`);
    } else if (actual < minimum) {
      failures.push(`${metric}: ${actual}% is below baseline ${minimum}%`);
    }
  }
  for (const [relativePath, fileBaseline] of Object.entries(baseline?.critical || {})) {
    const fileSummary = findFileSummary(summary, relativePath);
    if (!fileSummary) {
      failures.push(`${relativePath}: missing critical-module coverage result`);
      continue;
    }
    for (const metric of METRICS) {
      const actual = Number(fileSummary?.[metric]?.pct);
      const minimum = Number(fileBaseline?.[metric]);
      if (!Number.isFinite(actual) || !Number.isFinite(minimum)) {
        failures.push(`${relativePath} ${metric}: missing numeric coverage result`);
      } else if (actual < minimum) {
        failures.push(`${relativePath} ${metric}: ${actual}% is below baseline ${minimum}%`);
      }
    }
  }
  return failures;
}

function main() {
  if (!fs.existsSync(SUMMARY_PATH)) {
    throw new Error(`Coverage summary not found: ${SUMMARY_PATH}`);
  }
  const failures = compareCoverage(readJson(SUMMARY_PATH), readJson(BASELINE_PATH));
  if (failures.length) {
    throw new Error(`Coverage trend failed:\n${failures.join('\n')}`);
  }
  const summary = readJson(SUMMARY_PATH);
  const values = METRICS.map(metric => `${metric}=${summary.total[metric].pct}%`).join(', ');
  console.log(`Coverage trend passed: ${values}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { compareCoverage, findFileSummary, METRICS };
