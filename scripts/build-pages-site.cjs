const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '_site');
const runtimeEntries = ['index.html', 'css', 'js', 'libs', 'LICENSE', 'README.md', '.nojekyll'];

function copyEntry(relativePath) {
  const source = path.join(root, relativePath);
  const target = path.join(output, relativePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Missing required runtime entry: ${relativePath}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

function assertStaticReferencesExist() {
  const htmlPath = path.join(output, 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
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
  const missing = refs.filter(ref => !fs.existsSync(path.join(output, ref)));
  if (missing.length) {
    throw new Error(`Missing static reference(s) in Pages build: ${missing.join(', ')}`);
  }
}

function main() {
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  runtimeEntries.forEach(copyEntry);
  assertStaticReferencesExist();
  console.log(`Built GitHub Pages site in ${path.relative(root, output)}`);
}

main();
