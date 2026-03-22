#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const UNIT_DIR = path.join(ROOT, '__tests__');
const E2E_DIR = path.join(ROOT, 'e2e');

const IGNORE_TOKEN_SET = new Set([
  'js', 'src', 'docs', 'scripts', 'shared', 'main', 'components', 'tests', 'test', 'e2e',
  'development', 'setup', 'helpers', 'fixtures', 'tabs',
  'map', 'module', 'architecture', 'readme', 'agents', 'package', 'json', 'schema', 'contracts', 'generate'
]);

const COMPONENT_ALIASES = {
  box: ['boxplot'],
  hist: ['histogram'],
  pca: ['mds', 'tsne', 'umap'],
  pie: ['proportion', 'donut'],
  roc: ['pr'],
  venn: ['upset']
};

function toPosix(relPath) {
  return relPath.split(path.sep).join('/');
}

function toRel(absPath) {
  return toPosix(path.relative(ROOT, absPath));
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
      continue;
    }
    if (entry.isFile()) out.push(full);
  }
  return out;
}

function splitCamelCase(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseArgs(argv) {
  const options = {
    files: [],
    max: 25,
    runJest: false,
    runE2E: false,
    json: false,
    staged: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--files') {
      const raw = String(argv[i + 1] || '').trim();
      i += 1;
      options.files.push(...raw.split(',').map(s => s.trim()).filter(Boolean));
    } else if (arg === '--max') {
      options.max = Math.max(1, Number.parseInt(argv[i + 1], 10) || 25);
      i += 1;
    } else if (arg === '--run-jest') {
      options.runJest = true;
    } else if (arg === '--run-e2e') {
      options.runE2E = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--staged') {
      options.staged = true;
    } else {
      options.files.push(arg);
    }
  }
  options.files = Array.from(new Set(options.files.map(value => toPosix(value))));
  return options;
}

function printHelp() {
  console.log(
    'Usage: node scripts/suggest-tests.js [options]\n' +
    '\n' +
    'Options:\n' +
    '  --files a,b,c     Explicit changed files (comma-separated)\n' +
    '  --staged          Use staged diff instead of working tree diff\n' +
    '  --max N           Maximum suggestions per test suite (default 25)\n' +
    '  --run-jest        Execute suggested Jest tests\n' +
    '  --run-e2e         Execute suggested Playwright tests\n' +
    '  --json            Print JSON output\n' +
    '  -h, --help        Show this help\n' +
    '\n' +
    'If --files is omitted, changed files are read from git diff.'
  );
}

function quoteForShell(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function getChangedFilesFromGit(options) {
  const cmd = options.staged
    ? 'git diff --cached --name-only --diff-filter=ACMRTUXB'
    : 'git diff --name-only --diff-filter=ACMRTUXB';
  try {
    const raw = execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(toPosix);
  } catch (err) {
    return [];
  }
}

function deriveTokensFromPath(relPath) {
  const normalized = toPosix(relPath).toLowerCase();
  const ext = path.extname(normalized).toLowerCase();
  if (ext === '.md' || normalized.endsWith('package.json') || normalized.endsWith('package-lock.json')) {
    return new Set();
  }
  const tokens = new Set();
  const parts = normalized.split('/');
  const base = path.basename(normalized, path.extname(normalized));
  for (const token of splitCamelCase(base)) tokens.add(token);
  for (const part of parts) {
    for (const token of splitCamelCase(part)) tokens.add(token);
  }

  const componentMatch = normalized.match(/^js\/components\/([a-z0-9_]+)\.js$/);
  if (componentMatch) {
    const component = componentMatch[1];
    tokens.add(component);
    (COMPONENT_ALIASES[component] || []).forEach(alias => tokens.add(alias));
  }
  const sharedMatch = normalized.match(/^js\/shared\/([a-z0-9_]+)\.js$/);
  if (sharedMatch) tokens.add(sharedMatch[1]);
  const mainMatch = normalized.match(/^js\/main\/(?:tabs\/)?([a-z0-9_]+)\.js$/);
  if (mainMatch) tokens.add(mainMatch[1]);

  for (const token of Array.from(tokens)) {
    if (token.length <= 2 || IGNORE_TOKEN_SET.has(token)) {
      tokens.delete(token);
    }
  }
  return tokens;
}

function buildCorpus(testFiles) {
  return testFiles.map(abs => {
    const rel = toRel(abs);
    const text = fs.readFileSync(abs, 'utf8').toLowerCase();
    return {
      abs,
      rel,
      relLower: rel.toLowerCase(),
      text
    };
  });
}

function scoreTest(testEntry, changedFiles, tokenSet) {
  let score = 0;
  const reasons = [];
  for (const token of tokenSet) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (testEntry.relLower.includes(token)) {
      score += 8;
      reasons.push(`path:${token}`);
    }
    const boundary = new RegExp(`\\b${escaped}\\b`, 'i');
    if (boundary.test(testEntry.text)) {
      score += 3;
      reasons.push(`content:${token}`);
    }
  }

  for (const changed of changedFiles) {
    const changedDir = path.dirname(changed).toLowerCase();
    if (changedDir && changedDir !== '.' && testEntry.relLower.includes(changedDir)) {
      score += 2;
      reasons.push(`dir:${changedDir}`);
    }
  }
  return { score, reasons: Array.from(new Set(reasons)).slice(0, 6) };
}

