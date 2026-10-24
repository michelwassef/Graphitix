#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

const repositoryRoot = path.join(__dirname, '..');
const stylesheetPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repositoryRoot, 'css', 'style.css');
const allowlistPath = path.join(__dirname, 'css-priority-allowlist.json');
const { SCENARIO_CATALOG = [], SCENARIOS_BY_FILE = {} } = require(path.join(repositoryRoot, 'test-support', 'scenarioCatalog'));
const scenarioIds = new Set(SCENARIO_CATALOG.map(scenario => scenario.id));
const browserEvidenceIds = new Set(Object.entries(SCENARIOS_BY_FILE)
  .filter(([file]) => file.startsWith('e2e/'))
  .flatMap(([, ids]) => ids));
// Keep the two overrides required to hold AG Grid's inline header geometry at the tested compact size.
const priorityBudget = 50;

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeSelector(value) {
  return normalizeWhitespace(value).replace(/\s*,\s*/g, ', ');
}

function priorityKey(entry) {
  return JSON.stringify([entry.context, entry.selector, entry.property, entry.value]);
}

function collectPriorities(css, from) {
  const root = postcss.parse(css, { from });
  const priorities = [];

  root.walkDecls(declaration => {
    if (!declaration.important) return;

    const rule = declaration.parent;
    const context = [];
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      if (parent.type === 'atrule') context.unshift(normalizeWhitespace(`@${parent.name} ${parent.params}`));
    }

    priorities.push({
      context,
      selector: normalizeSelector(rule.selector),
      property: declaration.prop.toLowerCase(),
      value: normalizeWhitespace(declaration.value),
      line: declaration.source.start.line
    });
  });

  return priorities;
}

const stylesheet = fs.readFileSync(stylesheetPath, 'utf8');
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
if (allowlist.schemaVersion !== 3 || !Array.isArray(allowlist.reviewed)) {
  throw new Error(`Invalid CSS priority allowlist: ${allowlistPath}`);
}

const malformedEntries = allowlist.reviewed.filter(entry => (
  typeof entry.owner !== 'string'
  || !/^[a-z][a-z0-9-]*$/.test(entry.owner)
  || typeof entry.reason !== 'string'
  || !entry.reason.trim()
  || !Array.isArray(entry.evidence)
  || entry.evidence.length === 0
  || entry.evidence.some(id => typeof id !== 'string' || !id.trim())
));
if (malformedEntries.length) {
  throw new Error(`CSS priority entries require a valid owner, non-empty reason, and browser evidence link: ${malformedEntries.length} malformed entry(s).`);
}

const invalidEvidence = allowlist.reviewed.flatMap((entry, index) => (
  entry.evidence
    .filter(id => !scenarioIds.has(id) || !browserEvidenceIds.has(id))
    .map(id => ({ index: index + 1, owner: entry.owner, id }))
));
if (invalidEvidence.length) {
  const details = invalidEvidence.map(({ index, owner, id }) => `#${index} (${owner}): ${id}`).join(', ');
  throw new Error(`CSS priority entries reference missing or non-browser evidence: ${details}`);
}

const allowedCounts = new Map();
for (const entry of allowlist.reviewed) {
  const key = priorityKey(entry);
  allowedCounts.set(key, (allowedCounts.get(key) || 0) + 1);
}

const actualCounts = new Map();
const priorities = collectPriorities(stylesheet, stylesheetPath);
const unreviewed = [];
for (const priority of priorities) {
  const key = priorityKey(priority);
  const count = (actualCounts.get(key) || 0) + 1;
  actualCounts.set(key, count);
  if (count > (allowedCounts.get(key) || 0)) unreviewed.push(priority);
}

const ceilingExceeded = priorities.length > priorityBudget;
if (unreviewed.length || ceilingExceeded) {
  if (unreviewed.length) {
    console.error(`CSS contains ${unreviewed.length} unreviewed priority declaration(s):`);
    for (const entry of unreviewed) {
      console.error(`  ${path.relative(repositoryRoot, stylesheetPath)}:${entry.line}: ${entry.selector} { ${entry.property}: ${entry.value} !important }`);
    }
  }
  if (ceilingExceeded) {
    console.error(`CSS priority ceiling exceeded: ${priorities.length} declarations (maximum ${priorityBudget}).`);
  }
  process.exitCode = 1;
} else {
  const owners = new Set(allowlist.reviewed.map(entry => entry.owner));
  console.log(`CSS priority review passed: ${priorities.length}/${priorityBudget} declarations across ${owners.size} owners; every entry has an owner, reason, and registered browser contract link.`);
}
