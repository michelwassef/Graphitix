const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME_FILES = [
  'index.html',
  'js/shared/loaders.js',
  'js/shared/graphArchive.js',
  'js/shared/tableImport.js',
  'js/shared/boxStatsModel.js'
];

const REQUIRED_ASSETS = [
  'libs/ag-grid-community/ag-grid.css',
  'libs/ag-grid-community/ag-theme-balham.css',
  'libs/ag-grid-community/ag-grid-community.min.noStyle.js',
  'libs/jstat.min.js',
  'libs/jszip.min.js',
  'libs/svd-js.min.js',
  'libs/licenses/ag-grid-community-LICENSE.txt',
  'libs/licenses/jstat-LICENSE.txt',
  'libs/licenses/jszip-LICENSE.md',
  'libs/licenses/svd-js-LICENSE.txt'
];

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

describe('static runtime dependency delivery', () => {
  test('browser runtime does not depend on dev-only node_modules or public CDNs', () => {
    for (const relativePath of RUNTIME_FILES) {
      const source = read(relativePath);
      expect(source).not.toMatch(/node_modules\//);
      expect(source).not.toMatch(/https:\/\/cdn\.jsdelivr\.net|https:\/\/unpkg\.com|https:\/\/cdnjs\.cloudflare\.com/i);
    }
  });

  test.each(REQUIRED_ASSETS)('%s is packaged with the static application', (relativePath) => {
    const target = path.join(ROOT, relativePath);
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.statSync(target).size).toBeGreaterThan(0);
  });

  test('index loads AG Grid before shared table code from same-origin assets', () => {
    const html = read('index.html');
    const agGridScript = html.indexOf('libs/ag-grid-community/ag-grid-community.min.noStyle.js');
    const hotScript = html.indexOf('js/shared/hot.js');
    expect(agGridScript).toBeGreaterThan(-1);
    expect(hotScript).toBeGreaterThan(-1);
    expect(agGridScript).toBeLessThan(hotScript);
  });
});
