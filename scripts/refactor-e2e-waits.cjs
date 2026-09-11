'use strict';

const fs = require('fs');
const path = require('path');
const espree = require('espree');

const ROOT_DIR = path.resolve(__dirname, '..');
const E2E_DIR = path.join(ROOT_DIR, 'e2e');
const COMPONENTS = ['venn', 'box', 'scatter', 'pca', 'line', 'heatmap', 'surface', 'roc', 'survival', 'hist', 'pie'];
const RISKY_NAME = /diagnostic|performance|stability|loading|recovery|reopen|resize|rotation|wheel|live|undo|cache|preview|heavy|redraw|gesture|animation|flicker|formula|paste|scroll|table|import|large-data|close-tab|second-tab|significance|lock-ratio/i;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filePath) : [filePath];
  });
}

function componentForFile(filePath) {
  const name = path.basename(filePath).toLowerCase();
  const matches = COMPONENTS.filter(component => new RegExp(`(^|[.-])${component}([.-]|$)`).test(name));
  return matches.length === 1 ? matches[0] : null;
}

function isLoop(node) {
  return node && /^(For|While|Do)/.test(node.type);
}

function inspectFile(filePath, minMs, skipLines = new Map()) {
  const relative = path.relative(ROOT_DIR, filePath).split(path.sep).join('/');
  const component = componentForFile(filePath);
  if (!component || RISKY_NAME.test(path.basename(filePath))) {
    return { file: relative, component, eligible: false, waits: [] };
  }

  const source = fs.readFileSync(filePath, 'utf8');
  const lines = source.split(/\r?\n/);
  const excludedLines = skipLines.get(relative) || new Set();
  const ast = espree.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    range: true,
    loc: true
  });
  const waits = [];
  const parents = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'AwaitExpression'
      && node.argument?.type === 'CallExpression'
      && node.argument.callee?.type === 'MemberExpression'
      && node.argument.callee.object?.type === 'Identifier'
      && node.argument.callee.object.name === 'page'
      && node.argument.callee.property?.type === 'Identifier'
      && node.argument.callee.property.name === 'waitForTimeout'
      && node.argument.arguments?.length === 1
      && node.argument.arguments[0]?.type === 'Literal'
      && typeof node.argument.arguments[0].value === 'number'
      && node.argument.arguments[0].value >= minMs
      && !excludedLines.has(node.loc.start.line)
      && !parents.some(isLoop)
      && parents[parents.length - 1]?.type === 'ExpressionStatement') {
      waits.push({
        line: node.loc.start.line,
        ms: node.argument.arguments[0].value,
        text: lines[node.loc.start.line - 1]?.trim() || ''
      });
    }
    parents.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value.type === 'string') visit(value);
    }
    parents.pop();
  };
  visit(ast);
  return { file: relative, component, eligible: waits.length > 0, waits };
}

function getCandidates(minMs, skipLines) {
  return walk(E2E_DIR)
    .filter(filePath => filePath.endsWith('.spec.js'))
    .map(filePath => inspectFile(filePath, minMs, skipLines))
    .filter(result => result.eligible);
}

function parseArgs(argv) {
  const options = { apply: false, files: [], minMs: 200, skipLines: new Map() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--min-ms') options.minMs = Number(argv[++index]);
    else if (arg === '--files') options.files = argv.slice(index + 1).map(file => file.replace(/\\/g, '/'));
    else if (arg === '--skip-lines') {
      const value = argv[++index] || '';
      const separator = value.lastIndexOf('=');
      if (separator <= 0) throw new Error('--skip-lines expects file=comma,separated,line,numbers');
      const file = value.slice(0, separator).replace(/\\/g, '/');
      const lines = value.slice(separator + 1).split(',').map(Number);
      if (lines.some(line => !Number.isInteger(line) || line < 1)) {
        throw new Error(`Invalid --skip-lines value: ${value}`);
      }
      options.skipLines.set(file, new Set(lines));
    }
    else if (arg === '--help') options.help = true;
  }
  return options;
}

function addReadinessImport(source) {
  const readinessImport = /(?:const|let|var)\s+\{[\s\S]*?\bwaitForComponentOwnerReady\b[\s\S]*?\}\s*=\s*require\(\s*['"]\.\/helpers\/contractWaits['"]\s*\)/;
  if (readinessImport.test(source)) return source;
  const importLine = "const { waitForComponentOwnerReady } = require('./helpers/contractWaits');\n";
  const strictMatch = source.match(/^(['\"]use strict['\"];\r?\n)/);
  if (strictMatch) return source.slice(0, strictMatch[0].length) + importLine + source.slice(strictMatch[0].length);
  return importLine + source;
}

function applyFile(result, minMs, skipLines) {
  const filePath = path.resolve(ROOT_DIR, result.file);
  let source = fs.readFileSync(filePath, 'utf8');
  const astResult = inspectFile(filePath, minMs, skipLines);
  const excludedLines = skipLines.get(result.file) || new Set();
  const replacements = [];
  const ast = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'script', range: true, loc: true });
  const parents = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'AwaitExpression'
      && node.argument?.type === 'CallExpression'
      && node.argument.callee?.type === 'MemberExpression'
      && node.argument.callee.object?.type === 'Identifier'
      && node.argument.callee.object.name === 'page'
      && node.argument.callee.property?.type === 'Identifier'
      && node.argument.callee.property.name === 'waitForTimeout'
      && node.argument.arguments?.length === 1
      && node.argument.arguments[0]?.type === 'Literal'
      && typeof node.argument.arguments[0].value === 'number'
      && node.argument.arguments[0].value >= minMs
      && !excludedLines.has(node.loc.start.line)
      && !parents.some(isLoop)
      && parents[parents.length - 1]?.type === 'ExpressionStatement') {
      replacements.push({
        start: node.range[0],
        end: node.range[1],
        text: `await waitForComponentOwnerReady(page, '${result.component}', { requireMountedRoot: true, requireIdle: true, timeout: 30_000 })`
      });
    }
    parents.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value.type === 'string') visit(value);
    }
    parents.pop();
  };
  visit(ast);
  if (replacements.length !== astResult.waits.length) {
    throw new Error(`${result.file}: candidate changed during transformation`);
  }
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, replacement.start) + replacement.text + source.slice(replacement.end);
  }
  fs.writeFileSync(filePath, addReadinessImport(source));
  return replacements.length;
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log('Usage: node scripts/refactor-e2e-waits.cjs [--min-ms 200] [--skip-lines e2e/file.spec.js=12,34] [--apply --files e2e/file.spec.js ...]');
  process.exit(0);
}
if (!Number.isFinite(options.minMs) || options.minMs < 0) {
  throw new Error('--min-ms must be a non-negative number');
}

const candidates = getCandidates(options.minMs, options.skipLines);
if (!options.apply) {
  console.log(JSON.stringify({ minMs: options.minMs, candidates }, null, 2));
  process.exit(0);
}
if (!options.files.length) {
  throw new Error('--apply requires an explicit --files allowlist');
}
const selected = candidates.filter(candidate => options.files.includes(candidate.file));
if (selected.length !== options.files.length) {
  const selectedFiles = new Set(selected.map(candidate => candidate.file));
  const missing = options.files.filter(file => !selectedFiles.has(file));
  throw new Error(`Refusing to transform non-eligible files: ${missing.join(', ')}`);
}
const transformed = selected.map(candidate => ({
  file: candidate.file,
  replacements: applyFile(candidate, options.minMs, options.skipLines)
}));
console.log(JSON.stringify({ minMs: options.minMs, transformed }, null, 2));
