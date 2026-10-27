const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

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

function assertUntracked(relativePath) {
  let trackedFiles;
  try {
    trackedFiles = execFileSync('git', ['ls-files', '--cached', '--', relativePath], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).split(/\r?\n/).filter(Boolean);
  } catch (error) {
    fail(`Could not verify tracked publication artifacts for ${relativePath}: ${error.message}`);
  }
  if (trackedFiles.length) {
    fail(`Publication artifact is tracked: ${trackedFiles.join(', ')}`);
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

function main() {
  forbiddenPaths.forEach(assertUntracked);
  assertStaticReferencesExist();
  console.log('GitHub Pages readiness checks passed.');
}

main();
