const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');

function listSourceFiles(rootDir) {
  const files = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '_site') continue;
    const target = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(target));
    } else if (/\.(?:html|js)$/.test(entry.name)) {
      files.push(target);
    }
  }
  return files;
}

describe('welcome graph icon ownership', () => {
  test('keeps one canonical SVG source for welcome graph icons', () => {
    const sourceFiles = [path.join(ROOT, 'index.html'), ...listSourceFiles(path.join(ROOT, 'js'))];
    const svgLiteralOwners = sourceFiles
      .map(file => ({
        file: path.relative(ROOT, file).replace(/\\/g, '/'),
        count: (fs.readFileSync(file, 'utf8').match(/<svg class="welcome-graph-icon"/g) || []).length
      }))
      .filter(record => record.count > 0);

    expect(svgLiteralOwners).toEqual([
      { file: 'js/main/bootstrap.js', count: 1 }
    ]);

    const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    expect(indexHtml).not.toMatch(/<article[^>]+data-graph-type=/);
    expect(indexHtml).not.toMatch(/<svg[^>]+welcome-graph-icon/);
  });

});
