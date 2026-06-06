const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const forbiddenPaths = [
  '.claude',
  '.vscode',
  'coverage',
  'artifacts',
  'tmp',
  'playwright-report',
  'test-results',
  'desktop/app',
  'desktop/dist',
  'scripts/__pycache__'
];

function fail(message) {
  throw new Error(message);
}

function assertAbsent(relativePath) {
  const target = path.join(root, relativePath);
  if (fs.existsSync(target)) {
    fail(`Publication artifact should not be committed: ${relativePath}`);
  }
}

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assertStaticReferencesExist() {
  const html = read('index.html');
  const refs = [];
  const attrPattern = /\b(?:src|href)="([^"]+)"/g;
  let match;
  while ((match = attrPattern.exec(html))) {
    const ref = match[1];
    if (/^(?:https?:|data:|#|mailto:)/i.test(ref)) {
      continue;
    }
    refs.push(ref.split(/[?#]/)[0]);
  }
  const missing = refs.filter(ref => !fs.existsSync(path.join(root, ref)));
  if (missing.length) {
    fail(`Missing static reference(s) from index.html: ${missing.join(', ')}`);
  }
}

function assertNoExpandedPrismArchives() {
  const prismDir = path.join(root, 'prism files');
  if (!fs.existsSync(prismDir)) {
    return;
  }
  const expanded = fs.readdirSync(prismDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => `prism files/${entry.name}`);
  if (expanded.length) {
    fail(`Expanded duplicate Prism archive folders found: ${expanded.join(', ')}`);
  }
}

function main() {
  forbiddenPaths.forEach(assertAbsent);
  assertStaticReferencesExist();
  assertNoExpandedPrismArchives();
  console.log('GitHub Pages readiness checks passed.');
}

main();
