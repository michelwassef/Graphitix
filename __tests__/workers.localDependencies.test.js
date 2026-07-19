const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const WORKERS = [
  'js/workers/scatter.worker.js',
  'js/workers/pca.worker.js',
  'js/workers/pca-embed.worker.js',
  'js/workers/graphArchive.worker.js'
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('worker dependency delivery', () => {
  test('production workers load same-origin vendored dependencies only', () => {
    for (const relativePath of WORKERS) {
      const source = read(relativePath);
      expect(source).not.toMatch(/importScripts\(\s*['"]https?:\/\//i);
      expect(source).not.toMatch(/cdn\.jsdelivr|unpkg\.com/i);
    }
  });

  test.each([
    'libs/jstat.min.js',
    'libs/svd-js.min.js',
    'libs/jszip.min.js',
    'libs/licenses/jstat-LICENSE.txt',
    'libs/licenses/svd-js-LICENSE.txt',
    'libs/licenses/jszip-LICENSE.md',
    'libs/licenses/ag-grid-community-LICENSE.txt'
  ])('%s is packaged with the static application', (relativePath) => {
    const target = path.join(ROOT, relativePath);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.statSync(target).size).toBeGreaterThan(0);
  });
});