function suggestSuiteTests(changedFiles, suiteRoot, options) {
  const files = walkFiles(suiteRoot).filter(file => /\.(test|spec)\.js$/i.test(file));
  const corpus = buildCorpus(files);
  const tokenSet = new Set();
  for (const rel of changedFiles) {
    const fileTokens = deriveTokensFromPath(rel);
    for (const token of fileTokens) tokenSet.add(token);
  }
  const scored = [];
  for (const entry of corpus) {
    const result = scoreTest(entry, changedFiles, tokenSet);
    if (result.score <= 0) continue;
    scored.push({
      file: entry.rel,
      score: result.score,
      reasons: result.reasons
    });
  }
  scored.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  return scored.slice(0, options.max);
}

function maybeRunCommand(label, command) {
  console.log(`\n${label}: ${command}`);
  try {
    execSync(command, { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    console.error(`${label} failed`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const changedFiles = options.files.length ? options.files : getChangedFilesFromGit(options);

  if (!changedFiles.length) {
    console.log('No changed files found.');
    return;
  }

  const unitSuggestions = suggestSuiteTests(changedFiles, UNIT_DIR, options);
  const e2eSuggestions = suggestSuiteTests(changedFiles, E2E_DIR, options);
  const jestCommand = unitSuggestions.length
    ? `npx jest ${unitSuggestions.map(item => quoteForShell(item.file)).join(' ')}`
    : null;
  const e2eCommand = e2eSuggestions.length
    ? `npx playwright test ${e2eSuggestions.map(item => quoteForShell(item.file)).join(' ')}`
    : null;

  const payload = {
    changedFiles,
    suggestions: {
      jest: unitSuggestions,
      playwright: e2eSuggestions
    },
    commands: {
      jest: jestCommand,
      playwright: e2eCommand
    }
  };

  if (options.json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log('# Suggested Tests');
    console.log(`Changed files (${changedFiles.length}):`);
    for (const rel of changedFiles) {
      console.log(`- ${rel}`);
    }

    console.log(`\nJest suggestions (${unitSuggestions.length}):`);
    for (const item of unitSuggestions) {
      console.log(`- ${item.file} [score=${item.score}] (${item.reasons.join(', ')})`);
    }
    if (jestCommand) console.log(`Command: ${jestCommand}`);

    console.log(`\nPlaywright suggestions (${e2eSuggestions.length}):`);
    for (const item of e2eSuggestions) {
      console.log(`- ${item.file} [score=${item.score}] (${item.reasons.join(', ')})`);
    }
    if (e2eCommand) console.log(`Command: ${e2eCommand}`);
  }

  if (options.runJest && jestCommand) {
    maybeRunCommand('Running Jest', jestCommand);
  }
  if (options.runE2E && e2eCommand) {
    maybeRunCommand('Running Playwright', e2eCommand);
  }
}

main();
